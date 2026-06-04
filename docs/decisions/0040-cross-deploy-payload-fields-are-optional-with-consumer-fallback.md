# 0040 — Cross-deploy payload fields are optional with consumer-side fallback

**Date:** 2026-06-04
**Status:** Accepted

## Context

Issue [#791](https://github.com/govtech-bb/gov-bb/issues/791) threads the
human-readable submission `referenceCode` from the API through SQS to the
emails, and through the submission response to the forms confirmation page.
Both legs add a field to a payload that crosses a **deploy boundary**:

- **SQS messages** enqueued by the old producer are still in flight when the
  new consumer deploys — they lack the field.
- **API responses** are parsed by a separately-deployed client: an old API can
  serve a new forms build (and vice versa) during and between deploys. Issue
  #606 already showed the failure mode — a strict client schema bounced
  citizens off the confirmation screen when the response didn't match exactly.

Making the new field required on the wire, or strict-parsing it on the client,
turns a routine deploy-ordering window into a citizen-facing outage.

## Decision

When a field is added to a payload that crosses a deploy boundary, it is
**optional on the wire/schema**, and the **consuming boundary coalesces a
fallback**. Internal types may (and should) keep the field required — the
optionality lives only at the boundary, resolved once on entry.

Concretely for #791:

- `SubmissionSqsMessage.referenceCode?` is optional; the consumer's `toEvent`
  does `msg.referenceCode ?? msg.submissionId` — so the internal
  `SubmissionCreatedEvent.referenceCode` stays a required `string` and every
  downstream consumer is statically guaranteed a value.
- The forms zod schema declares `referenceCode: z.string().optional()` (and
  stays a non-strict `z.object`); the page does
  `response.data.referenceCode ?? response.data.id`.

## Consequences

- **Deploy order never matters** for additive payload changes: old-producer →
  new-consumer and new-producer → old-consumer both render something sensible.
- **Coalesce once, at the boundary.** Resolve the fallback where the payload
  enters (SQS consumer, response parser), not at every use site — interior
  code works with required types. Defensive `??` deeper in (e.g. the email
  renderer) is tolerated but should be commented as defensive, not load-bearing.
- **Never strict-parse cross-deploy responses** on the citizen path (the #606
  lesson): unknown fields are stripped, missing optional fields parse.
- **Removal is two deploys**: stop reading (with fallback retained), then stop
  sending. A future change must not flip a wire field to required while any
  producer that omits it can still have messages in flight.
- Tests for the fallback must exercise genuine absence (e.g. construct the
  payload as `Omit<…, "field">`), not a present-but-equal value.
