-- A worker could never actually be deleted.
--
-- ## What was broken
--
-- `private.refresh_notification_discoverability()` keeps
-- `private.notification_discoverability_state` current and tells a worker when
-- their profile becomes discoverable or stops being so. It is correct for every
-- ordinary change and wrong in exactly one situation: when the thing it is
-- describing is going away.
--
-- Two failures, one cause. Both were reproduced against the real schema.
--
--   delete from auth.users
--     -> public.profiles cascades away
--     -> provider_profiles.user_id is SET NULL, because ownership points at
--        profiles ON DELETE SET NULL
--     -> the AFTER UPDATE trigger on provider_profiles fires
--     -> discoverability flips, so the function looks up the owner to notify
--     -> the owner is now NULL
--     -> "null value in column user_id of relation notifications violates
--         not-null constraint", and the whole delete aborts
--
--   delete from public.provider_profiles
--     -> cascades to provider_verifications, provider_services and
--        provider_service_areas, whose triggers DO fire on DELETE
--     -> the function upserts discoverability state for the provider
--     -> the provider row is already gone, so the state row's own foreign key
--        has nothing to point at
--     -> "violates foreign key constraint
--         notification_discoverability_state_provider_id_fkey", and the delete
--         aborts
--
-- So no worker account and no provider profile could be hard-deleted at all.
-- Not a test fixture, not a real worker, not anything. There are no RESTRICT or
-- NO ACTION foreign keys to `auth.users` — every one is CASCADE or SET NULL —
-- so nothing about the constraint graph was stopping it. This function was.
--
-- ## Why nobody noticed
--
-- Warsha's privacy erasure is `private.privacy_anonymize_account`, which UPDATEs
-- profiles and provider profiles rather than deleting the user. That path has
-- always worked and is untouched here. Hard deletion is a separate capability
-- that nothing in the product exercised, so the defect sat behind a door nobody
-- opened until a fixture cleanup tried to.
--
-- ## The fix
--
-- Two guards, each answering a different question, and neither of them a
-- blanket exception handler:
--
--   1. Does the provider still exist?
--      If not, this trigger is firing inside that provider's own cascade.
--      Re-creating its discoverability state would resurrect a row for something
--      that no longer exists and fail its foreign key. There is nothing left to
--      track and nobody left to tell, so return without writing anything. The
--      state row needs no explicit cleanup: its foreign key is already
--      ON DELETE CASCADE and removes it for us.
--
--   2. Does the provider still have an owner?
--      A provider whose `user_id` is NULL is one whose account has been deleted.
--      The state is still worth maintaining — the provider row exists, and the
--      answer is genuinely "not discoverable" — but a notification needs a
--      recipient, and there is no longer a person to receive it. So the state is
--      written and the notification is skipped.
--
-- The second guard is deliberately narrow. It does not make a null recipient
-- acceptable in general: it makes a null recipient acceptable only at the moment
-- an account disappears, which is the only way `provider_profiles.user_id` can
-- become NULL, because that column is only ever nulled by the ON DELETE SET NULL
-- on its foreign key.
--
-- Nothing else changes. No foreign key is weakened, `notifications.user_id` stays
-- NOT NULL, no trigger is disabled, and every non-deletion transition behaves
-- exactly as before.

create or replace function private.refresh_notification_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_provider_id uuid;
  previous boolean;
  current_value boolean;
  recipient uuid;
  source_stamp text;
  provider_exists boolean;
begin
  target_provider_id := coalesce(
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'id')
  );
  if target_provider_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- One lookup answers both questions: who owns this provider, and does the
  -- provider still exist. `found` is read immediately, because the next
  -- `select into` would overwrite it.
  select p.user_id into recipient
  from public.provider_profiles p
  where p.id = target_provider_id;
  provider_exists := found;

  -- Guard 1: the provider is gone. This trigger is running inside its cascade.
  if not provider_exists then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select s.discoverable into previous
  from private.notification_discoverability_state s
  where s.provider_id = target_provider_id
  for update;

  current_value := private.is_provider_publicly_discoverable(target_provider_id);

  insert into private.notification_discoverability_state(provider_id, discoverable, updated_at)
  values (target_provider_id, current_value, pg_catalog.now())
  on conflict (provider_id) do update
    set discoverable = excluded.discoverable, updated_at = excluded.updated_at;

  -- Guard 2: a real transition, but no one to tell. `recipient` is null only
  -- when the owning account has been deleted, so the state above is still
  -- recorded and only the notification is skipped.
  if previous is not null
     and previous is distinct from current_value
     and recipient is not null then
    source_stamp := pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())::bigint::text;
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    values (
      recipient,
      case when current_value then 'worker_profile_discoverable' else 'worker_profile_unavailable' end,
      'Worker account update',
      'Your worker profile has an update.',
      pg_catalog.jsonb_build_object('provider_id', target_provider_id),
      'discoverability:' || target_provider_id::text || ':' || current_value::text || ':' || source_stamp
    )
    on conflict do nothing;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
