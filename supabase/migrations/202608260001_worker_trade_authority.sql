-- Worker trade authority: which trades exist, which may be chosen, and which
-- jobs each one may offer.
--
-- WHAT WAS WRONG
--
-- Step 3 of worker onboarding asked for a profession and then offered the whole
-- 171-row service catalogue as one flat list, because nothing on either side of
-- the network knew the two questions were related. The client could therefore
-- build a payload claiming a plumber offers bridal styling, and
-- `save_provider_foundation` had no basis on which to disagree.
--
-- It also could not tell a withdrawn trade from a current one. `handyman` and
-- `generalMaintenance` were withdrawn from every client in August 2026 -- they
-- named the same catch-all drawer as the withdrawn `general-maintenance`
-- category -- but the function accepted any 2-to-100-character string as a
-- profession, so a stale build offering them wrote them straight back in.
--
-- Both facts now live in the database as data, seeded from
-- `src/providers/profession-taxonomy.ts` by
-- `scripts/generate-profession-taxonomy-migration.mjs`. One authority, three
-- clients and one server reading it.
--
-- THE PLACEHOLDER TRADE
--
-- `activate_provider_role` inserted `profession_key = 'professional'`, which is
-- not a trade. It exists only because the column is NOT NULL, and its effect
-- was to satisfy the `professions_configured` gate -- "this worker has told us
-- their trade" -- for a worker who had been asked nothing. The seed becomes the
-- empty string, and the profiles still holding the placeholder WITHOUT having
-- chosen a single service are corrected to match. A profile that has services
-- is left exactly as it is: it chose a trade, and this migration does not
-- rewrite anybody's recorded identity.
--
-- WHAT THIS DOES NOT DO
--
-- It deletes no profession, no profile and no provider_services row. It does
-- not re-home a worker who still holds a withdrawn trade -- they keep it, they
-- are told, and they choose a concrete one themselves. It relaxes no RLS
-- policy and grants no new privilege.

-- ---------------------------------------------------------------------------
-- SECTION 1. THE TAXONOMY AS DATA
-- ---------------------------------------------------------------------------

create table if not exists public.professions (
  id text primary key,
  primary_category_id text not null references public.service_categories(id),
  sort_order integer not null,
  -- False for a trade withdrawn from selection. The row survives so an existing
  -- profile still resolves, exactly as `general-maintenance` does one level up.
  is_selectable boolean not null default true
);

comment on table public.professions is
  'Worker trades. Seeded from src/providers/profession-taxonomy.ts; sort_order is the shared demand ranking.';

create table if not exists public.profession_service_categories (
  profession_id text not null references public.professions(id) on delete cascade,
  category_id text not null references public.service_categories(id),
  sort_order integer not null,
  primary key (profession_id, category_id)
);

create table if not exists public.profession_services (
  profession_id text not null references public.professions(id) on delete cascade,
  service_id uuid not null references public.services(id),
  primary key (profession_id, service_id)
);

comment on table public.profession_service_categories is
  'Which service categories each trade may offer work from. The relationship Step 3 renders and the save RPC enforces.';

comment on table public.profession_services is
  'The exact specific services each trade may offer. Seeded from src/providers/profession-taxonomy.ts through stable service translation keys; persisted worker selections still use service UUIDs.';

alter table public.professions enable row level security;
alter table public.profession_service_categories enable row level security;
alter table public.profession_services enable row level security;

-- Public catalogue data, read-only, exactly like service_categories: a client
-- must be able to render the relationship before anybody signs in.
drop policy if exists professions_public_read on public.professions;
create policy professions_public_read on public.professions
  for select to anon, authenticated using (is_selectable);

drop policy if exists profession_categories_public_read on public.profession_service_categories;
create policy profession_categories_public_read on public.profession_service_categories
  for select to anon, authenticated using (true);

drop policy if exists profession_services_public_read on public.profession_services;
create policy profession_services_public_read on public.profession_services
  for select to anon, authenticated using (true);

grant select on public.professions to anon, authenticated;
grant select on public.profession_service_categories to anon, authenticated;
grant select on public.profession_services to anon, authenticated;

-- Replace wholesale rather than merge: the module is the authority, so a trade
-- deleted there must disappear here, and a mapping narrowed there must narrow
-- here. The dependent maps are cleared first, so this is safe to repeat.
delete from public.profession_services where true;
delete from public.profession_service_categories where true;
delete from public.professions where true;

insert into public.professions (id, primary_category_id, sort_order, is_selectable) values
  ('plumbing', 'plumbing', 1, true),
  ('poolTechnician', 'plumbing', 2, true),
  ('electrical', 'electrical', 3, true),
  ('smartHomeTechnician', 'electrical', 4, true),
  ('securitySystemTechnician', 'electrical', 5, true),
  ('cleaning', 'cleaning', 6, true),
  ('acRepair', 'ac', 7, true),
  ('applianceRepair', 'appliance-repair', 8, true),
  ('homeElectronicsTechnician', 'appliance-repair', 9, true),
  ('carpentry', 'carpentry', 10, true),
  ('furnitureRepairer', 'carpentry', 11, true),
  ('furnitureMaker', 'carpentry', 12, true),
  ('upholsterer', 'carpentry', 13, true),
  ('painting', 'painting', 14, true),
  ('interiorDecorator', 'painting', 15, true),
  ('movingHelp', 'moving-help', 16, true),
  ('pestControlWorker', 'pest-control', 17, true),
  ('waterHeaterTechnician', 'water-heater-repair', 18, true),
  ('tiler', 'flooring-tiling', 19, true),
  ('flooringSpecialist', 'flooring-tiling', 20, true),
  ('renovationWorker', 'renovation-finishing', 21, true),
  ('constructionWorker', 'renovation-finishing', 22, true),
  ('mason', 'renovation-finishing', 23, true),
  ('gypsumWorker', 'renovation-finishing', 24, true),
  ('aluminumWorker', 'alumetal', 25, true),
  ('glassWorker', 'alumetal', 26, true),
  ('welder', 'alumetal', 27, true),
  ('satelliteTechnician', 'satellite-tv-installation', 28, true),
  ('locksmith', 'locksmithing', 29, true),
  ('gardener', 'gardening', 30, true),
  ('landscaper', 'gardening', 31, true),
  ('barber', 'barber', 32, true),
  ('hairdresser', 'hairdressing', 33, true),
  ('personalStylist', 'personal-styling', 34, true),
  ('handyman', 'general-maintenance', 35, false),
  ('generalMaintenance', 'general-maintenance', 36, false);

insert into public.profession_service_categories (profession_id, category_id, sort_order) values
  ('plumbing', 'plumbing', 1),
  ('plumbing', 'water-heater-repair', 2),
  ('poolTechnician', 'plumbing', 1),
  ('electrical', 'electrical', 1),
  ('smartHomeTechnician', 'electrical', 1),
  ('securitySystemTechnician', 'electrical', 1),
  ('cleaning', 'cleaning', 1),
  ('acRepair', 'ac', 1),
  ('applianceRepair', 'appliance-repair', 1),
  ('applianceRepair', 'water-heater-repair', 2),
  ('homeElectronicsTechnician', 'appliance-repair', 1),
  ('homeElectronicsTechnician', 'satellite-tv-installation', 2),
  ('carpentry', 'carpentry', 1),
  ('furnitureRepairer', 'carpentry', 1),
  ('furnitureMaker', 'carpentry', 1),
  ('upholsterer', 'carpentry', 1),
  ('painting', 'painting', 1),
  ('interiorDecorator', 'painting', 1),
  ('interiorDecorator', 'renovation-finishing', 2),
  ('movingHelp', 'moving-help', 1),
  ('pestControlWorker', 'pest-control', 1),
  ('waterHeaterTechnician', 'water-heater-repair', 1),
  ('tiler', 'flooring-tiling', 1),
  ('flooringSpecialist', 'flooring-tiling', 1),
  ('renovationWorker', 'renovation-finishing', 1),
  ('renovationWorker', 'flooring-tiling', 2),
  ('renovationWorker', 'painting', 3),
  ('constructionWorker', 'renovation-finishing', 1),
  ('constructionWorker', 'flooring-tiling', 2),
  ('mason', 'renovation-finishing', 1),
  ('gypsumWorker', 'renovation-finishing', 1),
  ('aluminumWorker', 'alumetal', 1),
  ('glassWorker', 'alumetal', 1),
  ('welder', 'alumetal', 1),
  ('satelliteTechnician', 'satellite-tv-installation', 1),
  ('locksmith', 'locksmithing', 1),
  ('gardener', 'gardening', 1),
  ('landscaper', 'gardening', 1),
  ('barber', 'barber', 1),
  ('hairdresser', 'hairdressing', 1),
  ('personalStylist', 'personal-styling', 1);

-- Start with every job in each explicitly mapped category, then narrow the
-- specialist trades below. Broad trades such as Plumber and Electrician keep
-- their full categories; Pool technician, Glass worker and the other
-- specialists get only the jobs named by the shared authority.
insert into public.profession_services (profession_id, service_id)
select distinct psc.profession_id, s.id
from public.profession_service_categories psc
join public.services s on s.category_id = psc.category_id
where s.translation_key is not null;

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'poolTechnician'
  and s.translation_key not in ('plumbing-pipe-repair', 'plumbing-pipe-replace', 'plumbing-water-pressure', 'plumbing-water-tank', 'plumbing-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'smartHomeTechnician'
  and s.translation_key not in ('electrical-socket-install', 'electrical-switch-install', 'electrical-light-install', 'electrical-wiring', 'electrical-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'securitySystemTechnician'
  and s.translation_key not in ('electrical-wiring', 'electrical-panel', 'electrical-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'homeElectronicsTechnician'
  and s.translation_key not in ('appliance-microwave', 'appliance-install', 'appliance-inspection', 'satellite-dish-install', 'satellite-signal-fix', 'satellite-receiver', 'satellite-channel-tuning', 'satellite-tv-mount', 'satellite-tv-setup', 'satellite-relocate');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'furnitureRepairer'
  and s.translation_key not in ('carpentry-furniture-repair', 'carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-shelving', 'carpentry-lock-fitting', 'carpentry-upholstery');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'furnitureMaker'
  and s.translation_key not in ('carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-kitchen-cabinets', 'carpentry-shelving', 'carpentry-custom');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'upholsterer'
  and s.translation_key not in ('carpentry-furniture-repair', 'carpentry-upholstery');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'interiorDecorator'
  and s.translation_key not in ('painting-touch-up', 'painting-wall-prep', 'painting-decorative', 'painting-wallpaper', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'tiler'
  and s.translation_key not in ('flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-grout', 'flooring-removal');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'constructionWorker'
  and s.translation_key not in ('renovation-plastering', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-wall-build', 'renovation-bathroom', 'renovation-kitchen', 'renovation-full-apartment', 'renovation-crack-repair', 'renovation-waterproofing', 'renovation-inspection', 'flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-removal');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'mason'
  and s.translation_key not in ('renovation-plastering', 'renovation-wall-build', 'renovation-crack-repair', 'renovation-waterproofing', 'renovation-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'gypsumWorker'
  and s.translation_key not in ('renovation-plastering', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'glassWorker'
  and s.translation_key not in ('alumetal-window-install', 'alumetal-window-repair', 'alumetal-glass-replace', 'alumetal-shower-cabin');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'welder'
  and s.translation_key not in ('alumetal-window-install', 'alumetal-window-repair', 'alumetal-door-install', 'alumetal-door-repair', 'alumetal-kitchen', 'alumetal-shutter');

delete from public.profession_services ps
using public.services s
where ps.service_id = s.id and ps.profession_id = 'landscaper'
  and s.translation_key not in ('gardening-maintenance', 'gardening-planting', 'gardening-pruning', 'gardening-lawn', 'gardening-irrigation', 'gardening-clearance');

-- ---------------------------------------------------------------------------
-- SECTION 2. STOP SEEDING A TRADE NOBODY CHOSE
-- ---------------------------------------------------------------------------

create or replace function public.activate_provider_role(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid pg_catalog.uuid := (select auth.uid());
  result_id pg_catalog.uuid;
  has_contact_phone boolean;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_display_name)) not between 2 and 100 then
    raise exception 'Invalid provider information' using errcode = '22023';
  end if;

  select p.id into result_id
  from public.provider_profiles p
  where p.user_id = uid;
  if result_id is not null then
    return result_id;
  end if;

  -- A contact number, not a proven one. The message says which, because
  -- 'Verified phone required' sent people looking for a code that was never
  -- sent, from a provider that was never configured.
  has_contact_phone := private.account_contact_phone(uid) is not null;
  if not coalesce(has_contact_phone, false) then
    raise exception 'Contact phone number required' using errcode = '22023';
  end if;

  perform public.ensure_customer_profile();
  insert into public.user_roles(user_id, role)
  values(uid, 'provider')
  on conflict(user_id, role) do nothing;

  -- Empty, not 'professional'. The column is NOT NULL and the worker has not
  -- been asked yet; writing a plausible-looking trade made the
  -- professions_configured gate report an answer nobody had given.
  insert into public.provider_profiles(
    user_id, display_name, profession_key, onboarding_status,
    is_published, is_verified
  ) values (
    uid, pg_catalog.btrim(p_display_name), '', 'draft', false, false
  )
  returning id into result_id;
  return result_id;
exception
  when unique_violation then
    select p.id into result_id from public.provider_profiles p where p.user_id = uid;
    if result_id is not null then return result_id; end if;
    raise;
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then
    raise exception 'Unable to activate provider role' using errcode = 'P0001';
end;
$$;

comment on function public.activate_provider_role(text) is
  'WPS-024 correction. Requires a contact phone number on file, never a verified one. Records no placeholder trade.';

-- Correct only the profiles that demonstrably never chose: still holding the
-- placeholder AND offering no service. A profile with services chose a trade
-- and keeps whatever it chose.
update public.provider_profiles p
set profession_key = ''
where p.profession_key = 'professional'
  and not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = p.id and ps.is_active
  );

-- ---------------------------------------------------------------------------
-- SECTION 3. THE SAVE CONTRACT
-- ---------------------------------------------------------------------------
--
-- Four changes, each of which was a real failure a worker met:
--
--   1. A profession is no longer required on every save. Step 2 sends the name,
--      photo and experience BEFORE the worker has been asked their trade, and
--      the old unconditional `length(profession) between 2 and 100` check
--      turned that save into "Something went wrong. Please try again."
--   2. An empty profession leaves `profession_key` untouched instead of
--      failing, so a partial save cannot erase a trade either.
--   3. Changing to a withdrawn or unknown trade is refused by name, rather than
--      being accepted and stored.
--   4. A service must belong to a category one of the worker's own trades
--      covers. This is the rule the flat 171-service list had no way to express
--      and the server had no way to check.
--
-- Every message a worker can act on is distinct, because the clients now render
-- a specific sentence for each and fall back to the generic apology only for a
-- fault the worker cannot fix.

create or replace function public.save_provider_foundation(
  p_profile jsonb,
  p_submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  item jsonb;
  radius numeric;
  area_radius numeric;
  next_status text;
  bio text;
  submitted_profession text;
  stored_profession text;
  stored_specialties text[];
  stored_category_ids text[];
  next_profession text;
  claimed_professions text[];
  stored_claimed_professions text[];
  trade_selection_changed boolean;
  existing_services uuid[];
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
    then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  select id, onboarding_status, profession_key, specialties, category_ids
  into pid, next_status, stored_profession, stored_specialties, stored_category_ids
  from public.provider_profiles where user_id = uid and deleted_at is null for update;
  if pid is null then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  bio := pg_catalog.btrim(coalesce(p_profile->>'about', ''));
  radius := coalesce((p_profile->>'serviceRadiusKm')::numeric, 0);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'displayName', ''))) not between 2 and 100
    or pg_catalog.length(bio) > 500
    or pg_catalog.length(coalesce(p_profile->>'experienceSummary', '')) > 500
    or coalesce((p_profile->>'experienceYears')::integer, -1) not between 0 and 80
    or radius not between 1 and 250
  then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  if pg_catalog.jsonb_array_length(coalesce(p_profile->'specialties', '[]'::jsonb)) > 10
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties', '[]'::jsonb)) s
      where pg_catalog.length(pg_catalog.btrim(s.value)) not between 1 and 50
    )
  then raise exception 'Invalid specialties' using errcode = '22023'; end if;

  -- The trade. Empty means "this save is not about the trade" -- keep whatever
  -- is stored. A CHANGE has to be to a trade that exists and may be chosen; an
  -- unchanged withdrawn trade is left alone, because a worker who held one
  -- before it was withdrawn still holds it until they pick a concrete one.
  submitted_profession := pg_catalog.btrim(coalesce(p_profile->>'profession', ''));
  next_profession := coalesce(stored_profession, '');
  if submitted_profession <> '' and submitted_profession is distinct from stored_profession then
    if pg_catalog.length(submitted_profession) > 100 then
      raise exception 'Invalid provider information' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.professions pr
      where pr.id = submitted_profession and pr.is_selectable
    ) then
      raise exception 'Withdrawn profession' using errcode = '22023';
    end if;
    next_profession := submitted_profession;
  end if;

  -- A second profession is carried as a prefixed specialty. A stale historical
  -- marker is tolerated only when it was already stored on this same profile;
  -- a new or hand-made withdrawn/unknown marker is rejected, not ignored and
  -- persisted as an ordinary specialty.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties', '[]'::jsonb)) item
    where item.value like 'profession:%'
      and not exists (
        select 1 from public.professions pr
        where pr.id = pg_catalog.replace(item.value, 'profession:', '')
          and pr.is_selectable
      )
      and not (item.value = any(coalesce(stored_specialties, '{}')))
  ) then
    raise exception 'Withdrawn profession' using errcode = '22023';
  end if;

  -- Every trade this payload claims: the primary one plus each
  -- `profession:<key>` specialty, which is how a worker records more than one.
  claimed_professions := array(
    select pr.id
    from public.professions pr
    where pr.is_selectable
      and (pr.id = next_profession
        or pr.id in (
          select pg_catalog.replace(value, 'profession:', '')
          from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties', '[]'::jsonb))
          where value like 'profession:%'
        ))
    order by pr.id
  );
  stored_claimed_professions := array(
    select pr.id
    from public.professions pr
    where pr.is_selectable
      and (pr.id = stored_profession
        or ('profession:' || pr.id) = any(coalesce(stored_specialties, '{}')))
    order by pr.id
  );
  trade_selection_changed := claimed_professions is distinct from stored_claimed_professions;

  if p_submit and (
    not coalesce((p_profile->>'agreementAccepted')::boolean, false)
    or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-images' and o.name = (
      select avatar_url from public.provider_profiles where id = pid
    ))
  ) then raise exception 'Complete the required profile details' using errcode = '22023'; end if;
  if p_submit and pg_catalog.cardinality(claimed_professions) = 0
    then raise exception 'Profession required' using errcode = '22023'; end if;
  if pg_catalog.cardinality(claimed_professions) > 0
    and pg_catalog.jsonb_array_length(coalesce(p_profile->'services', '[]'::jsonb)) = 0
    then raise exception 'Service required' using errcode = '22023'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds', '[]'::jsonb)) c
    where not exists (
      select 1 from public.service_categories sc
      where sc.id = c.value and sc.is_active and sc.deleted_at is null
    )
      and (trade_selection_changed or not (c.value = any(coalesce(stored_category_ids, '{}'))))
  ) then raise exception 'Invalid service category' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds', '[]'::jsonb)) c
    where not exists (
      select 1 from public.profession_service_categories allowed
      where allowed.profession_id = any(claimed_professions)
        and allowed.category_id = c.value
    )
      and (trade_selection_changed or not (c.value = any(coalesce(stored_category_ids, '{}'))))
  ) then raise exception 'Service outside profession' using errcode = '22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
    <> (select pg_catalog.count(distinct value->>'serviceId') from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
  then raise exception 'Duplicate provider service' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) a
    group by a.value->>'governorate', a.value->>'district' having pg_catalog.count(*) > 1
  ) then raise exception 'Duplicate service area' using errcode = '22023'; end if;
  if p_submit and next_status in ('draft','more_information_required','rejected') then next_status := 'submitted'; end if;

  -- What this provider already offers, captured before the rewrite below.
  -- A service outside the claimed trades is refused only when it is NEW. Every
  -- worker onboarded through the flat 171-service list could pick any category,
  -- so enforcing the relationship retroactively would lock them out of their own
  -- profile for a choice the product used to invite. They keep what they have
  -- until they change their trades, which prunes it as a deliberate act.
  existing_services := array(
    select ps.service_id from public.provider_services ps where ps.provider_id = pid
  );

  update public.provider_profiles set
    display_name = pg_catalog.btrim(p_profile->>'displayName'),
    profession_key = next_profession,
    about = bio,
    experience_years = (p_profile->>'experienceYears')::integer,
    experience_summary = pg_catalog.btrim(coalesce(p_profile->>'experienceSummary', '')),
    specialties = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    languages = coalesce(array(
      select pg_catalog.left(pg_catalog.btrim(value), 50) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb))
      where pg_catalog.length(pg_catalog.btrim(value)) > 0 limit 10
    ), '{}'),
    skills = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    category_ids = coalesce(array(
      select value from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds','[]'::jsonb)) limit 10
    ), '{}'),
    primary_category_id = nullif(p_profile->'categoryIds'->>0, ''),
    service_radius_km = radius,
    is_available = coalesce((p_profile->>'isAvailable')::boolean, false),
    emergency_available = coalesce((p_profile->>'emergencyAvailable')::boolean, false),
    temporary_unavailable_until = nullif(p_profile->>'temporaryUnavailableUntil', '')::timestamptz,
    provider_agreement_accepted_at = case
      when coalesce((p_profile->>'agreementAccepted')::boolean, false)
        then coalesce(provider_agreement_accepted_at, pg_catalog.now())
      else provider_agreement_accepted_at end,
    onboarding_status = next_status
  where id = pid and user_id = uid;

  delete from public.provider_services where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)) loop
    if coalesce(item->>'serviceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'Invalid service' using errcode = '22023'; end if;
    -- A job the worker's own trades do not cover is refused by name. The old
    -- function accepted any active service, which is what let a flat catalogue
    -- of every category be saved against a single trade.
    if not exists (
      select 1 from public.services s
      where s.id = (item->>'serviceId')::uuid
        and (
          exists (
            select 1 from public.profession_services allowed
            where allowed.profession_id = any(claimed_professions)
              and allowed.service_id = s.id
          )
          or (not trade_selection_changed and s.id = any(existing_services))
        )
    ) then raise exception 'Service outside profession' using errcode = '22023'; end if;
    insert into public.provider_services(
      provider_id, service_id, custom_price_egp, pricing_type,
      transportation_fee_egp, emergency_surcharge_egp, is_active
    )
    select pid, s.id, null, s.pricing_type, 0, 0, true
    from public.services s join public.service_categories c on c.id = s.category_id
    where s.id = (item->>'serviceId')::uuid and s.is_active and s.deleted_at is null
      and c.is_active and c.deleted_at is null;
    if not found then raise exception 'Invalid service' using errcode = '22023'; end if;
  end loop;

  delete from public.provider_service_areas where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) loop
    area_radius := coalesce((item->>'radiusKm')::numeric, radius);
    if area_radius not between 1 and 250
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'governorate',''))) not between 1 and 100
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'district',''))) > 100
    then raise exception 'Invalid service area' using errcode = '22023'; end if;
    insert into public.provider_service_areas(provider_id, governorate, district, latitude, longitude, radius_km)
    values (
      pid, pg_catalog.btrim(item->>'governorate'),
      nullif(pg_catalog.btrim(coalesce(item->>'district','')), ''), null, null, area_radius
    );
  end loop;
  if p_submit and (
    not exists (select 1 from public.provider_services where provider_id = pid and is_active)
    or not exists (select 1 from public.provider_service_areas where provider_id = pid)
  ) then raise exception 'Add a service and work area' using errcode = '22023'; end if;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to save provider profile' using errcode = 'P0001';
end;
$$;

comment on function public.save_provider_foundation(jsonb, boolean) is
  'Worker profile save. The trade is optional per-save and validated against public.professions; every offered category and exact service must belong to one of the claimed trades.';

revoke all on function public.activate_provider_role(text) from public, anon;
grant execute on function public.activate_provider_role(text) to authenticated;
revoke all on function public.save_provider_foundation(jsonb, boolean) from public, anon;
grant execute on function public.save_provider_foundation(jsonb, boolean) to authenticated;
