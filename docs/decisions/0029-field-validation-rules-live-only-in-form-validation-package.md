# 0029 — Field validation rules live only in `@govtech-bb/form-validation`

## Context

Field-level validation rule logic (required, length, pattern, email, numeric
bounds, date comparisons, file constraints, cross-field comparisons, …) used to
exist **twice**: `apps/api` validated through the shared
`@govtech-bb/form-validation` package, while `apps/forms` ran its own parallel
copy — the `check*` functions in `validation-methods.ts`. The two had already
drifted (e.g. the `fileTypes` dotted-vs-dotless extension fix landed only in the
client copy), and the shared, better-tested package never actually validated the
live form because `useForm` was created without a validator adapter.

Issue #433 consolidated onto the shared package as the single implementation.

## Decision

**Field validation rule logic has one source of truth: the
`@govtech-bb/form-validation` package.** Both the client (`apps/forms`, via the
`onChange`/`onBlur` handlers in `form-builder/validation-builder.ts`) and the
server (`apps/api`) validate exclusively through its `validate()` entry point.
Neither app re-implements rule logic locally.

When a behaviour difference or bug is found, **the fix lands in the shared
package** — so both consumers get it — rather than as a per-app patch.

Apps may still own the thin **boundary adapters** needed to feed the shared
validator (e.g. mapping the client's composite `stepId_fieldId` keys to the bare
`fieldId` tree the resolver expects, converting a `FileList` to
`{name,size,type}[]`, collapsing an "empty" value to the shape the shared
emptiness check recognises). Those are glue, not rules.

## Consequences

- A validation rule changes in exactly one place; client and server cannot drift.
- New rules are added to `form-validation` (registered in `RULE_REGISTRY`), with
  the package's own test suite as the coverage home — which is why deleting the
  client `check*` functions legitimately shrank `apps/forms`' coverage pool (see
  the `functions` threshold note in `apps/forms/jest.config.ts`, consistent with
  `0001-coverage-thresholds-track-actuals-not-targets`).
- Cross-field rules (`gt`/`lt`, `strictEquality`, date comparisons via
  `referenceFieldId`) now resolve on the client, which they silently never did
  before — the adapter assembles the full value tree and passes it to `validate`.
- Bugs surfaced by the migration were fixed in the package, not the app:
  per-element validation of array values (was comma-joined), `equal`/`notEqual`
  text equality (was coerced through `Number()`), and `fileTypes` dotless/MIME
  matching. Remaining lower-severity divergences are tracked in #633.
- Conditional **visibility** (`@govtech-bb/form-conditions` /
  `behavior-helper.ts`) is a separate concern and is **not** covered by this
  decision; it remains a parallel duplication to consolidate later.
