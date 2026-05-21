BEGIN;

-- Add hint to Date of birth: "For example, 30 12 1986"
-- Applicant step is step index 0, DOB is element 4
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,4,overrides}',
  '{"fieldId": "applicant-dob", "hint": "For example, 30 12 1986", "validations": {"required": {"error": "Date of birth is required", "value": true}}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- Change NID label to "National Identification (ID) Number"
-- Applicant step is step index 0, NID is element 5
UPDATE form_definitions
SET schema = jsonb_set(schema, '{steps,0,elements,5,overrides}',
  '{"fieldId": "applicant-nid", "label": "National Identification (ID) Number", "validations": {"required": {"error": "National ID Number is required", "value": true}}}'
)
WHERE form_id = 'apply-for-conductor-licence-test';

COMMIT;
