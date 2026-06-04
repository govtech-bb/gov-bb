# Repeatable step `min`/`max`: 1-based, intuitive bounds

**Date:** 2026-06-04
**Status:** Approved (design)
**Related issues:** #742 (stray "Add another?" on bare repeatable), #768 (in-flight: `addAnotherLabel` param in the same descriptor/editor files)

## Problem

A repeatable step's `min` was originally conceived as "extra instances beyond
the base step", so `min: 0` meant "just the base step". That is non-intuitive:
authors read `min` as "how many entries does the citizen see/must provide",
where 0 reads as "none at all".

The runtime already treats `min >= 1` as **total instances**
(`apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts:112` —
`totalInstances = repeatBehaviour.min`). `min: 0` survives only as a redundant
special-case branch (lines 164–174) that renders one instance + "Add
another?" — nearly identical to `min: 1`, except it ignores `max` when showing
the control. Meanwhile the builder initializes new repeatable behaviours with
`min: 0, max: 0` — a broken config out of the box (`max: 0` silently means
"unlimited" via the falsy check at `repeatable-helper.ts:269`).

No prior GitHub issue covers this (verified 2026-06-04; closest are closed
#432 and #136, which are different problems).

## Contract (new semantics)

- `min` = total number of instances the citizen sees up front. Integer, **>= 1**.
- `max` = total cap on instances. Integer, **>= min**.
- Example: `min: 1, max: 5` → one instance rendered, "Add another?" available
  until five exist.
- No `0` anywhere in newly authored recipes. No hidden "0 = unlimited".

## Design

### 1. Runtime normalization (`apps/forms/.../repeatable-helper.ts`)

At the top of `setupRepeatSteps`, derive once per repeatable behaviour:

- `effectiveMin = Math.max(1, Math.floor(min) || 1)` — clamps `0`, negatives,
  decimals, `undefined`.
- `effectiveMax = max >= effectiveMin ? Math.floor(max) : Infinity` —
  falsy/invalid `max` keeps meaning "unlimited" for legacy recipes.

Use `effectiveMin`/`effectiveMax` everywhere the branch logic currently reads
`repeatBehaviour.min`/`.max`, and **delete the dead `min: 0` else-branch**
(lines 164–174).

Regression guard: without the `effectiveMax` rule, clamping a bare legacy
`repeatable` (no min/max — e.g. `apply-for-conductor-licence/1.0.0`
Endorsements) into the `min >= 1` path would compute
`canAddMore = 1 < undefined === false` and lose its "Add another?" control.
`addRepeatableStep`'s existing falsy-max-is-unlimited check
(`repeatable-helper.ts:269`) is consistent with this and stays.

### 2. Save-time validation (`packages/form-types`)

`repeatableBehaviourSchema` stays lenient (`z.number()`) so old published
recipe versions still parse in the API's recipe file loader
(`recipe-file-loader.service.ts:197`). Strictness lives in
`validateFormContract`, which gains per-repeatable-behaviour rules:

- `min` must be an integer >= 1.
- `max` must be an integer >= `min`.

Builder saves and recipe CI reject bad configs loudly; nothing is silently
corrected at the contract boundary.

### 3. Builder UI (`packages/form-builder` + `apps/form_builder`)

- Adding a repeatable behaviour initializes `min: 1, max: 5` (replacing the
  current `0`/`0` defaults in `-behaviours-editor.tsx`).
- The number inputs get `min={1}`; onChange clamps `min` below 1 and `max`
  below `min`.
- Coordinate merge order with #768, which touches the same descriptor
  (`behaviour-builder.ts`) and editor files for the `addAnotherLabel` text
  param. No functional overlap.

### 4. Recipe migration (version bump, not in-place)

`post-office-redirection-individual`: copy `1.2.0.json` → `1.3.0.json`, set
internal `"version": "1.3.0"`, and change both repeatable steps from
`min: 0, max: 5` to `min: 1, max: 5`. Rendering is identical (both paths show
one instance + "Add another?"), and the loader serves the latest semver per
formId, so the bump is the complete migration. **Edits to published recipes
always bump the next minor version — never edit a published version file in
place.**

`apply-for-conductor-licence/1.0.0` (bare `repeatable`, superseded by 1.3.0)
is left alone; the runtime clamp covers it.

### 5. Testing

- `repeatable-helper.spec.ts`: legacy `min: 0` clamps to one instance with
  "Add another?"; missing/falsy `max` = unlimited; `min: 1, max: 1` = single
  instance with no "Add another?"; decimals/negatives clamp sanely.
- `validate-form-contract` specs: reject `min: 0`, `min: 1.5`, `max < min`;
  accept `min: 1, max: 5`.
- Existing specs whose fixtures rely on `min: 0` semantics are updated to the
  clamped expectations.

## Alternatives considered

- **Encode the clamp in the zod schema via `.transform`** — rejected: every
  parser would silently correct `min: 0` instead of rejecting it at save time;
  the builder could display 0 while the published form does 1. Silent coercion
  is the same kind of unintuitive this change removes.
- **UI-only fix (builder defaults/constraints only)** — rejected: leaves the
  dead runtime branch, the `max: 0` trap, and nothing stops hand-authored or
  AI-generated recipes (#570-style) from writing `min: 0`.
- **Strict zod schema (`.int().min(1)`)** — rejected: old committed recipe
  versions with `min: 0` would fail to load in the API entirely.
