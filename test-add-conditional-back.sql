-- Add behaviours back to the conditional field
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,0,elements,1,overrides}', 
  '{"fieldId": "current-society-name", "label": "What is the current name of the society?", "validations": {"required": {"value": true, "error": "Current society name is required"}}, "behaviours": [{"type": "fieldConditionalOn", "field": "request-purpose", "value": "change-name"}]}'
)
WHERE form_id = 'reserve-society-name-test';
