# Package `write`: The page writing flow

Shared rules: [implementation brief](../BRIEF.md). Item status: [tracker](../TRACKER.md).

## Decisions already made for this package

- The page editor is `src/pages`, built on Lexical with the shared editor in `src/editor` (`core`, `react`, `modules`). The form editor is `src/forms`. Several items say "both editors". Do the shared part in `src/editor` and wire it into both, keeping your `src/forms` edits small.
- The "/" menus were just reworked. `src/editor/react/slash-trigger.ts` (`useSlashTrigger`) decides when they open. The page menu is `src/pages/slash-menu.tsx`, with rows in `src/pages/action-menu.tsx`; the form menu is `src/editor/react/slash-menu.tsx`. Keep their behaviour; tests are in `tests/editor` and `scripts/browser/content-modules.mjs`.
- Undo (`src/editor/core/history.ts`): tag discrete operations, such as a conversion or an insert, with `HISTORY_PUSH_TAG` so each gets its own undo step. Fields outside the canvas use `SKIP_DOM_SELECTION_TAG`.
- **Item order:** insert-placement, heading-levels, slash-ranking, slash-hint, title-flow, block-exit, turn-into, markdown-shortcuts, link-picker. markdown-shortcuts converts lines through turn-into, so do turn-into first.
- **slash-ranking:** one `rankActions(query, actions)` in `src/editor/core/actions.ts`, used by both editors' insert lists and the field pickers. A later package unifies the list UI (ActionList), so don't build a new list component; add the Markdown hint and the description footer to today's lists.
- **turn-into:**
  - One capability plus a shared Turn into submenu: one component, used in the page block menu (`pages/block-controls.tsx`), the form block menu (`forms/react/block-menu.tsx`) and the selection toolbar.
  - A later package merges the two block menus. Build the submenu so it drops straight into one menu.
- **link-picker:**
  - The page search needs workspace data, which `src/pages` can't import. Pass a page-search provider in from the host, through the page module or editor options. Without a provider, the picker accepts typed addresses only.
  - Typed addresses go through `normalizeLinkUrl` and the link policy (`src/editor/modules/links`).
  - "Link at caret": a popover showing the address with Edit and Remove whenever the caret is in a link, Action button or Start button.
  - With ⌘K and no selection, the picker inserts a link with its text.
  - The form logic's Link URL (`forms/features/logic/native-controls.tsx`) should use the same picker. Keep that edit small.
- Preserve `aria-haspopup` and `aria-expanded` on the page editor's Insert and Block options buttons in `block-controls.tsx`.

## Your items, in a sensible order

### `insert-placement`: New blocks land inside the caret's list item, Notice or table cell (ux, size M)

- **Why it matters:** A writer who ends a list and adds a heading or Start button gets it indented under the last bullet on the published page.
- **Board's fix:** One rule for where new blocks go, used by the slash menu, “+” and Add content: “+” means below its block (Alt for above), an empty list, quote or Notice line is lifted out first, and a block nests in a list item only when chosen from a line that has text.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/block-controls.tsx:194-219`; `src/pages/insertion.ts:16-48, 70-84`; `tests/pages/insertion.test.ts:17-52`
- **Behavior:** “+” adds a top-level block below, and an empty list line is lifted out.

### `heading-levels`: Six heading levels crowd the menus and push Start button out of view (ux, size S)

- **Why it matters:** The blocks writers use most sit below headings they never use, and Heading 1 invites a second page title. Live pages have no body H1, no H5 or H6, and 97 of 116 have a Start button.
- **Board's fix:** A searchOnly flag on EditorAction. The page lists Heading 2 and 3, finds Heading 4 by search, and stops offering H1, H5 and H6, while pages that contain them still open.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/modules/text.tsx:272-279`; `src/pages/action-menu.tsx:7-8`; `src/pages/preview.tsx:38`
- **Behavior:** Lists H1 to H3 and makes H4 to H6 search-only.

### `slash-ranking`: The insert menus can't find blocks by the words writers use (enhancement, size M)

- **Why it matters:** Writers type “h2”, “divider” or “callout” and get nothing, or press Enter on the wrong first result, because matching is a plain substring check in list order and no page block has aliases.
- **Board's fix:** One rankActions(query, actions) in actions.ts scoring title, aliases, Markdown hint and description, with aliases on EditorAction. While searching, results are one ranked list; each row shows its Markdown hint, and the highlighted block's description sits in a footer. The field pickers use the same matcher.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/editor/core/actions.ts:23, 119-126`; `src/pages/modules/text.tsx:265-297`; `src/pages/modules/components.tsx:319-370`; `src/pages/action-menu.tsx:56`; `src/editor/react/slash-menu.tsx:71-90, 159`
- **Behavior:** scoreSlashCommand ranks alias, title, prefix, initials, then substring, and the highlighted command's description shows in a footer.

### `slash-hint`: The “/” hint disappears after the first line (enhancement, size S)

- **Why it matters:** Once a page has any content, nothing tells the writer that “/” adds blocks.
- **Board's fix:** One placeholder on the caret's empty line in block-dom.ts, worded for the block type, used by both editors.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/block-controls.tsx:176-184, 261-271`; `src/pages/modules/text.tsx:298-299`; `src/editor/react/block-dom.ts:15-19`
- **Behavior:** “Start writing, or type '/' for commands” on the caret's empty line, “List” in a list.

### `title-flow`: Enter in the page title goes nowhere (enhancement, size S)

- **Why it matters:** After typing a title, the natural Enter does nothing, so the writer reaches for the mouse to start the page.
- **Board's fix:** Make the title, introduction and body one writing flow: Enter or ArrowDown at the end of a field moves to the next one, and ArrowUp on the body's first line moves back.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/metadata-fields.tsx:119-158`; `src/pages/editor.tsx:75-96`
- **Behavior:** Enter or ArrowDown at the end of the title moves into the body.

### `block-exit`: No keyboard way out of a Notice, Details, quote or button (enhancement, size M)

- **Why it matters:** After writing a Notice or quote at the end of a page, the writer has to open the block menu just to keep typing below it.
- **Board's fix:** Share the form editor's callout exit rules as one behaviour for Notice, Details, quotes and buttons: Enter on an empty last line, or in a button, continues below. Keep an empty paragraph at the end of the page, and let a click below the last block start writing there.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/modules/components.tsx:313-372`; `src/pages/modules/metadata.ts:47-65`; `src/editor/modules/callouts/module.ts:31-58`; `src/editor/modules/disclosure/module.ts:37-65`
- **Behavior:** Keeps a paragraph after any final block, and a click below the last one continues writing.

### `turn-into`: You can't change a block's type (enhancement, size M)

- **Why it matters:** A writer who decides a line should be a heading, quote or list item has to type it again in a new block.
- **Board's fix:** One turn-into capability for the text blocks, shown as a shared Turn into submenu in both block menus and the selection toolbar, with shortcuts. Text choices in the slash menu convert a line that has text instead of adding a block below it.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/pages/insertion.ts:70-84`; `src/pages/block-controls.tsx:608-655`; `src/editor/modules/formatting/toolbar.tsx:221-262`; `src/forms/react/block-menu.tsx:125, 166-187`
- **Behavior:** One block-type list shared by the block menu, the selection toolbar and the slash menu.

### `markdown-shortcuts`: No Markdown shortcuts while typing on a page (enhancement, size M)

- **Why it matters:** GOV.BB pages are Markdown, with 1,077 list items and 514 second-level headings live, so writers type “## ” and “- ” out of habit and get stray characters.
- **Board's fix:** A markdown field on EditorAction (the same text the menus show as a hint) and one registration that converts a line typed with it, through turn-into, in both editors. `[text](url)` becomes a link when typed or pasted, through the link policy.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/presets/govbb-page.ts:13-22`; `src/editor/modules/formatting/editing.ts:58-79`; `src/editor/modules/headings/module.ts:56`; `src/editor/modules/lists/module.ts:64`
- **Behavior:** Input rules for headings, lists, quotes and dividers, and Markdown links.

### `link-picker`: Links are a bare address box, with no page search and nothing at the caret (enhancement, size L)

- **Why it matters:** Writers can't see where a link or button goes without selecting it, can't find a GOV.BB page by name, and keyboard users have no direct way to remove a link.
- **Board's fix:** One LinkPicker in src/ui: a combobox over pages plus typed addresses, checked by the link policy. One “link at caret” popover shows the address with Edit and Remove, and covers Action and Start buttons too. Used for text links on both canvases, button destinations and the form logic's Link URL.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/editor/modules/formatting/toolbar.tsx:36-50, 149-156, 259-261, 301-365`; `src/pages/block-controls.tsx:773-803`; `src/pages/modules/components.tsx:350`; `src/pages/nodes.ts:63-64`
- **Behavior:** A “Search or type a URL” combobox, and a popover with Edit and Remove whenever the caret is in a link.

## Verification

Use the [shared browser workflow](../BROWSER.md) and [implementation checks](../BRIEF.md#checks-before-every-commit). Capture new UI at 1440px and 390px, inspect the screenshots, and check keyboard focus and accessible names.
