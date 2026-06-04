# 0037 — Override sub-objects merge per-key against registry defaults

**Date:** 2026-06-04
**Status:** Accepted

## Context

A recipe field's `overrides` carries structured sub-objects (`validations`,
`ui`) alongside scalar keys. Two parallel resolvers apply them onto the base
primitive — `packages/form-builder/src/resolution.ts` (builder preview) and
`apps/api/src/registry/resolution.ts` (live serving) — and the builder's field
edit panel decides what to persist, collapsing a control to `undefined` when
it is "at its default" (ADR 0013/0014).

The same bug has now shipped twice because these three places disagreed about
what an *absent key* inside a sub-object means:

- **#371** — resolvers replaced `validations` wholesale, so overriding only
  `required` dropped a primitive's shipped `email` format rule. Fixed with a
  per-key `mergeValidations` in both resolvers.
- **#789** — `ui` was still replaced wholesale on the serving path, and the
  edit panel collapsed `width` against a hard-coded global default (`"long"`)
  rather than the component's registry default. National ID ships
  `ui: { width: "short" }`, so selecting **Long** persisted nothing, resolution
  fell back to `short`, and "Long" rendered *narrower* than "Medium".

## Decision

An absent key inside an override sub-object always means **"the component's
registry default"** — uniformly, in every layer:

1. **Resolvers merge sub-objects per-key.** Override keys win; absent keys
   keep the base primitive's value. Wholesale replacement of a structured
   sub-object is never correct. Both resolvers must apply identical merge
   semantics (they currently duplicate the helper — see #796 for extracting a
   shared one).
2. **The editor collapses to the base primitive's declared default**, not a
   global one. A control drops its key only when the chosen value equals what
   the registry component declares (falling back to the schema-level default
   only when the component declares nothing). Anything else persists
   explicitly — including a value that happens to match the *global* default.
3. **New structured `FieldOverrides` keys inherit this contract.** Adding a
   sub-object (or a key within one) means wiring per-key merge in *both*
   resolvers and a base-aware default in the editor, in the same change.

## Consequences

- Builder preview, served form, and edit panel can no longer drift on what an
  unset key means — the #371/#789 bug class requires violating an explicit
  rule rather than missing an implicit one.
- Registry components can ship presentation defaults (`width: "short"` on
  National ID) and trust that authors overriding an *adjacent* key won't
  silently strip them.
- Persisted overrides stay minimal: a recipe only records deviations from the
  component it references, so re-pointing a field at a different component
  inherits the new component's defaults for everything untouched.
- An author who wants a component's own default back simply re-selects it —
  the key drops, rather than pinning a redundant explicit value.
