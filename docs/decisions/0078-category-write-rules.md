# 0078. Category write rules

**Date:** 2026-10-26
**Status:** Accepted

## Context

This decision resolves the category write rules in #3176, part of #3107.
It defines URL ownership, service counts, permissions, concurrency and sibling
placement before the API and editor depend on different rules. Implementation
belongs to #3177, #3178 and #3179; sandbox acceptance belongs to #3180.

## Decision

The existing `categories` table is the one shared list for all v2 content. A
category can have subcategories, but no third level. Pages have one category;
sub-pages inherit their parent's category. There are no taxonomy definitions,
tags, separate lists per content type, or cascading deletions.

The people who can edit pages can manage categories. Public reads keep their
current visibility filtering. Editor counts include unpublished service roots
filed directly under the category, not supporting pages or descendant categories.
Empty categories remain hidden publicly.

Changing a display name does not change its slug. Changing a slug or parent
requires no attached pages of any visibility and no children. Page URLs never
change as a side effect. There are no redirects; a vacated empty-category URL
returns not found from category lookup. Existing page fallback and bare-slug
redirects remain unchanged; this does not promise a whole-site 404 where a page
already resolves. New categories and categories moved between parents append
to the current destination under the write lock.

## HTTP contract

All management routes use the existing employee-session and write-Origin gate.
Every management response is `no-store`. Public `/categories` reads remain a
separate view of the same records, without private counts or update stamps.
`GET /taxonomy` is removed, not aliased. Its callers, generated types, fixtures
and docs move together.

The editor category record has these fields:

```ts
{
  id: UUID;
  parent_id: UUID | null;
  title: string;
  slug: string;
  description: string | null;
  url: string; // /category or /category/subcategory
  position: number; // nonnegative integer among siblings
  services: number; // nonnegative direct-service count
  reserved_route: boolean; // address anchors an app-owned route
  updated_at: string; // ISO timestamp, millisecond precision
}
```

Create and update bodies contain all four editable fields:
`{ title: string, slug: string, parent_id: UUID | null, description: string | null }`.
Names are trimmed, nonempty and at most 200 characters. Slugs are at most 100
characters and match `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Slugs are globally unique,
as the existing database constraint requires. Titles need not be unique.
Descriptions are trimmed; blank strings become null. There is no extra description
length limit beyond the existing HTTP body limit. Reject unknown body keys.
`services` equals the number of `/services` entries with this category's slug.
Within the existing acyclic, category-inheriting page hierarchy, any attached
page belongs to a directly assigned service root. Counts help the editor explain
restrictions, but never replace the transaction's all-page occupancy check.

| Method and path                 | Successful response                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /editor/categories`        | 200 `{ categories: EditorCategory[] }`, each parent followed by its ordered children |
| `POST /editor/categories`       | 201 `EditorCategory`                                                                 |
| `PUT /editor/categories/:id`    | 200 `EditorCategory`                                                                 |
| `PUT /editor/categories/order`  | 200 `{ categories: EditorCategory[] }`, the saved sibling group in order             |
| `DELETE /editor/categories/:id` | 204, no body                                                                         |

Update and delete require `if-updated-at`, containing the record's last-read
ISO timestamp. Missing or malformed preconditions return 400. Reorder takes:

```ts
{
  parent_id: UUID | null;
  expected: Array<{ id: UUID; updated_at: string }>;
  ordered_ids: UUID[];
}
```

`expected` describes the entire sibling group; `ordered_ids` is an exact
permutation without repeats. The transaction compares IDs and update stamps,
then saves the whole order or nothing. An inserted, deleted, moved or edited
sibling makes an old snapshot stale. Create/reparent do not replace a sibling
group, so unrelated sibling edits do not invalidate an append. Revalidate the
chosen parent's stable ID, existence and level; return the canonical URL, even
when its display name changed concurrently.

Malformed JSON, field types, IDs or preconditions return 400. Field rules return
422 `{ error: "validation_failed", errors: [{ field, message }], message }`.
Missing targets return 404. Stale writes return 409
`{ error: "conflict", message }`. An occupied delete returns 409
`{ error: "category_in_use", message, blockers: { pages: number, subcategories: number, reserved_route: boolean } }`;
counts are nonnegative integers and include all attached pages, not just visible
services. The `error` discriminator is required in both 409 response schemas. An address in use
is a 422 on `slug` or `parent_id`. Signed-out/forbidden requests retain 401/403;
lookup outages and storage failures use the existing safe HTTP translations.

## URL ownership and app routes

Reject category addresses that equal existing page URLs, and page addresses that
equal existing category URLs. Recheck both directions inside the write transaction.
Do not otherwise change page placement, publication, hierarchy or URL behavior.

Reserve these app-owned top-level addresses against category creation and
address-changing updates: `/bank-holiday-calendar`, `/cms-preview`, `/feedback`,
`/images`, `/javascript-required`, `/preview-start-page`, `/search-results`,
`/service-unavailable`, `/services`, `/tell-us`. The image and preview prefixes
belong to static assets.

The same refusal applies to the first two segments of these app-owned flows:

- `/business-trade/crop-over-permits`
- `/health-and-emergency-services/find-an-emergency-shelter`
- `/health-and-emergency-services/find-an-open-pharmacy`
- `/health-and-emergency-services/water-outages`
- `/money-financial-support/calculate-severance-pay`
- `/money-financial-support/national-insurance-for-self-employed-workers`
- `/pensions-and-gratuities/calculate-your-pension`

Their category ancestors can exist as roots; an absent ancestor's slug cannot
be claimed by a subcategory. Ancestors cannot lose their addresses through slug
changes, reparenting or deletion, even without database pages. Display
names/descriptions and sibling order remain editable. A small explicit path list
and a regression against landing's file routes own this contract; no routing
framework or shared package is introduced. `robots.txt` and `sitemap.xml` cannot
be category slugs under the existing slug grammar.

## Transactions and stale writes

All category writes and page create/save/delete transactions acquire one shared
transaction-scoped advisory lock before hierarchy or row locks. Check hierarchy,
occupancy, URL reservations and expected stamps while holding it. Roll back on
any failure. Changed category stamps advance monotonically by at least one
millisecond, including when the clock has not advanced. Storage already uses
`timestamptz(3)`; preconditions compare instants at that same precision. A reorder
advances the stamps of rows whose positions change, so an older open edit dialog
then gets a conflict. No-op orders need not change stamps. No sibling revision
table or generic repository is needed.

The category domain module owns pure rules and typed failures. `CategoryEditing`
owns the application workflow; extend `PostgresPages` for SQL and transactions.
Keep Fastify/Zod at their existing boundaries and explicit Result failures in
new domain/application contracts. Do not migrate unrelated code to Effect.

## Clients, uncertainty and public caching

The editor uses one category query for management, page settings and Create
service. Filter values use category slugs, not display names; unknown or old
title-valued bookmarks match no services rather than throwing. After a confirmed
write, invalidate `["content"]`. An open dialog keeps its original record and
stamp through refreshes and concurrent deletion, preserving unsaved input.
Allow one pending move per sibling list; retain focus and announce its result.
Do not retry uncertain mutations automatically. Re-read/reconcile after a lost
response before repeating a create or move. For create, look up the submitted
unique slug and compare the saved fields. For move, compare the refreshed sibling
order with the requested order. For update, inspect the new stamp and fields;
a changed stamp alone does not prove this writer saved. For delete, confirm that
the record is absent. When the outcome remains unclear, keep the input and ask
for explicit refresh/retry rather than claiming success. Unique slugs and
stale-write guards prevent duplicate/conflicting effects without an idempotency
subsystem.

In API mode, landing reads categories at runtime and keeps API page breadcrumbs
through to visible trails and JSON-LD. Share the public tree in its existing
QueryClient. A category 404 can proceed to page resolution; an unavailable or
malformed category API must not resurrect static categories. This deliberately
differs from the existing page fallback. An optional tree failure must not break
unrelated app routes; omit hidden/missing category ancestors. Public caching
remains bounded by the existing 60-second freshness/300-second revalidation
window. If the sitemap's category read fails, omit only category entries and
retain its existing page/app entries; do not substitute static categories. Keep
that failure explicit at the API boundary. Legacy static mode, page catalog/search
and app-owned routes remain intact.

## Refusal and race tests

Use real PostgreSQL transactions and HTTP entrypoints, including competing
connections. Test:

- Parent existence, two-level/self-parent rules, repeated titles and global slugs.
- Page/category URL collisions in both directions, app-route reservations and
  protected ancestors, including drafts and empty categories.
- Mandatory/malformed/stale versions for save/delete/reorder; complete sibling
  permutations; insertion/deletion/reparenting between read and reorder.
- Concurrent independent appends, appends into empty groups, and parent edits
  racing child creation. No last-writer-wins overwrite or partial reorder.
- Category deletion/address change versus page assignment; failed writes leave
  categories, page URLs and ordering intact.
- Direct-service counts across visibility and hierarchy; public/private response
  isolation; authentication, Origin, no-store, retired-route 404 and OpenAPI.
- Reload/second-session persistence, retained dialog input, uncertain-response
  recovery, keyboard moves, live public labels/order/breadcrumbs and sitemap.

Ordering/permutation and timestamp roundtrips get generated cases using the
existing test tools; no package is added for a small set of permutations.

## Dependencies and acceptance

This decision does not ship category management or close #3107. The API, editor
and landing implementation belongs to #3177, #3178 and #3179.

#3169 owns database-triggered category events, transaction-local actor attribution
and `/version` advancement. #3171 owns the last editor's name in private reads
and the editor UI. Both depend on #3168. Do not add temporary category audit
logging or polling. The trigger/actor work must wrap these same transactions and
cover create, update, reorder and delete before release. Public category reads
must not expose editor identities.

#3180 requires the sandbox walkthrough with real employee sessions, conflicting
edits, attributed events, public propagation, persistence after redeploy and
manual WCAG 2.2 AA checks, including keyboard and screen-reader use.

Deployed databases must not seed on boot, as required by
[ADR 0077](0077-deployed-content-databases-are-loaded-once-then-written-only-by-the-editor.md)
and #3052. Import rehearsal and snapshot refresh have separate owners (#3095
and #3234). This decision authorizes no import or deployment. Preserve authored
data; an open issue or a page-event actor count cannot establish that a forced
replacement is safe when category changes have no events yet.
