/**
 * The results site. spec/site-spec.md.
 *
 * Every view is its own static HTML file, generated here at build time from
 * `results/`, `scripts/roster.ts`, and the two markdown files. `index.html` is
 * the shell every page shares; the plugin below fills it per page with markup
 * that `src/pages.tsx` renders from React components, and hands Vite one HTML
 * entry per view, so the output is plain files with relative links. The pages
 * are rendered here and never hydrate. Two scripts ship: the scoreboard's
 * inline theme toggle, see `src/theme.ts`, and the chat island every page
 * loads from `src/chat/main.ts`, which mounts its own React root on the
 * shell's `#chat-root` and posts to `/api/chat/`. Tailwind compiles `src/styles.css` into the one
 * stylesheet. `base: './'` keeps every asset URL relative, so the folder
 * deploys to any host at any path.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { loadSiteData, type SiteData } from './src/data';
import { allPages, nav, relFor, themeToggleHtml, type Page } from './src/pages';
import { esc } from './src/html';
import { THEME_SCRIPT } from './src/theme';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatToggle } from './src/chat/toggle';

const siteDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(siteDir, '..');
const shellFile = join(siteDir, 'index.html');
/** Vite ids use forward slashes, Windows paths do not. */
const siteRoot = siteDir.replace(/\\/g, '/');
const pageKey = (id: string): string | undefined => {
  const normal = id.replace(/\\/g, '/');
  return normal.startsWith(siteRoot) ? normal.slice(siteRoot.length) : undefined;
};

const ANALYTICS_SCRIPT = [
  '<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>',
  '<script defer src="/_vercel/insights/script.js"></script>',
].join('\n');

function fill(shell: string, page: Page): string {
  const slots: Record<string, string> = {
    title: esc(page.title),
    description: esc(page.description),
    nav: nav(page),
    home: relFor(page.path) || './',
    content: page.body,
    // Only the scoreboard may turn dark, site spec section 7.
    htmlClass: page.theme === 'auto' ? 'theme-auto' : 'theme-light',
    headScript: page.theme === 'auto' ? THEME_SCRIPT : '',
    navExtra: page.theme === 'auto' ? themeToggleHtml() : '',
    // Vercel Web Analytics, site spec section 12. Vercel serves the script, so it is
    // left out of local builds, where it would 404.
    analytics: process.env.VERCEL ? ANALYTICS_SCRIPT : '',
    // Hidden until `src/chat/main.ts` runs, so a page without script shows no dead control.
    chatButton: renderToStaticMarkup(createElement(ChatToggle, { hidden: true })),
  };
  return shell.replace(/<!--site:(\w+)-->/g, (_, name: string) => {
    const value = slots[name];
    if (value === undefined) throw new Error(`site/index.html has an unknown slot "${name}"`);
    return value;
  });
}

function sitePages(): Plugin {
  let data: SiteData | undefined;
  let pages = new Map<string, Page>();
  const load = () => {
    data = loadSiteData(repoRoot);
    pages = new Map(allPages(data).map((p) => [p.path, p]));
    return pages;
  };
  const pageFor = (urlPath: string): Page | undefined => {
    const clean = urlPath.split('?')[0]?.replace(/^\/+/, '') ?? '';
    const key = clean === '' || clean.endsWith('/') ? `${clean}index.html` : clean;
    return pages.get(key);
  };

  return {
    name: 'uilc-site-pages',
    enforce: 'pre',
    config(_, env) {
      // Loading here means a bad result file fails the build before Vite
      // starts, with the file and field in the message.
      load();
      if (env.command !== 'build') return;
      const input = Object.fromEntries([...pages.keys()].map((p) => [p.replace(/\/?index\.html$/, '') || 'index', siteRoot + p]));
      return { build: { rollupOptions: { input } } };
    },
    resolveId(id) {
      const rel = pageKey(id);
      if (rel && rel !== 'index.html' && pages.has(rel)) return siteRoot + rel;
      return undefined;
    },
    load(id) {
      const rel = pageKey(id);
      if (rel && rel !== 'index.html' && pages.has(rel)) return readFileSync(shellFile, 'utf8');
      return undefined;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const page = pageFor(ctx.path);
        if (!page) throw new Error(`no site page for ${ctx.path}`);
        return fill(html, page);
      },
    },
    configureServer(server) {
      server.watcher.add([join(repoRoot, 'results'), join(repoRoot, 'write-up'), join(repoRoot, 'spec')]);
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/';
        const path = url.split('?')[0] ?? '/';
        if (!path.endsWith('/') || path === '/') return next();
        load();
        if (!pageFor(path)) return next();
        server
          .transformIndexHtml(url, readFileSync(shellFile, 'utf8'))
          .then((html) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(html);
          })
          .catch(next);
      });
    },
  };
}

/**
 * `pnpm dev` answers `/api/chat/` itself, with the same handler the Vercel
 * Function uses, so the chat works locally with no Vercel CLI. The key comes
 * from `.env.local` (or `.env`) at the repo root, read here and never exposed
 * to the browser: only `VITE_` variables reach client code.
 */
function devChat(): Plugin {
  return {
    name: 'uilc-dev-chat',
    apply: 'serve',
    async configureServer(server) {
      const env = loadEnv(server.config.mode, repoRoot, '');
      if (!process.env.OPENAI_API_KEY && env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
      if (!process.env.OPENAI_API_KEY) {
        server.config.logger.warn('OPENAI_API_KEY is not set in .env.local, so the chat will say it is not set up.');
      }
      // Loaded only by the dev server, so a site build never pulls in the OpenAI SDK.
      const [{ buildSystemPrompt, loadGrounding }, { createRateLimiter }, { createChatHandler }, { askModel }] =
        await Promise.all([
          import('../api/_lib/grounding'),
          import('../api/_lib/guard'),
          import('../api/_lib/handler'),
          import('../api/_lib/model'),
        ]);
      const handle = createChatHandler({
        ask: askModel,
        // Re-read each time, so edits to the write-up or results show up without a restart.
        systemPrompt: () => buildSystemPrompt(loadGrounding(repoRoot)),
        limiter: createRateLimiter({ limit: 60, windowMs: 10 * 60_000 }),
      });

      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (!path.startsWith('/api/chat')) return next();
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }
          const method = req.method ?? 'GET';
          const init: RequestInit = { method, headers };
          if (method !== 'GET' && method !== 'HEAD') init.body = Buffer.concat(chunks);
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, init);
          handle(request)
            .then(async (response) => {
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(Buffer.from(await response.arrayBuffer()));
            })
            .catch(next);
        });
        req.on('error', next);
      });
    },
  };
}

export default defineConfig({
  root: siteDir,
  base: './',
  appType: 'mpa',
  plugins: [sitePages(), devChat(), tailwindcss()],
  // The shadcn components import each other through `@/`, as site/tsconfig.json maps it.
  resolve: { alias: { '@': join(siteDir, 'src') } },
  server: { port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
