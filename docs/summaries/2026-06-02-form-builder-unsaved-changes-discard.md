# Form builder — clearer "unsaved changes" + Discard

Plan: `docs/plans/form-builder-unsaved-changes-discard.md` · Issue: [#628](https://github.com/govtech-bb/gov-bb/issues/628)

## Context

The form builder has no autosave: AI-applied recipes and manual edits live only
in the in-memory reducer until **Save draft**. The AI sidebar said "✓ Applied
the changes to your form", which reads as "saved" but isn't — reload and the
work is gone. There was also no quick way to throw away unsaved edits short of
**New**. The existing `isDirty` flag was a misnomer ("the form is non-empty"),
stayed `true` right after a save, and so couldn't honestly drive an
unsaved-changes indicator.

## What we did

- Added a `savedDraft` baseline snapshot in `builder/index.tsx` and derived
  `hasUnsavedChanges` from it via the existing `draftsEqual`. Snapshot set on
  load, on save-success, and cleared to `null` on New.
- `handleDiscard` reverts the draft to the baseline (or clears the form when
  there's none), confirm-gated.
- Toolbar (`-toolbar.tsx`): "● Unsaved changes" indicator, a **Discard** button,
  and **Save draft** disabled when there are no unsaved changes.
- Reworded the AI applied-status message (`-ai-sidebar.tsx`) and the dirty-apply
  confirm to make "editor only, not saved, discardable" explicit.
- Tests across the three specs (15 BuilderPage, 10 Toolbar, AI-sidebar message).

## Why we did it that way

**Baseline snapshot over patching `isDirty`.** The plan's core call: one piece of
state (`savedDraft`) covers AI applies and manual edits alike, and reverting to
the last saved baseline is what "discard" conventionally means. Rejected
alternatives: reusing `isDirty` (stays dirty after save — the whole problem),
and an "undo last AI apply only" discard (needs a separate pre-apply snapshot and
gets fuzzy once manual edits interleave).

**Snapshot the *normalized* draft, not the raw loaded draft (deviation from the
plan).** The plan said "snapshot the loaded draft". That's subtly wrong:
`LOAD_DRAFT` back-fills missing required steps (e.g. `check-your-answers`) and
reorders, and `deserializeRecipe` does *not* back-fill. So snapshotting the raw
input would make an older recipe read as "unsaved" the instant it loads. We
snapshot what the reducer actually produces — `recipeReducer(draft, loadAction)`
(`LOAD_DRAFT` ignores its state arg, so this reproduces the installed draft).
A regression test loads a recipe missing a required step and asserts no
indicator.

**AI dirty-apply confirm re-gated `isDirty` → `hasUnsavedChanges` (deviation).**
The guard's stated purpose is "don't silently discard unsaved work". `isDirty`
fired even on a clean just-loaded form; `hasUnsavedChanges` is the accurate
measure. Replacing a clean loaded form loses nothing (Discard reverts to
baseline), so only genuine unsaved edits now prompt.

**Save draft disabled when clean (user request).** Confirmed trade-off: a
freshly-loaded *unedited* form can no longer be re-saved under a new version via
Save draft — that re-versioning flow goes through Deploy. The user chose to keep
the gating.

## What we almost got wrong

The first cut of the BuilderPage tests was unreliable because the spec stubbed
`serializeRecipeDraft` to a constant — which makes `draftsEqual` always-true, so
the entire `savedDraft !== null` (baseline) path was untestable. We dropped the
stub (the real function is catalog-free, pure, and strips editor-only ids; no
test inspected the stubbed payload), which let `draftsEqual` discriminate
realistically. Separately, a hand-built `VALID_DRAFT` fixture was missing
`check-your-answers`, so it wasn't a canonical editor draft and the
save→edit→discard round-trip didn't go clean — fixed by making the fixture
canonical. These two surfaced the real normalized-snapshot bug above.

## Open questions

None. Indicator/AI wording matched the plan's proposed text (user approved).
