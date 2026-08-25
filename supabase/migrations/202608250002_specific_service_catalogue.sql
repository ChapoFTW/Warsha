-- Specific services for every category, addressable by key.
--
-- ## What was wrong
--
-- `public.services` stored a display string in `name` and nothing else. Five
-- rows existed in the whole product -- two plumbing, one each for electrical,
-- cleaning and air conditioning, none for the other fifteen categories -- and
-- the request form rendered `service.name` directly. An Arabic customer
-- choosing plumbing was offered "Home inspection" and "Leak repair" in English;
-- a customer choosing anything else was offered nothing at all.
--
-- Both halves are the same mistake: a display string used as data.
-- `service_categories` solved it with `translation_key`; this is that, one
-- level down.
--
-- ## Identity and compatibility
--
-- The uuid stays the primary key and stays what a request references, so every
-- request already written keeps working. `translation_key` is a label
-- resolver, not a second identity.
--
-- The five pre-existing rows are given the key of their equivalent in the
-- shared catalogue, so they keep their uuid, their price and their history and
-- start resolving in three languages. The seed that follows therefore skips
-- them: `on conflict do nothing` protects their real prices from being
-- overwritten with the placeholder the new rows carry.
--
-- New rows are priced `quote` at 0 deliberately. They exist to say WHAT the
-- customer wants, not what it costs -- a marketplace request is quoted by the
-- worker, and `create_marketplace_request` already treats a null service as
-- "no restriction" rather than a missing price.
--
-- Generated from `src/services/specific-services.ts` by
-- `scripts/generate-specific-services-migration.mjs`; a test asserts the two
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
update public.services set translation_key = 'plumbing-inspection' where id = '10000000-0000-4000-8000-000000000001' and translation_key is null;
update public.services set translation_key = 'plumbing-leak-repair' where id = '10000000-0000-4000-8000-000000000002' and translation_key is null;
update public.services set translation_key = 'electrical-inspection' where id = '10000000-0000-4000-8000-000000000003' and translation_key is null;
update public.services set translation_key = 'cleaning-deep' where id = '10000000-0000-4000-8000-000000000004' and translation_key is null;
update public.services set translation_key = 'ac-cleaning' where id = '10000000-0000-4000-8000-000000000005' and translation_key is null;

-- ---------------------------------------------------------------------------
-- 2. Every specific service, for every category
-- ---------------------------------------------------------------------------
-- `name` carries the English label so a client with no catalogue entry for a
-- key still shows words. It is a fallback, never the identity.
insert into public.services (category_id, name, translation_key, pricing_type, price_egp, is_active)
values
  ('plumbing', 'Leak repair', 'plumbing-leak-repair', 'quote', 0, true),
  ('plumbing', 'Blocked drain', 'plumbing-blocked-drain', 'quote', 0, true),
  ('plumbing', 'Toilet repair', 'plumbing-toilet-repair', 'quote', 0, true),
  ('plumbing', 'Toilet installation', 'plumbing-toilet-install', 'quote', 0, true),
  ('plumbing', 'Tap repair', 'plumbing-tap-repair', 'quote', 0, true),
  ('plumbing', 'Tap installation', 'plumbing-tap-install', 'quote', 0, true),
  ('plumbing', 'Sink repair', 'plumbing-sink-repair', 'quote', 0, true),
  ('plumbing', 'Sink installation', 'plumbing-sink-install', 'quote', 0, true),
  ('plumbing', 'Shower repair', 'plumbing-shower-repair', 'quote', 0, true),
  ('plumbing', 'Shower installation', 'plumbing-shower-install', 'quote', 0, true),
  ('plumbing', 'Pipe repair', 'plumbing-pipe-repair', 'quote', 0, true),
  ('plumbing', 'Pipe replacement', 'plumbing-pipe-replace', 'quote', 0, true),
  ('plumbing', 'Low water pressure', 'plumbing-water-pressure', 'quote', 0, true),
  ('plumbing', 'Water tank connection', 'plumbing-water-tank', 'quote', 0, true),
  ('plumbing', 'Plumbing inspection', 'plumbing-inspection', 'quote', 0, true),
  ('electrical', 'Power outage or fault', 'electrical-outage', 'quote', 0, true),
  ('electrical', 'Short circuit', 'electrical-short-circuit', 'quote', 0, true),
  ('electrical', 'Socket repair', 'electrical-socket-repair', 'quote', 0, true),
  ('electrical', 'Socket installation', 'electrical-socket-install', 'quote', 0, true),
  ('electrical', 'Switch repair', 'electrical-switch-repair', 'quote', 0, true),
  ('electrical', 'Switch installation', 'electrical-switch-install', 'quote', 0, true),
  ('electrical', 'Lighting repair', 'electrical-lighting-repair', 'quote', 0, true),
  ('electrical', 'Light fixture installation', 'electrical-light-install', 'quote', 0, true),
  ('electrical', 'Chandelier installation', 'electrical-chandelier', 'quote', 0, true),
  ('electrical', 'Circuit breaker problem', 'electrical-breaker', 'quote', 0, true),
  ('electrical', 'Electrical panel work', 'electrical-panel', 'quote', 0, true),
  ('electrical', 'Wiring or rewiring', 'electrical-wiring', 'quote', 0, true),
  ('electrical', 'Fan installation or repair', 'electrical-fan', 'quote', 0, true),
  ('electrical', 'Electrical inspection', 'electrical-inspection', 'quote', 0, true),
  ('cleaning', 'Regular home cleaning', 'cleaning-regular', 'quote', 0, true),
  ('cleaning', 'Deep cleaning', 'cleaning-deep', 'quote', 0, true),
  ('cleaning', 'Move-in cleaning', 'cleaning-move-in', 'quote', 0, true),
  ('cleaning', 'After-renovation cleaning', 'cleaning-post-construction', 'quote', 0, true),
  ('cleaning', 'Sofa and upholstery cleaning', 'cleaning-sofa', 'quote', 0, true),
  ('cleaning', 'Carpet cleaning', 'cleaning-carpet', 'quote', 0, true),
  ('cleaning', 'Window cleaning', 'cleaning-windows', 'quote', 0, true),
  ('cleaning', 'Kitchen deep clean', 'cleaning-kitchen', 'quote', 0, true),
  ('cleaning', 'Bathroom deep clean', 'cleaning-bathroom', 'quote', 0, true),
  ('cleaning', 'Water tank cleaning', 'cleaning-water-tank', 'quote', 0, true),
  ('ac', 'AC not cooling', 'ac-not-cooling', 'quote', 0, true),
  ('ac', 'AC maintenance', 'ac-service', 'quote', 0, true),
  ('ac', 'AC cleaning', 'ac-cleaning', 'quote', 0, true),
  ('ac', 'AC installation', 'ac-install', 'quote', 0, true),
  ('ac', 'AC removal', 'ac-removal', 'quote', 0, true),
  ('ac', 'AC relocation', 'ac-relocation', 'quote', 0, true),
  ('ac', 'Refrigerant recharge', 'ac-gas-recharge', 'quote', 0, true),
  ('ac', 'Water leaking from AC', 'ac-water-leak', 'quote', 0, true),
  ('ac', 'Strange noise', 'ac-noise', 'quote', 0, true),
  ('ac', 'Control or electrical fault', 'ac-control-fault', 'quote', 0, true),
  ('appliance-repair', 'Washing machine repair', 'appliance-washing-machine', 'quote', 0, true),
  ('appliance-repair', 'Fridge repair', 'appliance-fridge', 'quote', 0, true),
  ('appliance-repair', 'Freezer repair', 'appliance-freezer', 'quote', 0, true),
  ('appliance-repair', 'Oven or cooker repair', 'appliance-oven', 'quote', 0, true),
  ('appliance-repair', 'Dishwasher repair', 'appliance-dishwasher', 'quote', 0, true),
  ('appliance-repair', 'Dryer repair', 'appliance-dryer', 'quote', 0, true),
  ('appliance-repair', 'Microwave repair', 'appliance-microwave', 'quote', 0, true),
  ('appliance-repair', 'Water dispenser repair', 'appliance-water-dispenser', 'quote', 0, true),
  ('appliance-repair', 'Appliance installation', 'appliance-install', 'quote', 0, true),
  ('appliance-repair', 'Appliance diagnosis', 'appliance-inspection', 'quote', 0, true),
  ('carpentry', 'Wooden door repair', 'carpentry-door-repair', 'quote', 0, true),
  ('carpentry', 'Wooden door installation', 'carpentry-door-install', 'quote', 0, true),
  ('carpentry', 'Furniture repair', 'carpentry-furniture-repair', 'quote', 0, true),
  ('carpentry', 'Furniture assembly', 'carpentry-furniture-assembly', 'quote', 0, true),
  ('carpentry', 'Wardrobe work', 'carpentry-wardrobe', 'quote', 0, true),
  ('carpentry', 'Kitchen cabinets', 'carpentry-kitchen-cabinets', 'quote', 0, true),
  ('carpentry', 'Shelving and storage', 'carpentry-shelving', 'quote', 0, true),
  ('carpentry', 'Custom woodwork', 'carpentry-custom', 'quote', 0, true),
  ('carpentry', 'Door hardware fitting', 'carpentry-lock-fitting', 'quote', 0, true),
  ('carpentry', 'Upholstery work', 'carpentry-upholstery', 'quote', 0, true),
  ('painting', 'Room painting', 'painting-room', 'quote', 0, true),
  ('painting', 'Whole apartment painting', 'painting-apartment', 'quote', 0, true),
  ('painting', 'Touch-ups and small repairs', 'painting-touch-up', 'quote', 0, true),
  ('painting', 'Wall preparation', 'painting-wall-prep', 'quote', 0, true),
  ('painting', 'Decorative finishes', 'painting-decorative', 'quote', 0, true),
  ('painting', 'Wallpaper fitting', 'painting-wallpaper', 'quote', 0, true),
  ('painting', 'Exterior painting', 'painting-exterior', 'quote', 0, true),
  ('painting', 'Damp or mould treatment', 'painting-damp-treatment', 'quote', 0, true),
  ('moving-help', 'Apartment move', 'moving-apartment', 'quote', 0, true),
  ('moving-help', 'Single item move', 'moving-single-item', 'quote', 0, true),
  ('moving-help', 'Moving furniture within the home', 'moving-furniture-inside', 'quote', 0, true),
  ('moving-help', 'Packing help', 'moving-packing', 'quote', 0, true),
  ('moving-help', 'Furniture disassembly and reassembly', 'moving-disassembly', 'quote', 0, true),
  ('moving-help', 'Furniture lift or hoist', 'moving-lift', 'quote', 0, true),
  ('moving-help', 'Office move', 'moving-office', 'quote', 0, true),
  ('pest-control', 'Cockroaches', 'pest-cockroaches', 'quote', 0, true),
  ('pest-control', 'Bedbugs', 'pest-bedbugs', 'quote', 0, true),
  ('pest-control', 'Mice or rats', 'pest-rodents', 'quote', 0, true),
  ('pest-control', 'Ants', 'pest-ants', 'quote', 0, true),
  ('pest-control', 'Mosquitoes or flies', 'pest-mosquitoes', 'quote', 0, true),
  ('pest-control', 'Termites', 'pest-termites', 'quote', 0, true),
  ('pest-control', 'General preventive treatment', 'pest-general-spray', 'quote', 0, true),
  ('pest-control', 'Pest inspection', 'pest-inspection', 'quote', 0, true),
  ('water-heater-repair', 'No hot water', 'water-heater-no-hot-water', 'quote', 0, true),
  ('water-heater-repair', 'Gas heater repair', 'water-heater-gas-repair', 'quote', 0, true),
  ('water-heater-repair', 'Electric heater repair', 'water-heater-electric-repair', 'quote', 0, true),
  ('water-heater-repair', 'Heater installation', 'water-heater-install', 'quote', 0, true),
  ('water-heater-repair', 'Heater replacement', 'water-heater-replace', 'quote', 0, true),
  ('water-heater-repair', 'Heater leaking', 'water-heater-leak', 'quote', 0, true),
  ('water-heater-repair', 'Descaling and servicing', 'water-heater-descale', 'quote', 0, true),
  ('water-heater-repair', 'Thermostat problem', 'water-heater-thermostat', 'quote', 0, true),
  ('flooring-tiling', 'Ceramic tiling', 'flooring-ceramic-install', 'quote', 0, true),
  ('flooring-tiling', 'Porcelain tiling', 'flooring-porcelain-install', 'quote', 0, true),
  ('flooring-tiling', 'Marble work', 'flooring-marble', 'quote', 0, true),
  ('flooring-tiling', 'Parquet fitting', 'flooring-parquet', 'quote', 0, true),
  ('flooring-tiling', 'Cracked or loose tiles', 'flooring-tile-repair', 'quote', 0, true),
  ('flooring-tiling', 'Grouting and sealing', 'flooring-grout', 'quote', 0, true),
  ('flooring-tiling', 'Skirting boards', 'flooring-skirting', 'quote', 0, true),
  ('flooring-tiling', 'Old floor removal', 'flooring-removal', 'quote', 0, true),
  ('renovation-finishing', 'Plastering', 'renovation-plastering', 'quote', 0, true),
  ('renovation-finishing', 'Gypsum board ceiling', 'renovation-gypsum-ceiling', 'quote', 0, true),
  ('renovation-finishing', 'Gypsum decoration', 'renovation-gypsum-decor', 'quote', 0, true),
  ('renovation-finishing', 'Building or removing a wall', 'renovation-wall-build', 'quote', 0, true),
  ('renovation-finishing', 'Bathroom renovation', 'renovation-bathroom', 'quote', 0, true),
  ('renovation-finishing', 'Kitchen renovation', 'renovation-kitchen', 'quote', 0, true),
  ('renovation-finishing', 'Full apartment finishing', 'renovation-full-apartment', 'quote', 0, true),
  ('renovation-finishing', 'Wall crack repair', 'renovation-crack-repair', 'quote', 0, true),
  ('renovation-finishing', 'Waterproofing', 'renovation-waterproofing', 'quote', 0, true),
  ('renovation-finishing', 'Site visit and estimate', 'renovation-inspection', 'quote', 0, true),
  ('alumetal', 'Aluminium window installation', 'alumetal-window-install', 'quote', 0, true),
  ('alumetal', 'Aluminium window repair', 'alumetal-window-repair', 'quote', 0, true),
  ('alumetal', 'Aluminium door installation', 'alumetal-door-install', 'quote', 0, true),
  ('alumetal', 'Aluminium door repair', 'alumetal-door-repair', 'quote', 0, true),
  ('alumetal', 'Glass replacement', 'alumetal-glass-replace', 'quote', 0, true),
  ('alumetal', 'Aluminium kitchen', 'alumetal-kitchen', 'quote', 0, true),
  ('alumetal', 'Shower cabin', 'alumetal-shower-cabin', 'quote', 0, true),
  ('alumetal', 'Mosquito screens', 'alumetal-mosquito-net', 'quote', 0, true),
  ('alumetal', 'Roller shutter work', 'alumetal-shutter', 'quote', 0, true),
  ('satellite-tv-installation', 'Satellite dish installation', 'satellite-dish-install', 'quote', 0, true),
  ('satellite-tv-installation', 'No signal or weak signal', 'satellite-signal-fix', 'quote', 0, true),
  ('satellite-tv-installation', 'Receiver setup', 'satellite-receiver', 'quote', 0, true),
  ('satellite-tv-installation', 'Channel tuning', 'satellite-channel-tuning', 'quote', 0, true),
  ('satellite-tv-installation', 'TV wall mounting', 'satellite-tv-mount', 'quote', 0, true),
  ('satellite-tv-installation', 'TV setup', 'satellite-tv-setup', 'quote', 0, true),
  ('satellite-tv-installation', 'Move dish or receiver', 'satellite-relocate', 'quote', 0, true),
  ('locksmithing', 'Locked out', 'locksmith-locked-out', 'quote', 0, true),
  ('locksmithing', 'Change a lock', 'locksmith-lock-change', 'quote', 0, true),
  ('locksmithing', 'Lock repair', 'locksmith-lock-repair', 'quote', 0, true),
  ('locksmithing', 'Install a new lock', 'locksmith-lock-install', 'quote', 0, true),
  ('locksmithing', 'Key copying', 'locksmith-key-copy', 'quote', 0, true),
  ('locksmithing', 'Broken key in lock', 'locksmith-broken-key', 'quote', 0, true),
  ('locksmithing', 'Safe opening or repair', 'locksmith-safe', 'quote', 0, true),
  ('locksmithing', 'Security lock upgrade', 'locksmith-security-upgrade', 'quote', 0, true),
  ('gardening', 'Garden maintenance', 'gardening-maintenance', 'quote', 0, true),
  ('gardening', 'Planting', 'gardening-planting', 'quote', 0, true),
  ('gardening', 'Pruning and trimming', 'gardening-pruning', 'quote', 0, true),
  ('gardening', 'Lawn care', 'gardening-lawn', 'quote', 0, true),
  ('gardening', 'Irrigation setup', 'gardening-irrigation', 'quote', 0, true),
  ('gardening', 'Balcony plants', 'gardening-balcony', 'quote', 0, true),
  ('gardening', 'Garden clearance', 'gardening-clearance', 'quote', 0, true),
  ('barber', 'Haircut', 'barber-haircut', 'quote', 0, true),
  ('barber', 'Beard trim', 'barber-beard-trim', 'quote', 0, true),
  ('barber', 'Shave', 'barber-shave', 'quote', 0, true),
  ('barber', 'Haircut and beard', 'barber-haircut-and-beard', 'quote', 0, true),
  ('barber', 'Kids haircut', 'barber-kids', 'quote', 0, true),
  ('barber', 'Wash and styling', 'barber-hair-wash', 'quote', 0, true),
  ('barber', 'Home visit for several people', 'barber-group', 'quote', 0, true),
  ('hairdressing', 'Haircut', 'hair-cut', 'quote', 0, true),
  ('hairdressing', 'Blow-dry and styling', 'hair-blow-dry', 'quote', 0, true),
  ('hairdressing', 'Colouring', 'hair-colour', 'quote', 0, true),
  ('hairdressing', 'Highlights', 'hair-highlights', 'quote', 0, true),
  ('hairdressing', 'Hair treatment', 'hair-treatment', 'quote', 0, true),
  ('hairdressing', 'Keratin or straightening', 'hair-keratin', 'quote', 0, true),
  ('hairdressing', 'Bridal or occasion styling', 'hair-bridal', 'quote', 0, true),
  ('hairdressing', 'Updo', 'hair-updo', 'quote', 0, true),
  ('hairdressing', 'Kids haircut', 'hair-kids', 'quote', 0, true),
  ('personal-styling', 'Occasion styling', 'styling-occasion', 'quote', 0, true),
  ('personal-styling', 'Wardrobe review', 'styling-wardrobe-review', 'quote', 0, true),
  ('personal-styling', 'Personal shopping', 'styling-shopping', 'quote', 0, true),
  ('personal-styling', 'Colour analysis', 'styling-colour-analysis', 'quote', 0, true),
  ('personal-styling', 'Wedding styling', 'styling-wedding', 'quote', 0, true),
  ('personal-styling', 'Capsule wardrobe planning', 'styling-capsule', 'quote', 0, true)
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
