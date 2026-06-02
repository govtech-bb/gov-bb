# Optionally hide a field's label (render field only)

## Context

Implemented from `docs/plans/hide-field-label.md` on worktree branch
`feat/522-hide-field-label` (merges into `sandbox`). Issue
[#522](https://github.com/govtech-bb/gov-bb/issues/522).

A form author needs to hide a field's visible label so only the control
renders, without losing the accessible name for screen-reader users.

This session picked up a worktree left in an odd state: the full
implementation was present as **uncommitted** working-tree changes (no commit
on the branch), plus a spurious `apps/forms/src/routeTree.gen.ts` reformat
(quote-style churn from an auto-generating dev server) that was reverted before
committing.

## What we did

- **`hideLabel?: boolean` on `primitiveUISchema`** (`@govtech-bb/form-types`).
  It rides through the existing `fieldOverridesSchema` `ui` pick straight to the
  runtime `ClientPrimitive.ui` — no override-mapper plumbing.
- **Runtime renderer** (`apps/forms/.../field-renderer.tsx`) — a local
  `labelClass(base)` helper appends `.govbb-visually-hidden` when
  `field.ui?.hideLabel` is set, applied to all 3 `<label>` sites (text family,
  select, textarea) and 4 `<legend>` sites (date, radio, checkbox single +
  multi). The element stays in the DOM, so `htmlFor` / `<legend>` grouping —
  and therefore the accessible name — is preserved.
- **Builder control** (`apps/form_builder/.../-field-edit-panel.tsx`) — a "Hide
  label" checkbox mirroring the Disabled/Hidden rows. It patches the nested
  `ui` object and collapses `ui` back to `undefined` once no key is set, keeping
  override contracts clean.
- **Tests** — `field-renderer.spec.tsx` asserts the label (text) and legend
  (radio) carry `govbb-visually-hidden` when the flag is set, are still present
  in the DOM, and lack the class when unset.

## Why we did it that way

- **`ui.hideLabel`, not a top-level flag** — label visibility is a presentation
  concern, following the precedent already set by `ui.width`. No new convention
  was established, so no ADR was warranted.
- **Visually-hidden over `aria-label`** — keeping the real element preserves the
  exact `htmlFor` association and `<legend>` grouping uniformly across field
  types, rather than diverging per type. Matches the existing
  `.govbb-visually-hidden` usage in this same renderer.
- **show-hide and file left untouched** — their "label" is the only visible
  text (the toggle text / dropzone title), so hiding it would erase the control.

## Open questions

- Plan's optional tooltip/help-text next to the builder checkbox (clarifying the
  label stays accessible to screen readers) was **not** added — kept minimal,
  consistent with the sibling Disabled/Hidden checkboxes which carry no help
  text.
