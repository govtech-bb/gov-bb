-- =============================================================================
-- Fix sell-goods-services-beach-park-test to match AG (old platform) spec
-- =============================================================================
BEGIN;

-- 1. Fix title: "Sell Goods or Services at a Beach or Park" → "Apply to sell goods or services at a beach or park"
UPDATE form_definitions
SET schema = jsonb_set(schema, '{title}', '"Apply to sell goods or services at a beach or park"')
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 2. Middle name label: "Middle name" → "Middle name(s)"
-- Middle name is at step 0 (applicant-details), element 2
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,2,overrides,label}', '"Middle name(s)"')
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 3. DOB: add pastOrToday validation
-- DOB is at step 0, element 4
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,4,overrides,validations}',
  '{"required": {"error": "Date of birth is required", "value": true}, "pastOrToday": {"error": "Date of birth must be in the past", "value": true}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 4. Email: add email format validation
-- Email is at step 0, element 9
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,9,overrides,validations}',
  '{"required": {"error": "Email address is required", "value": true}, "email": {"error": "Enter a valid email address", "value": true}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 5. Telephone: add pattern validation for phone format
-- Telephone is at step 0, element 10
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,10,overrides,validations}',
  '{"required": {"error": "Telephone number is required", "value": true}, "minLength": {"error": "Telephone number must be at least 7 digits", "value": 7}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 6. Postcode: add pattern validation
-- Postcode is at step 0, element 14
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,14,overrides,validations}',
  '{"pattern": {"error": "Enter a valid Barbados postcode (e.g. BB17004)", "value": "^BB\\d{5}$"}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 7. Goods step: Add conditional country select when "Imported" is selected
-- Goods step is step index 2 (goods-details)
-- Need to add a country select field after goods-origin that shows when "imported" is selected
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,2,elements}',
  (SELECT jsonb_insert(
    schema->'steps'->2->'elements',
    '{1}',
    '{"ref": "components/country", "overrides": {"label": "Which country are the goods from?", "hint": "Select a country", "fieldId": "goods-country", "options": [{"label": "Trinidad and Tobago", "value": "trinidad-and-tobago"}, {"label": "Jamaica", "value": "jamaica"}, {"label": "Guyana", "value": "guyana"}, {"label": "United States", "value": "united-states"}, {"label": "United Kingdom", "value": "united-kingdom"}, {"label": "Canada", "value": "canada"}, {"label": "China", "value": "china"}, {"label": "India", "value": "india"}, {"label": "Other", "value": "other"}], "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "goods-origin", "operator": "equal", "value": "imported"}], "validations": {"required": {"error": "Select a country", "value": true}}}}'
  ) FROM form_definitions WHERE form_id = 'sell-goods-services-beach-park-test')
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 8. First testimonial: Change relationship from text (components/name) to select
-- First testimonial is step index 6, relationship is element 2
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,6,elements,2}',
  '{"ref": "components/generic/radio", "overrides": {"label": "Relationship", "fieldId": "testimonial1-relationship", "options": [{"label": "Friend", "value": "friend"}, {"label": "Neighbour", "value": "neighbour"}, {"label": "Community leader", "value": "community-leader"}, {"label": "Religious leader", "value": "religious-leader"}, {"label": "Other", "value": "other"}], "validations": {"required": {"error": "Relationship is required", "value": true}}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 9. Second testimonial: Change relationship from text to select
-- Second testimonial is step index 7, relationship is element 2
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,7,elements,2}',
  '{"ref": "components/generic/radio", "overrides": {"label": "Relationship", "fieldId": "testimonial2-relationship", "options": [{"label": "Friend", "value": "friend"}, {"label": "Neighbour", "value": "neighbour"}, {"label": "Community leader", "value": "community-leader"}, {"label": "Religious leader", "value": "religious-leader"}, {"label": "Other", "value": "other"}], "validations": {"required": {"error": "Relationship is required", "value": true}}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- 10. Upload fields: Add file type and size restrictions
-- Document uploads is step index 8, elements 0 and 1
-- Police certificate (element 0)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,8,elements,0,overrides}',
  '{"hint": "Upload a PDF, DOCX, or PNG file (max 25MB)", "label": "Upload a Police Certificate of Character", "fieldId": "police-certificate", "validations": {"required": {"error": "Police Certificate of Character is required", "value": true}, "accept": {"error": "Only PDF, DOCX, or PNG files are accepted", "value": ".pdf,.docx,.png"}, "itemMaxSize": {"error": "File must be less than 25MB", "value": 26214400}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- Passport photos (element 1)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,8,elements,1,overrides}',
  '{"hint": "Upload PDF, DOCX, or PNG files (max 25MB each)", "label": "Upload 2 passport-sized photos", "fieldId": "passport-photos", "multiple": true, "validations": {"required": {"error": "Passport-sized photos are required", "value": true}, "accept": {"error": "Only PDF, DOCX, or PNG files are accepted", "value": ".pdf,.docx,.png"}, "itemMaxSize": {"error": "Each file must be less than 25MB", "value": 26214400}}}'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

COMMIT;
