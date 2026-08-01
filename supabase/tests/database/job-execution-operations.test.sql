begin;
select no_plan();
select set_config('storage.allow_delete_query','true',true);

select has_table('public','booking_operations','booking operation state exists');
select has_table('public','booking_operation_events','immutable operation timeline exists');
select has_table('public','job_progress_media','dedicated progress media exists');
select has_table('public','booking_additional_work_requests','additional work requests exist');
select has_table('public','booking_return_visits','same-booking return visits exist');
select has_function('public','get_booking_operation',array['uuid'],'participant projection RPC exists');
select has_function('public','transition_booking_operation',array['uuid','text','text','text'],'worker transition RPC exists');
select has_function('public','publish_booking_operation_update',array['uuid','text','text'],'predefined update RPC exists');
select has_function('public','report_booking_operation_delay',array['uuid','text','integer','text','text'],'delay RPC exists');
select has_function('public','register_job_progress_media',array['uuid','text','text','text','integer','text'],'media registration RPC exists');
select has_function('public','submit_additional_work_request',array['uuid','text','uuid[]','bigint','text'],'additional work RPC exists');
select has_function('public','respond_additional_work_request',array['uuid','text','text','text'],'additional work response RPC exists');
select has_function('public','mark_job_ready_for_inspection',array['uuid','text[]','text','integer','text','text'],'inspection handoff RPC exists');
select has_function('public','respond_job_inspection',array['uuid','text','text[]','text','text'],'customer inspection RPC exists');
select has_function('public','request_booking_return_visit',array['uuid','text','text'],'return visit request RPC exists');
select has_function('public','respond_booking_return_visit',array['uuid','boolean','text','text'],'return visit response RPC exists');
select is(has_table_privilege('authenticated','public.booking_operation_events','INSERT'),false,'clients cannot forge timeline rows');
select is(has_table_privilege('authenticated','public.booking_operation_events','UPDATE'),false,'clients cannot edit timeline rows');
select is(has_table_privilege('authenticated','public.booking_operation_events','DELETE'),false,'clients cannot delete timeline rows');
select is(has_table_privilege('authenticated','public.booking_operations','UPDATE'),false,'clients cannot directly change operation state');
select is(has_table_privilege('authenticated','public.job_progress_media','INSERT'),false,'clients cannot forge progress metadata');
select is((select public from storage.buckets where id='job-progress-media'),false,'progress bucket is private');
select is((select file_size_limit from storage.buckets where id='job-progress-media'),8388608::bigint,'progress photo limit is 8 MB');
select is((select allowed_mime_types from storage.buckets where id='job-progress-media'),array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[],'progress MIME allowlist is exact');
select is(private.job_operation_can_transition('confirmed','traveling'),true,'confirmed can transition to traveling');
select is(private.job_operation_can_transition('confirmed','arrived'),false,'confirmed cannot skip to arrived');
select is(private.job_operation_can_transition('customer_inspection','completed'),true,'inspection can complete');
select is(private.job_operation_can_transition('completed','resumed'),false,'completed operation is terminal without a return section');
select is(private.job_operation_booking_status('waiting_for_approval'),'work_in_progress','fine-grained waiting state maps to existing booking authority');
select is(private.is_safe_job_progress_path('bad/../photo.jpg','c1200000-0000-4000-8000-000000000003','c1400000-0000-4000-8000-000000000001','after'),false,'unsafe progress path is rejected');

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','c1200000-0000-4000-8000-000000000001','authenticated','authenticated','wps012-customer@test.local',null,'',now(),null,'{}','{"display_name":"Operations Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1200000-0000-4000-8000-000000000002','authenticated','authenticated','wps012-other@test.local',null,'',now(),null,'{}','{"display_name":"Unrelated Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1200000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000001203','',null,now(),'{}','{"display_name":"Operations Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c1200000-0000-4000-8000-000000000004','authenticated','authenticated','wps012-staff@test.local',null,'',now(),null,'{}','{"display_name":"Operations Staff"}',now(),now());
insert into public.user_roles(user_id,role) values('c1200000-0000-4000-8000-000000000004','admin') on conflict do nothing;
insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,service_radius_km,is_verified,is_available,is_published,onboarding_status)
values('c1300000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003','Operations Worker','plumbing','plumbing',array['plumbing'],'Careful operational work with clear customer updates.',5,15,true,true,true,'approved');
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('c1300000-0000-4000-8000-000000000001','approved',1,now());
insert into public.provider_services(provider_id,service_id,is_active) select 'c1300000-0000-4000-8000-000000000001',id,true from public.services where category_id='plumbing' order by id limit 1;

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,final_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select 'c1400000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000001',s.id,'confirmed','Operations service','fixed',100,100,'Repair requiring transparent job operations',current_date,'12:00','Private operations address','wps012-booking'
from public.services s where s.category_id='plumbing' order by s.id limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_booking_operation('c1400000-0000-4000-8000-000000000001')$$,'42501','Job operation not found','unrelated account cannot read operation projection');
select is((select count(*)::integer from public.booking_operation_events where booking_id='c1400000-0000-4000-8000-000000000001'),0,'unrelated account cannot read timeline rows');
select throws_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','traveling',null,'other-transition')$$,'42501','Worker operation is not available','unrelated account cannot transition job');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select is(public.get_booking_operation('c1400000-0000-4000-8000-000000000001')->>'currentState','confirmed','customer sees initialized confirmed operation');
select throws_ok($$insert into public.booking_operation_events(booking_id,section_number,state,event_type,actor_class,idempotency_key) values('c1400000-0000-4000-8000-000000000001',1,'arrived','forged','customer','forged-event')$$,'42501',null,'customer cannot forge a timeline event');
select throws_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','traveling',null,'customer-transition')$$,'42501','Worker operation is not available','customer cannot publish worker transition');
select lives_ok($$select public.publish_booking_operation_update('c1400000-0000-4000-8000-000000000001','customer_arriving_shortly','customer-update-1')$$,'customer publishes an approved predefined update');
select throws_ok($$select public.publish_booking_operation_update('c1400000-0000-4000-8000-000000000001','worker_arrived','forged-worker-update')$$,'42501','Operation update is not available','customer cannot publish worker predefined update');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','arrived',null,'skip-arrival')$$,'22023','Invalid operation transition','worker cannot skip a state');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','traveling',null,'traveling-1')$$,'worker starts traveling');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','traveling',null,'traveling-1')$$,'transition retry is idempotent');
select is((select current_state from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),'traveling','operation state advances to traveling');
select is((select status from public.bookings where id='c1400000-0000-4000-8000-000000000001'),'provider_on_the_way','existing booking status remains coarse lifecycle authority');
select is((select count(*)::integer from public.booking_operation_events where booking_id='c1400000-0000-4000-8000-000000000001' and idempotency_key='traveling-1'),1,'retry creates one timeline event');
select is((select count(*)::integer from public.messages where booking_id='c1400000-0000-4000-8000-000000000001' and metadata->>'event'='operation_traveling'),1,'transition creates one server-authenticated WPS-009 message');
select is((select count(*)::integer from public.messages where booking_id='c1400000-0000-4000-8000-000000000001' and metadata->>'event'='booking_provider_on_the_way'),0,'fine-grained transition suppresses duplicate coarse system message');
select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.notifications where user_id='c1200000-0000-4000-8000-000000000001' and type='operation_traveling'),1,'traveling generates one durable customer notification');
select is((select count(*)::integer from public.notifications where user_id='c1200000-0000-4000-8000-000000000001' and type='booking_provider_on_the_way'),0,'fine-grained transition suppresses duplicate coarse notification');
select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.publish_booking_operation_update('c1400000-0000-4000-8000-000000000001','worker_on_my_way','worker-update-1')$$,'worker publishes predefined update');
select lives_ok($$select public.report_booking_operation_delay('c1400000-0000-4000-8000-000000000001','traffic',20,'Traffic is heavy','delay-key-1')$$,'worker reports a bounded delay');
select throws_ok($$select public.report_booking_operation_delay('c1400000-0000-4000-8000-000000000001','traffic',1441,null,'delay-bad')$$,'22023','Invalid delay update','unbounded delay is rejected');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','waiting_for_customer','Waiting outside','waiting-1')$$,'worker waits for customer');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','started',null,'started-1')$$,'worker starts work');
select is((select status from public.bookings where id='c1400000-0000-4000-8000-000000000001'),'job_started','start maps to existing job_started state');

select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('job-progress-media','c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/aaaaaaaaaaaa.jpg','c1200000-0000-4000-8000-000000000003','{"mimetype":"image/jpeg","size":2048}'::jsonb)$$,'worker uploads a safe private progress object');
select throws_ok($$select public.register_job_progress_media('c1400000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/../bad.jpg','after',null,1,'bad-media-client')$$,'22023','Invalid progress media','unsafe path cannot register');
select lives_ok($$select public.register_job_progress_media('c1400000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/aaaaaaaaaaaa.jpg','after','Finished repair',1,'media-client-001')$$,'worker registers server-validated progress media');
select is((select count(*)::integer from public.job_progress_media where booking_id='c1400000-0000-4000-8000-000000000001'),1,'progress media metadata registers once');
select is((select byte_size from public.job_progress_media where booking_id='c1400000-0000-4000-8000-000000000001'),2048::bigint,'server reads object byte size');
select lives_ok($$delete from storage.objects where bucket_id='job-progress-media' and name='c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/aaaaaaaaaaaa.jpg'$$,'unauthorized delete safely affects no rows');
select is((select count(*)::integer from storage.objects where bucket_id='job-progress-media' and name='c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/aaaaaaaaaaaa.jpg'),1,'registered evidence remains after owner delete attempt');

select lives_ok($$select public.submit_additional_work_request('c1400000-0000-4000-8000-000000000001','Replace a damaged connector found during the repair',array[(select id from public.job_progress_media where booking_id='c1400000-0000-4000-8000-000000000001')],12500,'additional-request-1')$$,'worker requests additional work through the existing price authority');
select set_config('warsha_test.additional',(select id::text from public.booking_additional_work_requests where booking_id='c1400000-0000-4000-8000-000000000001'),true);
select ok((select price_adjustment_id is not null from public.booking_additional_work_requests where id=current_setting('warsha_test.additional')::uuid),'optional estimate creates a WPS-007 price adjustment link');
select is((select current_state from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),'waiting_for_approval','additional work waits for explicit approval');
select is((select final_price_egp from public.bookings where id='c1400000-0000-4000-8000-000000000001'),100::numeric,'request never silently changes booking price');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.respond_additional_work_request(current_setting('warsha_test.additional')::uuid,'approved','Approved after inspection','additional-response-1')$$,'customer explicitly approves additional work');
select is((select status from public.booking_additional_work_requests where id=current_setting('warsha_test.additional')::uuid),'approved','additional work decision is durable');
select is((select status from public.booking_price_adjustments where id=(select price_adjustment_id from public.booking_additional_work_requests where id=current_setting('warsha_test.additional')::uuid)),'accepted','WPS-007 records the financial decision');
select is((select final_price_egp from public.bookings where id='c1400000-0000-4000-8000-000000000001'),125::numeric,'approved WPS-007 snapshot updates the explicit total');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.mark_job_ready_for_inspection('c1400000-0000-4000-8000-000000000001',array['work_finished','area_cleaned'],'30_days',null,null,'ready-incomplete')$$,'22023','Completion checklist is incomplete','incomplete worker checklist cannot request inspection');
select lives_ok($$select public.mark_job_ready_for_inspection('c1400000-0000-4000-8000-000000000001',array['work_finished','area_cleaned','photos_uploaded','customer_informed'],'30_days',null,'Ready for your inspection','ready-1')$$,'worker completes checklist and requests customer inspection');
select lives_ok($$select public.mark_job_ready_for_inspection('c1400000-0000-4000-8000-000000000001',array['work_finished','area_cleaned','photos_uploaded','customer_informed'],'30_days',null,'Ready for your inspection','ready-1')$$,'inspection handoff retry is idempotent');
select is((select current_state from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),'customer_inspection','job waits for customer inspection');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.respond_job_inspection('c1400000-0000-4000-8000-000000000001','approve',array['work_inspected'],null,'inspect-incomplete')$$,'22023','Inspection checklist is incomplete','customer cannot approve incomplete inspection checklist');
select lives_ok($$select public.respond_job_inspection('c1400000-0000-4000-8000-000000000001','request_clarification',array['work_inspected'],'Please explain the replaced connector','inspect-clarify')$$,'customer requests clarification without completing booking');
select is((select status from public.bookings where id='c1400000-0000-4000-8000-000000000001'),'work_in_progress','clarification keeps booking in progress');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.mark_job_ready_for_inspection('c1400000-0000-4000-8000-000000000001',array['work_finished','area_cleaned','photos_uploaded','customer_informed'],'30_days',null,'Clarification provided','ready-2')$$,'worker returns job to inspection');
select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.respond_job_inspection('c1400000-0000-4000-8000-000000000001','approve',array['work_inspected','satisfied','close_booking','review_later'],'Approved','inspect-approve')$$,'customer approves completion');
select lives_ok($$select public.respond_job_inspection('c1400000-0000-4000-8000-000000000001','approve',array['work_inspected','satisfied','close_booking','review_later'],'Approved','inspect-approve')$$,'completion approval retry is idempotent');
select is((select status from public.bookings where id='c1400000-0000-4000-8000-000000000001'),'completed','customer approval completes canonical booking');
select is((select current_state from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),'completed','operation reaches completed');
select is((select warranty_days from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),30,'bounded warranty persists');
select ok((select warranty_starts_at is not null and warranty_ends_at=warranty_starts_at+interval '30 days' from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),'warranty starts only at completion');
select is((select count(*)::integer from public.notifications where user_id='c1200000-0000-4000-8000-000000000001' and type='review_unlocked'),1,'completion unlock notification is deduplicated');
select lives_ok($$select public.submit_booking_review_v2('c1400000-0000-4000-8000-000000000001',5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Transparent job progress.',false,'{}'::text[])$$,'WPS-011 review unlock uses canonical completion');

select lives_ok($$select public.request_booking_return_visit('c1400000-0000-4000-8000-000000000001','Please recheck the connector under the same warranty','return-request-1')$$,'customer requests a return visit on the same booking');
select set_config('warsha_test.return',(select id::text from public.booking_return_visits where booking_id='c1400000-0000-4000-8000-000000000001'),true);
select is((select current_section from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),2,'return visit opens a new operation section');
select is((select count(*)::integer from public.bookings where id='c1400000-0000-4000-8000-000000000001'),1,'return visit does not create a duplicate booking');
select is((select count(*)::integer from public.reviews where booking_id='c1400000-0000-4000-8000-000000000001'),1,'return visit preserves one review per booking');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.respond_booking_return_visit(current_setting('warsha_test.return')::uuid,true,'I will return','return-accept-1')$$,'worker accepts return visit');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','traveling',null,'return-traveling')$$,'return section reuses transition graph');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','arrived',null,'return-arrived')$$,'worker arrives for return section');
select lives_ok($$select public.transition_booking_operation('c1400000-0000-4000-8000-000000000001','started',null,'return-started')$$,'worker starts return work');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('job-progress-media','c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/bbbbbbbbbbbb.jpg','c1200000-0000-4000-8000-000000000003','{"mimetype":"image/jpeg","size":1024}'::jsonb)$$,'worker uploads return-section evidence');
select lives_ok($$select public.register_job_progress_media('c1400000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000003/c1400000-0000-4000-8000-000000000001/operations/after/bbbbbbbbbbbb.jpg','after','Return visit result',1,'media-client-002')$$,'return evidence remains on same booking');
select lives_ok($$select public.mark_job_ready_for_inspection('c1400000-0000-4000-8000-000000000001',array['work_finished','area_cleaned','photos_uploaded','customer_informed'],'none',null,'Return work ready','return-ready')$$,'return work enters inspection without resetting canonical completion');
select is((select status from public.bookings where id='c1400000-0000-4000-8000-000000000001'),'completed','canonical booking stays completed during return section');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.respond_job_inspection('c1400000-0000-4000-8000-000000000001','approve',array['work_inspected','satisfied','close_booking'],'Return work approved','return-inspect')$$,'customer closes return visit');
select is((select status from public.booking_return_visits where id=current_setting('warsha_test.return')::uuid),'completed','return visit completes in its own section');
select is((select warranty_days from public.booking_operations where booking_id='c1400000-0000-4000-8000-000000000001'),30,'return section cannot weaken original warranty');
select is((select count(*)::integer from public.reviews where booking_id='c1400000-0000-4000-8000-000000000001'),1,'completed return visit does not unlock a duplicate review row');

select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000004',true);
select ok(jsonb_array_length(public.get_booking_operation('c1400000-0000-4000-8000-000000000001')->'events')>10,'staff can audit the full participant timeline');
select ok((select count(*) from public.booking_operation_events where booking_id='c1400000-0000-4000-8000-000000000001')>10,'staff RLS can inspect immutable events');
select throws_ok($$update public.booking_operation_events set note='tampered' where booking_id='c1400000-0000-4000-8000-000000000001'$$,'42501',null,'authenticated staff has no direct timeline update grant');
reset role;
select throws_ok($$update public.booking_operation_events set note='tampered' where booking_id='c1400000-0000-4000-8000-000000000001'$$,'42501','Operational timeline events are immutable','immutable trigger also blocks privileged rewrites');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000004',true);

select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('booking_operations','booking_operation_events','job_progress_media','booking_additional_work_requests','booking_return_visits')),5,'participant operational tables are available for RLS-scoped Realtime invalidation');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='private'),0,'no private operational data is published');

reset role;
select * from finish();
rollback;
