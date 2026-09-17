-- A Professional that staff hide or remove from the marketplace is hidden and
-- removed.
--
-- WPS-016 records enforcement in `public.trust_account_state`:
-- `profile_hidden`, `marketplace_removed`, `suspended`, `banned`, with an
-- optional expiry. It also built the gate that turns that state into a yes or
-- no, `private.trust_state_allows(user, capability)`, which treats an expired
-- restriction as lifted.
--
-- Nothing ever called the gate. Every public path to a Professional —
-- `get_marketplace_catalog_v2`, `search_providers`, `get_discovery_home`, the
-- recently-viewed and favourites reads — and `create_marketplace_wave`, which
-- decides who is invited to quote, asks one question:
-- `private.is_provider_publicly_discoverable`. That function checked the auth
-- account's ban, verification, publication and profile completeness, and not
-- trust state. So an operator could hide a Professional after a complaint and
-- the Professional stayed in search, on the Home screen, and on the invitation
-- list for the next request.
--
-- The worker capability gate (`no_blocking_trust_action`) did read trust
-- state, which is why this was invisible from the Professional's side: they
-- could no longer act, while Customers could still find and invite them.
--
-- ## What this does
--
-- 1. The discoverability gate also requires `trust_state_allows(user,
--    'marketplace')`. Every path above inherits it; none is edited.
-- 2. WPS-014 tells a Professional when their discoverability flips, but its
--    trigger only watches provider tables. Its logic moves unchanged into a
--    per-provider function, and a trigger on `trust_account_state` calls it, so
--    an enforcement action or a restoration is noticed when it happens.
--
-- ## What this does not do
--
-- `communication`, `reviews`, `payments` and `withdrawals` restrictions are the
-- same gate with the same absence of callers. They are recorded in
-- docs/product/product-truth-register.md, not changed here: each needs its own
-- decision about what a restricted person still sees.
--
-- A restriction that lapses by `restriction_expires_at` makes the Professional
-- discoverable again at that moment, as the gate defines, but no row changes,
-- so the discoverability notification for that transition is sent on the next
-- change to the Professional rather than at the instant of expiry.

create or replace function private.is_provider_publicly_discoverable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    join auth.users u on u.id = p.user_id
    join public.provider_verifications v on v.provider_id = p.id
    where p.id = p_provider_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and private.account_contact_phone(p.user_id) is not null
      and p.is_verified and p.is_published
      and p.onboarding_status = 'approved' and p.deleted_at is null
      and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > pg_catalog.now())
      and pg_catalog.length(pg_catalog.btrim(p.display_name)) between 2 and 100
      and pg_catalog.length(pg_catalog.btrim(p.profession_key)) between 2 and 100
      and p.avatar_url is not null
      and exists (
        select 1 from public.provider_services ps
        where ps.provider_id = p.id and ps.is_active)
      -- WPS-016 enforcement: hidden, removed, suspended or banned is not
      -- discoverable, and an expired restriction no longer counts.
      and private.trust_state_allows(p.user_id, 'marketplace')
  )
$$;

-- ---------------------------------------------------------------------------
-- The WPS-014 discoverability notification, callable per provider
-- ---------------------------------------------------------------------------
-- Moved verbatim from `refresh_notification_discoverability`, which keeps
-- resolving which provider a changed row belongs to and now delegates the rest.

create or replace function private.refresh_provider_discoverability(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous boolean;
  current_value boolean;
  recipient uuid;
  source_stamp text;
  provider_exists boolean;
begin
  -- One lookup answers both questions: who owns this provider, and does the
  -- provider still exist. `found` is read immediately, because the next
  -- `select into` would overwrite it.
  select p.user_id into recipient
  from public.provider_profiles p
  where p.id = p_provider_id;
  provider_exists := found;

  -- Guard 1: the provider is gone. This is running inside its cascade.
  if not provider_exists then
    return;
  end if;

  select s.discoverable into previous
  from private.notification_discoverability_state s
  where s.provider_id = p_provider_id
  for update;

  current_value := private.is_provider_publicly_discoverable(p_provider_id);

  insert into private.notification_discoverability_state(provider_id, discoverable, updated_at)
  values (p_provider_id, current_value, pg_catalog.now())
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
      pg_catalog.jsonb_build_object('provider_id', p_provider_id),
      'discoverability:' || p_provider_id::text || ':' || current_value::text || ':' || source_stamp
    )
    on conflict do nothing;
  end if;
end;
$$;

create or replace function private.refresh_notification_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_provider_id uuid;
begin
  target_provider_id := coalesce(
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'id')
  );
  if target_provider_id is not null then
    perform private.refresh_provider_discoverability(target_provider_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.refresh_discoverability_for_trust_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  for v_provider in
    select p.id from public.provider_profiles p where p.user_id = new.user_id
  loop
    perform private.refresh_provider_discoverability(v_provider);
  end loop;
  return null;
end;
$$;

revoke all on function private.refresh_provider_discoverability(uuid) from public, anon, authenticated;
revoke all on function private.refresh_discoverability_for_trust_change() from public, anon, authenticated;

create trigger trust_account_state_discoverability
  after insert or update on public.trust_account_state
  for each row
  execute function private.refresh_discoverability_for_trust_change();
