import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../scripts/roster';
import { figureKey, figuresIn, figuresInResult, measuredFigures } from './figures';
import { loadGrounding } from './grounding';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('advisor/notes.md', () => {
  const grounding = loadGrounding(repoRoot);
  const notes = readFileSync(join(repoRoot, 'advisor', 'notes.md'), 'utf8');

  it('quotes no KB or ms figure that is not in the result files or the write-up', () => {
    const measured = measuredFigures(grounding);
    const quoted = figuresIn(notes);
    expect(quoted.length).toBeGreaterThan(0);
    const unknown = quoted.filter((figure) => !measured.has(figure));
    expect(unknown, `figures in advisor/notes.md with no source: ${unknown.join(', ')}`).toEqual([]);
  });

  it('has one entry per build, naming its library', () => {
    for (const [build, entry] of Object.entries(ROSTER)) {
      expect(notes).toContain(`## ${build} (${entry.library})`);
    }
  });

  it('has no em dash', () => {
    expect(notes).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('figuresIn and figuresInResult', () => {
  it('reads figures in the forms a reply might use', () => {
    expect(figuresIn('44.90 KB, 1,378 ms, 97.8kb and 900ms')).toEqual(['44.9 KB', '1378 ms', '97.8 KB', '900 ms']);
    expect(figuresIn('3 KBs, 12 msec, section 9')).toEqual([]);
  });

  it('reads the KB and ms fields of a result file', () => {
    const result = {
      bundle: { totalGzipKb: 278.78, deltaGzipKb: 233.87, overBudget: true },
      render: { lighthouseFcpMsMedian: 2277, runs: 5 },
    };
    expect(figuresInResult(result)).toEqual(['278.78 KB', '233.87 KB', '2277 ms']);
    expect(figureKey(44.9, 'KB')).toBe('44.9 KB');
  });

  it('tells a sourced figure from one the sources do not have', () => {
    const measured = measuredFigures(loadGrounding(repoRoot));
    expect(measured.has('233.87 KB')).toBe(true);
    expect(measured.has('247 KB')).toBe(true);
    expect(measured.has('1378 ms')).toBe(true);
    expect(measured.has('233.8 KB')).toBe(false);
    expect(measured.has('12.5 KB')).toBe(false);
  });
});
