# 0054 — The submission reference is the one canonical cross-system ID

## Context

A CMS-connected submission used to carry **two** unrelated references: the Forms
API showed the citizen one value (the submission `referenceCode`, or earlier a
raw UUID) on the confirmation page and email, while the case-management system
minted its **own** structured code (e.g. `BYAC-0406-YSRPJEP`) at handoff and used
that on the CMS case and its status-update email. The same application therefore
had two numbers that could not be cross-referenced — a citizen quoting the one
they were shown could not be matched to the CMS case (bug #841). Two independent
generators also meant no single source of truth for "this submission".

## Decision

A form submission has **exactly one** human-readable reference, and it is the
source of truth everywhere:

1. **Minted once, by the Forms API, at submit time** — synchronously, before any
   downstream call. It exists the moment the form is accepted, so confirmation
   never depends on a downstream system being up.
2. **Persisted on the submission row** (`reference_code`) alongside — never
   replacing — the internal UUID primary key.
3. **Reused verbatim by every surface**: the confirmation page, the confirmation
   email, and external systems. The `case-management` processor sends it as the
   webhook `code`; downstream systems store it as their canonical external
   reference rather than generating their own.
4. **The reference is itself the cross-system join key.** Because the same unique
   value lives on both sides, no separate internal identifier (e.g. the
   submission UUID) is sent in the handoff. Internal PKs stay internal.
5. **Uniqueness is enforced by the database, not by trusting randomness.** A
   unique constraint (`UQ_form_submissions_reference_code`) backs the column; the
   service generates, attempts the insert, and on a unique-violation (23505)
   regenerates and retries.

### Format

`PREFIX-YYMM-RANDOM`

- **PREFIX** — self-identifying. For a CMS-connected form it is the programme
  code from the `case-management` processor config (`BYAC`, `CAMP`, …); otherwise
  it is derived from the formId's segment initials.
- **YYMM** — submission year-month. Cosmetic and readable; **not** a uniqueness
  guarantee.
- **RANDOM** — 7 characters of Crockford Base32 (CSPRNG). Crockford excludes the
  ambiguous I/L/O/U so the code survives being read aloud and retyped. ~34
  billion values per prefix/month.

Stored and compared as canonical uppercase.

## Consequences

- Future downstream integrations **reuse `referenceCode`**; they must not mint a
  parallel identifier for a submission. Adding a new "reference generator" is a
  smell to challenge.
- Downstream systems join on the shared `code`. If a future integration genuinely
  needs the internal UUID, that is an explicit, justified addition — not the
  default.
- Reference uniqueness is a DB invariant. Generators only need enough entropy to
  keep retries rare; they are never the guarantee.
- Changing the reference format is forward-only: existing stored codes are
  immutable historical values and are left untouched.
- This supersedes the prior implicit behaviour where the CMS generated its own
  case reference (the root of bug #841).
