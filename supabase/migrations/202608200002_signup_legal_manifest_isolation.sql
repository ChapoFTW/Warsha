-- Signup legal manifest isolation
--
-- 202608200001 stripped the transient acceptance manifest from Auth metadata
-- in an AFTER INSERT trigger. Against hosted Auth that strip does not hold:
-- GoTrue creates the user, then updates the same row from its own in-memory
-- copy of `user_metadata` (confirming the address, recording the identity).
-- That write-back reinstates the key, so three SHA-256 values ended up in the
-- persisted row and in every issued JWT — exactly what the strip existed to
-- prevent.
--
-- The fix moves the removal to BEFORE INSERT, so the manifest is never stored
-- at all, and repeats it on BEFORE UPDATE, so no later write-back can
-- reintroduce it. The evidence the acceptance writer needs is carried through
-- the statement in a transaction-local setting keyed by user id, which keeps
-- multi-row inserts (fixtures, restores) correct.
--
-- No policy changes: the same documents, versions, hashes and refusals apply.

create or replace function private.capture_signup_legal_manifest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending jsonb;
begin
  if new.raw_user_meta_data ? 'legal_acceptances' then
    if tg_op = 'INSERT' then
      -- Keyed by user id because AFTER ROW triggers run once the whole
      -- statement has finished: a two-row insert would otherwise let the
      -- second row's evidence be recorded against the first.
      v_pending := coalesce(
        nullif(
          pg_catalog.current_setting('warsha.signup_legal_manifest', true), '')::jsonb,
        '{}'::jsonb);
      perform pg_catalog.set_config(
        'warsha.signup_legal_manifest',
        (v_pending || pg_catalog.jsonb_build_object(
          new.id::text, new.raw_user_meta_data -> 'legal_acceptances'))::text,
        true);
    end if;
    new.raw_user_meta_data := new.raw_user_meta_data - 'legal_acceptances';
  end if;

  -- A client-asserted acceptance instant is not evidence of anything. The
  -- ledger owns the timestamp, so these never belong in Auth metadata either.
  new.raw_user_meta_data :=
    new.raw_user_meta_data - 'terms_accepted_at' - 'privacy_accepted_at';
  return new;
end;
$$;

comment on function private.capture_signup_legal_manifest() is
  'Removes transient signup legal evidence from Auth metadata before it is stored or re-stored, carrying it to the acceptance writer in a transaction-local setting.';

revoke all on function private.capture_signup_legal_manifest()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_signup_legal_manifest on auth.users;
create trigger on_auth_user_signup_legal_manifest
before insert or update on auth.users
for each row execute function private.capture_signup_legal_manifest();

create or replace function private.handle_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_role text := new.raw_user_meta_data ->> 'account_role';
  v_role text := case when new.raw_user_meta_data ->> 'account_role' = 'provider'
    then 'worker' else 'customer' end;
  v_accepted_at timestamptz;
  v_is_product_signup boolean :=
    new.raw_user_meta_data ? 'account_role' or new.confirmation_sent_at is not null;
  v_carried jsonb := coalesce(
    nullif(
      pg_catalog.current_setting('warsha.signup_legal_manifest', true), '')::jsonb,
    '{}'::jsonb);
  v_manifest jsonb := v_carried -> new.id::text;
begin
  -- The evidence has been consumed. Releasing it keeps a long restore
  -- transaction from carrying every earlier row's manifest.
  if v_carried ? new.id::text then
    perform pg_catalog.set_config(
      'warsha.signup_legal_manifest', (v_carried - new.id::text)::text, true);
  end if;

  -- Direct privileged database fixtures and recovery inserts do not represent
  -- a consumer signup. Normal customer Auth requests carry confirmation state
  -- and every Warsha customer/worker request carries account_role. Public API
  -- callers cannot insert auth.users directly.
  if not v_is_product_signup then return new; end if;
  if new.raw_user_meta_data ? 'account_role'
     and v_raw_role not in ('customer', 'provider')
  then
    raise exception 'Unsupported signup account role' using errcode = '22023';
  end if;

  v_accepted_at := private.record_signup_legal_acceptances(new.id, v_role, v_manifest);

  -- Legacy summary timestamps stay truthful for older privacy projections;
  -- the immutable versioned ledger above is the acceptance authority.
  update public.profiles p
  set terms_accepted_at = v_accepted_at,
      privacy_accepted_at = v_accepted_at
  where p.id = new.id;

  return new;
end;
$$;

comment on function private.handle_signup_legal_acceptance() is
  'Consumer-signup trigger: requires current role-scoped acceptance evidence carried from the before-insert isolation trigger, and appends immutable records.';

revoke all on function private.handle_signup_legal_acceptance()
  from public, anon, authenticated, service_role;
