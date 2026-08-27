# Licence page pattern: aligned to the finalized swimming pool page

## Context

`content-prompt.ts` gained a "licence and application" page pattern in #2484,
built around a worked example of the hotel licence page. Since then the content
designers finalized the swimming pool licence page, and the shipped pages moved
with it — `apply-for-swimming-pool-licence.md`, `apply-for-hotel-licence.md` and
`apply-for-temporary-restaurant-permit/index.md` all use a heading sequence the
prompt never learned. The prompt (and the `service-page-content` skill that
defers to it) was teaching a shape no live page uses any more.

Isaiah supplied the finalized page as the target.

## What we did

Rewrote the licence-and-application pattern in
`apps/form_builder_api/src/ai/content-prompt.ts` around the swimming pool page,
and updated the route-list guidance in
`.claude/skills/service-page-content/SKILL.md` to match. The sequence changes:

- `## How to [service task]` → `## Complete the form` (fixed wording)
- `## How long does it take?` deleted — the completion time moved inside the
  online route's list item
- `## Cost` moved to after the routes section
- `## Need assistance` → `## Contact`
- routes changed from lowercase fragments to **bold titles** with indented detail
- `## What happens after you apply` changed from prose to bullets

Everything that depended on those names moved too: the GOV.UK list-style
exception, the route-list mechanics, cost/timing, route-choice, contact layout,
start-button placement, quality checks and hard rules.

## Why we did it that way

**The finalized document beat the shipped page on style, but not on markup.**
The two disagreed in small ways, and Isaiah chose the document verbatim: US-style
dates ("December 31st", not "31 December"), the passive "It is suggested that
you submit…", and `(s)` plurals. Those now diverge from the three shipped pages,
which is a deliberate call — the document is the newer artefact, and the prompt
teaches style while the pages will catch up. Where the document had plainly lost
formatting on paste we did *not* follow it: the polyclinic phone numbers and
emails are markdown `tel:`/`mailto:` links, and a rule now says so explicitly,
because an untappable phone number on a mobile page is a real regression and the
paste had simply stripped the anchors.

**Bold route titles, not `###`.** The document shows the two route titles in
bold; the three shipped pages write them as `###` sub-headings inside the list
items. The likeliest explanation is that the document lost a heading level on
paste — but Isaiah picked bold as the rule anyway, so bold is what the prompt
teaches. The skill flags the `###` carry-over on the shipped pages so nobody
copies it forward. That one detail needs a content PR to reconcile.

**Two typo classes were not propagated.** "Planning and Developmental Department
(formally Town and Country Planning)" became "Planning and Development
Department (previously called…)", "St. Phillip" became "St. Philip", `5363214`
became `536-3214`, and a stray full stop came off a bullet. A worked example is
read as canonical by the model, so shipping errors in it teaches the errors.

**The worked example no longer demonstrates a "You must:" list**, because the
pool service has no eligibility restrictions. The section rule still describes
the list, and a closing note explains its absence, so the pattern is not lost.

**No ADR.** `content-prompt.ts` is declared the single live source of truth for
these patterns, and the skill's Step 1 forces a read of it before any page is
written. A decision record restating the heading sequence would be a second
copy of a ruleset that changes as designers learn things — exactly the drift
that arrangement exists to prevent.

**Prettier was reverted.** `prettier --write` on the skill markdown reflowed two
tables the change never touched, turning an 18-line edit into 56. There is no
`prettier --check` in CI and repo markdown is already unformatted at HEAD, so
the new table rows were hand-padded to the existing column widths instead.

## Open questions

- Four shipped licence pages still close with `## Need assistance`
  (`apply-for-swimming-pool-licence.md`, `apply-for-hotel-licence.md`,
  `apply-for-funeral-establishment-licence/index.md`,
  `apply-to-buy-nhc-land-or-property.md`). Deliberately out of scope here —
  renaming published headings is a content-designer call.
- The three EH pages' `###` route titles need reconciling with the new bold rule.
- The prompt's dates and voice now differ from every shipped page. If the
  designers meant the shipped style instead, the fix is three sentences in the
  worked example.
