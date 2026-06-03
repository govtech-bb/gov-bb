# 0030 — A field's resolved fieldId is its stable identity

## Context

A form-builder field has two ids. The editor-only `id` (a minted UUID) tracks
the field instance inside the editor and is stripped on serialize (ADR 0009).
The **fieldId** is the durable, form-facing identifier: it keys submission
values, and it is what conditions, validation `referenceFieldId`s, processors,
and behaviours point at when one field refers to another.

A field's fieldId is *resolved*, not stored verbatim: `resolveFieldIds`
(`packages/form-builder/src/duplicate-ids.ts`) returns
`field.overrides.fieldId ?? componentDef.primitive.fieldId` — i.e. an explicit
override if present, otherwise the registry primitive's default
(`generic-text`, `first-name`, …).

The change-field-type feature (#642) let an author swap a field's `ref` to a
similar primitive in place. That re-points the field at a different registry
primitive — and therefore a different *default* fieldId. A field left on its
default (no explicit override) would have its resolved fieldId silently change
from, say, `generic-text` to `generic-textarea`, dangling every condition or
validation that referenced the old id, with no error at swap time.

## Decision

**A field's resolved fieldId is its stable identity. Any operation that mutates
a field must not silently change that resolved id.** When an operation would
shift the underlying *default* (because it re-points the field at a different
registry primitive), it must first pin the field's current resolved id as an
explicit `fieldId` override, so the identity survives the mutation.

Today's instance: `CHANGE_FIELD_REF` / the field edit panel pins the old
default fieldId as an explicit override before migrating the field to the new
ref (`-field-edit-panel.tsx`, `handleChangeRef`). An author-set explicit
fieldId is left untouched — it is already the stable id.

## Consequences

- Type-swapping a field never breaks references to it. After a swap, the field
  carries an explicit `fieldId` matching its pre-swap resolved id, so
  conditions/validations/processors keep resolving.
- The pinned id becomes visible and editable in the "Field ID Override" input —
  the author can rename it deliberately, but it will never change *by accident*
  as a side effect of changing the field's type.
- A freshly-added field swapped before anyone references it still gets pinned to
  the source primitive's default (e.g. a textarea pinned to `generic-text`).
  This is intentional: identity preservation is unconditional, and the author
  can edit the id. We do not try to distinguish "referenced" from "not yet
  referenced" — that would make identity depend on global form state.
- This principle constrains future field-mutating features (bulk type changes,
  ref renames, import/transform passes): they must preserve the resolved id the
  same way, rather than re-implementing identity per feature.
