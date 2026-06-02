# Form builder: drag-and-drop reordering for step fields

**Issue:** [govtech-bb/gov-bb#541](https://github.com/govtech-bb/gov-bb/issues/541)

## Goal

In the form builder's step editor, let an author reorder a step's fields by
dragging and dropping, instead of clicking ▲/▼ one position at a time. Moving a
field across several positions becomes one gesture rather than many clicks. The
existing arrow buttons stay, so keyboard reordering is unchanged.

## Approach

Add [`@dnd-kit`](https://dndkit.com) (`@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`) to the `form_builder` app and make the field list a
sortable list. On drop, dispatch the **existing** `REORDER_FIELDS` action with
the source and destination indices. Update the reducer's `REORDER_FIELDS` case
to **move** (remove + insert via splice) rather than swap two elements, so
multi-position drops land correctly.

Decisions taken during planning:

- **Keep the arrow buttons; add a drag handle.** The ▲/▼ buttons are the proven
  keyboard path and already dispatch adjacent `REORDER_FIELDS` moves — which
  behave identically under a splice — so nothing regresses. A dedicated grip
  handle (rather than making the whole row draggable) keeps dragging from
  fighting the Edit / × / arrow button clicks.
- **Fields only, factored lightly.** Isolate the sortable field row into a small
  component so steps (`-step-list.tsx`) and select/radio options
  (`-options-editor.tsx`), which use the same arrow pattern, can adopt it later
  without a rewrite. Wiring those up is out of scope here.

Alternatives considered:

- *Replace the arrows with dnd-kit's `KeyboardSensor`.* Cleaner row, but it
  needs a focusable handle plus live-region announcements to be genuinely
  accessible, and carries a real regression risk against the repo's WCAG focus.
  Rejected in favour of keeping the arrows.
- *Build a fully generic `Sortable` wrapper now and apply it to steps/options
  too.* More upfront design for no immediate benefit; deferred.
- *Another DnD library (react-beautiful-dnd, etc.).* `@dnd-kit` is the
  maintained, first-class-keyboard-support choice and is the issue's
  recommendation. No competing reason to diverge.

## Scope

- Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to
  `apps/form_builder/package.json`.
- Change the `REORDER_FIELDS` reducer case from swap-via-temp to splice
  (remove from `fromIndex`, insert at `toIndex`).
- In the step editor, wrap the field list in dnd-kit's `DndContext` +
  `SortableContext` and render each field row as a sortable item with a drag
  handle. On drag end, translate the active/over field ids into
  `fromIndex`/`toIndex` and dispatch `REORDER_FIELDS`.
- Extract the field row into a small sortable component (kept local to the
  builder route, e.g. `-sortable-field-row.tsx`) so it's reusable later.
- Add a grip-handle style to `builder.module.css`.
- Add reducer unit tests for multi-position moves (forward and backward) to
  `-recipe-reducer.spec.ts`.

## Files

- `apps/form_builder/package.json` — add the three `@dnd-kit` packages.
- `apps/form_builder/app/routes/builder/-recipe-reducer.ts` — splice in the
  `REORDER_FIELDS` case (`-recipe-reducer.ts:305-317`).
- `apps/form_builder/app/routes/builder/-step-editor.tsx` — wrap the field list
  in `DndContext`/`SortableContext`; add `onDragEnd` → `REORDER_FIELDS`; render
  rows via the new sortable component. Arrow buttons and override/kind badges
  unchanged (`-step-editor.tsx:200-258`).
- `apps/form_builder/app/routes/builder/-sortable-field-row.tsx` *(new)* — the
  draggable field row (grip handle + existing row contents), using
  `useSortable`.
- `apps/form_builder/app/styles/builder.module.css` — drag-handle styling.
- `apps/form_builder/app/routes/builder/-recipe-reducer.spec.ts` —
  `REORDER_FIELDS` move tests.

## Verify

- `pnpm exec nx run-many -t build --exclude=landing` compiles cleanly.
- `pnpm exec nx run-many -t test` passes, including the new `REORDER_FIELDS`
  move tests.
- Manual: in the builder, drag a field from position 8 to position 1 — order
  updates correctly in one gesture. The ▲/▼ buttons still move a field one
  position. Override dots and kind badges render unchanged. Tab to a field and
  reorder with the arrow buttons via keyboard.

## Acceptance criteria (from #541)

- [ ] Fields in a step can be reordered by dragging and dropping.
- [ ] Dropping a field updates the recipe draft order correctly for
      multi-position moves (not just adjacent swaps).
- [ ] Reordering remains keyboard-accessible (arrow buttons retained).
- [ ] No regression to override indicators / kind badges in each field row.

## Open questions

None blocking. dnd-kit will be pinned to its current stable version on install;
if the repo prefers catalog-managed versions for shared deps, these are
app-local so a direct version range in `package.json` is fine.
