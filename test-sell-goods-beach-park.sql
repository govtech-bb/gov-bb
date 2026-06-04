-- Sell Goods/Services at Beach/Park - full migration
INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000003',
  'sell-goods-services-beach-park-test',
  '1.0.0',
  '{
    "formId": "sell-goods-services-beach-park-test",
    "title": "Sell Goods or Services at a Beach or Park",
    "description": "Apply for permission to sell goods or offer services at a public beach or park in Barbados.",
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
          {"ref": "components/middle-name", "overrides": {"fieldId": "applicant-middle-name"}},
          {"ref": "components/last-name", "overrides": {"fieldId": "applicant-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/date-of-birth", "overrides": {"fieldId": "applicant-dob", "validations": {"required": {"value": true, "error": "Date of birth is required"}}}},
          {"ref": "components/nationality", "overrides": {"fieldId": "applicant-nationality", "validations": {"required": {"value": true, "error": "Nationality is required"}}}},
          {"ref": "components/national-id", "overrides": {"fieldId": "applicant-nid", "validations": {"required": {"value": true, "error": "ID Number is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "applicant-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "applicant-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-1", "label": "Address Line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "applicant-address-2", "label": "Address Line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "applicant-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/postcode", "overrides": {"fieldId": "applicant-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "goods-or-services",
        "title": "Would you like to sell goods or services?",
        "description": "Goods are physical items such as food or memorabilia. Services are experiences like massages or paddle boarding.",
        "elements": [
          {
            "ref": "components/generic/radio",
            "overrides": {
              "fieldId": "goods-or-services",
              "label": "Selling goods or services",
              "options": [
                {"label": "Goods", "value": "goods"},
                {"label": "Services", "value": "services"}
              ],
              "validations": {"required": {"value": true, "error": "Select an option"}}
            }
          }
        ]
      },
      {
        "stepId": "goods-details",
        "title": "Tell us about the goods you would like to sell",
        "elements": [
          {
            "ref": "components/generic/radio",
            "overrides": {
              "fieldId": "goods-origin",
              "label": "Where are the goods from?",
              "options": [
                {"label": "Local (Barbados)", "value": "barbados"},
                {"label": "Imported", "value": "imported"}
              ],
              "validations": {"required": {"value": true, "error": "Select an option"}}
            }
          },
          {"ref": "components/name", "overrides": {"fieldId": "goods-description", "label": "Describe the goods you would like to sell", "hint": "For example, fresh, locally-sourced fruit", "validations": {"required": {"value": true, "error": "Description of goods is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "goods-location", "label": "Where do you intend to sell your goods?", "hint": "For example, Brownes Beach", "validations": {"required": {"value": true, "error": "Place of doing business is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}}
        ]
      },
      {
        "stepId": "services-details",
        "title": "Tell us about your services",
        "elements": [
          {"ref": "components/name", "overrides": {"fieldId": "services-description", "label": "Describe the services you would like to offer", "hint": "For example, 20-minute jet ski rides", "validations": {"required": {"value": true, "error": "Description of services is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "services-location", "label": "Where do you intend to offer this service?", "hint": "For example, Brownes Beach", "validations": {"required": {"value": true, "error": "Place of doing business is required"}, "minLength": {"value": 2, "error": "Must be at least 2 characters"}}}}
        ]
      },
      {
        "stepId": "professional-referee",
        "title": "Tell us about your professional referee",
        "description": "This can be someone more senior who you have worked with, or a teacher or lecturer.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "prof-ref-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "prof-ref-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/relationship", "overrides": {"fieldId": "prof-ref-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Professional relationship is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "prof-ref-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "prof-ref-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "prof-ref-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "prof-ref-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "prof-ref-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/postcode", "overrides": {"fieldId": "prof-ref-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "personal-referee",
        "title": "Tell us about your personal referee",
        "description": "This can be someone who can speak about your character. For example, a community leader or mentor.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "pers-ref-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "pers-ref-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/relationship", "overrides": {"fieldId": "pers-ref-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Personal relationship is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "pers-ref-email", "validations": {"required": {"value": true, "error": "Email address is required"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "pers-ref-telephone", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "pers-ref-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "pers-ref-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "pers-ref-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/postcode", "overrides": {"fieldId": "pers-ref-postcode", "hint": "For example, BB17004 (optional)"}}
        ]
      },
      {
        "stepId": "first-testimonial",
        "title": "First testimonial",
        "description": "Provide 2 or 3 sentences from someone who can speak about your character. They must not be someone you named as a referee.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "testimonial1-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "testimonial1-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/relationship", "overrides": {"fieldId": "testimonial1-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "testimonial1-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "testimonial1-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "testimonial1-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "testimonial1-text", "label": "Testimonial", "validations": {"required": {"value": true, "error": "Testimonial is required"}, "minLength": {"value": 10, "error": "Testimonial must be at least 10 characters"}}}}
        ]
      },
      {
        "stepId": "second-testimonial",
        "title": "Second testimonial",
        "description": "Provide 2 or 3 sentences from someone who can speak about your character. They must not be someone you named as a referee.",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "testimonial2-first-name", "validations": {"required": {"value": true, "error": "First name is required"}, "minLength": {"value": 2, "error": "First name must be at least 2 characters"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "testimonial2-last-name", "validations": {"required": {"value": true, "error": "Last name is required"}, "minLength": {"value": 2, "error": "Last name must be at least 2 characters"}}}},
          {"ref": "components/relationship", "overrides": {"fieldId": "testimonial2-relationship", "label": "Relationship", "validations": {"required": {"value": true, "error": "Relationship is required"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "testimonial2-address-1", "label": "Address line 1", "validations": {"required": {"value": true, "error": "Address line 1 is required"}, "minLength": {"value": 5, "error": "Address must be at least 5 characters"}}}},
          {"ref": "components/address", "overrides": {"fieldId": "testimonial2-address-2", "label": "Address line 2"}},
          {"ref": "components/parish", "overrides": {"fieldId": "testimonial2-parish", "options": [{"label": "Christ Church", "value": "christ-church"}, {"label": "St. Andrew", "value": "st-andrew"}, {"label": "St. George", "value": "st-george"}, {"label": "St. James", "value": "st-james"}, {"label": "St. John", "value": "st-john"}, {"label": "St. Joseph", "value": "st-joseph"}, {"label": "St. Lucy", "value": "st-lucy"}, {"label": "St. Michael", "value": "st-michael"}, {"label": "St. Peter", "value": "st-peter"}, {"label": "St. Philip", "value": "st-philip"}, {"label": "St. Thomas", "value": "st-thomas"}], "validations": {"required": {"value": true, "error": "Parish is required"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "testimonial2-text", "label": "Testimonial", "validations": {"required": {"value": true, "error": "Testimonial is required"}, "minLength": {"value": 10, "error": "Testimonial must be at least 10 characters"}}}}
        ]
      },
      {
        "stepId": "document-uploads",
        "title": "Upload supporting documents",
        "description": "Provide a Police Certificate of Character and 2 passport-sized photos.",
        "elements": [
          {"ref": "components/upload-document", "overrides": {"fieldId": "police-certificate", "label": "Upload a Police Certificate of Character", "hint": "Attach a .pdf, .docx or .png file.", "validations": {"required": {"value": true, "error": "Police Certificate of Character is required"}}}},
          {"ref": "components/upload-document", "overrides": {"fieldId": "passport-photos", "label": "Upload 2 passport-sized photos", "hint": "Attach a .pdf, .docx or .png file.", "multiple": true, "validations": {"required": {"value": true, "error": "Passport-sized photos are required"}}}}
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
              "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.",
              "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}
            }
          },
          {
            "ref": "components/date-of-birth",
            "overrides": {
              "fieldId": "declaration-date",
              "label": "Date of declaration",
              "isHidden": true,
              "validations": {"required": {"value": true, "error": "Date is required"}}
            }
          }
        ]
      }
    ],
    "processors": []
  }',
  NOW(), NOW(), NOW()
);
