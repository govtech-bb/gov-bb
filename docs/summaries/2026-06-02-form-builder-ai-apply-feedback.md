# Form Builder AI — make recipe-apply outcomes visible

**Date:** 2026-06-02
**Issue:** [#571 — AI assistant generates a form but doesn't apply it to the builder canvas](https://github.com/govtech-bb/gov-bb/issues/571)
**Plan:** `docs/plans/form-builder-ai-apply-feedback.md`

## What changed

When the AI assistant produces a recipe, the sidebar now reports what happened
for **every** outcome instead of only on error. The user always sees one of:
applied, returned-unchanged, couldn't-read-the-recipe, or a validation error.

- `ApplyRecipeResult` gained `reason?: "unchanged" | "cancelled"`; `applyAiRecipe`
  (`index.tsx`) returns `"unchanged"` on the `draftsEqual` no-op and `"cancelled"`
  on the dirty-form overwrite decline.
- A new `"status"` role on `ChatMessage` renders as a persistent, subtly-styled
  transcript entry (distinct from the transient red error box), so the
  conversation keeps a history of what was applied.
- `handleResponse` emits a status line per outcome: `✓ Applied…`, "returned the
  form unchanged…", silent on cancel, and the existing red box on error.
- The raw ` ```json ` recipe blob is stripped from the chat bubble when a recipe
  was extracted (placeholder "Generated a form recipe." if the reply was *only*
  the blob). When no recipe was extracted, the reply is left untouched so the
  blob remains as a diagnostic — and a fenced ` ```json ` block with a `null`
  recipe is flagged as an extraction failure.

## Why it looks this way

**Why visibility instead of a root-cause fix.** The apply wiring is correct and
unit-tested end-to-end; the bug could not be reproduced locally because the AI
endpoint isn't reachable here. Two silent paths can produce the reported symptom
(the `draftsEqual` no-op and the `null`-recipe early-return). Rather than guess
which one fires in production, we made *all* outcomes visible — this fixes the UX
complaint regardless of root cause and turns the next reproduction into a
self-diagnosing, user-visible state. A follow-up may still be needed if a repro
later shows `draftsEqual` is firing when it shouldn't; the visible status is what
will let us confirm that.

**Why no "Apply" button.** Decided in planning — auto-apply stays; we added
feedback around it rather than a manual gate.

**Why strip the JSON blob.** The blob in the bubble is what made the result feel
"stuck in the chat." It's already captured by `extractRecipe`, so showing it is
pure noise once a recipe applied. The user confirmed keeping this (it was the one
change that alters what they see of the model's reply).

**Why the `JSON_BLOCK` regex has a `hasRecipeJson` wrapper.** The regex is
`g`-flagged (needed so `.replace` strips every block), and `g`-flagged regexes
carry `lastIndex` state across `.test()` calls. `hasRecipeJson` resets
`lastIndex = 0` before testing so detection never depends on a prior call —
avoiding a subtle stateful-regex bug.

**Scope deliberately excluded.** `extractRecipe` hardening stays out: the user
reports clean ` ```json ` output, and the extraction-failed status now makes any
miss visible rather than silent. The detection heuristic intentionally matches
only an explicit ` ```json ` fence — relaxing it risks stripping legitimate prose
code fences.

## Verification

TDD: 7 new sidebar tests written failing first, then made green (applied,
unchanged, cancelled, extraction-failed, conversational, JSON-strip, placeholder).
Full gate green — `nx run-many -t build --exclude=landing` (offline) and
`nx run-many -t test` (300 tests across all suites). No live smoke against the AI
endpoint (not reachable locally — the reason this approach was chosen).
