-- Google Cloud Vision is approved for Production.
--
-- `private.external_providers.environments` is the register of which
-- environments a provider is APPROVED for, and `activate_external_provider_core`
-- reads it as a precondition:
--
--   if not (v_config.environment = any(v_provider.environments)) then
--     raise exception 'Provider is not approved for this environment';
--
-- Vision was registered for local, staging and development by WPS-024, when
-- Production had no credential and no decision had been taken. Production now
-- has its own service account in Google Cloud project `warsha-504822`, held in
-- the `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` Edge Function secret, verified by
-- digest against the file it came from and proven to mint a `cloud-vision`
-- token and return text from a synthetic image.
--
-- No RPC can make this change, and that is deliberate rather than an omission:
-- the list says which environments somebody has decided this vendor may process
-- identity documents in. It belongs in a reviewed, forward-only migration, not
-- behind a console button, so the decision leaves a diff.
--
-- This grants APPROVAL, not activation. Turning Vision on is still the governed
-- sequence -- subprocessor agreement, provider activation, feature flag -- each
-- performed by an authorised operator through its own RPC, each refusing on its
-- own terms, and each audited. All this does is stop the first of those
-- refusing on a precondition that is no longer true.

do $$
declare
  v_status_before text;
  v_status_after text;
  v_environments text[];
begin
  select current_status into v_status_before
  from private.external_providers
  where provider_key = 'google_cloud_vision';

  if v_status_before is null then
    raise exception 'google_cloud_vision is not registered';
  end if;

  update private.external_providers
  set environments = (
        select array_agg(distinct e order by e)
        from unnest(environments || array['production']) as e
      ),
      last_review_date = current_date,
      notes = notes || ' Approved for Production 2026-09-07: dedicated service '
        || 'account in Google Cloud project warsha-504822, separate from the '
        || 'Development credential. Legal review of the worker_verification '
        || 'processing basis remains pending.'
  where provider_key = 'google_cloud_vision'
    and not ('production' = any(environments));

  select current_status, environments into v_status_after, v_environments
  from private.external_providers
  where provider_key = 'google_cloud_vision';

  if not ('production' = any(v_environments)) then
    raise exception 'google_cloud_vision is still not approved for production';
  end if;

  /*
   * The status must be exactly what it was.
   *
   * The first version of this guard asserted the status was not 'active', which
   * is a different claim and a wrong one: Development has had Vision active
   * since 2026-08-28, so replaying there failed on a provider this migration
   * had not touched. What actually matters is that APPROVAL IS NOT ACTIVATION,
   * and the honest way to assert that is to compare before with after.
   */
  if v_status_after is distinct from v_status_before then
    raise exception 'This migration must not change the provider status (% -> %)',
      v_status_before, v_status_after;
  end if;
end;
$$;

notify pgrst, 'reload schema';
