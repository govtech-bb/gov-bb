-- Project Protege Mentor form migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000007',
  'project-protege-mentor-test',
  '1.0.0',
  '{
    "formId": "project-protege-mentor-test",
    "title": "Apply to be a Project Protege Mentor",
    "description": "Apply to become a mentor in the Project Protege programme.",
    "version": "1.0.0",
    "createdAt": "2026-05-07T00:00:00Z",
    "updatedAt": "2026-05-07T00:00:00Z",
    "steps": [
      {
        "stepId": "applicant",
        "title": "Tell us about yourself",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "hint": "For example, 27 03 2007", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "employment-status", "label": "What is your employment status?", "options": [{"label": "Studying", "value": "studying"}, {"label": "Employed", "value": "employed"}, {"label": "Unemployed", "value": "unemployed"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Employment status is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "institution-name", "label": "Name of institution", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "employment-status", "operator": "equal", "value": "studying"}], "validations": {"required": {"value": true, "error": "Institution name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "employer-name", "label": "Name of company or organisation", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "employment-status", "operator": "equal", "value": "employed"}], "validations": {"required": {"value": true, "error": "Company or organisation name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "other-employment-details", "label": "Please give details", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "employment-status", "operator": "equal", "value": "other"}], "validations": {"required": {"value": true, "error": "Employment details are required"}}}}
        ]
      },
      {
        "stepId": "contact",
        "title": "Contact details",
        "description": "Your contact information",
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
        "stepId": "mentorship",
        "title": "Tell us why you would be a good mentor",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "why-mentor", "label": "Why do you want to be a mentor?", "validations": {"required": {"value": true, "error": "Tell us why you want to be a mentor"}, "minLength": {"value": 5, "error": "Must be at least 5 characters"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "strengths", "label": "What are your strengths?", "hint": "What qualities, knowledge or skills do you have that would make you a good mentor?", "validations": {"required": {"value": true, "error": "Tell us about your strengths"}, "minLength": {"value": 5, "error": "Must be at least 5 characters"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "mentee-learn", "label": "What do you think a mentee could learn from you?", "hint": "You may use an experience you have had or a challenge you have overcome that shows an admirable quality", "validations": {"required": {"value": true, "error": "Tell us what a mentee could learn from you"}, "minLength": {"value": 5, "error": "Must be at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "preferences",
        "title": "Your preferences",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "mentee-gender-preference", "label": "Would you prefer a male or female mentee?", "hint": "We ask this so we can find the best mentee/mentor match and both can thrive", "options": [{"label": "Male", "value": "male"}, {"label": "Female", "value": "female"}, {"label": "No preference", "value": "no-preference"}], "validations": {"required": {"value": true, "error": "Select your preference"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "share-phone-number", "label": "Would you agree to share your personal number with your mentee?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select whether you would share your phone number"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "mentee-phone-number", "label": "What is your phone number?", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "share-phone-number", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Enter your phone number"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-mentee-in-mind", "label": "Do you have someone in mind that you would like to mentor?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select whether you have someone in mind"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "mentee-in-mind-name", "label": "What is their name?", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-mentee-in-mind", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Enter the name of the person you have in mind"}}}}
        ]
      },
      {
        "stepId": "experience",
        "title": "Your experience",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-mentor-experience", "label": "Do you have experience as a mentor?", "hint": "Previous experience is not mandatory", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select whether you have experience as a mentor"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "years-of-experience", "label": "How many years of experience?", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-mentor-experience", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Enter your years of experience"}}}}
        ]
      },
      {
        "stepId": "professional-referee",
        "title": "Tell us about your professional referee",
        "description": "This can be someone in a supervisory role who you have worked with. Or, if you have not been part of a workforce yet, this can be a teacher or lecturer.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "prof-ref-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "prof-ref-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "prof-ref-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Enter your relationship to the referee"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "prof-ref-email", "validations": {"required": {"value": true, "error": "Enter the referee email address"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "prof-ref-phone", "label": "Phone number", "validations": {"required": {"value": true, "error": "Enter the referee phone number"}}}}
        ]
      },
      {
        "stepId": "personal-referee",
        "title": "Tell us about your personal referee",
        "description": "This can be someone who can speak about your character. For example, a community leader or mentor.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "pers-ref-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "pers-ref-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "pers-ref-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Enter your relationship to the referee"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "pers-ref-email", "validations": {"required": {"value": true, "error": "Enter the referee email address"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "pers-ref-phone", "label": "Phone number", "validations": {"required": {"value": true, "error": "Enter the referee phone number"}}}}
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
