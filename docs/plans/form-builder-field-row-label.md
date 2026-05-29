# Form builder: added-field row shows label as primary text

Issue: https://github.com/govtech-bb/gov-bb/issues/202

## Goal

In the form-builder step editor, each added field row currently shows the
**component/display name** (e.g. *Text*) as the primary text and the field
`kind` as a badge. Promote the field's **label** (the question the end-user
sees) to the primary text and demote the display name to muted secondary text,
so a step full of same-typed fields is scannable at a glance. This brings the
added-field row in line with the Add Field picker (`-field-picker.tsx`), which
already pairs a primary label with a secondary badge.

## Approach

The label resolves through a fallback chain:

`field.overrides?.label` → component primitive's `label` → display name → `field.ref`

Two design decisions, confirmed in discussion:

- **Suppress the secondary when it equals the primary.** For an un-edited
  registry/builtin component the resolved label *is* the primitive label, which
  equals `displayName` — rendering both would show the same string twice. So the
  muted secondary only renders when `displayName !== label`.
- **Keep the `kind` badge** (`component` / `block` / `custom`) as it is today.

Blocks have no `primitive`, so for `kind: "block"` the chain is
`overrides?.label` → block `displayName` → `ref` (no primitive label step).
Custom components may carry a `definition` cast to `Primitive` whose `label`
can be absent — the helper guards for that and falls through to `displayName`.

Label resolution is extracted into a **pure, exported `resolveFieldLabel`
helper** rather than inlined, so it can be unit-tested in a `.spec.ts` (node
env) the same way `-recipe-reducer.spec.ts` is. A component-render test is
deliberately *not* added: form_builder's Jest runs in `node` env with
`testRegex: .*\.spec\.ts$` (no `.tsx`/jsdom), so a render test would mean
standing up jsdom — out of proportion for a layout tweak.

Alternatives considered:

- *Inline the label logic in the JSX* — rejected: not unit-testable given the
  node-only Jest setup, and the block/custom fallbacks have enough edge cases to
  warrant coverage.
- *Mirror the picker exactly (label + single badge, drop kind)* — rejected: the
  issue keeps the display name as secondary text and we chose to keep the kind
  badge, so the row keeps both pieces of metadata.

## Scope

- Add `resolveFieldLabel(field, item)` pure helper (component primitive label /
  block + custom displayName / `field.ref` fallbacks, guarding a missing
  primitive label).
- Rewrite the `step.fields.map(...)` row in `-step-editor.tsx`:
  - primary text = resolved label
  - muted secondary text = `displayName`, rendered only when it differs from the
    primary label
  - keep the override dot, the `kind` badge, and the ▲ ▼ / Edit / × buttons
- Add a `.fieldRowSecondary` muted style and stack the label over the secondary
  inside the existing `flex: 1` cell.
- Unit tests for `resolveFieldLabel`.

## Files

- `apps/form_builder/app/routes/builder/ui/-step-editor.tsx` — field row markup;
  call `resolveFieldLabel`.
- New helper — either co-located in `-step-editor.tsx` (exported) or a small
  sibling module `-field-label.ts`. Decide during implementation; a sibling
  keeps the `.spec.ts` import clean. The helper needs `RecipeFieldDraft` and the
  `getRegistryItem` return type from `@govtech-bb/form-builder`.
- `apps/form_builder/app/routes/builder/ui/-field-label.spec.ts` (new) — helper
  tests.
- `apps/form_builder/app/styles/builder.module.css` — add `.fieldRowSecondary`
  (muted, ~0.75rem, using `--color-text-muted`).

## Verify

- `cd apps/form_builder && pnpm jest --no-coverage` — helper spec passes.
  (Note: `nx run-many -t test` does **not** run these — form_builder has no nx
  `test` target — so run Jest from the app directly.)
- `pnpm exec nx run-many -t build` — all packages compile.
- `pnpm exec nx run-many -t lint` (or the form_builder lint target) — clean.
- Smoke test in the browser (Isaiah): open a recipe in the step editor, confirm
  - a field with a custom label shows the label on top and the muted type below,
  - an un-edited component shows a single line (no duplicate),
  - the override dot, kind badge, and buttons still work.

## Open questions

- Helper location: exported from `-step-editor.tsx` vs. new `-field-label.ts`
  sibling. Leaning sibling for a clean spec import; not blocking.
