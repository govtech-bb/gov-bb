-- Fix: components/national-id should be components/national-id-number
UPDATE form_definitions 
SET schema = replace(schema::text, '"ref": "components/national-id"', '"ref": "components/national-id-number"')::jsonb
WHERE form_id = 'sell-goods-services-beach-park-test';
