begin;
select no_plan();
select set_config('storage.allow_delete_query','true',true);

select has_column('public','reviews','professionalism_rating','professionalism score exists');
select has_column('public','reviews','quality_rating','quality score exists');
select has_column('public','reviews','punctuality_rating','punctuality score exists');
select has_column('public','reviews','communication_rating','communication score exists');
select has_column('public','reviews','value_rating','value score exists');
select has_column('public','reviews','edit_deadline_at','edit deadline exists');
select has_column('public','reviews','revision','review revision exists');
select has_table('public','review_edit_events','review edit audit exists');
select has_table('public','review_reports','review reports exist');
select has_table('public','review_report_events','report workflow audit exists');
select has_table('public','review_helpfulness_votes','helpfulness votes exist');
select has_table('public','review_moderation_events','moderation audit exists');
select has_function('public','submit_booking_review_v2',array['uuid','smallint','smallint','smallint','smallint','smallint','smallint','text','boolean','text[]'],'multidimensional review RPC exists');
select has_function('public','edit_booking_review',array['uuid','smallint','smallint','smallint','smallint','smallint','smallint','text','boolean','text[]'],'bounded review edit RPC exists');
select has_function('public','vote_review_helpfulness',array['uuid','text'],'helpful vote RPC exists');
select has_function('public','report_review',array['uuid','text','text'],'report RPC exists');
select has_function('public','moderate_review',array['uuid','text','text'],'staff moderation RPC exists');
select has_function('public','get_provider_reputation_summary',array['uuid','text','integer','integer'],'sanitized reputation RPC exists');
select has_function('public','get_marketplace_catalog_v2',array[]::text[],'sanitized catalog extension exists');
select is(has_function_privilege('anon','public.submit_booking_review_v2(uuid,smallint,smallint,smallint,smallint,smallint,smallint,text,boolean,text[])','EXECUTE'),false,'anonymous cannot submit');
select is(has_function_privilege('authenticated','public.submit_booking_review_v2(uuid,smallint,smallint,smallint,smallint,smallint,smallint,text,boolean,text[])','EXECUTE'),true,'authenticated caller may invoke guarded submit');
select is(has_table_privilege('authenticated','public.review_reports','INSERT'),false,'direct report insert is denied');
select is(has_table_privilege('authenticated','public.review_helpfulness_votes','INSERT'),false,'direct vote insert is denied');
select is(has_table_privilege('authenticated','public.review_moderation_events','INSERT'),false,'direct moderation audit insert is denied');
select is((select public from storage.buckets where id='review-attachments'),false,'review photo bucket remains private');
select is((select file_size_limit from storage.buckets where id='review-attachments'),5242880::bigint,'review photo limit remains 5 MB');
select is((select allowed_mime_types from storage.buckets where id='review-attachments'),array['image/jpeg','image/png','image/webp']::text[],'review photo MIME list is exact');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='review_attachments'),0,'private review image paths are not published');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('review_reports','review_report_events','review_moderation_events')),0,'private moderation data is not published');
select is(private.review_edit_window_hours(),72,'edit window defaults to 72 hours');
select is(private.is_safe_review_attachment_path('bad/../photo.jpg','b1100000-0000-4000-8000-000000000001','b1400000-0000-4000-8000-000000000001'),false,'unsafe path is rejected');

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000001','authenticated','authenticated','wps011-c1@test.local',null,'',now(),null,'{}','{"display_name":"Customer One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000002','authenticated','authenticated','wps011-c2@test.local',null,'',now(),null,'{}','{"display_name":"Customer Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000001103','',null,now(),'{}','{"display_name":"Review Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000004','authenticated','authenticated','wps011-staff@test.local',null,'',now(),null,'{}','{"display_name":"Review Staff"}',now(),now());
-- Simulates a staff row that predates 202608310006, which refuses NEW
-- legacy staff rows so that staff can only be granted through
-- `staff_role_grants`, where it is auditable and revocable. Existing rows
-- keep working, and that is exactly what this fixture stands in for.
alter table public.user_roles disable trigger refuse_new_legacy_staff_role;
insert into public.user_roles(user_id,role) values('b1100000-0000-4000-8000-000000000004','admin') on conflict do nothing;
alter table public.user_roles enable trigger refuse_new_legacy_staff_role;


insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,avatar_url,service_radius_km,is_verified,is_available,is_published,onboarding_status,created_at)
values('b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000003','Review Worker','plumbing','plumbing',array['plumbing'],'I complete careful plumbing repairs and explain the agreed work.',4,'b1100000-0000-4000-8000-000000000003/avatar/profile.jpg',15,true,true,true,'approved',now()-interval '4 years');
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('b1200000-0000-4000-8000-000000000001','approved',1,now());
insert into public.provider_services(provider_id,service_id,is_active) select 'b1200000-0000-4000-8000-000000000001',id,true from public.services where category_id='plumbing' order by id limit 1;
insert into public.provider_service_areas(provider_id,governorate,district,latitude,longitude,radius_km) values('b1200000-0000-4000-8000-000000000001','Cairo','Maadi',30.01,31.20,15);
insert into storage.objects(bucket_id,name,metadata) values('profile-images','b1100000-0000-4000-8000-000000000003/avatar/profile.jpg','{"mimetype":"image/jpeg","size":1024}'::jsonb);

select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select v.id::uuid,'b1100000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001',s.id,v.status,'Review service','fixed',100,'Completed review test work',current_date,'12:00','Private address',v.key
from (values('b1400000-0000-4000-8000-000000000001','completed','wps011-complete'),('b1400000-0000-4000-8000-000000000002','confirmed','wps011-incomplete')) v(id,status,key)
cross join lateral(select id from public.services where category_id='plumbing' order by id limit 1)s;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select 'b1400000-0000-4000-8000-000000000003','b1100000-0000-4000-8000-000000000002','b1200000-0000-4000-8000-000000000001',s.id,'completed','Review service','fixed',100,'Completed review test work',current_date,'12:00','Private address','wps011-second'
from public.services s where s.category_id='plumbing' order by s.id limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values('review-attachments','b1100000-0000-4000-8000-000000000001/b1400000-0000-4000-8000-000000000001/review/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg','{"mimetype":"image/jpeg","size":2048}'::jsonb)$$,'completed booking customer stages a safe image');
select throws_ok($$select public.submit_booking_review_v2('b1400000-0000-4000-8000-000000000002',5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Not complete',false,'{}'::text[])$$,'42501','Review is not available','incomplete booking cannot be reviewed');
select throws_ok($$select public.submit_booking_review_v2('b1400000-0000-4000-8000-000000000001',5::smallint,0::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Bad dimension',false,'{}'::text[])$$,'22023','Invalid rating','invalid dimension is rejected');
select lives_ok($$select public.submit_booking_review_v2('b1400000-0000-4000-8000-000000000001',5::smallint,5::smallint,4::smallint,5::smallint,5::smallint,4::smallint,'Careful and on time.',false,array['b1100000-0000-4000-8000-000000000001/b1400000-0000-4000-8000-000000000001/review/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'])$$,'completed-booking customer publishes multidimensional review');
select is((select count(*)::integer from public.reviews where booking_id='b1400000-0000-4000-8000-000000000001'),1,'one review exists per booking');
select is((select quality_rating from public.reviews where booking_id='b1400000-0000-4000-8000-000000000001'),4::smallint,'quality score persists');
select is((select count(*)::integer from public.review_attachments a join public.reviews r on r.id=a.review_id where r.booking_id='b1400000-0000-4000-8000-000000000001'),1,'review image metadata registers once');
select is((select content_hash from public.review_attachments limit 1),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','safe filename content fingerprint registers');
select lives_ok($$select public.submit_booking_review_v2('b1400000-0000-4000-8000-000000000001',1::smallint,1::smallint,1::smallint,1::smallint,1::smallint,1::smallint,'Retry cannot replace',true,array['b1100000-0000-4000-8000-000000000001/b1400000-0000-4000-8000-000000000001/review/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'])$$,'submission retry is idempotent');
select is((select rating from public.reviews where booking_id='b1400000-0000-4000-8000-000000000001'),5::smallint,'retry does not mutate published review');
select set_config('warsha_test.review',(select id::text from public.reviews where booking_id='b1400000-0000-4000-8000-000000000001'),true);
select lives_ok($$select public.edit_booking_review(current_setting('warsha_test.review')::uuid,4::smallint,4::smallint,4::smallint,4::smallint,5::smallint,4::smallint,'Updated inside the window.',false,array['b1100000-0000-4000-8000-000000000001/b1400000-0000-4000-8000-000000000001/review/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'])$$,'customer edits inside configured window');
select is((select revision from public.reviews where id=current_setting('warsha_test.review')::uuid),2,'edit increments revision');
select is((select count(*)::integer from public.review_edit_events where review_id=current_setting('warsha_test.review')::uuid),1,'edit appends audit history');
select is((public.get_booking_review_v2('b1400000-0000-4000-8000-000000000001')->>'can_edit')::boolean,true,'owner projection exposes active edit state');
reset role;
update public.reviews set edit_deadline_at=now()-interval '1 minute' where id=current_setting('warsha_test.review')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.edit_booking_review(current_setting('warsha_test.review')::uuid,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Too late',false,'{}'::text[])$$,'42501','Review edit window has closed','customer cannot edit after deadline');
select throws_ok($$delete from public.reviews where id=current_setting('warsha_test.review')::uuid$$,'42501',null,'customer cannot delete review');

select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.edit_booking_review(current_setting('warsha_test.review')::uuid,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Other customer',false,'{}'::text[])$$,'42501','Review edit window has closed','other customer cannot edit review');
select lives_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review')::uuid,'helpful')$$,'unrelated account can mark visible review helpful');
select lives_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review')::uuid,'not_helpful')$$,'changing a vote updates the existing row');
select is((select count(*)::integer from public.review_helpfulness_votes where review_id=current_setting('warsha_test.review')::uuid),1,'duplicate helpful votes are prevented');
select is((select vote from public.review_helpfulness_votes where review_id=current_setting('warsha_test.review')::uuid),'not_helpful','latest vote direction persists');
select lives_ok($$select public.report_review(current_setting('warsha_test.review')::uuid,'spam','Looks duplicated')$$,'authenticated account reports review');
select lives_ok($$select public.report_review(current_setting('warsha_test.review')::uuid,'fake_review','Updated evidence')$$,'duplicate report retry updates one report');
select is((select count(*)::integer from public.review_reports where review_id=current_setting('warsha_test.review')::uuid),1,'duplicate reporter review report is prevented');
select set_config('warsha_test.report',(select id::text from public.review_reports where review_id=current_setting('warsha_test.review')::uuid),true);

select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review')::uuid,'helpful')$$,'42501','Vote is not available','review author cannot vote own review');
select is((select count(*)::integer from public.review_reports where id=current_setting('warsha_test.report')::uuid),0,'unrelated customer cannot read another reporter identity');

select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review')::uuid,'helpful')$$,'42501','Vote is not available','reviewed provider cannot vote');
select lives_ok($$select public.reply_to_booking_review(current_setting('warsha_test.review')::uuid,'Thank you for the feedback.')$$,'reviewed provider publishes one reply');
select lives_ok($$select public.reply_to_booking_review(current_setting('warsha_test.review')::uuid,'Cannot replace reply')$$,'reply retry remains idempotent');
select is((select body from public.review_responses where review_id=current_setting('warsha_test.review')::uuid),'Thank you for the feedback.','published reply is immutable');

select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.review_report_transition(current_setting('warsha_test.report')::uuid,'in_review','Checking booking evidence')$$,'staff moves report into review');
select lives_ok($$select public.moderate_review(current_setting('warsha_test.review')::uuid,'hide','Offensive content confirmed')$$,'staff soft-hides review');
select is((select count(*)::integer from public.review_moderation_events where review_id=current_setting('warsha_test.review')::uuid),1,'moderation event is preserved');
select is((select count(*)::integer from public.reviews where id=current_setting('warsha_test.review')::uuid),1,'soft-hidden review row and booking link remain');
select lives_ok($$select public.review_report_transition(current_setting('warsha_test.report')::uuid,'resolved','Review hidden')$$,'staff resolves report');
select is((select count(*)::integer from public.review_report_events where report_id=current_setting('warsha_test.report')::uuid),2,'report transition audit is immutable and complete');
reset role;

set local role anon;
select is((public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->>'count')::integer,0,'hidden review is excluded from public reputation');
select is(jsonb_array_length(public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'reviews'),0,'hidden review and reply are absent from public feed');
select throws_ok($$select count(*) from public.review_reports$$,'42501',null,'anonymous cannot read reports');
select throws_ok($$select count(*) from public.review_moderation_events$$,'42501',null,'anonymous cannot read moderation audit');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.moderate_review(current_setting('warsha_test.review')::uuid,'restore','Appeal evidence accepted')$$,'staff restores review without deleting history');
reset role;

set local role anon;
select is((public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','highest_rated',20,0)->>'count')::integer,1,'restored review returns to public aggregate');
select is(public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'reviews'->0->>'reviewer_name','C.','reviewer contact information is sanitized to an initial');
select ok(not ((public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'reviews'->0) ?| array['customer_id','email','phone','moderation_reason','moderated_by','reporter_id']),'public review excludes contact and moderation fields');
select ok((public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'reviews'->0) ? 'image_refs','sanitized RPC provides adapter-only signed-image hydration references');
select is(public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'confidence'->>'policy_version','wps011-v1','confidence policy is versioned');
select is((public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','newest',20,0)->'badges'->>'experienced')::boolean,true,'experienced badge follows approved years rule');
select ok((select (provider->'reputation') ? 'confidence' from jsonb_array_elements(public.get_marketplace_catalog_v2()->'providers') provider where provider->>'id'='b1200000-0000-4000-8000-000000000001'),'catalog projection includes sanitized reputation');
select throws_ok($$select public.get_provider_reputation_summary('b1200000-0000-4000-8000-000000000001','manipulated',20,0)$$,'22023','Invalid review query','unknown sort is rejected');
reset role;

select * from finish();
rollback;
