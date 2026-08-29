-- Marketplace search raised on every call that came through the API.
--
-- `public.search_providers` builds a temporary working set and emptied it with
-- `delete from discovery_matches;`. PostgREST connects as `authenticator`,
-- which preloads the `safeupdate` library, and that library refuses an
-- unqualified DELETE with SQLSTATE 21000. It refuses it inside a SECURITY
-- DEFINER body as well, because the library is loaded per session, not per
-- executing role.
--
-- The result was that the primary discovery entry point on both clients --
-- `src/discovery/discovery-repository.ts` and `web/app/app/discover/page.tsx`
-- -- returned `DELETE requires a WHERE clause` to anonymous and authenticated
-- callers alike, on local and on hosted Development. Every pgTAP assertion
-- about it passed the whole time, because pgTAP connects as a superuser and
-- that session never loads `safeupdate`.
--
-- `private.refresh_worker_pricing_profiles` carries the same unqualified
-- DELETE. It is not reachable from any client role today, so it is corrected
-- here as a latent trap rather than as a live failure.

CREATE OR REPLACE FUNCTION public.search_providers(p_query text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'recommended'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 500);
  v_sort text := coalesce(p_sort, 'recommended');
  v_tsquery tsquery;
  v_mode text := 'browse';
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_approximate boolean := false;
  v_config private.marketplace_configuration;
  v_fairness_bound numeric := 0.08;
  v_new_worker_bound numeric := 0.04;
  v_latitude double precision := nullif(p_filters->>'latitude','')::double precision;
  v_longitude double precision := nullif(p_filters->>'longitude','')::double precision;
  v_category text := nullif(p_filters->>'categoryId','');
  v_service uuid := nullif(p_filters->>'serviceId','')::uuid;
  v_governorate text := nullif(p_filters->>'governorate','');
  v_min_rating numeric := coalesce(nullif(p_filters->>'minimumRating','')::numeric, 0);
  v_min_jobs integer := coalesce(nullif(p_filters->>'minimumCompletedJobs','')::integer, 0);
  v_max_distance numeric := nullif(p_filters->>'maximumDistanceKm','')::numeric;
  v_available boolean := coalesce(nullif(p_filters->>'availableNow','')::boolean, false);
  v_skill boolean := coalesce(nullif(p_filters->>'skillCertificateVerified','')::boolean, false);
  v_certificate boolean := coalesce(nullif(p_filters->>'professionalCertificateVerified','')::boolean, false);
  v_emergency boolean := coalesce(nullif(p_filters->>'emergencyAvailable','')::boolean, false);
  v_pricing text := nullif(p_filters->>'pricingType','');
  v_language text := nullif(p_filters->>'language','');
begin
  if (select auth.uid()) is not null then
    perform private.enforce_rate_limit('discovery_search');
  end if;

  if v_sort not in ('recommended','distance','rating','most_reviewed','availability') then
    raise exception 'Unsupported sort' using errcode='22023';
  end if;
  -- A sort the data cannot honestly answer is refused rather than silently
  -- degraded, so the client can only ever offer what the server can deliver.
  if v_sort = 'distance' and (v_latitude is null or v_longitude is null) then
    raise exception 'Distance sorting requires a location' using errcode='22023';
  end if;

  select * into v_config from private.marketplace_configuration limit 1;
  if v_config.ranking_policy is not null then
    v_fairness_bound := coalesce((v_config.ranking_policy->>'fairnessBound')::numeric, 0.08);
    v_new_worker_bound := coalesce((v_config.ranking_policy->>'newWorkerBound')::numeric, 0.04);
  end if;

  if pg_catalog.length(v_query) > 0 then
    v_query := pg_catalog.left(v_query, 100);
    v_tsquery := pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, v_query);
    v_mode := 'exact';
  end if;

  -- A per-transaction working set. `on commit drop` removes it at the end of
  -- the statement's transaction; the guard keeps a long-lived transaction (a
  -- test run, a batched call) from raising a notice on every subsequent search.
  if pg_catalog.to_regclass('pg_temp.discovery_matches') is null then
    create temporary table discovery_matches (
      provider_id uuid primary key, distance_km numeric, score numeric
    ) on commit drop;
  end if;
  -- `where true` is not decoration. The API connects as `authenticator`, whose
  -- `session_preload_libraries` includes `safeupdate`, and that library rejects
  -- an unqualified DELETE with SQLSTATE 21000, "DELETE requires a WHERE
  -- clause". It rejects it inside a SECURITY DEFINER body too, because the
  -- library is loaded for the session rather than for the role the statement
  -- runs as. So this statement raised on every single call through PostgREST
  -- while passing every pgTAP run, which connects as a superuser that never
  -- loads the library. Emptying the whole working set is the intent; saying so
  -- explicitly is what keeps the intent reachable.
  delete from discovery_matches where true;

  insert into discovery_matches(provider_id, distance_km, score)
  select p.id,
    case when v_latitude is null or v_longitude is null then null else (
      select min(private.marketplace_distance_km(v_latitude, v_longitude, a.latitude, a.longitude))
      from public.provider_service_areas a
      where a.provider_id = p.id and a.latitude is not null and a.longitude is not null) end,
    0
  from public.provider_profiles p
  where private.is_provider_publicly_discoverable(p.id)
    and (v_category is null or p.primary_category_id = v_category or exists (
      select 1 from public.provider_services ps
      join public.services s on s.id = ps.service_id
      where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null
        and s.category_id = v_category))
    and (v_service is null or exists (
      select 1 from public.provider_services ps
      where ps.provider_id = p.id and ps.service_id = v_service and ps.is_active))
    and (v_governorate is null or exists (
      select 1 from public.provider_service_areas a
      where a.provider_id = p.id and a.governorate = v_governorate))
    and p.rating_average >= v_min_rating
    and p.completed_jobs >= v_min_jobs
    and (not v_available or (p.is_available
      and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())))
    and (not v_skill or p.skill_certificate_verified)
    and (not v_emergency or p.emergency_available)
    and (not v_certificate or exists (
      select 1 from public.provider_certifications cert
      where cert.provider_id = p.id and cert.status = 'approved' and cert.deleted_at is null
        and (cert.expires_at is null or cert.expires_at >= current_date)))
    and (v_pricing is null or exists (
      select 1 from public.provider_services ps
      join public.services s on s.id = ps.service_id
      where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null
        and coalesce(ps.pricing_type, s.pricing_type) = v_pricing))
    and (v_language is null or v_language = any(p.languages))
    and (v_tsquery is null
      or p.search_document @@ v_tsquery
      or exists (
        select 1 from pg_catalog.unnest(p.skills || p.specialties) tag
        where pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, tag) @@ v_tsquery)
      or exists (
        select 1 from public.provider_services ps
        join public.services s on s.id = ps.service_id
        join public.service_categories c on c.id = s.category_id
        where ps.provider_id = p.id and ps.is_active
          and s.is_active and s.deleted_at is null and c.is_active and c.deleted_at is null
          and (pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, s.name) @@ v_tsquery
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, c.id) @@ v_tsquery)));

  -- Spelling tolerance runs ONLY when the exact search found nothing, so a
  -- correctly spelled query never has its results diluted by near-misses.
  if v_mode = 'exact' and not exists (select 1 from discovery_matches) then
    insert into discovery_matches(provider_id, distance_km, score)
    select p.id,
      case when v_latitude is null or v_longitude is null then null else (
        select min(private.marketplace_distance_km(v_latitude, v_longitude, a.latitude, a.longitude))
        from public.provider_service_areas a
        where a.provider_id = p.id and a.latitude is not null and a.longitude is not null) end,
      0
    from public.provider_profiles p
    where private.is_provider_publicly_discoverable(p.id)
      and (v_governorate is null or exists (
        select 1 from public.provider_service_areas a
        where a.provider_id = p.id and a.governorate = v_governorate))
      and greatest(
        extensions.word_similarity(pg_catalog.lower(v_query), pg_catalog.lower(p.display_name)),
        extensions.word_similarity(pg_catalog.lower(v_query),
          pg_catalog.lower(coalesce(pg_catalog.array_to_string(p.skills,' '),''))),
        extensions.word_similarity(pg_catalog.lower(v_query),
          pg_catalog.lower(coalesce(pg_catalog.array_to_string(p.specialties,' '),'')))
      ) > 0.5;
    v_approximate := exists (select 1 from discovery_matches);
    if v_approximate then v_mode := 'approximate'; end if;
  end if;

  -- The distance filter is applied after distance is known, and only when the
  -- caller actually provided a location.
  if v_max_distance is not null and v_latitude is not null and v_longitude is not null then
    delete from discovery_matches where distance_km is null or distance_km > v_max_distance;
  end if;

  update discovery_matches m
  set score = private.discovery_recommended_score(
        p.rating_average, p.completed_jobs, m.distance_km,
        coalesce(p.service_radius_km, 50), coalesce(o.calculated_adjustment, 0),
        v_fairness_bound, v_new_worker_bound)
  from public.provider_profiles p
  left join private.worker_opportunity_state o on o.provider_id = p.id
  where p.id = m.provider_id;

  select pg_catalog.count(*)::integer into v_total from discovery_matches;

  if v_mode = 'exact' and v_total = 0 then v_mode := 'empty'; end if;

  select coalesce(pg_catalog.jsonb_agg(card order by ordinal), '[]'::jsonb) into v_results
  from (
    select private.discovery_provider_card(p, m.distance_km) as card,
      row_number() over (order by
        case when v_sort = 'distance' then m.distance_km end asc nulls last,
        case when v_sort = 'rating' then p.rating_average end desc nulls last,
        case when v_sort = 'most_reviewed' then p.review_count end desc nulls last,
        case when v_sort = 'availability' then (case when p.is_available then 0 else 1 end) end asc nulls last,
        case when v_sort = 'recommended' then m.score end desc nulls last,
        m.score desc, p.rating_average desc, p.id
      ) as ordinal
    from discovery_matches m
    join public.provider_profiles p on p.id = m.provider_id
    order by ordinal
    limit v_limit offset v_offset
  ) page;

  return pg_catalog.jsonb_build_object(
    'mode', v_mode,
    'sort', v_sort,
    'totalCount', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', v_offset + v_limit < v_total,
    'rankingPolicyVersion', v_config.ranking_policy->>'version',
    'results', v_results);
end;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_worker_pricing_profiles(p_provider_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare affected integer;
begin
  delete from private.worker_pricing_profiles where p_provider_id is null or provider_id=p_provider_id;
  insert into private.worker_pricing_profiles(
    provider_id,category_id,service_id,coarse_area_id,sample_size,median_minor,p25_minor,p75_minor,
    original_quote_median_minor,quote_to_final_variance,revision_frequency,last_completion_at,as_of,confidence_state,policy_version
  )
  select b.provider_id,s.category_id,b.service_id,r.coarse_area_id,count(*)::integer,
    percentile_cont(.5) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.25) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.75) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.5) within group(order by q.price_minor)::bigint,
    avg(abs(ps.provider_gross_minor-coalesce(q.price_minor,ps.provider_gross_minor))::numeric/nullif(coalesce(q.price_minor,ps.provider_gross_minor),0)),
    avg(case when q.current_revision>1 then 1 else 0 end),max(h.created_at),pg_catalog.now(),
    case when count(*)>=10 then 'sufficient' when count(*)>=3 then 'low' else 'neutral' end,
    (select policy_version from private.marketplace_configuration where singleton)
  from public.bookings b join public.services s on s.id=b.service_id
  join public.marketplace_requests r on r.id=b.marketplace_request_id
  join public.booking_price_snapshots ps on ps.booking_id=b.id and ps.is_current
  left join public.worker_quotes q on q.id=b.selected_worker_quote_id
  join lateral(select max(created_at) created_at from public.booking_status_history where booking_id=b.id and status='completed') h on true
  where b.status='completed' and h.created_at is not null and (p_provider_id is null or b.provider_id=p_provider_id)
  group by b.provider_id,s.category_id,b.service_id,r.coarse_area_id;
  get diagnostics affected=row_count;
  -- Same hazard as `public.search_providers`. Nothing reaches this through the
  -- API today -- execute is revoked from every client role and the only caller
  -- is `private.run_marketplace_job`, which runs as the owner -- but an
  -- unqualified DELETE is a trap for whoever wires this to a request path next.
  delete from private.marketplace_pricing_benchmarks where true;
  insert into private.marketplace_pricing_benchmarks(level,category_id,service_id,coarse_area_id,sample_size,median_minor,p25_minor,p75_minor,as_of,policy_version)
  select 'category_area',category_id,null,coarse_area_id,sum(sample_size)::integer,
    percentile_cont(.5) within group(order by median_minor)::bigint,
    percentile_cont(.25) within group(order by median_minor)::bigint,
    percentile_cont(.75) within group(order by median_minor)::bigint,pg_catalog.now(),max(policy_version)
  from private.worker_pricing_profiles group by category_id,coarse_area_id;
  return affected;
end;
$function$;
