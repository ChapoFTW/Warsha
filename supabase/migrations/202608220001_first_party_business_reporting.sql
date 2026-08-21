-- WARSHA FIRST-PARTY BUSINESS REPORTING
--
-- This is a forward-only extension of WPS-017. It deliberately derives every
-- fact from an existing transactional/history authority. There is no client
-- telemetry table and no third-party analytics processor.

alter table private.staff_export_requests
  add column if not exists filters jsonb not null default '{}'::jsonb,
  add column if not exists grouping text not null default 'day';

alter table private.staff_export_requests
  drop constraint if exists staff_export_requests_grouping_check,
  add constraint staff_export_requests_grouping_check
    check (grouping in ('day'));

insert into private.staff_export_catalog(
  report_key, display_name, capability_key, sensitive, column_allowlist
) values (
  'business_daily',
  'Business daily summary',
  'export_operational_report',
  false,
  array[
    'date','accounts_created','customers_registered','workers_registered',
    'requests_created','quotes_submitted','jobs_created','jobs_completed',
    'support_cases_opened'
  ]
)
on conflict (report_key) do update set
  display_name = excluded.display_name,
  capability_key = excluded.capability_key,
  sensitive = excluded.sensitive,
  column_allowlist = excluded.column_allowlist;

-- Calendar resolution is server-owned. Dates shown in the UI are Cairo civil
-- dates; timestamps remain UTC and all ranges use [start, end) boundaries.
create or replace function private.business_reporting_period(
  p_preset text,
  p_custom_from date default null,
  p_custom_to date default null,
  p_comparison text default 'previous_period'
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_timezone text;
  v_today date;
  v_from date;
  v_to date;
  v_days integer;
  v_compare_from date;
  v_compare_to date;
  v_quarter_month integer;
begin
  select c.display_timezone into v_timezone
  from private.staff_platform_configuration c where c.singleton;
  v_timezone := coalesce(v_timezone, 'Africa/Cairo');
  v_today := (pg_catalog.now() at time zone v_timezone)::date;

  case p_preset
    when 'today' then v_from := v_today; v_to := v_today;
    when 'yesterday' then v_from := v_today - 1; v_to := v_today - 1;
    when 'last_7_days' then v_from := v_today - 6; v_to := v_today;
    when 'last_30_days' then v_from := v_today - 29; v_to := v_today;
    when 'this_week' then
      v_from := v_today - (pg_catalog.date_part('isodow', v_today)::integer - 1);
      v_to := v_today;
    when 'last_week' then
      v_to := v_today - pg_catalog.date_part('isodow', v_today)::integer;
      v_from := v_to - 6;
    when 'this_month' then
      v_from := pg_catalog.date_trunc('month', v_today::timestamp)::date;
      v_to := v_today;
    when 'last_month' then
      v_to := (pg_catalog.date_trunc('month', v_today::timestamp) - interval '1 day')::date;
      v_from := pg_catalog.date_trunc('month', v_to::timestamp)::date;
    when 'this_quarter' then
      v_quarter_month := ((pg_catalog.date_part('quarter', v_today)::integer - 1) * 3) + 1;
      v_from := pg_catalog.make_date(pg_catalog.date_part('year', v_today)::integer, v_quarter_month, 1);
      v_to := v_today;
    when 'last_quarter' then
      v_to := (pg_catalog.date_trunc('quarter', v_today::timestamp) - interval '1 day')::date;
      v_from := pg_catalog.date_trunc('quarter', v_to::timestamp)::date;
    when 'this_year' then v_from := pg_catalog.make_date(pg_catalog.date_part('year', v_today)::integer, 1, 1); v_to := v_today;
    when 'last_year' then v_from := pg_catalog.make_date(pg_catalog.date_part('year', v_today)::integer - 1, 1, 1); v_to := pg_catalog.make_date(pg_catalog.date_part('year', v_today)::integer - 1, 12, 31);
    when 'custom' then
      if p_custom_from is null or p_custom_to is null then
        raise exception 'Custom reporting dates are required' using errcode = '22023';
      end if;
      v_from := p_custom_from; v_to := p_custom_to;
    when 'all_time' then
      select pg_catalog.least(
        coalesce((select pg_catalog.min(p.created_at)::date from public.profiles p), v_today),
        coalesce((select pg_catalog.min(r.created_at)::date from public.marketplace_requests r), v_today),
        coalesce((select pg_catalog.min(b.created_at)::date from public.bookings b), v_today)
      ) into v_from;
      v_to := v_today;
    else raise exception 'Unknown reporting preset' using errcode = '22023';
  end case;

  if v_to < v_from or v_to > v_today then
    raise exception 'Invalid reporting period' using errcode = '22023';
  end if;
  if p_preset <> 'all_time' and v_to - v_from > 366 then
    raise exception 'Reporting period is too wide' using errcode = '22023';
  end if;
  if p_comparison not in ('none','previous_period','previous_year') then
    raise exception 'Unknown comparison mode' using errcode = '22023';
  end if;

  if p_comparison = 'previous_period' then
    v_days := v_to - v_from + 1;
    v_compare_to := v_from - 1;
    v_compare_from := v_compare_to - v_days + 1;
  elsif p_comparison = 'previous_year' then
    v_compare_from := (v_from - interval '1 year')::date;
    v_compare_to := (v_to - interval '1 year')::date;
  end if;

  return pg_catalog.jsonb_build_object(
    'preset', p_preset, 'timezone', v_timezone,
    'from', v_from, 'to', v_to,
    'startUtc', v_from::timestamp at time zone v_timezone,
    'endUtc', (v_to + 1)::timestamp at time zone v_timezone,
    'comparison', p_comparison,
    'comparisonFrom', v_compare_from, 'comparisonTo', v_compare_to,
    'comparisonStartUtc', case when v_compare_from is null then null else v_compare_from::timestamp at time zone v_timezone end,
    'comparisonEndUtc', case when v_compare_to is null then null else (v_compare_to + 1)::timestamp at time zone v_timezone end,
    'partial', v_to >= v_today
  );
end;
$$;
revoke all on function private.business_reporting_period(text,date,date,text) from public, anon, authenticated;

create or replace function private.business_report_metrics(
  p_start timestamptz,
  p_end timestamptz,
  p_category text default null,
  p_governorate text default null,
  p_verification_status text default null
)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'accountsCreated', (select pg_catalog.count(*) from public.profiles p where p.created_at >= p_start and p.created_at < p_end),
    'customersRegistered', (select pg_catalog.count(*) from public.customer_profiles c where c.created_at >= p_start and c.created_at < p_end),
    'workersRegistered', (select pg_catalog.count(*) from public.provider_profiles p where p.created_at >= p_start and p.created_at < p_end),
    'dualRoleAccounts', (select pg_catalog.count(*) from public.profiles p
      where p.created_at >= p_start and p.created_at < p_end
        and exists(select 1 from public.customer_profiles c where c.id = p.id)
        and exists(select 1 from public.provider_profiles w where w.user_id = p.id)),
    'emailConfirmed', (select pg_catalog.count(*) from auth.users u where u.email_confirmed_at >= p_start and u.email_confirmed_at < p_end),
    'accountsAnonymized', (select pg_catalog.count(*) from public.account_deletion_requests d where d.anonymized_at >= p_start and d.anonymized_at < p_end),
    'accountsSuspendedOrBanned', (select pg_catalog.count(*) from public.trust_enforcement_actions a
      where a.created_at >= p_start and a.created_at < p_end and a.action_type in ('suspension','permanent_ban')),
    'activeCustomers', (select pg_catalog.count(distinct activity.customer_id) from (
      select r.customer_id from public.marketplace_requests r where r.created_at >= p_start and r.created_at < p_end
      union all select b.customer_id from public.bookings b where b.created_at >= p_start and b.created_at < p_end
    ) activity),
    'customersWithAddress', (select pg_catalog.count(distinct c.id) from public.customer_profiles c
      where c.created_at >= p_start and c.created_at < p_end and exists(
        select 1 from public.addresses a where a.customer_id = c.id and a.deleted_at is null)),
    'firstRequestCustomers', (select pg_catalog.count(*) from (
      select r.customer_id, pg_catalog.min(r.created_at) first_at from public.marketplace_requests r
      group by r.customer_id having pg_catalog.min(r.created_at) >= p_start and pg_catalog.min(r.created_at) < p_end
    ) firsts),
    'repeatCustomers', (select pg_catalog.count(*) from (
      select r.customer_id from public.marketplace_requests r
      group by r.customer_id having pg_catalog.count(*) >= 2
        and pg_catalog.max(r.created_at) >= p_start and pg_catalog.max(r.created_at) < p_end
    ) repeats),
    'workerOnboardingStarted', (select pg_catalog.count(*) from public.provider_profiles w
      where w.created_at >= p_start and w.created_at < p_end
        and (p_verification_status is null or exists(select 1 from public.provider_verifications v where v.provider_id = w.id and v.status = p_verification_status))),
    'workerOnboardingCompleted', (select pg_catalog.count(distinct e.user_id) from public.worker_onboarding_events e
      where e.created_at >= p_start and e.created_at < p_end and e.to_state = 'identity_required'),
    'verificationSubmitted', (select pg_catalog.count(*) from public.provider_verifications v
      where v.submitted_at >= p_start and v.submitted_at < p_end
        and (p_verification_status is null or v.status = p_verification_status)),
    'workersApproved', (select pg_catalog.count(distinct e.user_id) from public.worker_onboarding_events e
      where e.created_at >= p_start and e.created_at < p_end and e.to_state = 'approved'),
    'workersRejected', (select pg_catalog.count(distinct e.user_id) from public.worker_onboarding_events e
      where e.created_at >= p_start and e.created_at < p_end and e.to_state = 'rejected'),
    'workersActivated', (select pg_catalog.count(distinct e.user_id) from public.worker_onboarding_events e
      where e.created_at >= p_start and e.created_at < p_end and e.to_state = 'active'),
    'workersSuspended', (select pg_catalog.count(distinct e.user_id) from public.worker_onboarding_events e
      where e.created_at >= p_start and e.created_at < p_end and e.to_state = 'suspended'),
    'activeWorkers', (select pg_catalog.count(distinct worker_id) from (
      select q.provider_id worker_id from public.worker_quotes q where q.submitted_at >= p_start and q.submitted_at < p_end
      union all select b.provider_id from public.bookings b where b.created_at >= p_start and b.created_at < p_end
    ) active),
    'requestsCreated', (select pg_catalog.count(*) from public.marketplace_requests r
      where r.created_at >= p_start and r.created_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'requestsCancelled', (select pg_catalog.count(*) from public.marketplace_requests r
      where r.cancelled_at >= p_start and r.cancelled_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'requestsWithQuotes', (select pg_catalog.count(*) from public.marketplace_requests r
      where r.created_at >= p_start and r.created_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)
        and exists(select 1 from public.worker_quotes q where q.request_id = r.id)),
    'quotesSubmitted', (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id = q.request_id
      where q.submitted_at >= p_start and q.submitted_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'quotesAccepted', (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id = q.request_id
      where q.selected_at >= p_start and q.selected_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'quotesWithdrawn', (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id = q.request_id
      where q.withdrawn_at >= p_start and q.withdrawn_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'averageQuotedAmountMinor', (select pg_catalog.round(pg_catalog.avg(q.price_minor), 0) from public.worker_quotes q join public.marketplace_requests r on r.id = q.request_id
      where q.submitted_at >= p_start and q.submitted_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'medianQuotedAmountMinor', (select pg_catalog.percentile_cont(0.5) within group(order by q.price_minor) from public.worker_quotes q join public.marketplace_requests r on r.id = q.request_id
      where q.submitted_at >= p_start and q.submitted_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)),
    'averageQuotesPerRequest', (select pg_catalog.round(pg_catalog.avg(quote_count), 2) from (
      select r.id, pg_catalog.count(q.id) quote_count from public.marketplace_requests r left join public.worker_quotes q on q.request_id = r.id
      where r.created_at >= p_start and r.created_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)
      group by r.id) counts),
    'medianSecondsToFirstQuote', (select pg_catalog.percentile_cont(0.5) within group(order by seconds) from (
      select pg_catalog.date_part('epoch', pg_catalog.min(q.submitted_at) - r.created_at) seconds
      from public.marketplace_requests r join public.worker_quotes q on q.request_id = r.id
      where r.created_at >= p_start and r.created_at < p_end
        and (p_category is null or r.category_id = p_category)
        and (p_governorate is null or r.approximate_governorate = p_governorate)
      group by r.id) first_quote),
    'jobsCreated', (select pg_catalog.count(*) from public.bookings b
      left join public.services s on s.id = b.service_id left join public.addresses a on a.id = b.address_id
      where b.created_at >= p_start and b.created_at < p_end
        and (p_category is null or s.category_id = p_category)
        and (p_governorate is null or a.governorate = p_governorate)),
    'jobsCompleted', (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h
      join public.bookings b on b.id = h.booking_id left join public.services s on s.id = b.service_id left join public.addresses a on a.id = b.address_id
      where h.created_at >= p_start and h.created_at < p_end and h.status = 'completed'
        and (p_category is null or s.category_id = p_category)
        and (p_governorate is null or a.governorate = p_governorate)),
    'jobsCancelled', (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h
      join public.bookings b on b.id = h.booking_id left join public.services s on s.id = b.service_id left join public.addresses a on a.id = b.address_id
      where h.created_at >= p_start and h.created_at < p_end and h.status = 'cancelled'
        and (p_category is null or s.category_id = p_category)
        and (p_governorate is null or a.governorate = p_governorate)),
    'jobsStarted', (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h
      where h.created_at >= p_start and h.created_at < p_end and h.status in ('job_started','work_in_progress')),
    'jobsDisputed', (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h
      where h.created_at >= p_start and h.created_at < p_end and h.status = 'disputed'),
    'grossJobValueMinor', (select coalesce(pg_catalog.sum(e.gross_minor),0) from public.provider_earnings_ledger e where e.created_at >= p_start and e.created_at < p_end),
    'workerEarningsMinor', (select coalesce(pg_catalog.sum(e.net_minor),0) from public.provider_earnings_ledger e where e.created_at >= p_start and e.created_at < p_end),
    'platformFeesMinor', (select coalesce(pg_catalog.sum(e.commission_minor),0) from public.provider_earnings_ledger e where e.created_at >= p_start and e.created_at < p_end),
    'refundsMinor', (select coalesce(pg_catalog.sum(f.amount_minor),0) from public.financial_refunds f where f.created_at >= p_start and f.created_at < p_end and f.status = 'succeeded'),
    'supportCasesOpened', (select pg_catalog.count(*) from public.support_tickets t where t.created_at >= p_start and t.created_at < p_end),
    'supportReplies', (select pg_catalog.count(*) from public.support_messages m where m.created_at >= p_start and m.created_at < p_end),
    'supportCasesResolved', (select pg_catalog.count(*) from public.support_tickets t where t.resolved_at >= p_start and t.resolved_at < p_end),
    'medianFirstResponseSeconds', (select pg_catalog.percentile_cont(0.5) within group(order by pg_catalog.date_part('epoch', t.first_response_at - t.created_at)) from public.support_tickets t
      where t.created_at >= p_start and t.created_at < p_end and t.first_response_at is not null),
    'medianResolutionSeconds', (select pg_catalog.percentile_cont(0.5) within group(order by pg_catalog.date_part('epoch', t.resolved_at - t.created_at)) from public.support_tickets t
      where t.created_at >= p_start and t.created_at < p_end and t.resolved_at is not null)
  )
$$;
revoke all on function private.business_report_metrics(timestamptz,timestamptz,text,text,text) from public, anon, authenticated;

create or replace function public.get_staff_business_report(
  p_preset text default 'last_30_days',
  p_custom_from date default null,
  p_custom_to date default null,
  p_comparison text default 'previous_period',
  p_category text default null,
  p_governorate text default null,
  p_verification_status text default null
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_actor uuid;
  v_period jsonb;
  v_metrics jsonb;
  v_comparison jsonb;
  v_series jsonb;
  v_categories jsonb;
  v_governorates jsonb;
  v_verification jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_compare_start timestamptz;
  v_compare_end timestamptz;
  v_timezone text;
  v_financial_visible boolean;
begin
  v_actor := private.require_staff_capability('view_analytics');
  v_financial_visible := 'view_financial_ledger' = any(private.staff_capability_keys(v_actor));
  if p_category is not null and not exists(select 1 from public.service_categories c where c.id = p_category) then
    raise exception 'Unknown service category' using errcode = '22023';
  end if;
  if p_verification_status is not null and p_verification_status not in (
    'not_started','draft','submitted','under_review','approved','rejected','requires_resubmission','expired'
  ) then raise exception 'Unknown verification status' using errcode = '22023'; end if;
  if pg_catalog.length(coalesce(p_governorate,'')) > 100 then
    raise exception 'Invalid governorate filter' using errcode = '22023';
  end if;

  v_period := private.business_reporting_period(p_preset, p_custom_from, p_custom_to, p_comparison);
  v_start := (v_period->>'startUtc')::timestamptz;
  v_end := (v_period->>'endUtc')::timestamptz;
  v_timezone := v_period->>'timezone';
  v_metrics := private.business_report_metrics(v_start, v_end, p_category, nullif(pg_catalog.btrim(p_governorate),''), p_verification_status);

  if v_period->>'comparisonStartUtc' is not null then
    v_compare_start := (v_period->>'comparisonStartUtc')::timestamptz;
    v_compare_end := (v_period->>'comparisonEndUtc')::timestamptz;
    v_comparison := private.business_report_metrics(v_compare_start, v_compare_end, p_category, nullif(pg_catalog.btrim(p_governorate),''), p_verification_status);
  end if;

  -- Financial ledger facts remain behind their separately governed capability.
  -- The operational dashboard is useful without widening that authority.
  if not v_financial_visible then
    v_metrics := v_metrics
      - 'grossJobValueMinor' - 'workerEarningsMinor'
      - 'platformFeesMinor' - 'refundsMinor';
    if v_comparison is not null then
      v_comparison := v_comparison
        - 'grossJobValueMinor' - 'workerEarningsMinor'
        - 'platformFeesMinor' - 'refundsMinor';
    end if;
  end if;

  select coalesce(pg_catalog.jsonb_agg(row order by "day"), '[]'::jsonb) into v_series from (
    select d.report_date as "day",
      pg_catalog.count(distinct p.id) accounts_created,
      pg_catalog.count(distinct c.id) customers_registered,
      pg_catalog.count(distinct w.id) workers_registered,
      (select pg_catalog.count(*) from public.marketplace_requests r where r.created_at >= d.start_at and r.created_at < d.end_at
        and (p_category is null or r.category_id = p_category) and (nullif(pg_catalog.btrim(p_governorate),'') is null or r.approximate_governorate = pg_catalog.btrim(p_governorate))) requests_created,
      (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id=q.request_id where q.submitted_at >= d.start_at and q.submitted_at < d.end_at
        and (p_category is null or r.category_id = p_category) and (nullif(pg_catalog.btrim(p_governorate),'') is null or r.approximate_governorate = pg_catalog.btrim(p_governorate))) quotes_submitted,
      (select pg_catalog.count(*) from public.bookings b where b.created_at >= d.start_at and b.created_at < d.end_at) jobs_created,
      (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h where h.created_at >= d.start_at and h.created_at < d.end_at and h.status='completed') jobs_completed,
      (select pg_catalog.count(*) from public.support_tickets t where t.created_at >= d.start_at and t.created_at < d.end_at) support_cases_opened
    from (
      select g.value::date as report_date,
        g.value::timestamp at time zone v_timezone start_at,
        (g.value::date + 1)::timestamp at time zone v_timezone end_at
      from pg_catalog.generate_series((v_period->>'from')::date, (v_period->>'to')::date, interval '1 day') as g(value)
    ) d
    left join public.profiles p on p.created_at >= d.start_at and p.created_at < d.end_at
    left join public.customer_profiles c on c.id = p.id and c.created_at >= d.start_at and c.created_at < d.end_at
    left join public.provider_profiles w on w.user_id = p.id and w.created_at >= d.start_at and w.created_at < d.end_at
    group by d.report_date, d.start_at, d.end_at
  ) row;

  select coalesce(pg_catalog.jsonb_agg(item order by request_count desc, category_id), '[]'::jsonb) into v_categories from (
    select r.category_id, pg_catalog.count(*) request_count
    from public.marketplace_requests r where r.created_at >= v_start and r.created_at < v_end
      and (p_category is null or r.category_id = p_category)
      and (nullif(pg_catalog.btrim(p_governorate),'') is null or r.approximate_governorate = pg_catalog.btrim(p_governorate))
    group by r.category_id limit 25
  ) item;
  select coalesce(pg_catalog.jsonb_agg(item order by request_count desc, governorate), '[]'::jsonb) into v_governorates from (
    select r.approximate_governorate governorate, pg_catalog.count(*) request_count
    from public.marketplace_requests r where r.created_at >= v_start and r.created_at < v_end
      and (p_category is null or r.category_id = p_category)
      and (nullif(pg_catalog.btrim(p_governorate),'') is null or r.approximate_governorate = pg_catalog.btrim(p_governorate))
    group by r.approximate_governorate limit 30
  ) item;
  select coalesce(pg_catalog.jsonb_agg(item order by worker_count desc, status), '[]'::jsonb) into v_verification from (
    select v.status, pg_catalog.count(*) worker_count from public.provider_verifications v
    where p_verification_status is null or v.status = p_verification_status group by v.status
  ) item;

  perform private.staff_log_access(v_actor, 'analytics', 'view_analytics', 'business_report', 1);
  return pg_catalog.jsonb_build_object(
    'period', v_period,
    'filters', pg_catalog.jsonb_build_object('category',p_category,'governorate',nullif(pg_catalog.btrim(p_governorate),''),'verificationStatus',p_verification_status),
    'metrics', v_metrics,
    'comparisonMetrics', v_comparison,
    'series', v_series,
    'dimensions', pg_catalog.jsonb_build_object('categories',v_categories,'governorates',v_governorates,'verificationStatuses',v_verification),
    'funnel', pg_catalog.jsonb_build_object(
      'requests', v_metrics->'requestsCreated', 'withQuotes', v_metrics->'requestsWithQuotes',
      'acceptedQuotes', v_metrics->'quotesAccepted', 'completedJobs', v_metrics->'jobsCompleted'),
    'generatedAt', pg_catalog.now(),
    'privacy', pg_catalog.jsonb_build_object('containsPii',false,'identifiers','none'),
    'financialVisible', v_financial_visible,
    'financialAuthoritative', v_financial_visible
  );
end;
$$;

create or replace function public.staff_request_business_export(
  p_range_start date,
  p_range_end date,
  p_reason text,
  p_idempotency_key text,
  p_category text default null,
  p_governorate text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_id uuid; v_existing uuid; v_config private.staff_platform_configuration%rowtype;
begin
  v_actor := private.require_staff_capability('export_operational_report');
  if p_range_start is null or p_range_end is null or p_range_end < p_range_start or p_range_end - p_range_start > 366 then
    raise exception 'Export range must be within 366 days' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'A reason is required for this export' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid export request' using errcode = '22023';
  end if;
  select e.id into v_existing from private.staff_export_requests e where e.idempotency_key = p_idempotency_key;
  if v_existing is not null then return pg_catalog.jsonb_build_object('exportId',v_existing,'duplicate',true); end if;
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  insert into private.staff_export_requests(
    report_key, requested_by, reason, range_start, range_end, row_limit, expires_at,
    idempotency_key, filters, grouping
  ) values (
    'business_daily', v_actor, pg_catalog.btrim(p_reason), p_range_start, p_range_end,
    v_config.export_row_limit, pg_catalog.now() + interval '24 hours', p_idempotency_key,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('category',p_category,'governorate',nullif(pg_catalog.btrim(p_governorate),''))), 'day'
  ) returning id into v_id;
  perform private.staff_log_access(v_actor,'export_request','export_operational_report','business_daily',0);
  perform private.record_staff_audit(v_actor,'export_operational_report','export_requested','staff_export_request',v_id,p_reason,
    pg_catalog.jsonb_build_object('reportKey','business_daily','rangeStart',p_range_start,'rangeEnd',p_range_end,'filters',
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('category',p_category,'governorate',nullif(pg_catalog.btrim(p_governorate),'')))));
  return pg_catalog.jsonb_build_object('exportId',v_id,'duplicate',false,'columns',
    (select pg_catalog.to_jsonb(c.column_allowlist) from private.staff_export_catalog c where c.report_key='business_daily'),
    'rowLimit',v_config.export_row_limit,'expiresAt',pg_catalog.now() + interval '24 hours');
end;
$$;

create or replace function public.staff_business_export_preview(p_export_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid;
  v_request private.staff_export_requests%rowtype;
  v_rows jsonb;
  v_timezone text;
begin
  select * into v_request from private.staff_export_requests e where e.id=p_export_id for update;
  if v_request.id is null or v_request.report_key <> 'business_daily' then raise exception 'Export not found' using errcode='P0002'; end if;
  v_actor := private.require_staff_capability('export_operational_report');
  if v_request.requested_by <> v_actor then raise exception 'This export belongs to another staff member' using errcode='42501'; end if;
  if v_request.status <> 'approved' or v_request.expires_at <= pg_catalog.now() then
    update private.staff_export_requests set status='expired' where id=p_export_id and status='approved';
    raise exception 'This export is no longer available' using errcode='42501';
  end if;
  select c.display_timezone into v_timezone from private.staff_platform_configuration c where c.singleton;
  select coalesce(pg_catalog.jsonb_agg(row order by "date"), '[]'::jsonb) into v_rows from (
    select d.report_date as "date",
      (select pg_catalog.count(*) from public.profiles p where p.created_at >= d.start_at and p.created_at < d.end_at) accounts_created,
      (select pg_catalog.count(*) from public.customer_profiles c where c.created_at >= d.start_at and c.created_at < d.end_at) customers_registered,
      (select pg_catalog.count(*) from public.provider_profiles w where w.created_at >= d.start_at and w.created_at < d.end_at) workers_registered,
      (select pg_catalog.count(*) from public.marketplace_requests r where r.created_at >= d.start_at and r.created_at < d.end_at
        and (not (v_request.filters ? 'category') or r.category_id=v_request.filters->>'category')
        and (not (v_request.filters ? 'governorate') or r.approximate_governorate=v_request.filters->>'governorate')) requests_created,
      (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id=q.request_id
        where q.submitted_at >= d.start_at and q.submitted_at < d.end_at
        and (not (v_request.filters ? 'category') or r.category_id=v_request.filters->>'category')
        and (not (v_request.filters ? 'governorate') or r.approximate_governorate=v_request.filters->>'governorate')) quotes_submitted,
      (select pg_catalog.count(*) from public.bookings b where b.created_at >= d.start_at and b.created_at < d.end_at) jobs_created,
      (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h where h.created_at >= d.start_at and h.created_at < d.end_at and h.status='completed') jobs_completed,
      (select pg_catalog.count(*) from public.support_tickets t where t.created_at >= d.start_at and t.created_at < d.end_at) support_cases_opened
    from (
      select g.value::date as report_date, g.value::timestamp at time zone v_timezone start_at,
        (g.value::date + 1)::timestamp at time zone v_timezone end_at
      from pg_catalog.generate_series(v_request.range_start,v_request.range_end,interval '1 day') as g(value)
      limit v_request.row_limit
    ) d
  ) row;
  update private.staff_export_requests set download_count=download_count+1,last_downloaded_at=pg_catalog.now() where id=p_export_id;
  perform private.staff_log_access(v_actor,'export_preview','export_operational_report','business_daily',pg_catalog.jsonb_array_length(v_rows));
  perform private.record_staff_audit(v_actor,'export_operational_report','export_downloaded','staff_export_request',p_export_id,v_request.reason,
    pg_catalog.jsonb_build_object('reportKey','business_daily','filters',v_request.filters));
  return pg_catalog.jsonb_build_object('exportId',p_export_id,'reportKey','business_daily',
    'columns',(select pg_catalog.to_jsonb(c.column_allowlist) from private.staff_export_catalog c where c.report_key='business_daily'),
    'rows',v_rows,'rowLimit',v_request.row_limit,'fileDeliveryAvailable',false,'filters',v_request.filters);
end;
$$;

revoke all on function public.get_staff_business_report(text,date,date,text,text,text,text) from public, anon;
revoke all on function public.staff_request_business_export(date,date,text,text,text,text) from public, anon;
revoke all on function public.staff_business_export_preview(uuid) from public, anon;
grant execute on function public.get_staff_business_report(text,date,date,text,text,text,text) to authenticated;
grant execute on function public.staff_request_business_export(date,date,text,text,text,text) to authenticated;
grant execute on function public.staff_business_export_preview(uuid) to authenticated;

-- Existing indexes cover most range scans. These two event-time indexes close
-- the remaining hot paths without changing transaction semantics.
create index if not exists worker_quotes_submitted_reporting_idx on public.worker_quotes(submitted_at, request_id);
create index if not exists worker_onboarding_events_reporting_idx on public.worker_onboarding_events(created_at, to_state);
create index if not exists support_tickets_reporting_idx on public.support_tickets(created_at, resolved_at);

comment on function public.get_staff_business_report(text,date,date,text,text,text,text) is
  'First-party aggregate business reporting. Cairo civil periods, UTC storage, no PII, capability gated and access logged.';
comment on function public.staff_request_business_export(date,date,text,text,text,text) is
  'Creates an idempotent, expiring and audited CSV-ready daily business export authorization. Requires fresh reauthentication.';
