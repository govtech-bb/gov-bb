# 0059 — The builder sources launch-gate visibility from the published recipe when the working copy is silent

**Date:** 2026-06-26
**Status:** Accepted
**Related:** [#1682](https://github.com/govtech-bb/gov-bb/issues/1682) (Phase 2: form-builder visibility control), [#1676](https://github.com/govtech-bb/gov-bb/issues/1676) (visibility gate ported to the versionless model), [#1646](https://github.com/govtech-bb/gov-bb/issues/1646) (Phase 1: `meta.visibility`), [#1196](https://github.com/govtech-bb/gov-bb/issues/1196) (DB scratch row is the working copy), ADR-0057 (recipe versioning removed — one flat file per form).

## Context

#1196 established that the form builder prefers the **DB scratch row** (the
in-progress working copy) over the published canonical flat file when loading a
form (`resolveStoredRecipe` in `apps/form_builder/app/server/forms.ts`).
#1646/#1682 added `meta.visibility` (`public | preview | draft`) to the recipe
and a builder control to edit it; `getRecipeVisibility` reads
`recipe.meta?.visibility ?? "public"`.

These two facts collided. For the forms flagged under #1517,
`meta.visibility: "preview"` was written **directly into the published flat
files** (#1676) — it never travelled through the builder's save flow, so those
forms' DB scratch rows carry no `meta`. Because the builder prefers the DB
scratch row, `getRecipeVisibility` saw no `meta` and fell back to its
hard-coded `"public"` default. The builder therefore displayed "public" for a
form the platform was actually gating as "preview" — and an author deploying
from that screen would have baked `public` into the recipe, accidentally
launching a preview-gated form to the public.

The root question: when the working copy is silent on `meta.visibility`, what is
the source of truth — a hard-coded default, or the published recipe?

## Decision

**`meta.visibility` is a launch-gate fact owned by the published recipe. The
builder's "DB scratch wins" precedence (#1196) governs form *content*; it does
not extend to launch-gate metadata. When the loaded working copy has no `meta`,
the builder hydrates it from the published recipe rather than defaulting to a
hard-coded value.**

Concretely, `resolveStoredRecipe` backfills `meta` from `getPublishedRecipe`
only when the DB draft row's `meta` is absent. A working copy that already
carries `meta` — any value an author set in the builder — always wins, so an
in-progress edit is never clobbered. A form with no published recipe (a
never-deployed draft) stays metaless, which `getRecipeVisibility` treats as
`public`.

## Consequences

- The builder's visibility control reflects the form's live launch gate, not a
  default that silently diverges from what the platform enforces. Authors can't
  accidentally re-launch a gated form by deploying from a stale screen.
- The #1196 precedence is now explicitly scoped to *content*. Future work that
  loads recipes must preserve meta hydration on load and must not "simplify"
  absent-`meta` into a hard `public` default in the builder.
- Hydration costs one extra published-recipe fetch, incurred only in the legacy
  absent-`meta` case; forms saved through the builder post-#1682 always carry
  `meta` and skip it.
- This is also a safety net, not just a migration: the durable invariant is that
  every builder save and deploy carries `meta` (Phase 2), so new divergence
  should not arise — but the hydration covers both pre-existing rows and any
  future out-of-band edit to a published recipe.
