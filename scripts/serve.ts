/**
 * Serves one build's `dist` folder in this process, and checks the served
 * page is actually that build's. Shared by `scripts/lighthouse.ts` and
 * `scripts/screenshots.ts`, both of which need a static build up in a real
 * browser and neither of which should carry its own copy of the stale-server
 * guard below.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Only served in `directories` mode, so the two build callers see no change. */
const SITE_CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

export interface ServeOptions {
  /**
   * Serve a multi-page static site, `site/dist`, rather than one app: a path
   * ending in `/` gets that folder's `index.html`, with no SPA fallback. Off by
   * default, which is what `lighthouse.ts` and `screenshots.ts` rely on.
   */
  directories?: boolean;
}

/**
 * Serves one `dist` folder in this process rather than shelling out to
 * `vite preview`. A child process that outlives its kill keeps the port, and
 * the next build then measures the previous build's screen while reporting the
 * new build's name. An in-process server closes when this script says so.
 *
 * It gzips what it serves, because every static host does and because the
 * bundle number this comparison publishes is gzipped. Serving the raw bytes
 * under Lighthouse's throttling charges each library for compressible weight it
 * would never ship, and charges the biggest bundles most.
 */
export function serve(distDir: string, port: number, options: ServeOptions = {}): Promise<Server> {
  const types = options.directories ? { ...CONTENT_TYPES, ...SITE_CONTENT_TYPES } : CONTENT_TYPES;
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const decoded = decodeURIComponent(path).replace(/^\/+/, '');
    // Anything without an extension is a route, so it gets the SPA shell.
    // A multi-page folder instead answers a trailing slash with that folder's
    // own index.html, and anything else without an extension is a 404.
    const relative = options.directories
      ? path.endsWith('/')
        ? `${decoded}index.html`
        : decoded
      : extname(path) === ''
        ? 'index.html'
        : decoded;
    const file = join(distDir, normalize(relative));
    const missing = !existsSync(file) || (options.directories === true && !statSync(file).isFile());
    if (!file.startsWith(distDir + sep) || missing) {
      res.writeHead(404).end('not found');
      return;
    }
    const type = types[extname(file)] ?? 'application/octet-stream';
    const gzip = (req.headers['accept-encoding'] ?? '').includes('gzip');
    const body = readFileSync(file);
    res.writeHead(200, gzip ? { 'content-type': type, 'content-encoding': 'gzip' } : { 'content-type': type });
    res.end(gzip ? gzipSync(body) : body);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Reads the served title back and compares it to the one in the build's own
 * `dist/index.html`. Every build titles its page after its library, so this
 * catches a stale server holding the port before runs are spent on the wrong
 * screen. That is the bug the in-process server above removed, and this is
 * the check that would have caught it.
 */
export async function assertServingBuild(url: string, distDir: string): Promise<void> {
  const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
  const expected = titleOf(readFileSync(join(distDir, 'index.html'), 'utf8'));
  const served = titleOf(await (await fetch(url)).text());
  if (served !== expected) throw new Error(`${url} served "${served}", expected "${expected}"`);
}
