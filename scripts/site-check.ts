/**
 * Checks the built results site in a real browser. spec/site-spec.md sections
 * 9 and 11.
 *
 *   pnpm site:build && pnpm site:screens && pnpm site:check
 *
 * Serves `site/dist` in this process through `scripts/serve.ts` and drives a
 * fresh `chrome-launcher` Chrome with `puppeteer-core`, the same pair the
 * screenshot and Lighthouse runners use. It fails on any of these:
 *
 * - axe-core reports a serious or critical violation on any site route, in
 *   either system color scheme
 * - a view other than the landing page and the scoreboard turns dark, or
 *   either of those two does not (site spec sections 7 and 12)
 * - the theme toggle on the landing page or the scoreboard does not switch,
 *   report, or remember the reader's choice, or the `dark` class on <html>
 *   disagrees with the paint
 * - without script, the landing page or the scoreboard stops following the
 *   system scheme or shows the toggle
 * - a route scrolls sideways at 375px wide
 * - the first scoreboard row's numbers, on `/results/`, sit below the fold at
 *   1440x900
 * - a focused control on the landing page, the scoreboard, a detail view or
 *   the write-up has no visible outline
 * - the landing page (advisor spec section 11) loses its hero, its question
 *   box or its starting prompts, shows a bundle number or a chart, fails axe
 *   or scrolls sideways at 1440 or 375 in either scheme, does not hand a
 *   question to the drawer as a `uilc:ask` event, or without script loses
 *   its link to `/results/` or lets a submit go anywhere but back to itself
 * - the chat island, on the landing page and two other views, does not open
 *   and close from the keyboard, return focus to its button, pass axe while
 *   open, follow the page's theme, carry the advisor's title, description and
 *   starting points, or render a stubbed answer safely (`/api/chat/` is
 *   intercepted, so no model is called)
 * - a starting point in the drawer does not go out as the first message
 * - a `uilc:ask` window event does not open the drawer and post its
 *   question, or an empty question posts anything
 * - one of the eight screens under `/screens/<build>/` fails to load an asset
 *   or never paints its 25 rows (skipped with `--no-screens`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, type LaunchedChrome } from 'chrome-launcher';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { ROSTER } from './roster.js';
import { assertServingBuild, serve } from './serve.js';
import { QUESTION_LIMIT, QUOTA_ENABLED } from '../site/src/chat/quota.js';
import { STARTING_PROMPTS } from '../site/src/landing/prompts.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const siteDist = join(root, 'site', 'dist');
/** Clear of the build dev ports, 5173 to 5190, and the runners' 4180 and 4200 range. */
const PORT = 4300;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
/**
 * The two routes that follow the system color scheme and carry the theme
 * toggle, site spec section 7. Every other view must stay light.
 */
const THEMED_ROUTES = ['/', '/results/'];
const followsScheme = (route: string) => THEMED_ROUTES.includes(route);

interface AxeResult {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

/**
 * The builds ship no favicon, so Chrome asks the origin root for one. That
 * request is the browser's, not the screen's, and a host serving the site
 * would answer it the same way.
 */
const isFaviconProbe = (url: string) => new URL(url).pathname === '/favicon.ico';

/**
 * Whether the page's body background is dark. Runs in the page. Tailwind v4
 * and shadcn's tokens are oklch, which Chrome reports as `oklch(...)` rather
 * than `rgb(...)`, so the color is painted on a canvas and read back as sRGB.
 * The `dark` class on <html>, shadcn's switch, must agree with the paint.
 */
function pageTheme(): { dark: boolean; darkClass: boolean } {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 255, g = 255, b = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return { dark: r + g + b < 255, darkClass: document.documentElement.classList.contains('dark') };
}
const PAGE_THEME = `(${pageTheme.toString()})()`;

const failures: string[] = [];
const fail = (message: string) => {
  failures.push(message);
  console.log(`  FAIL ${message}`);
};

async function withPage<T>(browser: Browser, width: number, height: number, fn: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height });
    return await fn(page);
  } finally {
    await page.close();
  }
}

async function axe(page: Page): Promise<AxeResult[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: AxeResult[] }> } }).axe.run;
    const { violations } = await run(document);
    return violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }));
  });
}

async function checkRoute(browser: Browser, route: string): Promise<void> {
  const url = `${ORIGIN}${route}`;
  for (const [width, height, scheme] of [
    [1440, 900, 'light'],
    [375, 812, 'light'],
    [1440, 900, 'dark'],
    [375, 812, 'dark'],
  ] as const) {
    await withPage(browser, width, height, async (page) => {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      const label = `${route} at ${width}px ${scheme}`;
      const bad: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400 && !isFaviconProbe(r.url())) bad.push(`${r.status()} ${r.url()}`);
      });
      page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
      await page.goto(url, { waitUntil: 'networkidle0' });
      // Lazy thumbnails only load once scrolled to, so scroll through first.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 20));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForNetworkIdle({ idleTime: 200 });
      if (bad.length > 0) fail(`${label}: ${bad.join(', ')}`);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) fail(`${label} scrolls sideways by ${overflow}px`);

      const { dark, darkClass } = await page.evaluate<[], () => ReturnType<typeof pageTheme>>(PAGE_THEME);
      const shouldBeDark = scheme === 'dark' && followsScheme(route);
      if (dark !== shouldBeDark) fail(`${label}: page is ${dark ? 'dark' : 'light'}, expected ${shouldBeDark ? 'dark' : 'light'}`);
      if (darkClass !== shouldBeDark) fail(`${label}: <html> ${darkClass ? 'has' : 'lacks'} the dark class`);

      const violations = await axe(page);
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const other = violations.filter((v) => !blocking.includes(v));
      for (const v of blocking) {
        fail(`${label}: axe ${v.impact} ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
      }
      const note = other.length > 0 ? `, minor or moderate: ${other.map((v) => `${v.id}`).join(', ')}` : '';
      console.log(`  ${label}: axe serious or critical ${blocking.length}${note}`);
    });
  }
}

async function checkFold(browser: Browser): Promise<void> {
  await withPage(browser, 1440, 900, async (page) => {
    await page.goto(`${ORIGIN}/results/`, { waitUntil: 'networkidle0' });
    const cells = await page.evaluate(() => {
      const row = document.querySelector('.scoreboard tbody tr:not(.group)');
      const rows = document.querySelectorAll('.scoreboard tbody tr:not(.group)').length;
      const bottoms = [...(row?.querySelectorAll('td.num') ?? [])].map((td) => td.getBoundingClientRect().bottom);
      const thumbs = document.querySelectorAll('.scoreboard td.thumb img').length;
      return { rows, bottoms, thumbs, viewport: window.innerHeight };
    });
    const worst = Math.max(...cells.bottoms);
    if (cells.rows !== Object.keys(ROSTER).length) fail(`scoreboard has ${cells.rows} build rows`);
    if (cells.thumbs !== cells.rows) fail(`scoreboard has ${cells.thumbs} thumbnails for ${cells.rows} rows`);
    if (cells.bottoms.length === 0 || worst > cells.viewport) {
      fail(`first scoreboard row's numbers end at ${worst}px, below the ${cells.viewport}px fold`);
    }
    console.log(`  first row: ${cells.bottoms.length} number cells, lowest edge at ${worst.toFixed(0)}px of ${cells.viewport}px`);
  });
}

async function checkKeyboard(browser: Browser, route: string): Promise<void> {
  await withPage(browser, 1440, 900, async (page) => {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    // Number every focusable element first, so two links with the same text
    // and target still count as two stops.
    const focusable = await page.evaluate(() => {
      const all = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      all.forEach((el, i) => el.setAttribute('data-check-stop', String(i)));
      return all.length;
    });
    const seen = new Set<string>();
    for (let i = 0; i < focusable + 2; i += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const label = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
        return { stop: el.getAttribute('data-check-stop') ?? label, label, outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      if (!state) continue;
      seen.add(state.stop);
      if (state.outline === 'none' || state.width < 2) fail(`${route}: ${state.label} has no visible focus outline`);
    }
    const reached = seen.size;
    console.log(`  ${route}: Tab reached ${reached} of ${focusable} focusable elements, each with an outline`);
    if (reached < focusable) fail(`${route}: Tab reached only ${reached} of ${focusable} focusable elements`);
  });
}

async function checkThemeToggle(browser: Browser, route: string): Promise<void> {
  await withPage(browser, 1440, 900, async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const state = async () => {
      const theme = await page.evaluate<[], () => ReturnType<typeof pageTheme>>(PAGE_THEME);
      const button = await page.evaluate(() => {
        const el = document.querySelector<HTMLButtonElement>('.theme-toggle');
        return {
          visible: Boolean(el && !el.hidden && el.getBoundingClientRect().width > 0),
          pressed: el?.getAttribute('aria-pressed'),
        };
      });
      // The paint and shadcn's class must agree, or one of them is lying.
      return { dark: theme.dark && theme.darkClass, painted: theme.dark, ...button };
    };
    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
    const start = await state();
    if (!start.visible) fail(`${route}: the theme toggle is hidden`);
    if (start.dark || start.painted || start.pressed !== 'false') fail(`${route}: toggle starts ${JSON.stringify(start)} under a light system scheme`);
    await page.click('.theme-toggle');
    const flipped = await state();
    if (!flipped.dark || flipped.pressed !== 'true') fail(`${route}: toggle click left ${JSON.stringify(flipped)}`);
    await page.reload({ waitUntil: 'networkidle0' });
    const kept = await state();
    if (!kept.dark || kept.pressed !== 'true') fail(`${route}: dark choice not kept after reload, ${JSON.stringify(kept)}`);
    await page.click('.theme-toggle');
    const back = await state();
    if (back.dark || back.painted || back.pressed !== 'false') fail(`${route}: second click left ${JSON.stringify(back)}`);
    await page.evaluate(() => localStorage.clear());
    if (errors.length > 0) fail(`${route}: script errors ${errors.join('; ')}`);
    console.log(`  ${route}: toggle switches to dark, survives a reload, and switches back`);
  });
}

/**
 * Site spec section 7: without script the landing page and the scoreboard
 * still follow the system scheme and the toggle stays hidden. Other views
 * stay light.
 */
async function checkNoScript(browser: Browser): Promise<void> {
  for (const route of [...THEMED_ROUTES, '/write-up/']) {
    for (const scheme of ['light', 'dark'] as const) {
      await withPage(browser, 1440, 900, async (page) => {
        await page.setJavaScriptEnabled(false);
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
        // Script is off in the page, but puppeteer's evaluate still runs.
        const { dark } = await page.evaluate<[], () => ReturnType<typeof pageTheme>>(PAGE_THEME);
        const toggleShown = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('.theme-toggle');
          return Boolean(el && el.getBoundingClientRect().width > 0);
        });
        const shouldBeDark = scheme === 'dark' && followsScheme(route);
        const label = `${route} without script, ${scheme}`;
        if (dark !== shouldBeDark) fail(`${label}: page is ${dark ? 'dark' : 'light'}, expected ${shouldBeDark ? 'dark' : 'light'}`);
        if (toggleShown) fail(`${label}: the toggle shows with no script to drive it`);
        console.log(`  ${label}: ${dark ? 'dark' : 'light'}, toggle ${toggleShown ? 'shown' : 'hidden'}`);
      });
    }
  }
}

/**
 * The stubbed answer. The image tag must not render: the chat allows no raw
 * HTML. The table must render as a real <table> (advisor spec section 4 asks
 * for one when comparing two libraries), and its wide cells must scroll inside
 * the answer rather than push the drawer or the page sideways at 375px.
 */
const CHAT_STUB_TABLE_HEADERS = ['Measure', 'Vuetify (vue-vuetify)', 'Quasar (vue-quasar)'];
const CHAT_STUB_REPLY = [
  'Take a suite, see [the write-up](/write-up/). <img src="x" class="raw-html-leak">',
  '',
  `| ${CHAT_STUB_TABLE_HEADERS.join(' | ')} |`,
  '| :--- | ---: | ---: |',
  '| Gzipped size over the framework baseline, in kilobytes | 123.45 | 67.89 |',
  '| Criteria passed out of eighteen, with the failures listed by number | 18 | 17 |',
].join('\n');

/** Advisor spec section 7: the drawer's title, what its description says, and its starting points. */
const ADVISOR_TITLE = 'AI frontend advisor';
const ADVISOR_DESCRIPTION = /helps you pick among the eight libraries this site measured/i;
const ADVISOR_SUGGESTIONS = ['Help me pick a library for my project', 'Compare Vuetify and Quasar', 'Why is Ant Design over budget?'];

/**
 * Whether the element under `selector` paints a dark background. Runs in the
 * page, the same canvas read as `pageTheme`.
 */
function elementDark(selector: string): boolean | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.fillStyle = getComputedStyle(el).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 255, g = 255, b = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return r + g + b < 255;
}

const activeMatches = (page: Page, selector: string) =>
  page.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);

/**
 * Site spec section 14: the chat island opens and closes from the keyboard,
 * returns focus to its button, passes axe while open, follows the page's
 * theme, renders a stubbed answer's link without its raw HTML, and keeps the
 * conversation across a reload. `/api/chat/` is intercepted, so no model runs.
 */
async function checkChat(browser: Browser, route: string, width: number, height: number, scheme: 'light' | 'dark'): Promise<void> {
  const label = `${route} chat at ${width}px ${scheme}`;
  await withPage(browser, width, height, async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    const errors: string[] = [];
    const sent: { method: string; body: unknown }[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    let islandRequested = false;
    page.on('request', (request) => {
      if (/\/assets\/island-[^/]*\.js$/.test(new URL(request.url()).pathname)) islandRequested = true;
      if (new URL(request.url()).pathname.startsWith('/api/chat')) {
        let body: unknown;
        try {
          body = JSON.parse(request.postData() ?? '');
        } catch {
          body = request.postData();
        }
        sent.push({ method: request.method(), body });
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: CHAT_STUB_REPLY }) });
      } else {
        void request.continue();
      }
    });

    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    // Four questions already asked in this browser, so the next one is the fifth.
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.setItem('uilc-chat-quota', JSON.stringify([Date.now(), Date.now(), Date.now(), Date.now()]));
    });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    // The chat island, React included, must wait for the reader to reach for it.
    if (islandRequested) fail(`${label}: the chat island loaded before anyone used the button`);

    const open = async () => {
      await page.focus('.chat-toggle');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 5000 });
      // Let the slide-in finish before anything is measured.
      await page.evaluate(async () => {
        const dialog = document.querySelector('[role="dialog"]');
        await Promise.all((dialog?.getAnimations({ subtree: true }) ?? []).map((a) => a.finished.catch(() => undefined)));
      });
      // Radix focuses after its open animation frame.
      await page.waitForFunction(() => document.activeElement?.id === 'chat-input', { timeout: 5000 }).catch(() => undefined);
    };
    const close = async () => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5000 });
      await page.waitForFunction(() => document.activeElement?.classList.contains('chat-toggle'), { timeout: 5000 }).catch(() => undefined);
    };

    await open();
    if (!(await activeMatches(page, '#chat-input'))) fail(`${label}: opening does not focus the question field`);
    const shape = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const rect = dialog?.getBoundingClientRect();
      const log = document.querySelector('.chat-log');
      return {
        labelled: document.querySelector('label[for="chat-input"]')?.textContent?.trim() ?? '',
        live: log?.getAttribute('aria-live'),
        rect: rect ? `${Math.round(rect.left)} to ${Math.round(rect.right)} of ${document.documentElement.clientWidth}` : 'none',
        inViewport: Boolean(rect && rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 0.5),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (!shape.labelled) fail(`${label}: the question field has no <label>`);
    if (shape.live !== 'polite') fail(`${label}: the message list has aria-live="${shape.live}"`);
    if (!shape.inViewport) fail(`${label}: the drawer does not fit the viewport, it spans ${shape.rect}`);
    if (shape.overflow > 0) fail(`${label}: the open drawer scrolls the page sideways by ${shape.overflow}px`);

    // The advisor's wording: the dialog is named by its title, and an empty
    // conversation offers the three starting points as buttons.
    // No named helper inside evaluate: tsx wraps named functions in a `__name`
    // call that does not exist in the page.
    const wording = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return {
        title: document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? '',
        description: document.getElementById(dialog?.getAttribute('aria-describedby') ?? '')?.textContent?.trim() ?? '',
        suggestions: [...(dialog?.querySelectorAll('.chat-log button') ?? [])].map((b) => b.textContent?.trim() ?? ''),
        toggle: document.querySelector('.chat-toggle')?.getAttribute('aria-label') ?? '',
      };
    });
    if (wording.title !== ADVISOR_TITLE) fail(`${label}: the drawer is titled ${JSON.stringify(wording.title)}, expected ${JSON.stringify(ADVISOR_TITLE)}`);
    if (!ADVISOR_DESCRIPTION.test(wording.description)) fail(`${label}: the drawer description is ${JSON.stringify(wording.description)}`);
    if (JSON.stringify(wording.suggestions) !== JSON.stringify(ADVISOR_SUGGESTIONS)) {
      fail(`${label}: the drawer suggests ${JSON.stringify(wording.suggestions)}, expected ${JSON.stringify(ADVISOR_SUGGESTIONS)}`);
    }
    if (!wording.toggle.includes(ADVISOR_TITLE)) fail(`${label}: the chat button is named ${JSON.stringify(wording.toggle)}`);

    const dark = await page.evaluate(elementDark, '[role="dialog"]');
    const shouldBeDark = scheme === 'dark' && followsScheme(route);
    if (dark !== shouldBeDark) fail(`${label}: drawer is ${dark ? 'dark' : 'light'}, expected ${shouldBeDark ? 'dark' : 'light'}`);

    const violations = await axe(page);
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    for (const v of blocking) {
      fail(`${label}: axe with the drawer open, ${v.impact} ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
    }

    // Shift+Enter adds a line and sends nothing.
    await page.type('#chat-input', 'first');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.type('#chat-input', 'second');
    const multiline = await page.$eval('#chat-input', (el) => (el as HTMLTextAreaElement).value);
    if (multiline !== 'first\nsecond' || sent.length > 0) fail(`${label}: Shift+Enter gave ${JSON.stringify(multiline)} and ${sent.length} requests`);
    await page.$eval('#chat-input', (el) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Enter sends one message and the stubbed answer renders as markdown.
    await page.type('#chat-input', 'What should I use for my blog?');
    await page.keyboard.press('Enter');
    const answered = await page
      .waitForSelector('.chat-answer a[href="/write-up/"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!answered) fail(`${label}: the stubbed answer never rendered its link`);
    const request = sent[0];
    const body = request?.body as { message?: unknown; history?: unknown } | undefined;
    if (sent.length !== 1 || request?.method !== 'POST' || body?.message !== 'What should I use for my blog?' || !Array.isArray(body.history)) {
      fail(`${label}: expected one POST with the question, got ${JSON.stringify(sent)}`);
    }
    const after = await page.evaluate(() => ({
      leaked: document.querySelectorAll('.raw-html-leak, [role="dialog"] img').length,
      field: (document.querySelector('#chat-input') as HTMLTextAreaElement | null)?.value,
    }));
    if (after.leaked > 0) fail(`${label}: raw HTML from the answer was rendered`);

    // The markdown table renders as a table, scrolls inside its own region,
    // and leaves the drawer and the page without sideways scroll.
    const table = await page.evaluate(() => {
      const el = document.querySelector('.chat-answer table');
      const region = el?.closest('.chat-answer [role="region"]');
      const dialog = document.querySelector('[role="dialog"]');
      const log = document.querySelector('.chat-log');
      return {
        found: Boolean(el),
        headers: [...(el?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent?.trim() ?? ''),
        rows: el?.querySelectorAll('tbody tr').length ?? 0,
        numericAlign: [...(el?.querySelectorAll('tbody td:nth-child(2), tbody td:nth-child(3)') ?? [])].map((td) => getComputedStyle(td).textAlign),
        pipes: [...document.querySelectorAll('.chat-answer p')].some((p) => (p.textContent ?? '').includes('| ---')),
        regionNamed: Boolean(region?.getAttribute('aria-label')),
        regionFocusable: region?.getAttribute('tabindex') === '0',
        regionFits: Boolean(region && log && region.getBoundingClientRect().right <= log.getBoundingClientRect().right + 0.5),
        dialogOverflow: dialog ? dialog.scrollWidth - dialog.clientWidth : -1,
        logOverflow: log ? log.scrollWidth - log.clientWidth : -1,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (!table.found || table.pipes) fail(`${label}: the stubbed answer's markdown table did not render as a <table>`);
    if (JSON.stringify(table.headers) !== JSON.stringify(CHAT_STUB_TABLE_HEADERS)) {
      fail(`${label}: the answer table's headers are ${JSON.stringify(table.headers)}, expected ${JSON.stringify(CHAT_STUB_TABLE_HEADERS)}`);
    }
    if (table.rows !== 2) fail(`${label}: the answer table has ${table.rows} body rows, expected 2`);
    if (table.numericAlign.length !== 4 || table.numericAlign.some((a) => a !== 'right')) {
      fail(`${label}: the answer table's right-aligned columns are aligned ${JSON.stringify(table.numericAlign)}`);
    }
    if (!table.regionNamed || !table.regionFocusable) fail(`${label}: the answer table's scroll region is not named and focusable`);
    if (!table.regionFits) fail(`${label}: the answer table's scroll region is wider than the conversation`);
    if (table.dialogOverflow !== 0 || table.logOverflow !== 0 || table.pageOverflow > 0) {
      fail(`${label}: the answer table scrolls sideways, drawer ${table.dialogOverflow}px, conversation ${table.logOverflow}px, page ${table.pageOverflow}px`);
    }
    const answerViolations = await axe(page);
    const answerBlocking = answerViolations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    for (const v of answerBlocking) {
      fail(`${label}: axe with the answer table shown, ${v.impact} ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
    }
    const quota = await page.$eval('.chat-quota', (el) => el.textContent ?? '').catch(() => '');
    // The quota must be on; four stored questions plus this one leave QUESTION_LIMIT - 5.
    if (!QUOTA_ENABLED) fail(`${label}: QUOTA_ENABLED is false, so the drawer never counts questions`);
    const expectedQuota = `${QUESTION_LIMIT - 5} questions remaining.`;
    if (quota !== expectedQuota) fail(`${label}: after the fifth question the drawer said ${JSON.stringify(quota)}`);
    if (after.field !== '') fail(`${label}: the field kept ${JSON.stringify(after.field)} after sending`);
    await page.waitForFunction(() => document.activeElement?.id === 'chat-input', { timeout: 5000 }).catch(() => undefined);
    if (!(await activeMatches(page, '#chat-input'))) fail(`${label}: focus left the question field after the answer`);

    await close();
    if (!(await activeMatches(page, '.chat-toggle'))) fail(`${label}: Escape did not return focus to the chat button`);

    // The conversation survives a reload in the same tab.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    await open();
    if (!(await activeMatches(page, '#chat-input'))) fail(`${label}: reopening does not focus the question field`);
    const kept =await page.$$eval('.chat-user, .chat-answer', (els) => els.length);
    if (kept !== 2) fail(`${label}: ${kept} messages after a reload, expected 2`);
    await close();
    if (!(await activeMatches(page, '.chat-toggle'))) fail(`${label}: focus did not return after the second close`);
    await page.evaluate(() => sessionStorage.clear());

    if (errors.length > 0) fail(`${label}: script errors ${errors.join('; ')}`);
    console.log(
      `  ${label}: opens and closes by keyboard, focus returns, axe serious or critical ${blocking.length}, ` +
        `${dark ? 'dark' : 'light'}, advisor title and suggestions shown, stubbed answer rendered with its table ` +
        `(axe serious or critical ${answerBlocking.length}), history kept`,
    );
  });
}

/**
 * The `uilc:ask` contract in `site/src/chat/main.ts`: a page dispatches the
 * event, the island loads, the drawer opens, and the question goes out as the
 * first message. Once the island exists, an empty question only opens the
 * drawer. `/api/chat/` is intercepted, so no model runs.
 */
async function checkAsk(browser: Browser, route: string): Promise<void> {
  const label = `${route} ask event`;
  const question = 'Compare Vuetify and Quasar';
  await withPage(browser, 1440, 900, async (page) => {
    const errors: string[] = [];
    const sent: { method: string; body: unknown }[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/chat')) {
        let body: unknown;
        try {
          body = JSON.parse(request.postData() ?? '');
        } catch {
          body = request.postData();
        }
        sent.push({ method: request.method(), body });
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: CHAT_STUB_REPLY }) });
      } else {
        void request.continue();
      }
    });

    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem('uilc-chat-quota');
    });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    const ask = (q: string) => page.evaluate((text) => void window.dispatchEvent(new CustomEvent('uilc:ask', { detail: { question: text } })), q);

    await ask(question);
    const opened = await page
      .waitForSelector('[role="dialog"]', { visible: true, timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) fail(`${label}: dispatching uilc:ask did not open the drawer`);
    const answered = await page
      .waitForSelector('.chat-answer a[href="/write-up/"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!answered) fail(`${label}: the stubbed answer never rendered`);
    const body = sent[0]?.body as { message?: unknown; history?: unknown } | undefined;
    if (sent.length !== 1 || sent[0]?.method !== 'POST' || body?.message !== question || !Array.isArray(body.history)) {
      fail(`${label}: expected one POST with the question, got ${JSON.stringify(sent)}`);
    }
    const shown = await page.$$eval('.chat-user', (els) => els.map((el) => el.textContent ?? ''));
    if (shown.length !== 1 || !shown[0]?.includes(question)) fail(`${label}: the drawer shows ${JSON.stringify(shown)} as the reader's messages`);

    // Closed, then an empty question: the drawer opens and nothing is posted.
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5000 });
    await ask('');
    const reopened = await page
      .waitForSelector('[role="dialog"]', { visible: true, timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!reopened) fail(`${label}: an empty question did not open the drawer`);
    await new Promise((r) => setTimeout(r, 300));
    if (sent.length !== 1) fail(`${label}: an empty question posted, ${sent.length} requests in all`);
    await page.evaluate(() => sessionStorage.clear());

    if (errors.length > 0) fail(`${label}: script errors ${errors.join('; ')}`);
    console.log(`  ${label}: opens the drawer and posts the question; an empty question only opens it`);
  });
}

const LANDING_HEADLINE = 'Find the front-end library that fits your project';

/**
 * Advisor spec section 11: the landing page at `/`. At 1440 and 375 in both
 * schemes it shows the hero with its question box above the fold, the
 * starting prompts, the navbar in its order, and the link to `/results/`; it
 * shows no bundle number and no chart; it passes axe and does not scroll
 * sideways.
 */
async function checkLandingLayout(browser: Browser, width: number, height: number, scheme: 'light' | 'dark'): Promise<void> {
  const label = `/ landing at ${width}px ${scheme}`;
  await withPage(browser, width, height, async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    const state = await page.evaluate(() => {
      const main = document.querySelector('main');
      const h1 = document.querySelector('main h1');
      const form = document.querySelector<HTMLFormElement>('form#landing-ask');
      const field = document.querySelector<HTMLTextAreaElement>('#landing-question');
      const send = form?.querySelector<HTMLButtonElement>('button[type="submit"]:not([name])');
      const fallback = document.querySelector<HTMLAnchorElement>('.landing-fallback a');
      const text = main?.innerText ?? '';
      const current = document.querySelector('nav[aria-label="Site"] [aria-current="page"]');
      return {
        h1s: document.querySelectorAll('h1').length,
        headline: h1?.textContent?.trim() ?? '',
        formMethod: form?.method,
        fieldLabel: field ? (document.querySelector(`label[for="${field.id}"]`)?.textContent?.trim() ?? '') : '',
        sendText: send?.textContent?.trim() ?? '',
        prompts: [...document.querySelectorAll<HTMLButtonElement>('.landing-prompt')].map((b) => ({
          text: b.textContent?.trim() ?? '',
          value: b.value,
          inForm: b.form === form,
        })),
        fallback: fallback?.href ?? null,
        fallbackVisible: Boolean(fallback && fallback.getBoundingClientRect().width > 0),
        // The headline, the question box and its send button all sit above the fold.
        foldEdge: Math.max(...[h1, field, send].map((el) => (el ? el.getBoundingClientRect().bottom : Infinity))),
        viewport: window.innerHeight,
        figures: text.match(/\d[\d.,]*\s*(KB|kB|ms)\b/g) ?? [],
        charts: document.querySelectorAll('main .scoreboard, main table, main [class*="bg-chart-"], main svg:not([aria-hidden="true"])').length,
        navCurrent: current?.textContent?.trim() ?? '',
        nav: [...document.querySelectorAll('nav[aria-label="Site"] a')].map((a) => a.textContent?.trim() ?? ''),
        headerOrder: [...document.querySelectorAll('header nav[aria-label="Site"], header .theme-toggle, header .chat-toggle')].map((el) =>
          el.matches('nav') ? 'nav' : el.matches('.theme-toggle') ? 'theme' : 'chat',
        ),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (state.h1s !== 1 || state.headline !== LANDING_HEADLINE) fail(`${label}: headline is ${JSON.stringify(state.headline)} (${state.h1s} h1)`);
    if (state.formMethod !== 'get') fail(`${label}: the question box is not a GET form (${state.formMethod})`);
    if (!state.fieldLabel) fail(`${label}: the question box has no <label>`);
    if (!state.sendText) fail(`${label}: the question box has no labelled send button`);
    const promptTexts = state.prompts.map((p) => p.text);
    if (JSON.stringify(promptTexts) !== JSON.stringify(STARTING_PROMPTS)) fail(`${label}: starting prompts are ${JSON.stringify(promptTexts)}`);
    for (const p of state.prompts) {
      if (p.value !== p.text || !p.inForm) fail(`${label}: prompt ${JSON.stringify(p.text)} carries ${JSON.stringify(p.value)}, in the form: ${p.inForm}`);
    }
    if (state.fallback !== `${ORIGIN}/results/` || !state.fallbackVisible) fail(`${label}: the fallback link goes to ${state.fallback}`);
    if (state.foldEdge > state.viewport) fail(`${label}: the hero ends at ${state.foldEdge}px, below the ${state.viewport}px fold`);
    if (state.figures.length > 0) fail(`${label}: shows measured figures ${state.figures.join(', ')}`);
    if (state.charts > 0) fail(`${label}: shows ${state.charts} chart or table elements`);
    if (state.navCurrent !== 'Advisor') fail(`${label}: the current nav item is ${JSON.stringify(state.navCurrent)}`);
    if (JSON.stringify(state.nav) !== JSON.stringify(['Advisor', 'Results', 'Write-up', 'Screen spec'])) {
      fail(`${label}: the navbar reads ${JSON.stringify(state.nav)}`);
    }
    if (JSON.stringify(state.headerOrder) !== JSON.stringify(['nav', 'theme', 'chat'])) fail(`${label}: the header order is ${JSON.stringify(state.headerOrder)}`);
    if (state.overflow > 0) fail(`${label} scrolls sideways by ${state.overflow}px`);

    const { dark, darkClass } = await page.evaluate<[], () => ReturnType<typeof pageTheme>>(PAGE_THEME);
    const shouldBeDark = scheme === 'dark';
    if (dark !== shouldBeDark || darkClass !== shouldBeDark) fail(`${label}: page is ${dark ? 'dark' : 'light'}, class dark ${darkClass}`);

    const violations = await axe(page);
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    for (const v of blocking) {
      fail(`${label}: axe ${v.impact} ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
    }
    if (errors.length > 0) fail(`${label}: script errors ${errors.join('; ')}`);
    console.log(
      `  ${label}: hero ends at ${state.foldEdge.toFixed(0)}px of ${state.viewport}px, ${state.prompts.length} prompts, ` +
        `axe serious or critical ${blocking.length}, overflow ${state.overflow}px`,
    );
  });
}

/**
 * Advisor spec section 11: sending from the question box, by Enter or by the
 * button, and clicking a starting prompt each dispatch `uilc:ask` with the
 * question, the drawer opens and posts it, and the page stays put.
 * Shift+Enter adds a line and sends nothing. An empty box only opens the
 * drawer. `/api/chat/` is intercepted, so no model runs.
 */
async function checkLandingAsk(browser: Browser, width: number, height: number): Promise<void> {
  const label = `/ landing ask at ${width}px`;
  await withPage(browser, width, height, async (page) => {
    const errors: string[] = [];
    const sent: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/chat')) {
        let message: unknown;
        try {
          message = (JSON.parse(request.postData() ?? '') as { message?: unknown }).message;
        } catch {
          message = request.postData();
        }
        sent.push(String(message));
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: CHAT_STUB_REPLY }) });
      } else {
        void request.continue();
      }
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem('uilc-chat-quota');
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    // Record every ask event the page dispatches, beside the chat's own listener.
    await page.evaluate(() => {
      const w = window as unknown as { __asks: string[] };
      w.__asks = [];
      window.addEventListener('uilc:ask', (event) => {
        w.__asks.push(String((event as CustomEvent<{ question?: unknown }>).detail?.question));
      });
    });
    const asks = () => page.evaluate(() => (window as unknown as { __asks: string[] }).__asks);
    const dialogOpens = () =>
      page
        .waitForSelector('[role="dialog"]', { visible: true, timeout: 10000 })
        .then(() => true)
        .catch(() => false);
    const closeDialog = async () => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5000 });
    };
    const answered = (count: number) =>
      page
        .waitForFunction((n) => document.querySelectorAll('.chat-answer').length >= n, { timeout: 5000 }, count)
        .then(() => true)
        .catch(() => false);
    const expected: string[] = [];

    // Shift+Enter adds a line and dispatches nothing.
    await page.type('#landing-question', 'line one');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    const multiline = await page.$eval('#landing-question', (el) => (el as HTMLTextAreaElement).value);
    const early = (await asks()).length;
    if (multiline !== 'line one\n' || early > 0) fail(`${label}: Shift+Enter gave ${JSON.stringify(multiline)} and ${early} events`);
    await page.$eval('#landing-question', (el) => {
      (el as HTMLTextAreaElement).value = '';
    });

    // Enter sends the typed question and clears the box.
    const typed = 'My app is a Vue dashboard';
    await page.type('#landing-question', typed);
    await page.keyboard.press('Enter');
    expected.push(typed);
    if (!(await dialogOpens())) fail(`${label}: Enter in the question box did not open the drawer`);
    if (!(await answered(1))) fail(`${label}: the typed question got no answer`);
    const cleared = await page.$eval('#landing-question', (el) => (el as HTMLTextAreaElement).value);
    if (cleared !== '') fail(`${label}: the question box kept ${JSON.stringify(cleared)} after sending`);
    await closeDialog();

    // The send button with an empty box only opens the drawer.
    await page.click('#landing-ask button[type="submit"]:not([name])');
    expected.push('');
    if (!(await dialogOpens())) fail(`${label}: the send button with an empty box did not open the drawer`);
    await new Promise((r) => setTimeout(r, 300));
    await closeDialog();

    // Each starting prompt sends its own question.
    for (const [i, prompt] of STARTING_PROMPTS.entries()) {
      await page.click(`.landing-prompt[value="${prompt}"]`);
      expected.push(prompt);
      if (!(await dialogOpens())) fail(`${label}: the prompt ${JSON.stringify(prompt)} did not open the drawer`);
      if (!(await answered(i + 2))) fail(`${label}: the prompt ${JSON.stringify(prompt)} got no answer`);
      await closeDialog();
    }

    const got = await asks();
    if (JSON.stringify(got) !== JSON.stringify(expected)) fail(`${label}: dispatched ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    const posted = [typed, ...STARTING_PROMPTS];
    if (JSON.stringify(sent) !== JSON.stringify(posted)) fail(`${label}: posted ${JSON.stringify(sent)}, expected ${JSON.stringify(posted)}`);
    if (page.url() !== `${ORIGIN}/`) fail(`${label}: the page navigated to ${page.url()}`);
    await page.evaluate(() => sessionStorage.clear());
    if (errors.length > 0) fail(`${label}: script errors ${errors.join('; ')}`);
    console.log(`  ${label}: Enter, the send button and ${STARTING_PROMPTS.length} prompts each dispatch uilc:ask and open the drawer`);
  });
}

/**
 * Advisor spec section 11, without script: the link to `/results/` is there,
 * and submitting a starting prompt only reloads the landing page.
 */
async function checkLandingNoScript(browser: Browser): Promise<void> {
  const label = '/ landing without script';
  await withPage(browser, 375, 812, async (page) => {
    await page.setJavaScriptEnabled(false);
    const unexpected: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' || new URL(r.url()).pathname.startsWith('/api/')) unexpected.push(`${r.method()} ${r.url()}`);
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' });
    const fallback = await page.evaluate(() => {
      const a = document.querySelector<HTMLAnchorElement>('.landing-fallback a');
      return a && a.getBoundingClientRect().width > 0 ? a.href : null;
    });
    if (fallback !== `${ORIGIN}/results/`) fail(`${label}: the fallback link goes to ${fallback}`);
    const [response] = await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.landing-prompt')]);
    const landed = new URL(page.url());
    const headline = await page.$eval('main h1', (el) => el.textContent?.trim() ?? '').catch(() => '');
    if (landed.pathname !== '/' || response?.status() !== 200 || headline !== LANDING_HEADLINE) {
      fail(`${label}: a prompt submit went to ${page.url()} (${response?.status()}), showing ${JSON.stringify(headline)}`);
    }
    if (unexpected.length > 0) fail(`${label}: the submit sent ${unexpected.join(', ')}`);
    console.log(`  ${label}: fallback link to /results/, a prompt submit reloads ${landed.pathname}`);
  });
}

/**
 * Advisor spec section 7: a starting point in the drawer sends its own text as
 * the first message. `/api/chat/` is intercepted, so no model runs.
 */
async function checkSuggestion(browser: Browser, route: string): Promise<void> {
  const label = `${route} advisor suggestion`;
  const question = ADVISOR_SUGGESTIONS[0] ?? '';
  await withPage(browser, 1440, 900, async (page) => {
    const errors: string[] = [];
    const sent: unknown[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/chat')) {
        try {
          sent.push(JSON.parse(request.postData() ?? ''));
        } catch {
          sent.push(request.postData());
        }
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: CHAT_STUB_REPLY }) });
      } else {
        void request.continue();
      }
    });

    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem('uilc-chat-quota');
    });
    await page.waitForSelector('.chat-toggle', { visible: true, timeout: 10000 });
    await page.click('.chat-toggle');
    await page.waitForSelector('[role="dialog"] .chat-log button', { visible: true, timeout: 10000 });
    const clicked = await page.evaluate((text) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] .chat-log button')].find(
        (b) => b.textContent?.trim() === text,
      );
      button?.click();
      return Boolean(button);
    }, question);
    if (!clicked) fail(`${label}: no starting point reads ${JSON.stringify(question)}`);
    const answered = await page
      .waitForSelector('.chat-answer a[href="/write-up/"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!answered) fail(`${label}: the stubbed answer never rendered`);
    const body = sent[0] as { message?: unknown; history?: unknown } | undefined;
    if (sent.length !== 1 || body?.message !== question || !Array.isArray(body.history) || body.history.length !== 0) {
      fail(`${label}: expected one POST with the starting point and no history, got ${JSON.stringify(sent)}`);
    }
    await page.evaluate(() => sessionStorage.clear());

    if (errors.length > 0) fail(`${label}: script errors ${errors.join('; ')}`);
    console.log(`  ${label}: "${question}" goes out as the first message`);
  });
}

async function checkScreen(browser: Browser, build: string): Promise<void> {
  const route = `/screens/${build}/`;
  const expected = /<title>([^<]*)<\/title>/.exec(readFileSync(join(siteDist, 'screens', build, 'index.html'), 'utf8'))?.[1];
  await withPage(browser, 1440, 900, async (page) => {
    const bad: string[] = [];
    let assets = 0;
    page.on('response', (r) => {
      if (r.status() >= 400 && !isFaviconProbe(r.url())) bad.push(`${r.status()} ${r.url()}`);
      else if (r.url().includes(`${route}assets/`)) assets += 1;
    });
    page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle0' });
    const rows = await page
      .waitForFunction(() => document.querySelectorAll('tbody tr').length >= 25, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const title = await page.title();
    if (title !== expected) fail(`${route} served "${title}", expected "${expected}"`);
    if (!rows) fail(`${route} never painted 25 rows`);
    if (bad.length > 0) fail(`${route}: ${bad.join(', ')}`);
    if (assets === 0) fail(`${route} loaded no assets from ${route}assets/`);
    console.log(`  ${route}: "${title}", ${assets} assets, 25 rows ${rows ? 'painted' : 'missing'}`);
  });
}

async function main(): Promise<void> {
  if (!existsSync(join(siteDist, 'index.html'))) throw new Error('site/dist is missing. Run pnpm site:build first.');
  const withScreens = !process.argv.includes('--no-screens');
  const builds = Object.keys(ROSTER);
  if (withScreens) {
    const missing = builds.filter((b) => !existsSync(join(siteDist, 'screens', b, 'index.html')));
    if (missing.length > 0) throw new Error(`site/dist/screens is missing ${missing.join(', ')}. Run pnpm site:screens.`);
  }

  const server = await serve(siteDist, PORT, { directories: true });
  let chrome: LaunchedChrome | undefined;
  let browser: Browser | undefined;
  try {
    // A stale server on this port would answer with some other page.
    await assertServingBuild(`${ORIGIN}/`, siteDist);
    chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });

    const routes = ['/', '/results/', ...builds.map((b) => `/builds/${b}/`), '/write-up/', '/spec/'];
    console.log('axe-core, assets, and sideways scroll');
    for (const route of routes) await checkRoute(browser, route);
    console.log('fold at 1440x900');
    await checkFold(browser);
    console.log('theme toggle');
    for (const route of THEMED_ROUTES) await checkThemeToggle(browser, route);
    console.log('theme without script');
    await checkNoScript(browser);
    console.log('keyboard');
    for (const route of ['/', '/results/', `/builds/${builds[0]}/`, '/write-up/']) await checkKeyboard(browser, route);
    console.log('landing page');
    for (const [width, height] of [
      [1440, 900],
      [375, 812],
    ] as const) {
      for (const scheme of ['light', 'dark'] as const) await checkLandingLayout(browser, width, height, scheme);
    }
    await checkLandingAsk(browser, 1440, 900);
    await checkLandingAsk(browser, 375, 812);
    await checkLandingNoScript(browser);
    console.log('chat island, against a stubbed /api/chat/');
    await checkChat(browser, '/', 1440, 900, 'light');
    await checkChat(browser, '/', 1440, 900, 'dark');
    await checkChat(browser, '/', 375, 812, 'dark');
    await checkChat(browser, '/write-up/', 1440, 900, 'dark');
    await checkChat(browser, `/builds/${builds[0]}/`, 375, 812, 'light');
    await checkAsk(browser, '/write-up/');
    await checkSuggestion(browser, '/spec/');
    if (withScreens) {
      console.log('screens');
      for (const build of builds) await checkScreen(browser, build);
    }
  } finally {
    await browser?.disconnect();
    chrome?.kill();
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} site check(s) failed`);
    process.exit(1);
  }
  console.log('\nsite checks passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
