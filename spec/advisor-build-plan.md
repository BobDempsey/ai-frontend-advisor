# Build plan: landing page and advisor, in vertical slices

This plan delivers the open items in `tasks.md`: a chat-first landing page and the advisor in `advisor-spec.md`. Two agents build them at once, each owning one feature end to end in its own git worktree. The owner's session does the shared groundwork on `main` first and merges the slices after.

## 1. Why slices, and why two

A slice is one feature from spec to server to UI to tests, owned by one agent. Splitting by layer instead (one agent on `api/`, one on `site/`) would put both agents in the same files for every feature, and a change to the chat would need both to agree.

There are two features, so there are two slices. A third agent would have nothing of its own to own.

## 2. The rule that makes slices possible

Anything both slices depend on lands on `main` before either worktree is created. After that, each slice has a list of files it owns (section 5), and it edits nothing outside that list. `scripts/site-check.ts` is the one file both slices touch; each edits only its own checks, and the merge in section 6 resolves the rest.

The repo's standing rules in `CLAUDE.md` still apply to both agents: no edits to `packages/criteria`, `packages/harness`, `packages/fixture`, `spec/screen-spec.md`, any `builds/` folder or `results/`, and no loosened checks.

## 3. Phase 0, on main, before any worktree

The owner's session does these, commits them, and pushes.

1. Commit `spec/advisor-spec.md`.
2. Add a landing page section to `spec/advisor-spec.md` (section 4 of this plan is the content).
3. Edit `spec/site-spec.md`: section 2 allows the advisor's short list (advisor spec section 3); section 7 moves the scoreboard from `/` to `/results/` and makes `/` the landing page; the fold rule applies to `/results/`; the landing page and `/results/` both follow the system color scheme and show the theme toggle, and the other views stay light.
4. Add the ask contract to `site/src/chat/main.ts` and `site/src/chat/chat.tsx`, so the landing slice can hand a question to the drawer without touching the drawer. Any page may dispatch `new CustomEvent('uilc:ask', { detail: { question } })` on `window`. `main.ts` listens, loads the island if it has not, and mounts it open; the island sends the question as the first message. An empty question just opens the drawer. `pnpm site:check` gets one check that the event opens the drawer and posts the question.
5. Update the stale deploy comment on the CI `publish` job in `.github/workflows/ci.yml`.
6. Run `pnpm typecheck`, `pnpm test:api`, `pnpm site:build && pnpm site:screens`, `pnpm site:check`. Commit and push.

## 4. The landing page

`/` becomes a chat-first page, the way AI products open: one headline, one question box, and little else above the fold.

- **Hero.** A headline naming what the advisor does ("Find the front-end library that fits your project"), one line under it saying the answers come from eight libraries built and measured on the same screen, and a large question box with a send button. Sending dispatches `uilc:ask` and the drawer opens with the answer.
- **Starting prompts.** Three to four buttons under the box, matching the drawer's suggestions ("Help me pick a library for my project", "Compare Vuetify and Quasar", "Why is Ant Design over budget?"). Each dispatches `uilc:ask`.
- **Below the fold.** A short "How it works" row in three steps (tell it about your project, get a short list, check the evidence), then a strip of the eight library names linking to their build pages, then links to the results, the write-up and the screen spec. No bundle numbers and no charts on this page; they live on `/results/`.
- **Navbar.** "Advisor" (the landing page), "Results", "Write-up", "Screen spec", then the theme toggle and the chat button.
- **Without script.** The question box is a form whose submit does nothing harmful, and a line under it links to `/results/` so the page still leads somewhere.
- **Look.** shadcn components already in `site/src/components/ui/`, the site's tokens, and a hero that avoids the generic centered gradient with three cards. The page is static HTML like every other view; only the chat entry script runs.

## 5. The slices

Each agent starts from the Phase 0 commit, runs `pnpm install` in its worktree, and copies `.env.local` from the main checkout if it needs a live model. Each commits on its own branch and does not push or merge.

### Slice A: landing page

Owns `site/src/pages.tsx`, `site/index.html`, `site/src/styles.css`, `site/src/theme.ts`, `site/vite.config.ts` (page output only), any new file under `site/src/landing/`, `site/public/` additions, and the landing and routing checks in `scripts/site-check.ts`.

Delivers section 4, moves the scoreboard to `results/index.html` with every internal link updated, keeps the scoreboard's TL;DR and `PICKS` check working at its new path, and updates `site-check.ts`: route lists include `/results/`, the fold check targets `/results/`, the dark mode rule covers `/` and `/results/`, and a new landing check covers the hero, the starting prompts, the event dispatch, axe at 1440 and 375 in both schemes, and no sideways scroll.

Done when `pnpm typecheck`, `pnpm site:build && pnpm site:screens` and `pnpm site:check` pass.

### Slice B: advisor

Owns `api/`, `vercel.json`, `advisor/notes.md`, `scripts/advisor-eval.ts`, the root `package.json` script entry `advisor:eval`, `site/src/chat/chat.tsx`, `site/src/chat/toggle.tsx`, and the chat checks in `scripts/site-check.ts`.

Delivers `spec/advisor-spec.md` sections 4 to 9: the notes file, the grounding and prompt changes, `MAX_HISTORY_TURNS` at 10, the drawer title and suggestions, the eval script, and the tests in criteria 1 to 6. The prompt's link list names `/results/` for the scoreboard and `/` for the advisor, matching Slice A. It leaves `RATE_LIMIT_PAUSED` and `QUOTA_ENABLED` as they are.

Done when `pnpm typecheck`, `pnpm test:api` and `pnpm site:check` pass, and `pnpm advisor:eval` has run once against a live key with its output in the agent's report.

### Shared resources

`pnpm site:check` serves on port 4300 and `pnpm dev` on 5190, so two worktrees running either at once collide. A slice that hits a port in use waits and retries rather than changing the port. The Playwright and Puppeteer MCP browsers are one shared session (handoff section 5), so neither agent drives them; the owner does the visual pass after merge.

## 6. Phase 2, merge and ship

The owner's session does these.

1. Merge Slice A into `main`, then Slice B. Resolve conflicts in `scripts/site-check.ts` by keeping both sides' checks. Any conflict where both sides changed the same behavior goes to the user before it is resolved.
2. Run the full check list from Phase 0, and confirm `results/*.json` hash the same as before Phase 0.
3. Rerun `pnpm site:screens`, and retake `pnpm screenshots` only if a build screen changed (none should).
4. Update `handoff.md` and `tasks.md`. Push. Check the live site: the landing page, `/results/`, the ask event, and advisor spec criterion 10.
5. The user tests the advisor on the live site with the limits paused.
6. Re-enable the limits last: the Vercel Firewall rule (and check its conditions, since the last publish reported "Condition groups restructured"), `RATE_LIMIT_PAUSED` to false, `QUOTA_ENABLED` to true. Verify the eleventh request in ten minutes gets a 429. Remove the worktrees and their branches.

## 7. How the agents are started

Two `general-purpose` agents, each with `isolation: "worktree"`, launched in one message after Phase 0 is pushed. Each prompt names its slice, the files it owns, its done condition, and these instructions: run test suites in the foreground, report failures with the output, do not push, and end with a summary of what changed and what was verified (handoff section 5 records builders that waited forever on a backgrounded test run).
