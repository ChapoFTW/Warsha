-- Concrete services instead of a catch-all, and a researched bootstrap order.
--
-- Applied to the hosted DEVELOPMENT project (warsha-development,
-- lrhipbcapzfxuwixfoog) with approval. Production is a separate project and is
-- untouched by this file.
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
-- 2. Clear the rank space before reassigning it
-- ---------------------------------------------------------------------------
-- `service_categories_active_demand_rank_key` makes the rank unique among
-- active rows, which is exactly the guarantee wanted -- and it means ranks
-- cannot be reshuffled in place. Assigning 9 to pest control while moving-help
-- still holds 9 collides, and so does any sequence of single-row updates that
-- passes through a duplicate on its way to the answer.
--
-- So the ranks are emptied first and written once, as a set. Nothing is
-- unranked at the end of this migration, and nothing is unranked to a customer
-- at any point either: the whole file is one transaction.
update public.service_categories
set demand_rank = null
where demand_rank is not null;

-- ---------------------------------------------------------------------------
-- 3. The seven concrete categories that replace the catch-all
-- ---------------------------------------------------------------------------
-- `translation_key` and `description_key` resolve against
-- `src/i18n/translations.ts`, which carries all three languages. A category
-- whose keys do not resolve fails `service-labels.test.mts`.
--
-- Inserted unranked; section 4 ranks every category together.
insert into public.service_categories
  (id, translation_key, description_key, icon_name, is_active, sort_order, demand_rank, demand_rank_source)
values
  ('pest-control', 'pestControl', 'pestControlDescription', 'pest-control', true, 90, null, 'cold_start_research'),
  ('water-heater-repair', 'waterHeaterRepair', 'waterHeaterRepairDescription', 'water-heater', true, 91, null, 'cold_start_research'),
  ('flooring-tiling', 'flooringTiling', 'flooringTilingDescription', 'flooring', true, 92, null, 'cold_start_research'),
  ('renovation-finishing', 'renovationFinishing', 'renovationFinishingDescription', 'renovation', true, 93, null, 'cold_start_research'),
  ('alumetal', 'alumetal', 'alumetalDescription', 'window', true, 94, null, 'cold_start_research'),
  ('locksmithing', 'locksmithing', 'locksmithingDescription', 'lock', true, 95, null, 'cold_start_research'),
  ('gardening', 'gardening', 'gardeningDescription', 'garden', true, 96, null, 'cold_start_research')
on conflict (id) do update
set translation_key = excluded.translation_key,
    description_key = excluded.description_key,
    icon_name = excluded.icon_name,
    is_active = excluded.is_active,
    demand_rank_source = excluded.demand_rank_source;

-- ---------------------------------------------------------------------------
-- 4. The bootstrap order, written as one set
-- ---------------------------------------------------------------------------
-- One statement, so the unique constraint sees the finished arrangement rather
-- than each intermediate step. Mirrors `SERVICE_DEMAND_ORDER` in
-- `src/services/service-catalogue.ts` exactly; a test compares the two.
update public.service_categories c
set demand_rank = ranked.rank,
    demand_rank_source = 'cold_start_research'
from (values
  ('plumbing', 1),
  ('electrical', 2),
  ('cleaning', 3),
  ('ac', 4),
  ('appliance-repair', 5),
  ('carpentry', 6),
  ('painting', 7),
  ('moving-help', 8),
  ('pest-control', 9),
  ('water-heater-repair', 10),
  ('flooring-tiling', 11),
  ('renovation-finishing', 12),
  ('alumetal', 13),
  ('satellite-tv-installation', 14),
  ('locksmithing', 15),
  ('gardening', 16),
  ('barber', 17),
  ('hairdressing', 18),
  ('personal-styling', 19)
) as ranked(id, rank)
where c.id = ranked.id;

-- ---------------------------------------------------------------------------
-- 5. A withdrawn category may never be chosen for new work
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
