# 0077 — Deployed content databases are loaded once, then written only by the editor

**Date:** 2026-10-13
**Status:** Accepted

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
- Sandbox currently violates point 1 (#3052 removes `SEED=true` from its task
  definition); until that lands, sandbox's import is a `--force` rehearsal
  and each boot re-adds deleted pages.
- Recovering from a bad import on a database editors have written to is
  point-in-time recovery or fixing forward in the editor, never a forced
  re-import.
- The runbook lives in `apps/api_v2/README.md` under "Importing the estate
  (one-time)".
