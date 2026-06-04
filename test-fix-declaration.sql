-- Fix declaration step on sell-goods: make date visible, keep full statement on checkbox
UPDATE form_definitions
SET schema = jsonb_set(
  schema,
  '{steps,9,elements}',
  '[
    {"ref": "components/confirmation", "overrides": {"fieldId": "declaration-confirmed", "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", "options": [{"label": "I confirm", "value": "confirmed"}], "validations": {"required": {"value": true, "error": "You must confirm the declaration to continue"}}}},
    {"ref": "components/date-of-birth", "overrides": {"fieldId": "declaration-date", "label": "Date", "validations": {"required": {"value": true, "error": "Date is required"}}}}
  ]'::jsonb
)
WHERE form_id = 'sell-goods-services-beach-park-test';
