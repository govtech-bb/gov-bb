# Session summary — food business licence start page, from the regulations

**Date:** 2026-08-20 · **Branch:** `food-business-licence-review-feedback` (off
`main`) · no tracking issue · lands on top of the designer pass recorded in
[the sibling summary](2026-08-20-food-business-licence-designer-pass.md)

## Context

A content pass on the start page at
`apps/landing/src/content/apply-environmental-health-food-business-license/`,
driven by a list of MDA notes and by the Health Services (Food Hygiene)
Regulations, 1969 (S.I. 1969/232, am. 1978/111), made under s.10 of the Health
Services Act, Cap. 44. The brief was to replace the page's informal test for who
needs a licence with the statutory definitions, and to correct several facts.

The regulations were supplied as a scanned PDF. It carries an OCR text layer, so
`pdftotext -layout` reads it; WebFetch alone returns only JBIG2 binary. Worth
knowing for the next FAOLEX document.

## Why it looks the way it does

**The definitions are paraphrased, not quoted.** Reg. 3(1), reg. 2(2) and
reg. 2(1) are rendered in plain English on the page. The reg. 3(2) exclusions
are _not_, and that is deliberate — they hang on a parenthetical exception
("except so far as the handling of food may be involved in the course of a
retail business or in the course of supplying food for immediate consumption")
whose reach decides whether, say, a farm gate shop needs a licence. That is
legal interpretation, so it went to `docs/content-reviews/` as a draft with
questions instead of onto the page.

**The licence expiry was corrected twice, and the second correction reversed the
first.** Reg. 27(2) says the licence "shall expire on the 31st day of December
next after the date of issue", so the page's "lasts for one year from the date
it is issued" read as a plain error and was changed to 31 December. It was not
an error. Environmental Health confirmed this licence renews on the anniversary
of registration, uniquely among their licences — everything else in the family
does expire on 31 December. The page now states the anniversary rule _and_ says
"not on 31 December", because medical certificates on the same page do expire
then under reg. 6(2), and the adjacency invites the conflation. The divergence
from the express words of reg. 27(2) is logged for legal.

The general lesson: the regulation is not automatically the current rule. Check
operational practice before correcting a page against the statute.

**Medical certificate scope moved twice too.** The brief said all staff need one;
reg. 6(1) requires it only of people who handle food. Those turn out to be
nearly the same set, because reg. 2(2) defines handling to cover sale,
preparation, transport, storage, packing, wrapping, display, service and
delivery. The page uses the statutory scope with the breadth spelled out, which
lands where the brief wanted without overstating the law.

**The page was checked against the form, and did not match.** Reading the
recipe's field labels showed the page promising four things the form has never
asked: an ID number, food suppliers, a staff roster, and a medical certificate
upload. Suppliers came off the page. The staff list and the certificates were
built into the form instead, because they are genuinely needed. The ID number
stays pending MDA, still uncollected.

**Removing the headcounts.** The people step asked for men and women separately,
justified in its own note as setting restroom facilities. Reg. 10(1) requires
only facilities "adequate ... in the opinion of the Medical Officer of Health" —
no ratio, no counts — and adequacy is judged on site, which is exactly what
ADR 0068 says to keep off the form. If a separate instrument does prescribe
provision by sex, this should be revisited; nothing in the 1969 regulations
does.

## Verification

`pnpm validate-recipes` (82 files), api 1353 tests, landing 449 tests,
`tsc -b apps/api`, `nx run-many -t build --exclude=landing` (20 projects), and
`pnpm generate:services-index` regenerated with no drift.

## Left open

- **MDA:** whether the ID number is collected at all.
- **Legal:** the reg. 3(2) questions, and what authority the anniversary renewal
  rests on. Both in
  [the review doc](../content-reviews/food-business-licence-reg-3-2-exclusions.md).
- **Sibling parity:** the restaurant licence page now says materially less than
  this one about medical certificates, unannounced renewal inspections, the
  staff list and the planning-number route. Same regime, two different stories.
- **Whether a decision record is owed** for "MDA operational practice overrides
  regulation text, and the divergence is recorded" — proposed, not yet agreed.
