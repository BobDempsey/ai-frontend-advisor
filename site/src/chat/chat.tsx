/**
 * The chat island: the navbar button, and a drawer holding the conversation.
 * spec/site-spec.md section 14. It is the only React that reaches the
 * browser, loaded on first use by `main.ts` and mounted by `island.tsx`.
 *
 * The drawer is portaled into <body>, so it takes the page's colors: dark only
 * where the scoreboard's theme script has put `dark` on <html>.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { LoaderCircle, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ChatToggle } from './toggle';
import { asHistory, clearConversation, readConversation, writeConversation, type Entry } from './store';

/** The function's own limit; the server cuts anything longer anyway. */
const MAX_CHARS = 1000;
/** Absolute, so every page depth posts to the same place. Trailing slash, because the host redirects without one. */
export const CHAT_ENDPOINT = '/api/chat/';

const SUGGESTIONS = ['What should I use for my blog?', 'Which Vue library has the smallest bundle?', 'Why is Ant Design over budget?'];

const linkClass = 'font-medium underline underline-offset-2';

/** Markdown with no raw HTML: `skipHtml` drops it, and links get the site's style. */
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
    <div className="my-1.5 overflow-x-auto">
      <table className="text-xs [&_td]:border [&_td]:px-1.5 [&_th]:border [&_th]:px-1.5">{children}</table>
    </div>
  ),
};

async function ask(message: string, history: Entry[]): Promise<Entry> {
  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history: asHistory(history) }),
    });
    const body = (await response.json().catch(() => ({}))) as { reply?: unknown; error?: unknown };
    if (response.ok && typeof body.reply === 'string') return { role: 'assistant', content: body.reply };
    const error = typeof body.error === 'string' ? body.error : 'The assistant could not answer just now. Try again later.';
    return { role: 'assistant', content: error, failed: true };
  } catch {
    return { role: 'assistant', content: 'The assistant could not be reached. Check your connection and try again.', failed: true };
  }
}

export function ChatIsland({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [entries, setEntries] = useState<Entry[]>(() => (initialOpen ? readConversation() : []));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
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

  const send = async (text: string) => {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || pending) return;
    const before = entries;
    const said: Entry[] = [...before, { role: 'user', content: message }];
    remember(said);
    setDraft('');
    setPending(true);
    const reply = await ask(message, before);
    setPending(false);
    remember([...said, reply]);
    composer.current?.focus();
  };

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
          <SheetTitle>Ask about this comparison</SheetTitle>
          <SheetDescription>
            Answers come only from the write-up, the screen spec and the eight result files. The assistant names no overall winner.
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
              <span className="sr-only">{entry.role === 'user' ? 'You said: ' : 'Assistant: '}</span>
              {entry.role === 'user' || entry.failed ? (
                entry.content
              ) : (
                <ReactMarkdown skipHtml components={markdown}>
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
            <Button type="submit" size="icon" disabled={pending || draft.trim().length === 0} aria-label="Send">
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
            </Button>
          </div>
          <p id="chat-hint" className="text-xs text-muted-foreground">
            Enter sends, Shift+Enter adds a line. {draft.length} of {MAX_CHARS} characters.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
