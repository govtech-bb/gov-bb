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
- **Landing validates the response shape, not the taxonomy rules.** Its Zod
  parser checks `string | null`; slug syntax, length and category relationships
  belong to api_v2. See "Second review" for how lenient the parse now is.
- **Parity is checked offline against the snapshot.** The responses are built
  from parsed `estate.json` data and pass through `resolveApiV2Page`, including
  the HTTP response parser and markdown compiler. A content change without
  `pnpm --filter @govtech-bb/api-v2 seed-data` fails `landing:test`. Landing
  has an implicit nx dependency on api_v2, so a seed-only change reruns it.

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
_static_ category.

## Open questions

- The `/start` category gap between api_v2 and static content is real and is
  now only documented. Analytics (`-page-view-event.ts`) will report the
  parent's category for these pages once api_v2 serves them.
- Six editor_v2 "current GovBB landing content" cases still fail in
  `tests/pages/markdown.test.tsx` (About Barbados image pages). They also fail
  on the unchanged `v2-rewrite` base at `597abd6f`.

## Review follow-up

The branch now includes `v2-rewrite` at `597abd6f`. The breadcrumb parser and
the updated history documentation survive the merge. Category metadata and
breadcrumbs still use one chain, whose type permits only zero, one or two levels.

The API tests cover a page whose address differs from its category, unfiled
pages, and a seeded subcategory page that remains hidden without a preview token.
The built-server HTTP tests check the same public response fields. Landing's
regression tests reject wrong taxonomy field types and keep older API responses
working, without reapplying the API's authoring rules.

Verification on the integrated branch:

- api_v2: 521 tests pass; the built-server page suite passes all 13 HTTP tests.
- Landing: all 122 snapshot pages pass through the parser and compiler and match
  their static twins.
- All three app typechecks and changed-file lint pass. Both generated API
  contract snapshots match.
- All 24 non-landing build targets pass with `VITE_API_ORIGIN` configured.
  The earlier `_getRenderedMatches` failure no longer reproduces on this base.
- Postgres must use the C locale for the unrelated employee-list order assertion:
  `en_US.utf8` sorts the two fixture email addresses in the opposite order.
  This review used a disposable Postgres 16 container initialized with
  `POSTGRES_INITDB_ARGS=--locale=C`. No application code changed for that check.

## Second review (sajclarke)

- **The parse accepts what the old guard accepted.** Only `url`, the title,
  `body_markdown`, `hide_start_links` and `breadcrumbs` can reject a page.
  Every other field falls back alone (`form_id`/`published_at` to null, the
  rest dropped), timestamps may carry an offset, and unknown frontmatter keys
  pass through. A bad optional field must not 404 a page with no static twin.
- **No `category` key means an older API, not an unfiled page.** Landing
  files it under the url's first segment again, so analytics keeps a category
  until the new API deploys. An explicit `null` stays unfiled.
- **A subcategory without a category is a malformed miss**, matching the
  static registry. On api_v2, `pageCategory` (which replaced `categoryChain`
  and `categoryCrumbs` with one lookup) returns a union that can't express it.
- **The API mapping is tested in api_v2.** `seed.test.ts` resolves every
  seeded page through the app and checks its taxonomy against the snapshot's
  category rows; reversing the pair fails 18 cases. Landing's parity test only
  restates the mapping to build its input.
- **The merge of `v2-rewrite` brought #3393's render-parity test**, which
  covers what this PR's parity test did. The two were folded into it: it now
  sends the taxonomy and reads every page through `resolveApiV2Page`. It
  imports the snapshot through the `@api-v2-seed/*` alias.
