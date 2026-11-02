# 0021 — Recipe fields must round-trip through the builder and both hydrators

> **Note 2026-10-13 ([#2024](https://github.com/govtech-bb/gov-bb/issues/2024)):**
> `apps/api/src/registry/resolution.ts` was retired by #2044. The API now hydrates
> recipes with the shared `hydrateForm` in `packages/form-builder/src/resolution.ts`
> (called from `RegistryService`), the same function the builder preview uses.
> References to the API resolver below describe the code when this decision was
> taken; the decision still holds.
> With one hydrator, the round-trip has one fewer carry point to keep in step.

## Context

A `ServiceContractRecipe` field is only useful end-to-end if every layer between
its schema definition and the citizen-facing form carries it. There are **four**
such carry points, and they live in separate packages:

1. **Builder serializer** — `serializeRecipeDraft` (UI draft → persisted recipe),
   `packages/form-builder/src/serialization.ts`.
2. **Builder deserializer** — `deserializeRecipe` (persisted recipe → UI draft),
   same file.
3. **Builder preview hydrator** — `hydrateForm`,
   `packages/form-builder/src/resolution.ts` (drives Preview).
4. **Prod serving hydrator** — `hydrateForm`,
   `apps/api/src/registry/resolution.ts` (drives the live form).

This has now bitten twice. Processors were dropped by the serializer round-trip
(#255, "data-loss fix"). `contactDetails` was defined on
`serviceContractRecipeSchema` and rendered by `apps/forms`, but dropped at the
serializer **and** both hydrators (#452) — a feature that looked complete in the
schema yet was dead for citizens, and was silently stripped from any recipe that
already had it the moment it was re-saved in the builder.

The two hydrators are independent code that drift apart (project memory: "Two
hydrators diverge on unknown refs"), so fixing one is never enough.

## Decision

When adding (or auditing) a field on the recipe schema, thread it through **all
four** carry points above, or it is silently dropped somewhere between schema and
citizen.

- Use the `!== undefined` guard (not a truthiness/length check) when copying the
  field, so an explicitly-set value stays distinct from "absent" — a truthiness
  check reintroduces the data-loss bug for empty-but-present values (e.g. `[]`).
- Editor-only concerns (a minted `id`, transient UI state) are stripped on
  serialize and re-minted on deserialize; a plain structured field (like
  `contactDetails`) needs no such handling.
- Pair the change with a **round-trip regression test**: a recipe carrying the
  field survives `deserialize → serialize` identically, and both hydrators carry
  it through. This is the guard that would have caught both #255 and #452.

## Consequences

- Adding recipe metadata is a four-file change by default, not a one-file schema
  edit. Reviewers should expect to see all four touched (plus tests) or ask why.
- The round-trip test is the canonical proof; absent it, "it's in the schema" is
  not evidence the field reaches anyone.
- This is about *carrying* fields. How unknown refs are resolved/expanded is a
  separate concern (see [0017](0017-recipe-ref-resolution-fails-loud.md)); the
  two hydrators may legitimately differ there, but must agree on carry-through.
