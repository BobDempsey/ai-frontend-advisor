/**
 * Entry for the chat, the one module script on every page. It stays tiny: it
 * reveals the static navbar button from the shell and loads the chat island,
 * React included, only when a reader first reaches for it. Hovering or
 * focusing the button starts the download early; clicking mounts the island
 * already open.
 */
const mount = document.getElementById('chat-root');
const button = mount?.querySelector<HTMLButtonElement>('.chat-toggle');

if (mount && button) {
  let loading: Promise<typeof import('./island')> | undefined;
  const load = () => (loading ??= import('./island'));

  button.hidden = false;
  button.addEventListener('pointerenter', () => void load(), { once: true });
  button.addEventListener('focus', () => void load(), { once: true });
  button.addEventListener(
    'click',
    () => {
      button.setAttribute('aria-busy', 'true');
      load()
        .then(({ mountChat }) => mountChat(mount))
        .catch(() => {
          // A failed download leaves the button usable for another try.
          button.removeAttribute('aria-busy');
          loading = undefined;
          button.addEventListener('click', () => location.reload(), { once: true });
        });
    },
    { once: true },
  );
}
