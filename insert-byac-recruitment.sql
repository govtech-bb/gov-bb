INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'youthadvance-corps-recruitment',
  '1.0.0',
  $recipe${
    "formId": "youthadvance-corps-recruitment",
    "title": "Barbados YouthADVANCE Corps Recruitment Form",
    "description": "Recruitment form for the Ministry of Youth, Sports and Community Empowerment's Barbados YouthADVANCE Corps programme.",
    "version": "1.0.0",
    "createdAt": "2026-05-11T00:00:00Z",
    "updatedAt": "2026-05-11T00:00:00Z",
    "steps": [
      {
        "stepId": "personal-details",
        "title": "Personal Details",
        "elements": [
          {"ref": "components/national-id-number", "overrides": {"fieldId": "national-registration-number", "label": "National Registration Number", "validations": {"required": {"value": true, "error": "National Registration Number is required"}, "minLength": {"value": 6, "error": "Must be at least 6 characters"}}}},
          {"ref": "components/national-insurance-number", "overrides": {"fieldId": "national-insurance-number", "label": "National Insurance Number", "validations": {"required": {"value": true, "error": "National Insurance Number is required"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "label": "Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}}}},
          {"ref": "components/first-name", "overrides": {"fieldId": "applicant-first-name", "label": "First Name", "validations": {"required": {"value": true, "error": "First name is required"}}}},
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-initial", "label": "Middle Initial(s)"}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-line-2", "label": "Address Line 2"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "applicant-country-of-birth", "label": "Country of Birth", "validations": {"required": {"value": true, "error": "Country of birth is required"}}}},
          {"ref": "components/sex", "overrides": {"fieldId": "applicant-sex", "label": "Sex", "validations": {"required": {"value": true, "error": "Sex is required"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "applicant-age", "label": "Age", "validations": {"required": {"value": true, "error": "Age is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "applicant-union-status", "label": "Union Status", "options": [{"label": "Single", "value": "single"}, {"label": "Married", "value": "married"}, {"label": "Divorced", "value": "divorced"}, {"label": "Separated", "value": "separated"}, {"label": "Widowed", "value": "widowed"}, {"label": "Common-Law", "value": "common-law"}], "validations": {"required": {"value": true, "error": "Union status is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "number-of-children", "label": "Number of Children (if applicable)"}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email address is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}}
        ]
      },
      {
        "stepId": "parent-guardian",
        "title": "Parent/Guardian Information",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "guardian-1-name", "label": "Parent/Guardian Name", "validations": {"required": {"value": true, "error": "Parent/Guardian name is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "guardian-1-address", "label": "Address", "validations": {"required": {"value": true, "error": "Address is required"}}}},
          {"ref": "components/home-telephone", "overrides": {"fieldId": "guardian-1-telephone-home", "label": "Telephone (Home)"}},
          {"ref": "components/work-telephone", "overrides": {"fieldId": "guardian-1-telephone-work", "label": "Telephone (Work)"}},
          {"ref": "components/name", "overrides": {"fieldId": "guardian-2-name", "label": "Second Parent/Guardian Name (if applicable)"}},
          {"ref": "components/address", "overrides": {"fieldId": "guardian-2-address", "label": "Address"}},
          {"ref": "components/home-telephone", "overrides": {"fieldId": "guardian-2-telephone-home", "label": "Telephone (Home)"}},
          {"ref": "components/work-telephone", "overrides": {"fieldId": "guardian-2-telephone-work", "label": "Telephone (Work)"}}
        ]
      },
      {
        "stepId": "education",
        "title": "Educational History & Qualifications",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "primary-school-name", "label": "Primary School Name", "validations": {"required": {"value": true, "error": "Primary school is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "primary-school-dates", "label": "Dates Attended (From - To)", "hint": "e.g. 2010 - 2016"}},
          {"ref": "components/name", "overrides": {"fieldId": "secondary-school-name", "label": "Secondary School Name", "validations": {"required": {"value": true, "error": "Secondary school is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "secondary-school-dates", "label": "Dates Attended (From - To)", "hint": "e.g. 2016 - 2021"}},
          {"ref": "components/name", "overrides": {"fieldId": "other-school-name", "label": "Other Institution (if applicable)"}},
          {"ref": "components/name", "overrides": {"fieldId": "other-school-dates", "label": "Dates Attended (From - To)"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "qualifications", "label": "Qualifications", "hint": "List your qualifications: Subject, Year, Examining Body, Level, Grade (one per line)"}}
        ]
      },
      {
        "stepId": "about-yourself",
        "title": "Tell Us About Yourself",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "youth-community-group", "label": "Are you a member of a Youth/Community Group/Sports Club?", "hint": "If yes, please provide details"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "interests-hobbies-skills", "label": "Do you have any special interests/hobbies or skills?"}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "presently-employed", "label": "Are you presently employed?", "options": [{"label": "Yes (Full-time)", "value": "yes-full-time"}, {"label": "Yes (Part-time)", "value": "yes-part-time"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "career-choice", "label": "What career would you like to pursue?", "validations": {"required": {"value": true, "error": "Career choice is required"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "alternative-career-choices", "label": "State three alternative career choices", "hint": "List up to three alternative careers you would consider"}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "can-swim", "label": "Can you swim?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "religion", "label": "My religion is"}},
          {"ref": "components/name", "overrides": {"fieldId": "disability", "label": "I have a disability which is", "hint": "Leave blank if not applicable"}}
        ]
      },
      {
        "stepId": "clothing-sizes",
        "title": "Clothing Sizes",
        "description": "Please provide the following sizes for your uniform.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "shirt-size", "label": "Shirt Size", "validations": {"required": {"value": true, "error": "Shirt size is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "pants-size", "label": "Pants Size", "validations": {"required": {"value": true, "error": "Pants size is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "shoe-size", "label": "Shoe Size", "validations": {"required": {"value": true, "error": "Shoe size is required"}}}}
        ]
      },
      {
        "stepId": "personal-statement",
        "title": "Personal Statement",
        "description": "Write a brief statement describing your background, your plans for the future and how the Barbados YouthADVANCE Corps can help you achieve your goals. Also include any other information that you feel may be relevant.",
        "elements": [
          {"ref": "components/additional-details", "overrides": {"fieldId": "personal-statement", "label": "Personal Statement", "validations": {"required": {"value": true, "error": "Personal statement is required"}}}}
        ]
      },
      {
        "stepId": "medical-information",
        "title": "Medical Questionnaire",
        "description": "Do you have or have you ever had any of the following conditions?",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-rheumatic-fever", "label": "Rheumatic Fever", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-asthma", "label": "Asthma", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-allergies", "label": "Allergies", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-epilepsy", "label": "Epilepsy", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-diabetes", "label": "Diabetes", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "medical-conditions-details", "label": "If you answered Yes to any of the above, please provide details", "hint": "Include date, duration of illness, and names/addresses of doctors consulted"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "other-disorders", "label": "Do you have any mental or physical disorders not listed above?", "hint": "If yes, please explain"}},
          {"ref": "components/name", "overrides": {"fieldId": "medication-allergies", "label": "Are you allergic to any medication? If so, please list"}},
          {"ref": "components/name", "overrides": {"fieldId": "blood-type", "label": "What is your blood type?"}},
          {"ref": "components/name", "overrides": {"fieldId": "special-diet", "label": "Do you follow a special diet? If so, please explain"}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "description": "This application package also requires: (a) A certified copy of your Birth Certificate, (b) Certified copies of Qualifications, (c) A Police Certificate of Character, (d) A copy of your last School Report, (e) A Medical Certificate, (f) Two certified recent passport size photographs.",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that the information provided in this application is true and correct to the best of my knowledge. I understand that I will need to submit the required supporting documents listed above.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}}
        ]
      },
      {
        "stepId": "submission-confirmation",
        "title": "Application submitted",
        "elements": [],
        "nextSteps": [
          {
            "title": "What happens next",
            "content": "We have received your application to the Barbados YouthADVANCE Corps. You will receive a confirmation email at the address you provided.",
            "items": [
              "Your application will be reviewed by programme staff",
              "You will be contacted regarding next steps and interview scheduling",
              "Remember to prepare your supporting documents (Birth Certificate, Qualifications, Police Certificate, School Report, Medical Certificate, Photographs)",
              "For questions, contact (246) 535-0180"
            ]
          }
        ]
      }
    ],
    "processors": [
      {
        "type": "email",
        "config": {
          "recipientField": "personal-details.applicant-email",
          "subject": "Barbados YouthADVANCE Corps - Application Received"
        }
      }
    ]
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
