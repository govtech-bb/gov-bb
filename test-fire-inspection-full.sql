-- Full fire service inspection with all fields
DELETE FROM form_definitions WHERE form_id = 'request-fire-inspection-test';

INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'request-fire-inspection-test',
  '1.0.0',
  '{
    "formId": "request-fire-inspection-test",
    "title": "Request a Fire Service Inspection",
    "description": "Request an inspection of your premises by the Barbados Fire Service.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "premises",
        "title": "Tell us about the premises",
        "elements": [
          {
            "ref": "components/generic/radio",
            "overrides": {
              "fieldId": "type-of-premises",
              "label": "Type of premises",
              "options": [
                {"label": "Hotel", "value": "hotel"},
                {"label": "Daycare", "value": "daycare"},
                {"label": "Place of entertainment", "value": "placeOfEntertainment"}
              ],
              "validations": {"required": {"value": true, "error": "Type of premises is required"}}
            }
          },
          {
            "ref": "components/name",
            "overrides": {
              "fieldId": "name-of-premises",
              "label": "Name of premises",
              "validations": {"required": {"value": true, "error": "Name of premises is required"}}
            }
          },
          {
            "ref": "components/address",
            "overrides": {
              "fieldId": "premises-address-line-1",
              "label": "Address line 1",
              "validations": {"required": {"value": true, "error": "Address line 1 is required"}}
            }
          },
          {
            "ref": "components/address",
            "overrides": {
              "fieldId": "premises-address-line-2",
              "label": "Address line 2"
            }
          },
          {
            "ref": "components/parish",
            "overrides": {
              "fieldId": "premises-parish",
              "options": [
                {"label": "Christ Church", "value": "christ-church"},
                {"label": "St. Andrew", "value": "st-andrew"},
                {"label": "St. George", "value": "st-george"},
                {"label": "St. James", "value": "st-james"},
                {"label": "St. John", "value": "st-john"},
                {"label": "St. Joseph", "value": "st-joseph"},
                {"label": "St. Lucy", "value": "st-lucy"},
                {"label": "St. Michael", "value": "st-michael"},
                {"label": "St. Peter", "value": "st-peter"},
                {"label": "St. Philip", "value": "st-philip"},
                {"label": "St. Thomas", "value": "st-thomas"}
              ],
              "validations": {"required": {"value": true, "error": "Parish is required"}}
            }
          }
        ]
      },
      {
        "stepId": "certificate-purpose",
        "title": "Who is the certificate for?",
        "elements": [
          {
            "ref": "components/generic/radio",
            "overrides": {
              "fieldId": "purpose-of-certificate",
              "label": "Purpose of certificate",
              "options": [
                {"label": "Barbados Tourism Authority", "value": "barbados-tourism-authority"},
                {"label": "Child Care Board", "value": "child-care-board"},
                {"label": "Treasury", "value": "treasury"}
              ],
              "validations": {"required": {"value": true, "error": "Purpose of certificate is required"}}
            }
          }
        ]
      },
      {
        "stepId": "applicant",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {
            "ref": "components/confirmation",
            "overrides": {
              "fieldId": "declaration-confirmed",
              "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.",
              "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}
            }
          },
          {
            "ref": "components/date-of-birth",
            "overrides": {
              "fieldId": "declaration-date",
              "label": "Date of declaration",
              "isHidden": true,
              "validations": {"required": {"value": true, "error": "Date is required"}}
            }
          }
        ]
      }
    ],
    "processors": []
  }',
  NOW(), NOW(), NOW()
);
