begin;
select no_plan();
select set_config('storage.allow_delete_query','true',true);

select has_table('public','disputes','existing dispute table remains canonical');
select has_table('public','dispute_evidence','existing evidence table is extended');
select has_table('public','dispute_events','immutable dispute timeline exists');
select has_table('private','dispute_policy_config','server policy configuration exists');
select has_function('public','get_booking_dispute',array['uuid'],'participant projection exists');
select has_function('public','create_booking_dispute_draft',array['uuid','text','text','text'],'customer draft RPC exists');
select has_function('public','submit_booking_dispute',array['uuid','text'],'submit RPC exists');
select has_function('public','respond_booking_dispute',array['uuid','text','text','text'],'participant response RPC exists');
select has_function('public','register_dispute_evidence',array['uuid','text','text','text','text'],'evidence registration RPC exists');
select has_function('public','withdraw_booking_dispute',array['uuid','text','text'],'withdrawal RPC exists');
select has_function('public','assign_booking_dispute',array['uuid','text','text'],'staff assignment RPC exists');
select has_function('public','request_dispute_evidence',array['uuid','text','text','text'],'staff evidence request RPC exists');
select has_function('public','start_dispute_review',array['uuid','text','text'],'staff review RPC exists');
select has_function('public','add_dispute_staff_note',array['uuid','text','boolean','text'],'staff note RPC exists');
select has_function('public','resolve_booking_dispute',array['uuid','text','text','text','uuid','bigint','text'],'resolution RPC exists');
select has_function('public','reject_booking_dispute',array['uuid','text','text'],'rejection RPC exists');
select has_function('public','close_booking_dispute',array['uuid','text','text'],'closure RPC exists');
select is(has_table_privilege('authenticated','public.disputes','INSERT'),false,'clients cannot forge cases');
select is(has_table_privilege('authenticated','public.disputes','UPDATE'),false,'clients cannot force transitions');
select is(has_table_privilege('authenticated','public.dispute_evidence','INSERT'),false,'clients cannot forge evidence metadata');
select is(has_table_privilege('authenticated','public.dispute_events','UPDATE'),false,'clients cannot edit history');
select is(has_table_privilege('authenticated','public.dispute_events','DELETE'),false,'clients cannot delete history');
select is(has_column_privilege('authenticated','public.disputes','id','SELECT'),true,'safe case identifiers support RLS-scoped invalidation');
select is(has_column_privilege('authenticated','public.disputes','assigned_to','SELECT'),false,'staff assignment identity is not directly exposed');
select is(has_column_privilege('authenticated','public.disputes','financial_reference_id','SELECT'),false,'financial references are not directly exposed');
select is(has_column_privilege('authenticated','public.dispute_evidence','storage_path','SELECT'),false,'private evidence paths are not directly exposed');
select is(has_column_privilege('authenticated','public.dispute_events','actor_id','SELECT'),false,'timeline actor identities are not directly exposed');
select is((select public from storage.buckets where id='dispute-evidence'),false,'evidence bucket is private');
select is((select file_size_limit from storage.buckets where id='dispute-evidence'),8388608::bigint,'evidence is limited to 8 MB');
select is((select allowed_mime_types from storage.buckets where id='dispute-evidence'),array['image/jpeg','image/png','image/webp','image/heic','application/pdf']::text[],'evidence MIME allowlist is exact');
select is((select post_completion_window_hours from private.dispute_policy_config where singleton),336,'completion window is configurable');
select is((select max_evidence_files from private.dispute_policy_config where singleton),10,'evidence count is configurable');
select is(private.dispute_can_transition('draft','submitted'),true,'draft may submit');
select is(private.dispute_can_transition('submitted','under_review'),true,'submitted may enter review');
select is(private.dispute_can_transition('under_review','cancelled'),false,'customer cannot withdraw after review starts');
select is(private.dispute_can_transition('resolved','closed'),true,'resolved may close');
select is(private.is_safe_dispute_evidence_path('../bad.pdf','d1300000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001'),false,'unsafe paths are rejected');

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','d1300000-0000-4000-8000-000000000001','authenticated','authenticated','wps013-customer@test.local',null,'',now(),null,'{}','{"display_name":"Dispute Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','d1300000-0000-4000-8000-000000000002','authenticated','authenticated','wps013-other@test.local',null,'',now(),null,'{}','{"display_name":"Unrelated User"}',now(),now()),
('00000000-0000-0000-0000-000000000000','d1300000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000001303','',null,now(),'{}','{"display_name":"Dispute Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','d1300000-0000-4000-8000-000000000004','authenticated','authenticated','wps013-staff@test.local',null,'',now(),null,'{}','{"display_name":"Dispute Staff"}',now(),now());
insert into public.user_roles(user_id,role) values('d1300000-0000-4000-8000-000000000004','admin') on conflict do nothing;
insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,service_radius_km,is_verified,is_available,is_published,onboarding_status)
values('d1400000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000003','Dispute Worker','plumbing','plumbing',array['plumbing'],'Evidence-based dispute fixture provider.',6,15,true,true,true,'approved');
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('d1400000-0000-4000-8000-000000000001','approved',1,now());
insert into public.provider_services(provider_id,service_id,is_active) select 'd1400000-0000-4000-8000-000000000001',id,true from public.services where category_id='plumbing' order by id limit 1;

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,final_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select 'd1500000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001',s.id,'completed','Dispute fixture','fixed',300,300,'Completed repair with a disputed quality outcome',current_date,'12:00','Private dispute address','wps013-booking'
from public.services s where s.category_id='plumbing' order by s.id limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.submit_booking_review_v2('d1500000-0000-4000-8000-000000000001',3::smallint,4::smallint,3::smallint,4::smallint,4::smallint,3::smallint,'The repair needs another inspection.',false,'{}'::text[])$$,'existing WPS-011 review is created normally');
select is(public.get_booking_dispute('d1500000-0000-4000-8000-000000000001'),null,'eligible booking starts without a dispute');
select lives_ok($$select public.create_booking_dispute_draft('d1500000-0000-4000-8000-000000000001','poor_quality','The completed repair is leaking again and needs review.','draft-create-013')$$,'customer opens a draft');
select set_config('warsha_test.dispute',(select id::text from public.disputes where booking_id='d1500000-0000-4000-8000-000000000001'),true);
select is(public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')->>'state','draft','customer sees own draft');
select is((select moderation_status from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),'visible','draft does not delay review publication');
select is((select count(id)::integer from public.dispute_events where dispute_id=current_setting('warsha_test.dispute')::uuid),1,'draft creates one immutable bootstrap event');
select throws_ok($$select public.create_booking_dispute_draft('d1500000-0000-4000-8000-000000000001','other','Another active case should not be created.','draft-create-other')$$,'42501','Dispute is not available','one active dispute per booking is enforced');

select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('dispute-evidence','d1300000-0000-4000-8000-000000000001/d1500000-0000-4000-8000-000000000001/'||current_setting('warsha_test.dispute')||'/evidence/aaaaaaaaaaaa.pdf','d1300000-0000-4000-8000-000000000001','{"mimetype":"application/pdf","size":4096}'::jsonb)$$,'customer stages a safe private PDF');
select lives_ok($$select public.register_dispute_evidence(current_setting('warsha_test.dispute')::uuid,'d1300000-0000-4000-8000-000000000001/d1500000-0000-4000-8000-000000000001/'||current_setting('warsha_test.dispute')||'/evidence/aaaaaaaaaaaa.pdf','inspection.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','evidence-client-013')$$,'server registers owner-validated evidence');
select is((select byte_size from public.dispute_evidence where dispute_id=current_setting('warsha_test.dispute')::uuid),4096::bigint,'server records object size');
select is((select mime_type from public.dispute_evidence where dispute_id=current_setting('warsha_test.dispute')::uuid),'application/pdf','server records object MIME');
select is(jsonb_array_length(public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')->'evidence'),1,'customer projection contains registered private evidence');
select lives_ok($$delete from storage.objects where bucket_id='dispute-evidence' and name like 'd1300000-0000-4000-8000-000000000001/%'$$,'registered evidence delete attempt safely affects no rows');
select is((select count(*)::integer from storage.objects where bucket_id='dispute-evidence' and name like 'd1300000-0000-4000-8000-000000000001/%'),1,'registered evidence cannot be deleted by owner');

select lives_ok($$select public.submit_booking_dispute(current_setting('warsha_test.dispute')::uuid,'submit-case-013')$$,'customer submits draft');
select lives_ok($$select public.submit_booking_dispute(current_setting('warsha_test.dispute')::uuid,'submit-case-013')$$,'submit retry is idempotent');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'submitted','case reaches submitted');
select is((select moderation_status from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),'flagged','submitted case delays public review publication');
reset role;
select is((select dispute_publication_hold_id from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),current_setting('warsha_test.dispute')::uuid,'review hold records its case');
set local role authenticated;
select is((select count(*)::integer from public.messages where booking_id='d1500000-0000-4000-8000-000000000001' and metadata->>'event'='dispute_submitted'),1,'submitted event projects once into WPS-009');
reset role;
select is((select count(*)::integer from public.notifications where user_id='d1300000-0000-4000-8000-000000000003' and type='dispute_opened'),1,'worker receives one durable opened notification');
set local role authenticated;

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')$$,'42501','Dispute not found','unrelated user cannot use the participant projection');
select is((select count(id)::integer from public.disputes where booking_id='d1500000-0000-4000-8000-000000000001'),0,'unrelated user RLS sees no case row');
select is((select count(id)::integer from public.dispute_evidence where booking_id='d1500000-0000-4000-8000-000000000001'),0,'unrelated user RLS sees no evidence metadata');
select is((select count(id)::integer from public.dispute_events where booking_id='d1500000-0000-4000-8000-000000000001'),0,'unrelated user RLS sees no timeline');

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000003',true);
select is(public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')->>'state','submitted','worker sees submitted case');
select is(jsonb_array_length(public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')->'evidence'),1,'worker sees private evidence through participant projection');
select lives_ok($$select public.respond_booking_dispute(current_setting('warsha_test.dispute')::uuid,'contest','I contest the claim and request staff review.','worker-contest-013')$$,'worker contests with an immutable response');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'waiting_staff','worker response waits for staff');
select is((select count(*)::integer from public.messages where booking_id='d1500000-0000-4000-8000-000000000001' and metadata->>'event'='dispute_response' and body='I contest the claim and request staff review.'),1,'participant response reuses the booking conversation');

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.assign_booking_dispute(current_setting('warsha_test.dispute')::uuid,'Assigned for fair review.','staff-assign-013')$$,'staff assigns the case');
select lives_ok($$select public.add_dispute_staff_note(current_setting('warsha_test.dispute')::uuid,'Internal evidence assessment.',false,'staff-private-note-013')$$,'staff adds an internal note');
select ok((select exists(select 1 from public.dispute_events where dispute_id=current_setting('warsha_test.dispute')::uuid and visibility='staff' and note='Internal evidence assessment.')),'staff audit contains private note');
select lives_ok($$select public.request_dispute_evidence(current_setting('warsha_test.dispute')::uuid,'customer','Please confirm when the leak returned.','staff-request-customer-013')$$,'staff requests customer evidence');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'waiting_customer','case waits for customer');
reset role;
select is((select count(*)::integer from public.notifications where user_id='d1300000-0000-4000-8000-000000000001' and type='dispute_evidence_requested'),1,'customer evidence request is durable and deduplicated');
set local role authenticated;

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000001',true);
select is((public.get_booking_dispute('d1500000-0000-4000-8000-000000000001')->'events')::text like '%Internal evidence assessment.%',false,'participant projection hides internal note');
select lives_ok($$select public.respond_booking_dispute(current_setting('warsha_test.dispute')::uuid,'respond','The leak returned the morning after completion.','customer-response-013')$$,'customer responds when requested');

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.start_dispute_review(current_setting('warsha_test.dispute')::uuid,'Reviewing all existing booking evidence.','staff-review-013')$$,'staff starts review');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'under_review','case reaches under review');
select throws_ok($$select public.resolve_booking_dispute(current_setting('warsha_test.dispute')::uuid,'partial_compensation','Partial compensation requires financial authority.','none',null,null,'bad-finance-013')$$,'22023','Invalid financial delegation','partial compensation cannot bypass WPS-007');

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.withdraw_booking_dispute(current_setting('warsha_test.dispute')::uuid,'Trying to withdraw during review.','late-withdraw-013')$$,'42501','Dispute cannot be withdrawn','customer cannot withdraw after review starts');

select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.resolve_booking_dispute(current_setting('warsha_test.dispute')::uuid,'return_visit','Worker will return to correct the leaking repair.','none',null,null,'resolve-return-013')$$,'staff resolves through WPS-012 return visit');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'resolved','case reaches resolved');
select is((select count(*)::integer from public.booking_return_visits where booking_id='d1500000-0000-4000-8000-000000000001'),1,'resolution reuses one WPS-012 return visit');
select is((select count(*)::integer from public.bookings where id='d1500000-0000-4000-8000-000000000001'),1,'return resolution never duplicates booking');
select is((select count(*)::integer from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),1,'return resolution preserves one review');
select is((select moderation_status from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),'visible','terminal resolution restores case-held review');
reset role;
select is((select dispute_publication_hold_id from public.reviews where booking_id='d1500000-0000-4000-8000-000000000001'),null,'terminal resolution clears review hold');
set local role authenticated;
select lives_ok($$select public.close_booking_dispute(current_setting('warsha_test.dispute')::uuid,'Resolution recorded and case closed.','staff-close-013')$$,'staff closes resolved case');
select is((select status from public.disputes where id=current_setting('warsha_test.dispute')::uuid),'closed','case reaches closed');
select set_config('request.jwt.claim.sub','d1300000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_booking_dispute_draft('d1500000-0000-4000-8000-000000000001','other','A decided booking cannot be opened again.','draft-after-decision-013')$$,'42501','Dispute is not available','resolved or closed dispute permanently blocks another case');
reset role;
select is((select count(*)::integer from public.notifications where user_id in ('d1300000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000003') and type='dispute_resolved'),2,'resolution notifies both participants once');
select is((select count(*)::integer from public.notifications where user_id in ('d1300000-0000-4000-8000-000000000001','d1300000-0000-4000-8000-000000000003') and type='dispute_closed'),2,'closure notifies both participants once');
set local role authenticated;
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('disputes','dispute_events')),2,'participant case tables support RLS-scoped invalidation');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dispute_evidence'),0,'evidence metadata is not published');

reset role;
select throws_ok($$update public.dispute_events set note='tampered' where dispute_id=current_setting('warsha_test.dispute')::uuid$$,'55000','Dispute history is immutable','immutable trigger blocks privileged rewrites');
select * from finish();
rollback;
