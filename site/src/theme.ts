/**
 * The scoreboard's light and dark toggle, inlined as a classic script right
 * after `<body>` so a stored choice applies before first paint. Site spec
 * section 7. It is the only script on the site, so it stays small and does
 * nothing a static page needs: without it the page follows the system scheme
 * and the button stays hidden.
 *
 * The choice lives in localStorage, per reader. Storage can be missing or
 * throw (private windows, blocked site data), so every access is guarded and
 * the page falls back to the system scheme.
 */
function toggle(): void {
  // Declared inside: only this function's own source reaches the page.
  const KEY = 'uilc-theme';
  const body = document.body;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  if (stored === 'light' || stored === 'dark') body.dataset.theme = stored;

  const isDark = () => (body.dataset.theme ? body.dataset.theme === 'dark' : media.matches);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector<HTMLButtonElement>('.theme-toggle');
    if (!button) return;
    const sync = () => button.setAttribute('aria-pressed', String(isDark()));
    sync();
    button.hidden = false;
    media.addEventListener('change', sync);
    button.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      body.dataset.theme = next;
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // The choice then lasts for this page view only.
      }
      sync();
    });
  });
}

/** `toggle` as source, so it runs in the page and still typechecks here. */
export const THEME_SCRIPT = `<script>(${toggle.toString()})();</script>`;
