# Unify forms conditional evaluation onto the shared evaluator (#668)

Date: 2026-06-03
Issue: [#668](https://github.com/govtech-bb/gov-bb/issues/668)
Branch: `worktree-unify-forms-conditional-evaluation-668` → `sandbox`

## Why this work happened

Follow-up to #625 (`optionalIf`) and the #433/#633 field-**validation**
consolidation. The forms client evaluated conditional behaviours with its own
**local** `evaluateCondition` (`validation-methods.ts`), while `apps/api` and
`@govtech-bb/form-conditions` used a **different** evaluator (`internals.ts`).
They disagreed on the four operators the conditional schemas actually permit:
`equal` was case-**insensitive** locally (case-sensitive on the server),
`equal`/`in` had local truthiness guards the shared one lacks, and `notEqual`
was looser locally. Because the API is the authoritative validator, any case
where the client treated a field as optional/visible but the API disagreed
produced a server-side 422 on input the UI had accepted (e.g. select value
`"No"` against a condition `value: "no"`). This removes that whole class of bug
by making the client use the same evaluator as the server.

## What changed (`apps/forms`, plus one package export)

Option A from the plan — swap the evaluator at the two client call sites, keep
the client's synthetic-step model for repeatables. No `instanceLocal` plumbing.

### 1. Shared value-tree builder — `helpers/value-tree.ts` *(new)*

Lifted `splitCompositeId` + a `buildStepScopedValues` (composite-keyed
`stepId_fieldId` → `StepScopedValues`) out of `validation-builder`, so both call
sites build the tree the shared evaluator expects the same way. `buildValueTrees`
in `validation-builder` now calls `buildStepScopedValues` and overlays the live
current-field value — one implementation, no drift.

### 2. `behavior-helper.ts` — visibility

`checkConditionalOn` builds `StepScopedValues` + `flatValues` from
`formApi.state.values` and calls the shared `evaluateCondition(behaviour, values,
flatValues)` per condition. The historical `targetStepId ?? fieldStep`
resolution is preserved by defaulting the behaviour's `targetStepId` to
`fieldStep` before handing it over. The `RequiredState` return contract is
unchanged, so `getVisibleSteps` / `field-renderer` callers are untouched.

### 3. `validation-builder.ts` — `optionalIf`

`isOptionalNow` calls the shared evaluator against the `allValues` tree it
already builds plus `flatValues`; `resolveOptionalIfTarget` and the local
evaluator import are gone.

### 4. `repeatable-helper.ts` — repeatable `optionalIf`

`handleMissingTargetStepIds` now rewrites `optionalIf` `targetStepId`s with the
**same** rules it already applied to `fieldConditionalOn` (instance step id when
not a shared field; source step id when it is). This is what makes `optionalIf`
inside a repeatable step resolve instance-locally on the client, matching the
server — previously unsupported (the stale `validation-builder` comment saying so
is removed).

### 5. `validation-methods.ts` — retire the local evaluator

Removed the local `evaluateCondition` and its now-unreachable
`gt`/`lt`/`contains`/`strictEquality` arms (the schema only permits
`equal | notEqual | in | exists`). Kept `valueIsEmpty` / `isDateComplete` /
`parseDatePart`, which are consumed elsewhere.

### 6. `@govtech-bb/form-conditions` — public surface

`evaluateCondition` and `flattenStepValues` are now re-exported from the package
index so the client can evaluate a single condition without going through the
full `evaluateFormConditions` contract walk.

## Notable choices

- **Option A, not B.** Driving the client wholesale from
  `evaluateFormConditions` (the server's array model) would force reconciling the
  client's synthetic-step representation with the server's — a large
  blast-radius refactor disproportionate to the bug. ADR 0029 already records
  consolidation as incremental; this is the next increment, so no new ADR.
- **No `instanceLocal` on the client.** The client materialises each repeatable
  instance as its own synthetic step and rewrites each conditional's
  `targetStepId` to that instance. Once step 4 also rewrites `optionalIf`,
  instance-local resolution falls out of `values[targetStepId][targetFieldId]` —
  the `instanceLocal` parameter is never needed.
- **Guard removal is intentional.** Dropping the local truthiness guards means
  `equal`/`in` against `""`/`false`/`0` now compare directly, mirroring the #633
  verdict for the validation path. The live-form audit (below) confirmed no
  author relied on the old loose matching.
- **`flatValues` flat-lookup is unreachable inside repeatables.** It only fires
  for a condition with neither `targetStepId` nor a `fieldStep` fallback;
  callers always pass `field.stepId`. A code comment in `behavior-helper`
  flags this so a future change doesn't reintroduce the synthetic-step
  collision.

## Verification

- TDD throughout (RED→GREEN at each step). Cross-path agreement test (`"No"` vs
  `value: "no"` ⇒ **not** matched, was matched before); repeatable `optionalIf`
  instance-locality tests (instance 2's optional state depends on instance 2's
  controlling value, not instance 1's).
- `forms` full suite: 588 passed / 1 pre-existing skip, coverage above
  thresholds. `form-conditions`: 48 passed (added tests for the new public
  re-exports). ESLint clean on changed files; strict `tsc` typecheck of `forms`
  against package source clean. `nx build` green for `forms` + `form-conditions`.
- **Live-form audit:** 125 conditional behaviours across 25 recipes examined
  (target option values resolved from inline overrides and `packages/registry`
  components). **Zero** case-only / loose-equality divergences — the switch
  regresses no live form. One unrelated pre-existing dead condition surfaced in
  `get-death-certificate/1.1.0.json` (a `fieldConditionalOn` whose
  `targetFieldId` is a step id), filed as a follow-up.
- Suites run with the repo's `--maxWorkers` + `--workerIdleMemoryLimit=512MB`
  memory caps; full build/test left to CI per CLAUDE.md.
