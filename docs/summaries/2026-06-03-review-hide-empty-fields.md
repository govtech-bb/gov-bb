# Hide empty fields on the "Check your answers" review page (#629)

Date: 2026-06-03
Issue: [#629](https://github.com/govtech-bb/gov-bb/issues/629)
Branch: `worktree-629-review-hide-empty-fields` → `sandbox`

## Why this work happened

The "Check your answers" review page (`apps/forms/src/components/review.tsx`)
rendered a row for every non-hidden field regardless of whether the user had
answered it. Optional fields left blank produced empty-looking rows (or a
placeholder), cluttering the summary. #629 asked for blank fields to be omitted,
with file uploads kept as the deliberate exception.

## What changed

### `getFieldDisplayValue` is now the single source of truth for emptiness

Previously the function only *formatted* a value and the render loop filtered
solely on `hidden` / `conditionallyHidden`, so emptiness was never signalled.
The function now returns `string | null` and yields `null` for every empty
non-file case:

- text/default, and the `!field.options` fallbacks of select/checkbox/radio,
  go through a new `emptyToNull` helper (`undefined` / `null` / `""` → `null`).
- select / radio with no matching option → `null` (was `undefined`).
- checkbox with no selected options → `null` (was `""`).
- date with no value → `null`.
- `file` is unchanged and **always** returns a string ("No file selected" or the
  comma-joined filenames), so file rows never count as empty.

**Why centralise here rather than filter the raw `form.getFieldValue`:**
emptiness rules differ per type (empty array for checkbox/file, no-match for
select/radio, `{day,month,year}` for date). `getFieldDisplayValue` already
switches on `htmlType`, so putting the rule there avoids duplicating that type
logic in the render loop.

### Render loop filters empty rows and handles empty sections

The per-step `.map` now computes each visible field's display value once, drops
rows where it is `null` or `""`, then renders. When a section ends up with zero
visible rows it renders `<p class="govbb-summary-section__empty">No values
provided</p>` **in place of** the `<dl>` rather than inside it — keeping the
markup valid (a `<p>` is not a legal `<dl>` child) so the jest-axe audit stays
green. Section title + Change link always render, so users can still jump back
to a step they skipped (decision carried from the plan: do not drop whole
sections).

## Notable choices

- **Empty section message replaces the `<dl>`, not nested in it.** The plan left
  placement open; rendering the message as a sibling `<p>` keeps the summary
  accessible and passes the existing jest-axe test.
- **`""` treated as empty for text/default.** The old default returned `""` for
  blank text (rendering an empty row); it is now `null` so the row is omitted,
  matching the issue's intent.

## Test adjustments worth noting

Two pre-existing hidden-field tests (`hidden=true`,
`conditionallyHidden=true`) supplied **no** value for their "visible" field.
Under the new behaviour an unanswered field is correctly omitted, which would
have made those assertions fail for the wrong reason. Each was given a value for
its visible field so the test still verifies "hidden fields don't render,
populated ones do." This is a behaviour change surfacing in old tests, not a
test weakened to pass.

## Verification

- TDD red→green: 7 new tests written first, watched fail (empty rows still
  rendered / "No values provided" absent), then implemented to green.
- `review.spec.tsx`: 29/29 — empty text/select/radio/checkbox/date each render
  no row; populated fields survive alongside omitted empties; file-with-no-upload
  still shows its row; all-hidden section shows "No values provided".
- `forms` suite: 602 passed, 1 skipped.
- `nx run-many -t build` / `nx run-many -t test` run at finish (CI parity).
