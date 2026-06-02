# Conditional condition-value captured as a real boolean (#565)

## Context

When authoring a conditional in the form builder (field/step *conditional on*
another field), the value control was always a `type="text"` input storing a
string. The behaviour schema allows `boolean`, but the UI could only ever
produce a string — so "show field X when \<toggle\> equals true" stored
`"true"` and silently never matched a boolean target at runtime. Capture-side
fix only; no evaluator changes, no recipe migration.

## What we did

- `packages/form-builder/src/duplicate-ids.ts` — `ResolvedFieldId` gains a
  required `isBoolean`, derived in `resolveFieldIds` from the primitive's
  (and block element's) `htmlType` via a `BOOLEAN_HTML_TYPES` set.
- `apps/form_builder/.../-recipe-refs.ts` — `FieldRef` carries `isBoolean`
  through `getFieldRefs`.
- `apps/form_builder/.../-behaviours-editor.tsx` — a `targetFieldIsBoolean`
  helper resolves the selected target by step + field id; the `value` branch
  renders a `true`/`false` `<select>` (storing a real boolean, default `true`)
  for boolean targets, text input otherwise; `handleParamChange` resets the
  value to a type-appropriate default when the target switches between boolean
  and non-boolean (mirrors the #519 step→field invalidation).
- ADR [0025](../decisions/0025-field-value-type-is-defined-by-its-renderer-not-htmltype-name.md).

## Why we did it that way

- **Infer from the target, don't ask the author.** A manual string/number/
  boolean value-type picker was rejected — extra step, easy to get wrong, worse
  UX than deriving the type from the chosen target.
- **Fix at capture, not evaluation.** Coercing `"true"`→`true` in the evaluators
  was rejected: it keeps the stored recipe data wrong and perpetuates the
  type-soup. The captured value is the source of truth, so fix it there.
- **`isBoolean` flag, not `htmlType` passthrough.** We threaded a narrow boolean
  flag rather than the full `htmlType`. Simplest thing that meets the need; the
  number-target follow-up can widen this later (the boolean flag is cheap to
  replace with a richer type descriptor if/when that lands).
- **Default `true`.** "equals true" is the common authoring intent for a toggle
  condition, so a new boolean control seeds to `true`.

## What we almost got wrong

The plan **and issue #565** both asserted `checkbox` was a boolean target,
alongside `show-hide`. A code review pushed back; we verified against the live
renderer (`apps/forms/.../field-renderer.tsx`) and found the plan's premise was
factually wrong:

- `show-hide` stores a real `boolean`.
- `checkbox` stores its **selected option value** — a `string`
  (`confirmation` → `"confirmed"`), or a `string[]` for multi-option.

Had we trusted the `htmlType` name and shipped the original plan, a checkbox
conditional would have rendered a `true`/`false` control whose value can never
match the stored option string (both evaluators string-coerce) — a regression
vs. today's free-text input, where an author can type the real option value and
it matches. We narrowed `BOOLEAN_HTML_TYPES` to `show-hide` only (user
confirmed) and corrected the two test expectations that had locked in the wrong
assumption. The generalised lesson — value type comes from the renderer, not the
`htmlType` name — is ADR 0025.

## Open questions

- **Number targets.** Real numbers vs. strings for `htmlType: "number"` targets
  is a deliberate follow-up, out of scope here. ADR 0025 applies: confirm the
  renderer stores a real `number` before treating it as one.
