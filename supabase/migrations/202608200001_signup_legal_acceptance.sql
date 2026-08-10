-- Signup legal acceptance
--
-- WPS-024 already owns the document register, exact bilingual corpus hashes,
-- immutable acceptance ledger and renewed-acceptance policy. This migration
-- connects consumer account creation to that authority. It publishes no legal
-- text, changes no governance flag and grants no client table write.

create or replace function private.record_signup_legal_acceptances(
  p_user_id uuid,
  p_account_role text,
  p_manifest jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required_count integer;
  v_item jsonb;
  v_requirement record;
  v_expected_hash text;
  v_accepted_at timestamptz;
  v_first_accepted_at timestamptz;
  v_acceptance_hash text;
begin
  if p_account_role not in ('customer', 'worker') then
    raise exception 'Unsupported signup legal audience' using errcode = '22023';
  end if;
  if p_manifest is null or pg_catalog.jsonb_typeof(p_manifest) <> 'array' then
    raise exception 'Signup legal acceptance is required' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer
  into v_required_count
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  where d.active and d.requires_acceptance
    and (d.audience = 'all' or d.audience = p_account_role);

  if pg_catalog.jsonb_array_length(p_manifest) <> v_required_count
     or (select pg_catalog.count(distinct item ->> 'documentKey')
         from pg_catalog.jsonb_array_elements(p_manifest) item) <> v_required_count
  then
    raise exception 'Every required legal document must be accepted exactly once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_manifest) item
    left join public.legal_documents d
      on d.document_key = item ->> 'documentKey'
     and d.active
     and d.requires_acceptance
     and (d.audience = 'all' or d.audience = p_account_role)
    where pg_catalog.jsonb_typeof(item) <> 'object'
       or d.document_key is null
  ) then
    raise exception 'Signup acceptance contains a document outside this audience'
      using errcode = '22023';
  end if;

  for v_requirement in
    select d.document_key, v.version, v.content_hash_en, v.content_hash_ar
    from public.legal_documents d
    join lateral (select * from private.legal_current_version(d.document_key)) v on true
    where d.active and d.requires_acceptance
      and (d.audience = 'all' or d.audience = p_account_role)
    order by d.sort_order
  loop
    select item into v_item
    from pg_catalog.jsonb_array_elements(p_manifest) item
    where item ->> 'documentKey' = v_requirement.document_key;

    if v_item is null
       or v_item ->> 'version' is distinct from v_requirement.version
       or coalesce(v_item ->> 'language', '') not in ('en', 'ar')
    then
      raise exception 'Signup acceptance does not name the current legal version'
        using errcode = '22023';
    end if;

    v_expected_hash := case when v_item ->> 'language' = 'ar'
      then v_requirement.content_hash_ar else v_requirement.content_hash_en end;
    if v_item ->> 'renderedHash' is distinct from v_expected_hash then
      raise exception 'The signup document shown does not match the published version'
        using errcode = '22023';
    end if;

    v_accepted_at := pg_catalog.clock_timestamp();
    v_first_accepted_at := coalesce(v_first_accepted_at, v_accepted_at);
    v_acceptance_hash := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        p_user_id::text || '|' || v_requirement.document_key || '|'
          || v_requirement.version || '|' || v_expected_hash || '|'
          || (v_item ->> 'language') || '|' || v_accepted_at::text,
        'UTF8')),
      'hex');

    insert into public.legal_acceptances
      (user_id, document_key, version, decision, accepted_language,
       acceptance_hash, rendered_hash, source_surface, account_role,
       environment, accepted_at)
    values
      (p_user_id, v_requirement.document_key, v_requirement.version,
       'accepted', v_item ->> 'language', v_acceptance_hash, v_expected_hash,
       'sign_up', p_account_role, private.platform_environment(), v_accepted_at);

    -- Keep the pre-WPS-024 purpose register aligned with the accepted legal
    -- version exactly as accept_legal_document does.
    update public.privacy_consent_purposes p
    set current_version = (
      select v.published_at::text
      from public.legal_document_versions v
      where v.document_key = v_requirement.document_key
        and v.version = v_requirement.version)
    where p.document_key = v_requirement.document_key and p.active;
  end loop;

  return v_first_accepted_at;
end;
$$;

comment on function private.record_signup_legal_acceptances(uuid, text, jsonb) is
  'Validates the exact current role-scoped corpus hashes and appends one signup acceptance per mandatory document. Postgres owns the timestamp.';

revoke all on function private.record_signup_legal_acceptances(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

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
begin
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

  v_accepted_at := private.record_signup_legal_acceptances(
    new.id,
    v_role,
    new.raw_user_meta_data -> 'legal_acceptances');

  -- Legacy summary timestamps stay truthful for older privacy projections;
  -- the immutable versioned ledger above is the acceptance authority.
  update public.profiles p
  set terms_accepted_at = v_accepted_at,
      privacy_accepted_at = v_accepted_at
  where p.id = new.id;

  -- The manifest has served its only purpose. Removing it prevents three
  -- SHA-256 values from inflating every future JWT and persisted Auth session.
  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    - 'legal_acceptances' - 'terms_accepted_at' - 'privacy_accepted_at'
  where u.id = new.id;

  return new;
end;
$$;

comment on function private.handle_signup_legal_acceptance() is
  'Consumer-signup trigger: requires current role-scoped acceptance evidence, appends immutable records, and removes the transient Auth metadata manifest.';

revoke all on function private.handle_signup_legal_acceptance()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_signup_legal_acceptance on auth.users;
create trigger on_auth_user_signup_legal_acceptance
after insert on auth.users
for each row execute function private.handle_signup_legal_acceptance();
