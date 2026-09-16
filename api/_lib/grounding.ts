/**
 * The one system prompt the chat function sends, built from files already in
 * the repo: the write-up, the screen spec, the eight result files, and the
 * roster's labels. Nothing in it is typed by hand except the rules, so the
 * model sees the same numbers the site renders.
 *
 * The files are read from the working directory. On Vercel that is the
 * function's root, and `vercel.json` lists these files under `includeFiles`
 * so they ship with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER, type RosterEntry } from '../../scripts/roster';

export interface Grounding {
  writeUp: string;
  screenSpec: string;
  roster: Record<string, RosterEntry>;
  /** Each build's result file, parsed, in roster order. */
  results: { build: string; result: unknown }[];
}

/** The paths `vercel.json` must include, relative to the repo root. */
export const GROUNDING_FILES = ['write-up/README.md', 'spec/screen-spec.md', 'results/*.json'] as const;

/**
 * Reads every grounding file under `root`. A missing or malformed result file
 * throws, naming the file, rather than leaving a build out of the prompt.
 */
export function loadGrounding(root: string = process.cwd()): Grounding {
  const read = (path: string) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
  const results = Object.keys(ROSTER).map((build) => {
    const path = `results/${build}.json`;
    let result: unknown;
    try {
      result = JSON.parse(read(path));
    } catch (error) {
      throw new Error(`chat grounding: cannot read ${path}: ${(error as Error).message}`);
    }
    if (typeof result !== 'object' || result === null || (result as { build?: unknown }).build !== build) {
      throw new Error(`chat grounding: ${path} is not the result file for ${build}`);
    }
    return { build, result };
  });
  return {
    writeUp: read('write-up/README.md'),
    screenSpec: read('spec/screen-spec.md'),
    roster: ROSTER,
    results,
  };
}

const FRAMEWORK: Record<RosterEntry['framework'], string> = { react: 'React', vue: 'Vue' };
const KIND: Record<RosterEntry['kind'], string> = { suite: 'component suite', 'assembly-kit': 'assembly kit' };

function rosterLines(roster: Record<string, RosterEntry>): string {
  return Object.entries(roster)
    .map(([build, entry]) => `- ${build}: ${entry.library}, ${FRAMEWORK[entry.framework]}, ${KIND[entry.kind]}`)
    .join('\n');
}

export function buildSystemPrompt(grounding: Grounding): string {
  const builds = Object.keys(grounding.roster);
  const results = grounding.results.map(({ build, result }) => `### ${build}\n${JSON.stringify(result)}`).join('\n\n');

  return `You answer questions from readers of a website that compares eight UI libraries. Each library built the same ticket list screen, and each build was measured on bundle size, accessibility defaults, ergonomics and time to first render. Everything you know about the comparison is in the reference material below.

Rules:
- Answer only from the reference material. If it does not cover the question, say so plainly in one sentence and suggest the closest thing it does cover.
- Decline questions unrelated to this comparison or to choosing between these eight libraries, in one short sentence.
- Never invent a number. Quote figures exactly as they appear in the result files or the write-up, with their units. If a figure is not there, say it was not measured.
- React and Vue builds are reported as two separate groups, each measured against its own framework baseline. When a comparison spans a React build and a Vue build, compare them only on the gzipped delta (bundle.deltaGzipKb), and say that it is the delta.
- Never name a single overall winner, rank all eight builds, or give a combined score. When a reader asks what to use, give the write-up's picks for the situation that fits, from its "Picking one" section, and say what the choice trades away.
- Keep answers short: a few sentences or a short list. Use plain markdown. Do not use HTML.
- Link to pages on this site where it helps, using these paths only: /builds/<build>/ for one build's numbers, /screens/<build>/ for its live screen, /write-up/ for the article, /spec/ for the screen spec, and / for the scoreboard. Valid <build> names are ${builds.join(', ')}.
- The first render figures are medians of five Lighthouse runs, so mention that when you quote one.

## The eight builds (build name: library, framework, kind)
${rosterLines(grounding.roster)}

## Result files, one per build
${results}

## The write-up
${grounding.writeUp}

## The screen spec every build was held to
${grounding.screenSpec}
`;
}
