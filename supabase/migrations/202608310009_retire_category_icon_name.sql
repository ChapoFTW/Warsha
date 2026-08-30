-- `service_categories.icon_name` is retired as a display concept.
--
-- It held unvalidated MaterialIcons glyph names, and a name Material did not
-- know drew an empty box on a screen no test could read -- four of the seven
-- added in one expansion were wrong that way. The architecture moved: category
-- marks now resolve from the category ID through `categoryIconName` into
-- Warsha's own icon geometry, so an unchecked string in a table cannot decide
-- what a customer sees.
--
-- Nothing reads it any more. The client `Category` type no longer declares an
-- icon, `supabase-adapter.ts` no longer maps one, `web/lib/customer.ts` no
-- longer carries `iconName`, and the discovery payload no longer ships it --
-- verified by the compiler, which found every consumer when the field was
-- removed from the type.
--
-- The column stays. Three functions still return it in their payload
-- (`get_discovery_filters`, `get_marketplace_catalog`, `get_search_suggestions`),
-- and changing a wire contract to delete a field nobody reads buys nothing.
-- The comment is what stops the next reader assuming it is live.

comment on column public.service_categories.icon_name is
  'RETIRED 2026-08-31 as a display concept. Unvalidated Material glyph names; '
  'no client reads it. Category marks resolve from the category id through '
  'categoryIconName into the Warsha icon geometry. Do not render this column.';
