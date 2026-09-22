# Funeral embalmer licence: keep the statutory evidence off renewals

2026-09-22 · `apply-for-funeral-embalmer-licence` · #2790, mirror of #2739 (#2735)

## Context

#2735 found the funeral **director** form making a renewing applicant produce
the evidence that qualifies a *first* licence; PR #2739 gated those fields on
`application-type = new`. The embalmer form had the identical defect and was
not touched. Its `documents` step demanded either the embalmer qualification
or a letter of embalming experience from everyone, while the form already
asked "new licence or renewal?" on its first step (#2717 / PR #2737).

## What we did

- Gated `embalmer-qualification`, `use-reference-letter` and
  `embalmer-evidence` behind `fieldConditionalOn application-type = new` with
  `targetStepId: "application-type"`, appended after each field's existing
  behaviours. Nothing else in the recipe moved.
- Added `apply-for-funeral-embalmer-licence.spec.ts` on the director's
  per-recipe hydration pattern: branch question asked once and before
  `documents`, field order, the two unconditional uploads, and the exact
  behaviours arrays on the three gated fields.
- Rewrote the smoke spec's two walks: renewal asserts the three fields are
  hidden and advances on ID + photograph; new licence opens the disclosure
  and uploads both evidence files.

## Why we did it that way

**Visibility, not `optionalIf`.** `optionalIf` would leave the three fields on
screen for a renewal, asking a question that does not apply. The gate hides
them, and both evaluators skip a hidden `required` field: the client unmounts
it (TanStack Form yields no errors for an unmounted field) and the API
validates only `activePrimitives`. The final review traced both paths rather
than trusting the sibling fix.

**Existing behaviours stay.** Stacked conditions combine with AND on both
sides, so `embalmer-evidence` keeps its `use-reference-letter` condition and
gains the branch gate. Twelve fields in `referral-student-support-services`
already stack `optionalIf` + `fieldConditionalOn`, so the shape had precedent.

**The show-hide toggle is gated too.** This is the first `components/show-hide`
in the repo to carry a behaviour. The renderer evaluates `fieldConditionalOn`
before switching on `htmlType`, and it renders the toggle's controlled fields as
its children, so on a renewal the toggle and the evidence upload vanish
together — no orphan bordered box, nothing on check-your-answers, nothing in
the payload (`getVisibleFields` evaluates behaviours rather than trusting the
render flag).

**Two smoke walks, and which routes.** The issue asks the smoke spec to cover
both branches; the director fix deliberately kept one walk to avoid a second
real submission per run. Here Isaiah chose two walks and, for the new-licence
walk, the reference-letter reveal (the thing #2475 was raised about) over the
disclosure-closed route. That route is therefore no longer walked live; the
hydration spec pins the qualification's `optionalIf` + `required` statically,
and that spec runs in CI on every PR while this smoke spec — a `preview`
recipe — runs in no CI job at all.

**Why the walk order and assertions look the way they do.** The renewal
walk's three hidden assertions reuse the exact locators the new-licence walk
clicks or uploads through, so each is proven to match a real element by the
sibling walk. The new walk asserts the "Your current licence number" row is
absent from check-your-answers, because a count-0 on a value that was never
typed can't fail.

## What we almost got wrong

PR #2786 (merged an hour before this branch started) also edited this smoke
spec, but branched before #2737 added the `application-type` first step. Git
merged it cleanly, and the result was a second walk that went straight from
opening the form to personal details — it could never pass, and nothing in
CI runs it. Merging #2786 first and rebuilding both walks on top was the
cleanest way out; this is the second time in a week two green PRs have
composed into a broken file on this form family (see #2737 + #2739 on the
director).

The issue's note to "clear the sandbox draft row" no longer needs a hand
`DELETE`: `archive-merged-drafts.yml` deletes the draft rows of every recipe
changed in a push to `main`. Confirm that run went green after merge.

## Open questions

- A hand-crafted POST that omits the `application-type` step never validates
  the gated fields (the gate fails open on a missing answer, and an absent
  step produces no instance). Identical on every `fieldConditionalOn`-gated
  required field in the repo, including the director; the UI path is blocked
  by the step guard. Not addressed here — raise separately if a step-presence
  check is wanted.
- `apps/forms/e2e/` is outside every tsconfig and CI's `tsc -b`; a type error
  in a smoke spec surfaces only on a manual live run.
- The gate cannot be observed on the PR preview (it talks to the shared
  sandbox API, which serves the recipe on `main`). Walk the renewal branch on
  sandbox after merge.
