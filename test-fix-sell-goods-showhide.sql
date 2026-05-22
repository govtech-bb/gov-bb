-- Fix sell-goods form: replace radio passport workaround with show-hide, fix declaration
-- Replace the passport radio + conditional with show-hide pattern
-- Elements in applicant-details step that need changing: the "use-passport-instead" radio and passport field

-- First, let's rebuild the applicant-details step elements with show-hide
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,0,elements}',
  '[
    {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
    {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
    {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name"}},
    {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
    {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
    {"ref": "components/nationality", "overrides": {"fieldId": "applicant-nationality", "label": "Nationality", "options": [{"label": "Barbadian", "value": "barbadian"}, {"label": "Trinidadian", "value": "trinidadian"}, {"label": "Jamaican", "value": "jamaican"}, {"label": "Guyanese", "value": "guyanese"}, {"label": "Vincentian", "value": "vincentian"}, {"label": "Grenadian", "value": "grenadian"}, {"label": "Lucian", "value": "lucian"}, {"label": "Antiguan", "value": "antiguan"}, {"label": "Bahamian", "value": "bahamian"}, {"label": "British", "value": "british"}, {"label": "American", "value": "american"}, {"label": "Canadian", "value": "canadian"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Nationality is required"}}}},
    {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-nid", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
    {"ref": "components/generic/show-hide", "overrides": {"fieldId": "passport-toggle", "label": "Use passport number instead", "hint": "If you don''t have a National ID number, you can use your passport number instead."}},
    {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "passport-toggle", "operator": "equal", "value": true}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}},
    {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
    {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
    {"ref": "components/address", "overrides": {"fieldId": "applicant-address-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
    {"ref": "components/address", "overrides": {"fieldId": "applicant-address-2", "label": "Address Line 2"}},
    {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
    {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}}
  ]'::jsonb
)
WHERE form_id = 'sell-goods-services-beach-park-test';
