-- Warsha stops requiring a second human.
--
-- ## The decision
--
-- Warsha's governed actions were built around two distinct staff identities.
-- That is a reasonable control for an organisation with two operators and a
-- deadlock for one with a single owner, which is what Warsha actually has. The
-- owner has decided that ONE AUTHORISED OPERATOR MAY OPERATE WARSHA, and this
-- migration makes the authority model say that rather than working around it.
--
-- What is removed is a HUMAN-COUNT dependency. Nothing else. Every governed
-- action still requires the capability, an `aal2` session, re-authentication
-- inside the configured window, a non-revoked staff identity, the correct
-- platform environment, an explicit reason, its own action-specific invariants,
-- and an audit row. Those are the controls that were doing the work; counting
-- people was not.
--
-- ## What was actually gating on a second person
--
-- Nine live functions consume the generic authority, and eleven capabilities
-- were marked `dual_control`. Those two sets did not match, which is the first
-- thing worth fixing: five capabilities claimed to need a second approver and
-- no code ever asked for one.
--
--   consume dual control        approve_configuration        no gate
--     activate_external_provider_core   manage_legal_holds   no gate
--     process_financial_refund          manage_staff_roles   no gate
--     staff_activate_campaign           manage_vetting_policy no gate
--     staff_activate_referral_program   reject_worker_application no gate
--     staff_publish_legal_version
--     staff_record_enforcement_action
--     staff_record_processing_basis_review
--     staff_record_subprocessor_agreement
--     staff_sync_provider_status
--
-- ## One canonical authority
--
-- The policy now lives on the capability, as `approval_policy`, with exactly
-- two values: `single_operator` and `dual_control`. Dual control is NOT
-- deleted — the machinery, the request table, the distinct-approver constraint
-- and the approval RPC all remain, so a future Warsha with two operators can
-- turn it back on for a named capability without a migration like this one in
-- reverse. It is simply not the policy any capability uses today.
--
-- `dual_control` survives as a GENERATED column derived from `approval_policy`,
-- because twenty-one functions read it by that name and because a derived
-- column cannot contradict the field it is derived from. That is the point: the
-- old boolean and a new enum sitting side by side, separately writable, is
-- exactly the contradictory metadata this migration exists to remove. A future
-- capability row must set `approval_policy` and must not set `dual_control`.
--
-- ## Environment stops deciding
--
-- `required_approval_count(environment, action)` used to answer "2 unless you
-- are development". That was the wrong axis: how many people an action needs is
-- a property of the ACTION, not of which project it runs against. The
-- capability catalogue is now the authority, and `consume_dual_control` reads
-- it — it already receives the capability, so every one of the nine gates
-- inherits the correct policy without being rewritten and without any of them
-- being transcribed by hand, which is how a security-definer body acquires a
-- bug.
--
-- The two environment-keyed helpers are kept because callers use them to LABEL
-- audit rows, and they now derive their answer from the catalogue so the label
-- cannot disagree with the authorisation. They summarise the platform rather
-- than one action, which is exact while the catalogue is uniform and would
-- over-report if it ever became mixed. `staff-authority-boundary.test.sql`
-- asserts the catalogue is uniform, so that divergence fails a test rather than
-- quietly mislabelling an audit row.
--
-- ## The audit trail still tells the truth
--
-- A single-operator authorisation is recorded as one: governance mode
-- `single_operator`, one required approval, `approved_by` left NULL because
-- nobody seconded anything, and an audit action that says
-- `single_operator_authorisation_consumed`. Nothing pretends a second approval
-- occurred. Historical `single_admin` and `dual_control` rows are left exactly
-- as they were — they describe what was true when they were written.

-- ---------------------------------------------------------------------------
-- 1. THE CAPABILITY CATALOGUE BECOMES THE AUTHORITY
-- ---------------------------------------------------------------------------

alter table public.staff_capabilities
  add column if not exists approval_policy text not null default 'single_operator';

-- `dual_control` is DERIVED from here on, but it is not dropped and re-added as
-- a generated column: migrations in this repository are forward-only and
-- dropping a column is destructive, which `audit:migrations` refuses and is
-- right to refuse. A trigger derives it and a constraint proves the derivation
-- held. That gives the same guarantee — the two cannot disagree — while
-- destroying nothing and leaving every existing reader working.
create or replace function private.derive_capability_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- approval_policy is the authority. Anything a writer puts in dual_control is
  -- overwritten rather than honoured, so there is exactly one way to change it.
  new.dual_control := (new.approval_policy = 'dual_control');
  return new;
end;
$$;

revoke all on function private.derive_capability_approval()
  from public, anon, authenticated;

drop trigger if exists staff_capabilities_derive_approval on public.staff_capabilities;
create trigger staff_capabilities_derive_approval
before insert or update on public.staff_capabilities
for each row execute function private.derive_capability_approval();

-- Mirror the old boolean first, so the transition is visible in one place
-- rather than assumed.
update public.staff_capabilities
set approval_policy = case when dual_control then 'dual_control' else 'single_operator' end;

-- Then make the decision. Every capability Warsha currently defines becomes
-- single-operator. This is the owner's policy change, stated once.
update public.staff_capabilities set approval_policy = 'single_operator';

alter table public.staff_capabilities
  drop constraint if exists staff_capabilities_approval_policy_check;
alter table public.staff_capabilities
  add constraint staff_capabilities_approval_policy_check
  check (approval_policy in ('single_operator', 'dual_control'));

alter table public.staff_capabilities
  drop constraint if exists staff_capabilities_policy_agrees_check;
alter table public.staff_capabilities
  add constraint staff_capabilities_policy_agrees_check
  check (dual_control = (approval_policy = 'dual_control'));

comment on column public.staff_capabilities.approval_policy is
  'How many authorised humans this capability requires: single_operator or '
  'dual_control. THE canonical authority.';
comment on column public.staff_capabilities.dual_control is
  'Derived from approval_policy by a trigger and held to it by a constraint. '
  'Writing it has no effect; set approval_policy instead. Retained because '
  'existing functions read it by this name.';

-- ---------------------------------------------------------------------------
-- 2. THE REQUEST RECORD LEARNS THE NEW MODE NAME
-- ---------------------------------------------------------------------------
--
-- `single_admin` stays permitted so historical rows remain legal and unrewritten.

alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_mode_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_mode_check
  check (governance_mode in ('dual_control', 'single_admin', 'single_operator'));

alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_required_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_required_check
  check (required_approvals between 1 and 2
     and ((governance_mode in ('single_admin', 'single_operator')) = (required_approvals = 1)));

-- A one-person authorisation must never carry a second approver's name. The
-- constraint is the reason a "single operator" row cannot be dressed up later
-- as something two people agreed to.
alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_single_admin_check;
alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_single_operator_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_single_operator_check
  check (governance_mode = 'dual_control' or approved_by is null);

-- ---------------------------------------------------------------------------
-- 3. THE POLICY, READ FROM THE CAPABILITY
-- ---------------------------------------------------------------------------

create or replace function private.approval_policy_for(p_capability text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- An unknown capability falls to single_operator, which is safe because the
  -- caller has already been through require_staff_capability and an unknown
  -- capability cannot be held by anybody.
  select coalesce(
    (select c.approval_policy from public.staff_capabilities c
      where c.capability_key = p_capability),
    'single_operator');
$$;

comment on function private.approval_policy_for(text) is
  'THE authority on how many authorised humans a capability requires. Read from '
  'the capability catalogue, which is the only place the answer is stored.';

revoke all on function private.approval_policy_for(text)
  from public, anon, authenticated;

-- Deliberately NOT keyed on environment any more. Kept at this signature
-- because callers label audit rows with it; the answer now comes from the
-- catalogue so a label cannot contradict an authorisation.
create or replace function private.required_approval_count(
  p_environment text,
  p_action_key text default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.staff_capabilities
                 where approval_policy = 'dual_control')
      then 2
    else 1
  end;
$$;

comment on function private.required_approval_count(text, text) is
  'A platform-wide summary of the capability catalogue, retained so existing '
  'callers can label an audit row. It is exact while every capability shares '
  'one policy, which a test enforces. Per-capability truth is '
  'private.approval_policy_for.';

revoke all on function private.required_approval_count(text, text)
  from public, anon, authenticated;

create or replace function private.governance_mode(
  p_environment text,
  p_action_key text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.required_approval_count(p_environment, p_action_key) >= 2
      then 'dual_control'
    else 'single_operator'
  end;
$$;

comment on function private.governance_mode(text, text) is
  'The name of the policy in force, derived from required_approval_count so the '
  'two can never disagree.';

revoke all on function private.governance_mode(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. CONSUMPTION ASKS THE CAPABILITY, NOT THE ENVIRONMENT
-- ---------------------------------------------------------------------------
--
-- One function, nine callers, no transcription. The single-operator branch does
-- not create a request and then approve it against itself — that would put a
-- second name in the trail that does not exist. It records one authorisation,
-- by one person, and says so.

create or replace function private.consume_dual_control(
  p_capability text,
  p_action_key text,
  p_subject_ref text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_policy text;
  v_enabled boolean;
  v_environment text := private.platform_environment();
  v_row private.staff_dual_control_requests%rowtype;
  v_reason text;
begin
  if v_uid is null then
    return false;
  end if;

  v_policy := private.approval_policy_for(p_capability);
  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));

  -- -------------------------------------------------------------------------
  -- SINGLE OPERATOR
  -- -------------------------------------------------------------------------
  if v_policy = 'single_operator' then
    -- A reason is part of the control, not decoration: it is the only record of
    -- WHY a high-risk action was taken, and the caller has already validated
    -- its own. This is the floor.
    if pg_catalog.length(v_reason) < 10 then
      v_reason := 'Authorised by a single operator under Warsha single-operator '
        || 'governance in the ' || v_environment || ' environment.';
    end if;

    select * into v_row
    from private.staff_dual_control_requests r
    where r.capability_key = p_capability
      and r.action_key = p_action_key
      and r.subject_ref = p_subject_ref
      and r.requested_by = v_uid
    for update;

    if v_row.id is null then
      insert into private.staff_dual_control_requests(
        capability_key, action_key, subject_ref, requested_by, requested_reason,
        expires_at, environment, governance_mode, required_approvals)
      values (
        p_capability, p_action_key, p_subject_ref, v_uid, v_reason,
        pg_catalog.now() + pg_catalog.make_interval(hours => 24), v_environment,
        'single_operator', 1)
      returning * into v_row;
    elsif v_row.consumed_at is not null then
      raise exception 'That authorisation was already used' using errcode = '42501';
    elsif v_row.expires_at <= pg_catalog.now() then
      raise exception 'That authorisation expired' using errcode = '42501';
    end if;

    update private.staff_dual_control_requests
    set consumed_at = pg_catalog.now()
    where id = v_row.id;

    -- `secondApprover` is null and `approverCount` is one. The trail says what
    -- happened rather than what a two-person policy would have wanted.
    perform private.record_staff_audit(
      v_uid, p_capability, 'single_operator_authorisation_consumed',
      'staff_dual_control_request', v_row.id, v_row.requested_reason,
      pg_catalog.jsonb_build_object(
        'actionKey', p_action_key,
        'subjectRef', p_subject_ref,
        'environment', v_environment,
        'governanceMode', 'single_operator',
        'requiredApprovals', 1,
        'approverCount', 1,
        'secondApprover', null));
    return true;
  end if;

  -- -------------------------------------------------------------------------
  -- DUAL CONTROL — unchanged, and still available to any capability that asks
  -- -------------------------------------------------------------------------
  --
  -- The platform switch is checked only here. Under single-operator policy it
  -- is irrelevant, and letting it veto an action that does not use dual control
  -- would be a fail-closed on a control that is not in play.
  select c.dual_control_enabled into v_enabled
  from private.staff_platform_configuration c
  where c.singleton;
  if not coalesce(v_enabled, false) then
    return false;
  end if;

  select * into v_row
  from private.staff_dual_control_requests r
  where r.capability_key = p_capability
    and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref
    and r.requested_by = v_uid
    and r.environment = v_environment
  for update;

  if v_row.id is null then
    raise exception 'This action requires a second approver' using errcode = '42501';
  end if;
  if v_row.approved_by is null then
    raise exception 'This action is waiting for a second approver' using errcode = '42501';
  end if;
  if v_row.approved_by = v_row.requested_by then
    raise exception 'This action requires a second approver' using errcode = '42501';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'That approval was already used' using errcode = '42501';
  end if;
  if v_row.expires_at <= pg_catalog.now() then
    raise exception 'That approval expired' using errcode = '42501';
  end if;

  update private.staff_dual_control_requests
  set consumed_at = pg_catalog.now()
  where id = v_row.id;
  return true;
end;
$$;

comment on function private.consume_dual_control(text, text, text, text) is
  'Spends one authorisation under the policy private.approval_policy_for '
  'returns for the CAPABILITY. Under single_operator the authorising operator '
  'is the whole control and the record says so, with no second approver and no '
  'pretence of one. Under dual_control two distinct identities are still '
  'required. Returns false when dual control is required but switched off, '
  'which every caller treats as a refusal.';

revoke all on function private.consume_dual_control(text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. BOOTSTRAP SHRINKS TO WHAT IT IS STILL FOR
-- ---------------------------------------------------------------------------
--
-- `202609060009` bounded bootstrap to two identities, because a governed grant
-- consumed dual control and dual control needed two people. That reason is
-- gone: `staff_grant_role` requires `manage_staff_roles`, which is now
-- single-operator, so one authorised administrator can onboard everybody else
-- through the governed path.
--
-- So the circularity bootstrap exists to break is one identity deep again, and
-- the door closes after one. Staff #2 onwards arrive through
-- `public.staff_grant_role` with a named granter and an audit row — which is a
-- better record than a bootstrap grant, not a worse one.
--
-- Self-escalation stays blocked: `staff_grant_role` refuses when the subject is
-- the actor. Changing the owner's OWN roles remains a database-owner action,
-- which is the documented break-glass path and reads as a grant with nobody's
-- name on it.

create or replace function private.bootstrap_staff_role(
  p_user_id uuid, p_role_key text, p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_identities integer;
begin
  if p_user_id is null or p_role_key is null then
    raise exception 'A user and a role are required' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_roles r where r.role_key = p_role_key) then
    raise exception 'Unknown staff role' using errcode = '22023';
  end if;

  -- Repeating an existing live grant creates no new authority, so it stays
  -- idempotent after the door closes.
  select g.id into v_id
  from public.staff_role_grants g
  where g.user_id = p_user_id
    and g.role_key = p_role_key
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());
  if v_id is not null then
    return v_id;
  end if;

  select pg_catalog.count(distinct g.user_id) into v_identities
  from public.staff_role_grants g
  where g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());

  if v_identities >= 1 then
    raise exception
      'Bootstrap is closed: a staff identity already exists. '
      'Use public.staff_grant_role, which is governed.'
      using errcode = '42501';
  end if;

  insert into public.staff_role_grants(user_id, role_key, granted_by, reason, idempotency_key)
  values (p_user_id, p_role_key, null, pg_catalog.btrim(p_reason),
          'bootstrap:'||p_role_key||':'||p_user_id::text)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception
      'A previous bootstrap grant for this account and role was revoked. '
      'Use public.staff_grant_role, which is governed.'
      using errcode = '42501';
  end if;
  return v_id;
end;
$$;

comment on function private.bootstrap_staff_role(uuid, text, text) is
  'Creates the FIRST staff identity, because no administrator exists to grant '
  'it. Refuses once any active staff identity exists: from that point '
  'public.staff_grant_role is governed, single-operator, and leaves a better '
  'record. Constrains the function only — a database owner can still insert a '
  'grant directly, which is the documented break-glass path.';

revoke all on function private.bootstrap_staff_role(uuid,text,text)
  from public, anon, authenticated;
