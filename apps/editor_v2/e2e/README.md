# Behavioural test suite — and the UI contract it pins

These specs were written **before** the editor and the site, from the
acceptance criteria in §10 of the block editor build brief. They are the
specification. The editor and `landing_v2` are built to the selectors named
here, not the other way round.

If a selector below turns out to be the wrong shape, change it here first and
say why — that is a finding about the design. Quietly rewriting a spec to
match whatever the code happens to render turns the suite into a description
of the implementation, which is worth nothing.

The editing surface is **BlockNote**. Autosave writes a draft to
`localStorage`; **Save** (the button, or Ctrl/Cmd+S) is what reaches Postgres — see [ADR 0074](../../../docs/decisions/0074-the-block-editor-spike-edits-on-blocknote-over-a-canonical-json-body.md).

## Running it

```bash
pnpm exec nx run editor-v2:e2e          # or, from apps/editor_v2:
pnpm exec playwright test
pnpm exec playwright test finder-config # one file
pnpm exec playwright test --ui          # watch it drive the editor
```

Playwright boots the Vite dev server itself on port **3092** (`webServer` in
`playwright.config.ts`), so nothing needs to be running first. 3092 is
deliberately not 3000/3001 so a hand-run `pnpm dev` does not collide.

## Why these are E2E and not unit tests

Almost every acceptance criterion in the brief is a statement about
behaviour across the whole stack: _"adding a facet to the pharmacy finder
through the editor changes the preview's filter sidebar with no code
change"_, _"editing in one tab updates the site in another, with no rebuild
and no reload"_.

The things carrying the spike's risk have no honest unit-test surface:

- **PGlite** is a real Postgres compiled to WASM. Mocking it would test the
  mock. Running it in Node would skip IndexedDB, which is where the
  persistence questions actually live.
- **The multi-tab worker** only means anything with more than one tab.
  `live-update.spec.ts` opens two pages in one browser context for exactly
  this reason — a second _context_ is a different storage partition and the
  test would prove nothing.
- **BlockNote is a contenteditable**, not a set of form fields. Whether a
  paste, a triple-click retype or a drag preserves a block id is a question
  about ProseMirror's actual behaviour in a real browser. A jsdom test would
  answer confidently and wrongly.
- **"One block document model holds prose, configuration and
  collection-backed data"** is a claim about what an author can do, end to
  end. A unit test on the reducer cannot fail in the way that matters.

Unit tests still earn their place where the logic is pure and the stakes are
high — `packages/block-kit` pins the Gregorian Easter arithmetic against the
original `bank-holidays.ts` generator for all 31 years in range. That belongs
in a unit test. Nothing else here does.

## Selector policy

Deliberately split, and the split is the point.

**The site is queried by accessible role and name only.** Those pages are
citizen-facing, so every selector doubles as an assertion that the block
renderer emits a navigable accessible tree. A site behaviour that can only
be tested with a test id is telling you the markup is wrong — fix the markup.

**The editor is queried by test id**, with one exception: blocks themselves
are addressed by the `data-id` BlockNote puts on every block node, which the
adapter seeds from our own block ids. So `[data-id="b_sv04"]` resolving at
all is the same assertion as _"ids survive the round trip"_, and it stops
resolving the moment something renumbers.

## Accessibility is part of the contract, not a later pass

A Notion-like editor is where keyboard and screen-reader users usually get
abandoned: reorder becomes drag-only and the slash menu becomes a div that
only responds to a mouse. This is a government service under the Barbados
Service Standards, so the suite pins the accessible path as the primary one:

- **Reorder is tested by keyboard** (`ControlOrMeta+Shift+Arrow`). Dragging
  the handle is covered once, as the secondary affordance.
- **The slash menu must be a real `listbox`** with an `aria-label`, roving
  selection via `ArrowDown`, and `Enter` to choose. There is a test for each.

## The contract

### Boot

| Handle     | Meaning                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `db-ready` | Attached once the migration and seed have finished. Every helper waits on it, so a database that fails to come up fails in one obvious place. |

### Editor shell

| Handle                                             | Meaning                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doc-list`                                         | Container of document links. Each document is a `link` whose accessible name is its title.                                                                                                  |
| `editor-surface`                                   | The BlockNote contenteditable holding the whole document.                                                                                                                                   |
| `[data-id="<blockId>"]`                            | One block. Not a test id — BlockNote's own attribute, seeded from our block id. Receives focus from an error link.                                                                          |
| `[data-block-type="<type>"]`                       | One block addressed by type, for asserting a type is present without knowing its id.                                                                                                        |
| `document-title`                                   | Editable envelope title.                                                                                                                                                                    |
| `doc-json-toggle`                                  | **View schema**. Opens a modal holding the stored body, read-only.                                                                                                                          |
| `modal` / `modal-close` / `copy-json` / `doc-json` | The dialog: `role="dialog"`, `aria-modal`, labelled, Escape closes, and a Copy button that only says "Copied" when the clipboard actually took it.                                          |
| `save-status`                                      | `Saved` only when it is in Postgres; `Unsaved changes · draft kept in this browser` once autosave has cached it; `Unsaved changes` before that; `Saving…` in flight.                        |
| `save`                                             | Publishes to Postgres. Disabled when there is nothing to save.                                                                                                                              |
| `draft-notice` / `discard-draft`                   | Shown when a cached draft was restored on open, with the way back to the stored version.                                                                                                    |
| `error-summary`                                    | Present only when a save was rejected. A rejected save must leave the status dirty.                                                                                                         |
| `error-link-<blockId>`                             | Summary entry that moves focus to its block.                                                                                                                                                |
| `block-error-<blockId>`                            | Inline error against a config block.                                                                                                                                                        |
| `conflict-notice`                                  | Shown when a save was refused because `updated_at` was stale.                                                                                                                               |
| `reset-data`                                       | Drop, migrate, reseed.                                                                                                                                                                      |
| `slash-menu`                                       | The closed palette. `role="listbox"`, `aria-label` matching /insert/i, exactly nine `option`s, keyboard navigable.                                                                          |
| `slash-item-<type>`                                | One palette entry.                                                                                                                                                                          |
| `block-controls-<blockId>`                         | The control strip in the hovered block's right margin. Actions used to live inside the drag handle's menu, which meant two clicks and a guess — the handle gives no hint it holds anything. |
| `block-edit-<blockId>`                             | **Edit** on a block that has settings. Opens the settings popover.                                                                                                                          |
| `block-edit-data-<blockId>`                        | **Edit** on a data-backed block — opens that collection's records over the page that reads them. The common task comes first.                                                               |
| `block-settings-<blockId>`                         | The **cog**, on a data-backed block only: filtering options and column headings.                                                                                                            |
| `block-delete-<blockId>`                           | Delete.                                                                                                                                                                                     |
| `block-popover` / `block-popover-close`            | The settings dialog: `role="dialog"`, labelled `Edit <Type> block`, closed by Escape, by clicking outside, or by its Done button.                                                           |

**Autosave never writes to the database.** It caches a draft under
`spike:draft:<documentId>` in `localStorage`, which protects an author
against a closed tab without making every keystroke a publication. Only
**Save** — the button or `Ctrl/Cmd+S` — writes the row the site serves, and
`Ctrl/Cmd+S` must `preventDefault` so the browser's own Save dialog never
opens.

"Saved" therefore means one thing: it is in Postgres. A cached draft still
reads as unsaved, because the site is not serving it.

**Everything about a block that is not its text is in the popover**, reached
through Edit in the block's own menu — a heading's anchor and level, a
notice's variant, and every configuration block's entire contents. Moving
prose into the document took the old per-block forms with it; this is where
they come back, behind one consistent route rather than a bespoke affordance
per block type.

### Finder configuration

| Handle                                                                                                         | Meaning                                             |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `finder-collection`                                                                                            | The collection key. Validation rule 5.              |
| `results-per-page`                                                                                             | Page size.                                          |
| `empty-message`                                                                                                | Empty-state copy.                                   |
| `result-metadata`                                                                                              | Comma-separated metadata fields. Validation rule 7. |
| `add-facet` → `facet-key-new`, `facet-name-new`, `facet-type-new`, `facet-computed-from-new` → `confirm-facet` | Adding a facet.                                     |
| `facet-name-<key>`                                                                                             | Rename an existing facet.                           |
| `remove-facet-<key>`                                                                                           | Remove a facet.                                     |

`facet-computed-from-new` accepts a comma-separated list, because
`subsidisedOnly` and `slip` in the production finder are predicates over
`type` **and** `pppStatus`. The brief's single-field `computed_from` cannot
express the real page.

### Calendar configuration

| Handle                                                                                                                              | Meaning                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `substitution-rule`                                                                                                                 | `none` \| `next-working-day` \| `cap-352`. |
| `year-range-min` / `year-range-max`                                                                                                 | Bounds the year picker on the site.        |
| `add-rule` → `rule-key-new`, `rule-name-new`, `rule-kind-new`, `rule-month-new`, `rule-day-new`, `rule-offset-new` → `confirm-rule` | Adding a holiday rule.                     |
| `rule-name-<key>` / `remove-rule-<key>`                                                                                             | Edit or remove a rule.                     |

Holiday rules are editable even though §11 lists "editing collection
records" as out of scope — §3.7 is explicit that _"bank holiday rules are
editable rows"_, and §10 requires adding one to show up in the calendar. The
two statements conflict; the resolution taken here is that
**`bank-holiday-rules` records are editable and pharmacy records are not**,
which is what makes the data/code seam testable at all.

### Navigation and collections

The editor's front door is a hierarchy, not a flat list: category → service
→ page → editor. `doc-list` is gone with the flat list it named.

| Handle                                     | Meaning                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `service-list`                             | Services grouped under their category titles, with a page count each. A page with no category files under "Island-wide (no category)" rather than an invented one. |
| `service-<slug>`                           | A service. Opens its items.                                                                                                                                        |
| `service-items`                            | One service's pages, with a Kind column distinguishing a start page from a form — the reason to group them at all.                                                 |
| `item-<documentId>`                        | One page. Opens the editor.                                                                                                                                        |
| `collection-list` / `collection-<key>`     | The collections behind finders, calendars and tables.                                                                                                              |
| `record-table`                             | One collection's records.                                                                                                                                          |
| `record-<recordKey>`                       | One record row.                                                                                                                                                    |
| `field-<recordKey>-<fieldKey>`             | One editable cell. Commits on blur. Editing the collection's `record_key` field renames the row.                                                                   |
| `add-record` / `remove-record-<recordKey>` | Add and remove.                                                                                                                                                    |

Fields come from the collection's own `schema`, the same list validation
rules 6 and 7 resolve names against, so what is editable here and what a
block may reference cannot drift apart. A field holding an object or an
array — a pharmacy's weekly hours, a holiday's `rule` — is shown as
read-only JSON: a generic editor for those is a real feature, and inventing
a bad one would teach the spike nothing.

`openDocument` resolves a page through `window.__spikeStore` rather than by
clicking a list, because finding a page by title would otherwise mean
knowing which service it lives under. `hierarchy.spec.ts` walks the browse
path deliberately; everything else goes straight to the document.

### Site

Accessible names only:

- `complementary` named **Filters** — the facet sidebar.
- `list` named **Results**, with one `listitem` per result.
- `navigation` named **Pagination**.
- `searchbox`, and `combobox` named **Sort by** and **Year**.
- The bank holiday calendar is **not** a `table`. It was one until it was
  matched to the live page, which is a grid of date cards; it now carries
  `.bk-cal` with a `data-year` attribute for the displayed year, and each
  holiday is a `listitem`. The block's configured columns still decide what
  appears, but not the shape it appears in.
- `status` — the live result count. Also carries `data-total` and
  `data-collection-size` for exact assertions.
- `metadata-<field>` is the one test id on the site, because a metadata chip
  has no accessible name of its own to select by.

## Coverage of §10

Every criterion is covered here except three that are not browser-observable
and belong in `packages/spike-db` integration tests against real SQL:

- _"No component issues SQL"_ — architectural; a source scan, not a browser.
- _"`update change_events set action = 'updated'` raises"_ — a SQL-level
  assertion on the append-only trigger.
- _"`EXPLAIN` shows whether the GIN index is used"_ — a SQL-level
  observation, and the answer gets recorded either way.

One criterion is **not satisfiable as written**:

- _"visually equivalent to production"_ is asserted structurally here
  (headings, roles, semantics, the start button, computed dates), not
  pixel-wise. A screenshot comparison would need the production pages as a
  baseline, which the spike has no access to.

And one is now satisfiable only because of the BlockNote decision:

- _"nested lists ... survive a round trip"_ could not be expressed at all
  under §6's `ListBlock`, whose `items` is `Array<{ id, content }>` with no
  children. BlockNote blocks nest natively, so the block model should gain
  `children` and this becomes testable. None of the three seeded pages needs
  a nested list, so it is not pinned yet — but the gap between §10 and §6 is
  real and belongs in the findings.
