# Form registry

Registry entries are native JSON definitions copied into the owning editor. The built-in catalog contains 22 question/group fragments and one complete loud-music permit form. “Team blocks” and “GovBB fields” remain search aliases. Inserted definitions have no live template dependency.

## Declare an entry

Use the public `defineFormRegistryEntry`, `defineFormRegistry`, and `FormRegistryModule` exports from `src/forms`. Entries carry a catalog `key`, positive integer `version`, title, description, and optional icon/keywords. Their data is copied and frozen.

```ts
import {
  defineFormRegistry,
  defineFormRegistryEntry,
  FormRegistryModule,
  question,
} from "../../src/forms";

const applicant = defineFormRegistryEntry({
  scope: "fragment",
  key: "service/applicant",
  version: 1,
  title: "Applicant",
  description: "Applicant name and contact email",
  blocks: [
    question({ id: "name", key: "name", kind: "text", label: "Full name" }),
    question({ id: "email", key: "email", kind: "email", label: "Email address" }),
  ],
});
const module = FormRegistryModule(defineFormRegistry([applicant]), {
  key: "service-registry",
});
```

This import assumes the example lives two directories below the repository root. Add `module` to the `modules` array passed to `defineFormEditor`; the entry uses the installed text and email fields.

| Scope | Payload | Creation path |
| --- | --- | --- |
| `fragment` | `blocks`, without pages | Insert into a compatible page |
| `page` | `blocks`, beginning with a page | Insert at a page boundary |
| `form` | `form`, a complete native v2 definition | Host creates a separate draft |

`question`, `option`, `content`, `group`, and `rule` are ordinary native JSON factories. `question` requires separate `id` and submitted `key`; omitted label becomes an empty string. `option` accepts `{id,label,value}`. `content` accepts `{id,kind,content,config?}`. `rule` accepts `{id,rules:[{id,when,actions}]}`. `group` flattens arrays without creating a stored wrapper. All native constraints, required messages, defaults, rich text, and repeats are authored directly. These helpers do not accept Markdown source records, Lexical NodeState, or SSB settings.

For a built-in complete form, see the [current native demo](../src/presets/form-registry/demo.ts) and [checked conversion example](examples/editor-system.tsx). For custom extensions, see the [native applicant group](../tests/extensions/applicant-preset.ts), [native-only field](../tests/extensions/reference-field.ts), [native-only content module](../tests/extensions/notice-form.ts), and their [browser composition](../tests/browser/external-extensions.tsx). These test extensions do not need SSB adapters.

## Identity, values and references

Registry instantiation allocates fresh block, question, page, calculated value, option, and list-item identities. Option identities are scoped to their owning question, so separate questions may both declare an option `yes`. Typed reference positions are remapped; literal strings and submitted option values, including `false` and zero, retain their value. Configured native module reference callbacks handle custom configuration references.

Submitted answer keys are allocated separately and checked against the current destination at insertion. Repeated copies receive suffixes such as `name_2`; two different repeating pages may both submit an answer named `name`. Repeat collection keys remain distinct at form scope. Explicit reference scopes remain explicit.

Factories can deliberately bind a fragment to the current form by listing destination identities in `externalReferences`. Such references stay external. Insertion requires a native destination and checks that the identities still exist and have the correct kind/scope. Undeclared external references fail before insertion. A complete-form template cannot bind to another draft.

Visibility is explicit. The address-country group uses `layout.under` to place parish and postcode below the Barbados option, sets their initial visibility, and declares a `selected` condition with `setVisible` actions. Indentation itself does not create behavior.

## Preparation and insertion

`prepareRegistryEntry(entry, definition)` validates a fragment or page and converts it to editor nodes through the installed native handlers. An isolated native document checks semantic preservation; this conversion uses no Markdown envelope or positional page slicing. `$instantiateRegistryEntry(prepared, target?)` rechecks ownership, submitted-key collisions, external bindings, and destination semantics before returning live nodes. Each prepared object can be used once. Action preparation happens before slash-trigger removal, and insertion remains one undo step.

Full-form entries are excluded from insertion actions. The host calls `createRegistryForm(entry, definition)` to allocate a fresh independent native form, then uses the normal isolated import pipeline and a separate draft store. Ordinary JSON import preserves authored identities; registry creation intentionally allocates new ones.

The preview reads the same native declaration and resolves its renderer through the owning editor's installed field modules. Optional `trailingParagraph: false` suppresses the usual typing line after a final decorator. `foldedQuestions` lists local question IDs initially collapsed in the editor; long built-in choice lists use this catalog presentation preference without adding it to native form data.

## Persistence and evidence

Changing or removing a registry entry does not alter previously inserted questions. The editor stores their native metadata and text through the existing Markdown draft channel. The [demo asset](../src/presets/form-registry/demo.ts) is shared by fresh drafts and complete-form creation.

Historical Markdown preset profiles and SSB provenance remain frozen compatibility data in `forms/source/legacy` and `forms/core/legacy-provenance-v1.json`. They are separate from current native registry declarations and must not be regenerated when catalog defaults change.

`native-registry.test.ts`, `registry-insertion.test.ts`, `registry-contracts.test.ts`, and `registry-entries.test.ts` cover typed remapping, all 22 entries, configured preview dispatch, external bindings, repeat scopes, failed actions, one-use copies, undo/redo, source reload, and independent complete-form creation. The capability checker additionally requires actual native fixture evidence.
