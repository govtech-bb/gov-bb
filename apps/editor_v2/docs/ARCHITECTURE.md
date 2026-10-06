# Editor system

The reusable editor kernel supports content editing without importing the form system. Page modules add Markdown writing; form modules add questions, form pages, logic and the form source format. The workspace selects the document, chooses its preset and connects persistence.

Form-wide configuration and page metadata panels belong to the host. The editors preserve that data through converters; they provide no form-wide settings or checks dashboard.

This guide describes the installed module system. [Architecture decision records](decisions/README.md) explain the choices, alternatives and consequences behind it. The [converter guide](CONVERTERS.md) defines the native JSON and Markdown boundaries; [Form registry](FORM-REGISTRY.md) describes reusable form definitions.

## Public entry points

| Import | Responsibility |
| --- | --- |
| `src/editor` | Module definitions, live/headless editors, actions, renderers, slots and content modules |
| `src/forms` | Typed fields/content adapters, form composition, Form registry builders, form canvas and converters |
| `src/forms/modules` | Supported built-in form modules and content adapters for application-owned presets |
| `src/pages` | Page module composition, Markdown conversion, title editing, writing canvas and preview |
| `src/persistence` | Injected draft storage, codec/connection contracts and recovery/conflict state |
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
src/host                     browser storage/events and application binding
src/workspace                service/document index, navigation and document creation/import
src/api                      api_v2 content reads, such as the services list
src/ui/table                 shared list table: features and components once; each list adds columns and data
src/routes                   TanStack routes and server-safe document shell
```

The TypeScript boundary checker enforces these dependency boundaries. Generic editor code cannot import forms, presets, the app or persistence. Pure layers cannot reach browser globals or React UI. Form behavior is owned by installed form contributions; it is not selected from a second global catalog.

The app uses TanStack Start in SPA mode. Its root document can render at build time; the workspace layout disables SSR and owns browser storage and document sessions. Route changes select a document within that persistent layout instead of remounting the editor. Framework imports stay in the app shell and workspace navigation, outside the reusable editor and persistence layers.

## Module lifecycle

`defineEditor(modules, namespace)` combines module declarations into an immutable editor definition. An `EditorModule` can contribute nodes and raw validators, document/browser registrations, an initializer, initial normalizers, actions, renderers, slots and theme data. Composition rejects:

- Duplicate module, registration or action keys.
- Incompatible node claims.
- Missing required capabilities.
- Multiple history owners.

Several features may reuse the same node declaration object. Separate declaration objects for the same type conflict even when they name the same class.

`createHeadlessEditor(definition, state?, options?)` validates saved nodes before hydration, installs document registrations and prepares the initial document. Browser registrations are excluded. Call `dispose()` when finished. `{ prepare: false }` is reserved for callers that explicitly own preparation, such as conversion read contexts.

`EditorComposer` prepares the same definition for React and installs its browser behavior. `definition` is fixed per mount; remount to change installed modules. `initialState` is initial input, not a controlled-state prop. `readOnly` can change while mounted. `Editor` supplies a content-editable surface, slash menu and overlay slot; `FormEditor` supplies the form canvas inside a composer. Neither requires browser storage.

The `readOnly` prop on `EditorComposer` controls host-owned editability. The draft connection owns a separate temporary pause for unapplied source or conflicts. Autosave, Apply and Discard can clear the draft pause but cannot clear the host's read-only state, including when that state changes while source is already paused.

A registration returns its cleanup function. Each editor owns its history and listeners; loading a document establishes its undo baseline. The shared browser router tracks the focused editor, including its portals, while native inputs keep their own undo. Unmounting one editor must not remove another editor's routing or listeners.

## Contributions and actions

Actions supply stable IDs, labels, grouping, optional numeric order, availability and execution callbacks. Slash and insertion-dialog surfaces read the installed actions. `executeAction(editor, definition, id, request)` opens an update; `$executeAction(...)` is for an existing update. Both enforce editor ownership and recheck availability before trigger removal or mutation. A `$prepare` callback can validate an insertion before returning its commit callback.

`RendererHost` resolves a named renderer in the current editor; `EditorSlot` renders that editor's ordered slot contributions. Missing renderer contributions fail explicitly. Names include their role, such as `field-preview:text` and `widget:file-upload`, so unrelated content and answer kinds cannot collide.

Form composition adds typed field/content/source capabilities. The default structural module requires Pages and Repetition; omitting either fails composition before a draft is loaded. Capability removal is deliberate: an unavailable saved subtype is rejected before Lexical can turn it into a fallback node. Recovery retains the original source bytes.

## Persistence and conversion

Form Markdown version 2 is the form draft format; service page drafts use ordinary Markdown and YAML frontmatter. Lexical is the editing representation; native FormDefinitionV2 JSON is the form definition exchanged with other systems. SSB is available through an explicit legacy converter. [Converters](CONVERTERS.md) receive the installed definition and never infer document kind from an ambiguous canvas.

A `DraftStore` receives storage, initial state, a codec and host-owned keys, including optional migration-backup and replacement-journal keys. It does not know the GovBB preset or browser globals. An editor connection parses prepared state before any write and returns a callback that applies it. Document replacement proceeds in this order:

1. Validate and parse the candidate.
2. Check for conflicts.
3. Journal the exact prior and candidate bytes.
4. Commit canonical source.
5. Apply the replacement as one history step.

Failures after commit freeze the editor for explicit recovery, while cleanup failure retains transaction evidence for retry. Invalid or unavailable content stays recoverable rather than being silently rewritten.

The host owns `localStorage`, storage/page lifecycle listeners and copy/download UI. Two editors can share a storage object with distinct key sets. The composer can also run without a store.

`PreparedSource` distinguishes a visual document with serialized editor state from a valid source-only document without it. `DraftProvider` supplies persistence independently of Lexical; `DraftEditorBinding` connects a mounted editor when visual state exists. Source-only Apply, saving, downloads, working buffers and conflict handling therefore do not depend on an invisible editor.

## Service pages and workspace

Authoring controls share the form builder's visual primitives in `src/ui`: buttons, block grips, menu rows, popup panels and settings fields. Page layout, content spacing and insertion choices are specific to writing. Page drag/drop moves whole root content blocks; form drag/drop retains its question grouping and nesting rules. Neither editor imports the other's document structure.

`definePageEditor` extends the kernel definition with installed Markdown handlers. Each page module supplies its supported syntax, Lexical import/export and safe preview rendering. The GovBB preset combines page metadata, text, components, native Lexical lists/tables and shared history, links and formatting. A list-item subclass preserves separate paragraphs within numbered instructions; form list nodes remain unchanged.

Page metadata lives in a hidden document node, retaining its YAML document, original source and initial canonical fingerprint. Editing the title shares the body's undo and save operation. Export returns original bytes until content or metadata changes; afterwards it normalizes Markdown without discarding unknown YAML fields, link targets or body structure. Unsupported content makes the whole page source-only, so conversion cannot silently flatten part of it.

The workspace index stores services and document references, roles, navigation labels and storage keys. Page content remains in its draft; form content remains in its existing contract. Services support an entry page, optional start page, supporting pages and one application form or calculator. The host retains independent document sessions, flushes changes before navigation and preserves unapplied source. The initial workspace attaches existing local form drafts without rewriting their stored documents. [ADR 0007](decisions/0007-service-workspaces-and-markdown-pages.md) records these boundaries.

## Extension proofs

[The checked embedding example](examples/editor-system.tsx) uses the current GovBB page and form presets, demo definition and codecs. It is the starting point for using the installed editors.

[The extension browser fixture](../tests/browser/external-extensions.tsx) composes these custom modules through the public APIs:

- [Notice content module](../tests/extensions/notice-module.tsx), with a [separate form adapter](../tests/extensions/notice-form.ts).
- [Typed Reference field](../tests/extensions/reference-field.ts), including its owned reference callback.
- [Applicant registry entry](../tests/extensions/applicant-preset.ts), with local Show/wording references and literal values.

The extension tests and browser fixture cover installed capabilities, removal/recovery, two independent copies and editor/store isolation. Existing form goldens remain fixed; see [preservation rules](../tests/fixtures/forms/README.md).
