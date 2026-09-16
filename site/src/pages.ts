/**
 * The four views of site spec section 7, rendered to HTML strings at build
 * time. Each page is its own static file; there is no client side routing and
 * no script on any page.
 */
import { categoryCharts } from './charts';
import { FRAMEWORK_LABEL, SCHEMA, SHOT_WIDTHS, type Build, type SiteData } from './data';
import type { BuildResult } from '@uilc/harness';
import {
  REPO_URL,
  budgetText,
  detailHref,
  esc,
  frameworkLabel,
  handBuiltCount,
  kb,
  kindTag,
  ms,
  renderCaveat,
  screenHref,
  shotSrc,
} from './html';
import { convert } from './markdown';

export interface Page {
  /** Output path relative to the site root, always ending in index.html. */
  path: string;
  title: string;
  description: string;
  /** Which nav item is current. */
  nav: 'scoreboard' | 'write-up' | 'spec' | 'build';
  /** HTML for the main landmark. */
  body: string;
  /**
   * `auto` follows the reader's system color scheme. Site spec section 12
   * allows that on the scoreboard only; every other view stays light.
   */
  theme?: 'auto';
}

/** Relative prefix from a page's folder back to the site root. */
export function relFor(path: string): string {
  return '../'.repeat(path.split('/').length - 1);
}

export function nav(page: Page): string {
  const rel = relFor(page.path);
  const items = [
    { key: 'scoreboard', href: rel || './', text: 'Scoreboard' },
    { key: 'write-up', href: `${rel}write-up/`, text: 'Write-up' },
    { key: 'spec', href: `${rel}spec/`, text: 'Screen spec' },
  ];
  return items
    .map((item) => {
      const current = item.key === page.nav ? ' aria-current="page"' : '';
      return `<li><a href="${item.href}"${current}>${item.text}</a></li>`;
    })
    .join('');
}

function status(build: Build, budgetKb: number): string {
  const { bundle, criteria } = build.result;
  const total = criteria.passed + criteria.failed;
  const budgetLine = bundle.overBudget
    ? `<p class="status status-over"><strong>Over the ${esc(budgetText(budgetKb))} budget:</strong> ${esc(kb(bundle.totalGzipKb))} total, ${esc(kb(bundle.totalGzipKb - budgetKb))} over.</p>`
    : `<p class="status">Within the ${esc(budgetText(budgetKb))} budget: ${esc(kb(bundle.totalGzipKb))} total.</p>`;
  const failed =
    criteria.failedNumbers.length > 0 ? ` Failed criteria: ${criteria.failedNumbers.map((n) => esc(n)).join(', ')}.` : '';
  return `${budgetLine}<p class="status-sub">Passes ${esc(criteria.passed)} of ${esc(total)} criteria.${failed}</p>`;
}

function scoreboardRow(build: Build, budgetKb: number): string {
  const { bundle, accessibility, render, criteria } = build.result;
  const total = criteria.passed + criteria.failed;
  const over = bundle.overBudget
    ? `<span class="over-flag">Over budget by ${esc(kb(bundle.totalGzipKb - budgetKb))}</span>`
    : `<span class="muted">within budget</span>`;
  return `<tr>
<td class="thumb"><a href="${screenHref('', build.name)}"><img src="${shotSrc(build.name, 1440)}" width="160" height="100" loading="lazy" alt="${esc(build.name)} screen at 1440px wide"><span class="vh">, open the live screen</span></a></td>
<th scope="row" class="lib"><a href="${detailHref('', build.name)}">${esc(build.roster.library)}</a><span class="sub"><code>${esc(build.name)}</code> ${kindTag(build)}</span></th>
<td class="num">${esc(kb(bundle.deltaGzipKb))}</td>
<td class="num">${esc(kb(bundle.totalGzipKb))}<br>${over}</td>
<td class="num">${esc(criteria.passed)} of ${esc(total)}</td>
<td class="num">${esc(accessibility.axeViolationsBeforeFixes)}</td>
<td class="num">${esc(accessibility.requirementsNeedingCustomCode)}</td>
<td class="num">${esc(ms(render.lighthouseFcpMsMedian))}<a class="note-ref" href="#render-note" aria-label="Note on first render">*</a></td>
</tr>`;
}

/**
 * The scoreboard's short summary. Every figure is read from the result files,
 * and nothing here names a winner or ranks all eight on anything but delta.
 */
function summary(data: SiteData): string {
  const count = data.builds.length;
  const passing = data.builds.filter((b) => b.result.criteria.failed === 0);
  const criteriaTotal = Math.max(...data.builds.map((b) => b.result.criteria.passed + b.result.criteria.failed));
  const byDelta = [...data.builds].sort((a, b) => a.result.bundle.deltaGzipKb - b.result.bundle.deltaGzipKb);
  const lightest = byDelta[0];
  const heaviest = byDelta[byDelta.length - 1];
  const over = data.builds.filter((b) => b.result.bundle.overBudget);
  const fcp = data.builds.map((b) => b.result.render.lighthouseFcpMsMedian);
  if (!lightest || !heaviest) throw new Error('the scoreboard summary needs at least one build');
  const names = (builds: Build[]) => builds.map((b) => esc(b.roster.library)).join(', ');
  const passLine =
    passing.length === count
      ? `All ${esc(count)} builds pass all ${esc(criteriaTotal)} shared criteria.`
      : `${esc(passing.length)} of ${esc(count)} builds pass all ${esc(criteriaTotal)} shared criteria.`;
  const overLine =
    over.length === 0
      ? `All ${esc(count)} fit the ${esc(budgetText(data.budgetKb))} total budget.`
      : `${esc(over.length)} of ${esc(count)} ${over.length === 1 ? 'is' : 'are'} over the ${esc(budgetText(data.budgetKb))} total budget: ${names(over)}.`;
  return `<section class="tldr" aria-labelledby="tldr-heading">
<h2 id="tldr-heading">TL;DR</h2>
<ul>
<li>${passLine}</li>
<li>Library cost over the framework baseline runs from ${esc(kb(lightest.result.bundle.deltaGzipKb))} (${esc(lightest.roster.library)}) to ${esc(kb(heaviest.result.bundle.deltaGzipKb))} (${esc(heaviest.roster.library)}), gzipped.</li>
<li>${overLine}</li>
<li>Median first render runs from ${esc(ms(Math.min(...fcp)))} to ${esc(ms(Math.max(...fcp)))}.<a class="note-ref" href="#render-note" aria-label="Note on first render">*</a></li>
<li>No winner. Assembly kits trade application code for bundle size, and suites ship more finished parts; the <a href="write-up/">write-up</a> says which fits when.</li>
</ul>
</section>`;
}

export function scoreboard(data: SiteData): Page {
  const columns = 8;
  const groups = data.groups
    .map(
      (group) => `<tbody>
<tr class="group"><th scope="rowgroup" colspan="${columns}">${esc(FRAMEWORK_LABEL[group.framework])}, ${esc(group.builds.length)} builds</th></tr>
${group.builds.map((b) => scoreboardRow(b, data.budgetKb)).join('\n')}
</tbody>`,
    )
    .join('\n');

  const body = `<h1>Scoreboard</h1>
<p class="lede">${esc(data.builds.length)} UI libraries built the same <code>/tickets</code> screen against one spec. Every figure here is read from <code>results/</code> in the repo. There is no overall score and no winner; the <a href="write-up/">write-up</a> picks per situation.</p>
${summary(data)}
<div class="table-wrap" role="region" aria-labelledby="scoreboard-caption" tabindex="0">
<table class="scoreboard">
<caption id="scoreboard-caption">The ${esc(data.builds.length)} builds in two groups, React and Vue, each ordered by gzipped delta, smallest first. The delta is the only figure compared across groups.</caption>
<thead><tr>
<th scope="col">Screen</th>
<th scope="col">Library</th>
<th scope="col" class="num">Delta, gzip</th>
<th scope="col" class="num">Total, against the ${esc(budgetText(data.budgetKb))} budget</th>
<th scope="col" class="num">Criteria passed</th>
<th scope="col" class="num">axe violations before fixes</th>
<th scope="col" class="num">Requirements needing custom code</th>
<th scope="col" class="num">Median first render</th>
</tr></thead>
${groups}
</table>
</div>
<p class="note" id="render-note">* ${renderCaveat(data.builds)}</p>
<p class="note">A screenshot opens that build's live screen. A library name opens its detail view, with both screenshots at full size. Assembly kits ship fewer finished parts by design, so their hand built counts on the detail views read as the trade they make.</p>
${categoryCharts(data, '', renderCaveat(data.builds))}`;

  return {
    path: 'index.html',
    title: 'UI library comparison',
    description: 'Eight UI libraries, one screen: bundle size, accessibility defaults, ergonomics, and first render.',
    nav: 'scoreboard',
    body,
    theme: 'auto',
  };
}

/**
 * A label for every leaf of `BuildResult`. The mapped type makes a new field
 * a compile error here until it gets a label, so the detail view keeps showing
 * every field of the result file.
 */
type Labels<T> = { readonly [K in keyof T]-?: T[K] extends readonly unknown[] ? string : T[K] extends object ? Labels<T[K]> : string };

const LABELS: Labels<BuildResult> = {
  build: 'Build',
  library: 'Library',
  framework: 'Framework',
  kind: 'Kind',
  bundle: {
    totalGzipKb: 'Total, gzipped',
    baselineGzipKb: 'Framework baseline, gzipped',
    deltaGzipKb: 'Delta, gzipped',
    overBudget: 'Over budget',
  },
  accessibility: {
    axeViolationsBeforeFixes: 'axe-core violations before fixes',
    requirementsNeedingCustomCode: 'Requirements needing custom code',
  },
  ergonomics: {
    linesOfAppCode: 'Lines of application code',
    libraryImports: 'Library imports',
    typeEscapes: 'Type escapes',
    handBuilt: { modal: 'Modal hand built', select: 'Select hand built', toast: 'Toast hand built' },
  },
  render: { lighthouseFcpMsMedian: 'Median first contentful paint', runs: 'Lighthouse runs' },
  criteria: { passed: 'Criteria passed', failed: 'Criteria failed', failedNumbers: 'Failed criterion numbers' },
};

/** One title per object section of `BuildResult`, checked complete by the type. */
const SECTION_TITLES: { readonly [K in keyof BuildResult as BuildResult[K] extends string ? never : K]: string } = {
  bundle: 'Bundle size',
  accessibility: 'Accessibility defaults',
  ergonomics: 'Ergonomics',
  render: 'Time to first render',
  criteria: 'Acceptance criteria',
};

function formatLeaf(path: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none';
  if (typeof value === 'number') {
    if (path.endsWith('Kb')) return kb(value);
    if (path.endsWith('Ms') || path.endsWith('MsMedian')) return ms(value);
  }
  return String(value);
}

function fieldRows(value: Record<string, unknown>, schema: object, labels: object, prefix: string): string[] {
  const rows: string[] = [];
  for (const key of Object.keys(schema)) {
    const rule = (schema as Record<string, unknown>)[key];
    const label = (labels as Record<string, unknown>)[key];
    const path = prefix ? `${prefix}.${key}` : key;
    const leaf = value[key];
    if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
      rows.push(...fieldRows(leaf as Record<string, unknown>, rule, label as object, path));
    } else {
      rows.push(
        `<tr><th scope="row">${esc(String(label))}<br><code>${esc(path)}</code></th><td>${esc(formatLeaf(path, leaf))}</td></tr>`,
      );
    }
  }
  return rows;
}

function allFields(build: Build): string {
  const result = build.result as unknown as Record<string, unknown>;
  const schema = SCHEMA as unknown as Record<string, unknown>;
  const labels = LABELS as unknown as Record<string, object>;
  const titles = SECTION_TITLES as Record<string, string>;
  const isSection = (key: string) => typeof schema[key] === 'object' && !Array.isArray(schema[key]);
  const keys = Object.keys(schema);
  const top = Object.fromEntries(keys.filter((k) => !isSection(k)).map((k) => [k, schema[k]]));
  const topRows = fieldRows(result, top, LABELS, '');
  const sections = keys.filter(isSection).map((key) => {
    const rows = fieldRows(result[key] as Record<string, unknown>, schema[key] as object, labels[key] as object, key);
    return `<tbody><tr class="group"><th scope="rowgroup" colspan="2">${esc(titles[key] ?? key)}</th></tr>${rows.join('')}</tbody>`;
  });
  return `<div class="table-wrap" role="region" aria-labelledby="fields-caption" tabindex="0">
<table class="fields">
<caption id="fields-caption">Every field in <code>results/${esc(build.name)}.json</code></caption>
<thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead>
<tbody>${topRows.join('')}</tbody>
${sections.join('\n')}
</table>
</div>`;
}

function handBuiltSection(build: Build): string {
  const parts = Object.entries(build.result.ergonomics.handBuilt);
  const count = handBuiltCount(build);
  const kitNote =
    build.roster.kind === 'assembly-kit'
      ? `<p>${esc(build.roster.library)} is an <strong>assembly kit</strong>. It ships building blocks rather than finished parts, so a part the kit does not provide is written in the app, and a higher hand built count is the trade it makes.</p>`
      : `<p>${esc(build.roster.library)} is a component suite.</p>`;
  return `<section aria-labelledby="hand-title">
<h2 id="hand-title">Hand built parts <span class="kind-inline">${kindTag(build)}</span></h2>
${kitNote}
<p>${esc(count.built)} of ${esc(count.of)} hand built.</p>
<ul class="parts" role="list">${parts
    .map(([part, built]) => `<li><span class="part">${esc(part)}</span> ${built ? 'hand built' : 'from the library'}</li>`)
    .join('')}</ul>
</section>`;
}

function screenshots(build: Build, rel: string): string {
  const figures = SHOT_WIDTHS.map(
    ({ width, height }) => `<figure class="shot shot-${width}">
<a href="${rel}screenshots/${esc(build.name)}-${width}.webp"><img src="${shotSrc(build.name, width)}" width="${width}" height="${height}" alt="${esc(build.name)} screen at ${width}px wide"><span class="vh">, open the image file</span></a>
<figcaption>${width}px wide viewport, ${width} by ${height}, above the fold</figcaption>
</figure>`,
  ).join('\n');
  return `<section aria-labelledby="shots-title">
<h2 id="shots-title">Screenshots</h2>
<div class="shots">${figures}</div>
</section>`;
}

export function detail(data: SiteData, build: Build): Page {
  const path = `builds/${build.name}/index.html`;
  const rel = relFor(path);
  const { render } = build.result;
  const body = `<p class="crumb"><a href="${rel || './'}">Scoreboard</a></p>
<h1>${esc(build.roster.library)}</h1>
<p class="lede"><code>${esc(build.name)}</code>, ${esc(frameworkLabel(build))}, ${kindTag(build)}</p>
${status(build, data.budgetKb)}
<ul class="actions" role="list">
<li><a href="${screenHref(rel, build.name)}">Open the live screen</a></li>
<li><a href="${REPO_URL}/tree/main/builds/${esc(build.name)}">Source folder on GitHub</a></li>
<li><a href="${REPO_URL}/blob/main/results/${esc(build.name)}.json">Result file on GitHub</a></li>
</ul>
${screenshots(build, rel)}
${handBuiltSection(build)}
<section aria-labelledby="render-title">
<h2 id="render-title">First render</h2>
<p>${esc(ms(render.lighthouseFcpMsMedian))} median first contentful paint.</p>
<p class="note" id="render-note">${renderCaveat([build])}</p>
</section>
<section aria-labelledby="fields-title">
<h2 id="fields-title">The result file</h2>
${allFields(build)}
</section>
${categoryCharts(data, rel, renderCaveat(data.builds), build.name)}`;
  return {
    path,
    title: `${build.roster.library}, UI library comparison`,
    description: `${build.roster.library} (${build.name}): every field of its result file, its screenshots, and its live screen.`,
    nav: 'build',
    body,
  };
}

function contents(toc: { id: string; text: string }[]): string {
  return `<nav class="toc" aria-labelledby="toc-title"><h2 id="toc-title">Contents</h2><ol>${toc
    .map((item) => `<li><a href="#${item.id}">${esc(item.text)}</a></li>`)
    .join('')}</ol></nav>`;
}

export function writeUp(data: SiteData): Page {
  const path = 'write-up/index.html';
  const rel = relFor(path);
  const converted = convert(data.writeUp, {
    rel,
    linkLibraries: true,
    links: {
      '../spec/screen-spec.md': `${rel}spec/`,
      '../results/': `${REPO_URL}/tree/main/results`,
    },
    afterHeading: {
      text: 'What was held fixed',
      html: `<p class="site-note">The screen spec the builds were held to is published on this site as the <a href="${rel}spec/">screen spec</a>.</p>\n`,
    },
  });
  const builds = data.groups
    .map(
      (group) =>
        `<li>${esc(FRAMEWORK_LABEL[group.framework])}: ${group.builds
          .map(
            (b) =>
              `<a href="${detailHref(rel, b.name)}">${esc(b.roster.library)}</a> (<a href="${screenHref(rel, b.name)}">live screen<span class="vh"> for ${esc(b.roster.library)}</span></a>)`,
          )
          .join(', ')}</li>`,
    )
    .join('');
  const body = `<div class="doc-layout">
<aside class="doc-side">
${contents(converted.toc)}
<nav class="builds-nav" aria-labelledby="builds-nav-title"><h2 id="builds-nav-title">The builds</h2><ul>${builds}</ul></nav>
</aside>
<article class="prose">
${converted.html}
</article>
</div>`;
  return {
    path,
    title: 'Write-up, UI library comparison',
    description: 'The write-up for the UI library comparison, converted from write-up/README.md.',
    nav: 'write-up',
    body,
  };
}

export function spec(data: SiteData): Page {
  const path = 'spec/index.html';
  const rel = relFor(path);
  const converted = convert(data.screenSpec, { rel, linkLibraries: false, links: {} });
  const body = `<div class="doc-layout">
<aside class="doc-side">${contents(converted.toc)}</aside>
<article class="prose">
<p class="site-note">This is <code>spec/screen-spec.md</code> from the repo, converted as written. The <a href="${rel}write-up/">write-up</a> reports the builds against it.</p>
${converted.html}
</article>
</div>`;
  return {
    path,
    title: 'Screen spec, UI library comparison',
    description: 'The screen spec every build was held to, converted from spec/screen-spec.md.',
    nav: 'spec',
    body,
  };
}

export function allPages(data: SiteData): Page[] {
  return [scoreboard(data), ...data.builds.map((b) => detail(data, b)), writeUp(data), spec(data)];
}
