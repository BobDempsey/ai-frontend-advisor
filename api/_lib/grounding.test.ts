import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ROSTER } from '../../scripts/roster';
import { buildSystemPrompt, loadGrounding } from './grounding';

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
    for (const part of ['results', 'write-up', 'spec']) cpSync(join(repoRoot, part), join(dir, part), { recursive: true });
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
    expect(() => loadGrounding(root)).toThrow();
  });
});
