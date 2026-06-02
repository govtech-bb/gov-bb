# Form builder — drag-and-drop reordering for step fields

## Context

Implemented from `docs/plans/form-builder-dnd-field-reorder.md` on worktree
branch `feat/541-dnd-field-reorder` (merges into `sandbox`). Issue
[#541](https://github.com/govtech-bb/gov-bb/issues/541).

In the step editor, an author reordered a step's fields with ▲/▼ buttons that
swap one position per click — moving a field from position 8 to 1 meant seven
clicks. The goal: drag a field to its new position in one gesture, without
regressing the keyboard path or the override/kind indicators on each row.

## What we did

- **Reducer: swap → splice.** `REORDER_FIELDS`
  (`-recipe-reducer.ts`) now removes the field from `fromIndex` and inserts it at
  `toIndex` instead of swapping two elements via a temp. Adjacent moves (the
  arrow buttons) are the single-step case and are unchanged by this.
- **Sortable row component** — new `-sortable-field-row.tsx` wraps the existing
  row contents in `useSortable`, adding a pointer-only grip handle (`⠿`). It owns
  the label/badge/override-dot rendering it inherited from the inline map.
- **DnD wiring** — `-step-editor.tsx` wraps the field list in `DndContext` +
  `SortableContext` (`closestCenter`, `verticalListSortingStrategy`). `onDragEnd`
  maps the active/over field ids back to indices and dispatches the *existing*
  `REORDER_FIELDS` action. A `PointerSensor` with a 4px activation distance keeps
  the row's Edit/×/arrow clicks working.
- **Deps** — added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to
  `apps/form_builder` (app-local, direct version ranges).
- **Tests** — five `REORDER_FIELDS` cases in `-recipe-reducer.spec.ts` (forward,
  backward, middle, adjacent, step-isolation), written TDD-first: the three
  multi-position cases failed on the old swap and pass on the splice.

## Why we did it that way

- **Kept the arrows; drag is a pointer-only enhancement.** The ▲/▼ buttons are
  the proven keyboard path and already dispatched `REORDER_FIELDS`. Rather than
  replace them with dnd-kit's `KeyboardSensor` (which needs a focusable handle
  plus live-region announcements to be genuinely accessible — real WCAG
  regression risk), we layered drag on top. The grip handle is held out of the
  tab order (`tabIndex=-1`) so it isn't a focusable-but-inert dead-end, and a
  dedicated handle (not a draggable whole row) stops dragging from fighting the
  button clicks.
- **Splice, not a new action.** Drag reuses `REORDER_FIELDS` rather than
  introducing a move action — the only change needed was making the reducer case
  honour arbitrary `fromIndex`/`toIndex`, which it already accepted but mangled.
- **Row factored for reuse.** Steps (`-step-list.tsx`) and select/radio options
  (`-options-editor.tsx`) use the same arrow pattern; the sortable row is kept
  small and local so they can adopt it later. Wiring them up was left out of
  scope deliberately.

## Verification

Reducer move logic is covered by the new unit tests. The drag UI was verified in
a real browser (Playwright/Chromium): the authenticated `/builder` route needs
GitHub OAuth + a live API, so the real `StepEditor` was mounted in a temporary
unauthenticated harness route with `getCatalog()` and a 5-field draft. Dragging
row 5 to the top produced `f5,f1,f2,f3,f4` in one gesture; the arrow buttons
still moved adjacent fields; boundary arrows stayed disabled; the override dot
and kind badges rendered unchanged. Harness removed after.

## Follow-up

Verification surfaced a dnd-kit SSR hydration warning (`aria-describedby` id
counter differs server vs client) when `DndContext` is SSR-rendered. It likely
does not reproduce in the real client-mounted builder route and was not treated
as a blocker — tracked in
[#546](https://github.com/govtech-bb/gov-bb/issues/546).
