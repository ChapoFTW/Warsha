begin;
select no_plan();

-- WPS-020 — Search, Discovery, Personalization & Appearance.
--
-- Two questions this suite exists to answer, because both fail silently:
--   * can a caller reach a worker the discoverability gate hides, by any path?
--   * can a caller reach another account's history, by any path?

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text, 'role', 'authenticated', 'aal', 'aal1',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method','password','timestamp', floor(extract(epoch from now()))::bigint))
  )::text, true);
end $fn$;

create function pg_temp.act_as_nobody()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','',true);
end $fn$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','user_display_preferences','the appearance preference table exists');
select has_table('public','user_recent_searches','recent searches are durable and owned');
select has_table('public','user_recently_viewed_providers','recently viewed is durable and owned');
select has_column('public','provider_profiles','search_document','the search document is on the existing profile table');

select has_function('public','get_my_appearance_preference','the appearance read exists');
select has_function('public','set_my_appearance_preference',array['text'],'the appearance write exists');
select has_function('public','search_providers',array['text','jsonb','text','integer','integer'],'search exists');
select has_function('public','get_discovery_filters','filter metadata exists');
select has_function('public','get_search_suggestions','suggestions exist');
select has_function('public','record_search_query',array['text'],'recent search recording exists');
select has_function('public','clear_my_recent_searches','recent searches can be cleared');
select has_function('public','record_provider_view',array['uuid'],'view recording exists');
select has_function('public','get_my_recently_viewed','history read exists');
select has_function('public','clear_my_recently_viewed','history can be cleared');
select has_function('public','get_discovery_home',array['text'],'the discovery home exists');
select has_function('private','discovery_recommended_score',
  array['numeric','integer','numeric','numeric','numeric','numeric','numeric'],
  'the browse-time score helper is private');
select has_function('private','discovery_provider_card',array['provider_profiles','numeric'],
  'the safe public projection is private');

-- ---------------------------------------------------------------------------
-- Preservation: WPS-020 extends, it does not replace
-- ---------------------------------------------------------------------------
select has_function('public','get_marketplace_catalog','the catalog read is preserved');
select has_function('private','is_provider_publicly_discoverable',array['uuid'],
  'the discoverability gate is preserved');
select has_table('public','favourites','the existing favourites table is preserved');
select has_table('private','marketplace_candidate_scores','the WPS-008 ranking store is preserved');
select has_table('private','marketplace_configuration','the WPS-008 ranking policy is preserved');
select isnt(
  (select ranking_policy->>'version' from private.marketplace_configuration limit 1),
  null, 'the ranking policy still declares a version WPS-020 can read');

-- No second saved-provider store, and no second ranking store.
select is(
  (select count(*)::integer from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like '%favourite%'),
  1, 'exactly one favourites table exists');
select is(
  (select count(*)::integer from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and c.relname like '%candidate_score%'),
  1, 'exactly one candidate score table exists');

-- Every WPS-020 SECURITY DEFINER function pins an empty search path.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and p.proname in ('get_my_appearance_preference','set_my_appearance_preference',
       'search_providers','get_discovery_filters','get_search_suggestions',
       'record_search_query','clear_my_recent_searches','record_provider_view',
       'get_my_recently_viewed','clear_my_recently_viewed','get_discovery_home',
       'discovery_provider_card','trim_recent_searches','trim_recently_viewed')
     and not coalesce(p.proconfig::text like '%search_path=%', false)),
  0, 'every WPS-020 definer function pins a search path');

-- RLS on every new table, and still on every public table in the schema.
select is((select relrowsecurity from pg_class where oid='public.user_display_preferences'::regclass),
  true,'appearance preferences enforce RLS');
select is((select relrowsecurity from pg_class where oid='public.user_recent_searches'::regclass),
  true,'recent searches enforce RLS');
select is((select relrowsecurity from pg_class where oid='public.user_recently_viewed_providers'::regclass),
  true,'recently viewed enforces RLS');
select is(
  (select count(*)::integer from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table still has row level security enabled');

-- ---------------------------------------------------------------------------
-- Grants: minimal, and anonymous can browse but never write or read history
-- ---------------------------------------------------------------------------
select is(has_function_privilege('anon','public.search_providers(text,jsonb,text,integer,integer)','EXECUTE'),
  true,'anonymous may search: the marketplace is public');
select is(has_function_privilege('anon','public.get_discovery_filters()','EXECUTE'),
  true,'anonymous may read filter metadata');
select is(has_function_privilege('anon','public.get_discovery_home(text)','EXECUTE'),
  true,'anonymous may read the discovery home');
select is(has_function_privilege('anon','public.record_search_query(text)','EXECUTE'),
  false,'anonymous cannot record a search');
select is(has_function_privilege('anon','public.record_provider_view(uuid)','EXECUTE'),
  false,'anonymous cannot record a view');
select is(has_function_privilege('anon','public.get_my_recently_viewed()','EXECUTE'),
  false,'anonymous cannot read anyone history');
select is(has_function_privilege('anon','public.set_my_appearance_preference(text)','EXECUTE'),
  false,'anonymous cannot write an appearance preference');
select is(has_function_privilege('anon','public.get_my_appearance_preference()','EXECUTE'),
  false,'anonymous cannot read an appearance preference');
select is(has_table_privilege('anon','public.user_recent_searches','SELECT'),
  false,'anonymous has no table grant on recent searches');
select is(has_table_privilege('anon','public.user_recently_viewed_providers','SELECT'),
  false,'anonymous has no table grant on recently viewed');
select is(has_table_privilege('anon','public.user_display_preferences','SELECT'),
  false,'anonymous has no table grant on appearance preferences');
select is(has_function_privilege('authenticated','private.discovery_provider_card(public.provider_profiles,numeric)','EXECUTE'),
  false,'clients cannot invoke the projection directly');
select is(has_function_privilege('authenticated','private.discovery_recommended_score(numeric,integer,numeric,numeric,numeric,numeric,numeric)','EXECUTE'),
  false,'clients cannot invoke the score helper directly');

-- ---------------------------------------------------------------------------
-- Rate limit policies live on the WPS-018 limiter
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.rate_limit_policies
  where policy_key in ('discovery_search','discovery_recent_search_write',
                       'discovery_provider_view','discovery_preference_write')),
  4,'four WPS-020 surfaces are rate limited');
select is((select count(distinct enforced_by)::integer from private.rate_limit_policies
  where policy_key like 'discovery\_%'), 1,'all WPS-020 limits are enforced by one limiter');
select is((select enforced_by from private.rate_limit_policies where policy_key='discovery_search'),
  'wps018_limiter','search uses the WPS-018 limiter, not a new one');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000001','authenticated','authenticated','disc-one@test.local',null,'',now(),null,'{}','{"display_name":"Customer One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000002','authenticated','authenticated','disc-two@test.local',null,'',now(),null,'{}','{"display_name":"Customer Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000011','authenticated','authenticated',null,'+201000000911','',null,now(),'{}','{"display_name":"Visible Plumber"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000012','authenticated','authenticated',null,'+201000000912','',null,now(),'{}','{"display_name":"Draft Plumber"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000013','authenticated','authenticated',null,'+201000000913','',null,now(),'{}','{"display_name":"Unapproved Plumber"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000014','authenticated','authenticated',null,'+201000000914','',null,now(),'{}','{"display_name":"Second Visible Worker"}',now(),now());

insert into public.provider_profiles(
  id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,
  is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,
  rating_average,review_count,emergency_available,skill_certificate_verified,skills,specialties,
  languages,location_label,response_time_label,starting_price_egp)
values
('a0000000-0000-0000-0001-000000000011','a0000000-0000-0000-0000-000000000011','Visible Plumber','plumbing','plumbing',array['plumbing'],
 'Experienced plumber handling leaks, heaters and urgent repairs across Cairo.','a0000000-0000-0000-0000-000000000011/avatar/profile.jpg',
 true,true,true,'approved',50,40,4.8,20,true,true,array['leak repair','water heater'],array['emergency plumbing'],
 array['Arabic','English'],'Zamalek, Cairo','Within an hour',180),
('a0000000-0000-0000-0001-000000000012','a0000000-0000-0000-0000-000000000012','Draft Plumber','plumbing','plumbing',array['plumbing'],
 'Draft plumber profile that has not been published to the marketplace yet.','a0000000-0000-0000-0000-000000000012/avatar/profile.jpg',
 true,true,false,'approved',50,10,4.9,9,false,false,array['leak repair'],array[]::text[],
 array['Arabic'],'Zamalek, Cairo','Within a day',150),
('a0000000-0000-0000-0001-000000000013','a0000000-0000-0000-0000-000000000013','Unapproved Plumber','plumbing','plumbing',array['plumbing'],
 'Plumber whose identity verification has not yet been approved by review.','a0000000-0000-0000-0000-000000000013/avatar/profile.jpg',
 true,true,true,'approved',50,5,5.0,4,false,false,array['leak repair'],array[]::text[],
 array['Arabic'],'Zamalek, Cairo','Within a day',140),
('a0000000-0000-0000-0001-000000000014','a0000000-0000-0000-0000-000000000014','Second Visible Worker','electrical','electrical',array['electrical'],
 'Electrician covering wiring, lighting and switchboard faults across Giza.','a0000000-0000-0000-0000-000000000014/avatar/profile.jpg',
 true,false,true,'approved',40,0,0,0,false,false,array['wiring'],array['switchboards'],
 array['Arabic'],'Dokki, Giza','Within a day',220);

insert into public.user_roles(user_id,role) values
('a0000000-0000-0000-0000-000000000011','provider'),('a0000000-0000-0000-0000-000000000012','provider'),
('a0000000-0000-0000-0000-000000000013','provider'),('a0000000-0000-0000-0000-000000000014','provider')
on conflict do nothing;

-- The unapproved worker's verification is deliberately still pending.
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values
('a0000000-0000-0000-0001-000000000011','approved',1,now()),
('a0000000-0000-0000-0001-000000000012','approved',1,now()),
('a0000000-0000-0000-0001-000000000013','submitted',1,null),
('a0000000-0000-0000-0001-000000000014','approved',1,now());

insert into storage.objects(bucket_id,name) values
('profile-images','a0000000-0000-0000-0000-000000000011/avatar/profile.jpg'),
('profile-images','a0000000-0000-0000-0000-000000000012/avatar/profile.jpg'),
('profile-images','a0000000-0000-0000-0000-000000000013/avatar/profile.jpg'),
('profile-images','a0000000-0000-0000-0000-000000000014/avatar/profile.jpg');

insert into public.provider_service_areas(provider_id,governorate,district,latitude,longitude,radius_km) values
('a0000000-0000-0000-0001-000000000011','Cairo','Zamalek',30.0600,31.2200,50),
('a0000000-0000-0000-0001-000000000012','Cairo','Zamalek',30.0600,31.2200,50),
('a0000000-0000-0000-0001-000000000013','Cairo','Zamalek',30.0600,31.2200,50),
('a0000000-0000-0000-0001-000000000014','Giza','Dokki',30.0380,31.2100,40);

insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select p, s.id, 200, 'fixed', true
from (values
 ('a0000000-0000-0000-0001-000000000011'::uuid,'plumbing'),
 ('a0000000-0000-0000-0001-000000000012'::uuid,'plumbing'),
 ('a0000000-0000-0000-0001-000000000013'::uuid,'plumbing'),
 ('a0000000-0000-0000-0001-000000000014'::uuid,'electrical')
) v(p,cat)
join lateral (select id from public.services
  where category_id = v.cat and is_active and deleted_at is null order by id limit 1) s on true;

-- The gate decides who is reachable. WPS-020 restates none of it.
select is(private.is_provider_publicly_discoverable('a0000000-0000-0000-0001-000000000011'),
  true,'the complete published worker is discoverable');
select is(private.is_provider_publicly_discoverable('a0000000-0000-0000-0001-000000000012'),
  false,'an unpublished draft worker is not discoverable');
select is(private.is_provider_publicly_discoverable('a0000000-0000-0000-0001-000000000013'),
  false,'a worker without approved verification is not discoverable');

-- ---------------------------------------------------------------------------
-- Search: discoverability, filters, pagination, ordering
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');

select is((public.search_providers(null,'{}'::jsonb,'recommended',20,0)->>'mode'),
  'browse','an empty query is a browse, not a failed search');

select ok(
  (select count(*) from jsonb_array_elements(public.search_providers(null,'{}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000011') = 1,
  'the discoverable worker is returned by browse');
select is(
  (select count(*)::integer from jsonb_array_elements(public.search_providers(null,'{}'::jsonb,'recommended',50,0)->'results') r
   where r->>'id' in ('a0000000-0000-0000-0001-000000000012','a0000000-0000-0000-0001-000000000013')),
  0,'a draft worker and an unverified worker are excluded from every browse result');

select is((public.search_providers('plumber','{}'::jsonb,'recommended',20,0)->>'mode'),
  'exact','a matching query reports an exact search');
select ok(
  (select count(*) from jsonb_array_elements(public.search_providers('plumber','{}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000011') = 1,
  'the display name is searchable');
select ok(
  (select count(*) from jsonb_array_elements(public.search_providers('heater','{}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000011') = 1,
  'a declared skill is searchable');
select ok(
  (select count(*) from jsonb_array_elements(public.search_providers('switchboards','{}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000014') = 1,
  'a declared specialty is searchable');

select is((public.search_providers('zzzzqqqxxnothing','{}'::jsonb,'recommended',20,0)->>'mode'),
  'empty','a query with no match reports an explicit empty state');
select is((public.search_providers('zzzzqqqxxnothing','{}'::jsonb,'recommended',20,0)->>'totalCount'),
  '0','an empty search returns no results');

-- Spelling tolerance runs only after the exact pass finds nothing.
select is((public.search_providers('plumbr','{}'::jsonb,'recommended',20,0)->>'mode'),
  'approximate','a misspelled query falls back to a bounded approximate pass');
select is((public.search_providers('plumber','{}'::jsonb,'recommended',20,0)->>'mode'),
  'exact','a correctly spelled query is never diluted by the approximate pass');

-- Filters are applied by the server.
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"categoryId":"electrical"}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000011'),
  0,'a category filter excludes a worker in another category');
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"availableNow":true}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000014'),
  0,'the available-now filter excludes an unavailable worker');
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"skillCertificateVerified":true}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000014'),
  0,'the skill certificate filter excludes an unverified skill');
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"governorate":"Giza"}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000011'),
  0,'an area filter excludes a worker who does not serve that area');
select ok(
  (select count(*) from jsonb_array_elements(
    public.search_providers(null,'{"governorate":"Giza"}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000014') = 1,
  'an area filter keeps a worker who does serve that area');
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"minimumRating":4.9}'::jsonb,'recommended',20,0)->'results') r),
  0,'a rating floor no discoverable worker meets returns nothing');
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"emergencyAvailable":true}'::jsonb,'recommended',20,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000014'),
  0,'the emergency filter excludes a worker who does not offer it');

-- A filter cannot widen the gate.
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.search_providers(null,'{"minimumRating":0,"minimumCompletedJobs":0}'::jsonb,'recommended',50,0)->'results') r
   where r->>'id' = 'a0000000-0000-0000-0001-000000000012'),
  0,'no combination of permissive filters reveals a hidden worker');

-- Pagination is stable and the count describes the whole result set.
select is((public.search_providers(null,'{}'::jsonb,'recommended',1,0)->>'limit'),'1','the page size is honoured');
select ok((public.search_providers(null,'{}'::jsonb,'recommended',1,0)->>'totalCount')::integer >= 2,
  'the total counts every match, not the page');
select is((public.search_providers(null,'{}'::jsonb,'recommended',1,0)->>'hasMore'),'true',
  'a partial page reports that more exist');
select isnt(
  (public.search_providers(null,'{}'::jsonb,'recommended',1,0)->'results'->0->>'id'),
  (public.search_providers(null,'{}'::jsonb,'recommended',1,1)->'results'->0->>'id'),
  'page two does not repeat page one');
select is(
  (public.search_providers(null,'{}'::jsonb,'recommended',1,0)->'results'->0->>'id'),
  (public.search_providers(null,'{}'::jsonb,'recommended',1,0)->'results'->0->>'id'),
  'ordering is deterministic across identical calls');
select ok((public.search_providers(null,'{}'::jsonb,'recommended',500,0)->>'limit')::integer <= 50,
  'an oversized page request is clamped by the server');

-- Sorting.
select is((public.search_providers(null,'{}'::jsonb,'rating',20,0)->>'sort'),'rating','rating sorting is accepted');
select is((public.search_providers(null,'{}'::jsonb,'most_reviewed',20,0)->>'sort'),'most_reviewed','review-count sorting is accepted');
select is((public.search_providers(null,'{}'::jsonb,'availability',20,0)->>'sort'),'availability','availability sorting is accepted');
select throws_ok(
  $$select public.search_providers(null,'{}'::jsonb,'sponsored',20,0)$$,
  '22023','Unsupported sort','an unknown sort is refused rather than silently ignored');
select throws_ok(
  $$select public.search_providers(null,'{}'::jsonb,'distance',20,0)$$,
  '22023','Distance sorting requires a location',
  'distance sorting without a location is refused rather than answered badly');
select is((public.search_providers(null,'{"latitude":30.05,"longitude":31.23}'::jsonb,'distance',20,0)->>'sort'),
  'distance','distance sorting works once a location is supplied');

-- Recommendation comes from the WPS-008 policy, and browsing consumes no
-- marketplace opportunity.
select is((public.search_providers(null,'{}'::jsonb,'recommended',20,0)->>'rankingPolicyVersion'),
  'best-value-v1','browse recommendation reports the WPS-008 policy version it applied');
select is(has_table_privilege('authenticated','private.marketplace_candidate_scores','SELECT'),
  false,'the WPS-008 score store stays unreadable to clients');

-- ---------------------------------------------------------------------------
-- The public projection leaks nothing private
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.search_providers(null,'{}'::jsonb,'recommended',50,0)->'results') r,
   jsonb_object_keys(r) k
   where k in ('latitude','longitude','phone','email','userId','user_id',
               'nationalId','documentPath','verificationStatus','storagePath')),
  0,'no result carries a coordinate, a contact, a document, or an auth identifier');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.search_providers(null,'{"latitude":30.05,"longitude":31.23}'::jsonb,'recommended',50,0)->'results') r
   where (r->>'distanceKm') is not null
     and (r->>'distanceKm')::numeric <> pg_catalog.round((r->>'distanceKm')::numeric)),
  0,'distance is rounded to the kilometre, so it cannot be trilaterated');
select ok(
  (select count(*) from jsonb_array_elements(
     public.search_providers(null,'{}'::jsonb,'recommended',50,0)->'results') r
   where r ? 'areaLabel') > 0,
  'an area label is returned in place of geometry');

-- ---------------------------------------------------------------------------
-- Appearance preference
-- ---------------------------------------------------------------------------
select is(public.get_my_appearance_preference(), null,
  'an account with no stored preference reads as null, not as a guessed value');
select lives_ok($$select public.set_my_appearance_preference('light')$$,'light is accepted');
select is(public.get_my_appearance_preference(),'light','the stored preference reads back');
select lives_ok($$select public.set_my_appearance_preference('dark')$$,'dark is accepted');
select lives_ok($$select public.set_my_appearance_preference('system')$$,'system is accepted');
select is(public.get_my_appearance_preference(),'system',
  'system is stored as system, never as the resolved scheme');
select throws_ok(
  $$select public.set_my_appearance_preference('auto')$$,
  '22023','Unsupported appearance preference','an unknown appearance value is refused');
select throws_ok(
  $$select public.set_my_appearance_preference(null)$$,
  '22023','Unsupported appearance preference','a null appearance value is refused');
select is((select count(*)::integer from public.user_display_preferences
  where user_id='a0000000-0000-0000-0000-000000000001'),1,
  'repeated writes update one row rather than accumulating');

-- ---------------------------------------------------------------------------
-- Bounded, owned history
-- ---------------------------------------------------------------------------
select lives_ok($$select public.record_search_query('leaking tap')$$,'a search is recorded');
select lives_ok($$select public.record_search_query('Leaking   Tap')$$,'a repeat search is normalized, not duplicated');
select is((select count(*)::integer from public.user_recent_searches
  where user_id='a0000000-0000-0000-0000-000000000001'),1,
  'a repeated query updates the existing row instead of adding one');

do $$ begin
  for i in 1..15 loop perform public.record_search_query('query number ' || i); end loop;
end $$;
select is((select count(*)::integer from public.user_recent_searches
  where user_id='a0000000-0000-0000-0000-000000000001'),10,
  'recent search history is bounded at ten by the database, not by the client');

select lives_ok($$select public.record_provider_view('a0000000-0000-0000-0001-000000000011')$$,'a view is recorded');
select is((select count(*)::integer from public.user_recently_viewed_providers
  where user_id='a0000000-0000-0000-0000-000000000001'),1,'the view is stored once');
select lives_ok($$select public.record_provider_view('a0000000-0000-0000-0001-000000000011')$$,'a repeat view is idempotent');
select is((select count(*)::integer from public.user_recently_viewed_providers
  where user_id='a0000000-0000-0000-0000-000000000001'),1,'a repeat view refreshes rather than duplicates');
select ok(jsonb_array_length(public.get_my_recently_viewed()) = 1,'history reads back for its owner');

-- A hidden worker never enters history, and never comes back out of it.
select lives_ok($$select public.record_provider_view('a0000000-0000-0000-0001-000000000012')$$,
  'viewing a hidden worker is accepted silently');
select is((select count(*)::integer from public.user_recently_viewed_providers
  where user_id='a0000000-0000-0000-0000-000000000001'
    and provider_id='a0000000-0000-0000-0001-000000000012'),0,
  'a non-discoverable worker is never written to history');

-- ---------------------------------------------------------------------------
-- Cross-account denial
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select is(public.get_my_appearance_preference(), null,
  'a second account does not see the first account preference');
select is(jsonb_array_length(public.get_my_recently_viewed()), 0,
  'a second account does not see the first account history');
select is((select count(*)::integer from public.user_recent_searches),0,
  'RLS hides another account recent searches entirely');
select is((select count(*)::integer from public.user_recently_viewed_providers),0,
  'RLS hides another account view history entirely');
select is((select count(*)::integer from public.user_display_preferences),0,
  'RLS hides another account appearance preference entirely');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.get_search_suggestions()->'recentSearches')),
  0,'suggestions never surface another account searches');

-- Writing into another account is impossible even with a direct insert.
select throws_ok(
  $$insert into public.user_recent_searches(user_id,query,normalized_query)
    values('a0000000-0000-0000-0000-000000000001','stolen','stolen')$$,
  '42501',null,'a direct insert for another account is refused by RLS');
select throws_ok(
  $$insert into public.user_display_preferences(user_id,appearance)
    values('a0000000-0000-0000-0000-000000000001','dark')$$,
  '42501',null,'a direct preference insert for another account is refused by RLS');

-- Clearing is scoped to the caller.
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.clear_my_recent_searches()$$,'the owner can clear their searches');
select is((select count(*)::integer from public.user_recent_searches),0,'the owner searches are gone');
select lives_ok($$select public.clear_my_recently_viewed()$$,'the owner can clear their history');
select is((select count(*)::integer from public.user_recently_viewed_providers),0,'the owner history is gone');

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select pg_temp.act_as_nobody();
select ok((public.search_providers(null,'{}'::jsonb,'recommended',20,0)->>'totalCount')::integer >= 1,
  'anonymous browsing works: nobody is forced to sign in to look at a plumber');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.search_providers(null,'{}'::jsonb,'recommended',50,0)->'results') r
   where r->>'id' in ('a0000000-0000-0000-0001-000000000012','a0000000-0000-0000-0001-000000000013')),
  0,'anonymous browsing cannot reach a hidden worker either');
select is(jsonb_array_length(public.get_search_suggestions()->'recentSearches'),0,
  'anonymous suggestions carry no history');
select is(jsonb_array_length(public.get_discovery_home(null)->'favourites'),0,
  'the anonymous discovery home carries no favourites');
select is((public.get_discovery_home(null)->>'personalized'),'false',
  'the anonymous discovery home says plainly that it is not personalized');
select throws_ok($$select public.get_my_recently_viewed()$$,'42501',null,
  'anonymous history reads are refused at the grant');
select throws_ok($$select public.record_search_query('anything')$$,'42501',null,
  'anonymous search recording is refused at the grant');
select throws_ok($$select public.set_my_appearance_preference('dark')$$,'42501',null,
  'anonymous preference writes are refused at the grant');
select throws_ok($$select public.record_provider_view('a0000000-0000-0000-0001-000000000011')$$,'42501',null,
  'anonymous view recording is refused at the grant');

-- ---------------------------------------------------------------------------
-- Filter metadata only offers what the server can answer
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from jsonb_array_elements_text(public.get_discovery_filters()->'governorates') g
   where g = 'Cairo'), 1, 'an area with a discoverable worker is offered');
select is((public.get_discovery_filters()->>'distanceRequiresLocation'),'true',
  'the client is told that distance needs a location rather than deciding for itself');
select is(jsonb_array_length(public.get_discovery_filters()->'sorts'),5,
  'exactly five sorts are offered; response time has no numeric source and is not offered');
select is(
  (select count(*)::integer from jsonb_array_elements_text(public.get_discovery_filters()->'sorts') s
   where s = 'response_time'), 0,
  'response time is not offered, because provider_profiles stores only a label');

-- Suggestions are derived from real catalog facts, and never called popular.
select ok(public.get_search_suggestions() ? 'commonServices',
  'suggestions expose common services');
select is((select count(*)::integer from jsonb_object_keys(public.get_search_suggestions()) k
  where k like '%opular%'), 0,
  'no suggestion field claims popularity: Warsha has no traffic data to support it');

-- ---------------------------------------------------------------------------
-- Nothing was enabled, and no external provider was selected
-- ---------------------------------------------------------------------------
reset role;
select is((select count(*)::integer from private.marketplace_candidate_scores),
  0,'browsing writes no matching-run score: browsing consumes no marketplace opportunity');
select is((select enabled from private.marketplace_configuration limit 1),true,
  'the later request-readiness migration enables the marketplace independently of WPS-020');
select is((select count(*)::integer from private.staff_feature_flags where enabled),0,
  'WPS-020 enables no feature flag');
select is((select count(*)::integer from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and tablename in ('user_display_preferences','user_recent_searches','user_recently_viewed_providers')),
  0,'no WPS-020 table is broadcast over Realtime');

-- Analytics uses the WPS-018 authority and never records the query text.
select is((select count(*)::integer from private.operational_log_events
  where event_key = 'discovery.search_recorded'
    and safe_detail::text ilike '%leaking%'),
  0,'no recorded search text reaches the analytics log');
select ok((select count(*) from private.operational_log_events
  where event_key = 'discovery.search_recorded') > 0,
  'the search event itself is recorded through the existing observability authority');

-- ---------------------------------------------------------------------------
-- The fixture must be able to be found
-- ---------------------------------------------------------------------------
-- Every one of the twenty original seeded providers failed
-- `is_provider_publicly_discoverable`, and failed at the first join: `user_id`
-- was null. So local discovery returned an empty list to every query, and an
-- empty list is indistinguishable from a broken one. That is precisely how
-- `search_providers` raised on every call for as long as it did -- nobody had
-- ever seen it return a provider.
--
-- `supabase/seed-discovery-fixture.sql` builds providers that genuinely satisfy
-- the eligibility rules, and providers that genuinely do not. The rules
-- themselves are untouched: this asserts the fixture, never the predicate.

select cmp_ok(
  (select count(*) from public.provider_profiles
   where private.is_provider_publicly_discoverable(id)),
  '>=', 1::bigint,
  'THE SEEDED FIXTURE PRODUCES AT LEAST ONE DISCOVERABLE PROVIDER'
);

select cmp_ok(
  (select count(*) from public.provider_profiles p
   where p.id::text like 'd2000000%' and not private.is_provider_publicly_discoverable(p.id)),
  '>=', 2::bigint,
  'and providers that must be excluded are present to prove exclusion'
);

-- Distance work needs coordinates, and none of the original service areas had
-- any, so radius filtering and nearest sorting could not be exercised at all.
select cmp_ok(
  (select count(*) from public.provider_service_areas a
   join public.provider_profiles p on p.id = a.provider_id
   where a.latitude is not null and a.longitude is not null
     and private.is_provider_publicly_discoverable(p.id)),
  '>=', 2::bigint,
  'AND A DISCOVERABLE PROVIDER CARRIES COORDINATES, SO DISTANCE IS TESTABLE'
);

select * from finish();
rollback;
