# Drop the `featured` and `section` frontmatter keys on v2-rewrite (#3259)

## Context

The estate has two frontmatter keys that nothing renders. `featured` is on 33 pages and `true` on 4 of them. `section` is on 6 pages and is always "Travel, ID and citizenship". Both came in with the alphagovbb import. The homepage "Featured" column is a hand-picked list (#2496) and doesn't read `featured`. `section` duplicates the page's category title. We decided to drop both before the staging and prod imports, so no environment's database ever holds them. Under the one-PR-per-issue rule, the `main` half is #3519 and this is the `v2-rewrite` half.

## What we did

- Deleted the keys from `v2-rewrite`'s markdown (39 files, one line each), from api_v2's `Frontmatter` schema, and from `FRONTMATTER_KEYS` in `build-seed-data.ts`.
- Removed them from editor_v2's Markdown round-trip. Both keys now hit the existing unknown-key refusal ("Remove this field; the content API does not keep it"), and `page-markdown.test.ts` has one row for each key.
- Removed them from landing's api_v2 adapter (`api-v2-page.ts`) and its contract test. The adapter test's "wrong type is dropped" row now uses `source_url`.
- Also removed them from landing's static schema (`frontmatter.ts`, `registry.ts`). This is the same 4-line deletion as #3519.
- Regenerated `openapi.json`, `openapi.d.ts` and `estate.json` with their generators.

## Why we did it that way

- **Drop rather than keep them inert or render them.** Once the database is the source of truth (ADR 0129), a dead key imported into prod stays there for good, because there is no later clean-up import. Keeping them would also leave `featured: false` showing in the editor's YAML on 29 pages: a setting that does nothing. And `section` would drift the first time someone renames the category (#3107).
- **Refuse, don't strip, in the editor.** An author who pastes old markdown that still has `featured:` is told to remove it. The editor doesn't quietly drop it, which keeps the editor's rule that unknown keys are refused.
- **Static-schema lines included even though they are #3519's.** The plan left `frontmatter.ts` and `registry.ts` to the `main` PR. On `v2-rewrite` that would leave a schema for keys its own markdown no longer has, and the plan's grep check would fail. The deletion is identical to #3519's, so merging `main` into `v2-rewrite` later is clean.
- **No migration.** The keys live in untyped `frontmatter` jsonb. `z.object` strips unknown keys on every write, and #3234's forced re-import replaces sandbox's 39 rows that still carry them.

## Open questions

- `editor_v2:build` still fails at prerender (`@tanstack/router-core` has no `_getRenderedMatches` export). The failure was already there and is not caused or fixed here; see `2026-10-30-seed-keeps-preview-publish-date.md`.
- Chat's `packages/content` schema still parses `section` into chunk metadata, which nothing reads. It was left alone under the legacy-apps rule and goes away with the markdown in #3165.
