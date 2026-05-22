# Surface bank-holiday calendar in /services listing

Resolves [#65](https://github.com/govtech-bb/gov-bb/issues/65) — _Bank holiday calendar missing from /services listing_.

## Goal

Make `/bank-holiday-calendar` discoverable from `/services` so users don't need
to know the URL to find it. The page itself (the React route at
`apps/landing/src/routes/bank-holiday-calendar.tsx`) stays unchanged; only its
visibility in the alpha services listing changes.

## Approach

A content stub for the bank-holiday calendar already exists at
`apps/landing/src/content/bank-holiday-calendar.md`. It has `stage: alpha`, so
it's already picked up by the `/services` listing — but its frontmatter sets
`category: work-employment`, which the registry uses to build the URL as
`work-employment/bank-holiday-calendar`. That breaks the link in two ways:

1. The listing in `/services` points at the wrong URL.
2. Following that link routes through the MDX catch-all (`$.tsx`) and renders
   the stub's empty body, not the React calendar.

**Fix:** remove the `category` field from the stub. The registry then builds
the URL as the bare leaf (`bank-holiday-calendar`), and TanStack Router's
explicit file route for `/bank-holiday-calendar` takes precedence over the
catch-all, so the real React calendar renders.

This matches lead direction: content-stub approach, no category, URL stays
`/bank-holiday-calendar`.

### Alternatives considered

- **Hardcode a list of non-content routes in `services.tsx`** — rejected as
  off-spec; the lead chose the stub route. Would also fork the listing into
  two registries (auto-generated + hand-maintained).
- **Tidy other stub fields** (`description`, `featured`, `publish_date`) at
  the same time — deferred. None of them affect the listing, and leaving
  them keeps the change to a single line and lowest risk.

## Scope

- Remove `category: work-employment` from
  `apps/landing/src/content/bank-holiday-calendar.md`.
- Nothing else.

## Files

- `apps/landing/src/content/bank-holiday-calendar.md` — delete the `category`
  line from the frontmatter.

## Verify

1. Visit `/services` — "Check bank holiday dates" appears in the alphabetical
   list, labelled "Information service" (since the stub has no `form_id` and
   no `/start` sibling).
2. Click it — browser lands on `/bank-holiday-calendar` and the real React
   calendar renders (year switcher, next-holiday hero, substitution notice).
3. Existing tests pass: `pnpm --filter @govtech-bb/landing test`.
4. Grep confirms no other code path references
   `work-employment/bank-holiday-calendar`.

## Branching

Branch off `dev` as `fix/services-listing-bank-holidays`. Use `fix/` because
this restores discoverability of an existing page that was effectively broken
from the listing, not a new feature.

## Open questions

None. Lead direction confirmed; codebase verification complete (no other
references to either URL; no other category-less alpha pages whose precedent
would conflict).
