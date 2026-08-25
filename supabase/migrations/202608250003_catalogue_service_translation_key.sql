-- The catalogue must hand out the key it now stores.
--
-- 202608250002 gave every service a `translation_key`, but
-- `get_marketplace_catalog()` still projected only `name`. So the clients kept
-- receiving nothing to resolve and kept rendering the English fallback -- the
-- exact defect the key was added to fix, one layer further out.
--
-- The body below is the previous definition with one line added. It is copied
-- programmatically from 202608230004 rather than retyped: `create or replace`
-- replaces the WHOLE body, and a hand-copied provider projection that quietly
-- dropped `is_available`, `provider_services` and a dozen other fields would
-- have taken the marketplace with it.

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
