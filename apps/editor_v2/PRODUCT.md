# Product scope

The GovBB editor is an internal web tool for the GovTech Barbados service team and ministry content authors. It supports long authoring sessions with keyboard access, contextual controls and the GovBB visual identity. Page and form editors can also be embedded in another host.

## Scope

Authors can write service pages, save or publish them to the content API, edit or download Markdown, and preview supported content. The workspace groups an entry page, an optional start page and supporting pages. Browser-only services, pages, forms and calculators are not workspace flows.

The editor opens on api_v2's Services list, with search, category/status filters, sorting and pagination. A title opens the service at its entry page; its path opens landing. The sidebar lists API pages beneath their parents and shows visibility. Pages toggles the sidebar, whose preference is remembered; narrow screens use a drawer. Create service creates a preview-only API entry page under a category. Add document creates a preview-only start or supporting page. Delete page removes the selected API page after its children are gone; it retains no browser draft.

The editor owns content authoring and conversion, including common page metadata. Saving a public page publishes its changes. Reusable form authoring remains available to embedding hosts, but has no replacement server integration in this workspace. Form-wide settings panels, form-check dashboards, submissions, scheduling and respondent execution remain outside scope.

## Page authoring

Pages support headings, paragraphs, inline formatting, links, hard breaks, blockquotes, separators, nested lists, tables, notices, details and action buttons. Authors arrange the body freely. The title is edited above the body and stored in YAML frontmatter. The introduction is edited directly beneath the title. A collapsed Page details section on the separator summarises current values and edits description, categories, subcategory, visibility, publication date and form ID. Category options come from the host. A page from the content API offers api_v2's categories: a service's entry page takes one category and an optional subcategory, and its sub-pages are filed with it. Embedded page editors can also retain imported categories, with the first primary. A page from the content API also shows its path, and the server's publication date read-only.

Page details and body share undo history. They reach the API only through explicit Save or Publish changes; typing and source Apply never save or publish. A successful save acknowledges only the submitted snapshot, leaving edits made during the request unsaved. When someone saves a newer version first, the author chooses whether to keep theirs, load the saved version or download theirs, rather than either being overwritten. History lists a page's saved versions, with who saved each and when, beside a preview of the one chosen; restoring one brings back its content as unsaved changes and keeps the page's path, category and visibility. The editor checks the content API for changes every 30 seconds and when its window regains focus, refreshing its lists and flagging an open page saved elsewhere. Optional fields stay absent until edited, and clearing one removes its key. Unfamiliar imported values are retained; specialist frontmatter remains editable in Markdown.

Visibility settings offer Public and Preview link only. Existing draft pages remain hidden until an author chooses one of these and saves; unrelated edits do not change their visibility. They remain listed and filterable as “Draft (hidden)”.

Original Markdown is retained exactly until a visual edit. Edits preserve unknown metadata, intentionally absent fields, content structure and destinations. Unsupported HTML and specialist content remain editable in source mode. Invalid YAML keeps the working source and last committed document intact.

Page-to-form associations are explicit. Import preserves `form_id` and button URLs; editing Form ID does not rewrite button destinations. The Details body component is a reader-operated disclosure.

## Reusable form authoring

These capabilities belong to the reusable editor and test-only hosts, not a production workspace route.

Forms support text, numbers, email, phone, dates, times, choices, boolean answers and file uploads, plus address lookup, opening hours and grouped checkbox categories. Validation, repetition, disabled fields and number/time increments are block settings. Visible Conditional logic blocks and calculated values support application and calculator definitions.

- Question wording and hints are edited on the canvas. Logic selectors use that wording; internal aliases are an advanced setting.
- Error messages are Default, worded from the question's current label (“Enter your National ID number”), until the author writes a Custom one; Reset to default goes back. Export fills in each default.
- A page's menu acts on the whole page, folded or not: Move up, Move down, Duplicate with its questions, Merge with previous page, and Delete, which names the questions that go and offers Undo. Page 1 stays first.
- Insertion menus offer complete questions. Beneath a label with no answer, they offer answer inputs to complete it. A question label can serve as the page heading on a page that asks one question.
- Conditional logic blocks own answer-dependent visibility, required state and wording. They can target questions, content and pages. Follow-up insertion creates these same rules; indentation controls layout.
- Selecting a new Show target also hides it initially, in one undo step. Existing visible targets can be hidden from the logic block. Hidden question parts without a Show rule have a Make visible action. Removing a rule preserves the target's visibility state, and recovery respects remaining rules.
- Confirmation pages confirm completion and explain what happens next. They retain their purpose during conversion. Calculator result pages have a separate role and remain editable.
- The Form registry supplies developer-defined questions, groups, pages and complete forms in native JSON. Insertions become independent editable copies. Embedding hosts can create independent complete forms; authors do not add registry definitions through the UI. “Team blocks” and “GovBB fields” remain search aliases.
- Duplicating a question gives it independent field and block identities while retaining its answer values. Copying an option into an existing question allocates a distinct submitted value.

## Drafts and conversion

Pages use Markdown with YAML frontmatter. Forms use native v2 JSON for exchange and versioned form Markdown for editable drafts. Installed modules own their fields, controls and conversion behavior.

Each open page has an in-memory working copy and undo history. Leaving unsaved work asks first; Cancel preserves it, while confirmed departure removes that copy and its undo session. Internal navigation and sign-out wait for pending saves. Unload warnings reduce accidental loss but cannot recover unsaved work after a crash or reload. Old browser drafts are abandoned without being read, updated or deleted.

Reusable JSON import validates and checks preservation before Apply. Failed imports retain the input in memory; stale asynchronous reads cannot replace newer edits. Invalid/unapplied source or read-only state blocks import/export. Replacement failure retains the prior and candidate inputs for in-session download, not durable recovery.

Incomplete form content remains editable and saveable; JSON export reports what needs repair. Legacy SSB export uses a separate compatibility adapter. Converter changes must preserve authored values, references, unknown data and recovery paths.

## Interface

Use GovBB tokens, Figtree and branding from `@govtech-bb/frontend`. Follow the [terminology guide](docs/TERMINOLOGY.md): sentence case, hints below labels, “(optional)” for optional questions, no required-field asterisks, and “Continue” between pages.

WCAG 2.2 AA is the accessibility target. Provide keyboard access, visible focus and meaning that does not depend on colour alone.

The app uses TanStack Start in SPA mode, React 19, Lexical 0.51, Base UI and Tailwind 4, with Phosphor icons. Development and builds run on Node 24 with pnpm. See [Development](docs/DEVELOPMENT.md) for checks and known issues.
