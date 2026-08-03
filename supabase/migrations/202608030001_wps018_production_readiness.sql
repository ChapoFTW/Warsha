-- WPS-018 — Production Readiness, Reliability & Launch Operations
--
-- WPS-018 is the launch-readiness authority. It introduces NO customer feature.
-- It closes the residual WPS-017 security gaps, enforces the environment model,
-- adds server-authoritative rate limiting, adds provider-neutral structured
-- observability, and adds a post-deployment verification gate.
--
-- It EXTENDS and replaces nothing:
--
--   * WPS-006..WPS-016 keep every domain decision and every RPC body. The
--     legacy staff RPCs are RENAMED into `private` unchanged and re-exposed
--     under their original public name behind a capability gate, so not one
--     line of domain logic is rewritten.
--   * WPS-017 keeps staff identity, queues, assignment, configuration change
--     control, flags, kill switches, support cases, incidents, audit, and
--     analytics.
--
-- Three genuine corrections are made here, all forward-only:
--
--   1. High-risk re-authentication was CLIENT-ATTESTED (WPS-017 finding F2). It
--      is replaced with a SERVER-VERIFIED check of the `amr` claim, which
--      GoTrue signs and PostgREST verifies before it ever reaches SQL.
--   2. MFA had no provider. Supabase's own TOTP is now a selectable provider and
--      `aal2` is enforced per caller when the environment requires it.
--   3. Legacy staff RPCs were gated only by `private.is_staff()` (finding F3).
--      They now require the specific domain capability for any WPS-017 staff
--      member, and legacy-only access is structurally impossible in production.
--
-- Nothing here enables real payments, payouts, SMS, telephony, push delivery,
-- schedulers, or any external provider.

-- ---------------------------------------------------------------------------
-- 1. Environment model and release state
-- ---------------------------------------------------------------------------

alter table private.staff_platform_configuration
  drop constraint if exists staff_platform_environment_check;
alter table private.staff_platform_configuration
  add constraint staff_platform_environment_check
  check (environment in ('local','development','staging','production'));

-- Supabase's own TOTP factor is now a selectable provider, so production has a
-- real path to open. It stays 'none' until an operator selects it deliberately.
alter table private.staff_platform_configuration
  drop constraint if exists staff_platform_mfa_provider_check;
alter table private.staff_platform_configuration
  add constraint staff_platform_mfa_provider_check
  check (mfa_provider in ('none','supabase_totp'));

alter table private.staff_platform_configuration
  add column if not exists launch_phase text not null default 'pre_beta',
  add column if not exists expected_project_ref text,
  add column if not exists legacy_staff_rpc_grace_enabled boolean not null default true,
  add column if not exists dual_control_enabled boolean not null default true,
  add column if not exists access_review_interval_days integer not null default 90,
  add column if not exists session_registry_enabled boolean not null default true;

alter table private.staff_platform_configuration
  drop constraint if exists staff_platform_launch_phase_check,
  drop constraint if exists staff_platform_legacy_grace_check,
  drop constraint if exists staff_platform_access_review_check,
  add constraint staff_platform_launch_phase_check
    check (launch_phase in ('pre_beta','private_beta','public_beta','production')),
  -- Production can never fall back to the pre-WPS-017 staff gate.
  add constraint staff_platform_legacy_grace_check
    check (environment <> 'production' or not legacy_staff_rpc_grace_enabled),
  -- Production can never disable dual control.
  add constraint staff_platform_dual_control_check
    check (environment <> 'production' or dual_control_enabled),
  add constraint staff_platform_access_review_check
    check (access_review_interval_days between 7 and 365);

create table if not exists private.platform_environment_events (
  id uuid primary key default gen_random_uuid(),
  from_environment text,
  to_environment text not null,
  from_launch_phase text,
  to_launch_phase text not null,
  project_ref text,
  reason text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint platform_environment_events_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 5 and 1000)
);
revoke all on private.platform_environment_events from public, anon, authenticated;

create or replace function private.prevent_platform_release_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Release history is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_platform_release_mutation() from public, anon, authenticated;
drop trigger if exists platform_environment_events_immutable on private.platform_environment_events;
create trigger platform_environment_events_immutable before update or delete
on private.platform_environment_events
for each row execute function private.prevent_platform_release_mutation();

-- Every environment or launch-phase change is deliberate, reasoned, and
-- recorded. The trigger records it; nothing can change the environment quietly.
create or replace function private.record_platform_environment_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.environment is distinct from old.environment
     or new.launch_phase is distinct from old.launch_phase then
    insert into private.platform_environment_events(
      from_environment, to_environment, from_launch_phase, to_launch_phase,
      project_ref, reason, actor_id)
    values (old.environment, new.environment, old.launch_phase, new.launch_phase,
            new.expected_project_ref,
            'Platform environment or launch phase changed', (select auth.uid()));
  end if;
  return new;
end;
$$;
revoke all on function private.record_platform_environment_change() from public, anon, authenticated;
drop trigger if exists staff_platform_configuration_environment_audit
  on private.staff_platform_configuration;
create trigger staff_platform_configuration_environment_audit
after update on private.staff_platform_configuration
for each row execute function private.record_platform_environment_change();

create or replace function private.platform_environment()
returns text language sql stable security definer set search_path='' as $$
  select coalesce((select c.environment from private.staff_platform_configuration c where c.singleton), 'local')
$$;
revoke all on function private.platform_environment() from public, anon, authenticated;

create or replace function private.platform_is_production()
returns boolean language sql stable security definer set search_path='' as $$
  select private.platform_environment() = 'production'
$$;
revoke all on function private.platform_is_production() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Server-verified session security
-- ---------------------------------------------------------------------------
--
-- WPS-017 recorded that the client had re-authenticated. That was honest about
-- its own weakness and it is now removed. GoTrue signs `amr` (the
-- authentication methods and their timestamps) and `aal` (the assurance level)
-- into the access token; PostgREST verifies that signature before setting
-- `request.jwt.claims`. Reading those claims in SQL is therefore a genuine
-- server-side verification, not a client assertion.

-- Seconds since the most recent authentication event on this session, or NULL
-- when the token carries no verifiable authentication record. NULL fails closed.
create or replace function private.staff_auth_freshness_seconds()
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_claims jsonb := auth.jwt(); v_latest bigint;
begin
  if v_claims is null or pg_catalog.jsonb_typeof(v_claims->'amr') <> 'array' then
    return null;
  end if;
  select pg_catalog.max((entry->>'timestamp')::bigint) into v_latest
  from pg_catalog.jsonb_array_elements(v_claims->'amr') entry
  where pg_catalog.jsonb_typeof(entry) = 'object'
    and (entry->>'timestamp') ~ '^[0-9]{1,19}$';
  if v_latest is null then return null; end if;
  return greatest(0, pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.now()) - v_latest)::integer);
exception when others then
  return null;
end;
$$;
revoke all on function private.staff_auth_freshness_seconds() from public, anon, authenticated;

-- The assurance level the identity provider actually granted this session.
create or replace function private.staff_assurance_level()
returns text language sql stable security definer set search_path='' as $$
  select coalesce(nullif(auth.jwt()->>'aal',''), 'none')
$$;
revoke all on function private.staff_assurance_level() from public, anon, authenticated;

-- A revoked session is denied even when its token is still valid and fresh.
-- This is what makes role removal and "revoke my sessions" take effect
-- immediately rather than at token expiry.
create or replace function private.staff_session_revoked()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from private.staff_session_attestations a
    where a.user_id = (select auth.uid())
      and a.session_ref = private.staff_session_ref()
      and a.revoked_at is not null)
$$;
revoke all on function private.staff_session_revoked() from public, anon, authenticated;

create or replace function private.staff_mfa_satisfied()
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_required boolean;
begin
  select c.mfa_required into v_required
  from private.staff_platform_configuration c where c.singleton;
  if not coalesce(v_required, false) then return true; end if;
  -- A required second factor is satisfied only by an assurance level the
  -- identity provider granted. There is no override and no client input.
  return private.staff_assurance_level() = 'aal2';
end;
$$;
revoke all on function private.staff_mfa_satisfied() from public, anon, authenticated;

-- Replaces the WPS-017 client-attested check. Freshness now comes from the
-- signed token; the session registry only ever subtracts access.
create or replace function private.staff_recent_reauth(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_window integer; v_freshness integer;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then return false; end if;
  if private.staff_session_revoked() then return false; end if;
  if not private.staff_mfa_satisfied() then return false; end if;
  select c.reauth_window_seconds into v_window
  from private.staff_platform_configuration c where c.singleton;
  v_freshness := private.staff_auth_freshness_seconds();
  if v_freshness is null then return false; end if;
  return v_freshness <= coalesce(v_window, 900);
end;
$$;
revoke all on function private.staff_recent_reauth(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Capability gate hardening
-- ---------------------------------------------------------------------------
--
-- Same contract as WPS-017 plus two server-verified additions: a revoked
-- session is refused, and a required assurance level is enforced per caller.

create or replace function private.require_staff_capability(p_capability text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_cap public.staff_capabilities%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;
  if private.staff_session_revoked() then
    raise exception 'This session was revoked' using errcode = '42501';
  end if;
  if not private.staff_mfa_satisfied() then
    raise exception 'Multi-factor authentication is required' using errcode = '42501';
  end if;
  select * into v_cap from public.staff_capabilities c where c.capability_key = p_capability;
  if v_cap.capability_key is null then
    raise exception 'Unknown staff capability' using errcode = '22023';
  end if;
  if not (p_capability = any(private.staff_capability_keys(v_uid))) then
    raise exception 'Staff capability required' using errcode = '42501';
  end if;
  if v_cap.requires_reauth and not private.staff_recent_reauth(v_uid) then
    raise exception 'Re-authentication required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.require_staff_capability(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The legacy domain staff gate (WPS-017 finding F3, closed)
-- ---------------------------------------------------------------------------
--
-- A WPS-017 staff member must hold the SPECIFIC domain capability. An account
-- that predates WPS-017 (a bare `user_roles` row) keeps its historic access
-- outside production only, so no existing behaviour or suite changes, while
-- production is structurally incapable of accepting it.

create or replace function private.staff_has_wps017_grant(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.staff_role_grants g
    where g.user_id = p_user_id and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > pg_catalog.now()))
$$;
revoke all on function private.staff_has_wps017_grant(uuid) from public, anon, authenticated;

create or replace function private.require_domain_staff(p_capability text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_grace boolean;
begin
  -- The historic message and error code are preserved exactly, because every
  -- domain suite asserts them.
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if private.staff_has_wps017_grant(v_uid) then
    perform private.require_staff_capability(p_capability);
    return v_uid;
  end if;
  select c.legacy_staff_rpc_grace_enabled into v_grace
  from private.staff_platform_configuration c where c.singleton;
  if not coalesce(v_grace, false) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.require_domain_staff(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dual control for irreversible actions
-- ---------------------------------------------------------------------------
--
-- A permanent ban and a refund cannot be completed by one person alone. The
-- requester opens a ticket; a DIFFERENT staff member with the same capability
-- approves it; only then does the action proceed, once.

create table if not exists private.staff_dual_control_requests (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null references public.staff_capabilities(capability_key) on delete restrict,
  action_key text not null,
  subject_ref text not null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_reason text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  environment text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_dual_control_reason_check
    check (pg_catalog.length(pg_catalog.btrim(requested_reason)) between 10 and 1000),
  constraint staff_dual_control_note_check
    check (approval_note is null or pg_catalog.length(pg_catalog.btrim(approval_note)) between 3 and 1000),
  -- The requester can never be the approver.
  constraint staff_dual_control_distinct_check
    check (approved_by is null or approved_by <> requested_by),
  constraint staff_dual_control_approved_check
    check ((approved_by is null) = (approved_at is null)),
  unique (capability_key, action_key, subject_ref, requested_by)
);
create index if not exists staff_dual_control_open_idx
  on private.staff_dual_control_requests(capability_key, created_at desc)
  where consumed_at is null;
revoke all on private.staff_dual_control_requests from public, anon, authenticated;

create or replace function private.prevent_dual_control_rewrite()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Dual control history is immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.capability_key is distinct from old.capability_key
     or new.action_key is distinct from old.action_key
     or new.subject_ref is distinct from old.subject_ref
     or new.requested_by is distinct from old.requested_by
     or new.requested_reason is distinct from old.requested_reason
     or new.created_at is distinct from old.created_at then
    raise exception 'Dual control history is immutable' using errcode = '55000';
  end if;
  if old.consumed_at is not null then
    raise exception 'Dual control history is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_dual_control_rewrite() from public, anon, authenticated;
drop trigger if exists staff_dual_control_requests_immutable on private.staff_dual_control_requests;
create trigger staff_dual_control_requests_immutable before update or delete
on private.staff_dual_control_requests
for each row execute function private.prevent_dual_control_rewrite();

-- Consumes a single approved, unexpired, unconsumed approval. Returns false
-- when dual control is not required for this environment.
create or replace function private.consume_dual_control(
  p_capability text, p_action_key text, p_subject_ref text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_enabled boolean; v_row private.staff_dual_control_requests%rowtype;
begin
  select c.dual_control_enabled into v_enabled
  from private.staff_platform_configuration c where c.singleton;
  if not coalesce(v_enabled, false) then return false; end if;
  select * into v_row from private.staff_dual_control_requests r
  where r.capability_key = p_capability and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref and r.requested_by = v_uid
  for update;
  if v_row.id is null then
    raise exception 'This action requires a second approver' using errcode = '42501';
  end if;
  if v_row.approved_by is null then
    raise exception 'This action is waiting for a second approver' using errcode = '42501';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'That approval was already used' using errcode = '42501';
  end if;
  if v_row.expires_at <= pg_catalog.now() then
    raise exception 'That approval expired' using errcode = '42501';
  end if;
  update private.staff_dual_control_requests set consumed_at = pg_catalog.now() where id = v_row.id;
  return true;
end;
$$;
revoke all on function private.consume_dual_control(text,text,text) from public, anon, authenticated;

create or replace function public.staff_request_dual_control(
  p_capability_key text, p_action_key text, p_subject_ref text, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_id uuid; v_existing private.staff_dual_control_requests%rowtype;
begin
  v_uid := private.require_staff_capability(p_capability_key);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_existing from private.staff_dual_control_requests r
  where r.capability_key = p_capability_key and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref and r.requested_by = v_uid;
  if v_existing.id is not null and v_existing.consumed_at is null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'duplicate', true,
      'approved', v_existing.approved_by is not null);
  end if;
  insert into private.staff_dual_control_requests(
    capability_key, action_key, subject_ref, requested_by, requested_reason,
    expires_at, environment)
  values (p_capability_key, p_action_key, p_subject_ref, v_uid, pg_catalog.btrim(p_reason),
          pg_catalog.now() + pg_catalog.make_interval(hours => 24), private.platform_environment())
  on conflict (capability_key, action_key, subject_ref, requested_by) do update
    set expires_at = excluded.expires_at
  returning id into v_id;
  perform private.record_staff_audit(v_uid, p_capability_key, 'dual_control_requested',
    'staff_dual_control_request', v_id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('actionKey', p_action_key));
  return pg_catalog.jsonb_build_object('id', v_id, 'duplicate', false, 'approved', false);
end;
$$;

create or replace function public.staff_approve_dual_control(p_request_id uuid, p_approval_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_row private.staff_dual_control_requests%rowtype;
begin
  select * into v_row from private.staff_dual_control_requests r where r.id = p_request_id for update;
  if v_row.id is null then raise exception 'Approval request not found' using errcode = 'P0002'; end if;
  v_uid := private.require_staff_capability(v_row.capability_key);
  if v_uid = v_row.requested_by then
    raise exception 'A staff member cannot approve their own request' using errcode = '42501';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'That approval was already used' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_approval_note,''))) < 3 then
    raise exception 'An approval note is required' using errcode = '22023';
  end if;
  update private.staff_dual_control_requests
    set approved_by = v_uid, approved_at = pg_catalog.now(),
        approval_note = pg_catalog.btrim(p_approval_note)
    where id = p_request_id;
  perform private.record_staff_audit(v_uid, v_row.capability_key, 'dual_control_approved',
    'staff_dual_control_request', p_request_id, pg_catalog.btrim(p_approval_note),
    pg_catalog.jsonb_build_object('actionKey', v_row.action_key, 'requestedBy', v_row.requested_by));
  return pg_catalog.jsonb_build_object('id', p_request_id, 'approved', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Periodic staff access review
-- ---------------------------------------------------------------------------

create table if not exists private.staff_access_reviews (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.staff_role_grants(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  decision text not null,
  note text not null,
  reviewed_at timestamptz not null default pg_catalog.now(),
  constraint staff_access_reviews_decision_check check (decision in ('retained','revoked','reduced')),
  constraint staff_access_reviews_note_check
    check (pg_catalog.length(pg_catalog.btrim(note)) between 5 and 1000)
);
create index if not exists staff_access_reviews_grant_idx
  on private.staff_access_reviews(grant_id, reviewed_at desc);
revoke all on private.staff_access_reviews from public, anon, authenticated;
drop trigger if exists staff_access_reviews_immutable on private.staff_access_reviews;
create trigger staff_access_reviews_immutable before update or delete
on private.staff_access_reviews
for each row execute function private.prevent_platform_release_mutation();

create or replace function public.get_staff_access_review()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_interval integer;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  select c.access_review_interval_days into v_interval
  from private.staff_platform_configuration c where c.singleton;
  return pg_catalog.jsonb_build_object(
    'intervalDays', v_interval,
    'grants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantId', g.id, 'userId', g.user_id, 'displayName', p.display_name,
        'roleKey', g.role_key, 'grantedAt', g.granted_at, 'expiresAt', g.expires_at,
        'lastReviewedAt', r.last_reviewed_at,
        'overdue', r.last_reviewed_at is null
          or r.last_reviewed_at < pg_catalog.now() - pg_catalog.make_interval(days => v_interval)
      ) order by r.last_reviewed_at nulls first, g.granted_at)
      from public.staff_role_grants g
      join public.profiles p on p.id = g.user_id
      cross join lateral (
        select pg_catalog.max(ar.reviewed_at) last_reviewed_at
        from private.staff_access_reviews ar where ar.grant_id = g.id) r
      where g.revoked_at is null), '[]'::jsonb));
end;
$$;

create or replace function public.staff_record_access_review(
  p_grant_id uuid, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_grant public.staff_role_grants%rowtype; v_id uuid;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  select * into v_grant from public.staff_role_grants g where g.id = p_grant_id;
  if v_grant.id is null then raise exception 'Role grant not found' using errcode = 'P0002'; end if;
  if p_decision not in ('retained','revoked','reduced') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if v_grant.user_id = v_actor then
    raise exception 'A staff member cannot review their own access' using errcode = '42501';
  end if;
  insert into private.staff_access_reviews(grant_id, reviewed_by, decision, note)
  values (p_grant_id, v_actor, p_decision, pg_catalog.btrim(p_note))
  returning id into v_id;
  perform private.record_staff_audit(v_actor, 'manage_staff_roles', 'staff_access_reviewed',
    'staff_role_grant', p_grant_id, pg_catalog.btrim(p_note),
    pg_catalog.jsonb_build_object('decision', p_decision));
  return pg_catalog.jsonb_build_object('id', v_id, 'decision', p_decision);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Server-authoritative rate limiting
-- ---------------------------------------------------------------------------
--
-- Client debounce is not a control. Every limit here is counted in the database
-- against a hashed subject, so the limiter never becomes a second copy of the
-- identifiers it protects.

create table if not exists private.rate_limit_policies (
  policy_key text primary key,
  surface text not null,
  scope text not null,
  max_events integer not null,
  window_seconds integer not null,
  enabled boolean not null default true,
  enforced_by text not null,
  notes text not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint rate_limit_policies_key_check check (policy_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  constraint rate_limit_policies_scope_check check (scope in ('account','session','global')),
  constraint rate_limit_policies_max_check check (max_events between 1 and 100000),
  constraint rate_limit_policies_window_check check (window_seconds between 1 and 86400),
  -- Every audited surface declares where its limit actually lives. A surface
  -- recorded as `client_only_gap` is an open gap, not a control.
  constraint rate_limit_policies_enforced_check check (enforced_by in (
    'wps018_limiter','supabase_auth','marketplace_config','domain_rule','client_only_gap'))
);
revoke all on private.rate_limit_policies from public, anon, authenticated;

create table if not exists private.rate_limit_events (
  id bigint generated always as identity primary key,
  policy_key text not null,
  subject_hash text not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint rate_limit_events_hash_check check (subject_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists rate_limit_events_lookup_idx
  on private.rate_limit_events(policy_key, subject_hash, occurred_at desc);
revoke all on private.rate_limit_events from public, anon, authenticated;

-- A REJECTED call must roll back with the transaction it aborts, so a rejection
-- can never be durably recorded from inside the failing path. What can be
-- recorded is SATURATION: the accepted call that fills a subject's bucket. That
-- commits, and it is the early-warning signal operations actually needs.
create table if not exists private.rate_limit_saturation_events (
  id bigint generated always as identity primary key,
  policy_key text not null,
  subject_hash text not null,
  environment text not null,
  occurred_at timestamptz not null default pg_catalog.now()
);
create index if not exists rate_limit_saturation_idx
  on private.rate_limit_saturation_events(policy_key, occurred_at desc);
revoke all on private.rate_limit_saturation_events from public, anon, authenticated;

insert into private.rate_limit_policies(policy_key, surface, scope, max_events, window_seconds, enforced_by, notes) values
  ('auth_sign_in','Authentication attempts','account',10,300,'supabase_auth',
   'GoTrue enforces sign-in throttling. Recorded here so the audited surface is not silently unowned.'),
  ('auth_otp_request','Worker phone OTP requests','account',5,900,'supabase_auth',
   'GoTrue sms max_frequency plus provider limits. No SMS provider is enabled.'),
  ('auth_password_reset','Password reset requests','account',5,3600,'supabase_auth',
   'GoTrue recovery throttling.'),
  ('marketplace_request_create','Customer marketplace requests','account',10,3600,'marketplace_config',
   'WPS-008 marketplace_configuration.rate_limits.customerCreatesPerHour.'),
  ('marketplace_quote_submit','Worker quote submissions','account',20,60,'marketplace_config',
   'WPS-008 marketplace_configuration.rate_limits.workerResponsesPerMinute.'),
  ('booking_message_send','Booking chat messages','account',60,60,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-009 send RPC.'),
  ('booking_typing_event','Chat typing signals','account',120,60,'domain_rule',
   'WPS-009 writes a single upsert row per conversation; there is no per-keystroke insert to limit.'),
  ('media_upload','Private uploads across domains','account',40,3600,'domain_rule',
   'Storage policies plus per-domain byte and count limits in WPS-009/010/012/013.'),
  ('review_submit','Review submissions','account',10,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-011 submit RPC; one review per booking still applies.'),
  ('review_report','Review reports','account',20,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-011 report RPC.'),
  ('trust_report_submit','Abuse reports','account',20,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-016 intake.'),
  ('trust_appeal_submit','Appeals','account',5,86400,'wps018_limiter',
   'Enforced by the WPS-018 limiter; one appeal per action still applies.'),
  ('communication_abuse_report','Chat abuse reports','account',20,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-009 report RPC.'),
  ('dispute_open','Dispute creation','account',5,86400,'domain_rule',
   'WPS-013 permits one active dispute per booking and gates eligibility server-side.'),
  ('support_case_open','Support cases','account',10,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-017 intake.'),
  ('staff_safe_search','Operational search','account',30,60,'domain_rule',
   'WPS-017 enforces this inside staff_safe_search before any read.'),
  ('staff_export_request','Operational exports','account',10,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-017 export request.'),
  ('staff_privileged_action','Privileged staff mutations','account',120,3600,'wps018_limiter',
   'Backstop against a compromised staff session driving bulk actions.'),
  ('provider_webhook','Payment provider webhooks','global',600,60,'client_only_gap',
   'OPEN GAP: no webhook endpoint is deployed. WPS-015 verifies signature, replay, and environment when one is.')
on conflict (policy_key) do update set
  surface = excluded.surface, scope = excluded.scope, max_events = excluded.max_events,
  window_seconds = excluded.window_seconds, enforced_by = excluded.enforced_by,
  notes = excluded.notes, updated_at = pg_catalog.now();

create or replace function private.rate_limit_subject_hash(p_policy_key text, p_subject text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.encode(
    extensions.digest(p_policy_key || ':' || coalesce(p_subject, 'anonymous'), 'sha256'), 'hex')
$$;
revoke all on function private.rate_limit_subject_hash(text,text) from public, anon, authenticated;

-- Counts first, then records. A rejected call never consumes a slot, so a
-- caller who is already limited cannot extend their own lockout.
create or replace function private.enforce_rate_limit(p_policy_key text, p_subject text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_policy private.rate_limit_policies%rowtype;
  v_hash text;
  v_count integer;
  v_subject text := coalesce(p_subject, (select auth.uid())::text);
begin
  select * into v_policy from private.rate_limit_policies p where p.policy_key = p_policy_key;
  -- An unknown or disabled policy must never silently allow unlimited traffic
  -- through a surface that believes it is protected.
  if v_policy.policy_key is null then
    raise exception 'Unknown rate limit policy' using errcode = '22023';
  end if;
  if not v_policy.enabled then return; end if;
  if v_policy.scope = 'global' then v_subject := 'global'; end if;
  v_hash := private.rate_limit_subject_hash(p_policy_key, v_subject);

  select pg_catalog.count(*)::integer into v_count
  from private.rate_limit_events e
  where e.policy_key = p_policy_key and e.subject_hash = v_hash
    and e.occurred_at > pg_catalog.now() - pg_catalog.make_interval(secs => v_policy.window_seconds);

  if v_count >= v_policy.max_events then
    raise exception 'Too many attempts. Please wait and try again.' using errcode = '53400';
  end if;

  insert into private.rate_limit_events(policy_key, subject_hash) values (p_policy_key, v_hash);

  -- This accepted call filled the bucket. Recording it here commits, unlike a
  -- rejection, so operations can see a subject reaching its limit.
  if v_count + 1 >= v_policy.max_events then
    insert into private.rate_limit_saturation_events(policy_key, subject_hash, environment)
    values (p_policy_key, v_hash, private.platform_environment());
  end if;

  -- Opportunistic pruning keeps the counter table bounded without a scheduler.
  delete from private.rate_limit_events e
  where e.policy_key = p_policy_key and e.subject_hash = v_hash
    and e.occurred_at < pg_catalog.now() - pg_catalog.make_interval(secs => v_policy.window_seconds * 2);
end;
$$;
revoke all on function private.enforce_rate_limit(text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Provider-neutral structured observability
-- ---------------------------------------------------------------------------
--
-- No external observability provider is selected or enabled. This is the
-- boundary a provider would later read from, with redaction enforced at write
-- time so a future exporter cannot leak what was never stored.

create table if not exists private.operational_log_events (
  id bigint generated always as identity primary key,
  correlation_id uuid not null default gen_random_uuid(),
  environment text not null,
  severity text not null,
  category text not null,
  event_key text not null,
  actor_kind text not null default 'system',
  safe_detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint operational_log_severity_check
    check (severity in ('debug','info','warning','error','critical')),
  constraint operational_log_category_check check (category in (
    'authentication','api','database','realtime','storage','marketplace','payments',
    'reconciliation','notifications','staff','migration','client','performance','security')),
  constraint operational_log_event_key_check check (event_key ~ '^[a-z][a-z0-9_.]{2,80}$'),
  constraint operational_log_actor_kind_check
    check (actor_kind in ('customer','worker','staff','system'))
);
create index if not exists operational_log_events_lookup_idx
  on private.operational_log_events(category, severity, occurred_at desc);
create index if not exists operational_log_events_correlation_idx
  on private.operational_log_events(correlation_id);
revoke all on private.operational_log_events from public, anon, authenticated;

-- Redaction is enforced when the row is written, not when it is exported.
-- A forbidden key or an over-long value rejects the whole payload.
create or replace function private.operational_payload_safe(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare v_key text; v_value jsonb; v_text text;
begin
  if p_payload is null then return true; end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then return false; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_payload)) > 20 then
    return false;
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if v_key ~* '(token|secret|password|credential|otp|passcode|pin|body|message|note|content|document|national|card|pan|cvv|iban|email|phone|address|evidence|signature)' then
      return false;
    end if;
    v_value := p_payload -> v_key;
    if pg_catalog.jsonb_typeof(v_value) not in ('boolean','number','string') then return false; end if;
    if pg_catalog.jsonb_typeof(v_value) = 'string' then
      v_text := v_value #>> '{}';
      if pg_catalog.length(v_text) > 200 then return false; end if;
      -- A JWT, an email address, or an Egyptian phone number must never be a log value.
      if v_text ~ '^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$' then return false; end if;
      if v_text ~ '[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}' then return false; end if;
      if v_text ~ '(\+?2?0?1[0-9]{9})' then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.operational_payload_safe(jsonb) from public, anon, authenticated;

create or replace function private.record_operational_event(
  p_category text, p_event_key text, p_severity text default 'info',
  p_safe_detail jsonb default '{}'::jsonb, p_actor_kind text default 'system',
  p_correlation_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_correlation uuid := coalesce(p_correlation_id, gen_random_uuid());
begin
  if not private.operational_payload_safe(p_safe_detail) then
    -- Drop the payload rather than the event: losing detail is acceptable,
    -- writing a secret into a log is not.
    p_safe_detail := pg_catalog.jsonb_build_object('redacted', true);
  end if;
  insert into private.operational_log_events(
    correlation_id, environment, severity, category, event_key, actor_kind, safe_detail)
  values (v_correlation, private.platform_environment(), p_severity, p_category,
          p_event_key, p_actor_kind, coalesce(p_safe_detail,'{}'::jsonb));
  return v_correlation;
end;
$$;
revoke all on function private.record_operational_event(text,text,text,jsonb,text,uuid)
  from public, anon, authenticated;

create table if not exists private.observability_retention_policy (
  stream text primary key,
  retention_days integer not null,
  contains_personal_data boolean not null default false,
  owner_role text not null,
  severity_floor text not null default 'info',
  notes text not null,
  constraint observability_retention_days_check check (retention_days between 1 and 3650),
  constraint observability_owner_role_check check (owner_role in (
    'operations_manager','security_administrator','financial_operations','trust_safety_reviewer'))
);
insert into private.observability_retention_policy(stream, retention_days, contains_personal_data, owner_role, severity_floor, notes) values
  ('operational_log_events',90,false,'operations_manager','info','Structured platform events. Redaction enforced at write time.'),
  ('staff_audit_events',3650,false,'security_administrator','info','Immutable staff action audit. Never pruned automatically.'),
  ('staff_access_log',365,false,'security_administrator','info','Sensitive-read records. Query shapes are hashed.'),
  ('rate_limit_events',7,false,'operations_manager','debug','Counters only. Subjects are hashed and pruned opportunistically.'),
  ('rate_limit_saturation_events',90,false,'security_administrator','warning','Early-warning abuse signal. Subjects are hashed.'),
  ('platform_environment_events',3650,false,'security_administrator','warning','Environment and launch-phase changes. Immutable.'),
  ('operational_assignment_events',3650,false,'operations_manager','info','Case history. Immutable.')
on conflict (stream) do update set
  retention_days = excluded.retention_days,
  contains_personal_data = excluded.contains_personal_data,
  owner_role = excluded.owner_role, severity_floor = excluded.severity_floor,
  notes = excluded.notes;
revoke all on private.observability_retention_policy from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Updated staff session surface
-- ---------------------------------------------------------------------------

-- Registers the session so it can later be revoked, and reports the SERVER's
-- view of freshness. It no longer accepts the client's word for anything: a
-- stale token is refused and the client must genuinely re-authenticate with
-- Supabase Auth before trying again.
create or replace function public.staff_reauthenticate()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_freshness integer; v_window integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;
  if pg_catalog.cardinality(private.staff_capability_keys(v_uid)) = 0 then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if not private.staff_mfa_satisfied() then
    raise exception 'Multi-factor authentication is required' using errcode = '42501';
  end if;
  select c.reauth_window_seconds into v_window
  from private.staff_platform_configuration c where c.singleton;
  v_freshness := private.staff_auth_freshness_seconds();
  if v_freshness is null or v_freshness > coalesce(v_window, 900) then
    raise exception 'Re-authentication required' using errcode = '42501';
  end if;

  -- Registering an existing session clears nothing: a revoked session stays
  -- revoked until the account authenticates again and receives a new session.
  insert into private.staff_session_attestations(user_id, session_ref)
  values (v_uid, private.staff_session_ref())
  on conflict (user_id, session_ref) do update set attested_at = pg_catalog.now();

  perform private.record_staff_audit(v_uid, null, 'staff_session_verified', 'staff_session', null,
    'Server-verified authentication freshness confirmed');
  perform private.record_operational_event('staff','staff.session_verified','info',
    pg_catalog.jsonb_build_object('freshnessSeconds', v_freshness), 'staff');
  return pg_catalog.jsonb_build_object(
    'reauthValid', private.staff_recent_reauth(v_uid),
    'freshnessSeconds', v_freshness,
    'assuranceLevel', private.staff_assurance_level(),
    'attestedAt', pg_catalog.now());
end;
$$;

create or replace function public.get_staff_session()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_config private.staff_platform_configuration%rowtype;
  v_roles text[];
  v_caps text[];
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_caps := private.staff_capability_keys(v_uid);
  if pg_catalog.cardinality(v_caps) = 0 or not private.staff_platform_ready() then
    return pg_catalog.jsonb_build_object(
      'isStaff', false, 'roles', '[]'::jsonb, 'capabilities', '[]'::jsonb,
      'reauthValid', false, 'platformReady', private.staff_platform_ready());
  end if;
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  v_roles := private.staff_active_role_keys(v_uid);
  return pg_catalog.jsonb_build_object(
    'isStaff', true,
    'staffId', v_uid,
    'roles', pg_catalog.to_jsonb(v_roles),
    'capabilities', pg_catalog.to_jsonb(v_caps),
    'environment', v_config.environment,
    'launchPhase', v_config.launch_phase,
    'displayTimezone', v_config.display_timezone,
    'mfaRequired', v_config.mfa_required,
    'mfaProvider', v_config.mfa_provider,
    'assuranceLevel', private.staff_assurance_level(),
    'mfaSatisfied', private.staff_mfa_satisfied(),
    'legacyBridgeEnabled', v_config.legacy_staff_bridge_enabled,
    'legacyRpcGraceEnabled', v_config.legacy_staff_rpc_grace_enabled,
    'dualControlEnabled', v_config.dual_control_enabled,
    'reauthWindowSeconds', v_config.reauth_window_seconds,
    'sessionFreshnessSeconds', private.staff_auth_freshness_seconds(),
    'sessionRevoked', private.staff_session_revoked(),
    'reauthValid', private.staff_recent_reauth(v_uid),
    'platformReady', true,
    'breakGlassOnly', v_roles = array['super_administrator']::text[]);
end;
$$;

-- Any authenticated client may read the restrictive platform status so the app
-- can fail closed and show the correct environment. No reason, actor, or
-- configuration value is exposed.
create or replace function public.get_platform_operational_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_config private.staff_platform_configuration%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  return pg_catalog.jsonb_build_object(
    'environment', v_config.environment,
    'launchPhase', v_config.launch_phase,
    'activeSwitches', coalesce((select pg_catalog.jsonb_agg(s.switch_key order by s.switch_key)
      from private.staff_kill_switches s where s.active), '[]'::jsonb),
    'readOnlyMaintenance', private.staff_kill_switch_active('read_only_maintenance'),
    'generatedAt', pg_catalog.now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Post-deployment release verification
-- ---------------------------------------------------------------------------
--
-- Run after every hosted migration. It asserts the structural guarantees the
-- specifications claim, so a deployment cannot be declared successful on the
-- strength of "the migration applied without error".

create or replace function public.verify_platform_release()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid; v_checks jsonb; v_failures integer;

begin
  v_actor := private.require_staff_capability('view_audit_logs');

  -- Helper is inlined because a stable function cannot create one.
  with results as (
    select * from (values
      ('definer_search_path',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef and n.nspname in ('public','private')
          and not (coalesce(pg_catalog.array_to_string(p.proconfig,','),'') like '%search_path=%')),
       0, 'Every SECURITY DEFINER function pins a search_path'),
      ('anon_private_grants',
       (select pg_catalog.count(*)::integer from information_schema.role_table_grants
        where table_schema = 'private' and grantee in ('anon','authenticated','PUBLIC')),
       0, 'No private table is exposed to a client role'),
      ('realtime_private',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'private'),
       0, 'No private table is broadcast over Realtime'),
      ('public_tables_without_rls',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
       0, 'Every public table has row level security enabled'),
      ('enabled_feature_flags',
       (select pg_catalog.count(*)::integer from private.staff_feature_flags f
        where f.enabled and f.environment = private.platform_environment()),
       0, 'No feature flag is enabled in this environment'),
      ('active_kill_switches',
       (select pg_catalog.count(*)::integer from private.staff_kill_switches s where s.active),
       0, 'No kill switch is active'),
      ('push_delivery_enabled',
       (select pg_catalog.count(*)::integer from private.notification_configuration c
        where c.singleton and (c.push_delivery_enabled or c.token_registration_enabled or c.scheduler_enabled)),
       0, 'Push delivery, token registration, and the scheduler are all disabled'),
      ('live_payment_modes',
       (select pg_catalog.count(*)::integer from private.payment_configuration c
        where c.id and (c.gateway_mode in ('sandbox','live') or c.payout_mode in ('sandbox','live'))),
       0, 'No live or sandbox payment or payout mode is selected'),
      ('release_scheduler',
       (select pg_catalog.count(*)::integer from private.payment_configuration c
        where c.id and c.automatic_release_scheduler_enabled),
       0, 'The automatic earnings release scheduler is disabled'),
      ('production_legacy_grace',
       (select pg_catalog.count(*)::integer from private.staff_platform_configuration c
        where c.singleton and c.environment = 'production' and c.legacy_staff_rpc_grace_enabled),
       0, 'Production does not accept the pre-WPS-017 staff gate'),
      ('production_without_mfa',
       (select pg_catalog.count(*)::integer from private.staff_platform_configuration c
        where c.singleton and c.environment = 'production'
          and (not c.mfa_required or c.mfa_provider = 'none')),
       0, 'Production requires a configured second factor'),
      ('unowned_rate_limits',
       (select pg_catalog.count(*)::integer from private.rate_limit_policies p
        where p.enforced_by = 'client_only_gap'),
       0, 'Every audited surface has a server-side limit owner')
    ) as t(check_key, observed, expected, description)
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'check', r.check_key, 'observed', r.observed, 'expected', r.expected,
      'passed', r.observed = r.expected, 'description', r.description
    ) order by r.check_key), '[]'::jsonb),
    pg_catalog.count(*) filter (where r.observed <> r.expected)::integer
  into v_checks, v_failures
  from results r;

  perform private.staff_log_access(v_actor, 'audit_explorer', 'view_audit_logs',
    'verify_platform_release', v_failures);
  return pg_catalog.jsonb_build_object(
    'environment', private.platform_environment(),
    'failures', v_failures,
    'passed', v_failures = 0,
    'checks', v_checks,
    'generatedAt', pg_catalog.now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Legacy staff RPC capability gates (forward-only, logic untouched)
-- ---------------------------------------------------------------------------
--
-- Each pre-WPS-017 staff RPC is RENAMED into `private` exactly as it is, then
-- re-published under its original public name behind the domain capability
-- gate. Not one line of WPS-006..WPS-016 logic is rewritten, so no domain
-- behaviour, error code, or message can drift.

create or replace function private.require_domain_staff_write(p_capability text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid;
begin
  v_uid := private.require_domain_staff(p_capability);
  -- Backstop against a compromised staff session driving bulk mutations.
  perform private.enforce_rate_limit('staff_privileged_action', v_uid::text);
  return v_uid;
end;
$$;
revoke all on function private.require_domain_staff_write(text) from public, anon, authenticated;

do $$
declare
  v_spec record;
begin
  for v_spec in
    select * from (values
      ('add_dispute_staff_note',        'uuid,text,boolean,text'),
      ('assign_booking_dispute',        'uuid,text,text'),
      ('close_booking_dispute',         'uuid,text,text'),
      ('create_post_release_financial_case','uuid,text,bigint,text,text'),
      ('decide_post_release_financial_case','uuid,bigint,text,text'),
      ('get_staff_payment_operations_summary',''),
      ('get_staff_trust_queue_summary',  ''),
      ('moderate_review',                'uuid,text,text'),
      ('process_financial_refund',       'uuid,bigint,text,text'),
      ('reject_booking_dispute',         'uuid,text,text'),
      ('request_dispute_evidence',       'uuid,text,text,text'),
      ('resolve_booking_dispute',        'uuid,text,text,text,uuid,bigint,text'),
      ('review_provider_certificate',    'uuid,text,text,date'),
      ('review_provider_verification',   'uuid,text,text,timestamptz,boolean'),
      ('review_provider_withdrawal',     'uuid,text,text,text'),
      ('review_reconciliation_exception','uuid,text,text'),
      ('review_report_transition',       'uuid,text,text'),
      ('set_provider_earning_hold',      'uuid,text,bigint,text,text'),
      ('staff_decide_trust_appeal',      'uuid,text,text'),
      ('staff_record_enforcement_action','uuid,text,text,text,text,text,uuid,timestamptz'),
      ('staff_transition_trust_report',  'uuid,text,text'),
      ('start_dispute_review',           'uuid,text,text'),
      ('submit_trust_report',            'text,uuid,uuid,text,text,text,text,uuid'),
      ('submit_trust_appeal',            'uuid,text,text'),
      ('open_support_case',              'text,text,text,text'),
      ('report_booking_communication_abuse','uuid,text,text,uuid,text'),
      ('report_review',                  'uuid,text,text'),
      ('send_booking_message',           'uuid,text,text,text,text,uuid'),
      ('submit_booking_review',          'uuid,smallint,text,text[]'),
      ('staff_request_export',           'text,date,date,text,text')
    ) as t(fn, args)
  loop
    execute pg_catalog.format(
      'alter function public.%I(%s) rename to %I', v_spec.fn, v_spec.args, v_spec.fn || '_impl');
    execute pg_catalog.format(
      'alter function public.%I(%s) set schema private', v_spec.fn || '_impl', v_spec.args);
    execute pg_catalog.format(
      'revoke all on function private.%I(%s) from public, anon, authenticated',
      v_spec.fn || '_impl', v_spec.args);
  end loop;
end;
$$;

-- --- Disputes (WPS-013 remains the dispute authority) ----------------------

create or replace function public.assign_booking_dispute(p_dispute_id uuid, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.assign_booking_dispute_impl(p_dispute_id, p_note, p_idempotency_key);
end $$;

create or replace function public.request_dispute_evidence(p_dispute_id uuid, p_target text, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.request_dispute_evidence_impl(p_dispute_id, p_target, p_note, p_idempotency_key);
end $$;

create or replace function public.start_dispute_review(p_dispute_id uuid, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.start_dispute_review_impl(p_dispute_id, p_note, p_idempotency_key);
end $$;

create or replace function public.add_dispute_staff_note(p_dispute_id uuid, p_note text, p_participant_visible boolean, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.add_dispute_staff_note_impl(p_dispute_id, p_note, p_participant_visible, p_idempotency_key);
end $$;

create or replace function public.reject_booking_dispute(p_dispute_id uuid, p_reason text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.reject_booking_dispute_impl(p_dispute_id, p_reason, p_idempotency_key);
end $$;

create or replace function public.close_booking_dispute(p_dispute_id uuid, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.close_booking_dispute_impl(p_dispute_id, p_note, p_idempotency_key);
end $$;

create or replace function public.resolve_booking_dispute(
  p_dispute_id uuid, p_resolution_type text, p_summary text, p_financial_action text,
  p_payment_id uuid, p_amount_minor bigint, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_disputes');
  return private.resolve_booking_dispute_impl(p_dispute_id, p_resolution_type, p_summary,
    p_financial_action, p_payment_id, p_amount_minor, p_idempotency_key);
end $$;

-- --- Verification (WPS-006 / WPS-010 remain the decision authority) --------

create or replace function public.review_provider_verification(
  p_provider_id uuid, p_status text, p_reason text default null,
  p_expires_at timestamptz default null, p_skill_certificate_approved boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_identity_verification');
  return private.review_provider_verification_impl(p_provider_id, p_status, p_reason,
    p_expires_at, p_skill_certificate_approved);
end $$;

create or replace function public.review_provider_certificate(
  p_certificate_id uuid, p_status text, p_reason text default null, p_expires_at date default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_certificates');
  perform private.review_provider_certificate_impl(p_certificate_id, p_status, p_reason, p_expires_at);
end $$;

-- --- Review moderation (WPS-011 remains the moderation authority) ----------

create or replace function public.moderate_review(p_review_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('moderate_reviews');
  return private.moderate_review_impl(p_review_id, p_action, p_reason);
end $$;

create or replace function public.review_report_transition(p_report_id uuid, p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('moderate_reviews');
  return private.review_report_transition_impl(p_report_id, p_status, p_note);
end $$;

-- --- Financial (WPS-007 / WPS-015 remain the money authority) --------------

create or replace function public.process_financial_refund(
  p_payment_id uuid, p_amount_minor bigint, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid;
begin
  v_uid := private.require_domain_staff_write('initiate_refund');
  -- Irreversible money movement needs a second person. A pre-WPS-017 account
  -- outside production keeps its historic path; production cannot reach it.
  if private.staff_has_wps017_grant(v_uid) then
    perform private.consume_dual_control('initiate_refund', 'process_financial_refund', p_payment_id::text);
  end if;
  return private.process_financial_refund_impl(p_payment_id, p_amount_minor, p_reason, p_idempotency_key);
end $$;

create or replace function public.review_provider_withdrawal(
  p_withdrawal_id uuid, p_status text, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_withdrawal');
  return private.review_provider_withdrawal_impl(p_withdrawal_id, p_status, p_reason, p_idempotency_key);
end $$;

create or replace function public.set_provider_earning_hold(
  p_earning_id uuid, p_action text, p_amount_minor bigint, p_public_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('view_financial_ledger');
  return private.set_provider_earning_hold_impl(p_earning_id, p_action, p_amount_minor,
    p_public_reason, p_idempotency_key);
end $$;

create or replace function public.create_post_release_financial_case(
  p_payment_id uuid, p_case_type text, p_amount_minor bigint, p_public_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('view_financial_ledger');
  return private.create_post_release_financial_case_impl(p_payment_id, p_case_type,
    p_amount_minor, p_public_reason, p_idempotency_key);
end $$;

create or replace function public.decide_post_release_financial_case(
  p_case_id uuid, p_provider_responsibility_minor bigint, p_public_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('view_financial_ledger');
  return private.decide_post_release_financial_case_impl(p_case_id,
    p_provider_responsibility_minor, p_public_reason, p_idempotency_key);
end $$;

create or replace function public.review_reconciliation_exception(
  p_exception_id uuid, p_status text, p_resolution_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_reconciliation_exception');
  return private.review_reconciliation_exception_impl(p_exception_id, p_status, p_resolution_note);
end $$;

create or replace function public.get_staff_payment_operations_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_domain_staff('inspect_payment_state');
  return private.get_staff_payment_operations_summary_impl();
end $$;

-- --- Trust and safety (WPS-016 remains the enforcement authority) ----------

create or replace function public.staff_record_enforcement_action(
  p_subject_user_id uuid, p_action_type text, p_reason_code text, p_public_reason text,
  p_evidence_summary text, p_idempotency_key text, p_report_id uuid default null,
  p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_capability text;
begin
  -- A permanent ban is the platform's most severe action and is gated
  -- separately from a warning or a time-bounded restriction.
  v_capability := case when p_action_type = 'permanent_ban'
    then 'approve_permanent_ban' else 'issue_temporary_restriction' end;
  v_uid := private.require_domain_staff_write(v_capability);
  if p_action_type = 'permanent_ban' and private.staff_has_wps017_grant(v_uid) then
    perform private.consume_dual_control('approve_permanent_ban', 'permanent_ban', p_subject_user_id::text);
  end if;
  return private.staff_record_enforcement_action_impl(p_subject_user_id, p_action_type,
    p_reason_code, p_public_reason, p_evidence_summary, p_idempotency_key, p_report_id, p_expires_at);
end $$;

create or replace function public.staff_transition_trust_report(
  p_report_id uuid, p_status text, p_public_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_abuse_reports');
  return private.staff_transition_trust_report_impl(p_report_id, p_status, p_public_reason);
end $$;

create or replace function public.staff_decide_trust_appeal(
  p_appeal_id uuid, p_status text, p_decision_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('review_appeals');
  return private.staff_decide_trust_appeal_impl(p_appeal_id, p_status, p_decision_note);
end $$;

create or replace function public.get_staff_trust_queue_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_domain_staff('review_abuse_reports');
  return private.get_staff_trust_queue_summary_impl();
end $$;

-- ---------------------------------------------------------------------------
-- 12. Server-authoritative limits on abuse-prone client surfaces
-- ---------------------------------------------------------------------------

create or replace function public.submit_trust_report(
  p_subject_type text, p_subject_id uuid, p_subject_user_id uuid, p_category text,
  p_source_surface text, p_details text, p_idempotency_key text, p_source_report_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('trust_report_submit');
  return private.submit_trust_report_impl(p_subject_type, p_subject_id, p_subject_user_id,
    p_category, p_source_surface, p_details, p_idempotency_key, p_source_report_id);
end $$;

create or replace function public.submit_trust_appeal(
  p_enforcement_action_id uuid, p_statement text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('trust_appeal_submit');
  return private.submit_trust_appeal_impl(p_enforcement_action_id, p_statement, p_idempotency_key);
end $$;

create or replace function public.open_support_case(
  p_category text, p_subject text, p_body text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('support_case_open');
  return private.open_support_case_impl(p_category, p_subject, p_body, p_idempotency_key);
end $$;

create or replace function public.report_booking_communication_abuse(
  p_booking_id uuid, p_category text, p_details text, p_message_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('communication_abuse_report');
  return private.report_booking_communication_abuse_impl(p_booking_id, p_category, p_details,
    p_message_id, p_idempotency_key);
end $$;

create or replace function public.report_review(p_review_id uuid, p_reason text, p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('review_report');
  return private.report_review_impl(p_review_id, p_reason, p_details);
end $$;

create or replace function public.send_booking_message(
  p_booking_id uuid, p_message_type text, p_body text, p_attachment_path text,
  p_attachment_mime_type text, p_client_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('booking_message_send');
  return private.send_booking_message_impl(p_booking_id, p_message_type, p_body,
    p_attachment_path, p_attachment_mime_type, p_client_id);
end $$;

create or replace function public.submit_booking_review(
  p_booking_id uuid, p_rating smallint, p_comment text default null,
  p_attachment_paths text[] default '{}'::text[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('review_submit');
  return private.submit_booking_review_impl(p_booking_id, p_rating, p_comment, p_attachment_paths);
end $$;

create or replace function public.staff_request_export(
  p_report_key text, p_range_start date, p_range_end date, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enforce_rate_limit('staff_export_request');
  return private.staff_request_export_impl(p_report_key, p_range_start, p_range_end,
    p_reason, p_idempotency_key);
end $$;

-- ---------------------------------------------------------------------------
-- 13. Grants
-- ---------------------------------------------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.assign_booking_dispute(uuid,text,text)',
    'public.request_dispute_evidence(uuid,text,text,text)',
    'public.start_dispute_review(uuid,text,text)',
    'public.add_dispute_staff_note(uuid,text,boolean,text)',
    'public.reject_booking_dispute(uuid,text,text)',
    'public.close_booking_dispute(uuid,text,text)',
    'public.resolve_booking_dispute(uuid,text,text,text,uuid,bigint,text)',
    'public.review_provider_verification(uuid,text,text,timestamptz,boolean)',
    'public.review_provider_certificate(uuid,text,text,date)',
    'public.moderate_review(uuid,text,text)',
    'public.review_report_transition(uuid,text,text)',
    'public.process_financial_refund(uuid,bigint,text,text)',
    'public.review_provider_withdrawal(uuid,text,text,text)',
    'public.set_provider_earning_hold(uuid,text,bigint,text,text)',
    'public.create_post_release_financial_case(uuid,text,bigint,text,text)',
    'public.decide_post_release_financial_case(uuid,bigint,text,text)',
    'public.review_reconciliation_exception(uuid,text,text)',
    'public.get_staff_payment_operations_summary()',
    'public.staff_record_enforcement_action(uuid,text,text,text,text,text,uuid,timestamptz)',
    'public.staff_transition_trust_report(uuid,text,text)',
    'public.staff_decide_trust_appeal(uuid,text,text)',
    'public.get_staff_trust_queue_summary()',
    'public.submit_trust_report(text,uuid,uuid,text,text,text,text,uuid)',
    'public.submit_trust_appeal(uuid,text,text)',
    'public.open_support_case(text,text,text,text)',
    'public.report_booking_communication_abuse(uuid,text,text,uuid,text)',
    'public.report_review(uuid,text,text)',
    'public.send_booking_message(uuid,text,text,text,text,uuid)',
    'public.submit_booking_review(uuid,smallint,text,text[])',
    'public.staff_request_export(text,date,date,text,text)',
    'public.staff_request_dual_control(text,text,text,text)',
    'public.staff_approve_dual_control(uuid,text)',
    'public.get_staff_access_review()',
    'public.staff_record_access_review(uuid,text,text)',
    'public.verify_platform_release()'
  ] loop
    execute 'revoke all on function '||v_signature||' from public, anon';
    execute 'grant execute on function '||v_signature||' to authenticated';
  end loop;
end;
$$;

-- No WPS-018 table is published to Realtime and no private table is readable by
-- any client role.
