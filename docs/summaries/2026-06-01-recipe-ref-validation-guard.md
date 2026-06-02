# Recipe ref validation guard — close every ingest path against unresolvable refs

## Context

Implemented from `docs/plans/recipe-ref-validation-guard.md` on worktree branch
`worktree-feat+504-recipe-ref-validation-guard` (merges into `sandbox`). Issue
[#504](https://github.com/govtech-bb/gov-bb/issues/504).

A recipe with a ref that resolves nowhere in the registry passes the Zod schema
(which checks ref *format* only, by design — 0010/0017) and detonates lazily at
render time. #349 added `non-nationals-secondary-entry/1.1.0.json` carrying
pre-migration slash refs; the guard that should have caught it
(`recipe-registry-refs.spec.ts`) was `nx affected`-gated, #349's CI didn't
exercise it, and the bad recipe sat latent on `sandbox` breaking *other* PRs.

The goal: no recipe with an unresolvable ref reaches runtime, caught at every
ingest point (builder publish, AI convert, hand-authored repo files), strongest
where the live catalog is available.

## What we did

- **Shared primitive** — extracted `collectUnknownRefs(recipe, catalog)` into
  `packages/form-builder` (`resolution.ts`); `hydrateForm` and the API
  `validateHandler` now share one definition of "does this ref resolve?".
- **Publish gate** — `publishRecipe` (`apps/form_builder/app/server/publish.ts`)
  calls `/builder/registry/validate` and throws before opening any branch/PR.
- **AI convert warning** — `convertHandler` (`apps/form_builder_api/.../ai.ts`)
  returns `unresolvableRefs`; the editor loads the draft anyway and surfaces them
  in the existing `ValidationPanel` as a non-blocking warning
  (`index.tsx` `applyAiRecipe`, `-ai-sidebar.tsx`).
- **CI hardening** — fixed `scripts/validate-recipes.ts`'s dead root path and
  folded the ref/slash/orphan guards into it (pure logic in
  `recipe-ref-guards.ts`); deleted the affected-gated spec. See ADR
  [0026](../decisions/0026-repo-recipe-integrity-guards-must-be-always-run.md).
- Section E (vestigial `BUILTIN_COMPONENTS`) deferred to
  [#515](https://github.com/govtech-bb/gov-bb/issues/515).

## Why we did it that way

- **Warn-but-load on AI convert, not reject.** The obvious path — reuse
  `applyAiRecipe`'s existing strict `/validate` gate, which rejects any invalid
  recipe — was wrong for the convert case. An author who asked the AI to build a
  form wants to *see and fix* the bad field in place, not get an opaque rejection
  and an untouched editor. So when convert flags `unresolvableRefs`, `applyAiRecipe`
  **skips** the hard `/validate` gate (it would only fail on the very refs we're
  choosing to tolerate), loads the draft, and lights up the validation panel.
  Deploy stays the hard gate. `deserializeRecipe` already tolerates unknown refs
  (it stores the ref string), so loading a bad-ref draft is safe; the id-collision
  pre-flight still blocks unconditionally because that's a structural problem the
  editor can't represent.

- **Ref collection on raw AI output is wrapped in try/catch.** `collectUnknownRefs`
  was previously only ever called on schema-validated recipes. The convert handler
  calls it on *unvalidated* model output, after an expensive `chat()`. A malformed
  step (missing `elements`) or a transient catalog/DB error must not 500 the call
  and discard the reply — so it degrades to `unresolvableRefs: []`; the bad recipe
  is still caught downstream.

- **The CI guard moved into an always-run script, not a better-scoped test.**
  Tightening the nx-affected config or adding the spec to more projects would have
  papered over the real lesson: a guard protecting a *shared committed artifact*
  must run on every PR, full stop. Hence the always-run `validate-recipes` job is
  now the single source of truth (ADR 0023). It must stay DB-free, so it resolves
  against the static `BUILTIN_REGISTRY` and falls back to ban-lists for slash refs;
  full-catalog resolution stays at the server `/validate` endpoint.

- **Pure guards split into `recipe-ref-guards.ts`.** The `scripts/` jest config is
  bare (no tsconfig path mapping), so a spec importing the registry-importing
  script failed to resolve `@govtech-bb/registry`'s types. Splitting the pure
  checks into a workspace-import-free module let them unit-test in isolation while
  the runner wires in the real `BUILTIN_REGISTRY`.

## What we almost got wrong

The always-run guard, once actually pointed at the recipes directory, immediately
failed on a **second** latent bad ref — `components/generic-show-hide` in
`post-office-redirection-business/1.1.0.json` (correct: `components/show-hide`).
It had slipped past the affected-gated spec exactly like #349's. We'd have shipped
a green-looking guard that was really just still not running against that file had
we trusted the "OK" from the old `process.cwd()/recipes` no-op. Fixed the ref.

## Open questions

- The new `scripts/validate-recipes.spec.ts` unit tests don't run in CI's
  `nx affected -t test` (scripts isn't an nx project — pre-existing, shared with
  the sibling scripts specs). The guard *logic* is still enforced at runtime by
  the always-run job; only the unit assertions are local-only. Left as-is by
  decision; revisit if scripts gains an nx project.
- `applyAiRecipe`'s warn-but-load branch has no `index.spec` integration test —
  that spec stubs `serializeRecipeDraft` to a constant, forcing `draftsEqual`
  true and short-circuiting the AI path. Covered at its two real boundaries (API
  computes refs, sidebar forwards them) plus type-checked wiring.
