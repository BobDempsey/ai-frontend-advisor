/**
 * Entry for the chat, the one module script on every page. It stays tiny: it
 * reveals the static navbar button from the shell and loads the chat island,
 * React included, only when a reader first reaches for it. Hovering or
 * focusing the button starts the download early; clicking mounts the island
 * already open.
 *
 * Any page may also hand the drawer a question:
 *
 *   window.dispatchEvent(new CustomEvent('uilc:ask', { detail: { question } }));
 *
 * Before the island exists, this entry loads it and mounts it open with the
 * question, which the island sends as the first message. After that the
 * island listens for the event itself. An empty question only opens the
 * drawer.
 */
const ASK_EVENT = 'uilc:ask';

const mount = document.getElementById('chat-root');
const button = mount?.querySelector<HTMLButtonElement>('.chat-toggle');

if (mount && button) {
  let loading: Promise<typeof import('./island')> | undefined;
  let mounted = false;
  let failed = false;
  const load = () => (loading ??= import('./island'));

  const start = (question: string) => {
    if (mounted) return;
    mounted = true;
    button.setAttribute('aria-busy', 'true');
    load()
      .then(({ mountChat }) => mountChat(mount, question))
      .catch(() => {
        // A failed download leaves the button usable for another try.
        button.removeAttribute('aria-busy');
        loading = undefined;
        mounted = false;
        failed = true;
      });
  };

  button.hidden = false;
  button.addEventListener('pointerenter', () => void load(), { once: true });
  button.addEventListener('focus', () => void load(), { once: true });
  button.addEventListener('click', () => {
    // The browser caches a failed module import, so only a reload retries it.
    if (failed) location.reload();
    else start('');
  });
  window.addEventListener(ASK_EVENT, (event) => {
    if (failed) return;
    const question = (event as CustomEvent<{ question?: unknown } | null>).detail?.question;
    start(typeof question === 'string' ? question.trim() : '');
  });
}
