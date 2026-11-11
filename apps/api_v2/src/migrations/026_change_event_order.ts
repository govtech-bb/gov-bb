/**
 * Order new audit inserts independently of transaction-start timestamps.
 * Page writers must hold the content lock for this to order page mutations.
 */
export const SQL = `
create sequence if not exists change_event_order_seq as bigint
  maxvalue 9007199254740991 no cycle;

-- Set the default separately so existing events remain unordered.
alter table change_events add column if not exists event_order bigint;
alter table change_events alter column event_order
  set default nextval('change_event_order_seq');
alter sequence change_event_order_seq owned by change_events.event_order;

create unique index if not exists change_events_event_order_unique
  on change_events (event_order);
`;
