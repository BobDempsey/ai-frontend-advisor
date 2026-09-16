# Site spec: publishing the comparison

**Phase three.** Sections 1 to 15 of `screen-spec.md` are the fixed input and do not move. This document adds one thing, the site that publishes what the eight builds already produced, and it is meant to be as hard to bend as the screen spec is.

## 1. Why this exists

The comparison is finished and close to unreadable. Its numbers sit in eight JSON files, its reasoning sits in a markdown article nobody can reach without a checkout, and its eight screens run only on a machine with the repo cloned and eight dev servers up. A reader who wants to check a bundle number against the screen that produced it cannot.

The site closes that gap. One static build puts the numbers, the write-up, and the eight running screens on the same host, so every claim in the article sits one click from the thing it describes.

It is a publishing surface. It is not a ninth build, it is never scored, and no number in `results/` may change because it exists.

## 2. What the site must not disturb

These come first because a results site is the most tempting place in the repo to quietly alter a result.

- The site never writes to `results/`, `packages/`, `spec/`, or any `builds/<name>/` folder. It reads them and renders them.
- The site is not in `scripts/roster.ts` and is not measured. `scripts/measure.ts` iterates the roster, so this holds as long as nobody adds it there.
- The site never edits a build's committed `vite.config.ts`. Section 6 explains how the screens get their base path without touching one.
- The site adds no script to any build's `package.json`. The screen spec fixes the four scripts a build exposes, `dev`, `build`, `test`, and `measure`, so everything the site needs is a root script, the way `lighthouse` already is.
- The site publishes no number it did not read from a file in the repo. Nothing is typed by hand into a component. If a figure is wrong, the fix is a rescore, not an edit here.
- The site computes no composite score and names no winner. Section 10 of the screen spec settled that, and a UI is where it would come back, as a total column, a rank, or five stars.
- The two reporting groups hold. React and Vue are shown as separate groups, and the gzipped delta is the only number allowed to span them.

## 3. Stack

Vanilla TypeScript and Vite. Hand written CSS. No UI library, no component framework, no chart library.

The reason is neutrality, and it is the whole reason. A site built in one of the eight would be the scoreboard for a contest rendered in one of the entrants, and every layout choice it made would read as an endorsement. A neutral stack also keeps the ten app CI matrix meaning what it means today.

Two dependencies are allowed beyond Vite and TypeScript. A markdown to HTML converter, run at build time and never shipped to the browser, and nothing else. If a second one looks necessary, it is an owner call, not a build detail.

Charts are inline SVG and CSS, written here. Every chart on this site is a horizontal bar of one number against seven others, which does not need a library.

## 4. Where it lives

```
site/
  package.json            @uilc/site, private, not in the roster
  vite.config.ts
  index.html
  src/
  public/
```

The root `build` script filters `./builds/*` and `./baselines/*`, so `site/` stays out of it on its own. The site gets its own root scripts, `pnpm site:dev` and `pnpm site:build`, alongside `measure` and `lighthouse`.

`site/dist/` is gitignored. So is the scratch output the screens build writes, named in section 6.

## 5. What the site reads

Every view is built from files already committed. No API, no runtime fetch of anything outside the deployed output.

- `results/<build>.json`, eight files, the shape `scripts/measure.ts` writes: `bundle`, `accessibility`, `ergonomics`, `render`, and `criteria`. This is the source for every number on the site.
- `scripts/roster.ts` for each build's library name, framework, and kind. The site imports the roster rather than restating the eight names, so a label is written once.
- `write-up/README.md`, converted to HTML at build time.
- `spec/screen-spec.md`, converted the same way, so a reader can see what the builds were held to.
- `site/public/screenshots/<build>-1440.webp` and `-375.webp`, committed, produced by the step in section 6.
- `builds/<build>/dist-site/`, the screens, produced by the step in section 6.

Typing comes from `@uilc/harness`. `BuildResult` is already the shape of a result file, so the site imports that type instead of declaring its own and drifting from it.

A missing or malformed `results/<build>.json` fails the site build loudly. A results site that renders eight cards with one silently blank is worse than one that does not build.

## 6. The eight live screens, and their screenshots

Each build's production output is served under `/screens/<build>/`, linked from that build's detail view and from the write-up wherever it names a library.

The problem is the base path. The eight apps are built for `/`, and their committed Vite configs must not change. So the screens are built a second time, at publish time, with the base passed on the command line:

```
pnpm --filter @uilc/<build> build --base=/screens/<build>/ --outDir dist-site
```

Two things about that command matter. `--outDir dist-site` keeps it out of `dist/`, which is what `scripts/measure.ts` reads, so a screens build can never overwrite the artifact a bundle number came from. And because it is a flag rather than a file, nothing in the build's own config moves, and a `git diff` of `builds/` after a publish is empty.

A root script, `scripts/screens.ts`, runs that for all eight and copies each `dist-site` into `site/dist/screens/<build>/`. It runs after `site:build`, not inside it, so working on the site does not rebuild eight apps.

The screens are the real applications, with the fixture loading as its own chunk exactly as it does in a measured build. Nothing about them is trimmed for the site.

Alongside them, eight screenshots are captured and committed, because a live iframe is the wrong tool for a first impression. A reader scanning the scoreboard wants to see what Ant Design looks like next to Quasar without booting two applications, and eight embedded apps on one route is a page nobody waits for. The screenshots carry that comparison, and the live screens are what a reader clicks through to when a picture is not enough.

`scripts/screenshots.ts` captures them. It serves a build's `dist/` and drives Chrome through `puppeteer-core`, both of which the repo already has: `lighthouse` brings `puppeteer-core` and `chrome-launcher` in with it, though the root `package.json` should declare them itself rather than reaching through a transitive dependency. `serve()` and `assertServingBuild()` in `scripts/lighthouse.ts` are the same two functions this needs, the second of which already exists because a stale server on port 4180 once produced eight builds' worth of numbers from one build's screen. Move both into `scripts/serve.ts` and have the two scripts import them. Do not copy them.

Two shots per build, at the two widths the screens were already reviewed at:

```
site/public/screenshots/<build>-1440.webp    1440x900 viewport, above the fold
site/public/screenshots/<build>-375.webp      375x812 viewport, above the fold
```

WebP, viewport only rather than full page, so all sixteen share an aspect ratio and a row of thumbnails lines up. The capture waits for the table's 25 rows to paint before it shoots, since a screenshot of a loading state is worse than none.

They are committed, for the reason `results/` and `lighthouse.json` are committed: the site build then needs no browser, and whatever host it deploys to installs nothing to render them. Each file is capped at 150 KB and the capture script fails over it, which keeps sixteen images from quietly becoming a repo problem.

Recapture is manual and deliberate, run as `pnpm screenshots`. A screenshot going stale after a UI fix is a real risk and the answer is discipline, the same as it is for `results/`: any change that reaches a build's screen gets a recapture in the same commit.

## 7. The views

Four, and no more without an owner deciding.

**Scoreboard, `/`.** The landing view. The eight builds in the two reporting groups, five React and three Vue, each showing library, kind, delta, total against the 180 KB budget, criteria passed out of 18, axe violations, requirements needing custom code, and median first render. `react-antd` is marked over budget in the group it belongs to, not pulled out into a failure list. Sorting the table is fine. A default sort that ranks all eight by anything except delta is not, because that is the composite score arriving through the back door.

Each row carries its 1440px screenshot as a thumbnail in the first column, about 160px wide, `loading="lazy"`, with the build name as its `alt` text. That is a thumbnail and nothing more: it does not push the numbers below the fold, it does not become a card grid, and the eight rows still read as one table a reader can scan top to bottom. Clicking it opens the live screen. Hovering or focusing it is allowed to show a larger preview, and that preview must not be the only way to reach the full image.

Above the table, a short TL;DR summarizes the run: how many builds pass the criteria, the range of deltas with the library at each end, which builds are over budget, and the range of first render medians with its caveat. Every figure in it is computed from `results/` at build time. It names no winner.

The scoreboard, and only the scoreboard, follows the reader's system color scheme, light or dark, with no script and no toggle. Every other view, and every build screen, stays light. The dark colors meet the same contrast bar as the light ones, and framework is still the only thing color carries. Added 2026-09-16 at the owner's request.

**Build detail, `/builds/<build>/`.** One build, every field of its result file, its `handBuilt` three, its failed criterion numbers when there are any, both screenshots at full size side by side with their widths labeled, a link to its live screen, and a link to its folder on GitHub. This is the view that lets a reader check a claim, so it is the one place the pictures get room.

**Write-up, `/write-up/`.** `write-up/README.md` as HTML, with its own headings linked from a contents list. Where the prose names a library, the name links to that build's detail view. The prose is not rewritten for the web and not summarized.

**Screens, `/screens/<build>/`.** The applications themselves, as section 6 builds them.

The screen spec is published too, at `/spec/`, linked from the write-up's "What was held fixed" section. It is a fifth route only in the sense that a static file is.

## 8. How the numbers are shown

Bars, not stars. Every category renders as a horizontal bar of one build against the other seven on a shared scale, with the number printed as text next to it. A reader who cannot see the bar still gets the figure, and a reader who cannot compare 44.90 to 233.87 in their head gets the picture.

Four rules for those bars.

The bundle chart shows delta, and total appears as a second, lighter bar behind it. The 180 KB budget line is drawn on the total scale and labeled, since that is what the budget applies to.

Colors carry framework, React or Vue, and nothing else. No red for a high number. `react-antd` being over budget is stated in words and marked on the chart, and it is not painted as a failure, because it passes all 18 criteria.

Assembly kits are labeled on every view where a hand built count appears. Section 10 of the screen spec asks for this so that shadcn/ui and Headless UI read as the trade they are.

First render numbers carry a note wherever they appear: five Lighthouse runs, median, taken from a local server on one Windows machine. Once the site deploys somewhere with a URL, they should be retaken against it, and until then the caveat is part of the number.

## 9. The site's own accessibility bar

A site reporting on accessibility defaults that fails its own audit ends the comparison as surely as a patched test would. It meets the same bar section 9 of the screen spec sets for the builds.

- Every control reachable and operable by keyboard, with a visible focus indicator at 3:1 against its background
- Real `table` semantics for the scoreboard, with a `caption`, and `aria-sort` on the active column if sorting ships
- Charts are not the only carrier of any number. Every figure appears as text.
- Every screenshot carries `alt` text naming its build and its width, and no screenshot is the only carrier of a fact stated nowhere else
- axe-core reports zero serious or critical violations on every route, run in CI
- Color is never the only signal, over budget included

## 10. Build and output

`pnpm site:build` produces `site/dist/`, a static directory with no server behind it. `pnpm site:screens` fills `site/dist/screens/`. CI runs both in the `publish` job, which today is a placeholder that echoes a line.

`pnpm screenshots` is not part of either. It needs Chrome and it writes files a human should look at before committing, so it runs by hand and its output is committed. A site build with a missing screenshot fails, the same way a missing results field does.

The output is host neutral by design. It is a folder of static files with relative internal links, so whatever it deploys to is a later decision and not one this spec makes. Vercel is the current intent and nothing in the build should assume it.

The `publish` job stays gated on `needs: [builds, baselines]` and on `main`. A site cannot publish from a run where a criteria suite failed.

## 11. Acceptance criteria

The site is done when all of these hold. They are checkable, in the same spirit as the screen spec's 18.

1. `pnpm site:build` produces `site/dist/` with no network access at build time
2. Every number rendered anywhere traces to a field in `results/*.json`, `scripts/roster.ts`, or a markdown file in the repo
3. Deleting a field from a results file fails the build rather than rendering a blank
4. The scoreboard shows five React builds and three Vue builds as two groups, and no view ranks all eight on total bundle size
5. No view shows a composite score, a rank out of eight, or a winner
6. `react-antd` is shown as over budget and as 18 of 18 passing, in that order of prominence
7. shadcn/ui and Headless UI are labeled assembly kits everywhere a hand built count appears
8. Every first render figure carries the local measurement caveat
9. All eight screens load at `/screens/<build>/` and their assets resolve
10. Sixteen screenshots exist, each under 150 KB, and a missing one fails the site build
11. The scoreboard's eight rows plus their thumbnails still read as one scannable table, and the thumbnails do not push the first row's numbers below the fold at 1440x900
12. `git status` is clean after a full publish, screens build included
13. `results/*.json` is byte identical before and after a full publish
14. axe-core reports zero serious or critical violations on the scoreboard, a build detail view, and the write-up
15. The site is fully operable by keyboard, and every chart's numbers are also present as text
16. `pnpm typecheck` covers the site, and the site imports `BuildResult` from `@uilc/harness` rather than redeclaring it

## 12. Out of scope

No server, no database, no search, no user accounts, no comments, and no analytics. No dark mode, matching the screen spec, except on the scoreboard (section 7). No responsive work below 375px, which is the narrow width the builds were already reviewed at. No live rerun of anything: the site displays a scoring run, it does not perform one. No editing of the write-up's prose to fit a layout.

## 13. Open decisions

These are not settled and each is an owner call.

1. **Does the site route client side or ship separate HTML files per view?** Separate files are simpler to host and to audit, and they cost a page load between views.
2. **Does `publish` deploy, or upload an artifact?** Section 10 leaves the output host neutral, so this can be answered after the site exists.
3. **Do the committed first render numbers get retaken against the deployed site?** They should, and doing so means a rescore commit after the first deploy, which touches `results/`. Whoever deploys owns that.
4. **Does CI check the screenshots are current?** A leg that recaptures and diffs would catch a stale image the way CI already catches a regenerated `tickets.json`. It also needs Chrome in the publish job and it will flake on font rendering differences between a runner and this Windows machine, which is probably why the answer is no.

Settled on 2026-09-09: the screens are embedded as committed screenshots, thumbnail sized on the scoreboard and full sized on a build detail view, with the live applications one click behind them. Eight iframes on one route was the alternative and it was rejected on page weight.
