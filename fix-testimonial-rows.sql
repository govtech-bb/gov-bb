BEGIN;
UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,6,elements,6,overrides,ui}', '{"rows": 5}') WHERE form_id = 'sell-goods-services-beach-park-test';
UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,7,elements,6,overrides,ui}', '{"rows": 5}') WHERE form_id = 'sell-goods-services-beach-park-test';
COMMIT;
