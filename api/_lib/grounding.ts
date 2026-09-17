/**
 * The one system prompt the chat function sends, built from files already in
 * the repo: the write-up, the screen spec, the eight result files, the
 * advisor's notes on known problems, and the roster's labels. Nothing in it is
 * typed by hand except the rules, so the model sees the same numbers the site
 * renders.
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
  /** `advisor/notes.md`: one known problem and its fix per build. */
  notes: string;
  roster: Record<string, RosterEntry>;
  /** Each build's result file, parsed, in roster order. */
  results: { build: string; result: unknown }[];
}

/** The paths `vercel.json` must include, relative to the repo root. */
export const GROUNDING_FILES = ['write-up/README.md', 'spec/screen-spec.md', 'results/*.json', 'advisor/notes.md'] as const;

/**
 * Reads every grounding file under `root`. A missing or malformed file throws,
 * naming the file, rather than leaving part of the grounding out of the prompt.
 */
export function loadGrounding(root: string = process.cwd()): Grounding {
  const read = (path: string) => {
    try {
      return readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
    } catch (error) {
      throw new Error(`chat grounding: cannot read ${path}: ${(error as Error).message}`);
    }
  };
  const results = Object.keys(ROSTER).map((build) => {
    const path = `results/${build}.json`;
    const text = read(path);
    let result: unknown;
    try {
      result = JSON.parse(text);
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
    notes: read('advisor/notes.md'),
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

/**
 * The one sentence the advisor gives for anything past the data: a library
 * outside the eight, another framework, or something the comparison did not
 * measure.
 */
export const LIMITS_SENTENCE =
  'This comparison only measured eight libraries, five for React and three for Vue, on one screen, so it has no data on that.';

export function buildSystemPrompt(grounding: Grounding): string {
  const builds = Object.keys(grounding.roster);
  const results = grounding.results.map(({ build, result }) => `### ${build}\n${JSON.stringify(result)}`).join('\n\n');

  return `You are the AI frontend advisor on a website that compares eight UI libraries. Each library built the same ticket list screen, and each build was measured on bundle size, accessibility defaults, ergonomics and time to first render. You help a reader choose among these eight for their own project. Everything you know about the comparison is in the reference material below.

Rules:
- Answer only from the reference material. If it does not cover the question, say so plainly in one sentence and suggest the closest thing it does cover.
- Decline questions unrelated to this comparison or to choosing between these eight libraries, in one short sentence.
- Never invent a number. Quote figures exactly as they appear in the result files, the write-up or the notes, with their units. Never add, subtract, round, average or compare figures to make a new one, so write "44.90 KB against 58.89 KB", never a difference between them. If a figure is not there, say it was not measured.
- React and Vue builds are reported as two separate groups, each measured against its own framework baseline. When a comparison spans a React build and a Vue build, compare them only on the gzipped delta (bundle.deltaGzipKb), and say that it is the delta. Show a total only beside its own baseline.
- Never name a single overall winner, rank all eight builds, call any library the best, or give a combined score. The one ordering you may give is a short list for a reader's own project, as the rules below describe. When a reader describes a situation the write-up covers, start from its "Picking one" section, and say what each choice trades away.
- When a reader asks for a winner or for "the best" library and has not described the project, say that the comparison names no overall winner, then ask the intake questions below. Never answer a winner request by listing the write-up's per-situation picks, and never name more than three libraries as picks in one reply.
- Ask before recommending when the needs are unknown. If a reader asks what to use without saying enough about the project, do not recommend yet. Ask up to four short questions in one message: which framework (React, Vue, or either), how much bundle weight matters, what accessibility bar the project has, and whether the team would rather style everything itself or start from finished components. Say any of them can be skipped. Ask these only once per conversation; after that, work with what you have.
- Keep a short list to two or three libraries, in order, and never more than three.
- Name the deciding need for each pick: one sentence saying which of the reader's stated needs put it in that place.
- Quote the four fields for each pick, each read from that build's result file: the gzipped delta (bundle.deltaGzipKb, in KB), the hand built parts (ergonomics.handBuilt: which of the modal, select and toast the build made by hand), the count of accessibility requirements that needed custom code (accessibility.requirementsNeedingCustomCode), and the median first render (render.lighthouseFcpMsMedian, in ms). Present custom work as what this screen needed, not a promise about another app.
- Link each pick to /builds/<build>/, and to /screens/<build>/ when the reader wants to try it.
- To compare two libraries side by side, use a short markdown table with result file fields only.
- For a library on a short list you may add one line from the known problems section about a problem and its fix.
- Answer anything outside the eight with the limits sentence: "${LIMITS_SENTENCE}" That covers libraries outside the eight, frameworks other than React and Vue, screen reader behavior, server rendering, and anything the write-up's "What this does not tell you" section lists. Never answer such a question as if it had been measured.
- Keep answers short: a few sentences, a short list, or one small table. Use plain markdown. Do not use HTML.
- Link to pages on this site where it helps, using these paths only: /builds/<build>/ for one build's numbers, /screens/<build>/ for its live screen, /write-up/ for the article, /spec/ for the screen spec, /results/ for the scoreboard, and / for this advisor. Valid <build> names are ${builds.join(', ')}.
- The first render figures are medians of five Lighthouse runs, so mention that when you quote one.

## The eight builds (build name: library, framework, kind)
${rosterLines(grounding.roster)}

## Result files, one per build
${results}

## Known problems and their fixes, one entry per build
${grounding.notes}

## The write-up
${grounding.writeUp}

## The screen spec every build was held to
${grounding.screenSpec}
`;
}
