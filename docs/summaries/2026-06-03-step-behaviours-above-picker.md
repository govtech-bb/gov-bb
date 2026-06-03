# Move Step Behaviours above the "Add field" picker

## Context

Implemented from `docs/plans/form-builder-step-behaviours-above-picker.md` on
worktree branch `worktree-566-step-behaviours-above-picker` (merges into
`sandbox`). Issue [#566](https://github.com/govtech-bb/gov-bb/issues/566).

In the form-builder step editor, the **Step Behaviours** section rendered at the
very bottom of the panel, below the **"Add field"** picker. The ask: move it up
so it sits directly above the picker — between the Fields list and the picker —
while leaving the Fields list itself in place.

## What we did

- **`apps/form_builder/.../-step-editor.tsx`** — split the single
  `{!noFields && (…)}` fragment (which bundled the Fields list *and* the "Add
  field" picker) into two separate `{!noFields}` blocks: a Fields-list block and
  an "Add field" block. The always-rendered Step Behaviours block stays put, and
  the picker block now renders *after* it. New order for a normal step:
  Metadata → Fields → (inline FieldEditPanel) → Step Behaviours → Add field.
- **`-step-editor.spec.tsx`** (new) — locks the section order via the
  `.sectionTitle` headers, and asserts a no-fields step (`check-your-answers`)
  drops both Fields and the picker while keeping Step Behaviours.

## Why we did it that way

- **Split the fragment rather than move Step Behaviours into it** — Step
  Behaviours is always rendered (independent of `noFields`), so it can't live
  inside the `{!noFields}` fragment. Splitting the fragment is the only way to
  slot an always-rendered section between the list and the picker.
- **Two `{!noFields}` guards, not a refactor** — the duplicated guard reads the
  same `noFields` constant, so both blocks always render or hide together. A
  shared helper wouldn't remove the JSX-level duplication; comments at both
  sites flag the coupling. Pure render-order change — no reducer/type/logic
  touched.
- **FieldEditPanel stays attached to the Fields list** (above Step Behaviours),
  keeping field-editing context next to the list it edits.
- **Rejected alternative** — placing Behaviours between Metadata and the Fields
  list ("above the whole Fields area"). Per the issue discussion, the Fields
  list should stay where it is.

## Open questions

None.
