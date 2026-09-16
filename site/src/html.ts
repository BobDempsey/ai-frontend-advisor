/** Small helpers shared by every page renderer. */
import { FRAMEWORK_LABEL, KIND_LABEL, type Build } from './data';

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
 * The kind label that goes wherever a hand built count or a library name in a
 * chart appears. Site spec section 8 and screen spec section 10 ask for the
 * assembly kits to be named as such so their counts read as the trade.
 */
export function kindTag(build: Build): string {
  return `<span class="kind kind-${build.roster.kind}">${esc(KIND_LABEL[build.roster.kind])}</span>`;
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
 * Site spec section 8: the local measurement caveat goes wherever a first
 * render figure appears. The run count is read from the result files.
 */
export function renderCaveat(builds: Build[]): string {
  return `First render is the median of ${esc(runsOf(builds))} Lighthouse runs, taken from a local server on one Windows machine. It should be retaken once the site is deployed somewhere with a URL, and until then this caveat is part of the number.`;
}

/** The budget as the screen spec writes it, a whole number of KB. */
export function budgetText(value: number): string {
  return `${value} KB`;
}
