/**
 * Small helpers shared by every page renderer. The string helpers serve the
 * shell template and the markdown converter, which write HTML directly; the
 * React pages use the plain value helpers.
 */
import { cn } from 'cn';
import { badgeVariants } from './components/ui/badge';
import { FRAMEWORK_LABEL, KIND_LABEL, type Build } from './data';
import type { RosterEntry } from '../../scripts/roster';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

export function kb(value: number): string {
  return `${value.toFixed(2)} KB`;
}

export function ms(value: number): string {
  return `${value} ms`;
}

export const REPO_URL = 'https://github.com/BobDempsey/ui-library-comparison';

/** `rel` is the relative path from a page back to the site root, `''` on the root page. */
export function detailHref(rel: string, build: string): string {
  return `${rel}builds/${build}/`;
}

export function screenHref(rel: string, build: string): string {
  return `${rel}screens/${build}/`;
}

/**
 * Screenshot URLs are written root absolute on purpose. Vite treats them as
 * files from `public/` and rewrites them to a path relative to each page,
 * because the config sets `base: './'`.
 */
export function shotSrc(build: string, width: number): string {
  return `/screenshots/${build}-${width}.webp`;
}

/**
 * The badge classes for a kind label. Assembly kits get a dashed border and
 * heavier text, so the difference never rests on color alone. Shared by the
 * React badge and the markdown converter, which writes the same span as a
 * string.
 */
export function kindClass(kind: RosterEntry['kind']): string {
  // cva does not resolve conflicts, so `cn` merges the overrides the way the
  // Badge component does.
  return kind === 'assembly-kit'
    ? cn(badgeVariants({ variant: 'secondary' }), 'border-dashed border-foreground/70 font-semibold')
    : cn(badgeVariants({ variant: 'outline' }), 'border-foreground/30 font-normal');
}

/**
 * The kind label as an HTML string, for the markdown converter. Site spec
 * section 8 and screen spec section 10 ask for the assembly kits to be named
 * as such wherever a hand built count appears.
 */
export function kindTag(kind: RosterEntry['kind']): string {
  return `<span class="${kindClass(kind)}">${esc(KIND_LABEL[kind])}</span>`;
}

export function frameworkLabel(build: Build): string {
  return FRAMEWORK_LABEL[build.roster.framework];
}

export function handBuiltCount(build: Build): { built: number; of: number } {
  const parts = Object.values(build.result.ergonomics.handBuilt);
  return { built: parts.filter(Boolean).length, of: parts.length };
}

export function runsOf(builds: Build[]): string {
  const runs = [...new Set(builds.map((b) => b.result.render.runs))];
  return runs.length === 1 ? String(runs[0]) : runs.join(' or ');
}

/**
 * Site spec section 8: the measurement caveat goes wherever a first
 * render figure appears. The run count is read from the result files.
 * Plain text; React escapes it where it renders.
 */
export function renderCaveat(builds: Build[]): string {
  return `First render is the median of ${runsOf(builds)} Lighthouse runs, taken from one Windows machine against this deployed site on 2026-09-16. The figures are relative: Lighthouse throttles to a simulated mid-tier phone, and other hardware or networks would move the milliseconds.`;
}

/** The budget as the screen spec writes it, a whole number of KB. */
export function budgetText(value: number): string {
  return `${value} KB`;
}
