BEGIN;

-- First testimonial (step 6): Change relationship from radio to select
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,6,elements,2}',
  '{"ref": "components/parish", "overrides": {"label": "Relationship", "fieldId": "testimonial1-relationship", "options": [{"label": "Friend", "value": "friend"}, {"label": "Neighbour", "value": "neighbour"}, {"label": "Community leader", "value": "community-leader"}, {"label": "Religious leader", "value": "religious-leader"}, {"label": "Other", "value": "other"}], "validations": {"required": {"error": "Relationship is required", "value": true}}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- First testimonial (step 6): Set testimonial textarea to 2 rows
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,6,elements,6,overrides}',
  '{"label": "Testimonial", "fieldId": "testimonial1-text", "ui": {"rows": 2}, "validations": {"required": {"error": "Testimonial is required", "value": true}, "minLength": {"error": "Testimonial must be at least 10 characters", "value": 10}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Second testimonial (step 7): Change relationship from radio to select
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,2}',
  '{"ref": "components/parish", "overrides": {"label": "Relationship", "fieldId": "testimonial2-relationship", "options": [{"label": "Friend", "value": "friend"}, {"label": "Neighbour", "value": "neighbour"}, {"label": "Community leader", "value": "community-leader"}, {"label": "Religious leader", "value": "religious-leader"}, {"label": "Other", "value": "other"}], "validations": {"required": {"error": "Relationship is required", "value": true}}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Second testimonial (step 7): Set testimonial textarea to 2 rows
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,6,overrides}',
  '{"label": "Testimonial", "fieldId": "testimonial2-text", "ui": {"rows": 2}, "validations": {"required": {"error": "Testimonial is required", "value": true}, "minLength": {"error": "Testimonial must be at least 10 characters", "value": 10}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

COMMIT;
