# 0028 — A form's `formId` is a canonical kebab-case identifier, from one shared pattern

**Date:** 2026-06-02
**Status:** Accepted
**Related:** [#573](https://github.com/govtech-bb/gov-bb/issues/573)

## Context

A form's `formId` and its field/step ids are all kebab-case identifiers, but the
rule was defined in three places that had drifted apart:

- `serviceContractSchema` / `serviceContractRecipeSchema` accepted `z.string()` —
  any string, including `""`.
- The builder toolbar checked `formId` with a _looser_ local pattern
  (`/^[a-z0-9][a-z0-9-]*$/` — allows a leading digit and trailing/double
  hyphens) and short-circuited on empty input.
- Field and step id inputs used a _stricter_ pattern
  (`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`) defined in the app's `-id-validation.ts`.

The consequence (#573): a form validated green with an empty `formId`/`title`,
and what the toolbar accepted for `formId` could differ from what the contract
validator accepted.

## Decision

There is **one** identifier rule, defined **once** in `@govtech-bb/form-types`
and referenced everywhere:

- `KEBAB_ID_PATTERN` (`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`) and its companion
  human-readable `KEBAB_ID_ERROR` live in
  `packages/form-types/src/id-pattern.ts` and are exported from the package
  barrel.
- `formId` follows the **same** rule as field/step ids: lowercase, letter-first,
  hyphen-separated, no leading digit, no trailing or doubled hyphen.
- Both contract schemas enforce it: `formId` is non-empty **and** matches the
  pattern; `title` is non-empty.
- The builder's id inputs (`-toolbar.tsx`, and via `-id-validation.ts` the
  field/step editors) and the `runValidation` pre-flight all import that same
  pattern/error — none defines its own.

The looser toolbar pattern is retired.

## Consequences

- **Do not reintroduce a local id regex.** Any new place that validates or
  ingests a `formId`/field id/step id imports `KEBAB_ID_PATTERN` from
  `@govtech-bb/form-types`. A second definition is a drift bug waiting to happen
  — that drift is exactly what #573 was.
- **The rule applies to the deployed-contract read path, not just authoring.**
  `serviceContractSchema.parse(...)` runs when citizens load an already-published
  form (`apps/forms`, `apps/chat`). Tightening it means a form published under
  the old looser rule could fail to load. This was accepted only after auditing
  every form definition on disk (58 forms / 72 version files) and confirming
  **all** already satisfy the strict pattern. Before loosening or re-tightening
  this rule in future, re-run that audit — the read path has no tolerance for a
  `formId` the schema rejects (it throws a "cannot be parsed" error to the user).
- **A non-kebab `formId` can never be deployed.** New forms are gated by
  `serviceContractRecipeSchema` at author time, so the deployed set stays
  conformant by construction. The schema-level format check on the deployed
  variant is a backstop, not the primary gate.
- **Toolbar inputs now always propagate their value.** Because the format error
  is surfaced independently of propagation, an in-progress/invalid `formId` is
  still written to the draft (so the controlled input reflects what was typed);
  validity is enforced by the pre-flight and schema, not by dropping keystrokes.
