-- Fix declaration checkbox on ALL forms: full statement next to checkbox, not above it
-- Pattern: label = "Declaration" (heading), options[0].label = full statement (next to checkbox)

-- sell-goods
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,9,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'sell-goods-services-beach-park-test';

-- fire-inspection (declaration is step index 3)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,3,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'request-fire-inspection-test';

-- reserve-society (declaration is step index 4)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,4,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'reserve-society-name-test';

-- conductor-licence (declaration is last step, index 7)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'apply-for-conductor-licence-test';

-- project-protege (declaration is last step, index 7)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'project-protege-mentor-test';

-- sports-training (declaration is last step, index 7)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'community-sports-training-test';

-- jobstart (declaration is last step, index 11)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,11,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'jobstart-plus-programme-test';

-- birth-certificate (declaration is last step, index 8)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,8,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}'
) WHERE form_id = 'get-birth-certificate-test';
