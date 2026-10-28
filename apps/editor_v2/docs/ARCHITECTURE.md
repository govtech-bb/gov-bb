# Editor system

The reusable editor kernel supports content editing without importing the form system. Page modules add Markdown writing; form modules add questions, form pages, logic and the form source format. The workspace selects the document, uses the page preset and provides explicit API persistence.

Form-wide configuration and page metadata panels belong to the host. The editors preserve that data through converters; they provide no form-wide settings or checks dashboard.

This guide describes the installed module system. [Architecture decision records](decisions/README.md) explain the choices, alternatives and consequences behind it. The [converter guide](CONVERTERS.md) defines the native JSON and Markdown boundaries; [Form registry](FORM-REGISTRY.md) describes reusable form definitions.

## Public entry points

| Import | Responsibility |
| --- | --- |
| `src/editor` | Module definitions, live/headless editors, actions, renderers, slots and content modules |
| `src/forms` | Typed fields/content adapters, form composition, Form registry builders, form canvas and converters |
| `src/forms/modules` | Supported built-in form modules and content adapters for application-owned presets |
| `src/pages` | Page module composition, Markdown conversion, title editing, writing canvas and preview |
| `src/persistence` | In-memory source/canvas state, codec/connection contracts and failure preservation |
| `src/host` | Optional React draft provider, source controls and Lexical connection |
| `src/presets/content` | Ready-made content editor definition |
| `src/presets/govbb-form` | GovBB module list, form definition, runtime and Markdown codec |
| `src/presets/govbb-page` | GovBB page definition and Markdown codec |

These are repository entry points, not separately published packages. Internal modules import their owners directly, never their own public barrel or a default preset. The preset is the place to aggregate built-in capabilities and registry entries.

## Ownership

```text
src/editor/core              definitions, document validation, history, actions, state
src/editor/react             composition, focused-editor routing, menus, renderer/slot hosts
src/editor/modules           text, formatting, headings, lists, links, callouts, disclosure
src/forms/core               pure form settings, identities, references and readers
src/forms/schema             native v2 JSON types, validation, semantics and references
src/forms/source             Markdown dialect, source model and frozen migration data
src/forms/adapters/ssb        existing SSB projection contracts and validation
src/forms/editor             form structure, node families, configured queries and runtime
src/forms/react              form canvas and shared controls
src/forms/features           each field, pages, repetition, logic and mentions
src/forms/registry            developer-defined template contracts and builders
src/pages                    page composition, metadata, Markdown handlers, writing and preview
src/converters               Markdown, native form import/export, explicit legacy SSB export
src/presets                  selected modules and built-in Form registry data
src/persistence              storage-independent draft state machine
src/host                     source controls, downloads and application binding
src/workspace                API service/page navigation, explicit saves and leave protection
src/api                      api_v2 transport, query options and page/Markdown adaptation
src/ui/table                 shared list table: features and components once; each list adds columns and data
src/routes                   TanStack routes and server-safe document shell
```

`src/api/client.ts` also hosts a temporary, in-memory category preview until #3178: it starts from the saved categories (`GET /editor/categories`) and reads service counts, uses `ApiFailure` for local validation/refusals, and never persists category edits or changes the saved categories used by page/service pickers. See [Development](DEVELOPMENT.md#app-shell-and-routes).

The TypeScript boundary checker enforces these dependency boundaries. Generic editor code cannot import forms, presets, the app or persistence. Pure layers cannot reach browser globals or React UI. Form behavior is owned by installed form contributions; it is not selected from a second global catalog.

The app uses TanStack Start in SPA mode. Its root document can render at build time; the client-only workspace owns in-memory document sessions. Route changes reuse clean cached editors. Framework imports stay outside reusable editor/state layers.

## Module lifecycle

`defineEditor(modules, namespace)` combines module declarations into an immutable editor definition. An `EditorModule` can contribute nodes and raw validators, document/browser registrations, an initializer, initial normalizers, actions, renderers, slots and theme data. Composition rejects:

- Duplicate module, registration or action keys.
- Incompatible node claims.
- Missing required capabilities.
- Multiple history owners.

Several features may reuse the same node declaration object. Separate declaration objects for the same type conflict even when they name the same class.

`createHeadlessEditor(definition, state?, options?)` validates saved nodes before hydration, installs document registrations and prepares the initial document. Browser registrations are excluded. Call `dispose()` when finished. `{ prepare: false }` is reserved for callers that explicitly own preparation, such as conversion read contexts.

`EditorComposer` prepares the same definition for React and installs its browser behavior. `definition` is fixed per mount; remount to change installed modules. `initialState` is initial input, not a controlled-state prop. `readOnly` can change while mounted. `Editor` supplies a content-editable surface, slash menu and overlay slot; `FormEditor` supplies the form canvas inside a composer. Neither requires browser storage.

The `readOnly` prop controls host-owned editability independently of temporary pauses for unapplied/invalid source or serialization failures. Apply, Discard and serialization retry cannot clear the host's read-only gate.

A registration returns its cleanup function. Each editor owns its history and listeners; loading a document establishes its undo baseline. The shared browser router tracks the focused editor, including its portals, while native inputs keep their own undo. Unmounting one editor must not remove another editor's routing or listeners.

## Contributions and actions

Actions supply stable IDs, labels, grouping, optional numeric order, availability and execution callbacks. Slash and insertion-dialog surfaces read the installed actions. An action's preview draws the block alone: the insertion dialog puts every preview on one `PreviewSheet`, and `PreviewQuestion` sets a question's label, hint and “(optional)” (`src/ui/preview-sheet.tsx`). `executeAction(editor, definition, id, request)` opens an update; `$executeAction(...)` is for an existing update. Both enforce editor ownership and recheck availability before trigger removal or mutation. A `$prepare` callback can validate an insertion before returning its commit callback.

`RendererHost` resolves a named renderer in the current editor; `EditorSlot` renders that editor's ordered slot contributions. Missing renderer contributions fail explicitly. Names include their role, such as `field-preview:text` and `widget:file-upload`, so unrelated content and answer kinds cannot collide.

Form composition adds typed field/content/source capabilities. The default structural module requires Pages and Repetition; omitting either fails composition before a draft is loaded. Capability removal is deliberate: an unavailable saved subtype is rejected before Lexical can turn it into a fallback node. Recovery retains the original source bytes.

## Persistence and conversion

Form Markdown version 2 is the form draft format; service page drafts use ordinary Markdown and YAML frontmatter. Lexical is the editing representation; native FormDefinitionV2 JSON is the form definition exchanged with other systems. SSB is available through an explicit legacy converter. [Converters](CONVERTERS.md) receive the installed definition and never infer document kind from an ambiguous canvas.

A `DraftStore` receives explicit source and a codec: `new DraftStore(source, codec)`. It has no storage interface, keys, timer, journal or browser-event listeners. Source changes pause the canvas until Apply or Discard. Apply validates before replacing the document. Asynchronous imports carry snapshot-bound tokens, so stale reads cannot overwrite newer work. Replacement is one undo step; failures retain available original/candidate data in memory for download.

`dirty` means unapplied Markdown, not unsaved-to-server changes. `ready` means applied in memory, never a durable save. Only the API host can report Saved/Published. Invalid or unavailable input remains exact; no browser drafts are discovered or migrated.

`PreparedSource` distinguishes visual state from valid source-only content. `DraftProvider` supplies the in-memory document independently of Lexical; `DraftEditorBinding` connects a visual editor. Source-only Apply, explicit server saves and downloads need no hidden editor. The composer can also run without a store.

## Service pages and workspace

`workspace/page-sync.ts` compares a working copy with an in-memory `ServerPageBaseline` and saves explicitly using its `updated_at` token. A response acknowledges the submitted snapshot, never later edits. Background refresh does not overwrite the working copy or silently advance its write token. `workspace/service-pages.ts` maps only API pages into sidebar rows. `api/page-markdown.ts` owns page/save conversion.

`PageDocument` contains API navigation metadata, not content or storage keys. `ServicePageRole` describes entry/start/supporting content; the reusable form schema's `PageRole` describes questions/review/declaration/confirmation/result pages.

Authoring controls share the form builder's visual primitives in `src/ui`: buttons, block grips, menu rows, popup panels and settings fields. Page layout, content spacing and insertion choices are specific to writing. Page drag/drop moves whole root content blocks; form drag/drop retains its question grouping and nesting rules. Neither editor imports the other's document structure.

`definePageEditor` extends the kernel definition with installed Markdown handlers. Each page module supplies its supported syntax, Lexical import/export and safe preview rendering. The GovBB preset combines page metadata, text, components, native Lexical lists/tables and shared history, links and formatting. A list-item subclass preserves separate paragraphs within numbered instructions; form list nodes remain unchanged.

Page metadata lives in a hidden document node, retaining its YAML document, original source and initial canonical fingerprint. Editing the title shares the body's undo and save operation. Export returns original bytes until content or metadata changes; afterwards it normalizes Markdown without discarding unknown YAML fields, link targets or body structure. Unsupported content makes the whole page source-only, so conversion cannot silently flatten part of it; the page editor opens such a page read-only, with no Markdown source tool.

The editable site preview mounts landing's public renderer inside the CMS document. Title, introduction and body reuse the active editor session and history; the workspace retains save and publication ownership. See [Site preview](SITE-PREVIEW.md) for the runtime contract, style isolation and delivery requirements.

Services and pages come only from the API. Form IDs remain page metadata, without a browser-form join. The workspace keeps three clean views and pins any additional dirty/error/pending views. Reopened clean sessions compare API versions; confirmed discard also drops undo. One coordinated guard covers page/workspace departure, sign-out and unload. Cancel changes neither location nor working copies. Old local workspace/draft keys are inert and left untouched. Historical ADR 0007 describes the former local workspace.

Remote page sessions live in `workspace/remote-page-pane.tsx`; navigation has its own UI modules. `remote-page-dialogs.tsx` performs API creation/deletion through the existing `workspace-dialog.tsx` shell. There are no local-document dialogs or production form-editor route.

## Extension proofs

[The checked embedding example](examples/editor-system.tsx) uses the current GovBB page and form presets, demo definition and codecs. It is the starting point for using the installed editors.

[The extension browser fixture](../tests/browser/external-extensions.tsx) composes these custom modules through the public APIs:

- [Notice content module](../tests/extensions/notice-module.tsx), with a [separate form adapter](../tests/extensions/notice-form.ts).
- [Typed Reference field](../tests/extensions/reference-field.ts), including its owned reference callback.
- [Applicant registry entry](../tests/extensions/applicant-preset.ts), with local Show/wording references and literal values.

The extension tests and browser fixture cover installed capabilities, removal/recovery, two independent copies and editor/store isolation. Existing form goldens remain fixed; see [preservation rules](../tests/fixtures/forms/README.md).
