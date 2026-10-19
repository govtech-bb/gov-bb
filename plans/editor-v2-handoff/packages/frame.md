# Package `frame`: One frame for every screen

Shared rules: [implementation brief](../BRIEF.md). Item status: [tracker](../TRACKER.md).

## Decisions already made for this package

- **bar:**
  - Add `Bar` to `src/ui`: light and dark tones, with title, status, actions and separator parts. When it has a label, it's a named Base UI Toolbar.
  - Build these from it: the workspace header, which is the dark tone (its Sign out uses Button's `inverse` variant, fixing the clashing hover), both document bars, the side panel drawer's header (`ui/side-panel.tsx`) and the gallery demo.
  - Align the service sidebar header with the shared Bar.
- **document-bar:**
  - `DocumentBar` has fixed slots in a fixed order: the document's title as the h1, save status, undo and redo, Preview and Markdown (JSON for forms), publish, and the settings toggle. One notice area sits beneath it.
  - The browser-draft page editor, the API page pane and the form editor all render it, and hosts fill its slots instead of passing loose tools.
  - Forms fill what exists today: undo and redo if the form editor has history (check `src/editor/core/history.ts`), JSON and save status. A later forms package adds the form Preview and the settings toggle; leave those slots empty for forms.
- **sticky-bar:** the document bar is sticky from `md` up. Move the side panel's sticky top down by the bar's height. Use a CSS variable for the height, not a magic number in two places.
- **titles-headings:**
  - Each screen gets its title from the route: "Page – Service – GovBB editor" ("Services – GovBB editor" on the list).
  - The document title is the bar's h1. The title field on the canvas is an input, so there's no second h1.
  - `SidePanel.Section` takes its heading level from context.
  - Keep the title source reusable for breadcrumbs: one hook or route-context value.
- **save-state:**
  - One `SaveState` in `src/ui` is both the status and the action. It shows "Saved in this browser", "Unpublished changes", "Saving…", "Published", or an error strip with the reason, Try again and Download a copy.
  - It announces only failures, conflicts and saves the author asked for, through a polite live region. Typing pauses stay silent.
  - It's used for browser-draft pages, API pages and forms.
  - A later publishing package adds PublishControl and the conflict banner, so leave clear room for them.
- **paused-notice:**
  - One `PausedNotice` sits in the document bar's notice area for both editors. It names why editing is paused and carries the button that fixes it, such as "Review Markdown changes".
  - The Markdown file upload becomes "Replace from file".
  - `DraftStore` gets one pause rule.
- **notice-rule:**
  - Write the rule where developers will see it: the doc comment of `src/ui/banner.tsx` (or a short `src/ui/README.md`) and a gallery section. App problems go under the header; document problems in the document bar's notice area; dialog outcomes as a box Banner in the dialog's body; field problems on the field; after-the-fact results as toasts.
  - Move every listed message onto it. A failed import must look different from a successful one.
- Reuse the shared Button variants and states, Kbd, TextLink, ConfirmDialog and EmptyState.

## Your items, in a sensible order

### `bar`: 56px bars are styled by hand six times (duplicate, size M)

- **Why it matters:** The bars line up only while six class strings stay in step, and screen readers can't find any of them as toolbars.
- **Board's fix:** Add Bar to src/ui (light and dark tones, title, status, actions, separator), a named Base UI Toolbar when it has a label. Build the header, both document bars, the drawer and sidebar headers and the gallery demo from it.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/host/page-editor.tsx:31-42, 78-86, 109-136`; `src/workspace/form-editor.tsx:13-22`; `src/workspace/workspace.tsx:285-323`; `src/ui/side-panel.tsx:106-109`; `src/workspace/sidebar.ts:7-8`; `src/routes/prototypes.components.tsx:717-720`
- **Behavior:** The toolbar is Base UI Toolbar, and document bars are named toolbars.

### `document-bar`: Pages and forms have different document bars (duplicate, size M)

- **Why it matters:** Moving from a page to its form swaps a white bar with undo, preview and settings for a navy one with none of them, and the document's own name appears nowhere in its bar.
- **Board's fix:** Add a DocumentBar with fixed slots in a fixed order: the title as the h1, save status, undo and redo, Preview and Markdown, publish, and the settings toggle, with one notice area beneath. Both page modes and the form editor render it, and hosts fill its slots instead of passing loose tools.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/host/page-editor.tsx:78-86, 109-136`; `src/workspace/form-editor.tsx:13-22`; `src/workspace/remote-page-pane.tsx:320-333`; `src/pages/editor.tsx:21-73`
- **Behavior:** One bar for every entry: back, title, save state, preview, publish, settings and distraction-free, in that order.

### `sticky-bar`: The bar with Save scrolls away (ux, size S)

- **Why it matters:** Halfway down a long page the author can't see whether the work is saved, or reach Save without scrolling back up, while the settings panel stays in view.
- **Board's fix:** Make the document bar sticky from md up, and move the side panel's sticky top down by the bar's height.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/host/page-editor.tsx:28-32`; `src/workspace/form-editor.tsx:13-14`; `src/ui/side-panel.tsx:89`
- **Behavior:** Pins the bar above the canvas on wide screens.

### `titles-headings`: Every tab has the same title, and the editors have no h1 (a11y, size S)

- **Why it matters:** With several tabs open no one can tell them apart, and a screen-reader user opening a document finds no heading saying where they are (WCAG 2.4.2, 1.3.1).
- **Board's fix:** A screen title from the route (“Page – Service – GovBB editor”), the document title as the bar's h1, and SidePanel.Section taking its heading level from context.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/routes/__root.tsx:18-23`; `src/host/page-editor.tsx:109-115`; `src/pages/metadata-fields.tsx:125-145`; `src/ui/side-panel.tsx:107, 129`
- **Behavior:** The bar carries the entry's title as an h1.

### `save-state`: “Saved” means two different things, and failures hide their reason (ux, size M)

- **Why it matters:** An author sees “Saved” on a form and assumes colleagues can see it, or sees “Not saved” with its reason in a hover tooltip and no next step.
- **Board's fix:** One SaveState in src/ui that is both the status and the action: “Saved in this browser”, “Unpublished changes”, “Saving…”, “Published”, or an error strip with the reason, Try again and Download a copy. It announces only failures, conflicts and explicit saves.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/host/source-ui.tsx:393-467`; `src/persistence/draft-store.ts:289-298, 368-409`; `src/workspace/remote-page-pane.tsx:189-195, 311-331`; `src/workspace/form-editor.tsx:19-21`
- **Behavior:** One SaveButton is the status and the action, and announces each state.

### `paused-notice`: Paused editing points at the wrong button, and forms pause silently (ux, size S)

- **Why it matters:** With Markdown edits pending, the page says “Open Markdown”, which is the file upload, and a form canvas just stops responding with no visible reason.
- **Board's fix:** One PausedNotice in the document bar's notice area for both editors, naming the cause and carrying the button that fixes it (“Review Markdown changes”). Rename the upload “Replace from file”, and give DraftStore one pause rule.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/host/page-editor.tsx:99, 138-143`; `src/host/form-composer.tsx:46-53`; `src/host/source-ui.tsx:196-202, 369-376`
- **Behavior:** Every blocked state is a visible banner with its way out.

### `notice-rule`: There's no rule for where a message goes (duplicate, size M)

- **Why it matters:** Strip banners appear in four places and stack, and a failed import looks the same as a successful one, so authors miss the messages that matter.
- **Board's fix:** Write the rule into src/ui and the gallery: app problems under the header, document problems in the document bar's notice slot, dialog outcomes as a box Banner in its body, field problems on the field, after-the-fact results as toasts. Then move every message onto it.
- **Where (paths under apps/editor_v2, line numbers as of 531b24bb):** `src/app.tsx:91-95`; `src/workspace/workspace.tsx:324-328`; `src/workspace/remote-page-pane.tsx:303-307`; `src/host/page-editor.tsx:137-143`; `src/host/source-ui.tsx:316-323`; `src/host/form-json-dialog.tsx:218-233`
- **Behavior:** DialogError in dialogs, banners for an entry's state, toasts for results.

## Verification

Use the [shared browser workflow](../BROWSER.md) and [implementation checks](../BRIEF.md#checks-before-every-commit). Capture new UI at 1440px and 390px, inspect the screenshots, and check keyboard focus and accessible names.
