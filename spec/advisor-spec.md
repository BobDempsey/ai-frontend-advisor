# Advisor spec: the AI frontend advisor

**Phase four.** `screen-spec.md` and `site-spec.md` are the fixed input. This document turns the site's chat assistant (site spec section 14) into an advisor that helps a reader choose a front-end library for their own project. Section 11 adds a chat-first landing page at `/` that leads readers to it. It changes what the assistant does and says, not what the comparison measured.

## 1. Why this exists

The chat already answers questions about the eight builds, but a reader with a project in mind has to know which questions to ask. The advisor asks them instead. It learns what the project needs, then narrows the eight libraries to a short list, with the numbers and trades behind each pick.

The comparison stays the source of truth. The advisor reads the same files the site renders, and a number it quotes is a number already in the repo.

## 2. What the advisor must not disturb

- Everything in site spec section 2 still holds, with the one change in section 3 below.
- The advisor reads `results/`, the write-up, the specs and the notes file in section 6. It writes nothing, and no number in `results/` changes because it exists.
- It invents no number. Every figure it quotes, with its unit, appears in a grounding file.
- React and Vue stay two groups. When a short list mixes them, the gzipped delta is the only figure compared across them, and the answer says so.
- It never names an overall winner and never ranks all eight.
- It adds no measurement. A question the comparison did not measure gets "not measured", not an estimate.

## 3. The one rule that changes

Site spec section 2 says the assistant "ranks nothing". The owner changed that on 2026-09-17: the advisor may order a short list of two or three libraries against the needs a reader has stated. The order belongs to that reader's project, and the answer names the need that decided it. It is still never a ranking of all eight, never a score, and never "the best library". Site spec section 2 and section 14 get a matching edit when this spec is built.

## 4. What the advisor does

**Ask about the project first.** When a reader asks what to use without saying enough, the advisor asks up to four short questions in one message: which framework (React, Vue, or either), how much bundle weight matters, what accessibility bar the project has, and whether the team would rather style everything itself or start from finished components. A reader can skip any of them, and the advisor works with what it has. It never asks more than once per conversation.

**Rank a short list.** With enough to go on, it names two or three libraries in order. For each it gives the gzipped delta, the hand built parts, the count of accessibility requirements that needed custom code, and the median first render, each read from that build's result file. One sentence per pick says which stated need put it there.

**Explain a trade.** Asked why a library ranks where it does, it names the mechanism from the write-up or the notes, for example that Ant Design's `Table` pulls in `rc-virtual-list` and alone costs about 247 KB gzipped with React.

**Compare two libraries side by side.** It sets two builds against each other as a short markdown table, using only result file fields. A React and Vue pair shows only the delta across the two, with each total beside its own baseline.

**Warn about known problems.** For any library on a short list, it may add one line from the notes file, such as PrimeVue following the system dark mode unless `darkModeSelector` is turned off.

**Estimate custom work.** It says which of the modal, select and toast came with the library and which the build made by hand, from `ergonomics.handBuilt`, and how many section 9 requirements needed custom code. It frames this as what this screen needed, not a promise about another app.

**Link to the evidence.** Every pick links to `/builds/<build>/`, and to `/screens/<build>/` when the reader wants to try it. A claim from the write-up links to `/write-up/`.

**State the limits.** It says so plainly when a question goes past the data: libraries outside the eight, frameworks other than React and Vue, screen reader behavior, server rendering, or anything the write-up's "What this does not tell you" section lists.

## 5. Where it runs

The advisor replaces the assistant in place. It is the same function, `api/chat.ts`, the same model and key, the same limits in `api/_lib/limits.ts`, the same Vercel Firewall rule, and the same drawer. Only the system prompt, the grounding, the drawer's wording and the history length change.

`MAX_HISTORY_TURNS` rises from 6 to 10, so the reader's answers to the intake questions are still in view two follow-ups later. `MAX_OUTPUT_TOKENS` stays at 1200 unless a short list with a table is cut off in testing, in which case the owner decides the new ceiling.

## 6. What it answers from

The grounding in `api/_lib/grounding.ts` keeps its four sources (the write-up, the screen spec, the eight result files, the roster) and adds one: `advisor/notes.md`.

`advisor/notes.md` holds the known problems a reader would hit, one short entry per build, taken from what the builds recorded while they were made. Each entry names the library and the fix. The file holds no figure that is not also in a result file or the write-up; a test enforces that (section 9). `vercel.json` adds it to `includeFiles`, and `GROUNDING_FILES` lists it.

The prompt's rules gain these: ask before recommending when the needs are unknown, keep a short list to two or three, name the deciding need for each pick, quote the four fields in section 4 for each pick, and answer anything outside the eight with the limits sentence.

## 7. The drawer

- Its title becomes "AI frontend advisor", and its description says it helps pick among the eight libraries this site measured.
- The suggestion buttons become starting points for the advisor: "Help me pick a library for my project", "Compare Vuetify and Quasar", and "Why is Ant Design over budget?".
- Everything else in site spec section 14, the accessibility bar included, stays as it is.

## 8. Out of scope

- Libraries, frameworks or versions outside the eight builds.
- Saving a reader's project profile past the browser session.
- Tool calls, web search, or any source outside the grounding files.
- New measurements, or rescoring any build.
- A second chat on a page. The advisor lives in the drawer, and the landing page in section 11 hands its questions to the drawer.

## 9. Acceptance criteria

1. `pnpm test:api` passes, with new tests for each item below that can run without the model.
2. The system prompt contains every rule in section 6, and a test asserts each one by text.
3. `buildSystemPrompt` includes `advisor/notes.md`, and loading fails, naming the file, if it is missing.
4. A test reads every number with a unit (KB, ms) in `advisor/notes.md` and fails if any is absent from the result files and the write-up.
5. `trimHistory` keeps the last 10 turns.
6. `vercel.json` `includeFiles` covers every entry in `GROUNDING_FILES`, checked by a test.
7. `pnpm advisor:eval`, a root script run by hand against the live model and never in CI, sends a fixed set of questions and fails if any reply quotes a KB or ms figure that is not in the grounding, names an overall winner, lists more than three libraries as picks, or answers a question about a library outside the eight as if it were measured. The set covers each capability in section 4, including a vague "what should I use?" that must get the intake questions.
8. `pnpm site:check` passes, with the drawer showing the new title and suggestions.
9. `pnpm typecheck` passes, and `results/*.json` hash the same before and after.
10. Live on the deployed site, the vague question gets the intake questions, and a follow-up naming React and a tight budget gets a short list of two or three with the four fields each and links to their build pages.

## 10. Open decisions

1. Whether the eval in criterion 7 should also run on a schedule against the deployed function, and who pays for those calls.
2. Whether `requirementsNeedingCustomCode` is shown to readers under that name or as "accessibility work you add".

## 11. The landing page

Added 2026-09-17. `/` becomes a chat-first page, the way AI products open: one headline, one question box, and little else above the fold. The scoreboard moves to `/results/` (site spec section 7).

**Hero.** A headline naming what the advisor does ("Find the front-end library that fits your project"), one line under it saying the answers come from eight libraries built and measured on the same screen, and a large question box with a send button. Sending dispatches `uilc:ask` and the drawer opens with the answer.

**Starting prompts.** Three to four buttons under the box, matching the drawer's suggestions in section 7 ("Help me pick a library for my project", "Compare Vuetify and Quasar", "Why is Ant Design over budget?"). Each dispatches `uilc:ask`.

**The ask event.** Any page may dispatch `new CustomEvent('uilc:ask', { detail: { question } })` on `window`. `site/src/chat/main.ts` listens, loads the chat island if it has not, and mounts it open, and the island sends the question as the first message. An empty question only opens the drawer. The landing page never talks to `/api/chat/` itself.

**Below the fold.** A short "How it works" row in three steps (tell it about your project, get a short list, check the evidence), then a strip of the eight library names linking to their build pages, then links to the results, the write-up and the screen spec. The page shows no bundle numbers and no charts; those live on `/results/`.

**Navbar.** "Advisor" (the landing page), "Results", "Write-up", "Screen spec", then the theme toggle and the chat button.

**Without script.** The question box is a form whose submit does nothing harmful, and a line under it links to `/results/` so the page still leads somewhere.

**Look.** It uses the shadcn components already in `site/src/components/ui/` and the site's tokens, and its hero avoids the generic centered gradient with three cards. The page is static HTML like every other view; only the chat entry script runs. Like `/results/`, it follows the system color scheme and shows the theme toggle.

**How it is checked.** `pnpm site:check` covers the hero, the starting prompts, the event dispatch, axe at 1440 and 375 in both color schemes, and no sideways scroll.
