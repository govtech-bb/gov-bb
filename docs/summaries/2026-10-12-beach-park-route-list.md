# Beach-park route list (#2483)

## Context

`rehypeHideStartLinks` hides a page's online application route and lowers its
"There are N ways…" count. The beach-park page wrote its routes as `###`
headings with a bare start link, so hiding the route would leave an orphaned
heading under a count of 1. The issue was rescoped on 7 Oct to this one page.

## What we did

- Restructured the routes in `sell-goods-services-beach-park/index.md` as a
  numbered list with the start link nested in item 1 (the hotel page's shape).
  No wording changed.
- Added a guard in `registry.test.ts`: any page with a route-count lead-in must
  keep its start link in an `<li>`. Plus beach-park structure and behaviour
  tests.

## Why we did it that way

- **A sweep, not the issue's list.** All 97 pages with a start link were
  checked. Beach-park was the only one with both a route count and a bare
  link; the ~70 other bare-link pages have no count to desync.
- **A guard, not plugin hardening.** The plugin is right for well-formed input.
  The issue's optional hardening (skip the count rewrite after a bare-anchor
  removal) would change runtime code to tolerate bad content; the guard rejects
  bad content in CI instead.
- **The guard mirrors the plugin's `isWaysParagraph`** (direct text only). The
  first version read nested text and could have failed pages the plugin never
  touches; review caught it.
- **One commit for fix and tests.** Committing red tests on their own would have
  left a failing commit on the branch.

## What we almost got wrong

- **The exposure was wider than the issue said.** `lib/hide-start-link.ts` also
  hides the online route when the page's `form_id` isn't in the forms API's
  available list. That's how the page rendered on a local dev server, so the
  bug wasn't only reachable by gating `/start`.
- **The form builder's entry template** writes a bare start link. It has no
  route-count lead-in, so it doesn't trip the guard. But `placeStartLinkAt`
  strips indentation, so moving the button into a numbered item ends the list.
  Raised as a separate task.

## Open questions

- The guard checks "inside an `<li>`", not "inside the right route item".
  Deliberately simple for now.
