# `optionalIf` — conditionally relax `required` without hiding the field (#625)

Date: 2026-06-03
Issue: [#625](https://github.com/govtech-bb/gov-bb/issues/625)
Branch: `worktree-optionalif-625` → `sandbox`

## Why this work happened

Forms needed a way to make a field's `required` rule conditional **without**
hiding the field. The existing `fieldConditionalOn` gates *visibility* — when its
condition fails the field is hidden and skipped entirely. There was no way to say
"this field is shown always, but only required when X". `optionalIf` fills that
gap: condition true ⇒ field optional; condition false ⇒ field behaves normally
(required if marked so); the field is never hidden, and format rules still apply
whenever it is filled.

## What changed

The behaviour spans four layers, landing as one PR (the #433 forms→shared
`validate` consolidation having already merged unblocked the forms path).

### 1. `@govtech-bb/form-types` — the schema

`optionalIfBehaviourSchema` + `OptionalIfBehaviour`, mirroring
`fieldConditionalOnBehaviourSchema` (same `targetFieldId` / optional
`targetStepId` / `operator` / `value` shape), added to the `behaviourSchema`
discriminated union and re-exported from the package index.

### 2. `@govtech-bb/form-conditions` — shared evaluation (API-facing)

`evaluateFormConditions` now also computes `optionalFieldsByInstance:
Map<string, Array<Set<string>>>`, a per-step/per-instance set of active fields
whose `optionalIf` condition currently matches. It is computed in the same
primitive loop as active/hidden, reusing `evaluateCondition`, with **AND
semantics** (optional only when *every* `optionalIf` matches) — consistent with
how `fieldConditionalOn` ANDs. The field stays in the active set; this parallel
set only flags it as not-required. `ConditionalBehaviour` in `internals.ts` was
widened to include `OptionalIfBehaviour` (structurally identical, so no logic
change there).

### 3. `apps/api` — server validation

In `SubmissionPipelineService.validate`, for each active primitive whose instance
is in `optionalFieldsByInstance`, a clone with `required` stripped from
`validations` is validated instead. **No validator change** — `validateField`
already treats an absent `required` as not-required, so dropping the rule is all
that's needed; every other (format) rule is preserved and still fires when the
field is filled. The field is never dropped from `normalizedValues` (it stays
active), so the stored submission still carries it.

### 4. `apps/forms` — client validation

In `validation-builder.ts`'s `onDynamic`, the field's `optionalIf` behaviours are
evaluated against the already-built value trees via the **local**
`evaluateCondition` (`validation-methods.ts`); when they all match, a
`required`-stripped clone of the primitive is validated. The controlling field is
already on `onChangeListenTo` via the existing `"targetFieldId" in b` flatMap, so
the field re-validates when the target changes — no change needed there.

## Notable choices

- **Relax by cloning-minus-`required`, not a new validator runner.** Conditional
  *gating* of a rule lives in the orchestration layer (conditions package + the
  API/forms callers), while the validator stays rule-only. This keeps
  ADR 0029's "rules live only in `form-validation`" intact: `optionalIf` is not a
  rule, it's a decision about *which* rules apply. (Considered recording this as
  an ADR; deemed sufficiently captured by the plan + this summary.)
- **`field-renderer.tsx` untouched.** The plan deliberately scoped out the
  required-indicator (asterisk) UX reflecting the live optional state, and the
  form-builder authoring UI — both tracked as follow-ups. Runtime validation
  behaviour only.
- **Forms uses the local `evaluateCondition`, not the shared one.** This was the
  plan's explicit instruction and matches the existing `fieldConditionalOn`
  client precedent (`behavior-helper.ts` uses the same local evaluator). It is a
  known divergence — see Follow-up.

## Follow-up

- [#668](https://github.com/govtech-bb/gov-bb/issues/668) — unify the forms
  client conditional evaluation onto the shared `@govtech-bb/form-conditions`
  evaluator. Code review found the local and shared evaluators disagree on
  `equal` (case-insensitive vs not), `equal`/`in` truthiness guards, and
  `notEqual` looseness, which can drive a client-accepted empty optional field
  into a server-side 422. Pre-existing across `fieldConditionalOn` too; out of
  scope for #625. Also covers per-instance target resolution for conditions
  inside repeatable steps on the client (the shared evaluator handles
  `instanceLocal`; the local path does not).

## Verification

- TDD throughout (RED→GREEN confirmed at each layer).
- `form-types`: 278/278. `form-conditions`: 46/46 (per-operator + per-instance
  repeatable optionalIf cases). `api` `submission-pipeline` specs: 50/50 (empty +
  condition-true ⇒ pass; empty + condition-false ⇒ 422; field present in
  `normalizedValues`; filled-but-malformed ⇒ format rule still fails). `forms`
  full suite: 599 passed / 1 pre-existing skip.
- Build: all 13 projects compile (`landing` excluded locally — offline prebuild;
  CI builds it).
- `api`/`forms` suites run with `--maxWorkers` + `--workerIdleMemoryLimit=512MB`
  per the repo's memory-cap guidance.
