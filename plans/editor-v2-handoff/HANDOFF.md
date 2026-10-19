# Editor backlog handoff (18 Oct 2026, 7:50pm)

Historical starting snapshot. [BOARD.md](BOARD.md) records each item's purpose, fix, files and expected behaviour; [TRACKER.md](TRACKER.md) records later status and verification.

## State

- `editor-v2-redesign` is at `18d5eefe`, unpushed. 31 board items are done; 20 of them landed today on top of `531b24bb`.
  - Checks at that commit: tsc, lint, format, boundaries, 1,116 tests and the vite build pass.
  - The 15 local browser suites passed at `2c483caa`, the first 10 items. They haven't run since.
- Four commits were pending integration at this snapshot:
  - `8be5bad9` on `editor-v2-kit` (confirm-dialog)
  - `61300eb3` on `editor-v2-frame` (titles-headings)
  - `3be1e749` on `editor-v2-nav` (sidebar-collapse)
  - `bc40e9c4` on `editor-v2-forms` (canvas-text)
- Expect two kinds of conflict:
  - The gallery file `src/routes/prototypes.components.tsx`: keep both sides.
  - `Menu.Content` and `Popover.Content` now require `aria-label` or `aria-labelledby`, so new menus need one.
- Partial, unreviewed work is preserved in the [recovery snapshots](recovery/):
  - frame: save-state
  - nav: services-memory
  - write: turn-into
  - forms: preview-sheet

## To do

- **Wave 1 leftovers:**
  - empty-loading
  - save-state
  - paused-notice
  - notice-rule
  - services-memory
  - scroll-memory
  - preload
  - turn-into
  - markdown-shortcuts
  - link-picker
  - preview-sheet
  - drawing-kit
- **Wave 2**, not started, with decisions already written down:
  - publish, messages, settings (form panel), blocks, history, fcontrols, find
  - Guidance for each is in [guidance/](guidance/), and conventions are in [BRIEF.md](BRIEF.md).
  - glossary goes last.
- **Parked:** api-asks and forms-to-api. Both need api_v2.

## Continuing work

Use the [implementation brief](BRIEF.md), [tracker](TRACKER.md) and [browser workflow](BROWSER.md) before resuming an item.
