/**
 * Small pieces shared by the page components. Everything here renders to
 * static markup at build time; nothing hydrates.
 */
import type { ReactNode } from 'react';
import { KIND_LABEL, type Build } from '../data';
import { kindClass } from '../html';

export function KindBadge({ build }: { build: Build }) {
  return <span className={kindClass(build.roster.kind)}>{KIND_LABEL[build.roster.kind]}</span>;
}

/** The footnote marker that points at the first render caveat. */
export function RenderNoteRef() {
  return (
    <a className="ml-0.5 px-0.5 text-foreground" href="#render-note" aria-label="Note on first render">
      *
    </a>
  );
}

/**
 * The over budget marker. A dashed border plus the words, so the state never
 * rests on color, and no red, since the build still passes its criteria.
 */
export function OverBudget({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border-2 border-dashed border-foreground px-1.5 text-xs leading-5 font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

export function SectionHeading({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`font-heading text-xl font-semibold tracking-tight ${className ?? ''}`}>
      {children}
    </h2>
  );
}

export const linkClass = 'font-medium text-foreground underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground';
