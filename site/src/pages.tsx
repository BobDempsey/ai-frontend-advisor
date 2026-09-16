/**
 * The four views of site spec section 7, as React components rendered to
 * static HTML at build time with `renderToStaticMarkup`. Each page is its own
 * file; there is no client side routing, React never reaches the browser, and
 * the only script is the scoreboard's theme toggle.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BuildResult } from '@uilc/harness';
import { Moon, Sun } from 'lucide-react';
import { CategoryCharts } from './charts';
import { KindBadge, OverBudget, RenderNoteRef, SectionHeading, linkClass } from './components/site';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Separator } from './components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { FRAMEWORK_LABEL, SCHEMA, SHOT_WIDTHS, type Build, type SiteData } from './data';
import {
  REPO_URL,
  budgetText,
  detailHref,
  esc,
  frameworkLabel,
  handBuiltCount,
  kb,
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
   * `auto` follows the reader's system color scheme and carries the toggle.
   * Site spec section 7 allows that on the scoreboard only; every other view
   * stays light.
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
  return renderToStaticMarkup(
    <>
      {items.map((item) => (
        <li key={item.key}>
          <a
            href={item.href}
            aria-current={item.key === page.nav ? 'page' : undefined}
            className="inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
          >
            {item.text}
          </a>
        </li>
      ))}
    </>,
  );
}

const html = (__html: string) => ({ dangerouslySetInnerHTML: { __html } });

function Lede({ children }: { children: ReactNode }) {
  return <p className="max-w-[72ch] text-base text-muted-foreground">{children}</p>;
}

function Note({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="max-w-[72ch] text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

/* Scoreboard */

function ScoreboardRow({ build, budgetKb }: { build: Build; budgetKb: number }) {
  const { bundle, accessibility, render, criteria } = build.result;
  const total = criteria.passed + criteria.failed;
  const num = 'num text-right tabular-nums';
  return (
    <TableRow>
      <TableCell className="thumb w-[176px] py-2">
        <a href={screenHref('', build.name)} className="block w-[160px] overflow-hidden rounded-md border leading-none">
          <img
            src={shotSrc(build.name, 1440)}
            width={160}
            height={100}
            loading="lazy"
            alt={`${build.name} screen at 1440px wide`}
            className="block h-[100px] w-[160px] bg-muted"
          />
          <span className="sr-only">, open the live screen</span>
        </a>
      </TableCell>
      <TableHead scope="row" className="lib h-auto min-w-40 py-2 font-normal">
        <a href={detailHref('', build.name)} className={`${linkClass} text-base`}>
          {build.roster.library}
        </a>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <code className="font-mono">{build.name}</code>
          <KindBadge build={build} />
        </span>
      </TableHead>
      <TableCell className={`${num} font-semibold`}>{kb(bundle.deltaGzipKb)}</TableCell>
      <TableCell className={num}>
        {kb(bundle.totalGzipKb)}
        <br />
        {bundle.overBudget ? (
          <OverBudget>Over budget by {kb(bundle.totalGzipKb - budgetKb)}</OverBudget>
        ) : (
          <span className="text-xs text-muted-foreground">within budget</span>
        )}
      </TableCell>
      <TableCell className={num}>
        {criteria.passed} of {total}
      </TableCell>
      <TableCell className={num}>{accessibility.axeViolationsBeforeFixes}</TableCell>
      <TableCell className={num}>{accessibility.requirementsNeedingCustomCode}</TableCell>
      <TableCell className={num}>
        {ms(render.lighthouseFcpMsMedian)}
        <RenderNoteRef />
      </TableCell>
    </TableRow>
  );
}

/**
 * The write-up's per situation picks, shortened for the TL;DR. Each one names
 * the bold lead of its paragraph under "Picking one", and the build fails if
 * that paragraph is gone or no longer names every library listed here, so the
 * summary cannot drift from the article it condenses.
 */
const PICKS: { lead: string; use: string; builds: string[]; verb: string }[] = [
  { lead: 'When shipping speed matters most', use: 'Shipping fast', verb: 'take a suite:', builds: ['react-chakra', 'react-mui'] },
  { lead: 'When bundle size is the binding constraint', use: 'Smallest bundle', verb: 'take an assembly kit:', builds: ['react-headless', 'react-shadcn'] },
  { lead: "When the design system is going to diverge from the library's defaults", use: 'Custom design system', verb: '', builds: ['react-shadcn'] },
  { lead: 'On Vue, Quasar is the cheapest of the three', use: 'Vue', verb: 'lightest of the three:', builds: ['vue-quasar'] },
  { lead: 'Ant Design is hard to justify on a bundle sensitive screen', use: 'Bundle sensitive screen', verb: 'hard to justify:', builds: ['react-antd'] },
];

function Picks({ data }: { data: SiteData }) {
  const section = /^## Picking one\n([\s\S]*?)^## /m.exec(data.writeUp)?.[1];
  if (!section) throw new Error('write-up/README.md has no "Picking one" section for the scoreboard TL;DR');
  const paragraphs = section.split(/\n\s*\n/);
  return (
    <ul className="space-y-1.5" role="list">
      {PICKS.map((pick) => {
        const paragraph = paragraphs.find((p) => p.trim().startsWith(`**${pick.lead}`));
        if (!paragraph) throw new Error(`write-up "Picking one" has no paragraph starting "${pick.lead}"`);
        const builds = pick.builds.map((name) => {
          const build = data.builds.find((b) => b.name === name);
          if (!build) throw new Error(`TL;DR pick names unknown build ${name}`);
          if (!paragraph.includes(build.roster.library)) {
            throw new Error(`write-up paragraph "${pick.lead}" no longer names ${build.roster.library}`);
          }
          return build;
        });
        return (
          <li key={pick.use} className="grid gap-x-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
            <span className="font-medium">{pick.use}</span>
            <span className="text-muted-foreground">
              {pick.verb ? `${pick.verb} ` : ''}
              {builds.map((b, i) => (
                <span key={b.name}>
                  {i > 0 ? ', then ' : ''}
                  <a className={linkClass} href={detailHref('', b.name)}>
                    {b.roster.library}
                  </a>
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The scoreboard's short summary. Every figure is read from the result files,
 * and nothing here names a winner or ranks all eight on anything but delta.
 */
function Summary({ data }: { data: SiteData }) {
  const count = data.builds.length;
  const passing = data.builds.filter((b) => b.result.criteria.failed === 0);
  const criteriaTotal = Math.max(...data.builds.map((b) => b.result.criteria.passed + b.result.criteria.failed));
  const byDelta = [...data.builds].sort((a, b) => a.result.bundle.deltaGzipKb - b.result.bundle.deltaGzipKb);
  const lightest = byDelta[0];
  const heaviest = byDelta[byDelta.length - 1];
  const over = data.builds.filter((b) => b.result.bundle.overBudget);
  const fcp = data.builds.map((b) => b.result.render.lighthouseFcpMsMedian);
  if (!lightest || !heaviest) throw new Error('the scoreboard summary needs at least one build');
  const names = (builds: Build[]) => builds.map((b) => b.roster.library).join(', ');
  const passLine =
    passing.length === count
      ? `All ${count} builds pass all ${criteriaTotal} shared criteria.`
      : `${passing.length} of ${count} builds pass all ${criteriaTotal} shared criteria.`;
  const overLine =
    over.length === 0
      ? `All ${count} fit the ${budgetText(data.budgetKb)} total budget.`
      : `${over.length} of ${count} ${over.length === 1 ? 'is' : 'are'} over the ${budgetText(data.budgetKb)} total budget: ${names(over)}.`;
  return (
    <Card aria-labelledby="tldr-heading" role="region">
      <CardContent className="grid gap-x-10 gap-y-4 px-5 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 id="tldr-heading" className="font-heading text-base font-semibold">
            TL;DR
          </h2>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            <li>{passLine}</li>
            <li>
              Library cost over the framework baseline runs from {kb(lightest.result.bundle.deltaGzipKb)} (
              {lightest.roster.library}) to {kb(heaviest.result.bundle.deltaGzipKb)} ({heaviest.roster.library}), gzipped.
            </li>
            <li>{overLine}</li>
            <li>
              Median first render runs from {ms(Math.min(...fcp))} to {ms(Math.max(...fcp))}.
              <RenderNoteRef />
            </li>
          </ul>
        </div>
        <div className="space-y-2 lg:border-l lg:pl-8">
          <h3 className="font-heading text-base font-semibold">
            No single winner. The pick depends on the use case{' '}
            <span className="font-normal text-muted-foreground">
              (from the{' '}
              <a className={linkClass} href="write-up/#picking-one">
                write-up
              </a>
              )
            </span>
          </h3>
          <Picks data={data} />
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeToggle() {
  // Hidden until the inline script wires it up, so a page without script
  // shows no dead control. The icon shows the scheme a click switches to.
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="theme-toggle [&[hidden]]:hidden"
      aria-label="Dark mode"
      aria-pressed="false"
      title="Toggle dark mode"
      hidden
    >
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}

/** The navbar's theme toggle, for the scoreboard's shell only. */
export function themeToggleHtml(): string {
  return renderToStaticMarkup(<ThemeToggle />);
}

function Scoreboard({ data }: { data: SiteData }) {
  const caveat = renderCaveat(data.builds);
  const head = 'num h-auto py-2 text-right align-bottom text-xs whitespace-normal text-muted-foreground';
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Scoreboard</h1>
        <Lede>
          {data.builds.length} UI libraries built the same <Code>/tickets</Code> screen against one spec. Every figure here
          is read from <Code>results/</Code> in the repo. There is no overall score and no winner; the{' '}
          <a className={linkClass} href="write-up/">
            write-up
          </a>{' '}
          picks per situation.
        </Lede>
      </div>
      <Summary data={data} />
      <Card className="py-0">
        <Table
          className="scoreboard min-w-[1000px]"
          containerProps={{
            role: 'region',
            'aria-labelledby': 'scoreboard-caption',
            tabIndex: 0,
            className: 'rounded-xl',
          }}
        >
          <TableCaption id="scoreboard-caption" className="mt-0 caption-top px-4 pt-3 pb-2 text-left">
            The {data.builds.length} builds in two groups, React and Vue, each ordered by gzipped delta, smallest first. The
            delta is the only figure compared across groups.
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="h-auto py-2 pl-4 align-bottom text-xs text-muted-foreground">
                Screen
              </TableHead>
              <TableHead scope="col" className="h-auto py-2 align-bottom text-xs text-muted-foreground">
                Library
              </TableHead>
              <TableHead scope="col" className={head}>
                Delta, gzip
              </TableHead>
              <TableHead scope="col" className={head}>
                Total, against the {budgetText(data.budgetKb)} budget
              </TableHead>
              <TableHead scope="col" className={head}>
                Criteria passed
              </TableHead>
              <TableHead scope="col" className={head}>
                axe violations before fixes
              </TableHead>
              <TableHead scope="col" className={head}>
                Requirements needing custom code
              </TableHead>
              <TableHead scope="col" className={`${head} pr-4`}>
                Median first render
              </TableHead>
            </TableRow>
          </TableHeader>
          {data.groups.map((group) => (
            <TableBody key={group.framework} className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
              <TableRow className="group bg-muted/60 hover:bg-muted/60">
                <th scope="rowgroup" colSpan={8} className="px-4 py-1.5 text-left text-sm font-semibold">
                  {FRAMEWORK_LABEL[group.framework]}, {group.builds.length} builds
                </th>
              </TableRow>
              {group.builds.map((b) => (
                <ScoreboardRow key={b.name} build={b} budgetKb={data.budgetKb} />
              ))}
            </TableBody>
          ))}
        </Table>
      </Card>
      <div className="space-y-2">
        <Note id="render-note">* {caveat}</Note>
        <Note>
          A screenshot opens that build's live screen. A library name opens its detail view, with both screenshots at full
          size. Assembly kits ship fewer finished parts by design, so their hand built counts on the detail views read as
          the trade they make.
        </Note>
      </div>
      <CategoryCharts data={data} rel="" renderNote={caveat} />
    </div>
  );
}

export function scoreboard(data: SiteData): Page {
  return {
    path: 'index.html',
    title: 'UI library comparison',
    description: 'Eight UI libraries, one screen: bundle size, accessibility defaults, ergonomics, and first render.',
    nav: 'scoreboard',
    body: renderToStaticMarkup(<Scoreboard data={data} />),
    theme: 'auto',
  };
}

/* Build detail */

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

function fieldRows(value: Record<string, unknown>, schema: object, labels: object, prefix: string): ReactNode[] {
  const rows: ReactNode[] = [];
  for (const key of Object.keys(schema)) {
    const rule = (schema as Record<string, unknown>)[key];
    const label = (labels as Record<string, unknown>)[key];
    const path = prefix ? `${prefix}.${key}` : key;
    const leaf = value[key];
    if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
      rows.push(...fieldRows(leaf as Record<string, unknown>, rule, label as object, path));
    } else {
      rows.push(
        <TableRow key={path}>
          <TableHead scope="row" className="h-auto py-2 pl-4 font-normal whitespace-normal">
            {String(label)}
            <br />
            <code className="font-mono text-xs text-muted-foreground">{path}</code>
          </TableHead>
          <TableCell className="pr-4 tabular-nums">{formatLeaf(path, leaf)}</TableCell>
        </TableRow>,
      );
    }
  }
  return rows;
}

function AllFields({ build }: { build: Build }) {
  const result = build.result as unknown as Record<string, unknown>;
  const schema = SCHEMA as unknown as Record<string, unknown>;
  const labels = LABELS as unknown as Record<string, object>;
  const titles = SECTION_TITLES as Record<string, string>;
  const isSection = (key: string) => typeof schema[key] === 'object' && !Array.isArray(schema[key]);
  const keys = Object.keys(schema);
  const top = Object.fromEntries(keys.filter((k) => !isSection(k)).map((k) => [k, schema[k]]));
  return (
    <Card className="max-w-3xl py-0">
      <Table
        className="fields"
        containerProps={{ role: 'region', 'aria-labelledby': 'fields-caption', tabIndex: 0, className: 'rounded-xl' }}
      >
        <TableCaption id="fields-caption" className="mt-0 caption-top px-4 pt-3 pb-2 text-left">
          Every field in <Code>results/{build.name}.json</Code>
        </TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="pl-4 text-xs text-muted-foreground">
              Field
            </TableHead>
            <TableHead scope="col" className="pr-4 text-xs text-muted-foreground">
              Value
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{fieldRows(result, top, LABELS, '')}</TableBody>
        {keys.filter(isSection).map((key) => (
          <TableBody key={key}>
            <TableRow className="group bg-muted/60 hover:bg-muted/60">
              <th scope="rowgroup" colSpan={2} className="px-4 py-1.5 text-left text-sm font-semibold">
                {titles[key] ?? key}
              </th>
            </TableRow>
            {fieldRows(result[key] as Record<string, unknown>, schema[key] as object, labels[key] as object, key)}
          </TableBody>
        ))}
      </Table>
    </Card>
  );
}

function Status({ build, budgetKb }: { build: Build; budgetKb: number }) {
  const { bundle, criteria } = build.result;
  const total = criteria.passed + criteria.failed;
  return (
    <div className={bundle.overBudget ? 'border-l-4 border-dashed border-foreground pl-3' : ''}>
      {bundle.overBudget ? (
        <p className="text-lg">
          <strong className="font-semibold">Over the {budgetText(budgetKb)} budget:</strong> {kb(bundle.totalGzipKb)} total,{' '}
          {kb(bundle.totalGzipKb - budgetKb)} over.
        </p>
      ) : (
        <p className="text-lg">
          Within the {budgetText(budgetKb)} budget: {kb(bundle.totalGzipKb)} total.
        </p>
      )}
      <p className="text-muted-foreground">
        Passes {criteria.passed} of {total} criteria.
        {criteria.failedNumbers.length > 0 ? ` Failed criteria: ${criteria.failedNumbers.join(', ')}.` : ''}
      </p>
    </div>
  );
}

function Stat({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {value}
          {extra}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function HandBuilt({ build }: { build: Build }) {
  const parts = Object.entries(build.result.ergonomics.handBuilt);
  const count = handBuiltCount(build);
  return (
    <Card aria-labelledby="hand-title" role="region">
      <CardHeader>
        <CardTitle>
          <h2 id="hand-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Hand built parts <KindBadge build={build} />
          </h2>
        </CardTitle>
        <CardDescription>
          {build.roster.kind === 'assembly-kit' ? (
            <>
              {build.roster.library} is an <strong className="text-foreground">assembly kit</strong>. It ships building
              blocks rather than finished parts, so a part the kit does not provide is written in the app, and a higher hand
              built count is the trade it makes.
            </>
          ) : (
            <>{build.roster.library} is a component suite.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium">
          {count.built} of {count.of} hand built.
        </p>
        <ul className="divide-y rounded-lg border" role="list">
          {parts.map(([part, built]) => (
            <li key={part} className="flex items-center justify-between px-3 py-2">
              <span className="font-medium capitalize">{part}</span>
              <span className={built ? 'font-semibold' : 'text-muted-foreground'}>{built ? 'hand built' : 'from the library'}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Screenshots({ build, rel }: { build: Build; rel: string }) {
  return (
    <section aria-labelledby="shots-title" className="space-y-3">
      <SectionHeading id="shots-title">Screenshots</SectionHeading>
      <div className="flex flex-wrap items-start gap-4">
        {SHOT_WIDTHS.map(({ width, height }) => (
          <figure key={width} className={width === 1440 ? 'max-w-[1080px] min-w-0 flex-[1_1_640px]' : 'max-w-full flex-[0_1_375px]'}>
            <a
              href={`${rel}screenshots/${build.name}-${width}.webp`}
              className="block overflow-hidden rounded-lg border bg-muted shadow-xs"
            >
              <img
                src={shotSrc(build.name, width)}
                width={width}
                height={height}
                alt={`${build.name} screen at ${width}px wide`}
                className="block h-auto w-full"
              />
              <span className="sr-only">, open the image file</span>
            </a>
            <figcaption className="mt-2 text-sm text-muted-foreground">
              {width}px wide viewport, {width} by {height}, above the fold
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Detail({ data, build, rel }: { data: SiteData; build: Build; rel: string }) {
  const { bundle, criteria, render } = build.result;
  const action = 'inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted';
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm">
          <a className={linkClass} href={rel || './'}>
            Scoreboard
          </a>
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{build.roster.library}</h1>
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Code>{build.name}</Code>
          <span>{frameworkLabel(build)},</span>
          <KindBadge build={build} />
        </p>
        <Status build={build} budgetKb={data.budgetKb} />
        <ul className="flex flex-wrap gap-2" role="list">
          <li>
            <a className={`${action} border-primary bg-primary text-primary-foreground hover:bg-primary/85`} href={screenHref(rel, build.name)}>
              Open the live screen
            </a>
          </li>
          <li>
            <a className={action} href={`${REPO_URL}/tree/main/builds/${build.name}`}>
              Source folder on GitHub
            </a>
          </li>
          <li>
            <a className={action} href={`${REPO_URL}/blob/main/results/${build.name}.json`}>
              Result file on GitHub
            </a>
          </li>
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Delta, gzipped" value={kb(bundle.deltaGzipKb)} />
        <Stat label={`Total, against the ${budgetText(data.budgetKb)} budget`} value={kb(bundle.totalGzipKb)} />
        <Stat label="Criteria passed" value={`${criteria.passed} of ${criteria.passed + criteria.failed}`} />
        <Stat label="Median first render" value={ms(render.lighthouseFcpMsMedian)} extra={<RenderNoteRef />} />
      </div>
      <Screenshots build={build} rel={rel} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <HandBuilt build={build} />
        <Card aria-labelledby="render-title" role="region">
          <CardHeader>
            <CardTitle>
              <h2 id="render-title" className="text-lg font-semibold">
                First render
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{ms(render.lighthouseFcpMsMedian)} median first contentful paint.</p>
            <Note id="render-note">{renderCaveat([build])}</Note>
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="fields-title" className="space-y-3">
        <SectionHeading id="fields-title">The result file</SectionHeading>
        <AllFields build={build} />
      </section>
      <CategoryCharts data={data} rel={rel} renderNote={renderCaveat(data.builds)} highlight={build.name} />
    </div>
  );
}

export function detail(data: SiteData, build: Build): Page {
  const path = `builds/${build.name}/index.html`;
  return {
    path,
    title: `${build.roster.library}, UI library comparison`,
    description: `${build.roster.library} (${build.name}): every field of its result file, its screenshots, and its live screen.`,
    nav: 'build',
    body: renderToStaticMarkup(<Detail data={data} build={build} rel={relFor(path)} />),
  };
}

/* Write-up and spec */

const PROSE = [
  'prose prose-neutral max-w-[80ch] min-w-0',
  'prose-headings:scroll-mt-4 prose-headings:font-heading prose-headings:tracking-tight',
  'prose-h1:text-3xl prose-h1:font-semibold prose-h2:border-b prose-h2:pb-2',
  'prose-a:underline-offset-4',
  'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-muted prose-pre:text-foreground prose-pre:border',
  'prose-table:my-0 prose-table:text-sm prose-th:whitespace-nowrap prose-th:px-3 prose-td:px-3 prose-td:whitespace-nowrap',
].join(' ');

const SITE_NOTE = 'rounded-lg border bg-muted/60 px-4 py-3 text-[0.9375rem]';

function DocLayout({ toc, aside, children }: { toc: { id: string; text: string }[]; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-4 text-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-2">
        <nav aria-labelledby="toc-title" className="space-y-2">
          <h2 id="toc-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Contents
          </h2>
          <ol className="space-y-1 border-l">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="-ml-px block border-l border-transparent py-0.5 pl-3 text-foreground/80 hover:border-foreground hover:text-foreground"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {aside}
      </aside>
      {children}
    </div>
  );
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
      html: `<p class="${SITE_NOTE}">The screen spec the builds were held to is published on this site as the <a href="${rel}spec/">screen spec</a>.</p>\n`,
    },
  });
  const builds = (
    <>
      <Separator />
      <nav aria-labelledby="builds-nav-title" className="space-y-2">
        <h2 id="builds-nav-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          The builds
        </h2>
        {data.groups.map((group) => (
          <div key={group.framework} className="space-y-1">
            <h3 className="font-medium">{FRAMEWORK_LABEL[group.framework]}</h3>
            <ul className="space-y-1" role="list">
              {group.builds.map((b) => (
                <li key={b.name} className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <a className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline" href={detailHref(rel, b.name)}>
                    {b.roster.library}
                  </a>
                  <a className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" href={screenHref(rel, b.name)}>
                    live screen<span className="sr-only"> for {b.roster.library}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
  const body = renderToStaticMarkup(
    <DocLayout toc={converted.toc} aside={builds}>
      <article className={PROSE} {...html(converted.html)} />
    </DocLayout>,
  );
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
  const note = `<p class="${SITE_NOTE}">This is <code>spec/screen-spec.md</code> from the repo, converted as written. The <a href="${esc(rel)}write-up/">write-up</a> reports the builds against it.</p>\n`;
  const body = renderToStaticMarkup(
    <DocLayout toc={converted.toc}>
      <article className={PROSE} {...html(note + converted.html)} />
    </DocLayout>,
  );
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
