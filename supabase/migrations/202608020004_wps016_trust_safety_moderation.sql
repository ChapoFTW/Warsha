-- WPS-016 — Trust, Safety & Moderation
--
-- WPS-016 is the single authority for platform trust state, unified abuse
-- reporting, moderation, enforcement, fraud signals, investigations, and
-- appeals. It EXTENDS the existing architecture and replaces nothing:
--
--   * WPS-006 verification remains the identity authority.
--   * WPS-009 booking_abuse_reports remains the chat abuse intake.
--   * WPS-011 review_reports / moderate_review remain the review authority.
--   * WPS-013 disputes remain the service dispute authority.
--   * WPS-015 chargebacks remain the payment-provider dispute authority.
--   * WPS-007 earning holds remain the financial hold authority.
--
-- WPS-016 links to those systems; it never duplicates or bypasses them.
--
-- No external moderation provider, no AI moderation, and no automatic
-- permanent ban exists anywhere in this migration.

-- ---------------------------------------------------------------------------
-- 1. Unified report intake (immutable)
-- ---------------------------------------------------------------------------

create table if not exists public.trust_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  subject_type text not null,
  subject_id uuid,
  category text not null,
  details text,
  source_surface text not null,
  source_report_id uuid,
  status text not null default 'submitted',
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint trust_reports_subject_type_check check (subject_type in (
    'user','booking','chat_message','review','provider_profile',
    'customer_profile','certificate','payment','profile_media')),
  constraint trust_reports_category_check check (category in (
    'fraud','impersonation','abusive_language','harassment','discrimination',
    'fake_profile','fake_documents','fake_certificates','spam','scam',
    'dangerous_behavior','off_platform_payment','off_platform_contact',
    'illegal_activity','inappropriate_content','copyright','privacy')),
  constraint trust_reports_source_surface_check check (source_surface in (
    'bookings','chat','reviews','providers','customers','payments',
    'certificates','profile_media')),
  constraint trust_reports_status_check check (status in (
    'submitted','triage','investigating','actioned','dismissed','duplicate')),
  constraint trust_reports_details_check
    check (details is null or pg_catalog.length(pg_catalog.btrim(details)) between 1 and 2000),
  constraint trust_reports_idempotency_check
    check (pg_catalog.length(idempotency_key) between 8 and 200),
  constraint trust_reports_not_self_check
    check (subject_user_id is null or subject_user_id <> reporter_id),
  unique (reporter_id, idempotency_key)
);

create index if not exists trust_reports_subject_idx
  on public.trust_reports(subject_user_id, created_at desc);
create index if not exists trust_reports_open_idx
  on public.trust_reports(created_at desc) where status in ('submitted','triage','investigating');

-- Report content is immutable. Only the lifecycle status may move, and only
-- through the guarded staff RPC. Nothing may ever be deleted.
create or replace function private.prevent_trust_report_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Trust reports are immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.reporter_id is distinct from old.reporter_id
     or new.subject_user_id is distinct from old.subject_user_id
     or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id
     or new.category is distinct from old.category
     or new.details is distinct from old.details
     or new.source_surface is distinct from old.source_surface
     or new.source_report_id is distinct from old.source_report_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Trust report content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_trust_report_mutation() from public, anon, authenticated;

drop trigger if exists trust_reports_immutable on public.trust_reports;
create trigger trust_reports_immutable before update or delete on public.trust_reports
for each row execute function private.prevent_trust_report_mutation();

-- Append-only lifecycle history.
create table if not exists public.trust_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.trust_reports(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  public_reason text,
  created_at timestamptz not null default pg_catalog.now()
);
create index if not exists trust_report_events_report_idx
  on public.trust_report_events(report_id, created_at);

-- Staff-only evidence. Never readable by any client role.
create table if not exists private.trust_report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.trust_reports(id) on delete cascade,
  evidence_kind text not null,
  evidence_reference text not null,
  content_sha256 text,
  captured_at timestamptz not null default pg_catalog.now(),
  constraint trust_report_evidence_kind_check
    check (evidence_kind in ('message_reference','media_reference','document_reference',
                             'transaction_reference','system_signal','staff_note')),
  constraint trust_report_evidence_hash_check
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$')
);
revoke all on private.trust_report_evidence from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Centralized trust state (server authoritative)
-- ---------------------------------------------------------------------------

create table if not exists public.trust_account_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trust_level text not null default 'good_standing',
  marketplace_removed boolean not null default false,
  profile_hidden boolean not null default false,
  payment_hold boolean not null default false,
  withdrawal_hold boolean not null default false,
  communication_restricted boolean not null default false,
  review_restricted boolean not null default false,
  restriction_expires_at timestamptz,
  public_reason text,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint trust_account_state_level_check check (trust_level in (
    'good_standing','warned','restricted','under_investigation','suspended','banned')),
  constraint trust_account_state_reason_check
    check (public_reason is null or pg_catalog.length(pg_catalog.btrim(public_reason)) between 3 and 300),
  -- A banned account is terminal and never carries an expiry.
  constraint trust_account_state_ban_terminal_check
    check (trust_level <> 'banned' or restriction_expires_at is null)
);

-- ---------------------------------------------------------------------------
-- 3. Enforcement ledger (immutable; no automatic permanent bans)
-- ---------------------------------------------------------------------------

create table if not exists public.trust_enforcement_actions (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  reason_code text not null,
  public_reason text not null,
  evidence_summary text not null,
  report_id uuid references public.trust_reports(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_kind text not null default 'staff',
  expires_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint trust_enforcement_actions_type_check check (action_type in (
    'warning','temporary_restriction','investigation','suspension','permanent_ban',
    'marketplace_removal','profile_hidden','payment_hold','withdrawal_hold',
    'communication_restriction','review_restriction','restoration')),
  constraint trust_enforcement_actions_reason_check check (reason_code in (
    'fraud','impersonation','abusive_language','harassment','discrimination',
    'fake_profile','fake_documents','fake_certificates','spam','scam',
    'dangerous_behavior','off_platform_payment','off_platform_contact',
    'illegal_activity','inappropriate_content','copyright','privacy',
    'repeated_violations','appeal_upheld','appeal_overturned','investigation_closed')),
  constraint trust_enforcement_actions_public_reason_check
    check (pg_catalog.length(pg_catalog.btrim(public_reason)) between 3 and 300),
  -- Every action requires evidence. This is the audit contract.
  constraint trust_enforcement_actions_evidence_check
    check (pg_catalog.length(pg_catalog.btrim(evidence_summary)) between 3 and 2000),
  -- A permanent ban may never be automatic: it must be attributed to a human
  -- staff actor and must cite a report that was investigated.
  constraint trust_enforcement_actions_no_automatic_ban_check
    check (action_type <> 'permanent_ban' or (actor_kind = 'staff' and report_id is not null)),
  -- Only time-bounded measures may carry an expiry; a ban never does.
  constraint trust_enforcement_actions_expiry_check
    check (action_type <> 'permanent_ban' or expires_at is null),
  constraint trust_enforcement_actions_actor_kind_check
    check (actor_kind in ('staff','system')),
  -- A system actor may only ever raise a non-punitive investigation.
  constraint trust_enforcement_actions_system_scope_check
    check (actor_kind <> 'system' or action_type = 'investigation'),
  unique (idempotency_key)
);
create index if not exists trust_enforcement_actions_subject_idx
  on public.trust_enforcement_actions(subject_user_id, created_at desc);

create or replace function private.prevent_trust_enforcement_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Enforcement history is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_trust_enforcement_mutation() from public, anon, authenticated;

drop trigger if exists trust_enforcement_actions_immutable on public.trust_enforcement_actions;
create trigger trust_enforcement_actions_immutable before update or delete on public.trust_enforcement_actions
for each row execute function private.prevent_trust_enforcement_mutation();

-- ---------------------------------------------------------------------------
-- 4. Appeals
-- ---------------------------------------------------------------------------

create table if not exists public.trust_appeals (
  id uuid primary key default gen_random_uuid(),
  enforcement_action_id uuid not null references public.trust_enforcement_actions(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  statement text not null,
  status text not null default 'submitted',
  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint trust_appeals_status_check check (status in (
    'submitted','under_review','upheld','overturned','partially_overturned','withdrawn')),
  constraint trust_appeals_statement_check
    check (pg_catalog.length(pg_catalog.btrim(statement)) between 10 and 2000),
  constraint trust_appeals_decision_note_check
    check (decision_note is null or pg_catalog.length(pg_catalog.btrim(decision_note)) between 3 and 2000),
  constraint trust_appeals_decided_check
    check (status in ('submitted','under_review','withdrawn') or decided_by is not null),
  -- One appeal per enforcement action per appellant.
  unique (enforcement_action_id, appellant_id),
  unique (appellant_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- 5. Fraud signals — advisory only, never punitive
-- ---------------------------------------------------------------------------

create table if not exists private.trust_fraud_signals (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  signal_key text not null,
  severity text not null default 'info',
  observed_count integer not null default 1,
  window_start timestamptz,
  window_end timestamptz,
  safe_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint trust_fraud_signals_key_check check (signal_key in (
    'excessive_cancellations','duplicate_identity','repeated_failed_verification',
    'abnormal_payment_behavior','repeated_chargebacks','suspicious_review_activity',
    'fake_portfolio_attempt','certificate_abuse','repeated_abuse_reports','account_farming')),
  constraint trust_fraud_signals_severity_check check (severity in ('info','low','medium','high')),
  constraint trust_fraud_signals_count_check check (observed_count between 1 and 100000)
);
revoke all on private.trust_fraud_signals from public, anon, authenticated;
create index if not exists trust_fraud_signals_subject_idx
  on private.trust_fraud_signals(subject_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Immutable moderation audit
-- ---------------------------------------------------------------------------

create table if not exists private.trust_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text not null,
  evidence_reference text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint trust_moderation_audit_reason_check
    check (pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 2000)
);
revoke all on private.trust_moderation_audit from public, anon, authenticated;

create or replace function private.prevent_trust_audit_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Moderation audit is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_trust_audit_mutation() from public, anon, authenticated;

drop trigger if exists trust_moderation_audit_immutable on private.trust_moderation_audit;
create trigger trust_moderation_audit_immutable before update or delete on private.trust_moderation_audit
for each row execute function private.prevent_trust_audit_mutation();

create or replace function private.record_trust_audit(
  p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_reason text, p_evidence_reference text default null)
returns void language sql security definer set search_path='' as $$
  insert into private.trust_moderation_audit(actor_id, action, entity_type, entity_id, reason, evidence_reference)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, p_reason, p_evidence_reference);
$$;
revoke all on function private.record_trust_audit(uuid,text,text,uuid,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Trust state resolution used by other systems
-- ---------------------------------------------------------------------------

-- Capability gate other WPS systems can consult without learning why. An
-- expired restriction is treated as lifted without needing a background job.
create or replace function private.trust_state_allows(p_user_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_state public.trust_account_state%rowtype;
  v_active boolean;
begin
  if p_capability not in ('marketplace','communication','reviews','payments','withdrawals') then
    raise exception 'Unknown trust capability' using errcode = '22023';
  end if;
  select * into v_state from public.trust_account_state s where s.user_id = p_user_id;
  if v_state.user_id is null then
    return true;
  end if;
  if v_state.trust_level = 'banned' then
    return false;
  end if;
  v_active := v_state.restriction_expires_at is null or v_state.restriction_expires_at > pg_catalog.now();
  if not v_active then
    return true;
  end if;
  if v_state.trust_level = 'suspended' then
    return false;
  end if;
  return case p_capability
    when 'marketplace' then not (v_state.marketplace_removed or v_state.profile_hidden)
    when 'communication' then not v_state.communication_restricted
    when 'reviews' then not v_state.review_restricted
    when 'payments' then not v_state.payment_hold
    when 'withdrawals' then not v_state.withdrawal_hold
    else true end;
end;
$$;
revoke all on function private.trust_state_allows(uuid,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Client RPCs — report intake and self-visibility only
-- ---------------------------------------------------------------------------

create or replace function public.submit_trust_report(
  p_subject_type text,
  p_subject_id uuid,
  p_subject_user_id uuid,
  p_category text,
  p_source_surface text,
  p_details text,
  p_idempotency_key text,
  p_source_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.trust_reports%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_subject_user_id is not null and p_subject_user_id = v_uid then
    raise exception 'You cannot report your own account' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid report submission' using errcode = '22023';
  end if;

  select * into v_existing
  from public.trust_reports r
  where r.reporter_id = v_uid and r.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  insert into public.trust_reports(
    reporter_id, subject_user_id, subject_type, subject_id, category,
    details, source_surface, source_report_id, idempotency_key)
  values (v_uid, p_subject_user_id, p_subject_type, p_subject_id, p_category,
          nullif(pg_catalog.btrim(coalesce(p_details,'')),''), p_source_surface, p_source_report_id, p_idempotency_key)
  returning id into v_id;

  insert into public.trust_report_events(report_id, from_status, to_status, actor_id)
  values (v_id, null, 'submitted', v_uid);

  perform private.record_trust_audit(v_uid, 'trust_report_submitted', 'trust_report', v_id,
    'Report submitted by reporter', null);

  -- Reporting is never itself an enforcement action.
  return pg_catalog.jsonb_build_object('id', v_id, 'status', 'submitted', 'duplicate', false);
end;
$$;

-- A reporter sees only their own submissions, and never the outcome detail,
-- staff notes, or evidence belonging to another person.
create or replace function public.get_my_trust_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', r.id,
    'category', r.category,
    'sourceSurface', r.source_surface,
    'status', r.status,
    'createdAt', r.created_at
  ) order by r.created_at desc), '[]'::jsonb) into v_result
  from public.trust_reports r
  where r.reporter_id = v_uid;
  return v_result;
end;
$$;

-- A user may always see what applies to them, in safe language, with no
-- reporter identity, no evidence, and no staff note.
create or replace function public.get_my_trust_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_state public.trust_account_state%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_state from public.trust_account_state s where s.user_id = v_uid;
  if v_state.user_id is null then
    return pg_catalog.jsonb_build_object(
      'trustLevel','good_standing','restrictions','[]'::jsonb,
      'canAppeal', false, 'publicReason', null, 'restrictionExpiresAt', null);
  end if;
  return pg_catalog.jsonb_build_object(
    'trustLevel', v_state.trust_level,
    'restrictions', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'marketplaceRemoved', nullif(v_state.marketplace_removed,false),
      'profileHidden', nullif(v_state.profile_hidden,false),
      'paymentHold', nullif(v_state.payment_hold,false),
      'withdrawalHold', nullif(v_state.withdrawal_hold,false),
      'communicationRestricted', nullif(v_state.communication_restricted,false),
      'reviewRestricted', nullif(v_state.review_restricted,false))),
    'publicReason', v_state.public_reason,
    'restrictionExpiresAt', v_state.restriction_expires_at,
    'canAppeal', v_state.trust_level in ('warned','restricted','suspended','banned'));
end;
$$;

create or replace function public.submit_trust_appeal(
  p_enforcement_action_id uuid,
  p_statement text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_action public.trust_enforcement_actions%rowtype;
  v_existing public.trust_appeals%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_statement,''))) not between 10 and 2000 then
    raise exception 'Appeal statement is required' using errcode = '22023';
  end if;
  select * into v_action
  from public.trust_enforcement_actions a
  where a.id = p_enforcement_action_id and a.subject_user_id = v_uid;
  if v_action.id is null then
    raise exception 'Enforcement action is not available' using errcode = '22023';
  end if;
  if v_action.action_type in ('restoration','investigation') then
    raise exception 'This action cannot be appealed' using errcode = '22023';
  end if;

  select * into v_existing
  from public.trust_appeals ap
  where ap.enforcement_action_id = p_enforcement_action_id and ap.appellant_id = v_uid;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  insert into public.trust_appeals(enforcement_action_id, appellant_id, statement, idempotency_key)
  values (p_enforcement_action_id, v_uid, pg_catalog.btrim(p_statement), p_idempotency_key)
  returning id into v_id;

  perform private.record_trust_audit(v_uid, 'trust_appeal_submitted', 'trust_appeal', v_id,
    'Appeal submitted by affected account', null);

  return pg_catalog.jsonb_build_object('id', v_id, 'status', 'submitted', 'duplicate', false);
end;
$$;

create or replace function public.get_my_trust_appeals()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', ap.id,
    'enforcementActionId', ap.enforcement_action_id,
    'status', ap.status,
    'decisionNote', ap.decision_note,
    'decidedAt', ap.decided_at,
    'createdAt', ap.created_at
  ) order by ap.created_at desc), '[]'::jsonb) into v_result
  from public.trust_appeals ap
  where ap.appellant_id = v_uid;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Staff RPCs — the only path that can change trust state
-- ---------------------------------------------------------------------------

create or replace function public.staff_record_enforcement_action(
  p_subject_user_id uuid,
  p_action_type text,
  p_reason_code text,
  p_public_reason text,
  p_evidence_summary text,
  p_idempotency_key text,
  p_report_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.trust_enforcement_actions%rowtype;
  v_report public.trust_reports%rowtype;
  v_id uuid;
  v_level text;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_evidence_summary,''))) < 3 then
    raise exception 'Evidence is required for every enforcement action' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_public_reason,''))) < 3 then
    raise exception 'A public reason is required' using errcode = '22023';
  end if;

  -- A permanent ban is never automatic and never issued without an
  -- investigated report backing it.
  if p_action_type = 'permanent_ban' then
    if p_report_id is null then
      raise exception 'A permanent ban requires an investigated report' using errcode = '22023';
    end if;
    select * into v_report from public.trust_reports r where r.id = p_report_id;
    if v_report.id is null or v_report.status not in ('investigating','actioned') then
      raise exception 'A permanent ban requires a report that was investigated' using errcode = '22023';
    end if;
  end if;

  select * into v_existing
  from public.trust_enforcement_actions a where a.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'duplicate', true);
  end if;

  insert into public.trust_enforcement_actions(
    subject_user_id, action_type, reason_code, public_reason, evidence_summary,
    report_id, actor_id, actor_kind, expires_at, idempotency_key)
  values (p_subject_user_id, p_action_type, p_reason_code, pg_catalog.btrim(p_public_reason),
          pg_catalog.btrim(p_evidence_summary), p_report_id, v_uid, 'staff', p_expires_at, p_idempotency_key)
  returning id into v_id;

  v_level := case p_action_type
    when 'warning' then 'warned'
    when 'temporary_restriction' then 'restricted'
    when 'investigation' then 'under_investigation'
    when 'suspension' then 'suspended'
    when 'permanent_ban' then 'banned'
    when 'restoration' then 'good_standing'
    else null end;

  insert into public.trust_account_state as s (
    user_id, trust_level, marketplace_removed, profile_hidden, payment_hold,
    withdrawal_hold, communication_restricted, review_restricted,
    restriction_expires_at, public_reason, updated_at, updated_by)
  values (
    p_subject_user_id,
    coalesce(v_level,'restricted'),
    p_action_type = 'marketplace_removal',
    p_action_type = 'profile_hidden',
    p_action_type = 'payment_hold',
    p_action_type = 'withdrawal_hold',
    p_action_type = 'communication_restriction',
    p_action_type = 'review_restriction',
    case when p_action_type = 'permanent_ban' then null else p_expires_at end,
    pg_catalog.btrim(p_public_reason), pg_catalog.now(), v_uid)
  on conflict (user_id) do update set
    trust_level = case
      when p_action_type = 'restoration' then 'good_standing'
      when v_level is not null then v_level
      else s.trust_level end,
    marketplace_removed = case when p_action_type = 'restoration' then false
      else s.marketplace_removed or p_action_type = 'marketplace_removal' end,
    profile_hidden = case when p_action_type = 'restoration' then false
      else s.profile_hidden or p_action_type = 'profile_hidden' end,
    payment_hold = case when p_action_type = 'restoration' then false
      else s.payment_hold or p_action_type = 'payment_hold' end,
    withdrawal_hold = case when p_action_type = 'restoration' then false
      else s.withdrawal_hold or p_action_type = 'withdrawal_hold' end,
    communication_restricted = case when p_action_type = 'restoration' then false
      else s.communication_restricted or p_action_type = 'communication_restriction' end,
    review_restricted = case when p_action_type = 'restoration' then false
      else s.review_restricted or p_action_type = 'review_restriction' end,
    restriction_expires_at = case
      when p_action_type = 'restoration' then null
      when p_action_type = 'permanent_ban' then null
      else coalesce(p_expires_at, s.restriction_expires_at) end,
    public_reason = pg_catalog.btrim(p_public_reason),
    updated_at = pg_catalog.now(),
    updated_by = v_uid;

  perform private.record_trust_audit(v_uid, 'trust_enforcement_'||p_action_type,
    'trust_enforcement_action', v_id, pg_catalog.btrim(p_evidence_summary), p_report_id::text);

  return pg_catalog.jsonb_build_object('id', v_id, 'actionType', p_action_type, 'duplicate', false);
end;
$$;

create or replace function public.staff_transition_trust_report(
  p_report_id uuid,
  p_status text,
  p_public_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.trust_reports%rowtype;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('triage','investigating','actioned','dismissed','duplicate') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;
  select * into v_report from public.trust_reports r where r.id = p_report_id for update;
  if v_report.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  update public.trust_reports set status = p_status where id = p_report_id;
  insert into public.trust_report_events(report_id, from_status, to_status, actor_id, public_reason)
  values (p_report_id, v_report.status, p_status, v_uid, p_public_reason);

  perform private.record_trust_audit(v_uid, 'trust_report_'||p_status, 'trust_report', p_report_id,
    coalesce(p_public_reason,'Report status transition'), null);

  return pg_catalog.jsonb_build_object('id', p_report_id, 'status', p_status);
end;
$$;

create or replace function public.staff_decide_trust_appeal(
  p_appeal_id uuid,
  p_status text,
  p_decision_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_appeal public.trust_appeals%rowtype;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('under_review','upheld','overturned','partially_overturned') then
    raise exception 'Invalid appeal decision' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_decision_note,''))) < 3 then
    raise exception 'A decision note is required' using errcode = '22023';
  end if;
  select * into v_appeal from public.trust_appeals ap where ap.id = p_appeal_id for update;
  if v_appeal.id is null then
    raise exception 'Appeal not found' using errcode = 'P0002';
  end if;

  update public.trust_appeals
    set status = p_status,
        decision_note = pg_catalog.btrim(p_decision_note),
        decided_by = case when p_status = 'under_review' then null else v_uid end,
        decided_at = case when p_status = 'under_review' then null else pg_catalog.now() end
    where id = p_appeal_id;

  perform private.record_trust_audit(v_uid, 'trust_appeal_'||p_status, 'trust_appeal', p_appeal_id,
    pg_catalog.btrim(p_decision_note), null);

  -- Restoration after a successful appeal is a separate, explicit, audited
  -- enforcement action so that the history always shows who restored access.
  return pg_catalog.jsonb_build_object('id', p_appeal_id, 'status', p_status,
    'restorationRequired', p_status in ('overturned','partially_overturned'));
end;
$$;

-- Advisory signal recording. This can never change trust state.
create or replace function private.record_trust_fraud_signal(
  p_subject_user_id uuid,
  p_signal_key text,
  p_severity text default 'info',
  p_observed_count integer default 1,
  p_safe_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  insert into private.trust_fraud_signals(subject_user_id, signal_key, severity, observed_count, safe_detail)
  values (p_subject_user_id, p_signal_key, p_severity, greatest(coalesce(p_observed_count,1),1),
          coalesce(p_safe_detail,'{}'::jsonb))
  returning id into v_id;
  -- Deliberately no enforcement here. Signals inform staff; they never punish.
  return v_id;
end;
$$;
revoke all on function private.record_trust_fraud_signal(uuid,text,text,integer,jsonb)
  from public, anon, authenticated;

create or replace function public.get_staff_trust_queue_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'openReports', (select pg_catalog.count(*)::integer from public.trust_reports r
                    where r.status in ('submitted','triage','investigating')),
    'investigating', (select pg_catalog.count(*)::integer from public.trust_reports r
                      where r.status = 'investigating'),
    'openAppeals', (select pg_catalog.count(*)::integer from public.trust_appeals ap
                    where ap.status in ('submitted','under_review')),
    'activeRestrictions', (select pg_catalog.count(*)::integer from public.trust_account_state s
                           where s.trust_level <> 'good_standing'),
    'highSeveritySignals', (select pg_catalog.count(*)::integer from private.trust_fraud_signals f
                            where f.severity = 'high')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS — owner-scoped reads, no client writes anywhere
-- ---------------------------------------------------------------------------

alter table public.trust_reports enable row level security;
alter table public.trust_report_events enable row level security;
alter table public.trust_account_state enable row level security;
alter table public.trust_enforcement_actions enable row level security;
alter table public.trust_appeals enable row level security;

drop policy if exists trust_reports_reporter_read on public.trust_reports;
create policy trust_reports_reporter_read on public.trust_reports
  for select using (reporter_id = (select auth.uid()) or private.is_staff());

drop policy if exists trust_report_events_scoped_read on public.trust_report_events;
create policy trust_report_events_scoped_read on public.trust_report_events
  for select using (private.is_staff() or exists(
    select 1 from public.trust_reports r
    where r.id = trust_report_events.report_id and r.reporter_id = (select auth.uid())));

drop policy if exists trust_account_state_own_read on public.trust_account_state;
create policy trust_account_state_own_read on public.trust_account_state
  for select using (user_id = (select auth.uid()) or private.is_staff());

drop policy if exists trust_enforcement_actions_subject_read on public.trust_enforcement_actions;
create policy trust_enforcement_actions_subject_read on public.trust_enforcement_actions
  for select using (subject_user_id = (select auth.uid()) or private.is_staff());

drop policy if exists trust_appeals_appellant_read on public.trust_appeals;
create policy trust_appeals_appellant_read on public.trust_appeals
  for select using (appellant_id = (select auth.uid()) or private.is_staff());

-- Clients read through RLS but can never write trust state directly. Every
-- mutation goes through a guarded SECURITY DEFINER RPC.
revoke insert, update, delete on public.trust_reports from anon, authenticated;
revoke insert, update, delete on public.trust_report_events from anon, authenticated;
revoke insert, update, delete on public.trust_account_state from anon, authenticated;
revoke insert, update, delete on public.trust_enforcement_actions from anon, authenticated;
revoke insert, update, delete on public.trust_appeals from anon, authenticated;
revoke all on public.trust_reports from anon;
revoke all on public.trust_report_events from anon;
revoke all on public.trust_account_state from anon;
revoke all on public.trust_enforcement_actions from anon;
revoke all on public.trust_appeals from anon;
grant select on public.trust_reports, public.trust_report_events, public.trust_account_state,
  public.trust_enforcement_actions, public.trust_appeals to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Grants on RPCs
-- ---------------------------------------------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.submit_trust_report(text,uuid,uuid,text,text,text,text,uuid)',
    'public.get_my_trust_reports()',
    'public.get_my_trust_status()',
    'public.submit_trust_appeal(uuid,text,text)',
    'public.get_my_trust_appeals()',
    'public.staff_record_enforcement_action(uuid,text,text,text,text,text,uuid,timestamptz)',
    'public.staff_transition_trust_report(uuid,text,text)',
    'public.staff_decide_trust_appeal(uuid,text,text)',
    'public.get_staff_trust_queue_summary()'
  ] loop
    execute 'revoke all on function '||v_signature||' from public, anon';
    execute 'grant execute on function '||v_signature||' to authenticated';
  end loop;
end;
$$;

-- Private trust tables are never published to Realtime and never client-readable.
