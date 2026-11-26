-- Role changes go in the audit history, under their own entity kinds, so a
-- page's history and the site's version leave them out. `record_change`
-- can't log them: it names a row by its `id`, and `user_roles` has none.
-- As for content, the actor is the transaction's `app.user_id`, which the
-- people service sets, or `system` when nothing set it: the roles
-- `API_V2_ADMIN_EMAILS` gives, and a first sign-in claiming the roles given
-- to its email, whose snapshot keeps the admin who gave them (`granted_by`).

-- A role given or taken away, in the history of the person who holds it: the
-- entity is their user id, so their role changes are numbered 1, 2, 3. An
-- update, such as an email move clearing `granted_by`, changes no one's roles
-- and isn't logged.
create function record_role_change() returns trigger as $$
declare
  stored jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into change_events (entity_kind, entity_id, action, snapshot, actor)
  values ('user_role', stored->>'user_id',
          case when tg_op = 'INSERT' then 'created' else 'deleted' end::change_action,
          stored,
          coalesce(nullif(current_setting('app.user_id', true), ''), 'system'));
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint
create trigger user_roles_record_role_change
  after insert or delete on user_roles
  for each row execute function record_role_change();
--> statement-breakpoint
-- A role given by email before a first sign-in, or taken away again, in the
-- history of its waiting row. The entity is the row's id, never the email:
-- a snapshot can be redacted, an entity id can't. A delete with no
-- `app.user_id` is a first sign-in moving the role to `user_roles`, whose own
-- trigger logs it as that person's, so it isn't logged twice.
create function record_waiting_role_change() returns trigger as $$
declare
  stored jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor  text := nullif(current_setting('app.user_id', true), '');
begin
  if tg_op = 'DELETE' and actor is null then
    return null;
  end if;

  insert into change_events (entity_kind, entity_id, action, snapshot, actor)
  values ('waiting_role', stored->>'id',
          case when tg_op = 'INSERT' then 'created' else 'deleted' end::change_action,
          stored, coalesce(actor, 'system'));
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint
create trigger waiting_roles_record_role_change
  after insert or delete on waiting_roles
  for each row execute function record_waiting_role_change();
