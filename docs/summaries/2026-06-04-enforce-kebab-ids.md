# Kebab-case id migration + schema enforcement (#741, #745)

## Context

#741: a `fieldConditionalOn` field never revealed because its snake_case
`targetFieldId` broke the composite form-state key split
(`splitCompositeId` assumes ids never contain `_`). The plan resolved it by
prevention — bake `KEBAB_ID_PATTERN` into the shared form-types zod schemas —
with #745 migrating the five known snake_case recipe files first, since the
runtime loader and CI zod-parse every checked-in recipe version and a schema
stricter than the data breaks both.

## What we did

- **Migrated the five snake_case files** (#745): homeschooling 1.1.0/1.2.0
  (names matched to the already-merged 1.3.0 from #743),
  non-nationals-secondary-entry, referral-student-support-services,
  school-uniform-grant-barbados. Commit `bb4cf087`.
- **Discovered and migrated 16 more files** (~250 camelCase ids across 10
  forms, plus a literal `#` fieldId → `row-no`): the strict pattern rejects
  more than underscores, and the plan's pre-scan had only grepped for `_`.
  User chose full migration over a two-phase "no-underscore now, kebab later"
  fallback. Commit `5fed6edf`.
- **Enforcement** (`3c73d597`): `kebabIdSchema` in
  `packages/form-types/src/id-pattern.ts`, applied at every id position —
  including three the plan missed (`stepConditionalOn` targets,
  `sharedFields.fieldIds`, validation-rule `targetFieldId` /
  `referenceFieldId` / `targetStepId`) and the block-override record keys.
  TDD: `id-enforcement.spec.ts` written red-first.
- **form_builder_api** (`89e3e981`): AI system prompt gained Critical Rule 16
  (kebab ids, pattern inline, snake/camel rejected) plus inline reinforcement;
  endpoint specs pin `/validate` rejecting underscore ids with
  `KEBAB_ID_ERROR` at dotted paths.
- **form_builder** (`b0a16e19`): Step ID input now kebabizes on blur,
  mirroring the Field ID Override input — a gap found during verification.
- **ADR 0034** records the convention; issues #759 (write-endpoint bypass)
  and #760 (deployed-env `form_versions`) capture the follow-ups.

## Why we did it that way

**Invariant everywhere, not boundary checks.** A lax base schema with
strictness only at the builder API was explicitly rejected (in the plan and
again when camelCase tripled the scope): the #741 bug class lives precisely
in the gap between what a boundary checks and what consumers assume.

**Migration ordered before tightening, in one PR.** The loader throws at
startup on a non-parsing recipe, so the data commits precede the schema
commit in history — bisectable and CI-green at every step.

**Zod record-key errors are wrapped.** Zod v4 reports invalid record keys as
`invalid_key` ("Invalid key in record") with the offending key in the path
and `KEBAB_ID_ERROR` in a nested `issues` list — the spec asserts that real
shape rather than the flat message.

**Option values stay untouched.** Tokens like `"value": "non_attendance"`
are option values, not ids; the pattern governs id positions only.

## Surprises

- **Write endpoints don't validate.** create/update/rekey persist recipes
  without `validateFormContract` — the plan assumed they funneled through it.
  Filed as #759 rather than fixed, because hard-validating writes could break
  saving of in-progress drafts; that semantics decision comes first.
- **A subagent edited the main checkout** instead of the worktree during the
  first migration fan-out; caught by independently re-verifying the diff
  (file count mismatch), moved into the worktree, main checkout restored.
- **`routeTree.gen.ts` churn**: the local nx build regenerates it with quote
  changes; dropped from the branch to keep the PR scoped.

## Verification

Build (14 projects, landing excluded), `tsc -b`, `validate-recipes` (80
files), form-types 309, form_builder 409, form_builder_api 97, form-builder
package 123, apps/api recipe specs 32 — all green. Code-review subagent:
zero correctness/security findings.
