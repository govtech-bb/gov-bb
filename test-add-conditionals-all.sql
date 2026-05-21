-- Add conditional behaviours to all forms that need them

-- 1. Exit Survey: show technical problems description only when "yes"
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,2,elements,1,overrides}', 
  '{"fieldId": "technical-problems-description", "label": "Please briefly describe the problem you experienced", "validations": {"required": {"value": true, "error": "Please describe the problem you experienced"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "technical-problems", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'exit-survey-test';

-- 2. Conductor Licence: licence number conditional on has-previous-licence = yes
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,2,elements,1,overrides}', 
  '{"fieldId": "licence-number", "label": "Provide your licence number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-licence", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- 2b. Conductor Licence: licence date conditional on has-previous-licence = yes
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,2,elements,2,overrides}', 
  '{"fieldId": "licence-date-of-issue", "label": "Date of issue", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-licence", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- 2c. Conductor Licence: endorsement details conditional on has-endorsements = yes
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,3,elements,1,overrides}', 
  '{"fieldId": "endorsement-type", "label": "Type of licence", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-endorsements", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,3,elements,2,overrides}', 
  '{"fieldId": "endorsement-date", "label": "Date of endorsement", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-endorsements", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,3,elements,3,overrides}', 
  '{"fieldId": "endorsement-duration", "label": "How long did the endorsement appear on your licence?", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-endorsements", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- 2d. Conductor Licence: disqualification details conditional on has-disqualifications = yes
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,4,elements,1,overrides}', 
  '{"fieldId": "disqualification-court", "label": "Court name", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disqualifications", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,4,elements,2,overrides}', 
  '{"fieldId": "disqualification-reason", "label": "Court reason for disqualification", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disqualifications", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,4,elements,3,overrides}', 
  '{"fieldId": "disqualification-date", "label": "Date of disqualification", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disqualifications", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,4,elements,4,overrides}', 
  '{"fieldId": "disqualification-length", "label": "Length of disqualification", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disqualifications", "operator": "equal", "value": "yes"}]}'
)
WHERE form_id = 'apply-for-conductor-licence-test';
