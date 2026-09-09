-- The switch that was never built.
--
-- `202609010001_push_delivery_authority` built the entire delivery half: the
-- device tables, the registration RPCs, the cross-account token rules, the
-- dispatch queue, the Expo wrappers. It opened with an `alter table` that
-- dropped WPS-014's prohibitions —
--
--   check (push_provider in ('disabled'))
--   check (not push_delivery_enabled)
--   check (not token_registration_enabled)
--
-- — and replaced them with a coherence rule, so that enabling push became
-- *representable* for the first time. Its own comment says it plainly: "Nothing
-- here turns push on; it makes turning it on possible."
--
-- Nothing ever made it happen. The lock came off and no handle was fitted.
-- `private.notification_configuration` has exactly one row, inserted by WPS-014
-- with every switch off, and across every migration in this repository there is
-- not one `update` against that table. No admin screen reaches it. No staff RPC
-- names it. The development automation principal does not hold its capability.
--
-- Three separate parts of the product read those columns and refuse:
-- `register_my_push_device` refuses while `token_registration_enabled` is false,
-- `warsha_push_claim_batch` refuses while `push_delivery_enabled` is false, and
-- `get_my_push_state` reports the result to the app. That is why the Production
-- push proof reports
--
--   { "provider": "disabled", "registrationAvailable": false }
--
-- and why it would have reported that for as long as anyone kept looking. This
-- was recorded as a blocked credential — a missing Production staff session. It
-- was not. No credential would have changed that reading, because there was no
-- statement anywhere in the system capable of changing those three values.
--
-- WHAT THIS MIGRATION DOES NOT DO: turn anything on. It leaves all three
-- switches exactly as it found them. Enabling push is an operational act with
-- its own actor, its own reason and its own audit row, performed afterwards
-- through the door this installs.

-- ---------------------------------------------------------------------------
-- 1. The rules, in one place
-- ---------------------------------------------------------------------------
-- Shaped after `private.set_feature_flag_core`, deliberately and closely: same
-- environment binding, same reason floor, same actor-type split, same audit
-- vocabulary. A second governed writer that argued its own way about any of
-- that is how the lenient path gets discovered later.
--
-- The three switches move independently because the safe order for proving push
-- in Production needs registration ON while delivery stays OFF: a device can
-- register, and the account-to-device association can be checked, without one
-- notification reaching one real person.
--
-- `p_actor_type` exists for the same reason it exists in the feature-flag core:
-- so that if development automation is ever granted this capability, it reuses
-- these rules instead of growing a parallel, and inevitably softer, copy. No
-- automation wrapper is created here, because the `development_engineering`
-- principal does not hold `manage_notification_configuration` and a wrapper
-- that always raises is worse than no wrapper — it reads like a working path.

create or replace function private.set_push_configuration_core(
  p_actor_id uuid,
  p_actor_type text,
  p_principal_key text,
  p_environment text,
  p_provider text,
  p_token_registration_enabled boolean,
  p_push_delivery_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous private.notification_configuration%rowtype;
  v_next private.notification_configuration%rowtype;
  v_actor uuid := case when p_actor_type = 'automation' then null else p_actor_id end;
  v_mode text := case when p_actor_type = 'automation'
    then 'development_automation' else 'staff_action' end;
  v_basis text := case when p_actor_type = 'automation'
    then 'owner_approved_development_policy' else 'staff_authorisation' end;
  v_enabling boolean;
begin
  if p_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;

  -- The caller states which platform it believes it is configuring, and the
  -- database checks that belief. A script pointed at the wrong project fails
  -- here rather than succeeding somewhere it was not meant to reach.
  if p_environment <> private.platform_environment() then
    raise exception 'Push configuration must target the current platform environment'
      using errcode = '42501';
  end if;

  if p_actor_type = 'automation' and p_environment <> 'development' then
    raise exception 'Automation governance is available in development only'
      using errcode = '42501';
  end if;

  if p_provider not in ('disabled', 'expo') then
    raise exception 'Invalid push provider' using errcode = '22023';
  end if;

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_previous from private.notification_configuration where singleton;
  if v_previous.singleton is null then
    raise exception 'Notification configuration is missing' using errcode = '22023';
  end if;

  -- Stated before the table's own constraint would say it less clearly.
  if p_provider = 'disabled'
    and (coalesce(p_token_registration_enabled, false)
      or coalesce(p_push_delivery_enabled, false)) then
    raise exception 'A provider is required before registration or delivery'
      using errcode = '22023';
  end if;

  -- Turning the provider off while the scheduler is still on would violate the
  -- coherence constraint with an opaque message. Say which switch is in the
  -- way, rather than making an operator read a constraint definition to find
  -- out. The scheduler is deliberately not changed as a side effect: this
  -- function was not asked about it.
  if p_provider = 'disabled' and v_previous.scheduler_enabled then
    raise exception 'Disable the notification scheduler before removing the provider'
      using errcode = '22023';
  end if;

  -- Delivery with no registration is not a state worth being able to reach. It
  -- looks configured and sends to nothing, because nothing was allowed to
  -- register a device to send to.
  if coalesce(p_push_delivery_enabled, false)
    and not coalesce(p_token_registration_enabled, false) then
    raise exception 'Enable token registration before delivery' using errcode = '22023';
  end if;

  -- ESCALATION, AND ONLY IN ONE DIRECTION.
  --
  -- `manage_notification_configuration` is declared `requires_reauth = false`,
  -- because it was written for the three settings domains that share it —
  -- quiet-hours policy, reminder limits, call-relay mode. Those are policy
  -- values. These three are a live switch that reaches real phones, and every
  -- comparable live switch in Warsha (`manage_feature_flags`,
  -- `manage_kill_switches`, `approve_configuration`) demands fresh auth.
  --
  -- Rather than flip `requires_reauth` on the shared capability row — which
  -- would silently impose a re-authentication prompt on those three unrelated
  -- settings domains — the requirement is attached here, to the act that earns
  -- it: switching something ON.
  --
  -- Switching OFF stays reachable with an ordinary staff session. Making the
  -- safe direction harder than the dangerous one is how an incident turns into
  -- a longer incident: whoever is trying to stop notifications going out at
  -- 2am must not be held at a re-authentication prompt.
  v_enabling :=
    (coalesce(p_token_registration_enabled, false) and not v_previous.token_registration_enabled)
    or (coalesce(p_push_delivery_enabled, false) and not v_previous.push_delivery_enabled)
    or (p_provider <> 'disabled' and v_previous.push_provider = 'disabled');

  if v_enabling and p_actor_type <> 'automation'
    and not private.staff_recent_reauth(v_actor) then
    raise exception 'Re-authentication required to enable push' using errcode = '42501';
  end if;

  update private.notification_configuration
  set push_provider = p_provider,
      token_registration_enabled = coalesce(p_token_registration_enabled, false),
      push_delivery_enabled = coalesce(p_push_delivery_enabled, false),
      updated_at = pg_catalog.now()
  where singleton;

  select * into v_next from private.notification_configuration where singleton;

  -- The audit row carries the switches and the direction of travel, and never a
  -- token, a device, an endpoint or a person's identifier.
  perform private.record_governed_audit(
    v_actor, p_actor_type, p_principal_key,
    'manage_notification_configuration', 'push_configuration_changed',
    'notification_configuration', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'environment', p_environment,
      'enabling', v_enabling,
      'from', pg_catalog.jsonb_build_object(
        'provider', v_previous.push_provider,
        'tokenRegistrationEnabled', v_previous.token_registration_enabled,
        'pushDeliveryEnabled', v_previous.push_delivery_enabled),
      'to', pg_catalog.jsonb_build_object(
        'provider', v_next.push_provider,
        'tokenRegistrationEnabled', v_next.token_registration_enabled,
        'pushDeliveryEnabled', v_next.push_delivery_enabled)),
    v_mode, v_basis);

  return pg_catalog.jsonb_build_object(
    'environment', p_environment,
    'provider', v_next.push_provider,
    'tokenRegistrationEnabled', v_next.token_registration_enabled,
    'pushDeliveryEnabled', v_next.push_delivery_enabled,
    'schedulerEnabled', v_next.scheduler_enabled,
    'actorType', p_actor_type,
    'governanceMode', v_mode);
end;
$$;

revoke all on function private.set_push_configuration_core(
  uuid, text, text, text, text, boolean, boolean, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The staff door, which is the only door
-- ---------------------------------------------------------------------------
-- `require_staff_capability` already refuses an unauthenticated caller, an
-- unbound platform, a revoked session and an unsatisfied MFA before it looks at
-- the capability at all. Everything above about fresh auth is in addition to
-- that, not instead of it.

create or replace function public.staff_set_push_configuration(
  p_environment text,
  p_provider text,
  p_token_registration_enabled boolean,
  p_push_delivery_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_notification_configuration');
begin
  return private.set_push_configuration_core(
    v_actor, 'human', null, p_environment, p_provider,
    p_token_registration_enabled, p_push_delivery_enabled, p_reason);
end;
$$;

revoke all on function public.staff_set_push_configuration(
  text, text, boolean, boolean, text) from public, anon;
grant execute on function public.staff_set_push_configuration(
  text, text, boolean, boolean, text) to authenticated;

comment on function public.staff_set_push_configuration(
  text, text, boolean, boolean, text) is
  'Sets the push provider and the registration and delivery switches, which '
  'nothing else in this database can write. The three move independently so '
  'registration can be proven with delivery still off. Requires '
  'manage_notification_configuration, binds to the current platform '
  'environment, additionally requires recent re-authentication when a switch is '
  'being turned ON, and records push_configuration_changed with before and '
  'after values.';
