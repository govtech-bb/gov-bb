BEGIN;

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,5,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'get-death-certificate-test';

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,7,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,5,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'post-office-redirection-business-test';

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,5,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'post-office-redirection-deceased-test';

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,7,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'post-office-redirection-individual-test';

UPDATE form_definitions SET schema = jsonb_set(schema, '{steps,4,elements,0,overrides}',
  '{"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "value": "confirmed"}], "validations": {"required": {"error": "You must confirm the declaration to continue", "value": true}}}'::jsonb
) WHERE form_id = 'primary-school-textbook-grant-test';

COMMIT;
