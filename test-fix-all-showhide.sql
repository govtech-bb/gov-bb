-- Replace radio passport pattern with show-hide pattern on all forms
-- Old pattern: radio with "use-passport-instead" fieldId + passport conditional on "yes"
-- New pattern: show-hide toggle + passport conditional on true

-- Replace the radio element with show-hide toggle
UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE schema::text LIKE '%use-passport-instead%';

-- Fix the conditional on the passport field: change targetFieldId and value
UPDATE form_definitions
SET schema = replace(
  replace(
    schema::text,
    '"targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"',
    '"targetFieldId": "passport-toggle", "operator": "equal", "value": true'
  ),
  '"targetFieldId": "use-passport-instead"',
  '"targetFieldId": "passport-toggle"'
)::jsonb
WHERE schema::text LIKE '%use-passport-instead%';

-- Also fix the 6 payment forms which use "applicant-no-national-id" as the radio fieldId
UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE schema::text LIKE '%applicant-no-national-id%';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"',
  '"targetFieldId": "passport-toggle", "operator": "equal", "value": true'
)::jsonb
WHERE schema::text LIKE '%applicant-no-national-id%';

-- Fix husband/wife variants in marriage certificate
UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "husband-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "husband-passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"targetFieldId": "husband-no-national-id", "operator": "equal", "value": "yes"',
  '"targetFieldId": "husband-passport-toggle", "operator": "equal", "value": true'
)::jsonb
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "wife-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "wife-passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE form_id = 'get-marriage-certificate-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"targetFieldId": "wife-no-national-id", "operator": "equal", "value": "yes"',
  '"targetFieldId": "wife-passport-toggle", "operator": "equal", "value": true'
)::jsonb
WHERE form_id = 'get-marriage-certificate-test';

-- Fix child/guardian variants in textbook grant
UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "child-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "child-passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"targetFieldId": "child-no-national-id", "operator": "equal", "value": "yes"',
  '"targetFieldId": "child-passport-toggle", "operator": "equal", "value": true'
)::jsonb
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"ref": "components/generic/radio", "overrides": {"fieldId": "guardian-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}',
  '"ref": "components/generic/show-hide", "overrides": {"fieldId": "guardian-passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}'
)::jsonb
WHERE form_id = 'primary-school-textbook-grant-test';

UPDATE form_definitions
SET schema = replace(
  schema::text,
  '"targetFieldId": "guardian-no-national-id", "operator": "equal", "value": "yes"',
  '"targetFieldId": "guardian-passport-toggle", "operator": "equal", "value": true'
)::jsonb
WHERE form_id = 'primary-school-textbook-grant-test';
