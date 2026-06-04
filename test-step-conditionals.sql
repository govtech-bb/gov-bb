-- Test step-level conditionals on sell-goods form
-- goods-details step should only show when goods-or-services radio = "goods"
-- services-details step should only show when goods-or-services radio = "services"

-- Add stepConditionalOn to goods-details step (index 2)
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,2,behaviours}', 
  '[{"type": "stepConditionalOn", "targetFieldId": "goods-or-services", "targetStepId": "goods-or-services", "operator": "equal", "value": "goods"}]'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Add stepConditionalOn to services-details step (index 3)
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,3,behaviours}', 
  '[{"type": "stepConditionalOn", "targetFieldId": "goods-or-services", "targetStepId": "goods-or-services", "operator": "equal", "value": "services"}]'
)
WHERE form_id = 'sell-goods-services-beach-park-test';
