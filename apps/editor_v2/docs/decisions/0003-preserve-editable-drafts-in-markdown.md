# 0003 Preserve editable drafts in Markdown

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

Authors need to edit forms on the canvas and inspect or change their source. The source should be readable in a diff, while retaining identities, rich text, field configuration and unfinished work. A partially authored form can be worth saving even when it cannot yet produce a valid native definition.

## Decision

Persist the form draft as versioned Markdown using a bounded, validated dialect. Headings, question directives and lists carry readable content. Visible structured payloads and scoped source-state metadata preserve details that ordinary Markdown cannot express. The metadata does not contain a second complete form document.

Lexical holds the live editing representation. [Native JSON](0002-use-a-native-form-json-contract.md) is the exchanged form definition; it is generated from the current editable state rather than maintained as a separately editable saved copy alongside Markdown.

Require semantic preservation when converting supported drafts. Canonical writing may normalize syntax, but must retain meaningful values, identities and supported authoring state. Known incomplete questions, logic and calculations remain saveable even when native export is blocked. Malformed source or unavailable capabilities retain the original source for recovery instead of being coerced into a different document.

Keep unapplied source in a separate working buffer and pause canvas editing while it is pending. Apply prepares and checks the candidate before replacing the canvas. Discard restores source from the current canvas, including canvas changes that could not yet be saved. [ADR 0006](0006-keep-draft-persistence-in-the-host.md) owns storage, conflicts and recovery around these operations.

## Alternatives

- **Persist only native JSON.** This avoids maintaining a Markdown dialect, but does not provide the chosen readable source-authoring workflow and would need another representation for incomplete editor work.
- **Use ordinary Markdown without metadata.** The text stays simpler, but identities, typed values and editor state cannot all survive a round trip.
- **Maintain JSON and Markdown as independent saved authorities.** Both are immediately available, but edits then require reconciliation when the two representations disagree.

## Consequences

Forms can be reviewed and edited as text while retaining richer authoring state. Being saved and being ready for native export are separate states; the interface must explain that distinction.

The dialect, migrations and preservation checks require ongoing maintenance. Complex forms still contain structured metadata, and arbitrary Markdown or YAML is not supported. Changes to serialization need migration evidence, including preservation of unrelated data and original recovery bytes. Canonical output is not a promise to preserve the source's original formatting byte for byte.

## Evidence

- [Markdown format and supported syntax](../MARKDOWN.md).
- [Canonical writer and preservation check](../../src/converters/lexicalToMarkdown/index.ts).
- [Isolated source preparation](../../src/converters/markdownToLexical/index.ts).
- [Draft fidelity and malformed-source tests](../../tests/forms/markdown.test.ts).
- [Native bindings and migration preservation tests](../../tests/forms/native-form-markdown.test.ts).
