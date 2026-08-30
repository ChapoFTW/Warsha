begin;

select plan(107);

-- Locked configuration and trusted boundaries.
select is((select currency from private.payment_configuration where id), 'EGP', 'EGP is the only configured currency'); -- 1
select is((select commission_bps from private.payment_configuration where id), 1000, 'provider commission defaults to 10 percent'); -- 2
select is((select fixed_commission_minor from private.payment_configuration where id), 0::bigint, 'there is no fixed commission'); -- 3
select is((select minimum_commission_minor from private.payment_configuration where id), null::bigint, 'there is no minimum commission'); -- 4
select is((select maximum_commission_minor from private.payment_configuration where id), null::bigint, 'there is no maximum commission'); -- 5
select is((select commission_minor from private.calculate_commission(109, 'EGP')), 10::bigint, 'commission floors fractional piastres deterministically'); -- 6
select is((select earnings_release_delay_seconds from private.payment_configuration where id), 21600::bigint, 'release delay defaults to six hours'); -- 7
select is((select minimum_withdrawal_minor from private.payment_configuration where id), 20000::bigint, 'minimum withdrawal is EGP 200'); -- 8
select is((select withdrawal_fee_minor from private.payment_configuration where id), 0::bigint, 'withdrawal fee is zero'); -- 9
select is((select rolling_reserve_bps from private.payment_configuration where id), 0, 'rolling reserve is disabled'); -- 10
select is((select cash_debt_restriction_threshold_minor from private.payment_configuration where id), 50000::bigint, 'cash debt threshold is EGP 500'); -- 11
select is((select gateway_mode from private.payment_configuration where id), 'disabled', 'live gateway defaults disabled'); -- 12
select is((select payout_mode from private.payment_configuration where id), 'disabled', 'live payouts default disabled'); -- 13
select is((select automatic_release_scheduler_enabled from private.payment_configuration where id), false, 'automatic scheduler is not falsely enabled'); -- 14
select is((select gateway_fee_paid_by from private.payment_configuration where id), 'warsha', 'gateway fees are a Warsha expense'); -- 15
select is(has_table_privilege('authenticated', 'private.payment_configuration', 'UPDATE'), false, 'normal clients cannot mutate financial configuration'); -- 16
select is(has_table_privilege('authenticated', 'private.financial_ledger_entries', 'INSERT'), false, 'normal clients cannot create ledger money'); -- 17
select has_table('public', 'provider_cash_commission_records', 'sanitized cash commission records exist'); -- 18
select has_table('public', 'provider_financial_cases', 'post-release financial cases exist'); -- 19
select has_function('public', 'confirm_booking_completion_for_payment', array['uuid', 'text'], 'customer completion confirmation RPC exists'); -- 20
select has_function('private', 'release_eligible_provider_earnings', array['integer'], 'trusted scheduler contract exists'); -- 21
select is(has_function_privilege('authenticated', 'private.release_eligible_provider_earnings(integer)', 'EXECUTE'), false, 'clients cannot invoke the release scheduler'); -- 22
select is(has_function_privilege('authenticated', 'private.record_gateway_fee(uuid,bigint,text)', 'EXECUTE'), false, 'clients cannot manufacture gateway fees'); -- 23
select is(has_function_privilege('anon', 'public.get_financial_capabilities()', 'EXECUTE'), false, 'anonymous users cannot query financial capabilities'); -- 24
select is(has_function_privilege('authenticated', 'public.get_my_booking_payment_options(uuid)', 'EXECUTE'), true, 'authenticated customers can query guarded payment options'); -- 25
select is((select relrowsecurity from pg_class where oid = 'public.provider_cash_commission_records'::regclass), true, 'cash commission records use RLS'); -- 26
select is((select relrowsecurity from pg_class where oid = 'public.provider_financial_cases'::regclass), true, 'financial cases use RLS'); -- 27
select is(
  (
    select p.prosecdef
    from pg_proc p
    where p.oid = 'private.assert_balanced_financial_transaction()'::regprocedure
  ),
  true,
  'deferred balance trigger retains private-ledger authority'
); -- 28
select is(
  (
    select coalesce('search_path=""' = any(p.proconfig), false)
    from pg_proc p
    where p.oid = 'private.assert_balanced_financial_transaction()'::regprocedure
  ),
  true,
  'deferred balance trigger fixes an empty search path'
); -- 29

update private.payment_configuration
set gateway_mode = 'mock',
    payout_mode = 'mock'
where id;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'spec-customer@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'spec-provider-one@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'spec-provider-two@test.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'spec-staff@test.local', '', now(), '{}', '{}', now(), now());

insert into public.provider_profiles(
  id, user_id, display_name, profession_key, onboarding_status, is_published
)
values
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Financial spec provider one', 'professional', 'approved', true),
  ('a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Financial spec provider two', 'professional', 'approved', true);

-- Simulates a staff row that predates 202608310006, which refuses NEW
-- legacy staff rows so that staff can only be granted through
-- `staff_role_grants`, where it is auditable and revocable. Existing rows
-- keep working, and that is exactly what this fixture stands in for.
alter table public.user_roles disable trigger refuse_new_legacy_staff_role;
insert into public.user_roles(user_id, role)
values ('a3000000-0000-0000-0000-000000000001', 'admin')
on conflict do nothing;
alter table public.user_roles enable trigger refuse_new_legacy_staff_role;


select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into public.bookings(
  id, customer_id, provider_id, service_id, status, service_name_snapshot,
  pricing_type, estimated_price_egp, final_price_egp, issue_description,
  scheduled_date, scheduled_time, address_snapshot, booking_type,
  price_breakdown, idempotency_key
)
select
  v.id::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  v.provider_id::uuid,
  s.id,
  'completed',
  v.service_name,
  'fixed',
  v.customer_total,
  v.customer_total,
  'Financial specification test booking',
  current_date,
  '14:00',
  'Financial specification test address',
  'scheduled',
  jsonb_build_object(
    'servicePrice', v.gross_total,
    'transportationFee', 0,
    'emergencySurcharge', 0,
    'discount', v.promotion,
    'estimatedTotal', v.customer_total,
    'pricingType', 'fixed'
  ),
  v.key
from (
  values
    ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 1000::numeric, 1000::numeric, 0::numeric, 'Six hour release', 'spec-release'),
    ('a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 900::numeric, 1000::numeric, 100::numeric, 'Promotion and refund', 'spec-promotion'),
    ('a5000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000001', 5000::numeric, 5000::numeric, 0::numeric, 'Cash threshold exact', 'spec-cash-exact'),
    ('a5000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000001', 1::numeric, 1::numeric, 0::numeric, 'Cash threshold excess', 'spec-cash-excess'),
    ('a5000000-0000-0000-0000-000000000005', 'a4000000-0000-0000-0000-000000000001', 100::numeric, 100::numeric, 0::numeric, 'Restricted cash attempt', 'spec-cash-restricted'),
    ('a5000000-0000-0000-0000-000000000006', 'a4000000-0000-0000-0000-000000000001', 1000::numeric, 1000::numeric, 0::numeric, 'Online debt offset', 'spec-online-offset'),
    ('a5000000-0000-0000-0000-000000000007', 'a4000000-0000-0000-0000-000000000001', 1000::numeric, 1000::numeric, 0::numeric, 'Dispute hold', 'spec-dispute'),
    ('a5000000-0000-0000-0000-000000000008', 'a4000000-0000-0000-0000-000000000002', 1000::numeric, 1000::numeric, 0::numeric, 'Post release recovery', 'spec-recovery'),
    ('a5000000-0000-0000-0000-000000000009', 'a4000000-0000-0000-0000-000000000002', 200::numeric, 200::numeric, 0::numeric, 'Future recovery offset', 'spec-recovery-offset'),
    ('a5000000-0000-0000-0000-000000000010', 'a4000000-0000-0000-0000-000000000002', 1000::numeric, 1000::numeric, 0::numeric, 'Chargeback review', 'spec-chargeback')
) v(id, provider_id, customer_total, gross_total, promotion, service_name, key)
cross join lateral (
  select id from public.services where is_active and deleted_at is null order by id limit 1
) s;

create temporary table financial_spec_state (
  key text primary key,
  value text not null
) on commit drop;
grant select, insert, update, delete on financial_spec_state to authenticated;

-- Six-hour release and customer confirmation.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values (
  'release-intent',
  public.create_booking_payment_intent(
    'a5000000-0000-0000-0000-000000000001',
    'spec-release-intent',
    'online'
  )::text
);
reset role;
select lives_ok(
  format(
    $$select private.process_mock_payment_event('spec-release-success', %L::uuid, 'payment.succeeded')$$,
    (select value::jsonb->>'attemptId' from financial_spec_state where key = 'release-intent')
  ),
  'trusted release-test payment succeeds'
); -- 28
select is((select amount_minor from public.financial_booking_payments where booking_id = 'a5000000-0000-0000-0000-000000000001'), 100000::bigint, 'customer pays the approved booking total'); -- 29
select is((select commission_minor from public.provider_earnings_ledger where booking_id = 'a5000000-0000-0000-0000-000000000001'), 10000::bigint, '10 percent commission is authoritative'); -- 30
select is((select status from public.provider_earnings_ledger where booking_id = 'a5000000-0000-0000-0000-000000000001'), 'pending_release', 'completed work waits during the release delay'); -- 31
select ok((select extract(epoch from release_eligible_at - provider_completed_at) between 21599 and 21601 from public.provider_earnings_ledger where booking_id = 'a5000000-0000-0000-0000-000000000001'), 'release eligibility is exactly six hours after provider completion'); -- 32
select is(private.release_eligible_provider_earnings(100), 0, 'scheduler does not release earnings before eligibility'); -- 33
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is(public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000001', 'spec-customer-confirm')->>'status', 'available', 'customer confirmation releases earnings immediately'); -- 34
select is(public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000001', 'spec-customer-confirm')->>'status', 'available', 'duplicate customer confirmation is idempotent'); -- 35
reset role;
select is((select count(*)::integer from private.financial_ledger_accounts where account_type like '%reserve%'), 0, 'no general reserve account exists'); -- 36

-- Warsha-funded promotion, gateway expense separation, and cumulative refunds.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values (
  'promotion-intent',
  public.create_booking_payment_intent(
    'a5000000-0000-0000-0000-000000000002',
    'spec-promotion-intent',
    'online'
  )::text
);
reset role;
select lives_ok(
  format(
    $$select private.process_mock_payment_event('spec-promotion-success', %L::uuid, 'payment.succeeded')$$,
    (select value::jsonb->>'attemptId' from financial_spec_state where key = 'promotion-intent')
  ),
  'promoted payment succeeds through the trusted mock boundary'
); -- 37
select is((select customer_total_minor from public.booking_price_snapshots where booking_id = 'a5000000-0000-0000-0000-000000000002' and is_current), 90000::bigint, 'customer pays only the promoted amount'); -- 38
select is((select provider_gross_minor from public.booking_price_snapshots where booking_id = 'a5000000-0000-0000-0000-000000000002' and is_current), 100000::bigint, 'promotion preserves provider gross basis'); -- 39
select is((select promotion_minor from public.booking_price_snapshots where booking_id = 'a5000000-0000-0000-0000-000000000002' and is_current), 10000::bigint, 'Warsha promotion is a separate component'); -- 40
select is((select commission_minor from public.provider_earnings_ledger where booking_id = 'a5000000-0000-0000-0000-000000000002'), 10000::bigint, 'promotion preserves full commission basis'); -- 41
select is((select net_minor from public.provider_earnings_ledger where booking_id = 'a5000000-0000-0000-0000-000000000002'), 90000::bigint, 'promotion does not reduce provider net earnings'); -- 42
select is((select sum(e.amount_minor)::bigint from private.financial_ledger_entries e join private.financial_ledger_accounts a on a.id=e.account_id join private.financial_ledger_transactions t on t.id=e.transaction_id where t.payment_id=(select id from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002') and a.account_type='warsha_promotion_expense' and e.direction='debit'), 10000::bigint, 'promotion expense posts separately to the ledger'); -- 43
select is(private.record_gateway_fee((select id from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'), 500, 'spec-gateway-fee-event'), true, 'trusted gateway fee event records a Warsha expense'); -- 44
select is((select gateway_fee_minor from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'), 500::bigint, 'gateway fee is stored separately'); -- 45
select is((select net_minor from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000002'), 90000::bigint, 'gateway fee never reduces provider earnings'); -- 46
select is(private.record_gateway_fee((select id from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'), 500, 'spec-gateway-fee-event'), false, 'duplicate gateway fee is idempotent'); -- 47

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state
select 'promotion-refund-one', public.process_financial_refund(id, 45000, 'Half promoted payment refund', 'spec-refund-promotion-one')::text
from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002';
select is((select value::jsonb->>'status' from financial_spec_state where key='promotion-refund-one'), 'succeeded', 'partial pre-release refund succeeds'); -- 48
reset role;
select is((select commission_reversal_minor from public.financial_refunds where id=(select (value::jsonb->>'id')::uuid from financial_spec_state where key='promotion-refund-one')), 5000::bigint, 'partial refund floors commission proportionally'); -- 49
select is((select promotion_reversal_minor from public.financial_refunds where id=(select (value::jsonb->>'id')::uuid from financial_spec_state where key='promotion-refund-one')), 5000::bigint, 'partial refund reverses promotion proportionally'); -- 50
select is((select provider_reversal_minor from public.financial_refunds where id=(select (value::jsonb->>'id')::uuid from financial_spec_state where key='promotion-refund-one')), 45000::bigint, 'partial refund reverses provider pending earnings proportionally'); -- 51
select is((select status from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'), 'partially_refunded', 'partial refund preserves remaining payment history'); -- 52
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
select is(
  (select public.process_financial_refund(id, 45000, 'Half promoted payment refund', 'spec-refund-promotion-one')->>'id' from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'),
  (select value::jsonb->>'id' from financial_spec_state where key='promotion-refund-one'),
  'duplicate partial refund is idempotent'
); -- 53
select is(
  (select public.process_financial_refund(id, 45000, 'Final promoted payment refund', 'spec-refund-promotion-two')->>'status' from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'),
  'succeeded',
  'final partial refund succeeds'
); -- 54
reset role;
select is((select sum(commission_reversal_minor)::bigint from public.financial_refunds where payment_id=(select id from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002')), 10000::bigint, 'full cumulative refund reverses full commission exactly'); -- 55
select is((select sum(promotion_reversal_minor)::bigint from public.financial_refunds where payment_id=(select id from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002')), 10000::bigint, 'full cumulative refund reverses full promotion exactly'); -- 56
select is((select status from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000002'), 'reversed', 'full refund reverses pending earnings without deleting history'); -- 57
select is((select status from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000002'), 'refunded', 'full cumulative refund marks payment refunded'); -- 58

-- Cash debt threshold and online offset.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000003','spec-cash-exact-intent','cash')$$, 'cash selection is allowed below the threshold'); -- 59
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.confirm_cash_collected('a5000000-0000-0000-0000-000000000003','spec-cash-exact-provider')$$, 'provider reports cash collection'); -- 60
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.respond_cash_collection('a5000000-0000-0000-0000-000000000003',true,'spec-cash-exact-customer')$$, 'customer confirms cash collection'); -- 61
reset role;
select is((select count(*)::integer from private.payment_attempts a join public.financial_booking_payments p on p.id=a.payment_id where p.booking_id='a5000000-0000-0000-0000-000000000003'), 0, 'cash confirmation creates no gateway attempt'); -- 62
select is(private.financial_debt_balance('a4000000-0000-0000-0000-000000000001','provider_cash_commission_debt'), 50000::bigint, 'cash confirmation accrues exact 10 percent commission debt'); -- 63
select is(private.provider_cash_restricted('a4000000-0000-0000-0000-000000000001'), false, 'debt exactly EGP 500 does not restrict cash'); -- 64
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is(public.get_my_booking_payment_options('a5000000-0000-0000-0000-000000000004')->>'cashEnabled', 'true', 'customer still sees cash at exactly the threshold'); -- 65
select lives_ok($$select public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000004','spec-cash-excess-intent','cash')$$, 'next cash booking may be selected at exactly the threshold'); -- 66
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.confirm_cash_collected('a5000000-0000-0000-0000-000000000004','spec-cash-excess-provider')$$, 'provider reports the threshold-crossing cash payment'); -- 67
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.respond_cash_collection('a5000000-0000-0000-0000-000000000004',true,'spec-cash-excess-customer')$$, 'customer confirms the threshold-crossing cash payment'); -- 68
reset role;
select is(private.provider_cash_restricted('a4000000-0000-0000-0000-000000000001'), true, 'debt above EGP 500 restricts new cash payment'); -- 69
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000005','spec-cash-restricted-intent','cash')$$, '55000', 'Cash payment is temporarily unavailable for this provider', 'cash restriction is enforced server-side'); -- 70
select lives_ok($$select public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000006','spec-online-offset-intent','online')$$, 'online payment remains available while cash is restricted'); -- 71
insert into financial_spec_state
select 'offset-intent', public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000006','spec-online-offset-intent','online')::text;
reset role;
select lives_ok(
  format($$select private.process_mock_payment_event('spec-online-offset-success', %L::uuid, 'payment.succeeded')$$,(select value::jsonb->>'attemptId' from financial_spec_state where key='offset-intent')),
  'future online earning is recorded'
); -- 72
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000006','spec-offset-release')$$, 'customer releases the future online earning'); -- 73
reset role;
select is(private.financial_debt_balance('a4000000-0000-0000-0000-000000000001','provider_cash_commission_debt'), 0::bigint, 'future online earnings offset cash commission debt'); -- 74
select is((select debt_offset_minor from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000006'), 50010::bigint, 'cash debt offset is explicit in the earning record'); -- 75
select is(private.available_earnings_balance('a4000000-0000-0000-0000-000000000001'), 129990::bigint, 'only remaining net earnings become available'); -- 76
select is((select sum(outstanding_minor)::bigint from public.provider_cash_commission_records where provider_id='a4000000-0000-0000-0000-000000000001'), 0::bigint, 'cash commission records settle exactly once'); -- 77

-- Withdrawal reservation, minimum, and failed release.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values (
  'spec-destination',
  public.save_my_payout_destination('mobile_wallet','Spec mobile destination','01012345678',true,true,'spec-destination-key')::text
);
select throws_ok(
  format($$select public.request_provider_withdrawal(19999,%L::uuid,'spec-withdraw-below')$$,(select value::jsonb->>'id' from financial_spec_state where key='spec-destination')),
  '22023',
  'Withdrawal amount is below the configured minimum',
  'withdrawal below EGP 200 is rejected'
); -- 78
insert into financial_spec_state
select 'spec-withdrawal', public.request_provider_withdrawal(20000,(select (value::jsonb->>'id')::uuid from financial_spec_state where key='spec-destination'),'spec-withdraw-valid')::text;
select is((select value::jsonb->>'amountMinor' from financial_spec_state where key='spec-withdrawal'), '20000', 'minimum withdrawal reserves exact earnings'); -- 79
reset role;
select is(private.available_earnings_balance('a4000000-0000-0000-0000-000000000001'), 109990::bigint, 'withdrawal reservation is transactional'); -- 80
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
select lives_ok(format($$select public.review_provider_withdrawal(%L::uuid,'failed','Mock payout failed','spec-withdraw-failed')$$,(select value::jsonb->>'id' from financial_spec_state where key='spec-withdrawal')), 'failed withdrawal releases its reservation'); -- 81
reset role;
select is(private.available_earnings_balance('a4000000-0000-0000-0000-000000000001'), 129990::bigint, 'failed withdrawal restores earnings once'); -- 82
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
select lives_ok(format($$select public.review_provider_withdrawal(%L::uuid,'failed','Mock payout failed','spec-withdraw-failed')$$,(select value::jsonb->>'id' from financial_spec_state where key='spec-withdrawal')), 'duplicate failed payout event is harmless'); -- 83
reset role;
select is(private.available_earnings_balance('a4000000-0000-0000-0000-000000000001'), 129990::bigint, 'duplicate failure cannot release twice'); -- 84

-- Dispute hold.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values ('dispute-intent', public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000007','spec-dispute-intent','online')::text);
reset role;
select lives_ok(format($$select private.process_mock_payment_event('spec-dispute-success',%L::uuid,'payment.succeeded')$$,(select value::jsonb->>'attemptId' from financial_spec_state where key='dispute-intent')), 'disputed booking payment is initially recorded'); -- 85
insert into public.disputes(booking_id,opened_by,reason,status,description)
values('a5000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','service_issue','submitted','Customer raised a valid issue before release');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000007','spec-dispute-confirm')$$, '55000', 'Earnings are held while the dispute is reviewed', 'active dispute blocks customer-confirmed release'); -- 86
reset role;
select is(private.release_provider_earning((select id from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000007'),'spec-dispute-release'), false, 'scheduler release also respects the dispute'); -- 87
select is((select status from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000007'), 'held_for_dispute', 'unreleased earnings are held for the dispute'); -- 88

-- Provider two: post-release refund recovery and future earning offset.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values ('recovery-intent', public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000008','spec-recovery-intent','online')::text);
reset role;
select lives_ok(format($$select private.process_mock_payment_event('spec-recovery-success',%L::uuid,'payment.succeeded')$$,(select value::jsonb->>'attemptId' from financial_spec_state where key='recovery-intent')), 'provider-two recovery payment succeeds'); -- 89
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000008','spec-recovery-release')$$, 'provider-two earning becomes available'); -- 90
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state
select 'recovery-case', public.create_post_release_financial_case(id,'post_release_refund',100000,'Reviewed post-release refund','spec-recovery-case')::text
from public.financial_booking_payments where booking_id='a5000000-0000-0000-0000-000000000008';
select is((select value::jsonb->>'status' from financial_spec_state where key='recovery-case'), 'under_review', 'post-release refund starts under staff review'); -- 91
insert into financial_spec_state
select 'recovery-decision', public.decide_post_release_financial_case((select (value::jsonb->>'id')::uuid from financial_spec_state where key='recovery-case'),100000,'Provider responsibility approved after review','spec-recovery-decision')::text;
select is((select value::jsonb->>'providerDebtMinor' from financial_spec_state where key='recovery-decision'), '10000', 'insufficient available earnings create provider recovery debt'); -- 92
select is((select value::jsonb->>'externalProviderDebit' from financial_spec_state where key='recovery-decision'), 'false', 'post-release recovery never initiates an external provider debit'); -- 93
reset role;
select is(private.financial_debt_balance('a4000000-0000-0000-0000-000000000002','provider_recovery_debt'), 10000::bigint, 'reviewed recovery debt is authoritative in the ledger'); -- 94
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values ('recovery-offset-intent', public.create_booking_payment_intent('a5000000-0000-0000-0000-000000000009','spec-recovery-offset-intent','online')::text);
reset role;
select lives_ok(format($$select private.process_mock_payment_event('spec-recovery-offset-success',%L::uuid,'payment.succeeded')$$,(select value::jsonb->>'attemptId' from financial_spec_state where key='recovery-offset-intent')), 'future provider-two earning succeeds'); -- 95
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.confirm_booking_completion_for_payment('a5000000-0000-0000-0000-000000000009','spec-recovery-offset-release')$$, 'future earning applies reviewed debt offset'); -- 96
reset role;
select is(private.financial_debt_balance('a4000000-0000-0000-0000-000000000002','provider_recovery_debt'), 0::bigint, 'future online earning repays recovery debt'); -- 97
select is((select debt_offset_minor from public.provider_earnings_ledger where booking_id='a5000000-0000-0000-0000-000000000009'), 10000::bigint, 'provider debt repayment is explicit and idempotent'); -- 98

-- Cross-party isolation and no anonymous access.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.provider_financial_cases where provider_id='a4000000-0000-0000-0000-000000000002'), 0, 'provider cannot access another provider financial case'); -- 99
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.provider_cash_commission_records), 0, 'customer cannot access provider cash commission records'); -- 100
reset role;
select is(has_table_privilege('anon', 'public.provider_financial_cases', 'SELECT'), false, 'anonymous users have no private financial access'); -- 101

-- Chargebacks remain reviewed and can be wholly absorbed by Warsha.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values (
  'chargeback-intent',
  public.create_booking_payment_intent(
    'a5000000-0000-0000-0000-000000000010',
    'spec-chargeback-intent',
    'online'
  )::text
);
reset role;
insert into financial_spec_state values (
  'chargeback-success',
  private.process_mock_payment_event(
    'spec-chargeback-success',
    (select (value::jsonb->>'attemptId')::uuid
     from financial_spec_state where key='chargeback-intent'),
    'payment.succeeded'
  )::text
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state values (
  'chargeback-release',
  public.confirm_booking_completion_for_payment(
    'a5000000-0000-0000-0000-000000000010',
    'spec-chargeback-release'
  )::text
);
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
insert into financial_spec_state
select
  'chargeback-case',
  public.create_post_release_financial_case(
    id,
    'chargeback',
    100000,
    'Chargeback requires responsibility review',
    'spec-chargeback-case'
  )::text
from public.financial_booking_payments
where booking_id='a5000000-0000-0000-0000-000000000010';
select is((select value::jsonb->>'caseType' from financial_spec_state where key='chargeback-case'), 'chargeback', 'chargeback enters the reviewed financial case boundary'); -- 102
insert into financial_spec_state values (
  'chargeback-decision',
  public.decide_post_release_financial_case(
    (select (value::jsonb->>'id')::uuid
     from financial_spec_state where key='chargeback-case'),
    0,
    'Warsha absorbs the reviewed chargeback',
    'spec-chargeback-decision'
  )::text
);
select is((select value::jsonb->>'status' from financial_spec_state where key='chargeback-decision'), 'provider_not_responsible', 'chargeback does not presume provider responsibility'); -- 103
select is((select value::jsonb->>'warshaAbsorbedMinor' from financial_spec_state where key='chargeback-decision'), '100000', 'Warsha may absorb the reviewed chargeback loss'); -- 104
select is((select value::jsonb->>'externalProviderDebit' from financial_spec_state where key='chargeback-decision'), 'false', 'chargeback review never initiates an external provider debit'); -- 105

select * from finish();
rollback;
