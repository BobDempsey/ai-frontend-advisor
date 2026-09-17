/**
 * `pnpm advisor:eval`: sends a fixed set of questions to the live model with
 * the real system prompt, and fails if any reply breaks the advisor's rules.
 * spec/advisor-spec.md section 9, criterion 7.
 *
 * Run it by hand, never in CI. Every question spends OpenAI credit. It reads
 * `OPENAI_API_KEY` from the environment or from `.env.local` at the repo root,
 * and never prints the key.
 *
 * Every reply is checked for these, whatever the question:
 * - a KB or ms figure that is not in the grounding,
 * - naming an overall winner or a best library.
 * Each question adds its own checks: the intake questions for a vague ask,
 * no more than three picks for a short list, and the limits sentence for a
 * library or topic outside the eight.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figuresIn, groundedFigures } from '../api/_lib/figures';
import { buildSystemPrompt, loadGrounding } from '../api/_lib/grounding';
import { trimHistory, type Turn } from '../api/_lib/limits';
import { MODEL, askModel } from '../api/_lib/model';
import { ROSTER } from './roster';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const LIBRARIES = Object.values(ROSTER).map((entry) => entry.library);

type Check = (reply: string) => string[];

interface Case {
  name: string;
  /** Advisor spec section 4 capability, or the rule the case probes. */
  covers: string;
  question: string;
  /** Earlier turns. A function gets the replies to the cases before it, by name. */
  history?: (replies: Record<string, string>) => Turn[];
  checks: Check[];
}

// Checks each case can add.

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
const NEGATION = /\b(no|not|never|none|nor|without|isn't|doesn't|don't|won't|can't|cannot)\b|n't\b/i;

/**
 * Library names that head a pick: a numbered item, a heading, or a bold lead in
 * a list item. Every library named in a line's head counts, so a line such as
 * "**Need X:** Chakra UI or Material UI" names two picks, not one.
 */
function picksIn(reply: string): string[] {
  const picks = new Set<string>();
  for (const line of reply.split('\n')) {
    const lead = /^\s*(?:\d+[.)]|#{1,4}|[-*]\s+\*\*)\s*(.*)$/.exec(line)?.[1];
    if (!lead) continue;
    const head = lead.slice(0, 60);
    const named = LIBRARIES.map((lib) => ({ lib, at: head.indexOf(lib) }))
      .filter((m) => m.at >= 0)
      .sort((a, b) => a.at - b.at);
    for (const m of named) picks.add(m.lib);
  }
  return [...picks];
}

const noUngroundedFigures =
  (grounded: Set<string>): Check =>
  (reply) =>
    [...new Set(figuresIn(reply))].filter((f) => !grounded.has(f)).map((f) => `quotes ${f}, which is not in the grounding`);

const noWinner: Check = (reply) =>
  sentences(reply)
    .filter((s) => /\b(overall winner|clear winner|the winner|best overall|the best (ui |front-?end |component )?(library|choice|option)|is the best)\b/i.test(s))
    .filter((s) => !NEGATION.test(s))
    .map((s) => `names a winner: "${s.trim()}"`);

const atMostThreePicks: Check = (reply) => {
  const picks = picksIn(reply);
  return picks.length > 3 ? [`lists ${picks.length} libraries as picks: ${picks.join(', ')}`] : [];
};

const twoOrThreePicks: Check = (reply) => {
  const picks = picksIn(reply);
  return picks.length < 2 || picks.length > 3 ? [`expected a short list of two or three picks, found ${picks.length}: ${picks.join(', ') || 'none'}`] : [];
};

const linksPicks: Check = (reply) => {
  const problems: string[] = [];
  for (const lib of picksIn(reply)) {
    const build = Object.entries(ROSTER).find(([, entry]) => entry.library === lib)?.[0];
    if (build && !reply.includes(`/builds/${build}/`)) problems.push(`does not link ${lib} to /builds/${build}/`);
  }
  return problems;
};

const quotesFourFields: Check = (reply) => {
  const problems: string[] = [];
  if (!/\d\s*KB/i.test(reply)) problems.push('quotes no KB delta');
  if (!/\d\s*ms/i.test(reply)) problems.push('quotes no ms first render');
  if (!/hand[- ]?built|by hand/i.test(reply)) problems.push('does not say what was hand built');
  if (!/accessib|a11y/i.test(reply)) problems.push('gives no accessibility custom code count');
  return problems;
};

const asksIntake: Check = (reply) => {
  const problems: string[] = [];
  const topics = {
    framework: /\b(react|vue)\b/i,
    'bundle weight': /bundle|weight|size/i,
    accessibility: /accessib/i,
    'styling or finished components': /styl|finished|ready[- ]made|prebuilt|pre-built|out of the box/i,
  };
  const missing = Object.entries(topics)
    .filter(([, pattern]) => !pattern.test(reply))
    .map(([topic]) => topic);
  if (missing.length > 1) problems.push(`the intake questions miss ${missing.join(', ')}`);
  if (!reply.includes('?')) problems.push('asks no question');
  const picks = picksIn(reply);
  if (picks.length > 0) problems.push(`recommends before asking: ${picks.join(', ')}`);
  return problems;
};

const statesLimits: Check = (reply) =>
  /no data|not (been )?measured|wasn't measured|did not measure|didn't measure|not (one )?of the eight|outside the eight|only measured|not part of|not covered|not include|doesn't cover|does not cover/i.test(reply)
    ? []
    : ['does not say the question is past the data'];

const mentions =
  (pattern: RegExp, what: string): Check =>
  (reply) =>
    pattern.test(reply) ? [] : [`does not mention ${what}`];

const noFiguresNear =
  (name: RegExp): Check =>
  (reply) =>
    sentences(reply)
      .filter((s) => name.test(s) && figuresIn(s).length > 0)
      .map((s) => `quotes a figure for a library outside the eight: "${s.trim()}"`);

const isTable: Check = (reply) => (/^\s*\|.*\|\s*$/m.test(reply) ? [] : ['has no markdown table']);

const CASES: Case[] = [
  {
    name: 'vague',
    covers: 'ask about the project first',
    question: 'What should I use?',
    checks: [asksIntake, atMostThreePicks],
  },
  {
    name: 'follow-up',
    covers: 'rank a short list, link to the evidence (criterion 10)',
    question: 'React, and our bundle budget is tight.',
    history: (replies) => [
      { role: 'user', content: 'What should I use?' },
      { role: 'assistant', content: replies.vague ?? '' },
    ],
    checks: [twoOrThreePicks, quotesFourFields, linksPicks],
  },
  {
    name: 'direct short list',
    covers: 'rank a short list, warn about known problems',
    question:
      'We are building a Vue admin dashboard. We want finished components rather than styling everything ourselves, and bundle size matters but is not critical. What would you pick?',
    checks: [twoOrThreePicks, quotesFourFields, linksPicks],
  },
  {
    name: 'trade',
    covers: 'explain a trade',
    question: 'Why is Ant Design over budget?',
    checks: [mentions(/rc-virtual-list|Table/, 'the Table and rc-virtual-list mechanism'), atMostThreePicks],
  },
  {
    name: 'compare',
    covers: 'compare two libraries side by side',
    question: 'Compare Vuetify and Quasar',
    checks: [isTable, mentions(/Vuetify/, 'Vuetify'), mentions(/Quasar/, 'Quasar'), atMostThreePicks],
  },
  {
    name: 'compare across frameworks',
    covers: 'compare two libraries side by side, React against Vue',
    question: 'Compare Headless UI and Quasar side by side.',
    checks: [mentions(/delta/i, 'that the delta is the figure compared'), atMostThreePicks],
  },
  {
    name: 'warning',
    covers: 'warn about known problems',
    question: 'I am leaning toward PrimeVue. Anything I should watch out for?',
    checks: [mentions(/dark/i, 'the dark mode default'), atMostThreePicks],
  },
  {
    name: 'custom work',
    covers: 'estimate custom work',
    question: 'How much would we have to build by hand if we used Material UI?',
    checks: [mentions(/toast/i, 'the hand built toast'), mentions(/\b3\b|three/i, 'the three requirements that needed custom code')],
  },
  {
    name: 'outside library',
    covers: 'state the limits: a library outside the eight',
    question: 'How big is the Mantine bundle compared to Chakra UI?',
    checks: [statesLimits, noFiguresNear(/Mantine/)],
  },
  {
    name: 'outside framework',
    covers: 'state the limits: another framework',
    question: 'Which of these should I use with Svelte?',
    checks: [statesLimits],
  },
  {
    name: 'outside topic',
    covers: 'state the limits: server rendering',
    question: 'Which of these libraries has the best server side rendering support?',
    checks: [statesLimits],
  },
  {
    name: 'winner bait',
    covers: 'no overall winner, no ranking of all eight',
    question: 'Just tell me the single best library overall, and rank all eight from best to worst.',
    checks: [atMostThreePicks],
  },
];

function loadKey(): void {
  if (process.env.OPENAI_API_KEY?.trim()) return;
  const file = join(repoRoot, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}

const indent = (text: string) =>
  text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

async function main(): Promise<void> {
  loadKey();
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('advisor eval: OPENAI_API_KEY is not set, and .env.local does not set it.');
    process.exit(1);
  }

  const grounding = loadGrounding(repoRoot);
  const system = buildSystemPrompt(grounding);
  const grounded = groundedFigures(grounding);
  const always: Check[] = [noUngroundedFigures(grounded), noWinner];

  console.log(`advisor eval: ${CASES.length} questions to ${MODEL}\n`);
  const replies: Record<string, string> = {};
  let failed = 0;

  for (const c of CASES) {
    const turns = [...trimHistory(c.history?.(replies) ?? []), { role: 'user' as const, content: c.question }];
    const started = Date.now();
    const answer = await askModel(system, turns);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const reply = answer.ok ? answer.text : '';
    replies[c.name] = reply;
    const problems = answer.ok ? [...always, ...c.checks].flatMap((check) => check(reply)) : [`no answer: ${answer.message}`];

    console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${c.name} (${c.covers}), ${seconds}s`);
    console.log(`  Q: ${c.question}`);
    console.log(indent(answer.ok ? answer.text : answer.message));
    for (const p of problems) console.log(`  problem: ${p}`);
    console.log('');
    if (problems.length > 0) failed += 1;
  }

  if (failed > 0) {
    console.error(`advisor eval: ${failed} of ${CASES.length} questions failed`);
    process.exit(1);
  }
  console.log(`advisor eval: all ${CASES.length} questions passed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
