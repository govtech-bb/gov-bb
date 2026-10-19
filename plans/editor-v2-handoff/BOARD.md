# Editor backlog item snapshot

Read-only snapshot of the 88 item JSON files found in the temporary handoff. Status values may lag the final handoff; reconcile against commits before marking an item complete. Item descriptions use project-neutral wording; repository paths are preserved without executing the old board scripts.

## Status inventory

{"todo":74,"parked":2,"done":12}

## action-list

```json
{
  "id": "action-list",
  "behavior": "The “+” types a slash and opens the same menu, and the command palette is Base UI Autocomplete.",
  "fix": "One ActionList in src/ui on Base UI Autocomplete: grouped items with an icon, title and description, one empty state, and optional search and preview. Both editors' “/” and “+” use it, and so do @-mentions and the formula list.",
  "kind": "duplicate",
  "order": 2,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "The insert list is built four times",
  "where": [
    "src/editor/react/slash-menu.tsx:125-167",
    "src/pages/slash-menu.tsx:88-113",
    "src/pages/action-menu.tsx:7-63",
    "src/pages/block-controls.tsx:325-436",
    "src/editor/react/insert-modal.tsx:91-189",
    "src/forms/features/mentions/presentation.tsx:157-209",
    "src/forms/features/calculations/formula-editor.tsx:1514-1552"
  ],
  "why": "Pages and forms offer different insert lists, with different wording, widths and keys, every fix lands four times, and screen readers get four behaviours for one task."
}
```

## announce

```json
{
  "id": "announce",
  "behavior": "An sr-only polite announcer.",
  "fix": "One announce() live region mounted once, used for block actions (“Moved up”, “Deleted. Press Ctrl+Z to undo.”) and for banners.",
  "kind": "a11y",
  "order": 15,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "Real changes are silent, while saving talks on every pause",
  "where": [
    "src/host/source-ui.tsx:458-466",
    "src/pages/block-controls.tsx:656-713",
    "src/forms/react/gutter.tsx:424-454, 551-554",
    "src/ui/banner.tsx:44-46"
  ],
  "why": "A screen-reader user hears “Saving… Saved” whenever they stop typing, but nothing when a block moves or is deleted."
}
```

## api-asks

```json
{
  "id": "api-asks",
  "behavior": "Drafts autosave every 2 seconds without a revision, and locks offer Take over.",
  "fix": "Agree an api_v2 plan: draft and scheduled fields, a reviewer-link endpoint, redirects when a path changes, a save that doesn't add a version, and entry locks.",
  "kind": "enhancement",
  "note": "Needs the api_v2 team.",
  "order": 7,
  "size": "L",
  "status": "parked",
  "theme": "publishing",
  "title": "Ask api_v2 for drafts, scheduling, preview links and redirects",
  "where": [
    "apps/api_v2/src/modules/page-visibility.ts",
    "src/workspace/page-history-dialog.tsx:52",
    "src/api/openapi.d.ts:945"
  ],
  "why": "Keeping a live page's edits unpublished, scheduling, reviewer links, redirects, autosave without a new version, and edit locks all need the API."
}
```

## auth-every-click

```json
{
  "id": "auth-every-click",
  "commit": "03dd4ff4",
  "behavior": "The admin layout route has no beforeLoad; the server redirects to sign-in instead.",
  "fix": "Let the workspace guard reuse the session it already holds, and leave expiry to the app's timer and focus check, which already show a gentle banner.",
  "kind": "bug",
  "note": "Four moves between screens made five sign-in requests; now one.",
  "order": 4,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Every click between screens waits for a sign-in check",
  "where": [
    "src/routes/_workspace.tsx:8-22",
    "src/auth/better-auth-client.ts:16, 25-33",
    "src/app.tsx:26-75"
  ],
  "why": "Each page switch costs a round trip to the sign-in service, which can take 15 seconds to time out, and one failed check replaces the editor with “Unable to sign in”."
}
```

## author-notes

```json
{
  "id": "author-notes",
  "fix": "An AuthorNote for everything applicants never see, Badge for statuses, and one FieldRef look and truncation rule.",
  "kind": "duplicate",
  "order": 14,
  "size": "S",
  "status": "todo",
  "theme": "forms",
  "title": "Author-only captions, statuses and field references are hand-drawn",
  "where": [
    "src/forms/react/logic-pickers.tsx:109-121",
    "src/forms/features/logic/authoring.css:1-7",
    "src/forms/features/mentions/node.ts:47-69",
    "src/forms/features/calculations/formula-editor.tsx:149-166"
  ],
  "why": "In native forms a logic block loses its “not shown on the form” caption, and a field reference looks different in text than in a formula."
}
```

## bar

```json
{
  "id": "bar",
  "behavior": "The toolbar is Base UI Toolbar, and document bars are named toolbars.",
  "fix": "Add Bar to src/ui (light and dark tones, title, status, actions, separator), a named Base UI Toolbar when it has a label. Build the header, both document bars, the drawer and sidebar headers and the gallery demo from it.",
  "kind": "duplicate",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "frame",
  "title": "56px bars are styled by hand six times",
  "where": [
    "src/host/page-editor.tsx:31-42, 78-86, 109-136",
    "src/workspace/form-editor.tsx:13-22",
    "src/workspace/workspace.tsx:285-323",
    "src/ui/side-panel.tsx:106-109",
    "src/workspace/sidebar.ts:7-8",
    "src/routes/prototypes.components.tsx:717-720"
  ],
  "why": "The bars line up only while six class strings stay in step, and screen readers can't find any of them as toolbars."
}
```

## block-exit

```json
{
  "id": "block-exit",
  "behavior": "Keeps a paragraph after any final block, and a click below the last one continues writing.",
  "fix": "Share the form editor's callout exit rules as one behaviour for Notice, Details, quotes and buttons: Enter on an empty last line, or in a button, continues below. Keep an empty paragraph at the end of the page, and let a click below the last block start writing there.",
  "kind": "enhancement",
  "order": 7,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "No keyboard way out of a Notice, Details, quote or button",
  "where": [
    "src/pages/modules/components.tsx:313-372",
    "src/pages/modules/metadata.ts:47-65",
    "src/editor/modules/callouts/module.ts:31-58",
    "src/editor/modules/disclosure/module.ts:37-65"
  ],
  "why": "After writing a Notice or quote at the end of a page, the writer has to open the block menu just to keep typing below it."
}
```

## block-menu

```json
{
  "id": "block-menu",
  "behavior": "BlockMenu: Turn into, Duplicate, Move up and down, then a red Delete.",
  "fix": "One BlockMenu on Menu for both editors: the block's name as the group label, Turn into, Duplicate, Move up, Move down, then Delete last in red. Editor-specific groups go above.",
  "kind": "duplicate",
  "order": 8,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "Two block menus, and neither puts Delete last",
  "where": [
    "src/pages/block-controls.tsx:528-717",
    "src/pages/action-menu.tsx:65-78",
    "src/forms/react/block-menu.tsx:45-165"
  ],
  "why": "Keyboard users get an arrow-key menu in forms but a run of buttons in pages, neither Delete looks destructive, and only pages can move a block up or down from the menu."
}
```

## breadcrumbs

```json
{
  "id": "breadcrumbs",
  "behavior": "A “Posts / First Post” breadcrumb and the entry's h1.",
  "fix": "One location trail (Services › Service › Page or Form) feeding a shared Breadcrumbs (a named nav with aria-current), the tab title and a route announcement. Mark Services current only on Services.",
  "kind": "enhancement",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "The header doesn't say where you are",
  "where": [
    "src/workspace/workspace.tsx:285-312",
    "src/routes/__root.tsx:22"
  ],
  "why": "Authors can't tell which page they're on or get back to the service in one click, and every screen announces Services as the current page."
}
```

## buttons-links

```json
{
  "id": "buttons-links",
  "behavior": "A text link has an external-link part.",
  "fix": "Give Button a link variant and a pressed state, add TextLink (router or external, with “opens in a new tab”), and move every hand-styled control onto them.",
  "kind": "duplicate",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "controls",
  "title": "Buttons, links and toggles are styled by hand",
  "where": [
    "src/workspace/workspace.tsx:291-322, 415-417",
    "src/host/source-ui.tsx:286-306",
    "src/ui/table/table-components.tsx:139-146, 363-377",
    "src/ui/toast.tsx:75-80",
    "src/editor/modules/formatting/toolbar.tsx:294",
    "src/ui/side-panel.tsx:59"
  ],
  "why": "Focus, hover and the “on” state look different from one control to the next, and Sign out shows a clashing hover on the navy bar."
}
```

## canvas-text

```json
{
  "id": "canvas-text",
  "fix": "Every visual type or state gets a text twin: a shared state tag for Hidden, an sr-only “Answer: Email”, tips that open on focus, and a selection edge of at least 3:1.",
  "kind": "a11y",
  "order": 16,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "The form canvas shows field types and states only as pictures",
  "where": [
    "src/forms/editor/drawn-input.ts:5-33",
    "src/editor/react/block-dom.ts:7-51",
    "src/forms/editor/nodes.tsx:167-178"
  ],
  "why": "A blind author hears a question and then a blank line, never “email” or “date”, and a low-vision author can't read a hidden block's text (WCAG 1.3.1, 1.4.3)."
}
```

## checklist

```json
{
  "id": "checklist",
  "behavior": "One popover with a search field and indented Checkbox rows.",
  "fix": "A CheckList (searchable, with tri-state parents) on the shared Checkbox, and a SearchField for every popup search.",
  "kind": "duplicate",
  "order": 11,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Three ways to pick blocks with checkboxes, and four search bars",
  "where": [
    "src/forms/react/logic-pickers.tsx:889-1367",
    "src/forms/features/logic/native-controls.tsx:589-631, 1623-1656",
    "src/editor/react/insert-modal.tsx:103-131",
    "src/pages/block-controls.tsx:386-396"
  ],
  "why": "Choosing blocks for a rule works differently depending on the form's source, and one version looks like no other list."
}
```

## confirm-dialog

```json
{
  "id": "confirm-dialog",
  "behavior": "ConfirmDialog with a role, confirm and pending labels and an error.",
  "fix": "Add ConfirmDialog (an alert dialog with a question for its title, the consequence in plain words, a verb on its button, a pending label, an inline error, and close locked while pending), a pending state on Button, and Dialog.Actions. WorkspaceDialog takes a body and a footer so no dialog can skip them.",
  "kind": "duplicate",
  "order": 5,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "Confirmations and pending buttons have no shared component",
  "where": [
    "src/workspace/remote-page-dialogs.tsx:259-310",
    "src/workspace/workspace-dialog.tsx:17-30",
    "src/host/source-ui.tsx:329-338",
    "src/routes/prototypes.components.tsx:250-275"
  ],
  "why": "The workspace's one irreversible action can be dismissed by a stray click, and a greyed-out button after a click reads as “that didn't work”."
}
```

## conflicts

```json
{
  "id": "conflicts",
  "behavior": "“What you typed is still here. Saving replaces the newer version.” with Save anyway.",
  "fix": "One ConflictBanner for both kinds of conflict: who saved and when, Compare, and buttons named by outcome (“Publish mine over theirs”, “Use theirs”, “Download mine”), then a toast saying what happened.",
  "kind": "ux",
  "order": 6,
  "size": "S",
  "status": "todo",
  "theme": "publishing",
  "title": "Conflict choices don't say who changed what, or what each keeps",
  "where": [
    "src/workspace/remote-page-pane.tsx:186-187, 218-245",
    "src/host/source-ui.tsx:140-160",
    "src/api/queries.ts:32-45"
  ],
  "why": "“Keep my version” quietly sets up an overwrite of a colleague's published edit."
}
```

## delete-question

```json
{
  "id": "delete-question",
  "behavior": "Deleting a field asks first and lists what goes with it.",
  "fix": "Before deleting, list the rules, calculations and references that use the question, which references.ts can already find, then show an Undo toast.",
  "kind": "ux",
  "order": 4,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Deleting a question silently breaks logic",
  "where": [
    "src/forms/react/gutter.tsx:424-454, 603-625",
    "src/forms/features/logic/native-controls.tsx:120-127",
    "src/forms/schema/references.ts:246"
  ],
  "why": "One mis-click removes a question and quietly disables every rule and calculation that used it."
}
```

## delete-with-subpages

```json
{
  "id": "delete-with-subpages",
  "commit": "fcc3a74d",
  "fix": "Disable Delete page with the reason while the page has sub-pages, and say when a delete removes the service.",
  "kind": "bug",
  "order": 12,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Delete page is offered when the delete can only fail",
  "where": [
    "src/workspace/service-pages-nav.tsx:51-53",
    "src/workspace/remote-page-dialogs.tsx:46, 282-308",
    "src/workspace/workspace.tsx:559-563"
  ],
  "why": "An entry page with a start page can't be deleted, but the author finds out only after confirming, and deleting a lone entry page removes the whole service without saying so."
}
```

## distraction-free

```json
{
  "id": "distraction-free",
  "behavior": "A bar button and ⌘⇧\\.",
  "fix": "A toggle and ⌘⇧\\ in the document bar for both editors that hides the header, sidebar and panel (keeping their state) and keeps the bar pinned.",
  "kind": "enhancement",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "history",
  "title": "No distraction-free mode",
  "where": [
    "src/workspace/workspace.tsx:285, 329-335",
    "src/ui/side-panel.tsx:87"
  ],
  "why": "Writing a long page between a header and two side columns leaves about 580px, and a lot to look at."
}
```

## document-bar

```json
{
  "id": "document-bar",
  "behavior": "One bar for every entry: back, title, save state, preview, publish, settings and distraction-free, in that order.",
  "fix": "Add a DocumentBar with fixed slots in a fixed order: the title as the h1, save status, undo and redo, Preview and Markdown, publish, and the settings toggle, with one notice area beneath. Both page modes and the form editor render it, and hosts fill its slots instead of passing loose tools.",
  "kind": "duplicate",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "frame",
  "title": "Pages and forms have different document bars",
  "where": [
    "src/host/page-editor.tsx:78-86, 109-136",
    "src/workspace/form-editor.tsx:13-22",
    "src/workspace/remote-page-pane.tsx:320-333",
    "src/pages/editor.tsx:21-73"
  ],
  "why": "Moving from a page to its form swaps a white bar with undo, preview and settings for a navy one with none of them, and the document's own name appears nowhere in its bar."
}
```

## drawing-kit

```json
{
  "id": "drawing-kit",
  "fix": "One GovBB drawing kit (box, markers, select, buttons, field width and the optional mark) used by the canvas, the previews and page.css, with each preview reusing its field's canvas drawing.",
  "kind": "duplicate",
  "order": 12,
  "size": "L",
  "status": "todo",
  "theme": "forms",
  "title": "The form's GovBB controls are drawn about fifteen times",
  "where": [
    "src/forms/editor/answer-dom.ts:56",
    "src/forms/features/shared/presentation.tsx:4-9",
    "src/forms/features/pages/buttons.tsx:257-272",
    "src/pages/page.css:144-157"
  ],
  "why": "The insert preview and the canvas can disagree about the same field, and a GovBB button looks different on a page than on a form."
}
```

## empty-loading

```json
{
  "id": "empty-loading",
  "behavior": "An empty state takes an icon, title, description and actions.",
  "fix": "Add EmptyState (empty, not found and failed, at page, section and inline sizes) and LoadingState around the Loader, plus one no-match line for list popups, and replace every copy.",
  "kind": "duplicate",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "Empty, failed and loading states are hand-made in 20 places",
  "where": [
    "src/workspace/workspace.tsx:107-122, 409-439, 469-486",
    "src/workspace/remote-page-pane.tsx:84-106",
    "src/workspace/services-list.tsx:207-224",
    "src/routes/__root.tsx:28-66",
    "src/ui/table/table-components.tsx:256-277"
  ],
  "why": "The same failure is a red banner on one screen and centred grey text on another, so authors can't tell “nothing here” from “something broke”."
}
```

## error-message-defaults

```json
{
  "id": "error-message-defaults",
  "fix": "Store no message until the author writes one, compute defaults from the current label with ssb.ts's wording, and label each message Default or Custom, with Reset to default.",
  "kind": "bug",
  "note": "Bigger than it looked: nothing fills an empty message at export, so storing no message needs export to compute defaults from each question's label. Best done with the form settings panel.",
  "order": 9,
  "size": "M",
  "status": "todo",
  "theme": "bugs",
  "title": "New questions store “Enter an answer” as their error message",
  "where": [
    "src/forms/editor/native-settings.ts:158, 220, 269",
    "src/forms/editor/native-field-controls.ts:43-54, 128-181",
    "src/presets/form-registry/questions.ts:21-24"
  ],
  "why": "Applicants see “Enter an answer” instead of “Enter your National ID number”, and the better default the editor already computes never shows."
}
```

## error-summary

```json
{
  "id": "error-summary",
  "behavior": "Names the invalid fields and can scroll to and focus one.",
  "fix": "One ErrorSummary whose items focus their field, opening the side panel first. Every message about one value goes through Field's error, with a hidden-label option for inline fields such as the title.",
  "kind": "a11y",
  "order": 2,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "Error lists don't lead to their fields",
  "where": [
    "src/workspace/remote-page-pane.tsx:246-255, 341",
    "src/workspace/remote-page-dialogs.tsx:50-66, 117-164, 209-244",
    "src/pages/metadata-fields.tsx:142-145",
    "src/pages/block-controls.tsx:767-800",
    "src/ui/field.tsx:73-77, 98-101"
  ],
  "why": "After “There is a problem: Path…” the author has to work out that Path is in a closed drawer, and screen readers hear “invalid” with no reason (WCAG 3.3.1)."
}
```

## failure-copy

```json
{
  "id": "failure-copy",
  "behavior": "Chooses words from the cause, and never offers a retry that can't succeed.",
  "fix": "One describeApiFailure(error, task) that returns the words and the one useful action for offline, 401, 403, 404, 409, 422 and 5xx, shown by one failure Banner.",
  "kind": "ux",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "Failure messages guess at the cause",
  "where": [
    "src/workspace/workspace.tsx:436",
    "src/workspace/remote-page-pane.tsx:103, 287-298",
    "src/workspace/services-list.tsx:209-212",
    "src/workspace/remote-page-dialogs.tsx:36-47"
  ],
  "why": "Authors told to try again when they lack permission, or to check their sign-in when the server is down, waste time and call support."
}
```

## field-focus-jump

```json
{
  "id": "field-focus-jump",
  "commit": "19deec7f",
  "fix": "The page's fields update it without restoring its selection (SKIP_DOM_SELECTION_TAG), as the form builder's fields outside the canvas already do.",
  "kind": "bug",
  "note": "Found while fixing undo; not in the agents' audit.",
  "order": 5.5,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Typing in the title after a click in the page jumps into the page",
  "where": [
    "src/pages/metadata-fields.tsx:56-66"
  ],
  "why": "After a click anywhere in the page, only the first character typed in the title, introduction or a page setting stayed there: the rest went into the page's text."
}
```

## first-form

```json
{
  "id": "first-form",
  "behavior": "Empty states lead with one action, such as “Add First Field”.",
  "fix": "A guided empty state with Add question and a few starters, named formats with Custom pattern under Advanced, IDs and aliases moved to Advanced, and plain words from TERMINOLOGY.md.",
  "kind": "ux",
  "order": 6,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "First-time authors meet internals before the basics",
  "where": [
    "src/workspace/documents.ts:110-119",
    "src/forms/react/block-menu.tsx:66-81",
    "src/forms/features/short-answer/controls.tsx:64-125",
    "src/forms/core/formats.ts:9-44"
  ],
  "why": "A ministry author's first impression is IDs, regular expressions, and a “Hide” that doesn't do what they expect."
}
```

## form-check

```json
{
  "id": "form-check",
  "behavior": "Fields show their own errors, and publishing waits until they're fixed.",
  "fix": "Run the form check while editing, show “N problems” in the bar, list them in plain words in the panel, select the block when one is clicked, and reuse the list as the publish gate.",
  "kind": "ux",
  "order": 2,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Problems only show up as JSON paths after export",
  "where": [
    "src/host/form-json-dialog.tsx:77-90, 163-173",
    "src/forms/schema/diagnostics.ts:3-9",
    "src/forms/features/pages/queries.ts:70-147"
  ],
  "why": "A first-time author learns about a broken rule only at the end, as a path they can't map back to the canvas."
}
```

## form-page-object

```json
{
  "id": "form-page-object",
  "behavior": "An Outline section in the settings panel shows the document's structure.",
  "fix": "Make a page a first-class object whose menu always acts on the whole page: Move, Duplicate, Delete with a count and Undo, and Merge with previous page. Never show question settings on a page.",
  "kind": "bug",
  "order": 10,
  "size": "M",
  "status": "todo",
  "theme": "bugs",
  "title": "Form pages act like dividers, and folding changes what their actions do",
  "where": [
    "src/forms/editor/nodes.tsx:458-461, 529-542",
    "src/forms/editor/structure/blocks.ts:73-88, 176-204, 254-262, 385-410",
    "src/forms/react/gutter.tsx:449-453, 551, 681-749"
  ],
  "why": "“Duplicate page” leaves an empty page, Delete merges its questions into the page before, and on a folded page one switch rewrites every question on it."
}
```

## form-preview

```json
{
  "id": "form-preview",
  "behavior": "“Preview” and “Preview draft” in the editor bar.",
  "fix": "A Preview that runs the form a page at a time with its logic, validation and a filled-in Check answers page, plus Go to page and Fill sample answers.",
  "kind": "enhancement",
  "order": 3,
  "size": "L",
  "status": "todo",
  "theme": "forms",
  "title": "There's no way to preview or test a form",
  "where": [
    "src/workspace/form-editor.tsx:13-22",
    "src/forms/features/pages/presentation.tsx:89",
    "tests/helpers/native-fixture-interpreter.ts"
  ],
  "why": "An author can't check that a follow-up appears or a page is skipped without exporting the form and testing it somewhere else."
}
```

## format-keys

```json
{
  "id": "format-keys",
  "commit": "595f9eae",
  "behavior": "Saves every mark it shows, refuses the rest, and has Clear formatting.",
  "fix": "Cmd+B works at the caret like Cmd+I, formats the page can't save are removed on paste and on load, and the bar gains Clear formatting.",
  "kind": "bug",
  "note": "The toolbar's role and name stay with the format-toolbar item.",
  "order": 7,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Cmd+B needs a selection, and pasted formatting looks kept but isn't",
  "where": [
    "src/editor/modules/formatting/toolbar.tsx:158-160, 221-262",
    "src/pages/modules/text.tsx:32-34, 138-150"
  ],
  "why": "Writers who bold as they type get nothing, and superscript or highlight pasted from Word shows in the editor but is gone from the published page."
}
```

## format-toolbar

```json
{
  "id": "format-toolbar",
  "behavior": "A role=toolbar named “Format selection” with arrow keys.",
  "fix": "Build it on the shared Bar as a named toolbar, with an entry key (Alt+F10) and a Remove link shortcut.",
  "kind": "a11y",
  "order": 14,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "The selection toolbar is out of keyboard reach",
  "where": [
    "src/editor/modules/formatting/toolbar.tsx:136-165, 208-220, 259-261, 321-325"
  ],
  "why": "Keyboard and screen-reader users can bold text and add a link, but can't remove a link or find the toolbar."
}
```

## forms-to-api

```json
{
  "id": "forms-to-api",
  "fix": "Store forms in the content API with their service, using the pages' save, history and conflict flow, and add Publish behind the form check. Until then the status says “Saved in this browser only”.",
  "kind": "enhancement",
  "note": "Needs api_v2 and a product decision; PRODUCT.md rules it out for now.",
  "order": 17,
  "size": "L",
  "status": "parked",
  "theme": "forms",
  "title": "A form can't leave this browser",
  "where": [
    "src/workspace/form-editor.tsx:13-22",
    "src/workspace/remote-page-dialogs.tsx:204, 230-231",
    "apps/editor_v2/PRODUCT.md:11"
  ],
  "why": "An author can build a whole form and see “Saved”, but clearing the browser loses it and colleagues never see it."
}
```

## glossary

```json
{
  "id": "glossary",
  "fix": "Add a workspace section to TERMINOLOGY.md (service, entry, start and supporting page, form, browser draft, save, publish, visibility, path, GOV.BB), use one verb and one noun for each thing, and fail a test on “content API” in UI strings.",
  "kind": "ux",
  "order": 6,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "One thing goes by several names",
  "where": [
    "src/workspace/workspace.tsx:400, 447",
    "src/workspace/remote-page-dialogs.tsx:111, 203, 285",
    "src/workspace/local-document-dialogs.tsx:31, 118",
    "src/workspace/services-list.tsx:104, 223",
    "docs/TERMINOLOGY.md"
  ],
  "why": "“Add document” opens “Add a page”, two different “Create a service” dialogs make different things, and ministry staff are told about the “content API”."
}
```

## heading-levels

```json
{
  "id": "heading-levels",
  "behavior": "Lists H1 to H3 and makes H4 to H6 search-only.",
  "fix": "A searchOnly flag on EditorAction. The page lists Heading 2 and 3, finds Heading 4 by search, and stops offering H1, H5 and H6, while pages that contain them still open.",
  "kind": "ux",
  "order": 10,
  "size": "S",
  "status": "todo",
  "theme": "blocks",
  "title": "Six heading levels crowd the menus and push Start button out of view",
  "where": [
    "src/pages/modules/text.tsx:272-279",
    "src/pages/action-menu.tsx:7-8",
    "src/pages/preview.tsx:38"
  ],
  "why": "The blocks writers use most sit below headings they never use, and Heading 1 invites a second page title. Live pages have no body H1, no H5 or H6, and 97 of 116 have a Start button."
}
```

## hidden-focus

```json
{
  "id": "hidden-focus",
  "commit": "8cd5daa2",
  "fix": "Share the table's focus ring for visually hidden controls through surface.ts, use Menu.SubTrigger for “Pick a field”, and lint outline-none that has no focus style.",
  "kind": "a11y",
  "note": "A lint rule against outline-none without a focus style is left for later.",
  "order": 13,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Two controls hide keyboard focus",
  "where": [
    "src/ui/calendar.tsx:61-69",
    "src/forms/features/date/controls.tsx:197-203",
    "src/ui/table/table-components.tsx:17-19"
  ],
  "why": "A keyboard user choosing a date, or a date field, can't see where focus is (WCAG 2.4.7)."
}
```

## history-panel

```json
{
  "id": "history-panel",
  "behavior": "Revisions in the settings panel, a version bar, and a warning before restoring.",
  "fix": "A History section in the side panel, and a VersionView that swaps the canvas for a read-only render with older and newer, Show changes, and Restore with a confirmation. Built once for pages, then forms.",
  "kind": "enhancement",
  "order": 1,
  "size": "L",
  "status": "todo",
  "theme": "history",
  "title": "History is a small pop-up with no comparison",
  "where": [
    "src/workspace/remote-page-pane.tsx:322, 344-364",
    "src/workspace/page-history-dialog.tsx"
  ],
  "why": "To find when a sentence changed, an author opens versions one by one in a cramped box and can't see what differs."
}
```

## history-scroll

```json
{
  "id": "history-scroll",
  "commit": "65d65eee",
  "fix": "The list and the version view sit in the dialog's scrolling body, with Back and Restore in its footer.",
  "kind": "bug",
  "note": "A regression from 4a9040ae, found by four of the agents.",
  "order": 1,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Page history can't scroll",
  "where": [
    "src/workspace/page-history-dialog.tsx",
    "src/workspace/workspace-dialog.tsx:4",
    "src/ui/dialog.tsx:97, 139-146"
  ],
  "why": "With more saves than fit on screen, the older versions and the end of a long version were cut off, and the content ran to the dialog's edges."
}
```

## insert-placement

```json
{
  "id": "insert-placement",
  "behavior": "“+” adds a top-level block below, and an empty list line is lifted out.",
  "fix": "One rule for where new blocks go, used by the slash menu, “+” and Add content: “+” means below its block (Alt for above), an empty list, quote or Notice line is lifted out first, and a block nests in a list item only when chosen from a line that has text.",
  "kind": "ux",
  "order": 4,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "New blocks land inside the caret's list item, Notice or table cell",
  "where": [
    "src/pages/block-controls.tsx:194-219",
    "src/pages/insertion.ts:16-48, 70-84",
    "tests/pages/insertion.test.ts:17-52"
  ],
  "why": "A writer who ends a list and adds a heading or Start button gets it indented under the last bullet on the published page."
}
```

## item-actions

```json
{
  "id": "item-actions",
  "behavior": "A row menu with Duplicate and “Move to trash… You can restore it later”, and a Trash tab.",
  "fix": "One actions menu per item (Open, Open in new tab, View on site, Rename, Duplicate, Move to…, Delete with undo) used in every list, the document bars and the palette. Moving and redirects need api_v2.",
  "kind": "enhancement",
  "order": 9,
  "size": "L",
  "status": "todo",
  "theme": "workspace",
  "title": "Pages can't be moved, and rename and delete differ from list to list",
  "where": [
    "src/workspace/service-pages-nav.tsx:51-53",
    "src/workspace/model.ts:115-173",
    "src/workspace/remote-page-dialogs.tsx:26-31, 221"
  ],
  "why": "Authors can't reorganise a service or clear out old drafts, and a delete can't be undone."
}
```

## keyboard-model

```json
{
  "id": "keyboard-model",
  "fix": "One shortcut registry in editor core: Esc selects, ⌘/ opens the menu, ⌘⇧↑ and ↓ move, ⌘D duplicates, Delete removes. It feeds menus, tooltips, aria-keyshortcuts and a Keyboard shortcuts dialog, and Tab leaves the canvas.",
  "kind": "a11y",
  "order": 13,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "The keyboard path is hidden, and differs between editors",
  "where": [
    "src/forms/editor/structure/selection.ts:29-173",
    "src/forms/editor/structure/navigation.ts:110-152",
    "src/pages/block-controls.tsx:221-271",
    "src/forms/editor/structure/keyboard.ts:73-276"
  ],
  "why": "A keyboard-only author can't discover how to select, move or delete a block, and in forms Tab can't leave the canvas."
}
```

## link-picker

```json
{
  "id": "link-picker",
  "behavior": "A “Search or type a URL” combobox, and a popover with Edit and Remove whenever the caret is in a link.",
  "fix": "One LinkPicker in src/ui: a combobox over pages plus typed addresses, checked by the link policy. One “link at caret” popover shows the address with Edit and Remove, and covers Action and Start buttons too. Used for text links on both canvases, button destinations and the form logic's Link URL.",
  "kind": "enhancement",
  "order": 6,
  "size": "L",
  "status": "todo",
  "theme": "blocks",
  "title": "Links are a bare address box, with no page search and nothing at the caret",
  "where": [
    "src/editor/modules/formatting/toolbar.tsx:36-50, 149-156, 259-261, 301-365",
    "src/pages/block-controls.tsx:773-803",
    "src/pages/modules/components.tsx:350",
    "src/pages/nodes.ts:63-64"
  ],
  "why": "Writers can't see where a link or button goes without selecting it, can't find a GOV.BB page by name, and keyboard users have no direct way to remove a link."
}
```

## link-policy

```json
{
  "id": "link-policy",
  "commit": "b5034167",
  "behavior": "normalizeLinkHref adds https:// to domains and mailto: to emails, and leaves real paths alone.",
  "fix": "One link policy in the links module: an email becomes mailto:, a phone number tel: and a domain https://, then it's checked against the page's allowed schemes. The link field on both canvases, button destinations and the form logic's Link URL all use it.",
  "kind": "bug",
  "order": 2,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Emails, phone numbers and bare web addresses become broken links",
  "where": [
    "src/editor/modules/links/url.ts:1-17",
    "src/editor/modules/formatting/toolbar.tsx:316-336",
    "src/pages/block-controls.tsx:744-748, 773-781",
    "src/forms/features/logic/native-controls.tsx:1411-1415"
  ],
  "why": "Most GOV.BB links are emails and phone numbers (212 of the 304 on live pages), and one typed the natural way, such as info@health.gov.bb, publishes as a relative link that goes nowhere."
}
```

## lists

```json
{
  "id": "lists",
  "behavior": "RepeaterField: a count, Add, an empty state and sortable items.",
  "fix": "A RepeaterList in src/ui with a grip, Move up and down, Duplicate, Remove and an empty state, used for options, categories, rules, conditions and calculations.",
  "kind": "ux",
  "order": 10,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Every editable list reorders its own way",
  "where": [
    "src/forms/features/checkbox-accordion/presentation.tsx:82-248",
    "src/forms/features/checkbox-accordion/native-presentation.tsx:100-226",
    "src/forms/features/logic/native-presentation.tsx:72-184"
  ],
  "why": "Moving a native category from first to last means moving every other one up, and each list behaves differently."
}
```

## logic-sentences

```json
{
  "id": "logic-sentences",
  "behavior": "Repeating lists have visible “Add Item” buttons.",
  "fix": "Start a new rule from its question, with a condition that suits the question's type. Summarise each rule as a sentence, make the Add buttons visible, put expressions and scopes under Advanced, and say that later rules win.",
  "kind": "ux",
  "order": 5,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Conditional logic starts blank and speaks in expressions",
  "where": [
    "src/forms/react/gutter.tsx:555-569",
    "src/forms/editor/native-authoring.ts:248-256",
    "src/forms/features/logic/native-controls.tsx:249-381",
    "src/forms/features/logic/native-presentation.tsx:72-131"
  ],
  "why": "“Show this only if they answered Yes” takes many clicks through programming terms."
}
```

## markdown-shortcuts

```json
{
  "id": "markdown-shortcuts",
  "behavior": "Input rules for headings, lists, quotes and dividers, and Markdown links.",
  "fix": "A markdown field on EditorAction (the same text the menus show as a hint) and one registration that converts a line typed with it, through turn-into, in both editors. [text](url) becomes a link when typed or pasted, through the link policy.",
  "kind": "enhancement",
  "order": 5,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "No Markdown shortcuts while typing on a page",
  "where": [
    "src/presets/govbb-page.ts:13-22",
    "src/editor/modules/formatting/editing.ts:58-79",
    "src/editor/modules/headings/module.ts:56",
    "src/editor/modules/lists/module.ts:64"
  ],
  "why": "GOV.BB pages are Markdown, with 1,077 list items and 514 second-level headings live, so writers type “## ” and “- ” out of habit and get stray characters."
}
```

## notice-rule

```json
{
  "id": "notice-rule",
  "behavior": "DialogError in dialogs, banners for an entry's state, toasts for results.",
  "fix": "Write the rule into src/ui and the gallery: app problems under the header, document problems in the document bar's notice slot, dialog outcomes as a box Banner in its body, field problems on the field, after-the-fact results as toasts. Then move every message onto it.",
  "kind": "duplicate",
  "order": 7,
  "size": "M",
  "status": "todo",
  "theme": "frame",
  "title": "There's no rule for where a message goes",
  "where": [
    "src/app.tsx:91-95",
    "src/workspace/workspace.tsx:324-328",
    "src/workspace/remote-page-pane.tsx:303-307",
    "src/host/page-editor.tsx:137-143",
    "src/host/source-ui.tsx:316-323",
    "src/host/form-json-dialog.tsx:218-233"
  ],
  "why": "Strip banners appear in four places and stack, and a failed import looks the same as a successful one, so authors miss the messages that matter."
}
```

## page-header

```json
{
  "id": "page-header",
  "behavior": "PageHeader and TableToolbar.",
  "fix": "Add PageHeader, show browser drafts in the same DataTable, and keep one filter pattern: the table's own toolbar, or delete its unused parts.",
  "kind": "duplicate",
  "order": 7,
  "size": "M",
  "status": "todo",
  "theme": "controls",
  "title": "The home screen lists services in two ways",
  "where": [
    "src/workspace/services-list.tsx:113-231",
    "src/workspace/workspace.tsx:440-467",
    "src/ui/table/table-components.tsx:24-182"
  ],
  "why": "Authors scan two list designs for the same kind of thing, and the team maintains filter UI that nothing shows."
}
```

## palette

```json
{
  "id": "palette",
  "behavior": "AdminCommandPalette on mod+K, grouped, with key hints.",
  "fix": "One CommandPalette on Base UI Dialog and Autocomplete, fed by one registry of services, the current service's pages, recent pages and every workspace command. ⌘K stays the link shortcut while text is selected. A later phase searches every page through api_v2.",
  "kind": "enhancement",
  "order": 2,
  "size": "L",
  "status": "todo",
  "theme": "workspace",
  "title": "There's no quick switcher or ⌘K command palette",
  "where": [
    "src/editor/modules/formatting/toolbar.tsx:149",
    "src/workspace/services-list.tsx:175",
    "src/workspace/workspace.tsx:170-176"
  ],
  "why": "To reach a page they know, authors go Services, filter, service, sidebar every time, and keyboard users have no shortcut."
}
```

## panel-details

```json
{
  "id": "panel-details",
  "behavior": "Created and updated, Ownership, Bylines and an SEO section.",
  "fix": "Read-only Last saved and Created, a Search section with a description length guide and keywords as Tags, and controls for the remaining frontmatter fields. Owner, SEO title and noindex need api_v2.",
  "kind": "enhancement",
  "order": 2,
  "size": "M",
  "status": "todo",
  "theme": "history",
  "title": "The settings panel leaves out dates, authorship and search fields",
  "where": [
    "src/pages/metadata-fields.tsx:265-353",
    "src/api/page-markdown.ts:5-21, 48-56, 278-294",
    "src/api/openapi.d.ts:846-853"
  ],
  "why": "An author can't tell when the page last changed or who changed it, or adjust how it appears in search without editing YAML."
}
```

## paste-link-lock

```json
{
  "id": "paste-link-lock",
  "commit": "47ea35ed",
  "behavior": "Every link passes one allowlist, and a refused link stays plain text.",
  "fix": "Enforce the link policy inside the document: a LinkNode transform removes any link the page can't keep, keeps its text and says so. LinkExtension gets a validateUrl, so pasting an address over selected text makes a link.",
  "kind": "bug",
  "note": "Making a link by pasting an address over selected text moves to the link picker: Lexical's validateUrl would also turn plain pasted words into links.",
  "order": 3,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "One pasted link can lock the page into Markdown",
  "where": [
    "src/editor/modules/links/module.ts:13",
    "src/pages/modules/text.tsx:87-96, 157-165",
    "src/host/page-editor.tsx:75-97",
    "src/pages/preview.tsx:25-30"
  ],
  "why": "A paragraph pasted from Word or a website can carry a link such as javascript: or file:, and on the next load the whole page opens as “Edit this page in Markdown” for everyone."
}
```

## path-field

```json
{
  "id": "path-field",
  "behavior": "The server adds a 301 redirect when a slug changes.",
  "fix": "One PathField for the panel and the create dialogs that checks as you type and, for a public page, warns that old links and sub-pages won't follow. Redirects need api_v2.",
  "kind": "enhancement",
  "order": 4,
  "size": "S",
  "status": "todo",
  "theme": "publishing",
  "title": "Changing a live page's path breaks links without warning",
  "where": [
    "src/pages/metadata-fields.tsx:325-341",
    "src/api/page-markdown.ts:62-72, 125-128",
    "src/workspace/remote-page-dialogs.tsx:68-88"
  ],
  "why": "Fixing a typo in a live page's path silently breaks every bookmark and link to it, and leaves its sub-pages under the old path."
}
```

## paused-notice

```json
{
  "id": "paused-notice",
  "behavior": "Every blocked state is a visible banner with its way out.",
  "fix": "One PausedNotice in the document bar's notice area for both editors, naming the cause and carrying the button that fixes it (“Review Markdown changes”). Rename the upload “Replace from file”, and give DraftStore one pause rule.",
  "kind": "ux",
  "order": 6,
  "size": "S",
  "status": "todo",
  "theme": "frame",
  "title": "Paused editing points at the wrong button, and forms pause silently",
  "where": [
    "src/host/page-editor.tsx:99, 138-143",
    "src/host/form-composer.tsx:46-53",
    "src/host/source-ui.tsx:196-202, 369-376"
  ],
  "why": "With Markdown edits pending, the page says “Open Markdown”, which is the file upload, and a form canvas just stops responding with no visible reason."
}
```

## pills

```json
{
  "id": "pills",
  "fix": "One Pill family in ui/pill.tsx (Select, Combobox, Popover, Input, InlineSelect and a quiet tone), folding in Select's pill variant and the unused PillSelect.",
  "kind": "duplicate",
  "order": 8,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Eight hand-made pill controls beside an unused shared one",
  "where": [
    "src/forms/react/logic-pickers.tsx:350-766",
    "src/forms/features/logic/native-controls.tsx:61-110, 413-431",
    "src/forms/features/calculations/formula-editor.tsx:217-228",
    "src/forms/features/logic/authoring.css",
    "src/ui/pill.tsx:58-103"
  ],
  "why": "Fixes to the shared pill never reach the logic editor that authors actually use."
}
```

## popup-names

```json
{
  "id": "popup-names",
  "fix": "Popover.Content and Menu.Content require a label, the page's Insert and Block options get aria-haspopup and aria-expanded, and fold buttons get aria-expanded.",
  "kind": "a11y",
  "order": 5,
  "size": "S",
  "status": "todo",
  "theme": "controls",
  "title": "Grips, popups and bars are missing names and states",
  "where": [
    "src/pages/block-controls.tsx:276-307, 378-385, 529-537",
    "src/forms/react/gutter.tsx:580-592",
    "src/forms/react/chrome.tsx:153-169",
    "src/workspace/workspace.tsx:286-290"
  ],
  "why": "A screen-reader user hears the form's block menu as “Move this block by dragging”, and isn't told which buttons open popups (WCAG 4.1.2)."
}
```

## popups

```json
{
  "id": "popups",
  "behavior": "Every popup is a Base UI Popover or Combobox.",
  "fix": "Rebuild EditFormula and BlocksPick on Popover and the formula's @ list on ActionList, then delete ContextMenu, fit, Spot, useOutside and useEscape.",
  "kind": "a11y",
  "order": 7,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "A second, hand-rolled popup system",
  "where": [
    "src/forms/react/logic-pickers.tsx:210-316, 1201-1287",
    "src/forms/features/calculations/formula-editor.tsx:246-316, 1461-1553",
    "src/forms/react/logic-hooks.ts:61-107"
  ],
  "why": "The formula and block pickers have no role or name and don't hold focus, and the team maintains its own positioning code."
}
```

## preload

```json
{
  "id": "preload",
  "behavior": "Preloads on intent, and lists keep their frame while loading.",
  "fix": "Route loaders that prime the service and page queries, intent preloading on hover and focus, and a sidebar frame drawn at once from cached titles.",
  "kind": "ux",
  "order": 7,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "Opening a service blanks the layout",
  "where": [
    "src/router.tsx:41",
    "src/routes/_workspace.services.$serviceId.$documentId.tsx:3",
    "src/workspace/workspace.tsx:305-335, 420-424"
  ],
  "why": "Every service open and first page visit feels slow, and the page jumps sideways as the sidebar pops in."
}
```

## preview-sheet

```json
{
  "id": "preview-sheet",
  "fix": "The insert dialog wraps every preview in one PreviewSheet, with a PreviewQuestion for the label, hint and optional mark.",
  "kind": "duplicate",
  "order": 13,
  "size": "S",
  "status": "todo",
  "theme": "forms",
  "title": "The insert preview frame is copied five times",
  "where": [
    "src/forms/react/authoring-preview.tsx:23-34",
    "src/forms/editor/field-module.tsx:42-55",
    "src/forms/editor/content-module.tsx:27-34",
    "src/presets/form-registry/preview.tsx:97-123"
  ],
  "why": "In one insert dialog page blocks preview bare while form blocks sit on a sheet, and every new module copies the frame."
}
```

## publish-control

```json
{
  "id": "publish-control",
  "behavior": "Publish, Publish changes and Unpublish are separate actions with confirmations and toasts.",
  "fix": "One PublishControl for pages, and later forms. It compares the saved and draft visibility, names the action (Publish page, Publish changes, Unpublish page, Save draft), asks before unpublishing, and ends every public change in a toast that links to the page. Each visibility option says who can see the page.",
  "kind": "ux",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "publishing",
  "title": "Saving can take a live page off GOV.BB without a word",
  "where": [
    "src/workspace/remote-page-pane.tsx:146-147, 180-183, 330",
    "src/pages/metadata-fields.tsx:167-180, 265-292",
    "apps/api_v2/src/modules/page-visibility.ts:2-4, 17-20"
  ],
  "why": "Switching a live page to “Draft link only” and pressing Save unpublishes it, and on an entry page its whole service, with no question and no toast."
}
```

## rail

```json
{
  "id": "rail",
  "behavior": "The grip is “Block actions - drag to reorder, click for menu”, with aria-haspopup.",
  "fix": "Both rails get the same two buttons, Insert and the grip, named “Block actions” with its popup state. Delete lives only in the menu.",
  "kind": "ux",
  "order": 9,
  "size": "S",
  "status": "todo",
  "theme": "blocks",
  "title": "The block rails differ, and the form's puts Delete beside Insert",
  "where": [
    "src/forms/react/gutter.tsx:579-669",
    "src/pages/block-controls.tsx:272-310",
    "src/editor/react/block-rail.tsx"
  ],
  "why": "One mis-click deletes a question, and on phones the form's rail loses Insert entirely."
}
```

## raw-controls

```json
{
  "id": "raw-controls",
  "fix": "Replace them with Input, Checkbox and Button, adding a plain Button variant and an InputGroup. Give Tip anchor and open props, and add one FoldToggle whose name includes its count.",
  "kind": "duplicate",
  "order": 15,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Raw inputs, checkboxes, buttons and tooltips in forms",
  "where": [
    "src/forms/features/checkbox-accordion/presentation.tsx:18-206",
    "src/forms/features/calculations/formula-editor.tsx:333-355, 1406-1433",
    "src/forms/features/pages/presentation.tsx:36-37, 214-271",
    "src/forms/react/chrome.tsx:142-170"
  ],
  "why": "An invalid option value turns red but its box doesn't, the date-field picker shows no focus, and fold buttons leave their count out of their name."
}
```

## raw-errors

```json
{
  "id": "raw-errors",
  "fix": "A message catalogue at the UI boundary: known failures get plain words and an action, and anything else gets one general line with Copy details for support.",
  "kind": "ux",
  "order": 4,
  "size": "M",
  "status": "todo",
  "theme": "messages",
  "title": "Code and storage errors reach authors word for word",
  "where": [
    "src/workspace/validation.ts:78-106",
    "src/persistence/draft-store.ts:21, 294, 706-717",
    "src/workspace/model.ts:188",
    "src/pages/preview.tsx:14-29"
  ],
  "why": "“Editor replacement needs recovery” or a browser storage error tells a content author nothing they can act on."
}
```

## regions

```json
{
  "id": "regions",
  "fix": "F6 and Shift+F6 cycle the named areas (header, sidebar, document bar, canvas, settings), each toolbar is one Tab stop, and focus moves to the title after a navigation.",
  "kind": "a11y",
  "order": 8,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "Moving between areas is Tab-only",
  "where": [
    "src/workspace/workspace.tsx:275-284, 346, 440-442",
    "src/host/page-editor.tsx:116-135"
  ],
  "why": "Every page switch costs keyboard and screen-reader authors dozens of keystrokes."
}
```

## root-demo-form

```json
{
  "id": "root-demo-form",
  "behavior": "/ is a dashboard with quick actions and recent activity.",
  "fix": "Send / to Services, or to a small home with “Continue where you left off”. Attach old-style form drafts only when the browser has them.",
  "kind": "bug",
  "order": 11,
  "size": "S",
  "status": "todo",
  "theme": "bugs",
  "title": "The editor's home opens a browser draft, and a new browser gets a demo form",
  "where": [
    "src/workspace/workspace.tsx:50-60, 90-99, 234-237",
    "src/workspace/documents.ts:157-217",
    "src/host/govbb-draft.ts:29-41"
  ],
  "why": "Opening the editor's address lands people in “Apply for a permit to play loud music”, a form they never made."
}
```

## save-state

```json
{
  "id": "save-state",
  "behavior": "One SaveButton is the status and the action, and announces each state.",
  "fix": "One SaveState in src/ui that is both the status and the action: “Saved in this browser”, “Unpublished changes”, “Saving…”, “Published”, or an error strip with the reason, Try again and Download a copy. It announces only failures, conflicts and explicit saves.",
  "kind": "ux",
  "order": 5,
  "size": "M",
  "status": "todo",
  "theme": "frame",
  "title": "“Saved” means two different things, and failures hide their reason",
  "where": [
    "src/host/source-ui.tsx:393-467",
    "src/persistence/draft-store.ts:289-298, 368-409",
    "src/workspace/remote-page-pane.tsx:189-195, 311-331",
    "src/workspace/form-editor.tsx:19-21"
  ],
  "why": "An author sees “Saved” on a form and assumes colleagues can see it, or sees “Not saved” with its reason in a hover tooltip and no next step."
}
```

## scroll-memory

```json
{
  "id": "scroll-memory",
  "fix": "Key scroll restoration by path, keep each document's view state, and cap mounted pages to the few most recent.",
  "kind": "ux",
  "order": 6,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "Going back to a page jumps to the top, and open pages pile up",
  "where": [
    "src/router.tsx:48",
    "src/workspace/workspace.tsx:146-154, 205-216, 487-515"
  ],
  "why": "Comparing two pages costs the scroll position on every switch, and the tab slows with every page visited."
}
```

## services-memory

```json
{
  "id": "services-memory",
  "behavior": "The empty state links to “Create your first one”.",
  "fix": "Keep the search, category, status, sort and page in the URL with a validated search schema, restore them on every way back, and put Create service in the empty state.",
  "kind": "ux",
  "order": 5,
  "size": "S",
  "status": "todo",
  "theme": "workspace",
  "title": "The services list forgets your search, filters and page",
  "where": [
    "src/workspace/services-list.tsx:114-171, 186-194, 221-224",
    "src/routes/_workspace.services.tsx:3"
  ],
  "why": "An author working through one category's services has to filter again after every service they open."
}
```

## session-ended

```json
{
  "id": "session-ended",
  "fix": "One “session ended” state, set by the timer, the focus check and any 401, shown as one dialog that keeps the work (“Your session has ended. Your changes are kept.”), with Sign in again returning to the same page.",
  "kind": "ux",
  "order": 10,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "When a session ends, the editor jumps away or leaves you stuck",
  "where": [
    "src/app.tsx:48-55",
    "src/routes/auth.tsx:23-26",
    "src/workspace/remote-page-pane.tsx:256-276",
    "src/workspace/remote-page-dialogs.tsx:42"
  ],
  "why": "Authors lose their place mid-edit, or keep pressing a Try again that can never work."
}
```

## settings-fields

```json
{
  "id": "settings-fields",
  "fix": "Field and FieldGroup become the only way to label a control, and a ComputedField replaces SsbField for values that stay automatic until edited. Best done with the settings panel.",
  "kind": "duplicate",
  "order": 9,
  "size": "M",
  "status": "todo",
  "theme": "forms",
  "title": "Settings fields are labelled six different ways",
  "where": [
    "src/forms/react/settings-controls.tsx:91-373",
    "src/forms/features/logic/native-controls.tsx:781-845",
    "src/forms/features/*/controls.tsx"
  ],
  "why": "Labels are 12px and muted in one place, menu rows in another and semibold elsewhere, and each copy solves hints and errors again."
}
```

## settings-panel

```json
{
  "id": "settings-panel",
  "behavior": "The selected block's panel replaces the document's sections in one Settings sidebar.",
  "fix": "Give the form editor the SidePanel, driven by the selection: Form settings when nothing is selected, Page settings for a page, and Question settings in sections (Answer, Validation, Logic, Advanced). The block menu keeps only actions.",
  "kind": "ux",
  "order": 1,
  "size": "L",
  "status": "todo",
  "theme": "forms",
  "title": "Question, page and form settings live in a menu, or nowhere",
  "where": [
    "src/forms/react/block-menu.tsx:45-128",
    "src/forms/react/settings-controls.tsx",
    "src/forms/features/*/controls.tsx",
    "src/forms/features/pages/buttons.tsx:244-313",
    "src/forms/core/form-settings.ts:47-55",
    "src/forms/editor/form-metadata.ts:17-38"
  ],
  "why": "Authors type regexes and error messages into a narrow menu that closes on a stray click, can't set a form's closing date or emails without Markdown, and screen readers hear a menu full of text fields."
}
```

## sidebar-collapse

```json
{
  "id": "sidebar-collapse",
  "behavior": "The sidebar collapses to icons and becomes a sheet on phones.",
  "fix": "The shared Sidebar remembers when it's collapsed and gives its width to the page. Below lg it becomes a drawer opened from a “Pages” button, reusing SidePanel's drawer.",
  "kind": "ux",
  "order": 4,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "The sidebar can't really collapse, and on phones the page list comes first",
  "where": [
    "src/workspace/sidebar.ts:4-8",
    "src/workspace/workspace.tsx:329-348",
    "src/workspace/service-pages-nav.tsx:28-31"
  ],
  "why": "On laptops authors lose width to an empty column, and on phones they scroll past the whole page list to reach the page."
}
```

## sidebar-state

```json
{
  "id": "sidebar-state",
  "behavior": "Rows carry status and pending badges.",
  "fix": "One sidebar row model (title, depth, status, unsaved, kind) from the API and the draft registry, with indentation and labelled dots, joining the browser form to its service by form_id.",
  "kind": "enhancement",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "workspace",
  "title": "The sidebar hides each page's status, nesting and the service's form",
  "where": [
    "src/workspace/service-pages.ts:7-26",
    "src/workspace/service-pages-nav.tsx:34-45",
    "src/workspace/remote-page-dialogs.tsx:204, 228-232"
  ],
  "why": "Authors can't see which pages of a live service are still drafts or where a page sits, and can't reach the service's form from it."
}
```

## sidebar

```json
{
  "id": "sidebar",
  "behavior": "The sidebar has Header, Group, GroupLabel, MenuButton, Separator and Trigger.",
  "fix": "Add Sidebar to src/ui (Header, Group with a label, Item with its current state, Separator, Empty, Actions) and render one ServiceNav from either source, with live titles.",
  "kind": "duplicate",
  "order": 2,
  "size": "M",
  "status": "todo",
  "theme": "frame",
  "title": "The service sidebar is built twice, and the copies already differ",
  "where": [
    "src/workspace/workspace.tsx:345-407",
    "src/workspace/service-pages-nav.tsx:27-58",
    "src/workspace/sidebar.ts:4-17"
  ],
  "why": "A retitled page shows its new title in browser-draft services and its old one in API services, and every sidebar fix has to be made twice."
}
```

## slash-hint

```json
{
  "id": "slash-hint",
  "behavior": "“Start writing, or type '/' for commands” on the caret's empty line, “List” in a list.",
  "fix": "One placeholder on the caret's empty line in block-dom.ts, worded for the block type, used by both editors.",
  "kind": "enhancement",
  "order": 12,
  "size": "S",
  "status": "todo",
  "theme": "blocks",
  "title": "The “/” hint disappears after the first line",
  "where": [
    "src/pages/block-controls.tsx:176-184, 261-271",
    "src/pages/modules/text.tsx:298-299",
    "src/editor/react/block-dom.ts:15-19"
  ],
  "why": "Once a page has any content, nothing tells the writer that “/” adds blocks."
}
```

## slash-ranking

```json
{
  "id": "slash-ranking",
  "behavior": "scoreSlashCommand ranks alias, title, prefix, initials, then substring, and the highlighted command's description shows in a footer.",
  "fix": "One rankActions(query, actions) in actions.ts scoring title, aliases, Markdown hint and description, with aliases on EditorAction. While searching, results are one ranked list; each row shows its Markdown hint, and the highlighted block's description sits in a footer. The field pickers use the same matcher.",
  "kind": "enhancement",
  "order": 1,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "The insert menus can't find blocks by the words writers use",
  "where": [
    "src/editor/core/actions.ts:23, 119-126",
    "src/pages/modules/text.tsx:265-297",
    "src/pages/modules/components.tsx:319-370",
    "src/pages/action-menu.tsx:56",
    "src/editor/react/slash-menu.tsx:71-90, 159"
  ],
  "why": "Writers type “h2”, “divider” or “callout” and get nothing, or press Enter on the wrong first result, because matching is a plain substring check in list order and no page block has aliases."
}
```

## slash-trigger

```json
{
  "id": "slash-trigger",
  "commit": "74b8fc26",
  "behavior": "Opens only at the start of a line and remembers a dismissed slash.",
  "fix": "One slash rule for both editors: open at the start of a line, close on a space when nothing matches, remember Escape for that slash, move the highlight on hover only after the pointer moves, and announce the highlighted option.",
  "kind": "bug",
  "note": "Kept the page's “ /notice” at the end of a list item: after a space mid-line, the menu opens only for one word that finds something.",
  "order": 6,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "The slash menu opens mid-sentence, then traps the arrow keys",
  "where": [
    "src/pages/slash-menu.tsx:43",
    "src/editor/react/slash-menu.tsx:53-57",
    "src/pages/action-menu.tsx:34, 52",
    "src/pages/editor.tsx:85-90"
  ],
  "why": "Typing “24 / 7” or “yes / no” opens an empty menu that swallows the arrow keys, and Escape doesn't keep it closed."
}
```

## smooth-scroll

```json
{
  "id": "smooth-scroll",
  "commit": "531b24bb",
  "fix": "Use the reduced-motion check every other animation already uses.",
  "kind": "a11y",
  "order": 14,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "One scroll ignores reduced motion",
  "where": [
    "src/forms/editor/structure/selection.ts:44"
  ],
  "why": "Selecting a block scrolls smoothly even when the author has asked for less motion."
}
```

## source-dialogs

```json
{
  "id": "source-dialogs",
  "behavior": "One save helper for every generated file.",
  "fix": "Add FileButton, saveFile, a code Textarea, a Diagnostics list that jumps to its line, a RecoveryBanner and a status slot in Dialog.Footer, and build both dialogs from them.",
  "kind": "duplicate",
  "order": 6,
  "size": "M",
  "status": "todo",
  "theme": "controls",
  "title": "The Markdown and JSON dialogs are near-twins built separately",
  "where": [
    "src/host/source-ui.tsx:67-79, 99-105, 196-328",
    "src/host/form-json-dialog.tsx:24-31, 47-57, 91-233",
    "src/workspace/local-document-dialogs.tsx:103-114, 200-251",
    "src/workspace/workspace.tsx:73-83"
  ],
  "why": "Recovering an interrupted import works differently from recovering source edits, and each file fix lands in three places."
}
```

## sticky-bar

```json
{
  "id": "sticky-bar",
  "behavior": "Pins the bar above the canvas on wide screens.",
  "fix": "Make the document bar sticky from md up, and move the side panel's sticky top down by the bar's height.",
  "kind": "ux",
  "order": 4,
  "size": "S",
  "status": "todo",
  "theme": "frame",
  "title": "The bar with Save scrolls away",
  "where": [
    "src/host/page-editor.tsx:28-32",
    "src/workspace/form-editor.tsx:13-14",
    "src/ui/side-panel.tsx:89"
  ],
  "why": "Halfway down a long page the author can't see whether the work is saved, or reach Save without scrolling back up, while the settings panel stays in view."
}
```

## tag

```json
{
  "id": "tag",
  "behavior": "A tag input chip, with a “Remove {value}” button.",
  "fix": "Add Tag beside Badge (tone, onRemove and removeLabel, with a 24px remove button that grows to 44px on touch) and use it for categories, the gallery and table filters.",
  "kind": "duplicate",
  "order": 2,
  "size": "S",
  "status": "todo",
  "theme": "controls",
  "title": "The removable chip is hand-made twice",
  "where": [
    "src/pages/metadata-fields.tsx:392-415",
    "src/routes/prototypes.components.tsx:471-474",
    "src/ui/table/table-components.tsx:105-147"
  ],
  "why": "A fix to the chip's touch target or wrapping reaches only one copy."
}
```

## title-flow

```json
{
  "id": "title-flow",
  "behavior": "Enter or ArrowDown at the end of the title moves into the body.",
  "fix": "Make the title, introduction and body one writing flow: Enter or ArrowDown at the end of a field moves to the next one, and ArrowUp on the body's first line moves back.",
  "kind": "enhancement",
  "order": 11,
  "size": "S",
  "status": "todo",
  "theme": "blocks",
  "title": "Enter in the page title goes nowhere",
  "where": [
    "src/pages/metadata-fields.tsx:119-158",
    "src/pages/editor.tsx:75-96"
  ],
  "why": "After typing a title, the natural Enter does nothing, so the writer reaches for the mouse to start the page."
}
```

## titles-headings

```json
{
  "id": "titles-headings",
  "behavior": "The bar carries the entry's title as an h1.",
  "fix": "A screen title from the route (“Page – Service – GovBB editor”), the document title as the bar's h1, and SidePanel.Section taking its heading level from context.",
  "kind": "a11y",
  "order": 8,
  "size": "S",
  "status": "todo",
  "theme": "frame",
  "title": "Every tab has the same title, and the editors have no h1",
  "where": [
    "src/routes/__root.tsx:18-23",
    "src/host/page-editor.tsx:109-115",
    "src/pages/metadata-fields.tsx:125-145",
    "src/ui/side-panel.tsx:107, 129"
  ],
  "why": "With several tabs open no one can tell them apart, and a screen-reader user opening a document finds no heading saying where they are (WCAG 2.4.2, 1.3.1)."
}
```

## touch-target

```json
{
  "id": "touch-target",
  "behavior": "Toolbar buttons grow from 32 to 44px under a coarse pointer.",
  "fix": "One touchTarget token in surface.ts (44px under a coarse pointer, or an invisible hit area) for Button, Select and pill triggers, the toast's close, the pager, sidebar rows and rail buttons.",
  "kind": "a11y",
  "order": 4,
  "size": "S",
  "status": "todo",
  "theme": "controls",
  "title": "Touch sizing stops at fields and menu rows",
  "where": [
    "src/ui/button.tsx:4-17",
    "src/ui/select.tsx:31-33",
    "src/ui/toast.tsx:77",
    "src/workspace/sidebar.ts:14-15",
    "src/editor/react/block-rail.tsx:216, 233",
    "src/pages/metadata-fields.tsx:407"
  ],
  "why": "On a tablet, or with a tremor, authors hit the wrong one of two 24px rail buttons, or a 28px close button."
}
```

## turn-into

```json
{
  "id": "turn-into",
  "behavior": "One block-type list shared by the block menu, the selection toolbar and the slash menu.",
  "fix": "One turn-into capability for the text blocks, shown as a shared Turn into submenu in both block menus and the selection toolbar, with shortcuts. Text choices in the slash menu convert a line that has text instead of adding a block below it.",
  "kind": "enhancement",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "blocks",
  "title": "You can't change a block's type",
  "where": [
    "src/pages/insertion.ts:70-84",
    "src/pages/block-controls.tsx:608-655",
    "src/editor/modules/formatting/toolbar.tsx:221-262",
    "src/forms/react/block-menu.tsx:125, 166-187"
  ],
  "why": "A writer who decides a line should be a heading, quote or list item has to type it again in a new block."
}
```

## ui-gaps

```json
{
  "id": "ui-gaps",
  "behavior": "Select takes a label and wraps itself in Field.",
  "fix": "Let Select take a Field's label, add Kbd, delete the unused PillSelect, point panel at surface, and use one caret size.",
  "kind": "duplicate",
  "order": 3,
  "size": "S",
  "status": "todo",
  "theme": "controls",
  "title": "Gaps inside src/ui invite more copies",
  "where": [
    "src/ui/select.tsx:16-41, 101",
    "src/ui/pill.tsx:13, 58-103",
    "src/ui/native-select.tsx:52",
    "src/ui/calendar.tsx:134"
  ],
  "why": "Each gap is a place where the next screen hand-makes its own label, shortcut or caret."
}
```

## undo-paste

```json
{
  "id": "undo-paste",
  "commit": "464b0de9",
  "behavior": "Closes the undo step before structural changes.",
  "fix": "Treat paste, cut and toolbar format and link changes as undo boundaries, split a typing run when the caret moves, and send the title and introduction through the same rule.",
  "kind": "bug",
  "note": "Typing after the caret moves now starts a step too, and Cmd+Z in the title runs the editor's undo.",
  "order": 5,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Undo takes back too much after a paste",
  "where": [
    "src/editor/core/history.ts:33, 91-98",
    "src/pages/metadata-fields.tsx:56-65, 136-156",
    "src/editor/react/active-editor.ts:54"
  ],
  "why": "A writer who undoes a bad paste also loses the sentence they had just typed, and Cmd+Z means something different in the title, the introduction and the body."
}
```

## unsaved-everywhere

```json
{
  "id": "unsaved-everywhere",
  "behavior": "Lists show “Pending changes” beside the status.",
  "fix": "One draft-registry hook that compares the stored server copies with the browser drafts. It marks rows in the sidebar and the services list, adds an “Unsaved changes in this browser” group, puts a dot in the tab title, and lists them in a sign-out confirmation.",
  "kind": "ux",
  "order": 3,
  "size": "M",
  "status": "todo",
  "theme": "publishing",
  "title": "Unsaved work can't be seen once you leave the page",
  "where": [
    "src/workspace/remote-page-pane.tsx:153-178, 186",
    "src/workspace/service-pages-nav.tsx:34-45",
    "src/workspace/services-list.tsx:36-71, 102-110",
    "src/workspace/page-sync.ts:15"
  ],
  "why": "An author can edit five pages, publish one and sign out believing all five are live, while four sit in one browser."
}
```

## view-on-site

```json
{
  "id": "view-on-site",
  "behavior": "“Live View”, and “Preview draft” through a signed URL.",
  "fix": "Add “View on site” to the document bar for public pages, from api.landingUrl. Preview links for preview pages need an api_v2 endpoint.",
  "kind": "enhancement",
  "order": 5,
  "size": "S",
  "status": "todo",
  "theme": "publishing",
  "title": "No way to open the page on GOV.BB",
  "where": [
    "src/api/client.ts:111",
    "src/workspace/services-list.tsx:82",
    "src/pages/metadata-fields.tsx:175-180"
  ],
  "why": "An author can't check the page as the public sees it, or give a reviewer the link the visibility setting promises."
}
```

## visibility-badge

```json
{
  "id": "visibility-badge",
  "behavior": "ContentStatusBadge maps each status once.",
  "fix": "Add VisibilityBadge (badge, dot or label) from one map of label, tone and colour, and use its dot as the select's icon.",
  "kind": "duplicate",
  "order": 2,
  "size": "S",
  "status": "todo",
  "theme": "publishing",
  "title": "Page visibility is drawn three ways",
  "where": [
    "src/workspace/services-list.tsx:25-34",
    "src/pages/metadata-fields.tsx:167-180, 270-278",
    "src/routes/prototypes.components.tsx:536-539, 727, 1162-1166"
  ],
  "why": "Changing how “Preview link only” looks means finding three maps, and the list and the panel can drift apart."
}
```

## windows-shortcuts

```json
{
  "id": "windows-shortcuts",
  "commit": "8ca7db51",
  "fix": "One shortcut() formatter and Kbd chip, driven by the table the editor binds keys from, used by every menu, tooltip and hint, with one isMac.",
  "kind": "bug",
  "note": "The Kbd chip and a shortcuts dialog stay with the keyboard-model and ui-gaps items.",
  "order": 8,
  "size": "S",
  "status": "done",
  "theme": "bugs",
  "title": "Shortcuts show Mac keys on Windows",
  "where": [
    "src/forms/react/block-menu.tsx:91-125",
    "src/forms/react/chrome.tsx:142-152",
    "src/forms/editor/structure/keyboard.ts:56-83, 208-232",
    "src/forms/react/gutter.tsx:112-114",
    "src/editor/react/block-rail.tsx:25-27"
  ],
  "why": "Windows users, probably most government staff, see ⌘ and ⌥, and the fold tip names a key that doesn't fold."
}
```
