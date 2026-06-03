# API resolution of the `config.mdaEmail` recipient + recipe migration (#607)

Date: 2026-06-03
Issue: [#607](https://github.com/govtech-bb/gov-bb/issues/607)
Branch: `worktree-form-config-api-resolution-607` → `feat-607-per-env-email-recipients` (integration) → `sandbox`
Plan: [docs/plans/607-form-config-mda-contact-recipients.md](../plans/607-form-config-mda-contact-recipients.md)

This is **Session 2 of 4**. Session 1 added the `mda_contact` + `form_config`
tables; this session makes the email processor *resolve* a recipient from them
and migrates the hardcoded recipe literals to the reserved token. Sessions 3–4
add the form-builder persistence and UI.

## Why this work happened

Two recipes hardcoded `"recipientField": "testing@govtech.bb"` for their MDA
notification. #607 wants production MDA addresses out of source control and
sandbox/test submissions kept away from real MDA inboxes. The recipe now
carries a stable sentinel; the runtime resolves the real address per
environment.

## What changed

**Shared classifier (`packages/form-types`).** The literal/contact/submitted
classification was inlined in `email.processor.ts`. It's now a shared
`classifyRecipientField()` (+ `CONTACT_DETAILS_PREFIX` / `CONFIG_RECIPIENT_PREFIX`)
in `recipient-field.ts`, with a fourth `config` kind. Shared because Sessions
3–4 (the builder) need to classify the same way. The processor now imports
`CONTACT_DETAILS_PREFIX` from form-types instead of its own const.

**Resolution (`apps/api`).** A new `FormConfigModule` exposes
`FormConfigService.resolveMdaEmail(formId)` — `form_config` by `formId`, then
`mda_contact` by `mda_contact_id`, returning the `mda_email` or `null`. The
repositories use the existing `BaseRepository` (self-construct from
`DataSource`, no `TypeOrmModule.forFeature` — matching
`FormDisabledOverrideRepository`). The processor's new `config` branch does
`resolveMdaEmail(formId) ?? defaultRecipient`.

**Recipe migration.** All 6 files (smart-stream-vendor-registration 1.1.0 /
1.1.1 / 1.2.0, temp-teacher-application-barbados 1.1.0 / 1.2.0 / 1.3.0):
`"testing@govtech.bb"` → `"config.mdaEmail"`. Only the MDA-notification literal
changed; each recipe's applicant recipient is untouched.

## Decisions worth the reasoning

**Degrade on a resolved miss, not on an infra error** — recorded as
[ADR 0032](../decisions/0032-recipient-resolution-degrades-on-miss-not-on-infra-error.md).
A null lookup (sandbox, no contact, blank email) falls back to
`SES_DEFAULT_RECIPIENT`; a DB outage propagates (SQS retry/DLQ) rather than
silently misrouting a production notification to the test inbox. An earlier
draft of the docstrings/test said the kind "never throws" — a code review
caught that this overstates the guarantee, and we corrected the wording rather
than adding a catch-all that would mask DB failures.

**No caching.** Unlike immutable published contracts (which `EmailBodyBuilder`
caches), `form_config`/`mda_contact` are mutable — an address can be rotated —
and MDA-email sends are low-volume, so a per-send indexed lookup beats risking
a stale cached address.

**A dedicated `FormConfigService`, not folded into `EmailBodyBuilder`.** The
builder caches form contracts; this is a separate, uncached, mutable concern
that Sessions 3–4 also consume. The cost was a 5th constructor arg on
`EmailProcessor`, propagated through ~17 spec call sites.

**Env var `SES_DEFAULT_RECIPIENT`** (→ `email.defaultRecipient`, default
`testing@govtech.bb`), following the repo's `SES_*` / `email.*` convention — not
the `EMAIL_DEFAULT_RECIPIENT` the plan originally guessed.

**Production rows are deferred.** No production `form_config` rows are seeded
here. Until the builder writes them (Session 3/4), a migrated recipe in
production resolves to the default inbox — i.e. exactly the pre-migration
behaviour (`testing@govtech.bb`), so there is **no regression**. Documented in
`FORM-CREATION-GUIDE.md`.

## Verification

- Builds: `form-types` + `database` + `api`; `tsc -b` across all three — clean.
- New tests: form-types classifier (5), `FormConfigService` (5), processor
  `config`-kind resolution + uploads (5), env default (2).
- Full `api` suite: **720/720** (was 708), capped workers.
- e2e smokes unaffected — they fill the *applicant's* email field, not the MDA
  recipientField.
