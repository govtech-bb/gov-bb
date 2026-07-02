# Decompose `BuilderPage` (#1420, Phase 5 — final)

**Date:** 2026-07-01
**Branch:** `1420-decomp-phase-5` → `sandbox` (PR #1837)
**Issue:** [#1420](https://github.com/govtech-bb/gov-bb/issues/1420) [TECH-03]

## What

The last phase of #1420: a pure, behaviour-preserving decomposition of
`BuilderPage` (`apps/form_builder/app/routes/builder/index.tsx`) — the route's
god-component, which exceeded every fallow threshold (cc 26 / cog 67 / ~1128 fn
LOC, `critical`). Five sub-phase commits:

- **5a `useRecipeValidation`** — validation verdict (`isValidating` /
  `validateResult` / `lastSaveStatus`), `runValidation`, the pre-flight gates,
  and `dismiss`. Derives `editableSteps`/`hasEditableSteps` internally.
- **5b `useRecipeSave`** — submit + publish state and handlers
  (`handleSubmit`/`handleOpenPublish`/`handlePublish`/`handleClosePublish`).
- **5c `useDraftLifecycle`** — `handleLoad`/`applyAiRecipe`/`handleNew`/
  `handleDiscard`/`handleDuplicate` and the shared editor reset.
- **5d `useFormManagement` + `<FormManagementModals>`** — delete/disable/erase/
  enable state, handlers, and their modal JSX.
- **5e `<CollisionBanner>` + `<BuilderPanel>` + `<BuilderModals>`** — the JSX
  extraction that flattens the render.

Result: `BuilderPage` **cc 26→13** (clears cc>20), **cog 67→35**, **fn LOC
1128→507**; `index.tsx` 1207→569; useState/useReducer 33→13. Guard suite
679→709 (four new focused hook specs). `tsc -b apps/form_builder` no new errors,
full `nx build` green throughout.

## Why it looks the way it does

**Each hook owns its state AND exposes its setters.** `BuilderPage`'s hard part
was crosscutting state: the lifecycle handlers perform a "shared reset" that
clears validation + submit + preview + nav state together. So the extraction
sequence matters — 5a/5b expose `setValidateResult`/`setLastSaveStatus` and
`setSubmitSuccess`/`setSubmitError`, and 5c's `useDraftLifecycle` receives those
setters (plus the BuilderPage-owned preview/nav setters + `dispatch`) as params
rather than owning that state. That's why 5c has a ~19-param signature and was
done last of the hooks — it orchestrates state the others own.

**Hook extraction cuts state + LOC, not cognitive complexity — the JSX does.**
This mirrors the Phases 1–3 finding (Toolbar landed cc2/cog20 from its 23-prop
interface). After 5a–5d, `BuilderPage` still measured ~cc26/cog65: fallow scores
extracted functions separately, so pulling handlers out barely moved the parent.
What moved cognitive was **5e** — the render was dominated by conditionals (a
4-way `mainView` panel ternary, four `{flag && <Modal/>}` blocks, the collision
banner). Extracting those into children that **own their own conditional
internally** (return `null` / branch inside) lets `BuilderPage` render them
unconditionally, dropping cog 65→35 and cc 26→13.

**Cognitive stops at 35, not 15 — deliberately.** The residual is legitimate
orchestration: four `useMemo`s (idCollisions/resolvedFieldIds/uniqueness/rekey),
two `useEffect`s, hook wiring, and the inline light/dark toggle in the Toolbar
`leading` slot. None of it is a JSX conditional. Per the plan, this was reduced
as far as clean extraction allows rather than contorting child contracts to hit
a number. `<BuilderModals>` carries a ~40-prop interface — that prop-drilling is
the accepted cost of flattening the render; it is not itself cognitive
complexity in fallow's model.

**Modal-flag ownership split.** `isPublishOpen` moved into `useRecipeSave`
(only its publish handlers toggle it; only the JSX reads it). `isSubmitOpen`
stayed in `BuilderPage` — it's opened by the Save-draft click orchestration,
closed by the modal and by a lifecycle handler, so no single hook owns it.

**Verification gate was "no NEW type errors", not "green".** `tsc -b
apps/form_builder` is red at baseline on ~17 pre-existing spec-only errors
(Vitest-4 `Mock` fallout), invisible to CI because form_builder isn't in the
root `tsc -b` references. Each sub-phase was gated on `comm -13 baseline current`
being empty. Mocking `createServerFn` fetchers in the new specs used the bare-
`vi.fn` delegating pattern (not `vi.mocked`) to stay type-clean.

## Notes / follow-ups

- Phase 4 (#1834) was merged first to unblock this (it only touched
  `content/edit.tsx`, so Phase 5 was independent).
- Optional further trim: extracting the Toolbar light/dark toggle into its own
  component would shave a few cog points, but won't reach 15 without reshaping
  child contracts — not pursued.
- Baseline validated against `origin/sandbox @ 6680adaf`; the worktree branched
  from the remote (local `sandbox` was stale).
