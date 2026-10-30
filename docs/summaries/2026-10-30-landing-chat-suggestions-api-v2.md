# Home chat suggestions follow api_v2 visibility

2026-10-30 · `landing` home page · #3245

## Context

The "Questions you can ask" chips on `/` were filtered by the static registry
plus the `service_status` overlay. In api_v2 mode a page's visibility comes
from api_v2 alone (#3125), so a chip could name a page api_v2 hides, or drop
one it serves.

## What we did

- `lib/chat-suggestions.ts`: the curated filter became `pick(show)`.
  `publicChatSuggestions(overlay)` is unchanged in behaviour.
  `servedChatSuggestions(served)` keeps the questions whose `/${page.url}` is
  in the set. `readServedChatSuggestions()` reads the five target urls through
  `getApiV2Page`, and `getServedChatSuggestions` is its server-function wrapper.
- `routes/index.tsx`: a `loader` picks the mode on
  `categoryTree.kind !== 'disabled'`, the same switch `homeCategories` uses.
  `Home` reads the questions from `useLoaderData`.

## Why we did it that way

**Five cached page reads, not `/catalog`.** One `GET /catalog` would replace
five requests, and open PR #3453 adds a catalog reader with a 60 s cache. We
kept the page reads for two reasons. They sit behind `apiV2Cache`, which
expires when the site version moves, so a publish reaches the chips in about
5 s. #3453's cache doesn't expire that way, so it would take up to 60 s. The
page reads also don't depend on an unmerged PR. The cost is that a cold cache
(after every publish) makes `/` wait on five reads. If the k6 TTFB budget on
`/` trips, switch to the catalog reader; `servedChatSuggestions` stays the same
either way.

**Which answers count as served.** A `page`, a `redirect` (the page is public
at another url) and a `compile` miss count. A `compile` miss means api_v2 did
serve the page publicly; only landing's compile failed. Every other miss (not
found, timeout, an open breaker) says nothing about visibility, so the chip is
dropped. A missing chip costs nothing; a chip for a hidden page is the bug.

**A rejected call shows no chips, not an error page.** In the browser the
server function is an RPC and can reject (offline, a 5xx, a server deployed in
between), and a rejected loader puts the root `ServerErrorPage` in place of the
whole home page. The loader catches the rejection and returns `[]`, the same
guard `categoryTreeQuery` uses. The review caught this. On the server,
`readServedChatSuggestions` never throws.

**A plain function wrapped in a server function.** A `createServerFn` can't be
called in Vitest ("No Start context found"), so the logic lives in
`readServedChatSuggestions`, which the test calls directly. #3453 splits
`readApiV2SearchDocuments` the same way.

## Open questions

- In api_v2 mode, every client navigation to `/` (and every hover on a Home
  link) makes one RPC; before, it made none. It was left as is because the
  server answers from cache. The fix, if needed, is a `queryClient.fetchQuery`
  with a `staleTime`, like the root's `categoryTree` read.
- The chips are still keyed by the static registry's `serviceId`, and
  `PAGES.find` runs in two places. #3220 (removing the static pages) has to
  give the curated entries their api_v2 `url`.
- Until #3220, a page api_v2 holds as preview but the static registry has as
  public loses its chip, yet still renders from the static fallback when
  opened.
