/**
 * The landing page's starting prompts, advisor spec section 11. They match the
 * drawer's suggestions in advisor spec section 7. Plain data with no React, so
 * `scripts/site-check.ts` can import the same list it checks the page against.
 */
export const STARTING_PROMPTS = [
  'Help me pick a library for my project',
  'Compare Vuetify and Quasar',
  'Why is Ant Design over budget?',
] as const;
