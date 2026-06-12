# National ID field — label parity and medium width across recipes

## Context

Issue [#1173](https://github.com/govtech-bb/gov-bb/issues/1173) flagged that the
National ID field on the sandbox **get-birth-certificate** form read `National
ID number` while live alpha.gov.bb reads `National Identification (ID) Number` —
a P1 parity break. The fix was generalised: bring every recipe's National ID
field to the canonical label and give it `ui.width: medium`.

The registry component (`packages/registry/src/components/national-id.ts`)
defaults to `label: "National ID number"` / `width: short`, and recipes resolve
it **at hydration time** with no version pinning — so editing the component
would retroactively rewrite every already-published version. We deliberately
**did not touch the component**; all changes are per-form overrides published as
new recipe versions, leaving old versions byte-for-byte intact.

Worked on branch targeting `sandbox`.

## What we did

For each recipe whose latest version contains a `components/national-id-number`
ref, classified the existing label override (case-insensitively) and acted:

- **TARGET** — already `National Identification (ID) Number` → add `ui.width:
  medium` only; label left untouched (includes the lowercase-"number" variants
  in referral / temp-teacher, which keep their existing casing).
- **SHORT** — `National ID number` / `National ID Number`, *or* no label
  override (inherits the registry default) → set label to the canonical string
  **and** add `ui.width: medium`.
- **IGNORE** — a deliberately different wording (`ID Number`, `National
  Registration Number`, `National Registration Number (ID No.)`) → left alone,
  no new version. Forms with **no** `components/national-id-number` ref (the
  block-based `blocks/personal-information` forms) were excluded entirely.

Each touched form got a new minor version (copy of the prior latest, `version`
bumped, override merged), so the prior validations/behaviours/fieldId are
preserved. Forms with two NID fields (nhc-*) had only the inherited-default
field relabelled; the intentional `National [Rr]egistration Number` field on the
same form was left as-is.

This session shipped **10** new recipe versions: cape-exam (1.4.0), csec
(1.4.0), digital-media (1.1.0), primary-school-textbook-grant (1.6.0),
death-certificate (1.6.0), marriage-certificate (1.7.0), national-summer-camp
(1.2.0), post-office-redirection-business (1.5.0), referral-student-support
(1.4.0), temp-teacher (1.4.0).

## Notes / why it looks this way

- The classification was driven entirely by what the recipe override already
  contained — we did not normalise unrelated wordings (e.g. `National
  Registration Number`), because those are intentional per-form content, not the
  registry default leaking through.
- The five **inherited-default** forms originally generated (camp-director,
  **get-birth-certificate**, mohlm, nhc-rental, nhc-land) were dropped by the
  human before commit. Notably this means **#1173's own birth-certificate label
  is not addressed by this change** — it needs to be handled separately or the
  removal reconsidered.
- An earlier attempt mistakenly rewrote the registry component and swept in
  block-based forms; both were reverted in favour of the per-form-override,
  ref-gated approach above.
