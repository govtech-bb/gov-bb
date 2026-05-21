-- =============================================================================
-- Fix: Replace radio-based "Use passport number instead" with show-hide pattern
-- on ALL forms that still use the old radio approach
-- =============================================================================
-- The correct pattern (from sell-goods-services-beach-park-test):
--   1. components/national-id-number (NID field)
--   2. components/generic/show-hide (toggle: "Use passport number instead")
--   3. components/passport-number (conditionally shown via fieldConditionalOn)
--
-- The broken pattern uses components/generic/radio instead of show-hide,
-- which renders as a Yes/No radio button instead of an expandable toggle.
-- =============================================================================

BEGIN;

-- ==========================================================================
-- Helper: Generic function to replace a radio element with show-hide
-- and update the passport element's behaviours
-- ==========================================================================

-- We'll use jsonb_set to replace elements at known indices.
-- For each form, we replace:
--   - The radio element → show-hide element
--   - The passport element → add correct behaviours with fieldConditionalOn

-- ---------------------------------------------------------------------------
-- 1. apply-for-conductor-licence-test
--    Step: "applicant" (need step index first)
--    Radio at element index 6, Passport at element index 7
-- ---------------------------------------------------------------------------

-- Find step index for "applicant"
-- From the schema: steps[0]=applicant, so step index = 0

-- Replace radio (index 6) with show-hide
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,6}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- Update passport (index 7) with correct behaviours
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,7}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- ---------------------------------------------------------------------------
-- 2. get-birth-certificate-test
--    Step: "applicant-details" — need step index
-- ---------------------------------------------------------------------------

-- Get step index for applicant-details
-- Steps: applicant-details, applying-for-yourself, relationship-to-person, reason-for-certificate, person-details, birth-details, parents, order-details, declaration
-- applicant-details = index 0

-- Replace radio (index 9) with show-hide
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,9}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'get-birth-certificate-test';

-- Update passport (index 10) with correct behaviours
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,10}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'get-birth-certificate-test';

-- ---------------------------------------------------------------------------
-- 3. get-death-certificate-test
--    Step: "applicant-details" = index 0
--    Radio at element 9, Passport at element 10
-- ---------------------------------------------------------------------------

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,9}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'get-death-certificate-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,10}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'get-death-certificate-test';

-- ---------------------------------------------------------------------------
-- 4. get-marriage-certificate-test
--    Three steps need fixing: applicant-details, husband-details, wife-details
-- ---------------------------------------------------------------------------

-- 4a. applicant-details (step index 0), radio at 9, passport at 10
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,9}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,10}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'get-marriage-certificate-test';

-- 4b. husband-details — need step index
-- Steps: applicant-details(0), applying-for-yourself(1), husband-details(2), wife-details(3), marriage-details(4), reason-for-requesting(5), order-details(6), declaration(7)
-- husband-details = index 2, radio at element 4, passport at element 5

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,2,elements,4}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If the husband doesn''t have a National ID number, you can use a passport number instead.", "label": "Use passport number instead", "fieldId": "husband-passport-toggle"}}'
)
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,2,elements,5}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "husband-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "husband-passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'get-marriage-certificate-test';

-- 4c. wife-details = index 3, radio at element 4, passport at element 5

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,3,elements,4}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If the wife doesn''t have a National ID number, you can use a passport number instead.", "label": "Use passport number instead", "fieldId": "wife-passport-toggle"}}'
)
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,3,elements,5}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "wife-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "wife-passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'get-marriage-certificate-test';

-- ---------------------------------------------------------------------------
-- 5. jobstart-plus-programme-test
--    Step: "applicant-details" = index 0
--    Radio at element 10, Passport at element 11
-- ---------------------------------------------------------------------------

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,10}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'jobstart-plus-programme-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,11}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'jobstart-plus-programme-test';

-- ---------------------------------------------------------------------------
-- 6. post-office-redirection-business-test
--    Step: "applicant-details" = index 0
--    Radio at element 5, Passport at element 6
-- ---------------------------------------------------------------------------

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,5}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'post-office-redirection-business-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,6}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'post-office-redirection-business-test';

-- ---------------------------------------------------------------------------
-- 7. post-office-redirection-individual-test
--    Step: "applicant-details" = index 0
--    Radio at element 6, Passport at element 7
-- ---------------------------------------------------------------------------

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,6}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'post-office-redirection-individual-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,7}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'post-office-redirection-individual-test';

-- ---------------------------------------------------------------------------
-- 8. primary-school-textbook-grant-test
--    Three steps: applicant-details, guardian-details, tell-us-about-the-child
-- ---------------------------------------------------------------------------

-- 8a. applicant-details (step index ?)
-- Steps: tell-us-about-the-child(0), guardian-details(1), applicant-details(2), bank-account(3), declaration(4)
-- applicant-details = index 2, radio at element 9, passport at element 10

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,2,elements,9}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If you don''t have a National ID number, you can use your passport number instead.", "label": "Use passport number instead", "fieldId": "passport-toggle"}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,2,elements,10}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

-- 8b. guardian-details = index 1, radio at element 3, passport at element 4

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,1,elements,3}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If the guardian doesn''t have a National ID number, you can use a passport number instead.", "label": "Use passport number instead", "fieldId": "guardian-passport-toggle"}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,1,elements,4}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "guardian-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "guardian-passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

-- 8c. tell-us-about-the-child = index 0, radio at element 3, passport at element 4

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,3}',
  '{"ref": "components/generic/show-hide", "overrides": {"hint": "If the child doesn''t have a National ID number, you can use a passport number instead.", "label": "Use passport number instead", "fieldId": "child-passport-toggle"}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,4}',
  '{"ref": "components/passport-number", "overrides": {"label": "Passport Number", "fieldId": "child-passport-number", "behaviours": [{"type": "fieldConditionalOn", "value": true, "operator": "equal", "targetFieldId": "child-passport-toggle"}], "validations": {"required": {"error": "Passport number is required", "value": true}, "minLength": {"error": "Passport number must be at least 6 characters", "value": 6}}}}'
)
WHERE form_id = 'primary-school-textbook-grant-test';

COMMIT;
