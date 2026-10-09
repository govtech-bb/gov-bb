# Product scope

The GovBB editor is an internal web tool for the GovTech Barbados service team and ministry content authors. It supports long authoring sessions with keyboard access, contextual controls and the GovBB visual identity. Page and form editors can also be embedded in another host.

## Scope

Authors can write service pages, build application forms and calculators, save local drafts, save pages to the content API, import and export files, and preview supported page content. The workspace groups an entry page, an optional start page, supporting pages and at most one form or calculator per service. Content-only services are supported.

The Services list shows api_v2's services, most recently changed first, with search, category and status filters, sorting and pagination. A title opens the service in the editor at its entry page; its path opens the page on landing. Create service files a new service in the content API as a draft entry page under a category, and Add document adds its start page or supporting pages there. Delete page removes the selected page, and its draft, from the API once its own sub-pages are gone. Services drafted in this browser are listed separately beneath it, with Create browser draft for a service that needs a form.

The editor owns content authoring and conversion, including common page metadata. Pages from the content API are saved back to it, and saving a public page publishes the change. Forms stay in the browser. Form-wide settings panels, form-check dashboards, submissions, scheduling and respondent execution are outside its scope. Hosts choose an editor preset and supply persistence.

## Page authoring

Pages support headings, paragraphs, inline formatting, links, hard breaks, blockquotes, separators, nested lists, tables, notices, details and action buttons. Authors arrange the body freely. The title is edited above the body; a browser draft stores it in YAML frontmatter, and a page from the content API keeps it, like all its details, as the API's fields. The introduction is edited directly beneath the title. A collapsed Page details section on the separator summarises current values and edits description, categories, subcategory, visibility, publication date and form ID. Category options come from the host. A page from the content API offers api_v2's categories: a service's entry page takes one category and an optional subcategory, and its sub-pages are filed with it. For browser drafts the row appears only for imported categories, which remain visible and preserved, with the first primary. A page from the content API also shows its path, and the server's publication date read-only.

In a browser draft, page details use the same local autosave and undo history as the body. A page from the content API autosaves its details and body, once editing pauses, as its draft in the content API, which every editor shares; each field keeps its own undo, and the page's undo covers the body. In a browser draft, visibility and publication date are stored metadata; changing them does not publish or schedule a page. A page from the content API, and what the site serves, change only when the author chooses Save, or Publish changes for a page that will be public, which also clears its draft; Discard changes deletes the draft and returns to what was published. A published page keeps its path. When someone else publishes a newer version or saves over the author's draft, the editor saves nothing more until the author chooses whether to keep theirs, load the saved version or download theirs, so neither is overwritten. History lists a page's saved versions, with who saved each and when, beside a preview of the one chosen; restoring one brings back its content as unsaved changes and keeps the page's path, category and visibility. The editor checks the content API for changes every 30 seconds and when its window regains focus, refreshing its lists and flagging an open page saved elsewhere. Optional fields stay absent until edited, and clearing one removes its key. Unfamiliar imported values are retained; in a browser draft, specialist frontmatter remains editable in Markdown, and a page from the content API keeps the frontmatter fields it does not show as they are.

Original Markdown is retained exactly until a visual edit; a page from the content API whose body is unchanged saves its body exactly as the API sent it. Edits preserve unknown metadata, intentionally absent fields, content structure and destinations. Unsupported HTML and specialist content remain editable in source mode. Invalid YAML keeps the working source and last committed document intact.

Page-to-form associations are explicit. Import preserves `form_id` and button URLs; editing Form ID does not rewrite button destinations. The Details body component is a reader-operated disclosure.

## Form authoring

Forms support text, numbers, email, phone, dates, times, choices, boolean answers and file uploads, plus address lookup, opening hours and grouped checkbox categories. Validation, repetition, disabled fields and number/time increments are block settings. Visible Conditional logic blocks and calculated values support application and calculator definitions.

- Question wording and hints are edited on the canvas. Logic selectors use that wording; internal aliases are an advanced setting.
- Insertion menus offer complete questions. Beneath a label with no answer, they offer answer inputs to complete it. A question label can serve as the page heading on a [single-question page](https://design-system.service.gov.uk/patterns/question-pages/).
- Conditional logic blocks own answer-dependent visibility, required state and wording. They can target questions, content and pages. Follow-up insertion creates these same rules; indentation controls layout.
- Selecting a new Show target also hides it initially, in one undo step. Existing visible targets can be hidden from the logic block. Hidden question parts without a Show rule have a Make visible action. Removing a rule preserves the target's visibility state, and recovery respects remaining rules.
- [Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/) confirm completion and explain what happens next. They retain their purpose during conversion. Calculator result pages have a separate role and remain editable.
- The Form registry supplies developer-defined questions, groups, pages and complete forms in native JSON. Insertions become independent editable copies. Complete forms create separate documents; authors do not add registry definitions through the UI. “Team blocks” and “GovBB fields” remain search aliases.
- Duplicating a question gives it independent field and block identities while retaining its answer values. Copying an option into an existing question allocates a distinct submitted value.

## Drafts and conversion

Browser-drafted pages use Markdown with YAML frontmatter. A page from the content API is its Markdown body, and its Markdown view shows only that body. Forms use native v2 JSON for exchange and versioned form Markdown for editable drafts. Installed modules own their fields, controls and conversion behavior.

Each document has its own local draft and undo history. Unapplied Markdown survives navigation. Failed saves and unresolved conflicts must be addressed before leaving a document. Existing saved forms can be attached without rewriting their source.

JSON import validates the candidate and checks preservation before Apply. Failed imports retain the input; replacement recovery retains the previous draft and candidate. Unapplied Markdown and conflicting tabs must be resolved before import or export.

Incomplete form content remains editable and saveable; JSON export reports what needs repair. Legacy SSB export uses a separate compatibility adapter. Converter changes must preserve authored values, references, unknown data and recovery paths.

## Interface

Use [GOV.UK form patterns](https://design-system.service.gov.uk/patterns/) with GovBB tokens, Figtree and branding from `@govtech-bb/frontend`. Follow the [terminology guide](docs/TERMINOLOGY.md): sentence case, hints below labels, “(optional)” for optional questions, no required-field asterisks, and “Continue” between pages.

WCAG 2.2 AA is the accessibility target. Provide keyboard access, visible focus and meaning that does not depend on colour alone.

The app uses TanStack Start in SPA mode, React 19, Lexical 0.51, Base UI and Tailwind 4, with Phosphor icons. Development and builds run on Node 24 with pnpm. See [Development](docs/DEVELOPMENT.md) for checks and known issues.
