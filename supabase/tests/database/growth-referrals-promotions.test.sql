begin;
select no_plan();

-- WPS-021 — Growth, Referrals, Promotions & Customer Acquisition.
--
-- Four questions this suite exists to answer, because all four fail silently:
--   * can a customer enumerate campaigns or codes by any path?
--   * can a promotion reduce what a worker earns?
--   * can anything pay out for a signup alone?
--   * can one person both author and activate Warsha's spending?

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
select has_table('public','referral_reward_entitlements','reward entitlements exist');
select has_table('public','growth_reward_rules','reward rules are staff-defined');
select has_table('public','growth_campaigns','campaigns exist');
select has_table('public','campaign_eligibility_grants','eligibility grants exist');
select has_table('public','campaign_redemptions','redemptions are durable');

select has_function('public','get_my_referral_code','the referral code read exists');
select has_function('public','claim_referral_code',array['text'],'claiming exists');
select has_function('public','get_my_referral_summary',array['integer'],'the summary exists');
select has_function('public','get_my_eligible_promotion',array['uuid'],'eligibility read exists');
select has_function('public','redeem_promotion',array['uuid','text'],'redemption exists');
select has_function('private','evaluate_promotion_eligibility',array['uuid','uuid'],
  'the eligibility evaluator is private');
select has_function('private','growth_random_code',array['integer'],'code generation is private');
select has_function('private','qualify_referral_for_booking',array['uuid'],
  'qualification is private and server-driven');

-- ---------------------------------------------------------------------------
-- Preservation: WPS-021 extends, it does not replace
-- ---------------------------------------------------------------------------
select has_function('private','create_booking_price_snapshot',array['uuid','bigint'],
  'the WPS-007 snapshot authority is preserved');
select has_function('private','record_trust_fraud_signal',array['uuid','text','text','integer','jsonb'],
  'the WPS-016 advisory signal sink is preserved');
select has_function('private','consume_dual_control',array['text','text','text'],
  'the WPS-018 dual control primitive is preserved');
select has_function('private','enforce_rate_limit',array['text','text'],
  'the WPS-018 rate limiter is preserved');
select has_function('private','record_operational_event',array['text','text','text','jsonb','text','uuid'],
  'the WPS-018 analytics sink is preserved');

-- WPS-021 creates no second financial system.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname ~ '(ledger|balance|wallet)'
    and p.proname ~ 'growth|referral|campaign|promotion'),
  0, 'WPS-021 defines no ledger, balance, or wallet function');
-- `public.wallets` and `public.wallet_transactions` are a SECOND dormant day-one
-- scaffold, alongside promo_codes. They are empty and unreferenced, but a table
-- carrying `balance_egp` is exactly what someone would revive when asked to
-- build referral credits. WPS-021's locked scope forbids a customer wallet.
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in ('wallets','wallet_transactions')),
  0, 'the dormant wallet scaffold carries no policy');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and table_name in ('wallets','wallet_transactions')
    and grantee in ('anon','authenticated','public')),
  0, 'NO CLIENT ROLE HOLDS ANY GRANT ON THE WALLET SCAFFOLD');
select ok((select relrowsecurity from pg_class where relname='wallets'),
  'RLS is enabled on wallets so a future GRANT still returns nothing');
select isnt((select obj_description('public.wallets'::regclass)), null,
  'the wallet retirement is documented on the table itself');
select is((select count(*)::integer from public.wallets), 0,
  'no wallet row has ever been written');
-- prokind='f' excludes aggregates and window functions, for which
-- pg_get_functiondef raises rather than returning a definition.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and pg_get_functiondef(p.oid) ~ 'public\.wallets'),
  0, 'NO FUNCTION ANYWHERE READS OR WRITES A WALLET');
select is((select count(*)::integer from information_schema.columns
  where table_schema='public'
    and table_name in ('referral_reward_entitlements','campaign_redemptions',
                       'referral_attributions','referral_codes')
    and (column_name ~ 'balance' or column_name ~ 'credit')),
  0, 'no WPS-021 table has a balance or credit column: an entitlement is not money');

-- ---------------------------------------------------------------------------
-- The retired legacy scaffold
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in ('promo_codes','promo_code_uses')),
  0, 'the legacy promo scaffold carries no policy at all');
select ok((select relrowsecurity from pg_class where relname='promo_codes'),
  'RLS is enabled on promo_codes, so a future GRANT still returns nothing');
select ok((select relrowsecurity from pg_class where relname='promo_code_uses'),
  'RLS is enabled on promo_code_uses');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and table_name in ('promo_codes','promo_code_uses')
    and grantee in ('anon','authenticated','public')),
  0, 'no role holds a grant on the retired scaffold');
select isnt((select obj_description('public.promo_codes'::regclass)), null,
  'the retirement is documented on the table itself');

-- The tables still exist. Dropping them would be irreversible and they carry
-- foreign keys into customer_profiles and bookings on the hosted project.
select has_table('public','promo_codes','the legacy table is retired, not dropped');

-- ---------------------------------------------------------------------------
-- Campaigns are never client-readable
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename in
    ('growth_campaigns','growth_reward_rules','campaign_eligibility_grants')),
  0, 'no policy exposes campaigns, rules, or grants to any client');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and table_name in ('growth_campaigns','growth_reward_rules','campaign_eligibility_grants')),
  0, 'no client role holds a grant on any campaign table');

-- The owner-scoped tables are readable but never writable by a client: every
-- write goes through an RPC that enforces the rules.
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee='authenticated'
    and table_name in ('referral_codes','referral_attributions',
                       'referral_reward_entitlements','campaign_redemptions')
    and privilege_type in ('INSERT','UPDATE','DELETE')),
  0, 'A CLIENT CANNOT WRITE A CODE, AN ATTRIBUTION, A REWARD, OR A REDEMPTION');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and table_name in ('referral_codes','referral_attributions',
                       'referral_reward_entitlements','campaign_redemptions')),
  0, 'anon holds no grant on any growth table');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000001','authenticated','authenticated','wps021-referrer@test.local','',now(),'{}','{"display_name":"Referrer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000002','authenticated','authenticated','wps021-referred@test.local','',now(),'{}','{"display_name":"Referred"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000003','authenticated','authenticated','wps021-third@test.local','',now(),'{}','{"display_name":"Third"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000004','authenticated','authenticated','wps021-worker@test.local','',now(),'{}','{"display_name":"Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000005','authenticated','authenticated','wps021-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000006','authenticated','authenticated','wps021-author@test.local','',now(),'{}','{"display_name":"Campaign Author"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000007','authenticated','authenticated','wps021-activator@test.local','',now(),'{}','{"display_name":"Campaign Activator"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2100000-0000-4000-8000-000000000008','authenticated','authenticated','wps021-approver@test.local','',now(),'{}','{"display_name":"Dual Approver"}',now(),now());

insert into public.customer_profiles(id) values
  ('a2100000-0000-4000-8000-000000000001'),
  ('a2100000-0000-4000-8000-000000000002'),
  ('a2100000-0000-4000-8000-000000000003') on conflict do nothing;

insert into public.provider_profiles(id,user_id,display_name,profession_key,
  onboarding_status,is_published,is_verified)
values ('b2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000004',
  'WPS021 Worker','plumber','approved',true,true);

insert into public.addresses(id,customer_id,label,address_line,governorate)
values ('c2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000002',
  'Home','1 Test Street','Cairo');

-- The WPS-012 booking audit trigger requires the actor to be the customer or the
-- provider, so fixtures are written as the customer rather than as a DBA.
select pg_temp.act_as('a2100000-0000-4000-8000-000000000002');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
-- Seeded at `job_started` because private.enforce_booking_transition is a real
-- state machine: confirmed -> completed is not a legal edge. The fixture takes
-- the one legal transition rather than bypassing the WPS-012 rule.
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
  'WPS-021 fixture','wps021-grant-0001') is not null, 'a campaign author is granted');
select ok(public.staff_grant_role('a2100000-0000-4000-8000-000000000007','operations_manager',
  'WPS-021 fixture','wps021-grant-0002') is not null, 'a campaign activator is granted');
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
select throws_ok($$select public.get_my_eligible_promotion(
  'd2100000-0000-4000-8000-000000000001')$$,'42501',null,
  'an anonymous caller cannot ask for a promotion');
select throws_ok($$select public.redeem_promotion(
  'd2100000-0000-4000-8000-000000000001','anything')$$,'42501',null,
  'an anonymous caller cannot redeem');
reset role;

-- ---------------------------------------------------------------------------
-- Fail closed: everything is off until deliberately enabled
-- ---------------------------------------------------------------------------
select ok(not private.growth_feature_enabled('growth_referrals','customer'),
  'referrals ship disabled');
select ok(not private.growth_feature_enabled('growth_promotions','customer'),
  'promotions ship disabled');
select ok(not private.growth_promotions_open('customer'),
  'the promotion gate is closed by default');
select ok(not private.growth_feature_enabled('growth_nonexistent_flag','customer'),
  'an ABSENT flag is off, so a missing seed row cannot enable a growth feature');

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.get_my_referral_code()->>'available','false',
  'no referral code is issued while the flag is off');
select is((select count(*)::integer from public.referral_codes),0,
  'nothing was written while the feature was off');
reset role;

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
select is(public.get_my_referral_code()->>'code',
  (select code from public.referral_codes where owner_user_id='a2100000-0000-4000-8000-000000000001'),
  'a second call returns the same code rather than issuing another');
select is((select count(*)::integer from public.referral_codes
  where owner_user_id='a2100000-0000-4000-8000-000000000001'),1,
  'an account holds exactly one code for its lifetime');

-- The code must not encode anything about its owner.
select ok(public.get_my_referral_code()->>'code' not like '%A2100000%',
  'the code contains no fragment of the account identifier');
reset role;

-- The referrer's code is captured here, as a DBA. Reading it from inside the
-- referred account's session returns NULL, because the owner policy hides it —
-- which is the correct behaviour and would otherwise silently break the test.
select set_config('warsha.test_referral_code',
  (select code from public.referral_codes
   where owner_user_id='a2100000-0000-4000-8000-000000000001'), true);

select throws_ok($$update public.referral_codes set code='ZZZZZZZZZZ'$$,'55000',null,
  'the code text is immutable even for a superuser');
select throws_ok($$delete from public.referral_codes$$,'55000',null,
  'referral codes cannot be deleted');

-- ---------------------------------------------------------------------------
-- Owner isolation
-- ---------------------------------------------------------------------------
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
  'an account cannot claim its own code');
reset role;

-- WPS-016 owns the signal vocabulary. Growth abuse is MAPPED onto it rather
-- than widening its constraint, so these land in the queue staff already triage.
select is((select count(*)::integer from private.trust_fraud_signals
  where signal_key='duplicate_identity'
    and safe_detail->>'growthSignal'='self_referral_attempt'),1,
  'a self-referral attempt is RECORDED as an advisory signal');
select is((select count(*)::integer from pg_constraint
  where conname='trust_fraud_signals_key_check'
    and pg_get_constraintdef(oid) ~ 'growth'),0,
  'WPS-021 did not widen the WPS-016 signal vocabulary to fit itself');
select is((select count(*)::integer from public.trust_enforcement_actions),0,
  'and nothing was enforced: WPS-016 decides, WPS-021 only observes');

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

select is((select count(*)::integer from public.referral_attributions),1,
  'exactly one attribution exists');
select is((select status from public.referral_attributions),'pending',
  'attribution starts pending: signing up earns nothing');
select is((select count(*)::integer from public.referral_reward_entitlements),0,
  'NO REWARD EXISTS FOR A SIGNUP');

select throws_ok($$update public.referral_attributions
  set referred_user_id='a2100000-0000-4000-8000-000000000003'$$,'55000',null,
  'attribution is immutable');
select throws_ok($$delete from public.referral_attributions$$,'55000',null,
  'attribution cannot be deleted');
select throws_ok($$insert into public.referral_attributions(
    referral_code_id, referrer_user_id, referred_user_id, referred_role, expires_at)
  select id,'a2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001',
    'customer', now() + interval '90 days' from public.referral_codes limit 1$$,
  '23514',null,'a self-referral cannot be written even directly');

-- ---------------------------------------------------------------------------
-- Qualification
-- ---------------------------------------------------------------------------
insert into public.growth_reward_rules(rule_key,version,display_name,beneficiary,
  referrer_campaign_key,monthly_entitlement_limit,lifetime_entitlement_limit,active,environment)
values ('first_job_reward',1,'First job reward','referrer','referral_thanks',10,50,true,'local');

-- A booking that is not complete qualifies nothing.
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000001');
select is((select status from public.referral_attributions),'pending',
  'an incomplete booking does not qualify a referral');

-- Completion without a price snapshot still qualifies nothing.
select pg_temp.act_as('a2100000-0000-4000-8000-000000000002');
update public.bookings set status='completed' where id='d2100000-0000-4000-8000-000000000001';
select pg_temp.act_as_nobody();
select is((select status from public.referral_attributions),'pending',
  'completion without a WPS-007 price snapshot does not qualify');

select ok(private.create_booking_price_snapshot('d2100000-0000-4000-8000-000000000001') is not null,
  'a WPS-007 snapshot is created by the existing authority');
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000001');
select is((select status from public.referral_attributions),'qualified',
  'a completed booking with a snapshot qualifies the referral');
select is((select count(*)::integer from public.referral_reward_entitlements),1,
  'one entitlement is recorded for the referrer');
select is((select status from public.referral_reward_entitlements),'recorded',
  'the entitlement is RECORDED, not paid: it is not money');

-- Idempotency: the trigger may fire again on a re-asserted terminal state.
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000001');
select private.qualify_referral_for_booking('d2100000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.referral_reward_entitlements),1,
  'qualification is idempotent: no duplicate reward');

-- The entitlement exists and nothing was posted. This is the whole claim that
-- WPS-021 creates no second financial system, stated as an assertion.
select is((select count(*)::integer from private.financial_ledger_transactions),0,
  'A REFERRAL ENTITLEMENT POSTS NO LEDGER TRANSACTION');
select is((select count(*)::integer from private.financial_ledger_entries),0,
  'and no ledger entry either');
select is((select count(*)::integer from public.provider_earnings_ledger),0,
  'and nothing reached the worker earnings ledger');

select throws_ok($$update public.referral_reward_entitlements set rule_key='other'$$,'55000',null,
  'reward history is immutable');

-- ---------------------------------------------------------------------------
-- Campaigns: authoring, approval, immutability
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select ok(public.staff_create_campaign_draft(jsonb_build_object(
  'campaignKey','referral_thanks',
  'displayNameEn','Thank you','displayNameAr','شكرا لك',
  'descriptionEn','A thank-you offer.','descriptionAr','عرض شكر.',
  'audience','customer','discountType','percentage','discountValue',10,
  'maxDiscountMinor',5000,
  'startsAt',(now() - interval '1 hour')::text,'endsAt',(now() + interval '30 days')::text,
  'budgetMinor',1000000,'globalRedemptionLimit',100,'perAccountLimit',1,
  'requiresGrant',true))->>'id' is not null, 'staff can draft a campaign');
reset role;

select is((select status from public.growth_campaigns where campaign_key='referral_thanks'),
  'draft','a new campaign starts as a draft');

-- Captured as a DBA. Even a staff member holds no grant on growth_campaigns:
-- staff read campaigns through get_staff_campaigns, never by selecting the
-- table. A subquery here would fail with permission denied, which is correct.
select set_config('warsha.test_campaign_id',
  (select id::text from public.growth_campaigns where campaign_key='referral_thanks'), true);

-- The author cannot activate their own campaign.
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000006');
select throws_ok(format($$select public.staff_activate_campaign(%L,'self approval')$$,
  current_setting('warsha.test_campaign_id')),
  '42501',null,'THE CREATOR CANNOT ACTIVATE THEIR OWN CAMPAIGN');
reset role;

-- Dual control: the activator requests, a different approver approves.
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select throws_ok(format($$select public.staff_activate_campaign(%L,'no approval yet')$$,
  current_setting('warsha.test_campaign_id')),
  '42501',null,'activation without a second approver is refused');
select ok(public.staff_request_dual_control('approve_growth_campaign','activate_campaign',
  current_setting('warsha.test_campaign_id'),
  'WPS-021 fixture activation request') is not null, 'the activator opens an approval request');
reset role;

select set_config('warsha.test_dual_id',
  (select id::text from private.staff_dual_control_requests
   where action_key='activate_campaign' order by created_at desc limit 1), true);

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000008');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.test_dual_id')::uuid,
  'Approved for WPS-021 fixture') is not null, 'a different staff member approves');
reset role;

set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000007');
select ok(public.staff_activate_campaign(
  current_setting('warsha.test_campaign_id')::uuid,
  'Activating for WPS-021 fixture') is not null, 'activation succeeds with dual control satisfied');
select ok(public.get_staff_campaigns(50) is not null,
  'staff read campaigns through the RPC, which is the only path that exists');
reset role;

select is((select status from public.growth_campaigns where campaign_key='referral_thanks'),
  'active','the campaign is active');
select isnt((select approved_by from public.growth_campaigns where campaign_key='referral_thanks'),
  (select created_by from public.growth_campaigns where campaign_key='referral_thanks'),
  'the approver and the creator are different people');

select throws_ok($$update public.growth_campaigns set discount_value=90
  where campaign_key='referral_thanks'$$,'55000',null,
  'AN ACTIVATED CAMPAIGN IS IMMUTABLE');
select throws_ok($$update public.growth_campaigns set budget_minor=999999999
  where campaign_key='referral_thanks'$$,'55000',null,
  'the budget of an activated campaign cannot be raised in place');
select throws_ok($$delete from public.growth_campaigns$$,'55000',null,
  'campaign history cannot be deleted');

-- A percentage campaign without a ceiling cannot exist.
select throws_ok($$insert into public.growth_campaigns(
  campaign_key,display_name_en,display_name_ar,description_en,description_ar,
  environment,audience,discount_type,discount_value,starts_at,ends_at,
  budget_minor,global_redemption_limit)
  values('uncapped','x','x','x','x','local','customer','percentage',20,
    now(),now()+interval '1 day',100000,10)$$,'23514',null,
  'an uncapped percentage campaign is rejected: it would be an unbounded expense');

-- ---------------------------------------------------------------------------
-- Eligibility is a result, never a row
-- ---------------------------------------------------------------------------
-- The reward rule names the REFERRER as beneficiary, so user 001 holds the
-- entitlement and the grant. The booking that carries the promotion is
-- therefore the referrer's own next booking, which is the real product flow.
insert into public.addresses(id,customer_id,label,address_line,governorate)
values ('c2100000-0000-4000-8000-000000000003','a2100000-0000-4000-8000-000000000001',
  'Home','3 Test Street','Cairo');

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

select is((select count(*)::integer from public.campaign_eligibility_grants
  where user_id='a2100000-0000-4000-8000-000000000001' and campaign_key='referral_thanks'),1,
  'qualifying the referral granted the REFERRER eligibility for the linked campaign');

-- The promotion flag is still off, so an active campaign is still invisible.
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'false','AN ACTIVE CAMPAIGN IS INVISIBLE WHILE THE FLAG IS OFF');

update private.staff_feature_flags set enabled=true, audience='all'
  where flag_key='growth_promotions' and environment='local';

select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'true','with the flag on, the granted customer is eligible');

-- The kill switch restricts without touching the campaign.
update private.staff_kill_switches set active=true, reason='WPS-021 fixture kill switch test'
  where switch_key='growth_promotions';
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'false','the kill switch closes promotions immediately');
update private.staff_kill_switches set active=false, reason=null
  where switch_key='growth_promotions';

-- The REFERRED account earned nothing under a referrer-only rule.
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000001')->>'eligible',
  'false','a referrer-only rule grants the referred account nothing');

-- An account with no grant sees nothing from a grant-gated campaign.
insert into public.addresses(id,customer_id,label,address_line,governorate)
values ('c2100000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000003',
  'Home','2 Test Street','Cairo');
select pg_temp.act_as('a2100000-0000-4000-8000-000000000003');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2100000-0000-4000-8000-000000000003','a2100000-0000-4000-8000-000000000003',
  'b2100000-0000-4000-8000-000000000001',s.id,'confirmed','WPS021 fixture 3','fixed',1000,
  'Growth fixture booking three',current_date,'16:00',
  'c2100000-0000-4000-8000-000000000002','Private fixture address','wps021-booking-3'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000003')->>'eligible',
  'false','an ungranted account is not eligible for a grant-gated campaign');

-- A customer cannot ask about somebody else's booking.
select is(private.evaluate_promotion_eligibility(
  'a2100000-0000-4000-8000-000000000003','d2100000-0000-4000-8000-000000000002')->>'eligible',
  'false','eligibility cannot be probed against another account''s booking');

-- ---------------------------------------------------------------------------
-- A referral code is not a promo code
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.growth_campaigns c
  where c.campaign_key in (select code from public.referral_codes)),0,
  'no referral code is also a campaign key');
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select throws_ok(format($$select public.redeem_promotion(
  'd2100000-0000-4000-8000-000000000002', %L)$$,
  current_setting('warsha.test_referral_code')),'42501',null,
  'A REFERRAL CODE PRESENTED AS A PROMOTION REDEEMS NOTHING');
reset role;

-- ---------------------------------------------------------------------------
-- Redemption, and the worker's money
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select is(public.redeem_promotion('d2100000-0000-4000-8000-000000000002','referral_thanks')
  ->>'redeemed','true','the eligible customer redeems the promotion');
select throws_ok($$select public.redeem_promotion(
  'd2100000-0000-4000-8000-000000000002','referral_thanks')$$,null,null,
  'ONE PROMOTION PER BOOKING: a second redemption is impossible');
reset role;

select is((select count(*)::integer from public.campaign_redemptions
  where booking_id='d2100000-0000-4000-8000-000000000002'),1,
  'exactly one redemption exists for the booking');
select is((select status from public.referral_reward_entitlements),'fulfilled',
  'the entitlement is fulfilled through the campaign, not paid directly');

-- The whole point. WPS-007 adds the promotion back to provider gross.
select is(
  (select s.provider_gross_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  100000::bigint,
  'THE WORKER GROSS IS THE FULL BOOKING VALUE, UNREDUCED BY THE PROMOTION');
select ok(
  (select s.customer_total_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current) < 100000,
  'the customer pays less');
select is(
  (select s.customer_total_minor + s.promotion_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  (select s.provider_gross_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  'the difference is exactly the Warsha-funded promotion');
select is(
  (select s.pricing_version from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  'warsha-funded-promotion-v1',
  'the existing WPS-007 Warsha-funded pricing version is used, not a new one');
select is(
  (select s.commission_minor from public.booking_price_snapshots s
   where s.booking_id='d2100000-0000-4000-8000-000000000002' and s.is_current),
  10000::bigint,
  'the commission basis is the unreduced worker gross');

-- Budget and counters moved exactly once.
select is((select redemption_count from public.growth_campaigns where campaign_key='referral_thanks'),
  1,'the redemption counter advanced by one');
select is((select budget_consumed_minor from public.growth_campaigns where campaign_key='referral_thanks'),
  (select discount_minor from public.campaign_redemptions
   where booking_id='d2100000-0000-4000-8000-000000000002'),
  'consumed budget equals the discount granted');

-- Cancellation releases the budget.
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
update public.bookings set status='cancelled' where id='d2100000-0000-4000-8000-000000000002';
select pg_temp.act_as_nobody();
select is((select status from public.campaign_redemptions
  where booking_id='d2100000-0000-4000-8000-000000000002'),'reversed',
  'cancelling the booking reverses the redemption');
select is((select budget_consumed_minor from public.growth_campaigns
  where campaign_key='referral_thanks'),0::bigint,
  'the campaign budget is released so it cannot drift from the ledger');

-- ---------------------------------------------------------------------------
-- Ranking is untouched
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.marketplace_candidate_scores),0,
  'no growth activity wrote a marketplace ranking score');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and p.proname ~ '(rank|score|match)'
    and pg_get_functiondef(p.oid) ~ '(growth_campaigns|referral_codes|campaign_redemptions)'),
  0,'no ranking or matching function reads any growth table');

-- ---------------------------------------------------------------------------
-- Privacy
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2100000-0000-4000-8000-000000000001');
select ok(public.get_my_referral_summary(20)::text not ilike '%test.local%',
  'the referral summary discloses no referred account''s email');
select ok(public.get_my_referral_summary(20) ? 'pending',
  'referred accounts are COUNTED, never named');
select ok(not (public.get_my_referral_summary(20) ? 'referredUsers'),
  'no list of referred accounts is returned');
reset role;

select is((select count(*)::integer from private.operational_log_events
  where event_key like 'growth.%'
    and (safe_detail::text ~* '(@|a2100000|referral_code|code)')),
  0,'no growth analytics event carries an identifier, an email, or a code');
select ok((select count(*) from private.operational_log_events
  where event_key like 'growth.%') > 0,
  'growth analytics events were nevertheless recorded');
select is((select count(*)::integer from private.operational_log_events
  where event_key like 'growth.%' and category <> 'marketplace'),
  0,'growth events use the existing marketplace category, adding no new one');

-- ---------------------------------------------------------------------------
-- Rate limiting and notifications are the existing authorities
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

-- ---------------------------------------------------------------------------
-- Nothing was enabled by shipping this
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.staff_feature_flags
  where flag_key in ('online_payments','payouts','push_notifications')
    and enabled),0,'WPS-021 enabled no payment, payout, or push flag');
select is((select count(*)::integer from private.staff_kill_switches
  where switch_key='growth_promotions' and active),0,
  'the growth kill switch is left inactive');

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER hygiene
-- ---------------------------------------------------------------------------
-- Postgres stores `set search_path=''` as the literal `search_path=""`, so the
-- matcher accepts both spellings rather than the one an author would guess.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and (p.proname like 'growth%' or p.proname like '%referral%'
         or p.proname like '%campaign%' or p.proname like '%promotion%')
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                    where c ~ '^search_path=("")?$')),
  0,'every WPS-021 SECURITY DEFINER function pins an empty search_path');
-- Guard against the assertion above silently matching nothing.
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and (p.proname like 'growth%' or p.proname like '%referral%'
         or p.proname like '%campaign%' or p.proname like '%promotion%')) >= 15,
  'and that check actually covered the WPS-021 function surface');

select * from finish();
rollback;
