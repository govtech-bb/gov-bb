# `in` operator now stores an array value from the builder (#1738)

## Context

Issue [#1738](https://github.com/govtech-bb/gov-bb/issues/1738): selecting the
**`in`** operator for a conditional behaviour in the Form Builder produced a
condition that silently never fired. The builder's value control emitted a bare
**string**, but the shared evaluator (`packages/form-conditions/src/internals.ts`)
is array-only for `in` and bailed on the first line when the value wasn't an
array. Discovered while authoring a "select all that apply" health-conditions
field whose follow-up wouldn't show.

Worked in worktree `gov-bb-1738` (branch `1738-in-operator-array-value`, targets
`sandbox`).

## What we did

- **`packages/form-conditions/src/internals.ts`** — the `in` case tolerates a
  non-array value: a scalar coerces to a one-element list; `""`/`null`/`undefined`
  → empty list (matches nothing). Array values pass through unchanged.
- **`apps/form_builder/app/routes/builder/-behaviours-editor.tsx`** — when the
  operator is `in` (non-boolean target), the value control is an `InValueInput`
  sub-component: a comma-separated text field that stores a `string[]`, with the
  reused `.fieldHint` hint. `handleParamChange` reshapes the value on operator
  switch (→ `in` wraps a scalar / empties to `[]`; `in` → scalar joins back to a
  comma string; boolean targets skipped).
- Tests added in both spec files.

## Why it looks this way

- **Two-part fix, not builder-only.** Fixing only the builder would leave every
  already-saved `in` condition (string value) silently broken until hand-edited —
  a poor failure mode for a "does nothing" bug. The evaluator leniency recovers
  those recipes with no re-save, and is byte-for-byte equivalent for array values
  (all prior `in` tests stay green). The runtime array support itself already
  existed (#1713 multi-select intersection); this was purely an authoring +
  tolerance gap.

- **Entry is committed on blur, via a local text buffer — this was a course
  correction.** The first cut derived the input's displayed value straight from
  the stored array and re-parsed (`split(",").filter(Boolean)`) on every
  keystroke. Code review caught that the editor is fully controlled
  (`-step-editor.tsx` writes `onChange` back into `behaviours` and re-renders), so
  a **trailing comma was stripped on every keystroke** — `"abc,"` → `["abc"]` →
  display reverts to `"abc"` — making it impossible to type a second value. The
  original tests missed it because each fired a single complete-string `change`
  against a non-re-rendering `vi.fn()`, never exercising the round-trip. The fix
  (chosen by the user over parse-on-change): `InValueInput` holds a local
  `useState` text buffer as the controlled value so raw text survives keystrokes,
  and normalizes to `string[]` **on blur**. The accepted tradeoff is that the
  value isn't committed until focus leaves the field — fine in practice because
  clicking Save/any control blurs the input first. A new test drives a
  re-rendering controlled parent (`ControlledInEditor`) with sequential
  keystrokes to lock in the round-trip.

- **`handleAdd` left unchanged.** New behaviours default to `equal` + `""`; you
  only reach `in` via the operator switch, whose conversion produces `[]`. So the
  "default `in` value to `[]`" criterion is satisfied without touching `handleAdd`.

- **No CSS change.** The plan flagged a possible new hint style; an existing
  `.fieldHint` class (block, dim, 12px) already fit, so it was reused.

## Verification

- `pnpm exec nx run form-conditions:test` — 72 pass, 98% lines.
- `pnpm exec nx run form-builder-app:test` — 657 pass.
- `pnpm exec nx run-many -t build --exclude=landing` — 16 projects.
- `pnpm exec tsc -b` — clean.
- Manual browser smoke (array in saved recipe + pre-existing string recipe
  recovering) left to the author.

## Open questions

- None. The on-blur commit tradeoff is accepted; the `in` → scalar conversion
  leaving a `"a, b"` comma string under `equal` is an intentional reversible
  placeholder the author then edits.
</content>
</invoke>
