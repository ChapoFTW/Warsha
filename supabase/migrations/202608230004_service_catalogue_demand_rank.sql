-- Barber, hairdressing and personal styling, and an explicit demand order.
--
-- Two changes, and they are separate concerns that happen to arrive together.
--
-- 1. Three new customer-requestable categories. All ten existing categories are
--    household maintenance, so none of them can host personal services without
--    distorting what it means. These are three different customer intents —
--    barbering, hairdressing, and fashion styling that involves no hair at all
--    — so they are three top-level categories rather than one bucket. No new
--    grouping column and no hierarchy: Warsha has no category-group authority
--    and does not need one for this.
--
-- 2. An explicit cold-start demand rank. `sort_order` was curation order from
--    the launch seed, which is fine for an admin table and wrong for a customer
--    choosing what to ask for. `demand_rank` says what it is, and
--    `demand_rank_source` says where it came from, so nothing in the schema can
--    be mistaken for observed Warsha demand — there is none yet.
--
-- The evidence behind the ranking, and the threshold at which observed demand
-- replaces it, are recorded in `docs/product/service-demand-ranking.md` and
-- mirrored in `src/services/service-catalogue.ts`.
--
-- No existing identifier changes, so every stored request, quote and booking
-- remains valid.

alter table public.service_categories
  add column if not exists demand_rank integer,
  add column if not exists demand_rank_source text not null default 'cold_start_research';

alter table public.service_categories
  drop constraint if exists service_categories_demand_rank_source_check;
alter table public.service_categories
  add constraint service_categories_demand_rank_source_check
  check (demand_rank_source in ('cold_start_research', 'observed'));

alter table public.service_categories
  drop constraint if exists service_categories_demand_rank_check;
alter table public.service_categories
  add constraint service_categories_demand_rank_check
  check (demand_rank is null or demand_rank > 0);

-- The three additions. `sort_order` continues past the launch block so the
-- admin table keeps a stable curation order independent of demand.
insert into public.service_categories(
  id, translation_key, description_key, icon_name, sort_order, is_active, deleted_at)
values
  ('barber', 'barber', 'barberDescription', 'content-cut', 110, true, null),
  ('hairdressing', 'hairdressing', 'hairdressingDescription',
    'face-retouching-natural', 120, true, null),
  ('personal-styling', 'personalStyling', 'personalStylingDescription',
    'checkroom', 130, true, null)
on conflict (id) do update
set translation_key = excluded.translation_key,
    description_key = excluded.description_key,
    icon_name = excluded.icon_name,
    sort_order = excluded.sort_order,
    is_active = true,
    deleted_at = null,
    updated_at = pg_catalog.now();

-- Cold-start demand order. Dense from 1, unique among active categories.
update public.service_categories c
set demand_rank = ranked.rank,
    demand_rank_source = 'cold_start_research',
    updated_at = pg_catalog.now()
from (values
  ('plumbing', 1),
  ('electrical', 2),
  ('ac', 3),
  ('cleaning', 4),
  ('appliance-repair', 5),
  ('carpentry', 6),
  ('painting', 7),
  ('general-maintenance', 8),
  ('moving-help', 9),
  ('barber', 10),
  ('hairdressing', 11),
  ('satellite-tv-installation', 12),
  ('personal-styling', 13)
) as ranked(id, rank)
where c.id = ranked.id
  and (c.demand_rank is distinct from ranked.rank
       or c.demand_rank_source is distinct from 'cold_start_research');

-- A category with no rank is left null on purpose rather than backfilled to a
-- guess. `nulls last` in every ordering puts it after each ranked category, so
-- it is offered last and never dropped from a customer's choices. Postgres
-- treats nulls as distinct, so any number of them coexist under the unique
-- index below.

-- Unique only among the categories a customer can actually be offered. A
-- retired category keeps whatever rank it had without blocking a live one.
drop index if exists service_categories_active_demand_rank_key;
create unique index service_categories_active_demand_rank_key
  on public.service_categories (demand_rank)
  where is_active and deleted_at is null;

comment on column public.service_categories.demand_rank is
  'Presentation order for customer-facing service choosers: 1 is offered first. '
  'Currently a researched Egypt-specific cold-start prior, NOT observed Warsha '
  'demand — see demand_rank_source and docs/product/service-demand-ranking.md.';
comment on column public.service_categories.demand_rank_source is
  'cold_start_research while Warsha lacks meaningful request traffic; observed '
  'once a rolling window of real requests replaces the prior.';

-- ---------------------------------------------------------------------------
-- Every place that orders categories now orders by demand.
-- ---------------------------------------------------------------------------
--
-- These are the current definitions with two changes only: the order-by now
-- leads with `demand_rank`, and `get_marketplace_catalog` no longer filters to
-- the ten launch categories. `sort_order` is kept as the second key so an
-- equally ranked pair still has a stable curated order, and `id` remains the
-- final tie-break.
--
-- `get_search_suggestions` additionally stops re-sorting its own result
-- alphabetically. It selected the top categories by rank and then aggregated
-- them `order by entry->>'translationKey'`, which discarded the ranking and
-- produced a different list in every language.

create or replace function public.get_marketplace_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'categories', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', c.id, 'translation_key', c.translation_key, 'icon_name', c.icon_name,
      'description_key', c.description_key
    ) order by c.demand_rank nulls last, c.sort_order, c.id) from public.service_categories c
      where c.is_active and c.deleted_at is null), '[]'::jsonb),
    'services', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'category_id', s.category_id, 'name', s.name,
      'price_egp', s.price_egp, 'pricing_type', s.pricing_type, 'duration_label', s.duration_label
    ) order by s.name, s.id) from public.services s join public.service_categories c on c.id = s.category_id
      where s.is_active and s.deleted_at is null and c.is_active and c.deleted_at is null), '[]'::jsonb),
    'providers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'profession_key', p.profession_key,
      'primary_category_id', p.primary_category_id, 'category_ids', p.category_ids,
      'rating_average', p.rating_average, 'review_count', p.review_count,
      'starting_price_egp', p.starting_price_egp, 'avatar_ref', p.avatar_url,
      'is_verified', true, 'skill_certificate_verified', p.skill_certificate_verified,
      'professional_certificate_verified', exists (
        select 1 from public.provider_certifications cert where cert.provider_id = p.id
          and cert.status = 'approved' and cert.deleted_at is null
          and (cert.expires_at is null or cert.expires_at >= current_date)
      ),
      'professional_certificate_count', (select pg_catalog.count(*) from public.provider_certifications cert
        where cert.provider_id = p.id and cert.status = 'approved' and cert.deleted_at is null
          and (cert.expires_at is null or cert.expires_at >= current_date)),
      'is_available', p.is_available, 'bookable', true,
      'emergency_available', p.emergency_available, 'completed_jobs', p.completed_jobs,
      'experience_years', p.experience_years, 'experience_summary', p.experience_summary,
      'response_time_label', p.response_time_label,
      'location_label', coalesce((select pg_catalog.concat_ws(', ', a.district, a.governorate)
        from public.provider_service_areas a where a.provider_id = p.id order by a.id limit 1), p.location_label),
      'service_radius_km', pg_catalog.round(p.service_radius_km),
      'languages', p.languages, 'about', p.about, 'specialties', p.specialties,
      'guarantee_text', p.guarantee_text, 'supported_payment_methods', '[]'::jsonb,
      'provider_services', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'service_id', ps.service_id, 'custom_price_egp', ps.custom_price_egp,
        'pricing_type', ps.pricing_type, 'is_active', ps.is_active,
        'service', pg_catalog.jsonb_build_object('id', s.id, 'name', s.name,
          'price_egp', s.price_egp, 'pricing_type', s.pricing_type, 'duration_label', s.duration_label)
      ) order by s.name, s.id) from public.provider_services ps join public.services s on s.id = ps.service_id
        where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null), '[]'::jsonb),
      'portfolio', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', item.id, 'title', item.title, 'description', item.description,
        'category_id', item.category_id, 'service_id', item.service_id,
        'completed_period', item.completed_period,
        'image_refs', coalesce((select pg_catalog.jsonb_agg(i.storage_path order by i.sort_order, i.id)
          from public.provider_portfolio_images i where i.portfolio_item_id = item.id), '[]'::jsonb)
      ) order by item.sort_order, item.id) from public.provider_portfolio item
        where item.provider_id = p.id and item.status = 'published' and item.deleted_at is null), '[]'::jsonb)
    ) order by p.rating_average desc, p.display_name, p.id)
    from public.provider_profiles p where private.is_provider_publicly_discoverable(p.id)), '[]'::jsonb)
  )
$$;

create or replace function public.get_discovery_filters()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'translationKey', c.translation_key, 'iconName', c.icon_name
      ) order by c.demand_rank nulls last, c.sort_order, c.id)
      from public.service_categories c
      where c.is_active and c.deleted_at is null
        and exists (
          select 1 from public.provider_profiles p
          where p.primary_category_id = c.id and private.is_provider_publicly_discoverable(p.id))
    ), '[]'::jsonb),
    'governorates', coalesce((
      select pg_catalog.jsonb_agg(distinct a.governorate order by a.governorate)
      from public.provider_service_areas a
      join public.provider_profiles p on p.id = a.provider_id
      where private.is_provider_publicly_discoverable(p.id)
        and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0
    ), '[]'::jsonb),
    'languages', coalesce((
      select pg_catalog.jsonb_agg(distinct language order by language)
      from public.provider_profiles p, pg_catalog.unnest(p.languages) language
      where private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb),
    'pricingTypes', coalesce((
      select pg_catalog.jsonb_agg(distinct coalesce(ps.pricing_type, s.pricing_type)
        order by coalesce(ps.pricing_type, s.pricing_type))
      from public.provider_services ps
      join public.services s on s.id = ps.service_id
      join public.provider_profiles p on p.id = ps.provider_id
      where ps.is_active and s.is_active and s.deleted_at is null
        and private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb),
    'sorts', pg_catalog.jsonb_build_array(
      'recommended','distance','rating','most_reviewed','availability'),
    -- Distance is only offerable when the caller has a location. The client
    -- reads this rather than deciding for itself.
    'distanceRequiresLocation', true,
    'emergencyAvailable', exists (
      select 1 from public.provider_profiles p
      where p.emergency_available and private.is_provider_publicly_discoverable(p.id))
  )
$$;

create or replace function public.get_search_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  return pg_catalog.jsonb_build_object(
    'recentSearches', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(r.query order by r.searched_at desc)
      from (select query, searched_at from public.user_recent_searches
            where user_id = v_uid order by searched_at desc limit 10) r
    ), '[]'::jsonb) end,
    'suggestedCategories', coalesce((
      select pg_catalog.jsonb_agg(entry order by ordinal)
      from (
        select pg_catalog.jsonb_build_object(
          'id', c.id, 'translationKey', c.translation_key, 'iconName', c.icon_name) as entry,
          row_number() over (order by c.demand_rank nulls last, c.sort_order, c.id) as ordinal
        from public.service_categories c
        where c.is_active and c.deleted_at is null
          and exists (select 1 from public.provider_profiles p
            where p.primary_category_id = c.id and private.is_provider_publicly_discoverable(p.id))
        order by c.demand_rank nulls last, c.sort_order, c.id limit 8
      ) categories
    ), '[]'::jsonb),
    'commonServices', coalesce((
      select pg_catalog.jsonb_agg(entry order by ordinal)
      from (
        select pg_catalog.jsonb_build_object(
          'id', s.id, 'name', s.name, 'categoryId', s.category_id,
          'providerCount', pg_catalog.count(*)) as entry,
          row_number() over (order by pg_catalog.count(*) desc, s.name) as ordinal
        from public.services s
        join public.provider_services ps on ps.service_id = s.id and ps.is_active
        join public.provider_profiles p on p.id = ps.provider_id
        where s.is_active and s.deleted_at is null
          and private.is_provider_publicly_discoverable(p.id)
        group by s.id, s.name, s.category_id
        order by pg_catalog.count(*) desc, s.name limit 8
      ) services
    ), '[]'::jsonb)
  );
end;
$$;
