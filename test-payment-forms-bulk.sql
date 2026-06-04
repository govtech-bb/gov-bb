-- ============================================================
-- Bulk insert: 6 payment forms migrated from frontend-alpha
-- Forms: get-death-certificate, get-marriage-certificate,
--        post-office-redirection-business, post-office-redirection-deceased,
--        post-office-redirection-individual, primary-school-textbook-grant
-- UUIDs: b0000000-0000-0000-0000-00000000000a through ...00000f
-- ============================================================

-- Clean up any existing rows first (idempotent)
DELETE FROM form_definitions WHERE form_id IN (
  'get-death-certificate-test',
  'get-marriage-certificate-test',
  'post-office-redirection-business-test',
  'post-office-redirection-deceased-test',
  'post-office-redirection-individual-test',
  'primary-school-textbook-grant-test'
);

-- 1. get-death-certificate-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000a',
  'get-death-certificate-test',
  '1.0.0',
  '{
    "formId": "get-death-certificate-test",
    "title": "Get a Death Certificate",
    "description": "Apply for a certified copy of a death certificate",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle name", "hint": "Optional. Provide only if known"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-2", "label": "Address Line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-id-number", "label": "National Identification (ID) Number", "placeholder": "for example, 850101-0001", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "relationship-to-person",
        "title": "Tell us your relationship with the deceased",
        "description": "For example, spouse, child, parent, sibling, executor, or authorised representative.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "relationship-to-person", "label": "Relationship", "validations": {"required": {"value": true, "error": "Relationship is required"}}, "options": [{"label": "Parent", "value": "parent"}, {"label": "Spouse", "value": "spouse"}, {"label": "Child", "value": "child"}, {"label": "Sibling", "value": "sibling"}, {"label": "Grandparent", "value": "grandparent"}, {"label": "Legal guardian", "value": "legal-guardian"}, {"label": "Legal representative", "value": "legal-representative"}, {"label": "Other (please describe)", "value": "other"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "relationship-other-description", "label": "Please describe your relationship", "validations": {"required": {"value": true, "error": "Please describe your relationship"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "relationship-to-person", "operator": "equal", "value": "other"}]}}
        ]
      },
      {
        "stepId": "reason-for-certificate",
        "title": "Tell us about why you need this certificate",
        "description": "Give the reason in a short sentence.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "reason-for-certificate", "label": "Reason for requesting the certificate", "validations": {"required": {"value": true, "error": "Reason is required"}, "minLength": {"value": 10, "error": "Please provide at least 10 characters"}}}}
        ]
      },
      {
        "stepId": "deceased-details",
        "title": "Tell us about the deceased",
        "description": "Provide as much information as you can to help us find the correct record.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "deceased-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "deceased-middle-name", "label": "Middle name", "hint": "Leave blank if not known"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "deceased-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "deceased-known-date-of-death", "label": "Do you know the date the person died?", "validations": {"required": {"value": true, "error": "Whether date of death is known is required"}}, "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "deceased-date-of-death", "label": "Date of death", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "deceased-known-date-of-death", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "deceased-estimated-date-of-death", "label": "Provide the two-year search range you want us to check", "hint": "Enter a 2-year period, for example 1990 to 1991. If you are not sure, give your best estimate.", "validations": {"required": {"value": true, "error": "Estimate is required"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "deceased-known-date-of-death", "operator": "equal", "value": "no"}]}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "deceased-id-number", "label": "National Identification (ID) Number", "hint": "Enter only if known"}},
          {"ref": "components/name", "overrides": {"fieldId": "deceased-place-of-death", "label": "Place of death", "hint": "Enter the location where the person died. If you do not know the exact address, provide the town, city, or country.", "validations": {"required": {"value": true, "error": "Place of death is required"}}}}
        ]
      },
      {
        "stepId": "order-details",
        "title": "How many copies do you need?",
        "description": "Each copy costs $5.00 BBD for a certificate",
        "elements": [
          {"ref": "components/generic/number", "overrides": {"fieldId": "number-of-copies", "label": "Number of copies", "validations": {"required": {"value": true, "error": "Number of copies is required"}}, "ui": {"width": "short"}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;


-- 2. get-marriage-certificate-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000b',
  'get-marriage-certificate-test',
  '1.0.0',
  '{
    "formId": "get-marriage-certificate-test",
    "title": "Get a Marriage Certificate",
    "description": "Apply for a certified copy of a marriage certificate",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle name", "hint": "Optional. Provide only if known"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-id-number", "label": "National Identification (ID) Number", "placeholder": "for example, 850101-0001", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-is-barbados-national", "label": "Are you a Barbados national?", "validations": {"required": {"value": true, "error": "Select an option"}}, "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}}
        ]
      },
      {
        "stepId": "applying-for-yourself",
        "title": "Are you applying for your own marriage certificate?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applying-for-yourself", "label": "Are you applying for your own marriage certificate?", "validations": {"required": {"value": true, "error": "Select an option"}}, "options": [{"label": "Yes - the certificate is for me", "value": "yes"}, {"label": "No - the certificate is for someone else", "value": "no"}]}}
        ]
      },
      {
        "stepId": "husband-details",
        "title": "Tell us about the husband",
        "description": "Enter the details as they appear on the marriage record, if known.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "husband-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "husband-middle-name", "label": "Middle name", "hint": "Leave blank if there are no middle names or if they are not known."}},
          {"ref": "components/last-name", "overrides": {"fieldId": "husband-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "husband-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "husband-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "husband-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "husband-no-national-id", "operator": "equal", "value": "yes"}]}}
        ]
      },
      {
        "stepId": "wife-details",
        "title": "Tell us about the wife",
        "description": "Enter the details as they appear on the marriage record, if known.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "wife-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "wife-middle-name", "label": "Middle name", "hint": "Leave blank if there are no middle names or if they are not known."}},
          {"ref": "components/name", "overrides": {"fieldId": "wife-maiden-name", "label": "Maiden name", "hint": "This is their last name before marriage", "validations": {"required": {"value": true, "error": "Maiden name is required"}, "minLength": {"value": 2, "error": "Maiden name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "wife-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "wife-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "wife-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "wife-no-national-id", "operator": "equal", "value": "yes"}]}}
        ]
      },
      {
        "stepId": "marriage-details",
        "title": "Provide your marriage details",
        "description": "Answer as accurately as possible",
        "elements": [
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "date-of-marriage", "label": "Date of marriage"}},
          {"ref": "components/name", "overrides": {"fieldId": "place-of-marriage", "label": "Place of marriage", "hint": "For example, the parish and church or registry office.", "validations": {"required": {"value": true, "error": "Place of marriage is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}}
        ]
      },
      {
        "stepId": "reason-for-requesting",
        "title": "Tell us about why you are requesting this certificate",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "applying-for-yourself", "targetStepId": "applying-for-yourself", "operator": "equal", "value": "no"}],
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "relationship-to-married-persons", "label": "What is your relationship to the persons married?", "hint": "For example, spouse, child, parent, sibling, or authorised representative. If you have a relationship to both, you can describe either one.", "validations": {"required": {"value": true, "error": "Relationship is required"}}, "options": [{"label": "Parent", "value": "parent"}, {"label": "Spouse", "value": "spouse"}, {"label": "Child", "value": "child"}, {"label": "Sibling", "value": "sibling"}, {"label": "Grandparent", "value": "grandparent"}, {"label": "Legal guardian", "value": "legal-guardian"}, {"label": "Legal representative", "value": "legal-representative"}, {"label": "Other (please describe)", "value": "other"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "relationship-other-description", "label": "Please describe your relationship", "validations": {"required": {"value": true, "error": "Please describe your relationship"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "relationship-to-married-persons", "operator": "equal", "value": "other"}]}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "explanation-for-requesting", "label": "Why are you requesting the marriage certificate?", "hint": "This information helps us confirm that you are eligible to request the certificate.", "validations": {"required": {"value": true, "error": "Explanation is required"}}}}
        ]
      },
      {
        "stepId": "order-details",
        "title": "How many copies do you need?",
        "description": "Each copy costs $5.00 BBD for a certificate",
        "elements": [
          {"ref": "components/generic/number", "overrides": {"fieldId": "number-of-copies", "label": "Number of copies", "validations": {"required": {"value": true, "error": "Number of copies is required"}}, "ui": {"width": "short"}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;


-- 3. post-office-redirection-business-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000c',
  'post-office-redirection-business-test',
  '1.0.0',
  '{
    "formId": "post-office-redirection-business-test",
    "title": "Post Office Redirection - Business",
    "description": "Apply to redirect business mail to a new address",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Tell us about the person submitting this application",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle name", "hint": "Enter all middle names in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "business-name",
        "title": "Tell us about the business",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "business-name", "label": "Business name", "validations": {"required": {"value": true, "error": "Business name is required"}, "minLength": {"value": 5, "error": "Business name must be at least 5 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "registration-number", "label": "Registration number", "validations": {"required": {"value": true, "error": "Registration number is required"}, "minLength": {"value": 5, "error": "Registration number must be at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "current-address",
        "title": "Current address of the business",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "current-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "current-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "current-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "current-address-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "position-details",
        "title": "Tell us what position you hold in the business",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "position-details", "label": "Position", "hint": "For example, are you a director, manager, or an appointed agent?", "validations": {"required": {"value": true, "error": "Position is required"}, "minLength": {"value": 5, "error": "Position must be at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "new-address",
        "title": "Where should we redirect the mail?",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "new-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "new-address-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-start-date", "label": "When do you want the redirection to start?"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-end-date", "label": "When do you want the redirection to end?", "hint": "A redirection notice lasts for a maximum of 6 months."}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;


-- 4. post-office-redirection-deceased-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000d',
  'post-office-redirection-deceased-test',
  '1.0.0',
  '{
    "formId": "post-office-redirection-deceased-test",
    "title": "Post Office Redirection - Deceased",
    "description": "Apply to redirect mail for a deceased person to a new address",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "deceased-details",
        "title": "Tell us about the deceased",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "deceased-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "deceased-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "deceased-middle-name", "label": "Middle name(s)", "hint": "Enter all middle names in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "deceased-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "deceased-date-of-death", "label": "Date of death"}}
        ]
      },
      {
        "stepId": "address",
        "title": "Address of the deceased person",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "old-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "old-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "old-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "old-address-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle name(s)", "hint": "Optional. Enter only if known."}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-relationship-to-deceased", "label": "What is your relationship to the deceased person?", "validations": {"required": {"value": true, "error": "Relationship is required"}}, "options": [{"label": "Parent", "value": "parent"}, {"label": "Spouse", "value": "spouse"}, {"label": "Child", "value": "child"}, {"label": "Sibling", "value": "sibling"}, {"label": "Grandparent", "value": "grandparent"}, {"label": "Legal guardian", "value": "legal-guardian"}, {"label": "Legal representative", "value": "legal-representative"}, {"label": "Other (please describe)", "value": "other"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "applicant-relationship-other", "label": "Please describe your relationship", "validations": {"required": {"value": true, "error": "Please describe your relationship"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-relationship-to-deceased", "operator": "equal", "value": "other"}]}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "permission-details",
        "title": "What authority do you have to act on behalf of the deceased person?",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "permission-details", "label": "Authority details", "hint": "For example, I am executor of the will, or I have letters of Administration", "validations": {"required": {"value": true, "error": "Permission details is required"}, "minLength": {"value": 5, "error": "Permission details must be at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "new-address",
        "title": "Where should we redirect the mail?",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "new-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "new-address-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-start-date", "label": "When do you want the redirection to start?"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-end-date", "label": "When do you want the redirection to end?", "hint": "A redirection notice lasts for a maximum of 6 months"}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;


-- 5. post-office-redirection-individual-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000e',
  'post-office-redirection-individual-test',
  '1.0.0',
  '{
    "formId": "post-office-redirection-individual-test",
    "title": "Post Office Redirection - Individual",
    "description": "Apply to redirect your personal mail to a new address",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "label": "Middle name(s)", "hint": "Enter all middle names in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-date-of-birth", "label": "Date of birth"}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "old-address",
        "title": "Old address",
        "description": "Which address does your personal mail currently go to?",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "old-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "old-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "old-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "old-address-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "new-address",
        "title": "New address",
        "description": "Which address would you like your personal mail to go to?",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "new-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "new-address-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "new-address-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-start-date", "label": "When do you want the redirection to start?"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "redirection-end-date", "label": "When do you want the redirection to end?", "hint": "A redirection notice lasts for a maximum of 6 months."}}
        ]
      },
      {
        "stepId": "minor-dependents",
        "title": "Are there any minor dependents who also need their mail to be redirected to the new address?",
        "description": "Dependants are children under 18 or vulnerable relatives (those with physical or mental infirmity or care needs)",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "any-minor-dependents", "label": "Are there any minor dependents who also need their mail to be redirected to the new address?", "validations": {"required": {"value": true, "error": "Select an option"}}, "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}}
        ]
      },
      {
        "stepId": "minor-details",
        "title": "Tell us about your dependent(s)",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "any-minor-dependents", "targetStepId": "minor-dependents", "operator": "equal", "value": "yes"}, {"type": "repeatable", "min": 1, "max": 5}],
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "minor-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "minor-middle-name", "label": "Middle name(s)", "hint": "Enter all middle names in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "minor-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "minor-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}}
        ]
      },
      {
        "stepId": "adult-dependents",
        "title": "Are there any adults who also need their mail to be redirected to the new address?",
        "description": "Adults are members of the household who are 18 years old and over",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "any-adult-dependents", "label": "Are there any adults who also need their mail to be redirected to the new address?", "validations": {"required": {"value": true, "error": "Select an option"}}, "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}}
        ]
      },
      {
        "stepId": "adult-details",
        "title": "Tell us about the adult(s)",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "any-adult-dependents", "targetStepId": "adult-dependents", "operator": "equal", "value": "yes"}, {"type": "repeatable", "min": 1, "max": 5}],
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "adult-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "adult-middle-name", "label": "Middle name(s)", "hint": "Enter all middle names in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "adult-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "adult-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;


-- 6. primary-school-textbook-grant-test
INSERT INTO form_definitions (id, form_id, version, schema, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-00000000000f',
  'primary-school-textbook-grant-test',
  '1.0.0',
  '{
    "formId": "primary-school-textbook-grant-test",
    "title": "Primary School Textbook Grant",
    "description": "Apply for the primary school textbook grant (BDS $100)",
    "version": "1.0.0",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "steps": [
      {
        "stepId": "tell-us-about-the-child",
        "title": "Tell us about the child",
        "description": "You can add information for other children later",
        "behaviours": [{"type": "repeatable", "min": 1, "max": 5}],
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "child-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "child-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "child-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "child-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "child-passport-number", "label": "Passport Number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "child-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/sex", "overrides": {"fieldId": "child-sex", "validations": {"required": {"value": true, "error": "Please select the child''s sex"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "child-school", "label": "Name of institution", "validations": {"required": {"value": true, "error": "Please enter the child''s school."}}}},
          {"ref": "components/name", "overrides": {"fieldId": "child-principal-name", "label": "Name of principal", "validations": {"required": {"value": true, "error": "Principal''s name is required"}, "minLength": {"value": 2, "error": "Principal''s name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "child-class-number", "label": "Which class are they currently in?", "hint": "If they are between school years, add the class they are going into", "validations": {"required": {"value": true, "error": "Class number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "is-parent-or-guardian", "label": "Are you the parent or guardian?", "validations": {"required": {"value": true, "error": "Relationship is required"}}, "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "relationship-description", "label": "What is your relationship with the child?", "validations": {"required": {"value": true, "error": "Please describe your relationship"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "is-parent-or-guardian", "operator": "equal", "value": "no"}]}}
        ]
      },
      {
        "stepId": "guardian-details",
        "title": "Tell us about the parent or guardian",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "is-parent-or-guardian", "targetStepId": "tell-us-about-the-child", "operator": "equal", "value": "no"}],
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "guardian-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "guardian-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "guardian-id-number", "label": "National Identification (ID) number", "validations": {"required": {"value": true, "error": "ID number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "guardian-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "guardian-passport-number", "label": "Passport number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "guardian-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "guardian-tamis-number", "label": "TAMIS number", "validations": {"required": {"value": true, "error": "TAMIS number is required"}}}}
        ]
      },
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "validations": {"required": {"value": true, "error": "Parish is required"}}, "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}]}},
          {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-id-number", "label": "National Identification (ID) Number", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-no-national-id", "label": "Do you not have a National ID?", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I have a National ID", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "label": "Passport number", "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}, "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "applicant-no-national-id", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "applicant-tamis-number", "label": "TAMIS number", "validations": {"required": {"value": true, "error": "TAMIS number is required"}}}}
        ]
      },
      {
        "stepId": "bank-account",
        "title": "Bank account information",
        "description": "Add the bank account details for an account which has been used within the last 3 months. Check your details are correct to avoid delays.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "account-holder-name", "label": "Account holder name", "hint": "Enter the full name shown on the bank account", "validations": {"required": {"value": true, "error": "Name on account is required"}, "minLength": {"value": 2, "error": "Name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "bank-name", "label": "Bank name", "hint": "For example: Republic Bank, CIBC FirstCaribbean, Scotiabank, or First Citizens", "validations": {"required": {"value": true, "error": "Bank name is required"}, "minLength": {"value": 2, "error": "Bank name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "account-number", "label": "Account number", "hint": "Enter the account number exactly as it appears on your bank statement", "validations": {"required": {"value": true, "error": "Account number is required"}, "minLength": {"value": 2, "error": "Account number must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "branch-name", "label": "Branch name", "hint": "Enter the branch where the account is held", "validations": {"required": {"value": true, "error": "Branch name is required"}, "minLength": {"value": 2, "error": "Branch name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "branch-code", "label": "Branch code", "hint": "Enter the bank branch code used for transfers", "validations": {"required": {"value": true, "error": "Branch code is required"}, "minLength": {"value": 2, "error": "Branch code must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "account-type", "label": "Account type", "validations": {"required": {"value": true, "error": "Please select an account type"}}, "options": [{"label": "Savings", "value": "savings"}, {"label": "Chequing", "value": "chequing"}]}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration"}}
        ]
      }
    ],
    "processors": []
  }'::jsonb,
  NOW(),
  NOW()
)
;

-- Verification query
SELECT form_id, version, id FROM form_definitions
WHERE form_id IN (
  'get-death-certificate-test',
  'get-marriage-certificate-test',
  'post-office-redirection-business-test',
  'post-office-redirection-deceased-test',
  'post-office-redirection-individual-test',
  'primary-school-textbook-grant-test'
)
ORDER BY form_id;
