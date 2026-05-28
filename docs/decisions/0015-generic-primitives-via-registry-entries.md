# 0015 — Generic primitives via registry entries

**Date:** 2026-05-28
**Status:** Accepted
**Related:** [#310](https://github.com/govtech-bb/gov-bb/issues/310), [ADR 0008](./0008-form-builder-catalog-aligns-with-api-registry.md)

## Context

Issue #310 asked for a way to author a generic field (text, email, select, …)
in the form builder without repurposing an opinionated specialised component
(e.g. overriding `components/email` to look like a generic text input). The
issue proposed three paths:

- **(A)** Extend the recipe contract so a step element can be `{ kind: "html",
  htmlType: "text", … }` directly — rippling through
  `recipeFormStepFieldSchema`, `validate-form-contract.ts`, the API's
  `RegistryService` resolution, the recipe-loader boot path, and the AI
  extractor.
- **(B)** Build a separate "custom DB component" promotion flow (governance,
  write endpoints, dual-cache invalidation, validation gates).
- **(C)** Curated registry entries under a `raw-` namespace
  (`components/raw-text`, `components/raw-email`, …) consumed through the
  existing `kind: "component"` path.

Path (A) gives the cleanest type story but touches load-bearing schemas and
the recipe-loader boot path. A bad recipe in that path throws in
`onModuleInit`, crashes the API, and rolls back the ECS deploy (see prior
session record). Path (B) belongs to a future "promote to reusable component"
initiative and is governance-heavy. Path (C) is registry data plus a UI
namespace — same user-facing outcome, no schema change.

## Decision

**Generic field types are added as curated registry entries under a `raw-`
namespace**, not by extending `recipeFormStepFieldSchema` or any other contract
schema. A raw entry is an ordinary `Primitive` with `fieldId: "raw-<htmlType>"`
and minimally-opinionated defaults (required, type-appropriate format rules
only). It lives alongside specialised entries in
`packages/registry/src/components/` and is consumed through the existing
`{ kind: "component", ref: "components/raw-…" }` recipe shape.

A second export, `REGISTRY_PRIMITIVES`, surfaces only the raw entries for UI
that wants to distinguish them (the upcoming Primitives picker tab).
`REGISTRY_COMPONENTS` remains the merged full set so every existing
ref-resolution path keeps working unchanged.

## Consequences

- **No contract churn.** `recipeFormStepFieldSchema`, the recipe-loader boot
  path, `validate-form-contract.ts`, and the AI extractor's output shape are
  untouched. Raw entries serialize and round-trip identically to specialised
  components.
- **Two mirrors must stay in sync.** Per ADR 0008, the api-side registry under
  `apps/api/src/registry/builtins/components/` is a per-file mirror of
  `packages/registry/src/components/`. Adding a raw entry requires entries in
  both. The package's `components/index.ts` carries a header comment to that
  effect, and the API's `BUILTIN_REGISTRY` re-derives from its mirror; missing
  the mirror means recipes that reference the raw entry will null-resolve at
  hydration.
- **Promotion is additive.** Promoting a raw entry to a DB-backed reusable
  component (path B) later does not require redoing this work — the user just
  picks a different ref. Raw entries and custom components coexist.
- **Future generic primitives default to this path.** "Should I add a new
  primitive type or use raw-*?" is settled: extend the registry, do not extend
  the contract. The contract is extended only when a new `htmlType` is needed
  in `htmlTypesSchema` itself, which is a far heavier conversation than this
  ADR resolves.
- **`raw-show-hide` was skipped** because its semantics are unusual; the same
  principle applies if it is added later.
