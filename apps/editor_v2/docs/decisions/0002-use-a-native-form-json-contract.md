# 0002 Use a native form JSON contract

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

Forms contain page purposes, questions, submitted answers, calculations and conditional behavior. Those meanings need to survive changes to editor nodes and support fields supplied by different modules. Using the editor's serialized tree as the external form contract would make every consumer depend on its editing representation. Using the legacy output format as the primary model would also constrain new capabilities to what that adapter can represent.

## Decision

Use `FormDefinitionV2` as the native form JSON contract. It is an application format describing a form, separate from the JSON Schema standard for validating answer data. Its ordered blocks describe pages, questions, content, calculated values and logic. Application and calculator modes have explicit page roles, including separate confirmation and result pages.

Keep structural IDs, submitted answer keys, option values and editable labels distinct. References address declared identities; answer keys belong to their submission scope; option values retain their scalar types. Editing a label does not rename an answer key. Import preserves identities, while copying allocates identities and remaps declared references as described in [ADR 0005](0005-insert-registry-entries-as-independent-copies.md).

Convert explicitly between native JSON, Lexical and the [Markdown draft representation](0003-preserve-editable-drafts-in-markdown.md). Converters receive the installed form definition. Native import validates capabilities, prepares an isolated editor and checks that re-export preserves meaning before offering a replacement. Export reads current editable state without changing the document or allocating identities. Legacy SSB output remains an explicitly selected adapter.

## Alternatives

- **Exchange serialized Lexical state.** This reduces conversion work but exposes node storage and editor upgrades as a dependency for form consumers.
- **Keep the legacy schema as the primary format.** Existing exports become simpler, but native extensions and calculations inherit that format's restrictions.
- **Use an answer-validation schema alone.** It can describe answer constraints, but page roles, content, navigation and conditional actions would still need a form definition alongside it.

## Consequences

The form contract can be validated independently of React and Lexical. Extensions must declare their native configuration, validation and reference mappings; unknown or unsupported data blocks native import/export instead of being silently discarded.

We own the schema, converters and preservation tests. Whole-question and registry copies preserve option values and literal text while remapping references. An individual option copied into an existing question adopts its owner and receives a distinct value when needed. These [copying rules](../../tests/forms/native-form-copy.test.ts) require explicit ownership handling.

A successful conversion establishes supported form semantics, not a deployed respondent service. Submission handling, publishing and production execution remain outside this editor's implemented scope; this decision does not freeze every v2 detail permanently.

## Evidence

- [Native types](../../src/forms/schema/types.ts) and [declared reference traversal](../../src/forms/schema/references.ts).
- [Native import and preservation check](../../src/converters/formSchemaToLexical/index.ts).
- [Native export](../../src/converters/lexicalToFormSchema/index.ts).
- [Editable conversion and identity preservation tests](../../tests/forms/native-form-converters.test.ts).
