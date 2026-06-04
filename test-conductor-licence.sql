-- Apply for Conductor Licence form migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000006',
  'apply-for-conductor-licence-test',
  '1.0.0',
  '{
    "formId": "apply-for-conductor-licence-test",
    "title": "Apply for a Conductor Licence",
    "description": "Apply for a conductor licence to operate public service vehicles in Barbados.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "applicant-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name", "hint": "If you have more than one, add them in order"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-nid", "validations": {"required": {"value": true, "error": "ID Number is required"}}}}
        ]
      },
      {
        "stepId": "contact-details",
        "title": "Contact details",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "contact-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "contact-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "contact-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/postcode", "overrides": {"fieldId": "contact-postcode", "hint": "For example, BB17004 (optional)"}},
          {"ref": "components/email", "overrides": {"fieldId": "contact-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "contact-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "licence-history",
        "title": "Tell us about your licence history",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-previous-licence", "label": "Have you had a conductor or driving licence before?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "licence-number", "label": "Provide your licence number"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "licence-date-of-issue", "label": "Date of issue"}}
        ]
      },
      {
        "stepId": "endorsements",
        "title": "Tell us about any endorsements",
        "description": "An endorsement is a record of an offence added to your conductor or driving licence.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-endorsements", "label": "Do you have any endorsements?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "endorsement-type", "label": "Type of licence"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "endorsement-date", "label": "Date of endorsement"}},
          {"ref": "components/name", "overrides": {"fieldId": "endorsement-duration", "label": "How long did the endorsement appear on your licence?"}}
        ]
      },
      {
        "stepId": "disqualifications",
        "title": "Tell us about your disqualifications",
        "description": "A disqualification is when a court has stopped you from getting or holding a licence.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-disqualifications", "label": "Have you ever been disqualified?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "disqualification-court", "label": "Court name"}},
          {"ref": "components/name", "overrides": {"fieldId": "disqualification-reason", "label": "Court reason for disqualification"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "disqualification-date", "label": "Date of disqualification"}},
          {"ref": "components/name", "overrides": {"fieldId": "disqualification-length", "label": "Length of disqualification"}}
        ]
      },
      {
        "stepId": "convictions",
        "title": "Your criminal convictions",
        "description": "A conviction is when a court has found you guilty of a criminal offence.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-convictions", "label": "Have you ever had any criminal convictions?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}}
        ]
      },
      {
        "stepId": "document-uploads",
        "title": "Upload supporting documents",
        "elements": [
          {"ref": "components/upload-document", "overrides": {"fieldId": "police-certificate", "label": "Upload a Police Certificate of Character", "hint": "Attach a .pdf, .docx or .png file.", "validations": {"required": {"value": true, "error": "Police Certificate of Character is required"}}}}
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
