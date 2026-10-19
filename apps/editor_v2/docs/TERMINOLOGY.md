# Editor terminology

## Product terms

Use these terms in the form builder and its documentation. They guide wording and form structure; the product uses the GovBB visual identity. The editor does not yet provide a respondent service.

| Term | Meaning |
| --- | --- |
| Service name | The name of the service, separate from the current page's heading. |
| Page heading | The heading for the current page. On a page asking one question, its label or legend can also be the heading. |
| Question label | The wording associated with an answer input. For a group of related controls, such as radios, the shared question is a **legend**. The builder uses Question label as its authoring term. |
| Hint text | Brief help needed to answer a question. Longer explanations belong in content blocks. |
| Check answers | A page for reviewing and changing answers before submission. |
| Confirmation page | Confirms that the transaction is complete and explains what happens next. Its heading should describe the outcome, such as “Application submitted”. |
| Title (Mr, Ms, Dr) | A person's title, separate from a question label or page heading. Ask for it only when the service needs it. |

Use these component names in insertion menus: Text input, Textarea, Radios, Checkboxes, Select, Date input and Details. Radios select one option; checkboxes allow multiple options. Use Email address for an email question, Back for previous-page navigation and Continue between question pages. Authored custom navigation labels are preserved.

**Conditional logic**, **Form registry**, **Grouped checkboxes** and **Result page** are product terms. Conditional logic owns answer-dependent actions; registry entries create independent editable copies; Grouped checkboxes groups related options into categories; a Result page presents a calculator outcome.

Use sentence case. Mark optional questions with “(optional)” and leave required questions unmarked. Keep labels visible; editor placeholders do not replace respondent labels.

Use `type="confirmation"` in Markdown, `role: "confirmation"` in native JSON and `confirmation` for the editor setting. Unsupported page encodings are rejected with the original input retained in memory for download.

## Code names and ownership

- `pages` owns authored service content; `forms/features/pages` owns pages within a form; `routes` owns application URLs. Keep the existing editor, form, workspace, API, host, persistence, preset and UI boundaries.
- `workspace` groups API services and in-memory page sessions; a service is an API entry page and its descendants. There is no browser-local service branch.
- `api` owns transport/HTTP contracts. `host` means application binding, not HTTP hosting. A server-page baseline is an in-memory API copy for dirty comparison and versioned saves, not server-executed code.
- Use kebab-case filenames, PascalCase components/types, camelCase functions, and `use-…` hook filenames. Prefer domain plus responsibility, such as `page-history-dialog.tsx`, `FormJsonDialog`, and `savePageDraft`. Keep framework names (`__root`, `_workspace`, route parameters, generated files) and the app identifiers unchanged.
- Converters name their source and destination: `lexicalToFormMarkdown` is distinct from `lexicalToPageMarkdown`. Native form JSON is the custom `FormDefinitionV2` contract, not the JSON Schema standard. Keep `native`, `legacy`, and version qualifiers where they identify supported formats.
- Keep established primitives and module vocabulary (`Button`, `cn`, `DraftStore`, `EditorModule`, Lexical `$create…` helpers), thin entry-point barrels, and meaningful feature folders. Do not mass-prefix feature role files or move tests just for uniformity.

Renaming code never renames stored keys, serialized fields, module/action IDs, API payloads, or public URLs. Keep `apps/editor_v2`, Nx `editor_v2`, `dev:editor_v2`, and package `@govtech-bb/editor-v2`.
