# Form builder — validate on Save draft / Deploy click — Implementation Session

**Date:** 2026-05-28
**Branch:** `form-builder/validate-on-save-click` (off `sandbox`, merges back into `sandbox`)
**Issue:** supersedes [#344](https://github.com/govtech-bb/gov-bb/issues/344)
**Plan:** `docs/plans/form-builder-validate-on-save-click.md`
**ADR:** `docs/decisions/0017-builder-commit-actions-self-validate-on-click.md`

## Context

Save draft and Deploy were disabled until the user clicked a separate
**Validate** button and got a green result (`canSubmit`). That gate read a
cached `validateResult`, which was never reset on edit — so a green validate
followed by an edit-into-invalid left the buttons enabled against a stale result
(#344). The planned fix (`form-builder-validate-gate-reset.md`) kept the gate and
reset the cache on every edit, but still left an in-flight race and the two-click
flow. We removed the gate entirely instead.

## What we did

- **`handleValidate` → `runValidation()`** (`routes/builder/ui/index.tsx`): same
  state-setting, but every path (3 pre-flight early returns, server-validate,
  catch) now `return`s the `RecipeValidateResponse` it computed.
- **Two click handlers**: `handleSaveDraftClick` / `handleDeployClick` `await
  runValidation()` and open the SubmitModal / call `handleOpenPublish()` only
  when `result.valid`.
- **Removed `canSubmit`** — derivation, the now-unused `allEditableStepsHaveFields`,
  and the `Toolbar` prop. The Save draft / Deploy `disabled` props (`-toolbar.tsx`)
  now carry only in-flight guards (`isValidating || isSubmitting` /
  `… || isPublishing`).
- **New render test** (`index.spec.tsx`): renders the full `BuilderPage` — invalid
  draft → click Save draft → pre-flight error shows, SubmitModal stays closed,
  server never called; valid draft → click → SubmitModal opens, `validateRecipe`
  called once. 186 form_builder tests total (was 184).
- Deleted the superseded `docs/plans/form-builder-validate-gate-reset.md`.

## Why we did it that way

- **Return the result instead of reading state.** React state updates are async,
  so a click handler can't read `validateResult` right after triggering it.
  Making `runValidation` return its computed result lets Save/Deploy branch on a
  fresh validation synchronously — no effect, no extra ref, no second render.
- **Validate-on-click beats reset-on-edit (#344).** Re-validating the live draft
  every click removes the stale-cache bug at the root and sidesteps the in-flight
  race #344's reset approach still had. See ADR 0017.
- **`canSubmit`'s pre-flight checks were redundant.** `hasEditableSteps`,
  every-step-has-fields, and no-collisions were *also* pre-flight checks inside
  `runValidation`, each with a friendly message. With validate-on-click those
  cases fail validation naturally and surface in the panel + ✗ pill, so the
  separate gate added nothing. `hasIdCollisions` was kept — it still drives the
  red duplicate-ID banner.

## What we almost got wrong

- **No existing test renders a `createFileRoute` route component** — the sibling
  specs all render standalone components with props. Rendering `BuilderPage`
  needed a minimal `@tanstack/react-router` mock (so `Route.useLoaderData()` /
  `useSearch()` / `useNavigate` resolve), plus mocks for the server fns and the
  slow `useFormsList` GitHub waterfall.
- **Driving the UI to a *valid* draft is impractical.** A valid draft needs an
  editable step with a field; building that through real FieldPicker clicks
  depends on the registry catalog. Instead the valid case seeds the reducer's
  `EMPTY_DRAFT` (via a swappable getter mock) and stubs the catalog-dependent
  helpers (`findRecipeIdCollisions`, `serializeRecipeDraft`, `resolveFieldIds`),
  so the test exercises the new "click ⇒ validate ⇒ open modal" path without
  coupling to id-resolution.
- **"Submit Recipe" appears twice in the modal** (heading + submit button), so the
  open-modal assertion targets the `<strong>` heading specifically.
- **Worktree had no `node_modules`.** New worktrees here don't get a pnpm install;
  symlinked the main checkout's `node_modules` (form_builder's jest config maps
  `@govtech-bb/*` to the worktree's own `packages/*/src`, so tests still exercise
  worktree source). The symlink is stale enough that `tsc -b` trips on
  `@govtech-bb/expressions` in `apps/api` — an artifact, not part of this change.
  The symlink is not committed.

## Verify

- `pnpm exec nx test form-builder-app` → 186 pass (was 184). RED watched first:
  both new tests failed against the pre-change `canSubmit` gate, then passed.
- `pnpm exec nx build form-builder-app` → clean (this app isn't in the `tsc -b`
  graph; ts-jest with diagnostics is its type-check, and it compiles the edited
  `index.tsx` / `-toolbar.tsx`).
- Browser smoke (fresh builder → valid recipe → Save draft without clicking
  Validate opens the modal; break a step → Save draft shows the error and keeps
  the modal closed; same for Deploy; Validate still works standalone) is the
  user's to run before merge, per house practice (`feedback_user_smoke_tests`).

## Open questions

- None blocking. The toolbar pill goes ✓ Valid → ✓ Submitted on a successful
  save click; that sequencing is unchanged from before and reads fine.
