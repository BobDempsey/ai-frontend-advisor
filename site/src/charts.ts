/**
 * Horizontal bars in inline SVG, one build against the other seven on a
 * shared scale. Site spec section 8. Every bar sits next to its figure printed
 * as text, and the SVG is hidden from assistive technology, so the bar is never
 * the only carrier of a number.
 *
 * Color carries framework and nothing else. The only other visual signal, the
 * over budget marker, is a dashed outline and is always stated in words.
 */
import { FRAMEWORK_LABEL, type Build, type SiteData } from './data';
import { budgetText, detailHref, esc, kb, kindTag, ms, handBuiltCount } from './html';

interface Series {
  value: (b: Build) => number;
  text: (b: Build) => string;
}

interface ChartSpec {
  id: string;
  title: string;
  /** HTML, already escaped. */
  note: string;
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

function x(value: number, max: number): number {
  return max > 0 ? (value / max) * VIEW_W : 0;
}

function barSvg(build: Build, spec: ChartSpec, max: number, overBudget: boolean): string {
  const fw = build.roster.framework;
  const parts: string[] = [];
  if (spec.secondary) {
    const w = x(spec.secondary.value(build), max);
    parts.push(`<rect class="bar-back fw-${fw}" x="0" y="2" width="${w.toFixed(2)}" height="${VIEW_H - 4}"/>`);
    if (overBudget && spec.line) {
      const from = x(spec.line.at, max);
      parts.push(
        `<rect class="bar-over" x="${from.toFixed(2)}" y="2.5" width="${(w - from).toFixed(2)}" height="${VIEW_H - 5}" vector-effect="non-scaling-stroke"/>`,
      );
    }
  }
  const pw = x(spec.primary.value(build), max);
  parts.push(`<rect class="bar fw-${fw}" x="0" y="5" width="${pw.toFixed(2)}" height="${VIEW_H - 10}"/>`);
  if (spec.line) {
    const lx = x(spec.line.at, max).toFixed(2);
    parts.push(`<line class="bar-line" x1="${lx}" x2="${lx}" y1="0" y2="${VIEW_H}" vector-effect="non-scaling-stroke"/>`);
  }
  return `<svg class="bar-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

function chart(data: SiteData, spec: ChartSpec, rel: string, highlight?: string): string {
  const values = data.builds.flatMap((b) => [spec.primary.value(b), spec.secondary?.value(b) ?? 0]);
  const max = spec.max ?? Math.max(...values, spec.line?.at ?? 0);

  const lineLabel = spec.line
    ? `<div class="bar-row bar-axis" aria-hidden="true"><span></span><span class="axis-track"><span class="axis-label" style="left:${((spec.line.at / max) * 100).toFixed(2)}%">${esc(spec.line.label)}</span></span><span></span></div>`
    : '';

  const groups = data.groups
    .map((group) => {
      const rows = group.builds
        .map((b) => {
          const current = b.name === highlight;
          const over = Boolean(spec.line) && b.result.bundle.overBudget;
          const name = current
            ? `<strong>${esc(b.roster.library)}</strong> <span class="this">(this build)</span>`
            : `<a href="${detailHref(rel, b.name)}">${esc(b.roster.library)}</a>`;
          const text = [spec.primary.text(b), spec.secondary?.text(b)].filter(Boolean).join(', ');
          const overText = over ? ` <span class="over">over budget</span>` : '';
          return `<li class="bar-row${current ? ' is-current' : ''}"><span class="bar-name">${name} ${kindTag(b)}</span>${barSvg(b, spec, max, over)}<span class="bar-value">${esc(text)}${overText}</span></li>`;
        })
        .join('');
      return `<h5 class="bar-group">${esc(FRAMEWORK_LABEL[group.framework])}</h5><ul class="bars" role="list">${rows}</ul>`;
    })
    .join('');

  return `<figure class="chart" id="${spec.id}" aria-labelledby="${spec.id}-title">
<figcaption><h4 id="${spec.id}-title">${esc(spec.title)}</h4><p>${spec.note}</p></figcaption>
${lineLabel}${groups}
</figure>`;
}

function legend(budgetKb: number): string {
  const items = [
    `<li><span class="swatch fw-react" aria-hidden="true"></span>React</li>`,
    `<li><span class="swatch fw-vue" aria-hidden="true"></span>Vue</li>`,
  ];
  items.push(`<li><span class="swatch swatch-back" aria-hidden="true"></span>Lighter bar behind: total</li>`);
  items.push(`<li><span class="swatch swatch-line" aria-hidden="true"></span>Vertical line: ${esc(budgetText(budgetKb))} budget</li>`);
  items.push(`<li><span class="swatch swatch-over" aria-hidden="true"></span>Dashed outline: over budget</li>`);
  return `<ul class="legend" role="list">${items.join('')}</ul>`;
}

/**
 * The four categories of screen spec section 10, as bars. Every chart lists
 * React and Vue as separate groups, each in delta order, so no chart ranks all
 * eight builds on anything.
 */
export function categoryCharts(data: SiteData, rel: string, renderNote: string, highlight?: string): string {
  const budget = data.budgetKb;
  const bundle = chart(
    data,
    {
      id: 'chart-bundle',
      title: 'Bundle size, gzipped',
      note: `The darker bar is the delta, the build's total minus its framework baseline, and it is the only number compared across React and Vue. The lighter bar behind it is the total. The ${esc(budgetText(budget))} budget applies to the total and is drawn on that scale.`,
      primary: { value: (b) => b.result.bundle.deltaGzipKb, text: (b) => `${kb(b.result.bundle.deltaGzipKb)} delta` },
      secondary: { value: (b) => b.result.bundle.totalGzipKb, text: (b) => `${kb(b.result.bundle.totalGzipKb)} total` },
      line: { at: budget, label: `${budgetText(budget)} budget` },
    },
    rel,
    highlight,
  );
  const custom = chart(
    data,
    {
      id: 'chart-custom',
      title: 'Accessibility requirements needing custom code',
      note: 'How many of the screen spec section 9 requirements the library did not supply, so the build wrote them.',
      primary: {
        value: (b) => b.result.accessibility.requirementsNeedingCustomCode,
        text: (b) => String(b.result.accessibility.requirementsNeedingCustomCode),
      },
    },
    rel,
    highlight,
  );
  const axe = chart(
    data,
    {
      id: 'chart-axe',
      title: 'axe-core violations before fixes',
      note: 'Serious and critical violations found before any manual fix.',
      primary: {
        value: (b) => b.result.accessibility.axeViolationsBeforeFixes,
        text: (b) => String(b.result.accessibility.axeViolationsBeforeFixes),
      },
    },
    rel,
    highlight,
  );
  const lines = chart(
    data,
    {
      id: 'chart-lines',
      title: 'Lines of application code',
      note: 'Counted, not judged. Assembly kits leave more of the screen to the app, so a higher count is the expected trade.',
      primary: { value: (b) => b.result.ergonomics.linesOfAppCode, text: (b) => `${b.result.ergonomics.linesOfAppCode} lines` },
    },
    rel,
    highlight,
  );
  const handOf = Math.max(...data.builds.map((b) => handBuiltCount(b).of));
  const hand = chart(
    data,
    {
      id: 'chart-hand',
      title: 'Hand built parts: modal, select, and toast',
      note: 'How many of the modal, select, and toast the build wrote itself rather than taking from the library. Assembly kits are labeled, since a higher count is the trade they make.',
      primary: {
        value: (b) => handBuiltCount(b).built,
        text: (b) => `${handBuiltCount(b).built} of ${handBuiltCount(b).of} hand built`,
      },
      max: handOf,
    },
    rel,
    highlight,
  );
  const render = chart(
    data,
    {
      id: 'chart-render',
      title: 'Median first contentful paint',
      note: renderNote,
      primary: { value: (b) => b.result.render.lighthouseFcpMsMedian, text: (b) => `${ms(b.result.render.lighthouseFcpMsMedian)} median` },
    },
    rel,
    highlight,
  );

  return `<section class="charts" aria-labelledby="charts-title">
<h2 id="charts-title">The four categories as bars</h2>
<p>Each bar is one build against the other seven on a shared scale, with the figure printed beside it. Color marks the framework and nothing else. React and Vue stay in separate groups, each ordered by delta.</p>
${legend(budget)}
<h3 class="category">Bundle size</h3>
${bundle}
<h3 class="category">Accessibility defaults</h3>
${custom}
${axe}
<h3 class="category">Ergonomics</h3>
${lines}
${hand}
<h3 class="category">Time to first render</h3>
${render}
</section>`;
}
