# Landing: api_v2 pages in the sitemap and search (#3125)

## Context

When `VITE_API_V2_URL` was set, a page that exists only in api_v2 rendered, but it was missing from `/sitemap.xml`, from search and from category listings. The issue was re-scoped on 23 Oct: in v2, `content_pages.visibility` is the only page-level switch, so a `service_status` row must never change an api_v2 page's visibility. The plan was written on 22 Oct, before #3127 (page cache and breaker), #3179 (categories from api_v2) and #3134 (fallback logging) merged. Those PRs changed a lot of what it assumed.

## What we did

There are two PRs, both into `v2-rewrite`:

- `3125-visibility-tests` adds tests to `-preview-gating.test.ts` showing that:
  - a `disabled` or `enabled` status row leaves an api_v2 page public;
  - `form_disabled` still puts an api_v2 page into maintenance, and its `/start` page returns 404;
  - the status overlay still reaches the static page's visibility check.

  It also updates the comment in `$.tsx` to cite #3125 and #3248.
- `3125-api-v2-lists`:
  - New `lib/api-v2-site.ts`. It reads `/catalog` and `/search/documents` through `readPublic`, now exported from `api-v2-categories.ts`.
  - `collectSitemapEntries` takes the api_v2 urls as an argument.
  - In the search index, api_v2 documents replace their static copy and are not checked against the static visibility rules (a `gated` flag on each index entry marks which ones are).
  - `/search-results` loads the documents in its loader. `ServiceSearch` either receives them from the page or fetches them once, on the first keystroke.

## Why we did it that way

- **No category-listing work.** The plan wanted to merge api_v2 listings into the static ones. #3179 went further: in api_v2 mode, `$.tsx` serves the whole listing from api_v2, so there was nothing left to merge.
- **Reused `readPublic` instead of writing a second fetch helper.** It already has the timeout, the zod parse and the `api_v2_fallback` logging. The plan's `resolveCachedValue` design came from before that helper existed.
- **A `QueryClient` cache, as the category tree uses.** It caches each list for 60 s and never throws. On a failed read it serves the last good list, or an empty list on a cold start, and doesn't try again for a minute. That way a down api_v2 costs one 750 ms timeout per minute per list, not one on every request. We kept the cached list indefinitely (`gcTime: Infinity`) so a long outage still has something to serve.
- **No cache expiry on publish.** The category tree is cleared when the site version moves; these lists are not. A publish or unpublish takes up to 60 s to show in the sitemap and search. That met the plan's bar and saved copying the version-watch code. The local smoke test confirmed the 60 s figure.
- **The browser memo is browser-only.** Without it, each visit to `/search-results` returned a fresh array, so the browser rebuilt the whole search index, markdown analysis of every static page included. On the server the memo stacked on top of the `QueryClient` cache, which made results up to two minutes stale, so the server goes straight to its own cache.
- **The search page gives the box its documents.** Otherwise the autocomplete fetched a second copy, which could differ from the loader's copy and made the single-slot index memo rebuild as the page switched between them.
- **api_v2 documents skip the static visibility rules.** Some pages are preview in the static files but public in api_v2. The page route serves them, so search has to find them too; otherwise "visibility comes from api_v2 alone" would fail in search.

## What we almost got wrong

- The first version built an api_v2 document's search id with `url.slice(1)`. That assumes a leading `/`; every other api_v2 url goes through `sitePath`. Without the slash, the id wouldn't match the static copy and the page would show up twice. The existing twin test missed this because its static copy is preview-only and so was hidden anyway. The new test uses a public static twin.
- The index memo compared document lists by identity, and two different empty lists were in play: one in `search.ts`, one in `api-v2-site.ts`. So a search box rebuilt the whole index after its first keystroke, about 0.3–0.5 s of markdown analysis, even with api_v2 unset. PR review caught it. The registry pages are now analysed once, and any empty list counts as the same list.
- Vitest runs with `import.meta.env.SSR` set to true, so the browser-memo tests have to stub it to false.

## Open questions

- When api_v2 is configured, `/search/documents` includes child pages other than `start` steps. The static index skips every child page. We decided to accept api_v2's set as it is.
- `/search-results` sends every public page's full text in its HTML on every request. The plan accepted this; watch it as content grows.
- Preview reviewers see only api_v2's public view in these lists, because landing sends no preview token (#2961).
