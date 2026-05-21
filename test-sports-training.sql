-- Sports Training Programme form migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000005',
  'community-sports-training-test',
  '1.0.0',
  '{
    "formId": "community-sports-training-test",
    "title": "Register for Community Sports Training Programme",
    "description": "Register your interest in a community sports training programme.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "personal",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "hint": "For example, 27 03 2007", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/sex", "overrides": {"fieldId": "applicant-sex", "validations": {"required": {"value": true, "error": "Sex is required"}}}}
        ]
      },
      {
        "stepId": "discipline",
        "title": "Which sport are you interested in?",
        "description": "We ask this to match you to a community sports training programme.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "discipline-interest", "label": "Discipline of interest", "hint": "For example, football or gymnastics", "validations": {"required": {"value": true, "error": "Discipline of interest is required"}, "minLength": {"value": 2, "error": "Discipline must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-experience", "label": "Do you have experience in this discipline?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Experience in this discipline is required"}}}}
        ]
      },
      {
        "stepId": "experience",
        "title": "Tell us about your experience",
        "description": "What level of experience do you have in the sport you are interested in?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "level-of-experience", "label": "What level of experience do you have?", "options": [{"label": "School", "value": "school"}, {"label": "Club", "value": "club"}, {"label": "National", "value": "national"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Experience level is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "other-experience", "label": "Please specify", "validations": {"required": {"value": true, "error": "Please specify your experience level"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "years-of-experience", "label": "Years of experience", "validations": {"required": {"value": true, "error": "Years of experience is required"}}}}
        ]
      },
      {
        "stepId": "employment",
        "title": "What is your employment status?",
        "description": "We ask this to help with scheduling and to help us see the impact of the programme.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "employment-status", "label": "What is your employment status?", "options": [{"label": "Studying", "value": "studying"}, {"label": "Employed", "value": "employed"}, {"label": "Unemployed", "value": "unemployed"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Employment status is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "institution-name", "label": "Name of institution or company"}},
          {"ref": "components/name", "overrides": {"fieldId": "employment-other-details", "label": "Please give details"}}
        ]
      },
      {
        "stepId": "membership",
        "title": "Do you belong to any organisations?",
        "description": "For example, a sports or social group, or a youth and community club.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "belongs-to-organisations", "label": "Do you belong to any organisations?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Organisational membership is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "organisation-1", "label": "Organisation 1"}},
          {"ref": "components/name", "overrides": {"fieldId": "organisation-2", "label": "Organisation 2 (optional)"}},
          {"ref": "components/name", "overrides": {"fieldId": "organisation-3", "label": "Organisation 3 (optional)"}}
        ]
      },
      {
        "stepId": "contact",
        "title": "Your contact details",
        "elements": [
          {"ref": "components/address", "overrides": {"fieldId": "contact-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "contact-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "contact-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "contact-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "contact-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "emergency",
        "title": "Emergency contact",
        "description": "If there is an emergency, who should we contact?",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "emergency-first-name", "validations": {"required": {"value": true, "error": "Emergency contact first name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "emergency-last-name", "validations": {"required": {"value": true, "error": "Emergency contact last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "emergency-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Relationship is required"}, "minLength": {"value": 2, "error": "Relationship must be at least 2 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "emergency-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "emergency-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "emergency-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "emergency-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "emergency-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
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
