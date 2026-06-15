# 0051 — A red deploy-gate smoke is triage, not an automatic spec update

## Context

The `deploy-sandbox` post-deploy smoke matrix (`.github/workflows/deploy-sandbox.yml`
→ `forms-smoke.yml`) drives each real deployed form end to end against
`forms.sandbox.alpha.gov.bb`. These smokes are the contract between a published
form and what the platform promises that form does; they gate the sandbox
deploy (ADR 0027).

A form's recipe changes through two very different channels:

- **Deliberate platform/feature work** — e.g. wiring per-submission school email
  routing (#1213), which made `child-school`/`child-principal-name` `sharedFields`
  and changed how the renderer materialises the repeatable `child-details` step.
- **Form-builder republishes** — which regenerate the recipe from builder state
  and have repeatedly, *silently* dropped code-side behaviours (see ADR 0046 on
  in-place version cuts; the `optionalIf` loss in #761). A republish of
  `project-protege-mentor` (v1.1.0) stripped the `fieldConditionalOn` behaviours
  from six fields, turning conditional inputs into unconditional required ones.

Both surface identically: a red smoke that says "the deployed form no longer
matches the spec." The instinct is to make the smoke pass by editing it to match
the deployed form. When the form change was a regression, doing that **ships the
broken form** and deletes the only signal that caught it.

## Decision

When a deploy-gate smoke goes red after a form changed, the first step is
triage — decide *which side is wrong* before editing either:

- If the form change was **intentional**, fix the **smoke** to match the new form.
- If the form change is a **regression** (a republish dropped behaviour, a field
  became wrongly required, a conditional vanished), fix the **recipe** — the smoke
  already encodes the intended contract and is correct.

Never make a red smoke green by conforming it to a form that regressed. A smoke
that has to be loosened or rerouted to pass is a prompt to ask "did the form
regress?", not a chore to clear.

## Consequences

- Diagnosing a red smoke includes reading what actually changed in the recipe
  (diff the published versions; check whether dropped `behaviours` / flipped
  `required` were intentional) before touching the spec.
- A regression fix is a recipe fix (publish a corrected version), and the smoke
  stays untouched as the proof it's fixed. An intentional-change fix is a smoke
  update that matches the new rendered contract.
- This is why, in the change that introduced this record, `get-a-primary-school-textbook-grant`
  was fixed in the **smoke** (the `sharedFields` split was intentional) while
  `project-protege-mentor` was fixed in the **recipe** (v1.2.0 restoring the six
  dropped conditionals), with its smoke left unchanged.
- Recurring republish-driven regressions are a systemic problem (smoke drift,
  #826); this record governs the per-incident response, not the systemic fix.
