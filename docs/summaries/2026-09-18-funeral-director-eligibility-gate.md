# The funeral director licence gates on its statutory evidence

## Context

#2475 says neither funeral form asks for the eligibility evidence its start
page tells applicants to prepare. That premise was **stale by the time the work
started**. Both recipes were corrected in the 2026-09-09 republishes — the
embalmer form grew a qualification upload with a reference-letter alternative,
the director form grew `letter-evidencing` (#2583). None of those PRs (#2567,
#2583, #2584, #2601, #2603) cite the issue, because the builder generates PR
titles from builder state rather than from the issue that motivated the change,
so the GitHub link graph never formed and #2475 read as untouched.

What was actually left was narrower and worse than the issue describes: the
director's evidence upload existed but carried **no `required` rule at all**,
and no question asked which statutory test the applicant was claiming. The form
displayed an evidence field that an applicant could skip entirely — the
appearance of a gate with none of the effect.

## What we did

One commit against `main` (`cad63784`), touching the director recipe and its
smoke spec. Added `experience-route`, a required two-option
`components/generic-radio` naming which test under the Health Services
(Embalmers and Funeral Directors) Regulations 1984 is claimed; made
`letter-evidencing` required; rewrote that upload's hint; fixed "a licence
funeral director" → "licensed". The embalmer form was left alone — it already
solves its half.

## Why we did it that way

**The director does not need the embalmer's disclosure triad.** The obvious
move was to copy the sibling recipe, which handles the same "qualification _or_
N years" statutory shape with `components/show-hide` +
`fieldConditionalOn` + `optionalIf`. It was rejected because the two forms
differ in the thing that machinery exists for: the embalmer's routes take
**different documents** — an approved-institution qualification, or a letter
evidencing years of practice — so something has to swap which upload is
required. The director's two routes (supervised for 2+ years; worked in a
funeral director's office for 3+ years before the 1984 regulations) are
evidenced by the **same letter**.
The only thing that varies is which test is being claimed, which is a question,
not a branch. A show-hide there would add a toggle that changes nothing about
what gets uploaded, plus two behaviours to keep consistent. One required radio
above one required upload is the smaller mechanism for the same guarantee.

**Requiring the letter is a reading of the start page, and it is the load-bearing
choice.** The page's "You must" list makes the experience an eligibility
condition every applicant meets one of; the letter appears further down under
"You may need to provide", qualified with "if you were engaged in the business
prior to the regulations coming into operation in 1984". Read literally, the
letter is grandfathering-only — which leaves a post-1984 applicant with **no
evidence route at all** while still having to satisfy the "You must" clause.
Treating the letter as the evidence mechanism for both routes is the only
reading under which the form gates on anything. It is also the reading the
embalmer form already took.

**The hint had to change, and this is where the change stops being mechanical.**
The approved scope was a typo fix on that hint. But the existing copy read "If
you have been engaged … prior to … 1984, **then** you need to provide a letter
of evidence" — conditional framing that is merely odd next to an optional
field and actively harmful next to a required one. A post-1984 applicant reads
it as "not applicable to me", supplies nothing, and cannot advance, with the
error message as their only clue. Making a field required and leaving copy that
says it might not apply would have shipped a worse bug than the one being
fixed. Replaced with a plain statement of what the letter must show. Flagged
because it is the single place the change interprets policy rather than
enforcing what the start page already says.

**Verified at the serve layer, because nothing else does.** This form is
`meta.visibility: preview`, and only `public` recipes are live-smoked, so its
smoke spec runs in no CI job — updating it is correctness hygiene, not a gate.
`recipe-invariants.spec.ts` notes the real hole: component refs resolve only at
serve time via `RegistryService.hydrateForm`, and the CI build/test gate never
boots the API, so an unresolvable ref ships and fails in production. A
throwaway spec hydrated the recipe against `BUILTIN_REGISTRY` to confirm
`experience-route` resolves as a radio with exactly two options and
`required: true`, that `letter-evidencing` is required, and that fieldIds stay
unique across the hydrated form. It was deleted rather than committed — the
generic invariant belongs in `recipe-invariants.spec.ts` for all 90 recipes,
not as a one-form special case.

## What we almost got wrong

**Nearly treated the issue as unstarted.** `gh pr list --search "2475"` and
`closedByPullRequestsReferences` both report nothing, and the issue body
describes a form with two uploads and no evidence field. Reading the current
recipe on `origin/main` instead of trusting the link graph is what caught it;
the embalmer smoke spec's own header comment already said "`documents` … now
covers the statutory eligibility evidence (#2475)". Building to the issue's
text would have meant re-adding fields that were already there. For recipe
issues, the recipe is the source of truth and the issue is a historical claim.

**The typo-only fix was a trap.** Doing exactly the approved diff — radio,
required, typo — would have left the contradictory hint in place. The
inconsistency was only visible after re-reading the field as a whole rather
than as three independent edits.

**The first cut of the second option silently restated the statutory test.**
It read "Worked in a funeral director's office for more than 3 years",
dropping the "prior to the regulations coming into operation in 1984"
qualifier that both source bullets (`index.md:26`, `:33`) attach to that
route. Someone with three years of ordinary post-1984 office work would have
read it as describing them and self-certified against a test they do not meet.
Code review caught it. What makes it more than a copy slip is
`resolveOptionDisplay` (`apps/api/src/forms/field-display.ts:37`): option
**labels**, not slugs, are what the MDA notification email and the CMS webhook
payload carry, so the reviewing officer would have seen the mis-stated test
too and had no way to tell from the submission whether the experience was
pre-1984. The narrow lesson: **an option label on a radio is not screen copy,
it is the value that travels with the answer** — so a label that misstates a
rule misstates it downstream as well.

The same review argued the gate locks out legitimate applicants, on the
grounds that both options are grandfathering tests. That reading does not hold:
the "You must" bullet for the supervision route (`index.md:25`) carries no 1984
qualifier — it is the general, present-day route — so a post-1984 applicant
answers it truthfully. The two bullets are joined by "or" and presented as the
eligibility condition, so they are exhaustive as the source states them, and
stopping an applicant who meets neither is what #2475 asked for.

## Open questions

- The route labels are the regulations' two tests, but the wording applicants
  see is Environmental Health's call. #2475's own "Suggested shape" asks for a
  content pass with them; this makes the gate real and gives them something
  concrete to correct.
- The director start page contradicts itself on the second route: its "You
  must" list says "engaged in the business … prior to the regulations in 1984
  for more than three (3) years", its "You may need to provide" bullet says
  "working in a funeral director's office for over three (3) years". The recipe
  follows the latter. Unresolved, and it changes what the radio should say.
- Neither funeral form asks for the current licence number on renewal, though
  both start pages promise it. Not in scope here.
- The embalmer start page has copy bugs untouched by #2472/#2473: it offers "2
  ways to apply for a funeral directors licence" on the embalmer page, and
  duplicates the licence-number bullet across "You must" and "You may need to
  provide".
- Both recipes are under active builder republish. A code-side patch to a form
  the builder still owns can be regenerated away — this one should be carried
  into builder state, or it will need re-applying.
