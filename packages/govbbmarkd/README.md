# govbbmarkd

GovBB's Markdown dialect. The package owns parsing, component validation,
serialization, HTML-tree compilation, document structure and URL policy.
It does not load content, query databases or resolve forms.

## Entry points

| Import                               | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `@govtech-bb/govbbmarkd`             | Parsing, validation, compilation, readable text and document outlines |
| `@govtech-bb/govbbmarkd/react`       | Optional GovBB design-system rendering                                |
| `@govtech-bb/govbbmarkd/content-url` | URL policy without loading the Markdown processor                     |
| `@govtech-bb/govbbmarkd/legacy`      | Deprecated compatibility parsers, serializers and section splitting   |

The main, URL and legacy entry points do not load React. The React renderer
requires the optional peers `react` and `@govtech-bb/react@1.0.0-alpha.29`.
Use one React instance per application; the editor's Vite configuration
deduplicates React and the design-system package.

## Parse, validate and compile

```ts
import {
  parseContentMarkdown,
  stringifyContentMarkdown,
  compileContentMarkdown,
} from "@govtech-bb/govbbmarkd";

const source = ':::action{target="form"}\nStart now\n:::\n';
const parsed = parseContentMarkdown(source);

if (parsed.errors.length === 0) {
  const canonical = stringifyContentMarkdown(parsed.root);
}

const compiled = compileContentMarkdown(source);
if (compiled.ok) {
  const { hast, outline, sections, text } = compiled.value;
} else {
  const diagnostics = compiled.errors;
}
```

Parsing retains the MDAST tree even for invalid content. Compilation returns
either a validated HAST tree with its document structure or located diagnostics.
Neither operation changes the supplied source. Hosts decide whether to keep an
incomplete draft or reject publication.

Full documents accept YAML frontmatter by default. Pass `{ frontmatter: false }`
to parsing, compilation and analysis when metadata is stored separately from the
body, as in the API and landing adapters. Otherwise leading `---` rules can be
mistaken for a metadata block and hide body text.

Raw HTML is **escaped by default**. Existing trusted pages can explicitly use
`compileContentMarkdown(source, { html: "legacy" })`. That deprecated option
preserves HTML and attributes; it is **not an HTML sanitizer**. Do not enable it
for untrusted input. Forms are outside this integration and retain their existing
React Markdown renderer and URL policy.

## Document text and headings

```ts
import { analyzeContentMarkdown } from "@govtech-bb/govbbmarkd";

const document = analyzeContentMarkdown(
  '## Apply\n\n:::action{form="birth-certificate"}\nApply now\n:::',
);
// document.text === "Apply Apply now"
// document.outline === [{ id: "apply", depth: 2, text: "Apply" }]
// document.sections[0].text === "Apply now"
```

Analysis uses the same compiled heading ids and component labels as rendering.
It reads legacy HTML as text without executing it or exposing a render tree.
Incomplete drafts return diagnostics alongside their readable text; analysis is
not publication validation.

Text includes disclosure summaries, table captions, summary keys, link labels
and footnote bodies. It excludes directive attributes, frontmatter, code blocks,
image URLs, scripts, styles and generated permalink/footnote controls.
Whitespace collapses to single spaces. Sections follow headings in document
order, with a null heading for any preamble. Applications own chunk identities,
ranking, indexing jobs and embeddings.

## React rendering

`renderMarkdownNodes(hast.children, components?)` renders the validated tree
with `ButtonGroup`, `LinkButton`, `ShowHide`, `SummaryList` and table components.
Host overrides apply recursively, including links inside tables and summary
values. The host supplies routing, form availability, analytics and any retained
application-specific HTML components. Without a host adapter, unresolved form
actions have no destination and are marked disabled.

Existing editor modules can retain their deprecated `PageHandler.render` and
recursive `PageConversion.render` callbacks. The compatibility adapter keeps those
overrides inside shared components without mutating the parsed tree. New hosts
should use HAST component overrides instead of adding MDAST renderers.

Load `@govtech-bb/frontend/css` and wrap the body in `.govbb-prose`.
Retained notices and uncaptioned tables also use Tailwind utilities: include this
package's source in Tailwind's `@source` scan and use the frontend Tailwind theme.
The editor scopes the design-system CSS to its preview and supplies the needed
spacing tokens.

## Compatibility and indexing

Legacy exports carry `@deprecated` JSDoc with the replacement or migration
constraint. The content package retains its old authoring exports, but visual
editability decisions remain host-owned.

Landing rebuilds its in-memory search index from readable text. API saves use
the same section extraction. Existing stored API chunks need an explicit rebuild:

```sh
pnpm --filter @govtech-bb/api-v2 reindex-search          # check counts only
pnpm --filter @govtech-bb/api-v2 reindex-search --apply  # replace search chunks
```

In the deployed API image, use `node dist/src/reindex-search.js [--apply]`.
Run against a migrated database during a quiet period: the rebuild holds the
content advisory lock. It changes search rows, not page bytes, timestamps,
visibility or audit history. Check mode writes nothing; apply is atomic.

Chat still uses `splitLegacyMarkdownSections` so this extraction does not change
stored chunk ids, text or embedding hashes. Moving chat to AST sections requires
a planned full reindex and review of its ingestion dry-run. It is not an automatic
side effect of importing the package.

## Relationship to Govspeak

This is inspired by [Govspeak](https://github.com/alphagov/govspeak#extensions),
not a Govspeak-compatible parser. The vocabulary is actions, details, captioned
tables and summary lists, plus existing notices. Attachments, figures, managed
page references and other Govspeak extensions are not added by this extraction.

See [the dialect guide](../../docs/content-markdown.md) for syntax and editing rules.

## Verify

```sh
pnpm exec nx run govbbmarkd:typecheck
pnpm exec nx run govbbmarkd:test
pnpm exec nx run govbbmarkd:build
pnpm exec nx run govbbmarkd:lint
```
