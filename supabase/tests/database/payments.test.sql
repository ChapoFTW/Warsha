begin;

select plan(107);

-- Schema, ACLs, RLS, and publication boundaries.
select has_table('public', 'financial_booking_payments', 'minor-unit payments table exists'); -- 1
select has_table('public', 'booking_price_snapshots', 'immutable price snapshots exist'); -- 2
select has_table('public', 'provider_earnings_ledger', 'sanitized provider earnings exist'); -- 3
select has_table('public', 'provider_withdrawal_requests', 'withdrawal requests exist'); -- 4
select has_table('private', 'financial_ledger_accounts', 'private ledger accounts exist'); -- 5
select has_table('private', 'financial_ledger_entries', 'private ledger entries exist'); -- 6
select has_table('private', 'payment_gateway_events', 'private gateway event audit exists'); -- 7
select has_function('public', 'create_booking_payment_intent', array['uuid', 'text', 'text'], 'payment intent RPC exists'); -- 8
select has_function('public', 'get_my_provider_earnings', array[]::text[], 'provider earnings RPC exists'); -- 9
select has_function('public', 'request_provider_withdrawal', array['bigint', 'uuid', 'text'], 'withdrawal RPC exists'); -- 10
select is(has_function_privilege('anon', 'public.create_booking_payment_intent(uuid,text,text)', 'EXECUTE'), false, 'anonymous users cannot create payment intents'); -- 11
select is(has_function_privilege('authenticated', 'public.create_booking_payment_intent(uuid,text,text)', 'EXECUTE'), true, 'authenticated customers can invoke guarded payment intents'); -- 12
select is(
  (
    select coalesce(bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), false)
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.create_booking_payment_intent(uuid,text,text)'::regprocedure
  ),
  false,
  'PUBLIC has no payment intent execution grant'
); -- 13
select is(has_table_privilege('authenticated', 'private.financial_ledger_entries', 'INSERT'), false, 'clients cannot create ledger entries'); -- 14
select is(has_table_privilege('authenticated', 'public.financial_booking_payments', 'UPDATE'), false, 'clients cannot mark payments successful'); -- 15
select is(has_table_privilege('authenticated', 'public.provider_earnings_ledger', 'UPDATE'), false, 'clients cannot alter earnings'); -- 16
select is(has_table_privilege('authenticated', 'public.financial_refunds', 'INSERT'), false, 'clients cannot create refunds directly'); -- 17
select is(has_table_privilege('anon', 'public.financial_booking_payments', 'SELECT'), false, 'anonymous users cannot read payments'); -- 18
select is((select relrowsecurity from pg_class where oid = 'public.financial_booking_payments'::regclass), true, 'payment RLS is enabled'); -- 19
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'private' and tablename = 'payment_gateway_events'),
  0,
  'gateway events are not published'
); -- 20
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'private' and tablename = 'financial_ledger_entries'),
  0,
  'ledger entries are not published'
); -- 21
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'financial_booking_payments'),
  1,
  'sanitized payment status is published'
); -- 22

-- Test-only policy values. The migration itself intentionally ships null
-- commercial values and disabled live processing.
update private.payment_configuration
set policy_version = 'pgtap-only-10-percent',
    commission_bps = 1000,
    fixed_commission_minor = 0,
    minimum_commission_minor = 0,
    maximum_commission_minor = null,
    minimum_withdrawal_minor = 1000,
    earnings_release_delay_seconds = 0,
    refund_reversal_policy = 'proportional_provider_and_commission_reversal',
    gateway_mode = 'mock',
    payout_mode = 'mock';

select is(
  (select commission_minor from private.calculate_commission(10000, 'EGP')),
  1000::bigint,
  'test commission calculation is exact in minor units'
); -- 23
select is(
  (select provider_net_minor from private.calculate_commission(10000, 'EGP')),
  9000::bigint,
  'provider net calculation is exact in minor units'
); -- 24
select throws_ok(
  $$select * from private.calculate_commission(10000, 'USD')$$,
  '22023',
  'Unsupported currency',
  'wrong currency is rejected'
); -- 25
select throws_ok(
  $$select * from private.calculate_commission(-1, 'EGP')$$,
  '22023',
  'Invalid payment amount',
  'negative financial amounts are rejected'
); -- 26

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pay-customer-1@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pay-customer-2@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pay-provider-1@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pay-provider-2@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pay-staff@test.local', '', now(), '{}', '{}', now(), now());

insert into public.provider_profiles(
  id, user_id, display_name, profession_key, onboarding_status, is_published
)
values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Payment provider one', 'professional', 'approved', true),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'Payment provider two', 'professional', 'approved', true),
  ('94000000-0000-0000-0000-000000000003', null, 'Ownerless payment provider', 'professional', 'approved', true);

-- Simulates a staff row that predates 202608310006, which refuses NEW
-- legacy staff rows so that staff can only be granted through
-- `staff_role_grants`, where it is auditable and revocable. Existing rows
-- keep working, and that is exactly what this fixture stands in for.
alter table public.user_roles disable trigger refuse_new_legacy_staff_role;
insert into public.user_roles(user_id, role)
values ('93000000-0000-0000-0000-000000000001', 'admin')
on conflict do nothing;
alter table public.user_roles enable trigger refuse_new_legacy_staff_role;


select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
insert into public.bookings(
  id, customer_id, provider_id, service_id, status, service_name_snapshot,
  pricing_type, estimated_price_egp, final_price_egp, issue_description,
  scheduled_date, scheduled_time, address_snapshot, booking_type,
  price_breakdown, idempotency_key
)
select
  v.id::uuid,
  '91000000-0000-0000-0000-000000000001'::uuid,
  v.provider_id::uuid,
  s.id,
  v.status,
  v.service_name,
  'fixed',
  v.amount,
  v.amount,
  'Payment test booking issue',
  current_date,
  '12:00',
  'Payment test address',
  'scheduled',
  jsonb_build_object(
    'servicePrice', v.amount - 20,
    'transportationFee', 20,
    'emergencySurcharge', 0,
    'discount', 0,
    'estimatedTotal', v.amount,
    'pricingType', 'fixed'
  ),
  v.key
from (
  values
    ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'completed', 100::numeric, 'Payment service one', 'payment-booking-one'),
    ('95000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000001', 'confirmed', 200::numeric, 'Payment service two', 'payment-booking-two'),
    ('95000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000001', 'completed', 150::numeric, 'Cash service', 'payment-booking-cash'),
    ('95000000-0000-0000-0000-000000000004', '94000000-0000-0000-0000-000000000003', 'completed', 100::numeric, 'Ownerless service', 'payment-booking-ownerless'),
    ('95000000-0000-0000-0000-000000000005', '94000000-0000-0000-0000-000000000001', 'work_in_progress', 100::numeric, 'Adjusted service', 'payment-booking-adjusted')
) v(id, provider_id, status, amount, service_name, key)
cross join lateral (
  select id from public.services where is_active and deleted_at is null order by id limit 1
) s;

create temporary table payment_test_state (
  key text primary key,
  value text not null
) on commit drop;
grant select, insert, update, delete on payment_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'intent-one',
  public.create_booking_payment_intent(
    '95000000-0000-0000-0000-000000000001',
    'payment-intent-one',
    'online'
  )::text
);
select is(
  (select value::jsonb->>'amountMinor' from payment_test_state where key = 'intent-one'),
  '10000',
  'server derives the payment amount from the booking snapshot'
); -- 27
select is(
  (select value::jsonb->>'paymentMethod' from payment_test_state where key = 'intent-one'),
  'online',
  'online payment method is explicit'
); -- 28
select is(
  (
    select public.create_booking_payment_intent(
      '95000000-0000-0000-0000-000000000001',
      'payment-intent-one',
      'online'
    )->>'attemptId'
  ),
  (select value::jsonb->>'attemptId' from payment_test_state where key = 'intent-one'),
  'duplicate payment intents are idempotent'
); -- 29
select is(
  (
    select p.amount_minor
    from public.financial_booking_payments p
    join public.booking_price_snapshots s on s.id = p.price_snapshot_id
    where p.booking_id = '95000000-0000-0000-0000-000000000001'
      and p.amount_minor = s.customer_total_minor
  ),
  10000::bigint,
  'payment amount exactly matches its immutable snapshot'
); -- 30

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.get_my_booking_payment('95000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Booking not found',
  'another customer cannot read a payment'
); -- 31
select is(
  (select count(*)::integer from public.financial_booking_payments),
  0,
  'another customer sees no payment rows'
); -- 32

reset role;
select throws_ok(
  format(
    $$select private.process_mock_payment_event('bad-signature-event', %L::uuid, 'payment.succeeded', false)$$,
    (select value::jsonb->>'attemptId' from payment_test_state where key = 'intent-one')
  ),
  '42501',
  'Invalid gateway signature',
  'invalid gateway signatures fail closed'
); -- 33
insert into payment_test_state(key, value)
values (
  'success-one',
  private.process_mock_payment_event(
    'mock-event-success-one',
    (select (value::jsonb->>'attemptId')::uuid from payment_test_state where key = 'intent-one'),
    'payment.succeeded'
  )::text
);
select is(
  (select value::jsonb->>'duplicate' from payment_test_state where key = 'success-one'),
  'false',
  'trusted mock success event is processed'
); -- 34
select is(
  (select status from public.financial_booking_payments where booking_id = '95000000-0000-0000-0000-000000000001'),
  'paid',
  'server-verified success marks the payment paid'
); -- 35
select is(
  (select count(*)::integer from private.financial_ledger_transactions where transaction_type = 'online_payment_confirmed'),
  1,
  'successful payment creates one ledger transaction'
); -- 36
select is(
  (
    select
      sum(case when e.direction = 'debit' then e.amount_minor else 0 end)
      =
      sum(case when e.direction = 'credit' then e.amount_minor else 0 end)
    from private.financial_ledger_entries e
    join private.financial_ledger_transactions t on t.id = e.transaction_id
    where t.transaction_type = 'online_payment_confirmed'
  ),
  true,
  'successful payment ledger entries balance exactly'
); -- 37
select is(
  (select count(*)::integer from public.provider_earnings_ledger where payment_id = (select id from public.financial_booking_payments where booking_id = '95000000-0000-0000-0000-000000000001')),
  1,
  'successful payment creates one earning'
); -- 38
select is(
  (select gross_minor from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001'),
  10000::bigint,
  'earning gross amount is exact'
); -- 39
select is(
  (select commission_minor from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001'),
  1000::bigint,
  'earning commission amount is exact'
); -- 40
select is(
  (select net_minor from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001'),
  9000::bigint,
  'earning net amount is exact'
); -- 41
select is(
  (select status from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001'),
  'available',
  'completed paid booking releases earnings under the test-only zero-delay policy'
); -- 42
select is(
  private.process_mock_payment_event(
    'mock-event-success-one',
    (select (value::jsonb->>'attemptId')::uuid from payment_test_state where key = 'intent-one'),
    'payment.succeeded'
  )->>'duplicate',
  'true',
  'duplicate gateway event is recognized'
); -- 43
select is(
  (select count(*)::integer from private.financial_ledger_transactions where transaction_type = 'online_payment_confirmed'),
  1,
  'duplicate gateway event cannot duplicate funds'
); -- 44
select is(
  (select count(*)::integer from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001'),
  1,
  'repeated success cannot duplicate provider earnings'
); -- 45
select is(
  (select count(*)::integer from public.notifications where dedupe_key like 'payment-confirmed:%'),
  1,
  'payment confirmation notification is deduplicated'
); -- 46

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '9000',
  'provider sees the correct available earnings'
); -- 47
select is(
  public.get_my_provider_earnings()->'transactions'->0->>'serviceId',
  (select service_id::text from public.bookings where id = '95000000-0000-0000-0000-000000000001'),
  'provider earnings project the booking service UUID'
);
select is(
  public.get_my_provider_earnings()->'transactions'->0->>'serviceTranslationKey',
  (select s.translation_key from public.bookings b join public.services s on s.id = b.service_id where b.id = '95000000-0000-0000-0000-000000000001'),
  'provider earnings project the service translation key'
);
select is(
  (select count(*)::integer from public.provider_earnings_ledger),
  1,
  'provider sees only their own earning row'
); -- 48
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000002', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '0',
  'another provider has no available earnings'
); -- 49
select is(
  (select count(*)::integer from public.provider_earnings_ledger),
  0,
  'another provider cannot read the first provider earnings'
); -- 50
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.provider_earnings_ledger),
  0,
  'customer cannot read provider earnings'
); -- 51

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'destination-one',
  public.save_my_payout_destination(
    'mobile_wallet',
    'My mobile wallet',
    '01012345678',
    true,
    true,
    'destination-idempotency-one'
  )::text
);
select is(
  (select value::jsonb->>'maskedValue' from payment_test_state where key = 'destination-one'),
  '•••• 5678',
  'payout destination is returned masked'
); -- 52
select is(
  position('01012345678' in (select value from payment_test_state where key = 'destination-one')),
  0,
  'sanitized payout result never contains the full value'
); -- 53
select is(
  (select masked_value from public.provider_payout_destinations where id = (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'destination-one')),
  '•••• 5678',
  'public payout row stores only the masked value'
); -- 54
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.provider_payout_destinations),
  0,
  'customer cannot read provider payout destinations'
); -- 55

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'withdrawal-one',
  public.request_provider_withdrawal(
    5000,
    (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'destination-one'),
    'withdrawal-idempotency-one'
  )::text
);
select is(
  (select value::jsonb->>'amountMinor' from payment_test_state where key = 'withdrawal-one'),
  '5000',
  'withdrawal request reserves the requested minor units'
); -- 56
select is(
  (
    select public.request_provider_withdrawal(
      5000,
      (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'destination-one'),
      'withdrawal-idempotency-one'
    )->>'id'
  ),
  (select value::jsonb->>'id' from payment_test_state where key = 'withdrawal-one'),
  'duplicate withdrawal request is idempotent'
); -- 57
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '4000',
  'withdrawal reservation reduces available earnings transactionally'
); -- 58
select throws_ok(
  format(
    $$select public.request_provider_withdrawal(5000, %L::uuid, 'withdrawal-too-large')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'destination-one')
  ),
  '22023',
  'Withdrawal exceeds available earnings',
  'withdrawal cannot exceed available earnings'
); -- 59
select throws_ok(
  format(
    $$select public.review_provider_withdrawal(%L::uuid, 'paid', '', 'provider-cannot-pay')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'withdrawal-one')
  ),
  '42501',
  'Staff access required',
  'provider cannot mark a withdrawal paid'
); -- 60

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format(
    $$select public.review_provider_withdrawal(%L::uuid, 'failed', 'test failure', 'staff-failure-one')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'withdrawal-one')
  ),
  'staff failure transition releases the reservation'
); -- 61
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '9000',
  'failed payout releases reserved earnings exactly once'
); -- 62
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select is(
  public.review_provider_withdrawal(
    (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'withdrawal-one'),
    'failed',
    'test failure',
    'staff-failure-one'
  )->>'status',
  'failed',
  'repeated final payout event is harmless'
); -- 63
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '9000',
  'repeated payout failure does not release funds twice'
); -- 64

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'cash-one',
  public.create_booking_payment_intent(
    '95000000-0000-0000-0000-000000000003',
    'cash-intent-one',
    'cash'
  )::text
);
select is(
  (select value::jsonb->>'status' from payment_test_state where key = 'cash-one'),
  'awaiting_payment',
  'cash selection remains awaiting collection'
); -- 65
reset role;
select is(
  (
    select count(*)::integer
    from private.payment_attempts a
    join public.financial_booking_payments p on p.id = a.payment_id
    where p.booking_id = '95000000-0000-0000-0000-000000000003'
  ),
  0,
  'cash selection creates no fake online attempt'
); -- 66
select is(
  (
    select count(*)::integer
    from private.financial_ledger_transactions t
    where t.booking_id = '95000000-0000-0000-0000-000000000003'
  ),
  0,
  'cash selection creates no fake successful ledger posting'
); -- 67

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'intent-two',
  public.create_booking_payment_intent(
    '95000000-0000-0000-0000-000000000002',
    'payment-intent-two',
    'online'
  )::text
);
reset role;
select lives_ok(
  format(
    $$select private.process_mock_payment_event('mock-event-success-two', %L::uuid, 'payment.succeeded')$$,
    (select value::jsonb->>'attemptId' from payment_test_state where key = 'intent-two')
  ),
  'second trusted payment succeeds for refund testing'
); -- 68
set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
select
  'refund-two',
  public.process_financial_refund(
    p.id,
    20000,
    'Full test refund',
    'refund-idempotency-two'
  )::text
from public.financial_booking_payments p
where p.booking_id = '95000000-0000-0000-0000-000000000002';
select is(
  (select value::jsonb->>'status' from payment_test_state where key = 'refund-two'),
  'succeeded',
  'trusted full refund succeeds'
); -- 69
select is(
  (select status from public.financial_booking_payments where booking_id = '95000000-0000-0000-0000-000000000002'),
  'refunded',
  'full refund updates authoritative payment status'
); -- 70
reset role;
select is(
  (select count(*)::integer from private.financial_ledger_transactions where transaction_type = 'refund_succeeded'),
  1,
  'refund creates one exact reversal transaction'
); -- 71
set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select is(
  (
    select public.process_financial_refund(
      p.id,
      20000,
      'Full test refund',
      'refund-idempotency-two'
    )->>'id'
    from public.financial_booking_payments p
    where p.booking_id = '95000000-0000-0000-0000-000000000002'
  ),
  (select value::jsonb->>'id' from payment_test_state where key = 'refund-two'),
  'duplicate refund is idempotent'
); -- 72
reset role;
select is(
  (select count(*)::integer from private.financial_ledger_transactions where transaction_type = 'refund_succeeded'),
  1,
  'duplicate refund cannot duplicate reversal funds'
); -- 73

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format(
    $$select public.set_provider_earning_hold(%L::uuid, 'hold', 2000, 'Held while an issue is reviewed', 'hold-idempotency-one')$$,
    (select id from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001')
  ),
  'staff can place an exact hold on available earnings'
); -- 74
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '7000',
  'held earnings are excluded from available amount'
); -- 75
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format(
    $$select public.set_provider_earning_hold(%L::uuid, 'release', 2000, 'Issue resolved', 'hold-release-idempotency-one')$$,
    (select id from public.provider_earnings_ledger where booking_id = '95000000-0000-0000-0000-000000000001')
  ),
  'staff can release an active hold'
); -- 76
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_earnings()->>'availableMinor',
  '9000',
  'releasing a hold restores available earnings once'
); -- 77

reset role;
select throws_ok(
  $$select private.post_financial_transaction(
    'earning_held',
    null,
    null,
    'EGP',
    'system',
    'unbalanced-test',
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
        private.financial_account('warsha_commission', null, 'EGP'),
        'direction',
        'debit',
        'amount_minor',
        1
      )
    )
  )$$,
  '23514',
  'Financial transaction must balance',
  'unbalanced ledger transaction is rejected'
); -- 78
select throws_ok(
  $$update public.booking_price_snapshots set customer_total_minor = customer_total_minor + 1 where booking_id = '95000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Price snapshots are immutable',
  'price snapshots cannot be altered'
); -- 79
select is(has_table_privilege('authenticated', 'private.payout_destination_fingerprints', 'SELECT'), false, 'payout fingerprints are not client-readable'); -- 80
select is(has_table_privilege('authenticated', 'private.payment_gateway_events', 'SELECT'), false, 'gateway events are not client-readable'); -- 81
select is(has_table_privilege('authenticated', 'private.payment_configuration', 'UPDATE'), false, 'clients cannot alter commission configuration'); -- 82
select is(has_function_privilege('authenticated', 'private.process_mock_payment_event(text,uuid,text,boolean)', 'EXECUTE'), false, 'clients cannot invoke trusted payment success processing'); -- 83

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)::integer
    from public.provider_earnings_ledger
    where provider_id = '94000000-0000-0000-0000-000000000003'
  ),
  0,
  'ownerless provider records remain inaccessible'
); -- 84

reset role;
select has_function('public', 'get_my_provider_booking_payment', array['uuid'], 'provider payment read RPC exists'); -- 85
select is(has_function_privilege('anon', 'public.confirm_cash_collected(uuid,text)', 'EXECUTE'), false, 'anonymous users cannot report cash collection'); -- 86
select is(has_function_privilege('authenticated', 'public.confirm_cash_collected(uuid,text)', 'EXECUTE'), true, 'authenticated providers can invoke guarded cash reporting'); -- 87
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_booking_payment('95000000-0000-0000-0000-000000000003')->>'paymentMethod',
  'cash',
  'provider sees the sanitized cash payment method'
); -- 88
select is(
  public.confirm_cash_collected(
    '95000000-0000-0000-0000-000000000003',
    'cash-provider-confirmation'
  )->>'status',
  'pending',
  'provider report waits for customer confirmation'
); -- 89
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_booking_payment('95000000-0000-0000-0000-000000000003')->>'status',
  'pending',
  'customer sees the provider cash report'
); -- 90
select is(
  public.respond_cash_collection(
    '95000000-0000-0000-0000-000000000003',
    true,
    'cash-customer-confirmation'
  )->>'status',
  'paid',
  'customer confirmation is server-authoritative'
); -- 91
reset role;
select is(
  (
    select count(*)::integer
    from private.financial_ledger_transactions
    join private.financial_ledger_entries
      on financial_ledger_entries.transaction_id =
        financial_ledger_transactions.id
    join private.financial_ledger_accounts
      on financial_ledger_accounts.id =
        financial_ledger_entries.account_id
    where financial_ledger_transactions.booking_id =
      '95000000-0000-0000-0000-000000000003'
      and financial_ledger_accounts.account_type in (
        'customer_payment_clearing',
        'provider_pending',
        'provider_available'
      )
  ),
  0,
  'confirmed cash creates commission debt but no fake Warsha clearing funds'
); -- 92

select has_function('public', 'propose_booking_price_adjustment', array['uuid', 'bigint', 'text', 'text'], 'provider price proposal RPC exists'); -- 93
select is(has_function_privilege('anon', 'public.respond_booking_price_adjustment(uuid,boolean)', 'EXECUTE'), false, 'anonymous users cannot accept price changes'); -- 94
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
insert into payment_test_state(key, value)
values (
  'price-adjustment-one',
  public.propose_booking_price_adjustment(
    '95000000-0000-0000-0000-000000000005',
    12500,
    'Customer approved additional work is needed',
    'price-adjustment-idempotency-one'
  )::text
);
select is(
  (select value::jsonb->>'newTotalMinor' from payment_test_state where key = 'price-adjustment-one'),
  '12500',
  'provider proposal records the exact new minor-unit total'
); -- 95
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.booking_price_adjustments where booking_id = '95000000-0000-0000-0000-000000000005'),
  0,
  'another customer cannot see a price proposal'
); -- 96
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.booking_price_adjustments where booking_id = '95000000-0000-0000-0000-000000000005'),
  1,
  'booking customer sees the pending old-versus-new proposal'
); -- 97
select is(
  public.respond_booking_price_adjustment(
    (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'price-adjustment-one'),
    true
  )->>'status',
  'accepted',
  'customer acceptance is server-authoritative'
); -- 98
reset role;
select is(
  (select final_price_egp from public.bookings where id = '95000000-0000-0000-0000-000000000005'),
  125.00::numeric,
  'accepted price becomes the controlled booking final price'
); -- 99
select is(
  (select count(*)::integer from public.booking_price_snapshots where booking_id = '95000000-0000-0000-0000-000000000005'),
  2,
  'accepted price change preserves both snapshot versions'
); -- 100
select is(
  (
    select
      (price_breakdown->>'servicePrice')::numeric
      + (price_breakdown->>'transportationFee')::numeric
      + (price_breakdown->>'emergencySurcharge')::numeric
      - (price_breakdown->>'discount')::numeric
    from public.bookings
    where id = '95000000-0000-0000-0000-000000000005'
  ),
  125.00::numeric,
  'accepted booking price breakdown remains arithmetically consistent'
); -- 101

-- ---------------------------------------------------------------------------
-- The payout surface is a backend control, not a disabled button
-- ---------------------------------------------------------------------------
-- `request_provider_withdrawal` validated the amount, the key, the provider,
-- the destination and the balance, and never asked whether payouts were
-- switched on. The only thing stopping a request while `payout_mode` was
-- `disabled` was `withdrawalsEnabled` in `get_my_provider_earnings`, which
-- `app/provider-earnings.tsx` uses to disable a button. Anyone posting to
-- PostgREST went straight past it and put a withdrawal into the ledger that no
-- payout surface could settle.

select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);

update private.payment_configuration set payout_mode = 'disabled';
select throws_ok(
  format(
    $$select public.request_provider_withdrawal(2000, %L::uuid, 'withdrawal-guard-disabled')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'destination-one')
  ),
  '55000',
  'Withdrawals are not available',
  'A DISABLED PAYOUT SURFACE REFUSES A NEW WITHDRAWAL IN THE BACKEND'
); -- 102

-- The guard sits after the idempotency replay on purpose: switching payouts off
-- must not make a provider's existing request unreadable to them.
select is(
  (
    select public.request_provider_withdrawal(
      5000,
      (select (value::jsonb->>'id')::uuid from payment_test_state where key = 'destination-one'),
      'withdrawal-idempotency-one'
    )->>'id'
  ),
  (select value::jsonb->>'id' from payment_test_state where key = 'withdrawal-one'),
  'and an existing withdrawal stays readable while payouts are off'
); -- 103

-- Maintenance mode is the kill switch, and it closes the surface by itself:
-- `payment_surface_environment` returns 'disabled' regardless of the mode.
update private.payment_configuration
  set payout_mode = 'mock', maintenance_mode = true, maintenance_reason = 'audit probe';
select throws_ok(
  format(
    $$select public.request_provider_withdrawal(2000, %L::uuid, 'withdrawal-guard-maintenance')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'destination-one')
  ),
  '55000',
  'Withdrawals are not available',
  'MAINTENANCE MODE CLOSES THE PAYOUT SURFACE EVEN IN MOCK'
); -- 104

update private.payment_configuration
  set maintenance_mode = false, maintenance_reason = null;
select lives_ok(
  format(
    $$select public.request_provider_withdrawal(2000, %L::uuid, 'withdrawal-guard-restored')$$,
    (select value::jsonb->>'id' from payment_test_state where key = 'destination-one')
  ),
  'and an open mock payout surface still accepts a withdrawal'
); -- 105

select * from finish();
rollback;
