/**
 * Builds the eight live screens for the results site and copies them into
 * `site/dist/screens/<build>/`. spec/site-spec.md section 6.
 *
 *   pnpm site:build
 *   pnpm site:screens
 *
 * Each build is built a second time with its base passed on the command line,
 * so no build's committed `vite.config.ts` moves:
 *
 *   pnpm --filter @uilc/<build> build --base=/screens/<build>/ --outDir dist-site
 *
 * `--outDir dist-site` keeps this away from `dist/`, which is what
 * `scripts/measure.ts` reads, so a screens build can never overwrite the
 * artifact a bundle number came from. `dist-site/` is gitignored.
 *
 * Runs after `site:build`, which empties `site/dist`, and never inside it.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER } from './roster.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const siteDist = join(root, 'site', 'dist');

/** The same fixture chunk pattern `scripts/measure.ts` uses. */
const FIXTURE_CHUNK = /^(tickets|data)-[A-Za-z0-9_-]+\.js$/;

function buildScreen(build: string): void {
  const base = `/screens/${build}/`;
  console.log(`\n${build}: building with base ${base}`);
  // One command string through a shell: pnpm is a .cmd shim on Windows, which
  // only a shell can start, and every part of the string comes from the roster.
  const command = `pnpm --filter @uilc/${build} build --base=${base} --outDir dist-site`;
  const result = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`${build}: screens build failed with exit code ${result.status}`);

  const out = join(root, 'builds', build, 'dist-site');
  const index = join(out, 'index.html');
  if (!existsSync(index)) throw new Error(`${build}: builds/${build}/dist-site/index.html was not written`);

  // The screen is the real application, so its asset URLs must carry the
  // base, and the fixture must still load as its own chunk.
  if (!readFileSync(index, 'utf8').includes(`${base}assets/`)) {
    throw new Error(`${build}: dist-site/index.html does not reference ${base}assets/, so the base was not applied`);
  }
  const assets = readdirSync(join(out, 'assets'));
  if (!assets.some((f) => FIXTURE_CHUNK.test(f))) {
    throw new Error(`${build}: no separate fixture chunk in dist-site/assets`);
  }

  const target = join(siteDist, 'screens', build);
  rmSync(target, { recursive: true, force: true });
  cpSync(out, target, { recursive: true });
  console.log(`${build}: copied to site/dist/screens/${build}/`);
}

function main(): void {
  if (!existsSync(join(siteDist, 'index.html'))) {
    throw new Error('site/dist/index.html is missing. Run pnpm site:build first.');
  }
  for (const build of Object.keys(ROSTER)) buildScreen(build);
  console.log(`\n${Object.keys(ROSTER).length} screens in site/dist/screens/`);
}

main();
