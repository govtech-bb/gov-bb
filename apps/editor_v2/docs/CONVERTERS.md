# Converters and saved drafts

The form editor imports and exports **FormDefinitionV2**, the application's JSON contract for pages, questions, content, calculations and conditional logic. It is a custom form definition; the JSON Schema standard for answer-data validation is a separate concept. Form drafts use versioned Markdown. Service page drafts have a separate ordinary Markdown/YAML contract. Lexical holds each visual editing representation.

| Converter | Input | Result |
| --- | --- | --- |
| `lexicalToMarkdown(state, definition)` | Serialized Lexical state | Canonical Markdown |
| `markdownToLexical(source, definition)` | Markdown bytes | Optional `state`, `original` source and diagnostics |
| `lexicalToFormSchema(state, definition, editor?)` | Existing Lexical EditorState | `ready` with native schema, or `blocked` with `schema: null` and located diagnostics |
| `formSchemaToLexical(value, definition)` | Unknown parsed JSON | Isolated prepared state, or blocked result retaining original data |
| `lexicalToLegacySsb(state, definition, editor?)` | Existing Lexical EditorState | `schema` or `null`, with compatibility diagnostics |
| `pageMarkdownToLexical(source, definition)` | Page Markdown and YAML | Visual prepared state, or intact source-only document with diagnostics |
| `lexicalToPageMarkdown(state, definition)` | Serialized page Lexical state | Original bytes before edits; normalized page Markdown after edits |

Form converters are exported from `src/forms`; page converters and `createPageDraftCodec` are exported from `src/pages`. The folders under `src/converters` expose each conversion boundary; page implementations live in `src/pages/converters.ts`.

Form Markdown import returns diagnostics and no state when preparation fails. Page import throws `SourceError` for invalid metadata; unsupported body syntax instead returns a valid source-only document. Callers must handle these outcomes separately.

Every operation receives the installed form or page definition. The kernel does not import domains or converters. `src/forms/schema` owns pure form types, validation, structural references and semantic comparison.

## Page contract

`createPageDraftCodec(definition)` adapts page conversion to the shared persistence contract. `prepare` returns `mode: "visual"` with serialized editor state for supported content, or `mode: "source"` with no state for unsupported content. Both preserve the original source. Invalid YAML metadata throws `SourceError` and leaves the last committed document intact.

Modules own Markdown import, export and preview handlers. The installed GovBB page preset supports standard text, headings, links, hard breaks, nested and multi-block lists, tables, blockquotes, separators, notice/details/action directives and Start-link markers. An implicit Start destination remains implicit; `form_id` and explicit URLs are retained. Page conversion never calls form schema conversion.

Metadata keeps its YAML representation, including unknown keys, comments and absent fields. The title is page metadata; the body does not gain a duplicate heading. Description and introduction remain separate. Untouched documents encode to their exact original bytes; visual edits can normalize formatting. Unsupported HTML and specialist components stay wholly in source mode instead of producing a partial editable projection. Preview renders supported nodes without injecting raw HTML.

The [page fixtures](../tests/fixtures/pages/README.md) pin 16 frozen originals with SHA-256 hashes. Tests check three visual documents before and after metadata edits, export and reload, and verify exact preservation of the 13 source-only documents. Integration tests also read current GovBB Markdown directly from `apps/landing/src/content` and check conversion preservation as that content changes.

## Native contract

A definition has `schemaVersion: 2`, stable identity, title, mode, locale, time zone, settings and an ordered `blocks` array. Blocks are pages, questions, content, calculations or conditional logic. Page roles are questions, review, declaration, confirmation and result. Question IDs address logic; question keys name submitted answers. Option IDs address choices while their values remain typed strings, numbers or booleans. Repeating scopes have local keys.

All answer-dependent behavior belongs in visible logic blocks. Expressions, ordered rules/actions and inline answer/calculation references are structured data. Editor previews are authoring aids: this repository does not implement respondent submission, notification delivery or calculator deployment.

The seven complete native forms are in [tests/fixtures/forms/v2](../tests/fixtures/forms/v2), with independent examples under `examples`. Source-derived forms, branch cases and calculator vectors live in [tests/fixtures/forms/source](../tests/fixtures/forms/source). The manifest pins local regression evidence and records identity mappings and deliberate differences. Independent test interpreters compare these saved cases and vectors; they are not production runtimes.

## Preservation and readiness

Export reads current editable labels, hints, page headings, options and feature state. It allocates no IDs and changes no selection, document or history. Import validates before hydration, builds through installed mappings, re-exports in a disposable configured editor and checks semantic equality.

Only equivalent rich-text segmentation is normalized: adjacent text runs with the same formatting may be combined. `false`, zero, empty strings, intentionally omitted properties, submitted values and array order retain their meaning.

Unavailable modules, unknown properties, broken references, cycles, unsupported versions and incomplete native expressions block runnable export. Known incomplete widgets remain Markdown-saveable drafts. Module-specific mapping callbacks receive the configured nodes and own their custom settings/configuration. A native-only module does not need SSB handlers.

Custom validation/reference failures return located diagnostics. Import failures retain the original value and release temporary editor ownership. Passing a live editor owned by a different definition is a programming error and throws without mutating either editor.

Markdown keeps per-node native bindings in the existing source-state extension and structured widget payloads in visible JSON fences. It does not conceal a complete form JSON document in one blob. Source controls and canvas controls update the same data. Markdown anchors can change without changing native IDs or submitted keys.

## Existing drafts

The configured preparation path attempts an idempotent native-binding upgrade for existing Markdown v2 as well as v1. It preserves supported formulas and wording structurally. Unknown legacy properties and sequential accumulator semantics that cannot be mapped faithfully keep the original editable legacy payload and located conversion issues.

A successful source upgrade returns `migrated: true` and the exact `migrationOriginal`. The host backs that original up before its first native-bound canonical write. A different existing backup or failed backup write blocks replacement. Dirty working Markdown remains separate until Apply or Discard. Existing committed, working, previous and legacy key names are unchanged; a per-draft migration-backup key is additional.

## Application operations

The app's **JSON** dialog downloads the visible native form or stages an uploaded file for review. Staging retains exact uploaded bytes and does not replace the canvas. Dirty Markdown, conflicts, recovery or read-only state block applying/exporting a stale canvas. A captured token rejects imports if the editor changes during file reading.

`DraftStore.replacePrepared` prepares an editor closure, checks concurrency, writes a recovery journal, rechecks storage, commits canonical Markdown, then applies one history step. Precommit failures retain the old canvas. Failure after canonical commit freezes editing and retains both states for explicit recovery; cleanup failures report a successful content commit with cleanup pending. Cleanup verifies journal bytes and transaction identity. JSON import can be undone/redone and autosaved.

The service workspace's **Add a document** operation creates a page, application form or calculator, opens a page Markdown/form JSON file, or instantiates a complete form registry entry. Registry forms receive fresh identities. Each document has its own storage namespace and editor history. Navigation preserves existing sessions and unapplied Markdown; failed saves and unresolved conflicts prevent leaving the current document. The earlier form-draft host APIs remain available to independently embedded editors.

Generic persistence receives only codec/prepared-state contracts; it imports no native form schema. Content-only editors can inject a different codec. Host read-only state remains independent of draft pauses.

## Checks

From `apps/editor_v2`, run `pnpm test`, `pnpm typecheck`, `pnpm check:boundaries` and `pnpm check:coverage`. The coverage matrix checks installed capabilities and their tests. Use `native-form-schema.mjs` with the [browser runner](DEVELOPMENT.md#browser-checks) to check JSON import and export in the UI. Keep legacy fixture expectations fixed unless the format changes intentionally.
