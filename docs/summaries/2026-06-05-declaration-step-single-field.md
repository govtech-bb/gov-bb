# Declaration step pinned to a single confirmation checkbox

## Context

The required `declaration` step had no content contract: the builder seeded it
empty, and the AI system prompt showed the right checkbox pattern but never
forbade extra fields — its own Rule 1 example put a "Date of declaration"
field inside the declaration step. Isaiah asked for both sides to pin the
contract: exactly one field, `components/confirmation`, fieldId
`declaration-confirmed`, label `Declaration`, required. Work done on branch
`declaration-step-single-field` (targets `sandbox`); no pre-existing issue.

## What we did

- **Prompt** (`apps/form_builder_api/src/ai/system-prompt.ts`): new Rule 17
  (exactly one element; extra declaration-section values go on a step before),
  hardened Declaration Checkbox Pattern, fixed the Rule 1 reuse example, and
  swapped the temporal-date row's "date of declaration" example for
  "appointment date". Guard spec pins all of it.
- **Seeding** (`apps/form_builder/app/routes/builder/-recipe-reducer.ts`):
  `makeDeclarationField()` + `makeRequiredStepFields()` seed the checkbox in
  both `makeRequiredSteps()` (new form / RESET) and the `LOAD_DRAFT`
  missing-step fallback. TDD: 4 reducer specs written red first.
- Decision record:
  `docs/decisions/0041-declaration-step-contains-exactly-one-field.md`.

## Why we did it that way

- **Seed on missing only, never re-seed.** `LOAD_DRAFT` keeps any existing
  declaration step verbatim (even one an author emptied) — the seed fires only
  when the step is absent, mirroring how the title/description defaults
  already behaved. A re-seed would fight author intent and risk duplicate
  `declaration-confirmed` fieldIds when AI-generated recipes (which carry
  their own declaration element) are loaded.
- **`options` deliberately not part of the seed.** The checkbox statement text
  stays the registry default ("I confirm") for hand-built forms — per Isaiah's
  spec — while the AI fills in the full statement it extracts from the source
  document. Reviewed and accepted as intentional divergence; only
  fieldId/label/required are the fixed contract (see ADR 0041).
- **Fixed example over new prose where possible.** The Rule 1 example was
  doubly wrong (extra field in the declaration step *and* `date-of-birth`
  repurposed for a non-birth date, contradicting the prompt's own CATEGORY 0);
  replacing it with applicant/parent DOB teaches reuse without modelling the
  anti-pattern. The guard spec bans `"fieldId": "declaration-date"` so the
  example can't drift back.
- **Rule 17 placed in Critical Rules** rather than only the pattern section:
  the pattern shows *how*, but models follow the numbered rules when
  resolving conflicts, and Rules 14/15 already cover sibling platform-managed
  step constraints there.

## Open questions

- None. (Server-side recipe validation does not yet *enforce* the single-field
  contract on submitted recipes — ADR 0041 notes reviewers/validators may
  treat violations as defects, but adding a hard validator was out of scope.)
