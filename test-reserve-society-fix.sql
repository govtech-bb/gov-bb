-- Delete the broken version
DELETE FROM form_definitions WHERE form_id = 'reserve-society-name-test';

-- Re-insert with a simpler recipe (no duplicate fieldIds)
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'reserve-society-name-test',
  '1.0.0',
  '{
    "formId": "reserve-society-name-test",
    "title": "Reserve a Society Name",
    "description": "Request to search, reserve, or change a society name.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "request-details",
        "title": "What do you want to do?",
        "elements": [
          {
            "ref": "components/generic/radio",
            "overrides": {
              "label": "What do you want to do?",
              "options": [
                {"label": "Search if society name is available", "value": "request-search"},
                {"label": "Reserve a society name", "value": "reserve-name"},
                {"label": "Change the name of an existing society", "value": "change-name"}
              ],
              "validations": {"required": {"value": true, "error": "Select an option"}}
            }
          }
        ]
      },
      {
        "stepId": "applicant-details",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/first-name", "overrides": {"validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/middle-name", "overrides": {"hint": "Optional. Provide only if known"}},
          {"ref": "components/last-name", "overrides": {"validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}}}},
          {"ref": "components/parish", "overrides": {"options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/email", "overrides": {"validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {
            "ref": "components/confirmation",
            "overrides": {
              "label": "I confirm that my information is correct and I am happy for it to be verified.",
              "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}
            }
          }
        ]
      }
    ],
    "processors": []
  }',
  NOW(), NOW(), NOW()
);
