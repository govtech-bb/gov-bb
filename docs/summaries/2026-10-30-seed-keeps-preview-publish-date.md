# The seed keeps the publish date of preview pages (#3331)

## Context

The api_v2 seed stored `published_at` only for public pages. Of the estate's 75 non-public pages, 67 have a frontmatter `publish_date`, and all 67 were seeded as `null`. A reviewer reading a preview page from api_v2 would see no "Last updated" date, and making the page public would date it from the go-live moment. The decision on the issue was Option A: keep the frontmatter date on every page.

## What we did

- `apps/api_v2/src/seed.ts` stores the frontmatter date whatever the page's visibility. An undated public page is dated now, and an undated non-public page stays `null`. `importEstate` calls `seed()`, so the import gets the same fix.
- `seed.test.ts` extends the existing preview-token test. A dated preview page serves its frontmatter date as `published_at` and `content_updated_at`, and an undated one serves `null`.
- Landing's render-parity test no longer special-cases non-public pages, and its "seed drops publish_date for non-public pages" KNOWN entry is deleted.
- The `published_at` descriptions say where the date comes from. The OpenAPI snapshots, a landing comment, an editor_v2 comment and the api_v2 README are updated to match.

## Why we did it that way

- **Undated non-public pages stay `null`, unlike the issue's snippet.** The issue's `new Date(page.published_at ?? Date.now())` would also date the 8 undated non-public pages, with the day the seed ran. In preview they would show a "Last updated" their static pages never had. They would also keep that date forever, because going public (`revisionOf`) never changes a date that is already set. And they would need a new KNOWN entry in the parity test. Keeping `null` keeps the fix to "the date travels with the page".
- **No other change was needed.** Migration 016's insert trigger dates `content_updated_at` from `published_at`, so once the seed stores the date, "Last updated" follows. `revisionOf` keeps a date that is already set, and `app.test.ts` already covers a dated preview page going public. So the test extends one existing case instead of adding a new one, which would mean another full seed in the suite.

## Open questions

- Sandbox's preview pages that were already imported still have `null`. The database can't backfill them, because `publish_date` isn't kept in the `frontmatter` jsonb. The plan is to fix them with the #3234 re-import, not a one-off script.
- `editor_v2:build` fails on `origin/v2-rewrite` with or without this change: `@tanstack/router-core` has no `_getRenderedMatches` export at prerender. This change doesn't cause it, and it isn't fixed here.
