-- Jobstart Plus Programme form migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000008',
  'jobstart-plus-programme-test',
  '1.0.0',
  '{
    "formId": "jobstart-plus-programme-test",
    "title": "Apply to Jobstart Plus Programme",
    "description": "Apply to the Jobstart Plus Programme run by the Ministry of Labour, Social Security and Third Sector.",
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
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/sex", "overrides": {"fieldId": "applicant-sex", "validations": {"required": {"value": true, "error": "Sex is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "marital-status", "label": "Marital status", "options": [{"label": "Single", "value": "single"}, {"label": "Married", "value": "married"}, {"label": "Divorced", "value": "divorced"}], "validations": {"required": {"value": true, "error": "Marital Status is required"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "applicant-nid", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-nis-number", "label": "Do you have a National Insurance number (NIS)?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "NIS Number is required"}}}},
          {"ref": "components/national-insurance-number", "overrides": {"fieldId": "nis-number", "label": "Provide your National Insurance number (NIS)", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-nis-number", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "NIS Number is required"}}}}
        ]
      },
      {
        "stepId": "disability-support",
        "title": "Do you have a disability?",
        "description": "We ask you this so we can accommodate accessibility or support needs.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-disability", "label": "Do you have a disability?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Disability status is required"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "disability-details", "label": "What is your disability?", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disability", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "Disability is required"}}}}
        ]
      },
      {
        "stepId": "contact-details",
        "title": "Your contact details",
        "description": "How can we reach you?",
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
        "stepId": "emergency-contact",
        "title": "Emergency contact details",
        "description": "In case of an emergency, who should we contact?",
        "elements": [
          {"ref": "components/title", "overrides": {"fieldId": "emergency-title", "validations": {"required": {"value": true, "error": "Title is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "emergency-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "emergency-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "emergency-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "emergency-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "emergency-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "emergency-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "emergency-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "emergency-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "primary-education",
        "title": "Tell us about your primary education",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "primary-school-name", "label": "Name of primary school", "validations": {"required": {"value": true, "error": "Name is required"}, "minLength": {"value": 5, "error": "Name must be at least 5 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "primary-start-year", "label": "Start year", "ui": {"width": "short"}, "validations": {"required": {"value": true, "error": "Start year is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "primary-end-year", "label": "End year", "ui": {"width": "short"}, "validations": {"required": {"value": true, "error": "End year is required"}}}}
        ]
      },
      {
        "stepId": "secondary-education",
        "title": "Tell us about your secondary education",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "secondary-school-name", "label": "Name of secondary school", "validations": {"required": {"value": true, "error": "Name of secondary school is required"}, "minLength": {"value": 5, "error": "Name must be at least 5 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "secondary-start-year", "label": "Start year", "ui": {"width": "short"}, "validations": {"required": {"value": true, "error": "Start year is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "secondary-end-year", "label": "End year", "ui": {"width": "short"}, "validations": {"required": {"value": true, "error": "End year is required"}}}}
        ]
      },
      {
        "stepId": "post-secondary",
        "title": "Post-secondary and tertiary training",
        "description": "Add information about college, university and training courses you have completed.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "post-sec-institution-1", "label": "Name of institution"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "post-sec-qualifications-1", "label": "What are your qualifications?"}},
          {"ref": "components/name", "overrides": {"fieldId": "post-sec-courses-1", "label": "Courses or subjects", "hint": "Separate each course with a comma"}},
          {"ref": "components/name", "overrides": {"fieldId": "post-sec-start-year-1", "label": "Start year", "ui": {"width": "short"}}},
          {"ref": "components/name", "overrides": {"fieldId": "post-sec-end-year-1", "label": "End year", "ui": {"width": "short"}}}
        ]
      },
      {
        "stepId": "previous-paid-job",
        "title": "Have you had a paid job?",
        "description": "This includes part-time and/or casual work, or a full-time employed position.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-previous-paid-job", "label": "Have you had a paid job?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "employer-name", "label": "Name of employer", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-paid-job", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "occupation", "label": "Occupation", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-paid-job", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "job-start-date", "label": "When did you start this job?", "hint": "Provide the month and year (for example, December 2023)", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-paid-job", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "job-end-date", "label": "When did you end this job?", "hint": "Provide the month and year (for example, December 2023)", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-paid-job", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "main-tasks", "label": "Your main tasks", "hint": "Provide a brief description of what you did in your role.", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-previous-paid-job", "operator": "equal", "value": "yes"}]}}
        ]
      },
      {
        "stepId": "eligibility-interests",
        "title": "Tell us about your areas of interest",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "job-interests", "label": "What type of jobs or trades are you interested in?", "hint": "For example, chef or carpentry", "validations": {"required": {"value": true, "error": "Interests is required"}, "minLength": {"value": 5, "error": "This must be at least 5 characters"}}}}
        ]
      },
      {
        "stepId": "eligibility-age",
        "title": "Are you 18 or over?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "are-you-over-18", "label": "Are you 18 or over?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "willing-to-work-nights", "label": "Are you willing to work some night shifts?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "are-you-over-18", "operator": "equal", "value": "yes"}], "validations": {"required": {"value": true, "error": "This field is required"}}}}
        ]
      },
      {
        "stepId": "short-term-goals",
        "title": "Tell us about your short-term goals",
        "description": "This helps us understand the kinds of opportunities that will support your growth.",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "short-term-goals", "label": "Tell us about your short-term goals", "validations": {"required": {"value": true, "error": "Short Term Goals is required"}, "minLength": {"value": 5, "error": "This must be at least 5 characters"}}}}
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
