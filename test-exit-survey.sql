-- Exit Survey form migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'exit-survey-test',
  '1.0.0',
  '{
    "formId": "exit-survey-test",
    "title": "Help us improve this service",
    "description": "Your feedback helps us improve this service. This will take about 30 seconds and includes 4 short questions.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "difficulty-rating",
        "title": "Overall, how easy or difficult was it to complete this form?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "difficulty-rating", "label": "How easy or difficult was it to complete this form?", "options": [{"label": "Very Easy", "value": "very-easy"}, {"label": "Easy", "value": "easy"}, {"label": "Neither easy nor difficult", "value": "neither"}, {"label": "Difficult", "value": "difficult"}, {"label": "Very Difficult", "value": "very-difficult"}], "validations": {"required": {"value": true, "error": "Select a difficulty rating"}}}}
        ]
      },
      {
        "stepId": "clarity-rating",
        "title": "How clear were the instructions and information on this form?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "clarity-rating", "label": "How clear were the instructions and information on this form?", "options": [{"label": "Very Clear", "value": "very-clear"}, {"label": "Clear", "value": "clear"}, {"label": "Neither clear nor unclear", "value": "neither"}, {"label": "Unclear", "value": "unclear"}, {"label": "Very Unclear", "value": "very-unclear"}], "validations": {"required": {"value": true, "error": "Select a clarity rating"}}}}
        ]
      },
      {
        "stepId": "technical-problems",
        "title": "Did you experience any technical problems or barriers while using this form?",
        "description": "Examples include a button not working, an error message you could not resolve, or difficulty using a screen reader or other assistive technology.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "technical-problems", "label": "Did you experience any technical problems when using this form?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select yes or no"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "technical-problems-description", "label": "Please briefly describe the problem you experienced", "validations": {"required": {"value": true, "error": "Please describe the problem you experienced"}, "minLength": {"value": 2, "error": "Please provide at least 2 characters"}}}}
        ]
      },
      {
        "stepId": "areas-for-improvement",
        "title": "What is one thing we could do to improve this form?",
        "description": "You can comment on anything, such as the questions, wording, layout, or how easy the form was to use.",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "areas-for-improvement", "label": "What is one thing we could do to improve this form?", "validations": {"required": {"value": true, "error": "Areas for improvement is required"}, "minLength": {"value": 10, "error": "Please provide at least 10 characters"}}}}
        ]
      }
    ],
    "processors": []
  }',
  NOW(), NOW(), NOW()
);
