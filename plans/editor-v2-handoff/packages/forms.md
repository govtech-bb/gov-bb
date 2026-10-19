# Package `forms`: Form pages, defaults and the drawing kit

Shared rules: [implementation brief](../BRIEF.md). Item status: [tracker](../TRACKER.md).

## Decisions already made for this package

- **form-page-object (decided with the user):**
  - A form page's menu always acts on the whole page:
    - Move up and Move down.
    - Duplicate, which copies the page with its questions.
    - Delete, which names how many questions go ("Delete page and 4 questions"), then shows a "Page deleted" toast with Undo. Use the existing `toast()` in `src/ui/toast.tsx`; add an action to it if it has none.
    - Merge with previous page.
  - Question settings never show on a page, and folding a page never changes what its actions do.
  - Each action is one undo step (`HISTORY_PUSH_TAG`; see `src/editor/core/history.ts`).
- **error-message-defaults (decided with the user):**
  - Store no message until the author writes one. Export fills an empty message from the question's current label, using `ssb.ts`'s wording, so a published form says "Enter your National ID number".
  - Saved drafts that stored the old generic "Enter an answer" verbatim count as not set, so they get the better default. Old drafts must still load, and exports of existing forms must not lose a message an author really wrote.
  - In today's settings UI (the block menu), label each message "Default" or "Custom", with Reset to default. A later package moves question settings into a side panel; don't build it.
- **canvas-text:**
  - Every visual type or state gets a text twin: one shared state tag for Hidden (visible text, not just a picture), visually hidden "Answer: Email", tips that open on focus as well as hover, and a selection edge of at least 3:1.
  - Preserve the shared line hints in `src/editor/react/block-dom.ts`.
- **preview-sheet:** one `PreviewSheet` and `PreviewQuestion` wrap every preview in the insert dialog, page blocks included.
- **drawing-kit:**
  - One GovBB drawing kit (box, markers, select, buttons, field width, optional mark) is used by the form canvas, the insert previews and the GovBB button rules in `src/pages/page.css`. Each preview reuses its field's canvas drawing.
  - What looks right today must look the same afterwards: compare DOM and computed styles, and take before and after screenshots of the form canvas and the insert dialog in your scratch folder.
- Preserve `aria-expanded` and counts on fold buttons in `forms/react/chrome.tsx`, the gutter grip's "Block actions" name in `forms/react/gutter.tsx`, and shared Kbd hints.
- Use the [browser fixture helpers](../BROWSER.md) to open seeded form routes; `/` opens Services.

## Your items, in a sensible order

### `form-page-object`: Form pages act like dividers, and folding changes what their actions do (bug, size M)

- **Why it matters:** “Duplicate page” leaves an empty page, Delete merges its questions into the page before, and on a folded page one switch rewrites every question on it.
- **Board's fix:** Make a page a first-class object whose menu always acts on the whole page: Move, Duplicate, Delete with a count and Undo, and Merge with previous page. Never show question settings on a page.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/forms/editor/nodes.tsx:458-461, 529-542`; `src/forms/editor/structure/blocks.ts:73-88, 176-204, 254-262, 385-410`; `src/forms/react/gutter.tsx:449-453, 551, 681-749`
- **Behavior:** An Outline section in the settings panel shows the document's structure.

### `error-message-defaults`: New questions store “Enter an answer” as their error message (bug, size M)

- **Why it matters:** Applicants see “Enter an answer” instead of “Enter your National ID number”, and the better default the editor already computes never shows.
- **Board's fix:** Store no message until the author writes one, compute defaults from the current label with ssb.ts's wording, and label each message Default or Custom, with Reset to default.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/forms/editor/native-settings.ts:158, 220, 269`; `src/forms/editor/native-field-controls.ts:43-54, 128-181`; `src/presets/form-registry/questions.ts:21-24`
- **Note:** Bigger than it looked: nothing fills an empty message at export, so storing no message needs export to compute defaults from each question's label. Best done with the form settings panel.

### `canvas-text`: The form canvas shows field types and states only as pictures (a11y, size M)

- **Why it matters:** A blind author hears a question and then a blank line, never “email” or “date”, and a low-vision author can't read a hidden block's text (WCAG 1.3.1, 1.4.3).
- **Board's fix:** Every visual type or state gets a text twin: a shared state tag for Hidden, an sr-only “Answer: Email”, tips that open on focus, and a selection edge of at least 3:1.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/forms/editor/drawn-input.ts:5-33`; `src/editor/react/block-dom.ts:7-51`; `src/forms/editor/nodes.tsx:167-178`

### `preview-sheet`: The insert preview frame is copied five times (duplicate, size S)

- **Why it matters:** In one insert dialog page blocks preview bare while form blocks sit on a sheet, and every new module copies the frame.
- **Board's fix:** The insert dialog wraps every preview in one PreviewSheet, with a PreviewQuestion for the label, hint and optional mark.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/forms/react/authoring-preview.tsx:23-34`; `src/forms/editor/field-module.tsx:42-55`; `src/forms/editor/content-module.tsx:27-34`; `src/presets/form-registry/preview.tsx:97-123`

### `drawing-kit`: The form's GovBB controls are drawn about fifteen times (duplicate, size L)

- **Why it matters:** The insert preview and the canvas can disagree about the same field, and a GovBB button looks different on a page than on a form.
- **Board's fix:** One GovBB drawing kit (box, markers, select, buttons, field width and the optional mark) used by the canvas, the previews and page.css, with each preview reusing its field's canvas drawing.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/forms/editor/answer-dom.ts:56`; `src/forms/features/shared/presentation.tsx:4-9`; `src/forms/features/pages/buttons.tsx:257-272`; `src/pages/page.css:144-157`

## Verification

Use the [shared browser workflow](../BROWSER.md) and [implementation checks](../BRIEF.md#checks-before-every-commit). Capture new UI at 1440px and 390px, inspect the screenshots, and check keyboard focus and accessible names.
