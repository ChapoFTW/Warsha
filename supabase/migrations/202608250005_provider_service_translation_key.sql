-- A provider's own services must be nameable too.
--
-- 202608250003 added `translation_key` to the catalogue's top-level `services`
-- array, which is what the customer request form reads. It did not add it to
-- the copy of a service nested inside each provider's `provider_services`, and
-- that nested copy is what the provider profile, the booking flow and the
-- targeted-quote form render from. So those screens kept showing the English
-- `name` -- the same defect the key exists to fix, one projection further in.
--
-- Every provider service link on this backend points at a keyed service, so
-- every one of them was falling back unnecessarily.
--
-- The body below is 202608250003's definition with one line added. It is
-- generated from that file rather than retyped: `create or replace` replaces
-- the WHOLE body, and a hand-copy that quietly dropped `is_available` or
-- `provider_services` would take the marketplace with it.

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
      'translation_key', s.translation_key,
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
          'translation_key', s.translation_key,
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
