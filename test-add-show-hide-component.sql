-- Add show-hide custom component
INSERT INTO custom_components (id, namespace, type, definition, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'generic',
  'show-hide',
  '{"fieldId": "show-hide", "label": "Show more", "htmlType": "show-hide"}',
  NOW(), NOW()
);
