# 0007 Separate service pages from form documents

Status: Accepted

Recorded: 2026-10-05

## Context

A government service needs entry, start and supporting pages as well as an application form or calculator. Pages contain freely authored content. Combining them with questions in one canvas would make insertion controls ambiguous and expose form-specific syntax to content authors. GovBB pages use Markdown with YAML frontmatter.

## Decision

Group independently stored documents in a service workspace. Each service has an entry page, an optional start page, supporting pages and at most one application form or calculator. Existing saved forms can be attached without rewriting their source. Document selection determines the editor and its tools; calculators remain forms with calculator mode.

Keep separate document contracts. Service pages use GovBB Markdown and YAML frontmatter. Forms use native v2 JSON and versioned form Markdown drafts. Page titles and metadata belong to the page document. The workspace index stores document references and navigation information.

Compose the page editor from the shared editor kernel, history, formatting and links, with page modules for standard Markdown, nested lists, tables and GovBB components. Page modules own their Markdown conversion and preview handlers without importing form internals. Page metadata shares the document's history and save operation. The workspace hosts these reusable editors. Form-wide settings panels, page metadata panels and a separate checks dashboard are outside editor scope; converters preserve their stored values and validate imports and exports.

Preserve original Markdown bytes until a visual change. Visual edits may normalize formatting while retaining content, grouping, metadata and destinations. Preserve unknown YAML fields and intentional absence. Unsupported HTML, specialist components and other unsupported syntax remain source-only documents: the whole source stays editable and downloadable. Invalid metadata blocks Apply. Persistence must support a valid source-only document without a mounted Lexical editor.

Keep form associations explicit. Import preserves `form_id` and action destinations; an implicit Start marker retains its association without inventing a URL.

## Alternatives

- **Extend the form canvas for entry pages.** Reuses form UI but mixes content and question semantics, source dialects and controls.
- **Build a separate page application.** Gives content a dedicated editor but duplicates shared editing and persistence behavior and separates related service documents.
- **Require every imported page to become visual content.** Provides a uniform UI but risks discarding specialist markup or changing its meaning before a supported module exists.

## Consequences

Authors select a document before choosing its tools. Services can exist without a form, and each document owns its draft and history. The host must preserve working source, flush writes before navigation and surface storage conflicts.

Page and form converters remain separate. Adding a page component requires an installed module rather than a form schema change. Native Lexical lists and tables provide editing behavior; a narrow list-item subclass preserves separate paragraphs that the standard list item would merge.

Regression coverage retains 16 frozen page fixtures with original hashes: three visual examples and 13 source-only cases. Integration tests also read current Markdown directly from `apps/landing/src/content`, checking import, export and metadata edits. Supported pages have a preview; source-only pages remain available through Markdown. CMS integration, publishing and respondent execution require separate decisions.

## Evidence

- [Service workspace model](../../src/workspace/model.ts) and [document preparation](../../src/workspace/documents.ts).
- [Page composition and module contract](../../src/pages/definition.ts) and [GovBB page preset](../../src/presets/govbb-page.ts).
- [Page conversion](../../src/pages/converters.ts) and [persistence contracts](../../src/persistence/types.ts).
- [Page preservation and integration tests](../../tests/pages/markdown.test.tsx) and [fixture manifest](../../tests/fixtures/pages/manifest.json).
