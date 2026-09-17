import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ROSTER } from '../../scripts/roster';
import { LIMITS_SENTENCE, buildSystemPrompt, loadGrounding } from './grounding';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('loadGrounding and buildSystemPrompt, on the real repo', () => {
  const grounding = loadGrounding(repoRoot);
  const prompt = buildSystemPrompt(grounding);

  it('reads all eight result files in roster order', () => {
    expect(grounding.results.map((r) => r.build)).toEqual(Object.keys(ROSTER));
  });

  it('carries every roster label and every build name', () => {
    for (const [build, entry] of Object.entries(ROSTER)) {
      expect(prompt).toContain(build);
      expect(prompt).toContain(entry.library);
    }
    expect(prompt).toContain('- react-shadcn: shadcn/ui, React, assembly kit');
    expect(prompt).toContain('- vue-quasar: Quasar, Vue, component suite');
  });

  it('carries each result file figure exactly as the file has it', () => {
    for (const build of Object.keys(ROSTER)) {
      const result = JSON.parse(readFileSync(join(repoRoot, 'results', `${build}.json`), 'utf8'));
      expect(prompt).toContain(JSON.stringify(result));
      expect(prompt).toContain(`"deltaGzipKb":${result.bundle.deltaGzipKb}`);
    }
  });

  it('includes the write-up and the screen spec in full', () => {
    const writeUp = readFileSync(join(repoRoot, 'write-up', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const spec = readFileSync(join(repoRoot, 'spec', 'screen-spec.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(prompt).toContain(writeUp);
    expect(prompt).toContain(spec);
    expect(prompt).toContain('## Picking one');
  });

  it('states the rules the site spec holds the chat to', () => {
    expect(prompt).toMatch(/Answer only from the reference material/);
    expect(prompt).toMatch(/Decline questions unrelated/);
    expect(prompt).toMatch(/Never invent a number/);
    expect(prompt).toMatch(/only on the gzipped delta/);
    expect(prompt).toMatch(/Never name a single overall winner/);
    expect(prompt).toMatch(/"Picking one"/);
    expect(prompt).toMatch(/Keep answers short/);
    expect(prompt).toContain('/builds/<build>/');
    expect(prompt).toContain('/screens/<build>/');
    expect(prompt).toContain('/write-up/');
    expect(prompt).toContain('/spec/');
  });

  it('states the advisor rules from advisor spec section 6', () => {
    // Ask before recommending when the needs are unknown, with the four intake questions.
    expect(prompt).toContain('Ask before recommending when the needs are unknown.');
    expect(prompt).toMatch(/Ask up to four short questions in one message: which framework \(React, Vue, or either\), how much bundle weight matters, what accessibility bar the project has, and whether the team would rather style everything itself or start from finished components\./);
    expect(prompt).toContain('Ask these only once per conversation');
    // A winner request without a project gets no winner and the intake questions, never the per-situation picks.
    expect(prompt).toContain('When a reader asks for a winner or for "the best" library and has not described the project, say that the comparison names no overall winner, then ask the intake questions below.');
    expect(prompt).toContain("Never answer a winner request by listing the write-up's per-situation picks, and never name more than three libraries as picks in one reply.");
    // Keep a short list to two or three.
    expect(prompt).toContain('Keep a short list to two or three libraries, in order, and never more than three.');
    // Name the deciding need for each pick.
    expect(prompt).toContain('Name the deciding need for each pick');
    // Quote the four fields from advisor spec section 4 for each pick.
    expect(prompt).toContain('Quote the four fields for each pick');
    for (const field of [
      'bundle.deltaGzipKb',
      'ergonomics.handBuilt',
      'accessibility.requirementsNeedingCustomCode',
      'render.lighthouseFcpMsMedian',
    ]) {
      expect(prompt.slice(prompt.indexOf('Quote the four fields for each pick'))).toContain(field);
    }
    // Answer anything outside the eight with the limits sentence.
    expect(prompt).toContain(`Answer anything outside the eight with the limits sentence: "${LIMITS_SENTENCE}"`);
    expect(prompt).toContain('Never answer such a question as if it had been measured.');
    expect(prompt).toContain('Never put a figure in a sentence that names a library, framework or topic outside the eight.');
    expect(prompt).toContain("If you quote a measured library's figures in that answer at all, give them their own sentence that names only measured libraries.");
  });

  it('allows a short list but still no winner and no ranking of all eight', () => {
    expect(prompt).toMatch(/Never name a single overall winner, rank all eight builds, call any library the best, or give a combined score\./);
    expect(prompt).toContain('never more than three');
  });

  it('links the scoreboard at /results/ and the advisor at /', () => {
    expect(prompt).toContain('/results/ for the scoreboard, and / for this advisor');
    expect(prompt).not.toMatch(/\s\/ for the scoreboard/);
    expect(prompt).toContain('Link each pick to /builds/<build>/');
  });

  it('includes advisor/notes.md in full', () => {
    const notes = readFileSync(join(repoRoot, 'advisor', 'notes.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(grounding.notes).toBe(notes);
    expect(prompt).toContain(notes);
    expect(prompt).toContain('darkModeSelector');
  });

  it('has no em dash in the rules it adds', () => {
    const rules = prompt.slice(0, prompt.indexOf('## The eight builds'));
    expect(rules).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('loadGrounding, on a broken copy', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const copy = () => {
    dir = mkdtempSync(join(tmpdir(), 'uilc-grounding-'));
    for (const part of ['results', 'write-up', 'spec', 'advisor']) cpSync(join(repoRoot, part), join(dir, part), { recursive: true });
    return dir;
  };

  it('fails loudly on a malformed result file', () => {
    const root = copy();
    writeFileSync(join(root, 'results', 'vue-quasar.json'), '{ not json');
    expect(() => loadGrounding(root)).toThrow(/results\/vue-quasar\.json/);
  });

  it('fails loudly on a result file for the wrong build', () => {
    const root = copy();
    cpSync(join(root, 'results', 'react-mui.json'), join(root, 'results', 'react-antd.json'));
    expect(() => loadGrounding(root)).toThrow(/not the result file for react-antd/);
  });

  it('fails loudly when the write-up is missing', () => {
    const root = copy();
    rmSync(join(root, 'write-up', 'README.md'));
    expect(() => loadGrounding(root)).toThrow(/write-up\/README\.md/);
  });

  it('fails loudly, naming the file, when advisor/notes.md is missing', () => {
    const root = copy();
    expect(() => loadGrounding(root)).not.toThrow();
    rmSync(join(root, 'advisor', 'notes.md'));
    expect(() => loadGrounding(root)).toThrow(/advisor\/notes\.md/);
  });

  it('fails loudly, naming the file, when a result file is missing', () => {
    const root = copy();
    rmSync(join(root, 'results', 'react-mui.json'));
    expect(() => loadGrounding(root)).toThrow(/results\/react-mui\.json/);
  });
});
