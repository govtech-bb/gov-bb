# Form Builder — change a field's ref/type from the editor (#642)

## Context

The field edit modal never surfaced a field's underlying registry `ref`, and
there was no way to change a field's type after adding it — an author had to
delete and re-add, losing the field's label, validations, position, and other
overrides. Issue #642 asked to show the ref and let the author change it.

## What we did

- New pure domain logic in `packages/form-builder/src/ref-swap.ts` (+ spec):
  `SWAP_GROUPS`, `getSwappableRefs`, `migrateOverridesForRef`.
- `CHANGE_FIELD_REF` reducer action (`-recipe-reducer.ts`) — replaces ref +
  migrated overrides in place, normalizing `kind` to `"component"`.
- "Field type" row + generic-peer picker in `-field-edit-panel.tsx`, with local
  `ref` state that live-migrates overrides on swap.
- ADR [0030](../decisions/0030-field-resolved-id-is-stable-identity.md) — the
  stable-identity principle behind the fieldId auto-pin.

## Why we did it that way

**`ref` means the registry reference, not "the identifier."** The issue text
described `ref` as the stable identifier (and pointed at duplicate-id handling),
but in this domain `ref` is the registry reference (`components/text`) that
decides a field's `kind`/`htmlType`. We built the feature the plan's way — a
type-swap chosen from a fixed dropdown of valid refs — which makes the issue's
"reject duplicate/empty ref" criteria moot (a dropdown can't produce either).

**Swap candidates are generic primitives only, not all same-htmlType
components.** `getSwappableRefs` could have drawn from all 44 `REGISTRY_COMPONENTS`
sharing an htmlType (the plan's literal helper spec), but that surfaces a long,
noisy list (FirstName, Postcode, …) for a `text` field. The user chose the short
list: the generic primitives in the same swap group. Source is
`REGISTRY_PRIMITIVES`, current ref excluded.

**Override migration is keep-compatible, driven by the existing
`VALIDATION_RULE_DESCRIPTORS`.** Rather than a value-level remap, we keep the
type-agnostic overrides + `required`/`conditionalOn` + any validation the
*target* htmlType already advertises, and drop the rest. Two refinements beyond
the plan's literal "always carry" list, both to avoid silent data corruption:
`conditionalOn` is always carried (it's conditional-required logic, independent
of html type, and lives in no descriptor list); and `multiple` survives only
when the target is a `select` — radio/checkbox have no `multiple` property, so
carrying it (as the first draft did) persisted invalid override data. We
explicitly drop `defaultValue`/`mask` as type-specific.

**Save dispatches `CHANGE_FIELD_REF` only when the ref actually changed**,
falling back to `UPDATE_FIELD_OVERRIDES` otherwise. This kept the existing panel
Save tests (which assert `UPDATE_FIELD_OVERRIDES`) green and avoids a redundant
ref-replace on every save. Blocks always take the override path — they have no
swap control (no single htmlType, no natural peers) and own `childOverrides`.

**fieldId is auto-pinned on swap.** The plan left this as open-question #2 (don't
auto-pin); the user reversed that here. A field on its registry default fieldId
would silently re-resolve to the new ref's default and dangle references, so the
panel pins the old resolved default as an explicit override before migrating.
Reasoning recorded in ADR 0030.

**`kind` normalization came out of code review.** A `kind: "custom"` field could
surface swap peers (the picker keys off htmlType, not kind) and end up with
`ref: components/generic-*` but a stale `kind: "custom"`. Since swaps always
target a generic primitive, the reducer forces `kind: "component"`.

## Open questions

- Validation survival on text-like swaps is intentionally lossy — e.g. a
  `number` `min`/`max`, or a `text` `equal`/`pattern`, is dropped when the
  target htmlType doesn't advertise it (plan open-question #1, accepted). The
  editor reflects the drop live before save, so it's WYSIWYG rather than silent.
- Swapping A→B→A without saving is cumulatively lossy on local overrides (rules
  dropped going A→B don't return on B→A). Accepted as consistent with the
  live-migration design; the form shows exactly what will be saved.
