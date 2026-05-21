-- Remove behaviours from the conditional field to test if that's causing the parse error
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,0,elements,1,overrides}', 
  '{"fieldId": "current-society-name", "label": "What is the current name of the society?", "validations": {"required": {"value": true, "error": "Current society name is required"}}}'
)
WHERE form_id = 'reserve-society-name-test';
