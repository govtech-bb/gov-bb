INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'yar-visual-arts-registration',
  '1.0.0',
  $recipe${
    "formId": "yar-visual-arts-registration",
    "title": "Youth Achieving Results (Visual Arts): Registration Form",
    "description": "Registration form for the Ministry of Youth, Sports and Community Empowerment's Youth Achieving Results (Visual Arts) Programme.",
    "version": "1.0.0",
    "createdAt": "2026-05-11T00:00:00Z",
    "updatedAt": "2026-05-11T00:00:00Z",
    "steps": [
      {
        "stepId": "consent",
        "title": "Informed Consent",
        "description": "The Ministry of Youth, Sports and Community Empowerment will use the information you provide solely for the purposes of planning, evaluating, and improving its programmes and initiatives. By completing this form, you consent to the collection and use of your responses for these purposes. You may withdraw your consent at any time by exiting the form. All information collected will be treated with the utmost confidentiality and used only in accordance with applicable data protection and privacy standards.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "consent-continue", "label": "Would you like to continue registering?", "options": [{"label": "Yes, I would like to continue registering", "value": "yes"}, {"label": "No, I do not wish to continue registering", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option to continue"}}}}
        ]
      },
      {
        "stepId": "personal-information",
        "title": "Participant's Information",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "participant-name", "label": "Name (First & Last Name)", "validations": {"required": {"value": true, "error": "Full name is required"}, "minLength": {"value": 2, "error": "Name must be at least 2 characters"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "participant-gender", "label": "Gender", "options": [{"label": "Female", "value": "female"}, {"label": "Male", "value": "male"}, {"label": "Prefer not to say", "value": "prefer-not-to-say"}], "validations": {"required": {"value": true, "error": "Gender is required"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "participant-age", "label": "Age", "hint": "Must be between 17 and 30", "validations": {"required": {"value": true, "error": "Age is required"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "participant-dob", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "participant-address", "label": "Address", "validations": {"required": {"value": true, "error": "Address is required"}}}},
          {"ref": "components/parish", "overrides": {"fieldId": "participant-parish", "label": "Parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "participant-telephone", "label": "Telephone Number (Home, Work and/or Cell)", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "participant-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email address is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "participant-country-of-birth", "label": "Country of Birth", "validations": {"required": {"value": true, "error": "Country of birth is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "participant-nationality", "label": "Nationality", "options": [{"label": "Barbadian", "value": "barbadian"}, {"label": "CARICOM National", "value": "caricom-national"}, {"label": "European National", "value": "european-national"}, {"label": "U.S. National", "value": "us-national"}, {"label": "British Citizen", "value": "british-citizen"}], "validations": {"required": {"value": true, "error": "Nationality is required"}}}}
        ]
      },
      {
        "stepId": "employment-education",
        "title": "Employment & Education",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "employment-status", "label": "I am currently", "options": [{"label": "Employed (Full-time)", "value": "employed-full-time"}, {"label": "Employed (Part-time)", "value": "employed-part-time"}, {"label": "In School (Full-time)", "value": "in-school-full-time"}, {"label": "In School (Part-time)", "value": "in-school-part-time"}, {"label": "Unemployed (actively seeking employment)", "value": "unemployed-seeking"}, {"label": "Unemployed (not seeking employment)", "value": "unemployed-not-seeking"}, {"label": "Self-employed", "value": "self-employed"}], "validations": {"required": {"value": true, "error": "Employment status is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "highest-qualification", "label": "Highest Level of Qualification Attained", "options": [{"label": "CCSLC", "value": "ccslc"}, {"label": "CXC/CSEC", "value": "cxc-csec"}, {"label": "CAPE", "value": "cape"}, {"label": "CVQs", "value": "cvqs"}, {"label": "NVQs", "value": "nvqs"}, {"label": "GCE-O-Level", "value": "gce-o-level"}, {"label": "City & Guilds", "value": "city-guilds"}, {"label": "Certificate", "value": "certificate"}, {"label": "Diploma", "value": "diploma"}, {"label": "Associates", "value": "associates"}, {"label": "Bachelors", "value": "bachelors"}, {"label": "Masters", "value": "masters"}, {"label": "Doctorate", "value": "doctorate"}, {"label": "Professional Qualification (e.g. ACCA)", "value": "professional-qualification"}, {"label": "None", "value": "none"}], "validations": {"required": {"value": true, "error": "Qualification level is required"}}}}
        ]
      },
      {
        "stepId": "required-information",
        "title": "Required Information",
        "description": "Please note that all information in this section is important upon commencement of the programme.",
        "elements": [
          {"ref": "components/national-id-number", "overrides": {"fieldId": "participant-national-id", "label": "National Registration Number (ID No.)", "validations": {"required": {"value": true, "error": "National Registration Number is required"}, "minLength": {"value": 6, "error": "Must be at least 6 characters"}}}},
          {"ref": "components/tamis-number", "overrides": {"fieldId": "participant-tamis", "label": "TAMIS Number", "validations": {"required": {"value": true, "error": "TAMIS Number is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-bank-account", "label": "Do you have an active bank account or credit union account?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "course-information",
        "title": "Course Information",
        "description": "Please note that the Personal Development component is compulsory for all participants. Also note that some classes may not be offered due to low registration.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "programme-selection", "label": "Six Month Programmes", "hint": "Select the programme you are interested in", "options": [{"label": "Leathercraft", "value": "leathercraft"}, {"label": "Jewellery Making", "value": "jewellery-making"}, {"label": "Pottery & Ceramics", "value": "pottery-ceramics"}, {"label": "Drawing and Painting", "value": "drawing-painting"}, {"label": "Garment Construction", "value": "garment-construction"}], "validations": {"required": {"value": true, "error": "Please select a programme"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-experience", "label": "Do you have any experience in any of the disciplines you have selected?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "experience-level", "label": "If yes, please indicate your level of experience", "options": [{"label": "Beginner", "value": "beginner"}, {"label": "Intermediate", "value": "intermediate"}, {"label": "Advanced", "value": "advanced"}, {"label": "Expert (Professional)", "value": "expert"}]}},
          {"ref": "components/name", "overrides": {"fieldId": "years-of-experience", "label": "Please indicate how many years of experience you have"}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "training-location", "label": "Please indicate where you would have received training", "options": [{"label": "Home", "value": "home"}, {"label": "School", "value": "school"}, {"label": "Organisation", "value": "organisation"}]}}
        ]
      },
      {
        "stepId": "medical-information",
        "title": "Medical Information",
        "description": "All medical information disclosed in this form will be handled in accordance with confidentiality and data protection standards. Access to this information will be restricted to authorised programme personnel and used solely for the purposes of participant welfare, reasonable accommodation, and risk management.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "medical-conditions", "label": "Medical Conditions", "hint": "Are you currently suffering from any of the following medical conditions?", "options": [{"label": "Asthma", "value": "asthma"}, {"label": "Diabetes", "value": "diabetes"}, {"label": "Hypertension", "value": "hypertension"}, {"label": "Epilepsy", "value": "epilepsy"}, {"label": "Allergies", "value": "allergies"}, {"label": "Physical Disability", "value": "physical-disability"}, {"label": "Learning Disability", "value": "learning-disability"}, {"label": "Behavioural Challenge", "value": "behavioural-challenge"}, {"label": "Mental Health Challenge", "value": "mental-health-challenge"}, {"label": "None", "value": "none"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "medications", "label": "What medication(s) do you take, if any?"}}
        ]
      },
      {
        "stepId": "emergency-contact",
        "title": "Emergency Contact Information",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "emergency-contact-name", "label": "Name (First & Last Name)", "validations": {"required": {"value": true, "error": "Emergency contact name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "emergency-contact-relationship", "label": "Relationship (e.g. Parent, Guardian)", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "emergency-contact-address", "label": "Address (if different from above)"}},
          {"ref": "components/telephone", "overrides": {"fieldId": "emergency-contact-telephone", "label": "Telephone Numbers (Home & Cell)", "validations": {"required": {"value": true, "error": "Emergency contact telephone is required"}}}}
        ]
      },
      {
        "stepId": "general-information",
        "title": "General Information",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "how-did-you-hear", "label": "How did you hear about the Youth Achieving Results (Visual Arts) Programme?", "options": [{"label": "Division of Youth Affairs Website", "value": "dya-website"}, {"label": "Division of Youth Affairs Facebook", "value": "dya-facebook"}, {"label": "Division of Youth Affairs Instagram", "value": "dya-instagram"}, {"label": "Youth Commissioner/Ministry Staff", "value": "youth-commissioner"}, {"label": "Advertisement (Radio/Television)", "value": "advertisement"}, {"label": "Brochure", "value": "brochure"}, {"label": "Flyer", "value": "flyer"}, {"label": "Email Promotion", "value": "email-promotion"}, {"label": "Family member/Friend", "value": "family-friend"}], "validations": {"required": {"value": true, "error": "Please select how you heard about the programme"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "plans-after-programme", "label": "What are your plans after completing the programme?", "validations": {"required": {"value": true, "error": "Please describe your plans"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "join-visual-arts-club", "label": "Would you like to be a part of the Visual Arts Club?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that the information provided in this registration form is true and correct to the best of my knowledge. I understand that false details may affect my participation in the programme.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}}
        ]
      },
      {
        "stepId": "submission-confirmation",
        "title": "Registration submitted",
        "elements": [],
        "nextSteps": [
          {
            "title": "What happens next",
            "content": "We have received your registration for the Youth Achieving Results (Visual Arts) Programme. You will receive a confirmation email at the address you provided.",
            "items": [
              "A programme coordinator will review your application",
              "You will be contacted regarding programme commencement dates",
              "For questions, contact Mr. David Denny at (246) 535-3835 or david.denny@barbados.gov.bb"
            ]
          }
        ]
      }
    ],
    "processors": [
      {
        "type": "email",
        "config": {
          "recipientField": "personal-information.participant-email",
          "subject": "Youth Achieving Results (Visual Arts) - Registration Received"
        }
      }
    ]
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
