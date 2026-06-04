# 2026-06-04 — Surface the human-readable submission reference (#791)

## Context

Staging showed citizens the raw submission UUID on the confirmation page and
in both emails, while live (frontend-alpha) shows `JPP-20260604-130732-9JZRZC`
style codes. The generator and storage already existed —
`reference-code.ts` runs on every submission and `referenceCode` is persisted
on the entity — but nothing downstream read it. The session executed the plan
for [#791](https://github.com/govtech-bb/gov-bb/issues/791).

## What we did

Five commits on `worktree-791-reference-code` (base `1c14477c`):

- `4aaa54ad` — API: `referenceCode` required on `SubmissionCreatedEvent`,
  optional on the SQS wire with consumer-side coalesce, emails render
  `referenceCode ?? submissionId`.
- `1bce07b9` / `d297eee9` — forms: optional zod field, outcome prefers it over
  `id`, confirmation label becomes **"Submission ID"**, smoke helper + two
  smoke specs updated to the new label and code shape.
- `59b4211c` / `9bd52ba5` — review-driven polish and one genuine bug fix (see
  below).

Decision record:
[0040 — cross-deploy payload fields are optional with consumer-side fallback](../decisions/0040-cross-deploy-payload-fields-are-optional-with-consumer-fallback.md).

## Why we did it that way

- **Carry the code on the event, don't look it up in the email processor.**
  An extra DB query per email was rejected: the processor is deliberately
  payload-driven so SQS retries stay idempotent and self-contained.
- **Optional-on-wire, required-internal** (the ADR): coalescing once in the
  SQS consumer's `toEvent` lets the internal event type stay `string`, which
  made the compiler enumerate every event-construction site — that's how the
  `payment-webhook.service.ts` path (not in the plan) was found, rather than
  by grep luck.
- **Handlebars context key stays `submissionId`** with a coalesced value —
  smallest diff; the `.hbs` template and the email's "Reference" label are
  untouched (label change was explicitly descoped; per-form
  `referenceNumberLabel` parity likewise).
- **Client zod field is optional and the schema non-strict** so an old API
  deploy can't bounce a citizen off the confirmation screen — direct lesson
  from #606.
- The smoke regex `/^[A-Z]+-\d{8}-\d{6}-[A-Z2-9]{6}$/` was checked against
  the generator's actual alphabet (excludes I, O, 0, 1) rather than assumed.

## What we almost got wrong

- A polish commit added a `//` comment **inside the HTML template literal** in
  `email.processor.ts` — it would have rendered as literal stray text in every
  citizen/MDA email. Unit tests stayed green (they asserted presence of the
  code, not absence of junk). The final whole-branch review caught it; fixed
  in `9bd52ba5` with a regression test asserting the leaked text is absent.
- A new test claimed to cover the "absent referenceCode" fallback in the email
  processor while actually passing a present value — impossible to test
  honestly since the event type forbids absence. Reframed; the true
  absent-field fallback is tested at the SQS consumer with
  `Omit<…, "referenceCode">`.
- Two e2e smoke specs still passed the old "Reference number" label to the
  smoke helper; the term-leave one would have regressed the deploy gate.
  Caught in spec review, fixed in `d297eee9`.

## Open questions

- Live end-to-end (submit → page → both emails identical) was not exercised
  locally — the docker stack isn't reachable from the session shell; the
  Amplify preview / staging deploy is the proving ground. Test evidence
  covers every seam individually.
