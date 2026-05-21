-- Rollback: Remove ALL test forms and custom components
DELETE FROM form_definitions WHERE form_id IN ('request-fire-inspection-test', 'reserve-society-name-test', 'sell-goods-services-beach-park-test');
DELETE FROM custom_components WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
