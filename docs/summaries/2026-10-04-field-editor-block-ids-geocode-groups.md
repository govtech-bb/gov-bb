# Edit question modal: block-child duplicate IDs, geocode targets, accordion categories

2026-10-04 · Form Builder · #2896, #2886, #2887 (follow-ups from #2873 and #2685)

## Context

The #2893 review left three gaps in the Edit question modal. A block's children
never got the "already used by another field" warning. Authors had to edit
`address-lookup` `geocodeTargets` (14 uses on the EH forms) and
`checkbox-accordion` `groups` (2 uses) by hand in the recipe.
#2886/#2887 were filed "after Session 2" of #2873, but Session 2 (`step` /
`multiple`) never shipped and #2873 is closed.

## What we did

- `fieldIdDuplicatesAnother` takes an optional `childFieldId`. The per-child
  `OverrideForm` in the block branch now passes the check.
- Added two new descriptor kinds to `CUSTOM_ATTRIBUTE_DESCRIPTORS`: `fieldRef`
  (one descriptor for `geocodeTargets` with three sub-keys) and
  `optionGroups` (`groups`). A new `OptionGroupsEditor` handles `optionGroups`
  and reuses one `OptionsEditor` per category.
- Exported `geocodeTargetsSchema` from the form-types barrel so the descriptor
  spec checks sub-keys against the schema.

## Why we did it that way

**The exclusion matches on the pair (editor field, child field), not just the
editor field.** `resolveFieldIds` gives every child of a block instance the same
`editorFieldId`. Simply passing the standalone callback through would have
hidden a genuine clash between two siblings of the same block. The standalone
path is unchanged, because its single entry has `childFieldId: undefined`,
which equals the omitted argument.

**We built #2886/#2887 without Session 2.** They need new descriptor kinds,
not `step`/`multiple`, so there was no real dependency (user decision). The map
comments for `number`/`time`/`file`/`opening-hours` still point at Session 2.

**`fieldRef` is typed to `GeocodeTargets`, not a generic object descriptor.**
It is the only object-valued fieldRef key today, so a general nested-descriptor
model would be speculative. The comment says where to widen it when a second
key appears. `CustomAttributeStringKey` narrows the old kinds so `effective()` /
`setKey()` stay string-typed.

**Edits start from the effective value and write whole objects.**
`applyFieldOverrides` is a shallow spread, so an override replaces the base
object wholesale. Editing one target starts from `override ?? base`, so the
other two survive. Clearing the last target writes `undefined`, never `{}`.

**Each category's nested `OptionsEditor` is mounted with `isOverridden={false}`.**
A category has no base of its own to reset to, so a per-category "Reset to
defaults" would be meaningless. Reset lives once at the `groups` level.

**Specs read real recipe JSON, and nx now knows it.** The specs open the
hair-salon recipe and the two accordion recipes from `apps/api/.../recipes/`
to prove that existing recipes still open. Review caught that
`form-builder-app` doesn't depend on `apps/api`, so a recipe-only PR would
neither re-run nor un-cache them. We kept the real recipes rather than inline
fixtures, and added the recipes glob to the project's `test` inputs. `nx
affected` then includes `form-builder-app` for a recipe change: verified with
`nx show projects --affected`, and no `implicitDependencies` was needed. The
accordion specs render 54 options each, so they get a 20s timeout.

**The sibling check runs against the modal's live state.** The first cut
checked block children against the saved draft, so two siblings on screen
disagreed until Save. The check now runs against a `liveDraft` with the open
modal's overrides swapped in.

## Open questions

- #2906 tracks the deferred review findings: blank or duplicate category
  labels and values, geocode pickers listing the lookup itself and the wrong
  field kinds, and accessibility polish.
- #2873 Session 2 (`step`, `multiple`) is still unscheduled.
