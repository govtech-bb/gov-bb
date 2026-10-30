# Landing `/services` from the api_v2 catalog (#3244)

## Context

`/services` listed only the static markdown pages, so a page that exists
only in api_v2 never appeared. #3125 (PR #3453, still open) had just added
`lib/api-v2-site.ts`: a cached `/catalog` read for the sitemap that kept
urls only. This branch is stacked on that PR.

## What we did

- Widened `CatalogBody` in `api-v2-site.ts` to the full api_v2
  `CatalogEntry` (`url`, `title`, `description`, `digital`, `stage`).
  `fetchApiV2CatalogEntries` returns the entries, `fetchApiV2Catalog` maps
  urls from them, and the new `getApiV2CatalogEntries` server function
  passes landing's rate-limit token.
- `/services` got a loader. In api_v2 mode (`categoryTree.kind !==
  'disabled'`) it lists the catalog's `stage: alpha` pages; otherwise it
  returns `null` and the component's unchanged static list renders
  (`useLoaderData() ?? PAGES…`).

## Why we did it that way

- **One cache entry, not a second reader.** `cachedList` keys on
  `[path, base]`. A second `/catalog` reader with a different `pick` would
  share that key, so whichever ran first would decide whether the cache held
  urls or entries. Widening the one schema keeps one request and one entry
  for the sitemap and `/services`. The cost is that the sitemap's read now
  fails whole if any entry breaks the copied contract, where before only
  `url` was checked. Accepted: api_v2 serialises `/catalog` through the same
  zod schema, so only the two copies drifting could cause it.
- **Replace, never merge** (ADR 0078, as category listings and the home page
  do). An empty api_v2 list shows "No alpha services yet." rather than
  falling back to the markdown, so a page an editor unpublished can't come
  back. A render test pins this.
- **Serve the last good list on an outage.** This is `cachedList`'s existing
  behaviour, so no code was needed. A cold start during an outage shows an
  empty list; accepted, as #3453 does for the sitemap and search.
- **Keep the `stage === 'alpha'` filter.** editor_v2 sets no default
  `stage`, so a new editor_v2 page needs `stage: alpha` in its frontmatter to
  be listed. Defaulting it belongs to #3454.
- **No re-sort, no `x-content-source` header.** The catalog is already A–Z,
  and the header wasn't in the issue's Done-when.

## What we almost got wrong

- A route-component render test suspended under `renderToStaticMarkup`:
  the start plugin code-splits route components even in Vitest. The test
  awaits `Route.options.component.preload()` first.
- A review note said `??` → `||` would silently restore the static list on an
  empty api_v2 list. It wouldn't, because `[]` is truthy. The empty-list
  render test still guards the replace-not-merge rule against a real
  regression, such as a length check.
- The plan predated two #3453 changes: `cachedList` now takes a `token` and
  returns `{ list, freshForMs }`. The code follows the PR, not the plan.

## Open questions

- Reviewers with a preview token see only api_v2's public list until #2961
  threads the token through public reads.
- The `service_status` overlay isn't applied in api_v2 mode (#3248).
