# Auto-open the first step when a saved form is loaded

**Issue:** [#568](https://github.com/govtech-bb/gov-bb/issues/568)

## Context

Opening a saved form in the form builder dropped the author on the "Select or
add a step to begin" placeholder — they had to click a step in the left panel
before they could edit anything. Both load paths (`handleLoad` from the Form
Picker, `applyAiRecipe` from the AI sidebar) reset `selectedStepId` to `null`.

## What we did

- Added an exported `firstStepId(draft)` helper to `-recipe-reducer.ts`, next to
  `isRequiredStep`.
- `handleLoad` and `applyAiRecipe` now call `setSelectedStepId(firstStepId(...))`
  instead of `setSelectedStepId(null)`.
- `handleNew` left unchanged — a brand-new form is only the pinned required
  steps, so it keeps the placeholder.
- Unit-tested `firstStepId` in `-recipe-reducer.spec.ts` (4 cases).

## Why we did it that way

**The ordering wrinkle.** `LOAD_DRAFT` normalizes steps to
`[...editable, ...required]`, but the draft handed to the load handlers is
*pre*-normalization — so a naive `loadedDraft.steps[0]` could pick a step the
reducer then moves (e.g. a required step that was authored first in the incoming
array). `firstStepId` therefore reuses the reducer's own rule: first editable
(non-required) step, then first step overall, then `null`. Helper and reducer
share the `isRequiredStep` predicate, so they can't drift.

This is safe across the pre/post-normalization boundary because `LOAD_DRAFT`
only reorders and back-fills steps — it never changes or drops an incoming
`stepId`. Any id `firstStepId` returns is guaranteed to still exist in the
normalized state the editor selects against, and the `?? null` fallback matches
the editor's own `selectedStep ?? null` handling for an empty-steps draft.

**Helper at the call site, not a `useEffect`.** Considered watching the
normalized `draft` in an effect and selecting after dispatch. Rejected: hard to
scope to "only on load" (it would also fire on unrelated draft edits) and it
reintroduces a flash of the placeholder before selection. Computing the id at
the call site is synchronous and scoped.

**Testing trade-off.** The `firstStepId` ordering logic — the only non-trivial
part — is fully unit-tested. The call sites are a type-checked one-line swap
calling that pure function. We deliberately did *not* add a component-level test
for the `handleLoad`/`applyAiRecipe` wiring: those flows are RPC-coupled
(`getRecipe` + deserialization through `FormPicker`'s internals) with no existing
component-test coverage in this codebase, so a test would require heavy mocking
of internals for little marginal confidence. Flagged for review; both the
reviewer and the author landed on "optional, not blocking."

## Open questions

None. Manual verification of the four user-visible flows (Form Picker load, AI
apply, new form, required-only form) was deferred to the author.
