/**
 * Measures time to first render for one build, or all eight.
 *
 *   pnpm lighthouse --build react-shadcn
 *   pnpm lighthouse --all
 *   pnpm lighthouse --all --url https://ai-frontend-advisor.bobdempsey83.com
 *
 * With `--url`, the runs target the deployed screen at
 * `<url>/screens/<name>/` instead of a local server, which is the measurement
 * section 10 asks for once a deployed site exists. The file then also records
 * that URL, so a later local run replacing it shows up in the diff.
 *
 * Section 10 asks for Lighthouse on the static build, median of 5 runs. This
 * serves `builds/<name>/dist` and drives Lighthouse against it, then writes
 * `builds/<name>/lighthouse.json` as `{ fcpMs: number[] }`. `scripts/measure.ts`
 * reads that file and takes the median, so this script records the runs and
 * never the summary; a rescore recomputes it.
 *
 * The number is first contentful paint in milliseconds under Lighthouse's
 * mobile defaults, which throttle CPU and network. It is a relative figure for
 * comparing eight builds measured the same way on the same machine, not an
 * absolute claim about any real device. The run count and the machine belong in
 * the write-up next to it.
 *
 * `lighthouse.json` is committed for the same reason `results/` is: a rerun
 * then shows up as a diff a reader can check.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER } from './roster.js';
import { assertServingBuild, serve } from './serve.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Section 10 says median of 5. */
const RUNS = 5;

/** Away from the dev server ports in each `vite.config.ts`, so the two never collide. */
const PORT = 4180;

/** Lighthouse's own CLI entry point, run by node directly. */
const LIGHTHOUSE_CLI = join(root, 'node_modules', 'lighthouse', 'cli', 'index.js');

/**
 * One Lighthouse pass in its own Chrome, so a run never inherits the last one's
 * cache. Lighthouse runs as its CLI rather than as an import: it serialises its
 * own functions into the page, and under tsx's esbuild loader those arrive
 * carrying a `__name` helper the page does not have, so every run dies with
 * `__name is not defined`. A subprocess runs the published code untouched.
 *
 * node runs that CLI file rather than `pnpm exec lighthouse` so no shell sits in
 * between. `--chrome-flags` holds a space, and a shell splits it into a second
 * argument Lighthouse then ignores, which on a CI runner costs `--no-sandbox`
 * and the run fails with `Unable to connect to Chrome`.
 */
async function firstContentfulPaint(url: string): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'uilc-lh-'));
  const out = join(dir, 'run.json');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          LIGHTHOUSE_CLI,
          url,
          '--only-audits=first-contentful-paint',
          '--output=json',
          `--output-path=${out}`,
          '--chrome-flags=--headless=new --no-sandbox',
          '--quiet',
        ],
        { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`lighthouse exited with ${code}. ${stderr.trim()}`)),
      );
    });

    const report = JSON.parse(readFileSync(out, 'utf8')) as {
      audits: Record<string, { numericValue?: number } | undefined>;
    };
    const value = report.audits['first-contentful-paint']?.numericValue;
    if (typeof value !== 'number') throw new Error('Lighthouse returned no first-contentful-paint value');
    return Math.round(value);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runBuild(build: string, origin?: string): Promise<number[]> {
  if (!ROSTER[build]) throw new Error(`${build} is not one of the eight. Known: ${Object.keys(ROSTER).join(', ')}`);

  const dir = join(root, 'builds', build);
  const distDir = join(dir, 'dist');
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`builds/${build}/dist is missing. Run pnpm --filter @uilc/${build} build first`);
  }

  if (origin) {
    const url = `${origin.replace(/\/+$/, '')}/screens/${build}/`;
    await assertServingBuild(url, distDir);
    const fcpMs: number[] = [];
    for (let i = 0; i < RUNS; i += 1) fcpMs.push(await firstContentfulPaint(url));
    writeFileSync(join(dir, 'lighthouse.json'), `${JSON.stringify({ url, fcpMs }, null, 2)}
`, 'utf8');
    return fcpMs;
  }

  const server = await serve(distDir, PORT);
  try {
    const url = `http://localhost:${PORT}/tickets`;
    await assertServingBuild(url, distDir);
    const fcpMs: number[] = [];
    for (let i = 0; i < RUNS; i += 1) fcpMs.push(await firstContentfulPaint(url));
    writeFileSync(join(dir, 'lighthouse.json'), `${JSON.stringify({ fcpMs }, null, 2)}\n`, 'utf8');
    return fcpMs;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const flagged = args[args.indexOf('--build') + 1];
  const urlIndex = args.indexOf('--url');
  const origin = urlIndex === -1 ? undefined : args[urlIndex + 1];
  const targets = all ? Object.keys(ROSTER) : [flagged].filter((n): n is string => Boolean(n) && n !== '--all');

  if (targets.length === 0) {
    console.error('usage: tsx scripts/lighthouse.ts --build <name> | --all [--url <origin>]');
    process.exit(1);
  }

  let failed = 0;
  for (const build of targets) {
    try {
      const fcpMs = await runBuild(build, origin);
      console.log(`${build}: ${median(fcpMs)} ms median FCP over ${fcpMs.length} runs (${fcpMs.join(', ')})`);
    } catch (error) {
      failed += 1;
      console.error(`${build}: ${(error as Error).message}`);
    }
  }

  if (failed > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
