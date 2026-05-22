-- =============================================================================
-- Add processors to ALL remaining forms with empty processors
-- =============================================================================
-- Run against: modular-forms-db-sandbox.cl0sug2sklor.ca-central-1.rds.amazonaws.com
-- Database: modular_forms
-- Date: 2026-05-08
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- EMAIL-ONLY FORMS
-- ---------------------------------------------------------------------------

-- apply-for-conductor-licence-test
-- Email: contact-details.contact-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact-details.contact-email", "subject": "Your conductor licence application has been received"}}]'
)
WHERE form_id = 'apply-for-conductor-licence-test';

-- community-sports-training-test
-- Email: contact.contact-email (primary applicant email, not emergency)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact.contact-email", "subject": "Your community sports training application has been received"}}]'
)
WHERE form_id = 'community-sports-training-test';

-- exit-survey-test
-- NO email field — cannot add email processor. Skip.

-- jobstart-plus-programme-test
-- Email: contact-details.contact-email (primary, not emergency)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact-details.contact-email", "subject": "Your JobStart Plus application has been received"}}]'
)
WHERE form_id = 'jobstart-plus-programme-test';

-- post-office-redirection-business-test
-- Email: applicant-details.applicant-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "default", "paymentCode": "awR2Da5z7K", "amount": 4, "description": "Post office mail redirection (business)", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your post office redirection request has been received"}}]'
)
WHERE form_id = 'post-office-redirection-business-test';

-- post-office-redirection-deceased-test
-- Email: applicant-details.applicant-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "default", "paymentCode": "awR2Da5z7K", "amount": 4, "description": "Post office mail redirection (deceased)", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your post office redirection request has been received"}}]'
)
WHERE form_id = 'post-office-redirection-deceased-test';

-- post-office-redirection-individual-test
-- Email: applicant-details.applicant-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "default", "paymentCode": "awR2Da5z7K", "amount": 4, "description": "Post office mail redirection (individual)", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your post office redirection request has been received"}}]'
)
WHERE form_id = 'post-office-redirection-individual-test';

-- primary-school-textbook-grant-test
-- Email: applicant-details.applicant-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your textbook grant application has been received"}}]'
)
WHERE form_id = 'primary-school-textbook-grant-test';

-- project-protege-mentor-test
-- Email: contact.contact-email (applicant's own email, not referee emails)
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "contact.contact-email", "subject": "Your Project Protege mentor application has been received"}}]'
)
WHERE form_id = 'project-protege-mentor-test';

-- sell-goods-services-beach-park-test
-- Email: applicant-details.applicant-email
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your beach/park vendor application has been received"}}]'
)
WHERE form_id = 'sell-goods-services-beach-park-test';

-- ---------------------------------------------------------------------------
-- PAYMENT + EMAIL FORMS (certificates)
-- ---------------------------------------------------------------------------

-- get-birth-certificate-test
-- Email: applicant-details.applicant-email
-- Payment: $5, department: oag-registration, code: awR2Da5z7K
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "oag-registration", "paymentCode": "awR2Da5z7K", "amount": 5, "description": "Birth certificate copy", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your birth certificate request has been received"}}]'
)
WHERE form_id = 'get-birth-certificate-test';

-- get-death-certificate-test
-- Email: applicant-details.applicant-email
-- Payment: $5, department: oag-registration, code: awR2Da5z7K
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "oag-registration", "paymentCode": "awR2Da5z7K", "amount": 5, "description": "Death certificate copy", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your death certificate request has been received"}}]'
)
WHERE form_id = 'get-death-certificate-test';

-- get-marriage-certificate-test
-- Email: applicant-details.applicant-email
-- Payment: $10, department: oag-registration, code: awR2Da5z7K
UPDATE form_definitions
SET schema = jsonb_set(schema, '{processors}',
  '[{"type": "payment", "config": {"provider": "ezpay", "department": "oag-registration", "paymentCode": "awR2Da5z7K", "amount": 10, "description": "Marriage certificate copy", "customerEmailPath": "applicant-details.applicant-email", "customerNamePath": "applicant-details.applicant-first-name", "allowCredit": true, "allowDebit": true}}, {"type": "email", "config": {"recipientField": "applicant-details.applicant-email", "subject": "Your marriage certificate request has been received"}}]'
)
WHERE form_id = 'get-marriage-certificate-test';

COMMIT;
