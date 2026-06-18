# One canonical submission reference (Forms API → CMS)

## Context

Issue #1458 (fixing bug #841, under EPIC #1356): a CMS-connected submission
carried two unrelated references. The Forms API showed the citizen the
submission `referenceCode`, but the `case-management` processor minted its **own**
structured code at handoff (`generateApplicationCodeForService` →
`BYAC-0406-…`) and sent that as the CMS `code`. So the confirmation page/email and
the CMS case/status-email disagreed, and a citizen could not be matched to their
case.

The goal: make the submission the source of truth — one reference, minted once by
the Forms API, persisted, shown to the citizen, and sent verbatim to the CMS.

Worked **in-place on `feat-case-management-processor`** (not `sandbox`): this work
modifies `case-management.processor.ts`, which only exists on that branch (the
case-management processor isn't merged to `sandbox` yet). So this is stacked on,
and must land after, that branch.

## What we did

- `reference-code.ts` — reformatted to `PREFIX-YYMM-RANDOM` with a 7-char
  **Crockford Base32** CSPRNG tail (was `YYYYMMDD-HHMMSS-<6>` on a non-Crockford
  alphabet). Added an optional `prefix` override; canonical uppercase.
- `submissions.service.ts` — derive the reference prefix from the form's
  `case-management` `programmeCode` (via a `programmeCode(processors)` helper),
  falling back to formId-initials for non-CMS forms. Replaced the race-prone
  pre-insert count-check with **retry-on-collision**: generate → insert → on a
  Postgres 23505 against `UQ_form_submissions_reference_code`, regenerate and
  retry. The event now carries `saved.referenceCode`.
- `case-management.processor.ts` / `case-management-webhook.service.ts` — send the
  submission's `referenceCode` as the CMS `code`; removed the separate code
  minting. `submission_id` was added then **deliberately removed** (see below).
- `application-code.ts` — dropped the now-unused `generateApplicationCode*` and
  helpers; kept `SERVICES` / `ServiceCode` / `isServiceCode` (still validate the
  configured `programmeCode` and seed the prefix).
- Tests throughout (TDD): format/prefix/uppercase, a 50,000-code zero-collision
  entropy check, programme-prefix and retry-on-collision at the service level,
  processor sends `referenceCode`, service payload shape.

No migration — the unique constraint already existed (migration `1778841559000`).

## Why it looks this way

- **Mint in the Forms API, not by calling the CMS.** The reference exists the
  moment the form is accepted, so the confirmation page/email never depend on the
  CMS being up. The CMS case is created later via the existing handoff and already
  knows its reference. See ADR 0054.
- **The shared `code` is the join key — no `submission_id` sent.** We initially
  added the submission UUID to the handoff (per #1458's "keep UUID as join key").
  On review we dropped it: once the same unique `code` lives on both sides it *is*
  the join key, so the UUID is redundant for new records and useless for old ones
  (the CMS never received it historically). Sending an internal PK to an external
  system with no consumer is needless leakage. Internal UUIDs stay internal.
- **Uniqueness is a DB invariant, not trust in randomness.** The unique constraint
  + retry is the guarantee; the CSPRNG tail only keeps retries vanishingly rare
  (the 50k-code test bears this out).
- **Prefix = programme code for CMS forms** so the reference is self-identifying
  (`BYAC-…`, `CAMP-…`) and matches the case the CMS opens; formId-initials for the
  rest.
- **Format is forward-only.** Existing stored codes are immutable historical
  values; only new submissions get the new shape.

## Verified

Full api suite (851 passed). Live end-to-end on the Docker stack: 8
`national-summer-camp` submissions all produced distinct `CAMP-2606-…` references,
each sent verbatim to `/api/cases`; a non-CMS form got the `STSF-…` fallback
prefix; idempotent retry returned the same reference; DB showed 17/17 distinct
codes. (The CMS dev instance still 404s on `CAMP` — unseeded programme registry,
unrelated to this change.)

## Out of scope / follow-ups (#1458, CMS repo)

CMS storing the reference as its canonical external reference, the CMS
status-update email showing it, and backfill of existing mismatched records — all
live in the CMS repo and are tracked separately.
