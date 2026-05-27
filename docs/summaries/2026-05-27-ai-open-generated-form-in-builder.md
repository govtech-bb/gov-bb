# Form Builder AI — open generated form in the UI builder

**Date:** 2026-05-27
**Branch:** `feat/ai-open-in-builder` (off `sandbox`, merges back to `sandbox`)
**Issue:** [#235](https://github.com/govtech-bb/gov-bb/issues/235)
**Plan:** `docs/plans/ai-open-generated-form-in-builder.md`
**ADR:** `docs/decisions/0011-builder-mode-handoff-goes-through-persistence.md`

## Context

After the AI generates a recipe in `/builder/ai`, the only way into the UI
builder was to switch modes (discarding the recipe) and re-open the form by hand
through the Open picker. #235 adds a one-click **Open in builder** that closes
that gap. The plan's key observation: all the machinery already existed
(`publishSession` returns a `formId`; the UI builder already loads a stored
recipe by id) — the work was wiring, not new endpoints.

## What we did

Single session, worktree-isolated, TDD for the extractable logic.

- New pure helper `apps/form_builder/app/routes/builder/ui/-open-from-ai.ts`
  (+ `.spec.ts`, 6 tests written first): `parseBuilderSearch` (validates the
  `?formId=` handoff param) and `buildLoadArgs` (recipe → `{draft, version}`,
  version sourced from the recipe).
- `builder/ui/index.tsx`: added `validateSearch`, a ref-guarded one-shot mount
  effect (`getRecipe` → `buildLoadArgs` → `handleLoad` → strip the param), and a
  visible error banner.
- `builder/ai/index.tsx`: added the **Open in builder** button
  (`publishSession` → navigate to `/builder/ui?formId=`); on failure it writes to
  the existing `publishResult` strip and stays put.
- **Scope expansion at the user's call:** removed the **Export SQL** button, its
  `handleExportSql` handler, the raw JSON `<pre>` recipe dump (replaced with a
  status line), the now-dead `getSql` server fn, and the stale `SPEC.md` entries
  for it.

## Why we did it that way

**Publish-first, not client-carry.** The handoff publishes and re-opens by
`formId` rather than carrying the in-progress recipe via router state /
sessionStorage. This reuses the Open-picker load path (no second recipe→draft
code path) and means "open" always opens a created form. Full rationale and the
constraint it places on future work are in
[0011](../decisions/0011-builder-mode-handoff-goes-through-persistence.md).

**`?formId=` search param over history state.** Refresh-safe and shareable; the
receiving route clears the param after load (replace navigation) so a refresh
can't re-trigger the load or clobber edits.

**Version from `recipe.version`, not a form summary.** The Open picker reads
version off the `FormDefinitionSummary` it already has; the AI path only has a
`formId`, so `buildLoadArgs` takes the version off the fetched recipe instead.
`handleLoad` then sets `loadedFromId`, so a same-version Save does `updateRecipe`
(edit in place) — correct for a form just created.

**Tests: pure helper + real-browser smoke, by the user's choice.** The app has
no component-render test harness — jest is `testEnvironment: node`,
`testRegex: .spec.ts`, and the existing tests are all pure-logic; testing-library
+ jsdom are installed but unwired. Rather than stand up render tests for one
button and one effect (heavy, given TanStack's ESM shims), we unit-tested the
extractable pure logic and left the navigation flow to a real-browser smoke test
— consistent with the standing preference for browser smoke over Playwright on
UI/navigation changes.

**Removed `getSql`/Export SQL rather than leaving it.** The user asked to drop
the SQL and JSON-dump UI as "unneeded complexity." Removing the button orphaned
the `getSql` server fn, so we deleted it and corrected `SPEC.md` to match. Left
the historical `docs/superpowers/plans|specs` mentions alone — those are dated
design records, not current docs.

## What we almost got wrong

**`tsc` looked like it found a new error in `ai/index.tsx`.** A typecheck
reported `'data' is of type 'unknown'` at the same line my new `data.formId`
access landed on. It turned out to be the *pre-existing* `handleExtract` →
`data.recipe` error (extraction's server-fn return collapses to `unknown` under
TanStack's serialization typing); my `data.formId` reads off `publishSession`'s
typed `PublishResponse` and is clean. Confirmed by diffing the error count
against the pristine `sandbox` checkout (5 errors both before and after) — the
form-builder app's typecheck is pre-existing-red and not a CI gate.

## Open questions

- None blocking. The "Opened from AI" arrival cue was deliberately left silent
  (user's choice); revisit only if users want a confirmation toast.

## Tests

- `pnpm exec nx run-many -t build` (excl. `landing`'s network prebuild) — 12
  projects green.
- `pnpm exec nx run-many -t test` — 11 projects green; `form-builder-app` 122
  tests (was 116 — the 6 new helper tests).
- `tsc --noEmit` on `apps/form_builder` — no new errors (5 pre-existing,
  unchanged from `sandbox`).
- Real-browser smoke test of the navigation flow: deferred to the user.
