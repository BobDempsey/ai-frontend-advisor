/**
 * Everything the site knows, read from files already committed. Runs at build
 * time only, inside the Vite config, so nothing here reaches the browser.
 *
 * spec/site-spec.md section 5: a missing or malformed result file fails the
 * build. The checks below throw with the file and the field, rather than let a
 * page render a blank where a number should be.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildResult } from '@uilc/harness';
import { ROSTER, type RosterEntry } from '../../scripts/roster';

export type Framework = RosterEntry['framework'];

export interface Build {
  name: string;
  roster: RosterEntry;
  result: BuildResult;
}

export interface SiteData {
  builds: Build[];
  /** The React and Vue groups, each ordered by gzipped delta, smallest first. */
  groups: { framework: Framework; builds: Build[] }[];
  budgetKb: number;
  writeUp: string;
  screenSpec: string;
}

/** The two screenshot widths from site spec section 6. */
export const SHOT_WIDTHS = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

/** Site spec section 6 caps each committed screenshot at 150 KB. */
const MAX_SHOT_BYTES = 150 * 1024;

export const FRAMEWORK_LABEL: Record<Framework, string> = { react: 'React', vue: 'Vue' };
export const KIND_LABEL: Record<RosterEntry['kind'], string> = { suite: 'suite', 'assembly-kit': 'assembly kit' };

/**
 * One rule per field of `BuildResult`. The mapped type means a field added to
 * or removed from `BuildResult` stops this file compiling until the rule
 * follows, so the check cannot drift from the shape the way a hand written
 * copy of the interface would.
 */
type Rule<V> = [V] extends [readonly number[]]
  ? 'number[]'
  : [V] extends [number]
    ? 'number'
    : [V] extends [boolean]
      ? 'boolean'
      : [V] extends [string]
        ? string extends V
          ? 'string'
          : readonly V[]
        : [V] extends [object]
          ? Shape<V>
          : never;
export type Shape<T> = { readonly [K in keyof T]-?: Rule<T[K]> };

export const SCHEMA: Shape<BuildResult> = {
  build: 'string',
  library: 'string',
  framework: ['react', 'vue'],
  kind: ['suite', 'assembly-kit'],
  bundle: { totalGzipKb: 'number', baselineGzipKb: 'number', deltaGzipKb: 'number', overBudget: 'boolean' },
  accessibility: { axeViolationsBeforeFixes: 'number', requirementsNeedingCustomCode: 'number' },
  ergonomics: {
    linesOfAppCode: 'number',
    libraryImports: 'number',
    typeEscapes: 'number',
    handBuilt: { modal: 'boolean', select: 'boolean', toast: 'boolean' },
  },
  render: { lighthouseFcpMsMedian: 'number', runs: 'number' },
  criteria: { passed: 'number', failed: 'number', failedNumbers: 'number[]' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function check(value: unknown, rule: unknown, path: string, file: string): void {
  const fail = (why: string): never => {
    throw new Error(`${file}: field "${path}" ${why}. The site will not render a blank in its place.`);
  };
  if (rule === 'string') {
    if (typeof value !== 'string' || value === '') fail('is missing or not a non-empty string');
  } else if (rule === 'number') {
    if (!isCount(value)) fail('is missing or not a finite, non-negative number');
  } else if (rule === 'boolean') {
    if (typeof value !== 'boolean') fail('is missing or not a boolean');
  } else if (rule === 'number[]') {
    if (!Array.isArray(value) || !value.every(Number.isInteger)) fail('is missing or not an array of integers');
  } else if (Array.isArray(rule)) {
    if (!rule.includes(value)) fail(`is missing or not one of ${rule.join(', ')}`);
  } else if (isRecord(rule)) {
    if (!isRecord(value)) fail('is missing or not an object');
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      if (!(key in rule)) fail(`has an unknown key "${key}" that BuildResult does not declare`);
    }
    for (const [key, inner] of Object.entries(rule)) {
      check(object[key], inner, path ? `${path}.${key}` : key, file);
    }
  }
}

function readResult(root: string, name: string, budgetKb: number): BuildResult {
  const file = `results/${name}.json`;
  const full = join(root, file);
  if (!existsSync(full)) throw new Error(`${file} is missing. Every build in scripts/roster.ts needs one.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  check(parsed, SCHEMA, '', file);
  const result = parsed as BuildResult;
  const entry = ROSTER[name];
  if (!entry) throw new Error(`${file} names a build that is not in scripts/roster.ts`);

  // Labels come from the roster. A result file that disagrees with it is a
  // stale scoring run, and the site says so rather than picking one.
  if (result.build !== name) throw new Error(`${file}: build is "${result.build}", expected "${name}"`);
  for (const key of ['library', 'framework', 'kind'] as const) {
    if (result[key] !== entry[key]) {
      throw new Error(`${file}: ${key} is "${result[key]}" but scripts/roster.ts says "${entry[key]}"`);
    }
  }
  if (result.bundle.overBudget !== result.bundle.totalGzipKb > budgetKb) {
    throw new Error(`${file}: bundle.overBudget disagrees with a ${budgetKb} KB budget and the recorded total`);
  }
  if (result.criteria.failed !== result.criteria.failedNumbers.length) {
    throw new Error(`${file}: criteria.failed does not match the length of criteria.failedNumbers`);
  }
  return result;
}

/**
 * The budget is read from the screen spec's own sentence, so the figure the
 * site prints traces to the markdown that set it.
 */
function readBudget(screenSpec: string): number {
  const match = /Budget is (\d+) KB/.exec(screenSpec);
  if (!match?.[1]) throw new Error('spec/screen-spec.md no longer states "Budget is <n> KB" in section 10');
  return Number(match[1]);
}

export function screenshotPath(build: string, width: number): string {
  return `screenshots/${build}-${width}.webp`;
}

function checkScreenshots(siteDir: string, names: string[]): void {
  const problems: string[] = [];
  for (const name of names) {
    for (const { width } of SHOT_WIDTHS) {
      const rel = `site/public/${screenshotPath(name, width)}`;
      const full = join(siteDir, 'public', screenshotPath(name, width));
      if (!existsSync(full)) problems.push(`${rel} is missing`);
      else if (statSync(full).size >= MAX_SHOT_BYTES) problems.push(`${rel} is ${statSync(full).size} bytes, over 150 KB`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Screenshots are not ready. Run pnpm screenshots and commit the output.\n  ${problems.join('\n  ')}`);
  }
}

export function loadSiteData(root: string): SiteData {
  const names = Object.keys(ROSTER);
  const onDisk = readdirSync(join(root, 'results'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
  const strays = onDisk.filter((n) => !names.includes(n));
  if (strays.length > 0) throw new Error(`results/ has files for builds not in the roster: ${strays.join(', ')}`);

  const screenSpec = readFileSync(join(root, 'spec', 'screen-spec.md'), 'utf8');
  const writeUp = readFileSync(join(root, 'write-up', 'README.md'), 'utf8');
  const budgetKb = readBudget(screenSpec);

  const builds = names.map((name) => ({
    name,
    roster: ROSTER[name] as RosterEntry,
    result: readResult(root, name, budgetKb),
  }));
  checkScreenshots(join(root, 'site'), names);

  const frameworks = [...new Set(builds.map((b) => b.roster.framework))];
  const groups = frameworks.map((framework) => ({
    framework,
    builds: builds
      .filter((b) => b.roster.framework === framework)
      .sort((a, b) => a.result.bundle.deltaGzipKb - b.result.bundle.deltaGzipKb),
  }));

  return { builds, groups, budgetKb, writeUp, screenSpec };
}
