# Editor-v2 continuation ledger

The 88-item scope is reconciled from the final handoff and the saved specifications, **not** the stale status values in `BOARD.md`. Initial state: **31 integrated, 4 awaiting integration, 51 to implement, 2 parked**. Mark done only after review, integration and verification; record the SHA and checks. This local ledger is the restart-safe record; the hosted board is a presentation copy.

Current isolated integration: **35 checkpoint-complete, 5 integrated awaiting the Wave-1 checkpoint, 46 remaining unparked, 2 parked** at `0de24a8b`. Original user branch remains at `18d5eefe`; transfer is deferred until preservation-safe handoff. Verification details: [EXECUTION.md](EXECUTION.md).

## Integrated baseline (31)

The final handoff and `editor-v2-redesign` history identify these as already landed at `18d5eefe`:

- `auth-every-click` — Every click between screens waits for a sign-in check
- `bar` — 56px bars are styled by hand six times
- `block-exit` — No keyboard way out of a Notice, Details, quote or button
- `buttons-links` — Buttons, links and toggles are styled by hand
- `delete-with-subpages` — Delete page is offered when the delete can only fail
- `document-bar` — Pages and forms have different document bars
- `error-message-defaults` — New questions store “Enter an answer” as their error message
- `field-focus-jump` — Typing in the title after a click in the page jumps into the page
- `form-page-object` — Form pages act like dividers, and folding changes what their actions do
- `format-keys` — Cmd+B needs a selection, and pasted formatting looks kept but isn't
- `heading-levels` — Six heading levels crowd the menus and push Start button out of view
- `hidden-focus` — Two controls hide keyboard focus
- `history-scroll` — Page history can't scroll
- `insert-placement` — New blocks land inside the caret's list item, Notice or table cell
- `link-policy` — Emails, phone numbers and bare web addresses become broken links
- `paste-link-lock` — One pasted link can lock the page into Markdown
- `popup-names` — Grips, popups and bars are missing names and states
- `root-demo-form` — The editor's home opens a browser draft, and a new browser gets a demo form
- `sidebar-state` — The sidebar hides each page's status, nesting and the service's form
- `sidebar` — The service sidebar is built twice, and the copies already differ
- `slash-hint` — The “/” hint disappears after the first line
- `slash-ranking` — The insert menus can't find blocks by the words writers use
- `slash-trigger` — The slash menu opens mid-sentence, then traps the arrow keys
- `smooth-scroll` — One scroll ignores reduced motion
- `sticky-bar` — The bar with Save scrolls away
- `tag` — The removable chip is hand-made twice
- `title-flow` — Enter in the page title goes nowhere
- `touch-target` — Touch sizing stops at fields and menu rows
- `ui-gaps` — Gaps inside src/ui invite more copies
- `undo-paste` — Undo takes back too much after a paste
- `windows-shortcuts` — Shortcuts show Mac keys on Windows

## Reviewed pending commits

| Item | State | Commit / verification |
| --- | --- | --- |
| [`confirm-dialog`](BOARD.md#confirm-dialog) | Verified in integration | `93da24fa`; pending/link contract regression; full gates + browser checkpoint |
| [`titles-headings`](BOARD.md#titles-headings) | Verified in integration | `39c2178b`; stale-server/remote-retitle and browser title regressions; full gates |
| [`sidebar-collapse`](BOARD.md#sidebar-collapse) | Verified in integration | `fe05f2a4`; denied-storage, separate breakpoints, drawer/task-dialog focus; full gates + browser checkpoint |
| [`canvas-text`](BOARD.md#canvas-text) | Verified in integration | `ab798fba`; marker-free custom choices/nested inputs; full gates + browser checkpoint |

## Wave 1 / kit

| Item | State | Commit / verification |
| --- | --- | --- |
| [`empty-loading`](BOARD.md#empty-loading) | Integrated; wave checkpoint pending | `eeb78f36`; 1,164 unit tests, app/monorepo builds/static checks; four relevant browser suites pass; pre-existing formula overflow tracked separately |

## Wave 1 / frame

| Item | State | Commit / verification |
| --- | --- | --- |
| [`save-state`](BOARD.md#save-state) | Integrated; wave checkpoint pending | `144b74b4`; 170 files/1,251 tests, static/app/23-project build gates; storage failure/retry, denied copy, exact downloads, source ownership/focus and affected browser suites; gallery1440/390/320 verified |
| [`paused-notice`](BOARD.md#paused-notice) | Staged; full gates running | Parent passed26 focused tests and real form/API-page review/apply/discard/focus regressions, plus SaveState/confirmation browsers; gallery prepared |
| [`notice-rule`](BOARD.md#notice-rule) | To do | — |

## Wave 1 / nav

| Item | State | Commit / verification |
| --- | --- | --- |
| [`services-memory`](BOARD.md#services-memory) | Agent blocked on tool approval | `editor-nav` in `wave1-nav` on0de24a8b; no source changes yet. Requested permission to dismiss legacy cross-thread MCP messaging and use Herdr; approval left untouched |
| [`scroll-memory`](BOARD.md#scroll-memory) | To do | — |
| [`preload`](BOARD.md#preload) | To do | — |

## Wave 1 / write

| Item | State | Commit / verification |
| --- | --- | --- |
| [`turn-into`](BOARD.md#turn-into) | Integrated; wave checkpoint pending | `7c520eaa`; 167 files/1,221 tests, static/app/23-project build gates; real-browser keyboard menus, focus, conversion, undo/redo and affected insertion suites pass; nested-list scope verified red/green |
| [`markdown-shortcuts`](BOARD.md#markdown-shortcuts) | Prepared; browser journey being written | Parent found standalone-content and nested-URL issues; owner reports16 new regressions red/green, 4files/75tests; source frozen on0de24a8b, browser/full acceptance pending |
| [`link-picker`](BOARD.md#link-picker) | To do | — |

## Wave 1 / forms

| Item | State | Commit / verification |
| --- | --- | --- |
| [`preview-sheet`](BOARD.md#preview-sheet) | Integrated; wave checkpoint pending | `56edb47c`; 1,171 tests, static/app/monorepo gates; real insert-dialog/preview focus, external-extension and content-module browser checks |
| [`drawing-kit`](BOARD.md#drawing-kit) | Integrated; wave checkpoint pending | `0de24a8b`; fresh same-base118/118 exact screenshots and DOM/semantics/style; 173files/1264tests + all gates; affected browsers and gallery1440/390/320 pass |

## Wave 2 / publish

| Item | State | Commit / verification |
| --- | --- | --- |
| [`publish-control`](BOARD.md#publish-control) | To do | — |
| [`visibility-badge`](BOARD.md#visibility-badge) | To do | — |
| [`unsaved-everywhere`](BOARD.md#unsaved-everywhere) | To do | — |
| [`path-field`](BOARD.md#path-field) | To do | — |
| [`view-on-site`](BOARD.md#view-on-site) | To do | — |
| [`conflicts`](BOARD.md#conflicts) | To do | — |

## Wave 2 / messages

| Item | State | Commit / verification |
| --- | --- | --- |
| [`error-summary`](BOARD.md#error-summary) | To do | — |
| [`failure-copy`](BOARD.md#failure-copy) | To do | — |
| [`raw-errors`](BOARD.md#raw-errors) | To do | — |
| [`session-ended`](BOARD.md#session-ended) | To do | — |

## Wave 2 / settings

| Item | State | Commit / verification |
| --- | --- | --- |
| [`settings-panel`](BOARD.md#settings-panel) | To do | — |
| [`settings-fields`](BOARD.md#settings-fields) | To do | — |
| [`first-form`](BOARD.md#first-form) | To do | — |
| [`logic-sentences`](BOARD.md#logic-sentences) | To do | — |
| [`delete-question`](BOARD.md#delete-question) | To do | — |
| [`form-check`](BOARD.md#form-check) | To do | — |

## Wave 2 / blocks

| Item | State | Commit / verification |
| --- | --- | --- |
| [`action-list`](BOARD.md#action-list) | To do | — |
| [`block-menu`](BOARD.md#block-menu) | To do | — |
| [`rail`](BOARD.md#rail) | To do | — |
| [`keyboard-model`](BOARD.md#keyboard-model) | To do | — |
| [`format-toolbar`](BOARD.md#format-toolbar) | To do | — |
| [`announce`](BOARD.md#announce) | To do | — |

## Wave 2 / history

| Item | State | Commit / verification |
| --- | --- | --- |
| [`history-panel`](BOARD.md#history-panel) | To do | — |
| [`panel-details`](BOARD.md#panel-details) | To do | — |
| [`distraction-free`](BOARD.md#distraction-free) | To do | — |
| [`source-dialogs`](BOARD.md#source-dialogs) | To do | — |
| [`page-header`](BOARD.md#page-header) | To do | — |

## Wave 2 / fcontrols

| Item | State | Commit / verification |
| --- | --- | --- |
| [`pills`](BOARD.md#pills) | To do | — |
| [`popups`](BOARD.md#popups) | To do | — |
| [`checklist`](BOARD.md#checklist) | To do | — |
| [`lists`](BOARD.md#lists) | To do | — |
| [`author-notes`](BOARD.md#author-notes) | To do | — |
| [`raw-controls`](BOARD.md#raw-controls) | To do | — |
| [`form-preview`](BOARD.md#form-preview) | To do | — |

## Wave 2 / find

| Item | State | Commit / verification |
| --- | --- | --- |
| [`breadcrumbs`](BOARD.md#breadcrumbs) | To do | — |
| [`regions`](BOARD.md#regions) | To do | — |
| [`palette`](BOARD.md#palette) | To do | — |
| [`item-actions`](BOARD.md#item-actions) | To do | — |

## Final terminology pass

| Item | State | Commit / verification |
| --- | --- | --- |
| [`glossary`](BOARD.md#glossary) | To do | — |

## Parked / API

| Item | State | Commit / verification |
| --- | --- | --- |
| [`api-asks`](BOARD.md#api-asks) | Parked | — |
| [`forms-to-api`](BOARD.md#forms-to-api) | Parked | — |

## Completion rules

- One reviewed commit per board item; do not count preparatory commits twice.
- Reuse existing UI/state/helpers and migrate every listed consumer, with a component test and gallery demo for new shared UI.
- Every changed behaviour has a failing-before/passing-after regression test.
- Record local unit/static/build checks and relevant browser coverage, with any environmental blockers named explicitly.
- API-dependent slices remain honestly partial; never mark them implemented because the unsupported action was hidden.
- Original handoff/package instructions describe historical agent paths and attribution. New agents use the approved plan's permanent paths and their actual attribution, not the old Claude session identity.
