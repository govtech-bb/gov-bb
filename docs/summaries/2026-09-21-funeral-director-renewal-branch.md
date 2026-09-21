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

Adds `application-type` to the `documents` step, immediately before the two
statutory questions:

> Is this a new licence or a renewal?
> — A new licence (`new`)
> — A renewal of my existing licence (`renewal`)

and gates both `experience-route` and `letter-evidencing` on it:

```json
{
  "type": "fieldConditionalOn",
  "targetFieldId": "application-type",
  "operator": "equal",
  "value": "new"
}
```

`fieldConditionalOn` toggles visibility rather than relaxing `required`
(`optionalIf` would leave both fields on screen for a renewal, asking a
question that does not apply). On `renewal` neither renders and the step
advances on the two uploads alone; on `new` both are required exactly as
#2726 left them.

## Why the question sits in `documents`

It is not a document, but neither is `experience-route`, which #2726 already
put there — and keeping the branch next to the two fields it controls means
the whole conditional reads in one place. Where it *should* live is part of
the Environmental Health content pass in #2725, which will restructure this
step anyway.

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
`new`/`renewal`, that both statutory fields are required *and* carry the gate,
and that the "1984" qualifier survives in the option label.

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
- No renewal licence number is collected. #2717 — worth doing together with
  this, since `application-type` is now the field it would hang off.
- The option wording for both routes is Environmental Health's call; #2725
  asks for that pass.
