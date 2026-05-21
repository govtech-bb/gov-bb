-- Get Birth Certificate form migration (render-only, no payment processor)
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000009',
  'get-birth-certificate-test',
  '1.0.0',
  '{
    "formId": "get-birth-certificate-test",
    "title": "Get a Birth Certificate",
    "description": "Apply for a certified copy of a birth certificate.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "hint": "Optional. Provide only if known"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-2", "label": "Address Line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-nid", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "use-passport-instead", "label": "Do you not have a National ID number?", "hint": "If you do not have a National ID, you can use your passport number instead.", "options": [{"label": "Yes, use passport instead", "value": "yes"}, {"label": "No, I provided my National ID above", "value": "no"}]}},
          {"ref": "components/passport-number", "overrides": {"fieldId": "applicant-passport-number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "use-passport-instead", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Passport number is required"}, "minLength": {"value": 6, "error": "Passport number must be at least 6 characters"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "applying-for-yourself",
        "title": "Are you applying for your own birth certificate?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applying-for-yourself", "label": "Are you applying for your own birth certificate?", "options": [{"label": "Yes - the certificate is for me", "value": "yes"}, {"label": "No - the certificate is for someone else", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}}
        ]
      },
      {
        "stepId": "relationship-to-person",
        "title": "What is your relationship to the person?",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "applying-for-yourself", "targetStepId": "applying-for-yourself", "operator": "equal", "value": "no"}],
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "relationship-to-person", "label": "What is your relationship to the person?", "options": [{"label": "Parent", "value": "parent"}, {"label": "Spouse", "value": "spouse"}, {"label": "Child", "value": "child"}, {"label": "Sibling", "value": "sibling"}, {"label": "Grandparent", "value": "grandparent"}, {"label": "Legal guardian", "value": "legal-guardian"}, {"label": "Legal representative", "value": "legal-representative"}, {"label": "Other (please describe)", "value": "other"}], "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "relationship-other-description", "label": "Please describe your relationship", "hint": "For example, nephew, researcher, historian, or authorised representative.", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "relationship-to-person", "operator": "equal", "value": "other"}], "validations": {"required": {"value": true, "error": "Please describe your relationship"}}}}
        ]
      },
      {
        "stepId": "reason-for-certificate",
        "title": "Tell us why you are ordering a birth certificate",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "reason-for-ordering", "label": "Reason", "validations": {"required": {"value": true, "error": "Reason is required"}, "minLength": {"value": 5, "error": "Please provide at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "person-details",
        "title": "Tell us about the person you are applying for",
        "behaviours": [{"type": "stepConditionalOn", "targetFieldId": "applying-for-yourself", "targetStepId": "applying-for-yourself", "operator": "equal", "value": "no"}],
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "person-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "person-middle-name", "hint": "Optional. Provide only if known"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "person-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "person-has-nis", "label": "Do they have a National Insurance (NIS) number?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/national-insurance-number", "overrides": {"fieldId": "person-nis-number", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "person-has-nis", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "NIS number is required"}}}}
        ]
      },
      {
        "stepId": "birth-details",
        "title": "Provide the birth details",
        "description": "Answer as accurately as possible",
        "elements": [
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "birth-date-of-birth", "label": "Date of birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "place-of-birth", "label": "Place of birth", "validations": {"required": {"value": true, "error": "Place of birth is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "place-of-baptism", "label": "Place of baptism"}}
        ]
      },
      {
        "stepId": "parents",
        "title": "Tell us the parents names",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "father-first-name", "label": "Father first name"}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "father-middle-name", "label": "Father middle name"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "father-last-name", "label": "Father last name"}},
          {"ref": "components/first-name", "overrides": {"fieldId": "mother-first-name", "label": "Mother first name", "validations": {"required": {"value": true, "error": "First name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "mother-other-names", "label": "Mother other names"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "mother-last-name", "label": "Mother last name", "validations": {"required": {"value": true, "error": "Last name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "mother-maiden-name", "label": "Mother maiden name"}}
        ]
      },
      {
        "stepId": "order-details",
        "title": "How many copies will you be ordering?",
        "elements": [
          {"ref": "components/generic/number", "overrides": {"fieldId": "number-of-copies", "label": "Number of copies", "defaultValue": 1, "validations": {"required": {"value": true, "error": "Number of copies is required"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date of declaration", "isHidden": true, "validations": {"required": {"value": true, "error": "Date is required"}}}}
        ]
      }
    ],
    "processors": []
  }',
  NOW(), NOW(), NOW()
);
