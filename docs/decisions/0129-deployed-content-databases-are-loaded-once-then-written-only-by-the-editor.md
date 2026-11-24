# 0129 — Deployed content databases are loaded once, then written only by the editor

**Date:** 2026-10-13
**Status:** Accepted (amended 2026-11-02 — once per environment, #3238; amended 2026-11-24 — `sync-estate` before cutover, #3711)

## Context

`apps/api_v2` holds the page estate in `content_pages`, `categories` and
`search_chunks`, with every write recorded in the append-only
`change_events`. The pages started life as markdown under
`apps/landing/src/content/`, and `pnpm seed-data` converts that markdown into
the committed snapshot `src/seed-data/estate.json`.

Until #2978 the only way that snapshot reached a database was `seed()` at
boot when `SEED=true`. The seed is additive (`on conflict do nothing`), so a
boot with `SEED=true` puts back any page an editor deleted. The sandbox task
definition set `SEED=true` in production mode, so sandbox did exactly that on
every deploy. The issue also asked whether the load should be a migration
applied on merge; it should not, for the reasons recorded there (every test
database would receive the estate, the schema history would carry a stale
copy of the content, and a replay or a fresh environment would bring deleted
pages back).

The question underneath all of this is what the source of truth for content
is once a deployed database exists.

## Decision

**A deployed `api_v2` database receives the markdown estate exactly once,
through an explicit command. After that, the editor is the only writer.**

1. **One explicit command, never a boot flag or a migration.** The load is
   `node dist/src/import-estate.js`, compiled into the image and run by hand
   inside the live container. Nothing under `src/migrations/` loads content,
   and `SEED=true` is a local development convenience that no deployed
   environment sets.
2. **The command refuses a database that already has content.** Rows in
   `content_pages` mean the database is now the source of truth; the command
   exits non-zero and writes nothing. `--force "<reason>"` is a _replace_
   (truncate the three content tables and import, in one transaction), not a
   re-add, and it is only for a database whose history shows no editor
   writes. `change_events` is never truncated, so a replace is itself on the
   record.
3. **Every import names its origin.** The snapshot records `source`, the
   last commit that touched the markdown, and the import writes its history
   entries as `import:<source>`. The ledger of "when did this run, from which
   markdown" is the database's own history, not a wiki page.
4. **The markdown freezes at the prod import.** Until then it stays editable
   and the snapshot is regenerated before each environment's import. After
   it, content changes go through the editor only; there is no sync from
   markdown back into a database.

## Consequences

- A proposal to re-run the import to "pick up" markdown edits, to add a
  content migration, or to set `SEED` in staging or prod is a change to this
  decision, not an operational shortcut.
- Sandbox no longer sets `SEED` (alpha-infra#748), its import was rehearsed
  on 22 Oct 2026 (#3095), and production mode refuses to boot with `SEED`
  set (#3052, PR #3153).
- Recovering from a bad import on a database editors have written to is
  point-in-time recovery or fixing forward in the editor, never a forced
  re-import.
- The runbook lives in `apps/api_v2/README.md` under "Importing the estate
  (once per environment)".

## Amendment (2026-11-02) — the import runs once per environment (#3238)

"Once" is once per database. Sandbox, staging and prod each import the
snapshot on the deploying branch at the deployed commit, which CI keeps
current. A re-import before any editor has written is the forced replace of
point 2; after one has, it is fix-forward. "Has an editor written" is the
runbook's three-part check (a non-`system` history actor, a pending revision,
or on sandbox a category edit from before migration `007`), not the actor
histogram alone. The pending-revision part reads the `revisions` count the
import reports (#3188).

Two corrections to the decision text, stated here rather than edited in
place:

- **Point 2:** `--force` _deletes_ (not truncates) every row of
  `search_chunks`, `page_revisions`, `content_pages` and `categories`, so the
  history records each replaced page and category as `deleted` by `system`. `change_events`
  is still never emptied, and since migration `017` it rejects `TRUNCATE` as
  well as row deletes.
- **Point 3:** the snapshot no longer records `source`, and history is not
  written as `import:<source>`. Since migration `007` (#3340) every imported
  row's history is by `system`, and since #3396 `source` is a sha1 of the
  parsed snapshot (`ESTATE_SOURCE`), printed in the import's JSON line with
  the `--force` reason. The ledger is that JSON line, pasted on the import
  issue, plus the database's history.

Visibility at import is the frontmatter plus that environment's
`service_status` overlay (#3188), so `estate.json` stays
environment-neutral. The freeze in point 4 is switched on with the repository
variable `CONTENT_FREEZE=true` (#3236), before the prod deploy whose snapshot
is imported.

## Amendment (2026-11-24) — `sync-estate` before cutover (#3711)

Point 4 says there is no sync from markdown into a database. That stays true
after an environment's cutover. Before it, the snapshot keeps changing while
the database, once imported, does not, and the forced replace of point 2
deletes editors' work. So one scripted sync is allowed, with these limits:

- **Before cutover only.** `pnpm --filter @govtech-bb/api-v2 sync-estate`
  runs from an operator's machine, before the environment's landing switch
  (#3311 for sandbox, #3227 for staging). After cutover, the database is the
  source of truth and a difference from the snapshot is editors' work.
- **Through the editor API, as a person.** It writes only with
  `PUT /pages/:id` and `POST /pages`, signed in with the operator's editor
  session, so every change is recorded against the operator. A change to a
  public page is a pending revision that an approver other than the
  operator publishes (ADR 0134). It never deletes a page.
- **Never over an editor's work.** It changes only a page whose history
  has no actor but `system` and that has no pending revision. Any other page
  is reported as a conflict and left as it is.
- **From the check.** Its input is `check-import --json` (#3710), from the
  same `estate.json`. A dry run is the default.

The runbook is "Drift before cutover" in `apps/api_v2/README.md`.
