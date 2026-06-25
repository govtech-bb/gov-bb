# Teach the AI prompt the step-level behaviours

## Context

The Form Builder AI system prompt
(`apps/form_builder_api/src/ai/system-prompt.ts`) documented only the two
field-level behaviours — `fieldConditionalOn` and (since #761) `optionalIf`.
The other half of the `behaviourSchema` union — the **step-level** behaviours
`stepConditionalOn`, `repeatable` and `sharedFields` — was undocumented, so the
AI silently omitted them: an author asking for "a step that only appears if the
applicant said yes" or "let them add several endorsements" got an invalid or
incomplete recipe even though the schema, runtime and manual builder already
supported them. Issue #770. Work on branch `ai-prompt-step-behaviours-770`
(targets `sandbox`).

## What we did

- **Prompt** (`system-prompt.ts`): four new sections after the Alternative
  Identity Pattern —
  - a **Step-Level vs Field-Level Behaviours** lead-in establishing that these
    behaviours sit in a `behaviours` array *on the step* (sibling of
    `elements`, after it), with a skeleton;
  - **Conditional Steps (`stepConditionalOn`)** — JSON literal + the
    required-`targetStepId` note + the reused kebab/lowercase `value` rule;
  - **Repeatable Steps (`repeatable`)** — `min`/`max` + both optional labels,
    the omit-don't-blank note, the Rule 14 reconciliation, and the worked
    gate-plus-repeatable pattern modelled on the live conductor-licence recipe;
  - a **`sharedFields`** sub-note, only as an adjunct to a repeatable step.
- **Guard spec** (`system-prompt.spec.ts`): 5 assertions (TDD, written red
  first) pinning each new section, plus a **negative guard that `fieldArray` is
  never mentioned**.
- No schema, runtime or builder changes.

## Why we did it that way

- **`fieldArray` deliberately excluded, and the prompt stays silent about it.**
  `fieldArray` is a field-level repeating-inputs primitive that conceptually
  overlaps a repeatable *step*; teaching it risks the model reaching for it when
  it means a repeatable step — a worse failure than not knowing it. Naming a
  behaviour only to forbid it invites misuse, so the exclusion lives in the
  negative guard test and this summary, not in the prompt text.
- **`sharedFields` documented only as a repeatable adjunct, never standalone.**
  It is meaningless without `repeatable` (it names the fields filled once on a
  shared page rather than per instance). The worked example was given a *second*
  per-instance field (`endorsement-date`) so the "answered once vs per
  instance" split is actually visible — sharing the step's only field would
  have made the repeat look pointless (caught in review).
- **Rule 14 reconciled, not contradicted.** Rule 14 bans the top-level
  `addAnother` key (the frontend injects that radio). The new repeatable section
  introduces `addAnotherLabel`, which only *labels* that auto-injected radio —
  a different key — so the prompt spells out the distinction explicitly.
- **The zod schema was intentionally NOT tightened to `min >= 1`.** The prompt
  teaches `min >= 1`, and it was tempting to enforce that in
  `repeatableBehaviourSchema`. We did not, because #771 already enforces it at
  the *author-time* layer (`validateFormContract`) while deliberately keeping
  the parse schema lenient so legacy recipe versions still load. A live legacy
  recipe — `post-office-redirection-individual/1.2.0.json` — carries `min: 0`
  (fixed to `1` from v1.3.0); the parse schema runs against every version at API
  boot, so a strict `min(1)` would throw in `onModuleInit` → API crash → ECS
  rollback, a failure CI never catches because it doesn't boot the API. The
  enforcement the prompt relies on already exists at the safe boundary.

## Open questions

- None.
