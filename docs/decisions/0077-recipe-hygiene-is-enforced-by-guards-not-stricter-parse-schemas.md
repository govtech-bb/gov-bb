# 0077 — Recipe hygiene is enforced by guards, not by stricter parse schemas

**Date:** 2026-10-13
**Status:** Accepted
**Related:** [#2713](https://github.com/govtech-bb/gov-bb/issues/2713) (this
decision), [#2877](https://github.com/govtech-bb/gov-bb/issues/2877)
(`checkCatchmentRoutingHasMapping`, the same shape), ADR 0075

## Context

`fieldOverridesSchema` is a non-strict Zod object, so an override key it
doesn't know is stripped at parse. On 2026-10-13, 81 such keys sat in 10
recipes (`readonly`, `multiline`, `required` and others), each configuring
something that never took effect. The obvious fix is `.strict()`.

The same schema, though, parses recipes in places where a rejection is an
outage, not a lint failure:

- **API boot** (`recipe-file-loader.service.ts`) throws, and the form is not
  served.
- **Builder draft rows** (`draftRecipeSchema`) fail to open. A row can hold
  keys the committed file no longer has.
- **AI-builder output** (`aiRecipeSchema`) fails, rather than having a stray
  key stripped.

## Decision

A rule about what a recipe *should* contain is a **guard**: a pure function
in `@govtech-bb/form-types` that returns error strings. It runs on the
**raw** recipe JSON in `pnpm validate-recipes` (CI) and in the builder API's
`validateRecipeFully` (Deploy). The shared parse schemas stay lenient; they
define what a recipe *can* be read as, not what is acceptable to commit.

`checkOverrideKeys` is today's instance. Its allowed set is
`Object.keys(fieldOverridesSchema.shape)`, so the guard can't drift from the
schema.

## Consequences

- A bad key fails before merge and before Deploy, with a location
  (`step › field › key`) instead of a Zod array path, and never takes a
  served form down.
- A guard has to see the recipe **before** any parse. On a path that parses
  first (the AI `validate_form` tool, the services publish), it is a no-op.
  That is acceptable only because the same parse strips what that path
  writes.
- A guard walks the recipe by hand, so it covers only the levels it walks.
  Keys nested under `ui` or `geocodeTargets`, or placed beside `ref`, are not
  checked yet.
