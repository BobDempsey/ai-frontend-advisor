/**
 * The scoreboard's light and dark toggle, inlined as a classic script in the
 * scoreboard's `<head>` so the right class is on `<html>` before first paint.
 * Site spec section 7. It is the only script on the site, so it stays small
 * and does nothing a static page needs.
 *
 * It follows shadcn's approach: `dark` on the root element turns the dark
 * tokens and every `dark:` variant on. With nothing stored it applies the
 * system scheme and keeps following it. It also sets `light` when the page is
 * light, which switches off the CSS fallback in `styles.css` that follows the
 * system scheme when this script never runs. Only the scoreboard carries
 * this script and the `theme-auto` class, so no other page can turn dark.
 *
 * The choice lives in localStorage, per reader. Storage can be missing or
 * throw (private windows, blocked site data), so every access is guarded and
 * the page falls back to the system scheme.
 */
function toggle(): void {
  // Declared inside: only this function's own source reaches the page.
  const KEY = 'uilc-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let choice: string | null = null;
  try {
    choice = window.localStorage.getItem(KEY);
  } catch {
    choice = null;
  }
  if (choice !== 'light' && choice !== 'dark') choice = null;

  const isDark = () => (choice ? choice === 'dark' : media.matches);
  const apply = () => {
    const dark = isDark();
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    const button = document.querySelector<HTMLButtonElement>('.theme-toggle');
    if (button) button.setAttribute('aria-pressed', String(dark));
  };
  apply();
  media.addEventListener('change', apply);

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector<HTMLButtonElement>('.theme-toggle');
    if (!button) return;
    apply();
    button.hidden = false;
    button.addEventListener('click', () => {
      choice = isDark() ? 'light' : 'dark';
      try {
        window.localStorage.setItem(KEY, choice);
      } catch {
        // The choice then lasts for this page view only.
      }
      apply();
    });
  });
}

/** `toggle` as source, so it runs in the page and still typechecks here. */
export const THEME_SCRIPT = `<script>(${toggle.toString()})();</script>`;
