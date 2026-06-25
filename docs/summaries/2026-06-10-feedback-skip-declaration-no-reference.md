# Chat feedback form: skip declaration, hide the reference number

## Context

The in-chat `chat-feedback` form (introduced earlier the same day, recipe
`chat-feedback/1.1.0.json`) reuses the generic conversational form pipeline. It
therefore inherited two ceremonies built for real government applications that
feel wrong on a 30-second feedback form: a required **declaration** the bot made
the user confirm before submitting, and a **reference number** the bot recited
on success ("Reference number: XYZ"), exactly as it would for a permit. Issue
[#1114](https://github.com/govtech-bb/gov-bb/issues/1114).

## What we did

- New recipe `chat-feedback/1.2.0.json` with the `declaration` step removed
  (kept `your-feedback`, `check-your-answers`, `submission-confirmation`).
- `feedback.ts` — `submitSuccessForModel(slug, ref)` returns `{ok:true}` for the
  feedback form, `{ok:true, referenceNumber}` otherwise. Wired into both
  `submit_form` success paths in `form/tools.ts`.
- `prompts.ts` — extended `FEEDBACK_COLLECTION_GUIDANCE` with a submit-success
  line: warm one-line thank-you, never report/invent a reference.
- `run-turn.ts` — comment-only: documented why the line-505 reference reminder
  is unreachable for the feedback form.

Commit `bd7a73ee` (feature) + the run-turn comment.

## Why we did it that way

**Reference number — suppress display, not generation.** The user's ask was
"no reference number," which split into (a) don't show it, vs (b) don't generate
it. We chose (a). Generation lives in the shared forms-API submission handler,
and `submit.ts` *hard-requires* an upstream reference (it returns `ok:false`
without one), so killing generation would mean special-casing shared
infrastructure for one form — bigger blast radius, no user-visible gain over
suppression. So the submission still goes upstream, still gets an id, and we
still store it on `session.referenceNumber` (the no-resubmit guard reads it). We
only withhold it from the value handed to the model.

**The real lever was the tool result, not the post-submit reminder.** The
obvious-looking place to suppress the reference is `run-turn.ts:505`, which
injects "Reference number: …" into the prompt on a submitted turn. It turned out
that block is *already* dead for feedback: `pinSessionForm` resets a submitted
feedback session (clearing slug/status/reference) at the top of the next turn,
so a post-submit feedback turn resolves to `kind: "none"` and never re-enters
the collect branch. And the submission itself happens mid-turn — the system
prompt was built before the tool ran — so the model only learns the reference
from the **`submit_form` tool result** that turn. That's why suppression lives
in the tool result (`submitSuccessForModel`) plus a `FEEDBACK_COLLECTION_GUIDANCE`
line, and `run-turn.ts:505` got only a clarifying comment. The model schema in
`chat-tools.ts` already declared `referenceNumber` optional, so omitting it
needed no schema change.

**Declaration — recipe-only, new version.** Removing the step is a pure recipe
edit; no invariant requires a declaration step (`recipe-invariants.spec.ts`
checks filename/version/formId and a passport rule only), and server-side submit
validation only checks *active* fields, so the dropped `declaration-confirmed`
simply stops being required. We followed the repo's one-version-per-change
convention (`1.2.0.json`, leave `1.1.0.json`) rather than editing in place; the
loader auto-serves the highest semver.

## Open questions

None. Live wording ("Thanks for your feedback!", no reference) is prompt-driven,
so it's worth an eyeball on the Amplify preview, but the logic is unit-tested.
