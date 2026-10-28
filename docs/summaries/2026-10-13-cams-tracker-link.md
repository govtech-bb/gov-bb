# CaMS-only tracker link

2026-10-13 · `api` citizen confirmation email · #3046

## Context

#2639 added a hardcoded "Track my application" link to the citizen
acknowledgement email (`submission-received.hbs`). The template is chosen only
by recipient kind, so every form that emails the applicant got the link,
including forms with no Case Management (CaMS) integration. On those forms the
tracker can't find the reference, so the link is a dead end.

## What we did

- `EmailProcessor.resolveHtmlBody` sets `ctx.trackable` for the citizen
  template only. It's true when `payload.processors` has a `webhook` with
  `config.mapping`.
- `submission-received.hbs` wraps the link in `{{#if trackable}}`.
- `trackable?: boolean` was added to `EmailTemplateContext`.

## Why we did it that way

**"Mapped webhook" is the CaMS signal.** No separate CaMS flag exists. The
mapped webhook is the same check `webhook.processor.ts` uses to build the case
payload and look up the MDA's CaMS destination. The user confirmed the tracker
covers every CaMS programme, so a per-programme allowlist wasn't needed.

**Read from the event, not the DB.** The event already carries the full
processor list in `payload.processors`, so this needs no extra lookup. That's
the same approach as `departmentName`: work out citizen-only context inside
the `RECEIVED_TEMPLATE` branch.

## Open questions

- A recipe that has a mapping but no `MDA_WEBHOOK_DESTINATIONS` entry still
  shows the link, even though its case hand-off goes to the DLQ.
- The link still points to production (`tracking.alpha.gov.bb`) in every
  environment. Landing can change it per environment with `VITE_TRACKER_URL`;
  the API email has no equivalent. Out of scope here.
