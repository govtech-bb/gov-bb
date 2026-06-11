# Per-unit × quantity payment amounts — #961

## Context

[#937](https://github.com/govtech-bb/gov-bb/issues/937) gave the builder's
structured amount editor a **fixed** amount and a **conditional** age/field band
table. This session added the next gap from
[#961](https://github.com/govtech-bb/gov-bb/issues/961): a **per-unit × quantity**
price — e.g. get-birth-certificate charging per copy via its existing
`number-of-copies` field. It works in both fixed and conditional modes.

The server already resolves multiplication (`@govtech-bb/expressions` evaluates
`{"*": […]}`), so this is **builder authoring UX only** — no backend, runtime,
or recipe-JSON change. Payment config lives in the DB (`form_config.config.processors`,
#716/#750), so the editor is the only place to add the capability.

Done on `per-unit-quantity-amounts-961` (targets `sandbox`), branched off
`sandbox` after #937 merged.

## What we did

- **`-amount-rule.ts`** — `compileAmount` gained an optional `quantityPath`: when
  set it wraps whatever base it already produces (a number or an `if`-chain) in
  `{ "*": [ <base>, { var: "values.<path>" } ] }`. `parseAmount` peels an outer
  `*` wrapper of **exactly** that shape (recording the bare `stepId.fieldId`),
  then classifies the inner node via the existing logic. `ParsedAmount` carries
  an optional `quantityPath` on the `fixed`/`conditional` variants only.
- **`packages/form-builder/duplicate-ids.ts`** — `ResolvedFieldId` gained an
  `isNumeric` flag (mirroring `isBoolean`, from `NUMERIC_HTML_TYPES = {"number"}`),
  set at both the component and block-element resolution sites.
- **`-amount-editor.tsx`** — collapsed the editor's split emit paths into one
  `EditorState` object + a single `buildAmount` derive-from-state function, then
  added a "Multiply by a quantity field" checkbox and a `ValuePathPicker`
  (restricted to numeric fields), visible in both modes.
- Specs extended test-first: `-amount-rule.spec.ts` (compile/parse round-trips +
  fall-through cases) and `-amount-editor.spec.tsx` (UI). `ResolvedFieldId`
  fixtures across three other specs updated for the new flag.

## Why we did it that way

- **A single outer multiplier, not per-band quantity.** Each band row could in
  principle carry its own quantity, but per-copy pricing is one factor over the
  whole amount, and a single outer `*` still composes with bands (senior-free ×
  copies) while round-tripping cleanly. Per-band was rejected as over-flexible
  with no current need.
- **Strict-shape peel, or stay advanced.** `parseAmount` only peels a `*` whose
  second operand is a `values.`-prefixed `var` and whose **base classifies as a
  real number or a conditional `if`-chain**. Anything else — a var × var, a
  non-`values.` var, the wrong arity, or a non-number scalar base like
  `{"*": ["foo", {var}]}` — falls through to the read-only `advanced` branch with
  the *whole* expression preserved. This upholds ADR 0044's never-clobber
  principle: the editor must never re-emit `{"*": [0, …]}` over a hand- or
  AI-authored expression it doesn't fully understand. (The non-number-base guard
  was added in review — `classifyBase` maps a bare scalar to `fixed/undefined`,
  which would otherwise have been re-emitted as `0`.)
- **`values.` prefix at the boundary (ADR 0044).** The table stores the bare
  `stepId.fieldId`; the prefix is added at compile and stripped at parse — the
  multiplier reuses the same boundary as the subject paths, so it's a corollary
  of an existing decision, not a new one. That's why no new ADR was written.
- **Quantity picker restricted to numeric fields.** Unlike the #937 age picker —
  which stayed unfiltered because `ResolvedFieldId` had no date flag — multiplying
  by text or a date is never meaningful, so we added `isNumeric` and filtered the
  picker. `number` is the only numeric `htmlType`. An existing path pointing at a
  now-non-numeric field is still shown via `ValuePathPicker`'s `(current)`
  fallback, so a hand-authored choice is never silently dropped.
- **Single emit path.** Folding mode, fixed value, table, and quantity into one
  `EditorState` + `buildAmount` removed the previous split between `emit` and
  `switchMode`'s ad-hoc `onChange`, so the quantity multiplier re-applies
  consistently however the author got there.

## Verification

- `nx test form-builder-app` — 531 passed (amount-rule + amount-editor specs,
  TDD red→green); `nx test form-builder` — 164 passed.
- `tsc -b` clean; `nx run-many -t build --exclude=landing,cms` built 13 projects.
- Code-reviewer subagent: go, 0 must-fix. Flagged the scalar-base clobber edge,
  which we fixed and pinned with tests.

## Open questions

- **Manual builder round-trip check pending** (real browser): set fixed×qty and
  conditional×qty, save, reopen — confirm the structured editor (not "advanced")
  shows the quantity field and the stored `amount` is the expected `{"*": […]}`.
- **Operational follow-up (separate, tracked with #750):** configure
  get-birth-certificate's payment processor in the target-env DB via the builder
  (per-copy × `number-of-copies`). No recipe JSON change.
