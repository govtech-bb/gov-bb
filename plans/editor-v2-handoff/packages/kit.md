# Package `kit`: Shared controls kit

Shared rules: [implementation brief](../BRIEF.md). Item status: [tracker](../TRACKER.md).

## Decisions already made for this package

- You own the generic parts of `src/ui`. Build each component once, with a test beside it and a section in the gallery (`src/routes/prototypes.components.tsx`), then move every look-alike in the app onto it.
- **ui-gaps:**
  - `Select` takes a Field label and wraps itself in Field.
  - Add `Kbd`, one keycap chip for every keyboard hint: the block menu hints, the fold and Alt hints in `forms/react/chrome.tsx`, the slash menus, and tooltips. `src/editor/react/shortcut.ts`'s `shortcut()` stays the one formatter. `src/ui` can't import editor code, so Kbd takes the formatted text, or keys already formatted by the caller.
  - Delete `PillSelect` only if nothing uses it.
  - Keep an export named `panel` working from `ui/select`: the user has an uncommitted prototype that imports it. Point it at `surface`.
  - Use one caret size.
- **buttons-links:**
  - Button gets a `link` variant and a pressed state from `aria-pressed`.
  - Add `TextLink`: a router Link, or an external link with an icon and visually hidden "(opens in a new tab)".
  - Use the shared Bar and DocumentBar for workspace and document header actions.
- **touch-target:** add a `touchTarget` token in `surface.ts`: 44px under `pointer: coarse`, or an invisible hit area where the visible size must stay small. Apply it to Button, the Select and pill triggers, the toast close, the table pager, the sidebar rows in `workspace/sidebar.ts`, the rail buttons in `editor/react/block-rail.tsx`, and the category chip's remove button (which becomes Tag).
- **popup-names:**
  - `Popover` and `Menu` content take a required accessible name, through `aria-label` or `aria-labelledby`, enforced by the types. Give every call site one.
  - The page editor's Insert and Block options buttons get `aria-haspopup` and `aria-expanded`.
  - The form fold buttons get `aria-expanded`, and their names include the count they show.
  - The form gutter's grip is named "Block actions".
- **confirm-dialog:**
  - `ConfirmDialog` is a Base UI AlertDialog with the question as its title, the consequence in plain words, a verb on the button, a pending label, an inline error, and close locked while pending.
  - Button gets a `pending` state.
  - `Dialog.Actions` holds the buttons.
  - `WorkspaceDialog` takes `body` and `footer`, so no dialog can skip them.
  - Move the remote page delete dialog, `host/source-ui.tsx`'s confirmation (around lines 329-338; frame owns the rest of that file) and the gallery's confirm demo onto it.
- **empty-loading:**
  - `EmptyState` covers empty, not found and failed, at page, section and inline sizes, with icon, title, description and actions.
  - `LoadingState` wraps the existing trident `Loader` in `src/ui/loader.tsx`. Keep that loader; it's the user's design.
  - Extend the existing `listEmpty` line in `surface.ts` rather than adding another.
  - Replace every hand-made copy, about 20, and list them in your report. Keep sidebar and services-list changes focused on empty and loading states.

## Your items, in a sensible order

### `ui-gaps`: Gaps inside src/ui invite more copies (duplicate, size S)

- **Why it matters:** Each gap is a place where the next screen hand-makes its own label, shortcut or caret.
- **Board's fix:** Let Select take a Field's label, add Kbd, delete the unused PillSelect, point panel at surface, and use one caret size.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/ui/select.tsx:16-41, 101`; `src/ui/pill.tsx:13, 58-103`; `src/ui/native-select.tsx:52`; `src/ui/calendar.tsx:134`
- **Behavior:** Select takes a label and wraps itself in Field.

### `tag`: The removable chip is hand-made twice (duplicate, size S)

- **Why it matters:** A fix to the chip's touch target or wrapping reaches only one copy.
- **Board's fix:** Add Tag beside Badge (tone, onRemove and removeLabel, with a 24px remove button that grows to 44px on touch) and use it for categories, the gallery and table filters.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/metadata-fields.tsx:392-415`; `src/routes/prototypes.components.tsx:471-474`; `src/ui/table/table-components.tsx:105-147`
- **Behavior:** A tag input chip, with a “Remove {value}” button.

### `buttons-links`: Buttons, links and toggles are styled by hand (duplicate, size M)

- **Why it matters:** Focus, hover and the “on” state look different from one control to the next, and Sign out shows a clashing hover on the navy bar.
- **Board's fix:** Give Button a link variant and a pressed state, add TextLink (router or external, with “opens in a new tab”), and move every hand-styled control onto them.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/workspace/workspace.tsx:291-322, 415-417`; `src/host/source-ui.tsx:286-306`; `src/ui/table/table-components.tsx:139-146, 363-377`; `src/ui/toast.tsx:75-80`; `src/editor/modules/formatting/toolbar.tsx:294`; `src/ui/side-panel.tsx:59`
- **Behavior:** A text link has an external-link part.

### `touch-target`: Touch sizing stops at fields and menu rows (a11y, size S)

- **Why it matters:** On a tablet, or with a tremor, authors hit the wrong one of two 24px rail buttons, or a 28px close button.
- **Board's fix:** One touchTarget token in surface.ts (44px under a coarse pointer, or an invisible hit area) for Button, Select and pill triggers, the toast's close, the pager, sidebar rows and rail buttons.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/ui/button.tsx:4-17`; `src/ui/select.tsx:31-33`; `src/ui/toast.tsx:77`; `src/workspace/sidebar.ts:14-15`; `src/editor/react/block-rail.tsx:216, 233`; `src/pages/metadata-fields.tsx:407`
- **Behavior:** Toolbar buttons grow from 32 to 44px under a coarse pointer.

### `popup-names`: Grips, popups and bars are missing names and states (a11y, size S)

- **Why it matters:** A screen-reader user hears the form's block menu as “Move this block by dragging”, and isn't told which buttons open popups (WCAG 4.1.2).
- **Board's fix:** Popover.Content and Menu.Content require a label, the page's Insert and Block options get aria-haspopup and aria-expanded, and fold buttons get aria-expanded.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/block-controls.tsx:276-307, 378-385, 529-537`; `src/forms/react/gutter.tsx:580-592`; `src/forms/react/chrome.tsx:153-169`; `src/workspace/workspace.tsx:286-290`

### `confirm-dialog`: Confirmations and pending buttons have no shared component (duplicate, size M)

- **Why it matters:** The workspace's one irreversible action can be dismissed by a stray click, and a greyed-out button after a click reads as “that didn't work”.
- **Board's fix:** Add ConfirmDialog (an alert dialog with a question for its title, the consequence in plain words, a verb on its button, a pending label, an inline error, and close locked while pending), a pending state on Button, and Dialog.Actions. WorkspaceDialog takes a body and a footer so no dialog can skip them.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/workspace/remote-page-dialogs.tsx:259-310`; `src/workspace/workspace-dialog.tsx:17-30`; `src/host/source-ui.tsx:329-338`; `src/routes/prototypes.components.tsx:250-275`
- **Behavior:** ConfirmDialog with a role, confirm and pending labels and an error.

### `empty-loading`: Empty, failed and loading states are hand-made in 20 places (duplicate, size M)

- **Why it matters:** The same failure is a red banner on one screen and centred grey text on another, so authors can't tell “nothing here” from “something broke”.
- **Board's fix:** Add EmptyState (empty, not found and failed, at page, section and inline sizes) and LoadingState around the Loader, plus one no-match line for list popups, and replace every copy.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/workspace/workspace.tsx:107-122, 409-439, 469-486`; `src/workspace/remote-page-pane.tsx:84-106`; `src/workspace/services-list.tsx:207-224`; `src/routes/__root.tsx:28-66`; `src/ui/table/table-components.tsx:256-277`
- **Behavior:** An empty state takes an icon, title, description and actions.

## Verification

Use the [shared browser workflow](../BROWSER.md) and [implementation checks](../BRIEF.md#checks-before-every-commit). Capture new UI at 1440px and 390px, inspect the screenshots, and check keyboard focus and accessible names.
