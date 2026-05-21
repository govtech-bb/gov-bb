-- Remove required validation from nationality so we can test step conditionals
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements,5,overrides}',
  '{"fieldId": "applicant-nationality"}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';
