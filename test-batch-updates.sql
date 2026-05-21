-- BATCH UPDATE: Fix nationality, add step conditionals/repeatables, migrate payment forms

-- 1. Fix nationality on sell-goods with Caribbean country options (subset for testing)
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements,5,overrides}',
  '{"fieldId": "applicant-nationality", "label": "Nationality", "options": [{"label": "Barbadian", "value": "barbadian"}, {"label": "Trinidadian", "value": "trinidadian"}, {"label": "Jamaican", "value": "jamaican"}, {"label": "Guyanese", "value": "guyanese"}, {"label": "Vincentian", "value": "vincentian"}, {"label": "Grenadian", "value": "grenadian"}, {"label": "Lucian", "value": "lucian"}, {"label": "Antiguan", "value": "antiguan"}, {"label": "Bahamian", "value": "bahamian"}, {"label": "British", "value": "british"}, {"label": "American", "value": "american"}, {"label": "Canadian", "value": "canadian"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Nationality is required"}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 2. Add step conditional to sports-training experience step (show only when has-experience = yes)
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,2,behaviours}',
  '[{"type": "stepConditionalOn", "targetFieldId": "has-experience", "targetStepId": "discipline", "operator": "equal", "value": "yes"}]'
)
WHERE form_id = 'community-sports-training-test';

-- 3. Add repeatable to conductor-licence endorsements step
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,3,behaviours}',
  '[{"type": "repeatable", "min": 1, "max": 5}]'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- 4. Add repeatable to jobstart employment step (previous-paid-job, index 7)
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,7,behaviours}',
  '[{"type": "repeatable", "min": 1, "max": 5}]'
)
WHERE form_id = 'jobstart-plus-programme-test';
