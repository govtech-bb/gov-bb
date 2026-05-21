INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'ice-cream-vendor-permit',
  '1.0.0',
  $recipe${
    "formId": "ice-cream-vendor-permit",
    "title": "Ice Cream Vendor Permit Application",
    "description": "Apply for a permit to sell ice cream at public beaches and parks in Barbados.",
    "version": "1.0.0",
    "createdAt": "2026-05-11T00:00:00Z",
    "updatedAt": "2026-05-11T00:00:00Z",
    "steps": [
      {
        "stepId": "vendor-details",
        "title": "Vendor Details",
        "elements": [
          {"ref": "components/first-name", "overrides": {"fieldId": "vendor-first-name", "label": "First Name", "validations": {"required": {"value": true, "error": "First name is required"}}}},
          {"ref": "components/last-name", "overrides": {"fieldId": "vendor-last-name", "label": "Last Name", "validations": {"required": {"value": true, "error": "Last name is required"}}}},
          {"ref": "components/email", "overrides": {"fieldId": "vendor-email", "label": "Email Address", "validations": {"required": {"value": true, "error": "Email address is required"}, "email": {"value": true, "error": "Enter a valid email address"}}}},
          {"ref": "components/telephone", "overrides": {"fieldId": "vendor-telephone", "label": "Telephone Number", "validations": {"required": {"value": true, "error": "Telephone number is required"}}}},
          {"ref": "components/name", "overrides": {"fieldId": "business-name", "label": "Business Name", "hint": "The name you trade under", "validations": {"required": {"value": true, "error": "Business name is required"}}}},
          {"ref": "components/national-id-number", "overrides": {"fieldId": "vendor-national-id", "label": "National ID Number", "validations": {"required": {"value": true, "error": "National ID is required"}}}}
        ]
      },
      {
        "stepId": "vending-details",
        "title": "Vending Details",
        "elements": [
          {"ref": "components/generic/radio", "overrides": {"fieldId": "preferred-location", "label": "Preferred Location", "options": [{"label": "Brownes Beach", "value": "brownes-beach"}, {"label": "Accra Beach (Rockley)", "value": "accra-beach"}, {"label": "Carlisle Bay", "value": "carlisle-bay"}, {"label": "Bathsheba Beach", "value": "bathsheba-beach"}, {"label": "Miami Beach (Enterprise)", "value": "miami-beach"}, {"label": "Queen's Park", "value": "queens-park"}, {"label": "Bridgetown Boardwalk", "value": "bridgetown-boardwalk"}], "validations": {"required": {"value": true, "error": "Please select a location"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "vending-type", "label": "Type of Vending", "options": [{"label": "Mobile cart/trolley", "value": "mobile-cart"}, {"label": "Fixed stall", "value": "fixed-stall"}, {"label": "Vehicle (van/truck)", "value": "vehicle"}], "validations": {"required": {"value": true, "error": "Please select vending type"}}}},
          {"ref": "components/generic/radio", "overrides": {"fieldId": "has-food-handlers-permit", "label": "Do you have a valid Food Handler's Permit?", "options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}], "validations": {"required": {"value": true, "error": "Please select an option"}}}},
          {"ref": "components/additional-details", "overrides": {"fieldId": "products-description", "label": "Describe the products you will sell", "hint": "e.g. soft-serve ice cream, popsicles, snow cones, milkshakes", "validations": {"required": {"value": true, "error": "Product description is required"}}}}
        ]
      },
      {
        "stepId": "declaration",
        "title": "Declaration",
        "elements": [
          {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "Declaration", "options": [{"label": "I confirm that the information provided is true and correct. I understand that a valid Food Handler's Permit is required before commencing operations, and that I must comply with all public health and safety regulations.", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}}
        ]
      },
      {
        "stepId": "submission-confirmation",
        "title": "Application submitted",
        "elements": [],
        "nextSteps": [
          {
            "title": "What happens next",
            "content": "We have received your vendor permit application. You will receive a confirmation email at the address you provided.",
            "items": [
              "Your application will be reviewed within 5-7 business days",
              "You may be contacted for additional information or an inspection",
              "Once approved, your permit will be issued for the requested location"
            ]
          }
        ]
      }
    ],
    "processors": [
      {
        "type": "email",
        "config": {
          "recipientField": "vendor-details.vendor-email",
          "subject": "Ice Cream Vendor Permit - Application Received"
        }
      }
    ]
  }$recipe$,
  NOW(),
  NOW(),
  NOW()
);
