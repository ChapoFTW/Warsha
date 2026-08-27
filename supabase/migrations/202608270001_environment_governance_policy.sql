-- ONE AUTHORITY DECIDES HOW MANY PEOPLE A SENSITIVE ACTION NEEDS
--
-- Dual control was written as a single global rule: every governed action
-- needs two distinct staff identities, everywhere, forever. That is the right
-- rule for the environment real people use. It is the wrong rule for a
-- pre-production environment that has one operator, because the control then
-- stops being a control and becomes an obstacle — and an obstacle is what
-- people route around. A governance model nobody can satisfy honestly is worse
-- than a weaker one they can, because the first produces workarounds and the
-- second produces records.
--
-- So the count becomes a policy rather than a constant, and the policy lives in
-- exactly one function. `private.required_approval_count(environment, action)`
-- answers "how many distinct staff identities does this need here", and every
-- consumer asks it instead of deciding for itself. Nothing scatters an
-- environment test through the callers; there is one place to read the rule and
-- one place to change it.
--
--   development                -> 1  (single_admin)
--   local, staging, production -> 2  (dual_control)
--
-- `local` deliberately keeps dual control. A local reset is a disposable
-- rehearsal of the production configuration and it is where Warsha's own suite
-- proves the two-identity primitive still refuses what it is supposed to
-- refuse. Development is the environment that has one operator, so development
-- is the environment that gets the one-operator rule.
--
-- What this deliberately does NOT do:
--   * weaken authentication. Every governed RPC still begins at
--     `private.require_staff_capability`, which needs a real staff JWT. A
--     service role makes `auth.uid()` null and is refused exactly as before.
--   * relax local, staging or production. Two distinct identities remain
--     required there, enforced by the same table constraint that always
--     enforced it.
--   * invent an approver. In single-admin mode `approved_by` stays NULL. There
--     is no fictional second person anywhere in the record; the row says
--     `governance_mode = 'single_admin'` and names one actor, which is the
--     truth.
--   * activate a provider, enable a flag, clear a kill switch, publish legal
--     text, or record any agreement.

-- ---------------------------------------------------------------------------
-- 1. THE POLICY
-- ---------------------------------------------------------------------------

create or replace function private.required_approval_count(
  p_environment text,
  p_action_key text default null
)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  -- `p_action_key` is accepted so a future action can need more than its
  -- environment's default without every consumer changing shape. Nothing
  -- varies by action today, and pretending otherwise by inventing per-action
  -- rows nobody set would be a configuration table with no configuration in it.
  select case
    when p_environment = 'development' then 1
    else 2
  end;
$$;

comment on function private.required_approval_count(text, text) is
  'The single authority on how many distinct staff identities a governed action '
  'requires. 1 in development; 2 everywhere else, including local.';

revoke all on function private.required_approval_count(text, text)
  from public, anon, authenticated;

create or replace function private.governance_mode(
  p_environment text,
  p_action_key text default null
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when private.required_approval_count(p_environment, p_action_key) >= 2
      then 'dual_control'
    else 'single_admin'
  end;
$$;

comment on function private.governance_mode(text, text) is
  'The name of the policy in force, derived from required_approval_count so the '
  'two can never disagree.';

revoke all on function private.governance_mode(text, text)
  from public, anon, authenticated;

-- A staff-readable window on the same authority, so a console can render the
-- policy it is about to be governed by instead of guessing at it. Read-only,
-- and it discloses nothing an operator could not infer from the banner naming
-- their environment.
create or replace function public.staff_governance_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_environment text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.staff_is_operator() then
    raise exception 'Staff access is required' using errcode = '42501';
  end if;
  v_environment := private.platform_environment();
  return pg_catalog.jsonb_build_object(
    'environment', v_environment,
    'requiredApprovals', private.required_approval_count(v_environment, null),
    'governanceMode', private.governance_mode(v_environment, null),
    'dualControlEnabled', (
      select c.dual_control_enabled
      from private.staff_platform_configuration c
      where c.singleton));
end;
$$;

comment on function public.staff_governance_policy() is
  'How many approvals a governed action needs in this environment, and what that '
  'policy is called. Read-only; grants nothing.';

revoke all on function public.staff_governance_policy() from public, anon;
grant execute on function public.staff_governance_policy() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE RECORD SAYS WHICH POLICY PRODUCED IT
-- ---------------------------------------------------------------------------
--
-- Without this an auditor reading a one-actor row later cannot tell whether
-- the second approval was waived by policy or was never sought. The column is
-- stamped at creation, frozen by the immutability trigger, and defaults to the
-- stricter value so an unstamped historical row reads as dual control — which
-- is what every existing row is.

alter table private.staff_dual_control_requests
  add column if not exists governance_mode text not null default 'dual_control';

alter table private.staff_dual_control_requests
  add column if not exists required_approvals smallint not null default 2;

alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_mode_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_mode_check
  check (governance_mode in ('dual_control', 'single_admin'));

alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_required_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_required_check
  check (
    required_approvals between 1 and 2
    and (governance_mode = 'single_admin') = (required_approvals = 1));

-- A single-admin record must never carry an approver. The distinct-identity
-- constraint already stops a requester approving themselves; this stops the
-- other direction — a second person quietly seconding a record whose policy
-- said one was enough, which would make the audit trail describe a control
-- that was not the one applied.
alter table private.staff_dual_control_requests
  drop constraint if exists staff_dual_control_single_admin_check;
alter table private.staff_dual_control_requests
  add constraint staff_dual_control_single_admin_check
  check (governance_mode <> 'single_admin' or approved_by is null);

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
     or new.created_at is distinct from old.created_at
     -- The policy that produced a record cannot be rewritten after the fact.
     -- Otherwise a single-admin row could later be relabelled dual control, or
     -- the reverse, and the trail would say something that never happened.
     or new.governance_mode is distinct from old.governance_mode
     or new.required_approvals is distinct from old.required_approvals then
    raise exception 'Dual control history is immutable' using errcode = '55000';
  end if;
  if old.consumed_at is not null then
    raise exception 'Dual control history is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_dual_control_rewrite()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. CONSUMPTION ASKS THE POLICY
-- ---------------------------------------------------------------------------
--
-- The three-argument form is dropped rather than left beside the new one:
-- leaving both would make every existing `consume_dual_control(a, b, c)` call
-- ambiguous and fail to resolve. The new fourth argument defaults, so all seven
-- existing call sites keep compiling untouched and reach the new body.

drop function if exists private.consume_dual_control(text, text, text);

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
  v_enabled boolean;
  v_environment text := private.platform_environment();
  v_required integer;
  v_row private.staff_dual_control_requests%rowtype;
  v_reason text;
begin
  -- Fail closed, exactly as before. Dual control switched off means the
  -- governed action is unavailable, not that it is unguarded.
  select c.dual_control_enabled into v_enabled
  from private.staff_platform_configuration c
  where c.singleton;
  if not coalesce(v_enabled, false) then
    return false;
  end if;

  v_required := private.required_approval_count(v_environment, p_action_key);

  select * into v_row
  from private.staff_dual_control_requests r
  where r.capability_key = p_capability
    and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref
    and r.requested_by = v_uid
    and r.environment = v_environment
  for update;

  if v_required <= 1 then
    -- One authorised administrator is the whole control here. Making them
    -- press "request" and then "approve" against themselves would produce two
    -- rows describing a second person who does not exist, so the authorisation
    -- is created and spent in one step and says so.
    if v_row.id is null then
      v_reason := pg_catalog.btrim(coalesce(p_reason, ''));
      if pg_catalog.length(v_reason) < 10 then
        v_reason := 'Authorised by a single administrator under '
          || v_environment || ' governance policy.';
      end if;
      insert into private.staff_dual_control_requests(
        capability_key, action_key, subject_ref, requested_by, requested_reason,
        expires_at, environment, governance_mode, required_approvals)
      values (
        p_capability, p_action_key, p_subject_ref, v_uid, v_reason,
        pg_catalog.now() + pg_catalog.make_interval(hours => 24), v_environment,
        'single_admin', 1)
      returning * into v_row;
    elsif v_row.consumed_at is not null then
      raise exception 'That authorisation was already used' using errcode = '42501';
    elsif v_row.expires_at <= pg_catalog.now() then
      raise exception 'That authorisation expired' using errcode = '42501';
    end if;

    update private.staff_dual_control_requests
    set consumed_at = pg_catalog.now()
    where id = v_row.id;

    perform private.record_staff_audit(
      v_uid, p_capability, 'single_admin_authorisation_consumed',
      'staff_dual_control_request', v_row.id, v_row.requested_reason,
      pg_catalog.jsonb_build_object(
        'actionKey', p_action_key,
        'subjectRef', p_subject_ref,
        'environment', v_environment,
        'governanceMode', 'single_admin',
        'requiredApprovals', 1,
        'approverCount', 1,
        'secondApprover', null));
    return true;
  end if;

  -- Two distinct identities. Unchanged, including every refusal sentence.
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
  'Spends one authorisation under the policy private.required_approval_count '
  'returns for this environment. Two distinct identities everywhere except '
  'development, where one authenticated administrator is the whole control and '
  'is recorded as such. Returns false when dual control is disabled entirely, '
  'which every caller treats as a refusal.';

revoke all on function private.consume_dual_control(text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. REQUESTING, APPROVING AND LISTING SPEAK THE SAME POLICY
-- ---------------------------------------------------------------------------

create or replace function public.staff_request_dual_control(
  p_capability_key text, p_action_key text, p_subject_ref text, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid;
  v_id uuid;
  v_existing private.staff_dual_control_requests%rowtype;
  v_environment text := private.platform_environment();
  v_required integer;
  v_mode text;
begin
  v_uid := private.require_staff_capability(p_capability_key);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  v_required := private.required_approval_count(v_environment, p_action_key);
  v_mode := private.governance_mode(v_environment, p_action_key);

  select * into v_existing from private.staff_dual_control_requests r
  where r.capability_key = p_capability_key and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref and r.requested_by = v_uid;
  if v_existing.id is not null and v_existing.consumed_at is null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'duplicate', true,
      'approved', v_existing.approved_by is not null,
      'governanceMode', v_existing.governance_mode,
      'requiredApprovals', v_existing.required_approvals);
  end if;

  insert into private.staff_dual_control_requests(
    capability_key, action_key, subject_ref, requested_by, requested_reason,
    expires_at, environment, governance_mode, required_approvals)
  values (p_capability_key, p_action_key, p_subject_ref, v_uid,
          pg_catalog.btrim(p_reason),
          pg_catalog.now() + pg_catalog.make_interval(hours => 24), v_environment,
          v_mode, v_required)
  on conflict (capability_key, action_key, subject_ref, requested_by) do update
    set expires_at = excluded.expires_at
  returning id into v_id;

  perform private.record_staff_audit(v_uid, p_capability_key, 'dual_control_requested',
    'staff_dual_control_request', v_id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'actionKey', p_action_key,
      'environment', v_environment,
      'governanceMode', v_mode,
      'requiredApprovals', v_required));

  -- A single-admin request is complete the moment it exists: it is already
  -- carrying every approval its policy asks for. Saying `approved: false`
  -- would send the console looking for a person who is not coming.
  return pg_catalog.jsonb_build_object('id', v_id, 'duplicate', false,
    'approved', v_required <= 1,
    'governanceMode', v_mode,
    'requiredApprovals', v_required);
end;
$$;

create or replace function public.staff_approve_dual_control(
  p_request_id uuid, p_approval_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_row private.staff_dual_control_requests%rowtype;
begin
  select * into v_row from private.staff_dual_control_requests r
  where r.id = p_request_id for update;
  if v_row.id is null then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;
  v_uid := private.require_staff_capability(v_row.capability_key);
  -- A record whose policy asked for one identity cannot acquire a second one
  -- afterwards. Allowing it would put a name in the trail that the control did
  -- not require and did not wait for.
  if v_row.required_approvals <= 1 then
    raise exception 'This authorisation needs no second approver'
      using errcode = '42501';
  end if;
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
    pg_catalog.jsonb_build_object('actionKey', v_row.action_key,
      'requestedBy', v_row.requested_by,
      'governanceMode', v_row.governance_mode,
      'requiredApprovals', v_row.required_approvals));
  return pg_catalog.jsonb_build_object('id', p_request_id, 'approved', true);
end;
$$;

create or replace function public.staff_dual_control_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_capabilities text[];
  v_rows jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;
  if private.staff_session_revoked() then
    raise exception 'This session was revoked' using errcode = '42501';
  end if;
  if not private.staff_mfa_satisfied() then
    raise exception 'Multi-factor authentication is required' using errcode = '42501';
  end if;

  v_capabilities := private.staff_capability_keys(v_actor);

  select coalesce(pg_catalog.jsonb_agg(row order by row->>'requestedAt' desc), '[]'::jsonb)
  into v_rows
  from (
    select pg_catalog.jsonb_build_object(
      'id', r.id,
      'capabilityKey', r.capability_key,
      'actionKey', r.action_key,
      'subjectRef', r.subject_ref,
      'reason', r.requested_reason,
      'environment', r.environment,
      'governanceMode', r.governance_mode,
      'requiredApprovals', r.required_approvals,
      'requestedAt', r.created_at,
      'requestedByName', requester.display_name,
      'requestedByMe', r.requested_by = v_actor,
      'approvedAt', r.approved_at,
      'approvedByName', approver.display_name,
      'approvedByMe', r.approved_by is not null and r.approved_by = v_actor,
      'approvalNote', r.approval_note,
      'consumedAt', r.consumed_at,
      'expiresAt', r.expires_at,
      'expired', r.expires_at <= pg_catalog.now(),
      -- A single-admin record is never approvable: there is nothing left to
      -- approve, and offering the control would invite somebody to add a name
      -- the policy did not ask for.
      'canApprove', r.required_approvals > 1
        and r.requested_by <> v_actor
        and r.approved_by is null
        and r.consumed_at is null
        and r.expires_at > pg_catalog.now()
    ) as row
    from private.staff_dual_control_requests r
    join public.profiles requester on requester.id = r.requested_by
    left join public.profiles approver on approver.id = r.approved_by
    where r.capability_key = any(v_capabilities)
      and r.consumed_at is null
      and r.expires_at > pg_catalog.now() - pg_catalog.make_interval(days => 7)
  ) queued;

  return pg_catalog.jsonb_build_object(
    'requests', v_rows,
    'environment', private.platform_environment(),
    'requiredApprovals', private.required_approval_count(private.platform_environment(), null),
    'governanceMode', private.governance_mode(private.platform_environment(), null),
    'generatedAt', pg_catalog.now());
end;
$$;

revoke all on function public.staff_dual_control_queue() from public, anon;
grant execute on function public.staff_dual_control_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. PROVIDER ACTIVATION RECORDS THE POLICY IT WAS GOVERNED BY
-- ---------------------------------------------------------------------------
--
-- Every prerequisite below is byte-for-byte the one that was there before. The
-- only changes are that the operator's own reason reaches the authorisation
-- record, and that the audit row and the provider event both name the policy
-- that authorised them, so a reader never has to infer why one name appears
-- instead of two.

create or replace function public.staff_activate_external_provider(
  p_provider_key text,
  p_expected_environment text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_subprocessors');
  v_config private.staff_platform_configuration%rowtype;
  v_provider private.external_providers%rowtype;
  v_from_status text;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
  v_flag_enabled boolean := false;
  v_kill_switch_active boolean := false;
  v_required integer;
  v_mode text;
begin
  if p_expected_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid expected environment' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'An activation reason is required' using errcode = '22023';
  end if;

  select * into v_config
  from private.staff_platform_configuration c
  where c.singleton;
  if v_config.environment <> p_expected_environment then
    raise exception 'Provider activation environment mismatch' using errcode = '42501';
  end if;
  if v_config.environment <> 'local' and v_config.expected_project_ref is null then
    raise exception 'The hosted platform project is not bound' using errcode = '42501';
  end if;

  select * into v_provider
  from private.external_providers p
  where p.provider_key = p_provider_key
  for update;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if v_provider.current_status = 'active' then
    raise exception 'Provider is already active' using errcode = '22023';
  end if;
  if v_provider.current_status not in ('implemented_awaiting_credential', 'configured_not_enabled') then
    raise exception 'Provider is not ready for activation' using errcode = '22023';
  end if;
  if not (v_config.environment = any(v_provider.environments)) then
    raise exception 'Provider is not approved for this environment' using errcode = '42501';
  end if;
  if v_provider.execution_context in ('server', 'both')
     and v_provider.credential_secret_name is null then
    raise exception 'Provider has no declared server credential authority' using errcode = '42501';
  end if;
  if v_provider.feature_flag_key is null then
    raise exception 'Provider activation requires an independent feature flag'
      using errcode = '42501';
  end if;
  select f.enabled into v_flag_enabled
  from private.staff_feature_flags f
  where f.flag_key = v_provider.feature_flag_key
    and f.environment = v_config.environment;
  if not found then
    raise exception 'Provider feature flag is missing for this environment'
      using errcode = '42501';
  end if;
  if v_flag_enabled then
    raise exception 'Disable the provider feature flag before activation'
      using errcode = '42501';
  end if;
  if v_provider.kill_switch_key is null
     or not exists (
       select 1 from private.staff_kill_switches k
       where k.switch_key = v_provider.kill_switch_key) then
    raise exception 'Provider activation requires an independent kill switch'
      using errcode = '42501';
  end if;
  select k.active into v_kill_switch_active
  from private.staff_kill_switches k
  where k.switch_key = v_provider.kill_switch_key;
  if v_provider.subprocessor_key is not null
     and not exists (
       select 1 from private.subprocessors s
       where s.subprocessor_key = v_provider.subprocessor_key
         and s.integration_status = 'approved_not_integrated') then
    raise exception 'Subprocessor governance is not ready for provider activation'
      using errcode = '42501';
  end if;
  if v_provider.processing_activity_key is not null
     and not exists (
       select 1 from private.processing_activities a
       where a.activity_key = v_provider.processing_activity_key) then
    raise exception 'Provider processing activity is not registered'
      using errcode = '42501';
  end if;

  v_required := private.required_approval_count(v_config.environment, 'activate_external_provider');
  v_mode := private.governance_mode(v_config.environment, 'activate_external_provider');

  v_subject := v_provider.provider_key || ':' || v_config.environment;
  v_consumed := private.consume_dual_control(
    'manage_subprocessors', 'activate_external_provider', v_subject,
    pg_catalog.btrim(p_reason));
  if not v_consumed then
    raise exception 'Provider activation always requires a governed authorisation'
      using errcode = '42501';
  end if;

  -- Read after consumption, so the id is the record that was actually spent
  -- rather than one that happened to exist when the function started.
  select r.id into v_approval_id
  from private.staff_dual_control_requests r
  where r.capability_key = 'manage_subprocessors'
    and r.action_key = 'activate_external_provider'
    and r.subject_ref = v_subject
    and r.requested_by = v_actor
    and r.environment = v_config.environment;

  v_from_status := v_provider.current_status;
  update private.external_providers
  set current_status = 'active'
  where provider_key = v_provider.provider_key
    and current_status = v_from_status;

  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    v_provider.provider_key, 'enabled', v_from_status, 'active', v_actor,
    pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'external_provider_activated',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', v_provider.provider_key,
      'environment', v_config.environment,
      'fromStatus', v_from_status,
      'toStatus', 'active',
      'governanceMode', v_mode,
      'requiredApprovals', v_required,
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'providerKey', v_provider.provider_key,
    'environment', v_config.environment,
    'status', 'active',
    'featureFlagEnabled', v_flag_enabled,
    'killSwitchActive', v_kill_switch_active,
    'enabled', private.provider_enabled(v_provider.provider_key),
    'governanceMode', v_mode,
    'requiredApprovals', v_required,
    'dualControlRequestId', v_approval_id);
end;
$$;

comment on function public.staff_activate_external_provider(text, text, text) is
  'Governed registry activation. The number of distinct staff identities it '
  'requires is private.required_approval_count for this environment, and the '
  'audit row names the policy applied. Does not enable a feature flag, alter a '
  'kill switch, publish legal text or accept a credential value.';

revoke all on function public.staff_activate_external_provider(text, text, text)
  from public, anon;
grant execute on function public.staff_activate_external_provider(text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. THE OTHER TWO GOVERNED MUTATIONS READ THEIR AUTHORISATION AFTER SPENDING IT
-- ---------------------------------------------------------------------------
--
-- Both of these looked their authorisation up before consuming it, which worked
-- only because the record always existed first. Under single-admin governance
-- the record is created by the consume call itself, so a lookup that runs first
-- finds nothing and the audit row silently loses the one field naming what was
-- spent. An audit entry that omits its authorisation is not a smaller record,
-- it is a record that cannot be checked.
--
-- Every prerequisite, refusal, ordering and returned field is otherwise exactly
-- as it was. The lookup moved; nothing else did, except that the operator's own
-- reason now reaches the authorisation and the audit names the policy applied.

create or replace function public.staff_publish_legal_version(
  p_document_key text,
  p_version text,
  p_content_hash_en text,
  p_content_hash_ar text,
  p_change_class text,
  p_change_summary_en text,
  p_change_summary_ar text,
  p_effective_at date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('publish_legal_version');
  v_previous public.legal_document_versions;
  v_document public.legal_documents;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
begin
  select * into v_document
  from public.legal_documents d
  where d.document_key = p_document_key;
  if v_document.document_key is null then
    raise exception 'Unknown legal document' using errcode = '22023';
  end if;
  if p_version !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'A version must be major.minor' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.legal_document_versions v
    where v.document_key = p_document_key and v.version = p_version) then
    raise exception 'That version already exists' using errcode = '22023';
  end if;
  if p_change_class not in ('editorial', 'non_material', 'material', 'urgent') then
    raise exception 'Unknown change class' using errcode = '22023';
  end if;
  if p_effective_at < current_date then
    raise exception 'A version cannot take effect in the past' using errcode = '22023';
  end if;
  if p_change_class in ('material', 'urgent')
     and pg_catalog.length(pg_catalog.btrim(coalesce(p_change_summary_en, ''))) < 20 then
    raise exception 'A material change requires a change summary' using errcode = '22023';
  end if;

  select * into v_previous from private.legal_current_version(p_document_key);
  if v_previous.document_key is null then
    raise exception 'No published version exists to supersede' using errcode = '22023';
  end if;

  if p_change_class in ('material', 'urgent') then
    v_subject := p_document_key || ':' || p_version || ':' || private.platform_environment();

    v_consumed := private.consume_dual_control(
      'publish_legal_version', 'publish_legal_version', v_subject,
      pg_catalog.btrim(p_reason));
    select r.id into v_approval_id
    from private.staff_dual_control_requests r
    where r.capability_key = 'publish_legal_version'
      and r.action_key = 'publish_legal_version'
      and r.subject_ref = v_subject
      and r.requested_by = v_actor
      and r.environment = private.platform_environment();
    if not v_consumed then
      raise exception 'Material or urgent legal publication requires dual control'
        using errcode = '42501';
    end if;
  end if;

  insert into public.legal_document_versions(
    document_key, version, content_hash_en, content_hash_ar, content_locator,
    published_at, effective_at, supersedes_version, change_class,
    change_summary_en, change_summary_ar, arabic_is_summary, status)
  values (
    p_document_key, p_version, p_content_hash_en, p_content_hash_ar,
    'src/legal/legal-corpus.ts', current_date, p_effective_at, v_previous.version,
    p_change_class, p_change_summary_en, p_change_summary_ar,
    v_previous.arabic_is_summary, 'draft');

  update public.legal_document_versions
  set status = 'superseded'
  where document_key = p_document_key and version = v_previous.version;

  update public.legal_document_versions
  set status = 'published'
  where document_key = p_document_key and version = p_version;

  insert into private.legal_version_events(
    document_key, version, event_type, actor_id, reason)
  values
    (p_document_key, v_previous.version, 'superseded', v_actor,
     'Superseded by ' || p_version),
    (p_document_key, p_version, 'published', v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'publish_legal_version', 'publish', 'legal_document', null,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'documentKey', p_document_key,
      'version', p_version,
      'changeClass', p_change_class,
      'supersedes', v_previous.version,
      'governanceMode', private.governance_mode(
        private.platform_environment(), 'publish_legal_version'),
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'documentKey', p_document_key,
    'version', p_version,
    'supersedes', v_previous.version,
    'changeClass', p_change_class,
    'effectiveAt', p_effective_at,
    'forcesReconsent', p_change_class in ('material', 'urgent'),
    'dualControlRequestId', v_approval_id);
end;
$$;

comment on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text) is
  'Publish one immutable legal version after consuming approval bound to document, version and environment.';

revoke all on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text)
  from public;
grant execute on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SUBPROCESSOR PROMOTION CONSUMES ITS OWN MATERIAL-CHANGE APPROVAL
-- ---------------------------------------------------------------------------

create or replace function public.staff_sync_provider_status(
  p_provider_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_subprocessors');
  v_provider private.external_providers;
  v_enabled boolean;
  v_target text;
  v_current text;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A provider reconciliation reason is required' using errcode = '22023';
  end if;
  select * into v_provider
  from private.external_providers p
  where p.provider_key = p_provider_key;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;

  v_enabled := private.provider_enabled(p_provider_key);
  v_target := case when v_enabled then 'in_use' else 'approved_not_integrated' end;

  if v_provider.subprocessor_key is not null then
    select s.integration_status into v_current
    from private.subprocessors s
    where s.subprocessor_key = v_provider.subprocessor_key
    for update;
    if v_current = 'retired' then
      raise exception 'A retired subprocessor cannot be reconciled' using errcode = '42501';
    end if;

    -- Promotion means personal data may now reach the supplier. Demotion is a
    -- restriction and must remain immediately available during an incident.
    if v_target = 'in_use' and v_current is distinct from 'in_use' then
      v_subject := p_provider_key || ':' || private.platform_environment() || ':in_use';
      v_consumed := private.consume_dual_control(
        'manage_subprocessors', 'sync_subprocessor_in_use', v_subject,
        pg_catalog.btrim(p_reason));
      select r.id into v_approval_id
      from private.staff_dual_control_requests r
      where r.capability_key = 'manage_subprocessors'
        and r.action_key = 'sync_subprocessor_in_use'
        and r.subject_ref = v_subject
        and r.requested_by = v_actor
        and r.environment = private.platform_environment();
      if not v_consumed then
        raise exception 'Subprocessor promotion always requires dual control'
          using errcode = '42501';
      end if;
    end if;

    update private.subprocessors
    set integration_status = v_target
    where subprocessor_key = v_provider.subprocessor_key
      and integration_status <> 'retired';
  end if;

  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    p_provider_key, 'reviewed', v_provider.current_status, v_provider.current_status,
    v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'sync_provider_status',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', p_provider_key,
      'environment', private.platform_environment(),
      'subprocessorStatus', v_target,
      'governanceMode', private.governance_mode(
        private.platform_environment(), 'sync_subprocessor_in_use'),
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'providerKey', p_provider_key,
    'enabled', v_enabled,
    'subprocessorStatus', v_target,
    'dualControlRequestId', v_approval_id);
end;
$$;


comment on function public.staff_sync_provider_status(text, text) is
  'Reconcile the subprocessor register; promotion to in_use consumes an exact dual-control approval.';

revoke all on function public.staff_sync_provider_status(text, text) from public;
grant execute on function public.staff_sync_provider_status(text, text) to authenticated;

