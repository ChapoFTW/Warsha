begin;
select no_plan();

create function pg_temp.act_as(p_uid uuid, p_age_seconds integer default 0)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'aal', 'aal1',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint - p_age_seconds))
  )::text, true);
end $fn$;

create temporary table reporting_export_fixture(id uuid not null);
grant select, insert on table reporting_export_fixture to authenticated;

select has_function('public','get_staff_business_report',array['text','date','date','text','text','text','text'],
  'the bounded business report RPC exists');
select has_function('public','staff_request_business_export',array['date','date','text','text','text','text'],
  'the governed business export request RPC exists');
select has_function('public','staff_business_export_preview',array['uuid'],
  'the governed CSV-ready preview RPC exists');
select is(has_function_privilege('anon','public.get_staff_business_report(text,date,date,text,text,text,text)','EXECUTE'),false,
  'anonymous callers cannot read business analytics');
select is(has_function_privilege('anon','public.staff_request_business_export(date,date,text,text,text,text)','EXECUTE'),false,
  'anonymous callers cannot request exports');
select is((select sensitive from private.staff_export_catalog where report_key='business_daily'),false,
  'the aggregate daily export is catalogued as non-PII');
select is((select column_allowlist from private.staff_export_catalog where report_key='business_daily'),
  array['date','accounts_created','customers_registered','workers_registered','requests_created',
    'quotes_submitted','jobs_created','jobs_completed','support_cases_opened']::text[],
  'the business export has a stable aggregate-only allowlist');

-- Cairo business dates use half-open UTC boundaries. During Egyptian daylight
-- time, 2026-08-21 begins at 21:00 UTC on the previous calendar date.
select is((private.business_reporting_period('custom','2026-08-21','2026-08-21','none')->>'startUtc')::timestamptz,
  '2026-08-20 21:00:00+00'::timestamptz,'the exact Cairo start boundary is server-owned');
select is((private.business_reporting_period('custom','2026-08-21','2026-08-21','none')->>'endUtc')::timestamptz,
  '2026-08-21 21:00:00+00'::timestamptz,'the exact Cairo end boundary is exclusive');
select is(private.business_reporting_period('last_7_days',null,null,'previous_period')->>'timezone','Africa/Cairo',
  'reports declare their canonical timezone');
select throws_ok($$select private.business_reporting_period('custom','2025-01-01','2026-08-21','none')$$,
  '22023','Reporting period is too wide','arbitrary oversized reporting ranges fail closed');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000001','authenticated','authenticated','report-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000002','authenticated','authenticated','report-manager@test.local','',now(),'{}','{"display_name":"Operations Manager"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000003','authenticated','authenticated','report-customer@test.local','',now(),'{}','{"display_name":"Customer"}',now(),now());

select ok(private.bootstrap_staff_role('a2200000-0000-4000-8000-000000000001','security_administrator',
  'First administrator for reporting regression') is not null,'the normal first-administrator authority seeds the fixture');

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000003');
select throws_ok($$select public.get_staff_business_report()$$,'42501','Staff capability required',
  'an ordinary customer cannot read aggregate business reporting');
select throws_ok($$select public.staff_request_business_export(current_date-1,current_date,
  'Attempted unauthorized export','report-denied-01')$$,'42501','Staff capability required',
  'an ordinary customer cannot request a report export');
reset role;

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','the staff grant uses a fresh normal session');
select ok((public.staff_grant_role('a2200000-0000-4000-8000-000000000002','operations_manager',
  'Reporting regression operator','report-grant-01'))->>'id' is not null,
  'the governed role authority grants the reporting fixture capabilities');
reset role;

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000002');
select is((public.get_staff_business_report('today')->'period'->>'timezone'),'Africa/Cairo',
  'an authorized operator receives a Cairo-aware report');
select is((public.get_staff_business_report('today')->'privacy'->>'containsPii'),'false',
  'the report contract explicitly contains no PII');
select is((public.get_staff_business_report('today')->>'financialVisible'),'false',
  'analytics authority alone does not reveal financial metrics');
select is((public.get_staff_business_report('today')->'metrics') ? 'grossJobValueMinor',false,
  'financial metrics are omitted without ledger authority');
select throws_ok($$select public.get_staff_business_report('not_a_period')$$,
  '22023','Unknown reporting preset','unknown presets are rejected');
select throws_ok($$select public.get_staff_business_report('today',null,null,'none',null,
  repeat('x',101),null)$$,'22023','Invalid governorate filter','unbounded filters are rejected');

select is((public.staff_reauthenticate())->>'reauthValid','true','exports require a freshly authenticated staff session');
insert into reporting_export_fixture(id)
select ((public.staff_request_business_export(current_date-2,current_date,
  'Weekly aggregate business review','report-export-01'))->>'exportId')::uuid;
select ok((select id from reporting_export_fixture) is not null,
  'an authorized fresh session requests an aggregate export');
select is((public.staff_request_business_export(current_date-2,current_date,
  'Weekly aggregate business review','report-export-01'))->>'duplicate','true',
  'export retries are idempotent');
select ok((public.staff_business_export_preview((select id from reporting_export_fixture))->'rows') is not null,
  'the owner can retrieve the bounded CSV-ready rows');
reset role;

select ok((select count(*) from private.staff_access_log where surface='analytics') >= 1,
  'report access is recorded');
select ok((select count(*) from private.staff_audit_events
  where action in ('export_requested','export_downloaded') and actor_id='a2200000-0000-4000-8000-000000000002') >= 2,
  'export request and retrieval create immutable staff audit evidence');
select is((select count(*)::integer from private.staff_export_requests
  where idempotency_key='report-export-01'),1,'an export retry creates exactly one authorization row');

select is((select count(*)::integer from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname in ('public','private')
    and p.proname in ('get_staff_business_report','staff_request_business_export',
      'staff_business_export_preview','business_reporting_period','business_report_metrics')
    and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%')),
  0,'every reporting security definer pins an empty search path');

select * from finish();
rollback;
