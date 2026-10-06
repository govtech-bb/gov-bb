# 0005 Insert registry entries as independent copies

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

Teams need reusable questions, groups and complete forms without forcing each saved form to depend on the current registry implementation. A preset may include content, conditions and references as well as inputs. Reuse must therefore preserve meaning, not just reproduce its appearance in the editor.

## Decision

Define Form registry entries in developer-authored code using native form JSON data and small composition helpers. Entries declare fragment, page or complete-form scope. Catalog metadata and initial editor presentation remain separate from the form definition.

Insertion creates ordinary, independently editable form blocks. The resulting draft has no live template link and remains usable if the registry entry changes or is removed. Complete-form entries create a new draft through the host rather than inserting another form into the canvas.

Validate entries against the configured editor's installed capabilities. Prepare and check a detached copy before insertion, including whether the installed modules can preserve its native meaning. Recheck destination-dependent constraints when inserting it.

Apply the identity and reference distinctions in [the native form JSON contract](0002-use-a-native-form-json-contract.md): copies receive independent identities, internal references follow the copy, and submitted keys avoid conflicts in the destination scope. Submitted option values and literal strings remain unchanged. External references require an explicit binding and a valid destination. Ordinary JSON import remains an identity-preserving operation.

## Alternatives

- Live-linked, versioned templates. Central corrections could reach existing forms, but changing a dependency would change an author's saved form and require an upgrade and conflict policy.
- Serialized editor-state templates. These are convenient for recreating a canvas but couple registry definitions to editor nodes and storage details.
- Special registry widgets. These preserve template identity but require a second editing model and limit ordinary block composition.

## Consequences

Registry updates affect future insertions only. Existing forms remain editable and portable, but template corrections must be applied separately where needed. Entry version numbers do not imply automatic upgrades.

Preparation and reference remapping add validation work, but failed preparation preserves the document, selection and undo history. Modules that cannot preserve an entry are rejected instead of producing an approximate copy. Author-created registry entries and template-update workflows are outside the implemented scope.

## Evidence

- [Entry declarations and detached definitions](../../src/forms/registry/definition.ts)
- [Preparation, instantiation and complete-form creation](../../src/forms/editor/registry.ts)
- [Copies surviving catalog replacement or removal](../../tests/forms/registry-contracts.test.ts)
- [Independent insertion, rollback and ownership tests](../../tests/forms/registry-insertion.test.ts)
