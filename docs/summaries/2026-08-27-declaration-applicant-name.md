# Declaration step showed no applicant name or date

## Context

The Declaration step on `apply-for-food-business-licence` and
`apply-for-restaurant-licence` rendered only the confirmation checkbox — no
applicant name, no date. Isaiah asked why, assuming the recipes were at fault.

They aren't. Neither recipe declares name/date elements, and none of the ~90
recipes with a `declaration` step do. The pair is injected by the renderer:
`form-renderer.tsx` mounts `<ApplicantNameDisplay />` on any step whose `stepId`
is `declaration`. That component resolves the name by matching each field id
(lowercased, `-`/`_` stripped) against a hard-coded allow-list, and returns
`null` when it finds neither a first nor a last name — taking the date, which
renders in the same block, down with it.

Both recipes name their fields `your-first-name` / `your-last-name`. Not in the
list. Hence: just the checkbox.

Tracked as [#2565](https://github.com/govtech-bb/gov-bb/issues/2565).

## What we did

Added `yourfirstname` / `yourmiddlename` / `yourlastname` to the three sets in
`applicant-name-display.tsx`, extended the JSDoc above them to document the
`your-*` family alongside the three families it already named, and added a spec
case mirroring the existing "applicant-details naming" and "camelCase naming"
cases.

Two files, 30 insertions. No recipe JSON changed.

## Why we did it that way

**Allow-list addition over suffix matching.** The obvious general fix is to
match on normalized suffix — `endsWith("firstname")` — which would repair the
`your-*` family and immunize every future prefix in one stroke. We rejected it
for this change. `findNamePart` iterates `Object.entries(values)` and returns the
first non-empty match, so on a form carrying several role-prefixed names
(`guardian-first-name` _and_ `pupil-first-name`, or `tenant-*` _and_
`landlord-*`) suffix matching makes **object key order decide whose name gets
attested on a legal declaration**. That is a worse failure than the blank we set
out to fix: silent, plausible-looking, and wrong. A bug fix shouldn't acquire
that property. The general fix needs the prior question answered first — whose
name _should_ a declaration show — and that's deferred, not solved.

**The label stays `Applicant's name:`.** On the food-business form,
`completing-for: someone-else` means `your-*` is the person filling in the form,
not the applicant — so the label is arguably wrong in that branch. We left it.
That recipe collects no applicant name anywhere (the `applicant-details` step
takes only telephone, email and address), so there is no truer name available to
show, and the declaration text reads as the submitter attesting: _"I confirm
that I am authorised to submit this application."_ Changing the label is a
content decision, not a rendering one.

**Regression risk was measured, not assumed.** Before touching the sets we
scanned every recipe for one carrying both a `your-*` name and an
already-allow-listed name. Zero. So the addition cannot change which name any
currently-working form resolves — the fix is provably additive rather than
merely-probably additive.

## What we almost got wrong

The first scan of "how many recipes does this affect" said **27**. It was wrong,
and it was wrong in the direction that would have oversold the fix. It counted
only `overrides.fieldId` in the recipe JSON, ignoring two ways a field id gets
its name without appearing there: registry component defaults
(`components/first-name` → `first-name`) and block expansion
(`blocks/personal-information` contributes `first-name`/`last-name`). Re-scanning
with both resolved gave **13**, of which this change fixes **2**.

The correction mattered. At 27-mostly-`your-*` the allow-list patch looks like a
sweeping fix; at 13 it's plainly a two-form fix with eleven other forms failing
for unrelated reasons — role-prefixed names, single full-name fields
(`owner-name`, `applicant-name`, `centenarian-full-name`), or no name field at
all. That reframing is what kept the suffix-match temptation in check and pushed
the real design question into a follow-up instead of smuggling it into a bug fix.
The table of all 13 lives in #2565.

## Open questions

The underlying smell is unaddressed: a display component depends on recipe
authors choosing one of seven blessed field ids, and fails **silently** when they
don't — no warning, no console error, just a missing name on a legal
attestation. The eleven remaining forms need a decision on whose name a
declaration attests, and probably an explicit opt-in on the recipe's declaration
step rather than more heuristics. Captured in #2565's "Out of scope" section.
