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
 * - a view other than the scoreboard turns dark, or the scoreboard does not
 *   (site spec section 12)
 * - the scoreboard's theme toggle does not switch, report, or remember the
 *   reader's choice, or the `dark` class on <html> disagrees with the paint
 * - without script, the scoreboard stops following the system scheme or
 *   shows the toggle
 * - a route scrolls sideways at 375px wide
 * - the first scoreboard row's numbers sit below the fold at 1440x900
 * - a focused control on the scoreboard has no visible outline
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

const root = fileURLToPath(new URL('..', import.meta.url));
const siteDist = join(root, 'site', 'dist');
/** Clear of the build dev ports, 5173 to 5190, and the runners' 4180 and 4200 range. */
const PORT = 4300;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

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
      const shouldBeDark = scheme === 'dark' && route === '/';
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
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' });
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

async function checkThemeToggle(browser: Browser): Promise<void> {
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
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
    const start = await state();
    if (!start.visible) fail('/: the theme toggle is hidden');
    if (start.dark || start.painted || start.pressed !== 'false') fail(`/: toggle starts ${JSON.stringify(start)} under a light system scheme`);
    await page.click('.theme-toggle');
    const flipped = await state();
    if (!flipped.dark || flipped.pressed !== 'true') fail(`/: toggle click left ${JSON.stringify(flipped)}`);
    await page.reload({ waitUntil: 'networkidle0' });
    const kept = await state();
    if (!kept.dark || kept.pressed !== 'true') fail(`/: dark choice not kept after reload, ${JSON.stringify(kept)}`);
    await page.click('.theme-toggle');
    const back = await state();
    if (back.dark || back.painted || back.pressed !== 'false') fail(`/: second click left ${JSON.stringify(back)}`);
    await page.evaluate(() => localStorage.clear());
    if (errors.length > 0) fail(`/: script errors ${errors.join('; ')}`);
    console.log('  /: toggle switches to dark, survives a reload, and switches back');
  });
}

/**
 * Site spec section 7: without its script the scoreboard still follows the
 * system scheme and the toggle stays hidden. Other views stay light.
 */
async function checkNoScript(browser: Browser): Promise<void> {
  for (const route of ['/', '/write-up/']) {
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
        const shouldBeDark = scheme === 'dark' && route === '/';
        const label = `${route} without script, ${scheme}`;
        if (dark !== shouldBeDark) fail(`${label}: page is ${dark ? 'dark' : 'light'}, expected ${shouldBeDark ? 'dark' : 'light'}`);
        if (toggleShown) fail(`${label}: the toggle shows with no script to drive it`);
        console.log(`  ${label}: ${dark ? 'dark' : 'light'}, toggle ${toggleShown ? 'shown' : 'hidden'}`);
      });
    }
  }
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

    const routes = ['/', ...builds.map((b) => `/builds/${b}/`), '/write-up/', '/spec/'];
    console.log('axe-core, assets, and sideways scroll');
    for (const route of routes) await checkRoute(browser, route);
    console.log('fold at 1440x900');
    await checkFold(browser);
    console.log('theme toggle');
    await checkThemeToggle(browser);
    console.log('theme without script');
    await checkNoScript(browser);
    console.log('keyboard');
    for (const route of ['/', `/builds/${builds[0]}/`, '/write-up/']) await checkKeyboard(browser, route);
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
