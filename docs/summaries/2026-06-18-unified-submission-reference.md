# Canonical submission reference — format + uniqueness (#1458)

## Context

Issue #1458 (fixing bug #841): make the submission the single source of truth for
its human-readable reference. This PR is the **Forms-API foundation** — the format
and uniqueness of the reference. The downstream webhook/CMS integration that
*reuses* this reference (sending it as the case `code`, prefixing it with a
programme code) is a **separate PR**, so this one can land independently.

## What we did

- `reference-code.ts` — reformatted the reference to `PREFIX-YYMM-RANDOM` with a
  7-char **Crockford Base32** CSPRNG tail (was `YYYYMMDD-HHMMSS-<6>` on a
  non-Crockford alphabet). Added an optional `prefix` override; canonical
  uppercase. The prefix defaults to the formId-segment initials.
- `submissions.service.ts` — replaced the race-prone pre-insert count-check with
  **retry-on-collision**: generate → insert → on a Postgres 23505 against
  `UQ_form_submissions_reference_code`, regenerate and retry. The event now
  carries `saved.referenceCode`.
- Tests (TDD): format/prefix/uppercase, a 50,000-code zero-collision entropy
  check, and a service-level retry-on-collision test.

No migration — the unique constraint already exists (migration `1778841559000`).

## Why it looks this way

- **Mint in the Forms API, at submit, persisted.** The reference exists the moment
  the form is accepted and is the one value shown to the citizen — it does not
  depend on any downstream system. See ADR 0054.
- **Uniqueness is a DB invariant, not trust in randomness.** The unique constraint
  + retry is the guarantee; the CSPRNG tail only keeps retries vanishingly rare
  (the 50k-code test bears this out).
- **Crockford Base32** excludes the ambiguous I/L/O/U so the code survives being
  read aloud and retyped.
- **Format is forward-only.** Existing stored codes are immutable historical
  values; only new submissions get the new shape.

## Deferred to the webhook-integration PR

- Using the form's programme code as the reference *prefix* (`BYAC-…`, `CAMP-…`).
- The `case-management`/webhook processor sending this `referenceCode` to the CMS
  as the canonical case `code`.

These reference the webhook processor + per-form config, so they layer on top of
this foundation and ship separately (kept generic for onboarding more forms).
