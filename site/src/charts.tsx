/**
 * Horizontal bars in inline SVG, one build against the other seven on a
 * shared scale. Site spec section 8. Every bar sits next to its figure printed
 * as text, and the SVG is hidden from assistive technology, so the bar is never
 * the only carrier of a number.
 *
 * Color carries framework and nothing else: React is `--chart-1`, Vue is
 * `--chart-2`. The only other visual signal, the over budget marker, is a
 * dashed outline and is always stated in words.
 */
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { KindBadge, OverBudget, SectionHeading, linkClass } from './components/site';
import { FRAMEWORK_LABEL, type Build, type Framework, type SiteData } from './data';
import { budgetText, detailHref, handBuiltCount, kb, ms } from './html';

interface Series {
  value: (b: Build) => number;
  text: (b: Build) => string;
}

interface ChartSpec {
  id: string;
  title: string;
  note: ReactNode;
  primary: Series;
  /** Drawn lighter, behind the primary bar, on the same scale. */
  secondary?: Series;
  /** A vertical line on the scale, with its label. */
  line?: { at: number; label: string };
  /** Lets a chart fix its own scale, for counts out of a known total. */
  max?: number;
}

const VIEW_W = 400;
const VIEW_H = 18;

const FILL: Record<Framework, { bar: string; back: string; swatch: string }> = {
  react: { bar: 'fill-chart-1', back: 'fill-chart-1/30', swatch: 'bg-chart-1' },
  vue: { bar: 'fill-chart-2', back: 'fill-chart-2/30', swatch: 'bg-chart-2' },
};

function x(value: number, max: number): number {
  return max > 0 ? (value / max) * VIEW_W : 0;
}

function BarSvg({ build, spec, max, overBudget }: { build: Build; spec: ChartSpec; max: number; overBudget: boolean }) {
  const fill = FILL[build.roster.framework];
  const back = spec.secondary ? x(spec.secondary.value(build), max) : 0;
  const from = spec.line ? x(spec.line.at, max) : 0;
  const lx = spec.line ? x(spec.line.at, max).toFixed(2) : '0';
  return (
    <svg
      className="block h-[18px] w-full"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {spec.secondary ? <rect className={fill.back} x="0" y="2" width={back.toFixed(2)} height={VIEW_H - 4} rx="1" /> : null}
      {spec.secondary && overBudget && spec.line ? (
        <rect
          className="fill-none stroke-foreground"
          x={from.toFixed(2)}
          y="2.5"
          width={(back - from).toFixed(2)}
          height={VIEW_H - 5}
          strokeWidth="2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <rect className={fill.bar} x="0" y="5" width={x(spec.primary.value(build), max).toFixed(2)} height={VIEW_H - 10} rx="1" />
      {spec.line ? (
        <line className="stroke-foreground" x1={lx} x2={lx} y1="0" y2={VIEW_H} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  );
}

const ROW_GRID = 'grid grid-cols-2 items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(9rem,13rem)_minmax(100px,1fr)_minmax(8rem,auto)]';

function Chart({ data, spec, rel, highlight }: { data: SiteData; spec: ChartSpec; rel: string; highlight: string | undefined }) {
  const values = data.builds.flatMap((b) => [spec.primary.value(b), spec.secondary?.value(b) ?? 0]);
  const max = spec.max ?? Math.max(...values, spec.line?.at ?? 0);

  return (
    <Card id={spec.id} role="figure" aria-labelledby={`${spec.id}-title`} className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h4 id={`${spec.id}-title`} className="text-base font-semibold">
            {spec.title}
          </h4>
        </CardTitle>
        <CardDescription className="max-w-[72ch]">{spec.note}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {spec.line ? (
          <div className={`${ROW_GRID} text-xs text-muted-foreground`} aria-hidden="true">
            <span className="hidden md:block" />
            <span className="relative h-4">
              <span className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((spec.line.at / max) * 100).toFixed(2)}%` }}>
                {spec.line.label}
              </span>
            </span>
            <span className="hidden md:block" />
          </div>
        ) : null}
        {data.groups.map((group) => (
          <div key={group.framework}>
            <h5 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span className={`inline-block size-2.5 rounded-sm ${FILL[group.framework].swatch}`} aria-hidden="true" />
              {FRAMEWORK_LABEL[group.framework]}
            </h5>
            <ul className="space-y-0.5" role="list">
              {group.builds.map((b) => {
                const current = b.name === highlight;
                const over = Boolean(spec.line) && b.result.bundle.overBudget;
                const text = [spec.primary.text(b), spec.secondary?.text(b)].filter(Boolean).join(', ');
                return (
                  <li
                    key={b.name}
                    className={`${ROW_GRID} rounded-md px-2 py-1 text-sm ${current ? 'bg-muted ring-1 ring-foreground/40' : ''}`}
                  >
                    <span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
                      {current ? (
                        <>
                          <strong className="font-semibold">{b.roster.library}</strong>
                          <span className="text-muted-foreground">(this build)</span>
                        </>
                      ) : (
                        <a className={linkClass} href={detailHref(rel, b.name)}>
                          {b.roster.library}
                        </a>
                      )}
                      <KindBadge build={b} />
                    </span>
                    <BarSvg build={b} spec={spec} max={max} overBudget={over} />
                    <span className="tabular-nums">
                      {text}
                      {over ? (
                        <>
                          {' '}
                          <OverBudget>over budget</OverBudget>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Legend({ budgetKb }: { budgetKb: number }) {
  const item = 'flex items-center gap-2';
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" role="list">
      <li className={item}>
        <span className="inline-block h-3 w-6 rounded-sm bg-chart-1" aria-hidden="true" />
        React
      </li>
      <li className={item}>
        <span className="inline-block h-3 w-6 rounded-sm bg-chart-2" aria-hidden="true" />
        Vue
      </li>
      <li className={item}>
        <span className="inline-block h-3 w-6 rounded-sm bg-linear-to-r from-chart-1/30 from-50% to-chart-2/30 to-50%" aria-hidden="true" />
        Lighter bar behind: total
      </li>
      <li className={item}>
        <span className="mx-2.5 inline-block h-4 w-0.5 bg-foreground" aria-hidden="true" />
        Vertical line: {budgetText(budgetKb)} budget
      </li>
      <li className={item}>
        <span className="inline-block h-3 w-6 rounded-sm border-2 border-dashed border-foreground" aria-hidden="true" />
        Dashed outline: over budget
      </li>
    </ul>
  );
}

function Category({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="space-y-3">
      <h3 className="font-heading text-lg font-semibold tracking-tight">{title}</h3>
      <div className={wide ? 'grid gap-4' : 'grid gap-4 xl:grid-cols-2'}>{children}</div>
    </div>
  );
}

/**
 * The four categories of screen spec section 10, as bars. Every chart lists
 * React and Vue as separate groups, each in delta order, so no chart ranks all
 * eight builds on anything.
 */
export function CategoryCharts({
  data,
  rel,
  renderNote,
  highlight,
}: {
  data: SiteData;
  rel: string;
  renderNote: string;
  highlight?: string;
}) {
  const budget = data.budgetKb;
  const handOf = Math.max(...data.builds.map((b) => handBuiltCount(b).of));
  const props = { data, rel, highlight };
  return (
    <section className="mt-12 space-y-6" aria-labelledby="charts-title">
      <div className="space-y-2">
        <SectionHeading id="charts-title">The four categories as bars</SectionHeading>
        <p className="max-w-[72ch] text-muted-foreground">
          Each bar is one build against the other seven on a shared scale, with the figure printed beside it. Color marks
          the framework and nothing else. React and Vue stay in separate groups, each ordered by delta.
        </p>
        <Legend budgetKb={budget} />
      </div>
      <Category title="Bundle size" wide>
        <Chart
          {...props}
          spec={{
            id: 'chart-bundle',
            title: 'Bundle size, gzipped',
            note: `The darker bar is the delta, the build's total minus its framework baseline, and it is the only number compared across React and Vue. The lighter bar behind it is the total. The ${budgetText(budget)} budget applies to the total and is drawn on that scale.`,
            primary: { value: (b) => b.result.bundle.deltaGzipKb, text: (b) => `${kb(b.result.bundle.deltaGzipKb)} delta` },
            secondary: { value: (b) => b.result.bundle.totalGzipKb, text: (b) => `${kb(b.result.bundle.totalGzipKb)} total` },
            line: { at: budget, label: `${budgetText(budget)} budget` },
          }}
        />
      </Category>
      <Category title="Accessibility defaults">
        <Chart
          {...props}
          spec={{
            id: 'chart-custom',
            title: 'Accessibility requirements needing custom code',
            note: 'How many of the screen spec section 9 requirements the library did not supply, so the build wrote them.',
            primary: {
              value: (b) => b.result.accessibility.requirementsNeedingCustomCode,
              text: (b) => String(b.result.accessibility.requirementsNeedingCustomCode),
            },
          }}
        />
        <Chart
          {...props}
          spec={{
            id: 'chart-axe',
            title: 'axe-core violations before fixes',
            note: 'Serious and critical violations found before any manual fix.',
            primary: {
              value: (b) => b.result.accessibility.axeViolationsBeforeFixes,
              text: (b) => String(b.result.accessibility.axeViolationsBeforeFixes),
            },
          }}
        />
      </Category>
      <Category title="Ergonomics">
        <Chart
          {...props}
          spec={{
            id: 'chart-lines',
            title: 'Lines of application code',
            note: 'Counted, not judged. Assembly kits leave more of the screen to the app, so a higher count is the expected trade.',
            primary: { value: (b) => b.result.ergonomics.linesOfAppCode, text: (b) => `${b.result.ergonomics.linesOfAppCode} lines` },
          }}
        />
        <Chart
          {...props}
          spec={{
            id: 'chart-hand',
            title: 'Hand built parts: modal, select, and toast',
            note: 'How many of the modal, select, and toast the build wrote itself rather than taking from the library. Assembly kits are labeled, since a higher count is the trade they make.',
            primary: {
              value: (b) => handBuiltCount(b).built,
              text: (b) => `${handBuiltCount(b).built} of ${handBuiltCount(b).of} hand built`,
            },
            max: handOf,
          }}
        />
      </Category>
      <Category title="Time to first render" wide>
        <Chart
          {...props}
          spec={{
            id: 'chart-render',
            title: 'Median first contentful paint',
            note: renderNote,
            primary: {
              value: (b) => b.result.render.lighthouseFcpMsMedian,
              text: (b) => `${ms(b.result.render.lighthouseFcpMsMedian)} median`,
            },
          }}
        />
      </Category>
    </section>
  );
}
