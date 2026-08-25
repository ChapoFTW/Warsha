import { readFileSync, writeFileSync } from 'node:fs';
import { specificServices } from '../src/services/specific-services.ts';

const esc = (v) => v.replace(/'/g, "''");

// The five rows that predate translation keys. Each maps onto an equivalent
// entry in the shared catalogue, so its uuid, price and history all survive and
// it simply starts resolving in three languages.
const LEGACY = [
  ['10000000-0000-4000-8000-000000000001', 'plumbing-inspection'],
  ['10000000-0000-4000-8000-000000000002', 'plumbing-leak-repair'],
  ['10000000-0000-4000-8000-000000000003', 'electrical-inspection'],
  ['10000000-0000-4000-8000-000000000004', 'cleaning-deep'],
  ['10000000-0000-4000-8000-000000000005', 'ac-cleaning'],
];

const header = `-- Specific services for every category, addressable by key.
--
-- ## What was wrong
--
-- \`public.services\` stored a display string in \`name\` and nothing else. Five
-- rows existed in the whole product -- two plumbing, one each for electrical,
-- cleaning and air conditioning, none for the other fifteen categories -- and
-- the request form rendered \`service.name\` directly. An Arabic customer
-- choosing plumbing was offered "Home inspection" and "Leak repair" in English;
-- a customer choosing anything else was offered nothing at all.
--
-- Both halves are the same mistake: a display string used as data.
-- \`service_categories\` solved it with \`translation_key\`; this is that, one
-- level down.
--
-- ## Identity and compatibility
--
-- The uuid stays the primary key and stays what a request references, so every
-- request already written keeps working. \`translation_key\` is a label
-- resolver, not a second identity.
--
-- The five pre-existing rows are given the key of their equivalent in the
-- shared catalogue, so they keep their uuid, their price and their history and
-- start resolving in three languages. The seed that follows therefore skips
-- them: \`on conflict do nothing\` protects their real prices from being
-- overwritten with the placeholder the new rows carry.
--
-- New rows are priced \`quote\` at 0 deliberately. They exist to say WHAT the
-- customer wants, not what it costs -- a marketplace request is quoted by the
-- worker, and \`create_marketplace_request\` already treats a null service as
-- "no restriction" rather than a missing price.
--
-- Generated from \`src/services/specific-services.ts\` by
-- \`scripts/generate-specific-services-migration.mjs\`; a test asserts the two
-- still agree.

alter table public.services
  add column if not exists translation_key text;

comment on column public.services.translation_key is
  'Stable machine identity resolved to a customer-facing name by src/services/specific-services.ts. The uuid remains the identity a request references; this is a label resolver.';

-- Not partial. Postgres already allows any number of NULLs in a unique index,
-- so rows that predate keys coexist happily -- and a partial index cannot be an
-- ON CONFLICT target without repeating its predicate at every call site.
create unique index if not exists services_translation_key_unique
  on public.services (translation_key);

-- ---------------------------------------------------------------------------
-- 1. Give the pre-existing rows their key, keeping everything else
-- ---------------------------------------------------------------------------
`;

const legacySql = LEGACY.map(([id, key]) =>
  `update public.services set translation_key = '${key}' where id = '${id}' and translation_key is null;`
).join('\n');

const rows = specificServices.map((s) =>
  `  ('${s.categoryId}', '${esc(s.en)}', '${s.key}', 'quote', 0, true)`
).join(',\n');

const body = `

-- ---------------------------------------------------------------------------
-- 2. Every specific service, for every category
-- ---------------------------------------------------------------------------
-- \`name\` carries the English label so a client with no catalogue entry for a
-- key still shows words. It is a fallback, never the identity.
insert into public.services (category_id, name, translation_key, pricing_type, price_egp, is_active)
values
${rows}
on conflict (translation_key) do nothing;

-- Anything active that still has no key would render untranslated, which is the
-- defect this migration exists to remove.
do $$
declare v_unkeyed integer;
begin
  select pg_catalog.count(*) into v_unkeyed
  from public.services
  where is_active and deleted_at is null and translation_key is null;
  if v_unkeyed > 0 then
    raise exception 'Refusing to finish: % active services have no translation key', v_unkeyed
      using errcode = '23502';
  end if;
end $$;
`;

writeFileSync('supabase/migrations/202608250002_specific_service_catalogue.sql',
  header + legacySql + body, 'utf8');
console.log('migration written:', specificServices.length, 'services +', LEGACY.length, 'legacy keyed');
