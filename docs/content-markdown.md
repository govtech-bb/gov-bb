# govbbmarkd: GovBB content Markdown

Use ordinary Markdown for prose, headings, links, lists, quotations, images and code. Page metadata supplies the page title; normally start body headings at level 2.

Content components use named colon fences. Close every component. When nesting components, use a longer fence for the outer block.

| Component      | Rendering                                                         |
| -------------- | ----------------------------------------------------------------- |
| `actions`      | `ButtonGroup`                                                     |
| `action`       | `LinkButton`, or the existing form-start adapter for form targets |
| `details`      | `ShowHide`                                                        |
| `table`        | `Table`, `TableHeader`, `TableCell`                               |
| `summary-list` | `SummaryList`                                                     |
| `summary-item` | A summary row: label is the key, body is the value                |

These mappings use `@govtech-bb/react@1.0.0-alpha.29`. Accordion authoring is not enabled: that package does not export the documented accordion components. There are no `start`, `service-list`, `service` or `faq` directives. Service listings belong to the application, not the page body.

## Actions

```md
::::actions
:::action{href="/apply"}
Apply now
:::

:::action{href="/guidance" variant="secondary"}
Read guidance
:::
::::
```

An action can also stand alone. Its body is one inline label: text, emphasis, strong text, deleted text, inline code or line breaks. Links, images, HTML and block content are not allowed inside the label.

`primary` is the default variant; `secondary` is the other supported variant. A group contains only actions and has at most one primary action.

Choose exactly one destination:

| Attribute                  | Destination                                     |
| -------------------------- | ----------------------------------------------- |
| `href="/apply"`            | A URL accepted by the shared content URL policy |
| `target="form"`            | The page's linked form                          |
| `form="birth-certificate"` | A registered form identified by that ID         |

```md
:::action{target="form"}
Start now
:::
```

Form identifiers start with an ASCII letter or number and contain only letters, numbers, `_` and `-`. The public renderer resolves form destinations and keeps the existing form availability checks, start-link visibility rules and analytics. An explicit form ID is not replaced by the page's linked form. The words “Start now” have no special behaviour.

## Details

```md
:::details[Accepted identification]
Bring a passport or national identity card.
:::
```

The summary is plain text. The body accepts Markdown. Details must not contain another details component. Use this for supporting information, not required instructions or the main action.

## Tables

```md
:::table[Application fees]{row-headers="first" numeric-columns="2"}
| Service | Fee (BBD) |
| --- | ---: |
| Certificate | 50 |
| Replacement | 25 |
:::
```

A table component requires a plain-text caption and exactly one GFM table. Every row must have the same number of cells.

- `row-headers="first"` makes the first cell of each body row a row header. Omit it, or use `none`, for ordinary cells.
- `numeric-columns="2,3"` identifies numeric columns, counting from 1. Each number must identify an existing column and must appear only once.

Column headers use `scope="col"`; row headers use `scope="row"`. The design-system table provides a keyboard-focusable scroll region labelled by the caption. Ordinary, uncaptioned Markdown tables retain their existing rendering for compatibility.

## Summary lists

```md
::::summary-list
:::summary-item[Fee]
BBD **50**
:::

:::summary-item[Documents]

- Identification
- Proof of address
  :::
  ::::
```

A summary list contains only summary items. Each item needs a plain-text key and belongs directly inside a summary list. Values accept Markdown. This is for authored facts; application-generated check-your-answers data remains application-owned.

## Validation and editing

Unknown components, unsupported attributes, unsafe action URLs, invalid nesting and unclosed fences produce diagnostics with a code, line and column. Attributes are not arbitrary React props: authors cannot set classes, styles or event handlers through these directives.

The visual editor keeps the original Markdown bytes until a visual edit. After an edit it writes fenced action bodies and bracketed component labels. It can round-trip all the components above. Block settings edit action destinations, variants, disclosure summaries, table captions and summary keys. Set table header/numeric-column attributes in Markdown source.

Invalid or unsupported content stays in source mode without being discarded. Drafts can store incomplete source. The API rejects invalid public and preview writes with a `422` error on `body_markdown`, including the source location, without updating the stored page.

## Existing content

- Leaf actions such as `::action[Continue]{href="/next"}` remain readable.
- `:::details{summary="Help"}` remains readable. Do not combine it with a bracketed summary.
- Existing `<a data-start-link>` markers retain their resolution, availability and analytics behaviour.
- Existing `notice` blocks retain the local notice renderer. They are not mapped to `StatusBanner`.
- Legacy HTML, contact tiles, highlights and muted text are not migrated or deleted. Unsupported visual-editor source remains available for source editing.

`compileContentMarkdown` escapes raw HTML by default. Landing explicitly selects the deprecated `{ html: "legacy" }` policy for existing trusted pages. The visual editor uses that policy only after its supported-node checks pass. Forms are outside this integration and retain their existing React Markdown renderer and URL policy.

This dialect validator is **not an HTML sanitizer**. Legacy mode retains HTML attributes as well as elements; it does not make arbitrary untrusted HTML safe to publish.

## Compiler ownership

`@govtech-bb/govbbmarkd` is the browser-safe compiler package in `packages/govbbmarkd`. It extends the existing Remark parser rather than introducing another Markdown grammar. It is shared by the editor, API and public renderer; it does not import content files or application services.

`parseContentMarkdown` returns the MDAST tree and located diagnostics, retaining the tree even when content is invalid. `parsePageComponent` returns a typed result with a discriminated component and destination type, or a `PageMarkdownError`. `stringifyContentMarkdown` handles Markdown escaping and nested fences. Full editor documents accept YAML frontmatter; API and landing bodies pass `{ frontmatter: false }` to parsing, compilation and analysis because their metadata is already separate. Leading body rules must not become a second metadata block.

`compileContentMarkdown` returns a tagged result containing the HAST tree, readable text, heading outline and sections, or located diagnostics. `analyzeContentMarkdown` returns text and structure even for incomplete drafts, with their diagnostics, but no render tree. Heading ids come from the compiled tree, including duplicate-heading suffixes. Generated permalink and footnote controls are excluded from readable text.

The optional `@govtech-bb/govbbmarkd/react` entry point owns common design-system rendering. The editor and landing share it; host overrides retain routing, form availability and analytics. Overrides also apply inside summary values and tables. Existing editor `PageHandler.render` callbacks retain their recursive conversion context through a deprecated compatibility adapter. The main package does not load React.

MDAST and HAST are intentional low-level compiler interfaces. Hosts own conversion to editor nodes and publication policy. The Lexical and landing adapters translate diagnostics into their established source-mode/rejection contracts; the API returns its typed `PageRejected` result. No page-storage migration is part of this change.

The content package re-exports legacy authoring helpers from `@govtech-bb/govbbmarkd/legacy` and the URL helper from `@govtech-bb/govbbmarkd/content-url`. Compatibility APIs carry `@deprecated` JSDoc. Legacy editor capability checks stay in the host rather than becoming language validation. The language package does not depend on the content package.

Landing search and API search rows now use AST-derived text. Existing API rows need the explicit `reindex-search` check/apply command documented in the [package README](../packages/govbbmarkd/README.md#compatibility-and-indexing). No reindex runs at startup. Chat keeps its deprecated section-splitting contract so chunk ids and embedding hashes do not change during extraction.

The API adds a TypeScript project reference to govbbmarkd without changing its existing compiler flags. Enabling `exactOptionalPropertyTypes` currently fails in older code, including `src/import-estate.ts` and the auth/route tests. That compiler-option migration is separate from the Markdown contract.
