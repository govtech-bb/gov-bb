# api_v2 pages carry their category and subcategory (#3133)

## Context

Landing built an api_v2 page's `frontmatter.categories` from the url's first
segment and never set `subcategory`. That disagreed with the static twin on 21
of the 122 seeded pages: 18 `youth-and-community/<sub>/…` pages and 3 unfiled
top-level pages. The `GET /pages` response had no category field to map from.

## What we did

- api_v2: `GET /pages?url=` returns `category` and `subcategory` (slugs, or
  null). They come from a new `categoryChain` in `modules/navigation.ts`, which
  `categoryCrumbs` now maps, so breadcrumbs stay byte-identical. `openapi.json`,
  editor_v2's `openapi.d.ts` and the README are updated.
- landing: `fromApiV2` maps the two fields. A new
  `api-v2-page.parity.test.ts` checks that every page in `estate.json` produces
  the same `ContentPage` as its static twin: frontmatter and compiled body.

## Why we did it that way

- **The API owns the taxonomy, not the url.** Deriving the category from the
  url plus landing's static `CATEGORY_BY_SLUG` was rejected. api_v2's model
  says the url is only an address (`migrations/005`), the editor moves
  `category_id` and `url` independently, and #3179 wants the static taxonomy
  reads gone.
- **Singular `category`/`subcategory`, not `categories: string[]`.** The DB
  has one `category_id`. #3242 picks the plural shape when it stores secondary
  categories.
- **`isPageResponse` is not extended.** An older api_v2 without the fields
  degrades to `categories: []` instead of turning every page into a miss.
- **Parity is checked offline against the snapshot.** The responses are built
  from `estate.json`, not the DB, so the test is cheap and also catches a stale
  snapshot: a content change without `pnpm --filter @govtech-bb/api-v2
  seed-data` fails `landing:test`.

## What we almost got wrong

The plan expected the parity test to fail on the 21 category pages only. It
failed on 33. Twelve `/start` pages have no `category` in their markdown, so
the static registry gives them `[]`, while the seed gives each sub-page its
parent's category because the DB requires one. We kept that as a fourth
commented allowance rather than changing content. Adding categories to
`start.md` files could have pulled `/start` pages into category listings.

The first version of that allowance took the expected value from the same seed
row that built the response, so it compared the seed with itself. The review
caught this. It now applies only to `/start` urls and expects the parent's
*static* category.

## Open questions

- The `/start` category gap between api_v2 and static content is real and is
  now only documented. Analytics (`-page-view-event.ts`) will report the
  parent's category for these pages once api_v2 serves them.
- The editor_v2 failures seen during the build are outside this change: 6
  "current GovBB landing content" cases in `tests/pages/markdown.test.tsx`
  (About Barbados image pages), and the prerender error `'@tanstack/router-core'
  does not provide an export named '_getRenderedMatches'`. Not yet filed.
