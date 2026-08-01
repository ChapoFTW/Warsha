begin;

select plan(77);
select set_config('storage.allow_delete_query', 'true', true);

select has_table('public','provider_portfolio_images','multi-image portfolio table exists'); -- 1
select has_column('public','provider_profiles','experience_summary','short experience summary exists'); -- 2
select has_column('public','provider_profiles','specialties','self-declared specialties exist'); -- 3
select has_column('public','provider_certifications','status','certificate workflow status exists'); -- 4
select is((select relrowsecurity from pg_catalog.pg_class where oid='public.provider_portfolio_images'::regclass),true,'portfolio images use RLS'); -- 5
select is((select public from storage.buckets where id='profile-images'),false,'profile photo bucket is private'); -- 6
select is((select public from storage.buckets where id='provider-portfolios'),false,'portfolio bucket is private'); -- 7
select is((select public from storage.buckets where id='provider-certificates'),false,'certificate bucket is private'); -- 8
select is((select file_size_limit from storage.buckets where id='profile-images'),5242880::bigint,'profile photo limit is 5 MB'); -- 9
select is((select file_size_limit from storage.buckets where id='provider-portfolios'),8388608::bigint,'portfolio image limit is 8 MB'); -- 10
select is((select file_size_limit from storage.buckets where id='provider-certificates'),8388608::bigint,'certificate document limit is 8 MB'); -- 11
select is((select allowed_mime_types from storage.buckets where id='profile-images'),array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[],'profile MIME list is exact'); -- 12
select is((select allowed_mime_types from storage.buckets where id='provider-portfolios'),array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[],'portfolio MIME list is exact'); -- 13
select is((select allowed_mime_types from storage.buckets where id='provider-certificates'),array['application/pdf','image/jpeg','image/png']::text[],'certificate MIME list is exact'); -- 14
select has_function('public','get_my_worker_profile',array[]::text[],'owner profile RPC exists'); -- 15
select has_function('public','set_my_provider_profile_photo',array['text','text'],'safe photo swap RPC exists'); -- 16
select has_function('public','get_my_provider_portfolio',array[]::text[],'owner portfolio RPC exists'); -- 17
select has_function('public','save_my_provider_portfolio_item',array['jsonb'],'portfolio save RPC exists'); -- 18
select has_function('public','register_my_provider_portfolio_image',array['uuid','text','text','bigint','text'],'portfolio image registration RPC exists'); -- 19
select has_function('public','reorder_my_provider_portfolio',array['uuid[]'],'portfolio reorder RPC exists'); -- 20
select has_function('public','get_my_provider_certificates',array[]::text[],'owner certificate RPC exists'); -- 21
select has_function('public','save_my_provider_certificate',array['jsonb'],'certificate save RPC exists'); -- 22
select has_function('public','register_my_provider_certificate_document',array['uuid','text','text','bigint','text'],'certificate registration RPC exists'); -- 23
select has_function('public','submit_my_provider_certificate',array['uuid'],'certificate submission RPC exists'); -- 24
select has_function('public','review_provider_certificate',array['uuid','text','text','date'],'staff certificate review RPC exists'); -- 25
select is(has_function_privilege('anon','public.get_my_worker_profile()','EXECUTE'),false,'anonymous cannot call owner profile RPC'); -- 26
select is(has_function_privilege('authenticated','public.get_my_worker_profile()','EXECUTE'),true,'worker can call owner profile RPC'); -- 27
select is(has_function_privilege('anon','public.review_provider_certificate(uuid,text,text,date)','EXECUTE'),false,'anonymous cannot review certificates'); -- 28
select is(has_table_privilege('authenticated','public.provider_certifications','SELECT'),true,'authenticated owner can read certificate rows through RLS'); -- 29
select is(has_table_privilege('anon','public.provider_certifications','SELECT'),false,'anonymous cannot read certificate metadata'); -- 30
select is(has_table_privilege('anon','public.provider_service_areas','SELECT'),false,'anonymous cannot read exact service-area rows'); -- 31
select is(has_table_privilege('anon','public.provider_portfolio_images','SELECT'),false,'anonymous cannot read raw portfolio paths'); -- 32
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='provider_certifications'),0,'certificate review reasons are not published'); -- 33
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='provider_portfolio_images'),0,'private portfolio paths are not published'); -- 34
select is(has_function_privilege('anon','private.is_public_portfolio_image(text)','EXECUTE'),true,'authorized portfolio signing policy can evaluate its helper'); -- 35

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a5100000-0000-4000-8000-000000000001','authenticated','authenticated',null,'+201000001001','',null,now(),'{}','{"display_name":"Worker Alpha"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a5100000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000001002','',null,now(),'{}','{"display_name":"Worker Beta"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a5100000-0000-4000-8000-000000000003','authenticated','authenticated','wps010-customer@test.local',null,'',now(),null,'{}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a5100000-0000-4000-8000-000000000004','authenticated','authenticated','wps010-staff@test.local',null,'',now(),null,'{}','{"display_name":"Staff"}',now(),now());
insert into public.user_roles(user_id,role) values ('a5100000-0000-4000-8000-000000000004','admin') on conflict do nothing;

insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,experience_summary,specialties,avatar_url,service_radius_km,is_verified,is_available,is_published,onboarding_status)
values
('a5200000-0000-4000-8000-000000000001','a5100000-0000-4000-8000-000000000001','Worker Alpha','plumbing','plumbing',array['plumbing'],'I repair home plumbing carefully and explain every step.',8,'Eight years working on home plumbing repairs.',array['Leak repair','Water heaters'],'a5100000-0000-4000-8000-000000000001/avatar/profile.jpg',15,true,true,false,'approved'),
('a5200000-0000-4000-8000-000000000002','a5100000-0000-4000-8000-000000000002','Worker Beta','plumbing','plumbing',array['plumbing'],'Short draft profile.',2,'',array[]::text[],null,15,false,false,false,'draft');
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values
('a5200000-0000-4000-8000-000000000001','approved',1,now()),
('a5200000-0000-4000-8000-000000000002','draft',0,null);
insert into public.provider_services(provider_id,service_id,is_active)
select provider_id,s.id,true from (values
('a5200000-0000-4000-8000-000000000001'::uuid),
('a5200000-0000-4000-8000-000000000002'::uuid)
) p(provider_id) cross join lateral (select id from public.services where category_id='plumbing' order by id limit 1) s;
insert into public.provider_service_areas(provider_id,governorate,district,latitude,longitude,radius_km) values
('a5200000-0000-4000-8000-000000000001','Cairo','Maadi',30.01,31.20,15),
('a5200000-0000-4000-8000-000000000002','Giza','Dokki',30.04,31.19,10);
insert into storage.objects(bucket_id,name,metadata) values
('profile-images','a5100000-0000-4000-8000-000000000001/avatar/profile.jpg','{"mimetype":"image/jpeg","size":1024}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub','a5100000-0000-4000-8000-000000000001',true);
select is(public.get_my_worker_profile()->>'displayName','Worker Alpha','worker reads own draft-capable profile projection'); -- 36
select is((select count(*)::integer from public.provider_services where provider_id='a5200000-0000-4000-8000-000000000001'),1,'worker reads own services'); -- 37
select is((select count(*)::integer from public.provider_service_areas where provider_id='a5200000-0000-4000-8000-000000000001'),1,'worker reads own service areas'); -- 38
select lives_ok($$select public.save_my_provider_portfolio_item('{"title":"Bathroom pipe repair","description":"Replaced a damaged pipe without exposing customer details.","completedPeriod":"2026-07","status":"draft"}'::jsonb)$$,'worker creates owned portfolio metadata'); -- 39
select set_config('warsha_test.portfolio_item',(select id::text from public.provider_portfolio where provider_id='a5200000-0000-4000-8000-000000000001' and deleted_at is null limit 1),true);
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values('provider-portfolios','a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.portfolio_item')||'/work-one.jpg','{"mimetype":"image/jpeg","size":2048}'::jsonb)$$,'worker uploads owned portfolio object'); -- 40
select lives_ok($$select public.register_my_provider_portfolio_image(current_setting('warsha_test.portfolio_item')::uuid,'a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.portfolio_item')||'/work-one.jpg','image/jpeg',2048,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,'worker registers portfolio image'); -- 41
select is((select count(*)::integer from public.provider_portfolio where provider_id='a5200000-0000-4000-8000-000000000001'),1,'worker reads owned portfolio metadata'); -- 42
select lives_ok($$select public.save_my_provider_certificate('{"type":"professional","title":"Home plumbing safety","issuer":"Training Center"}'::jsonb)$$,'worker creates certificate metadata'); -- 43
select set_config('warsha_test.certificate',(select id::text from public.provider_certifications where provider_id='a5200000-0000-4000-8000-000000000001' limit 1),true);
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values('provider-certificates','a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.certificate')||'/certificate.pdf','{"mimetype":"application/pdf","size":4096}'::jsonb)$$,'worker uploads private certificate object'); -- 44
select lives_ok($$select public.register_my_provider_certificate_document(current_setting('warsha_test.certificate')::uuid,'a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.certificate')||'/certificate.pdf','application/pdf',4096,null)$$,'worker registers certificate document'); -- 45
select lives_ok($$select public.submit_my_provider_certificate(current_setting('warsha_test.certificate')::uuid)$$,'worker submits certificate'); -- 46
select is((select status from public.provider_certifications where id=current_setting('warsha_test.certificate')::uuid),'submitted','worker sees submitted certificate status'); -- 47

select set_config('request.jwt.claim.sub','a5100000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.provider_services where provider_id='a5200000-0000-4000-8000-000000000001'),0,'Worker B cannot read Worker A services'); -- 48
select is((select count(*)::integer from public.provider_service_areas where provider_id='a5200000-0000-4000-8000-000000000001'),0,'Worker B cannot read Worker A areas'); -- 49
select is((select count(*)::integer from public.provider_portfolio where provider_id='a5200000-0000-4000-8000-000000000001'),0,'Worker B cannot read Worker A portfolio'); -- 50
select is((select count(*)::integer from public.provider_certifications where provider_id='a5200000-0000-4000-8000-000000000001'),0,'Worker B cannot read Worker A certificates'); -- 51
select throws_ok($$select public.remove_my_provider_portfolio_item(current_setting('warsha_test.portfolio_item')::uuid)$$,'42501','Portfolio item not found','Worker B cannot mutate Worker A portfolio'); -- 52

select set_config('request.jwt.claim.sub','a5100000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.provider_services where provider_id='a5200000-0000-4000-8000-000000000002'),0,'customer cannot read draft services'); -- 53
select is((select count(*)::integer from public.provider_service_areas where provider_id='a5200000-0000-4000-8000-000000000002'),0,'customer cannot read draft areas'); -- 54
select is((select count(*)::integer from public.provider_portfolio where provider_id='a5200000-0000-4000-8000-000000000002'),0,'customer cannot read draft portfolio'); -- 55
select is((select count(*)::integer from public.provider_certifications where provider_id='a5200000-0000-4000-8000-000000000001'),0,'customer cannot read private certificate metadata'); -- 56

select set_config('request.jwt.claim.sub','a5100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.register_my_provider_portfolio_image(current_setting('warsha_test.portfolio_item')::uuid,'missing.jpg','image/gif',1,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,'22023','Invalid portfolio image','invalid portfolio MIME is rejected'); -- 57
select throws_ok($$select public.register_my_provider_portfolio_image(current_setting('warsha_test.portfolio_item')::uuid,'missing.jpg','image/jpeg',8388609,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,'22023','Invalid portfolio image','oversized portfolio image is rejected'); -- 58
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values('provider-portfolios','a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.portfolio_item')||'/duplicate.jpg','{"mimetype":"image/jpeg","size":1024}'::jsonb)$$,'duplicate candidate can be staged safely'); -- 59
select throws_ok($$select public.register_my_provider_portfolio_image(current_setting('warsha_test.portfolio_item')::uuid,'a5100000-0000-4000-8000-000000000001/a5200000-0000-4000-8000-000000000001/'||current_setting('warsha_test.portfolio_item')||'/duplicate.jpg','image/jpeg',1024,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,'23505','Duplicate portfolio image','duplicate portfolio content is rejected'); -- 60
select lives_ok($$select public.save_my_provider_portfolio_item(jsonb_build_object('id',current_setting('warsha_test.portfolio_item'),'title','Bathroom pipe repair','description','Replaced a damaged pipe.','status','published'))$$,'worker publishes item with an image');

reset role;
select set_config('request.jwt.claim.sub','a5100000-0000-4000-8000-000000000004',true);
update public.provider_profiles set is_published=true where id='a5200000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.review_provider_certificate(current_setting('warsha_test.certificate')::uuid,'approved',null,(current_date+365)::date)$$,'staff approves relevant certificate'); -- 62
reset role;
select is((select status from public.provider_certifications where id=current_setting('warsha_test.certificate')::uuid),'approved','approved certificate status persists'); -- 63

set local role anon;
select is((select count(*)::integer from jsonb_array_elements(public.get_marketplace_catalog()->'providers') p where p->>'id'='a5200000-0000-4000-8000-000000000001'),1,'verified complete public profile is visible'); -- 63
select is((select count(*)::integer from jsonb_array_elements(public.get_marketplace_catalog()->'providers') p where p->>'id'='a5200000-0000-4000-8000-000000000002'),0,'unverified draft profile is hidden'); -- 64
select is((select (p->>'professional_certificate_verified')::boolean from jsonb_array_elements(public.get_marketplace_catalog()->'providers') p where p->>'id'='a5200000-0000-4000-8000-000000000001'),true,'sanitized certificate indicator is public'); -- 65
select ok((select not (p ?| array['user_id','phone','email','rejection_reason','document_path','latitude','longitude','cash_debt','matching_score']) from jsonb_array_elements(public.get_marketplace_catalog()->'providers') p where p->>'id'='a5200000-0000-4000-8000-000000000001'),'public catalog contains no private contact, geometry, document, financial, or matching fields'); -- 66
select is((select count(*)::integer from public.provider_services where provider_id='a5200000-0000-4000-8000-000000000001'),1,'public may read active discoverable service'); -- 67
select is((select count(*)::integer from public.provider_portfolio where provider_id='a5200000-0000-4000-8000-000000000001'),1,'public may read published portfolio metadata'); -- 68
select is((select count(*)::integer from storage.objects where bucket_id='profile-images' and name='a5100000-0000-4000-8000-000000000001/avatar/profile.jpg'),1,'authorized public profile photo object is readable'); -- 69
select is((select count(*)::integer from storage.objects where bucket_id='provider-portfolios' and name like '%/work-one.jpg'),1,'authorized public portfolio object is readable'); -- 70
select is((select count(*)::integer from storage.objects where bucket_id='provider-certificates'),0,'private certificate objects are never public'); -- 71
select throws_ok($$select count(*) from public.provider_service_areas$$,'42501',null,'anonymous cannot query private service-area rows'); -- 72
select throws_ok($$select count(*) from public.provider_portfolio_images$$,'42501',null,'anonymous cannot query raw portfolio image rows'); -- 73
select is(public.get_provider_trust_indicators('a5200000-0000-4000-8000-000000000001'),'{"identityVerified":true,"skillCertificateVerified":false,"professionalCertificateVerified":true}'::jsonb,'trust RPC exposes only sanitized positive certificate indicator'); -- 74
select has_function('public','submit_booking_review',array['uuid','smallint','text','text[]'],'verified completed-booking review RPC remains in use'); -- 76
select has_function('public','get_provider_rating_summary',array['uuid'],'existing review aggregate remains in use'); -- 77
reset role;

select * from finish();
rollback;
