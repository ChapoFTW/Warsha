-- Catalogue icons that resolve to a real glyph.
--
-- Four of the seven icon names introduced by 202608240001 do not exist in
-- MaterialIcons: `water-heater`, `flooring`, `renovation` and `garden`. They
-- read like icon names, which is exactly why nobody questioned them.
--
-- Nothing caught it. `src/data/adapters/supabase-adapter.ts` casts the stored
-- value straight to the icon type -- `String(row.icon_name) as Category['icon']`
-- -- so TypeScript validates the shared mock catalogue and never sees what the
-- database actually holds. A category with an unknown name renders whatever the
-- icon font falls back to, on a screen a test can read nothing about.
--
-- The shared mock catalogue already carried working names for all four, so
-- these are not new choices; the database is being brought into line with the
-- module every client renders from. `service-catalogue.test.mts` now checks
-- every name in both places against the shipped glyph map, so an icon that does
-- not exist cannot reach a screen again.
--
--   water-heater-repair   water-heater -> water-damage
--   flooring-tiling       flooring     -> grid-on
--   renovation-finishing  renovation   -> construction
--   gardening             garden       -> yard
--
-- Forward-only. 202608240001 is already applied and is left as it was.

update public.service_categories set icon_name = 'water-damage' where id = 'water-heater-repair';
update public.service_categories set icon_name = 'grid-on'      where id = 'flooring-tiling';
update public.service_categories set icon_name = 'construction' where id = 'renovation-finishing';
update public.service_categories set icon_name = 'yard'         where id = 'gardening';

-- Pre-existing, and found by the same check: carpentry has been stored as
-- `handyman` since the launch seed while every client's shared catalogue says
-- `carpenter`. Both are real glyphs, so nothing failed -- a customer simply saw
-- one icon against the real backend and a different one in mock mode. The
-- shared module is the authority.
update public.service_categories set icon_name = 'carpenter'    where id = 'carpentry';

comment on column public.service_categories.icon_name is
  'A MaterialIcons glyph name. Clients cast this straight to the icon type, so an unknown name fails silently at render; service-catalogue.test.mts validates every value against the shipped glyph map.';
