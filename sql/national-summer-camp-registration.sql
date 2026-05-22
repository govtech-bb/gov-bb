-- National Summer Camp Programme 2025: Camper Registration Form
-- Ministry of Youth, Sports and Community Empowerment
-- Source: Google Forms PDF (NSCP Camper Registration 2025)
-- Camp dates: July 21st - August 22nd, 2025 | Ages: 4 to 15

INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'national-summer-camp-registration',
  '1.0.0',
  $recipe${
    "formId": "national-summer-camp-registration",
    "title": "National Summer Camp Programme 2025: Camper Registration Form",
    "description": "Camp dates: July 21st - August 22nd, 2025. Ages: 4 to 15 years old. Contact us at +1 (246) 535-3835 or mysce.youthprojects@barbados.gov.bb",
    "version": "1.0.0",
    "createdAt": "2026-05-08T00:00:00Z",
    "updatedAt": "2026-05-08T00:00:00Z",
    "steps": [
      {
        "stepId": "camp-venue",
        "title": "Select your camp venue",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "camp-venue", "label": "Name/Venue of Camp", "hint": "Select the camp venue your child/ward will attend", "options": [{"label": "Aubrey Grant Pavilion (St. Michael)", "value": "aubrey-grant-pavilion"}, {"label": "Bank Hall Church of the Nazarene (St. Michael)", "value": "bank-hall-church-nazarene"}, {"label": "Bayville Community Centre (St. Michael)", "value": "bayville-community-centre"}, {"label": "Deacons Resource Centre (St. Michael)", "value": "deacons-resource-centre"}, {"label": "Grantley Prescod Memorial Primary School (St. Michael)", "value": "grantley-prescod-primary"}, {"label": "Grazettes Community Centre (St. Michael)", "value": "grazettes-community-centre"}, {"label": "Jackmans Seventh Day Adventist Church (St. Michael)", "value": "jackmans-sda-church"}, {"label": "Montgomery Pavilion (St. Michael)", "value": "montgomery-pavilion"}, {"label": "St. Paul's Primary School (St. Michael)", "value": "st-pauls-primary"}, {"label": "Erdiston Special School - Disability Unit Camp (Specialised)", "value": "erdiston-special-school"}, {"label": "Harold Nurse Community Centre - Camp Employing Minds (Specialised)", "value": "harold-nurse-community-centre"}, {"label": "Parkinson Memorial Secondary School - YES Experience Enterprise Camp (Specialised)", "value": "parkinson-memorial-yes"}, {"label": "Bush Hall Community Centre (Cultural Arts)", "value": "bush-hall-community-centre"}, {"label": "Emmerton Community Centre (Cultural Arts)", "value": "emmerton-community-centre"}, {"label": "Golden Rock Community Resource Centre (Cultural Arts)", "value": "golden-rock-resource-centre"}, {"label": "Ivy Community Centre (Cultural Arts)", "value": "ivy-community-centre"}, {"label": "St. Ambrose Primary School (Cultural Arts)", "value": "st-ambrose-primary"}, {"label": "Ellerton Pavilion (St. George)", "value": "ellerton-pavilion"}, {"label": "Ellerton Primary School (St. George)", "value": "ellerton-primary-school"}, {"label": "St. Jude's Primary School (St. George)", "value": "st-judes-primary"}, {"label": "Valley Resource Centre - Digital Media Camp (St. George, Specialised)", "value": "valley-resource-centre"}, {"label": "Ellerton Community Centre (St. George, Cultural Arts)", "value": "ellerton-community-centre"}, {"label": "Kendal Community Centre (St. John)", "value": "kendal-community-centre"}, {"label": "Unity Wesleyan Holiness Church (St. John)", "value": "unity-wesleyan-holiness"}, {"label": "Gall Hill Pavilion (St. John, Cultural Arts)", "value": "gall-hill-pavilion"}, {"label": "Gordon Greenidge Primary School (St. James)", "value": "gordon-greenidge-primary"}, {"label": "St. Silas Primary School (St. James)", "value": "st-silas-primary"}, {"label": "Trents Community Centre (St. James)", "value": "trents-community-centre"}, {"label": "Desmond Haynes Sports Complex (St. James, Cultural Arts)", "value": "desmond-haynes-sports-complex"}, {"label": "Boscobelle Community Centre (St. Peter)", "value": "boscobelle-community-centre"}, {"label": "St. Elizabeth Primary School (St. Joseph)", "value": "st-elizabeth-primary"}, {"label": "Content Pavilion (St. Thomas)", "value": "content-pavilion"}, {"label": "Welchman Hall Seventh-day Adventist Church (St. Thomas)", "value": "welchman-hall-sda"}, {"label": "Checker Hall Pavilion (St. Lucy)", "value": "checker-hall-pavilion"}, {"label": "Hillaby Seventh-day Adventist Church (St. Andrew)", "value": "hillaby-sda-church"}, {"label": "Isolation Cavaliers Pavilion (St. Andrew)", "value": "isolation-cavaliers-pavilion"}, {"label": "Christ Church Girls' School (Christ Church)", "value": "christ-church-girls-school"}, {"label": "St. Bartholomew Primary School (Christ Church)", "value": "st-bartholomew-primary"}, {"label": "Fairy Valley Pavilion (Christ Church)", "value": "fairy-valley-pavilion"}, {"label": "Milton Lynch Primary School (Christ Church)", "value": "milton-lynch-primary"}, {"label": "St. Lawrence Primary School (Christ Church)", "value": "st-lawrence-primary"}, {"label": "Wotton Pavilion (Christ Church)", "value": "wotton-pavilion"}, {"label": "St. Christopher Primary School (Christ Church, Cultural Arts)", "value": "st-christopher-primary"}, {"label": "Chesterfield Brewster Youth Empowerment Centre (Christ Church, Cultural Arts)", "value": "chesterfield-brewster-centre"}, {"label": "Bayley's Primary School (St. Philip)", "value": "bayleys-primary"}, {"label": "St. Martin's Mangrove Primary School (St. Philip)", "value": "st-martins-mangrove-primary"}, {"label": "Reynold Weekes Primary School (St. Philip, Cultural Arts)", "value": "reynold-weekes-primary"}, {"label": "St. Philip Primary School (St. Philip, Cultural Arts)", "value": "st-philip-primary"}], "validations": {"required": {"value": true, "error": "Please select a camp venue"}}}}
        ]
      },
      {
        "stepId": "camper-details",
        "title": "Personal information",
        "description": "All information in this section is required. Please fill as accurately as possible.",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "camper-name", "label": "Name of Camper", "hint": "First Name, Middle Name, Last Name", "validations": {"required": {"value": true, "error": "Camper name is required"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "camper-date-of-birth", "label": "Date of Birth", "validations": {"required": {"value": true, "error": "Date of birth is required"}, "pastOrToday": {"value": true, "error": "Date of birth must be today or earlier"}}}},
          {"ref": "components/generic/number", "overrides": {"fieldId": "camper-age", "label": "Age (in years)", "validations": {"required": {"value": true, "error": "Age is required"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "camper-national-id", "label": "National ID Number", "hint": "e.g. 110915-0048", "validations": {"required": {"value": true, "error": "National ID number is required"}}}},
          {"ref": "components/sex", "overrides": {"fieldId": "camper-gender", "label": "Gender", "validations": {"required": {"value": true, "error": "Gender is required"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "camper-religion", "label": "Religion", "options": [{"label": "Christian", "value": "christian"}, {"label": "Islam", "value": "islam"}, {"label": "Rastafarianism", "value": "rastafarianism"}, {"label": "Hindu", "value": "hindu"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Religion is required"}}}}
        ]
      },
      {
        "stepId": "parent-guardian",
        "title": "Parent/Guardian information",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "parent-name", "label": "Name of Parent/Guardian", "hint": "First Name, Last Name", "validations": {"required": {"value": true, "error": "Parent/Guardian name is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "parent-relationship", "label": "Relationship to Camper", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "parent-address-line-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "parent-address-line-2", "label": "Address Line 2"}},
          {"ref": "components/telephone", "overrides": {"fieldId": "parent-telephone", "label": "Telephone Numbers", "hint": "e.g. Home 433-1234 Work 535-1234 Cell 249-1234", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "parent-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email address is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "parent-employer", "label": "Employer/Business Name", "validations": {"required": {"value": true, "error": "Employer/Business name is required"}}}}
        ]
      },
      {
        "stepId": "curriculum",
        "title": "Curriculum",
        "description": "Kindly select all topics that interest your child/ward.",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-arts-culture", "label": "Select all topics that interest your child/ward", "options": [{"label": "Arts & Culture (includes visual & performing arts)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-innovation", "label": "Innovation", "options": [{"label": "Innovation (includes digital media, science & technology)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-youth-empowerment", "label": "Youth Empowerment", "options": [{"label": "Youth Empowerment (includes entrepreneurship, career development, leadership training, public speaking)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-health-fitness", "label": "Health & Fitness", "options": [{"label": "Health & Fitness", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-self-management", "label": "Self-Management Tools", "options": [{"label": "Self-Management Tools (includes health & wellness, self-care practices, religious knowledge, ethics, etiquette)", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-financial-literacy", "label": "Financial Literacy", "options": [{"label": "Financial Literacy", "value": "yes"}]}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "interest-agriculture", "label": "Agriculture", "options": [{"label": "Agriculture", "value": "yes"}]}}
        ]
      },
      {
        "stepId": "medical-health",
        "title": "Medical and health information",
        "description": "Parents are required to complete the Medication Authorisation Form before any Camp Director administers any medication to their child/ward. Staff will not administer any medication to your child/ward without written authorisation.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-illness", "label": "Does your child/ward suffer from any illness(es)?", "hint": "Blood clotting, respiratory, heart conditions, frequent infections, diabetes, fainting", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "illness-details", "label": "If yes, please state illness(es)", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-illness", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "on-medication", "label": "Is your child/ward on medication?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "medication-details", "label": "If yes, please specify name of medication and dosage", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "on-medication", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-disability", "label": "Does your child/ward have a disability?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "disability-details", "label": "If yes, please specify", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-disability", "operator": "equal", "value": "yes"}]}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-allergies", "label": "Does your child/ward have any allergies?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "allergy-details", "label": "If yes, please specify", "behaviours": [{"type": "fieldConditionalOn", "targetFieldId": "has-allergies", "operator": "equal", "value": "yes"}]}}
        ]
      },
      {
        "stepId": "nutrition",
        "title": "Nutrition program",
        "description": "School meals will be provided. However, you are encouraged to send meals if your child has dietary restrictions and food allergies.",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "taking-meals-provided", "label": "My child/ward will be taking meals provided", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "dietary-restrictions", "label": "Dietary restrictions", "options": [{"label": "None", "value": "none"}, {"label": "Vegetarian", "value": "vegetarian"}, {"label": "Vegan", "value": "vegan"}, {"label": "Gluten-free", "value": "gluten-free"}, {"label": "Other", "value": "other"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "emergency-instructions",
        "title": "Emergency instructions",
        "description": "I give permission for trained Camp Officials to administer First Aid, call a doctor or seek emergency, medical/surgical care for my child/ward in the event that I cannot be reached in an emergency. I give permission for my child/ward to participate in all camp activities with the following exceptions:",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "activity-exemptions", "label": "Kindly specify any camp activities your child/ward should be exempt from", "hint": "Leave blank if none"}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "emergency-contact-info", "label": "In case of emergency, please provide a contact name, relationship and number", "validations": {"required": {"value": true, "error": "Emergency contact information is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "doctor-name", "label": "Doctor's Name/Polyclinic", "validations": {"required": {"value": true, "error": "Doctor's name or polyclinic is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "emergency-telephone", "label": "Emergency Telephone Number(s)", "validations": {"required": {"value": true, "error": "Emergency telephone number is required"}}}}
        ]
      },
      {
        "stepId": "permissions",
        "title": "Permissions",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "photo-video-permission", "label": "Permission to take photos/videos of your child/ward during National Summer Camp activities", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}}
        ]
      },
      {
        "stepId": "camper-conduct",
        "title": "Camper conduct agreement",
        "description": "The National Summer Camp Program provides a secure and nurturing setting where campers engage in team activities while learning. The attitude and behavior of campers play a vital role in the camp's success. Both campers and parents/guardians are required to read this agreement.",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-respect", "label": "Please check the boxes to indicate your agreement", "options": [{"label": "I will treat everyone in the camp community with respect at all times, including showing respect for each other's belongings, privacy & feelings", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-no-harassment", "label": "Anti-harassment", "options": [{"label": "I understand that harassment based upon colour, race, religion, creed, gender, age, sexual orientation or disability, is a form of discrimination and will not be tolerated.", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-facilities", "label": "Respect for facilities", "options": [{"label": "I will treat the camp facilities and equipment with respect and refrain from taking or damaging any camp property.", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-language", "label": "Appropriate language", "options": [{"label": "I will not (1) use obscene or derogatory language, (2) bring music containing obscene or derogatory language or (3) make reference to violent and offensive actions.", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-safety", "label": "Safety", "options": [{"label": "I will not engage in any activity which puts myself, other campers or staff at risk.", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}},
          {"ref": "components/confirmation", "overrides": {"fieldId": "conduct-rules", "label": "Rules and regulations", "options": [{"label": "I agree to abide by the rules and regulations of the camp and understand that I am expected to follow directions and guidance given by the camp staff.", "value": "yes"}], "validations": {"required": {"value": true, "error": "You must agree to this statement"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I have read and understand these expectations. I have discussed these expectations with my child/ward and he/she has agreed to abide by them at all times for the duration of camp. I accept that my child/ward will not be allowed to remain in camp if one or more of the regulations are broken.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}}
        ]
      }
    ],
    "processors": []
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
