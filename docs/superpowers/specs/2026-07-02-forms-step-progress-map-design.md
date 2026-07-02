# Design: Step progress "route map" for `apps/forms`

**Date:** 2026-07-02
**Status:** Design — awaiting review
**Area:** `area:frontend` · `subsystem:forms`

## Summary

Add a step progress indicator to the multi-step form runtime in `apps/forms` so
applicants can see where they are in a form and jump back to earlier steps. It is
styled as a "route map" (a metro/train-line): each **step title** is a node, with
connectors showing the path. It handles the dynamic nature of these forms —
conditional steps (`stepConditionalOn`) that appear/disappear, and repeatable
steps that grow at runtime — by rendering nodes as **titles rather than a
"3 of 7" count**, and by treating repeatable instances as a **branch line** off
their parent node.

## Motivation

Multi-step gov forms benefit from a visible progress indicator (orientation,
reduced abandonment). Today there is **no** step indicator in `apps/forms`, and
the design system package (`@govtech-bb/react`) ships none, so this is a net-new
component.

## Key insight — derive, don't rebuild

The original idea framed this as "an async linked list synced with form state so
there's no delay." **We are not building a new state machine.** The runtime
*already* computes everything the map needs, synchronously and cheaply:

- `getVisibleSteps(formSteps, formApi)` (`apps/forms/src/lib/form-builder/helpers/behavior-helper.ts:121`)
  returns the **ordered, filtered list of currently-visible steps** — the "linked
  list," already materialized as an array. It is memoized in the route component
  and recomputes only when a field that *gates* a step changes
  (`apps/forms/src/routes/forms/$formId/index.tsx:303-319`) — not on every
  keystroke.
- `useStepGuard(...)` (`apps/forms/src/hooks/use-step-guard.tsx:26`) exposes
  `currentIndex` (derived from the `?step=` URL param) and `navigateToStep`.
- `isStepAccessible(...)` (`apps/forms/src/lib/session-storage.ts:154`) and the
  `completedSteps_${formId}` store answer "which nodes are reachable / done".

The map is therefore mostly a **presentational component derived from state that
already exists**, wrapped in a `useMemo`. This directly satisfies the "no delay"
goal — the derivation is O(number of steps) and runs off the same memoized inputs.

### Critical constraint: single source of truth

There are **two condition engines** in the repo. The live renderer uses
`checkConditionalOn` (OR-first-match semantics, `behavior-helper.ts:15`) via
`getVisibleSteps`; a separate `evaluateFormConditions` (AND semantics,
`packages/form-conditions/src/index.ts`) is used only by `apps/api`/`apps/chat`.
**The map MUST consume the exact `visibleSteps` array the renderer already
computes** — never re-derive visibility through the other engine — or the map
will disagree with the form.

## Architecture

New component lives under `apps/forms/src/components/step-progress-map/`. No
changes to `@govtech-bb/form-types` (no schema change) and no changes to the
shared `@govtech-bb/react` package.

### 1. Pure model builder (the testable core)

```
buildProgressModel(visibleSteps, currentStepId, completedStepIds) -> ProgressModel
```

- **Input:** the same `ClientFormStep[]` (`visibleSteps`) passed into
  `FormRenderer`, the current step id, and the completed-step ids
  (`getCompletedSteps(formId)`).
- **Output:** an ordered list of `ProgressNode`s. A node is either:
  - a **primary node** (one per visible non-repeatable step), or
  - a **repeatable group node** whose `instances[]` are the branch sub-nodes.
- **Repeatable grouping:** repeatable instances are flat synthetic entries with
  ids `baseId~N` (concatenator `~` = `repeatStepConcactenator`,
  `apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts`). The builder
  groups consecutive `baseId~N` entries under one group node keyed on `baseId`,
  using the base step's `instanceLabel`/title for labels.
- **State per node** (`done | current | locked`):
  - `current` — the node (or, for a group, any of its instances) is `currentStepId`.
  - `done` — the step id is in `completedStepIds`. A group is `done` only when all
    its instances are done.
  - `locked` — otherwise (not yet reachable; no skip-ahead).
- **Label:** uses the step's **resolved** title, so conditional titles (#871) and
  repeat instance markers (`getInstanceMarker`) are reflected and update reactively.

This function is pure and unit-tested in isolation.

### 2. Node inclusion / tail handling

The map renders a node for each visible step **except** the conventional
non-content ids, reusing the precedent set in `apps/forms/src/components/review.tsx:23-28`:

- `intro` and `submission-confirmation` are **excluded** from the node list.
- `check-your-answers` (and `declaration`, when present) collapse into a single
  terminal **"Review & submit"** node.

Additionally, the **map component is not rendered at all** when the current step
is `intro`, `check-your-answers`, or `submission-confirmation` — those pages are
the intro / overview / terminal screens (the "hide on check-your-answers"
requirement). It renders on all content steps.

### 3. Navigation — validate-on-jump (model B)

Backward navigation to any **done** node is free. Forward navigation to a done
node that sits ahead of the current step is gated by **live validation of the
steps in between** (not by the stale completion flag alone):

- Extract the per-step validation loop currently inline in `handleContinue`
  (`apps/forms/src/components/form-renderer.tsx:278-307`) into a reusable
  `validateStep(stepId): boolean` (runs `form.validateField(fieldId, "submit")`
  for each field of the step). This is the "same logic as the next-step
  validator" and resolves the standing TODO at `use-step-guard.tsx:83`.
- Clicking a node walks steps from `currentIndex` toward the target, running
  `validateStep` on each intermediate step. If all pass, navigate to the target.
  If one fails, **stop on the first failing step and surface its errors** (same
  behaviour as pressing Continue on that step).
- Node *appearance* stays optimistic (done = highlighted/clickable); the *jump
  action* enforces validation. This closes the stale-completion hole (editing an
  earlier answer that breaks a later step) without pre-emptively wiping progress.

Locked nodes are non-interactive.

### 4. Presentation & responsiveness

One responsive component, two layouts driven by CSS:

- **Desktop (horizontal route map):** titled nodes on a horizontal line;
  repeatable group expands into numbered branch sub-nodes when the current step is
  inside the group, otherwise collapses to a single node with an instance count.
- **Mobile (collapsible vertical stepper):** starts **collapsed** as a slim sticky
  bar showing the current step title, a chevron, and a segmented meter (one segment
  per visible step; green = done, blue = current; no numeric count). Tapping
  expands, **inline (accordion)**, into the full vertical list with repeatable
  instances indented under their parent. Inline was chosen over an overlay for
  simplicity and accessibility.

Rendered inside `FormRenderer` near the page header
(`apps/forms/src/components/form-renderer.tsx:481-506`).

### 5. Animation

- Conditional insert/remove: a node (and its connector) transition **width**
  (desktop) or **height** (mobile) + opacity to/from zero, ~450ms eased, so the
  line closes the gap smoothly. A newly-inserted node gets a brief pulse.
- To know what entered/left, the component keeps the **previous visible-step list**
  in local state and diffs it against the current one on change.
- **Respects `prefers-reduced-motion`:** with it enabled, insert/remove becomes a
  near-instant cross-fade — no slide, no pulse.
- **Never yanks the current node:** when a step inserts *before* the current step,
  keep the current node anchored in view rather than letting the map jump under
  the user.

## Accessibility

- The map is a landmark: `<nav aria-label="Form progress">` wrapping an ordered list.
- Current node carries `aria-current="step"`; done nodes are real buttons/links;
  locked nodes are non-interactive (`aria-disabled`), removed from the tab order.
- Mobile collapsed bar is a `<button>` toggling `aria-expanded` on the list.
- Fully keyboard navigable; motion gated by `prefers-reduced-motion`.

## Edge cases

- **Repeatable group state:** `done` only when every instance is done; `current`
  when the current step is any instance; clicking a collapsed group navigates to
  its first instance (subject to validate-on-jump).
- **Adding/removing repeat instances stays in the form body**, not the map — the
  map shows existing instances only. (See Decision D1.)
- **Conditional title changes** re-label the node reactively via the resolved title.
- **A step becomes hidden while you're on it:** already handled by the
  `useStepGuard` redirect effect (`use-step-guard.tsx:94-130`); the map just
  re-derives from the new `visibleSteps`.

## Testing strategy / success criteria

Run the forms project's Vitest suite via nx (e.g. `pnpm exec nx run forms:test`)
plus `tsc -b` for types.

1. **`buildProgressModel` unit tests** → done/current/locked assignment; repeatable
   grouping (`baseId~N` → one group with instances); group `done`-only-when-all;
   node exclusions (`intro`, `submission-confirmation`) and the "Review & submit"
   tail collapse; labels reflect resolved/conditional titles.
2. **`validateStep` + jump-walk tests** → forward jump lands on target when all
   intermediate steps pass; stops on the first failing step and surfaces its
   errors; backward jump to a done node is unconditional.
3. **Component/render tests** → correct node states rendered; locked nodes not
   interactive; mobile collapsed↔expanded toggle; `aria-current`/`aria-expanded`.
4. **Regression** → `handleContinue` still validates identically after the
   `validateStep` extraction (no behaviour change to the Continue button).

Verify no new `tsc -b` errors and that the forms suite passes.

## Out of scope (YAGNI)

- **Stable "phases"/sections model** and a **GOV.UK task-list** hub — deferred to a
  possible v2 if real forms prove too branchy. Would require a schema change to
  `FormStep` (a `section`/`phase` field) and recipe/form-builder support.
- No changes to persistence, the condition engines, `@govtech-bb/form-types`, or
  `@govtech-bb/react`.
- Adding repeat instances from the map (kept in the form body flow).

## Decisions to confirm

- **D1 — "Add another" not actionable from the map.** The mockups showed a
  "+ Add another" affordance in the branch. Driving it from the map would duplicate
  the repeatable add/remove logic in `handleContinue`
  (`form-renderer.tsx:310-358`). Recommendation: the map shows existing instances
  only; adding/removing stays in the form body. Confirm this is acceptable.
- **D2 — Collapsed mobile meter.** Keep the segmented meter (shown, approved) vs
  title + chevron only. Proceeding with the meter.
- **D3 — Desktop/mobile breakpoint.** To be set to match the forms app's existing
  responsive breakpoints during implementation.
