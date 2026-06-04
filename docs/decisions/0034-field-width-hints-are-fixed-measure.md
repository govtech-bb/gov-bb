# 0034 — Field width hints are fixed-measure, never container-relative

**Date:** 2026-06-04
**Status:** Accepted

## Context

Form fields carry an optional width hint (`ui.width` in
`@govtech-bb/form-types`: `short` | `medium` | `long`) that the forms app
renders as a `data-field-width` attribute on the field's `.govbb-form-group`
wrapper. The govtechbb stylesheet (`apps/forms/src/styles/govtech.css`) mapped
the hints to **percentages** at ≥768px: `short` → `width: 33%`, `medium` →
`width: 50%` (`long` is intentionally unstyled — full width of the form
column).

Percentages resolve against the nearest containing block, so the rendered
width depended on *where* the field sat. The forms layout nests several
width-reducing wrappers — the `.form-width` column is 2/3 of the page
container, and conditionally revealed fields render inside a padded
show-hide inset (`.form-page__show-hide-content`). Each wrapper compounded
the percentage. Concrete failure (#765): the textbook-grant passport field —
registry default `width: "short"`, revealed inside a show-hide inset —
rendered at ~248px on a 1440px viewport, visibly smaller than the same
`short` hint on a standalone field, and far too small for its content.

## Decision

A field's width hint describes the **field's expected content**, not a share
of its container. Width hints must therefore map to **fixed measures**
(`ch` units, GOV.UK-style) and never to container-relative units
(percentages, `vw`, flex fractions):

- `short` → `max-width: 24ch`, `medium` → `max-width: 38ch` (≥768px).
- `width: 100%` remains the floor, so a field still shrinks inside a
  container narrower than its cap — it just never shrinks *because of*
  nesting when there is room.
- Below 768px all fields stay full width.
- `long` (or no hint) stays unstyled: full width of the form column.

This applies to any future width values and to any restyling pass: a `short`
field must render the same size whether it sits at the top level of a step,
inside a show-hide inset, or inside any wrapper added later.

## Consequences

- **Insets are free.** New nesting wrappers (insets, columns, repeatable
  groups) cannot silently shrink fields; layout work never needs to audit
  field-width interactions.
- **Hints are portable.** Registry components can ship a width (e.g.
  `passport-number` ships `short`) without knowing where a recipe will place
  them.
- **`ch` tracks the type scale.** The caps size with the body font
  (~13px/ch at the current 20px body), so a design-token font change rescales
  field widths proportionally rather than leaving them stale.
- Width changes are caps, not allocations: two `short` fields no longer
  imply "three per row" the way `33%` did. Any future multi-column field
  layout must come from an explicit grid on the step, not from field width
  hints.
