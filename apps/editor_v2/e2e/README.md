# Behavioural test suite — and the UI contract it pins

These specs were written **before** the editor and the site, from the
acceptance criteria in §10 of the block editor build brief. They are the
specification. The editor and `landing_v2` are built to the selectors named
here, not the other way round.

If a selector below turns out to be the wrong shape, change it here first and
say why — that is a finding about the design. Quietly rewriting a spec to
match whatever the code happens to render turns the suite into a description
of the implementation, which is worth nothing.

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

The three things carrying the spike's risk have no honest unit-test surface:

- **PGlite** is a real Postgres compiled to WASM. Mocking it would test the
  mock. Running it in Node would skip IndexedDB, which is where the
  persistence questions actually live.
- **The multi-tab worker** only means anything with more than one tab.
  `live-update.spec.ts` opens two pages in one browser context for exactly
  this reason — a second _context_ is a different storage partition and the
  test would prove nothing.
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

**The editor is queried by test id.** It is an internal tool whose DOM will
churn hard across the spike, and pinning it to accessible names would make
every copy change a test failure for no safety gain.

## The contract

### Boot

| Handle     | Meaning                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `db-ready` | Attached once the migration and seed have finished. Every helper waits on it, so a database that fails to come up fails in one obvious place. |

### Editor shell

| Handle                                           | Meaning                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `doc-list`                                       | Container of document links. Each document is a `link` whose accessible name is its title.                          |
| `block-list`                                     | Container of the blocks being edited. Visible once a document is open.                                              |
| `block-<blockId>`                                | One block, keyed by its stable id (`block-b_sv04`). Receives focus when an error summary link is followed.          |
| `block-type-<type>`                              | One block, keyed by type (`block-type-finder`). For asserting a type is present without knowing its id.             |
| `document-title`                                 | Editable envelope title.                                                                                            |
| `preview`                                        | The live preview pane, rendered by `block-kit`'s renderer — the same one the site uses.                             |
| `doc-json-toggle` / `doc-json`                   | Read-only serialized body. Makes round-trip observable. Not an escape hatch: read-only, and not in the insert menu. |
| `save`                                           | Save button.                                                                                                        |
| `save-status`                                    | Text matching `/saved/i` when clean, `/unsaved/i` when dirty.                                                       |
| `error-summary`                                  | Present only when a save was rejected. Contains a `link` per error that moves focus to the failing block.           |
| `block-error-<blockId>`                          | The error shown against a specific failing block.                                                                   |
| `conflict-notice`                                | Shown when `save` was refused because `updated_at` was stale.                                                       |
| `reset-data`                                     | Drop, migrate, reseed.                                                                                              |
| `insert-block` → `insert-menu` → `insert-<type>` | The closed palette. Exactly nine `menuitem`s.                                                                       |
| `move-up` / `move-down` / `delete-block`         | Per-block controls, scoped inside `block-<blockId>`.                                                                |

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
two statements conflict; the resolution taken here is that **`bank-holiday-rules`
records are editable and pharmacy records are not**, which is what makes the
data/code seam testable at all.

### Site

Accessible names only:

- `complementary` named **Filters** — the facet sidebar.
- `list` named **Results**, with one `listitem` per result.
- `navigation` named **Pagination**.
- `searchbox`, and `combobox` named **Sort by** and **Year**.
- `table` named **Bank holidays**, with `columnheader`s from the block's
  configured columns.
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

Two criteria are worth flagging as **not fully satisfiable as written**:

- _"visually equivalent to production"_ is asserted structurally here
  (headings, roles, semantics, the start button, computed dates), not
  pixel-wise. A screenshot comparison would need the production pages as a
  baseline, which the spike has no access to.
- _"nested lists ... survive a round trip"_ cannot be tested, because the
  `ListBlock` in §6 has no nesting — `items` is `Array<{ id, content }>`
  with no children. None of the three seeded pages needs a nested list. This
  is a genuine gap between §10 and §6 and should go in the findings.
