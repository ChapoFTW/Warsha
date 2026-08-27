-- THE AUTOMATION DOOR HAS TO BE ON A WALL POSTGREST CAN SEE
--
-- `202608280001` put every automation entry point in `private`, which is where
-- they belong: nothing in `private` is reachable by a browser. But PostgREST
-- exposes only `public` and `graphql_public`, so an Edge Function calling
-- `.schema('private').rpc(...)` is answered with "Invalid schema: private"
-- before the grant is ever consulted. The functions were correct and
-- unreachable.
--
-- These are thin wrappers and nothing more. Each one forwards to the `private`
-- function that holds the logic, and each is revoked from `anon` and
-- `authenticated` and granted only to `service_role`. Being in `public` is a
-- statement about which schema PostgREST will route to, not about who may call:
-- a browser presenting an anon or a user token is refused by the grant, and the
-- only holder of a service role is an Edge Function.
--
-- The security posture is therefore unchanged from the migration before it. The
-- reachability is not.

create or replace function public.warsha_automation_governance_state(
  p_principal_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.automation_governance_state(p_principal_key)
$$;

create or replace function public.warsha_automation_activate_external_provider(
  p_principal_key text, p_provider_key text, p_expected_environment text, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_activate_external_provider(
    p_principal_key, p_provider_key, p_expected_environment, p_reason)
$$;

create or replace function public.warsha_automation_deactivate_external_provider(
  p_principal_key text, p_provider_key text, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_deactivate_external_provider(
    p_principal_key, p_provider_key, p_reason)
$$;

create or replace function public.warsha_automation_set_feature_flag(
  p_principal_key text, p_flag_key text, p_environment text, p_enabled boolean,
  p_audience text, p_rollout_percentage integer, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_set_feature_flag(
    p_principal_key, p_flag_key, p_environment, p_enabled, p_audience,
    p_rollout_percentage, p_reason)
$$;

create or replace function public.warsha_automation_set_kill_switch(
  p_principal_key text, p_switch_key text, p_active boolean, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_set_kill_switch(
    p_principal_key, p_switch_key, p_active, p_reason)
$$;

create or replace function public.warsha_automation_record_processing_basis_review(
  p_principal_key text, p_activity_key text, p_status text, p_basis text, p_note text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_record_processing_basis_review(
    p_principal_key, p_activity_key, p_status, p_basis, p_note)
$$;

create or replace function public.warsha_automation_record_subprocessor_agreement(
  p_principal_key text, p_subprocessor_key text, p_status text,
  p_reference text, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.automation_record_subprocessor_agreement(
    p_principal_key, p_subprocessor_key, p_status, p_reference, p_reason)
$$;

-- The grants are the whole security story for these seven, so they are applied
-- in one loop rather than seven times by hand, where the eighth would one day
-- be forgotten.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.warsha_automation_governance_state(text)',
    'public.warsha_automation_activate_external_provider(text, text, text, text)',
    'public.warsha_automation_deactivate_external_provider(text, text, text)',
    'public.warsha_automation_set_feature_flag(text, text, text, boolean, text, integer, text)',
    'public.warsha_automation_set_kill_switch(text, text, boolean, text)',
    'public.warsha_automation_record_processing_basis_review(text, text, text, text, text)',
    'public.warsha_automation_record_subprocessor_agreement(text, text, text, text, text)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated', v_signature);
    execute pg_catalog.format(
      'grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

comment on function public.warsha_automation_activate_external_provider(text, text, text, text) is
  'PostgREST-reachable wrapper. Holds no logic and no authority of its own: '
  'every check, including the development-only boundary, lives in the private '
  'function it forwards to. Executable by service_role alone.';

-- PostgREST caches which functions exist. Without this the wrappers are live in
-- Postgres and still 404 at the API until something else happens to reload it.
notify pgrst, 'reload schema';

-- The environment probe the Edge Function makes before it dispatches anything.
-- Read-only, answers one word, and reachable only by a service role.
create or replace function public.warsha_automation_platform_environment()
returns text language sql stable security definer set search_path = '' as $$
  select private.platform_environment()
$$;
revoke all on function public.warsha_automation_platform_environment()
  from public, anon, authenticated;
grant execute on function public.warsha_automation_platform_environment()
  to service_role;

notify pgrst, 'reload schema';
