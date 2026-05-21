-- Test repeatable behaviour on the post-secondary step of jobstart
UPDATE form_definitions 
SET schema = jsonb_set(
  schema, 
  '{steps,6,behaviours}', 
  '[{"type": "repeatable", "min": 1, "max": 3}]'
)
WHERE form_id = 'jobstart-plus-programme-test';
