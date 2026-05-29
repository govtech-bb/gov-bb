# 0018 — @govtech-bb/registry is the sole home for builtin definitions

**Date:** 2026-05-28
**Status:** Accepted
**Supersedes (in part):** [0008](0008-form-builder-catalog-aligns-with-api-registry.md)

## Context

[0008](0008-form-builder-catalog-aligns-with-api-registry.md) made
`@govtech-bb/registry` the source of truth for *which* builtin refs exist, and
pointed the form builder's field picker at it. But the API kept its **own**
copy of the actual definitions under `apps/api/src/registry/builtins/` — a
hand-synced duplicate of `packages/registry/src/`. A "keep in sync with
apps/api/..." comment plus a length-typed compile-time guard in each package
index was the only thing holding the two trees together. 0008's own
Consequences section codified this: "Add it to `@govtech-bb/registry` *and* to
`apps/api/src/registry/builtins/`."

The two trees were content-identical (the only diffs were Prettier formatting
and a `raw-primitives.spec.ts` that lived only in the package). `BUILTIN_REGISTRY`
had exactly one runtime consumer — `RegistryService` — plus its spec. So the
duplicate bought nothing but a manual sync obligation and a standing source of
drift ([#369](https://github.com/govtech-bb/gov-bb/issues/369)).

## Decision

**Builtin component and block *definitions* live in exactly one place:
`@govtech-bb/registry`.** No service maintains a parallel copy. The package
exports a combined `BUILTIN_REGISTRY` (`{ ...REGISTRY_COMPONENTS,
...REGISTRY_BLOCKS }`, keyed `components/{fieldId}` / `blocks/{blockId}`) and a
`RegistryEntry = Primitive | Block` type; the API's `RegistryService` imports
both. `apps/api/src/registry/builtins/` is deleted.

This supersedes 0008's "add it to both trees" consequence. 0008's core
principle — the form builder catalog is a subset of the API hydration
registry, with the registry as source of truth for *what refs exist* — stands
unchanged; this record collapses the *definition storage* down to one tree.

## Consequences

- **Adding a new builtin component or block.** Add it in `@govtech-bb/registry`
  only — register it in the `ALL` / `ALL_BLOCKS` array and bump the
  `_componentCount` / `_blockCount` literal. The API picks it up through the
  package import; the form builder picks it up as before. There is no second
  tree to update.
- **The count guards are reframed.** They no longer guard cross-tree sync (the
  thing they guarded is gone). They are now completeness checks: a
  registered-but-unlisted entry fails the build.
- **One new wiring obligation.** Per CLAUDE.md's "new packages must be
  buildable AND referenced" rule, `apps/api` now declares `@govtech-bb/registry`
  in `package.json` and `tsconfig.json` references, so the strict `tsc` build
  resolves the package's declarations.
- **`packages/form-builder/src/builtins/` is unaffected.** That legacy
  in-package fixture set (noted in 0008) is a separate concern; this change
  only retires the *API's* duplicate.
- **No behaviour change.** Refs resolve identically; the trees were
  content-identical at the time of consolidation. Verified by the existing
  `registry.service.spec.ts` and a resolve-over-recipes sanity check covering
  every builtin ref under `apps/api/src/forms/form-definitions/recipes/`.
