begin;
select no_plan();

-- A Professional's rating, review count and completed jobs are what the
-- marketplace reads (matching, quote cards, search sort, the minimum-rating
-- filter). They follow the record — the same rule as the public reputation
-- summary — and nobody can write them by hand.

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','e1100000-0000-4000-8000-000000000001','authenticated','authenticated','rep-c1@test.local',null,'',now(),null,'{}','{"display_name":"Reputation Customer One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1100000-0000-4000-8000-000000000002','authenticated','authenticated','rep-c2@test.local',null,'',now(),null,'{}','{"display_name":"Reputation Customer Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1100000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000001e03','',null,now(),'{}','{"display_name":"Reputation Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1100000-0000-4000-8000-000000000004','authenticated','authenticated','rep-staff@test.local',null,'',now(),null,'{}','{"display_name":"Reputation Staff"}',now(),now());
-- A staff row that predates 202608310006, as in reviews-reputation.test.sql.
alter table public.user_roles disable trigger refuse_new_legacy_staff_role;
insert into public.user_roles(user_id,role) values('e1100000-0000-4000-8000-000000000004','admin') on conflict do nothing;
alter table public.user_roles enable trigger refuse_new_legacy_staff_role;

insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,avatar_url,service_radius_km,is_verified,is_available,is_published,onboarding_status)
values('e1200000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000003','Reputation Professional','plumbing','plumbing',array['plumbing'],'Careful plumbing repairs, explained before the work starts.',4,'e1100000-0000-4000-8000-000000000003/avatar/profile.jpg',15,true,true,true,'approved');

select is((select (rating_average, review_count, completed_jobs)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(0.0,0,0)', 'a new Professional starts with nothing');

-- Before anything in this session has recomputed a rating, the setting that
-- lets the recomputation through does not exist at all. The guard must hold
-- then too; a NULL there once made it fail open.
select is(pg_catalog.current_setting('warsha.keeping_reputation', true), null,
  'nothing has recomputed yet in this session');
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000003',true);
select throws_ok($$update public.provider_profiles set rating_average=5.0, review_count=50 where id='e1200000-0000-4000-8000-000000000001'$$,
  '42501','Protected provider fields cannot be changed','A FUNCTION ACTING FOR A PROFESSIONAL CANNOT SET THEIR RATING IN A FRESH SESSION');
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Completed jobs
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select v.id::uuid,'e1100000-0000-4000-8000-000000000001','e1200000-0000-4000-8000-000000000001',s.id,v.status,'Reputation service','fixed',100,'Reputation test work',current_date,'12:00','Private address',v.key
from (values('e1400000-0000-4000-8000-000000000001','completed','rep-complete-1'),('e1400000-0000-4000-8000-000000000002','confirmed','rep-confirmed-1')) v(id,status,key)
cross join lateral(select id from public.services where category_id='plumbing' order by id limit 1) s;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000002',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select 'e1400000-0000-4000-8000-000000000003','e1100000-0000-4000-8000-000000000002','e1200000-0000-4000-8000-000000000001',s.id,'completed','Reputation service','fixed',100,'Reputation test work',current_date,'12:00','Private address','rep-complete-2'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select set_config('request.jwt.claim.sub','',true);

select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),2,
  'COMPLETED JOBS COUNT THE COMPLETED BOOKINGS, AND ONLY THEM');

-- ---------------------------------------------------------------------------
-- Rating and review count, through the real writer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.submit_booking_review_v2('e1400000-0000-4000-8000-000000000001',5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Careful and on time.',false,'{}'::text[])$$,
  'a Customer reviews a completed job through the real writer');
reset role;
select is((select (rating_average, review_count)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(5.0,1)', 'A REVIEW MOVES THE RATING THE MARKETPLACE READS');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.submit_booking_review_v2('e1400000-0000-4000-8000-000000000003',2::smallint,2::smallint,2::smallint,2::smallint,2::smallint,2::smallint,'Late and left a mess.',false,'{}'::text[])$$,
  'a second Customer reviews their completed job');
reset role;
select is((select (rating_average, review_count)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(3.5,2)', 'and the average is of every visible review');
select is((select (rating_average, review_count)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  (select pg_catalog.format('(%s,%s)', (s->>'average')::numeric(2,1), s->>'count')
     from (select private.provider_reputation('e1200000-0000-4000-8000-000000000001') s) x),
  'THE STORED RATING AGREES WITH THE PUBLIC REPUTATION SUMMARY');

-- A Professional still cannot write their own numbers, even right after the
-- system has kept them in the same transaction: not directly (clients hold no
-- update right on the table), and not through any function that updates the
-- profile on their behalf (the guard).
set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000003',true);
select throws_ok($$update public.provider_profiles set rating_average=5.0 where id='e1200000-0000-4000-8000-000000000001'$$,
  '42501',null,'A PROFESSIONAL CANNOT WRITE THEIR OWN RATING');
reset role;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000003',true);
select throws_ok($$update public.provider_profiles set rating_average=5.0 where id='e1200000-0000-4000-8000-000000000001'$$,
  '42501','Protected provider fields cannot be changed','NOR CAN A FUNCTION ACTING FOR THEM, RIGHT AFTER A RECOMPUTATION');
select throws_ok($$update public.provider_profiles set completed_jobs=100 where id='e1200000-0000-4000-8000-000000000001'$$,
  '42501','Protected provider fields cannot be changed','or write their completed jobs');
select is(pg_catalog.current_setting('warsha.keeping_reputation', true),'off',
  'the recomputation leaves no permission switched on behind it');
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Moderation: a hidden review stops counting, a restored one counts again
-- ---------------------------------------------------------------------------
select set_config('warsha_test.low_review',(select id::text from public.reviews where booking_id='e1400000-0000-4000-8000-000000000003'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.moderate_review(current_setting('warsha_test.low_review')::uuid,'hide','Abusive language confirmed')$$,
  'staff hide a review');
reset role;
select is((select (rating_average, review_count)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(5.0,1)', 'A HIDDEN REVIEW STOPS COUNTING');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.moderate_review(current_setting('warsha_test.low_review')::uuid,'restore','Appeal accepted')$$,
  'staff restore it');
reset role;
select is((select (rating_average, review_count)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(3.5,2)', 'and a restored one counts again');

-- A review held while a dispute is open is not public, and does not count.
select set_config('request.jwt.claim.sub','',true);
update public.reviews set moderation_status='flagged' where id=current_setting('warsha_test.low_review')::uuid;
select is((select review_count from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),1,
  'a review held for a dispute does not count either');
update public.reviews set moderation_status='visible' where id=current_setting('warsha_test.low_review')::uuid;

-- ---------------------------------------------------------------------------
-- A job completes later, and counts once
-- ---------------------------------------------------------------------------
-- The status history records who moved the job, so the Professional does.
select set_config('request.jwt.claim.sub','e1100000-0000-4000-8000-000000000003',true);
update public.bookings set status='provider_on_the_way' where id='e1400000-0000-4000-8000-000000000002';
update public.bookings set status='provider_arrived' where id='e1400000-0000-4000-8000-000000000002';
update public.bookings set status='job_started' where id='e1400000-0000-4000-8000-000000000002';
select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),2,
  'a job under way is not a completed job');
update public.bookings set status='completed' where id='e1400000-0000-4000-8000-000000000002';
select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),3,
  'A JOB THAT COMPLETES COUNTS');
update public.bookings set updated_at=now() where id='e1400000-0000-4000-8000-000000000002';
select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),3,
  'and counts once, whatever else changes on it');
-- The summary counts status 'completed' only, so a job under dispute is not
-- one; the stored count says the same thing.
update public.bookings set status='disputed' where id='e1400000-0000-4000-8000-000000000002';
select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),2,
  'a completed job taken to dispute stops counting, as the summary says');
select is((select completed_jobs from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  (private.provider_reputation('e1200000-0000-4000-8000-000000000001')->>'completed_jobs')::integer,
  'THE STORED COMPLETED JOBS AGREE WITH THE PUBLIC REPUTATION SUMMARY');
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- A drifted row is corrected from the record, as the backfill does
-- ---------------------------------------------------------------------------
update public.provider_profiles set rating_average=4.9, review_count=40, completed_jobs=300
where id='e1200000-0000-4000-8000-000000000001';
select private.keep_provider_rating('e1200000-0000-4000-8000-000000000001');
select private.keep_provider_completed_jobs('e1200000-0000-4000-8000-000000000001');
select is((select (rating_average, review_count, completed_jobs)::text from public.provider_profiles where id='e1200000-0000-4000-8000-000000000001'),
  '(3.5,2,2)', 'A CLAIMED 4.9 FROM 40 REVIEWS IS REPLACED BY WHAT THE RECORD SAYS');

select is((select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('keep_provider_rating','keep_provider_completed_jobs')
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),0,
  'no client can call the recomputation');

select * from finish();
rollback;
