-- The reason the export is switched off is no longer true.
--
-- WPS-022 seeded the flag with:
--
--   'WPS-022 export stays disabled: no worker exists to produce the file yet.'
--
-- That was accurate for three weeks. `202608300006_privacy_export_producer.sql`
-- added `private.privacy_build_export_payload`, the `warsha_privacy_export_*`
-- wrappers and the `privacy-export` Edge Function; the producer is deployed to
-- Development, has been driven end to end, and writes a real file to a real
-- bucket. The stated reason has been describing an absence that was filled.
--
-- A stale reason is not cosmetic. It is the sentence somebody reads when
-- deciding whether a switch can be turned on, and this one says "there is
-- nothing behind this" about a feature that works. It is corrected here, and
-- the correction says what the remaining condition actually is.
--
-- ===========================================================================
-- What actually gates the privacy centre, and why nothing here opens it
-- ===========================================================================
--
-- `private.privacy_surface_enabled` requires THREE things to agree:
--
--   1. the `privacy_requests` kill switch is not active;
--   2. `private.privacy_configuration.privacy_center_enabled` is true;
--   3. a `private.staff_feature_flags` row exists for this flag AND this
--      environment AND is enabled.
--
-- Two keys, deliberately. `privacy-data-lifecycle.test.sql` asserts it in so
-- many words: "the flag and the configuration must BOTH agree before deletion
-- opens".
--
-- The second key is the one this migration does not turn, and the reason is
-- specific rather than cautious. `privacy_configuration` is a SINGLETON — one
-- row, no environment column. Setting `privacy_center_enabled = true` here
-- would set it for local, development, staging and production at once, in a
-- migration, without anybody deciding it for production. That is not a
-- Development QA activation; it is a production configuration change wearing
-- one.
--
-- The environment-scoped flag is the correct Development-only control, and it
-- is the one the governed automation surface can operate
-- (`warsha_automation_set_feature_flag`). So this migration makes the flag rows
-- EXIST for development with truthful reasons — an absent row is indistinguish-
-- able from a decision nobody made — and the governed channel turns them on.

-- ---------------------------------------------------------------------------
-- 1. Say what is actually true
-- ---------------------------------------------------------------------------

update private.staff_feature_flags
set reason = 'WPS-022 export is built and deployed: the producer landed in '
  || '202608300006_privacy_export_producer.sql and writes a real file. It '
  || 'stays off here only because privacy_configuration.privacy_center_enabled '
  || 'is the second of two keys and is still false.'
where flag_key = 'data_export' and environment = 'local'
  and reason like '%no worker exists to produce the file yet%';

-- The privacy centre's own reason is still accurate — the copy genuinely has
-- not been read on a device — but it is worth saying which device task it is
-- waiting for rather than leaving "a device" to mean anything.
update private.staff_feature_flags
set reason = 'WPS-022 privacy centre stays disabled until the centre, the '
  || 'export download and the retention copy have been read on a physical '
  || 'device in English, Arabic and French.'
where flag_key = 'privacy_center' and environment = 'local'
  and reason like '%until the copy has been read on a device%';

-- ---------------------------------------------------------------------------
-- 2. Development has a stated position rather than a missing row
-- ---------------------------------------------------------------------------
-- `privacy_surface_enabled` treats an absent row as OFF, which is the right
-- default and the wrong record: "nobody seeded this" and "somebody decided no"
-- read identically. Development gets explicit rows, off, with reasons that name
-- the condition. The governed automation channel changes them afterwards, with
-- history, which is what `staff_feature_flag_history` is for.

insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  ('privacy_center', 'development', false, 'none',
   'Development position recorded explicitly rather than left absent. Opening '
   || 'this also requires privacy_configuration.privacy_center_enabled, which '
   || 'is global and therefore a release decision.', false),
  ('data_export', 'development', false, 'none',
   'The producer is deployed and verified in Development. Opening this also '
   || 'requires privacy_configuration.privacy_center_enabled, which is global.', false),
  ('account_deletion', 'development', false, 'none',
   'Deletion stays closed everywhere until retention durations have had legal '
   || 'review. This is a legal decision and not an engineering one.', false)
on conflict (flag_key, environment) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Make the second key legible in the database, not only here
-- ---------------------------------------------------------------------------
-- Nothing in the schema said this column is global while the flags beside it
-- are per environment, and that asymmetry is exactly what would let somebody
-- flip it for Development and open it for Production.

comment on column private.privacy_configuration.privacy_center_enabled is
  'GLOBAL, not per environment. The second of two keys: private.privacy_surface_enabled '
  'also requires an enabled staff_feature_flags row for the CURRENT environment. '
  'Setting this true opens the privacy centre for every environment whose flag is '
  'on, production included, so it is a release decision rather than a QA one.';

comment on column private.privacy_configuration.export_enabled is
  'GLOBAL. See privacy_center_enabled.';

comment on column private.privacy_configuration.deletion_enabled is
  'GLOBAL. Deletion additionally waits on a legal review of retention durations.';
