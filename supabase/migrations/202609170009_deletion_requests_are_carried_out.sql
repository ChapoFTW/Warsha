-- A deletion request is carried out, and sign-in goes with it.
--
-- WPS-022 built the request, the cooling-off period, the blockers and
-- `private.privacy_anonymize_account`. Nothing ever ran them: no function moved
-- a request past `cooling_off`, and nothing called the anonymization. Deletion
-- is enabled in Production, so a person could ask, be told "your account will
-- be deleted after the waiting period", and have nothing happen. The runbook
-- said as much -- "what execution will do, when it is wired".
--
-- Three things, to the owner's rule of 2026-09-17 (deletion stays
-- anonymization; personal data goes unless its retention is justified;
-- identifiers are detached; precise work-location data is deleted; credentials,
-- sessions and devices are revoked; marketplace visibility is removed; the
-- minimum immutable legal and audit evidence stays):
--
--   1. `privacy_anonymize_account` now empties an address of the precise place
--      and deletes the exact location of past requests.
--   2. `private.privacy_revoke_sign_in` bans the account at the auth layer,
--      deletes its sessions, refresh tokens and identities, and clears the
--      credential and the contact identifiers. Immutable evidence --
--      legal acceptances, consent history, trust and audit records, bookings,
--      the ledger -- is keyed on the account id and is untouched.
--   3. `private.process_account_deletions` moves requests: a cooling-off period
--      that has elapsed becomes `approved`, `blocked` or `legal_hold` according
--      to the blockers; an approved request is executed and becomes
--      `completed`. It runs from cron, like the marketplace jobs, and it obeys
--      `privacy_configuration.deletion_enabled`: a Warsha that does not offer
--      deletion does not quietly perform it.
--
-- Hard deletion remains unsupported (ACC-03): this is anonymization.

create or replace function private.privacy_revoke_sign_in(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sessions integer := 0;
  v_identities integer := 0;
  v_users integer := 0;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_sessions = row_count;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.identities where user_id = p_user_id;
  get diagnostics v_identities = row_count;
  -- Second factors are deliberately not touched here. `staff-authority-boundary`
  -- holds that no Warsha function may name that table at all, because a
  -- security definer function that can reach it is a route to a shared secret,
  -- and that invariant is worth more than tidying a row belonging to an account
  -- that is banned and has no credential left. Staff off-boarding removes them.

  -- Banned rather than deleted: the row is what every immutable record points
  -- at, and removing it would take legal acceptances and audit trails with it.
  update auth.users
  set banned_until = 'infinity'::timestamptz,
      email = null,
      phone = null,
      encrypted_password = null,
      email_change = '',
      phone_change = '',
      confirmation_token = '',
      recovery_token = '',
      raw_user_meta_data = '{}'::jsonb,
      updated_at = pg_catalog.now()
  where id = p_user_id;
  get diagnostics v_users = row_count;

  return pg_catalog.jsonb_build_object(
    'auth_sessions', v_sessions,
    'auth_identities', v_identities,
    'auth_sign_in_disabled', v_users);
end;
$$;
revoke all on function private.privacy_revoke_sign_in(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.privacy_anonymize_account(p_user_id uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_config private.privacy_configuration;
  v_provider_id uuid;
  v_steps jsonb := '{}'::jsonb;
  v_count integer;
begin
  if private.privacy_hold_active(p_user_id, 'account') then
    raise exception 'Account is under a hold' using errcode = '42501';
  end if;

  select * into v_config from private.privacy_configuration where singleton;
  select p.id into v_provider_id from public.provider_profiles p where p.user_id = p_user_id;

  -- Profile: the name becomes a label, the face goes, the phone goes.
  update public.profiles
  set display_name = v_config.deleted_account_label_en,
      avatar_url = null,
      phone = null,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('profile', v_count);

  -- Worker public presence: unpublished and stripped. The `deleted_at` here is
  -- WPS-010's own soft delete; this sets it rather than inventing a second one.
  if v_provider_id is not null then
    update public.provider_profiles
    set display_name = v_config.deleted_account_label_en,
        avatar_url = null,
        cover_image_url = null,
        -- Emptied rather than nulled: WPS-010 declares these NOT NULL with an
        -- empty default, and honouring that is the difference between removing
        -- somebody's biography and breaking the table it lived in.
        about = '',
        experience_summary = '',
        specialties = '{}',
        skills = '{}',
        location_label = null,
        is_published = false,
        is_available = false,
        deleted_at = coalesce(deleted_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_provider_id;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('provider_profile', v_count);

    update public.provider_portfolio
    set deleted_at = coalesce(deleted_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where provider_id = v_provider_id and deleted_at is null;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('portfolio', v_count);
  end if;

  -- Matching anchor: genuinely deleted. It is a copy of where a Professional
  -- is based, it exists only to order and bound matching, and nothing has to
  -- keep it. Removed BEFORE the addresses below, because soft-deleting its
  -- address would remove it through the trigger and this step would then log
  -- zero for a row it did in fact take away.
  if v_provider_id is not null then
    delete from private.worker_matching_locations where provider_id = v_provider_id;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('matching_location', v_count);
  end if;

  -- Addresses: soft-deleted, and emptied of the precise place.
  --
  -- The row itself stays because WPS-001 references it and a hard delete would
  -- break those references; a booking snapshot already froze the address it was
  -- served at. What had no reason to stay was everything that says exactly
  -- where somebody lives: the street, the building, the floor, the flat, the
  -- landmark, the access notes and the coordinates. They were kept until
  -- 202609170009. The governorate and district are the coarse area the
  -- marketplace already showed, and the label becomes the neutral one.
  update public.addresses
  set deleted_at = coalesce(deleted_at, pg_catalog.now()),
      label = v_config.deleted_account_label_en,
      address_line = '',
      street = null,
      building = null,
      floor = null,
      apartment = null,
      landmark = null,
      instructions = null,
      service_notes = null,
      local_source_id = null,
      latitude = null,
      longitude = null,
      pin_confirmed_at = null,
      pin_source = null,
      updated_at = pg_catalog.now()
  where customer_id = p_user_id and (deleted_at is null or latitude is not null or street is not null);
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('addresses', v_count);

  -- The exact location of past requests: genuinely deleted, like the matching
  -- anchor above. It is a copy of where a job was wanted, kept so the matcher
  -- could reach it; the request keeps its coarse area and a booking keeps its
  -- own snapshot, so nothing depends on it once the account is gone.
  delete from private.marketplace_request_locations l
  using public.marketplace_requests r
  where r.id = l.request_id and r.customer_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('request_locations', v_count);

  -- Personalization: genuinely deleted. It exists only to serve this account,
  -- so when the account goes there is nothing left for it to do.
  delete from public.user_recent_searches where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recent_searches', v_count);

  delete from public.user_recently_viewed_providers where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recently_viewed', v_count);

  delete from public.favourites where customer_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('favourites', v_count);

  delete from public.user_display_preferences where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('display_preferences', v_count);

  -- Devices: revoked, not deleted. The hash is how WPS-014 proves it stopped
  -- sending to a device; deleting the row would erase that proof.
  update private.notification_device_tokens
  set revoked_at = coalesce(revoked_at, pg_catalog.now()),
      encrypted_token = null,
      device_label = null,
      updated_at = pg_catalog.now()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('device_tokens', v_count);

  -- Notifications are deliberately NOT deleted, and the reason is worth
  -- stating because deleting them looks like the privacy-respecting choice.
  --
  -- WPS-014 declares `notification_source_links` immutable so a re-emitted
  -- event can never produce a duplicate years later, and that ledger holds a
  -- foreign key onto these rows. More importantly there is nothing personal
  -- left to remove: titles and bodies come from the generic event catalog, and
  -- `notification_safe_payload` already reduced `data` to resource UUIDs at
  -- write time. Deleting them would break an existing guarantee to remove
  -- nothing that identifies anybody.
  select pg_catalog.count(*) into v_count from public.notifications n where n.user_id = p_user_id;
  v_steps := v_steps || pg_catalog.jsonb_build_object('notifications_preserved', v_count);

  -- Identity documents: rows minimized, files handled by the storage runbook.
  -- The verification DECISION survives — it is why a badge was shown to
  -- customers who booked on the strength of it.
  if v_provider_id is not null then
    update public.provider_verification_documents
    set document_type = document_type
    where provider_id = v_provider_id;
  end if;

  -- Sign-in: revoked, with the credentials and the sessions that carry it.
  -- WPS-022 left this outstanding and said so; an anonymized account could
  -- still sign in to an empty profile. 202609170009 closes it.
  v_steps := v_steps || private.privacy_revoke_sign_in(p_user_id);

  insert into private.privacy_anonymization_log (request_id, subject_user_id, step_key, rows_affected)
  select p_request_id, p_user_id, k, (v_steps ->> k)::integer
  from pg_catalog.jsonb_object_keys(v_steps) k;

  return v_steps;
end;
$function$;

create or replace function private.process_account_deletions(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.privacy_configuration;
  v_request public.account_deletion_requests;
  v_blockers text[];
  v_next text;
  v_reviewed integer := 0;
  v_executed integer := 0;
  v_failed integer := 0;
begin
  select * into v_config from private.privacy_configuration where singleton;
  if not coalesce(v_config.deletion_enabled, false) then
    return pg_catalog.jsonb_build_object('enabled', false, 'reviewed', 0, 'executed', 0, 'failed', 0);
  end if;

  -- 1. A waiting period that has elapsed is judged again: the blockers are the
  --    person's own live commitments and can clear on their own.
  for v_request in
    select * from public.account_deletion_requests r
    where r.status = any (array['cooling_off', 'blocked', 'legal_hold'])
      and r.cooling_off_ends_at <= pg_catalog.now()
    order by r.cooling_off_ends_at
    limit p_limit
  loop
    v_blockers := private.privacy_deletion_blockers(v_request.user_id);
    v_next := case
      when 'legal_hold' = any (v_blockers) then 'legal_hold'
      when pg_catalog.cardinality(v_blockers) > 0 then 'blocked'
      else 'approved' end;
    if v_next is distinct from v_request.status or v_blockers is distinct from v_request.blocker_codes then
      update public.account_deletion_requests
      set status = v_next, blocker_codes = v_blockers
      where id = v_request.id;
      insert into private.account_deletion_events(request_id, from_status, to_status, actor_kind, detail)
      values (v_request.id, v_request.status, v_next, 'system',
        pg_catalog.jsonb_build_object('blockerCount', pg_catalog.cardinality(v_blockers)));
    end if;
    v_reviewed := v_reviewed + 1;
  end loop;

  -- 2. An approved request is carried out. One request per iteration, each in
  --    its own exception block: a failure is recorded against that request and
  --    does not stop the rest.
  for v_request in
    select * from public.account_deletion_requests r
    where r.status = 'approved'
    order by r.cooling_off_ends_at
    limit p_limit
  loop
    begin
      update public.account_deletion_requests
      set status = 'processing', processing_at = coalesce(processing_at, pg_catalog.now())
      where id = v_request.id;
      insert into private.account_deletion_events(request_id, from_status, to_status, actor_kind, detail)
      values (v_request.id, 'approved', 'processing', 'system', '{}'::jsonb);

      perform private.privacy_anonymize_account(v_request.user_id, v_request.id);

      update public.account_deletion_requests
      set status = 'completed',
          anonymized_at = coalesce(anonymized_at, pg_catalog.now()),
          completed_at = coalesce(completed_at, pg_catalog.now())
      where id = v_request.id;
      insert into private.account_deletion_events(request_id, from_status, to_status, actor_kind, detail)
      values (v_request.id, 'processing', 'completed', 'system', '{}'::jsonb);
      v_executed := v_executed + 1;
    exception when others then
      -- The reason is a code and a message from the database, never the
      -- person's data, and it is what support is told to look at.
      update public.account_deletion_requests
      set status = 'failed', failure_reason = pg_catalog.left(sqlstate || ': ' || sqlerrm, 300)
      where id = v_request.id;
      insert into private.account_deletion_events(request_id, from_status, to_status, actor_kind, detail)
      values (v_request.id, 'processing', 'failed', 'system',
        pg_catalog.jsonb_build_object('sqlstate', sqlstate));
      perform private.record_operational_event('privacy', 'account_deletion_failed', 'error',
        pg_catalog.jsonb_build_object('requestId', v_request.id::text, 'sqlstate', sqlstate));
      v_failed := v_failed + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object('enabled', true, 'reviewed', v_reviewed,
    'executed', v_executed, 'failed', v_failed);
end;
$$;
revoke all on function private.process_account_deletions(integer) from public, anon, authenticated;

-- Every ten minutes: a waiting period ends on the clock, and nobody is on the
-- clock. The marketplace drain established the pattern (202609170001).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'warsha-account-deletions') then
    perform cron.schedule('warsha-account-deletions', '*/10 * * * *',
      $job$select private.process_account_deletions(20)$job$);
  end if;
end $$;
