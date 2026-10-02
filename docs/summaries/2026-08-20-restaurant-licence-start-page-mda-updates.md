# Restaurant licence start page: MDA review updates

## Context

The `apply-to-environmental-health-for-a-restaurant-licence` start page went up
in preview (#2322, #2327) with copy written before Environmental Health had
reviewed it. This session applied their review feedback, the substantive part of
which was that the page's own description of who needs a licence was wrong.

## What we did

One content file: `apps/landing/src/content/apply-to-environmental-health-for-a-restaurant-licence/index.md`.

- Replaced the "who needs a licence" paragraph with the statutory definition.
- Moved the annual application deadline into `Before you start`.
- Removed caterers from the separate-applications routing line.
- Added the floor-plan fallback, tightened the renewal-layout rule, dropped the
  business registration number, de-optionalised medical certificates, and made
  the post-inspection and approval wording stricter.

## Why we did it that way

**The definition is quoted, not paraphrased.** The old copy said a licence was
needed "if you prepare or sell food at a business where customers can sit and
eat", which is narrower than the law: reg. 2 of the Health Services
(Restaurants) Regulations, 1969 covers both on-premises sale *and* "a catering
establishment where food or drink is sold for consumption elsewhere", and
excludes stalls. Anyone running takeaway or catering would have read the old
sentence and concluded the service didn't apply to them. The page now carries a
plain-English lead followed by the exact statutory wording, cited — the same
shape `apply-for-temporary-restaurant-licence` already uses for its
"temporary restaurant" and "food" definitions. Keeping the quote verbatim is
deliberate: it is the one sentence on the page a future editor should not
"simplify", because the plain-English lead above it is what carries the
readability load. Reg. 2's "to sell" ("to offer or expose for sale") and "stall"
("any stand, marquee, tent or mobile canteen") are folded into that lead for
the same reason.

**Caterers now route here, and that was a real reversal.** The page previously
sent caterers to a separate application. Reg. 2(b) puts catering establishments
inside the legal definition of a restaurant, so quoting the definition while
telling caterers to apply elsewhere would have put a contradiction on one page.
Raised it, and Environmental Health's answer was that caterers should apply for
the restaurant licence. The routing line now names only food businesses and
bakers.

**The January deadline is page-level, not renewal-level.** It first read as a
renewal deadline (licences expire 31 December under reg. 3(5)(a), so a
first-business-day-in-January cutoff naturally attaches to renewals).
Environmental Health confirmed it applies regardless of whether you are new or
renewing, so it sits in `Before you start` as its own line rather than under
`Renewing your licence`.

**"Optional" came off the medical certificates bullet without losing the
flexibility.** The old bullet read `medical certificates (optional — you can
upload them now or provide them at the inspection)`, which made a requirement
look like a nice-to-have. The upload-now-or-at-inspection detail is still true
and still useful, so it moved down into the paragraph that already explains who
needs a certificate. The obligation is in the bullet; the timing flexibility is
in the prose.

**The ID number bullet was deliberately left alone.** Environmental Health has
not yet decided which identification number they want, so guessing would have
been worse than leaving the existing Barbados National ID wording in place until
they rule.

**Indexes: only the services index was in scope.** `pnpm generate:services-index`
was run and produced no drift, which is the expected outcome — the index bakes
only slug, title, category, formId and visibility per page, and a body-copy edit
touches none of them. `pnpm generate:form-categories` was also run, and it
*does* dirty its output, but only as prettier formatting (it writes raw
`JSON.stringify` and, unlike the services generator, does not format afterwards).
That churn was reverted rather than committed, since no form→category entry
changed. Worth knowing before anyone treats a dirty `form-categories.generated.ts`
as a real drift signal.

## Open questions

- **Cross-page contradiction, still live.**
  `apps/landing/src/content/apply-environmental-health-food-business-license/index.md`
  says "Restaurants, caterers and bakers have their own applications." With
  caterers moved onto the restaurant licence, that line is now wrong. Left
  untouched here: it is a different page, and another session had it open with
  uncommitted changes at the time.
- **Two facts still need Environmental Health sign-off:** which identification
  number the form should ask for, and whether "Environmental Health cannot issue
  your licence until the problems are fixed" states the consequence correctly.
  The second is inferred from reg. 3(1) plus the inspect-before-issue rule
  already on the page, not quoted from anyone.
