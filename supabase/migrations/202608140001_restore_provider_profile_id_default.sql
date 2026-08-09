-- Hosted projects that applied the original core migration before its schema
-- was corrected never received the independent provider-profile ID default.
alter table public.provider_profiles
  alter column id set default pg_catalog.gen_random_uuid();
