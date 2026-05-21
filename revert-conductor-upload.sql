BEGIN;
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,6,elements,0,overrides}',
  '{"hint": "Attach a .pdf, .docx or .png file.", "label": "Upload a Police Certificate of Character", "fieldId": "police-certificate", "validations": {"required": {"error": "Police Certificate of Character is required", "value": true}}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';
COMMIT;
