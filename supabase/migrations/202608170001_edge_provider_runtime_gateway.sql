-- WPS-025 manual-acceptance correction: Edge Functions cannot call the current
-- private RPCs through PostgREST. `private` deliberately stays absent from the
-- local exposed-schema list, and (independently) those functions revoke PUBLIC
-- execution without granting service_role. Exposing or granting the whole
-- private schema would turn implementation details into an API surface.
--
-- These two narrow, service-role-only functions are the gateway. Provider
-- selection, activation, feature flags and kill switches remain owned by the
-- existing private functions. No client role gains access to the registry or
-- health tables.

create or replace function public.edge_provider_runtime(p_role text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider_key text := private.provider_for_role(p_role);
begin
  return pg_catalog.jsonb_build_object(
    'providerKey', v_provider_key,
    'enabled', coalesce(private.provider_enabled(v_provider_key), false)
  );
end;
$$;

comment on function public.edge_provider_runtime(text) is
  'Service-role Edge gateway to provider selection and its existing registry/flag/kill-switch authority.';

revoke all on function public.edge_provider_runtime(text) from public, anon, authenticated;
grant execute on function public.edge_provider_runtime(text) to service_role;

create or replace function public.edge_record_provider_health(
  p_provider_key text,
  p_operation text,
  p_provider_version text,
  p_outcome text,
  p_latency_ms integer default null,
  p_attempts smallint default 1,
  p_timed_out boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.record_provider_health(
    p_provider_key,
    p_operation,
    p_provider_version,
    p_outcome,
    p_latency_ms,
    p_attempts,
    p_timed_out
  )
$$;

comment on function public.edge_record_provider_health(text, text, text, text, integer, smallint, boolean) is
  'Service-role Edge gateway to the private provider-health writer.';

revoke all on function public.edge_record_provider_health(text, text, text, text, integer, smallint, boolean)
  from public, anon, authenticated;
grant execute on function public.edge_record_provider_health(text, text, text, text, integer, smallint, boolean)
  to service_role;
