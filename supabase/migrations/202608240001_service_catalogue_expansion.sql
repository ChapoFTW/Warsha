-- Concrete services instead of a catch-all, and a researched bootstrap order.
--
-- NOT YET APPLIED. This file is written and reviewed; applying it to the hosted
-- development project is a governed backend action awaiting approval.
--
-- ## Why `general-maintenance` goes
--
-- It was the largest category by profession count -- fourteen trades, including
-- a locksmith and an aluminium worker. That is the tell: it was not a service
-- customers asked for, it was the drawer everything specific got put in. A
-- customer with a broken lock does not search "general maintenance", and a
-- locksmith filed under it is invisible to the person who needs one.
--
-- It is DEACTIVATED, never deleted. `marketplace_requests.category_id`,
-- quotes and bookings already reference it, and a customer opening an old job
-- must still read words. `is_active = false` removes it from selection and
-- discovery while every historical row keeps resolving.
--
-- ## Evidence for the order (August 2026, Egyptian operators)
--
--   FilKhedma  plumbing, A/C, carpentry, electricity, alumetal, satellite dish,
--              painting, home appliances, cleaning (six varieties)
--   Taskty     house cleaning FIRST, then furniture cleaning, pest control,
--              plumbing, electricity, carpentry, furniture moving
--              (~20,000 customers, greater Cairo)
--   HomeRun    100+ categories incl. cleaning, moving, painting
--   YalaFix    plumbing, electrical, cleaning, A/C and appliances, painting
--
-- Alumetal and satellite dish are Egyptian categories a global taxonomy would
-- not produce; both are here because FilKhedma publishes them. Pest control is
-- a named top-level Taskty category.
--
-- Cleaning is third because it is the one recurring service -- booked weekly or
-- monthly where plumbing is booked when something breaks. Plumbing and
-- electrical lead it because they are urgent and year-round everywhere.
-- Air conditioning is fourth despite leading FilKhedma and despite a USD 1.12B
-- market, because a static annual rank must not encode August.
--
-- Locksmithing sits at 15 on evidence -- it fronts no Egyptian marketplace --
-- but it is present and searchable, because the moment somebody needs one it is
-- the only thing they want. Personal styling is last: legitimate, and niche.
--
-- The order is mirrored in `src/services/service-catalogue.ts`, which web,
-- Android and iOS all read. A test asserts this file and that module agree, so
-- no platform can hard-code its own ordering.

-- ---------------------------------------------------------------------------
-- 1. Withdraw the catch-all without destroying history
-- ---------------------------------------------------------------------------
update public.service_categories
set is_active = false,
    demand_rank = null
where id = 'general-maintenance';

comment on column public.service_categories.is_active is
  'False withdraws a category from selection and discovery while leaving every historical request, quote and booking that references it resolvable. Withdrawal is never deletion.';

-- ---------------------------------------------------------------------------
-- 2. The seven concrete categories that replace it
-- ---------------------------------------------------------------------------
-- `translation_key` and `description_key` resolve against
-- `src/i18n/translations.ts`, which carries all three languages. A category
-- whose keys do not resolve fails `service-labels.test.mts`.
insert into public.service_categories
  (id, translation_key, description_key, icon, is_active, sort_order, demand_rank, demand_rank_source)
values
  ('pest-control', 'pestControl', 'pestControlDescription', 'pest-control', true, 90, 9, 'cold_start_research'),
  ('water-heater-repair', 'waterHeaterRepair', 'waterHeaterRepairDescription', 'water-heater', true, 91, 10, 'cold_start_research'),
  ('flooring-tiling', 'flooringTiling', 'flooringTilingDescription', 'flooring', true, 92, 11, 'cold_start_research'),
  ('renovation-finishing', 'renovationFinishing', 'renovationFinishingDescription', 'renovation', true, 93, 12, 'cold_start_research'),
  ('alumetal', 'alumetal', 'alumetalDescription', 'window', true, 94, 13, 'cold_start_research'),
  ('locksmithing', 'locksmithing', 'locksmithingDescription', 'lock', true, 95, 15, 'cold_start_research'),
  ('gardening', 'gardening', 'gardeningDescription', 'garden', true, 96, 16, 'cold_start_research')
on conflict (id) do update
set translation_key = excluded.translation_key,
    description_key = excluded.description_key,
    icon = excluded.icon,
    is_active = excluded.is_active,
    demand_rank = excluded.demand_rank,
    demand_rank_source = excluded.demand_rank_source;

-- ---------------------------------------------------------------------------
-- 3. Re-rank everything that already existed
-- ---------------------------------------------------------------------------
-- Cleaning moves 4 -> 3 and air conditioning 3 -> 4 on the evidence above.
-- Satellite moves 12 -> 14, barber 10 -> 17, hairdressing 11 -> 18 to make room
-- for the household trades that outrank them. No identifier changes, so every
-- stored request, quote and booking remains valid.
update public.service_categories set demand_rank = 1  where id = 'plumbing';
update public.service_categories set demand_rank = 2  where id = 'electrical';
update public.service_categories set demand_rank = 3  where id = 'cleaning';
update public.service_categories set demand_rank = 4  where id = 'ac';
update public.service_categories set demand_rank = 5  where id = 'appliance-repair';
update public.service_categories set demand_rank = 6  where id = 'carpentry';
update public.service_categories set demand_rank = 7  where id = 'painting';
update public.service_categories set demand_rank = 8  where id = 'moving-help';
update public.service_categories set demand_rank = 14 where id = 'satellite-tv-installation';
update public.service_categories set demand_rank = 17 where id = 'barber';
update public.service_categories set demand_rank = 18 where id = 'hairdressing';
update public.service_categories set demand_rank = 19 where id = 'personal-styling';

-- ---------------------------------------------------------------------------
-- 4. A withdrawn category may never be chosen for new work
-- ---------------------------------------------------------------------------
-- Enforced in the database rather than only in the clients, because three
-- clients agreeing not to offer something is a convention, and this is a rule.
-- Existing rows are untouched: the check applies to what is written next.
create or replace function private.service_category_selectable(p_category_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.is_active from public.service_categories c where c.id = p_category_id
  ), false)
$$;

comment on function private.service_category_selectable(text) is
  'Whether a category may be chosen for new work. Withdrawn categories stay readable for history and unselectable for anything new.';

revoke all on function private.service_category_selectable(text) from public, anon, authenticated;
