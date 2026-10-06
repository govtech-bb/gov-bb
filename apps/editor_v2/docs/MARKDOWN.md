# Page and form Markdown

Service pages and forms have separate Markdown contracts. The selected workspace document determines its codec; a page is not a form with its questions removed.

## Service pages

Page files use GovBB YAML frontmatter followed by freely authored Markdown. `title` supplies the title shown above the body, `description` remains descriptive metadata, `lede` is an optional visible introduction and `form_id` records an explicit form association. Other fields, their YAML values and intentionally absent fields are retained. Metadata remains available in the Markdown source and through the converters. New pages have a title and empty body.

The title is edited directly above the body. `lede` is edited directly beneath the title. The collapsed Page details section below it summarises current values and edits `description`, `category` / `categories`, `subcategory`, `visibility`, `publish_date` and `form_id`. Category options are a host-supplied stub, currently empty, with no taxonomy or backend connection; the row appears only when options or imported categories exist, and imported categories remain visible and preserved. Categories retain their order, with the first primary. Imported category representation is preserved until a category edit; editing stores one selection as `category`, several as ordered `categories`, and removes the alternate key.

Visibility offers Public, Preview link only and Draft link only. Public leaves `visibility` absent; an imported `visibility: public` is kept until changed. Publication date uses `YYYY-MM-DD`. Optional fields remain absent until edited; clearing removes their keys. Unfamiliar imported values, comments and unrelated frontmatter survive other field edits. Specialist frontmatter remains editable in Markdown. Metadata changes share body undo and local autosave, pause with unapplied source changes or draft recovery, and do not publish or schedule content. Editing `form_id` does not rewrite action destinations.

A margin insertion menu and slash commands add content; selection formatting and block menus expose relevant controls. The grip drags a whole body block, including the contents of a list, table or component. The block preview and insertion line show what moves and where it will land. A drop is one undo step; metadata stays fixed. Move up/down remain available in the block menu. The writing controls reuse the form builder's shared styling.

The writing editor supports headings 1–6, paragraphs, bold, italic, strikethrough, inline code, links, hard breaks, blockquotes, separators, nested lists, multiple blocks inside list items and GFM tables. Additional components use these conventions:

```md
:::notice
Bring proof of identity.
:::

:::details{summary="What you need"}
Bring your original documents.
:::

:::actions
::action[Continue]{href="/next"}
::action[Get help]{href="/help" variant="secondary"}
:::

<a data-start-link>Start now</a>
```

A Start marker can have an explicit `href`; without one it retains the page's form association. Import does not invent a destination or change the linked form. Action labels and destinations remain editable. Notice and Details bodies can contain supported Markdown blocks.

The original file is preserved exactly until a visual edit. Export after editing may normalize Markdown formatting while retaining text, grouping, metadata and URLs. Unsupported raw HTML, comments, specialist components, images, code blocks and other unsupported syntax open the whole page in source mode with an explanation. Source-only pages can be edited, saved and downloaded without a visual editor. Invalid YAML blocks Apply, retains the working text and leaves the last committed draft intact. Source-only pages have no rendered preview.

The checked-in [GovBB page fixtures](../tests/fixtures/pages/README.md) retain 16 frozen regression examples: three visual and 13 source-only pages, with their original hashes. Integration tests also read current GovBB Markdown directly from `apps/landing/src/content`. Visual support remains limited to the syntax described above.

## Form Markdown, version 2

### Storage and source editing

Markdown is the browser draft and the editable source. The original demo form uses `govbb-editor:draft:markdown:v2` for its text. Workspace documents have their own storage namespaces; see [Persistence and recovery](DEVELOPMENT.md#persistence-and-recovery).

The older `govbb-editor:draft:markdown:v1` and `govbb-editor:draft` records are retained for recovery when migrated. Unapplied source edits have a separate working buffer; they suspend canvas editing until Apply or Discard. An existing version 2 storage record takes precedence, including an empty or invalid record, so startup cannot silently replace it with an older form.

### Frontmatter

The reader accepts a bounded dialect rather than arbitrary Markdown or YAML. The [complete example](examples/demo-form.md) is the current converter output of the [native demo definition](../src/presets/form-registry/demo.ts), checked for exact equality and native round-trip preservation. It includes per-node native bindings as well as authored content; the native definition is the shorter starting point for understanding the form.

Current frontmatter requires `format: govbb-form`, `formatVersion: 2` and a string `title`; maps use two-space indentation and arrays/complex values use JSON. Version 1 documents are accepted and upgraded once. Every save includes `meta.visibility`. Unknown safe frontmatter keys are retained. Duplicate keys, unsupported YAML features, HTML, unknown directives, incompatible versions and malformed JSON prevent Apply while retaining the exact source bytes.

### Pages and questions

Pages start with `# Title`, separated by top-level `---`. `::description[Text]` is page metadata. A blank `#` retains an automatic page title. `::page{type="check-answers"}`, `::page{type="declaration"}`, `::page{type="confirmation"}` and `::page{type="result"}` describe the Check answers, Declaration, Confirmation and calculator Result pages. Confirmation and Result pages have editable headings. Without native bindings, Check answers and Declaration require their fixed headings. Native JSON calls the Check answers role `review`; both formats use `confirmation` and `result` for those roles. Unsupported page types and page settings are rejected, with the original source retained for recovery. Ordinary headings use `##` or `###`; an authored content h1 uses `::heading[Text]{level="1"}`.

Questions use `::text[Label]{#stable-key required}`, substituting the input kind as needed. Source anchors contain letters, numbers, underscores and hyphens and remain stable after label edits. The source anchor, native question ID and submitted answer key are separate identities. In native-bound drafts, `fieldId` carries the submitted answer key (`question.key`); in legacy drafts it pins the SSB field ID. Omitted brackets mean no label; empty brackets mean a blank label. `::hint[Text]` and `::error{rule="required" message="Text"}` follow their question. Choice questions consume their following list. In version 2, indentation under an option controls layout only; conditional display requires a logic block. Targeted or configured options use `- :option[Yes]{#yes optionValue="approved"}`.

`:::show-hide[Summary]` encloses blocks until its matching `:::`. Callouts use `::warning[Text]` and `::inset[Text]`. Lists elsewhere remain content. Legacy repetition uses `::repeat-page{min="1" max="5" instanceLabel="Item"}` for pages and question attributes `repeat`, `repeatMin` and `repeatMax` for answers. Current native-bound exports retain their `repeat` definitions in per-node native state; a missing `::repeat-page` directive does not mean repetition was lost. Explicit zero, false, blank and incomplete raw settings remain draft values.

### Text and formatting

Ordinary text supports links, italic, bold, strikethrough, inline code, hard breaks and escaped syntax. `::empty` retains an empty paragraph. `::paragraph[Text]` preserves significant leading whitespace, whitespace-only or multiline paragraphs. Mentions use `{{question-key}}` or `{{question-key|URI-encoded-fallback}}`. Unsupported native marks and nondefault text properties use `:span[Text]{data="JSON object encoded as an attribute string"}`; links with extra properties use `:link[Text]{url="..." props="JSON object encoded as an attribute string"}`. These are narrow formatting extensions, not HTML.

### Legacy presets

Historical Markdown presets such as `preset="country"` expand into editable copies. Current Form registry entries are declared in native JSON; this preset syntax remains a compatibility reader.

Both source versions use the immutable `src/forms/source/legacy/profiles-v1.json` settings and option lists, with copied field IDs, labels and exceptional option values in `src/forms/source/legacy/preset-defaults-v1.json`. The remaining option values use the frozen version 1 spelling algorithm. The installed component registry cannot change those defaults.

The retained `ref` identifies the definition the copy was based on; it does not synchronize the copy. `sourceFieldId`, `sourceLabel` and `sourceOptionValue` retain copied defaults. Edited labels can change automatic field IDs, and explicit `fieldId` or `optionValue` pins override them. Explicit overrides remain explicit, and removed inherited settings are recorded below.

### Logic, calculations and migration

Logic and calculations use `:::logic{#rule}` and `:::calculated-fields{#totals}`, each containing a fenced `json` object. Every raw row is retained, including unfinished conditions, actions and calculations. Saving does not execute a formula or require SSB compatibility. Missing references remain stored for repair; merely opening logic no longer substitutes a different target.

All answer-dependent display and wording live in visible logic blocks. In a current native-bound draft, the JSON fence wraps the native block in a `native` property. For example, the [current demo](examples/demo-form.md) uses this rule inside its `:::logic` fence:

```json
{
  "native": {
    "id": "closure-follow-up",
    "type": "logic",
    "rules": [
      {
        "id": "show-closure",
        "when": { "op": "selected", "question": "close-road", "option": "yes" },
        "actions": [
          { "type": "setVisible", "targets": ["closure-duration", "closure-warning"], "value": true }
        ]
      }
    ]
  }
}
```

References inside that payload use native IDs, which can differ from Markdown anchors. Structured expressions and node bindings follow [the native converter contract](CONVERTERS.md).

Retained legacy payloads instead use `SHOW_BLOCKS` to name targets in `showBlocks`; `CHANGE_LABEL` uses `changeLabel: { "target": "question-key", "text": "Replacement label" }`; `CHANGE_PAGE_TITLE` uses `changePageTitle` with the same shape and a page key as its target. Legacy choice conditions ordinarily refer to option keys. A migrated legacy condition can carry `valueIsLiteral: true` to retain a submitted value without treating it as an option reference.

Opening version 1 Markdown or legacy editor JSON converts option follow-ups and legacy `conditionalLabel` / `conditionalTitle` settings into explicit logic blocks. Follow-up targets keep their layout and start hidden. The saved version 2 document records that migration has happened: deleting a generated rule does not regenerate it on reload. Legacy conditional settings inside a version 2 document are rejected visibly rather than ignored. Unsupported legacy metadata also prevents migration; the original document remains available for recovery. The internal logic-version marker comes from `formatVersion`, not from authored node settings.

### Retained node state

The optional final `:::source-state` container has one fenced JSON object with these scopes:

- `form`: additional raw form settings.
- `pages`: maps a page key (or `page-1`, `page-2`, …) to optional `settings`, `start`, `title` and `description` node state.
- `questions`: maps the stable question key to optional `settings`, `removeSettings` (inherited property names), `explicit` (explicit override names), `identity` (retained internal question key), `label` and `answer` node state.
- `nodes`: maps a block/option anchor or a semantic path to node state. Paths include `question:hint-1`, `question:option-1`, and `page-1/2` for a page's second semantic block. Follow-up paths continue from their owning option.

Node state contains only optional `settings`, supported element `properties`, additional raw `state`, and retained `identity`. It contains no body text, selection, DOM or second Lexical document. Use `::block{#anchor}` before a targeted content block. Question labels and answers use the implicit targets `question:label` and `question:answer`. Unknown state with opaque identity dependencies conservatively retains original identities; unsupported hydration fails visibly instead of discarding it.

### Apply, save and recovery

Apply first parses and hydrates an isolated document and compares authoring meaning. Migration follows that validation and is idempotent. A failed Apply leaves both canvas and committed source intact.

Autosave validates generated source before writing; **Saved** appears only after storage succeeds. Storage failures retain unsaved changes for retry.

Unapplied source survives migration byte for byte, including an empty working buffer. Conflicting browser-tab writes pause saving until a version is selected. The source dialog can copy or download even invalid edits, open `.md` files, restore its committed text and recover conflicting browser-tab writes. Source Apply uses a separate undo step.
