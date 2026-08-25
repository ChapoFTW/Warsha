-- Marketplace request creation has never been possible.
--
-- ## The failure
--
-- Creating a request returned `Marketplace is temporarily unavailable`
-- (SQLSTATE 55000) for every customer, every category. Reproduced directly
-- against the development backend as a real customer, with `plumbing` and no
-- specific service selected.
--
-- ## Why, and why it is NOT the catalogue rollout
--
-- `create_marketplace_request` calls `private.assert_marketplace_ready` before
-- it validates anything about categories or services. That function refuses on
-- two counts, and both were true here:
--
--   1. `marketplace_configuration.enabled` and `.scheduler_enabled` are false.
--      `202607310002` inserts the singleton row with `values (true)` for
--      `singleton` alone, so both flags took their column default of false, and
--      the ONLY write to `enabled` anywhere in the schema is the WPS-017 kill
--      switch setting it to false. There has never been an activation path.
--
--   2. `marketplace_category_duration_defaults` is empty. No migration has ever
--      inserted into it, and the function requires a row for the requested
--      category.
--
--   3. `marketplace_capacity_configuration.road_factor` and
--      `.average_urban_speed_kmh` are null, and the function requires both. The
--      row exists with only `fixed_buffer_minutes` set.
--
-- The first check is the one that fired, which is why the error was the same
-- for an original category with no service selected. The 171-service rollout is
-- not implicated: it cannot be reached from there. The second would have
-- blocked every request immediately afterwards regardless.
--
-- ## What this does
--
-- Supplies the configuration that was missing, and activates the marketplace.
--
-- The kill switch remains the operator control and still wins: it sets
-- `enabled = false` whenever it is used, and this migration runs once. This is
-- an initial activation, not a bypass of that control.
--
-- Durations are the scheduler's planning estimate for a category, not a promise
-- to a customer and not a price input. They are deliberately generous for the
-- trades where a first visit is usually a survey.

-- ---------------------------------------------------------------------------
-- 1. A planning duration for every selectable category
-- ---------------------------------------------------------------------------
insert into private.marketplace_category_duration_defaults
  (category_id, estimated_duration_minutes, policy_version)
select v.category_id, v.minutes,
  (select m.policy_version from private.marketplace_configuration m where m.singleton)
from (values
  ('plumbing', 90),
  ('electrical', 90),
  ('cleaning', 180),
  ('ac', 120),
  ('appliance-repair', 90),
  ('carpentry', 120),
  ('painting', 240),
  ('moving-help', 240),
  ('pest-control', 90),
  ('water-heater-repair', 90),
  ('flooring-tiling', 240),
  ('renovation-finishing', 240),
  ('alumetal', 120),
  ('satellite-tv-installation', 60),
  ('locksmithing', 60),
  ('gardening', 120),
  ('barber', 45),
  ('hairdressing', 90),
  ('personal-styling', 120)
) as v(category_id, minutes)
-- Only for categories that exist and are selectable, so a withdrawn category
-- can never acquire a duration and become schedulable again by accident.
where exists (
  select 1 from public.service_categories c
  where c.id = v.category_id and c.is_active and c.deleted_at is null)
on conflict (category_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Travel estimates the scheduler needs
-- ---------------------------------------------------------------------------
-- Straight-line distance is not how far anybody drives. `road_factor` converts
-- it to road distance, and the speed turns that into minutes.
--
-- 22 km/h is a realistic average for Cairo and Alexandria traffic rather than a
-- textbook urban figure; 1.35 is the usual detour ratio for a dense grid. Both
-- are planning estimates the scheduler pads with `fixed_buffer_minutes`, not
-- promises to a customer.
update private.marketplace_capacity_configuration
set road_factor = coalesce(road_factor, 1.35),
    average_urban_speed_kmh = coalesce(average_urban_speed_kmh, 22),
    updated_at = pg_catalog.now()
where singleton;

-- ---------------------------------------------------------------------------
-- 3. Activate the marketplace
-- ---------------------------------------------------------------------------
-- `assert_marketplace_ready` also pins six configuration values exactly. They
-- already hold on this backend; setting them here makes the readiness contract
-- explicit rather than inherited, so a fresh environment reaches the same state.
update private.marketplace_configuration
set enabled = true,
    scheduler_enabled = true,
    request_lifetime_seconds = 600,
    initial_collection_seconds = 120,
    edit_window_seconds = 300,
    worker_no_show_seconds = 900,
    useful_quote_target = 5,
    fixed_buffer_minutes = 30,
    updated_at = pg_catalog.now()
where singleton;

-- ---------------------------------------------------------------------------
-- 4. Refuse to finish unless a request can actually be created
-- ---------------------------------------------------------------------------
-- The defect this migration fixes was invisible to every test because nothing
-- asserted readiness. This runs the real precondition for every selectable
-- category and fails the migration rather than shipping a broken flow again.
do $$
declare
  v_category record;
begin
  for v_category in
    select c.id from public.service_categories c
    where c.is_active and c.deleted_at is null
  loop
    perform private.assert_marketplace_ready(v_category.id);
  end loop;
end $$;
