begin;
select no_plan();

-- WPS-021 — Growth, Referrals, Promotions & Customer Acquisition.
--
-- Five questions this suite exists to answer, because all five fail silently:
--   * does a qualifying referral reward the referrer WITHOUT a human approving?
--   * can a promotion reduce what a worker earns?
--   * can anything pay out for a signup alone?
--   * can one person both author and activate Warsha's spending?
--   * can a customer enumerate programs, campaigns, or another account's reward?

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text, 'role', 'authenticated', 'aal', 'aal1',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method','password','timestamp', floor(extract(epoch from now()))::bigint))
  )::text, true);
end $fn$;

create function pg_temp.act_as_nobody()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','',true);
end $fn$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','referral_codes','referral codes exist');
select has_table('public','referral_attributions','attribution is durable');
select has_table('public','referral_programs','referral programs exist');
select has_table('public','referral_rewards','referral rewards exist');
select has_table('public','growth_campaigns','campaigns exist');
select has_table('public','booking_benefit_redemptions','benefit redemptions are durable');

-- The inert, campaign-coupled model is gone.
select hasnt_table('public','referral_reward_entitlements',
  'the inert entitlement table no longer exists');
select hasnt_table('public','campaign_eligibility_grants',
  'THE REFERRAL-TO-CAMPAIGN COUPLING TABLE NO LONGER EXISTS');
select hasnt_table('public','growth_reward_rules','the old rule table is superseded');
select hasnt_column('public','growth_campaigns','requires_grant',
  'a campaign no longer depends on a referral-issued grant');

select has_function('public','get_my_referral_code','the referral code read exists');
select has_function('public','claim_referral_code',array['text'],'claiming exists');
select has_function('public','get_my_referral_summary',array['integer'],'the summary exists');
select has_function('public','get_my_booking_benefit',array['uuid'],'the benefit read exists');
select has_function('public','redeem_booking_benefit',array['uuid'],'redemption exists');
select has_function('private','evaluate_referral_benefit',array['uuid','uuid'],
  'the referral evaluator is private');
select has_function('private','evaluate_promotion_eligibility',array['uuid','uuid'],
  'the campaign evaluator is private and SEPARATE from the referral one');
select has_function('private','grant_referral_reward',
  array['referral_programs','referral_attributions','uuid','text'],
  'automatic reward issuance is a private server function');
select has_function('private','expire_referral_rewards','expiry returns budget to the program');

-- Separate staff surfaces, so the two systems have independent audit trails.
select has_function('public','staff_create_referral_program_draft',array['jsonb'],
  'referral programs have their own drafting RPC');
select has_function('public','staff_activate_referral_program',array['uuid','text'],
  'referral programs have their own activation RPC');
select has_function('public','staff_create_campaign_draft',array['jsonb'],
  'campaigns have their own drafting RPC');
select has_function('public','staff_activate_campaign',array['uuid','text'],
  'campaigns have their own activation RPC');

-- ---------------------------------------------------------------------------
-- Preservation
-- ---------------------------------------------------------------------------
select has_function('private','create_booking_price_snapshot',array['uuid','bigint'],
  'the WPS-007 snapshot authority is preserved');
select has_function('private','record_trust_fraud_signal',array['uuid','text','text','integer','jsonb'],
  'the WPS-016 advisory signal sink is preserved');
select has_function('private','consume_dual_control',array['text','text','text','text'],
  'the WPS-018 dual control primitive is preserved');
select has_function('private','enforce_rate_limit',array['text','text'],
  'the WPS-018 rate limiter is preserved');

-- ---------------------------------------------------------------------------
-- No wallet, no balance, no transfer
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from information_schema.columns
  where table_schema='public'
    and table_name in ('referral_rewards','booking_benefit_redemptions',
                       'referral_attributions','referral_codes')
    and (column_name ~ 'balance' or column_name ~ 'credit')),
  0, 'no WPS-021 table has a balance or credit column');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in ('wallets','wallet_transactions')),
  0, 'the dormant wallet scaffold carries no policy');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and table_name in ('wallets','wallet_transactions')
    and grantee in ('anon','authenticated','public')),
  0, 'NO CLIENT ROLE HOLDS ANY GRANT ON THE WALLET SCAFFOLD');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and pg_get_functiondef(p.oid) ~ 'public\.wallets'),
  0, 'NO FUNCTION ANYWHERE READS OR WRITES A WALLET');

-- ---------------------------------------------------------------------------
-- Retired legacy scaffold
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in ('promo_codes','promo_code_uses')),
  0, 'the legacy promo scaffold carries no policy at all');
select ok((select relrowsecurity from pg_class where relname='promo_codes'),
  'RLS is enabled on promo_codes, so a future GRANT still returns nothing');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and table_name in ('promo_codes','promo_code_uses')
    and grantee in ('anon','authenticated','public')),
  0, 'no role holds a grant on the retired scaffold');
select has_table('public','promo_codes','the legacy table is retired, not dropped');

-- ---------------------------------------------------------------------------
-- Programs and campaigns are never client-readable
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in ('growth_campaigns','referral_programs')),
  0, 'no policy exposes a campaign or a program to any client');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and table_name in ('growth_campaigns','referral_programs')),
  0, 'no client role holds a grant on a campaign or program table');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee='authenticated'
    and table_name in ('referral_codes','referral_attributions',
                       'referral_rewards','booking_benefit_redemptions')
    and privilege_type in ('INSERT','UPDATE','DELETE')),
  0, 'A CLIENT CANNOT WRITE A CODE, AN ATTRIBUTION, A REWARD, OR A REDEMPTION');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and table_name in ('referral_codes','referral_attributions',
                       'referral_rewards','booking_benefit_redemptions')),
  0, 'anon holds no grant on any growth table');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000001','authenticated','authenticated','wps021-referrer@test.local','',now(),'{}','{"display_name":"Referrer Account"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000002','authenticated','authenticated','wps021-referred@test.local','',now(),'{}','{"display_name":"Referred Account"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000003','authenticated','authenticated','wps021-third@test.local','',now(),'{}','{"display_name":"Third Account"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000004','authenticated','authenticated','wps021-worker@test.local','',now(),'{}','{"display_name":"Worker Account"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000005','authenticated','authenticated','wps021-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000006','authenticated','authenticated','wps021-author@test.local','',now(),'{}','{"display_name":"Growth Author"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000007','authenticated','authenticated','wps021-activator@test.local','',now(),'{}','{"display_name":"Growth Activator"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000008','authenticated','authenticated','wps021-approver@test.local','',now(),'{}','{"display_name":"Dual Approver"}',now(),now());

insert into public.customer_profiles(id) values
  ('a2100000-0000-4000-8000-000000000001'),
  ('a2100000-0000-4000-8000-000000000002'),
  ('a2100000-0000-4000-8000-000000000003') on conflict do nothing;

insert into public.provider_profiles(id,user_id,display_name,profession_key,
  onboarding_status,is_published,is_verified)
values ('b2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000004',
  'WPS021 Worker','plumber','approved',true,true);

insert into public.addresses(id,customer_id,label,address_line,governorate) values
  ('c2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000002','Home','1 Test Street','Cairo'),
  ('c2100000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000003','Home','2 Test Street','Cairo'),
  ('c2100000-0000-4000-8000-000000000003','a2100000-0000-4000-8000-000000000001','Home','3 Test Street','Cairo');

-- Seeded at `job_started` because private.enforce_booking_transition is a real
-- state machine: confirmed -> completed is not a legal edge. The fixture takes
-- the one legal transition rather than bypassing the WPS-012 rule.
select pg_temp.act_as('a2100000-0000-4000-8000-000000000002');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000002',
  'b2100000-0000-4000-8000-000000000001',s.id,'job_started','WPS021 fixture','fixed',500,
  'Growth fixture booking',current_date,'12:00',
  'c2100000-0000-4000-8000-000000000001','Private fixture address','wps021-booking-1'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select ok(private.bootstrap_staff_role('a2100000-0000-4000-8000-000000000005',
  'security_administrator','WPS-021 fixture bootstrap') is not null,
  'the fixture administrator is bootstrapped by a DBA');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000005');
select ok(public.staff_grant_role('a2100000-0000-4000-8000-000000000006','marketplace_operations',
  'WPS-021 fixture','wps021-grant-0001') is not null, 'a growth author is granted');
select ok(public.staff_grant_role('a2100000-0000-4000-8000-000000000007','operations_manager',
  'WPS-021 fixture','wps021-grant-0002') is not null, 'a growth activator is granted');
select ok(public.staff_grant_role('a2100000-0000-4000-8000-000000000008','operations_manager',
  'WPS-021 fixture','wps021-grant-0003') is not null, 'a dual-control approver is granted');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous denial
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.get_my_referral_code()$$,'42501',null,
  'an anonymous caller cannot obtain a referral code');
select throws_ok($$select public.claim_referral_code('ABCDEFGHJK')$$,'42501',null,
  'an anonymous caller cannot claim a code');
select throws_ok($$select public.get_my_booking_benefit(
  'd2100000-0000-4000-8000-000000000001')$$,'42501',null,
  'an anonymous caller cannot ask for a benefit');
select throws_ok($$select public.redeem_booking_benefit(
  'd2100000-0000-4000-8000-000000000001')$$,'42501',null,
  'an anonymous caller cannot redeem');
reset role;

-- ---------------------------------------------------------------------------
-- Fail closed
-- ---------------------------------------------------------------------------
select ok(not private.growth_referrals_open('customer'),'referrals ship disabled');
select ok(not private.growth_promotions_open('customer'),'promotions ship disabled');
select ok(not private.growth_feature_enabled('growth_nonexistent_flag','customer'),
  'an ABSENT flag is off, so a missing seed row cannot enable a growth feature');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.get_my_referral_code()->>'available','false',
  'no referral code is issued while the flag is off');
reset role;
select is((select count(*)::integer from public.referral_codes),0,
  'nothing was written while the feature was off');

-- ---------------------------------------------------------------------------
-- Referral codes
-- ---------------------------------------------------------------------------
update private.staff_feature_flags set enabled=true, audience='all'
  where flag_key='growth_referrals' and environment='local';

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.get_my_referral_code()->>'available','true','a code is issued once enabled');
select matches(public.get_my_referral_code()->>'code','^[2-9A-HJKMNP-Z]{10}$',
  'the code uses the unambiguous 31-symbol alphabet');
select is((select count(*)::integer from public.referral_codes
  where owner_user_id='a2100000-0000-4000-8000-000000000001'),1,
  'an account holds exactly one code for its lifetime');
reset role;

select set_config('warsha.test_referral_code',
  (select code from public.referral_codes
   where owner_user_id='a2100000-0000-4000-8000-000000000001'), true);

select throws_ok($$update public.referral_codes set code='ZZZZZZZZZZ'$$,'55000',null,
  'the code text is immutable even for a superuser');
select throws_ok($$delete from public.referral_codes$$,'55000',null,
  'referral codes cannot be deleted');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
select is((select count(*)::integer from public.referral_codes),0,
  'a third party sees no other account''s referral code');
reset role;

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.claim_referral_code(
  current_setting('warsha.test_referral_code'))->>'reason','self',
  'SELF-REFERRAL FAILS');
reset role;

select is((select count(*)::integer from private.trust_fraud_signals
  where signal_key='duplicate_identity'
    and safe_detail->>'growthSignal'='self_referral_attempt'),1,
  'a self-referral attempt is RECORDED as an advisory signal');
select is((select count(*)::integer from public.trust_enforcement_actions),0,
  'and nothing was enforced: WPS-016 decides, WPS-021 only observes');
select is((select count(*)::integer from pg_constraint
  where conname='trust_fraud_signals_key_check'
    and pg_get_constraintdef(oid) ~ 'growth'),0,
  'WPS-021 did not widen the WPS-016 signal vocabulary to fit itself');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000002');
select is(public.claim_referral_code('ZZZZZZZZZZ')->>'reason','invalid',
  'an unknown code is rejected');
select is(public.claim_referral_code('short')->>'reason','invalid',
  'a malformed code is rejected before any lookup');
select is((select count(*)::integer from public.referral_codes),0,
  'the referred account cannot see the referrer''s code row at all');
select is(public.claim_referral_code(
  current_setting('warsha.test_referral_code'))->>'accepted','true',
  'a valid code is claimed even though the claimer cannot read its row');
select is(public.claim_referral_code(
  current_setting('warsha.test_referral_code'))->>'reason','already_attributed',
  'an account can be attributed only once, ever');
reset role;

select is((select status from public.referral_attributions),'pending',
  'attribution starts pending: signing up earns nothing');
select is((select count(*)::integer from public.referral_rewards),0,
  'NO REWARD EXISTS FOR A SIGNUP ALONE');

select throws_ok($$update public.referral_attributions
  set referred_user_id='a2100000-0000-4000-8000-000000000003'$$,'55000',null,
  'attribution is immutable');
select throws_ok($$insert into public.referral_attributions(
    referral_code_id, referrer_user_id, referred_user_id, referred_role, expires_at)
  select id,'a2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001',
    'customer', now() + interval '90 days' from public.referral_codes limit 1$$,
  '23514',null,'a self-referral cannot be written even directly');

-- ---------------------------------------------------------------------------
-- No active program: qualification still grants nothing
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2100000-0000-4000-8000-000000000002');
update public.bookings set status='completed' where id='d2100000-0000-4000-8000-000000000001';
select pg_temp.act_as_nobody();
select is((select status from public.referral_attributions),'pending',
  'completion without a WPS-007 price snapshot does not qualify');

select ok(private.create_booking_price_snapshot('d2100000-0000-4000-8000-000000000001') is not null,
  'a WPS-007 snapshot is created by the existing authority');
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000001');
select is((select status from public.referral_attributions),'qualified',
  'the referral qualifies on a completed booking with a snapshot');
select is((select count(*)::integer from public.referral_rewards),0,
  'AN INACTIVE REFERRAL PROGRAM GRANTS NOTHING');

-- ---------------------------------------------------------------------------
-- Referral program: staff approve the PROGRAM, once, in advance
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select ok(public.staff_create_referral_program_draft(jsonb_build_object(
  'programKey','launch_referral',
  'displayNameEn','Invite a friend','displayNameAr','ادعُ صاحبك',
  'descriptionEn','Earn when their first job is done.','descriptionAr','اكسب لما أول شغلانة تخلص.',
  'audience','customer','qualifyingEvent','first_completed_booking',
  'beneficiary','referrer','rewardType','fixed','rewardValue',50,
  'maxRewardMinor',5000,'rewardExpiryDays',90,
  'perReferrerLimit',10,'perReferredLimit',1,'budgetMinor',1000000,
  'startsAt',(now() - interval '1 hour')::text,'endsAt',(now() + interval '30 days')::text
))->>'id' is not null, 'staff can draft a referral program');
reset role;

select is((select status from public.referral_programs where program_key='launch_referral'),
  'draft','a new program starts as a draft');

select set_config('warsha.test_program_id',
  (select id::text from public.referral_programs where program_key='launch_referral'), true);

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select throws_ok(format($$select public.staff_activate_referral_program(%L,'self approval')$$,
  current_setting('warsha.test_program_id')),
  '42501',null,'THE CREATOR CANNOT ACTIVATE THEIR OWN REFERRAL PROGRAM');
reset role;

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select throws_ok(format($$select public.staff_activate_referral_program(%L,'no approval yet')$$,
  current_setting('warsha.test_program_id')),
  '42501',null,'activation without a second approver is refused');
select ok(public.staff_request_dual_control('approve_referral_program','activate_referral_program',
  current_setting('warsha.test_program_id'),
  'WPS-021 fixture program activation') is not null, 'the activator opens an approval request');
reset role;

select set_config('warsha.test_dual_id',
  (select id::text from private.staff_dual_control_requests
   where action_key='activate_referral_program' order by created_at desc limit 1), true);

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000008');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.test_dual_id')::uuid,
  'Approved for WPS-021 fixture') is not null, 'a different staff member approves');
reset role;

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select ok(public.staff_activate_referral_program(
  current_setting('warsha.test_program_id')::uuid,
  'Activating for WPS-021 fixture') is not null, 'the program activates with dual control satisfied');
reset role;

select is((select status from public.referral_programs where program_key='launch_referral'),
  'active','the program is active');
select throws_ok($$update public.referral_programs set reward_value=9999
  where program_key='launch_referral'$$,'55000',null,
  'AN APPROVED REFERRAL PROGRAM IS IMMUTABLE');

-- ---------------------------------------------------------------------------
-- AUTOMATIC reward issuance
-- ---------------------------------------------------------------------------
-- `reset role` above restored the session role but NOT the JWT claims, which are
-- transaction-scoped. Without this the actor would still be the staff member who
-- activated the programme, and record_booking_status would correctly refuse a
-- booking created on somebody else's behalf.
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2100000-0000-4000-8000-000000000004','a2100000-0000-4000-8000-000000000003',
  'b2100000-0000-4000-8000-000000000001',s.id,'job_started','WPS021 fixture 4','fixed',400,
  'Growth fixture booking four',current_date,'09:00',
  'c2100000-0000-4000-8000-000000000002','Private fixture address','wps021-booking-4'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

-- A second referral, this time with an active program running.
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
select is(public.claim_referral_code(
  current_setting('warsha.test_referral_code'))->>'accepted','true',
  'a third account is attributed to the same referrer');
reset role;

select is((select count(*)::integer from public.referral_rewards),0,
  'still no reward: attribution alone earns nothing even with a live program');

select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
update public.bookings set status='completed' where id='d2100000-0000-4000-8000-000000000004';
select pg_temp.act_as_nobody();
select ok(private.create_booking_price_snapshot('d2100000-0000-4000-8000-000000000004') is not null,
  'the qualifying booking carries a WPS-007 snapshot');
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000004');

select is((select count(*)::integer from public.referral_rewards),1,
  'QUALIFICATION AUTOMATICALLY GRANTS THE REWARD — no staff action of any kind');
select is((select beneficiary_user_id from public.referral_rewards),
  'a2100000-0000-4000-8000-000000000001'::uuid,
  'the reward went to the referrer named by the program');
select is((select status from public.referral_rewards),'available',
  'THE REWARD IS IMMEDIATELY AVAILABLE, not pending anybody''s approval');
select is((select reserved_minor from public.referral_rewards),5000::bigint,
  'the reward reserved its ceiling against the program budget');
select is((select budget_consumed_minor from public.referral_programs
  where program_key='launch_referral'),5000::bigint,
  'the program budget reflects the reservation immediately');
select ok((select expires_at from public.referral_rewards) > now() + interval '89 days',
  'the reward carries the program''s expiry');

-- No staff audit row exists for granting this reward, because no staff member
-- was involved. Only the program approval is audited.
select is((select count(*)::integer from private.staff_audit_events
  where action = 'referral_reward_granted'),0,
  'NO PER-REFERRAL STAFF APPROVAL EXISTS IN THE AUDIT TRAIL');
select ok((select count(*) from private.staff_audit_events
  where action = 'referral_program_activated') = 1,
  'the PROGRAM approval is the only human decision recorded');

-- Idempotency.
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000004');
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000004');
select is((select count(*)::integer from public.referral_rewards),1,
  'DUPLICATE QUALIFICATION IS IDEMPOTENT: no duplicate reward');
select is((select budget_consumed_minor from public.referral_programs
  where program_key='launch_referral'),5000::bigint,
  'and no duplicate budget reservation');

-- Nothing financial happened yet.
select is((select count(*)::integer from private.financial_ledger_transactions),0,
  'A GRANTED REWARD POSTS NO LEDGER TRANSACTION');
select is((select count(*)::integer from public.provider_earnings_ledger),0,
  'and nothing reached the worker earnings ledger');

-- The reward cannot be transferred or read by anybody else.
select throws_ok($$update public.referral_rewards
  set beneficiary_user_id='a2100000-0000-4000-8000-000000000003'$$,'55000',null,
  'A REWARD CANNOT BE TRANSFERRED TO ANOTHER ACCOUNT');
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
select is((select count(*)::integer from public.referral_rewards),0,
  'A REWARD CANNOT BE ENUMERATED BY ANOTHER ACCOUNT');
reset role;
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.referral_rewards),1,
  'the owner sees their own reward');
select is(public.get_my_referral_summary(20)->'rewards'->0->>'status','available',
  'the summary reports the reward as available');
reset role;

-- ---------------------------------------------------------------------------
-- AUTOMATIC redemption on an eligible booking
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2100000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000001',
  'b2100000-0000-4000-8000-000000000001',s.id,'confirmed','WPS021 fixture 2','fixed',1000,
  'Growth fixture booking two',current_date,'14:00',
  'c2100000-0000-4000-8000-000000000003','Private fixture address','wps021-booking-2'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select is(private.evaluate_referral_benefit(
  'a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'true','THE REWARD AUTOMATICALLY BECOMES USABLE ON AN ELIGIBLE BOOKING');
select is(private.evaluate_referral_benefit(
  'a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000002')->>'discountMinor',
  '5000','the fixed 50 EGP reward is worth 5000 minor units');

-- Somebody else's booking is not an eligible booking.
select is(private.evaluate_referral_benefit(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'false','a reward cannot be applied to another account''s booking');
select is(private.evaluate_referral_benefit(
  'a2100000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000001')->>'eligible',
  'false','an account with no reward has no benefit');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.get_my_booking_benefit('d2100000-0000-4000-8000-000000000002')->>'source',
  'referral_reward','the booking benefit is the referral reward');
select is(public.redeem_booking_benefit('d2100000-0000-4000-8000-000000000002')->>'redeemed','true',
  'the reward is redeemed');
select throws_ok($$select public.redeem_booking_benefit(
  'd2100000-0000-4000-8000-000000000002')$$,'42501',null,
  'THE REWARD IS CONSUMED EXACTLY ONCE');
reset role;

select is((select status from public.referral_rewards),'consumed','the reward is consumed');
select is((select consumed_minor from public.referral_rewards),5000::bigint,
  'the consumed amount is recorded');
select is((select count(*)::integer from public.booking_benefit_redemptions
  where booking_id='d2100000-0000-4000-8000-000000000002'),1,
  'exactly one benefit redemption exists for the booking');
select is((select source from public.booking_benefit_redemptions),'referral_reward',
  'the redemption records its source');

-- ---------------------------------------------------------------------------
-- The worker's money
-- ---------------------------------------------------------------------------
select is(
  (select s.provider_gross_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  100000::bigint,
  'THE WORKER GROSS IS THE FULL BOOKING VALUE, UNREDUCED BY THE REWARD');
select is(
  (select s.customer_total_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  95000::bigint,
  'the customer pays 50 EGP less');
select is(
  (select s.commission_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  10000::bigint,
  'the commission basis is the unreduced worker gross');
select is(
  (select s.pricing_version from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  'warsha-funded-promotion-v1',
  'the existing WPS-007 Warsha-funded pricing version is used, not a new one');
select is(
  (select s.customer_total_minor + s.promotion_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  (select s.provider_gross_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  'the difference is exactly the Warsha-funded benefit');

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
update public.bookings set status='cancelled' where id='d2100000-0000-4000-8000-000000000002';
select pg_temp.act_as_nobody();

select is((select status from public.booking_benefit_redemptions
  where booking_id='d2100000-0000-4000-8000-000000000002'),'reversed',
  'cancelling the booking reverses the redemption');
select is((select status from public.referral_rewards),'available',
  'the default cancellation treatment RESTORES the reward to the customer');
select is((select budget_consumed_minor from public.referral_programs
  where program_key='launch_referral'),5000::bigint,
  'the reservation is re-applied, so the program budget bound still holds');
select is((select price_breakdown->>'discount' from public.bookings
  where id='d2100000-0000-4000-8000-000000000002'),'0',
  'the discount is cleared from the booking so a re-snapshot cannot reapply it');

-- ---------------------------------------------------------------------------
-- Expiry returns the reservation
-- ---------------------------------------------------------------------------
select is(private.expire_referral_rewards(),0,'nothing expires while the reward is live');

-- ---------------------------------------------------------------------------
-- Admin promotions are INDEPENDENT of referrals
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select ok(public.staff_create_campaign_draft(jsonb_build_object(
  'campaignKey','welcome_back',
  'displayNameEn','Welcome back','displayNameAr','نورت تاني',
  'descriptionEn','A returning-customer offer.','descriptionAr','عرض للعميل الراجع.',
  'audience','customer','discountType','percentage','discountValue',10,
  'maxDiscountMinor',5000,
  'startsAt',(now() - interval '1 hour')::text,'endsAt',(now() + interval '30 days')::text,
  'budgetMinor',1000000,'globalRedemptionLimit',100,'perAccountLimit',1,
  'minCompletedBookings',1))->>'id' is not null, 'staff can draft a campaign');
reset role;

select set_config('warsha.test_campaign_id',
  (select id::text from public.growth_campaigns where campaign_key='welcome_back'), true);

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select throws_ok(format($$select public.staff_activate_campaign(%L,'self approval')$$,
  current_setting('warsha.test_campaign_id')),
  '42501',null,'THE CREATOR CANNOT ACTIVATE THEIR OWN CAMPAIGN');
reset role;

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select ok(public.staff_request_dual_control('approve_growth_campaign','activate_campaign',
  current_setting('warsha.test_campaign_id'),
  'WPS-021 fixture campaign activation') is not null, 'the activator opens an approval request');
reset role;

select set_config('warsha.test_dual_id',
  (select id::text from private.staff_dual_control_requests
   where action_key='activate_campaign' order by created_at desc limit 1), true);

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000008');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.test_dual_id')::uuid,
  'Approved for WPS-021 fixture') is not null, 'a different staff member approves the campaign');
reset role;

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select ok(public.staff_activate_campaign(
  current_setting('warsha.test_campaign_id')::uuid,
  'Activating for WPS-021 fixture') is not null, 'the campaign activates');
reset role;

update private.staff_feature_flags set enabled=true, audience='all'
  where flag_key='growth_promotions' and environment='local';

-- Account 3 has one completed booking and has NEVER referred anybody and holds
-- no referral reward. It must still be eligible for the campaign.
select is((select count(*)::integer from public.referral_rewards
  where beneficiary_user_id='a2100000-0000-4000-8000-000000000003'),0,
  'the campaign candidate holds no referral reward');
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2100000-0000-4000-8000-000000000005','a2100000-0000-4000-8000-000000000003',
  'b2100000-0000-4000-8000-000000000001',s.id,'confirmed','WPS021 fixture 5','fixed',1000,
  'Growth fixture booking five',current_date,'17:00',
  'c2100000-0000-4000-8000-000000000002','Private fixture address','wps021-booking-5'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000005')->>'eligible',
  'true','ADMIN PROMOTIONS WORK INDEPENDENTLY OF REFERRAL STATE');
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000005')->>'discountMinor',
  '5000','the capped 10 percent campaign is worth 50 EGP on a 1000 EGP booking');

-- Account 2 has one completed booking too, so the criterion is evaluated per
-- user automatically with no staff involvement.
select ok(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000001') is not null,
  'campaign eligibility is evaluated per user automatically');

-- The kill switch restricts without touching the campaign.
update private.staff_kill_switches set active=true, reason='WPS-021 fixture kill switch test'
  where switch_key='growth_promotions';
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000005')->>'eligible',
  'false','the kill switch closes promotions immediately');
update private.staff_kill_switches set active=false, reason=null
  where switch_key='growth_promotions';

-- The referral kill switch is separate and does not close campaigns.
update private.staff_kill_switches set active=true, reason='WPS-021 referral switch test'
  where switch_key='growth_referrals';
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000005')->>'eligible',
  'true','THE REFERRAL KILL SWITCH DOES NOT AFFECT ADMIN PROMOTIONS');
update private.staff_kill_switches set active=false, reason=null
  where switch_key='growth_referrals';

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
select is(public.get_my_booking_benefit('d2100000-0000-4000-8000-000000000005')->>'source',
  'campaign','a customer with no referral history still receives a campaign benefit');
select is(public.redeem_booking_benefit('d2100000-0000-4000-8000-000000000005')->>'redeemed','true',
  'the campaign benefit is redeemed');
reset role;

select is((select redemption_count from public.growth_campaigns where campaign_key='welcome_back'),
  1,'the campaign counter advanced by one');
select is(
  (select s.provider_gross_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000005' and s.is_current),
  100000::bigint,
  'a campaign benefit also leaves worker gross untouched');

-- ---------------------------------------------------------------------------
-- Stacking: one benefit per booking, of any kind
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.booking_benefit_redemptions(
  booking_id,user_id,source,campaign_id,campaign_key,discount_minor,idempotency_key)
  select 'd2100000-0000-4000-8000-000000000005','a2100000-0000-4000-8000-000000000003',
    'campaign',id,'welcome_back',100,'dup' from public.growth_campaigns
  where campaign_key='welcome_back'$$,
  '23505',null,'ONE BENEFIT PER BOOKING IS A UNIQUE CONSTRAINT, NOT A CHECK');
select throws_ok($$insert into public.booking_benefit_redemptions(
  booking_id,user_id,source,referral_reward_id,campaign_id,discount_minor,idempotency_key)
  select 'd2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000002',
    'campaign',r.id,c.id,100,'both'
  from public.referral_rewards r, public.growth_campaigns c limit 1$$,
  '23514',null,'a redemption cannot name both a reward and a campaign');

-- ---------------------------------------------------------------------------
-- Ranking is untouched
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.marketplace_candidate_scores),0,
  'no growth activity wrote a marketplace ranking score');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and p.proname ~ '(rank|score|match)'
    and pg_get_functiondef(p.oid) ~
      '(growth_campaigns|referral_codes|referral_rewards|referral_programs)'),
  0,'REFERRAL STATE NEVER AFFECTS WPS-008 RANKING');

-- The campaign evaluator does not read referral state, and vice versa.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='evaluate_promotion_eligibility'
    and pg_get_functiondef(p.oid) ~ '(referral_rewards|referral_programs|referral_attributions)'),
  0,'THE CAMPAIGN EVALUATOR READS NO REFERRAL STATE');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='evaluate_referral_benefit'
    and pg_get_functiondef(p.oid) ~ 'growth_campaigns'),
  0,'the referral evaluator reads no campaign state');

-- ---------------------------------------------------------------------------
-- Privacy
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select ok(public.get_my_referral_summary(20)::text not ilike '%test.local%',
  'the referral summary discloses no referred account''s email');
select ok(not (public.get_my_referral_summary(20) ? 'referredUsers'),
  'referred accounts are COUNTED, never named');
reset role;

select is((select count(*)::integer from private.operational_log_events
  where event_key like 'growth.%'
    and (safe_detail::text ~* '(@|a2100000|referral_code)')),
  0,'no growth analytics event carries an identifier, an email, or a code');
select ok((select count(*) from private.operational_log_events
  where event_key like 'growth.%') > 0,
  'growth analytics events were nevertheless recorded');
select is((select count(*)::integer from private.operational_log_events
  where event_key like 'growth.%' and category <> 'marketplace'),
  0,'growth events use the existing marketplace category, adding no new one');

-- ---------------------------------------------------------------------------
-- Reuse
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.rate_limit_policies
  where policy_key like 'growth_%'),4,'four growth rate-limit policies are registered');
select is((select count(*)::integer from private.rate_limit_policies
  where policy_key like 'growth_%' and enforced_by <> 'wps018_limiter'),
  0,'every growth limit is enforced by the WPS-018 limiter, not a new one');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type in ('referral_qualified','referral_pending','promotion_available',
    'promotion_expiring','promotion_redeemed')),5,
  'five growth notification events are catalogued');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type in ('referral_qualified','referral_pending','promotion_available',
    'promotion_expiring','promotion_redeemed')
    and (priority in ('critical','action_required') or quiet_hours_bypass)),
  0,'no growth notification is critical, action-required, or quiet-hours bypassing');
select is((select count(*)::integer from public.staff_capabilities
  where capability_key in ('manage_referral_programs','approve_referral_program',
    'manage_growth_campaigns','approve_growth_campaign')),4,
  'referrals and campaigns carry SEPARATE staff capabilities');

-- ---------------------------------------------------------------------------
-- Nothing was enabled by shipping this
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.staff_feature_flags
  where flag_key in ('online_payments','payouts','push_notifications')
    and enabled),0,'WPS-021 enabled no payment, payout, or push flag');
select is((select count(*)::integer from private.staff_kill_switches
  where switch_key like 'growth_%' and active),0,
  'both growth kill switches are left inactive');

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER hygiene
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and (p.proname like 'growth%' or p.proname like '%referral%'
         or p.proname like '%campaign%' or p.proname like '%promotion%'
         or p.proname like '%benefit%')
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                    where c ~ '^search_path=("")?$')),
  0,'every WPS-021 SECURITY DEFINER function pins an empty search_path');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and (p.proname like 'growth%' or p.proname like '%referral%'
         or p.proname like '%campaign%' or p.proname like '%promotion%'
         or p.proname like '%benefit%')) >= 20,
  'and that check actually covered the WPS-021 function surface');

select * from finish();
rollback;
