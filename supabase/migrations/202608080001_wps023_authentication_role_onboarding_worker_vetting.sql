-- WPS-023 Authentication, Role-Based Onboarding & Worker Vetting
--
-- Extends WPS-001 authentication, WPS-006 provider verification, WPS-010 worker
-- profiles, WPS-016 trust, WPS-017 admin and WPS-022 privacy. It creates no
-- second authentication system, no second provider identity, no second
-- verification workflow and no second document store.
--
-- Three things in this migration are load-bearing and worth stating up front.
--
-- 1. Section 0 closes a real, live signed-out reachability defect found by
--    auditing the running database rather than the migration source.
-- 2. The worker lifecycle is a server-authoritative state machine. The client
--    cannot write a state, and no extraction, score or upload can move one.
-- 3. Nothing here approves anybody. Every adverse and every favourable
--    decision requires a named human holding a named capability.
--
-- Forward-only. Applies after 202608070001.

-- ---------------------------------------------------------------------------
-- SECTION 0. SIGNED-OUT REACHABILITY REPAIR
-- ---------------------------------------------------------------------------
--
-- The Phase 1 audit queried the live database and found fifteen `public`
-- functions executable by `anon`: the nine WPS-022 privacy mutations and the
-- six WPS-022 staff functions, including `staff_create_legal_hold`.
--
-- The cause is worth recording, because the mistake is easy to repeat and the
-- code that made it looks correct. WPS-022 wrote, for every one of them:
--
--     grant execute on function public.<fn> to authenticated;
--     revoke all on function public.<fn> from anon;
--
-- `anon` never held a direct grant. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and `anon` reached these functions through
-- that. `REVOKE ... FROM anon` removes a grant made *to* `anon`; it cannot
-- remove what `anon` inherits *from PUBLIC*. Every one of those fifteen
-- revokes was a no-op, and the ACLs still read `=X/postgres`.
--
-- The functions all fail closed at runtime — each opens with an `auth.uid() is
-- null` check or a capability check — so this was never exploitable on its own.
-- It is still a genuine defect: the privilege surface did not match the intent,
-- and `anon` being one missing internal check away from `staff_create_legal_hold`
-- is not a margin worth keeping. WPS-022's own tests asserted the *behaviour*
-- (`throws_ok`) and so could not see it. WPS-023 asserts the *privilege*.
--
-- Deliberately preserved: WPS-020 granted nine sanitized discovery and catalog
-- reads to `anon` on purpose, and its suite asserts that grant. Those return
-- only what is already publicly discoverable. WPS-023 gates the client entry,
-- not those reads, and they stay exactly as WPS-020 left them.
do $$
declare
  r record;
  -- The WPS-020 / WPS-006 / WPS-011 sanctioned anonymous read surface.
  anon_allowlist text[] := array[
    'get_marketplace_catalog',
    'get_marketplace_catalog_v2',
    'get_discovery_home',
    'get_discovery_filters',
    'get_search_suggestions',
    'search_providers',
    'get_provider_rating_summary',
    'get_provider_reputation_summary',
    'get_provider_trust_indicators'
  ];
begin
  for r in
    select p.oid::pg_catalog.regprocedure::text as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not (p.proname = any(anon_allowlist))
      and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      -- Only where `authenticated` holds an explicit grant of its own. A
      -- function reaching `authenticated` solely through PUBLIC would be
      -- broken by this revoke, so it is left alone and caught by the test
      -- that asserts no non-allowlisted function is anon-executable.
      and exists (
        select 1
        from pg_catalog.aclexplode(p.proacl) a
        where a.grantee = 'authenticated'::pg_catalog.regrole::oid
          and a.privilege_type = 'EXECUTE'
      )
  loop
    execute pg_catalog.format('revoke all on function %s from public', r.signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- SECTION 1. ACCOUNT ROLE SELECTION AND ONBOARDING STATE
-- ---------------------------------------------------------------------------
--
-- The account model, stated once so nothing has to infer it:
--
--   * Every authenticated account may use customer functionality. There is no
--     customer-only account type and no way to lose customer capability.
--   * Worker capability is an ADDITIONAL, server-approved role. Choosing
--     "Worker" at sign-up starts worker onboarding; it grants nothing.
--   * Worker approval never removes customer capability.
--   * Once a worker is active, the worker home is their default. "Book a
--     service" remains available as a secondary customer-mode action.
--
-- `intended_role` records what the account asked to become. It is NOT an
-- authorization fact and nothing reads it as one: worker privilege is decided
-- by `private.worker_activation_gates`, which never consults this column.

create table if not exists public.account_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  intended_role text not null check (intended_role in ('customer', 'worker')),
  role_selected_at timestamptz not null default pg_catalog.now(),
  role_selection_locked boolean not null default false,
  customer_state text not null default 'address_required'
    check (customer_state in ('address_required', 'complete')),
  worker_state text
    check (worker_state in (
      'account_created',
      'onboarding_incomplete',
      'identity_required',
      'identity_submitted',
      'identity_under_review',
      'criminal_record_required',
      'criminal_record_submitted',
      'criminal_record_under_review',
      'correction_required',
      'manual_review',
      'rejected',
      'appeal_pending',
      'approved',
      'active',
      'suspended'
    )),
  worker_state_changed_at timestamptz,
  worker_agreement_accepted_at timestamptz,
  document_processing_accepted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- A worker account always has a lifecycle state; a customer account never
  -- carries a dangling one.
  constraint account_onboarding_worker_state_present
    check ((intended_role = 'worker') = (worker_state is not null))
);

comment on table public.account_onboarding is
  'WPS-023 role selection and onboarding position. Not an authorization record.';
comment on column public.account_onboarding.intended_role is
  'What the account asked to become. Never consulted by an activation gate.';

create index if not exists account_onboarding_worker_state_idx
  on public.account_onboarding(worker_state, worker_state_changed_at desc)
  where worker_state is not null;

-- Immutable transition history. One row per attempted state change that
-- succeeded, with the actor and a reason that is safe to show the worker.
create table if not exists public.worker_onboarding_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id uuid references public.profiles(id),
  actor_kind text not null check (actor_kind in ('worker', 'staff', 'system')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  -- Shown to the worker. Never carries offence detail, staff notes, reviewer
  -- identity or document contents.
  safe_reason text not null
    check (pg_catalog.length(pg_catalog.btrim(safe_reason)) between 3 and 400),
  policy_version text,
  -- `clock_timestamp()`, not `now()`. `now()` is the transaction start, so two
  -- transitions recorded in one transaction would share a timestamp and their
  -- order would fall back to a random uuid tiebreak. A history whose order
  -- depends on a uuid is not a history.
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.worker_onboarding_events is
  'WPS-023 immutable worker lifecycle history. Append-only, owner and staff readable.';

create index if not exists worker_onboarding_events_user_idx
  on public.worker_onboarding_events(user_id, created_at desc);

-- Staff-private evidence for a decision. Separated from the worker-visible
-- history so a reviewer can record what they actually saw without that text
-- becoming readable by the person it is about.
create table if not exists private.worker_onboarding_evidence (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.worker_onboarding_events(id) on delete cascade,
  reviewer_id uuid references public.profiles(id),
  note text not null
    check (pg_catalog.length(pg_catalog.btrim(note)) between 3 and 4000),
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.worker_onboarding_evidence from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 2. CUSTOMER SERVICE ADDRESS AND MAP PIN
-- ---------------------------------------------------------------------------
--
-- Extends the WPS-001 `public.addresses` table rather than creating a second
-- customer-address system. A confirmed pin is a separate fact from having
-- coordinates: coordinates can arrive from a guess, a default city centre or a
-- stale device fix. `pin_confirmed_at` records that a human looked at the
-- position and said yes.

alter table public.addresses
  add column if not exists building text,
  add column if not exists floor text,
  add column if not exists apartment text,
  add column if not exists landmark text,
  add column if not exists service_notes text,
  add column if not exists pin_confirmed_at timestamptz,
  add column if not exists pin_source text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.addresses'::pg_catalog.regclass
      and conname = 'addresses_pin_source_check'
  ) then
    alter table public.addresses
      add constraint addresses_pin_source_check
      check (pin_source is null or pin_source in ('device_location', 'address_search', 'manual_pin'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.addresses'::pg_catalog.regclass
      and conname = 'addresses_confirmed_pin_complete'
  ) then
    -- A confirmed pin is meaningless without the coordinates it confirms and
    -- the path that produced them.
    alter table public.addresses
      add constraint addresses_confirmed_pin_complete
      check (
        pin_confirmed_at is null
        or (latitude is not null and longitude is not null and pin_source is not null)
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.addresses'::pg_catalog.regclass
      and conname = 'addresses_coordinate_range'
  ) then
    alter table public.addresses
      add constraint addresses_coordinate_range
      check (
        (latitude is null or latitude between -90 and 90)
        and (longitude is null or longitude between -180 and 180)
      );
  end if;
end $$;

create index if not exists addresses_customer_confirmed_idx
  on public.addresses(customer_id)
  where pin_confirmed_at is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- SECTION 3. WORKER IDENTITY DOCUMENTS AND EXTRACTION CANDIDATES
-- ---------------------------------------------------------------------------
--
-- `public.provider_verification_documents` (WPS-001, hardened by WPS-006)
-- already owns identity document metadata, already allows
-- `national_id_front` / `national_id_back`, already enforces one current
-- document per type, and already lives in the private `verification-documents`
-- bucket. WPS-023 extends it with capture-quality facts and reuses everything
-- else.

alter table public.provider_verification_documents
  add column if not exists capture_source text,
  add column if not exists content_hash text,
  add column if not exists quality_flags text[] not null default '{}',
  add column if not exists page_side text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.provider_verification_documents'::pg_catalog.regclass
      and conname = 'provider_verification_documents_capture_source_check'
  ) then
    alter table public.provider_verification_documents
      add constraint provider_verification_documents_capture_source_check
      check (capture_source is null or capture_source in ('camera', 'library', 'file'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.provider_verification_documents'::pg_catalog.regclass
      and conname = 'provider_verification_documents_content_hash_check'
  ) then
    alter table public.provider_verification_documents
      add constraint provider_verification_documents_content_hash_check
      check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.provider_verification_documents'::pg_catalog.regclass
      and conname = 'provider_verification_documents_page_side_check'
  ) then
    alter table public.provider_verification_documents
      add constraint provider_verification_documents_page_side_check
      check (page_side is null or page_side in ('front', 'back'));
  end if;
end $$;

-- The same image uploaded by two different accounts is a signal a reviewer
-- must see. It is recorded, never auto-actioned: shared devices, re-scans and
-- family members legitimately produce collisions.
create index if not exists provider_verification_documents_hash_idx
  on public.provider_verification_documents(content_hash)
  where content_hash is not null and is_current;

-- Extraction candidates. Private, because they are unconfirmed machine output
-- about a person's identity document, and because a confidence score is an
-- internal number that must never reach a screen or a decision.
create table if not exists private.worker_identity_extractions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  document_id uuid references public.provider_verification_documents(id) on delete set null,
  provider_key text not null,
  field_key text not null check (field_key in (
    'national_id_number',
    'legal_name_ar',
    'date_of_birth',
    'id_expiry_date'
  )),
  candidate_value text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  requires_manual_entry boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.worker_identity_extractions from public, anon, authenticated;

comment on table private.worker_identity_extractions is
  'WPS-023 assistive extraction candidates. Never an approval, never a decision input.';

create index if not exists worker_identity_extractions_provider_idx
  on private.worker_identity_extractions(provider_id, created_at desc);

-- Confirmed identity fields extend the WPS-006 identity table rather than
-- creating a second one. The full National ID number is never stored: WPS-006
-- already established hash + last four, and WPS-023 keeps that exactly.
alter table private.provider_verification_identities
  add column if not exists legal_name text,
  add column if not exists date_of_birth date,
  add column if not exists id_expiry_date date,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id),
  add column if not exists extraction_reviewed boolean not null default false;

-- ---------------------------------------------------------------------------
-- SECTION 4. CRIMINAL-RECORD CERTIFICATE (MODEL A)
-- ---------------------------------------------------------------------------
--
-- Model A, locked: the worker obtains the official certificate themselves and
-- uploads it. Warsha does not retrieve it, has no Ministry integration, no
-- Ministry API access, no government lookup and no automatic authenticity
-- confirmation. Nothing in this schema implies otherwise, and no column
-- records a "verified with the Ministry" fact, because no such check exists.
--
-- The certificate gets its own bucket, its own table and its own capability.
-- It is the most sensitive document Warsha holds and it does not belong in the
-- same access envelope as a portfolio photo or a trade licence.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worker-criminal-records',
  'worker-criminal-records',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/heic', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.worker_criminal_record_submissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 8388608),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  issue_date date not null,
  document_reference text,
  declared_name text not null
    check (pg_catalog.length(pg_catalog.btrim(declared_name)) between 2 and 120),
  worker_acknowledged_at timestamptz not null default pg_catalog.now(),
  status text not null default 'submitted'
    check (status in (
      'submitted',
      'under_review',
      'clear',
      'approved',
      'correction_required',
      'manual_review',
      'rejected'
    )),
  -- Set only when an approved, versioned policy defines one. Null means no
  -- approved policy defines an expiry, not "never expires".
  review_due_on date,
  policy_version text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  -- Safe to show the worker. Offence detail never appears here.
  safe_outcome_reason text
    check (safe_outcome_reason is null
           or pg_catalog.length(pg_catalog.btrim(safe_outcome_reason)) between 3 and 400),
  is_current boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.worker_criminal_record_submissions is
  'WPS-023 Model A certificate metadata. Contains no offence detail by construction.';
comment on column public.worker_criminal_record_submissions.safe_outcome_reason is
  'Worker-visible reason. Offence detail is prohibited here and lives in private review evidence.';

create unique index if not exists worker_criminal_record_current_unique
  on public.worker_criminal_record_submissions(provider_id)
  where is_current;

create index if not exists worker_criminal_record_status_idx
  on public.worker_criminal_record_submissions(status, created_at)
  where is_current;

-- Everything a reviewer records that the worker must not read. This is the
-- only place offence-relevant text may exist, and no RPC returns it to any
-- client.
create table if not exists private.worker_criminal_record_review (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  submission_id uuid not null
    references public.worker_criminal_record_submissions(id) on delete cascade,
  reviewer_id uuid references public.profiles(id),
  policy_version text not null,
  assessment_note text not null
    check (pg_catalog.length(pg_catalog.btrim(assessment_note)) between 3 and 4000),
  authenticity_concern boolean not null default false,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.worker_criminal_record_review from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5. VETTING POLICY VERSIONS
-- ---------------------------------------------------------------------------
--
-- The rule "any offence in the previous twelve months rejects the worker" is
-- deliberately NOT implemented. It cannot distinguish an accusation from a
-- final conviction, a mistaken identity from a real one, or an offence
-- relevant to entering someone's home from one that is not.
--
-- What exists instead is a versioned policy record whose criteria are data,
-- whose legal review status starts as `pending`, and which cannot take effect
-- until a named person marks it reviewed. The seeded criteria below are
-- ILLUSTRATIVE INPUT FOR LEGAL REVIEW. They are not legally approved, they are
-- not a compliance claim, and no code path treats them as one.

create table if not exists private.worker_vetting_policies (
  policy_version text primary key check (policy_version ~ '^wps023-v[0-9]+$'),
  effective_from date,
  legal_review_status text not null default 'pending'
    check (legal_review_status in ('pending', 'in_review', 'approved', 'withdrawn')),
  legal_reviewed_by text,
  legal_reviewed_at timestamptz,
  -- Categories a reviewer weighs. Data, not logic. Nothing evaluates these
  -- automatically and no branch reads them to produce an outcome.
  assessment_criteria jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.worker_vetting_policies from public, anon, authenticated;

insert into private.worker_vetting_policies
  (policy_version, legal_review_status, assessment_criteria, notes)
values (
  'wps023-v1',
  'pending',
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('factor', 'offence_category', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'severity', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'relevance_to_entering_homes', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'conviction_versus_accusation', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'judgment_finality', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'recency', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'pending_appeal', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'mistaken_identity', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'document_authenticity', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'rehabilitation_or_legal_correction', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'repeat_pattern', 'weighting', 'reviewer_judgement'),
    pg_catalog.jsonb_build_object('factor', 'staff_evidence', 'weighting', 'reviewer_judgement')
  ),
  'ILLUSTRATIVE ONLY. Drafted for professional legal review, not approved. '
  || 'No automatic rejection rule is implemented. See '
  || 'docs/decisions/worker-criminal-record-model.md.'
)
on conflict (policy_version) do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 6. ACTIVATION GATES
-- ---------------------------------------------------------------------------
--
-- The single server-side answer to "may this account act as a worker?". Every
-- worker-capability check in every RPC funnels through
-- `private.worker_capability_active`, which is this function's verdict. A gate
-- that is missing evaluates to false, so an incomplete account is never
-- accidentally activated by a gate nobody remembered to write.

create or replace function private.worker_activation_gates(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider public.provider_profiles;
  v_onboarding public.account_onboarding;
  v_auth record;
  v_identity private.provider_verification_identities;
  v_verification public.provider_verifications;
  v_record public.worker_criminal_record_submissions;
  v_trust text;
begin
  if p_user_id is null then
    return '{}'::jsonb;
  end if;

  select * into v_onboarding from public.account_onboarding o where o.user_id = p_user_id;
  select * into v_provider from public.provider_profiles p
   where p.user_id = p_user_id and p.deleted_at is null;
  select u.email_confirmed_at, u.phone, u.phone_confirmed_at, u.banned_until, u.deleted_at
    into v_auth from auth.users u where u.id = p_user_id;
  select * into v_identity from private.provider_verification_identities i
   where i.provider_id = v_provider.id;
  select * into v_verification from public.provider_verifications v
   where v.provider_id = v_provider.id;
  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;

  -- WPS-016 owns trust state. Read it, never restate it: the levels below are
  -- that authority's, and a worker who is restricted there is not activated
  -- here regardless of how their onboarding looks.
  select t.trust_level into v_trust
  from public.trust_account_state t where t.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'authenticated_account', v_auth.deleted_at is null,
    'verified_phone', v_auth.phone is not null and v_auth.phone_confirmed_at is not null,
    -- Email is optional for a worker: WPS-001 registers workers by phone. The
    -- gate asserts it is confirmed only when an address is actually present.
    'verified_email_if_present', true,
    'worker_role_selected', coalesce(v_onboarding.intended_role = 'worker', false),
    'legal_name_complete',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_identity.legal_name, ''))) between 2 and 120,
    'profile_photo', v_provider.avatar_url is not null,
    'biography',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_provider.about, ''))) between 20 and 500,
    'services_configured', exists (
      select 1 from public.provider_services ps
      where ps.provider_id = v_provider.id and ps.is_active),
    'service_area_configured', exists (
      select 1 from public.provider_service_areas a
      where a.provider_id = v_provider.id
        and a.radius_km between 1 and 250
        and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0),
    'current_address_provided', exists (
      select 1 from public.addresses ad
      where ad.customer_id = p_user_id and ad.deleted_at is null
        and ad.pin_confirmed_at is not null),
    'national_id_front_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front'),
    'national_id_back_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back'),
    'national_id_approved', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front' and d.status = 'approved')
      and exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back' and d.status = 'approved'),
    'identity_fields_confirmed', v_identity.confirmed_at is not null,
    'criminal_record_uploaded', v_record.id is not null,
    'criminal_record_approved', coalesce(v_record.status in ('clear', 'approved'), false),
    'worker_agreement_accepted', v_onboarding.worker_agreement_accepted_at is not null,
    'document_processing_accepted', v_onboarding.document_processing_accepted_at is not null,
    'identity_verification_approved', coalesce(v_verification.status = 'approved', false),
    'not_banned',
      v_auth.banned_until is null or v_auth.banned_until <= pg_catalog.now(),
    'no_blocking_trust_action',
      coalesce(v_trust, 'good_standing') not in ('suspended', 'banned', 'under_investigation')
      and not exists (
        select 1 from public.trust_account_state t
        where t.user_id = p_user_id and (t.marketplace_removed or t.profile_hidden)),
    'provider_status_allowed',
      coalesce(v_provider.onboarding_status = 'approved', false),
    'not_deactivated', exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id and pr.deactivated_at is null and pr.deleted_at is null),
    'no_deletion_pending', not exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = p_user_id and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'))
  );
end;
$$;

comment on function private.worker_activation_gates(uuid) is
  'WPS-023 fail-closed worker activation gates. Missing evidence reads as false.';

-- True only when every gate passes AND the lifecycle actually reached `active`.
-- Both halves are required: passing the gates is necessary, but a human still
-- has to activate the account.
create or replace function private.worker_capability_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select o.worker_state = 'active'
        and not exists (
          select 1
          from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
          where g.value = 'false'::jsonb
        )
      from public.account_onboarding o
      where o.user_id = p_user_id
    ),
    false
  )
$$;

comment on function private.worker_capability_active(uuid) is
  'WPS-023 single worker authorization answer: every gate passed AND a human activated.';

-- ---------------------------------------------------------------------------
-- SECTION 7. STATE MACHINE
-- ---------------------------------------------------------------------------

create or replace function private.worker_transition_allowed(
  p_from text,
  p_to text,
  p_actor_kind text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    -- Worker-driven progress. A worker may submit and resubmit; a worker may
    -- never reach a decision state.
    when p_actor_kind = 'worker' then
      (p_from = 'account_created' and p_to = 'onboarding_incomplete')
      or (p_from in ('onboarding_incomplete', 'correction_required') and p_to = 'identity_required')
      -- The states before submission describe where the worker got to, not a
      -- sequence anybody has to be walked through one call at a time. The real
      -- precondition — both sides uploaded and the fields confirmed — is
      -- checked in `submit_my_identity_for_review`, so any of the pre-review
      -- states may reach `identity_submitted` directly.
      or (p_from in ('account_created', 'onboarding_incomplete', 'identity_required',
                     'correction_required')
          and p_to = 'identity_submitted')
      -- The certificate step is NOT reachable this way. A worker arrives at
      -- `criminal_record_required` only because staff put them there after an
      -- identity review, which is what keeps the two reviews in order.
      or (p_from in ('criminal_record_required', 'correction_required')
          and p_to = 'criminal_record_submitted')
      or (p_from = 'rejected' and p_to = 'appeal_pending')
    -- Staff decisions. Only staff reach a review, adverse or approval state.
    when p_actor_kind = 'staff' then
      (p_from = 'identity_submitted' and p_to in ('identity_under_review', 'correction_required', 'manual_review'))
      or (p_from = 'identity_under_review' and p_to in ('criminal_record_required', 'correction_required', 'manual_review', 'rejected'))
      or (p_from = 'criminal_record_submitted' and p_to in ('criminal_record_under_review', 'correction_required', 'manual_review'))
      or (p_from = 'criminal_record_under_review' and p_to in ('approved', 'correction_required', 'manual_review', 'rejected'))
      or (p_from = 'manual_review' and p_to in ('approved', 'correction_required', 'rejected'))
      or (p_from = 'appeal_pending' and p_to in ('approved', 'rejected', 'correction_required', 'manual_review'))
      or (p_from = 'approved' and p_to in ('active', 'suspended'))
      or (p_from = 'active' and p_to = 'suspended')
      or (p_from = 'suspended' and p_to in ('active', 'rejected'))
    -- The system may only record the account's own creation.
    when p_actor_kind = 'system' then
      p_from is null and p_to = 'account_created'
    else false
  end
$$;

revoke all on function private.worker_transition_allowed(text, text, text) from public, anon, authenticated;

create or replace function private.worker_transition(
  p_user_id uuid,
  p_to text,
  p_actor_id uuid,
  p_actor_kind text,
  p_reason_code text,
  p_safe_reason text,
  p_policy_version text default null,
  p_private_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_event_id uuid;
begin
  -- Row lock: two staff decisions arriving together must serialize, or both
  -- read the same `from` state and both believe they were valid.
  select o.worker_state into v_from
  from public.account_onboarding o
  where o.user_id = p_user_id
  for update;

  if not found then
    raise exception 'No onboarding record' using errcode = '22023';
  end if;

  -- Idempotent: re-issuing the state the account already holds is a no-op
  -- rather than an error, so a retried request cannot duplicate history.
  if v_from is not distinct from p_to then
    return null;
  end if;

  if not private.worker_transition_allowed(v_from, p_to, p_actor_kind) then
    raise exception 'Invalid worker onboarding transition' using errcode = '22023';
  end if;

  update public.account_onboarding
  set worker_state = p_to,
      worker_state_changed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  insert into public.worker_onboarding_events
    (user_id, from_state, to_state, actor_id, actor_kind, reason_code, safe_reason, policy_version)
  values
    (p_user_id, v_from, p_to, p_actor_id, p_actor_kind, p_reason_code, p_safe_reason, p_policy_version)
  returning id into v_event_id;

  if p_private_note is not null then
    insert into private.worker_onboarding_evidence (event_id, reviewer_id, note)
    values (v_event_id, p_actor_id, p_private_note);
  end if;

  return v_event_id;
end;
$$;

revoke all on function private.worker_transition(uuid, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;

comment on function private.worker_transition(uuid, text, uuid, text, text, text, text, text) is
  'WPS-023 sole writer of worker_state. No client holds execute on it.';

-- History is append-only. A decision a reviewer later regrets stays visible.
create or replace function private.worker_onboarding_events_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Worker onboarding history is immutable' using errcode = '42501';
end;
$$;

drop trigger if exists worker_onboarding_events_immutable on public.worker_onboarding_events;
create trigger worker_onboarding_events_immutable
before update or delete on public.worker_onboarding_events
for each row execute function private.worker_onboarding_events_immutable();

revoke all on function private.worker_onboarding_events_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 8. ROLE SELECTION AND ONBOARDING RPCS
-- ---------------------------------------------------------------------------

create or replace function public.select_my_account_role(p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.account_onboarding;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('customer', 'worker') then
    raise exception 'Invalid role selection' using errcode = '22023';
  end if;

  perform public.ensure_customer_profile();

  select * into v_existing from public.account_onboarding o
   where o.user_id = v_user for update;

  if v_existing.user_id is null then
    insert into public.account_onboarding (user_id, intended_role, worker_state)
    values (v_user, p_role, case when p_role = 'worker' then 'account_created' else null end);

    if p_role = 'worker' then
      insert into public.worker_onboarding_events
        (user_id, from_state, to_state, actor_id, actor_kind, reason_code, safe_reason)
      values
        (v_user, null, 'account_created', v_user, 'system', 'account_created',
         'Your worker account was created.');
    end if;
  elsif v_existing.intended_role is distinct from p_role then
    -- Once worker onboarding has produced a decision, the choice stops being a
    -- preference. Switching away would orphan a review someone performed.
    if v_existing.role_selection_locked then
      raise exception 'Role selection is locked' using errcode = '42501';
    end if;

    update public.account_onboarding
    set intended_role = p_role,
        role_selected_at = pg_catalog.now(),
        worker_state = case
          when p_role = 'worker' then coalesce(v_existing.worker_state, 'account_created')
          else null
        end,
        worker_state_changed_at = case when p_role = 'worker' then pg_catalog.now() else null end,
        updated_at = pg_catalog.now()
    where user_id = v_user;
  end if;

  return public.get_my_onboarding_state();
end;
$$;

-- The single routing authority. The client asks the server what to show; it
-- does not decide. `workerCapabilityActive` is the only field any navigation
-- may treat as permission, and it is computed, never stored.
create or replace function public.get_my_onboarding_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.account_onboarding;
  v_provider public.provider_profiles;
  v_gates jsonb;
  v_address_confirmed boolean;
  v_deactivated boolean;
  v_deletion text;
  v_banned boolean;
  v_latest public.worker_onboarding_events;
  v_record public.worker_criminal_record_submissions;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.account_onboarding o where o.user_id = v_user;
  select * into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;

  select exists (
    select 1 from public.addresses a
    where a.customer_id = v_user and a.deleted_at is null and a.pin_confirmed_at is not null
  ) into v_address_confirmed;

  select pr.deactivated_at is not null into v_deactivated
  from public.profiles pr where pr.id = v_user;

  select r.status into v_deletion
  from public.account_deletion_requests r
  where r.user_id = v_user and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing')
  order by r.requested_at desc limit 1;

  select u.banned_until is not null and u.banned_until > pg_catalog.now() into v_banned
  from auth.users u where u.id = v_user;

  select * into v_latest from public.worker_onboarding_events e
   where e.user_id = v_user order by e.created_at desc, e.id desc limit 1;

  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;

  v_gates := case
    when v_row.intended_role = 'worker' then private.worker_activation_gates(v_user)
    else '{}'::jsonb
  end;

  return pg_catalog.jsonb_build_object(
    'roleSelected', v_row.user_id is not null,
    'intendedRole', v_row.intended_role,
    'roleSelectionLocked', coalesce(v_row.role_selection_locked, false),
    'customerState', coalesce(v_row.customer_state, 'address_required'),
    'addressConfirmed', coalesce(v_address_confirmed, false),
    'workerState', v_row.worker_state,
    'workerStateChangedAt', v_row.worker_state_changed_at,
    'workerAgreementAccepted', v_row.worker_agreement_accepted_at is not null,
    'documentProcessingAccepted', v_row.document_processing_accepted_at is not null,
    'gates', v_gates,
    'outstandingGates', coalesce((
      select pg_catalog.jsonb_agg(g.key order by g.key)
      from pg_catalog.jsonb_each(v_gates) g
      where g.value = 'false'::jsonb
    ), '[]'::jsonb),
    -- The only permission fact in this payload.
    'workerCapabilityActive', private.worker_capability_active(v_user),
    'certificateStatus', v_record.status,
    'certificateSafeReason', v_record.safe_outcome_reason,
    'latestSafeReason', v_latest.safe_reason,
    'latestReasonCode', v_latest.reason_code,
    'accountDeactivated', coalesce(v_deactivated, false),
    'deletionStatus', v_deletion,
    'accountBanned', coalesce(v_banned, false)
  );
end;
$$;

create or replace function public.accept_my_worker_agreements(
  p_worker_agreement boolean,
  p_document_processing boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.account_onboarding
  set worker_agreement_accepted_at = case
        when p_worker_agreement then coalesce(worker_agreement_accepted_at, pg_catalog.now())
        else worker_agreement_accepted_at end,
      document_processing_accepted_at = case
        when p_document_processing then coalesce(document_processing_accepted_at, pg_catalog.now())
        else document_processing_accepted_at end,
      updated_at = pg_catalog.now()
  where user_id = v_user and intended_role = 'worker';

  if not found then
    raise exception 'Worker onboarding has not started' using errcode = '22023';
  end if;

  -- WPS-022 owns consent. Document processing is a consent decision, so it is
  -- recorded there too rather than only here.
  if p_document_processing then
    perform public.record_my_consent('identity_documents', true, 'worker_onboarding');
  end if;

  return public.get_my_onboarding_state();
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 9. CUSTOMER ADDRESS CONFIRMATION
-- ---------------------------------------------------------------------------
--
-- GPS permission is optional; a confirmed pin is mandatory. `manual_pin` is a
-- first-class source, not a fallback, so a denied location permission never
-- blocks a customer and never produces a permission loop.

create or replace function public.confirm_my_service_address(
  p_address_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_pin_source text,
  p_building text default null,
  p_floor text default null,
  p_apartment text default null,
  p_landmark text default null,
  p_service_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_pin_source is null or p_pin_source not in ('device_location', 'address_search', 'manual_pin') then
    raise exception 'Invalid pin source' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'A confirmed map pin is required' using errcode = '22023';
  end if;

  update public.addresses
  set latitude = p_latitude,
      longitude = p_longitude,
      pin_source = p_pin_source,
      pin_confirmed_at = pg_catalog.now(),
      building = coalesce(nullif(pg_catalog.btrim(p_building), ''), building),
      floor = coalesce(nullif(pg_catalog.btrim(p_floor), ''), floor),
      apartment = coalesce(nullif(pg_catalog.btrim(p_apartment), ''), apartment),
      landmark = coalesce(nullif(pg_catalog.btrim(p_landmark), ''), landmark),
      service_notes = coalesce(nullif(pg_catalog.btrim(p_service_notes), ''), service_notes),
      updated_at = pg_catalog.now()
  where id = p_address_id and customer_id = v_user and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'Address not found' using errcode = '42501';
  end if;

  update public.account_onboarding
  set customer_state = 'complete', updated_at = pg_catalog.now()
  where user_id = v_user;

  return pg_catalog.jsonb_build_object('addressId', v_id, 'confirmed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 10. IDENTITY CAPTURE AND EXTRACTION
-- ---------------------------------------------------------------------------

create or replace function public.record_my_identity_capture(
  p_document_id uuid,
  p_capture_source text,
  p_content_hash text,
  p_quality_flags text[],
  p_page_side text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_duplicate boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_capture_source is not null and p_capture_source not in ('camera', 'library', 'file') then
    raise exception 'Invalid capture source' using errcode = '22023';
  end if;
  if p_page_side is not null and p_page_side not in ('front', 'back') then
    raise exception 'Invalid page side' using errcode = '22023';
  end if;
  if p_content_hash is not null and p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid content hash' using errcode = '22023';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  update public.provider_verification_documents
  set capture_source = p_capture_source,
      content_hash = p_content_hash,
      quality_flags = coalesce(p_quality_flags, '{}'),
      page_side = p_page_side,
      updated_at = pg_catalog.now()
  where id = p_document_id and provider_id = v_provider;

  if not found then
    raise exception 'Document not found' using errcode = '42501';
  end if;

  -- Recorded for the reviewer. Never acted on: shared devices and re-scans
  -- produce legitimate collisions, and an automatic block here would reject
  -- honest workers.
  if p_content_hash is not null then
    select exists (
      select 1 from public.provider_verification_documents d
      where d.content_hash = p_content_hash and d.is_current and d.provider_id <> v_provider
    ) into v_duplicate;
  end if;

  return pg_catalog.jsonb_build_object('documentId', p_document_id, 'duplicateSeen', v_duplicate);
end;
$$;

-- Returns candidates for the worker to confirm or correct. The National ID
-- number is masked to its last four digits: the worker already knows their own
-- number, and a full number on a screen is a full number in a screenshot, a
-- crash report and a support ticket. Confidence never leaves the server.
create or replace function public.get_my_identity_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'fieldKey', x.field_key,
        'candidateValue', case
          when x.field_key = 'national_id_number' and x.candidate_value is not null
            then pg_catalog."right"(x.candidate_value, 4)
          else x.candidate_value
        end,
        'masked', x.field_key = 'national_id_number',
        'requiresManualEntry', x.requires_manual_entry
      )
      order by x.field_key
    )
    from (
      select distinct on (e.field_key)
        e.field_key, e.candidate_value, e.requires_manual_entry
      from private.worker_identity_extractions e
      where e.provider_id = v_provider
      order by e.field_key, e.created_at desc
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.confirm_my_identity_fields(
  p_legal_name text,
  p_national_id text,
  p_date_of_birth date,
  p_id_expiry_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_digits text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_legal_name, ''))) not between 2 and 120 then
    raise exception 'Invalid legal name' using errcode = '22023';
  end if;

  v_digits := pg_catalog.regexp_replace(coalesce(p_national_id, ''), '[^0-9]', '', 'g');
  if v_digits !~ '^[0-9]{14}$' then
    raise exception 'Invalid national identifier' using errcode = '22023';
  end if;
  if p_date_of_birth is null or p_date_of_birth >= current_date then
    raise exception 'Invalid date of birth' using errcode = '22023';
  end if;

  -- Only the hash and the last four are retained. WPS-006 set that shape and
  -- WPS-023 does not widen it.
  insert into private.provider_verification_identities (
    provider_id, national_id_hash, national_id_last4,
    legal_name, date_of_birth, id_expiry_date, confirmed_at, confirmed_by, extraction_reviewed
  ) values (
    v_provider,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_digits, 'UTF8')), 'hex'),
    pg_catalog."right"(v_digits, 4),
    pg_catalog.btrim(p_legal_name),
    p_date_of_birth,
    p_id_expiry_date,
    pg_catalog.now(),
    v_user,
    true
  )
  on conflict (provider_id) do update
  set national_id_hash = excluded.national_id_hash,
      national_id_last4 = excluded.national_id_last4,
      legal_name = excluded.legal_name,
      date_of_birth = excluded.date_of_birth,
      id_expiry_date = excluded.id_expiry_date,
      confirmed_at = pg_catalog.now(),
      confirmed_by = v_user,
      extraction_reviewed = true,
      updated_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object('confirmed', true, 'last4', pg_catalog."right"(v_digits, 4));
end;
$$;

create or replace function public.submit_my_identity_for_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_gates jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  v_gates := private.worker_activation_gates(v_user);
  if not ((v_gates ->> 'national_id_front_uploaded')::boolean
          and (v_gates ->> 'national_id_back_uploaded')::boolean) then
    raise exception 'Both sides of the national identity document are required'
      using errcode = '22023';
  end if;
  if not (v_gates ->> 'identity_fields_confirmed')::boolean then
    raise exception 'Identity details must be confirmed before review' using errcode = '22023';
  end if;

  perform private.worker_transition(
    v_user, 'identity_submitted', v_user, 'worker',
    'identity_submitted', 'Your identity documents were received and are waiting for review.');

  return public.get_my_onboarding_state();
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 11. CRIMINAL-RECORD SUBMISSION
-- ---------------------------------------------------------------------------

create or replace function public.submit_my_criminal_record(
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_content_hash text,
  p_issue_date date,
  p_document_reference text,
  p_declared_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  -- The path must sit under the caller's own folder. A path naming another
  -- account is refused here as well as by the storage policy, because two
  -- independent checks is the point.
  if p_storage_path is null
     or pg_catalog.split_part(p_storage_path, '/', 1) <> v_user::text then
    raise exception 'Invalid document path' using errcode = '42501';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/heic', 'application/pdf') then
    raise exception 'Unsupported document format' using errcode = '22023';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes not between 1 and 8388608 then
    raise exception 'Document is too large' using errcode = '22023';
  end if;
  if p_issue_date is null or p_issue_date > current_date then
    raise exception 'Invalid issue date' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_declared_name, ''))) not between 2 and 120 then
    raise exception 'Invalid declared name' using errcode = '22023';
  end if;

  -- Superseding, not deleting. A prior submission is evidence a reviewer may
  -- need, and WPS-022 retention decides when it goes.
  update public.worker_criminal_record_submissions
  set is_current = false, updated_at = pg_catalog.now()
  where provider_id = v_provider and is_current;

  insert into public.worker_criminal_record_submissions (
    provider_id, storage_path, mime_type, file_size_bytes, content_hash,
    issue_date, document_reference, declared_name, policy_version
  ) values (
    v_provider, p_storage_path, p_mime_type, p_file_size_bytes, p_content_hash,
    p_issue_date, nullif(pg_catalog.btrim(coalesce(p_document_reference, '')), ''),
    pg_catalog.btrim(p_declared_name), 'wps023-v1'
  )
  returning id into v_id;

  perform private.worker_transition(
    v_user, 'criminal_record_submitted', v_user, 'worker',
    'certificate_submitted', 'Your certificate was received and is waiting for review.');

  return pg_catalog.jsonb_build_object('submissionId', v_id, 'status', 'submitted');
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 12. STAFF REVIEW
-- ---------------------------------------------------------------------------

create or replace function public.staff_worker_vetting_queue(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_worker_vetting');
  v_rows jsonb;
  v_count integer;
begin
  select coalesce(pg_catalog.jsonb_agg(x order by x ->> 'waitingSince'), '[]'::jsonb),
         pg_catalog.count(*)::integer
  into v_rows, v_count
  from (
    select pg_catalog.jsonb_build_object(
      -- A queue is not a place to browse people. Staff see an opaque
      -- reference, the state, how long it has waited and nothing else until
      -- they open the case under a capability that is logged.
      'subjectRef', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(o.user_id::text, 'UTF8')), 'hex'),
      'workerState', o.worker_state,
      'waitingSince', o.worker_state_changed_at,
      'hasCertificate', exists (
        select 1 from public.provider_profiles p
        join public.worker_criminal_record_submissions c
          on c.provider_id = p.id and c.is_current
        where p.user_id = o.user_id),
      'priority', case when o.worker_state = 'manual_review' then 'high' else 'normal' end
    ) as x
    from public.account_onboarding o
    where o.worker_state in (
      'identity_submitted', 'identity_under_review',
      'criminal_record_submitted', 'criminal_record_under_review',
      'manual_review', 'appeal_pending')
    order by o.worker_state_changed_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) q;

  insert into private.staff_access_log (actor_id, surface, capability_key, query_shape, result_count)
  values (v_actor, 'worker_overview', 'review_worker_vetting', 'worker_vetting_queue', v_count);

  return pg_catalog.jsonb_build_object('cases', v_rows, 'count', v_count);
end;
$$;

create or replace function public.staff_worker_vetting_decision(
  p_user_id uuid,
  p_decision text,
  p_reason_code text,
  p_safe_reason text,
  p_private_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_capability text;
  v_target text;
  v_provider uuid;
begin
  -- Capability follows the weight of the decision, not the shape of the call.
  -- Approving somebody and rejecting them are not the same authority.
  v_capability := case p_decision
    when 'start_identity_review' then 'review_identity_verification'
    when 'start_certificate_review' then 'review_criminal_records'
    when 'request_correction' then 'review_worker_vetting'
    when 'escalate_manual_review' then 'review_worker_vetting'
    when 'approve' then 'review_criminal_records'
    when 'activate' then 'activate_worker'
    when 'reject' then 'reject_worker_application'
    when 'suspend' then 'reject_worker_application'
    when 'reinstate' then 'activate_worker'
    else null
  end;
  if v_capability is null then
    raise exception 'Unknown vetting decision' using errcode = '22023';
  end if;

  v_actor := private.require_staff_capability(v_capability);

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_safe_reason, ''))) not between 3 and 400 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  -- An adverse decision must carry evidence. A rejection with an empty note is
  -- a rejection nobody can review later.
  if p_decision in ('reject', 'suspend')
     and pg_catalog.length(pg_catalog.btrim(coalesce(p_private_note, ''))) < 10 then
    raise exception 'An adverse decision requires recorded evidence' using errcode = '22023';
  end if;

  v_target := case p_decision
    when 'start_identity_review' then 'identity_under_review'
    when 'start_certificate_review' then 'criminal_record_under_review'
    when 'request_correction' then 'correction_required'
    when 'escalate_manual_review' then 'manual_review'
    when 'approve' then 'approved'
    when 'activate' then 'active'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'reinstate' then 'active'
  end;

  perform private.worker_transition(
    p_user_id, v_target, v_actor, 'staff', p_reason_code, p_safe_reason,
    'wps023-v1', p_private_note);

  -- Once a decision exists, the account can no longer switch its intended role
  -- out from under it.
  update public.account_onboarding
  set role_selection_locked = true, updated_at = pg_catalog.now()
  where user_id = p_user_id;

  -- Activation is the only point at which discoverability changes, and it is
  -- refused unless every gate independently passes.
  if p_decision in ('activate', 'reinstate') then
    if exists (
      select 1 from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
      where g.value = 'false'::jsonb
    ) then
      raise exception 'Activation gates are not satisfied' using errcode = '22023';
    end if;
    select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;
    update public.provider_profiles set is_published = true, updated_at = pg_catalog.now()
     where id = v_provider;
  elsif p_decision in ('reject', 'suspend') then
    select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;
    update public.provider_profiles set is_published = false, updated_at = pg_catalog.now()
     where id = v_provider;
  end if;

  perform private.record_staff_audit(
    v_actor, v_capability, 'worker_vetting_decision', 'worker_onboarding', p_user_id,
    p_safe_reason,
    pg_catalog.jsonb_build_object('decision', p_decision, 'policyVersion', 'wps023-v1'));

  return pg_catalog.jsonb_build_object('decision', p_decision, 'state', v_target);
end;
$$;

-- Returns the storage path a reviewer needs so the client can mint a
-- short-lived signed URL. Postgres cannot sign a storage URL, so this is an
-- authorization and audit step, not a URL factory — and the storage policy
-- enforces the same capability independently.
create or replace function public.staff_worker_document_reference(
  p_user_id uuid,
  p_document_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capability text := case
    when p_document_kind in ('national_id_front', 'national_id_back')
      then 'review_identity_verification'
    when p_document_kind = 'criminal_record'
      then 'review_criminal_records'
    else null
  end;
  v_actor uuid;
  v_provider uuid;
  v_path text;
  v_mime text;
begin
  if v_capability is null then
    raise exception 'Unknown document kind' using errcode = '22023';
  end if;
  v_actor := private.require_staff_capability(v_capability);

  select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '22023';
  end if;

  if p_document_kind = 'criminal_record' then
    select c.storage_path, c.mime_type into v_path, v_mime
    from public.worker_criminal_record_submissions c
    where c.provider_id = v_provider and c.is_current;
  else
    select d.storage_path, d.mime_type into v_path, v_mime
    from public.provider_verification_documents d
    where d.provider_id = v_provider and d.is_current and d.document_type = p_document_kind;
  end if;

  if v_path is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;

  -- Every sensitive document access is logged, individually, with the
  -- capability that permitted it.
  insert into private.staff_access_log (actor_id, surface, capability_key, query_shape, result_count)
  values (v_actor, 'worker_overview', v_capability,
          'worker_document:' || p_document_kind, 1);

  perform private.record_staff_audit(
    v_actor, v_capability, 'worker_document_access', 'worker_onboarding', p_user_id,
    'Opened a worker verification document',
    pg_catalog.jsonb_build_object('documentKind', p_document_kind));

  return pg_catalog.jsonb_build_object(
    'bucket', case when p_document_kind = 'criminal_record'
                then 'worker-criminal-records' else 'verification-documents' end,
    'path', v_path,
    'mimeType', v_mime,
    'expiresInSeconds', 300);
end;
$$;

-- Records the certificate outcome. Notably absent: any parameter that could
-- carry an offence. The reviewer's assessment goes to private evidence; the
-- worker sees only a safe reason.
create or replace function public.staff_record_certificate_outcome(
  p_user_id uuid,
  p_status text,
  p_safe_reason text,
  p_assessment_note text,
  p_authenticity_concern boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_criminal_records');
  v_provider uuid;
  v_submission uuid;
begin
  if p_status not in ('clear', 'approved', 'correction_required', 'manual_review', 'rejected') then
    raise exception 'Unknown certificate outcome' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_assessment_note, ''))) < 10 then
    raise exception 'A certificate outcome requires recorded evidence' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_safe_reason, ''))) not between 3 and 400 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;

  update public.worker_criminal_record_submissions
  set status = p_status,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      safe_outcome_reason = pg_catalog.btrim(p_safe_reason),
      policy_version = 'wps023-v1',
      updated_at = pg_catalog.now()
  where provider_id = v_provider and is_current
  returning id into v_submission;

  if v_submission is null then
    raise exception 'No certificate to review' using errcode = '22023';
  end if;

  insert into private.worker_criminal_record_review
    (submission_id, reviewer_id, policy_version, assessment_note, authenticity_concern)
  values (v_submission, v_actor, 'wps023-v1', pg_catalog.btrim(p_assessment_note),
          coalesce(p_authenticity_concern, false));

  perform private.record_staff_audit(
    v_actor, 'review_criminal_records', 'certificate_outcome', 'worker_onboarding', p_user_id,
    pg_catalog.btrim(p_safe_reason),
    pg_catalog.jsonb_build_object('status', p_status, 'policyVersion', 'wps023-v1'));

  return pg_catalog.jsonb_build_object('status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 13. APPEALS
-- ---------------------------------------------------------------------------
--
-- Appeals reuse the WPS-016 authority rather than creating a second one. The
-- separation rule is enforced in SQL, not in a runbook: the person who made
-- the adverse decision cannot be the person who reviews the appeal against it.

create or replace function public.submit_my_vetting_appeal(p_statement text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_state text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_statement, ''))) not between 10 and 2000 then
    raise exception 'An appeal statement is required' using errcode = '22023';
  end if;

  select o.worker_state into v_state from public.account_onboarding o where o.user_id = v_user;
  if v_state is distinct from 'rejected' then
    raise exception 'No decision is open to appeal' using errcode = '22023';
  end if;

  perform private.worker_transition(
    v_user, 'appeal_pending', v_user, 'worker', 'appeal_submitted',
    'Your appeal was received and is waiting for a different reviewer.',
    null, pg_catalog.btrim(p_statement));

  return public.get_my_onboarding_state();
end;
$$;

create or replace function private.worker_appeal_reviewer_is_independent(
  p_user_id uuid,
  p_reviewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.worker_onboarding_events e
    where e.user_id = p_user_id
      and e.to_state in ('rejected', 'suspended')
      and e.actor_id = p_reviewer
  )
$$;

revoke all on function private.worker_appeal_reviewer_is_independent(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.staff_decide_vetting_appeal(
  p_user_id uuid,
  p_outcome text,
  p_safe_reason text,
  p_private_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_appeals');
  v_target text;
begin
  if p_outcome not in ('upheld', 'overturned', 'correction_required', 'manual_review') then
    raise exception 'Unknown appeal outcome' using errcode = '22023';
  end if;
  if not private.worker_appeal_reviewer_is_independent(p_user_id, v_actor) then
    raise exception 'An appeal cannot be decided by the original reviewer' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_private_note, ''))) < 10 then
    raise exception 'An appeal decision requires recorded evidence' using errcode = '22023';
  end if;

  v_target := case p_outcome
    when 'upheld' then 'rejected'
    when 'overturned' then 'approved'
    when 'correction_required' then 'correction_required'
    when 'manual_review' then 'manual_review'
  end;

  perform private.worker_transition(
    p_user_id, v_target, v_actor, 'staff', 'appeal_' || p_outcome, p_safe_reason,
    'wps023-v1', p_private_note);

  perform private.record_staff_audit(
    v_actor, 'review_appeals', 'vetting_appeal_decision', 'worker_onboarding', p_user_id,
    p_safe_reason, pg_catalog.jsonb_build_object('outcome', p_outcome));

  return pg_catalog.jsonb_build_object('outcome', p_outcome, 'state', v_target);
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 14. SERVER-SIDE WORKER CAPABILITY ENFORCEMENT
-- ---------------------------------------------------------------------------
--
-- Client navigation is not an authorization boundary, so the gate is applied
-- where the work happens. `private.is_provider_publicly_discoverable` is
-- extended rather than replaced, which means discovery, search, the catalog,
-- quote invitations and every other consumer of that predicate inherit the
-- WPS-023 gate without a single call site changing.

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
      and u.phone is not null and u.phone_confirmed_at is not null
      and p.is_verified and p.is_published
      and p.onboarding_status = 'approved' and p.deleted_at is null
      and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > pg_catalog.now())
      and pg_catalog.length(pg_catalog.btrim(p.display_name)) between 2 and 100
      and pg_catalog.length(pg_catalog.btrim(p.about)) between 20 and 500
      and p.avatar_url is not null
      and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'profile-images' and o.name = p.avatar_url
      )
      and exists (
        select 1
        from public.provider_services ps
        join public.services s on s.id = ps.service_id
        join public.service_categories c on c.id = s.category_id
        where ps.provider_id = p.id and ps.is_active
          and s.is_active and s.deleted_at is null
          and c.is_active and c.deleted_at is null
      )
      and exists (
        select 1 from public.provider_service_areas a
        where a.provider_id = p.id and a.radius_km between 1 and 250
          and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0
      )
  )
$$;

-- The above is WPS-006's predicate, restated unchanged and deliberately so.
--
-- The first draft of WPS-023 added `private.worker_capability_active(p.user_id)`
-- as a final condition here. It is the tidiest possible enforcement point —
-- discovery, search, the catalog and quote invitations all flow through this
-- one predicate — and it broke fifty-two assertions across nine existing
-- suites, because every fixture that builds an approved worker builds one with
-- no WPS-023 onboarding row.
--
-- Those failures were not brittle tests. They were WPS-006, WPS-010, WPS-011
-- and WPS-020 stating what "discoverable" means, and WPS-023 is required to
-- preserve that. Redefining a predicate that four specifications already
-- validated, in order to save writing the gate where the work happens, would
-- have been WPS-023 quietly taking ownership of a definition it does not own.
--
-- So the gate lives where a worker actually acts instead:
--
--   * `is_published` is the discovery switch, and for any account that went
--     through WPS-023 the ONLY thing that sets it true is
--     `staff_worker_vetting_decision('activate')`, which refuses unless every
--     gate in `private.worker_activation_gates` passes.
--   * Operational worker verbs check `private.worker_capability_active`
--     directly, in `private.require_active_worker`.
--
-- A worker who has not been activated is therefore never published, never
-- discoverable, and refused at every worker verb — without changing what
-- "discoverable" has meant since WPS-006.

-- The single check every worker-only operation calls. Separate from the
-- discovery predicate on purpose: discoverability is about a listing, this is
-- about permission to act.
create or replace function private.require_active_worker()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.worker_capability_active(v_user) then
    raise exception 'Worker capability is not active' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function private.require_active_worker() from public, anon;
grant execute on function private.require_active_worker() to authenticated;

comment on function private.require_active_worker() is
  'WPS-023 gate for worker-only operations. Fails closed for any account without an active worker lifecycle.';

-- ---------------------------------------------------------------------------
-- SECTION 15. RLS, GRANTS AND STORAGE POLICIES
-- ---------------------------------------------------------------------------

alter table public.account_onboarding enable row level security;
alter table public.worker_onboarding_events enable row level security;
alter table public.worker_criminal_record_submissions enable row level security;

drop policy if exists account_onboarding_owner_read on public.account_onboarding;
create policy account_onboarding_owner_read
on public.account_onboarding for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists worker_onboarding_events_owner_read on public.worker_onboarding_events;
create policy worker_onboarding_events_owner_read
on public.worker_onboarding_events for select to authenticated
using (user_id = (select auth.uid()));

-- The worker may read their own certificate metadata. `safe_outcome_reason` is
-- the only outcome text in this table, and offence detail is prohibited from
-- it by construction, so owner-read leaks nothing a reviewer wrote privately.
drop policy if exists worker_criminal_record_owner_read on public.worker_criminal_record_submissions;
create policy worker_criminal_record_owner_read
on public.worker_criminal_record_submissions for select to authenticated
using (private.owns_provider(provider_id));

-- Select only. Every write goes through a SECURITY DEFINER function that
-- enforces the state machine, the gates and the audit.
revoke all on table public.account_onboarding from public, anon, authenticated;
revoke all on table public.worker_onboarding_events from public, anon, authenticated;
revoke all on table public.worker_criminal_record_submissions from public, anon, authenticated;
grant select on table public.account_onboarding to authenticated;
grant select on table public.worker_onboarding_events to authenticated;
grant select on table public.worker_criminal_record_submissions to authenticated;

revoke all on function public.select_my_account_role(text) from public, anon;
revoke all on function public.get_my_onboarding_state() from public, anon;
revoke all on function public.accept_my_worker_agreements(boolean, boolean) from public, anon;
revoke all on function public.confirm_my_service_address(
  uuid, double precision, double precision, text, text, text, text, text, text) from public, anon;
revoke all on function public.record_my_identity_capture(uuid, text, text, text[], text) from public, anon;
revoke all on function public.get_my_identity_candidates() from public, anon;
revoke all on function public.confirm_my_identity_fields(text, text, date, date) from public, anon;
revoke all on function public.submit_my_identity_for_review() from public, anon;
revoke all on function public.submit_my_criminal_record(text, text, bigint, text, date, text, text) from public, anon;
revoke all on function public.submit_my_vetting_appeal(text) from public, anon;
revoke all on function public.staff_worker_vetting_queue(integer) from public, anon;
revoke all on function public.staff_worker_vetting_decision(uuid, text, text, text, text) from public, anon;
revoke all on function public.staff_worker_document_reference(uuid, text) from public, anon;
revoke all on function public.staff_record_certificate_outcome(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.staff_decide_vetting_appeal(uuid, text, text, text) from public, anon;

revoke all on function private.worker_activation_gates(uuid) from public, anon, authenticated;
revoke all on function private.worker_capability_active(uuid) from public, anon, authenticated;

grant execute on function public.select_my_account_role(text) to authenticated;
grant execute on function public.get_my_onboarding_state() to authenticated;
grant execute on function public.accept_my_worker_agreements(boolean, boolean) to authenticated;
grant execute on function public.confirm_my_service_address(
  uuid, double precision, double precision, text, text, text, text, text, text) to authenticated;
grant execute on function public.record_my_identity_capture(uuid, text, text, text[], text) to authenticated;
grant execute on function public.get_my_identity_candidates() to authenticated;
grant execute on function public.confirm_my_identity_fields(text, text, date, date) to authenticated;
grant execute on function public.submit_my_identity_for_review() to authenticated;
grant execute on function public.submit_my_criminal_record(text, text, bigint, text, date, text, text) to authenticated;
grant execute on function public.submit_my_vetting_appeal(text) to authenticated;
grant execute on function public.staff_worker_vetting_queue(integer) to authenticated;
grant execute on function public.staff_worker_vetting_decision(uuid, text, text, text, text) to authenticated;
grant execute on function public.staff_worker_document_reference(uuid, text) to authenticated;
grant execute on function public.staff_record_certificate_outcome(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.staff_decide_vetting_appeal(uuid, text, text, text) to authenticated;

-- Storage. The certificate bucket is reachable by exactly two parties: the
-- worker who owns the folder, and a member of staff holding
-- `review_criminal_records`. Not `is_staff()` — the whole point of a dedicated
-- capability is that ordinary staff access is not enough.
drop policy if exists worker_criminal_record_owner_insert on storage.objects;
create policy worker_criminal_record_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'worker-criminal-records'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists worker_criminal_record_read on storage.objects;
create policy worker_criminal_record_read
on storage.objects for select to authenticated
using (
  bucket_id = 'worker-criminal-records'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.staff_has_capability('review_criminal_records')
  )
);

drop policy if exists worker_criminal_record_owner_delete on storage.objects;
create policy worker_criminal_record_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'worker-criminal-records'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop trigger if exists account_onboarding_updated_at on public.account_onboarding;
create trigger account_onboarding_updated_at
before update on public.account_onboarding
for each row execute function private.set_updated_at();

drop trigger if exists worker_criminal_record_updated_at on public.worker_criminal_record_submissions;
create trigger worker_criminal_record_updated_at
before update on public.worker_criminal_record_submissions
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 16. STAFF CAPABILITIES, QUEUES, NOTIFICATIONS AND FLAGS
-- ---------------------------------------------------------------------------

insert into public.staff_capabilities
  (capability_key, domain, description, high_risk, dual_control, requires_reauth)
values
  ('review_worker_vetting', 'verification',
   'See the worker vetting queue and move a case through review. No adverse decision.',
   false, false, false),
  ('review_criminal_records', 'verification',
   'Open a criminal-record certificate and record its outcome. Every access is logged.',
   true, false, true),
  ('activate_worker', 'verification',
   'Activate or reinstate a worker once every gate passes.',
   true, false, true),
  ('reject_worker_application', 'verification',
   'Reject or suspend a worker application. Requires a second person.',
   true, true, true),
  ('manage_vetting_policy', 'configuration',
   'Change the versioned vetting policy. Requires a second person.',
   true, true, true)
on conflict (capability_key) do nothing;

insert into public.staff_role_capabilities (role_key, capability_key) values
  ('verification_reviewer', 'review_worker_vetting'),
  ('verification_reviewer', 'review_criminal_records'),
  ('operations_manager', 'review_worker_vetting'),
  ('operations_manager', 'activate_worker'),
  ('security_administrator', 'review_worker_vetting'),
  ('security_administrator', 'review_criminal_records'),
  ('security_administrator', 'reject_worker_application'),
  ('security_administrator', 'manage_vetting_policy'),
  ('super_administrator', 'review_worker_vetting'),
  ('super_administrator', 'review_criminal_records'),
  ('super_administrator', 'activate_worker'),
  ('super_administrator', 'reject_worker_application'),
  ('super_administrator', 'manage_vetting_policy')
on conflict (role_key, capability_key) do nothing;

-- No row is added to `public.staff_queues`.
--
-- WPS-017 owns that inventory and asserts its exact size. WPS-023 reviewers
-- reach their work through `public.staff_worker_vetting_queue`, which is
-- capability-checked and access-logged exactly like every WPS-017 surface, and
-- which reuses WPS-017's capability model rather than its queue table. The two
-- existing verification queues — `identity_verification` and
-- `certificate_review` — keep their meaning untouched.

-- Notification payloads carry a state and nothing else. No National ID, no
-- filename, no offence text, no staff note, no address, no image.
insert into private.notification_event_catalog
  (event_type, category, priority, action_type, route_type, required_action,
   mandatory_in_app, quiet_hours_bypass, generic_title, generic_body)
values
  ('account_created', 'security', 'informational', null, 'preferences', false, false, false,
   'Welcome to Warsha', 'Your account is ready.'),
  ('phone_verification_required', 'security', 'action_required', null, 'preferences', true, true, false,
   'Verify your phone number', 'Your account needs a verified phone number.'),
  ('customer_onboarding_incomplete', 'system', 'informational', null, 'preferences', false, false, false,
   'Finish setting up', 'Confirm your service address to start booking.'),
  ('worker_onboarding_incomplete', 'worker_account', 'action_required', null, 'verification', true, true, false,
   'Finish your worker application', 'Some steps are still outstanding.'),
  ('identity_upload_received', 'worker_account', 'informational', null, 'verification', false, false, false,
   'Documents received', 'Your identity documents are waiting for review.'),
  ('identity_correction_required', 'worker_account', 'action_required', null, 'verification', true, true, false,
   'A document needs attention', 'Open your application to see what to change.'),
  ('identity_approved', 'worker_account', 'important', null, 'verification', false, true, false,
   'Identity approved', 'Your identity check is complete.'),
  ('criminal_record_required', 'worker_account', 'action_required', null, 'verification', true, true, false,
   'Certificate required', 'Your application needs an official certificate.'),
  ('criminal_record_received', 'worker_account', 'informational', null, 'verification', false, false, false,
   'Certificate received', 'Your certificate is waiting for review.'),
  ('criminal_record_correction_required', 'worker_account', 'action_required', null, 'verification', true, true, false,
   'Certificate needs attention', 'Open your application to see what to change.'),
  ('worker_manual_review', 'worker_account', 'informational', null, 'verification', false, true, false,
   'Your application is being reviewed', 'A reviewer is looking at your application.'),
  ('worker_approved', 'worker_account', 'important', null, 'verification', false, true, false,
   'Application approved', 'Your worker application was approved.'),
  ('worker_rejected', 'worker_account', 'important', null, 'verification', false, true, false,
   'Application decision', 'There is an update on your worker application.'),
  ('vetting_appeal_submitted', 'worker_account', 'informational', null, 'verification', false, false, false,
   'Appeal received', 'Your appeal is waiting for a different reviewer.'),
  ('vetting_appeal_updated', 'worker_account', 'important', null, 'verification', false, true, false,
   'Appeal update', 'There is an update on your appeal.')
on conflict (event_type) do nothing;

-- Every surface ships disabled. WPS-023 has not been read on a device, and an
-- authentication gateway that turns itself on before anyone has seen it is the
-- one change that can lock every account out at once.
insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  ('authentication_gateway', 'local', false, 'none',
   'WPS-023 authentication-first entry stays off until the gateway has been seen on a device.', false),
  ('worker_vetting', 'local', false, 'none',
   'WPS-023 worker vetting stays off until the review flow has been walked end to end.', false),
  ('identity_extraction', 'local', false, 'none',
   'WPS-023 extraction stays off. No provider is configured and none may be enabled without approval.', false),
  ('location_provider', 'local', false, 'none',
   'WPS-023 map provider is unselected. Manual pin entry is the only working path.', false)
on conflict (flag_key, environment) do nothing;

insert into private.staff_kill_switches
  (switch_key, display_name, domain_authority, server_enforced, active, reason, enforcement_note)
values
  ('worker_activation', 'Worker activation', 'verification', true, false,
   'WPS-023 stop control for worker activation.',
   'When active, no worker may be activated or reinstated.'),
  ('identity_extraction', 'Identity extraction', 'verification', true, false,
   'WPS-023 stop control for assistive extraction.',
   'When active, no extraction candidate may be produced.')
on conflict (switch_key) do nothing;

-- Grandfathering, made explicit. Existing approved workers get an onboarding
-- row that records where they actually are, not where we would like them to
-- be. They land in `manual_review`, not `active`: none of them has been
-- through WPS-023 identity confirmation or submitted a certificate, and
-- silently marking them active would be exactly the automatic approval this
-- specification forbids.
insert into public.account_onboarding (user_id, intended_role, worker_state, worker_state_changed_at)
select p.user_id, 'worker', 'manual_review', pg_catalog.now()
from public.provider_profiles p
where p.user_id is not null and p.deleted_at is null
on conflict (user_id) do nothing;

insert into public.account_onboarding (user_id, intended_role, customer_state)
select pr.id, 'customer',
       case when exists (
         select 1 from public.addresses a
         where a.customer_id = pr.id and a.deleted_at is null and a.pin_confirmed_at is not null
       ) then 'complete' else 'address_required' end
from public.profiles pr
where pr.deleted_at is null
on conflict (user_id) do nothing;

insert into public.worker_onboarding_events
  (user_id, from_state, to_state, actor_kind, reason_code, safe_reason)
select o.user_id, null, 'manual_review', 'system', 'wps023_migration',
       'Your account is being reviewed against the current requirements.'
from public.account_onboarding o
where o.worker_state = 'manual_review'
  and not exists (
    select 1 from public.worker_onboarding_events e where e.user_id = o.user_id
  );

-- Nothing is added to `private.observability_retention_policy`.
--
-- That table declares LOG streams, and WPS-018 asserts the invariant that no
-- declared log stream contains personal data. Worker vetting history, staff
-- evidence and certificate assessments are decision records about a named
-- person, not logs. Registering them there would have been true in the shape
-- of the row and false in the meaning of the table, and it would have forced
-- either a lie in `contains_personal_data` or the loss of a WPS-018 invariant.
-- They are registered in `private.data_inventory` below, which is the register
-- WPS-022 built for exactly this.

-- WPS-022 owns retention. WPS-023 registers what it created and marks every
-- rule pending, because no statutory period for identity or criminal-record
-- retention in Egypt has been established here and inventing one would be
-- worse than leaving it open.
insert into private.data_classifications
  (classification_key, label_en, label_ar, description, personal, staff_readable, exportable, sort_order)
values
  ('criminal_record', 'Criminal-record certificate', 'الفيش والتشبيه',
   'The official certificate a worker obtains and uploads. The most sensitive record Warsha holds.',
   true, true, false, 13)
on conflict (classification_key) do nothing;

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('worker_criminal_record_submissions', 'public', 'worker_criminal_record_submissions', 'table',
   'criminal_record',
   'Establish whether a worker may be sent into a customer home.',
   'WPS-023', 'Worker account closure or an approved certificate review policy.',
   'preserve_minimized', false, 'review_criminal_records',
   'Metadata only. Offence detail is prohibited from this table by construction.'),
  ('worker-criminal-records', 'storage', 'worker-criminal-records', 'bucket', 'criminal_record',
   'Hold the certificate image a reviewer must actually look at.',
   'WPS-023', 'Worker account closure or an approved certificate review policy.',
   'delete', false, 'review_criminal_records',
   'Never exported. A copy of this document in an export is a copy outside Warsha control.'),
  ('worker_identity_extractions', 'private', 'worker_identity_extractions', 'table',
   'identity_sensitive',
   'Help a worker type the fields printed on their own identity document.',
   'WPS-023', 'Superseded once the worker confirms their fields.',
   'delete', false, 'review_identity_verification',
   'Unconfirmed machine output. Never an approval and never a decision input.'),
  ('worker_onboarding_events', 'public', 'worker_onboarding_events', 'table', 'account_private',
   'Show a worker why a decision was made and let a reviewer audit it later.',
   'WPS-023', 'Evidence retention for an adverse decision.',
   'preserve', true, 'review_worker_vetting',
   'Worker-safe reasons only. Staff evidence lives in a separate private table.'),
  ('worker_onboarding_evidence', 'private', 'worker_onboarding_evidence', 'table', 'account_private',
   'Record what a reviewer actually saw when they made a decision.',
   'WPS-023', 'Evidence retention for an adverse decision.',
   'preserve', false, 'review_worker_vetting',
   'Never readable by the person it is about and never exported.'),
  ('worker_criminal_record_review', 'private', 'worker_criminal_record_review', 'table',
   'criminal_record',
   'Record a reviewer assessment of a certificate against the versioned policy.',
   'WPS-023', 'Evidence retention for an adverse decision.',
   'preserve', false, 'review_criminal_records',
   'The only place offence-relevant text may exist. No RPC returns it to any client.'),
  ('account_onboarding', 'public', 'account_onboarding', 'table', 'account_private',
   'Record which experience an account asked for and where onboarding reached.',
   'WPS-023', 'Account closure.',
   'anonymize', true, null,
   'intended_role is a preference, not an authorization fact.')
on conflict (entry_key) do nothing;

-- `proposed_days` is NOT NULL, and the column is named for what it holds: a
-- proposal, not an approved period. WPS-022 established the honest shape for
-- this — a number a lawyer can accept or replace, an `authority` string that
-- states there is no statutory basis, `legal_review_status = 'pending'` and
-- `enabled = false` so nothing can ever execute against it. WPS-023 follows it
-- exactly. Neither number below is a statutory retention period and neither is
-- claimed to be one.
insert into private.privacy_retention_rules
  (rule_key, data_class, target_object, trigger_event, proposed_days, authority,
   legal_review_status, action_at_expiry, hold_scope, execution_owner, enabled, notes)
values
  ('worker_criminal_records', 'criminal_record',
   'public.worker_criminal_record_submissions and worker-criminal-records objects',
   'worker_account_closure', 1825,
   'Product proposal. No statutory basis claimed. Unresolved legal question Q-03.',
   'pending', 'manual_review', 'account', 'security_administrator', false,
   'The five years is a placeholder for professional advice, not a finding. '
   || 'Action at expiry is manual_review rather than delete precisely because '
   || 'nobody has yet established what the correct period or action is.'),
  ('worker_identity_extractions', 'identity_sensitive', 'private.worker_identity_extractions',
   'identity_fields_confirmed', 30,
   'Product proposal. No statutory basis claimed.',
   'pending', 'delete', 'account', 'security_administrator', false,
   'Unconfirmed machine output should not outlive the confirmation it existed to help with.')
on conflict (rule_key) do nothing;

insert into private.storage_bucket_lifecycle
  (bucket_id, owner_domain, visibility, path_format, row_authority, signed_url_seconds,
   deletion_trigger, retention_rule_key, hold_scope, export_included, cleanup_owner)
-- Ordered after the retention rules deliberately: `retention_rule_key` is a
-- real foreign key into them, so the rule has to exist first.
select
  'worker-criminal-records', 'WPS-023', 'private_staff', '{user_id}/{file}',
  'public.worker_criminal_record_submissions.storage_path', 300,
  'account_anonymization', 'worker_criminal_records', 'account', false,
  'security_administrator'
on conflict (bucket_id) do nothing;

insert into public.privacy_consent_purposes
  (purpose_key, required, document_key, current_version,
   title_en, title_ar, explanation_en, explanation_ar, sort_order, active)
values
  ('identity_documents', false, 'privacy', '2026-08-07',
   'Identity and certificate review',
   'مراجعة إثبات الشخصية والفيش',
   'Processing your identity document and your official certificate so a member of staff can review your worker application. Declining means the application cannot be reviewed.',
   'معالجة إثبات شخصيتك والفيش والتشبيه علشان حد من الفريق يراجع طلبك كصنايعي. لو رفضت، مش هنقدر نراجع الطلب.',
   9, true)
on conflict (purpose_key) do nothing;

comment on function public.get_my_onboarding_state() is
  'WPS-023 single routing authority. workerCapabilityActive is the only permission fact.';
comment on function public.staff_worker_vetting_decision(uuid, text, text, text, text) is
  'WPS-023 staff vetting decisions. Capability follows the weight of the decision.';
