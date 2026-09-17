# Screen spec: UI library comparison

**Status:** settled, 2026-09-02. The questions the first draft left open are answered in section 13.

Demo document. The domain, the data, and the numbers below are fictional sample content, matching `demo-resume.md`.

## 1. Why this exists

Eight UI libraries build the same screen so they can be compared on ergonomics, bundle size, and accessibility defaults. The comparison only holds if the screen is identical, so this spec is the fixed input. A library that cannot meet a requirement fails that requirement rather than changing it.

The eight are shadcn/ui, Material UI, Chakra UI, Ant Design, Headless UI, Vuetify, PrimeVue, and Quasar. The first five build in React, the last three in Vue 3. Every build uses TypeScript, Vite, Jest, and Biome.

## 2. The screen

One route, `/tickets`, holding a filterable support ticket table, a filter form above it, a record modal, and toast notifications. No navigation shell, no auth, no routing beyond the single page. Anything a library gives for free counts in its favor and must still meet the requirements here.

## 3. Data

Rows come from a fixed fixture file checked into each build, the same 240 tickets in the same order, so bundle and render numbers compare directly. No network calls.

A ticket has:

- `id`, string, format `TCK-0001`, unique, displayed
- `subject`, string, 1 to 120 characters, displayed
- `status`, one of `open`, `pending`, `resolved`, `closed`, displayed as a badge
- `priority`, one of `low`, `normal`, `high`, `urgent`, displayed as a badge
- `assignee`, string or null, a person's name, null renders as `Unassigned`
- `createdAt`, ISO 8601 date, displayed as `MMM d, yyyy`
- `updatedAt`, ISO 8601 date, displayed as a relative time such as `3 days ago`

## 4. Table

- Columns in order: ID, Subject, Status, Priority, Assignee, Created, Updated
- Sortable columns: ID, Subject, Created, Updated. Status and Priority are not sortable
- One sort at a time, ascending then descending then back to the default, which is `updatedAt` descending
- The active sort column shows a direction indicator and carries `aria-sort`
- Pagination is client side, 25 rows per page, with first, previous, next, and last controls and a `Showing 1 to 25 of 240` count
- Changing a filter resets to page 1
- Clicking a row opens the record modal for that ticket. The row is reachable by keyboard and opens on Enter and Space

## 5. Filter form

Sits above the table and filters on every keystroke or change, with no submit button.

- `Search`, text input, case insensitive substring match against `id` and `subject`, debounced 250ms
- `Status`, multi-select, no selection means all, multiple selections are an OR within the field
- `Priority`, multi-select, same rules
- `Assignee`, single select of the names present in the fixture, plus an `Unassigned` option
- `Created between`, two date inputs, either one may be left empty, the range is inclusive
- `Clear filters`, button, resets all five fields and returns to page 1, disabled when nothing is set

Fields combine with AND across the five, OR within a field. The active filter count shows next to the Clear button.

## 6. Record modal

Opens from a row click and edits that ticket.

- Title reads the ticket `id` and `subject`
- Editable fields: `subject` text input, `status` select, `priority` select, `assignee` select including `Unassigned`
- Read only: `id`, `createdAt`, `updatedAt`
- Validation: `subject` is required and capped at 120 characters, with the error shown under the field and announced. `status` and `priority` must be one of their allowed values
- `Save` applies the change to the in memory row and closes. `Cancel` and Escape discard and close
- Closing with unsaved changes asks for confirmation first. An untouched form closes without asking
- Focus moves to the first field on open, is trapped inside while open, and returns to the originating row on close
- The dialog carries `role="dialog"`, `aria-modal="true"`, and a label tied to its title

## 7. Toasts

- Save succeeds: `Ticket TCK-0001 updated`, polite, dismisses after 4 seconds
- Save fails validation: no toast, the field error carries it
- Filters cleared: `Filters cleared`, polite, 3 seconds
- A toast is dismissable by button and by Escape while focused
- Toasts stack to a maximum of 3, oldest dropped first
- The container is a live region, `aria-live="polite"`, present in the DOM before the first toast

## 8. Table states

- Loading: a skeleton of 5 rows held for a fixed 600ms on first mount, so every build shows the state
- Empty fixture: `No tickets yet`, with no filter controls disabled
- Empty after filtering: `No tickets match these filters`, with a `Clear filters` action inside the message
- Error: a fixture flag forces a failure, showing `Could not load tickets` and a `Retry` button

## 9. Accessibility

Every build meets WCAG 2.2 AA. These are the specific requirements, not the whole standard.

- Semantic HTML first, ARIA only where no element carries the meaning
- Every control reachable and operable by keyboard, with a visible focus indicator at 3:1 contrast against its background
- Tab order follows the visual order: filter form, table, pagination
- The table uses real `table` semantics with a `caption` or an `aria-label`
- Sort state announced through `aria-sort`, page changes announced in a live region
- axe-core runs against each build in CI with zero violations at the `serious` and `critical` levels
- A manual pass through NVDA on Windows and VoiceOver on macOS, covering filter, sort, page, open modal, edit, save

## 10. Scoring

Each build gets a number in four categories, published in the write-up with the reasoning.

- **Bundle size**, measured twice. The total is the production build gzipped, application code plus library code, excluding the fixture. The delta is that total minus a framework baseline, a minimal app that mounts React or Vue and renders nothing else. The delta is the number compared across all eight, since a total carrying React or Vue is not a library measurement. Budget is 180 KB on the total, and a build over it fails rather than scoring low
- **Accessibility defaults**, measured: axe-core violations before any manual fix, plus the number of requirements in section 9 the library needed custom code to meet
- **Ergonomics**, counted rather than judged: lines of application code for the screen, number of library imports, number of type assertions or `any` needed, and whether the modal, select, and toast came from the library or had to be hand built
- **Time to first render**, measured: Lighthouse on the deployed static build, median of 5 runs

Ergonomics is the only category that risks being opinion, so it is reported as those four counts, and the write-up draws the conclusion in prose rather than the score doing it.

Results are published in two groups, the five React builds and the three Vue builds. The delta is the only number quoted across the groups. Inside the write-up, shadcn/ui and Headless UI are labeled assembly kits rather than component suites, so their higher hand built counts read as the trade they are and not as a loss.

The write-up names no single winner. It publishes the numbers and picks per situation, a suite when speed matters and an assembly kit when control does.

## 11. Acceptance criteria

Each criterion is one Jest test per build, named for its number, so a build passes or fails the same list.

1. The table renders 25 rows on first paint and reports 240 total
2. Sorting by Subject ascending puts `A` before `Z`, and clicking twice reverses it
3. Sorting sets `aria-sort` on the active column and clears it on the others
4. Searching `TCK-0007` narrows to one row
5. Selecting `open` and `pending` in Status shows only those two statuses
6. Status `open` with Priority `urgent` shows only rows matching both
7. A Created range excludes rows outside it and includes rows on the boundary dates
8. Clear filters restores 240 rows, resets all five fields, and disables itself
9. Changing a filter while on page 4 returns to page 1
10. Enter on a focused row opens the modal for that row
11. Saving an empty subject blocks the save and shows the field error
12. Saving a valid change updates the row and fires one success toast
13. Escape on a touched form asks for confirmation, on an untouched form closes
14. Focus returns to the originating row after the modal closes
15. Filtering to no matches shows the empty state with a working Clear action
16. The forced error state shows the message and a Retry that reloads the fixture
17. axe-core reports zero serious or critical violations on the loaded table
18. axe-core reports zero serious or critical violations with the modal open

## 12. Out of scope

No authentication, no server, no persistence beyond the page session, no dark mode, no internationalization, no mobile specific layout below 768px, and no animation requirements. A library that ships any of these gets a mention in the write-up and no score for it.

## 13. Decisions

These were the open questions in the first draft. All seven were settled on 2026-09-02, and the reasoning is kept here so nobody reopens them cold.

1. **Domain stays `/tickets`.** Support tickets overlap none of the other seven projects, and the shape carries the filters, badges, and modal the comparison needs.
2. **Budget is 180 KB gzipped on the total, not 120 KB.** At 120 KB the suites fail on framework weight rather than on anything they chose, which measures React and Vue instead of the libraries. The delta in section 10 does the real comparing.
3. **Two reporting groups, React and Vue, with the delta spanning both.** A single table comparing shadcn/ui against Quasar would fold framework cost into the library number.
4. **Headless UI runs all 18 acceptance criteria like the rest.** It is labeled an assembly kit alongside shadcn/ui, so what it does not ship shows up as a hand built count and not as a failure.
5. **No winner.** The numbers publish, and the conclusion is a pick per situation.
6. **Jest, not Vitest.** It is deliberate here even though the rest of the work uses Vitest.
7. **The write-up shows the fixture generator and 10 sample rows, not all 240.** Enough to reproduce the run, short enough to read.

## 14. Repo layout

One repo, a pnpm workspace, with eight builds as siblings off a shared spec, fixture, and test suite. Everything lives here. There are no per library repos, the write-up has no separate home, and the demo sites publish from this repo's CI. The comparison rests on one commit holding all eight builds, the spec they were measured against, and the results that came out, so a reader can check any number against the code that produced it.

```
ai-frontend-advisor/
  spec/screen-spec.md        this document, the fixed input
  packages/fixture/          the 240 tickets and the generator, one source for all ten apps
  packages/criteria/         the 18 acceptance criteria as shared Jest suites
  packages/harness/          the adapter interface each build implements
  builds/react-shadcn/       eight builds, same package.json shape and scripts
  builds/react-mui/
  builds/react-chakra/
  builds/react-antd/
  builds/react-headless/
  builds/vue-vuetify/
  builds/vue-primevue/
  builds/vue-quasar/
  baselines/react/           mounts the framework, renders nothing, feeds the delta
  baselines/vue/
  scripts/measure.ts         gzip size, delta, Lighthouse, axe-core, writes results/
  results/                   one committed JSON per build, read by the write-up
  write-up/                  the published article
  .github/workflows/ci.yml
```

`packages/criteria` is the load bearing piece. The 18 tests in section 11 live once and run against every build, so each build ships an adapter answering questions like give me the row at index n and open the modal, rather than the tests reaching into Ant Design's DOM. Eight copies of the suite would drift within a week and the comparison would stop being fair.

Every build exposes the same four scripts, `dev`, `build`, `test`, and `measure`, so CI never special cases a library.

`results/` is committed. A scoring run then shows up as a diff a reader can check, and the write-up reads its numbers from there instead of carrying them by hand.

CI runs a matrix over the ten apps: build, measure size against the budget, run the shared Jest suite, run axe-core, run Lighthouse. It publishes the eight demo builds as static sites alongside the write-up. The two baselines are measured and never published.

## 15. Parallel work

The eight builds are independent, so they can run at the same time, whether by people or by agents. The slice is one build, not one feature. An agent takes a library from empty folder through the screen, the adapter, the 18 criteria, and a `measure` run that lands its results file. A feature slice such as filtering would put eight workers inside the same eight folders and turn every merge into a conflict.

Two phases, in order.

**Phase one, one owner, nothing parallel.** Sections 1 to 13 of this document, `packages/fixture`, `packages/criteria`, and the adapter interface in `packages/harness`. These are the fixed input, and a comparison where they moved partway through is not a comparison. Nothing in `builds/` starts until they are settled.

**Phase two, eight workers, one build each.** The baselines are a small separate task and belong to whoever owned phase one.

The rules that keep phase two honest:

- A worker writes only inside its own `builds/<name>/` folder and its own `results/<name>.json`. Separate files per build mean eight writers never touch the same line
- Nobody edits `packages/criteria` or `packages/harness`. A test that seems wrong goes back to the owner as a question, because a criterion patched locally silently ends the comparison
- A library that cannot meet a requirement records the failure and moves on. Section 1 already says the spec does not bend, and that holds harder when eight workers each have a reason to bend it
- Each build lands as its own pull request, and CI runs the shared suite against it
- The write-up is written once, after all eight results files exist, by one owner reading `results/`
