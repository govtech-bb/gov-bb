# Chat feedback form: auto-confirm the declaration instead of removing it

## Context

The in-chat `chat-feedback` form reuses the generic conversational form pipeline,
so it inherits whatever its recipe carries. Issue #1114 had already removed the
recipe's permit-style `declaration` step (cut version `1.2.0`) because confirming
a declaration is the wrong ceremony on a 30-second feedback form.

It regressed. The recipe is republished through the form-builder, which always
regenerates a required declaration step (ADR 0041) — `1.4.0` (#1140) and the
now-served `1.5.0` brought it back, so in-chat feedback was once again asking the
user to confirm a declaration and listing it in check-your-answers. Deleting it
from the recipe is not durable: the next republish re-adds it.

## What we did

Handle the declaration in the chat pipeline so it survives any republish, scoped
to the feedback form only (real forms' declarations are untouched):

- **`form/auto-confirm.ts`** (new) — config `AUTO_CONFIRMED_STEPS` maps
  `chat-feedback → "declaration"`. `isAutoConfirmedField()` answers "skip this
  field everywhere it would be surfaced"; `applyAutoConfirmedValues()` fills it.
- **`form/schema.ts`** — `askableFields` (the shared walk behind the schema
  disclosure *and* the ask cursor) skips auto-confirmed fields, so the model is
  never told about the declaration and the cursor never lands on it.
- **`form/submit.ts`** — seeds the declaration on a **copy** of the values at the
  submission boundary, so it reaches the forms API (which still requires it) but
  never enters `session.values`.
- **`form/tools.ts`** — defence-in-depth: the explicit-`fieldId` `ask_field`
  path and the `set_field` "revealed fields" loop both skip auto-confirmed
  fields, so the invariant holds in every field-surfacing path even if a future
  recipe makes the declaration conditional.

ADR 0049 records the principle. Gates: `nx run chat:test` (160 pass) +
`nx run chat:build` green.

## Why we did it that way

**Auto-confirm, not recipe deletion.** #1114 deleted the step; the form-builder
regenerated it. The durable lever is the chat pipeline, not the recipe. The
recipe stays the source of truth for real forms; the chat adapts around the
ceremony it owns. This supersedes #1114's approach (ADR 0049).

**Seed at the submission boundary, not in the session.** Because the seeded
value lives only on the submit-time copy and never in `session.values`, the
check-your-answers review (`buildReviewItems`) and the model's "already
collected" prompt block omit the declaration with *no change to those paths* —
they already skip fields with no value. The only places that needed a skip were
the ones that enumerate the *schema* (disclosure/cursor), not the *values*.

**The value is `"confirmed"`, not a boolean.** `components/confirmation` is a
checkbox carrying a single option `{ value: "confirmed" }` (not a bare boolean),
so the forms app stores the option value and the submit coercer routes through
`coerceList`. Seeding a boolean `"true"` would fail option validation. The value
is derived from the field's options (joined values, else `"true"`), so it stays
correct if the recipe's confirmation option ever changes. A test pins this: a
rating-only submission *fails* validation, and *passes* once the declaration is
seeded as `["confirmed"]`.

**Scoped per form.** Auto-confirm is keyed by `formId`. A real application's
declaration is legally load-bearing and is still collected and confirmed by the
user; tests assert the same declaration field on `get-birth-certificate` is
disclosed and asked normally.

## Open questions

None on the logic (unit-tested). Live wording ("Thanks for your feedback!", no
declaration prompt, no reference) is prompt-driven, so worth an eyeball on the
Amplify preview.
