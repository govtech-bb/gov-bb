-- Add passport number fields to forms that had showHide
-- Approach: Add a "use passport instead" radio + conditional passport field after NID

-- 1. Sell Goods Beach Park - add after NID (element index 6 in applicant-details step)
-- Need to rebuild the step elements array to insert the new fields
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements}',
  (schema->'steps'->0->'elements') || 
  '[{"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}}, {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}}]'::jsonb
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 2. Conductor Licence - add after NID (element index 5 in applicant step)
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements}',
  (schema->'steps'->0->'elements') || 
  '[{"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}}, {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}}]'::jsonb
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- 3. Jobstart Plus - add after NIS number (already has NID, add passport option)
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements}',
  (schema->'steps'->0->'elements') || 
  '[{"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}}, {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}}]'::jsonb
)
WHERE form_id = 'jobstart-plus-programme-test';
