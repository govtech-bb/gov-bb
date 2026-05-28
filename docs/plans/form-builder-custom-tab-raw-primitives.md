# Form builder — Custom tab populated with raw primitives

## Goal

In the form builder's field picker, the **Custom** tab should list the raw
primitive components (`raw-text`, `raw-textarea`, `raw-number`, `raw-date`,
`raw-tel`, `raw-email`, `raw-checkbox`, `raw-radio`, `raw-file`, `raw-select`)
alongside any DB-registered custom components, as a single flat list. The
**Components** tab should stop showing raw-* entries (they currently appear
there because `REGISTRY_COMPONENTS` is the merged full set).

## Approach

Filter the Components-tab list to exclude any key that exists in
`REGISTRY_PRIMITIVES`. Build the Custom-tab list by merging
`REGISTRY_PRIMITIVES` entries with `catalog.custom`, sorted alphabetically by
display label. Branch the Custom-tab click handler by source: a raw primitive
emits `{ kind: "component", ref: "components/<fieldId>", overrides: {} }` (so
the recipe contract is unchanged per ADR 0015); a DB custom continues to emit
`{ kind: "custom", ref, overrides: {} }`.

**Alternatives considered**

- A new **Primitives** tab as anticipated by ADR 0015. Rejected — the label
  isn't intuitive, and the picker stays smaller with three tabs than four.
- Subheadings inside the Custom tab (e.g. "Primitives" / "Custom components").
  Rejected — flat list keeps the UI simple and search uniform.

## Scope

- Update `apps/form_builder/app/routes/builder/ui/-field-picker.tsx`:
  - Import `REGISTRY_PRIMITIVES` from `@govtech-bb/registry`.
  - Components list: filter `REGISTRY_COMPONENTS` to exclude refs that exist
    in `REGISTRY_PRIMITIVES`.
  - Custom list: merge `REGISTRY_PRIMITIVES` entries with `catalog.custom`
    into one query-filtered, alphabetically sorted list (label for primitives,
    `displayName` for DB customs). Tag each row internally with its source so
    the click handler can branch.
  - `counts.Custom` reflects the merged count.
  - Custom-tab click handler:
    - primitive source → `onAddField({ kind: "component", ref:
      "components/<fieldId>", overrides: {} })`
    - DB custom source → existing `onAddField({ kind: "custom", ref, overrides:
      {} })`
  - Empty-state copy under Custom: drop "No custom components registered." (no
    longer accurate since raw primitives always populate the list); only show
    an empty message when the merged + query-filtered list is empty.

## Files

- `apps/form_builder/app/routes/builder/ui/-field-picker.tsx` — only file
  modified.

No backend, registry, or contract changes — raw primitives are already wired
through `REGISTRY_COMPONENTS` for resolution; this is a picker-only change.

## Verify

Real-browser smoke test (no Playwright):

1. Open the form builder, open the field picker.
2. **Components** tab: confirm none of `raw-text`, `raw-textarea`,
   `raw-number`, `raw-date`, `raw-tel`, `raw-email`, `raw-checkbox`,
   `raw-radio`, `raw-file`, `raw-select` appear. Tab count drops by 10.
3. **Custom** tab: confirm all 10 raw primitives appear, flat and
   alphabetically sorted alongside any DB customs.
4. Click `raw-text` from Custom; confirm the added recipe field is `{ kind:
   "component", ref: "components/raw-text", … }` (inspect via the field
   edit panel or recipe JSON view).
5. If any DB customs exist, click one and confirm it still emits `kind:
   "custom"`.
6. Search box: a query that only matches a primitive while another tab is
   active should still produce the "try Custom (N)" hint correctly.

Build/test gates:

- `pnpm exec nx build form-builder-app`
- `pnpm exec nx test form-builder-app`
- `pnpm exec tsc -b` (CI also runs this — picks up issues `nx build` won't)

There is no existing `-field-picker.spec.tsx`; the change is small and the
verification is the in-browser smoke test above.
