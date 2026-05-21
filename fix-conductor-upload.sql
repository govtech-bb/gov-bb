BEGIN;

-- Add accept and itemMaxSize to the police certificate upload field
-- document-uploads is step index 6, element 0
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,6,elements,0,overrides}',
  '{"hint": "Attach a .pdf, .docx or .png file.", "label": "Upload a Police Certificate of Character", "fieldId": "police-certificate", "validations": {"required": {"error": "Police Certificate of Character is required", "value": true}, "accept": {"error": "Only PDF, DOCX, or PNG files are accepted", "value": ".pdf,.docx,.png"}, "itemMaxSize": {"error": "File must be less than 25MB", "value": 26214400}}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

COMMIT;
