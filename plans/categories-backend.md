# Categories: backend context for planning

This brief is for whoever plans api_v2's category writes. It records what exists, the frontend shell's current
behavior, and what's still to decide. It describes; it doesn't prescribe a backend contract. It replaces the earlier draft
`cms-taxonomy.md`, whose open questions are answered below.

## Settled

- **Target:** editor_v2 and api_v2. Not form_builder's GitHub CMS, which writes `packages/content/src/categories.ts`
  (ADR 0056).
- **Categories only:** no general taxonomy system, no tags, no taxonomy definitions.
- **One category per page:** the existing `content_pages.category_id`. **Two levels at most:** a category and its
  subcategories (ADR 0002).
- **The editor's side is built.** `editor_v2` has an app menu and a Categories screen at
  `/categories`. It lists categories in order with subcategories, and adds, edits (name, slug, parent, description),
  moves up or down among siblings, and deletes. Until the API can save these, the editor keeps changes in memory
  for the page load and says so on the screen.

## What api_v2 has today

Paths are under `apps/api_v2/src`.

- **Stack:** Fastify 5 with Zod type provider, Drizzle over `pg`, Postgres, BetterAuth. Layers are
  `modules` (domain, Zod), `services` (one use case, with its port), `adapters/postgres-pages.ts` (implements every
  port) and `routes` (`contracts.ts` schemas also generate the OpenAPI document). Expected failures are `Result`
  values that routes map to status codes.
- **Table** `categories` (`migrations/002_markdown_pages.ts`, extended in `005_hierarchy_and_search.ts`; Drizzle in
  `schema.ts:52`):
  - `id uuid`, `slug varchar(100)` **unique across the whole table**, `title varchar(200)`, `description text`;
  - `parent_id → categories(id) on delete restrict` (a subcategory is a category with a parent);
  - `position int default 0`, the order among siblings;
  - `created_at`/`updated_at`, which nothing updates yet.
- **Pages** point at one category: `content_pages.category_id → categories(id) on delete restrict` (`schema.ts:78`).
  A sub-page must share its parent page's category (composite key on `(parent_id, category_id)`). So if no service
  (root page) uses a category, no page does.
- **Read:** employee-only `GET /taxonomy` (`routes/pages.ts:110`, shaped by `taxonomyOf` in `modules/navigation.ts:162`,
  read by `PostgresPages.categories()` at `adapters/postgres-pages.ts:261`). It returns
  `{ categories: [{ id, parent_id, slug, url, title }] }`: each top-level category, then its subcategories, ordered
  by `position, title`. It has **no** `description`, `position` or counts. `url` is `/<category>` or
  `/<category>/<subcategory>` (`urlOf`, `navigation.ts:127`).
- **Public reads** `GET /categories`, `/categories/:slug` and `/categories/:category/:slug` are in `routes/site.ts`, so
  `/categories` is taken for the site.
- **No category writes anywhere.** Rows come from `seed.ts` (insert, `onConflictDoNothing`) and the one-time estate
  import, whose `--force` **truncates** `categories` with the content tables (`seed.ts:185`).
- **Auth:** every editor route is inside the `editorRoutes` plugin, whose `onRequest` hook needs an employee session
  and, for anything but GET/HEAD, `Origin` equal to the editor's (`routes/pages.ts:22`). Handlers get the employee
  for audit through `actor(request)`. There are no roles: every admitted employee can do everything.
- **CORS** allows `GET, HEAD, POST, PUT, DELETE, OPTIONS` (`app.ts:105`). No PATCH.
- **Refusals:** `REFUSALS` (`postgres-pages.ts:73`) maps Postgres constraint names to field errors (422), but only
  for `content_pages`. `categories_slug_key`, the parent foreign key and the delete restriction aren't mapped.
- **Change log:** `change_events` is append-only. `writeChange` (`postgres-pages.ts:158`) only ever writes
  `entity_kind = 'content_page'`. The editor polls `GET /version` (count and newest `occurred_at`, around
  `postgres-pages.ts:602`) and refreshes every content read when it moves, so a category write that appends nothing
  won't refresh other editors.

## Current frontend shell

The editor's methods are on `createEditorApi` in `apps/editor_v2/src/api/client.ts`, implemented in memory by
`categoryShell`. The preview rules are in `apps/editor_v2/src/api/categories.ts`, with tests in
`categories.test.ts`. These describe the frontend prototype, not a settled HTTP or concurrency contract.

```ts
type Category = {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  description: string;
  url: string; // `/<category>` or `/<category>/<subcategory>`
  position: number; // among siblings, lowest first
  services: number; // services (root pages) filed directly under it
};
type CategoryFields = Pick<Category, "title" | "slug" | "parent_id" | "description">;
```

| Method | Does | Refuses with |
|---|---|---|
| `categories()` | Every category | (read failures as today) |
| `createCategory(fields)` | Adds it after its siblings; returns it | 422 field errors |
| `updateCategory(id, fields)` | Saves it. A new parent puts it after its new siblings, and a new slug moves its subcategories' `url`s. Returns it | 404; 422 field errors |
| `moveCategory(id, by)` | Moves one place up (`-1`) or down (`1`) among siblings using the current local list; returns their IDs in order | No movement past either end |
| `deleteCategory(id)` | Deletes it | 404; 409 while services or subcategories are filed under it |

The shell also retains `serviceCategoryTitle`, the original API category name, solely for links into the current
Services title-based filter. This preview-only field is not a proposed API field. Renaming a category locally must
not change which real services the link finds. Page settings and Create service continue to use real `/taxonomy`.

Moves are local transitions followed by a query-cache update, not optimistic remote saves. Count refreshes read
the latest local category state after the network work finishes; there is no simulated server-save queue.

The editor's `ApiFailure` reads `{ message?, errors?: [{ field, message }] }` from a failed response (as for pages).
The category dialog puts a 422's `errors` on the fields named `title`, `slug`, `parent_id` and `description`, and
shows a 409's `message` as written. A future API can reuse this presentation with an actionable sentence, such as "2 services are filed under
Education. Move them to another category first."

**Rules the shell applies (`categoryProblems`, `deleteBlocker`):**

- `title`: required after trimming, 200 characters or fewer.
- `slug`: required, 100 or fewer, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique across all categories.
- `parent_id`: null, or an existing **top-level** category other than itself. A category that has subcategories
  can't take a parent.
- `description`: optional, trimmed. The shell stores `""` for none; the column is nullable.
- The shell doesn't check that a category's address is free of pages (see "To decide").
- **Delete:** refused while services or subcategories are filed under it, which is what the restricting foreign keys
  enforce anyway.

## Options for the HTTP surface (undecided)

- **Read:** extend `GET /taxonomy` with `description`, `position` and a services count. It's employee-only, the editor
  already reads it, and `plans/editor-v2-naming.md` keeps the `/taxonomy` name. A new admin read works too, as long
  as it isn't `/categories`.
- **Writes:** for example `POST /taxonomy`, `PUT /taxonomy/:id`, `PUT /taxonomy/order` (body
  `{ parent_id, ids }`) and `DELETE /taxonomy/:id`. Prefer PUT, or add PATCH to CORS.
- **Counts:** the shell counts services per category from a fresh `GET /services` on every read
  (`ServiceSummary.category.slug`, matched by the slug each category had when the list loaded). On the server it's a
  `count(*) … where parent_id is null group by category_id` on `content_pages`. The existing `indexedPages()` already
  joins categories.

## To decide

1. **Naming** of the routes above, and whether the count is services only or all pages, and of which visibilities.
   The shell counts every service filed directly under the category, whatever its visibility.
2. **Delete:** keep the block (shell) or offer "move its services to …, then delete".
3. **Slug changes:** a category's `url` changes with its slug. Pages store their own `url`, which contains the slug
   only by convention, so they'd keep the old prefix. Do pages move with it, does the slug lock once used, or are
   redirects added?
4. **Where a new or moved category goes:** the shell puts it after its new siblings.
5. **Change log:** append `change_events` rows (`entity_kind = 'category'`, actor, action) so `/version` moves and
   other editors refresh. Decide the actions and whether categories get version numbers.
6. **`updated_at`:** start maintaining it.
7. **Addresses that collide with pages:** a subcategory's `/<category>/<slug>` has the same shape as a service filed
   directly under that category. For example, `seed-data/estate.json` has `/business-trade/apply-for-hotel-licence`,
   so a subcategory slugged `apply-for-hotel-licence` under Business and trade would claim it. A top-level `/<slug>`
   can likewise meet an uncategorised root page such as `/terms-conditions`. Decide whether the API refuses these (a
   422 on `slug`), and how landing resolves a two-segment address that could be either (ADR 0002).
8. **Errors:** map `categories_slug_key` (23505) and the restricting keys (23503) into the shell's 422/409 shapes,
   or check first inside the transaction.
9. **Reorder:** decide whether the HTTP mutation sends a whole sibling order or a single move, and how it detects
   stale/concurrent changes. A transaction can rewrite sibling positions atomically. The shell only moves within
   one in-memory list; it does not settle backend concurrency or optimistic-update behavior.
10. **Permissions:** today every admitted employee can manage categories. Is that enough?
11. **Landing:** it renders categories from the static `packages/content` list (`apps/landing/src/content/categories.ts`
    re-exports it) and never reads api_v2's. So category edits won't reach the site until landing reads them from
    api_v2. ADR 0077 makes the editor the only writer once the estate is imported; ADR 0056 still names
    `packages/content` the source for the legacy apps. Sequence this with the import, which truncates `categories`.

## Tests and tooling to touch

- `route-auth.test.ts` already fails any non-GET route registered without sign-in. New writes inside
  `editorRoutes` are covered automatically.
- `app.test.ts` keeps hand-written route lists for its 401 and wrong-origin tests.
- `openapi.test.ts` snapshots `openapi.json` (update with `-u`). editor_v2 then regenerates its types with
  `pnpm exec vitest run src/api/openapi.test.ts -u` (see `apps/editor_v2/docs/DEVELOPMENT.md`).
- `schema.test.ts` checks `schema.ts` against the migrated database; tests use a real Postgres template database
  (`test-db.ts`).
- editor_v2's browser fixture `scripts/browser/page-api-fixture.mjs` answers `/taxonomy` with an entry that has no
  `parent_id`, and its path pattern would need the new routes.

## Swapping the shell for the API (editor side)

1. Agree the HTTP contract and concurrency behavior first. Then replace `categoryShell` with actual requests in
   `client.ts`, updating the screen and tests to match rather than preserving fake transport guarantees. Widen
   `send`'s body type beyond page inputs. `categoriesFrom` and `withServiceCounts` go once the read returns positions
   and counts; the preview-only service-filter label also needs reconciliation with real category renames.
2. In `categories-screen.tsx` and `category-dialogs.tsx`, invalidate `["content"]` instead of
   `["content", "categories"]`, so page settings and Create service see the change.
3. Remove the "Preview only" banner from `categories-screen.tsx`, and the shell sentences in `PRODUCT.md` and
   `docs/DEVELOPMENT.md`.

## References

- ADR 0002, subcategories are category data: `docs/decisions/0002-subcategories-are-category-data-not-markdown-indexes.md`
- ADR 0056, taxonomy single-sourced: `docs/decisions/0056-content-category-taxonomy-single-sourced-and-cms-writes-canonical.md`
- ADR 0077, the editor as the only writer: `docs/decisions/0077-deployed-content-databases-are-loaded-once-then-written-only-by-the-editor.md`
- `apps/api_v2/README.md` covers architecture, auth, the hierarchy rules and the seed.
