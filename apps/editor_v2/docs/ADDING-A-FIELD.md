# Adding a field

A field adds an answer type and its behavior. Use a [Form registry entry](FORM-REGISTRY.md) to reuse already installed types, such as a National ID question. Add a field when you need a new answer control.

## Where a field lives

A field is one file in `src/forms/fields`, named as the insert menu names it. Date input is [`date-input.tsx`](../src/forms/fields/date-input.tsx): its field (`dateInputField`), its insert entry and its module (`DateInputModule`). Its other files share that prefix, such as `date-input-controls.tsx` for its settings panel and `date-limits.ts` for its own settings. [`email-address.tsx`](../src/forms/fields/email-address.tsx) is the smallest complete field.

To install it, add its module to `formFields` in [`fields/index.ts`](../src/forms/fields/index.ts). The GovBB preset installs that list, so nothing shared changes. A field on a kind the native format already has, such as `text`, declares it with `nativeField(kind, { kind, valueType })`; a field with a kind of its own declares its JSON with `defineNativeField`, below. Either way, give its native capability a row in the [capability matrix](../tests/fixtures/forms/v2/capabilities.json), which `pnpm check:coverage` holds to the installed fields.

## A field from outside the app

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

A `native` handler created with `defineNativeField<K, Config>` owns the JSON kind, value type, validation and references. Its import and export default to the question's settings, shared and own, as a built-in field's do, so a field whose settings are declared in `settings.own` writes neither. Write them only for a shape settings can't express: the import callback can use `context.importQuestion(block, editorKind)`, and the export callback `context.exportQuestion(editorKind)` and `context.nodes`. Either must preserve unknown draft data or report a located error; do not coerce an invalid draft into valid output.

The Reference example declares its custom config and structured `peer` reference, and keeps `code` and `peer` in its config with `configSetting`, so edits reach its export with no import or export of its own. No SSB import or handler is required. Optional SSB mappings belong to the explicitly selected `forms/legacy` adapter, outside native declarations.

## Declare the settings only your field has

Each setting only your field has is declared once with `defineSetting` and listed in the field's `settings.own`. It names the editor settings it owns, reads them from the field's native question and writes an edit back, usually as a validation rule or config. The shared native code finds a question's own settings through the installed definition, and the lists of settings a question may own take them from its field, so a new setting changes nothing shared.

- `ruleLimit(toggle, key, rule)` is a limit the author switches on, kept as one rule, such as a minimum age.
- `configSetting(key, { json, number })` keeps a setting in the native config, under its own name or another, such as the Time input's step, kept as `stepSeconds`.
- [`field-rule-settings.ts`](../src/forms/fields/field-rule-settings.ts) declares the settings several fields share: character and choice limits, and an answer pattern.
- [`date-limits.ts`](../src/forms/fields/date-limits.ts) maps its own way: past or future, before or after a day, a range or set days, kept as date rules.

Settings every question has, such as required, hidden, the default answer, width and error messages, are declared once in [`shared-settings.ts`](../src/forms/settings/shared-settings.ts); a field's own setting with the same key replaces one. A default answer converts by the field's `valueType`.

## Declare reference semantics

Declare references in both representations when the field uses them:

- The native handler's `references(block, visit)` visits native configuration references using `{ kind, id, path }` and returns the updated block.
- The field's `references(settings, visit)` visits editor-setting references using `{ kind, value, path }` and returns a settings patch.

Use the reference kind and property path expected by each API. For example, the Reference fixture uses `kind: "answer"` in native configuration and `kind: "field"` in editor settings. Use `ownedIds` and `copySettings` when the field owns internal identities such as grouped options.

The Reference example maps `peer` as a field reference. It leaves an opaque `literal: "applicant"` untouched even when an actual `peer: "applicant"` is remapped. Never search-and-replace arbitrary strings or treat submitted choice values as editor identities.

## Package the authoring UI

`fieldModule({ field, insertion, Controls, Preview?, Renderer? })` creates the complete installation unit. `insertion` supplies the stable action ID, order, node factory and question/answer copy. The helper contributes both a complete question and a bare answer action, previews and an inspector slot. Its inspector checks the input role before the kind, avoiding collisions with content such as numbered lists.

`Controls` receives `{ m: BlockMenuModel, a: BlockMenuActions }`; use `a.onSettings` for edits. The common form controls are exported, but there is no settings-form DSL. Without a `Preview`, the insert dialog shows the field as the canvas draws it: the box its `draw` makes, or its `choice` options, so the two cannot disagree. Draw with the GovBB kit in `src/ui/govbb.ts`. A field the canvas draws in React, or not at all, brings its own `Preview`, which receives optional width, mask and option samples; decorator `Renderer` receives `WidgetProps`. Keep renderers editor-scoped and do not install another history owner.

A built-in field is installed through `formFields`; a field from outside the app is installed through `defineFormEditor({ modules: [...] })`. The same resolved definition must be used by the live editor, headless operations and converters. In the [extension browser fixture](../tests/browser/external-extensions.tsx), `ReferenceFieldModule()` is appended to `govbbFormModules` and the developer's registry can then use `kind: "reference-code"`.

## Verification

Test an actual inserted answer, authored invalid settings, Markdown encode/load/encode, native import/export semantic equality and edit-before-export, one-step undo and two copied instances with independent references. Remove the module and verify raw JSON and source reject its saved subtype before hydration while retaining recovery bytes; reinstalling it must load the valid saved document again. Test live read-only controls and renderer behavior in a browser when the field has UI.

From `apps/editor_v2`, run `pnpm exec vitest run tests/extensions docs/examples` and `pnpm typecheck` for the reference fixtures and documented composition. Before integration, also run `pnpm test` and `pnpm check:boundaries`.
