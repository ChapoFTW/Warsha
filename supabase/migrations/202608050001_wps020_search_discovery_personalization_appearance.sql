-- =========================================================================
-- WPS-020 — Search, Discovery, Personalization & Appearance
--
-- Extends. Replaces nothing.
--
--   * `private.is_provider_publicly_discoverable` stays the single
--     discoverability authority. Every read path below calls it; none restates
--     any part of it.
--   * `public.get_marketplace_catalog()` is untouched and remains the catalog
--     read. Search is added beside it, not in place of it.
--   * `public.favourites` is untouched. No second saved-provider store exists.
--   * The WPS-008 `best-value-v1` ranking policy remains the only ranking
--     authority. Browse-time recommendation reads its weights and bounds from
--     `private.marketplace_configuration` and writes no matching-run row.
--   * Analytics uses `private.record_operational_event` (WPS-018). No second
--     event pipeline, no external analytics provider.
--   * Rate limiting uses the WPS-018 limiter. No second limiter.
--
-- Contains no advertising, no paid placement, no behavioural profiling, and no
-- AI of any kind. Search is Postgres full-text with a bounded trigram fallback;
-- recommendation is an application of a published policy over declared data.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Account preferences
-- -------------------------------------------------------------------------
--
-- Appearance is stored so it can follow an account across devices. It is
-- deliberately NOT required for the feature to work: the device-local value is
-- authoritative at startup, because the first frame is painted long before any
-- session exists. See `docs/decisions/appearance-preference-storage.md`.

create table if not exists public.user_display_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  appearance text not null default 'system',
  updated_at timestamptz not null default pg_catalog.now(),
  constraint user_display_preferences_appearance_check
    check (appearance in ('system','light','dark'))
);

-- -------------------------------------------------------------------------
-- 2. Bounded personal history
-- -------------------------------------------------------------------------
--
-- Both tables are private browsing history. They are readable only by their
-- owner, never by staff, never by another customer, and never by the worker who
-- was viewed. Neither feeds ranking: a search or a view changes what YOU are
-- shown next, and changes nothing about who is shown to anyone else.

create table if not exists public.user_recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  normalized_query text not null,
  searched_at timestamptz not null default pg_catalog.now(),
  constraint user_recent_searches_query_length check (pg_catalog.length(query) between 1 and 100),
  constraint user_recent_searches_unique unique (user_id, normalized_query)
);
create index if not exists user_recent_searches_owner_idx
  on public.user_recent_searches(user_id, searched_at desc);

create table if not exists public.user_recently_viewed_providers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  viewed_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, provider_id)
);
create index if not exists user_recently_viewed_owner_idx
  on public.user_recently_viewed_providers(user_id, viewed_at desc);

-- History is bounded in the database rather than in the client, because a
-- client that stops trimming is a client that quietly accumulates a profile.
create or replace function private.trim_recent_searches()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.user_recent_searches r
  where r.user_id = new.user_id
    and r.id not in (
      select id from public.user_recent_searches
      where user_id = new.user_id order by searched_at desc limit 10
    );
  return null;
end;
$$;
drop trigger if exists user_recent_searches_bound on public.user_recent_searches;
create trigger user_recent_searches_bound
  after insert on public.user_recent_searches
  for each row execute function private.trim_recent_searches();

create or replace function private.trim_recently_viewed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.user_recently_viewed_providers v
  where v.user_id = new.user_id
    and v.provider_id not in (
      select provider_id from public.user_recently_viewed_providers
      where user_id = new.user_id order by viewed_at desc limit 20
    );
  return null;
end;
$$;
drop trigger if exists user_recently_viewed_bound on public.user_recently_viewed_providers;
create trigger user_recently_viewed_bound
  after insert or update on public.user_recently_viewed_providers
  for each row execute function private.trim_recently_viewed();

-- -------------------------------------------------------------------------
-- 3. Search document
-- -------------------------------------------------------------------------
--
-- `simple` for both locales, for the reason WPS-019 recorded: Postgres ships no
-- Arabic stemmer, and stemming only English would make relevance asymmetric
-- between the two languages Warsha treats as equals.
--
-- The document holds only what a worker publishes about their work. It carries
-- no contact detail, no document, no coordinate, and no verification record.
--
-- Only scalar columns are in the generated expression. `array_to_string` is
-- STABLE rather than IMMUTABLE, and a generated column permits neither that nor
-- a subquery — so skills and specialties are matched by their own GIN indexes
-- alongside this document instead of being folded into it. That is a real
-- constraint honoured, not a shortcut: marking a wrapper `immutable` to get
-- around it would be a lie the planner is entitled to believe.

alter table public.provider_profiles
  add column if not exists search_document tsvector
  generated always as (
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(display_name,'')), 'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(profession_key,'')), 'B')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
         coalesce(about,'') || ' ' || coalesce(location_label,'')), 'C')
  ) stored;

create index if not exists provider_profiles_search_document_idx
  on public.provider_profiles using gin (search_document);
create index if not exists provider_profiles_display_name_trgm_idx
  on public.provider_profiles using gin (display_name extensions.gin_trgm_ops);
create index if not exists provider_profiles_skills_idx
  on public.provider_profiles using gin (skills);
create index if not exists provider_profiles_specialties_idx
  on public.provider_profiles using gin (specialties);
create index if not exists provider_service_areas_governorate_idx
  on public.provider_service_areas(governorate);

-- -------------------------------------------------------------------------
-- 4. Rate limits (WPS-018 limiter — no second limiter is created)
-- -------------------------------------------------------------------------

insert into private.rate_limit_policies(policy_key, surface, scope, max_events, window_seconds, enforced_by, notes) values
  ('discovery_search','Provider search','account',120,300,'wps018_limiter',
   'Enforced by the WPS-018 limiter. Search is read-only but enumerable, so it is bounded.'),
  ('discovery_recent_search_write','Recent search recording','account',200,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter; history is also capped at 10 rows by trigger.'),
  ('discovery_provider_view','Recently viewed recording','account',300,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter; history is also capped at 20 rows by trigger.'),
  ('discovery_preference_write','Appearance preference writes','account',60,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter. The local device store is the authority; this is sync only.')
on conflict (policy_key) do nothing;

-- -------------------------------------------------------------------------
-- 5. Browse-time recommendation
-- -------------------------------------------------------------------------
--
-- This is an APPLICATION of WPS-008's `best-value-v1`, not a new formula. The
-- quality weights (0.45 rating, 0.20 experience with logarithmic confidence),
-- the distance weight (0.27), the fairness bound and the new-worker bound are
-- the published policy's own numbers, and the bounds are read from
-- `private.marketplace_configuration` at call time rather than copied.
--
-- Two honest deviations, recorded here and in WPS-020 §Sorting:
--   * There is no request, so there is no capacity, ETA, or emergency term.
--   * When the caller has given no location, the distance term is simply absent
--     and the remaining weights are NOT renormalized. An unlocated browse
--     cannot earn a distance score, which is truthful and inflates nobody.
--
-- It writes no `private.marketplace_candidate_scores` row and starts no
-- matching run. Browsing does not consume marketplace opportunity.

create or replace function private.discovery_recommended_score(
  p_rating numeric, p_completed_jobs integer,
  p_distance_km numeric, p_radius_km numeric,
  p_fairness numeric, p_fairness_bound numeric, p_new_worker_bound numeric)
returns numeric
language sql
immutable
set search_path=''
as $$
  select pg_catalog.round((
    least(1::numeric, coalesce(p_rating,0) / 5) * 0.45
    + least(1::numeric, pg_catalog.ln(coalesce(p_completed_jobs,0) + 1) / pg_catalog.ln(101)) * 0.20
    + case
        when p_distance_km is null or p_radius_km is null or p_radius_km = 0 then 0
        else greatest(0::numeric, 1 - p_distance_km / p_radius_km) * 0.27
      end
    + greatest(-p_fairness_bound, least(p_fairness_bound, coalesce(p_fairness, 0)))
    + case when coalesce(p_completed_jobs,0) = 0 then p_new_worker_bound else 0 end
  )::numeric, 6)
$$;
revoke all on function private.discovery_recommended_score(numeric,integer,numeric,numeric,numeric,numeric,numeric)
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 6. Safe public projection
-- -------------------------------------------------------------------------
--
-- The single place a worker becomes a search result. It exposes what a customer
-- needs to choose, and nothing else: no phone, no email, no address, no
-- coordinate, no verification document, no certificate file, no internal id
-- beyond the provider id the profile route already uses.

create or replace function private.discovery_provider_card(
  p_provider public.provider_profiles, p_distance_km numeric default null)
returns jsonb
language sql
stable
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_provider.id,
    'displayName', p_provider.display_name,
    'professionKey', p_provider.profession_key,
    'primaryCategoryId', p_provider.primary_category_id,
    'ratingAverage', p_provider.rating_average,
    'reviewCount', p_provider.review_count,
    'completedJobs', p_provider.completed_jobs,
    'experienceYears', p_provider.experience_years,
    'startingPriceEgp', p_provider.starting_price_egp,
    'avatarRef', p_provider.avatar_url,
    'identityVerified', true,
    'skillCertificateVerified', p_provider.skill_certificate_verified,
    'professionalCertificateVerified', exists (
      select 1 from public.provider_certifications cert
      where cert.provider_id = p_provider.id and cert.status = 'approved'
        and cert.deleted_at is null
        and (cert.expires_at is null or cert.expires_at >= current_date)),
    'isAvailable', p_provider.is_available,
    'emergencyAvailable', p_provider.emergency_available,
    'responseTimeLabel', p_provider.response_time_label,
    -- Area LABEL only. The service area's latitude and longitude never leave
    -- the database in any WPS-020 path.
    'areaLabel', coalesce((
      select pg_catalog.concat_ws(', ', a.district, a.governorate)
      from public.provider_service_areas a
      where a.provider_id = p_provider.id order by a.id limit 1), p_provider.location_label),
    'languages', pg_catalog.to_jsonb(p_provider.languages),
    'specialties', pg_catalog.to_jsonb(p_provider.specialties),
    -- Rounded to the kilometre, and only ever a distance FROM the caller. A
    -- rounded scalar cannot be trilaterated back to a home address.
    'distanceKm', case when p_distance_km is null then null else pg_catalog.round(p_distance_km) end
  )
$$;
revoke all on function private.discovery_provider_card(public.provider_profiles, numeric)
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 7. Appearance preference API
-- -------------------------------------------------------------------------

create or replace function public.get_my_appearance_preference()
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_value text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select appearance into v_value from public.user_display_preferences where user_id = v_uid;
  return v_value;
end;
$$;

create or replace function public.set_my_appearance_preference(p_appearance text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_appearance is null or p_appearance not in ('system','light','dark') then
    raise exception 'Unsupported appearance preference' using errcode='22023';
  end if;
  perform private.enforce_rate_limit('discovery_preference_write');
  insert into public.user_display_preferences(user_id, appearance, updated_at)
  values (v_uid, p_appearance, pg_catalog.now())
  on conflict (user_id) do update
    set appearance = excluded.appearance, updated_at = pg_catalog.now();
end;
$$;

-- -------------------------------------------------------------------------
-- 8. Search
-- -------------------------------------------------------------------------
--
-- Server-authoritative in every respect that matters:
--   * Discoverability is the existing gate. A caller cannot widen it.
--   * Every filter is applied here. The client's filter state is a request,
--     never a decision.
--   * Results are paginated with a stable total, so a count shown next to a
--     page is a count of the whole result set and not of the page.
--   * Ordering is fully specified down to `p.id`, so page 2 cannot repeat or
--     skip a row that page 1 already showed.

create or replace function public.search_providers(
  p_query text default null,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'recommended',
  p_limit integer default 20,
  p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
  delete from discovery_matches;

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
$$;

-- -------------------------------------------------------------------------
-- 9. Filter metadata
-- -------------------------------------------------------------------------
--
-- The client renders only what this returns, so a filter can never be offered
-- that the server cannot answer.

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
      ) order by c.sort_order, c.id)
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

-- -------------------------------------------------------------------------
-- 10. Suggestions
-- -------------------------------------------------------------------------
--
-- There is no popularity data in Warsha, because there is no traffic yet. This
-- returns COMMON services — ranked by how many discoverable workers offer them,
-- which is a real and authoritative fact — and says so in the field name. It
-- does not invent a popularity signal, and the client must not label it one.

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
      select pg_catalog.jsonb_agg(entry order by entry->>'translationKey')
      from (
        select pg_catalog.jsonb_build_object(
          'id', c.id, 'translationKey', c.translation_key, 'iconName', c.icon_name) as entry
        from public.service_categories c
        where c.is_active and c.deleted_at is null
          and exists (select 1 from public.provider_profiles p
            where p.primary_category_id = c.id and private.is_provider_publicly_discoverable(p.id))
        order by c.sort_order, c.id limit 8
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

-- -------------------------------------------------------------------------
-- 11. Personal history API
-- -------------------------------------------------------------------------

create or replace function public.record_search_query(p_query text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_normalized text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(v_query) = 0 then return; end if;
  v_query := pg_catalog.left(v_query, 100);
  v_normalized := pg_catalog.lower(pg_catalog.regexp_replace(v_query, '\s+', ' ', 'g'));
  perform private.enforce_rate_limit('discovery_recent_search_write');
  insert into public.user_recent_searches(user_id, query, normalized_query)
  values (v_uid, v_query, v_normalized)
  on conflict (user_id, normalized_query) do update
    set query = excluded.query, searched_at = pg_catalog.now();
  -- Analytics carries the SHAPE of the search and never its text: a query can
  -- contain a street, a surname, or a description of a private problem.
  perform private.record_operational_event('client','discovery.search_recorded','info',
    pg_catalog.jsonb_build_object('queryLength', pg_catalog.length(v_query)), 'customer');
end;
$$;

create or replace function public.clear_my_recent_searches()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  delete from public.user_recent_searches where user_id = v_uid;
end;
$$;

create or replace function public.record_provider_view(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- A worker who is not publicly discoverable is not recorded as viewed, so
  -- history can never become a back door into a hidden profile.
  if not private.is_provider_publicly_discoverable(p_provider_id) then return; end if;
  perform private.enforce_rate_limit('discovery_provider_view');
  insert into public.user_recently_viewed_providers(user_id, provider_id, viewed_at)
  values (v_uid, p_provider_id, pg_catalog.now())
  on conflict (user_id, provider_id) do update set viewed_at = pg_catalog.now();
end;
$$;

create or replace function public.get_my_recently_viewed()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(private.discovery_provider_card(p, null) order by v.viewed_at desc)
    from public.user_recently_viewed_providers v
    join public.provider_profiles p on p.id = v.provider_id
    where v.user_id = v_uid
      -- Re-checked at read time. A worker who has since been hidden disappears
      -- from history rather than lingering as a stale card.
      and private.is_provider_publicly_discoverable(p.id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.clear_my_recently_viewed()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  delete from public.user_recently_viewed_providers where user_id = v_uid;
end;
$$;

-- -------------------------------------------------------------------------
-- 12. Discovery home
-- -------------------------------------------------------------------------
--
-- Every section answers one question a person actually has. There is no
-- engagement section, no infinite feed, and no sponsored slot — none is
-- possible, because nothing here reads a payment, a bid, or a staff override.

create or replace function public.get_discovery_home(p_governorate text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_area text := nullif(pg_catalog.btrim(coalesce(p_governorate,'')), '');
begin
  return pg_catalog.jsonb_build_object(
    'personalized', v_uid is not null,
    -- "Who is available near you?"
    'availableNearby', coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p, null)
        order by p.rating_average desc, p.id)
      from public.provider_profiles p
      where private.is_provider_publicly_discoverable(p.id)
        and p.is_available
        and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
        and (v_area is null or exists (
          select 1 from public.provider_service_areas a
          where a.provider_id = p.id and a.governorate = v_area))
      limit 8
    ), '[]'::jsonb),
    -- "Who has a proven record?" — declared, verifiable facts only.
    'trustedWorkers', coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p, null)
        order by p.completed_jobs desc, p.rating_average desc, p.id)
      from public.provider_profiles p
      where private.is_provider_publicly_discoverable(p.id)
        and p.skill_certificate_verified and p.completed_jobs > 0
      limit 8
    ), '[]'::jsonb),
    -- "Workers you saved." Reuses public.favourites; no second store.
    'favourites', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p, null) order by f.created_at desc)
      from public.favourites f
      join public.provider_profiles p on p.id = f.provider_id
      where f.customer_id = v_uid and private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb) end,
    -- "Continue where you left off."
    'recentlyViewed', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p, null) order by v.viewed_at desc)
      from public.user_recently_viewed_providers v
      join public.provider_profiles p on p.id = v.provider_id
      where v.user_id = v_uid and private.is_provider_publicly_discoverable(p.id)
      limit 8
    ), '[]'::jsonb) end
  );
end;
$$;

-- -------------------------------------------------------------------------
-- 13. RLS
-- -------------------------------------------------------------------------

alter table public.user_display_preferences enable row level security;
alter table public.user_recent_searches enable row level security;
alter table public.user_recently_viewed_providers enable row level security;

drop policy if exists user_display_preferences_own on public.user_display_preferences;
create policy user_display_preferences_own on public.user_display_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_recent_searches_own on public.user_recent_searches;
create policy user_recent_searches_own on public.user_recent_searches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_recently_viewed_own on public.user_recently_viewed_providers;
create policy user_recently_viewed_own on public.user_recently_viewed_providers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------
-- 14. Grants
-- -------------------------------------------------------------------------
--
-- `anon` may browse and search — the marketplace is public and forcing a sign-in
-- to look at a plumber would be hostile. `anon` may write nothing and may read
-- nobody's history, because those RPCs raise before they touch a table and the
-- grant is withheld regardless.

revoke all on public.user_display_preferences from public, anon, authenticated;
revoke all on public.user_recent_searches from public, anon, authenticated;
revoke all on public.user_recently_viewed_providers from public, anon, authenticated;
grant select, insert, update, delete on public.user_display_preferences to authenticated;
grant select, insert, update, delete on public.user_recent_searches to authenticated;
grant select, insert, update, delete on public.user_recently_viewed_providers to authenticated;

revoke all on function public.get_my_appearance_preference() from public, anon, authenticated;
revoke all on function public.set_my_appearance_preference(text) from public, anon, authenticated;
revoke all on function public.search_providers(text,jsonb,text,integer,integer) from public, anon, authenticated;
revoke all on function public.get_discovery_filters() from public, anon, authenticated;
revoke all on function public.get_search_suggestions() from public, anon, authenticated;
revoke all on function public.record_search_query(text) from public, anon, authenticated;
revoke all on function public.clear_my_recent_searches() from public, anon, authenticated;
revoke all on function public.record_provider_view(uuid) from public, anon, authenticated;
revoke all on function public.get_my_recently_viewed() from public, anon, authenticated;
revoke all on function public.clear_my_recently_viewed() from public, anon, authenticated;
revoke all on function public.get_discovery_home(text) from public, anon, authenticated;
revoke all on function private.trim_recent_searches() from public, anon, authenticated;
revoke all on function private.trim_recently_viewed() from public, anon, authenticated;

grant execute on function public.get_my_appearance_preference() to authenticated;
grant execute on function public.set_my_appearance_preference(text) to authenticated;
grant execute on function public.search_providers(text,jsonb,text,integer,integer) to anon, authenticated;
grant execute on function public.get_discovery_filters() to anon, authenticated;
grant execute on function public.get_search_suggestions() to anon, authenticated;
grant execute on function public.record_search_query(text) to authenticated;
grant execute on function public.clear_my_recent_searches() to authenticated;
grant execute on function public.record_provider_view(uuid) to authenticated;
grant execute on function public.get_my_recently_viewed() to authenticated;
grant execute on function public.clear_my_recently_viewed() to authenticated;
grant execute on function public.get_discovery_home(text) to anon, authenticated;
