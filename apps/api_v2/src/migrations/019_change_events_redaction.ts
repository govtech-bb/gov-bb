/** Keep audit metadata immutable while allowing an explicit snapshot redaction. */
export const SQL = `
create or replace function change_events_append_only() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('app.redacting', true) = 'on'
       and old.snapshot->'redacted' is distinct from 'true'::jsonb
       and new.snapshot = jsonb_build_object(
         'redacted', true,
         'reason', new.snapshot->>'reason',
         'by', new.snapshot->>'by'
       )
       and new.snapshot->>'reason' ~ '[^[:space:]]'
       and new.snapshot->>'by' ~ '[^[:space:]]'
       and (to_jsonb(new) - 'snapshot') is not distinct from (to_jsonb(old) - 'snapshot')
    then
      return new;
    end if;
  end if;
  raise exception 'change_events is append-only (attempted %)', tg_op;
end;
$$ language plpgsql;
`;
