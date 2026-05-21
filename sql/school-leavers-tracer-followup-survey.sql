-- School Leavers' Tracer Follow-up Survey
-- Ministry of Youth, Sports and Community Empowerment
-- Source: 2025 SLTS Follow-up Questionnaire PDF
-- Page 3 (For Official Use Only) is excluded from the digital form.

INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'school-leavers-tracer-followup-survey',
  '1.0.0',
  $recipe${
    "formId": "school-leavers-tracer-followup-survey",
    "title": "2025 School Leavers' Tracer Follow-up Survey",
    "description": "The Ministry of Youth, Sports and Community Empowerment is conducting its School Leaver Tracer Follow-up Survey. The data collected will be treated confidentially and will be used to plan programmes that respond to your identified needs.",
    "version": "1.0.0",
    "createdAt": "2026-05-08T00:00:00Z",
    "updatedAt": "2026-05-08T00:00:00Z",
    "steps": [
      {
        "stepId": "personal-details",
        "title": "Personal details",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "respondent-name", "label": "Name", "hint": "Please print your full name", "validations": {"required": {"value": true, "error": "Name is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "address-line-2", "label": "Address Line 2"}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "respondent-date-of-birth", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "respondent-age", "label": "Age", "validations": {"required": {"value": true, "error": "Age is required"}}}},
          {"ref": "components/sex", "overrides": {"fieldId": "respondent-sex", "label": "Sex", "validations": {"required": {"value": true, "error": "Sex is required"}}}},
          {"ref": "components/home-telephone", "overrides": {"fieldId": "respondent-home-telephone", "label": "Home Telephone Number"}},
          {"ref": "components/mobile-telephone", "overrides": {"fieldId": "respondent-mobile-telephone", "label": "Mobile Telephone Number"}},
          {"ref": "components/email", "overrides": {"fieldId": "respondent-email", "label": "Email Address", "validations": {"email": {"value": true, "error": "Enter a valid email address"}}}}
        ]
      },
      {
        "stepId": "certification",
        "title": "Certification",
        "description": "Total qualifications gained. Indicate the number of subjects for each qualification type.",
        "elements": [
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-ccslc", "label": "CCSLC", "hint": "Number of CCSLC subjects gained"}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-cxc-general", "label": "CXC General", "hint": "Grade 1, 2 and 3 only. Number of subjects gained."}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-gce-olevel", "label": "GCE O'Level", "hint": "Grade 1, 2, 3 and 4 only. Number of subjects gained."}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-cape", "label": "CAPE", "hint": "Number of CAPE subjects gained"}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-cvqs", "label": "CVQs", "hint": "Number of CVQs gained"}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "qual-nvqs", "label": "NVQs", "hint": "Number of NVQs gained"}},
          {"ref": "components/name", "overrides": {"fieldId": "qual-other", "label": "Other qualifications", "hint": "Please specify any other qualifications gained"}}
        ]
      },
      {
        "stepId": "post-school-pathways",
        "title": "Post-School Pathways",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "current-status", "label": "What is your current status?", "options": [{"label": "Enrolled in further studies (sixth form, college, university)", "value": "further-studies"}, {"label": "Enrolled in vocational training/skills programme (BVTB)", "value": "vocational-training"}, {"label": "Employed (Full-time)", "value": "employed-full-time"}, {"label": "Employed (Part-time/Temporary)", "value": "employed-part-time"}, {"label": "Apprenticeship/Internship", "value": "apprenticeship-internship"}, {"label": "Self-employed", "value": "self-employed"}, {"label": "Currently unemployed", "value": "currently-unemployed"}, {"label": "Unemployed actively seeking employment", "value": "unemployed-seeking"}, {"label": "Unemployed not seeking employment", "value": "unemployed-not-seeking"}], "validations": {"required": {"value": true, "error": "Please select your current status"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "steps-towards-career-goal", "label": "What steps have you taken towards achieving your career goal?", "hint": "Please describe the steps you have taken"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "division-of-youth-assistance", "label": "What do you think the Division of Youth can do to assist you with achieving your goals?"}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "interested-in-community-group", "label": "Would you be interested in joining a community group?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "post-school-transition",
        "title": "Post-School Transition",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "transition-difficulty", "label": "How easy or difficult was it to transition from secondary school to your current activity?", "options": [{"label": "Very easy", "value": "very-easy"}, {"label": "Easy", "value": "easy"}, {"label": "Difficult", "value": "difficult"}, {"label": "Very difficult", "value": "very-difficult"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "school-prepared-further-studies", "label": "Do you feel your secondary school education prepared you adequately for further studies?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "school-prepared-employment", "label": "Do you feel your secondary school education prepared you adequately for employment?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "school-prepared-personal-development", "label": "Do you feel your secondary school education prepared you adequately for personal development?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "challenges-and-support",
        "title": "Challenges and Support",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "challenge-finding-employment", "label": "What challenges have you faced since leaving school?", "options": [{"label": "Finding employment", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "challenge-financing-studies", "label": "Financing further studies/training", "options": [{"label": "Financing further studies/training", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "challenge-accessing-training", "label": "Accessing training opportunities", "options": [{"label": "Accessing training opportunities", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "challenge-balancing-responsibilities", "label": "Balancing responsibilities (work/family)", "options": [{"label": "Balancing responsibilities (work/family)", "value": "yes"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "challenge-other", "label": "Other challenges", "hint": "Please specify any other challenges you have faced"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "support-most-helpful", "label": "What type of support would have been most helpful to you after leaving school?"}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-family-support", "label": "Which of the following exists within the community where you live?", "options": [{"label": "Family/parental support to their youth", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-lack-resources", "label": "Lack of community resources", "options": [{"label": "Lack of community resources (e.g. community centres, playing fields, etc.)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-lack-programmes", "label": "Lack of youth programmes", "options": [{"label": "Lack of youth programmes (e.g. skills/sports/cultural training programmes)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-crime-violence", "label": "Crime and violence", "options": [{"label": "Crime and violence", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-alcohol-drugs", "label": "Use and abuse of alcohol and illegal drugs", "options": [{"label": "Use and abuse of alcohol and illegal drugs", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-unemployment", "label": "Unemployment", "options": [{"label": "Unemployment", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "community-other", "label": "Other", "options": [{"label": "Other", "value": "yes"}]}}
        ]
      }
    ],
    "processors": []
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
