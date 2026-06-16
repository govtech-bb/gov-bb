# Unique ids for "Add another" field-array rows (#1024)

## Context

In `apps/forms/src/components/field-renderer.tsx`, the field-level `fieldArray`
("Add another") render paths spread `sharedProps` — which carries
`id={field.id}` — for every repeated row. Every repeated input therefore got the
**same** `id`. Pre-existing, but #647's design-system number steppers made it
semantically meaningful: each stepper carries `aria-controls={inputProps.id}`, so
in a number field-array every stepper pointed at row 0 instead of its own row.
Worked from `docs/plans/1024-field-array-unique-ids.md`.

## What we did

- Added a `rowProps(index?)` helper inside the field render scope:
  - `index === undefined` → the single-field path, props unchanged.
  - row 0 → `id = field.id`; rows 1+ → `id = ${field.id}-${i}` plus
    `aria-label = ${field.label} ${i + 1}`.
- Threaded the row index through both array render paths — `renderControl`
  (text/number/tel/email) and `renderTextarea` — and their array call sites.
  Per-row `id` flows through `inputProps`, so `NumberInput`'s existing
  `aria-controls={inputProps.id}` now targets each row's own input with no change
  to `NumberInput` itself. Also fixed the per-row React `key`.
- Added 6 tests to `field-renderer.spec.tsx` (a `#1024` describe block): unique
  ids for text and textarea arrays, numbered `aria-label`, per-row stepper
  `aria-controls`, single-field path unchanged, and an axe pass on a 3-row
  number array.

## Why we did it that way

- **First row keeps `field.id`; only later rows are suffixed.** Two things depend
  on an element with `id={field.id}` existing: the error summary links to
  `#${field.id}` (`error-summary.tsx`) and the group `<label htmlFor={field.id}>`.
  Keeping row 0 = `field.id` preserves both and lets the error-summary anchor land
  focus on a real, focusable input.
- **Rejected: suffix every row + move the anchor onto the group `<div>`.** That
  forces the error summary to either learn about array suffixes (leaky coupling)
  or focus a non-input `<div>` (needs `tabIndex=-1`, worse than focusing the
  field). Keeping the first row as the anchor is the cleaner boundary — the
  generic error-summary component stays completely array-agnostic.
- **Per-row `aria-label` for rows 2+.** There is only one group `<label>`, so
  without it the extra rows had no accessible name. The label uses 1-based human
  numbering (`${label} ${i + 1}`) and passes axe's name-mismatch rule because the
  visible label text is contained.
- **Did not de-duplicate the two near-identical array blocks.** Tempting, but a
  separate refactor — kept this change focused on ids + a11y.

## Verification

- Unit: 6 new tests pass; full `forms:test` green (746 passed); `forms:build`
  compiles.
- Manual: a throwaway recipe version added a `fieldArray` behaviour to a text and
  a number field on `get-birth-certificate`; ran the local stack and confirmed
  unique ids, per-row stepper `aria-controls`, and numbered `aria-label` in the
  running app. The throwaway recipe was deleted afterward.
