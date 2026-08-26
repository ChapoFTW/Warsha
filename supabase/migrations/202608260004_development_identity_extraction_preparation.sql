-- Prepare hosted development for identity extraction. Enable nothing.
--
-- `202608180001_development_provider_governance` did exactly this for Google
-- Maps and said why Vision was left out:
--
--     "Google Maps is the provider being prepared for hosted development.
--      Vision is intentionally untouched: this task grants no OCR credential
--      or activation."
--
-- The OCR credential now exists as an Edge Function secret in development, and
-- the `vision-extract` function is deployed. Two pieces of registry state still
-- make activation structurally impossible, and both are preparation rather than
-- permission:
--
--   1. `google_cloud_vision.environments` is `{local,staging}`, so
--      `staff_activate_external_provider` refuses with "Provider is not
--      approved for this environment" before it reaches any other check.
--   2. There is no `identity_extraction` feature flag row for `development`,
--      so the same function refuses with "Provider feature flag is missing for
--      this environment".
--
-- This migration fixes both, and deliberately does NOT:
--   * activate any provider;
--   * enable any feature flag (the row is inserted DISABLED);
--   * clear any kill switch;
--   * grant, imply or record any privacy approval;
--   * move `private.subprocessors.integration_status` off
--     `approved_not_integrated`;
--   * touch staging, local or production.
--
-- Activation remains what it was: `staff_activate_external_provider` under
-- `manage_subprocessors`, with dual control enabled in this environment, so two
-- distinct staff identities are required — one to request and a different one
-- to approve. Nothing here shortens that path; it only stops the path ending in
-- a refusal about registry state instead of about authority.

-- ---------------------------------------------------------------------------
-- 1. The development flag exists, and is off
-- ---------------------------------------------------------------------------
--
-- Inserted disabled with the same shape the Maps preparation used. The reason
-- text is the honest one: what is still outstanding, not what has been done.
insert into private.staff_feature_flags
  (flag_key, environment, enabled, rollout_percentage, audience, reason, is_kill_switch)
values
  ('identity_extraction', 'development', false, 0, 'none',
   'Google Cloud Vision remains disabled in hosted development until material '
   || 'privacy approval, dual-controlled provider activation by two distinct '
   || 'staff identities, and an observed health check are complete. The '
   || 'service-account credential is configured and the vision-extract function '
   || 'is deployed; neither of those is permission to send a document.', false)
on conflict (flag_key, environment) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Development joins the approved environments for this provider
-- ---------------------------------------------------------------------------
--
-- Scoped to Vision and idempotent, exactly as the Maps append was. Production
-- stays deliberately absent: the registry note records that it is excluded
-- "until a baseline has been measured", and measuring one is what hosted
-- development is for.
update private.external_providers
set environments = pg_catalog.array_append(environments, 'development')
where provider_key = 'google_cloud_vision'
  and not ('development' = any(environments));

-- ---------------------------------------------------------------------------
-- 3. Say plainly, in the registry itself, what is and is not true
-- ---------------------------------------------------------------------------
--
-- The existing note says "no key has been supplied to this environment", which
-- stopped being true when the development secret was configured. A registry
-- that describes a state the platform has left is worse than one that says
-- nothing, because it is read as evidence.
update private.external_providers
set notes = 'Server-side only, called from the vision-extract Edge Function. The '
  || 'service-account key lives in Edge Function secrets and never reaches the '
  || 'bundle. A development credential is configured and the function is '
  || 'deployed, so this environment is ready for the governed activation '
  || 'sequence; the provider is still not active and no document has been sent. '
  || 'Activation requires manage_subprocessors under dual control, then the '
  || 'identity_extraction feature flag, then an observed health check. '
  || 'Production is deliberately absent from environments until a baseline has '
  || 'been measured.'
where provider_key = 'google_cloud_vision';
