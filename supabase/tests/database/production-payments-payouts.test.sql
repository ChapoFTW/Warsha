begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Structure: WPS-015 extends WPS-007 and creates no second ledger
-- ---------------------------------------------------------------------------
select has_table('private','payment_provider_registry','provider registry exists');
select has_table('private','payment_provider_accounts','provider account bindings exist');
select has_table('private','payment_method_availability','server-authoritative method availability exists');
select has_table('private','payment_secret_metadata','secret metadata exists without secret values');
select has_table('private','payment_webhook_quarantine','webhook quarantine exists');
select has_table('private','payment_settlements','settlement records exist');
select has_table('private','payment_settlement_lines','settlement lines exist');
select has_table('private','reconciliation_runs','reconciliation runs exist');
select has_table('private','reconciliation_exceptions','reconciliation exceptions exist');
select has_table('private','payment_chargebacks','chargeback records exist');
select has_table('private','payout_provider_references','payout tokenization references exist');
select has_table('private','payout_provider_events','payout provider events exist');
select has_table('private','earning_release_scheduler_runs','scheduler runs exist');

-- The single authoritative ledger is unchanged: no second ledger table, and no
-- new transaction type was introduced by WPS-015.
select is(
  (select string_agg(table_schema||'.'||table_name, ',' order by table_schema, table_name)
   from information_schema.tables
   where table_schema in ('public','private') and table_name like '%ledger%'),
  'private.financial_ledger_accounts,private.financial_ledger_entries,'
  ||'private.financial_ledger_transactions,public.provider_earnings_ledger',
  'ledger tables remain exactly the WPS-007 set; WPS-015 added none');
select is(
  (select count(*)::integer from pg_catalog.pg_constraint ct
   join pg_catalog.pg_class c on c.oid=ct.conrelid
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='private' and c.relname='financial_ledger_transactions'
     and ct.contype='c' and pg_get_constraintdef(ct.oid) like '%transaction_type%'),
  1,
  'ledger transaction type authority remains single-sourced');

-- Locked WPS-007 financial rules are untouched.
select is((select currency from private.payment_configuration where id),'EGP','currency stays EGP');
select is((select commission_bps from private.payment_configuration where id),1000,'commission stays 10%');
select is((select minimum_withdrawal_minor from private.payment_configuration where id)::text,'20000','minimum withdrawal stays EGP 200');
select is((select withdrawal_fee_minor from private.payment_configuration where id)::text,'0','withdrawal fee stays zero');
select is((select rolling_reserve_bps from private.payment_configuration where id),0,'rolling reserve stays none');
select is((select earnings_release_delay_seconds from private.payment_configuration where id)::text,'21600','six-hour release stays locked');
select is((select cash_debt_restriction_threshold_minor from private.payment_configuration where id)::text,'50000','cash debt threshold stays EGP 500');

-- ---------------------------------------------------------------------------
-- Fail-closed defaults: nothing is live, nothing is enabled
-- ---------------------------------------------------------------------------
select is((select gateway_mode from private.payment_configuration where id),'disabled','gateway starts disabled');
select is((select payout_mode from private.payment_configuration where id),'disabled','payout starts disabled');
select is((select active_payment_provider from private.payment_configuration where id),null,'no payment provider is selected');
select is((select active_payout_provider from private.payment_configuration where id),null,'no payout provider is selected');
select is((select reconciliation_enabled from private.payment_configuration where id),false,'reconciliation starts disabled');
select is((select chargeback_handling_enabled from private.payment_configuration where id),false,'chargeback handling starts disabled');
select is((select maintenance_mode from private.payment_configuration where id),false,'maintenance mode starts off');
select is((select automatic_release_scheduler_enabled from private.payment_configuration where id),false,'release scheduler stays disabled');
select is((select count(*)::integer from private.payment_provider_accounts),0,'no provider account is configured');
select is((select count(*)::integer from private.payment_secret_metadata),0,'no secret metadata is registered');
select is(private.payment_surface_environment('gateway'),'disabled','gateway surface resolves disabled');
select is(private.payment_surface_environment('payout'),'disabled','payout surface resolves disabled');
select throws_ok($$select private.payment_surface_environment('unknown')$$,'22023','Unknown payment surface','unknown surface is rejected');

-- Only cash is authoritative today; every online method fails closed.
select is(private.payment_method_enabled('cash'),true,'cash remains available');
select is(private.payment_method_enabled('card'),false,'card fails closed');
select is(private.payment_method_enabled('meeza_card'),false,'meeza fails closed');
select is(private.payment_method_enabled('mobile_wallet'),false,'mobile wallet fails closed');
select is(private.payment_method_enabled('hosted_checkout'),false,'hosted checkout fails closed');

-- ---------------------------------------------------------------------------
-- Live configuration cannot be reached without complete configuration
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update private.payment_configuration set gateway_mode='live' where id$$,
  '23514',
  null,
  'live gateway without a named provider is rejected by constraint');
select throws_ok(
  $$update private.payment_configuration set payout_mode='live' where id$$,
  '23514',
  null,
  'live payout without a named provider is rejected by constraint');

insert into private.payment_provider_registry(provider_key, display_name, supports_cards, supports_webhook_signing, selection_status)
values ('fixture_provider','Fixture Provider',true,true,'candidate');

-- Naming a provider is still not enough: with no activated account the surface
-- degrades to disabled rather than becoming live.
update private.payment_configuration set active_payment_provider='fixture_provider', gateway_mode='live' where id;
select is(private.payment_surface_environment('gateway'),'disabled','live without an account stays disabled');

insert into private.payment_provider_accounts(provider_key, environment, account_label, api_credentials_registered, webhook_secret_registered, activated_at)
values ('fixture_provider','live','Fixture live',true,true,now());
select is(private.payment_surface_environment('gateway'),'disabled','live without registered webhook signing secret stays disabled');

insert into private.payment_secret_metadata(provider_key, environment, secret_role, registered)
values ('fixture_provider','live','webhook_signing',true);
select is(private.payment_surface_environment('gateway'),'live','live is reached only when every requirement is met');

-- Sandbox and live credentials cannot be mixed: the account row is unique per
-- environment and a sandbox account never satisfies live.
select throws_ok(
  $$insert into private.payment_provider_accounts(provider_key, environment, account_label) values ('fixture_provider','live','Duplicate live')$$,
  '23505',
  null,
  'a provider cannot hold two accounts in the same environment');
select is((select count(*)::integer from private.payment_provider_accounts where provider_key='fixture_provider' and environment='sandbox'),0,'no sandbox account leaks into live');

-- Maintenance mode instantly fails the surface closed.
update private.payment_configuration set maintenance_mode=true, maintenance_reason='Scheduled maintenance window' where id;
select is(private.payment_surface_environment('gateway'),'disabled','maintenance mode disables the gateway surface');
update private.payment_configuration set maintenance_mode=false, maintenance_reason=null where id;
select is(private.payment_surface_environment('gateway'),'live','surface recovers after maintenance');

-- ---------------------------------------------------------------------------
-- Webhook security
-- ---------------------------------------------------------------------------
select is(
  (private.process_verified_payment_webhook('fixture_provider','live','evt-unsigned','payment_succeeded',
    false,repeat('a',64),now(),'ref-1',1000,'EGP'))->>'reason',
  'signature_invalid',
  'unsigned provider event is quarantined');

select is(
  (private.process_verified_payment_webhook('fixture_provider','sandbox','evt-envmix','payment_succeeded',
    true,repeat('b',64),now(),'ref-1',1000,'EGP'))->>'reason',
  'environment_mismatch',
  'sandbox event is refused while live is configured');

select is(
  (private.process_verified_payment_webhook('fixture_provider','live','evt-replay','payment_succeeded',
    true,repeat('c',64),now() - interval '2 hours','ref-1',1000,'EGP'))->>'reason',
  'replay_window_exceeded',
  'stale event outside the replay window is rejected');

select is(
  (private.process_verified_payment_webhook('fixture_provider','live','evt-unknown','account_updated',
    true,repeat('d',64),now(),'ref-1',1000,'EGP'))->>'reason',
  'unknown_event_type',
  'event outside the allowlist is quarantined');

select is(
  (private.process_verified_payment_webhook('fixture_provider','live','evt-currency','payment_succeeded',
    true,repeat('e',64),now(),'ref-1',1000,'USD'))->>'reason',
  'currency_mismatch',
  'non-EGP event is rejected');

select is(
  (private.process_verified_payment_webhook('fixture_provider','live','evt-orphan','payment_succeeded',
    true,repeat('f',64),now(),'no-such-reference',1000,'EGP'))->>'reason',
  'unknown_attempt',
  'event for an unknown attempt is quarantined');

select is((select count(*)::integer from private.payment_webhook_quarantine),6,'every rejected event is recorded for review');
select is((select count(*)::integer from private.payment_gateway_events),0,'no rejected event was ever processed');

-- Quarantine never stores a provider payload, only a safe fingerprint.
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='private' and table_name='payment_webhook_quarantine'
     and column_name in ('raw_body','payload','body')),
  0,
  'quarantine stores no raw provider payload');

-- ---------------------------------------------------------------------------
-- Reconciliation detects differences instead of concealing them
-- ---------------------------------------------------------------------------
select is(
  (private.run_payment_reconciliation(current_date,'daily','recon-disabled-1'))->>'status',
  'disabled',
  'reconciliation stays disabled until explicitly enabled');
select is((select count(*)::integer from private.reconciliation_runs),0,'no reconciliation run is fabricated while disabled');

update private.payment_configuration set reconciliation_enabled=true where id;
select is(
  (private.run_payment_reconciliation(current_date,'daily','recon-1'))->>'status',
  'completed',
  'enabled reconciliation completes');
select is(
  (private.run_payment_reconciliation(current_date,'daily','recon-1'))->>'status',
  'duplicate',
  'reconciliation is idempotent by key');
select is(
  (select ledger_balanced from private.reconciliation_runs where idempotency_key='recon-1'),
  true,
  'explicit ledger balancing check runs');

-- An orphan provider event surfaces as an exception rather than disappearing.
select ok(
  (select exception_count from private.reconciliation_runs where idempotency_key='recon-1') > 0,
  'quarantined provider events are reported as reconciliation exceptions');

-- ---------------------------------------------------------------------------
-- Release scheduler
-- ---------------------------------------------------------------------------
select is(
  (private.run_earning_release_batch(10,'scheduled','release-disabled-1'))->>'status',
  'disabled',
  'release scheduler stays disabled by default');
select is(
  (private.run_earning_release_batch(10,'scheduled','release-disabled-1'))->>'released',
  '0',
  'disabled scheduler releases nothing');
select throws_ok(
  $$select private.run_earning_release_batch(0,'scheduled','release-bad')$$,
  '22023',
  'Invalid release batch limit',
  'scheduler rejects an invalid batch limit');

-- ---------------------------------------------------------------------------
-- Payout tokenization fails closed
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='private' and table_name='payout_provider_references'
     and column_name in ('iban','account_number','wallet_pin','bank_credentials')),
  0,
  'payout references store no raw destination credentials');

-- ---------------------------------------------------------------------------
-- Chargebacks never auto-blame the worker
-- ---------------------------------------------------------------------------
select is(
  (private.record_payment_chargeback('fixture_provider','live','cb-1',null,5000,'opened'))->>'status',
  'disabled',
  'chargeback intake stays disabled until enabled');

-- ---------------------------------------------------------------------------
-- Privacy and access control
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema='private'
     and grantee in ('anon','authenticated','PUBLIC')
     and table_name in ('payment_provider_registry','payment_provider_accounts','payment_method_availability',
                        'payment_secret_metadata','payment_webhook_quarantine','payment_settlements',
                        'payment_settlement_lines','reconciliation_runs','reconciliation_exceptions',
                        'payment_chargebacks','payout_provider_references','payout_provider_events',
                        'earning_release_scheduler_runs')),
  0,
  'no WPS-015 private table is exposed to any client role');

select is(has_function_privilege('anon','public.get_production_payment_capabilities()','EXECUTE'),false,'anon cannot read payment capabilities');
select is(has_function_privilege('authenticated','public.get_production_payment_capabilities()','EXECUTE'),true,'authenticated can read safe capabilities');
select is(has_function_privilege('anon','public.get_payment_method_availability()','EXECUTE'),false,'anon cannot read method availability');
select is(has_function_privilege('anon','public.resolve_payment_checkout_return(uuid)','EXECUTE'),false,'anon cannot resolve checkout returns');
select is(has_function_privilege('authenticated','private.process_verified_payment_webhook(text,text,text,text,boolean,text,timestamp with time zone,text,bigint,text,jsonb)','EXECUTE'),false,'clients cannot invoke webhook processing');
select is(has_function_privilege('authenticated','private.run_payment_reconciliation(date,text,text)','EXECUTE'),false,'clients cannot run reconciliation');
select is(has_function_privilege('authenticated','private.run_earning_release_batch(integer,text,text)','EXECUTE'),false,'clients cannot run the release scheduler');
select is(has_function_privilege('authenticated','private.record_payment_chargeback(text,text,text,uuid,bigint,text,text,timestamp with time zone,bigint)','EXECUTE'),false,'clients cannot record chargebacks');
select is(has_function_privilege('authenticated','private.payment_surface_environment(text)','EXECUTE'),false,'clients cannot query raw surface configuration');

-- Every WPS-015 SECURITY DEFINER function pins an empty search_path.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where p.prosecdef and n.nspname in ('public','private')
     and p.proname in ('payment_surface_environment','payment_method_enabled',
                       'get_production_payment_capabilities','get_payment_method_availability',
                       'resolve_payment_checkout_return','process_verified_payment_webhook',
                       'run_payment_reconciliation','run_earning_release_batch',
                       'process_verified_payout_event','record_payment_chargeback',
                       'review_reconciliation_exception','get_staff_payment_operations_summary')
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%')),
  0,
  'every WPS-015 security definer function pins an empty search path');

-- No WPS-015 private table is published to Realtime.
select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime' and schemaname='private'),
  0,
  'no private payment table is published to Realtime');

-- ---------------------------------------------------------------------------
-- Staff authority
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','f1500000-0000-4000-8000-000000000001','authenticated','authenticated','wps015-customer@test.local','',now(),'{}','{"display_name":"Payments Customer"}',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','f1500000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.get_staff_payment_operations_summary()$$,
  '42501',
  'Staff access required',
  'a non-staff account cannot read staff payment operations');
select throws_ok(
  $$select public.review_reconciliation_exception('00000000-0000-0000-0000-000000000001','resolved','Checked')$$,
  '42501',
  'Staff access required',
  'a non-staff account cannot resolve reconciliation exceptions');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.get_production_payment_capabilities()$$,
  '42501',
  'permission denied for function get_production_payment_capabilities',
  'anonymous access to payment capabilities is denied at the privilege layer');
reset role;

select * from finish();
rollback;
