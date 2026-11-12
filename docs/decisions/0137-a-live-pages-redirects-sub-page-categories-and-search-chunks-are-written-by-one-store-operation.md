# 0137. A live page's redirects, sub-page categories and search chunks are written by one store operation

**Date:** 2026-11-11
**Status:** Accepted

## Context

This decision resolves #3645. When api_v2 writes a live page, three other
things must stay consistent with it:

- its redirects: former public addresses redirect to where the pages now
  are, and no rule covers an address that is now public (#3619)
- its sub-pages' categories: uncategorised sub-pages are filed under the
  page's category
- its search chunks, cut from the saved body

`writeLive` in `PageEditing` did this by calling the `PageRecords` port six
times in a fixed order, and `create` repeated part of the sequence. Six of
the port's 22 methods existed only for this sequence:
`redirectSourcesInSubtree`, `publicPagesInSubtree`, `recordPageRedirectMove`,
`removePageRedirectAt`, `fileUncategorisedBelow` and `replaceSearchChunks`.
The order mattered. Former addresses had to be read under the content lock
before the page was replaced, and a redirect could be recorded only after
the caller had checked the source's owner and that the destination was
public. Comments on the port stated these rules, but only the care of the
one caller enforced them.

The redirect rule was also split three ways. The use case decided whether
another page had reclaimed a source. The adapter decided whether a source
was occupied, and flattened chains. `modules/page-redirect-history.ts`
worked out the source from the page's history.

## Decision

**One store operation writes a live page with its redirects, its sub-pages'
categories and its search chunks.** `PageRecords.writeLivePage` inserts a
new page or overwrites the page as it stands, and then, in the same
transaction and in a fixed order:

1. files the page's uncategorised sub-pages under its category
2. records a redirect from each former public address in the subtree to
   where its page now is, and clears any rule at an address now public
3. cuts the page's search chunks from the saved body and replaces the old
   ones

The operation cuts the chunks itself, so a caller can't write a page and
forget to re-index it.

- **The port loses the six methods.** It also loses `insert` and `replace`,
  which the operation now wraps, so a live write can't skip the operation.
  `checkReplace` stays: it refuses what the write would, without keeping
  it.
- **`create` goes through the same operation**, with no current page.
  **Delete stays as it is.** It relies on cascades and changes no redirects.
- **Pure decisions stay in `src/modules/`, and the adapter calls them.**
  `routingChanged` decides whether a write can change which addresses are
  public. `redirectsAfterWrite` decides which former address redirects
  where.
- **The service keeps its own decisions:** permissions, `place`,
  `checkReplace`, and skipping a write that changes nothing. Everything
  still runs inside `atomically` under the content lock.
- **`PostgresPages` keeps `redirectSourcesInSubtree`,
  `publicPagesInSubtree`, `recordPageRedirectMove`, `removePageRedirectAt`
  and `insert` as public methods, off the port**, because the seed or the
  tests call them directly. `replace`, `fileUncategorisedBelow` and
  `replaceSearchChunks` become private.

## Alternatives considered

- **Keep the six methods on the port and document the order better.** This
  needs no change, but documentation does nothing to stop a second caller
  from getting the order wrong or skipping the index.
- **Pass the chunks in from the service.** This keeps cutting text out of
  the adapter. But the caller could then still write a page without
  re-indexing it, which is the mistake this decision removes.
- **Move the whole redirect rule into the adapter, history reading
  included.** This makes the port narrower in the same way, but puts pure
  decisions in the one layer that can only be tested against Postgres.

## Consequences

- The port is smaller: the six sequence methods are gone, and `insert` and
  `replace` are replaced by `writeLivePage`. No caller can get the order
  wrong.
- **Sequencing moves into the adapter.** The Boundaries table in
  `apps/api_v2/README.md` describes adapters as I/O only. This operation is
  the exception, and we accept it for the narrower port. It decides nothing:
  the rules it applies come from `src/modules/`, and it only runs the steps
  in order. A review should not flag it as a layering mistake, and it
  should not be copied for writes that have no derived data to keep
  consistent.
- HTTP behaviour, `openapi.json` and the ERD do not change. A failed write
  still reports the step that failed, for example `replaceSearchChunks`, and
  rolls back everything the transaction wrote.
- Whether `PageRecords` should be a port at all is a separate question.
