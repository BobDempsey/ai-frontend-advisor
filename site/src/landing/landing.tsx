/**
 * The landing page at `/`, advisor spec section 11 and site spec section 7.
 * It leads with the advisor: one headline, one question box, and the starting
 * prompts. It shows no bundle numbers and no charts; those live on
 * `/results/`. Rendered to static HTML like every other view. The only
 * scripts are the theme toggle, the chat entry, and `ask.ts`, which turns a
 * submit into a `uilc:ask` event.
 */
import { ArrowRight, ArrowUp } from 'lucide-react';
import { linkClass } from '../components/site';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { FRAMEWORK_LABEL, type SiteData } from '../data';
import { detailHref } from '../html';
import { STARTING_PROMPTS } from './prompts';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** A small count as a word, the way the prose elsewhere writes it. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function Hero({ data }: { data: SiteData }) {
  const count = countWord(data.builds.length);
  return (
    <div className="max-w-2xl min-w-0 space-y-6">
      <div className="space-y-4">
        <h1 id="landing-title" className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Find the front-end library that fits your project
        </h1>
        <p className="text-lg text-muted-foreground">
          The answers come from {count} UI libraries, each built and measured on the same screen.
        </p>
      </div>
      {/* A plain GET form: without script, a submit only reloads this page. */}
      <form id="landing-ask" action="./" method="get" className="space-y-3">
        <Card className="gap-0 py-0 shadow-sm">
          <label htmlFor="landing-question" className="sr-only">
            Ask the advisor about your project
          </label>
          <Textarea
            id="landing-question"
            name="question"
            rows={3}
            placeholder="Describe your project: the framework, what the screens do, and what matters most"
            className="min-h-28 resize-none rounded-none border-0 bg-transparent px-4 pt-4 text-base shadow-none md:text-base dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
            <p className="text-xs text-muted-foreground">Enter sends, Shift+Enter adds a line</p>
            <Button type="submit" size="lg" className="px-3">
              Ask
              <ArrowUp aria-hidden="true" data-icon="inline-end" />
            </Button>
          </div>
        </Card>
        <div role="group" aria-labelledby="prompts-label" className="space-y-2">
          <p id="prompts-label" className="text-sm font-medium">
            Or start with one of these
          </p>
          <ul role="list" className="flex flex-wrap gap-2">
            {STARTING_PROMPTS.map((prompt) => (
              <li key={prompt} className="max-w-full">
                <Button
                  type="submit"
                  name="prompt"
                  value={prompt}
                  variant="outline"
                  className="landing-prompt h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal"
                >
                  {prompt}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </form>
      <p className="landing-fallback text-sm text-muted-foreground">
        Rather read the numbers yourself?{' '}
        <a className={linkClass} href="results/">
          See the results for all {count} builds
        </a>
        .
      </p>
    </div>
  );
}

function Sources({ data }: { data: SiteData }) {
  const sources = [
    { href: 'write-up/', title: 'The write-up', file: 'write-up/README.md', text: 'The picks by situation and the reasons behind them.' },
    { href: 'spec/', title: 'The screen spec', file: 'spec/screen-spec.md', text: 'The one screen every library had to build.' },
    {
      href: 'results/',
      title: 'The results',
      file: 'results/*.json',
      text: `One measured result file for each of the ${countWord(data.builds.length)} builds.`,
    },
  ];
  return (
    <Card aria-labelledby="sources-title" role="region" className="bg-muted/40">
      <CardHeader>
        <CardTitle>
          <h2 id="sources-title" className="text-base font-semibold">
            What the answers come from
          </h2>
        </CardTitle>
        <CardDescription>
          The advisor reads these files and nothing else. It names no overall winner, and when you describe your project
          it can order a short list of two or three against the needs you state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul role="list" className="divide-y border-y">
          {sources.map((s) => (
            <li key={s.href} className="space-y-0.5 py-3">
              <a className={linkClass} href={s.href}>
                {s.title}
              </a>
              <p className="font-mono text-xs text-muted-foreground">{s.file}</p>
              <p className="text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const STEPS = [
  { title: 'Tell it about your project', text: 'The framework, the screens you are building, and what matters most: bundle size, accessibility, or speed of work.' },
  { title: 'Get a short list', text: 'Two or three libraries in order against the needs you stated, with the need that decided the order.' },
  { title: 'Check the evidence', text: 'Every answer links to the results, the write-up, or the screen spec, so you can read the source yourself.' },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="space-y-5">
      <h2 id="how-title" className="font-heading text-xl font-semibold tracking-tight">
        How it works
      </h2>
      <ol className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="space-y-1.5 border-t-2 border-foreground pt-3">
            <p className="font-mono text-sm text-muted-foreground" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Libraries({ data }: { data: SiteData }) {
  return (
    <section aria-labelledby="libraries-title" className="space-y-4">
      <h2 id="libraries-title" className="font-heading text-xl font-semibold tracking-tight">
        The {countWord(data.builds.length)} libraries
      </h2>
      <div className="space-y-3">
        {data.groups.map((group) => (
          <div key={group.framework} className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h3 className="w-full shrink-0 text-sm font-semibold text-muted-foreground sm:w-14">{FRAMEWORK_LABEL[group.framework]}</h3>
            <ul role="list" className="flex min-w-0 flex-wrap gap-2">
              {group.builds.map((b) => (
                <li key={b.name}>
                  <a
                    href={detailHref('', b.name)}
                    className="inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium hover:bg-muted"
                  >
                    {b.roster.library}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Evidence() {
  const links = [
    { href: 'results/', title: 'Results', text: 'Every build side by side, in two groups, React and Vue.' },
    { href: 'write-up/', title: 'Write-up', text: 'The full comparison and the picks by situation.' },
    { href: 'spec/', title: 'Screen spec', text: 'What every build was held to.' },
  ];
  return (
    <section aria-labelledby="evidence-title" className="space-y-4">
      <h2 id="evidence-title" className="font-heading text-xl font-semibold tracking-tight">
        Read the evidence
      </h2>
      <ul role="list" className="divide-y border-y">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="group flex items-center justify-between gap-4 py-3 hover:bg-muted/50">
              <span>
                <span className="block font-medium underline-offset-4 group-hover:underline">{link.title}</span>
                <span className="block text-sm text-muted-foreground">{link.text}</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Landing({ data }: { data: SiteData }) {
  return (
    <div className="landing space-y-16 pb-4">
      <section
        aria-labelledby="landing-title"
        className="grid items-start gap-10 pt-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16 lg:pt-14"
      >
        <Hero data={data} />
        <Sources data={data} />
      </section>
      <HowItWorks />
      <Libraries data={data} />
      <Evidence />
    </div>
  );
}
