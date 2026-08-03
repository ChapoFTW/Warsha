-- WPS-017 — Operations, Analytics & Admin Platform
--
-- WPS-017 is the single authority for STAFF IDENTITY, STAFF CAPABILITIES,
-- OPERATIONAL ASSIGNMENT, OPERATIONAL CONFIGURATION CHANGE CONTROL, FEATURE
-- FLAGS, KILL SWITCHES, SUPPORT CASES, INCIDENTS, THE AUDIT EXPLORER, SAFE
-- OPERATIONAL ANALYTICS, and APPROVED EXPORTS.
--
-- It EXTENDS the existing architecture and replaces nothing:
--
--   * WPS-006  verification remains the identity/certificate authority.
--   * WPS-007  remains the ledger, refund, hold, and withdrawal authority.
--   * WPS-008  remains the marketplace matching and ranking authority.
--   * WPS-009  remains the booking-communication authority.
--   * WPS-011  remains the review and review-moderation authority.
--   * WPS-012  remains the job-execution authority.
--   * WPS-013  remains the dispute authority.
--   * WPS-014  remains the notification authority (reused for staff alerts).
--   * WPS-015  remains the production payment/payout/reconciliation authority.
--   * WPS-016  remains the trust, safety, enforcement, and appeal authority.
--
-- WPS-017 links to those systems, gates access to them by capability, and
-- records what staff did. It never duplicates a domain decision, never posts a
-- ledger entry, never moderates content itself, and never issues an
-- enforcement action of its own.
--
-- Nothing here enables real payments, payouts, refunds, push, SMS, calls,
-- webhooks, schedulers, or any external provider. There is no service-role
-- path, no arbitrary SQL executor, and no generic RPC dispatcher.

-- ---------------------------------------------------------------------------
-- 1. Admin platform configuration (fail closed in production)
-- ---------------------------------------------------------------------------

create table if not exists private.staff_platform_configuration (
  singleton boolean primary key default true check (singleton),
  environment text not null default 'local',
  admin_platform_enabled boolean not null default true,
  mfa_required boolean not null default false,
  mfa_provider text not null default 'none',
  legacy_staff_bridge_enabled boolean not null default false,
  reauth_window_seconds integer not null default 900,
  search_rate_limit_per_minute integer not null default 30,
  search_minimum_query_length integer not null default 6,
  export_row_limit integer not null default 500,
  analytics_max_range_days integer not null default 366,
  analytics_minimum_cell integer not null default 5,
  display_timezone text not null default 'Africa/Cairo',
  policy_version integer not null default 1,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint staff_platform_environment_check
    check (environment in ('local','staging','production')),
  constraint staff_platform_mfa_provider_check
    check (mfa_provider in ('none')),
  -- Production is structurally fail closed: it cannot be selected without the
  -- MFA requirement, and no MFA provider is configured, so production admin
  -- access stays denied until a provider is separately authorized.
  constraint staff_platform_production_requires_mfa
    check (environment <> 'production' or mfa_required),
  constraint staff_platform_reauth_window_check
    check (reauth_window_seconds between 60 and 3600),
  constraint staff_platform_search_rate_check
    check (search_rate_limit_per_minute between 1 and 300),
  constraint staff_platform_search_length_check
    check (search_minimum_query_length between 4 and 64),
  constraint staff_platform_export_limit_check
    check (export_row_limit between 1 and 5000),
  constraint staff_platform_range_check
    check (analytics_max_range_days between 1 and 1830),
  constraint staff_platform_cell_check
    check (analytics_minimum_cell between 1 and 100)
);
insert into private.staff_platform_configuration(singleton) values (true)
on conflict (singleton) do nothing;
revoke all on private.staff_platform_configuration from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Staff roles, capabilities, and grants
-- ---------------------------------------------------------------------------

create table if not exists public.staff_roles (
  role_key text primary key,
  display_name text not null,
  description text not null,
  risk_tier text not null default 'standard',
  sort_order integer not null default 100,
  constraint staff_roles_key_check check (role_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint staff_roles_risk_check check (risk_tier in ('standard','elevated','critical'))
);

create table if not exists public.staff_capabilities (
  capability_key text primary key,
  domain text not null,
  description text not null,
  high_risk boolean not null default false,
  dual_control boolean not null default false,
  requires_reauth boolean not null default false,
  constraint staff_capabilities_key_check check (capability_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  constraint staff_capabilities_domain_check check (domain in (
    'platform','accounts','verification','disputes','trust','reviews','financial',
    'marketplace','configuration','support','audit','analytics','incidents','security'))
);

create table if not exists public.staff_role_capabilities (
  role_key text not null references public.staff_roles(role_key) on delete cascade,
  capability_key text not null references public.staff_capabilities(capability_key) on delete cascade,
  primary key (role_key, capability_key)
);

-- A grant is the only way a person becomes staff for WPS-017 purposes.
create table if not exists public.staff_role_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.staff_roles(role_key) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  idempotency_key text not null,
  constraint staff_role_grants_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 500),
  constraint staff_role_grants_expiry_check
    check (expires_at is null or expires_at > granted_at),
  constraint staff_role_grants_idempotency_check
    check (pg_catalog.length(idempotency_key) between 8 and 200),
  unique (idempotency_key)
);
create unique index if not exists staff_role_grants_active_unique_idx
  on public.staff_role_grants(user_id, role_key) where revoked_at is null;
create index if not exists staff_role_grants_user_idx
  on public.staff_role_grants(user_id) where revoked_at is null;

-- Role history is immutable apart from the revocation fields.
create or replace function private.prevent_staff_role_grant_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Staff role history is immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.role_key is distinct from old.role_key
     or new.granted_by is distinct from old.granted_by
     or new.granted_at is distinct from old.granted_at
     or new.reason is distinct from old.reason
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'Staff role history is immutable' using errcode = '55000';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Staff role history is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_staff_role_grant_mutation() from public, anon, authenticated;
drop trigger if exists staff_role_grants_immutable on public.staff_role_grants;
create trigger staff_role_grants_immutable before update or delete on public.staff_role_grants
for each row execute function private.prevent_staff_role_grant_mutation();

insert into public.staff_roles(role_key, display_name, description, risk_tier, sort_order) values
  ('support_agent','Support Agent','Handles support cases and safe account context.','standard',10),
  ('verification_reviewer','Verification Reviewer','Reviews identity verification and certificates.','standard',20),
  ('trust_safety_reviewer','Trust & Safety Reviewer','Reviews abuse reports, moderation, and appeals.','elevated',30),
  ('dispute_reviewer','Dispute Reviewer','Reviews and resolves booking disputes.','elevated',40),
  ('financial_operations','Financial Operations','Reviews payments, refunds, withdrawals, and reconciliation.','elevated',50),
  ('marketplace_operations','Marketplace Operations','Monitors marketplace health and configuration.','standard',60),
  ('operations_manager','Operations Manager','Owns queues, assignment, incidents, and approvals.','elevated',70),
  ('security_administrator','Security Administrator','Owns staff roles, audit access, flags, and kill switches.','critical',80),
  ('super_administrator','Super Administrator','Break-glass access. Production use must be exceptional.','critical',90)
on conflict (role_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  risk_tier = excluded.risk_tier,
  sort_order = excluded.sort_order;

insert into public.staff_capabilities(capability_key, domain, description, high_risk, dual_control, requires_reauth) values
  ('view_operations_home','platform','See the operational home and queue counts.',false,false,false),
  ('safe_search','accounts','Run the restricted operational search.',false,false,false),
  ('view_safe_customer_profile','accounts','See sanitized customer context.',false,false,false),
  ('view_safe_worker_profile','accounts','See sanitized worker context.',false,false,false),
  ('view_contact_details','accounts','See verified phone or email on a safe profile.',true,false,true),
  ('review_identity_verification','verification','Review identity verification submissions.',false,false,false),
  ('review_certificates','verification','Review worker certificates.',false,false,false),
  ('review_disputes','disputes','Work booking disputes.',false,false,false),
  ('review_abuse_reports','trust','Triage and investigate abuse reports.',false,false,false),
  ('issue_temporary_restriction','trust','Issue warnings and time-bounded restrictions.',true,false,false),
  ('approve_permanent_ban','trust','Approve a permanent ban.',true,true,true),
  ('review_appeals','trust','Decide appeals.',true,false,false),
  ('moderate_reviews','reviews','Act on reported review content.',false,false,false),
  ('inspect_payment_state','financial','Inspect safe payment and gateway state.',false,false,false),
  ('view_financial_ledger','financial','Inspect ledger transactions and earnings.',true,false,false),
  ('initiate_refund','financial','Initiate an authorized refund.',true,true,true),
  ('review_withdrawal','financial','Review worker withdrawals and payouts.',true,false,false),
  ('review_reconciliation_exception','financial','Review reconciliation exceptions.',true,false,false),
  ('manage_marketplace_configuration','marketplace','Draft marketplace configuration changes.',true,false,false),
  ('manage_notification_configuration','configuration','Draft notification configuration changes.',true,false,false),
  ('approve_configuration','configuration','Approve and activate a configuration version.',true,true,true),
  ('manage_feature_flags','configuration','Manage server-authoritative feature flags.',true,false,true),
  ('manage_kill_switches','configuration','Activate or clear a kill switch.',true,false,true),
  ('assign_cases','platform','Assign, reassign, and escalate operational cases.',false,false,false),
  ('manage_support_cases','support','Work support cases.',false,false,false),
  ('manage_incidents','incidents','Open, update, and resolve incidents.',false,false,false),
  ('view_audit_logs','audit','Use the audit explorer.',true,false,false),
  ('view_analytics','analytics','See privacy-safe operational analytics.',false,false,false),
  ('export_operational_report','analytics','Request an approved operational export.',true,false,true),
  ('manage_staff_roles','security','Grant or revoke staff roles.',true,true,true),
  ('legacy_domain_staff_actions','security','Call the pre-WPS-017 domain staff RPCs.',true,false,false)
on conflict (capability_key) do update set
  domain = excluded.domain,
  description = excluded.description,
  high_risk = excluded.high_risk,
  dual_control = excluded.dual_control,
  requires_reauth = excluded.requires_reauth;

-- Deny by default: a role holds exactly the capabilities listed here.
insert into public.staff_role_capabilities(role_key, capability_key) values
  ('support_agent','view_operations_home'),
  ('support_agent','safe_search'),
  ('support_agent','view_safe_customer_profile'),
  ('support_agent','view_safe_worker_profile'),
  ('support_agent','manage_support_cases'),

  ('verification_reviewer','view_operations_home'),
  ('verification_reviewer','safe_search'),
  ('verification_reviewer','view_safe_worker_profile'),
  ('verification_reviewer','review_identity_verification'),
  ('verification_reviewer','review_certificates'),
  ('verification_reviewer','legacy_domain_staff_actions'),

  ('trust_safety_reviewer','view_operations_home'),
  ('trust_safety_reviewer','safe_search'),
  ('trust_safety_reviewer','view_safe_customer_profile'),
  ('trust_safety_reviewer','view_safe_worker_profile'),
  ('trust_safety_reviewer','review_abuse_reports'),
  ('trust_safety_reviewer','issue_temporary_restriction'),
  ('trust_safety_reviewer','review_appeals'),
  ('trust_safety_reviewer','moderate_reviews'),
  ('trust_safety_reviewer','legacy_domain_staff_actions'),

  ('dispute_reviewer','view_operations_home'),
  ('dispute_reviewer','safe_search'),
  ('dispute_reviewer','view_safe_customer_profile'),
  ('dispute_reviewer','view_safe_worker_profile'),
  ('dispute_reviewer','review_disputes'),
  ('dispute_reviewer','inspect_payment_state'),
  ('dispute_reviewer','legacy_domain_staff_actions'),

  ('financial_operations','view_operations_home'),
  ('financial_operations','safe_search'),
  ('financial_operations','view_safe_worker_profile'),
  ('financial_operations','inspect_payment_state'),
  ('financial_operations','view_financial_ledger'),
  ('financial_operations','initiate_refund'),
  ('financial_operations','review_withdrawal'),
  ('financial_operations','review_reconciliation_exception'),
  ('financial_operations','legacy_domain_staff_actions'),

  ('marketplace_operations','view_operations_home'),
  ('marketplace_operations','safe_search'),
  ('marketplace_operations','view_safe_worker_profile'),
  ('marketplace_operations','manage_marketplace_configuration'),
  ('marketplace_operations','view_analytics'),

  ('operations_manager','view_operations_home'),
  ('operations_manager','safe_search'),
  ('operations_manager','view_safe_customer_profile'),
  ('operations_manager','view_safe_worker_profile'),
  ('operations_manager','assign_cases'),
  ('operations_manager','manage_support_cases'),
  ('operations_manager','manage_incidents'),
  ('operations_manager','view_analytics'),
  ('operations_manager','export_operational_report'),
  ('operations_manager','approve_configuration'),
  ('operations_manager','legacy_domain_staff_actions'),

  ('security_administrator','view_operations_home'),
  ('security_administrator','manage_staff_roles'),
  ('security_administrator','view_audit_logs'),
  ('security_administrator','manage_feature_flags'),
  ('security_administrator','manage_kill_switches'),
  ('security_administrator','manage_incidents')
on conflict do nothing;

-- Super Administrator is break-glass: it holds every capability, and every
-- action it authorizes is audited as break-glass access.
insert into public.staff_role_capabilities(role_key, capability_key)
select 'super_administrator', c.capability_key from public.staff_capabilities c
on conflict do nothing;

-- The very first Security Administrator cannot be granted through the RPC,
-- because the RPC requires the capability it would be granting. This bootstrap
-- is owner-only: no client role holds EXECUTE, it is unreachable over PostgREST,
-- and it is used once by a database administrator following
-- docs/operations/admin-platform-runbook.md. It is still fully audited.
create or replace function private.bootstrap_staff_role(
  p_user_id uuid, p_role_key text, p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_user_id is null or p_role_key is null then
    raise exception 'A user and a role are required' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  insert into public.staff_role_grants(user_id, role_key, granted_by, reason, idempotency_key)
  values (p_user_id, p_role_key, null, pg_catalog.btrim(p_reason),
          'bootstrap:'||p_role_key||':'||p_user_id::text)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select g.id into v_id from public.staff_role_grants g
    where g.user_id = p_user_id and g.role_key = p_role_key and g.revoked_at is null;
  end if;
  return v_id;
end;
$$;
revoke all on function private.bootstrap_staff_role(uuid,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Immutable staff audit and access log
-- ---------------------------------------------------------------------------

create table if not exists private.staff_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  capability_key text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text not null,
  break_glass boolean not null default false,
  environment text not null default 'local',
  safe_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_audit_events_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 2000)
);
create index if not exists staff_audit_events_actor_idx
  on private.staff_audit_events(actor_id, created_at desc);
create index if not exists staff_audit_events_entity_idx
  on private.staff_audit_events(entity_type, entity_id, created_at desc);
revoke all on private.staff_audit_events from public, anon, authenticated;

create or replace function private.prevent_staff_audit_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Staff audit is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_staff_audit_mutation() from public, anon, authenticated;
drop trigger if exists staff_audit_events_immutable on private.staff_audit_events;
create trigger staff_audit_events_immutable before update or delete on private.staff_audit_events
for each row execute function private.prevent_staff_audit_mutation();

-- Every read of a sensitive surface is itself recorded.
create table if not exists private.staff_access_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  surface text not null,
  capability_key text,
  query_shape text,
  result_count integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_access_log_surface_check check (surface in (
    'safe_search','customer_overview','worker_overview','audit_explorer',
    'export_request','export_preview','analytics','case_notes'))
);
create index if not exists staff_access_log_actor_idx
  on private.staff_access_log(actor_id, created_at desc);
revoke all on private.staff_access_log from public, anon, authenticated;

drop trigger if exists staff_access_log_immutable on private.staff_access_log;
create trigger staff_access_log_immutable before update or delete on private.staff_access_log
for each row execute function private.prevent_staff_audit_mutation();

-- ---------------------------------------------------------------------------
-- 4. Session security: re-authentication attestations and revocation
-- ---------------------------------------------------------------------------

create table if not exists private.staff_session_attestations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_ref text not null,
  attested_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  unique (user_id, session_ref)
);
create index if not exists staff_session_attestations_user_idx
  on private.staff_session_attestations(user_id, attested_at desc);
revoke all on private.staff_session_attestations from public, anon, authenticated;

create or replace function private.staff_session_ref()
returns text language sql stable security definer set search_path='' as $$
  select coalesce(nullif(auth.jwt()->>'session_id',''), 'no-session')
$$;
revoke all on function private.staff_session_ref() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Capability resolution (deny by default, server derived)
-- ---------------------------------------------------------------------------

-- The admin platform is unusable unless the environment permits it and the
-- configured MFA requirement is satisfied. No MFA provider exists, so a
-- production configuration denies every staff capability by construction.
create or replace function private.staff_platform_ready()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_config private.staff_platform_configuration%rowtype;
begin
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  if v_config.singleton is null or not v_config.admin_platform_enabled then return false; end if;
  if v_config.mfa_required and v_config.mfa_provider = 'none' then return false; end if;
  return true;
end;
$$;
revoke all on function private.staff_platform_ready() from public, anon, authenticated;

create or replace function private.staff_active_role_keys(p_user_id uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v_roles text[]; v_bridge boolean;
begin
  if p_user_id is null then return '{}'::text[]; end if;
  -- A deleted, suspended, or banned account is never staff.
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    return '{}'::text[];
  end if;
  if exists (select 1 from public.trust_account_state s
             where s.user_id = p_user_id and s.trust_level in ('banned','suspended')) then
    return '{}'::text[];
  end if;
  select coalesce(pg_catalog.array_agg(distinct g.role_key), '{}'::text[]) into v_roles
  from public.staff_role_grants g
  where g.user_id = p_user_id
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());
  -- Documented, disabled-by-default compatibility bridge. It never grants more
  -- than the lowest-privilege role, and it is off in every environment until a
  -- Security Administrator turns it on deliberately.
  select c.legacy_staff_bridge_enabled into v_bridge
  from private.staff_platform_configuration c where c.singleton;
  if coalesce(v_bridge,false)
     and exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role in ('support','admin'))
     and not ('support_agent' = any(v_roles)) then
    v_roles := v_roles || 'support_agent';
  end if;
  return v_roles;
end;
$$;
revoke all on function private.staff_active_role_keys(uuid) from public, anon, authenticated;

create or replace function private.staff_capability_keys(p_user_id uuid)
returns text[] language sql stable security definer set search_path='' as $$
  select coalesce(pg_catalog.array_agg(distinct rc.capability_key), '{}'::text[])
  from public.staff_role_capabilities rc
  where rc.role_key = any(private.staff_active_role_keys(p_user_id))
$$;
revoke all on function private.staff_capability_keys(uuid) from public, anon, authenticated;

create or replace function private.staff_has_capability(p_capability text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.staff_platform_ready() then return false; end if;
  if not exists (select 1 from public.staff_capabilities c where c.capability_key = p_capability) then
    return false;
  end if;
  return p_capability = any(private.staff_capability_keys(v_uid));
end;
$$;
revoke all on function private.staff_has_capability(text) from public, anon, authenticated;

-- True when the capability is reachable only through the break-glass role.
create or replace function private.staff_capability_is_break_glass(p_user_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists (
    select 1 from public.staff_role_capabilities rc
    where rc.capability_key = p_capability
      and rc.role_key <> 'super_administrator'
      and rc.role_key = any(private.staff_active_role_keys(p_user_id))
  )
$$;
revoke all on function private.staff_capability_is_break_glass(uuid,text) from public, anon, authenticated;

create or replace function private.staff_recent_reauth(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_window integer; v_at timestamptz;
begin
  select c.reauth_window_seconds into v_window from private.staff_platform_configuration c where c.singleton;
  select a.attested_at into v_at
  from private.staff_session_attestations a
  where a.user_id = p_user_id and a.session_ref = private.staff_session_ref() and a.revoked_at is null;
  if v_at is null then return false; end if;
  return v_at > pg_catalog.now() - pg_catalog.make_interval(secs => coalesce(v_window,900));
end;
$$;
revoke all on function private.staff_recent_reauth(uuid) from public, anon, authenticated;

create or replace function private.record_staff_audit(
  p_actor_id uuid, p_capability text, p_action text, p_entity_type text,
  p_entity_id uuid, p_reason text, p_safe_detail jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_env text;
begin
  select c.environment into v_env from private.staff_platform_configuration c where c.singleton;
  insert into private.staff_audit_events(
    actor_id, capability_key, action, entity_type, entity_id, reason,
    break_glass, environment, safe_detail)
  values (
    p_actor_id, p_capability, p_action, p_entity_type, p_entity_id,
    pg_catalog.btrim(p_reason),
    case when p_capability is null then false
         else private.staff_capability_is_break_glass(p_actor_id, p_capability) end,
    coalesce(v_env,'local'), coalesce(p_safe_detail,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.record_staff_audit(uuid,text,text,text,uuid,text,jsonb)
  from public, anon, authenticated;

create or replace function private.staff_log_access(
  p_actor_id uuid, p_surface text, p_capability text, p_query_shape text, p_result_count integer)
returns void language sql security definer set search_path='' as $$
  insert into private.staff_access_log(actor_id, surface, capability_key, query_shape, result_count)
  values (p_actor_id, p_surface, p_capability, p_query_shape, greatest(coalesce(p_result_count,0),0));
$$;
revoke all on function private.staff_log_access(uuid,text,text,text,integer)
  from public, anon, authenticated;

-- Central gate. Every WPS-017 action passes through here.
create or replace function private.require_staff_capability(p_capability text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_cap public.staff_capabilities%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
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
-- 6. Legacy staff bridge for the pre-WPS-017 domain RPCs
-- ---------------------------------------------------------------------------
--
-- private.is_staff() keeps its original meaning for every account that already
-- had it: this is a widening, never a narrowing, so no existing behavior,
-- policy, or test changes. It additionally recognizes a WPS-017 staff member
-- who holds `legacy_domain_staff_actions`, so a WPS-017 grant does not require
-- handing out a legacy `user_roles` row. Narrow roles such as Support Agent,
-- Marketplace Operations, and Security Administrator deliberately do NOT hold
-- that capability and therefore cannot reach any legacy domain staff RPC.
create or replace function private.is_staff() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  -- Unchanged legacy result, evaluated first so the hot RLS path stays cheap.
  if exists (select 1 from public.user_roles r
             where r.user_id = v_uid and r.role in ('support','admin')) then
    return true;
  end if;
  if not exists (select 1 from public.staff_role_grants g
                 where g.user_id = v_uid and g.revoked_at is null) then
    return false;
  end if;
  return 'legacy_domain_staff_actions' = any(private.staff_capability_keys(v_uid));
end;
$$;
grant execute on function private.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Staff notifications — WPS-014 reused, never a parallel event system
-- ---------------------------------------------------------------------------
--
-- A fourth audience, `staff`, is added to the existing inbox. Because
-- private.notification_visible_in_mode(audience, mode) admits only
-- audience='all' or audience=mode, a staff notification can never appear in a
-- customer or worker inbox.

alter table public.notifications drop constraint if exists notifications_audience_check;
alter table public.notifications
  add constraint notifications_audience_check
  check (audience is null or audience in ('customer','worker','all','staff'));

-- UUID-only payload allowlisting is preserved; four operational identifiers
-- are added so staff alerts can point at the record they concern.
create or replace function private.notification_safe_payload(p_data jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'booking_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'booking_id','bookingId'),
    'provider_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'provider_id','providerId'),
    'request_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'request_id','requestId'),
    'quote_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'quote_id','quoteId'),
    'conversation_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'conversation_id','conversationId'),
    'review_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'review_id','reviewId'),
    'dispute_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'dispute_id','disputeId'),
    'payment_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'payment_id','paymentId'),
    'withdrawal_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'withdrawal_id','withdrawalId'),
    'verification_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'verification_id','verificationId'),
    'certification_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'certification_id','certificationId'),
    'report_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'report_id','reportId'),
    'history_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'history_id','historyId'),
    'event_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'event_id','eventId'),
    'assignment_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'assignment_id','assignmentId'),
    'incident_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'incident_id','incidentId'),
    'case_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'case_id','caseId'),
    'exception_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'exception_id','exceptionId')
  ))
$$;
revoke all on function private.notification_safe_payload(jsonb) from public,anon,authenticated;

-- Unchanged WPS-014 routing, plus an operational fallback so a staff alert
-- resolves to the operational record it concerns.
create or replace function private.notification_resource_id(p_route_type text,p_data jsonb)
returns uuid language sql immutable set search_path='' as $$
  select case p_route_type
    when 'marketplace_request' then private.notification_data_uuid(p_data,'request_id')
    when 'worker_quote' then coalesce(private.notification_data_uuid(p_data,'quote_id'),private.notification_data_uuid(p_data,'request_id'))
    when 'booking' then private.notification_data_uuid(p_data,'booking_id')
    when 'conversation' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'conversation_id'))
    when 'provider_profile' then private.notification_data_uuid(p_data,'provider_id')
    when 'booking_payment' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'payment_id'))
    when 'verification' then coalesce(private.notification_data_uuid(p_data,'provider_id'),private.notification_data_uuid(p_data,'verification_id'))
    when 'booking_review' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'review_id'))
    when 'booking_dispute' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'dispute_id'))
    else coalesce(
      private.notification_data_uuid(p_data,'assignment_id'),
      private.notification_data_uuid(p_data,'incident_id'),
      private.notification_data_uuid(p_data,'case_id'),
      private.notification_data_uuid(p_data,'exception_id')) end
$$;
revoke all on function private.notification_resource_id(text,jsonb) from public,anon,authenticated;

-- Staff mode is available only to an account that currently holds a staff
-- capability, so a customer or worker can never open a staff inbox.
create or replace function private.notification_mode_allowed(p_user_id uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_mode
    when 'customer' then exists(select 1 from public.customer_profiles c where c.id=p_user_id)
    when 'worker' then exists(select 1 from public.provider_profiles p where p.user_id=p_user_id and p.deleted_at is null)
    when 'staff' then pg_catalog.cardinality(private.staff_capability_keys(p_user_id)) > 0
    else false end
$$;
revoke all on function private.notification_mode_allowed(uuid,text) from public,anon,authenticated;

-- Unchanged WPS-014 audience resolution, with staff events resolved first so a
-- staff alert about a booking never lands in a participant inbox.
create or replace function private.notification_audience(p_user_id uuid,p_type text,p_data jsonb)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare booking_id uuid; target_request_id uuid; provider_id uuid; review_id uuid; dispute_id uuid;
begin
  if p_type like 'staff\_%' then return 'staff'; end if;
  booking_id:=private.notification_data_uuid(p_data,'booking_id');
  target_request_id:=private.notification_data_uuid(p_data,'request_id');
  provider_id:=private.notification_data_uuid(p_data,'provider_id');
  review_id:=private.notification_data_uuid(p_data,'review_id');
  dispute_id:=private.notification_data_uuid(p_data,'dispute_id');
  if booking_id is not null then
    if exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=booking_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if target_request_id is not null then
    if exists(select 1 from public.marketplace_requests r where r.id=target_request_id and r.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.quote_invitations i join public.provider_profiles p on p.id=i.provider_id where i.request_id=target_request_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if review_id is not null then
    if exists(select 1 from public.reviews r where r.id=review_id and r.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.reviews r join public.provider_profiles p on p.id=r.provider_id where r.id=review_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if dispute_id is not null then
    select d.booking_id into booking_id from public.disputes d where d.id=dispute_id;
    if booking_id is not null then return private.notification_audience(p_user_id,p_type,pg_catalog.jsonb_build_object('booking_id',booking_id)); end if;
  end if;
  if provider_id is not null and exists(select 1 from public.provider_profiles p where p.id=provider_id and p.user_id=p_user_id) then return 'worker'; end if;
  if p_type like 'verification_%' or p_type like 'certificate_%' or p_type like 'earnings_%'
    or p_type like 'withdrawal_%' or p_type in ('quote_invitation','quote_selected','emergency_request','request_edited') then return 'worker'; end if;
  return 'all';
end;
$$;
revoke all on function private.notification_audience(uuid,text,jsonb) from public,anon,authenticated;

insert into private.notification_event_catalog(
  event_type,category,priority,action_type,route_type,required_action,mandatory_in_app,quiet_hours_bypass,group_family,generic_title,generic_body
) values
  ('staff_case_assigned','system','action_required',null,null,true,true,false,null,'Case assigned','An operational case is assigned to you.'),
  ('staff_case_escalated','system','action_required',null,null,true,true,true,null,'Case escalated','An operational case was escalated.'),
  ('staff_evidence_deadline','system','action_required',null,null,true,true,true,null,'Evidence deadline','An evidence deadline is approaching.'),
  ('staff_high_priority_report','system','action_required',null,null,true,true,true,null,'High-priority report','A high-priority report needs review.'),
  ('staff_reconciliation_exception','system','action_required',null,null,true,true,false,null,'Reconciliation exception','A reconciliation exception needs review.'),
  ('staff_payout_failure','system','action_required',null,null,true,true,true,null,'Payout failure','A payout failure needs review.'),
  ('staff_security_incident','system','action_required',null,null,true,true,true,null,'Security incident','A security incident requires attention.'),
  ('staff_configuration_awaiting_approval','system','action_required',null,null,true,true,false,null,'Configuration awaiting approval','A configuration version is waiting for approval.'),
  ('staff_appeal_submitted','system','action_required',null,null,true,true,false,null,'Appeal submitted','An appeal was submitted.'),
  ('staff_incident_escalation','system','action_required',null,null,true,true,true,null,'Incident escalation','An incident was escalated.')
on conflict(event_type) do update set
  category=excluded.category,priority=excluded.priority,action_type=excluded.action_type,
  route_type=excluded.route_type,required_action=excluded.required_action,
  mandatory_in_app=excluded.mandatory_in_app,quiet_hours_bypass=excluded.quiet_hours_bypass,
  group_family=excluded.group_family,generic_title=excluded.generic_title,generic_body=excluded.generic_body;

-- Staff alerts never reach a customer or worker inbox and never trigger push:
-- push delivery and token registration stay disabled in WPS-014.
create or replace function private.notify_staff(
  p_user_id uuid, p_event_key text, p_data jsonb, p_source_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null then return; end if;
  if p_event_key not like 'staff\_%' then
    raise exception 'Staff notifications must use a staff event key' using errcode = '22023';
  end if;
  insert into public.notifications(user_id, type, title, body, data, event_key, source_key)
  values (p_user_id, p_event_key, 'Warsha operations', 'An operational item requires attention.',
          coalesce(p_data,'{}'::jsonb), p_event_key, p_source_key);
exception when unique_violation then
  return;
end;
$$;
revoke all on function private.notify_staff(uuid,text,jsonb,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Work queues and the generic operational assignment layer
-- ---------------------------------------------------------------------------
--
-- An assignment NEVER duplicates a domain record. It references the
-- authoritative dispute, report, appeal, exception, or case by id and carries
-- only ownership, priority, deadline, and lifecycle.

create table if not exists public.staff_queues (
  queue_key text primary key,
  domain text not null,
  capability_key text not null references public.staff_capabilities(capability_key) on delete restrict,
  subject_type text not null,
  display_name text not null,
  default_priority text not null default 'normal',
  target_response_hours integer,
  sort_order integer not null default 100,
  constraint staff_queues_key_check check (queue_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint staff_queues_priority_check check (default_priority in ('urgent','high','normal','low')),
  constraint staff_queues_hours_check check (target_response_hours is null or target_response_hours between 1 and 720)
);

insert into public.staff_queues(queue_key,domain,capability_key,subject_type,display_name,default_priority,target_response_hours,sort_order) values
  ('identity_verification','verification','review_identity_verification','verification','Pending identity verification','normal',48,10),
  ('certificate_review','verification','review_certificates','certificate','Pending certificates','normal',72,20),
  ('open_disputes','disputes','review_disputes','dispute','Open disputes','high',24,30),
  ('dispute_evidence_deadlines','disputes','review_disputes','dispute','Dispute evidence deadlines','urgent',12,40),
  ('abuse_reports','trust','review_abuse_reports','trust_report','Abuse reports','high',24,50),
  ('trust_investigations','trust','review_abuse_reports','trust_report','Trust investigations','high',48,60),
  ('appeals','trust','review_appeals','trust_appeal','Appeals','high',72,70),
  ('review_moderation','reviews','moderate_reviews','review_report','Review moderation','normal',48,80),
  ('failed_refunds','financial','initiate_refund','refund','Failed refunds','urgent',8,90),
  ('failed_payouts','financial','review_withdrawal','payout','Failed payouts','urgent',8,100),
  ('withdrawal_reviews','financial','review_withdrawal','withdrawal','Withdrawal reviews','high',24,110),
  ('reconciliation_exceptions','financial','review_reconciliation_exception','reconciliation_exception','Reconciliation exceptions','high',24,120),
  ('chargebacks','financial','review_reconciliation_exception','chargeback','Chargebacks','urgent',12,130),
  ('post_release_cases','financial','view_financial_ledger','financial_case','Post-release financial cases','high',48,140),
  ('marketplace_incidents','marketplace','manage_incidents','incident','Marketplace incidents','urgent',4,150),
  ('notification_failures','platform','manage_incidents','notification_failure','Notification delivery failures','normal',24,160),
  ('support_cases','support','manage_support_cases','support_case','Support cases','normal',24,170),
  ('security_events','security','view_audit_logs','security_event','Security events','urgent',4,180)
on conflict (queue_key) do update set
  domain=excluded.domain, capability_key=excluded.capability_key, subject_type=excluded.subject_type,
  display_name=excluded.display_name, default_priority=excluded.default_priority,
  target_response_hours=excluded.target_response_hours, sort_order=excluded.sort_order;

create table if not exists public.operational_assignments (
  id uuid primary key default gen_random_uuid(),
  queue_key text not null references public.staff_queues(queue_key) on delete restrict,
  subject_type text not null,
  subject_id uuid not null,
  status text not null default 'unassigned',
  priority text not null default 'normal',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  due_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reason_code text,
  lock_version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint operational_assignments_status_check check (status in (
    'unassigned','assigned','in_progress','waiting_participant','waiting_provider',
    'escalated','resolved','closed')),
  constraint operational_assignments_priority_check check (priority in ('urgent','high','normal','low')),
  constraint operational_assignments_lock_check check (lock_version > 0),
  constraint operational_assignments_assignee_check
    check (status = 'unassigned' or assigned_to is not null or status in ('escalated','closed')),
  unique (queue_key, subject_id)
);
create index if not exists operational_assignments_queue_open_idx
  on public.operational_assignments(queue_key, priority, created_at)
  where status not in ('resolved','closed');
create index if not exists operational_assignments_assignee_idx
  on public.operational_assignments(assigned_to, status, due_at)
  where status not in ('resolved','closed');

create table if not exists public.operational_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.operational_assignments(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  note text,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint operational_assignment_events_note_check
    check (note is null or pg_catalog.length(pg_catalog.btrim(note)) between 1 and 2000),
  constraint operational_assignment_events_action_check check (action in (
    'opened','assigned','reassigned','claimed','status_changed','escalated','resolved','closed','note_added')),
  unique (assignment_id, idempotency_key)
);
create index if not exists operational_assignment_events_assignment_idx
  on public.operational_assignment_events(assignment_id, created_at);

create or replace function private.prevent_operational_event_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Operational assignment history is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_operational_event_mutation() from public, anon, authenticated;
drop trigger if exists operational_assignment_events_immutable on public.operational_assignment_events;
create trigger operational_assignment_events_immutable before update or delete
on public.operational_assignment_events
for each row execute function private.prevent_operational_event_mutation();

-- Staff-private notes never reach a participant and are never returned by a
-- participant-facing projection.
create table if not exists private.operational_case_notes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.operational_assignments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  note text not null,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint operational_case_notes_note_check
    check (pg_catalog.length(pg_catalog.btrim(note)) between 3 and 4000),
  unique (assignment_id, idempotency_key)
);
create index if not exists operational_case_notes_assignment_idx
  on private.operational_case_notes(assignment_id, created_at desc);
revoke all on private.operational_case_notes from public, anon, authenticated;

drop trigger if exists operational_case_notes_immutable on private.operational_case_notes;
create trigger operational_case_notes_immutable before update or delete on private.operational_case_notes
for each row execute function private.prevent_operational_event_mutation();

create or replace function private.staff_queue_capability(p_queue_key text)
returns text language sql stable security definer set search_path='' as $$
  select q.capability_key from public.staff_queues q where q.queue_key = p_queue_key
$$;
revoke all on function private.staff_queue_capability(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Staff session RPCs
-- ---------------------------------------------------------------------------

-- Safe for any authenticated caller: a non-staff account learns only that it
-- is not staff and receives no platform configuration at all.
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
    'displayTimezone', v_config.display_timezone,
    'mfaRequired', v_config.mfa_required,
    'mfaProvider', v_config.mfa_provider,
    'legacyBridgeEnabled', v_config.legacy_staff_bridge_enabled,
    'reauthWindowSeconds', v_config.reauth_window_seconds,
    'reauthValid', private.staff_recent_reauth(v_uid),
    'platformReady', true,
    'breakGlassOnly', v_roles = array['super_administrator']::text[]);
end;
$$;

-- Records that the client completed a re-authentication for this session. It
-- does not itself verify a second factor: no MFA provider is configured, and a
-- production configuration therefore denies staff access entirely.
create or replace function public.staff_reauthenticate()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;
  if pg_catalog.cardinality(private.staff_capability_keys(v_uid)) = 0 then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  insert into private.staff_session_attestations(user_id, session_ref)
  values (v_uid, private.staff_session_ref())
  on conflict (user_id, session_ref) do update set
    attested_at = pg_catalog.now(), revoked_at = null;
  perform private.record_staff_audit(v_uid, null, 'staff_reauthenticated', 'staff_session', null,
    'Staff re-authentication recorded');
  return pg_catalog.jsonb_build_object('reauthValid', true, 'attestedAt', pg_catalog.now());
end;
$$;

create or replace function public.staff_revoke_my_sessions()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update private.staff_session_attestations
    set revoked_at = pg_catalog.now()
    where user_id = v_uid and revoked_at is null;
  get diagnostics v_count = row_count;
  perform private.record_staff_audit(v_uid, null, 'staff_sessions_revoked', 'staff_session', null,
    'Staff session attestations revoked by the account holder');
  return pg_catalog.jsonb_build_object('revoked', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Role administration (dual control: never grant a role to yourself)
-- ---------------------------------------------------------------------------

create or replace function public.staff_grant_role(
  p_user_id uuid, p_role_key text, p_reason text, p_idempotency_key text,
  p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_existing public.staff_role_grants%rowtype; v_id uuid;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'A staff member cannot grant a role to their own account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_roles r where r.role_key = p_role_key) then
    raise exception 'Unknown staff role' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid role grant' using errcode = '22023';
  end if;
  select * into v_existing from public.staff_role_grants g where g.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'duplicate', true);
  end if;
  if exists (select 1 from public.staff_role_grants g
             where g.user_id = p_user_id and g.role_key = p_role_key and g.revoked_at is null) then
    raise exception 'That role is already active for this account' using errcode = '22023';
  end if;
  insert into public.staff_role_grants(user_id, role_key, granted_by, expires_at, reason, idempotency_key)
  values (p_user_id, p_role_key, v_actor, p_expires_at, pg_catalog.btrim(p_reason), p_idempotency_key)
  returning id into v_id;
  perform private.record_staff_audit(v_actor, 'manage_staff_roles', 'staff_role_granted',
    'staff_role_grant', v_id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('roleKey', p_role_key, 'subjectId', p_user_id));
  return pg_catalog.jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

create or replace function public.staff_revoke_role(p_grant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_grant public.staff_role_grants%rowtype;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_grant from public.staff_role_grants g where g.id = p_grant_id for update;
  if v_grant.id is null then raise exception 'Role grant not found' using errcode = 'P0002'; end if;
  if v_grant.revoked_at is not null then
    return pg_catalog.jsonb_build_object('id', p_grant_id, 'duplicate', true);
  end if;
  update public.staff_role_grants
    set revoked_at = pg_catalog.now(), revoked_by = v_actor
    where id = p_grant_id;
  -- Revoking a role also clears the account's session attestations so an
  -- in-flight session cannot keep using a re-authentication it no longer earns.
  update private.staff_session_attestations
    set revoked_at = pg_catalog.now()
    where user_id = v_grant.user_id and revoked_at is null;
  perform private.record_staff_audit(v_actor, 'manage_staff_roles', 'staff_role_revoked',
    'staff_role_grant', p_grant_id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('roleKey', v_grant.role_key, 'subjectId', v_grant.user_id));
  return pg_catalog.jsonb_build_object('id', p_grant_id, 'duplicate', false);
end;
$$;

create or replace function public.get_staff_role_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  return pg_catalog.jsonb_build_object(
    'roles', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'roleKey', r.role_key, 'displayName', r.display_name, 'description', r.description,
        'riskTier', r.risk_tier,
        'capabilities', (select coalesce(pg_catalog.jsonb_agg(rc.capability_key order by rc.capability_key),'[]'::jsonb)
                         from public.staff_role_capabilities rc where rc.role_key = r.role_key)
      ) order by r.sort_order), '[]'::jsonb) from public.staff_roles r),
    'capabilities', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'capabilityKey', c.capability_key, 'domain', c.domain, 'description', c.description,
        'highRisk', c.high_risk, 'dualControl', c.dual_control, 'requiresReauth', c.requires_reauth
      ) order by c.domain, c.capability_key), '[]'::jsonb) from public.staff_capabilities c),
    'grants', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', g.id, 'userId', g.user_id, 'displayName', p.display_name, 'roleKey', g.role_key,
        'grantedAt', g.granted_at, 'expiresAt', g.expires_at, 'revokedAt', g.revoked_at
      ) order by g.granted_at desc), '[]'::jsonb)
      from public.staff_role_grants g left join public.profiles p on p.id = g.user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Queue backlog projections (sanitized, read from domain authorities)
-- ---------------------------------------------------------------------------

create or replace function private.staff_queue_backlog(p_queue_key text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer := least(greatest(coalesce(p_limit,25),1),100); v_result jsonb;
begin
  if p_queue_key = 'identity_verification' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select coalesce(v.submitted_at, v.updated_at) created_at, pg_catalog.jsonb_build_object(
        'subjectId', v.id, 'subjectType','verification', 'createdAt', coalesce(v.submitted_at, v.updated_at),
        'reasonCode', v.status, 'priority', case when v.status='under_review' then 'high' else 'normal' end) item
      from public.provider_verifications v
      where v.status in ('submitted','under_review') order by coalesce(v.submitted_at, v.updated_at) limit v_limit) rows;
  elsif p_queue_key = 'certificate_review' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select c.submitted_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', c.id, 'subjectType','certificate', 'createdAt', c.submitted_at,
        'reasonCode', c.certificate_type, 'priority','normal') item
      from public.provider_certifications c
      where c.status = 'submitted' and c.deleted_at is null order by c.submitted_at limit v_limit) rows;
  elsif p_queue_key = 'open_disputes' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select d.created_at, pg_catalog.jsonb_build_object(
        'subjectId', d.id, 'subjectType','dispute', 'createdAt', d.created_at,
        'reasonCode', d.reason, 'priority', case when d.status='under_review' then 'high' else 'normal' end) item
      from public.disputes d
      where d.status in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review')
      order by d.created_at limit v_limit) rows;
  elsif p_queue_key = 'dispute_evidence_deadlines' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select d.updated_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', d.id, 'subjectType','dispute', 'createdAt', d.updated_at,
        'reasonCode', d.status, 'priority','urgent') item
      from public.disputes d
      where d.status in ('waiting_customer','waiting_worker')
      order by d.updated_at limit v_limit) rows;
  elsif p_queue_key = 'abuse_reports' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select r.created_at, pg_catalog.jsonb_build_object(
        'subjectId', r.id, 'subjectType','trust_report', 'createdAt', r.created_at,
        'reasonCode', r.category, 'priority', case when r.category in ('fraud','dangerous_behavior','illegal_activity')
          then 'urgent' else 'high' end) item
      from public.trust_reports r where r.status in ('submitted','triage')
      order by r.created_at limit v_limit) rows;
  elsif p_queue_key = 'trust_investigations' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select r.created_at, pg_catalog.jsonb_build_object(
        'subjectId', r.id, 'subjectType','trust_report', 'createdAt', r.created_at,
        'reasonCode', r.category, 'priority','high') item
      from public.trust_reports r where r.status = 'investigating'
      order by r.created_at limit v_limit) rows;
  elsif p_queue_key = 'appeals' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select a.created_at, pg_catalog.jsonb_build_object(
        'subjectId', a.id, 'subjectType','trust_appeal', 'createdAt', a.created_at,
        'reasonCode', a.status, 'priority','high') item
      from public.trust_appeals a where a.status in ('submitted','under_review')
      order by a.created_at limit v_limit) rows;
  elsif p_queue_key = 'review_moderation' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select r.created_at, pg_catalog.jsonb_build_object(
        'subjectId', r.id, 'subjectType','review_report', 'createdAt', r.created_at,
        'reasonCode', r.reason, 'priority','normal') item
      from public.review_reports r where r.status in ('submitted','in_review')
      order by r.created_at limit v_limit) rows;
  elsif p_queue_key = 'failed_refunds' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select f.created_at, pg_catalog.jsonb_build_object(
        'subjectId', f.id, 'subjectType','refund', 'createdAt', f.created_at,
        'reasonCode', f.status, 'priority','urgent') item
      from public.financial_refunds f where f.status = 'failed'
      order by f.created_at limit v_limit) rows;
  elsif p_queue_key = 'failed_payouts' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select w.requested_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', w.id, 'subjectType','payout', 'createdAt', w.requested_at,
        'reasonCode', w.status, 'priority','urgent') item
      from public.provider_withdrawal_requests w where w.status = 'failed'
      order by w.requested_at limit v_limit) rows;
  elsif p_queue_key = 'withdrawal_reviews' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select w.requested_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', w.id, 'subjectType','withdrawal', 'createdAt', w.requested_at,
        'reasonCode', w.status, 'priority','high') item
      from public.provider_withdrawal_requests w where w.status in ('requested','under_review')
      order by w.requested_at limit v_limit) rows;
  elsif p_queue_key = 'reconciliation_exceptions' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select e.created_at, pg_catalog.jsonb_build_object(
        'subjectId', e.id, 'subjectType','reconciliation_exception', 'createdAt', e.created_at,
        'reasonCode', e.exception_type, 'priority', case when e.severity='critical' then 'urgent' else 'high' end) item
      from private.reconciliation_exceptions e where e.status in ('open','investigating')
      order by e.created_at limit v_limit) rows;
  elsif p_queue_key = 'chargebacks' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select c.opened_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', c.id, 'subjectType','chargeback', 'createdAt', c.opened_at,
        'reasonCode', c.status, 'priority','urgent', 'dueAt', c.evidence_due_at) item
      from private.payment_chargebacks c where c.status in ('opened','evidence_required','under_review')
      order by c.opened_at limit v_limit) rows;
  elsif p_queue_key = 'post_release_cases' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select f.created_at, pg_catalog.jsonb_build_object(
        'subjectId', f.id, 'subjectType','financial_case', 'createdAt', f.created_at,
        'reasonCode', f.case_type, 'priority','high') item
      from public.provider_financial_cases f where f.status = 'under_review'
      order by f.created_at limit v_limit) rows;
  elsif p_queue_key = 'notification_failures' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select a.attempted_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', a.id, 'subjectType','notification_failure', 'createdAt', a.attempted_at,
        'reasonCode', coalesce(a.provider_code, a.status), 'priority','normal') item
      from private.notification_delivery_attempts a where a.status = 'failed'
      order by a.attempted_at limit v_limit) rows;
  elsif p_queue_key = 'support_cases' then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select t.created_at, pg_catalog.jsonb_build_object(
        'subjectId', t.id, 'subjectType','support_case', 'createdAt', t.created_at,
        'reasonCode', coalesce(t.category,'other'), 'priority', coalesce(t.priority,'normal')) item
      from public.support_tickets t where t.status in ('open','in_progress','waiting_participant')
      order by t.created_at limit v_limit) rows;
  elsif p_queue_key in ('marketplace_incidents','security_events') then
    select coalesce(pg_catalog.jsonb_agg(item order by created_at), '[]'::jsonb) into v_result from (
      select i.started_at created_at, pg_catalog.jsonb_build_object(
        'subjectId', i.id, 'subjectType','incident', 'createdAt', i.started_at,
        'reasonCode', i.category, 'priority', case when i.severity in ('sev1','sev2') then 'urgent' else 'high' end) item
      from public.operational_incidents i
      where i.status in ('open','mitigating','monitoring')
        and ((p_queue_key = 'security_events' and i.category in ('security_incident','authentication_incident'))
          or (p_queue_key = 'marketplace_incidents' and i.category not in ('security_incident','authentication_incident')))
      order by i.started_at limit v_limit) rows;
  else
    v_result := '[]'::jsonb;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;
revoke all on function private.staff_queue_backlog(text,integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Operational home and queue reads
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_home()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_caps text[]; v_queues jsonb;
begin
  v_actor := private.require_staff_capability('view_operations_home');
  v_caps := private.staff_capability_keys(v_actor);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'queueKey', q.queue_key, 'domain', q.domain, 'displayName', q.display_name,
    'defaultPriority', q.default_priority, 'targetResponseHours', q.target_response_hours,
    'openAssignments', (select pg_catalog.count(*)::integer from public.operational_assignments a
                        where a.queue_key = q.queue_key and a.status not in ('resolved','closed')),
    'assignedToMe', (select pg_catalog.count(*)::integer from public.operational_assignments a
                     where a.queue_key = q.queue_key and a.assigned_to = v_actor
                       and a.status not in ('resolved','closed')),
    'overdue', (select pg_catalog.count(*)::integer from public.operational_assignments a
                where a.queue_key = q.queue_key and a.status not in ('resolved','closed')
                  and a.due_at is not null and a.due_at < pg_catalog.now()),
    'backlog', pg_catalog.jsonb_array_length(private.staff_queue_backlog(q.queue_key, 100))
  ) order by q.sort_order), '[]'::jsonb) into v_queues
  from public.staff_queues q where q.capability_key = any(v_caps);
  return pg_catalog.jsonb_build_object(
    'queues', v_queues,
    'myOpenCases', (select pg_catalog.count(*)::integer from public.operational_assignments a
                    where a.assigned_to = v_actor and a.status not in ('resolved','closed')),
    'myOverdueCases', (select pg_catalog.count(*)::integer from public.operational_assignments a
                       where a.assigned_to = v_actor and a.status not in ('resolved','closed')
                         and a.due_at is not null and a.due_at < pg_catalog.now()),
    'activeIncidents', (select pg_catalog.count(*)::integer from public.operational_incidents i
                        where i.status in ('open','mitigating','monitoring')),
    'generatedAt', pg_catalog.now());
end;
$$;

create or replace function public.get_staff_queue(
  p_queue_key text, p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid; v_capability text; v_queue public.staff_queues%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,25),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_items jsonb;
begin
  select * into v_queue from public.staff_queues q where q.queue_key = p_queue_key;
  if v_queue.queue_key is null then raise exception 'Unknown queue' using errcode = '22023'; end if;
  v_capability := v_queue.capability_key;
  v_actor := private.require_staff_capability(v_capability);
  if p_status is not null and p_status not in (
    'unassigned','assigned','in_progress','waiting_participant','waiting_provider',
    'escalated','resolved','closed') then
    raise exception 'Invalid queue filter' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'assignmentId', a.id, 'subjectType', a.subject_type, 'subjectId', a.subject_id,
    'status', a.status, 'priority', a.priority, 'reasonCode', a.reason_code,
    'assignedTo', a.assigned_to, 'assignedToName', p.display_name,
    'dueAt', a.due_at, 'createdAt', a.created_at, 'updatedAt', a.updated_at,
    'lockVersion', a.lock_version,
    'ageSeconds', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - a.created_at))::bigint,
    'overdue', a.due_at is not null and a.due_at < pg_catalog.now()
  ) order by
      case a.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      a.created_at), '[]'::jsonb) into v_items
  from (
    select * from public.operational_assignments a2
    where a2.queue_key = p_queue_key
      and (p_status is null or a2.status = p_status)
      and (p_status is not null or a2.status not in ('resolved','closed'))
    order by
      case a2.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      a2.created_at
    limit v_limit offset v_offset) a
  left join public.profiles p on p.id = a.assigned_to;
  return pg_catalog.jsonb_build_object(
    'queueKey', p_queue_key,
    'displayName', v_queue.display_name,
    'subjectType', v_queue.subject_type,
    'targetResponseHours', v_queue.target_response_hours,
    'items', v_items,
    'backlog', case when v_offset = 0 then private.staff_queue_backlog(p_queue_key, v_limit) else '[]'::jsonb end,
    'generatedAt', pg_catalog.now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Case assignment (idempotent, row locked, optimistic version)
-- ---------------------------------------------------------------------------

create or replace function public.staff_open_case(
  p_queue_key text, p_subject_id uuid, p_priority text, p_reason_code text,
  p_idempotency_key text, p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_queue public.staff_queues%rowtype; v_existing public.operational_assignments%rowtype; v_id uuid;
begin
  select * into v_queue from public.staff_queues q where q.queue_key = p_queue_key;
  if v_queue.queue_key is null then raise exception 'Unknown queue' using errcode = '22023'; end if;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  if p_subject_id is null then raise exception 'A subject is required' using errcode = '22023'; end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid case' using errcode = '22023';
  end if;
  select * into v_existing from public.operational_assignments a
  where a.queue_key = p_queue_key and a.subject_id = p_subject_id;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('assignmentId', v_existing.id, 'duplicate', true,
      'status', v_existing.status, 'lockVersion', v_existing.lock_version);
  end if;
  insert into public.operational_assignments(
    queue_key, subject_type, subject_id, priority, reason_code, due_at, created_by)
  values (p_queue_key, v_queue.subject_type, p_subject_id,
          coalesce(nullif(p_priority,''), v_queue.default_priority), p_reason_code,
          coalesce(p_due_at, case when v_queue.target_response_hours is null then null
            else pg_catalog.now() + pg_catalog.make_interval(hours => v_queue.target_response_hours) end),
          v_actor)
  returning id into v_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, idempotency_key)
  values (v_id, null, 'unassigned', 'opened', v_actor, p_idempotency_key);
  perform private.record_staff_audit(v_actor, v_queue.capability_key, 'operational_case_opened',
    'operational_assignment', v_id, 'Operational case opened',
    pg_catalog.jsonb_build_object('queueKey', p_queue_key));
  return pg_catalog.jsonb_build_object('assignmentId', v_id, 'duplicate', false,
    'status', 'unassigned', 'lockVersion', 1);
end;
$$;

create or replace function public.staff_assign_case(
  p_assignment_id uuid, p_assignee_id uuid, p_expected_version integer,
  p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
  v_event uuid; v_action text; v_status text;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id for update;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  -- Claiming your own case needs only the queue capability; assigning someone
  -- else additionally needs the assignment capability.
  if p_assignee_id is distinct from (select auth.uid()) then
    v_actor := private.require_staff_capability('assign_cases');
    perform private.require_staff_capability(v_queue.capability_key);
  else
    v_actor := private.require_staff_capability(v_queue.capability_key);
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid assignment' using errcode = '22023';
  end if;
  select e.id into v_event from public.operational_assignment_events e
  where e.assignment_id = p_assignment_id and e.idempotency_key = p_idempotency_key;
  if v_event is not null then
    return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', true,
      'status', v_row.status, 'lockVersion', v_row.lock_version);
  end if;
  -- No silent overwrite: the caller must have seen the current version.
  if p_expected_version is null or p_expected_version <> v_row.lock_version then
    raise exception 'This case changed since you opened it' using errcode = '40001';
  end if;
  if v_row.status in ('resolved','closed') then
    raise exception 'A closed case cannot be assigned' using errcode = '22023';
  end if;
  if p_assignee_id is null then raise exception 'An assignee is required' using errcode = '22023'; end if;
  if pg_catalog.cardinality(private.staff_capability_keys(p_assignee_id)) = 0
     or not (v_queue.capability_key = any(private.staff_capability_keys(p_assignee_id))) then
    raise exception 'That staff member cannot work this queue' using errcode = '22023';
  end if;
  v_action := case when v_row.assigned_to is null then
      (case when p_assignee_id = v_actor then 'claimed' else 'assigned' end)
    else 'reassigned' end;
  v_status := case when v_row.status = 'unassigned' then 'assigned' else v_row.status end;
  update public.operational_assignments
    set assigned_to = p_assignee_id,
        assigned_at = pg_catalog.now(),
        status = v_status,
        lock_version = lock_version + 1,
        updated_at = pg_catalog.now()
    where id = p_assignment_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, assignee_id, note, idempotency_key)
  values (p_assignment_id, v_row.status, v_status, v_action, v_actor, p_assignee_id,
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  perform private.notify_staff(p_assignee_id, 'staff_case_assigned',
    pg_catalog.jsonb_build_object('assignment_id', p_assignment_id),
    'assignment:'||p_assignment_id::text||':'||p_idempotency_key);
  perform private.record_staff_audit(v_actor, v_queue.capability_key, 'operational_case_'||v_action,
    'operational_assignment', p_assignment_id, 'Case ownership changed',
    pg_catalog.jsonb_build_object('assigneeId', p_assignee_id));
  return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', false,
    'status', v_status, 'lockVersion', v_row.lock_version + 1);
end;
$$;

create or replace function public.staff_transition_case(
  p_assignment_id uuid, p_status text, p_expected_version integer,
  p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
  v_event uuid; v_action text;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id for update;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  if p_status not in ('assigned','in_progress','waiting_participant','waiting_provider',
                      'escalated','resolved','closed') then
    raise exception 'Invalid case status' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;
  select e.id into v_event from public.operational_assignment_events e
  where e.assignment_id = p_assignment_id and e.idempotency_key = p_idempotency_key;
  if v_event is not null then
    return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', true,
      'status', v_row.status, 'lockVersion', v_row.lock_version);
  end if;
  if p_expected_version is null or p_expected_version <> v_row.lock_version then
    raise exception 'This case changed since you opened it' using errcode = '40001';
  end if;
  if v_row.status = 'closed' then
    raise exception 'A closed case cannot change' using errcode = '22023';
  end if;
  if p_status <> 'closed' and v_row.assigned_to is null then
    raise exception 'Assign the case before moving it' using errcode = '22023';
  end if;
  v_action := case p_status when 'escalated' then 'escalated' when 'resolved' then 'resolved'
    when 'closed' then 'closed' else 'status_changed' end;
  update public.operational_assignments
    set status = p_status,
        escalated_at = case when p_status = 'escalated' then pg_catalog.now() else escalated_at end,
        resolved_at = case when p_status = 'resolved' then pg_catalog.now() else resolved_at end,
        closed_at = case when p_status = 'closed' then pg_catalog.now() else closed_at end,
        lock_version = lock_version + 1,
        updated_at = pg_catalog.now()
    where id = p_assignment_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, assignee_id, note, idempotency_key)
  values (p_assignment_id, v_row.status, p_status, v_action, v_actor, v_row.assigned_to,
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  if p_status = 'escalated' then
    perform private.notify_staff(v_row.assigned_to, 'staff_case_escalated',
      pg_catalog.jsonb_build_object('assignment_id', p_assignment_id),
      'escalation:'||p_assignment_id::text||':'||p_idempotency_key);
  end if;
  perform private.record_staff_audit(v_actor, v_queue.capability_key, 'operational_case_'||v_action,
    'operational_assignment', p_assignment_id,
    coalesce(nullif(pg_catalog.btrim(coalesce(p_note,'')),''),'Case status changed'),
    pg_catalog.jsonb_build_object('toStatus', p_status));
  return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', false,
    'status', p_status, 'lockVersion', v_row.lock_version + 1);
end;
$$;

create or replace function public.staff_add_case_note(
  p_assignment_id uuid, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype; v_id uuid;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note,''))) not between 3 and 4000 then
    raise exception 'A note is required' using errcode = '22023';
  end if;
  select n.id into v_id from private.operational_case_notes n
  where n.assignment_id = p_assignment_id and n.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', true);
  end if;
  insert into private.operational_case_notes(assignment_id, author_id, note, idempotency_key)
  values (p_assignment_id, v_actor, pg_catalog.btrim(p_note), p_idempotency_key)
  returning id into v_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, idempotency_key)
  values (p_assignment_id, v_row.status, v_row.status, 'note_added', v_actor, 'note:'||p_idempotency_key)
  on conflict do nothing;
  return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', false);
end;
$$;

create or replace function public.get_staff_case(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  perform private.staff_log_access(v_actor, 'case_notes', v_queue.capability_key,
    'assignment:'||p_assignment_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'assignmentId', v_row.id, 'queueKey', v_row.queue_key, 'subjectType', v_row.subject_type,
    'subjectId', v_row.subject_id, 'status', v_row.status, 'priority', v_row.priority,
    'reasonCode', v_row.reason_code, 'assignedTo', v_row.assigned_to, 'assignedAt', v_row.assigned_at,
    'dueAt', v_row.due_at, 'escalatedAt', v_row.escalated_at, 'resolvedAt', v_row.resolved_at,
    'closedAt', v_row.closed_at, 'lockVersion', v_row.lock_version, 'createdAt', v_row.created_at,
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status,
        'actorId', e.actor_id, 'assigneeId', e.assignee_id, 'note', e.note, 'createdAt', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      from public.operational_assignment_events e where e.assignment_id = p_assignment_id),
    'privateNotes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', n.id, 'authorId', n.author_id, 'note', n.note, 'createdAt', n.created_at
      ) order by n.created_at), '[]'::jsonb)
      from private.operational_case_notes n where n.assignment_id = p_assignment_id));
end;
$$;

create or replace function public.get_staff_workload()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('assign_cases');
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'staffId', g.user_id, 'displayName', p.display_name,
      'roles', roles.role_keys,
      'openCases', (select pg_catalog.count(*)::integer from public.operational_assignments a
                    where a.assigned_to = g.user_id and a.status not in ('resolved','closed')),
      'overdueCases', (select pg_catalog.count(*)::integer from public.operational_assignments a
                       where a.assigned_to = g.user_id and a.status not in ('resolved','closed')
                         and a.due_at is not null and a.due_at < pg_catalog.now())
    ) order by p.display_name)
    from (select distinct user_id from public.staff_role_grants where revoked_at is null) g
    join public.profiles p on p.id = g.user_id
    cross join lateral (
      select coalesce(pg_catalog.jsonb_agg(r.role_key order by r.role_key),'[]'::jsonb) role_keys
      from public.staff_role_grants r where r.user_id = g.user_id and r.revoked_at is null) roles
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Support cases — the dormant WPS-001 support tables, extended
-- ---------------------------------------------------------------------------
--
-- A support case is for matters that are NOT already a dispute (WPS-013) or an
-- abuse report (WPS-016). It never duplicates either; escalation records a
-- pointer to the authoritative domain record instead.

alter table public.support_tickets
  add column if not exists category text not null default 'other',
  add column if not exists priority text not null default 'normal',
  add column if not exists escalated_to_type text,
  add column if not exists escalated_to_id uuid,
  add column if not exists opened_by_staff boolean not null default false,
  add column if not exists closed_at timestamptz,
  add column if not exists last_reply_at timestamptz,
  add column if not exists idempotency_key text;

update public.support_tickets set
  status = case when status in ('open','in_progress','waiting_participant','escalated','resolved','closed')
                then status else 'open' end,
  category = case when category in ('account_access','booking_help','worker_onboarding','verification_help',
                                    'payment_question','withdrawal_question','technical_issue','app_feedback','other')
                  then category else 'other' end,
  priority = case when priority in ('urgent','high','normal','low') then priority else 'normal' end;

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check,
  drop constraint if exists support_tickets_category_check,
  drop constraint if exists support_tickets_priority_check,
  drop constraint if exists support_tickets_subject_check,
  drop constraint if exists support_tickets_escalation_check,
  add constraint support_tickets_status_check check (status in (
    'open','in_progress','waiting_participant','escalated','resolved','closed')),
  add constraint support_tickets_category_check check (category in (
    'account_access','booking_help','worker_onboarding','verification_help',
    'payment_question','withdrawal_question','technical_issue','app_feedback','other')),
  add constraint support_tickets_priority_check check (priority in ('urgent','high','normal','low')),
  add constraint support_tickets_subject_check
    check (pg_catalog.length(pg_catalog.btrim(subject)) between 3 and 200),
  -- Escalation points at the authoritative domain record; it never copies it.
  add constraint support_tickets_escalation_check check (
    (escalated_to_type is null and escalated_to_id is null)
    or (escalated_to_type in ('dispute','trust_report','financial_case','incident') and escalated_to_id is not null));

create index if not exists support_tickets_open_idx
  on public.support_tickets(created_at) where status in ('open','in_progress','waiting_participant');

alter table public.support_messages
  add column if not exists visibility text not null default 'participants',
  add column if not exists idempotency_key text;
alter table public.support_messages
  drop constraint if exists support_messages_visibility_check,
  drop constraint if exists support_messages_body_check,
  add constraint support_messages_visibility_check check (visibility in ('participants','staff')),
  add constraint support_messages_body_check
    check (pg_catalog.length(pg_catalog.btrim(body)) between 1 and 4000);
create index if not exists support_messages_ticket_idx
  on public.support_messages(ticket_id, created_at);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null default 'staff',
  note text,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint support_ticket_events_actor_role_check check (actor_role in ('participant','staff','system')),
  constraint support_ticket_events_action_check check (action in (
    'opened','replied','assigned','status_changed','escalated','resolved','closed','note_added')),
  unique (ticket_id, idempotency_key)
);
create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events(ticket_id, created_at);

create or replace function private.prevent_support_event_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Support case history is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_support_event_mutation() from public, anon, authenticated;
drop trigger if exists support_ticket_events_immutable on public.support_ticket_events;
create trigger support_ticket_events_immutable before update or delete on public.support_ticket_events
for each row execute function private.prevent_support_event_mutation();

-- ---------------------------------------------------------------------------
-- 15. Incidents (manual: no automated detection is claimed or implemented)
-- ---------------------------------------------------------------------------

create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_ref text not null unique,
  category text not null,
  severity text not null,
  status text not null default 'open',
  started_at timestamptz not null default pg_catalog.now(),
  detected_at timestamptz,
  commander_id uuid references public.profiles(id) on delete set null,
  affected_systems text[] not null default '{}'::text[],
  internal_summary text not null,
  public_summary text,
  resolved_at timestamptz,
  postmortem_reference text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint operational_incidents_category_check check (category in (
    'payment_provider_outage','supabase_outage','notification_outage','marketplace_matching_failure',
    'storage_failure','authentication_incident','security_incident','data_integrity','migration_failure','other')),
  constraint operational_incidents_severity_check check (severity in ('sev1','sev2','sev3','sev4')),
  constraint operational_incidents_status_check check (status in ('open','mitigating','monitoring','resolved','closed')),
  constraint operational_incidents_summary_check
    check (pg_catalog.length(pg_catalog.btrim(internal_summary)) between 10 and 4000),
  constraint operational_incidents_public_summary_check
    check (public_summary is null or pg_catalog.length(pg_catalog.btrim(public_summary)) between 10 and 2000),
  constraint operational_incidents_resolved_check
    check (status not in ('resolved','closed') or resolved_at is not null),
  constraint operational_incidents_systems_check
    check (pg_catalog.cardinality(affected_systems) between 0 and 20)
);
create index if not exists operational_incidents_open_idx
  on public.operational_incidents(started_at desc) where status in ('open','mitigating','monitoring');

create table if not exists public.operational_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.operational_incidents(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  detail text not null,
  created_at timestamptz not null default pg_catalog.now(),
  idempotency_key text not null,
  constraint operational_incident_events_type_check check (event_type in (
    'opened','update','mitigation','severity_changed','commander_changed','status_changed','resolved','closed','postmortem')),
  constraint operational_incident_events_detail_check
    check (pg_catalog.length(pg_catalog.btrim(detail)) between 3 and 4000),
  unique (incident_id, idempotency_key)
);
create index if not exists operational_incident_events_incident_idx
  on public.operational_incident_events(incident_id, created_at);
create index if not exists operational_incident_events_idempotency_idx
  on public.operational_incident_events(idempotency_key);

drop trigger if exists operational_incident_events_immutable on public.operational_incident_events;
create trigger operational_incident_events_immutable before update or delete
on public.operational_incident_events
for each row execute function private.prevent_support_event_mutation();

-- ---------------------------------------------------------------------------
-- 16. Configuration change control
-- ---------------------------------------------------------------------------
--
-- WPS-017 owns the CHANGE-CONTROL RECORD for operational configuration:
-- versions, validation, reason, approval, activation, and immutable history.
-- It does NOT become the authority for a domain's values. `applied_by` records
-- who applies an activated version: `wps017` for what this WPS genuinely owns,
-- `domain_runbook` where the authoritative WPS applies it through its own path.

create table if not exists private.staff_configuration_domains (
  domain_key text primary key,
  display_name text not null,
  capability_key text not null references public.staff_capabilities(capability_key) on delete restrict,
  authoritative_owner text not null,
  applied_by text not null default 'domain_runbook',
  requires_approval boolean not null default true,
  allowed_keys text[] not null,
  constraint staff_configuration_domains_applied_check check (applied_by in ('wps017','domain_runbook')),
  constraint staff_configuration_domains_keys_check
    check (pg_catalog.cardinality(allowed_keys) between 1 and 40)
);

insert into private.staff_configuration_domains(domain_key, display_name, capability_key, authoritative_owner, applied_by, requires_approval, allowed_keys) values
  ('marketplace_mode','Marketplace modes','manage_marketplace_configuration','WPS-008','domain_runbook',true,
    array['enabled','schedulerEnabled','emergencyEnabled','rescueModeEnabled']),
  ('marketplace_ranking','Ranking configuration','manage_marketplace_configuration','WPS-008','domain_runbook',true,
    array['version','qualityFloor','fairnessBound','newWorkerBound']),
  ('marketplace_waves','Invitation waves','manage_marketplace_configuration','WPS-008','domain_runbook',true,
    array['firstWaveSize','maximumInvitations','usefulQuoteTarget','waveCadenceSeconds','maximumRadiusKm']),
  ('notification_policy','Notification configuration','manage_notification_configuration','WPS-014','domain_runbook',true,
    array['requiredActionBypassesQuietHours','reminderAttemptLimit']),
  ('reminder_policy','Reminder configuration','manage_notification_configuration','WPS-014','domain_runbook',true,
    array['schedulerEnabled','reminderAttemptLimit']),
  ('payment_mode','Payment modes','manage_kill_switches','WPS-015','domain_runbook',true,
    array['gatewayMode','maintenanceMode','maintenanceReason']),
  ('payout_mode','Payout modes','manage_kill_switches','WPS-015','domain_runbook',true,
    array['payoutMode']),
  ('release_scheduler','Release scheduler flag','manage_kill_switches','WPS-007','domain_runbook',true,
    array['automaticReleaseSchedulerEnabled']),
  ('call_relay','Call relay mode','manage_notification_configuration','WPS-009','domain_runbook',true,
    array['relayMode']),
  ('trust_policy','Trust policy','manage_marketplace_configuration','WPS-016','domain_runbook',true,
    array['appealWindowDays','restrictionDefaultDays']),
  ('review_policy','Review edit window','manage_marketplace_configuration','WPS-011','domain_runbook',true,
    array['editWindowHours','moderationHoldEnabled']),
  ('dispute_policy','Dispute policy','manage_marketplace_configuration','WPS-013','domain_runbook',true,
    array['eligibilityWindowDays','evidenceDeadlineHours','maxEvidenceBytes']),
  ('upload_limits','Upload limits','manage_marketplace_configuration','WPS-010','domain_runbook',true,
    array['maxImageBytes','maxDocumentBytes','maxPortfolioImages']),
  ('maintenance','Maintenance modes','manage_kill_switches','WPS-017','wps017',true,
    array['readOnlyMessageEn','readOnlyMessageAr','maintenanceActive']),
  ('admin_platform','Admin platform settings','manage_staff_roles','WPS-017','wps017',true,
    array['reauthWindowSeconds','searchRateLimitPerMinute','exportRowLimit','analyticsMinimumCell'])
on conflict (domain_key) do update set
  display_name=excluded.display_name, capability_key=excluded.capability_key,
  authoritative_owner=excluded.authoritative_owner, applied_by=excluded.applied_by,
  requires_approval=excluded.requires_approval, allowed_keys=excluded.allowed_keys;
revoke all on private.staff_configuration_domains from public, anon, authenticated;

create table if not exists private.staff_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  domain_key text not null references private.staff_configuration_domains(domain_key) on delete restrict,
  environment text not null,
  version integer not null,
  payload jsonb not null,
  status text not null default 'draft',
  change_reason text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  rolled_back_from integer,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_configuration_versions_env_check check (environment in ('local','staging','production')),
  constraint staff_configuration_versions_status_check
    check (status in ('draft','pending_approval','active','superseded','rejected')),
  constraint staff_configuration_versions_reason_check
    check (pg_catalog.length(pg_catalog.btrim(change_reason)) between 5 and 1000),
  constraint staff_configuration_versions_version_check check (version > 0),
  constraint staff_configuration_versions_payload_check check (pg_catalog.jsonb_typeof(payload) = 'object'),
  -- An approver is always recorded before a version can be active.
  constraint staff_configuration_versions_approval_check
    check (status <> 'active' or (approved_by is not null and activated_at is not null)),
  unique (domain_key, environment, version)
);
create unique index if not exists staff_configuration_active_unique_idx
  on private.staff_configuration_versions(domain_key, environment) where status = 'active';
revoke all on private.staff_configuration_versions from public, anon, authenticated;

create or replace function private.prevent_staff_configuration_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Configuration history is immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.domain_key is distinct from old.domain_key
     or new.environment is distinct from old.environment
     or new.version is distinct from old.version
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.change_reason is distinct from old.change_reason
     or (old.status <> 'draft' and new.payload is distinct from old.payload) then
    raise exception 'Configuration history is immutable' using errcode = '55000';
  end if;
  if old.status in ('superseded','rejected') and new.status is distinct from old.status then
    raise exception 'Configuration history is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_staff_configuration_mutation() from public, anon, authenticated;
drop trigger if exists staff_configuration_versions_immutable on private.staff_configuration_versions;
create trigger staff_configuration_versions_immutable before update or delete
on private.staff_configuration_versions
for each row execute function private.prevent_staff_configuration_mutation();

-- Schema validation. Unknown keys, secret-looking keys, oversized values, and
-- nested objects are all rejected, so no arbitrary JSON can be stored.
create or replace function private.staff_configuration_payload_valid(p_domain_key text, p_payload jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_allowed text[]; v_key text; v_value jsonb;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then return false; end if;
  select d.allowed_keys into v_allowed from private.staff_configuration_domains d where d.domain_key = p_domain_key;
  if v_allowed is null then return false; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_payload)) not between 1 and 40 then
    return false;
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then return false; end if;
    -- A configuration interface never stores a secret value.
    if v_key ~* '(secret|token|password|credential|signature|api_?key|private_?key)' then return false; end if;
    v_value := p_payload -> v_key;
    if pg_catalog.jsonb_typeof(v_value) not in ('boolean','number','string') then return false; end if;
    if pg_catalog.jsonb_typeof(v_value) = 'string'
       and pg_catalog.length(v_value #>> '{}') > 300 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.staff_configuration_payload_valid(text,jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 17. Feature flags — server authoritative, disabled by default, fail closed
-- ---------------------------------------------------------------------------

create table if not exists private.staff_feature_flags (
  flag_key text not null,
  environment text not null,
  enabled boolean not null default false,
  rollout_percentage integer not null default 0,
  audience text not null default 'none',
  owner_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  review_by date,
  expires_at timestamptz,
  is_kill_switch boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (flag_key, environment),
  constraint staff_feature_flags_key_check check (flag_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  -- A security control is never implemented as a feature flag.
  constraint staff_feature_flags_not_security_check
    check (flag_key !~ '^(rls|auth|security|capability|permission|role|staff_access)_'),
  constraint staff_feature_flags_env_check check (environment in ('local','staging','production')),
  constraint staff_feature_flags_rollout_check check (rollout_percentage between 0 and 100),
  constraint staff_feature_flags_audience_check check (audience in ('none','staff','customer','worker','all')),
  constraint staff_feature_flags_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 5 and 500),
  -- A flag that is on must name an audience; `none` means nobody.
  constraint staff_feature_flags_enabled_audience_check
    check (not enabled or audience <> 'none')
);
revoke all on private.staff_feature_flags from public, anon, authenticated;

create table if not exists private.staff_feature_flag_history (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  environment text not null,
  previous_state jsonb not null,
  next_state jsonb not null,
  reason text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default pg_catalog.now()
);
revoke all on private.staff_feature_flag_history from public, anon, authenticated;
drop trigger if exists staff_feature_flag_history_immutable on private.staff_feature_flag_history;
create trigger staff_feature_flag_history_immutable before update or delete
on private.staff_feature_flag_history
for each row execute function private.prevent_staff_audit_mutation();

insert into private.staff_feature_flags(flag_key, environment, enabled, audience, reason, is_kill_switch) values
  ('marketplace_activation','local',false,'none','Marketplace activation stays gated until WPS-008 operational sign-off.',false),
  ('online_payments','local',false,'none','Online payments stay disabled until a provider decision is recorded.',false),
  ('payouts','local',false,'none','Payouts stay disabled until a payout provider is authorized.',false),
  ('push_notifications','local',false,'none','Push stays disabled: WPS-014 keeps delivery and token registration off.',false),
  ('call_relay','local',false,'none','Call relay stays disabled: WPS-009 exposes no telephony.',false),
  ('emergency_requests','local',false,'none','Emergency requests stay gated pending operational readiness.',false),
  ('rescue_mode','local',false,'none','Rescue Mode stays gated pending operational readiness.',false),
  ('new_profile_ui','local',false,'none','New worker profile UI is not released.',false),
  ('new_review_ui','local',false,'none','New review UI is not released.',false),
  ('staff_beta_tools','local',false,'none','Staff-only beta tools are not released.',false)
on conflict (flag_key, environment) do nothing;

-- ---------------------------------------------------------------------------
-- 18. Kill switches and maintenance
-- ---------------------------------------------------------------------------
--
-- A kill switch only ever RESTRICTS. It never enables anything, never deletes
-- data, and never touches immutable history. Where the authoritative domain
-- already owns a maintenance control, the switch operates that domain control
-- through its own column rather than shadowing it.

create table if not exists private.staff_kill_switches (
  switch_key text primary key,
  display_name text not null,
  domain_authority text not null,
  server_enforced boolean not null default false,
  enforcement_note text not null,
  active boolean not null default false,
  reason text,
  prior_state jsonb not null default '{}'::jsonb,
  activated_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  cleared_by uuid references public.profiles(id) on delete set null,
  cleared_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint staff_kill_switches_reason_check
    check (not active or pg_catalog.length(pg_catalog.btrim(coalesce(reason,''))) between 5 and 500)
);
revoke all on private.staff_kill_switches from public, anon, authenticated;

create table if not exists private.staff_kill_switch_events (
  id uuid primary key default gen_random_uuid(),
  switch_key text not null,
  action text not null,
  reason text not null,
  environment text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_kill_switch_events_action_check check (action in ('activated','cleared'))
);
revoke all on private.staff_kill_switch_events from public, anon, authenticated;
drop trigger if exists staff_kill_switch_events_immutable on private.staff_kill_switch_events;
create trigger staff_kill_switch_events_immutable before update or delete
on private.staff_kill_switch_events
for each row execute function private.prevent_staff_audit_mutation();

insert into private.staff_kill_switches(switch_key, display_name, domain_authority, server_enforced, enforcement_note) values
  ('online_payment_methods','Disable online payment methods','WPS-015',true,
   'Sets private.payment_method_availability.enabled=false for every non-cash method through the WPS-015 availability table.'),
  ('payments_maintenance','Payment maintenance mode','WPS-015',true,
   'Sets private.payment_configuration.maintenance_mode=true, the WPS-015 maintenance control.'),
  ('payouts','Disable payouts','WPS-015',true,
   'Forces private.payment_configuration.payout_mode to disabled through the WPS-015 configuration column.'),
  ('new_marketplace_requests','Disable new marketplace requests','WPS-008',true,
   'Sets private.marketplace_configuration.enabled=false, the WPS-008 activation control.'),
  ('emergency_requests','Disable Emergency','WPS-008',false,
   'Advisory: surfaced by get_platform_operational_status; Emergency eligibility stays a WPS-008 decision.'),
  ('rescue_mode','Disable Rescue Mode','WPS-008',false,
   'Advisory: surfaced by get_platform_operational_status; Rescue Mode stays a WPS-008 decision.'),
  ('uploads','Disable uploads','WPS-010',false,
   'Advisory: surfaced to clients; storage policies are unchanged and no object is deleted.'),
  ('push_registration','Disable push registration','WPS-014',true,
   'Already permanently disabled: WPS-014 constrains token_registration_enabled to false.'),
  ('read_only_maintenance','Read-only maintenance message','WPS-017',true,
   'Surfaces a read-only banner. Existing bookings, chat, and history are untouched.')
on conflict (switch_key) do update set
  display_name=excluded.display_name, domain_authority=excluded.domain_authority,
  server_enforced=excluded.server_enforced, enforcement_note=excluded.enforcement_note;

-- ---------------------------------------------------------------------------
-- 19. Export catalog and requests (fail closed, column allowlisted)
-- ---------------------------------------------------------------------------

create table if not exists private.staff_export_catalog (
  report_key text primary key,
  display_name text not null,
  capability_key text not null references public.staff_capabilities(capability_key) on delete restrict,
  sensitive boolean not null default true,
  column_allowlist text[] not null,
  constraint staff_export_catalog_columns_check
    check (pg_catalog.cardinality(column_allowlist) between 1 and 20)
);
insert into private.staff_export_catalog(report_key, display_name, capability_key, sensitive, column_allowlist) values
  ('queue_throughput','Queue throughput','export_operational_report',false,
    array['queueKey','opened','resolved','closed','medianHours']),
  ('dispute_outcomes','Dispute outcomes','export_operational_report',true,
    array['disputeId','reason','resolutionType','openedAt','resolvedAt']),
  ('verification_decisions','Verification decisions','export_operational_report',true,
    array['verificationId','status','submittedAt','reviewedAt']),
  ('reconciliation_exceptions','Reconciliation exceptions','export_operational_report',true,
    array['exceptionId','exceptionType','severity','status','createdAt']),
  ('marketplace_daily','Marketplace daily summary','export_operational_report',false,
    array['day','requestsCreated','requestsWithQuotes','requestsExpired','noProviderOutcomes'])
on conflict (report_key) do update set
  display_name=excluded.display_name, capability_key=excluded.capability_key,
  sensitive=excluded.sensitive, column_allowlist=excluded.column_allowlist;
revoke all on private.staff_export_catalog from public, anon, authenticated;

create table if not exists private.staff_export_requests (
  id uuid primary key default gen_random_uuid(),
  report_key text not null references private.staff_export_catalog(report_key) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  range_start date not null,
  range_end date not null,
  row_limit integer not null,
  status text not null default 'approved',
  expires_at timestamptz not null,
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint staff_export_requests_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 10 and 1000),
  constraint staff_export_requests_range_check
    check (range_end >= range_start and range_end - range_start <= 366),
  constraint staff_export_requests_status_check check (status in ('approved','expired','revoked')),
  constraint staff_export_requests_limit_check check (row_limit between 1 and 5000),
  unique (idempotency_key)
);
revoke all on private.staff_export_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20. Global safe search (restricted, rate limited, audited)
-- ---------------------------------------------------------------------------
--
-- There is no wildcard, no prefix scan over names, no enumeration, and no
-- national-ID search of any kind. A free-text lookup is limited to an exact
-- verified phone or email and requires the contact-details capability.

create or replace function private.staff_search_shape(p_kind text, p_query text)
returns text language sql immutable set search_path='' as $$
  select coalesce(p_kind,'any')||':'||pg_catalog.left(
    pg_catalog.encode(extensions.digest(pg_catalog.lower(pg_catalog.btrim(p_query)),'sha256'),'hex'), 16)
$$;
revoke all on function private.staff_search_shape(text,text) from public, anon, authenticated;

create or replace function public.staff_safe_search(p_query text, p_kind text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_config private.staff_platform_configuration%rowtype;
  v_caps text[];
  v_query text := pg_catalog.btrim(coalesce(p_query,''));
  v_uuid uuid;
  v_results jsonb := '[]'::jsonb;
  v_recent integer;
begin
  v_actor := private.require_staff_capability('safe_search');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  if p_kind is not null and p_kind not in (
    'booking','marketplace_request','dispute','review','trust_report','payment',
    'withdrawal','reconciliation_exception','support_case','incident','account','worker') then
    raise exception 'Invalid search kind' using errcode = '22023';
  end if;
  if pg_catalog.length(v_query) < v_config.search_minimum_query_length then
    raise exception 'Search term is too short' using errcode = '22023';
  end if;
  if v_query ~ '[%_*]' then
    raise exception 'Wildcard search is not permitted' using errcode = '22023';
  end if;
  -- Rate limit before anything is read.
  select pg_catalog.count(*)::integer into v_recent
  from private.staff_access_log l
  where l.actor_id = v_actor and l.surface = 'safe_search'
    and l.created_at > pg_catalog.now() - pg_catalog.make_interval(secs => 60);
  if v_recent >= v_config.search_rate_limit_per_minute then
    raise exception 'Search rate limit reached' using errcode = '53400';
  end if;

  v_uuid := private.notification_safe_uuid(v_query);
  if v_uuid is not null then
    -- Exact identifier lookup only, filtered to what the role may see.
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_results from (
      select pg_catalog.jsonb_build_object('kind','booking','id',b.id,'status',b.status,
        'createdAt',b.created_at) item
      from public.bookings b where b.id = v_uuid
        and ('view_safe_customer_profile' = any(v_caps) or 'view_safe_worker_profile' = any(v_caps))
      union all
      select pg_catalog.jsonb_build_object('kind','marketplace_request','id',r.id,'status',r.status,
        'createdAt',r.created_at)
      from public.marketplace_requests r where r.id = v_uuid
        and ('view_safe_customer_profile' = any(v_caps) or 'manage_marketplace_configuration' = any(v_caps))
      union all
      select pg_catalog.jsonb_build_object('kind','dispute','id',d.id,'status',d.status,
        'createdAt',d.created_at)
      from public.disputes d where d.id = v_uuid and 'review_disputes' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','review','id',rv.id,'status',
        case when rv.deleted_at is null then 'visible' else 'hidden' end,'createdAt',rv.created_at)
      from public.reviews rv where rv.id = v_uuid and 'moderate_reviews' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','trust_report','id',tr.id,'status',tr.status,
        'createdAt',tr.created_at)
      from public.trust_reports tr where tr.id = v_uuid and 'review_abuse_reports' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','payment','id',fp.id,'status',fp.status,
        'createdAt',fp.created_at)
      from public.financial_booking_payments fp where fp.id = v_uuid and 'inspect_payment_state' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','withdrawal','id',w.id,'status',w.status,
        'createdAt',w.requested_at)
      from public.provider_withdrawal_requests w where w.id = v_uuid and 'review_withdrawal' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','reconciliation_exception','id',e.id,'status',e.status,
        'createdAt',e.created_at)
      from private.reconciliation_exceptions e where e.id = v_uuid
        and 'review_reconciliation_exception' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','support_case','id',t.id,'status',t.status,
        'createdAt',t.created_at)
      from public.support_tickets t where t.id = v_uuid and 'manage_support_cases' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','incident','id',i.id,'status',i.status,
        'createdAt',i.started_at)
      from public.operational_incidents i where i.id = v_uuid and 'manage_incidents' = any(v_caps)
      union all
      select pg_catalog.jsonb_build_object('kind','account','id',pr.id,'status',
        coalesce(ts.trust_level,'good_standing'),'createdAt',pr.created_at)
      from public.profiles pr left join public.trust_account_state ts on ts.user_id = pr.id
      where pr.id = v_uuid
        and ('view_safe_customer_profile' = any(v_caps) or 'view_safe_worker_profile' = any(v_caps))
      union all
      select pg_catalog.jsonb_build_object('kind','worker','id',pp.id,'status',
        case when pp.is_published then 'published' else 'draft' end,'createdAt',pp.created_at)
      from public.provider_profiles pp where pp.id = v_uuid and 'view_safe_worker_profile' = any(v_caps)
    ) matches
    where p_kind is null or (item->>'kind') = p_kind;
  elsif 'view_contact_details' = any(v_caps) then
    -- Exact verified contact only. No prefix, no name search, no enumeration.
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_results from (
      select pg_catalog.jsonb_build_object('kind','account','id',pr.id,'status',
        coalesce(ts.trust_level,'good_standing'),'createdAt',pr.created_at) item
      from public.profiles pr
      left join public.trust_account_state ts on ts.user_id = pr.id
      left join auth.users au on au.id = pr.id
      where pr.deleted_at is null
        and (pr.phone = v_query or pg_catalog.lower(coalesce(au.email,'')) = pg_catalog.lower(v_query))
      limit 5) matches;
  else
    raise exception 'Search an exact identifier' using errcode = '22023';
  end if;

  perform private.staff_log_access(v_actor, 'safe_search', 'safe_search',
    private.staff_search_shape(p_kind, v_query), pg_catalog.jsonb_array_length(v_results));
  return pg_catalog.jsonb_build_object('results', v_results,
    'count', pg_catalog.jsonb_array_length(v_results));
end;
$$;

-- ---------------------------------------------------------------------------
-- 21. Safe account views (role-appropriate projections only)
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_customer_overview(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_caps text[]; v_profile public.profiles%rowtype; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_customer_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if 'view_contact_details' = any(v_caps) then
    select pg_catalog.jsonb_build_object('phone', v_profile.phone, 'email', au.email)
      into v_contact from auth.users au where au.id = p_user_id;
  end if;
  perform private.staff_log_access(v_actor, 'customer_overview', 'view_safe_customer_profile',
    'account:'||p_user_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'userId', v_profile.id,
    'displayName', v_profile.display_name,
    'preferredLanguage', v_profile.preferred_language,
    'accountStatus', case when v_profile.deleted_at is not null then 'deleted' else 'active' end,
    'createdAt', v_profile.created_at,
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = p_user_id),'good_standing'),
    'restrictions', coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'marketplaceRemoved', nullif(s.marketplace_removed,false),
        'communicationRestricted', nullif(s.communication_restricted,false),
        'reviewRestricted', nullif(s.review_restricted,false),
        'paymentHold', nullif(s.payment_hold,false)))
      from public.trust_account_state s where s.user_id = p_user_id), '{}'::jsonb),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'cancelled'),
      'active', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id
                 and b.status not in ('completed','cancelled','rejected','refunded'))),
    'disputesOpened', (select pg_catalog.count(*)::integer from public.disputes d where d.opened_by = p_user_id),
    'reportsFiled', (select pg_catalog.count(*)::integer from public.trust_reports r where r.reporter_id = p_user_id),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = p_user_id),
    'supportCases', (select pg_catalog.count(*)::integer from public.support_tickets t where t.requester_id = p_user_id),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$$;

create or replace function public.get_staff_worker_overview(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid; v_caps text[]; v_provider public.provider_profiles%rowtype;
  v_financial jsonb := '{}'::jsonb; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_worker_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_provider from public.provider_profiles p where p.id = p_provider_id;
  if v_provider.id is null then raise exception 'Worker not found' using errcode = 'P0002'; end if;
  if 'view_financial_ledger' = any(v_caps) then
    select pg_catalog.jsonb_build_object(
      'currency','EGP',
      'pendingMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status in ('pending_job_completion','pending_release')),0)::text,
      'availableMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'available'),0)::text,
      'paidOutMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'paid_out'),0)::text,
      'heldMinor', coalesce(pg_catalog.sum(e.held_minor),0)::text)
      into v_financial
    from public.provider_earnings_ledger e where e.provider_id = p_provider_id;
    v_financial := v_financial || pg_catalog.jsonb_build_object(
      'openWithdrawals', (select pg_catalog.count(*)::integer from public.provider_withdrawal_requests w
                          where w.provider_id = p_provider_id and w.status in ('requested','under_review','processing')),
      'activeHolds', (select pg_catalog.count(*)::integer from public.provider_earning_holds h
                      where h.provider_id = p_provider_id and h.status = 'active'));
  end if;
  if 'view_contact_details' = any(v_caps) and v_provider.user_id is not null then
    select pg_catalog.jsonb_build_object('phone', pr.phone) into v_contact
    from public.profiles pr where pr.id = v_provider.user_id;
  end if;
  perform private.staff_log_access(v_actor, 'worker_overview', 'view_safe_worker_profile',
    'worker:'||p_provider_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'providerId', v_provider.id,
    'userId', v_provider.user_id,
    'displayName', v_provider.display_name,
    'professionKey', v_provider.profession_key,
    'primaryCategoryId', v_provider.primary_category_id,
    'onboardingStatus', v_provider.onboarding_status,
    'isPublished', v_provider.is_published,
    'isVerified', v_provider.is_verified,
    'isAvailable', v_provider.is_available,
    'accountStatus', case when v_provider.deleted_at is not null then 'deleted' else 'active' end,
    'ratingAverage', v_provider.rating_average,
    'reviewCount', v_provider.review_count,
    'completedJobs', v_provider.completed_jobs,
    'verification', (select pg_catalog.jsonb_build_object('status', v.status, 'submittedAt', v.submitted_at,
        'reviewedAt', v.reviewed_at, 'expiresAt', v.expires_at)
      from public.provider_verifications v where v.provider_id = p_provider_id),
    'certificates', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'type', c.certificate_type, 'status', c.status, 'expiresAt', c.expires_at)
        order by c.created_at desc), '[]'::jsonb)
      from public.provider_certifications c where c.provider_id = p_provider_id and c.deleted_at is null),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'cancelled')),
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = v_provider.user_id),'good_standing'),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = v_provider.user_id),
    'financial', v_financial,
    'financialVisible', 'view_financial_ledger' = any(v_caps),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$$;

-- ---------------------------------------------------------------------------
-- 22. Configuration change control RPCs
-- ---------------------------------------------------------------------------

create or replace function public.staff_create_configuration_draft(
  p_domain_key text, p_environment text, p_payload jsonb, p_change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_domain private.staff_configuration_domains%rowtype; v_version integer; v_id uuid;
begin
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = p_domain_key;
  if v_domain.domain_key is null then raise exception 'Unknown configuration domain' using errcode = '22023'; end if;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  if p_environment not in ('local','staging','production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;
  if not private.staff_configuration_payload_valid(p_domain_key, p_payload) then
    raise exception 'Configuration payload failed validation' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.max(v.version),0) + 1 into v_version
  from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment;
  insert into private.staff_configuration_versions(
    domain_key, environment, version, payload, status, change_reason, created_by)
  values (p_domain_key, p_environment, v_version, p_payload, 'draft',
          pg_catalog.btrim(p_change_reason), v_actor)
  returning id into v_id;
  perform private.record_staff_audit(v_actor, v_domain.capability_key, 'configuration_draft_created',
    'staff_configuration_version', v_id, pg_catalog.btrim(p_change_reason),
    pg_catalog.jsonb_build_object('domainKey', p_domain_key, 'environment', p_environment, 'version', v_version));
  return pg_catalog.jsonb_build_object('id', v_id, 'version', v_version, 'status', 'draft');
end;
$$;

create or replace function public.staff_submit_configuration(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_row private.staff_configuration_versions%rowtype; v_domain private.staff_configuration_domains%rowtype;
begin
  select * into v_row from private.staff_configuration_versions v where v.id = p_version_id for update;
  if v_row.id is null then raise exception 'Configuration version not found' using errcode = 'P0002'; end if;
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = v_row.domain_key;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  if v_row.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  update private.staff_configuration_versions set status = 'pending_approval' where id = p_version_id;
  -- Everyone who can approve is told there is something waiting.
  perform private.notify_staff(g.user_id, 'staff_configuration_awaiting_approval',
    pg_catalog.jsonb_build_object('case_id', p_version_id),
    'configuration:'||p_version_id::text)
  from (select distinct rc_g.user_id from public.staff_role_grants rc_g
        join public.staff_role_capabilities rc on rc.role_key = rc_g.role_key
        where rc.capability_key = 'approve_configuration' and rc_g.revoked_at is null) g;
  perform private.record_staff_audit(v_actor, v_domain.capability_key, 'configuration_submitted',
    'staff_configuration_version', p_version_id, v_row.change_reason,
    pg_catalog.jsonb_build_object('domainKey', v_row.domain_key));
  return pg_catalog.jsonb_build_object('id', p_version_id, 'status', 'pending_approval');
end;
$$;

-- Dual control: the author can never approve and activate their own version.
create or replace function public.staff_activate_configuration(p_version_id uuid, p_approval_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_row private.staff_configuration_versions%rowtype; v_domain private.staff_configuration_domains%rowtype;
begin
  v_actor := private.require_staff_capability('approve_configuration');
  select * into v_row from private.staff_configuration_versions v where v.id = p_version_id for update;
  if v_row.id is null then raise exception 'Configuration version not found' using errcode = 'P0002'; end if;
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = v_row.domain_key;
  if v_row.status <> 'pending_approval' then
    raise exception 'Only a submitted version can be activated' using errcode = '22023';
  end if;
  if v_row.created_by = v_actor then
    raise exception 'A configuration version cannot be approved by its author' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_approval_note,''))) < 3 then
    raise exception 'An approval note is required' using errcode = '22023';
  end if;
  update private.staff_configuration_versions
    set status = 'superseded', superseded_at = pg_catalog.now()
    where domain_key = v_row.domain_key and environment = v_row.environment and status = 'active';
  update private.staff_configuration_versions
    set status = 'active', approved_by = v_actor, approved_at = pg_catalog.now(),
        activated_at = pg_catalog.now()
    where id = p_version_id;
  perform private.record_staff_audit(v_actor, 'approve_configuration', 'configuration_activated',
    'staff_configuration_version', p_version_id, pg_catalog.btrim(p_approval_note),
    pg_catalog.jsonb_build_object('domainKey', v_row.domain_key, 'environment', v_row.environment,
      'version', v_row.version, 'appliedBy', v_domain.applied_by));
  return pg_catalog.jsonb_build_object('id', p_version_id, 'status', 'active',
    'appliedBy', v_domain.applied_by, 'authoritativeOwner', v_domain.authoritative_owner);
end;
$$;

-- Rollback never edits history: it creates a new corrective version carrying
-- the older payload, which then follows the same approval path.
create or replace function public.staff_rollback_configuration(
  p_domain_key text, p_environment text, p_target_version integer, p_change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_domain private.staff_configuration_domains%rowtype;
  v_target private.staff_configuration_versions%rowtype; v_version integer; v_id uuid;
begin
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = p_domain_key;
  if v_domain.domain_key is null then raise exception 'Unknown configuration domain' using errcode = '22023'; end if;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  select * into v_target from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment and v.version = p_target_version;
  if v_target.id is null then raise exception 'Target version not found' using errcode = 'P0002'; end if;
  select coalesce(pg_catalog.max(v.version),0) + 1 into v_version
  from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment;
  insert into private.staff_configuration_versions(
    domain_key, environment, version, payload, status, change_reason, created_by, rolled_back_from)
  values (p_domain_key, p_environment, v_version, v_target.payload, 'pending_approval',
          pg_catalog.btrim(p_change_reason), v_actor, p_target_version)
  returning id into v_id;
  perform private.record_staff_audit(v_actor, v_domain.capability_key, 'configuration_rollback_prepared',
    'staff_configuration_version', v_id, pg_catalog.btrim(p_change_reason),
    pg_catalog.jsonb_build_object('domainKey', p_domain_key, 'rolledBackFrom', p_target_version));
  return pg_catalog.jsonb_build_object('id', v_id, 'version', v_version, 'status', 'pending_approval');
end;
$$;

create or replace function public.get_staff_configuration(p_domain_key text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_caps text[];
begin
  v_actor := (select auth.uid());
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_caps := private.staff_capability_keys(v_actor);
  if pg_catalog.cardinality(v_caps) = 0 or not private.staff_platform_ready() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'domains', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'domainKey', d.domain_key, 'displayName', d.display_name,
        'authoritativeOwner', d.authoritative_owner, 'appliedBy', d.applied_by,
        'requiresApproval', d.requires_approval, 'allowedKeys', pg_catalog.to_jsonb(d.allowed_keys),
        'capabilityKey', d.capability_key
      ) order by d.domain_key), '[]'::jsonb)
      from private.staff_configuration_domains d
      where d.capability_key = any(v_caps) and (p_domain_key is null or d.domain_key = p_domain_key)),
    'versions', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'domainKey', v.domain_key, 'environment', v.environment, 'version', v.version,
        'status', v.status, 'payload', v.payload, 'changeReason', v.change_reason,
        'createdBy', v.created_by, 'approvedBy', v.approved_by, 'activatedAt', v.activated_at,
        'rolledBackFrom', v.rolled_back_from, 'createdAt', v.created_at
      ) order by v.domain_key, v.environment, v.version desc), '[]'::jsonb)
      from private.staff_configuration_versions v
      join private.staff_configuration_domains d on d.domain_key = v.domain_key
      where d.capability_key = any(v_caps) and (p_domain_key is null or v.domain_key = p_domain_key)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 23. Feature flags
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_feature_flag(
  p_flag_key text, p_environment text, p_enabled boolean, p_audience text,
  p_rollout_percentage integer, p_reason text, p_review_by date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_previous jsonb; v_next jsonb;
begin
  v_actor := private.require_staff_capability('manage_feature_flags');
  if p_environment not in ('local','staging','production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;
  if coalesce(p_audience,'none') not in ('none','staff','customer','worker','all') then
    raise exception 'Invalid flag audience' using errcode = '22023';
  end if;
  if coalesce(p_rollout_percentage,0) not between 0 and 100 then
    raise exception 'Invalid rollout percentage' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select pg_catalog.to_jsonb(f) into v_previous from private.staff_feature_flags f
  where f.flag_key = p_flag_key and f.environment = p_environment;
  if v_previous is null then
    raise exception 'Unknown feature flag' using errcode = '22023';
  end if;
  update private.staff_feature_flags
    set enabled = coalesce(p_enabled,false),
        audience = case when coalesce(p_enabled,false) then coalesce(p_audience,'none') else 'none' end,
        rollout_percentage = case when coalesce(p_enabled,false) then coalesce(p_rollout_percentage,0) else 0 end,
        reason = pg_catalog.btrim(p_reason),
        review_by = p_review_by,
        owner_id = coalesce(owner_id, v_actor),
        updated_at = pg_catalog.now(),
        updated_by = v_actor
    where flag_key = p_flag_key and environment = p_environment;
  select pg_catalog.to_jsonb(f) into v_next from private.staff_feature_flags f
  where f.flag_key = p_flag_key and f.environment = p_environment;
  insert into private.staff_feature_flag_history(flag_key, environment, previous_state, next_state, reason, changed_by)
  values (p_flag_key, p_environment, v_previous, v_next, pg_catalog.btrim(p_reason), v_actor);
  perform private.record_staff_audit(v_actor, 'manage_feature_flags', 'feature_flag_changed',
    'staff_feature_flag', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('flagKey', p_flag_key, 'environment', p_environment,
      'enabled', coalesce(p_enabled,false)));
  return pg_catalog.jsonb_build_object('flagKey', p_flag_key, 'environment', p_environment,
    'enabled', coalesce(p_enabled,false));
end;
$$;

create or replace function public.get_staff_feature_flags()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('manage_feature_flags');
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'flagKey', f.flag_key, 'environment', f.environment, 'enabled', f.enabled,
      'audience', f.audience, 'rolloutPercentage', f.rollout_percentage,
      'reason', f.reason, 'reviewBy', f.review_by, 'ownerId', f.owner_id,
      'isKillSwitch', f.is_kill_switch, 'updatedAt', f.updated_at
    ) order by f.flag_key, f.environment) from private.staff_feature_flags f), '[]'::jsonb);
end;
$$;

-- Client-facing resolution. Unknown flag, expired flag, wrong environment, or
-- wrong audience all resolve to false: the client fails closed.
create or replace function public.get_my_feature_flags(p_mode text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_env text; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_mode not in ('customer','worker','staff') then
    raise exception 'Invalid mode' using errcode = '22023';
  end if;
  select c.environment into v_env from private.staff_platform_configuration c where c.singleton;
  select coalesce(pg_catalog.jsonb_object_agg(f.flag_key, resolved), '{}'::jsonb) into v_result
  from private.staff_feature_flags f
  cross join lateral (
    select f.enabled
      and (f.expires_at is null or f.expires_at > pg_catalog.now())
      and (f.audience = 'all' or f.audience = p_mode)
      and (f.rollout_percentage >= 100 or (
        f.rollout_percentage > 0
        and (((pg_catalog.hashtextextended(f.flag_key||':'||v_uid::text, 0) % 100) + 100) % 100)
            < f.rollout_percentage))
    as resolved) r
  where f.environment = coalesce(v_env,'local');
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 24. Kill switches and platform status
-- ---------------------------------------------------------------------------

create or replace function private.staff_kill_switch_active(p_switch_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select s.active from private.staff_kill_switches s where s.switch_key = p_switch_key), false)
$$;
revoke all on function private.staff_kill_switch_active(text) from public, anon, authenticated;

create or replace function public.staff_set_kill_switch(
  p_switch_key text, p_active boolean, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_switch private.staff_kill_switches%rowtype; v_prior jsonb := '{}'::jsonb; v_env text;
begin
  v_actor := private.require_staff_capability('manage_kill_switches');
  select * into v_switch from private.staff_kill_switches s where s.switch_key = p_switch_key for update;
  if v_switch.switch_key is null then raise exception 'Unknown kill switch' using errcode = '22023'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid kill switch request' using errcode = '22023';
  end if;
  if v_switch.active = coalesce(p_active,false) then
    return pg_catalog.jsonb_build_object('switchKey', p_switch_key, 'active', v_switch.active, 'duplicate', true);
  end if;
  select c.environment into v_env from private.staff_platform_configuration c where c.singleton;

  -- Where the domain owns a maintenance control, operate the domain control.
  -- Nothing here enables anything; a clear restores only the recorded prior
  -- value, and no history, booking, or ledger row is ever touched.
  if p_switch_key = 'online_payment_methods' then
    if p_active then
      select coalesce(pg_catalog.jsonb_agg(a.method_key),'[]'::jsonb) into v_prior
      from private.payment_method_availability a where a.method_key <> 'cash' and a.enabled;
      update private.payment_method_availability set enabled = false where method_key <> 'cash';
    else
      update private.payment_method_availability set enabled = true
      where method_key <> 'cash'
        and method_key in (select pg_catalog.jsonb_array_elements_text(v_switch.prior_state));
    end if;
  elsif p_switch_key = 'payments_maintenance' then
    if p_active then
      v_prior := pg_catalog.jsonb_build_object('maintenanceMode',
        (select c.maintenance_mode from private.payment_configuration c where c.id));
      update private.payment_configuration
        set maintenance_mode = true, maintenance_reason = pg_catalog.left(pg_catalog.btrim(p_reason),300)
        where id;
    else
      update private.payment_configuration set maintenance_mode = false, maintenance_reason = null where id;
    end if;
  elsif p_switch_key = 'payouts' then
    if p_active then
      v_prior := pg_catalog.jsonb_build_object('payoutMode',
        (select c.payout_mode from private.payment_configuration c where c.id));
      update private.payment_configuration set payout_mode = 'disabled' where id;
    else
      update private.payment_configuration
        set payout_mode = coalesce(v_switch.prior_state->>'payoutMode','disabled') where id;
    end if;
  elsif p_switch_key = 'new_marketplace_requests' then
    if p_active then
      v_prior := pg_catalog.jsonb_build_object('enabled',
        (select m.enabled from private.marketplace_configuration m where m.singleton));
      update private.marketplace_configuration set enabled = false, updated_at = pg_catalog.now() where singleton;
    else
      update private.marketplace_configuration
        set enabled = coalesce((v_switch.prior_state->>'enabled')::boolean,false), updated_at = pg_catalog.now()
        where singleton;
    end if;
  end if;

  update private.staff_kill_switches
    set active = coalesce(p_active,false),
        reason = case when coalesce(p_active,false) then pg_catalog.btrim(p_reason) else null end,
        prior_state = case when coalesce(p_active,false) then v_prior else prior_state end,
        activated_by = case when coalesce(p_active,false) then v_actor else activated_by end,
        activated_at = case when coalesce(p_active,false) then pg_catalog.now() else activated_at end,
        cleared_by = case when coalesce(p_active,false) then null else v_actor end,
        cleared_at = case when coalesce(p_active,false) then null else pg_catalog.now() end,
        updated_at = pg_catalog.now()
    where switch_key = p_switch_key;
  insert into private.staff_kill_switch_events(switch_key, action, reason, environment, actor_id)
  values (p_switch_key, case when coalesce(p_active,false) then 'activated' else 'cleared' end,
          pg_catalog.btrim(p_reason), coalesce(v_env,'local'), v_actor);
  perform private.record_staff_audit(v_actor, 'manage_kill_switches',
    'kill_switch_'||case when coalesce(p_active,false) then 'activated' else 'cleared' end,
    'staff_kill_switch', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('switchKey', p_switch_key, 'serverEnforced', v_switch.server_enforced));
  return pg_catalog.jsonb_build_object('switchKey', p_switch_key,
    'active', coalesce(p_active,false), 'duplicate', false,
    'serverEnforced', v_switch.server_enforced, 'domainAuthority', v_switch.domain_authority);
end;
$$;

-- Every authenticated client may read the restrictive platform status so it can
-- fail closed. It exposes no reason text, no actor, and no configuration.
create or replace function public.get_platform_operational_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return pg_catalog.jsonb_build_object(
    'activeSwitches', coalesce((select pg_catalog.jsonb_agg(s.switch_key order by s.switch_key)
      from private.staff_kill_switches s where s.active), '[]'::jsonb),
    'readOnlyMaintenance', private.staff_kill_switch_active('read_only_maintenance'),
    'generatedAt', pg_catalog.now());
end;
$$;

create or replace function public.get_staff_kill_switches()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('manage_kill_switches');
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'switchKey', s.switch_key, 'displayName', s.display_name, 'active', s.active,
      'domainAuthority', s.domain_authority, 'serverEnforced', s.server_enforced,
      'enforcementNote', s.enforcement_note, 'reason', s.reason,
      'activatedAt', s.activated_at, 'clearedAt', s.cleared_at
    ) order by s.switch_key) from private.staff_kill_switches s), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 25. Support case RPCs
-- ---------------------------------------------------------------------------

create or replace function public.open_support_case(
  p_category text, p_subject text, p_body text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_category not in ('account_access','booking_help','worker_onboarding','verification_help',
    'payment_question','withdrawal_question','technical_issue','app_feedback','other') then
    raise exception 'Invalid support category' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_subject,''))) not between 3 and 200
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_body,''))) not between 1 and 4000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid support case' using errcode = '22023';
  end if;
  select t.id into v_existing from public.support_tickets t
  where t.requester_id = v_uid and t.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('caseId', v_existing, 'duplicate', true);
  end if;
  insert into public.support_tickets(requester_id, subject, category, status, idempotency_key, last_reply_at)
  values (v_uid, pg_catalog.btrim(p_subject), p_category, 'open', p_idempotency_key, pg_catalog.now())
  returning id into v_id;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (v_id, v_uid, pg_catalog.btrim(p_body), 'participants', p_idempotency_key);
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, idempotency_key)
  values (v_id, null, 'open', 'opened', v_uid, 'participant', p_idempotency_key);
  return pg_catalog.jsonb_build_object('caseId', v_id, 'duplicate', false);
end;
$$;

create or replace function public.reply_support_case(p_case_id uuid, p_body text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype; v_is_staff boolean; v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  v_is_staff := private.staff_has_capability('manage_support_cases');
  if v_ticket.requester_id <> v_uid and not v_is_staff then
    raise exception 'Support case not found' using errcode = '42501';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_body,''))) not between 1 and 4000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid reply' using errcode = '22023';
  end if;
  select m.id into v_existing from public.support_messages m
  where m.ticket_id = p_case_id and m.idempotency_key = p_idempotency_key and m.sender_id = v_uid;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('messageId', v_existing, 'duplicate', true);
  end if;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_uid, pg_catalog.btrim(p_body), 'participants', p_idempotency_key);
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, idempotency_key)
  values (p_case_id, v_ticket.status, v_ticket.status, 'replied', v_uid,
          case when v_is_staff and v_ticket.requester_id <> v_uid then 'staff' else 'participant' end,
          'reply:'||p_idempotency_key)
  on conflict do nothing;
  update public.support_tickets set last_reply_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;
  return pg_catalog.jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.get_my_support_cases()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'caseId', t.id, 'subject', t.subject, 'category', t.category, 'status', t.status,
      'priority', t.priority, 'createdAt', t.created_at, 'lastReplyAt', t.last_reply_at,
      'messages', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', m.id, 'body', m.body, 'fromMe', m.sender_id = v_uid, 'createdAt', m.created_at)
          order by m.created_at), '[]'::jsonb)
        from public.support_messages m where m.ticket_id = t.id and m.visibility = 'participants')
    ) order by t.created_at desc)
    from public.support_tickets t where t.requester_id = v_uid), '[]'::jsonb);
end;
$$;

create or replace function public.staff_transition_support_case(
  p_case_id uuid, p_status text, p_priority text, p_note text, p_idempotency_key text,
  p_escalated_to_type text default null, p_escalated_to_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  if p_status not in ('open','in_progress','waiting_participant','escalated','resolved','closed') then
    raise exception 'Invalid support status' using errcode = '22023';
  end if;
  if coalesce(p_priority, v_ticket.priority) not in ('urgent','high','normal','low') then
    raise exception 'Invalid priority' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;
  -- Escalation points at the authoritative domain record; WPS-017 never opens
  -- a dispute or an abuse report on the participant's behalf.
  if p_status = 'escalated' and (p_escalated_to_type is null or p_escalated_to_id is null) then
    raise exception 'Escalation must reference the authoritative record' using errcode = '22023';
  end if;
  if exists (select 1 from public.support_ticket_events e
             where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;
  update public.support_tickets
    set status = p_status,
        priority = coalesce(p_priority, priority),
        assigned_to = coalesce(assigned_to, v_actor),
        escalated_to_type = coalesce(p_escalated_to_type, escalated_to_type),
        escalated_to_id = coalesce(p_escalated_to_id, escalated_to_id),
        closed_at = case when p_status = 'closed' then pg_catalog.now() else closed_at end,
        updated_at = pg_catalog.now()
    where id = p_case_id;
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, p_status,
          case p_status when 'escalated' then 'escalated' when 'resolved' then 'resolved'
            when 'closed' then 'closed' else 'status_changed' end,
          v_actor, 'staff', nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_'||p_status,
    'support_case', p_case_id, coalesce(nullif(pg_catalog.btrim(coalesce(p_note,'')),''),'Support case updated'));
  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', p_status, 'duplicate', false);
end;
$$;

create or replace function public.staff_add_support_note(p_case_id uuid, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_ticket public.support_tickets%rowtype; v_id uuid;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note,''))) not between 1 and 4000 then
    raise exception 'A note is required' using errcode = '22023';
  end if;
  select m.id into v_id from public.support_messages m
  where m.ticket_id = p_case_id and m.idempotency_key = p_idempotency_key and m.sender_id = v_actor;
  if v_id is not null then return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', true); end if;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_actor, pg_catalog.btrim(p_note), 'staff', p_idempotency_key)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', false);
end;
$$;

create or replace function public.get_staff_support_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  return pg_catalog.jsonb_build_object(
    'caseId', v_ticket.id, 'requesterId', v_ticket.requester_id, 'subject', v_ticket.subject,
    'category', v_ticket.category, 'status', v_ticket.status, 'priority', v_ticket.priority,
    'assignedTo', v_ticket.assigned_to, 'escalatedToType', v_ticket.escalated_to_type,
    'escalatedToId', v_ticket.escalated_to_id, 'createdAt', v_ticket.created_at,
    'messages', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', m.id, 'senderId', m.sender_id, 'body', m.body, 'visibility', m.visibility,
        'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
      from public.support_messages m where m.ticket_id = p_case_id),
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status,
        'actorRole', e.actor_role, 'note', e.note, 'createdAt', e.created_at) order by e.created_at), '[]'::jsonb)
      from public.support_ticket_events e where e.ticket_id = p_case_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 26. Incident RPCs (created by a human; no automated detection exists)
-- ---------------------------------------------------------------------------

create or replace function public.staff_open_incident(
  p_category text, p_severity text, p_internal_summary text, p_affected_systems text[],
  p_idempotency_key text, p_public_summary text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_id uuid; v_ref text; v_existing uuid;
begin
  v_actor := private.require_staff_capability('manage_incidents');
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid incident' using errcode = '22023';
  end if;
  select e.incident_id into v_existing from public.operational_incident_events e
  where e.idempotency_key = p_idempotency_key limit 1;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('incidentId', v_existing, 'duplicate', true);
  end if;
  v_ref := 'INC-' || pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.left(pg_catalog.md5(p_idempotency_key), 6));
  insert into public.operational_incidents(
    incident_ref, category, severity, internal_summary, public_summary,
    affected_systems, commander_id, created_by, detected_at)
  values (v_ref, p_category, p_severity, pg_catalog.btrim(p_internal_summary),
          nullif(pg_catalog.btrim(coalesce(p_public_summary,'')),''),
          coalesce(p_affected_systems,'{}'::text[]), v_actor, v_actor, pg_catalog.now())
  returning id into v_id;
  insert into public.operational_incident_events(incident_id, event_type, actor_id, detail, idempotency_key)
  values (v_id, 'opened', v_actor, pg_catalog.btrim(p_internal_summary), p_idempotency_key);
  if p_severity in ('sev1','sev2') then
    perform private.notify_staff(g.user_id, 'staff_security_incident',
      pg_catalog.jsonb_build_object('incident_id', v_id), 'incident:'||v_id::text)
    from (select distinct gr.user_id from public.staff_role_grants gr
          join public.staff_role_capabilities rc on rc.role_key = gr.role_key
          where rc.capability_key = 'manage_incidents' and gr.revoked_at is null) g;
  end if;
  perform private.record_staff_audit(v_actor, 'manage_incidents', 'incident_opened',
    'operational_incident', v_id, pg_catalog.btrim(p_internal_summary),
    pg_catalog.jsonb_build_object('severity', p_severity, 'category', p_category));
  return pg_catalog.jsonb_build_object('incidentId', v_id, 'incidentRef', v_ref, 'duplicate', false);
end;
$$;

create or replace function public.staff_update_incident(
  p_incident_id uuid, p_event_type text, p_detail text, p_idempotency_key text,
  p_status text default null, p_severity text default null,
  p_public_summary text default null, p_postmortem_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_row public.operational_incidents%rowtype;
begin
  v_actor := private.require_staff_capability('manage_incidents');
  select * into v_row from public.operational_incidents i where i.id = p_incident_id for update;
  if v_row.id is null then raise exception 'Incident not found' using errcode = 'P0002'; end if;
  if p_event_type not in ('update','mitigation','severity_changed','commander_changed',
                          'status_changed','resolved','closed','postmortem') then
    raise exception 'Invalid incident event' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('open','mitigating','monitoring','resolved','closed') then
    raise exception 'Invalid incident status' using errcode = '22023';
  end if;
  if exists (select 1 from public.operational_incident_events e
             where e.incident_id = p_incident_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('incidentId', p_incident_id, 'duplicate', true);
  end if;
  update public.operational_incidents
    set status = coalesce(p_status, status),
        severity = coalesce(p_severity, severity),
        public_summary = coalesce(nullif(pg_catalog.btrim(coalesce(p_public_summary,'')),''), public_summary),
        postmortem_reference = coalesce(p_postmortem_reference, postmortem_reference),
        resolved_at = case when coalesce(p_status, status) in ('resolved','closed')
                           then coalesce(resolved_at, pg_catalog.now()) else resolved_at end,
        updated_at = pg_catalog.now()
    where id = p_incident_id;
  insert into public.operational_incident_events(incident_id, event_type, actor_id, detail, idempotency_key)
  values (p_incident_id, p_event_type, v_actor, pg_catalog.btrim(p_detail), p_idempotency_key);
  perform private.record_staff_audit(v_actor, 'manage_incidents', 'incident_'||p_event_type,
    'operational_incident', p_incident_id, pg_catalog.btrim(p_detail));
  return pg_catalog.jsonb_build_object('incidentId', p_incident_id, 'duplicate', false);
end;
$$;

create or replace function public.get_staff_incidents(p_include_closed boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('manage_incidents');
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'incidentId', i.id, 'incidentRef', i.incident_ref, 'category', i.category,
      'severity', i.severity, 'status', i.status, 'startedAt', i.started_at,
      'detectedAt', i.detected_at, 'commanderId', i.commander_id,
      'affectedSystems', pg_catalog.to_jsonb(i.affected_systems),
      'internalSummary', i.internal_summary, 'publicSummary', i.public_summary,
      'resolvedAt', i.resolved_at, 'postmortemReference', i.postmortem_reference,
      'timeline', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', e.id, 'eventType', e.event_type, 'actorId', e.actor_id,
          'detail', e.detail, 'createdAt', e.created_at) order by e.created_at), '[]'::jsonb)
        from public.operational_incident_events e where e.incident_id = i.id)
    ) order by i.started_at desc)
    from public.operational_incidents i
    where coalesce(p_include_closed,false) or i.status not in ('resolved','closed')), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 27. Audit explorer (read only, role gated, itself audited)
-- ---------------------------------------------------------------------------

create or replace function public.staff_audit_search(
  p_source text, p_from timestamptz, p_to timestamptz,
  p_actor_id uuid default null, p_entity_id uuid default null,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid; v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_from timestamptz := coalesce(p_from, pg_catalog.now() - pg_catalog.make_interval(days => 30));
  v_to timestamptz := coalesce(p_to, pg_catalog.now());
begin
  v_actor := private.require_staff_capability('view_audit_logs');
  if p_source not in ('audit_logs','staff_audit','trust_moderation','payment_audit','dispute_events',
                      'configuration_history','staff_role_history','support_events','operational_events') then
    raise exception 'Unknown audit source' using errcode = '22023';
  end if;
  if v_to < v_from or v_to - v_from > pg_catalog.make_interval(days => 366) then
    raise exception 'Audit range must be within 366 days' using errcode = '22023';
  end if;

  if p_source = 'audit_logs' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select a.created_at at, pg_catalog.jsonb_build_object('id',a.id,'at',a.created_at,'actorId',a.actor_id,
        'action',a.action,'entityType',a.entity_type,'entityId',a.entity_id) item
      from public.audit_logs a
      where a.created_at between v_from and v_to
        and (p_actor_id is null or a.actor_id = p_actor_id)
        and (p_entity_id is null or a.entity_id = p_entity_id)
      order by a.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'staff_audit' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select s.created_at at, pg_catalog.jsonb_build_object('id',s.id,'at',s.created_at,'actorId',s.actor_id,
        'action',s.action,'entityType',s.entity_type,'entityId',s.entity_id,'capabilityKey',s.capability_key,
        'breakGlass',s.break_glass,'reason',s.reason) item
      from private.staff_audit_events s
      where s.created_at between v_from and v_to
        and (p_actor_id is null or s.actor_id = p_actor_id)
        and (p_entity_id is null or s.entity_id = p_entity_id)
      order by s.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'trust_moderation' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select t.created_at at, pg_catalog.jsonb_build_object('id',t.id,'at',t.created_at,'actorId',t.actor_id,
        'action',t.action,'entityType',t.entity_type,'entityId',t.entity_id,'reason',t.reason) item
      from private.trust_moderation_audit t
      where t.created_at between v_from and v_to
        and (p_actor_id is null or t.actor_id = p_actor_id)
        and (p_entity_id is null or t.entity_id = p_entity_id)
      order by t.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'payment_audit' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select p.created_at at, pg_catalog.jsonb_build_object('id',p.id,'at',p.created_at,'actorId',p.actor_id,
        'action',p.event_type,'entityType','payment','entityId',coalesce(p.payment_id,p.withdrawal_id,p.refund_id),
        'actorKind',p.actor_kind) item
      from private.payment_audit_events p
      where p.created_at between v_from and v_to
        and (p_actor_id is null or p.actor_id = p_actor_id)
        and (p_entity_id is null or p.payment_id = p_entity_id or p.withdrawal_id = p_entity_id
             or p.refund_id = p_entity_id or p.booking_id = p_entity_id)
      order by p.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'dispute_events' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select d.created_at at, pg_catalog.jsonb_build_object('id',d.id,'at',d.created_at,'actorId',d.actor_id,
        'action',d.event_type,'entityType','dispute','entityId',d.dispute_id,'actorClass',d.actor_class,
        'state',d.state) item
      from public.dispute_events d
      where d.created_at between v_from and v_to
        and (p_actor_id is null or d.actor_id = p_actor_id)
        and (p_entity_id is null or d.dispute_id = p_entity_id or d.booking_id = p_entity_id)
      order by d.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'configuration_history' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select c.created_at at, pg_catalog.jsonb_build_object('id',c.id,'at',c.created_at,'actorId',c.created_by,
        'action','configuration_'||c.status,'entityType','configuration','entityId',c.id,
        'domainKey',c.domain_key,'environment',c.environment,'version',c.version,
        'approvedBy',c.approved_by) item
      from private.staff_configuration_versions c
      where c.created_at between v_from and v_to
        and (p_actor_id is null or c.created_by = p_actor_id or c.approved_by = p_actor_id)
        and (p_entity_id is null or c.id = p_entity_id)
      order by c.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'staff_role_history' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select g.granted_at at, pg_catalog.jsonb_build_object('id',g.id,'at',g.granted_at,'actorId',g.granted_by,
        'action', case when g.revoked_at is null then 'staff_role_active' else 'staff_role_revoked' end,
        'entityType','staff_role_grant','entityId',g.id,'roleKey',g.role_key,'subjectId',g.user_id,
        'revokedAt',g.revoked_at) item
      from public.staff_role_grants g
      where g.granted_at between v_from and v_to
        and (p_actor_id is null or g.granted_by = p_actor_id or g.user_id = p_actor_id)
        and (p_entity_id is null or g.id = p_entity_id)
      order by g.granted_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'support_events' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select e.created_at at, pg_catalog.jsonb_build_object('id',e.id,'at',e.created_at,'actorId',e.actor_id,
        'action',e.action,'entityType','support_case','entityId',e.ticket_id,'actorRole',e.actor_role) item
      from public.support_ticket_events e
      where e.created_at between v_from and v_to
        and (p_actor_id is null or e.actor_id = p_actor_id)
        and (p_entity_id is null or e.ticket_id = p_entity_id)
      order by e.created_at desc limit v_limit offset v_offset) rows;
  else
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select e.created_at at, pg_catalog.jsonb_build_object('id',e.id,'at',e.created_at,'actorId',e.actor_id,
        'action',e.action,'entityType','operational_assignment','entityId',e.assignment_id,
        'fromStatus',e.from_status,'toStatus',e.to_status) item
      from public.operational_assignment_events e
      where e.created_at between v_from and v_to
        and (p_actor_id is null or e.actor_id = p_actor_id)
        and (p_entity_id is null or e.assignment_id = p_entity_id)
      order by e.created_at desc limit v_limit offset v_offset) rows;
  end if;

  perform private.staff_log_access(v_actor, 'audit_explorer', 'view_audit_logs',
    p_source, pg_catalog.jsonb_array_length(coalesce(v_rows,'[]'::jsonb)));
  return pg_catalog.jsonb_build_object('source', p_source, 'from', v_from, 'to', v_to,
    'rows', coalesce(v_rows,'[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 28. Operational analytics (aggregated, bounded, privacy conscious)
-- ---------------------------------------------------------------------------
--
-- Every dashboard returns counts and rates only. There is no per-person
-- breakdown, no exact address, no contact detail, and no fraud signal.
-- Geographic and cohort cells below the configured minimum are suppressed.

create or replace function private.staff_suppress(p_value bigint, p_minimum integer)
returns jsonb language sql immutable set search_path='' as $$
  select case when p_value is null then pg_catalog.to_jsonb(0)
              when p_value > 0 and p_value < p_minimum then 'null'::jsonb
              else pg_catalog.to_jsonb(p_value) end
$$;
revoke all on function private.staff_suppress(bigint,integer) from public, anon, authenticated;

create or replace function public.get_staff_analytics(
  p_dashboard text, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid; v_caps text[]; v_config private.staff_platform_configuration%rowtype;
  v_from date; v_to date; v_start timestamptz; v_end timestamptz; v_metrics jsonb;
begin
  v_actor := private.require_staff_capability('view_analytics');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  if p_dashboard not in ('executive','marketplace','bookings','workers','customers',
                         'financial','trust','verification','notifications') then
    raise exception 'Unknown dashboard' using errcode = '22023';
  end if;
  if p_dashboard = 'financial' and not ('view_financial_ledger' = any(v_caps)) then
    raise exception 'Staff capability required' using errcode = '42501';
  end if;
  v_to := coalesce(p_to, (pg_catalog.now() at time zone v_config.display_timezone)::date);
  v_from := coalesce(p_from, v_to - 29);
  if v_to < v_from then raise exception 'Invalid reporting period' using errcode = '22023'; end if;
  if v_to - v_from > v_config.analytics_max_range_days then
    raise exception 'Reporting period is too wide' using errcode = '22023';
  end if;
  -- Authoritative timestamps stay UTC; the reporting period is expressed in the
  -- configured display timezone (Egypt/Cairo) so a day boundary is meaningful.
  v_start := (v_from::timestamp) at time zone v_config.display_timezone;
  v_end := ((v_to + 1)::timestamp) at time zone v_config.display_timezone;

  if p_dashboard = 'marketplace' then
    select pg_catalog.jsonb_build_object(
      'requestsCreated', pg_catalog.count(*),
      'requestsWithQuotes', pg_catalog.count(*) filter (where q.quote_count > 0),
      'requestsExpired', pg_catalog.count(*) filter (where r.status = 'expired'),
      'requestsCancelled', pg_catalog.count(*) filter (where r.status = 'cancelled'),
      'requestsConverted', pg_catalog.count(*) filter (where r.status = 'converted_to_booking'),
      'noProviderOutcomes', pg_catalog.count(*) filter (where q.invitation_count = 0),
      'emergencyRequests', pg_catalog.count(*) filter (where r.flow_kind = 'emergency'),
      'rescueRequests', pg_catalog.count(*) filter (where r.flow_kind = 'rescue'),
      'medianQuotesPerRequest', pg_catalog.percentile_cont(0.5) within group (order by q.quote_count),
      'medianSecondsToFirstQuote', pg_catalog.percentile_cont(0.5) within group (order by q.first_quote_seconds)
    ) into v_metrics
    from public.marketplace_requests r
    cross join lateral (
      select pg_catalog.count(wq.id) quote_count,
             (select pg_catalog.count(*) from public.quote_invitations i where i.request_id = r.id) invitation_count,
             pg_catalog.min(pg_catalog.date_part('epoch', wq.submitted_at - r.created_at)) first_quote_seconds
      from public.worker_quotes wq where wq.request_id = r.id) q
    where r.created_at >= v_start and r.created_at < v_end;

  elsif p_dashboard = 'bookings' then
    select pg_catalog.jsonb_build_object(
      'bookingsCreated', pg_catalog.count(*),
      'confirmed', pg_catalog.count(*) filter (where b.status not in ('draft','cancelled','rejected')),
      'completed', pg_catalog.count(*) filter (where b.status = 'completed'),
      'cancelled', pg_catalog.count(*) filter (where b.status = 'cancelled'),
      'noShow', pg_catalog.count(*) filter (where b.status = 'no_show'),
      'disputed', pg_catalog.count(*) filter (where b.status = 'disputed'),
      'cancellationRate', case when pg_catalog.count(*) = 0 then null
        else pg_catalog.round(pg_catalog.count(*) filter (where b.status = 'cancelled')::numeric
             / pg_catalog.count(*)::numeric, 4) end,
      'returnVisits', (select pg_catalog.count(*) from public.booking_return_visits v
                       where v.requested_at >= v_start and v.requested_at < v_end),
      'additionalWorkRequests', (select pg_catalog.count(*) from public.booking_additional_work_requests w
                                 where w.created_at >= v_start and w.created_at < v_end)
    ) into v_metrics
    from public.bookings b where b.created_at >= v_start and b.created_at < v_end;

  elsif p_dashboard = 'workers' then
    select pg_catalog.jsonb_build_object(
      'totalWorkers', pg_catalog.count(*),
      'verifiedWorkers', pg_catalog.count(*) filter (where p.is_verified),
      'publishedWorkers', pg_catalog.count(*) filter (where p.is_published),
      'availableWorkers', pg_catalog.count(*) filter (where p.is_available),
      'approvedOnboarding', pg_catalog.count(*) filter (where p.onboarding_status = 'approved'),
      'averageRating', pg_catalog.round(pg_catalog.avg(p.rating_average) filter (where p.review_count > 0), 2),
      'categoryCoverage', (select private.staff_suppress(pg_catalog.count(distinct p2.primary_category_id),
                             v_config.analytics_minimum_cell)
                           from public.provider_profiles p2 where p2.is_published and p2.deleted_at is null)
    ) into v_metrics
    from public.provider_profiles p where p.deleted_at is null;

  elsif p_dashboard = 'customers' then
    select pg_catalog.jsonb_build_object(
      'activeCustomers', private.staff_suppress(
        (select pg_catalog.count(distinct b.customer_id) from public.bookings b
         where b.created_at >= v_start and b.created_at < v_end), v_config.analytics_minimum_cell),
      'requestingCustomers', private.staff_suppress(
        (select pg_catalog.count(distinct r.customer_id) from public.marketplace_requests r
         where r.created_at >= v_start and r.created_at < v_end), v_config.analytics_minimum_cell),
      'repeatCustomers', private.staff_suppress((select pg_catalog.count(*) from (
          select b.customer_id from public.bookings b
          where b.created_at >= v_start and b.created_at < v_end
          group by b.customer_id having pg_catalog.count(*) > 1) repeats), v_config.analytics_minimum_cell),
      'cashSelections', (select pg_catalog.count(*) from public.financial_booking_payments f
        where f.created_at >= v_start and f.created_at < v_end and f.payment_method = 'cash'),
      'onlineSelections', (select pg_catalog.count(*) from public.financial_booking_payments f
        where f.created_at >= v_start and f.created_at < v_end and f.payment_method = 'online')
    ) into v_metrics;

  elsif p_dashboard = 'financial' then
    select pg_catalog.jsonb_build_object(
      'currency','EGP',
      'grossBookingValueMinor', coalesce((select pg_catalog.sum(e.gross_minor) from public.provider_earnings_ledger e
        where e.created_at >= v_start and e.created_at < v_end),0)::text,
      'commissionMinor', coalesce((select pg_catalog.sum(e.commission_minor) from public.provider_earnings_ledger e
        where e.created_at >= v_start and e.created_at < v_end),0)::text,
      'pendingEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status in ('pending_job_completion','pending_release')),0)::text,
      'availableEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status = 'available'),0)::text,
      'paidEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status = 'paid_out'),0)::text,
      'withdrawalsRequested', (select pg_catalog.count(*) from public.provider_withdrawal_requests w
        where w.requested_at >= v_start and w.requested_at < v_end),
      'refunds', (select pg_catalog.count(*) from public.financial_refunds f
        where f.created_at >= v_start and f.created_at < v_end),
      'refundsFailed', (select pg_catalog.count(*) from public.financial_refunds f
        where f.created_at >= v_start and f.created_at < v_end and f.status = 'failed'),
      'chargebacks', (select pg_catalog.count(*) from private.payment_chargebacks c
        where c.opened_at >= v_start and c.opened_at < v_end),
      'reconciliationExceptions', (select pg_catalog.count(*) from private.reconciliation_exceptions e
        where e.created_at >= v_start and e.created_at < v_end),
      'openCashCommissionDebtRecords', (select pg_catalog.count(*) from public.provider_cash_commission_records r
        where r.created_at >= v_start and r.created_at < v_end)
    ) into v_metrics;

  elsif p_dashboard = 'trust' then
    select pg_catalog.jsonb_build_object(
      'reportsSubmitted', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end),
      'reportsActioned', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end and r.status = 'actioned'),
      'reportsDismissed', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end and r.status = 'dismissed'),
      'enforcementActions', (select pg_catalog.count(*) from public.trust_enforcement_actions a
        where a.created_at >= v_start and a.created_at < v_end),
      'permanentBans', (select pg_catalog.count(*) from public.trust_enforcement_actions a
        where a.created_at >= v_start and a.created_at < v_end and a.action_type = 'permanent_ban'),
      'appealsSubmitted', (select pg_catalog.count(*) from public.trust_appeals ap
        where ap.created_at >= v_start and ap.created_at < v_end),
      'appealsOverturned', (select pg_catalog.count(*) from public.trust_appeals ap
        where ap.created_at >= v_start and ap.created_at < v_end
          and ap.status in ('overturned','partially_overturned')),
      'disputesOpened', (select pg_catalog.count(*) from public.disputes d
        where d.created_at >= v_start and d.created_at < v_end),
      'disputesResolved', (select pg_catalog.count(*) from public.disputes d
        where d.created_at >= v_start and d.created_at < v_end and d.status in ('resolved','closed')),
      'reviewReports', (select pg_catalog.count(*) from public.review_reports r
        where r.created_at >= v_start and r.created_at < v_end),
      'reviewModerationActions', (select pg_catalog.count(*) from public.review_moderation_events m
        where m.created_at >= v_start and m.created_at < v_end),
      'reviewsPublished', (select pg_catalog.count(*) from public.reviews rv
        where rv.created_at >= v_start and rv.created_at < v_end and rv.deleted_at is null)
    ) into v_metrics;

  elsif p_dashboard = 'verification' then
    select pg_catalog.jsonb_build_object(
      'submitted', pg_catalog.count(*) filter (where v.submitted_at >= v_start and v.submitted_at < v_end),
      'approved', pg_catalog.count(*) filter (where v.status = 'approved'),
      'rejected', pg_catalog.count(*) filter (where v.status = 'rejected'),
      'awaitingReview', pg_catalog.count(*) filter (where v.status in ('submitted','under_review')),
      'requiresResubmission', pg_catalog.count(*) filter (where v.status = 'requires_resubmission'),
      'expired', pg_catalog.count(*) filter (where v.status = 'expired'),
      'certificatesSubmitted', (select pg_catalog.count(*) from public.provider_certifications c
        where c.submitted_at >= v_start and c.submitted_at < v_end),
      'certificatesApproved', (select pg_catalog.count(*) from public.provider_certifications c
        where c.status = 'approved' and c.deleted_at is null)
    ) into v_metrics
    from public.provider_verifications v;

  elsif p_dashboard = 'notifications' then
    select pg_catalog.jsonb_build_object(
      'notificationsCreated', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end),
      'unread', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end and n.read_at is null),
      'requiredActionOpen', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end
          and n.required_action and n.action_resolved_at is null),
      'deliveryFailures', (select pg_catalog.count(*) from private.notification_delivery_attempts a
        where a.attempted_at >= v_start and a.attempted_at < v_end and a.status = 'failed'),
      'pushDeliveryEnabled', (select c.push_delivery_enabled from private.notification_configuration c where c.singleton),
      'schedulerEnabled', (select c.scheduler_enabled from private.notification_configuration c where c.singleton)
    ) into v_metrics;

  else
    select pg_catalog.jsonb_build_object(
      'requestsCreated', (select pg_catalog.count(*) from public.marketplace_requests r
        where r.created_at >= v_start and r.created_at < v_end),
      'bookingsCreated', (select pg_catalog.count(*) from public.bookings b
        where b.created_at >= v_start and b.created_at < v_end),
      'bookingsCompleted', (select pg_catalog.count(*) from public.bookings b
        where b.created_at >= v_start and b.created_at < v_end and b.status = 'completed'),
      'publishedWorkers', (select pg_catalog.count(*) from public.provider_profiles p
        where p.is_published and p.deleted_at is null),
      'openDisputes', (select pg_catalog.count(*) from public.disputes d
        where d.status in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review')),
      'openReports', (select pg_catalog.count(*) from public.trust_reports r
        where r.status in ('submitted','triage','investigating')),
      'activeIncidents', (select pg_catalog.count(*) from public.operational_incidents i
        where i.status in ('open','mitigating','monitoring')),
      'onlinePaymentsEnabled', (select c.gateway_mode <> 'disabled' from private.payment_configuration c where c.id),
      'marketplaceEnabled', (select m.enabled from private.marketplace_configuration m where m.singleton)
    ) into v_metrics;
  end if;

  perform private.staff_log_access(v_actor, 'analytics', 'view_analytics', p_dashboard, 1);
  return pg_catalog.jsonb_build_object(
    'dashboard', p_dashboard,
    'from', v_from, 'to', v_to,
    'timezone', v_config.display_timezone,
    'timeBasis', 'record creation time, bucketed by the reporting timezone',
    'minimumCell', v_config.analytics_minimum_cell,
    'partial', v_to >= (pg_catalog.now() at time zone v_config.display_timezone)::date,
    'generatedAt', pg_catalog.now(),
    'metrics', coalesce(v_metrics,'{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 29. Approved exports (bounded, column allowlisted, audited, expiring)
-- ---------------------------------------------------------------------------
--
-- File generation is deliberately NOT implemented. There is no signed-URL
-- pipeline, no storage bucket, and no background job, so nothing can leak
-- through an unauthenticated link. A request produces an authorization record
-- and a bounded, revalidated, in-band preview only.

create or replace function public.staff_request_export(
  p_report_key text, p_range_start date, p_range_end date, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_catalog private.staff_export_catalog%rowtype; v_config private.staff_platform_configuration%rowtype; v_id uuid; v_existing uuid;
begin
  select * into v_catalog from private.staff_export_catalog c where c.report_key = p_report_key;
  if v_catalog.report_key is null then raise exception 'Unknown export report' using errcode = '22023'; end if;
  v_actor := private.require_staff_capability(v_catalog.capability_key);
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  if p_range_start is null or p_range_end is null or p_range_end < p_range_start
     or p_range_end - p_range_start > 366 then
    raise exception 'Export range must be within 366 days' using errcode = '22023';
  end if;
  -- A sensitive export always states why.
  if v_catalog.sensitive and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'A reason is required for a sensitive export' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid export request' using errcode = '22023';
  end if;
  select e.id into v_existing from private.staff_export_requests e where e.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('exportId', v_existing, 'duplicate', true);
  end if;
  insert into private.staff_export_requests(
    report_key, requested_by, reason, range_start, range_end, row_limit, expires_at, idempotency_key)
  values (p_report_key, v_actor, pg_catalog.btrim(coalesce(p_reason,'Operational reporting')),
          p_range_start, p_range_end, v_config.export_row_limit,
          pg_catalog.now() + pg_catalog.make_interval(hours => 24), p_idempotency_key)
  returning id into v_id;
  perform private.staff_log_access(v_actor, 'export_request', v_catalog.capability_key, p_report_key, 0);
  perform private.record_staff_audit(v_actor, v_catalog.capability_key, 'export_requested',
    'staff_export_request', v_id, pg_catalog.btrim(coalesce(p_reason,'Operational reporting')),
    pg_catalog.jsonb_build_object('reportKey', p_report_key, 'rangeStart', p_range_start, 'rangeEnd', p_range_end));
  return pg_catalog.jsonb_build_object('exportId', v_id, 'duplicate', false,
    'columns', pg_catalog.to_jsonb(v_catalog.column_allowlist),
    'rowLimit', v_config.export_row_limit,
    'expiresAt', pg_catalog.now() + pg_catalog.make_interval(hours => 24));
end;
$$;

create or replace function public.staff_export_preview(p_export_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_request private.staff_export_requests%rowtype;
  v_catalog private.staff_export_catalog%rowtype; v_rows jsonb; v_start timestamptz; v_end timestamptz;
begin
  select * into v_request from private.staff_export_requests e where e.id = p_export_id for update;
  if v_request.id is null then raise exception 'Export not found' using errcode = 'P0002'; end if;
  select * into v_catalog from private.staff_export_catalog c where c.report_key = v_request.report_key;
  -- Authorization is revalidated on every download, never trusted from the
  -- original request.
  v_actor := private.require_staff_capability(v_catalog.capability_key);
  if v_request.requested_by <> v_actor then
    raise exception 'This export belongs to another staff member' using errcode = '42501';
  end if;
  if v_request.status <> 'approved' or v_request.expires_at <= pg_catalog.now() then
    update private.staff_export_requests set status = 'expired' where id = p_export_id and status = 'approved';
    raise exception 'This export is no longer available' using errcode = '42501';
  end if;
  v_start := v_request.range_start::timestamptz;
  v_end := (v_request.range_end + 1)::timestamptz;

  if v_request.report_key = 'queue_throughput' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('queueKey', a.queue_key,
        'opened', pg_catalog.count(*),
        'resolved', pg_catalog.count(*) filter (where a.resolved_at is not null),
        'closed', pg_catalog.count(*) filter (where a.closed_at is not null),
        'medianHours', pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (
          order by pg_catalog.date_part('epoch', coalesce(a.resolved_at, pg_catalog.now()) - a.created_at))::numeric / 3600, 2)) item
      from public.operational_assignments a
      where a.created_at >= v_start and a.created_at < v_end
      group by a.queue_key limit v_request.row_limit) rows;
  elsif v_request.report_key = 'dispute_outcomes' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('disputeId', d.id, 'reason', d.reason,
        'resolutionType', d.resolution_type, 'openedAt', d.created_at, 'resolvedAt', d.resolved_at) item
      from public.disputes d where d.created_at >= v_start and d.created_at < v_end
      order by d.created_at limit v_request.row_limit) rows;
  elsif v_request.report_key = 'verification_decisions' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('verificationId', v.id, 'status', v.status,
        'submittedAt', v.submitted_at, 'reviewedAt', v.reviewed_at) item
      from public.provider_verifications v
      where v.submitted_at >= v_start and v.submitted_at < v_end
      order by v.submitted_at limit v_request.row_limit) rows;
  elsif v_request.report_key = 'reconciliation_exceptions' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('exceptionId', e.id, 'exceptionType', e.exception_type,
        'severity', e.severity, 'status', e.status, 'createdAt', e.created_at) item
      from private.reconciliation_exceptions e
      where e.created_at >= v_start and e.created_at < v_end
      order by e.created_at limit v_request.row_limit) rows;
  else
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('day', d.day,
        'requestsCreated', pg_catalog.count(r.id),
        'requestsWithQuotes', pg_catalog.count(r.id) filter (
          where exists (select 1 from public.worker_quotes wq where wq.request_id = r.id)),
        'requestsExpired', pg_catalog.count(r.id) filter (where r.status = 'expired'),
        'noProviderOutcomes', pg_catalog.count(r.id) filter (
          where not exists (select 1 from public.quote_invitations i where i.request_id = r.id))) item
      from pg_catalog.generate_series(v_request.range_start, v_request.range_end, '1 day'::interval) d(day)
      left join public.marketplace_requests r
        on r.created_at >= d.day::timestamptz and r.created_at < (d.day + interval '1 day')
      group by d.day order by d.day limit v_request.row_limit) rows;
  end if;

  update private.staff_export_requests
    set download_count = download_count + 1, last_downloaded_at = pg_catalog.now()
    where id = p_export_id;
  perform private.staff_log_access(v_actor, 'export_preview', v_catalog.capability_key,
    v_request.report_key, pg_catalog.jsonb_array_length(coalesce(v_rows,'[]'::jsonb)));
  perform private.record_staff_audit(v_actor, v_catalog.capability_key, 'export_downloaded',
    'staff_export_request', p_export_id, v_request.reason,
    pg_catalog.jsonb_build_object('reportKey', v_request.report_key));
  return pg_catalog.jsonb_build_object(
    'exportId', p_export_id, 'reportKey', v_request.report_key,
    'columns', pg_catalog.to_jsonb(v_catalog.column_allowlist),
    'rows', coalesce(v_rows,'[]'::jsonb),
    'rowLimit', v_request.row_limit,
    'fileDeliveryAvailable', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 30. RLS — staff-scoped reads, no client writes anywhere
-- ---------------------------------------------------------------------------

alter table public.staff_roles enable row level security;
alter table public.staff_capabilities enable row level security;
alter table public.staff_role_capabilities enable row level security;
alter table public.staff_role_grants enable row level security;
alter table public.staff_queues enable row level security;
alter table public.operational_assignments enable row level security;
alter table public.operational_assignment_events enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.operational_incident_events enable row level security;
alter table public.support_ticket_events enable row level security;

create or replace function private.staff_is_operator()
returns boolean language sql stable security definer set search_path='' as $$
  select private.staff_platform_ready()
     and pg_catalog.cardinality(private.staff_capability_keys((select auth.uid()))) > 0
$$;
revoke all on function private.staff_is_operator() from public, anon;

-- RLS policy expressions are evaluated with the caller's privileges, so the
-- three helpers used inside a policy carry EXECUTE for `authenticated`. Each
-- one answers only about the caller's own access or about a queue definition;
-- private.staff_capability_keys(uuid), which could answer about another
-- account, deliberately stays revoked.
grant execute on function private.staff_is_operator() to authenticated;
grant execute on function private.staff_has_capability(text) to authenticated;
grant execute on function private.staff_queue_capability(text) to authenticated;

drop policy if exists staff_roles_staff_read on public.staff_roles;
create policy staff_roles_staff_read on public.staff_roles
  for select to authenticated using (private.staff_is_operator());

drop policy if exists staff_capabilities_staff_read on public.staff_capabilities;
create policy staff_capabilities_staff_read on public.staff_capabilities
  for select to authenticated using (private.staff_is_operator());

drop policy if exists staff_role_capabilities_staff_read on public.staff_role_capabilities;
create policy staff_role_capabilities_staff_read on public.staff_role_capabilities
  for select to authenticated using (private.staff_is_operator());

-- A staff member may see their own grants; the full directory needs the
-- role-administration capability.
drop policy if exists staff_role_grants_scoped_read on public.staff_role_grants;
create policy staff_role_grants_scoped_read on public.staff_role_grants
  for select to authenticated using (
    user_id = (select auth.uid()) or private.staff_has_capability('manage_staff_roles'));

drop policy if exists staff_queues_staff_read on public.staff_queues;
create policy staff_queues_staff_read on public.staff_queues
  for select to authenticated using (private.staff_is_operator());

drop policy if exists operational_assignments_staff_read on public.operational_assignments;
create policy operational_assignments_staff_read on public.operational_assignments
  for select to authenticated using (
    private.staff_has_capability(private.staff_queue_capability(queue_key)));

drop policy if exists operational_assignment_events_staff_read on public.operational_assignment_events;
create policy operational_assignment_events_staff_read on public.operational_assignment_events
  for select to authenticated using (exists (
    select 1 from public.operational_assignments a
    where a.id = operational_assignment_events.assignment_id
      and private.staff_has_capability(private.staff_queue_capability(a.queue_key))));

drop policy if exists operational_incidents_staff_read on public.operational_incidents;
create policy operational_incidents_staff_read on public.operational_incidents
  for select to authenticated using (private.staff_has_capability('manage_incidents'));

drop policy if exists operational_incident_events_staff_read on public.operational_incident_events;
create policy operational_incident_events_staff_read on public.operational_incident_events
  for select to authenticated using (private.staff_has_capability('manage_incidents'));

-- Support cases: the requester sees their own history; staff need the support
-- capability. Staff-private notes are never exposed to a participant.
drop policy if exists support_ticket_events_scoped_read on public.support_ticket_events;
create policy support_ticket_events_scoped_read on public.support_ticket_events
  for select to authenticated using (
    private.staff_has_capability('manage_support_cases')
    or exists (select 1 from public.support_tickets t
               where t.id = support_ticket_events.ticket_id and t.requester_id = (select auth.uid())));

-- The WPS-001 support tables were dormant: RLS was enabled but `authenticated`
-- held no SELECT, so the owner policy was unreachable. Activating support cases
-- grants the missing read and adds a capability-scoped staff policy alongside
-- the original owner policy, which is left untouched.
drop policy if exists support_tickets_scoped_read on public.support_tickets;
create policy support_tickets_scoped_read on public.support_tickets
  for select to authenticated using (
    requester_id = (select auth.uid()) or private.staff_has_capability('manage_support_cases'));

drop policy if exists support_messages_scoped_read on public.support_messages;
create policy support_messages_scoped_read on public.support_messages
  for select to authenticated using (
    private.staff_has_capability('manage_support_cases')
    or (visibility = 'participants' and exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id and t.requester_id = (select auth.uid()))));

-- ---------------------------------------------------------------------------
-- 31. Grants — read only for clients, every mutation through a guarded RPC
-- ---------------------------------------------------------------------------

revoke all on public.staff_roles from anon;
revoke all on public.staff_capabilities from anon;
revoke all on public.staff_role_capabilities from anon;
revoke all on public.staff_role_grants from anon;
revoke all on public.staff_queues from anon;
revoke all on public.operational_assignments from anon;
revoke all on public.operational_assignment_events from anon;
revoke all on public.operational_incidents from anon;
revoke all on public.operational_incident_events from anon;
revoke all on public.support_ticket_events from anon;

revoke insert, update, delete on public.staff_roles from anon, authenticated;
revoke insert, update, delete on public.staff_capabilities from anon, authenticated;
revoke insert, update, delete on public.staff_role_capabilities from anon, authenticated;
revoke insert, update, delete on public.staff_role_grants from anon, authenticated;
revoke insert, update, delete on public.staff_queues from anon, authenticated;
revoke insert, update, delete on public.operational_assignments from anon, authenticated;
revoke insert, update, delete on public.operational_assignment_events from anon, authenticated;
revoke insert, update, delete on public.operational_incidents from anon, authenticated;
revoke insert, update, delete on public.operational_incident_events from anon, authenticated;
revoke insert, update, delete on public.support_ticket_events from anon, authenticated;
revoke insert, update, delete on public.support_messages from anon, authenticated;
revoke insert, update, delete on public.support_tickets from anon, authenticated;

revoke all on public.support_tickets from anon;
revoke all on public.support_messages from anon;

grant select on public.staff_roles, public.staff_capabilities, public.staff_role_capabilities,
  public.staff_role_grants, public.staff_queues, public.operational_assignments,
  public.operational_assignment_events, public.operational_incidents,
  public.operational_incident_events, public.support_ticket_events,
  public.support_tickets, public.support_messages to authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.get_staff_session()',
    'public.staff_reauthenticate()',
    'public.staff_revoke_my_sessions()',
    'public.staff_grant_role(uuid,text,text,text,timestamptz)',
    'public.staff_revoke_role(uuid,text)',
    'public.get_staff_role_directory()',
    'public.get_staff_home()',
    'public.get_staff_queue(text,text,integer,integer)',
    'public.staff_open_case(text,uuid,text,text,text,timestamptz)',
    'public.staff_assign_case(uuid,uuid,integer,text,text)',
    'public.staff_transition_case(uuid,text,integer,text,text)',
    'public.staff_add_case_note(uuid,text,text)',
    'public.get_staff_case(uuid)',
    'public.get_staff_workload()',
    'public.staff_safe_search(text,text)',
    'public.get_staff_customer_overview(uuid)',
    'public.get_staff_worker_overview(uuid)',
    'public.staff_create_configuration_draft(text,text,jsonb,text)',
    'public.staff_submit_configuration(uuid)',
    'public.staff_activate_configuration(uuid,text)',
    'public.staff_rollback_configuration(text,text,integer,text)',
    'public.get_staff_configuration(text)',
    'public.staff_set_feature_flag(text,text,boolean,text,integer,text,date)',
    'public.get_staff_feature_flags()',
    'public.get_my_feature_flags(text)',
    'public.staff_set_kill_switch(text,boolean,text,text)',
    'public.get_staff_kill_switches()',
    'public.get_platform_operational_status()',
    'public.open_support_case(text,text,text,text)',
    'public.reply_support_case(uuid,text,text)',
    'public.get_my_support_cases()',
    'public.staff_transition_support_case(uuid,text,text,text,text,text,uuid)',
    'public.staff_add_support_note(uuid,text,text)',
    'public.get_staff_support_case(uuid)',
    'public.staff_open_incident(text,text,text,text[],text,text)',
    'public.staff_update_incident(uuid,text,text,text,text,text,text,text)',
    'public.get_staff_incidents(boolean)',
    'public.staff_audit_search(text,timestamptz,timestamptz,uuid,uuid,integer,integer)',
    'public.get_staff_analytics(text,date,date)',
    'public.staff_request_export(text,date,date,text,text)',
    'public.staff_export_preview(uuid)'
  ] loop
    execute 'revoke all on function '||v_signature||' from public, anon';
    execute 'grant execute on function '||v_signature||' to authenticated';
  end loop;
end;
$$;

-- No WPS-017 table is published to Realtime, and no private table is readable
-- by any client role.
