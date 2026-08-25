-- Point `service_categories.icon_name` at the approved Warsha assets.
--
-- The column held Material Icons glyph names -- `window`, `garden`, `lock`,
-- `home-repair-service` -- chosen when the only icons Warsha had were
-- `@expo/vector-icons`. Nothing validated them: a name Material did not
-- recognise rendered an empty box and reported nothing, and every surface that
-- wanted a category icon reached for its own field, so the same category could
-- be drawn differently on two screens.
--
-- Warsha now has a drawn mark for every category and every trade, and the
-- clients resolve it from the category id through one shared authority. They no
-- longer read this column to decide what to draw.
--
-- So this is a DEMOTION, not a new authority. The column stays because rows
-- reference it and something may still read it, and it is set to the approved
-- asset stem so it agrees with the file on disk instead of naming a glyph the
-- product no longer uses. `warsha-icons.test.mts` asserts every value here is a
-- real asset, which is the guard the old arrangement never had.
--
-- `general-maintenance` is included deliberately: withdrawn from selection,
-- still resolvable, and pointed at the legacy mark so an old request renders.

update public.service_categories as c
set icon_name = approved.icon_name
from (values
  ('plumbing', 'service-plumbing'),
  ('electrical', 'service-electrical'),
  ('cleaning', 'service-cleaning'),
  ('ac', 'service-ac'),
  ('appliance-repair', 'service-appliance-repair'),
  ('carpentry', 'service-carpentry'),
  ('painting', 'service-painting'),
  ('moving-help', 'service-moving-help'),
  ('pest-control', 'service-pest-control'),
  ('water-heater-repair', 'service-water-heater-repair'),
  ('flooring-tiling', 'service-flooring-tiling'),
  ('renovation-finishing', 'service-renovation-finishing'),
  ('alumetal', 'service-alumetal'),
  ('satellite-tv-installation', 'service-satellite-tv-installation'),
  ('locksmithing', 'service-locksmithing'),
  ('gardening', 'service-gardening'),
  ('barber', 'service-barber'),
  ('hairdressing', 'service-hairdressing'),
  ('personal-styling', 'service-personal-styling'),
  ('general-maintenance', 'legacy-general-maintenance')
) as approved(id, icon_name)
where c.id = approved.id
  and c.icon_name is distinct from approved.icon_name;

comment on column public.service_categories.icon_name is
  'Compatibility only. The approved Warsha asset stem for this category. Clients resolve the mark from the category id through src/brand/warsha-icons.ts and do not read this column to decide what to draw.';
