# Fix business-name field rejecting valid names (#1234)

## Context

In the **Post Office Redirection — Business** flow, the **Business name** field
rejected any realistic name containing a digit, `&`, `.`, `,`, `/`, `(` etc.
The citizen got stuck, and in the chat assistant the error read *"Name must
contain only letters, hyphens, or apostrophes"* — nonsensical for a business.
Plain alphabetic names slipped through, so it looked intermittent. This was a
recipe/registry data bug (it reproduces in the regular forms UI too), not a
chat bug. Worked from `docs/plans/1234-business-name-validation.md`.

## Root cause

The `business-name` step reused the shared `components/name` primitive, which
ships a **person-name** pattern (letters/spaces/hyphens/apostrophes only). Recipe
overrides **deep-merge** rather than replace
(`apps/api/src/registry/resolution.ts` → `shallowMergeDefined`), and the override
restated only `label`/`fieldId`/`required`/`minLength`, so the inherited pattern
survived into the hydrated contract. Because the merge only overlays *defined*
keys, an override **cannot delete** an inherited pattern — the only fix is to
change the base ref.

## What we did

- Published **`post-office-redirection-business` 1.7.0** (copied from the
  current latest, `1.6.0`). The file loader picks the highest semver, so 1.7.0
  becomes live automatically.
- Switched **two** fields from `components/name` → `components/generic-text`:
  `business-name` *and* `position-details` (the same recipe's "Position" field
  had the identical latent bug — the issue only named the first).
- `business-name` got a **business-friendly pattern** (option (b)):
  `^(?=.*[A-Za-z0-9])[A-Za-z0-9À-ÖØ-öø-ÿ &.,'/()-]+$` — letters (incl. accented),
  digits, spaces and `& . , - ' / ( )`, requiring at least one alphanumeric.
  `position-details` is length-only.
- Updated the business smoke spec to submit a symbol/digit name
  (`J&B Co. (Bridgetown) No. 1`, `Director (HR & Admin)`) and removed the stale
  comment that documented the old workaround.

## Why we did it that way

- **Switch the base ref, don't edit `components/name`.** The name primitive is
  correct for genuine person-name fields used elsewhere; editing it would have
  wide blast radius. Switching only the two offending fields to `generic-text`
  mirrors the `registration-number` sibling already in the same step.
- **Version stale in the issue.** The issue proposed "1.5.0", but 1.5.0 and
  1.6.0 already existed and the bug was still live in 1.6.0 — hence 1.7.0.
- **Pattern (b) over length-only (a).** Chosen for a small amount of junk
  rejection (control chars, emoji) while accepting all realistic business names.
- **Wider impact left out of scope on purpose.** ~25 other recipes reuse
  `components/name` for non-person fields (licence number, "reason for
  certificate", club/organisation, etc.) and share this root cause. Deliberately
  scoped out of #1234 to keep the PR focused — worth a separate tracking issue.

## Verification

- `api:build` and `forms:build` pass; `recipe-invariants` spec passes (validates
  the new 1.7.0 structurally).
- Exercised the pattern directly: realistic names (`J&B Co`, `Acme Trading Ltd.`,
  `A1 Tyres`, accented, `O'Brien/Smith`) pass; junk (`!!!`, `<script>`, blank)
  rejected.
- One unrelated `api:test` failure — `add-form-definition-unique-constraint.smoke.spec.ts`
  — needs a clean local Postgres and is environment-dependent, not caused by this
  change.
