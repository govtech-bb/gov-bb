-- =============================================================================
-- Add email processors to all forms + fix school-registration-fee email bug
-- + sync payment department key to match sandbox secret
-- =============================================================================
-- Run against: modular-forms-db-sandbox.cl0sug2sklor.ca-central-1.rds.amazonaws.com
-- Database: modular_forms
-- Date: 2026-05-08
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Fix school-registration-fee: wrong email config key ("to" → "recipientField")
--    AND sync department from "education" → "default" (sandbox secret doesn't have "education")
-- ---------------------------------------------------------------------------
UPDATE form_definitions
SET schema = jsonb_set(
  jsonb_set(
    schema,
    '{processors,1,config}',
    '{"recipientField": "applicant.email", "subject": "School registration confirmed"}'
  ),
  '{processors,0,config,department}',
  '"default"'
)
WHERE form_id = 'school-registration-fee';

-- ---------------------------------------------------------------------------
-- 2. request-fire-inspection-test — add email processor
--    Email field: stepId="applicant", fieldId="applicant-email"
--    Path: "applicant.applicant-email"
-- ---------------------------------------------------------------------------
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{processors}',
  '[{"type": "email", "config": {"recipientField": "applicant.applicant-email", "subject": "Your fire inspection request has been received"}}]'
)
WHERE form_id = 'request-fire-inspection-test';

-- ---------------------------------------------------------------------------
-- 3. reserve-society-name-test — add email processor
--    Email field: stepId="applicant-details", fieldId="applicant-email"
--    Path: "applicant-details.applicant-email"
-- ---------------------------------------------------------------------------
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{processors}',
  '[{"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your society name request has been received"}}]'
)
WHERE form_id = 'reserve-society-name-test';

-- ---------------------------------------------------------------------------
-- 4. passport-renewal (both versions) — add email processor
--    Uses blocks/contact-information → email fieldId is "email"
--    Step: stepId="contact"
--    Path: "contact.email"
-- ---------------------------------------------------------------------------
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact.email", "subject": "Your passport renewal application has been received"}}]'
)
WHERE form_id = 'passport-renewal';

-- ---------------------------------------------------------------------------
-- 5. driver-licence-renewal — add email processor
--    Uses blocks/personal-information (has email? need to check)
--    This form does NOT have a contact step — only personal-details, address, documents
--    blocks/personal-information likely doesn't have email.
--    SKIP for now — no email field in this form's schema.
-- ---------------------------------------------------------------------------
-- NOTE: driver-licence-renewal does not have an email field in its current schema.
-- It uses blocks/personal-information (name, DOB, NID) and blocks/physical-address.
-- Cannot add email processor without first adding an email field to the form.
-- Leaving processors empty for now.

-- ---------------------------------------------------------------------------
-- 6. national-id-application — add email processor
--    Uses blocks/contact-information → email fieldId is "email"
--    Step: stepId="contact"
--    Path: "contact.email"
-- ---------------------------------------------------------------------------
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact.email", "subject": "Your National ID application has been received"}}]'
)
WHERE form_id = 'national-id-application';

COMMIT;

-- =============================================================================
-- Verification queries
-- =============================================================================
-- Run these after to confirm:
--
-- SELECT form_id, schema->'processors' AS processors
-- FROM form_definitions
-- WHERE form_id IN (
--   'school-registration-fee',
--   'request-fire-inspection-test',
--   'reserve-society-name-test',
--   'passport-renewal',
--   'national-id-application',
--   'driver-licence-renewal'
-- )
-- ORDER BY form_id;
--
-- Expected:
--   school-registration-fee     → payment (department: "default") + email (recipientField)
--   request-fire-inspection-test → email (applicant.applicant-email)
--   reserve-society-name-test   → email (applicant-details.applicant-email)
--   passport-renewal            → email (contact.email)
--   national-id-application     → email (contact.email)
--   driver-licence-renewal      → [] (no email field in schema)
-- =============================================================================

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- UPDATE form_definitions SET schema = jsonb_set(schema, '{processors}', '[]') WHERE form_id IN ('request-fire-inspection-test', 'reserve-society-name-test', 'passport-renewal', 'national-id-application');
-- UPDATE form_definitions SET schema = jsonb_set(jsonb_set(schema, '{processors,1,config}', '{"to": "applicant.email", "subject": "School registration confirmed", "template": "registration-confirmed"}'), '{processors,0,config,department}', '"education"') WHERE form_id = 'school-registration-fee';
