/**
 * The chat island: the navbar button, and a drawer holding the conversation
 * with the AI frontend advisor. spec/site-spec.md section 14 and
 * spec/advisor-spec.md section 7. It is the only React that reaches the
 * browser, loaded on first use by `main.ts` and mounted by `island.tsx`.
 *
 * The drawer is portaled into <body>, so it takes the page's colors: dark only
 * where the scoreboard's theme script has put `dark` on <html>.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LoaderCircle, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { QUESTION_LIMIT, WARN_AFTER, markSpent, questionsLeft, recordQuestion } from './quota';
import { ADVISOR_TITLE, ChatToggle } from './toggle';
import { asHistory, clearConversation, readConversation, writeConversation, type Entry } from './store';

/** The function's own limit; the server cuts anything longer anyway. */
const MAX_CHARS = 1000;
/** Absolute, so every page depth posts to the same place. Trailing slash, because the host redirects without one. */
export const CHAT_ENDPOINT = '/api/chat/';

/** Starting points for the advisor, advisor spec section 7. The landing page offers the same three. */
export const SUGGESTIONS = ['Help me pick a library for my project', 'Compare Vuetify and Quasar', 'Why is Ant Design over budget?'];

const linkClass = 'font-medium underline underline-offset-2';

/**
 * Markdown with no raw HTML: `skipHtml` drops it, and links get the site's
 * style. `remark-gfm` adds tables, which advisor spec section 4 asks for when
 * comparing two libraries. A table scrolls sideways inside its own region, so
 * a wide one never widens the drawer, and the region takes focus so keyboard
 * readers can scroll it. Cell alignment from the markdown arrives as an inline
 * `text-align`, which the cells pass through.
 */
const markdown: Components = {
  a: ({ href, children }) => {
    const external = typeof href === 'string' && /^https?:/i.test(href);
    return (
      <a href={href} className={linkClass} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  code: ({ children }) => <code className="rounded bg-muted px-1 font-mono text-[0.85em]">{children}</code>,
  table: ({ children }) => (
    <div className="chat-table my-2 max-w-full overflow-x-auto rounded-md border" role="region" aria-label="Table" tabIndex={0}>
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tr: ({ children }) => <tr className="border-b last:border-b-0">{children}</tr>,
  th: ({ children, style }) => (
    <th scope="col" style={style} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-2 py-1.5 align-top tabular-nums">
      {children}
    </td>
  ),
};

async function ask(message: string, history: Entry[]): Promise<Entry> {
  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history: asHistory(history) }),
    });
    if (response.status === 429) markSpent();
    const body = (await response.json().catch(() => ({}))) as { reply?: unknown; error?: unknown };
    if (response.ok && typeof body.reply === 'string') return { role: 'assistant', content: body.reply };
    const error =
      typeof body.error === 'string'
        ? body.error
        : response.status === 429
          ? 'You have used all your questions for now. Try again in a few minutes.'
          : 'The assistant could not answer just now. Try again later.';
    return { role: 'assistant', content: error, failed: true };
  } catch {
    return { role: 'assistant', content: 'The assistant could not be reached. Check your connection and try again.', failed: true };
  }
}

/**
 * Any page may dispatch `new CustomEvent('uilc:ask', { detail: { question } })`
 * on `window`. `main.ts` handles it until the island exists; from then on the
 * island does. A non-empty question is sent as a message, and an empty one
 * only opens the drawer.
 */
export const ASK_EVENT = 'uilc:ask';

const questionOf = (event: Event): string => {
  const question = (event as CustomEvent<{ question?: unknown } | null>).detail?.question;
  return typeof question === 'string' ? question.trim() : '';
};

export function ChatIsland({ initialOpen = false, initialQuestion = '' }: { initialOpen?: boolean; initialQuestion?: string }) {
  const [open, setOpen] = useState(initialOpen);
  const [entries, setEntries] = useState<Entry[]>(() => (initialOpen ? readConversation() : []));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(() => questionsLeft());
  const composer = useRef<HTMLTextAreaElement>(null);
  const endOfList = useRef<HTMLDivElement | null>(null);

  const remember = (next: Entry[]) => {
    setEntries(next);
    writeConversation(next);
  };

  const onOpenChange = (next: boolean) => {
    // Read on opening, so a conversation from another page shows up.
    if (next) setEntries(readConversation());
    setOpen(next);
  };

  // Radix mounts the drawer after this component's effects run, so the end
  // marker scrolls itself into view as it appears.
  const endRef = useCallback((node: HTMLDivElement | null) => {
    endOfList.current = node;
    if (node) requestAnimationFrame(() => node.scrollIntoView({ block: 'end' }));
  }, []);

  useEffect(() => {
    if (open) endOfList.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries, pending, open]);

  // Old questions age out while the drawer is open, so the count can recover.
  useEffect(() => {
    if (!open) return undefined;
    setLeft(questionsLeft());
    const timer = window.setInterval(() => setLeft(questionsLeft()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const send = async (text: string) => {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || pending || questionsLeft() === 0) return;
    const before = entries;
    recordQuestion();
    setLeft(questionsLeft());
    const said: Entry[] = [...before, { role: 'user', content: message }];
    remember(said);
    setDraft('');
    setPending(true);
    const reply = await ask(message, before);
    setPending(false);
    setLeft(questionsLeft());
    remember([...said, reply]);
    composer.current?.focus();
  };

  // The page's question, if any, goes out once as the first message. A
  // question that cannot go yet (a reply pending, no questions left) waits in
  // the field instead of being dropped.
  const sendRef = useRef(send);
  sendRef.current = send;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const offer = useCallback((question: string) => {
    if (!question) return;
    if (pendingRef.current || questionsLeft() === 0) setDraft(question.slice(0, MAX_CHARS));
    else void sendRef.current(question);
  }, []);

  const askedInitial = useRef(false);
  useEffect(() => {
    if (askedInitial.current) return;
    askedInitial.current = true;
    offer(initialQuestion);
  }, [initialQuestion, offer]);

  useEffect(() => {
    const onAsk = (event: Event) => {
      setOpen(true);
      offer(questionOf(event));
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [offer]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const startAgain = () => {
    clearConversation();
    setEntries([]);
    setDraft('');
    composer.current?.focus();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <ChatToggle />
      </SheetTrigger>

      <SheetContent
        className="chat-drawer gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          composer.current?.focus();
        }}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{ADVISOR_TITLE}</SheetTitle>
          <SheetDescription>
            Helps you pick among the eight libraries this site measured. Answers come only from the write-up, the screen spec, the
            result files and the build notes, and it names no overall winner.
          </SheetDescription>
        </SheetHeader>

        <div
          className="chat-log flex-1 space-y-3 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          tabIndex={0}
        >
          {entries.length === 0 ? (
            <div className="space-y-2 text-muted-foreground">
              <p>Try one of these, or ask your own.</p>
              <ul className="flex flex-col items-start gap-1.5" role="list">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <Button variant="outline" size="sm" className="h-auto py-1 text-left whitespace-normal" onClick={() => void send(s)}>
                      {s}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {entries.map((entry, index) => (
            <div
              key={index}
              className={
                entry.role === 'user'
                  ? 'chat-user ml-8 rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap'
                  : entry.failed
                    ? 'chat-failed mr-8 rounded-lg border border-dashed border-foreground/40 px-3 py-2'
                    : 'chat-answer mr-8 rounded-lg border px-3 py-2'
              }
            >
              <span className="sr-only">{entry.role === 'user' ? 'You said: ' : 'Advisor: '}</span>
              {entry.role === 'user' || entry.failed ? (
                entry.content
              ) : (
                <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={markdown}>
                  {entry.content}
                </ReactMarkdown>
              )}
            </div>
          ))}

          {pending ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              Looking through the comparison
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="space-y-2 border-t p-4">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="chat-input" className="text-sm font-medium">
              Your question
            </label>
            {entries.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={startAgain} disabled={pending}>
                <RotateCcw aria-hidden="true" /> Start again
              </Button>
            ) : null}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              id="chat-input"
              ref={composer}
              value={draft}
              maxLength={MAX_CHARS}
              rows={2}
              aria-describedby="chat-hint"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className="max-h-40 min-h-16 resize-none"
            />
            <Button type="submit" size="icon" disabled={pending || left === 0 || draft.trim().length === 0} aria-label="Send">
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
            </Button>
          </div>
          <p id="chat-hint" className="text-xs text-muted-foreground">
            Enter sends, Shift+Enter adds a line. {draft.length} of {MAX_CHARS} characters.
          </p>
          <p className="chat-quota text-xs font-medium" role="status">
            {QUESTION_LIMIT - left < WARN_AFTER
              ? null
              : left === 0
                ? 'You have used all your questions for now. Try again in a few minutes.'
                : `${left} ${left === 1 ? 'question' : 'questions'} remaining.`}
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
