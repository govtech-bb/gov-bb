# Adding a field

A field module adds an answer type and its behavior. Use a [Form registry entry](FORM-REGISTRY.md) to reuse already installed types, such as a National ID question. Use a field module when you need a new answer control.

The complete public-API example is [ReferenceFieldModule](../tests/extensions/reference-field.ts). Its [integration tests](../tests/extensions/external-extensions.test.ts) exercise insertion, conversion, copying and capability removal. [The extension browser fixture](../tests/browser/external-extensions.tsx) installs it next to built-in fields without editing a central kind switch. It is a test extension; the [basic embedding example](examples/editor-system.tsx) uses the app's installed page and form presets.

## Define the answer contract

Call `defineField` with a typed settings reader, defaults, identity, source storage and capabilities. The resulting definition captures the declared data and callbacks. Keep the reader pure: it computes an effective view without rewriting saved draft settings.

The following excerpt shows the settings reader. The linked Reference fixture provides the complete module. Its relative import assumes a file two directories below the repository root.

```ts
import { defineField, type Settings } from "../../src/forms";

type ReferenceSettings = { code?: string; peer?: string; required?: boolean };
const read = (raw: Settings): ReferenceSettings => ({
  code: typeof raw.code === "string" ? raw.code : undefined,
  peer: typeof raw.peer === "string" ? raw.peer : undefined,
  required: !!raw.required,
});
```

The linked fixture uses `kind: "reference-code"` and claims `input` nodes whose `kind` discriminator is `reference-code`. Shared input, long-answer, choice and decorator families are available through `$createDrawnInput`, `$createLongAnswerInput`, `$createChoiceInput` and `$createDecoratorField`. A new serialized node can instead be declared by the module. Node declarations and source storage claims must agree; overlapping claims fail composition.

Provide only the capabilities the control supports: comparisons, repetition, hidden labels, width, formula references and answer mentions. Presentation can use `draw`/`redraw` for a drawn control, a full `createDOM` hook when needed, or a React renderer for a decorator. Browser presentation callbacks are not invoked by pure source parsing.

## Preserve drafts and own validation

`settings.defaults` is copied when an answer is created, including explicit `false`. Do not materialize implicit respondent defaults just to display them. `validate(effective, raw, where)` must inspect `raw` for invalid authored values that a forgiving reader would otherwise hide. A malformed draft value must remain source-saveable and produce a useful diagnostic.

`source.attributes` declares the type of concise Markdown attributes for this field. Those names are scoped to the field, so another field can use the same attribute name with another type. `properties` plus paired `fromNode`/`toNode` hooks cover owned serialized properties that require adaptation. Preserve all unrelated raw properties. The source format's retained state supports unfinished settings without introducing a second full document.

A `native` handler created with `defineNativeField<K, Config>` owns the JSON kind/configuration, validation, references and import/export mapping. The import callback can use `context.importQuestion(block, editorKind)`. The export callback reads current data using `context.exportQuestion(editorKind)` and `context.nodes` for custom settings. It must preserve unknown draft data or report a located error; do not coerce an invalid draft into valid output.

The Reference example declares its custom config and structured `peer` reference, imports editable settings and exports the current reference code after UI edits. No SSB import or handler is required. Optional SSB mappings belong to the explicitly selected `forms/legacy` adapter, outside native declarations.

## Declare reference semantics

Declare references in both representations when the field uses them:

- The native handler's `references(block, visit)` visits native configuration references using `{ kind, id, path }` and returns the updated block.
- The field's `references(settings, visit)` visits editor-setting references using `{ kind, value, path }` and returns a settings patch.

Use the reference kind and property path expected by each API. For example, the Reference fixture uses `kind: "answer"` in native configuration and `kind: "field"` in editor settings. Use `ownedIds` and `copySettings` when the field owns internal identities such as grouped options.

The Reference example maps `peer` as a field reference. It leaves an opaque `literal: "applicant"` untouched even when an actual `peer: "applicant"` is remapped. Never search-and-replace arbitrary strings or treat submitted choice values as editor identities.

## Package the authoring UI

`fieldModule({ field, insertion, Controls, Preview, Renderer? })` creates the complete installation unit. `insertion` supplies the stable action ID, order, node factory and question/answer copy. The helper contributes both a complete question and a bare answer action, previews and an inspector slot. Its inspector checks the input role before the kind, avoiding collisions with content such as numbered lists.

`Controls` receives `{ m: BlockMenuModel, a: BlockMenuActions }`; use `a.onSettings` for edits. The common form controls are exported, but there is no settings-form DSL. `Preview` receives optional width, mask and option samples; decorator `Renderer` receives `WidgetProps`. Keep renderers editor-scoped and do not install another history owner.

Install the module through `defineFormEditor({ modules: [...] })`. The same resolved definition must be used by the live editor, headless operations and converters. In the [extension browser fixture](../tests/browser/external-extensions.tsx), `ReferenceFieldModule()` is appended to `govbbFormModules` and the developer's registry can then use `kind: "reference-code"`.

## Verification

Test an actual inserted answer, authored invalid settings, Markdown encode/load/encode, native import/export semantic equality and edit-before-export, one-step undo and two copied instances with independent references. Remove the module and verify raw JSON and source reject its saved subtype before hydration while retaining recovery bytes; reinstalling it must load the valid saved document again. Test live read-only controls and renderer behavior in a browser when the field has UI.

From `apps/editor_v2`, run `pnpm exec vitest run tests/extensions docs/examples` and `pnpm typecheck` for the reference fixtures and documented composition. Before integration, also run `pnpm test` and `pnpm check:boundaries`.
