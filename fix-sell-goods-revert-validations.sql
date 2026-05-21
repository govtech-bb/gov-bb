-- Revert validations that the frontend schema can't parse
BEGIN;

-- Revert postcode: remove pattern validation (keep it optional with no validation)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,14,overrides}',
  '{"hint": "For example, BB17004 (optional)", "fieldId": "applicant-postcode"}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Revert upload fields: remove accept and itemMaxSize, keep just required
-- Police certificate (step 8, element 0)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,8,elements,0,overrides}',
  '{"hint": "Upload a PDF, DOCX, or PNG file (max 25MB)", "label": "Upload a Police Certificate of Character", "fieldId": "police-certificate", "validations": {"required": {"error": "Police Certificate of Character is required", "value": true}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Passport photos (step 8, element 1)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,8,elements,1,overrides}',
  '{"hint": "Upload PDF, DOCX, or PNG files (max 25MB each)", "label": "Upload 2 passport-sized photos", "fieldId": "passport-photos", "multiple": true, "validations": {"required": {"error": "Passport-sized photos are required", "value": true}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

COMMIT;
