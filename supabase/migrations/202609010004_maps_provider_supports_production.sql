-- Google Maps Platform may run in production. It is still not running.
--
-- ===========================================================================
-- The four gates, and which one this opens
-- ===========================================================================
--
-- `private.provider_enabled()` requires ALL of:
--
--   1. `private.platform_environment()` is in `external_providers.environments`
--   2. `current_status = 'active'`
--   3. no active kill switch on `kill_switch_key`
--   4. an enabled `staff_feature_flags` row for this flag AND this environment
--
-- and `private.provider_for_role()` additionally refuses to resolve a provider
-- at all unless gate 1 holds — which is why `edge_provider_runtime('location')`
-- answered `{"providerKey": null, "enabled": false}` in warsha-production even
-- after the owner installed `GOOGLE_MAPS_SERVER_KEY`.
--
-- `environments` is the only one of the four that is a CAPABILITY DECLARATION
-- rather than an activation: it says where this provider is permitted to run,
-- which is a property of the provider and identical in every project. That is
-- what a migration owns, and it is all this migration opens.
--
-- Gates 2, 3 and 4 are per-project governed state. This migration deliberately
-- leaves them alone, so applying it changes the behaviour of nothing, anywhere.
--
-- ===========================================================================
-- Why the status update is guarded three ways
-- ===========================================================================
--
-- `current_status` looks like registry metadata and is not: gate 2 reads it, so
-- it is live governance state, and the two projects have legitimately diverged.
-- Measured 2026-09-01:
--
--   warsha-development  current_status = 'active'                       (Maps live)
--   warsha-production   current_status = 'implemented_awaiting_credential'
--
-- Production's value is stale — the credential was installed today — but a
-- blanket `update ... set current_status = ...` would rewrite Development's
-- `active` and TURN MAPS OFF THERE. That is a behaviour change to an
-- environment this work is not permitted to touch, caused by a statement that
-- reads like bookkeeping.
--
-- So the update carries three conditions, and each one refuses a specific
-- wrong outcome:
--
--   provider_key = 'google_maps_platform'
--     -> Vision is not swept along. OCR stays exactly as it is.
--
--   current_status = 'implemented_awaiting_credential'
--     -> a project that has already been activated by a governed action keeps
--        its state. Development matches nothing and is untouched.
--
--   private.platform_environment() = 'production'
--     -> local and a future fresh project keep the honest seeded value. They
--        have no server key, and claiming `configured_not_enabled` there would
--        be the register asserting a credential that does not exist.
--
-- `configured_not_enabled` and not `active`: the credential is in place, and
-- nothing is switched on. Gate 2 still fails, so this does not activate Maps in
-- production — it stops the register saying Warsha is waiting for a key it
-- already has.
--
-- ===========================================================================
-- What still has to happen, and why it is not here
-- ===========================================================================
--
-- Turning Maps on in production needs gate 2 moved to 'active' and gate 4
-- seeded — an enabled `location_provider` row for `environment = 'production'`.
-- Both are environment-specific governed actions requiring
-- `require_staff_capability('manage_feature_flags')`, and warsha-production has
-- no staff identity yet (`staff_role_grants` is empty). The automation
-- principal cannot stand in: it is `environment = 'development'` by CHECK
-- constraint and the platform now reports `production`.
--
-- That activation is deliberately left for after the first Production staff
-- identity exists. A migration that seeded an enabled flag would be an
-- activation with no actor, no reason and no audit row.

-- ---------------------------------------------------------------------------
-- 1. The capability declaration
-- ---------------------------------------------------------------------------
-- Idempotent: adds `production` only when it is absent, and preserves whatever
-- else the array holds rather than replacing it with a literal, so a project
-- that has legitimately gained or lost an environment is not rewritten.

update private.external_providers
set environments = environments || array['production']
where provider_key = 'google_maps_platform'
  and not ('production' = any(environments));

-- ---------------------------------------------------------------------------
-- 2. The stale status, corrected only where it is both stale and production
-- ---------------------------------------------------------------------------

update private.external_providers
set current_status = 'configured_not_enabled',
    last_review_date = current_date
where provider_key = 'google_maps_platform'
  and current_status = 'implemented_awaiting_credential'
  and private.platform_environment() = 'production';

-- ---------------------------------------------------------------------------
-- 3. Say it in the register itself
-- ---------------------------------------------------------------------------
-- The notes column is the register's own explanation of the two-key model. It
-- gains the one fact a reader now needs: production is permitted, and permitted
-- is not enabled.

update private.external_providers
set notes = notes || ' Production is a permitted environment as of 2026-09-01 '
  || 'and holds its own server key, distinct from Development''s. Permitted is '
  || 'not enabled: private.provider_enabled also requires current_status '
  || '= ''active'' and an enabled location_provider flag for the production '
  || 'environment, both of which remain governed per-environment actions.'
where provider_key = 'google_maps_platform'
  and notes not like '%Production is a permitted environment%';
