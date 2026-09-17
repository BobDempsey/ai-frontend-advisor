/**
 * The landing page's question box, inlined as a classic script at the end of
 * the landing page's body. Advisor spec section 11.
 *
 * The box is a plain GET form, so without script a submit only reloads the
 * page. With script, a submit is caught here and handed to the chat drawer as
 * a `uilc:ask` window event, which `src/chat/main.ts` answers. The page never
 * talks to `/api/chat/` itself. A starting prompt is a submit button carrying
 * its question as its value, so both paths share this one handler.
 */
function ask(): void {
  // Declared inside: only this function's own source reaches the page.
  const form = document.getElementById('landing-ask');
  const field = document.getElementById('landing-question');
  if (!(form instanceof HTMLFormElement) || !(field instanceof HTMLTextAreaElement)) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const fromPrompt = submitter instanceof HTMLButtonElement && submitter.name === 'prompt' ? submitter.value : '';
    const question = (fromPrompt || field.value).trim();
    if (!fromPrompt) field.value = '';
    window.dispatchEvent(new CustomEvent('uilc:ask', { detail: { question } }));
  });

  // Enter sends and Shift+Enter adds a line, the same as the drawer.
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });
}

/** `ask` as source, so it runs in the page and still typechecks here. */
export const ASK_SCRIPT = `<script>(${ask.toString()})();</script>`;
