# Form Builder AI: prompt must never emit duplicate fieldIds/stepIds

## Context

Issue [#570](https://github.com/govtech-bb/gov-bb/issues/570). The Form Builder
AI (`apps/form_builder_api/src/ai/system-prompt.ts`) could generate recipes with
duplicate `fieldId`s — a uniqueness violation the server-side backstop (#206/#207)
rejects, surfacing as a failed generation. The specific failure: when the **same
component is reused** (e.g. `components/date-of-birth` placed in two steps), the
model fell back to the component's **default** `fieldId` instead of assigning a
distinct override, so the defaults collided. Planned in
`docs/plans/form-builder-ai-prompt-unique-ids.md`, branched from `sandbox`.

This is a prompt-quality change plus a regression guard — no API/validation
behaviour changed.

## What we did

- **Strengthened Rule 1** with a *Reused components* paragraph: the same
  component used more than once — including across different steps — MUST get a
  distinct `fieldId` override each time, never the component default. Added a
  JSON worked example reusing `components/date-of-birth` across two steps, each
  with its own `fieldId` + `label`.
- **Added Rule 1b**: every `stepId` must be unique across the form (previously
  absent from the Critical Rules, despite being the same class of violation).
- **Two regression assertions** in `system-prompt.spec.ts` — presence checks for
  the repeated-component fieldId guidance and the stepId rule (written
  test-first: confirmed red, then green).

## Why we did it that way

- **Prompt fix, not another backstop.** The server-side gate already rejects
  duplicates; the design is single-shot (PDF in → recipe out, no conversational
  retry), so a rejected recipe is a failed generation from the user's view. The
  prompt has to get it right the first time.
- **Strengthened the existing rule rather than adding a new section.** Rule 1
  already said "unique across the entire form, never rely on the default" — the
  gap was that it didn't make the *repeated-component* case unmissable. Keeping
  the guidance in one place avoids scattering/duplicating intent.
- **Presence checks, not behavioural tests.** A prompt's effectiveness on the
  live model can't be unit-tested deterministically. The assertions guard against
  a future edit silently deleting the guidance — that's the testable invariant.
- **Worked example reuses only registry-resolvable refs.** The example uses
  `components/date-of-birth`; the existing ref-resolution spec assertions would
  fail on any `components/<x>` the builtin registry can't resolve, so the example
  is safe by construction.

## Status / follow-ups

- TDD: both new assertions watched fail (RED, correct reason), then pass (GREEN).
  `nx test form-builder-api` → 42 passed (40 prior + 2 new). `nx build
  form-builder-api` clean.
- No ADR: this honours an existing principle (recipe uniqueness, #206/#207); it
  doesn't establish a new convention.
</content>
