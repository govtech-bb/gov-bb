# E2E Journey 4 (submission → case management) runbook

Journey 4 (`journey-case-management` in `deploy-staging.yml`) submits a dedicated
non-public test form (`e2e-j4-case-check`) on **staging** with the smoke token,
follows its webhook into a **non-prod** case-management system (CaMS), asserts a
case was created (same reference code + the uploaded file copied), then removes
the test case. Background: #3011, #3861, ADR 0087.

**Status: not yet armed.** The CaMS read + `removeTestCase` endpoints the journey
needs are a proposed contract (case-management#812) and are not provisioned, so
the CI job **soft-skips** (warning + `exit 0`) while `E2E_CAMS_API_KEY` is unset.
It does not gate the deploy until it is re-armed (see
[Re-arming the gate](#re-arming-the-gate)). This fail-safe is deliberate — a gate
that failed closed before provisioning would block every staging → prod
promotion (the #3536 lesson from Journey 3).

## Required environment

The run step sets these; the two tokens and the CaMS key come from the
`staging-e2e` GitHub Environment (deployable from `staging` and `main` only).

| Var | Value / source | Notes |
| --- | --- | --- |
| `SMOKE_BASE_URL` | `https://forms.staging.alpha.gov.bb` | Fixed staging forms host |
| `SMOKE_LANDING_URL` | `https://staging.alpha.gov.bb` | Fixed staging landing host |
| `PREVIEW_TOKEN` | `secrets.RECIPE_PREVIEW_TOKEN` | Opens the non-public test form (`?preview=`); must match **staging's** recipe-preview token |
| `SMOKE_SUBMISSION_TOKEN` | `secrets.SMOKE_SUBMISSION_TOKEN_STAGING` | Marks the submit as a smoke submission (ADR 0087); the staging token (#3324) — must match staging's API `SMOKE_SUBMISSION_TOKEN`, or the API ignores the header and the run submits for real (not a smoke test) |
| `E2E_CAMS_BASE_URL` | `https://cases.staging.alpha.gov.bb` | Non-prod CaMS base (confirm the real host when provisioning) |
| `E2E_CAMS_API_KEY` | `secrets.E2E_CAMS_API_KEY` | CaMS `x-api-key` for the `E2E_` test programme; empty ⇒ the job soft-skips |

## Environment scope — staging only, never prod

A mapped webhook resolves its destination from `MDA_WEBHOOK_DESTINATIONS` for the
form's ministry key (`E2E`), so an `E2E_` smoke submission reaches **whatever
CaMS that key points at in the environment where `SMOKE_SUBMISSION_TOKEN` is
set**. J4 runs on staging, whose `E2E` destination must point at a **non-prod
CaMS**. Do **not** enable the smoke token in prod expecting zero CaMS traffic —
in prod an `E2E_` submission would post to the prod CaMS destination (ADR 0087).

## Provisioning (what arms the gate)

All these steps are per-environment and **staging-scoped** — none ship to prod.

0. **Create the `staging-e2e` environment first.** The CI job names it; if it
   doesn't exist, GitHub creates it on first run **without** protection rules.
   Create it up front, before putting any secret in it, with a deployment branch
   policy allowing **`staging`** (promoted runs — Deploy Staging runs on
   `staging`) and **`main`** (manual runs from the Actions tab), and no required
   reviewers. A `main`-only policy like `sandbox-e2e`'s would make GitHub refuse
   every promoted run and turn the staging deploy red once the job can start.
1. **CaMS machine contract + key (case-management#812).** CaMS exposes the read
   (`GET /api/cases/{code}`) and `removeTestCase` (`DELETE /api/cases/{code}`)
   endpoints over `x-api-key`, fenced to `isTest` programmes, and issues a
   non-prod E2E key. Register `E2E_J4_CASE_CHECK` as an `isTest` programme.
2. **`staging-e2e` secrets.** Set `E2E_CAMS_API_KEY` (the key from step 1) on the
   `staging-e2e` GitHub Environment. The job already reads
   `SMOKE_SUBMISSION_TOKEN_STAGING` (the existing staging smoke token, shared with
   `smoke-test-forms`) and `RECIPE_PREVIEW_TOKEN`, so no env-level override is
   needed — just confirm both resolve to staging's values.
3. **`MDA_WEBHOOK_DESTINATIONS` entry.** Add an `E2E` key to staging's
   `MDA_WEBHOOK_DESTINATIONS` secret, pointing `url` at the non-prod CaMS
   `POST /api/cases` and `secret` at the forms intake key (see
   [docs/webhook-destinations.md](webhook-destinations.md)).
4. **Seed the staging DB rows.** `resolveWebhookDestination` walks
   `form_config → mda_contact.ministry_key`, and these rows live in the DB
   per-environment (never in the recipe, never via a migration — `form_config`
   is deliberately per-environment). Run this once against the **staging** DB:

   ```sql
   -- Test directory contact for the J4 test service (ministry key E2E).
   INSERT INTO mda_contact (label, title, telephone, email, mda_email, ministry_key)
   SELECT 'E2E test (case-management check)', 'E2E test service',
          '(246) 000-0000', 'testing@govtech.bb', 'testing@govtech.bb', 'E2E'
   WHERE NOT EXISTS (
     SELECT 1 FROM mda_contact WHERE label = 'E2E test (case-management check)'
   );

   -- Link the test form to that contact.
   INSERT INTO form_config (form_id, mda_contact_id)
   SELECT 'e2e-j4-case-check', id FROM mda_contact
   WHERE label = 'E2E test (case-management check)'
   ON CONFLICT (form_id) DO NOTHING;
   ```

   Do **not** run this on prod — the test form is `preview` (invisible), and an
   `E2E` row in prod would only make the boot-time webhook audit log a false
   "ministry E2E has no destination" error.

## Re-arming the gate

Once provisioning is complete and a real run is green, in `deploy-staging.yml`:

1. In the `journey-case-management` run step, replace the soft-skip
   (`echo "::warning::…"; exit 0`) with a fail-closed guard
   (`echo "::error::E2E_CAMS_API_KEY is not set…"; exit 1`), matching Journey 3's
   `deploy-sandbox.yml` guard.
2. Add `journey-case-management` to the `summary` job's `needs` so a red run
   fails the staging deploy, and wire the prod gate (Deploy Production requires a
   green staging J4).

## Open acceptance criteria (tracked until re-arm)

This feature delivers the J4 code but leaves the gate dormant, so two of #3011's
acceptance criteria are not yet satisfied and live on #3861 until re-arm:

- **Tracker status (#3011 AC): not checked** — no non-prod tracker exists yet;
  recorded as a gap here per #3011's "or the gap is recorded" escape hatch.
- **First real run** (case created + reference match + files copied) and the
  [re-arming](#re-arming-the-gate) steps (fail-closed guard, `summary.needs`, the
  prod gate) — all pending case-management#812 + the provisioning above.

## Related

- #3011 (J4 story), #3861 (this feature), #3862 (fail the run when CaMS refuses a
  payload — blocked on the intake contract #2842 / case-management#86).
- case-management#812 (the read + `removeTestCase` machine contract).
- ADR 0087 (smoke submission may webhook to a reserved `E2E_` test programme).
