# Eight UI libraries, one screen

Eight libraries built the same `/tickets` screen against one fixed spec, and each build was scored on the same four categories. This is the result.

The screen is a filterable data table: 240 rows, five filters, sortable columns, pagination at 25 a page, a record modal that validates and saves, and stacked toasts capped at three. [`spec/screen-spec.md`](../spec/screen-spec.md) defines it in 13 sections and did not change once building started. Every number below reads from [`results/`](../results/), which is committed, so any figure can be checked against the code that produced it.

This is sample content for a demo. The domain, the data, and the numbers are fictional.

## What was held fixed

The comparison only means something if the screen and the measurements are identical, so three things were settled before any build began and never moved: the 240 row fixture, the 18 acceptance criteria, and the adapter interface each build implements.

The criteria live once, in `packages/criteria`, and run against all eight builds. Each build ships an adapter that answers questions like *give me the row at index n* or *open the modal*, so a test never reaches into Ant Design's DOM or Vuetify's. Every adapter drives the real control: it clicks the header, types in the input, presses the key. Reading component state would measure nothing.

A library that could not meet a requirement was to fail it rather than have the spec bend. None did. All eight pass all 18 criteria.

## The fixture

240 tickets from a seeded generator, committed as `tickets.json`. The seed is fixed, so regenerating produces a byte identical file, and CI fails on a diff. If the rows ever change, every earlier bundle number stops comparing.

```ts
export const SEED = 0x5eed_1e55;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTickets(seed: number = SEED): Ticket[] {
  const rand = mulberry32(seed);
  const tickets: Ticket[] = [];

  for (let i = 0; i < TICKET_COUNT; i += 1) {
    const id = `TCK-${String(i + 1).padStart(4, '0')}`;
    const subject = `${pick(rand, SUBJECT_LEADS)} ${pick(rand, SUBJECT_TAILS)}`;
    const createdOffset = Math.floor(rand() * (WINDOW_DAYS + 1));
    const created = WINDOW_START + createdOffset * DAY;
    const maxUpdateGap = Math.max(0, WINDOW_DAYS - createdOffset);
    const updated = created + Math.floor(rand() * (maxUpdateGap + 1)) * DAY;

    tickets.push({
      id,
      subject,
      status: pick(rand, STATUSES),
      priority: pick(rand, PRIORITIES),
      assignee: rand() < 0.2 ? null : pick(rand, NAMES),
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(updated).toISOString(),
    });
  }

  // Criterion 7 needs rows sitting exactly on a range boundary.
  pinCreated(tickets, 'TCK-0100', Date.UTC(2026, 2, 1));
  pinCreated(tickets, 'TCK-0101', Date.UTC(2026, 2, 31));

  return tickets;
}
```

Two rows are pinned to range boundaries so criterion 7 can assert inclusivity without hunting for a lucky row. Roughly one ticket in five is unassigned, so the Unassigned filter option has rows to show. The first ten of the 240:

| id | subject | status | priority | assignee | created |
| --- | --- | --- | --- | --- | --- |
| TCK-0001 | XML feed rejects unicode in the EU region | pending | low | Daniel Reyes | 2026-03-04 |
| TCK-0002 | Email digest never arrives on the trial plan | pending | low | Ken Ito | 2026-03-16 |
| TCK-0003 | Upload progress freezes once the cache warms | pending | normal | Grace Mbeki | 2026-03-13 |
| TCK-0004 | XML feed rejects unicode when SSO is enabled | open | normal | Unassigned | 2026-06-10 |
| TCK-0005 | Yearly rollup misses December once the cache warms | closed | urgent | Unassigned | 2026-04-20 |
| TCK-0006 | Keyboard shortcuts conflict for enterprise accounts | pending | low | Unassigned | 2026-02-09 |
| TCK-0007 | Timezone shown as UTC when SSO is enabled | pending | urgent | Tomas Lindqvist | 2026-01-31 |
| TCK-0008 | Header search returns nothing on slow connections | open | low | Daniel Reyes | 2026-04-12 |
| TCK-0009 | Login loops after timeout for enterprise accounts | closed | high | Ken Ito | 2026-02-22 |
| TCK-0010 | Group permissions ignored in the EU region | closed | high | Ken Ito | 2026-04-27 |

## Bundle size

Two numbers per build. The total is the production bundle gzipped, application code plus library code, with the fixture excluded. The delta is that total minus a framework baseline, an app that mounts React or Vue and renders nothing else: 44.91 KB for React, 24.21 KB for Vue.

The delta is the only figure quoted across both groups, because a total carrying React or Vue is not a library measurement. The budget is 180 KB on the total, and a build over it fails rather than scoring low.

| Library | Framework | Kind | Delta | Total |
| --- | --- | --- | --- | --- |
| Headless UI | React | assembly kit | 44.90 KB | 89.81 KB |
| shadcn/ui | React | assembly kit | 58.89 KB | 103.80 KB |
| Material UI | React | suite | 79.76 KB | 124.67 KB |
| Quasar | Vue | suite | 91.71 KB | 115.92 KB |
| Chakra UI | React | suite | 97.81 KB | 142.72 KB |
| Vuetify | Vue | suite | 128.87 KB | 153.08 KB |
| PrimeVue | Vue | suite | 150.20 KB | 174.41 KB |
| Ant Design | React | suite | 233.87 KB | 278.78 KB |

The spread is five to one, from 44.90 KB to 233.87 KB, for eight screens that behave identically.

Ant Design is the only build over budget, and by a wide margin. A standalone esbuild bundle isolated the cause: `Table` alone costs roughly 247 KB gzipped with React, because `rc-table` pulls in `rc-virtual-list` whether or not the table virtualizes. The build trimmed everywhere else it could, using a native `<input type="date">` rather than `DatePicker` and plain markup rather than `Result` and `Skeleton`, and still could not close the gap. That is a library weight finding, not an implementation shortfall.

PrimeVue landed inside budget with about 5.6 KB to spare, and only after the theme was trimmed to the ten components actually mounted and an unused `primeicons` font import worth roughly 105 KB was dropped. Its default configuration would not have fit.

Vuetify's number carries a correction worth stating plainly. It measured 95.96 KB delta until a later pass found the build had never imported `vuetify/styles`, so the library's own base stylesheet was missing from the bundle. The honest figure is 128.87 KB, about 33 KB higher, and it is still inside budget.

## Accessibility defaults

Two measures. The first is axe-core violations at the serious and critical levels before any manual fix. The second counts how many of the spec's section 9 requirements the library did not supply, so the build had to write them.

| Library | axe before fixes | Requirements needing custom code |
| --- | --- | --- |
| Material UI | 0 | 3 |
| shadcn/ui | 0 | 4 |
| Chakra UI | 0 | 4 |
| PrimeVue | 0 | 4 |
| Ant Design | 0 | 5 |
| Headless UI | 0 | 6 |
| Vuetify | 0 | 6 |
| Quasar | 1 | 6 |

Seven of eight started clean. Quasar's one violation was a genuine critical: a double-nested `<label>` wrapping `QInput`, found and fixed during the build.

The counts cluster tightly, three to six out of a shared list, and the same requirements come up again and again. Nearly every build hand wrote `aria-sort` on the active column, the table caption or `aria-label`, keyboard activation for a table row, and the live region announcing page changes. A `<tr>` is not natively interactive, so making one respond to Enter is application work in every library here. What the libraries reliably did supply was the dialog: role, `aria-modal`, title association, focus trap, and focus return came free in six of the eight.

Material UI needed the least help at three. Headless UI, Vuetify, and Quasar needed the most at six, though for different reasons. Headless UI is an assembly kit and ships no table or toast at all, so its count reflects what it never claimed to provide.

## Ergonomics

Counted, not judged. Four numbers per build, with the conclusion drawn in prose rather than by the score.

| Library | App lines | Library imports | Type escapes | Modal | Select | Toast |
| --- | --- | --- | --- | --- | --- | --- |
| Chakra UI | 904 | 9 | 0 | library | library | library |
| Quasar | 916 | 1 | 0 | library | library | hand built |
| PrimeVue | 957 | 18 | 0 | library | library | hand built |
| Vuetify | 958 | 2 | 0 | library | library | hand built |
| Material UI | 991 | 8 | 0 | library | library | hand built |
| Ant Design | 1029 | 9 | 0 | library | library | hand built |
| Headless UI | 1107 | 3 | 0 | library | hand built | hand built |
| shadcn/ui | 1445 | 21 | 0 | hand built | hand built | hand built |

No build needed a single `any` or type assertion. That is the one category where all eight tie, and it says something about where typed component libraries have landed.

The clearest finding in this table is the toast column. Seven of eight libraries could not supply the notification behavior the spec asks for, which is a stack of up to three, oldest evicted first, each announced in a live region and dismissible with Escape. Material UI's `Snackbar` is single slot. Quasar's `$q.notify()` and Ant Design's `message` do not match the eviction rule. Even Chakra, the one build that used its library's toast, had to layer hand written eviction on top, because Ark UI's `max` option queues rather than evicts. A capped, ordered toast stack is apparently still application code.

The two assembly kits sit at the bottom on line count, and that is the trade rather than a loss. shadcn/ui writes the most application code by a distance at 1445 lines, because the table, the multi-selects, and the toasts are all in the repo rather than in `node_modules`. Radix's `Select` is single value only, so the multi-selects were assembled from `DropdownMenu` and `Checkbox`. Those lines are the point of the approach: they are editable, and they are the reason its delta is the second smallest.

One caveat on the imports column, and it matters. The measurement counts explicit `import` statements only. Quasar and Vuetify resolve `<q-select>` and `<v-btn>` from template tags at build time through their Vite plugins, so their counts of 1 and 2 undercount real library usage badly. Read that column for the React builds and ignore it for those two.

## Time to first render

Lighthouse first contentful paint on the deployed static build, median of five runs, taken by `pnpm lighthouse --url` against https://ui-library-comparison.bobdempsey83.com and read back into `results/` by `pnpm measure`.

| Library | Framework | Median FCP | Delta gzip |
| --- | --- | --- | --- |
| Headless UI | React | 1378 ms | 44.90 KB |
| shadcn/ui | React | 1390 ms | 58.89 KB |
| Material UI | React | 1526 ms | 79.76 KB |
| Quasar | Vue | 1565 ms | 91.71 KB |
| Chakra UI | React | 1653 ms | 97.81 KB |
| Vuetify | Vue | 1741 ms | 128.87 KB |
| PrimeVue | Vue | 1745 ms | 150.20 KB |
| Ant Design | React | 2277 ms | 233.87 KB |

The order is the bundle order, exactly. Nothing on this screen paints before its library parses, so first render is bundle size read through Lighthouse's mobile throttling rather than an independent finding. The useful figure is the spread: about 900 ms between the lightest build and the heaviest, on a simulated mid-tier phone, for eight screens a user cannot tell apart.

Read these as relative. They were taken on 2026-09-16 from one Windows machine against the deployed site on Vercel, which serves compressed assets the way the bundle numbers are measured, and Lighthouse's mobile preset throttles CPU and network to a fixed profile. The first run for a build was sometimes up to 150 ms slower than the other four, which reads as a cold edge cache, and the median absorbs it. The ranking is stable even though the absolute milliseconds are not a claim about any real device. An earlier set taken against a local server ran 50 to 270 ms higher and gave the same order.

## Picking one

No winner. The numbers publish and the choice depends on the situation.

**When shipping speed matters most, take a suite.** Chakra UI is the strongest showing here: the fewest application lines at 904, the only build where the modal, select, and toast all came from the library, zero axe violations, and a 97.81 KB delta. Material UI is close behind and needed the least accessibility help of any build.

**When bundle size is the binding constraint, take an assembly kit.** Headless UI's 44.90 KB delta is roughly half the median, and shadcn/ui's 58.89 KB is the next smallest. Both cost real application code for it, 1107 and 1445 lines against a 904 line floor.

**When the design system is going to diverge from the library's defaults, take shadcn/ui.** Its components are files in the repo. Every other build here customizes through a theme API and stops where that API stops.

**On Vue, Quasar is the cheapest of the three** at a 91.71 KB delta, with Vuetify at 128.87 KB and PrimeVue at 150.20 KB. All three shipped a working modal and select, and none shipped a usable toast.

**Ant Design is hard to justify on a bundle sensitive screen.** It is a capable suite and it passed all 18 criteria, but 233.87 KB for one table is a cost that has to be worth paying.

## What this does not tell you

Four limits, stated so no number is read for more than it is worth.

axe-core ran under jsdom, where `HTMLCanvasElement.getContext` is not implemented, so color contrast was never checked. A zero is real for what axe can evaluate there and is not a clean bill of health.

The manual screen reader pass in section 9, NVDA on Windows and VoiceOver on macOS through filter, sort, page, open, edit, and save, has not been done. Nothing here substitutes for it.

The render numbers came from one Windows machine driving Lighthouse against the deployed site. The ranking should hold, since it is the bundle ranking, but the milliseconds would move on other hardware and from other networks.

All eight screens were walked in one browser, Chromium, at 1440px and 375px: search, both filters, sorting, paging, the edit modal, a save, and the toast cap. The defects that turned up were fixed. Other browsers and other widths were not checked, so defects there may still be unfound.

Two visible differences between builds were deliberately left in place rather than normalized. Badge label casing varies, and only shadcn/ui renders a page heading, which the spec never asked for. Both are library defaults showing through, and that is exactly what this comparison exists to record.

## Reproducing

```
pnpm install
pnpm build               # all ten apps
pnpm test                # the 18 criteria in every build
pnpm lighthouse --all    # first contentful paint, five runs per build
pnpm measure --all       # rescore every build into results/
pnpm fixture:check       # check what the criteria assume about the fixture
```

`pnpm lighthouse` needs the builds built first, since it serves `dist`. Each build serves on its own port, 5173 through 5180 in roster order, so all eight can run side by side: `pnpm --filter @uilc/<build> dev`.
