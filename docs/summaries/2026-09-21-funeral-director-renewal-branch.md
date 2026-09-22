# Funeral director licence: keep the statutory gate off renewals

2026-09-21 · `apply-for-funeral-director-licence` · follow-up to #2726 (#2475)

## What was wrong

#2726 made the statutory eligibility gate real. Before it, `letter-evidencing`
carried **no `required` rule at all** — `components/upload-document` ships
none, so the field rendered "Upload letter of evidence (optional)" and every
applicant could skip the evidence the 1984 regulations turn on. #2726 added
`required: true` and the `experience-route` question naming which test the
applicant claims.

That was right for a first licence and wrong for a renewal. The form has never
asked which one it is — there is no new/renewal concept anywhere in the recipe's
21 fields — so "required" meant required for everyone. The landing page
advertises the service as "apply for or renew", and licences expire on 31
December and are renewed each January, so from #2726 onward a renewing director
had to produce a supervision or pre-1984 letter to get past `documents`.

Nothing *removed* a renewal exemption; there was never one. The gate was made
real without the branch that belonged with it.

## What this does

Gates both `experience-route` and `letter-evidencing` on the `application-type`
question:

```json
{
  "type": "fieldConditionalOn",
  "targetFieldId": "application-type",
  "targetStepId": "application-type",
  "operator": "equal",
  "value": "new"
}
```

`targetStepId` is required here and was not needed before. The client defaults
an absent one to the field's own step (`checkConditionalOn` in apps/forms), so
now that the question lives on an earlier step, omitting it would resolve the
gate against `documents`, find no `application-type`, and hide both statutory
questions from everyone — including the new applicants they exist for. The API
evaluator falls back to a flat whole-form lookup, so the two sides would
disagree silently. `cross-step-conditionals.spec.ts` catches exactly this, and
did.

`fieldConditionalOn` toggles visibility rather than relaxing `required`
(`optionalIf` would leave both fields on screen for a renewal, asking a
question that does not apply). On `renewal` neither renders and the step
advances on the two uploads alone; on `new` both are required exactly as
#2726 left them.

## Where the branch question came from

This originally carried its own copy of the question, added to the `documents`
step. #2717 landed first and added the same concept properly — a dedicated
`application-type` first step ("Tell us about your application") whose radio
also reveals the renewal licence number, matching the shape
`apply-for-hotel-licence` and `apply-for-offensive-waste-licence` already use.

The two changes did not conflict textually: they inserted into different parts
of the same file, so git merged them cleanly into a form that asked the same
question twice, in two different wordings, with both radios bound to the same
`application-type` answer key. Nothing in CI catches that — the duplicate
`fieldId` check in `recipe-invariants.spec.ts` builds its `seenFieldIds` set
**inside** the per-step loop, so it only sees collisions within a single step.

So this now adds no question of its own. It reuses #2717's field, whose option
values are already `new` / `renewal`, which is exactly what these two gates
read.

## Pinned against a republish

A Form Builder republish regenerates this recipe from builder state and can
silently drop field-level wiring — that is exactly how #2583 shipped
`letter-evidencing` ungated in the first place, with CI green (#2489, #2409).
`validate-recipes` and `recipe-invariants.spec.ts` both read the file on disk
and cannot see hydrated behaviour, so this adds
`apps/api/src/forms/form-definitions/apply-for-funeral-director-licence.spec.ts`
on the per-recipe pattern already used by `apply-for-restaurant-licence`: it
hydrates the real recipe against `BUILTIN_REGISTRY` and asserts the field
order, that `application-type` is an unconditional required radio with exactly
`new`/`renewal` and sits before `documents`, that both statutory fields are
required *and* carry the gate, and that the "1984" qualifier survives in the
option label.

It also asserts the branch question appears **exactly once in the whole form**,
which is the one thing the step-scoped invariant check cannot see.

That last one matters because `resolveOptionDisplay`
(`apps/api/src/forms/field-display.ts:37`) sends an option's **label**, not its
slug, to the MDA notification email and the CMS webhook. The reviewing officer
reads the label, so the statutory test has to be legible there.

## Verification

`pnpm validate-recipes` 90/90 and the recipe stays canonical (81 non-canonical
files before and after — `--write` is not scopeable, so the other 81 were
restored by hand after normalising this one). `nx run api:test` 1627 passed
(+4). `tsc -b` clean. `nx run-many -t build --exclude=landing,cms` 20 projects.
Smoke spec verified with `playwright --list` — it is a `preview` recipe, so its
spec runs in no CI job (#2489) and only the live `jobstart-plus` smoke gates
the PR.

## Left open

- The start page still lists the letter under "You may need to provide … if …
  prior to … 1984" and contradicts itself on route (b). #2725.
- The smoke walk takes the renewal branch only, so it asserts the two
  statutory fields are hidden rather than filling them. The `new` path is
  covered statically by the hydration spec; walking it too would double the
  real submissions per smoke run.
- The option wording for both routes is Environmental Health's call; #2725
  asks for that pass.
