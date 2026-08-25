begin;
select * from no_plan();

select has_table('public','marketplace_requests','AC-008 durable marketplace requests exist');
select has_table('public','quote_invitations','AC-008 durable invitations exist');
select has_table('public','worker_quotes','AC-008 durable quotes exist');
select has_table('public','worker_quote_revisions','AC-008 immutable quote revisions exist');
select has_table('private','marketplace_jobs','AC-008 authoritative job queue exists');
select has_table('private','marketplace_candidate_scores','AC-008 internal scores are private');
select has_table('private','worker_pricing_profiles','AC-008 pricing profiles are private');
select has_table('private','worker_capacity_projections','AC-008 capacity projections are private');
select has_table('public','marketplace_no_show_events','AC-008 no-show evidence is durable');
select has_table('public','marketplace_running_late_events','AC-008 Running Late events are durable');
select has_table('public','marketplace_comeback_requests','AC-008 comeback contract exists');
select has_function('public','create_marketplace_request',array['jsonb','text'],'customer create RPC exists');
select has_function('public','edit_marketplace_request',array['uuid','integer','jsonb','text'],'customer edit RPC exists');
select has_function('public','select_worker_quote',array['uuid','uuid','integer','text'],'race-safe select RPC exists');
select has_function('public','submit_worker_quote',array['uuid','jsonb','text'],'worker quote RPC exists');
select has_function('public','revise_worker_quote',array['uuid','jsonb','text'],'preselection quote revision RPC exists');
select has_function('public','accept_emergency_request',array['uuid','text'],'atomic Emergency RPC exists');
select has_function('private','lease_marketplace_jobs',array['text','integer'],'SKIP LOCKED lease RPC exists');
select is(has_function_privilege('anon','public.create_marketplace_request(jsonb,text)','EXECUTE'),false,'anonymous cannot create requests');
select is(has_function_privilege('authenticated','public.create_marketplace_request(jsonb,text)','EXECUTE'),true,'authenticated customer can invoke guarded create');
select is(has_function_privilege('authenticated','private.create_marketplace_wave(uuid,text,text)','EXECUTE'),false,'clients cannot invoke matching waves');
select is(has_table_privilege('authenticated','private.marketplace_candidate_scores','SELECT'),false,'clients cannot read scores');
select is((select enabled from private.marketplace_configuration where singleton),true,'request-readiness migration activates the Development marketplace contract');
select is((select scheduler_enabled from private.marketplace_configuration where singleton),true,'request-readiness migration activates the marketplace scheduler contract');
select is((select useful_quote_target from private.marketplace_configuration where singleton),5,'useful quote target is five');
select is((select request_lifetime_seconds from private.marketplace_configuration where singleton),600,'request lifetime is ten minutes');
select is((select initial_collection_seconds from private.marketplace_configuration where singleton),120,'initial collection window is two minutes');
select is((select edit_window_seconds from private.marketplace_configuration where singleton),300,'edit window is five minutes');
select is((select worker_no_show_seconds from private.marketplace_configuration where singleton),900,'worker no-show threshold is fifteen minutes');
select is((select count(*)::integer from private.marketplace_category_warranty_configuration where enabled),0,'warranties fail closed by category');

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000001','authenticated','authenticated','market-customer@test.local',null,'',now(),null,'{}','{"display_name":"Market Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000202','',null,now(),'{}','{"display_name":"Market Worker One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000003','authenticated','authenticated',null,'+201000000203','',null,now(),'{}','{"display_name":"Market Worker Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000004','authenticated','authenticated',null,'+201000000204','',null,now(),'{}','{"display_name":"Unavailable Worker"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('92000000-0000-0000-0001-000000000002','92000000-0000-0000-0000-000000000002','Market Worker One','plumbing','plumbing',array['plumbing'],'Complete marketplace worker profile one.','92000000-0000-0000-0000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,40,4.8,20,true),
('92000000-0000-0000-0001-000000000003','92000000-0000-0000-0000-000000000003','Market Worker Two','plumbing','plumbing',array['plumbing'],'Complete marketplace worker profile two.','92000000-0000-0000-0000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,4,4.6,3,true),
('92000000-0000-0000-0001-000000000004','92000000-0000-0000-0000-000000000004','Unavailable Worker','plumbing','plumbing',array['plumbing'],'Complete unavailable marketplace profile.','92000000-0000-0000-0000-000000000004/avatar/profile.jpg',true,false,true,'approved',50,100,5,50,true);
insert into public.user_roles(user_id,role) values
('92000000-0000-0000-0000-000000000002','provider'),('92000000-0000-0000-0000-000000000003','provider'),('92000000-0000-0000-0000-000000000004','provider') on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values
('92000000-0000-0000-0001-000000000002','approved',1,now()),
('92000000-0000-0000-0001-000000000003','approved',1,now()),
('92000000-0000-0000-0001-000000000004','approved',1,now());

select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,transportation_fee_egp,emergency_surcharge_egp,is_active)
select p,(current_setting('warsha_test.service_id'))::uuid,base,'quote',25,emergency,true from (values
('92000000-0000-0000-0001-000000000002'::uuid,200::numeric,50::numeric),
('92000000-0000-0000-0001-000000000003'::uuid,240::numeric,75::numeric),
('92000000-0000-0000-0001-000000000004'::uuid,100::numeric,10::numeric)
) v(p,base,emergency);
insert into public.provider_service_areas(provider_id,governorate,district,radius_km) values
('92000000-0000-0000-0001-000000000002','Cairo','Zamalek',50),
('92000000-0000-0000-0001-000000000003','Cairo','Zamalek',50),
('92000000-0000-0000-0001-000000000004','Cairo','Zamalek',50);
insert into storage.objects(bucket_id,name) values
('profile-images','92000000-0000-0000-0000-000000000002/avatar/profile.jpg'),
('profile-images','92000000-0000-0000-0000-000000000003/avatar/profile.jpg'),
('profile-images','92000000-0000-0000-0000-000000000004/avatar/profile.jpg');
insert into private.worker_matching_locations(provider_id,latitude,longitude,source,verification_state) values
('92000000-0000-0000-0001-000000000002',30.0500,31.2300,'operations','verified'),
('92000000-0000-0000-0001-000000000003',30.0600,31.2400,'operations','verified'),
('92000000-0000-0000-0001-000000000004',30.0400,31.2200,'operations','verified');
insert into public.provider_emergency_categories(provider_id,category_id,enabled) values
('92000000-0000-0000-0001-000000000002','plumbing',true),
('92000000-0000-0000-0001-000000000003','plumbing',true),
('92000000-0000-0000-0001-000000000004','plumbing',true);
insert into public.addresses(id,customer_id,label,address_line,street,building,governorate,district,latitude,longitude,is_default)
values('92000000-0000-0000-0002-000000000001','92000000-0000-0000-0000-000000000001','Home','10 Test Street','Test Street','10','Cairo','Zamalek',30.0510,31.2310,true);
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;
update private.marketplace_capacity_configuration set road_factor=1.3,average_urban_speed_kmh=30 where singleton;

-- The activation migration is the shipped state. Exercise the kill switch
-- explicitly before restoring readiness for the creation-path assertions.
update private.marketplace_configuration set enabled=false,scheduler_enabled=false where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.create_marketplace_request('{"flowKind":"get_quotes","categoryId":"plumbing","addressId":"92000000-0000-0000-0002-000000000001","issueDescription":"Kitchen tap is leaking badly","scheduleKind":"asap","paymentCompatibility":"either"}'::jsonb,'marketplace-disabled-0001')$$,
  '55000','Marketplace is temporarily unavailable','creation fails closed before scheduler activation'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

update private.marketplace_configuration set enabled=true,scheduler_enabled=true where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.set_worker_emergency_category('plumbing',false)$$,
  'worker can disable an existing emergency category opt-in'
);
select is(
  (select enabled from public.provider_emergency_categories where provider_id='92000000-0000-0000-0001-000000000002' and category_id='plumbing'),
  false,
  'emergency category opt-in is updated through the guarded RPC'
);
select lives_ok(
  $$select public.set_worker_emergency_category('plumbing',true)$$,
  'worker can restore the emergency category opt-in'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','92000000-0000-0000-0002-000000000001','issueDescription','Kitchen tap is leaking badly','scheduleKind','asap','paymentCompatibility','either'),'marketplace-create-0000001')$$,
  'eligible customer can create a quote request'
);
select set_config('warsha_test.request_id',(select id::text from public.marketplace_requests where idempotency_key='marketplace-create-0000001'),true);
reset role;
select set_config('request.jwt.claim.sub','',true);

select is((select status from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),'collecting_quotes','request enters quote collection');
select is((select expires_at-created_at from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),interval '10 minutes','expiry is authoritative from creation');
select is((select collection_not_before-created_at from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),interval '2 minutes','fairness window is authoritative from creation');
select is((select edit_deadline_at-created_at from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),interval '5 minutes','edit window is authoritative from creation');
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request_id')::uuid),2,'only two eligible available workers are invited');
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request_id')::uuid and provider_id='92000000-0000-0000-0001-000000000004'),0,'Unavailable worker is hard-filtered');
select ok((select every(distance_km<=5) from private.marketplace_candidate_scores s join private.marketplace_matching_runs r on r.id=s.matching_run_id where r.request_id=current_setting('warsha_test.request_id')::uuid),'first wave respects controlled radius');
select is((select count(*)::integer from private.marketplace_jobs where request_id=current_setting('warsha_test.request_id')::uuid and job_kind='expire_request'),1,'request expiry job is durable');
select ok((select exact_address_snapshot like '%Test Street%' from private.marketplace_request_locations where request_id=current_setting('warsha_test.request_id')::uuid),'exact address is stored privately');
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name='marketplace_requests' and column_name like '%address_snapshot%'),0,'public request has no exact address snapshot');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.quote_invitations),0,'customer cannot enumerate candidate invitations');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request_id')::uuid),1,'worker sees only own invitation for the request');
select set_config('warsha_test.invitation_one',(select id::text from public.quote_invitations where request_id=current_setting('warsha_test.request_id')::uuid),true);
select lives_ok($$select public.view_quote_invitation(current_setting('warsha_test.invitation_one')::uuid)$$,'worker can view owned invitation');
select lives_ok(
  $$select public.submit_worker_quote(current_setting('warsha_test.invitation_one')::uuid,'{"priceMinor":22500,"etaMinutes":25,"estimatedDurationMinutes":90,"message":"I can arrive soon","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"Parts agreed separately","supportedPaymentMethods":["cash","online"]}'::jsonb,'market-quote-submit-0001')$$,
  'worker submits complete initial quote'
);
select set_config('warsha_test.quote_one',(select id::text from public.worker_quotes where request_id=current_setting('warsha_test.request_id')::uuid and provider_id='92000000-0000-0000-0001-000000000002'),true);
select throws_ok(
  $$select public.revise_worker_quote(current_setting('warsha_test.quote_one')::uuid,'{"priceMinor":23000,"etaMinutes":25,"estimatedDurationMinutes":90,"message":"With warranty","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"Parts separate","warrantyDays":30,"supportedPaymentMethods":["cash","online"]}'::jsonb,'market-quote-warranty-0001')$$,
  '22023','Warranty is unavailable for this category','unconfigured warranty fails closed'
);
select lives_ok(
  $$select public.revise_worker_quote(current_setting('warsha_test.quote_one')::uuid,'{"priceMinor":23000,"etaMinutes":20,"estimatedDurationMinutes":95,"message":"Updated arrival estimate","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"Parts agreed separately","supportedPaymentMethods":["cash","online"],"revisionReason":"Traffic improved"}'::jsonb,'market-quote-revise-00001')$$,
  'worker can revise own quote before selection'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

select is((select current_revision from public.worker_quotes where id=current_setting('warsha_test.quote_one')::uuid),2,'quote current revision advances');
select is((select count(*)::integer from public.worker_quote_revisions where quote_id=current_setting('warsha_test.quote_one')::uuid),2,'both immutable quote revisions remain');
select is((select min((terms->>'priceMinor')::integer) from public.worker_quote_revisions where quote_id=current_setting('warsha_test.quote_one')::uuid),22500,'original quoted price remains immutable');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.select_worker_quote(current_setting('warsha_test.request_id')::uuid,current_setting('warsha_test.quote_one')::uuid,0,'market-select-too-early-1')$$,
  '40001','Quote cannot be selected','selection is blocked during fairness window'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.marketplace_requests set collection_not_before=created_at where id=current_setting('warsha_test.request_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.select_worker_quote(current_setting('warsha_test.request_id')::uuid,current_setting('warsha_test.quote_one')::uuid,0,'market-select-quote-00001')$$,
  'customer selects a non-forced quote after fairness window'
);
select is((public.get_customer_quotes(current_setting('warsha_test.request_id')::uuid,'best_value')->0->>'priceMinor')::integer,23000,'customer quote projection shows current revised terms');
select is(public.get_customer_quotes(current_setting('warsha_test.request_id')::uuid,'best_value')->0 ? 'components',false,'customer projection exposes no ranking components');
reset role;
select set_config('request.jwt.claim.sub','',true);

select is((select status from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),'selection_pending_confirmation','selection waits for worker confirmation');
select is((select status from public.worker_quotes where id=current_setting('warsha_test.quote_one')::uuid),'selected','selected quote is locked');
select is((select count(*)::integer from private.marketplace_jobs where request_id=current_setting('warsha_test.request_id')::uuid and job_kind='expire_confirmation'),1,'confirmation timeout job is durable');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.confirm_selected_quote(current_setting('warsha_test.request_id')::uuid,current_setting('warsha_test.quote_one')::uuid,'market-confirm-quote-0001')$$,
  'only selected worker confirms quote'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('warsha_test.booking_id',(select converted_booking_id::text from public.marketplace_requests where id=current_setting('warsha_test.request_id')::uuid),true);
select isnt(current_setting('warsha_test.booking_id'),'', 'confirmation creates one booking');
select is((select count(*)::integer from public.bookings where marketplace_request_id=current_setting('warsha_test.request_id')::uuid),1,'request converts at most once');
select is((select status from public.bookings where id=current_setting('warsha_test.booking_id')::uuid),'confirmed','existing booking lifecycle receives confirmed booking');
select is((select provider_gross_minor::integer from public.booking_price_snapshots where booking_id=current_setting('warsha_test.booking_id')::uuid and is_current),23000,'WPS-007 snapshot uses approved quote in integer piastres');
select is((select count(*)::integer from public.conversations where booking_id=current_setting('warsha_test.booking_id')::uuid),1,'existing booking chat is preserved');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.report_worker_running_late(current_setting('warsha_test.booking_id')::uuid,20,'traffic','Heavy traffic','market-running-late-0001')$$,
  'assigned worker can update authoritative ETA'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
select ok((select latest_eta_at>previous_eta_at from public.marketplace_running_late_events where booking_id=current_setting('warsha_test.booking_id')::uuid),'Running Late stores newer ETA');
select is((select count(*)::integer from public.notifications where type='worker_running_late' and user_id='92000000-0000-0000-0000-000000000001'),1,'customer receives deduplicated late notification');

update public.marketplace_running_late_events set latest_eta_at=now()-interval '16 minutes' where booking_id=current_setting('warsha_test.booking_id')::uuid and superseded_at is null;
set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.report_worker_no_show(current_setting('warsha_test.booking_id')::uuid,'{"area":"approximate","waited":true}'::jsonb,'market-worker-no-show-01')$$,
  'customer can report worker no-show fifteen minutes after latest ETA'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*)::integer from public.marketplace_no_show_events where booking_id=current_setting('warsha_test.booking_id')::uuid and reported_party_class='worker'),1,'worker no-show evidence is recorded once');
select is((select status from public.bookings where id=current_setting('warsha_test.booking_id')::uuid),'cancelled','worker no-show closes the failed booking');
select is((select count(*)::integer from private.marketplace_rescue_attempts where source_booking_id=current_setting('warsha_test.booking_id')::uuid),1,'worker no-show starts normal Rescue Mode');
select is((select count(*)::integer from public.marketplace_requests where rescue_for_booking_id=current_setting('warsha_test.booking_id')::uuid),1,'Rescue creates one linked replacement request');
select is((select excluded_provider_id from public.marketplace_requests where rescue_for_booking_id=current_setting('warsha_test.booking_id')::uuid),'92000000-0000-0000-0001-000000000002'::uuid,'Rescue excludes the failed worker');
select is((select count(*)::integer from public.financial_booking_payments where booking_id=current_setting('warsha_test.booking_id')::uuid),0,'no-show creates no automatic financial penalty');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.preview_emergency_request(jsonb_build_object('categoryId','plumbing','serviceId',current_setting('warsha_test.service_id')))$$,
  'customer can preview authoritative Emergency surcharge before creation'
);
select set_config('warsha_test.emergency_token',(public.preview_emergency_request(jsonb_build_object('categoryId','plumbing','serviceId',current_setting('warsha_test.service_id')))->>'approvalToken'),true);
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','emergency','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','92000000-0000-0000-0002-000000000001','issueDescription','Emergency pipe burst in kitchen','scheduleKind','asap','paymentCompatibility','either','emergencyApprovalToken',current_setting('warsha_test.emergency_token')),'market-emergency-create-01')$$,
  'approved Emergency request is created'
);
select set_config('warsha_test.emergency_request',(select id::text from public.marketplace_requests where idempotency_key='market-emergency-create-01'),true);
reset role;
select set_config('request.jwt.claim.sub','',true);
select is((select approved_emergency_surcharge_minor::integer from public.marketplace_requests where id=current_setting('warsha_test.emergency_request')::uuid),7500,'customer approved the displayed maximum surcharge');
select is((select count(*)::integer from private.emergency_dispatch_attempts where request_id=current_setting('warsha_test.emergency_request')::uuid),2,'Emergency dispatch invites eligible opted-in workers only');
select is((select count(*)::integer from public.worker_quotes where request_id=current_setting('warsha_test.emergency_request')::uuid),0,'Emergency has no quote competition');

select set_config('warsha_test.emergency_invitation',(select id::text from public.quote_invitations where request_id=current_setting('warsha_test.emergency_request')::uuid and provider_id='92000000-0000-0000-0001-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.accept_emergency_request(current_setting('warsha_test.emergency_invitation')::uuid,'market-emergency-accept-1')$$,
  'first valid Emergency acceptance wins'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*)::integer from private.emergency_dispatch_attempts where request_id=current_setting('warsha_test.emergency_request')::uuid and state='accepted'),1,'exactly one emergency attempt is accepted');
select is((select count(*)::integer from public.bookings where marketplace_request_id=current_setting('warsha_test.emergency_request')::uuid),1,'Emergency race creates one booking');
select is((select emergency_fee_minor::integer from public.booking_price_snapshots s join public.bookings b on b.id=s.booking_id where b.marketplace_request_id=current_setting('warsha_test.emergency_request')::uuid and s.is_current),5000,'winner surcharge never exceeds approved amount');

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.create_comeback_request(current_setting('warsha_test.booking_id')::uuid,'{"issueDescription":"The same leak returned"}'::jsonb,'market-comeback-disabled-1')$$,
  '22023','Comeback is unavailable','non-completed booking cannot claim warranty');
reset role;
select set_config('request.jwt.claim.sub','',true);

select set_config('warsha_test.expire_request',(select id::text from public.marketplace_requests where flow_kind='rescue' order by created_at desc limit 1),true);
update public.marketplace_requests set created_at=now()-interval '11 minutes',edit_deadline_at=now()-interval '6 minutes',collection_not_before=now()-interval '9 minutes',expires_at=now()-interval '1 second' where id=current_setting('warsha_test.expire_request')::uuid;
update private.marketplace_jobs set run_at=now()-interval '1 second' where request_id=current_setting('warsha_test.expire_request')::uuid and job_kind='expire_request';
select ok((select count(*)>0 from private.lease_marketplace_jobs('pgtap-worker',20)),'trusted worker leases due jobs with SKIP LOCKED');
select lives_ok(
  $$select private.run_marketplace_job(id) from private.marketplace_jobs where request_id=current_setting('warsha_test.expire_request')::uuid and job_kind='expire_request' and state='leased'$$,
  'authoritative expiry job runs without the app open'
);
select is((select status from public.marketplace_requests where id=current_setting('warsha_test.expire_request')::uuid),'expired','background job expires request authoritatively');
select is((select count(*)::integer from public.notifications where user_id='92000000-0000-0000-0000-000000000001' and type='marketplace_request_expired'),1,'expiry notification is durable and deduplicated');

select lives_ok($$select private.refresh_worker_marketplace_metrics(null)$$,'behavioral metrics refresh succeeds');
select lives_ok($$select private.refresh_worker_pricing_profiles(null)$$,'historical pricing refresh succeeds');
select lives_ok($$select private.refresh_worker_capacity(null)$$,'capacity projection refresh succeeds');
select ok((select count(*)>=2 from private.worker_marketplace_metrics),'versioned worker metrics are produced');
select ok((select count(*)>=1 from private.worker_opportunity_state),'bounded opportunity state is produced');

select * from finish();
rollback;
