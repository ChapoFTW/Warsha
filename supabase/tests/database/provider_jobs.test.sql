begin;

select plan(29);

-- Test-only identities. These rows are rolled back and are never seed accounts.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','jobs-customer-1@test.local','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','jobs-customer-2@test.local','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','authenticated','authenticated','jobs-provider-1@test.local','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000002','authenticated','authenticated','jobs-provider-2@test.local','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000003','authenticated','authenticated','jobs-provider-3@test.local','',pg_catalog.now(),'{}','{}',pg_catalog.now(),pg_catalog.now());

insert into public.profiles(id,display_name) values
  ('10000000-0000-0000-0000-000000000001','Jobs customer one'),
  ('10000000-0000-0000-0000-000000000002','Jobs customer two'),
  ('20000000-0000-0000-0000-000000000001','Jobs provider one'),
  ('20000000-0000-0000-0000-000000000002','Jobs provider two'),
  ('20000000-0000-0000-0000-000000000003','Jobs provider three');
insert into public.customer_profiles(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published) values
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Jobs provider one','professional','approved',true),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Jobs provider two','professional','approved',true),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','Jobs provider three','professional','submitted',false);

select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select v.id::uuid,'10000000-0000-0000-0000-000000000001',v.provider_id::uuid,s.id,'pending_provider_approval','Test service','fixed',100,'A test booking issue',current_date + 3,'12:00','Test area',v.key
from (values
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','jobs-accept'),
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','jobs-wrong-provider'),
  ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','jobs-unapproved'),
  ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','jobs-invalid-transition'),
  ('40000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','jobs-proposal-accept'),
  ('40000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000001','jobs-proposal-reject'),
  ('40000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000001','jobs-proposal-cancel')
) as v(id,provider_id,key)
cross join lateral (select id from public.services where is_active and deleted_at is null order by id limit 1) s;

-- A published seed-style provider has no owner and therefore cannot act.
insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published)
values('30000000-0000-0000-0000-000000000004',null,'Unclaimable seed provider','professional','approved',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select '40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',s.id,'pending_provider_approval','Test service','fixed',100,'A test booking issue',current_date + 3,'12:00','Test area','jobs-seeded-provider'
from public.services s where s.is_active and s.deleted_at is null order by s.id limit 1;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.accept_provider_booking('40000000-0000-0000-0000-000000000001')$$,
  '22023','Booking action is not available','a customer cannot accept a provider booking'
);

select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.accept_provider_booking('40000000-0000-0000-0000-000000000001')$$,'assigned approved provider can accept');
select is((select count(*)::integer from public.booking_status_history where booking_id='40000000-0000-0000-0000-000000000001' and status='accepted'),1,'accept creates exactly one history row');
select throws_ok($$select public.accept_provider_booking('40000000-0000-0000-0000-000000000001')$$,'22023','Booking action is not available','duplicate accept is rejected');
select throws_ok($$select public.accept_provider_booking('40000000-0000-0000-0000-000000000002')$$,'22023','Booking action is not available','wrong provider is rejected');
select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.accept_provider_booking('40000000-0000-0000-0000-000000000003')$$,'22023','Booking action is not available','unapproved provider booking is unavailable');
select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.accept_provider_booking('40000000-0000-0000-0000-000000000004')$$,'22023','Booking action is not available','ownerless seeded provider booking is unavailable');
select throws_ok($$select public.advance_provider_booking_status('40000000-0000-0000-0000-000000000005','provider_arrived',null)$$,'22023','Booking action is not available','invalid progression is rejected');

select lives_ok($$select public.propose_provider_reschedule('40000000-0000-0000-0000-000000000006',current_date + 5,'14:00','Customer requested a later visit')$$,'provider can propose a future schedule');
select is((select scheduled_date from public.bookings where id='40000000-0000-0000-0000-000000000006'),current_date + 3,'proposal preserves original date');
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.accept_provider_reschedule('40000000-0000-0000-0000-000000000006')$$,'22023','Reschedule response is not available','another customer cannot accept proposal');
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.accept_provider_reschedule('40000000-0000-0000-0000-000000000006')$$,'booking customer can accept proposal');
select is((select scheduled_date from public.bookings where id='40000000-0000-0000-0000-000000000006'),current_date + 5,'accepted proposal updates schedule');
select throws_ok($$select public.accept_provider_reschedule('40000000-0000-0000-0000-000000000006')$$,'22023','Reschedule response is not available','proposal cannot be accepted twice');

select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.propose_provider_reschedule('40000000-0000-0000-0000-000000000007',current_date + 6,'15:00','A later slot is available')$$,'second proposal is created');
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.reject_provider_reschedule('40000000-0000-0000-0000-000000000007')$$,'booking customer can reject proposal');
select is((select status from public.bookings where id='40000000-0000-0000-0000-000000000007'),'pending_provider_approval','rejection restores prior actionable state');
select is((select proposed_scheduled_date is null and proposal_from_status is null from public.bookings where id='40000000-0000-0000-0000-000000000007'),true,'rejection clears proposal state');
select throws_ok($$select public.reject_provider_reschedule('40000000-0000-0000-0000-000000000007')$$,'22023','Reschedule response is not available','proposal cannot be rejected twice');

select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.propose_provider_reschedule('40000000-0000-0000-0000-000000000008',current_date + 7,'16:00','A different day is available')$$,'proposal for cancellation test is created');
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.cancel_customer_booking('40000000-0000-0000-0000-000000000008','plans changed')$$,'customer can cancel while awaiting proposal');

select pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $test$do $action$
  begin
    perform public.advance_provider_booking_status('40000000-0000-0000-0000-000000000001','confirmed',null);
    perform public.advance_provider_booking_status('40000000-0000-0000-0000-000000000001','provider_on_the_way',null);
    perform public.advance_provider_booking_status('40000000-0000-0000-0000-000000000001','provider_arrived',null);
    perform public.advance_provider_booking_status('40000000-0000-0000-0000-000000000001','job_started',null);
  end;
  $action$;$test$,
  'valid assigned-provider progression reaches work start'
);
select lives_ok(
  $$insert into public.booking_attachments(booking_id,uploader_id,storage_path,mime_type,attachment_kind) values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/completion/evidence.jpg','image/jpeg','completion_evidence')$$,
  'assigned provider can add completion-evidence metadata after work starts'
);
select is((select count(*)::integer from public.booking_attachments where booking_id='40000000-0000-0000-0000-000000000001'),1,'assigned provider can read completion evidence metadata');
select pg_catalog.set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.booking_attachments where booking_id='40000000-0000-0000-0000-000000000001'),0,'unrelated customer cannot read completion evidence metadata');
select throws_ok(
  $$insert into public.booking_attachments(booking_id,uploader_id,storage_path,mime_type,attachment_kind) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000001/completion/forged.jpg','image/jpeg','completion_evidence')$$,
  '42501','new row violates row-level security policy for table "booking_attachments"','customer cannot forge completion-evidence metadata'
);

reset role;
select is((select count(*)::integer from public.notifications where user_id='10000000-0000-0000-0000-000000000001' and type='booking_accepted' and data->>'booking_id'='40000000-0000-0000-0000-000000000001'),1,'successful accept creates one customer notification');
select is((select count(*)::integer from public.notifications where user_id='20000000-0000-0000-0000-000000000001' and data->>'booking_id'='40000000-0000-0000-0000-000000000008' and type='booking_cancelled'),1,'customer cancellation notifies the assigned provider once');
select is((select count(*)::integer from public.booking_status_history where booking_id='40000000-0000-0000-0000-000000000008' and status='cancelled'),1,'proposal cancellation creates one history row');

select * from finish();
rollback;
