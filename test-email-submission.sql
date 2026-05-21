-- Minimal 2-step form for testing email submission flow
-- Steps: 1) Contact info (name + email), 2) Declaration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  uuid_generate_v4(),
  'test-email-submission',
  '1.0.0',
  '{
    "formId": "test-email-submission",
    "title": "Test Email Submission",
    "description": "Minimal form for testing the email submission processor",
    "version": "1.0.0",
    "createdAt": "2026-05-11T00:00:00Z",
    "updatedAt": "2026-05-11T00:00:00Z",
    "steps": [
      {
        "stepId": "contact",
        "title": "Your Details",
        "elements": [
          {
            "ref": "components/name",
            "overrides": {
              "fieldId": "full-name",
              "label": "Full name",
              "validations": {
                "required": {"value": true, "error": "Full name is required"},
                "minLength": {"value": 2, "error": "Name must be at least 2 characters"}
              }
            }
          },
          {
            "ref": "components/email",
            "overrides": {
              "fieldId": "email",
              "label": "Email address",
              "validations": {
                "required": {"value": true, "error": "Email address is required"},
                "email": {"value": true, "error": "Enter a valid email address"}
              }
            }
          }
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
              "label": "Declaration",
              "options": [{"label": "I confirm that the information provided is correct.", "value": "confirmed"}],
              "validations": {
                "required": {"value": true, "error": "You must confirm the declaration to continue"}
              }
            }
          }
        ]
      }
    ],
    "processors": [
      {
        "type": "email",
        "config": {
          "recipientField": "contact.email",
          "subject": "Test submission received"
        }
      }
    ]
  }'::jsonb,
  NOW(),
  NOW(),
  NOW()
);
