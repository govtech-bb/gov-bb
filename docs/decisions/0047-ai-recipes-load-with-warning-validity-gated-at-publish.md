# 0047 — AI-generated recipes load with a warning; validity is gated at Save/Deploy, not at load

**Date:** 2026-06-10
**Status:** Accepted

## Context

The AI sidebar generates a form recipe (from an Edit-Form prompt or a PDF/image
upload) and hands it to the builder's apply pipeline (`applyAiRecipe` in
`apps/form_builder/app/routes/builder/index.tsx`). That pipeline ran a
*validate-then-load* gate: an id-collision pre-flight and a server contract
validate both **hard-rejected** — returning `{ applied: false, error }` so the
draft never reached the editor.

This was a poor fit for how the sidebar is meant to be used. A user uploads or
generates an entire form, and over a single validation issue the whole thing is
thrown away; they must re-upload or re-generate from scratch. But the sidebar is
*built* for iterative tweaking via follow-up prompts — and you can never reach
that loop if the first generation is rejected outright (issue #1051).

There was already a precedent for the better behaviour in the same function:
`unresolvableRefs` (refs the convert endpoint couldn't resolve against the full
catalog) was described in-code as "the one tolerated defect" — rather than
reject, it loaded the draft and lit up the validation panel, with **Deploy** as
the hard gate (ADR-adjacent #504). The question was whether to generalise that
treatment to the other recipe-level defects, and what stays unloadable.

## Decision

**The builder's load/edit surfaces are permissive. An AI-generated recipe with
recipe-level defects loads into the editor with the defects surfaced
non-blockingly. Recipe validity is enforced only at the Save draft / Deploy
gates — never at load.**

Concretely, in `applyAiRecipe`:

1. **Contract-validation failures** (`validateRecipe` returns `!ok`) no longer
   reject. The issues are collected and shown in the validation panel; the draft
   loads, `lastSaveStatus` is set to `"error"`.
2. **Id collisions** no longer reject. The draft loads and the collision is
   surfaced by the **always-on collision panel** (`hasIdCollisions`, computed
   from the live draft) — *not* re-collected into the validation panel, which
   would render the same collision twice.
3. **Unresolvable refs** keep their existing load-with-warning behaviour (the
   precedent this generalises).
4. **Only two cases stay hard errors**, because there is genuinely nothing to
   load: a structurally-unreadable recipe where `buildLoadArgs` /
   `deserializeRecipe` *throws*, and the `validateRecipe` **request itself**
   failing (an infrastructure error, not a recipe defect — there is no
   recipe-level issue to show).
5. The no-op guard (an unchanged recipe applies nothing) and the dirty-overwrite
   confirm are unchanged and keep their order.

Save draft and Deploy re-run their own hard checks (`findRecipeIdCollisions`,
the contract validate, the unsaved-changes gate), so an invalid form can never
be published.

## Consequences

- **Deploy (and Save) remain the single source of truth for validity.** A future
  AI-builder ingest path (new upload formats, an import button, a "fix it for me"
  action) must follow the same shape: load-with-warning, never reject on a
  recipe-level defect. Point new work at this record rather than re-introducing a
  load-time hard reject.
- The split is: **load surfaces are permissive, publish/save surfaces are
  strict.** A defect that blocks publish must be *visible* in the editor (a
  panel), not *fatal* to loading.
- `applyAiRecipe` returning `{ applied: true }` on an invalid recipe is
  intentional — the sidebar shows its "Applied to the editor — not saved yet"
  status and the author fixes the form in place or with a follow-up prompt. The
  `{ applied: false, error }` path is now reserved for the two unloadable cases
  above.
- Collisions are surfaced once, by the always-on collision panel. If that panel
  is ever removed or gated, the collision branch in `applyAiRecipe` must take
  over surfacing them — they must not silently disappear from the editor.
