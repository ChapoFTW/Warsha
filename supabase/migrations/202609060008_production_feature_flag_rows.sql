-- Production had no feature flags at all.
--
-- ## What was missing
--
-- `private.staff_feature_flags` carried 30 rows across `local`, `development`
-- and `staging`, and not one for `production`. The project was created after
-- those seeds were written and nothing back-filled it.
--
-- That is not a cosmetic gap. Two things depend on a row existing:
--
--   `staff_set_feature_flag` refuses a key it cannot find, answering
--   "Unknown feature flag". So the first Production administrator could not
--   turn anything on, no matter what capability they held.
--
--   `private.activate_external_provider_core` refuses a provider whose feature
--   flag is missing for the environment — "Provider feature flag is missing for
--   this environment" — which is why Maps activation returned 42501 with a
--   confirmed credential, an approved environment list and a live kill switch.
--
-- The block was never dual control. It was an empty table.
--
-- ## Why every row is created DISABLED
--
-- Not caution. The activation path requires it: the guard immediately after the
-- missing-flag check is "Disable the provider feature flag before activation".
-- A provider is activated first and its flag opened afterwards, so seeding a
-- flag ON would lock the provider out of activation permanently.
--
-- Creating them disabled also keeps this migration honest about what it is: it
-- makes the switches EXIST so a governed decision can be recorded against them.
-- Turning one on is that decision, made by an administrator at AAL2 through
-- `staff_set_feature_flag`, which writes an audit row naming the actor and the
-- reason. A migration that flipped features on would be making product
-- decisions with nobody's name attached to them.
--
-- ## Reasons
--
-- Each row states why it is off in terms of what is actually missing today,
-- because `reason` is what an operator reads before deciding to flip it. Where
-- the only outstanding item is a legal or subprocessor review, the reason says
-- so plainly rather than implying a technical gap.

insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  -- Ready once a governed activation is recorded against them.
  ('location_provider','production',false,'none',
   'Off until the Maps provider is activated. Server credential is present in Production Edge secrets; activation requires this flag to be disabled first, then opened by an administrator.',false),
  ('marketplace_activation','production',false,'none',
   'Off pending the first operational go-live decision. No technical dependency is missing.',false),
  ('worker_vetting','production',false,'none',
   'Off until a reviewer holding review_worker_vetting is in place to work the queue.',false),
  ('provisional_worker_activation','production',false,'none',
   'Off until worker vetting is running; provisional activation has no meaning before then.',false),
  ('privacy_center','production',false,'none',
   'Off pending the retention review. The surface is implemented.',false),
  ('data_export','production',false,'none',
   'Off pending the retention review. The privacy-export function is deployed.',false),
  ('account_deletion','production',false,'none',
   'Off pending the consent-retention decision. Anonymisation works; hard deletion is blocked by the legal_acceptances immutability trigger.',false),
  ('legal_centre','production',false,'none',
   'Off pending the legal review of published wording. All 26 documents render.',false),
  ('legal_reconsent','production',false,'none',
   'Off until a legal version is published that requires re-consent.',false),
  ('identity_capture_camera','production',false,'none',
   'Off until a Production mobile binary exists; the camera surface is native only.',false),
  ('new_profile_ui','production',false,'none','Off: staged UI rollout, not yet chosen for Production.',false),
  ('new_review_ui','production',false,'none','Off: staged UI rollout, not yet chosen for Production.',false),
  ('staff_beta_tools','production',false,'none','Off: internal tooling, opened per operator when needed.',false),
  ('growth_referrals','production',false,'none','Off until growth operations sign off.',false),
  ('growth_promotions','production',false,'none','Off until growth operations sign off; campaigns are staff-approved.',false),
  ('emergency_requests','production',false,'none','Off pending operational readiness to answer them.',false),
  ('rescue_mode','production',false,'none','Off by design. An incident tool, not a default state.',false),
  ('authentication_gateway','production',false,'none','Off by design; the gateway is a staged migration path.',false),
  ('call_relay','production',false,'none','Off: Warsha exposes no telephony provider.',false),

  -- Blocked on something genuinely absent, not on a review.
  ('identity_extraction','production',false,'none',
   'BLOCKED: GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT does not exist in Production secrets. The provider row reads implemented_awaiting_credential.',false),
  ('push_notifications','production',false,'none',
   'BLOCKED: no Production mobile binary exists on either platform, so there is nothing to register a token from.',false),
  ('online_payments','production',false,'none',
   'BLOCKED: no payment provider is onboarded. Cash is the live path and the UI must not offer cards it cannot take.',false),
  ('payouts','production',false,'none',
   'BLOCKED: no payout provider is onboarded.',false)
on conflict (flag_key, environment) do nothing;
