/**
 * Figures with a unit, KB or ms, as the advisor might quote them. The notes
 * test and `scripts/advisor-eval.ts` both use these to hold every quoted
 * figure to one that is already in the grounding.
 */
import type { Grounding } from './grounding';

export type Unit = 'KB' | 'ms';

/** A figure as a comparable key: the number without trailing zeros, then the unit. */
export const figureKey = (value: number, unit: Unit): string => `${value} ${unit}`;

/**
 * Every KB or ms figure in `text`, as keys. "44.90 KB", "1378 ms" and
 * "1,378ms" all count; "44.90 KB" and "44.9 KB" give the same key.
 */
export function figuresIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(kb|ms)\b/gi)) {
    const value = Number(match[1]?.replace(/,/g, ''));
    const unit: Unit = match[2]?.toLowerCase() === 'kb' ? 'KB' : 'ms';
    if (Number.isFinite(value)) found.push(figureKey(value, unit));
  }
  return found;
}

/**
 * The figures a result file carries: every numeric field whose name ends in
 * `Kb` is a KB figure and every one ending in `Ms` is an ms figure.
 */
export function figuresInResult(result: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'number') {
      if (/Kb$/.test(key)) found.push(figureKey(value, 'KB'));
      else if (/Ms/.test(key)) found.push(figureKey(value, 'ms'));
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(result, '');
  return found;
}

/** The figures in the result files and the write-up, the two sources the notes may quote. */
export function measuredFigures(grounding: Pick<Grounding, 'results' | 'writeUp'>): Set<string> {
  return new Set([...grounding.results.flatMap(({ result }) => figuresInResult(result)), ...figuresIn(grounding.writeUp)]);
}

/** Every figure the model may quote: the measured ones plus any in the notes and the screen spec. */
export function groundedFigures(grounding: Grounding): Set<string> {
  return new Set([...measuredFigures(grounding), ...figuresIn(grounding.notes), ...figuresIn(grounding.screenSpec)]);
}
