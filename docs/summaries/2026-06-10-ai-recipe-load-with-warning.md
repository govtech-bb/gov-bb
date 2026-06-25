# AI-generated form with a validation error loads with a warning instead of being rejected (#1051)

## Context

[#1051](https://github.com/govtech-bb/gov-bb/issues/1051) reported that when the
AI sidebar generates (or converts an upload into) a form recipe, `applyAiRecipe`
ran a validate-then-load gate that **hard-rejected** on a server contract-
validation failure or an id collision — the draft never reached the builder, so
the user had to re-upload/re-generate from scratch over a single issue. The
sidebar is built for iterative tweaking via follow-up prompts, which you can
never reach if the first generation is rejected.

Resolved on `1051-ai-recipe-load-with-warning` (targets `sandbox`).

## What we did

- `apps/form_builder/app/routes/builder/index.tsx` — restructured `applyAiRecipe`
  so recipe-level defects load-with-a-warning instead of returning
  `{ applied: false, error }`:
  - Contract-validation issues (`!raw.ok`) are pushed into a `warnings`
    accumulator (with the existing `unresolvableRefs`) and shown in the
    validation panel after `LOAD_DRAFT`; `lastSaveStatus` set to `"error"`.
  - The id-collision pre-flight's hard reject was **removed entirely**.
  - The structural-throw guard (`buildLoadArgs` throws) and the validate-*request*
    failure (`catch`) stay hard errors — nothing to load.
  - Updated the leading comment block to describe the new behaviour.
- Tests (`index.spec.tsx`): added `describe("BuilderPage — AI apply loads with a
  warning (#1051)")` driving the real `AiSidebar` Edit Form flow — contract-
  invalid load, id-collision load, unresolvable-refs regression, unreadable
  hard-error, validate-request hard-error, no-op, declined-confirm, and
  Deploy-stays-blocked. Added `editRecipe` (+ upload trio) to the convert mock and
  made `findRecipeIdCollisions` swappable per test via a `mockCollisions` var.
- Recorded the convention in ADR 0047.

## Why we did it that way

- **Diverged from the plan on id collisions.** The plan said to push collision
  issues into the same `warnings` list as contract issues. But the builder
  already renders an **always-on collision panel** (`hasIdCollisions`,
  index.tsx:1001) computed from the live draft — once a colliding draft loads,
  the collision shows there automatically. Routing it through `validateResult`
  too would render the same collision **twice**. So we just stopped the
  hard-reject and let the existing panel surface it; the collision block was
  removed from `applyAiRecipe` rather than softened. Acceptance criteria still
  met: draft loads, collision visible, Deploy/Save re-check as hard gates.
- **Kept two genuine hard errors.** A structurally-unreadable recipe (deserialize
  throws) and a failed validate *request* (infrastructure, not a recipe defect)
  have nothing to surface, so they keep reporting `{ applied: false, error }` →
  the sidebar's red banner.
- **`applied: true` on an invalid recipe is intentional** — the sidebar shows
  "Applied to the editor — not saved yet" and the author fixes it in place. The
  established principle (Deploy is the hard gate, #504) is generalised: load
  surfaces permissive, publish/save surfaces strict (ADR 0047).
- **Test assertions matched the real panels.** The id-collision test asserts the
  always-on panel's heading ("Duplicate IDs must be fixed…") and its split
  `is used by 2 fields` text — not `formatCollisionIssues`' quoted string, which
  is only used by the *other* panel. Used `findByDisplayValue("Edited Form")` to
  prove `LOAD_DRAFT` actually fired; `window.confirm` stubbed to `true` because a
  `VALID_DRAFT` seed reads as dirty and trips the overwrite confirm.

## Follow-up

- `nx test form-builder-app` (573 passed), `tsc -b`, and `nx run-many -t build
  --exclude=landing,cms` all green this session.
- Worth a manual smoke on the PR preview: prompt the AI to generate a form with a
  known invalid field, confirm it loads with the issue in the panel and Deploy
  stays disabled, then fix it with a follow-up prompt.
