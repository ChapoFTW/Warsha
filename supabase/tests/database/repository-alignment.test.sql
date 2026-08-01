begin;

select plan(35);

select is(
  (select count(*)::integer from public.service_categories where is_active and deleted_at is null),
  10,
  'exactly ten launch categories are active'
);
select set_eq(
  $$select id from public.service_categories where is_active and deleted_at is null$$,
  $$values ('plumbing'),('electrical'),('carpentry'),('ac'),('cleaning'),('painting'),('appliance-repair'),('satellite-tv-installation'),('moving-help'),('general-maintenance')$$,
  'active category ids match the locked launch taxonomy'
);
select has_function('public', 'mark_worker_available', array['boolean'], 'binary worker availability RPC exists');
select is(has_function_privilege('anon', 'public.mark_worker_available(boolean)', 'EXECUTE'), false, 'anonymous users cannot change worker availability');
select is(has_function_privilege('authenticated', 'public.mark_worker_available(boolean)', 'EXECUTE'), true, 'authenticated workers can invoke guarded availability');
select has_table('private', 'marketplace_capacity_configuration', 'private capacity configuration exists');
select has_table('private', 'marketplace_category_duration_defaults', 'private category duration defaults exist');
select is(has_table_privilege('authenticated', 'private.marketplace_capacity_configuration', 'SELECT'), false, 'capacity configuration is not client-readable');
select is(has_table_privilege('authenticated', 'private.marketplace_category_duration_defaults', 'SELECT'), false, 'category duration configuration is not client-readable');
select has_column('public', 'bookings', 'estimated_duration_minutes', 'bookings support structured duration');
select has_column('public', 'bookings', 'capacity_buffer_minutes', 'bookings store the locked capacity buffer');
select is((select fixed_buffer_minutes from private.marketplace_capacity_configuration where singleton), 30, 'capacity buffer is fixed to thirty minutes');
select is(private.deterministic_travel_minutes(30, 31, 30, 31, 1.3, 30), 0, 'deterministic travel fallback returns zero for identical points');
select is(private.deterministic_travel_minutes(null, 31, 30, 31, 1.3, 30), null, 'deterministic travel fallback fails closed on missing coordinates');

insert into auth.users(
  instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,
  phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000001','authenticated','authenticated','alignment-customer@test.local',null,'',now(),null,'{}','{"display_name":"Alignment Customer"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000102','',null,now(),'{}','{"display_name":"Verified Phone Worker"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000003','authenticated','authenticated','email-worker@test.local',null,'',now(),null,'{}','{"display_name":"Email Worker"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','91000000-0000-0000-0000-000000000004','authenticated','authenticated',null,'+201000000104','',null,now(),'{}','{"display_name":"Unverified Identity Worker"}',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.activate_provider_role('Email-only worker')$$,
  '42501',
  'Verified phone required',
  'new email-only account cannot activate a worker role'
);

select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.activate_provider_role('Verified Phone Worker')$$,
  'verified phone account can activate a worker role without email'
);
select lives_ok($$select public.mark_worker_available(true)$$, 'worker can choose Available');
reset role;
select set_config('request.jwt.claim.sub','',true);

select is(
  (select is_available from public.provider_profiles where user_id='91000000-0000-0000-0000-000000000002'),
  true,
  'binary availability is persisted on the owned worker profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select public.activate_provider_role('Unverified Identity Worker')$$,
  'phone-verified worker can prepare an unverified profile'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

update public.provider_profiles
set profession_key='plumbing', primary_category_id='plumbing', category_ids=array['plumbing'],
    onboarding_status='approved', is_published=true, is_available=true, deleted_at=null
where user_id in (
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000004'
);

insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select id,'approved',1,now()
from public.provider_profiles
where user_id='91000000-0000-0000-0000-000000000002';
update public.provider_profiles set is_verified=true where user_id='91000000-0000-0000-0000-000000000002';

insert into public.provider_verifications(provider_id,status,revision)
select id,'draft',0
from public.provider_profiles
where user_id='91000000-0000-0000-0000-000000000004';

insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select p.id,s.id,200,'fixed',true
from public.provider_profiles p
cross join lateral (
  select id from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1
) s
where p.user_id in (
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000004'
);

select set_config(
  'warsha_test.verified_provider_id',
  (select id::text from public.provider_profiles where user_id='91000000-0000-0000-0000-000000000002'),
  true
);
select set_config(
  'warsha_test.unverified_provider_id',
  (select id::text from public.provider_profiles where user_id='91000000-0000-0000-0000-000000000004'),
  true
);
select set_config(
  'warsha_test.unverified_service_id',
  (
    select ps.service_id::text
    from public.provider_services ps
    join public.provider_profiles p on p.id=ps.provider_id
    where p.user_id='91000000-0000-0000-0000-000000000004'
    limit 1
  ),
  true
);

set local role anon;
select is(
  (
    select count(*)::integer
    from pg_catalog.jsonb_array_elements(public.get_marketplace_catalog()->'providers') p
    where p->>'id'=current_setting('warsha_test.verified_provider_id')
  ),
  1,
  'approved identity-verified worker is publicly discoverable'
);
select is(
  (select count(*)::integer from pg_catalog.jsonb_array_elements(public.get_marketplace_catalog()->'providers') p where p->>'id'=current_setting('warsha_test.unverified_provider_id')),
  0,
  'unverified worker is hidden from the public marketplace catalog'
);
select ok(
  (
    select p ? 'is_verified'
      and p ? 'skill_certificate_verified'
      and not (
        p ?| array[
          'user_id', 'onboarding_status', 'provider_agreement_accepted_at',
          'temporary_unavailable_until', 'deleted_at', 'rejection_reason',
          'documents', 'national_id'
        ]
      )
    from pg_catalog.jsonb_array_elements(public.get_marketplace_catalog()->'providers') p
    where p->>'id'=current_setting('warsha_test.verified_provider_id')
  ),
  'public discovery exposes trust booleans without protected provider data'
);
select is(
  public.get_provider_trust_indicators(current_setting('warsha_test.unverified_provider_id')::uuid),
  '{}'::jsonb,
  'unverified worker has no public trust projection'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

insert into public.addresses(
  id,customer_id,label,address_line,governorate,district,latitude,longitude,is_default
) values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Alignment address','Test street','Cairo','Nasr City',30.05,31.25,true
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select throws_ok(
  format(
    'select public.create_customer_booking(%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    current_setting('warsha_test.unverified_provider_id')::uuid,
    current_setting('warsha_test.unverified_service_id')::uuid,
    'A sufficiently detailed unverified worker booking request',
    '',
    '92000000-0000-0000-0000-000000000001',
    current_date + 5,
    '12:00'::time,
    'scheduled',
    'alignment-unverified-direct-booking'
  ),
  '22023',
  'Service unavailable',
  'unverified worker cannot receive a direct booking'
);
reset role;
select set_config('request.jwt.claim.sub','',true);

insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',120,1);
update private.marketplace_capacity_configuration
set routing_provider='configured-routing-adapter', road_factor=1.3, average_urban_speed_kmh=30;

select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
insert into public.bookings(
  id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_id,
  address_snapshot,idempotency_key,estimated_duration_minutes,capacity_buffer_minutes
)
select
  '93000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',p.id,ps.service_id,'confirmed',
  'Capacity test','fixed',200,'Capacity test booking issue',current_date+10,'10:00',
  '92000000-0000-0000-0000-000000000001','Test address','alignment-capacity-booking',60,30
from public.provider_profiles p
join public.provider_services ps on ps.provider_id=p.id
where p.user_id='91000000-0000-0000-0000-000000000002'
limit 1;

select set_config('request.jwt.claim.sub','',true);

select is(
  private.worker_capacity_conflicts(
    (select provider_id from public.bookings where id='93000000-0000-0000-0000-000000000001'),
    (((current_date+10)+'11:29'::time) at time zone 'Africa/Cairo'),60,30.05,31.25,null
  ),
  true,
  'duration plus fixed buffer creates a hard overlap'
);
select is(
  private.worker_capacity_conflicts(
    (select provider_id from public.bookings where id='93000000-0000-0000-0000-000000000001'),
    (((current_date+10)+'11:30'::time) at time zone 'Africa/Cairo'),60,30.05,31.25,null
  ),
  false,
  'a proposal at the exact duration-plus-buffer boundary does not overlap'
);
select is(
  private.worker_capacity_conflicts(
    (select provider_id from public.bookings where id='93000000-0000-0000-0000-000000000001'),
    (((current_date+10)+'12:00'::time) at time zone 'Africa/Cairo'),60,null,null,null
  ),
  true,
  'missing proposed location fails closed when a conflict cannot be ruled out'
);

-- Chat history remains readable, while write timing is server-authoritative.
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
insert into public.bookings(
  id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_id,
  address_snapshot,idempotency_key
)
select
  '93000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000001',p.id,ps.service_id,'confirmed',
  'Chat cancellation test','fixed',200,'Chat cancellation booking issue',current_date+11,'10:00',
  '92000000-0000-0000-0000-000000000001','Test address','alignment-chat-cancel'
from public.provider_profiles p
join public.provider_services ps on ps.provider_id=p.id
where p.user_id='91000000-0000-0000-0000-000000000002'
limit 1;

set local role authenticated;
select lives_ok(
  $$select public.send_booking_message('93000000-0000-0000-0000-000000000002','text','Before cancellation',null,null,'94000000-0000-0000-0000-000000000001')$$,
  'active booking chat accepts a message'
);
reset role;
update public.bookings set status='cancelled',cancelled_at=now() where id='93000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok(
  $$select public.send_booking_message('93000000-0000-0000-0000-000000000002','text','After cancellation',null,null,'94000000-0000-0000-0000-000000000002')$$,
  '22023','Booking chat is read-only','cancelled booking chat locks immediately'
);
select lives_ok(
  $$select public.mark_booking_messages_read('93000000-0000-0000-0000-000000000002')$$,
  'cancelled booking history remains readable and markable as read'
);
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
insert into public.bookings(
  id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_id,
  address_snapshot,idempotency_key,estimated_duration_minutes,capacity_buffer_minutes
)
select
  '93000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000001',p.id,ps.service_id,'completed',
  'Completed chat test','fixed',200,'Completed chat booking issue',current_date+12,'10:00',
  '92000000-0000-0000-0000-000000000001','Test address','alignment-chat-completed',60,30
from public.provider_profiles p
join public.provider_services ps on ps.provider_id=p.id
where p.user_id='91000000-0000-0000-0000-000000000002'
limit 1;
select set_config('request.jwt.claim.sub','',true);
update public.booking_status_history
set created_at=now()-interval '47 hours 59 minutes'
where booking_id='93000000-0000-0000-0000-000000000003' and status='completed';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.send_booking_message('93000000-0000-0000-0000-000000000003','text','Within follow-up',null,null,'94000000-0000-0000-0000-000000000003')$$,
  'completed booking chat remains writable inside 48 hours'
);
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.booking_status_history
set created_at=now()-interval '48 hours'
where booking_id='93000000-0000-0000-0000-000000000003' and status='completed';
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.send_booking_message('93000000-0000-0000-0000-000000000003','text','At boundary',null,null,'94000000-0000-0000-0000-000000000004')$$,
  '22023','Booking chat is read-only','completed booking chat locks exactly at 48 hours'
);
select throws_ok(
  $$select public.set_booking_typing('93000000-0000-0000-0000-000000000003',true)$$,
  '22023','Booking chat is read-only','typing cannot be started after chat lock'
);
reset role;

select is(
  (select count(*)::integer from public.messages where booking_id='93000000-0000-0000-0000-000000000002' and message_type='text'),
  1,
  'chat lock preserves existing message history without adding blocked messages'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and policyname='chat_attachment_participant_upload'),
  1,
  'chat attachment upload policy is replaced once with lifecycle gating'
);

select * from finish();
rollback;
