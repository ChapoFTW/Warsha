-- THE AUDIT WRITER MUST NOT OVERWRITE WHAT A CALLER ALREADY SAID
--
-- `202608280001` made `record_staff_audit` delegate to `record_governed_audit`
-- so one function writes every audit row. That was right, and it introduced a
-- bug: `record_governed_audit` merges its own attribution over the caller's
-- `safe_detail`, and `consume_dual_control` had already put the true mode there.
--
--   consume_dual_control writes  governanceMode: 'single_admin'
--   record_staff_audit passes    'staff_action'  (all it knows)
--   the merge order made it      'staff_action'
--
-- So a single-administrator authorisation recorded itself as an ordinary staff
-- action. Not a fabrication — nothing false was asserted about who acted — but
-- the trail stopped saying which policy applied, which is the one thing the
-- previous migration existed to record.
--
-- The fix is precedence rather than order: where a caller has named the mode or
-- the basis itself, that is the more specific truth and it wins, and the column
-- and the detail are both written from the same resolved value so they cannot
-- disagree. A caller that says nothing gets the default it always got.

create or replace function private.record_governed_audit(
  p_actor_id uuid,
  p_actor_type text,
  p_principal_key text,
  p_capability text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_safe_detail jsonb,
  p_governance_mode text,
  p_authorization_basis text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_env text;
  v_detail jsonb := coalesce(p_safe_detail, '{}'::jsonb);
  v_mode text;
  v_basis text;
begin
  -- The caller's own value is the more specific one. `consume_dual_control`
  -- knows it just spent a single-admin authorisation; `record_staff_audit`,
  -- which only knows it was called by a human, does not.
  v_mode := coalesce(v_detail->>'governanceMode', p_governance_mode);
  v_basis := coalesce(v_detail->>'authorizationBasis', p_authorization_basis);

  select c.environment into v_env
  from private.staff_platform_configuration c where c.singleton;

  insert into private.staff_audit_events(
    actor_id, actor_type, automation_principal_key, capability_key, action,
    entity_type, entity_id, reason, break_glass, environment, safe_detail,
    governance_mode, authorization_basis)
  values (
    case when p_actor_type = 'automation' then null else p_actor_id end,
    p_actor_type,
    case when p_actor_type = 'automation' then p_principal_key else null end,
    p_capability, p_action, p_entity_type, p_entity_id,
    pg_catalog.btrim(p_reason),
    -- `staff_capability_is_break_glass` asks whether an actor is reaching
    -- outside their own roles, and with a NULL actor it answers yes. Automation
    -- is never break-glass: the capabilities it holds are exactly the ones it
    -- was created with, which is the opposite of the situation that flag marks.
    case
      when p_actor_type = 'automation' then false
      when p_capability is null then false
      else private.staff_capability_is_break_glass(p_actor_id, p_capability)
    end,
    coalesce(v_env, 'local'),
    -- Written from the resolved values, so the column and the detail always
    -- agree. They disagreeing is how a reader stops trusting either.
    v_detail || pg_catalog.jsonb_build_object(
      'actorType', p_actor_type,
      'governanceMode', v_mode,
      'authorizationBasis', v_basis,
      'automationPrincipal', case
        when p_actor_type = 'automation' then p_principal_key else null end),
    v_mode,
    v_basis)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.record_governed_audit(
  uuid, text, text, text, text, text, uuid, text, jsonb, text, text)
  from public, anon, authenticated;
