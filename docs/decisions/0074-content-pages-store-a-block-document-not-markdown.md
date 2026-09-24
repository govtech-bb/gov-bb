# 0074 — `content_pages` stores a block document, not markdown

**Date:** 2026-09-24
**Status:** Accepted

## Context

The content-as-data EPIC (#2698) specifies `content_pages.body_markdown text`.
The block editor spike that ran alongside it (#2788/#2789) built the same
table with `body jsonb`, holding `{version, blocks, refs}` — a closed palette
of block types, validated by a set of rules, with `refs` resolving links and
data-collection queries by key.

`apps/api_v2` (#2700) is the first thing that has to store a page, so the two
cannot both be right past this point. Everything downstream inherits the
answer: the migrations in #2703–#2705, the renderer in #2702, the editor in
#2706.

The case against markdown is not about formatting.

- **Markdown smuggles presentation.** A page in the live estate needed a
  coloured callout and got a hand-written `<div class="bg-blue-10">` inside
  its markdown body. Nothing validates it, nothing restyles it when the
  design system changes, and nothing stops the next author inventing a
  different div.
- **Markdown cannot express a data reference.** The bank holiday calendar is
  computed from rules; the pharmacy finder is 163 records with facets.
  Neither is text. Under `body_markdown` they become either hardcoded HTML or
  a bespoke shortcode syntax — which is a block model with worse ergonomics.
- **Markdown cannot be validated against the estate.** "A start link pointing
  at a page that does not exist is rejected" is only a rule that can be
  enforced because the link is a `ref` with a known shape rather than a
  string in prose.

The case for markdown is real but narrower: it is what the 85 pages in
`apps/landing/src/content/` are written in today, and a block document needs a
converter to get them across. That cost lands on the migration stories, which
were going to touch every page anyway.

## Decision

**`content_pages.body` is `jsonb` holding a `@govtech-bb/block-kit` document,
and the rules are enforced server-side on every write.**

Three consequences follow, and they are the point of writing this down:

1. **#2699's SQL and #2698's ERD are updated to match**, not the other way
   round. This ADR is the disagreement being settled rather than carried.
2. **A database constraint, not a convention.** `content_pages_body_shape`
   checks `body ? 'blocks' and body ? 'refs' and body ? 'version'`, so a
   markdown string cannot be written into the column by a half-finished
   migration or a client that never got the message.
3. **Validation runs inside the write.** `validateDocument` runs in
   `ApiStore`, against context read fresh in the same request — not in the
   browser, where it was advisory and anyone could POST past it.

## Consequences

`block-kit` is now a dependency of the server as well as the client, which is
why its `./document` entry point exists: the barrel will re-export a React
renderer when #2702 lands, and a server importing it to validate a document
should not drag React into its build.

The palette is closed, and the block editor spike's own findings record that
the current one is not quite enough — page chrome the system does not already
know has no honest home in it. Expect to add block types during the migration
stories rather than treating the current set as final.

This ADR is scoped to the spike. Nothing in `apps/api`, `apps/landing` or the
forms platform changes, and `packages/content`'s markdown schemas continue to
be the format of record for the 85 pages that have not moved.
