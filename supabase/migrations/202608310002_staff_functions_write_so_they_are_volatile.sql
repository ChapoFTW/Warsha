-- Six staff functions could never run through the API.
--
-- Each is declared STABLE and each calls `private.staff_log_access`, which
-- INSERTs the record of who looked at what. PostgREST honours the declaration
-- by running a read-only transaction, so the insert raises SQLSTATE 25006 --
-- "cannot execute INSERT in a read-only transaction" -- and the request comes
-- back as HTTP 405 before any staff member sees a single row:
--
--     get_staff_analytics            the analytics dashboard
--     get_staff_business_report      the business report
--     get_staff_case                 a support case
--     get_staff_customer_overview    a customer's history
--     get_staff_worker_overview      a worker's history
--     staff_audit_search             the audit explorer
--
-- Found by opening the console in a browser as a granted staff member. Every
-- pgTAP assertion about these functions passes, because pgTAP runs as a
-- superuser in an ordinary read-write transaction and never meets the
-- constraint the API imposes. This is the same blind spot that hid
-- `search_providers` raising on every call, and it is the second time it has
-- cost a working feature.
--
-- The declaration is simply wrong. A function that writes an audit row is
-- VOLATILE by definition; saying STABLE is a promise it does not keep. Nothing
-- else changes -- the bodies below are the deployed ones, re-declared without
-- the marker.


CREATE OR REPLACE FUNCTION public.get_staff_analytics(p_dashboard text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_caps text[]; v_config private.staff_platform_configuration%rowtype;
  v_from date; v_to date; v_start timestamptz; v_end timestamptz; v_metrics jsonb;
begin
  v_actor := private.require_staff_capability('view_analytics');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_config from private.staff_platform_configuration c where c.singleton;
  if p_dashboard not in ('executive','marketplace','bookings','workers','customers',
                         'financial','trust','verification','notifications') then
    raise exception 'Unknown dashboard' using errcode = '22023';
  end if;
  if p_dashboard = 'financial' and not ('view_financial_ledger' = any(v_caps)) then
    raise exception 'Staff capability required' using errcode = '42501';
  end if;
  v_to := coalesce(p_to, (pg_catalog.now() at time zone v_config.display_timezone)::date);
  v_from := coalesce(p_from, v_to - 29);
  if v_to < v_from then raise exception 'Invalid reporting period' using errcode = '22023'; end if;
  if v_to - v_from > v_config.analytics_max_range_days then
    raise exception 'Reporting period is too wide' using errcode = '22023';
  end if;
  -- Authoritative timestamps stay UTC; the reporting period is expressed in the
  -- configured display timezone (Egypt/Cairo) so a day boundary is meaningful.
  v_start := (v_from::timestamp) at time zone v_config.display_timezone;
  v_end := ((v_to + 1)::timestamp) at time zone v_config.display_timezone;

  if p_dashboard = 'marketplace' then
    select pg_catalog.jsonb_build_object(
      'requestsCreated', pg_catalog.count(*),
      'requestsWithQuotes', pg_catalog.count(*) filter (where q.quote_count > 0),
      'requestsExpired', pg_catalog.count(*) filter (where r.status = 'expired'),
      'requestsCancelled', pg_catalog.count(*) filter (where r.status = 'cancelled'),
      'requestsConverted', pg_catalog.count(*) filter (where r.status = 'converted_to_booking'),
      'noProviderOutcomes', pg_catalog.count(*) filter (where q.invitation_count = 0),
      'emergencyRequests', pg_catalog.count(*) filter (where r.flow_kind = 'emergency'),
      'rescueRequests', pg_catalog.count(*) filter (where r.flow_kind = 'rescue'),
      'medianQuotesPerRequest', pg_catalog.percentile_cont(0.5) within group (order by q.quote_count),
      'medianSecondsToFirstQuote', pg_catalog.percentile_cont(0.5) within group (order by q.first_quote_seconds)
    ) into v_metrics
    from public.marketplace_requests r
    cross join lateral (
      select pg_catalog.count(wq.id) quote_count,
             (select pg_catalog.count(*) from public.quote_invitations i where i.request_id = r.id) invitation_count,
             pg_catalog.min(pg_catalog.date_part('epoch', wq.submitted_at - r.created_at)) first_quote_seconds
      from public.worker_quotes wq where wq.request_id = r.id) q
    where r.created_at >= v_start and r.created_at < v_end;

  elsif p_dashboard = 'bookings' then
    select pg_catalog.jsonb_build_object(
      'bookingsCreated', pg_catalog.count(*),
      'confirmed', pg_catalog.count(*) filter (where b.status not in ('draft','cancelled','rejected')),
      'completed', pg_catalog.count(*) filter (where b.status = 'completed'),
      'cancelled', pg_catalog.count(*) filter (where b.status = 'cancelled'),
      'noShow', pg_catalog.count(*) filter (where b.status = 'no_show'),
      'disputed', pg_catalog.count(*) filter (where b.status = 'disputed'),
      'cancellationRate', case when pg_catalog.count(*) = 0 then null
        else pg_catalog.round(pg_catalog.count(*) filter (where b.status = 'cancelled')::numeric
             / pg_catalog.count(*)::numeric, 4) end,
      'returnVisits', (select pg_catalog.count(*) from public.booking_return_visits v
                       where v.requested_at >= v_start and v.requested_at < v_end),
      'additionalWorkRequests', (select pg_catalog.count(*) from public.booking_additional_work_requests w
                                 where w.created_at >= v_start and w.created_at < v_end)
    ) into v_metrics
    from public.bookings b where b.created_at >= v_start and b.created_at < v_end;

  elsif p_dashboard = 'workers' then
    select pg_catalog.jsonb_build_object(
      'totalWorkers', pg_catalog.count(*),
      'verifiedWorkers', pg_catalog.count(*) filter (where p.is_verified),
      'publishedWorkers', pg_catalog.count(*) filter (where p.is_published),
      'availableWorkers', pg_catalog.count(*) filter (where p.is_available),
      'approvedOnboarding', pg_catalog.count(*) filter (where p.onboarding_status = 'approved'),
      'averageRating', pg_catalog.round(pg_catalog.avg(p.rating_average) filter (where p.review_count > 0), 2),
      'categoryCoverage', (select private.staff_suppress(pg_catalog.count(distinct p2.primary_category_id),
                             v_config.analytics_minimum_cell)
                           from public.provider_profiles p2 where p2.is_published and p2.deleted_at is null)
    ) into v_metrics
    from public.provider_profiles p where p.deleted_at is null;

  elsif p_dashboard = 'customers' then
    select pg_catalog.jsonb_build_object(
      'activeCustomers', private.staff_suppress(
        (select pg_catalog.count(distinct b.customer_id) from public.bookings b
         where b.created_at >= v_start and b.created_at < v_end), v_config.analytics_minimum_cell),
      'requestingCustomers', private.staff_suppress(
        (select pg_catalog.count(distinct r.customer_id) from public.marketplace_requests r
         where r.created_at >= v_start and r.created_at < v_end), v_config.analytics_minimum_cell),
      'repeatCustomers', private.staff_suppress((select pg_catalog.count(*) from (
          select b.customer_id from public.bookings b
          where b.created_at >= v_start and b.created_at < v_end
          group by b.customer_id having pg_catalog.count(*) > 1) repeats), v_config.analytics_minimum_cell),
      'cashSelections', (select pg_catalog.count(*) from public.financial_booking_payments f
        where f.created_at >= v_start and f.created_at < v_end and f.payment_method = 'cash'),
      'onlineSelections', (select pg_catalog.count(*) from public.financial_booking_payments f
        where f.created_at >= v_start and f.created_at < v_end and f.payment_method = 'online')
    ) into v_metrics;

  elsif p_dashboard = 'financial' then
    select pg_catalog.jsonb_build_object(
      'currency','EGP',
      'grossBookingValueMinor', coalesce((select pg_catalog.sum(e.gross_minor) from public.provider_earnings_ledger e
        where e.created_at >= v_start and e.created_at < v_end),0)::text,
      'commissionMinor', coalesce((select pg_catalog.sum(e.commission_minor) from public.provider_earnings_ledger e
        where e.created_at >= v_start and e.created_at < v_end),0)::text,
      'pendingEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status in ('pending_job_completion','pending_release')),0)::text,
      'availableEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status = 'available'),0)::text,
      'paidEarningsMinor', coalesce((select pg_catalog.sum(e.net_minor) from public.provider_earnings_ledger e
        where e.status = 'paid_out'),0)::text,
      'withdrawalsRequested', (select pg_catalog.count(*) from public.provider_withdrawal_requests w
        where w.requested_at >= v_start and w.requested_at < v_end),
      'refunds', (select pg_catalog.count(*) from public.financial_refunds f
        where f.created_at >= v_start and f.created_at < v_end),
      'refundsFailed', (select pg_catalog.count(*) from public.financial_refunds f
        where f.created_at >= v_start and f.created_at < v_end and f.status = 'failed'),
      'chargebacks', (select pg_catalog.count(*) from private.payment_chargebacks c
        where c.opened_at >= v_start and c.opened_at < v_end),
      'reconciliationExceptions', (select pg_catalog.count(*) from private.reconciliation_exceptions e
        where e.created_at >= v_start and e.created_at < v_end),
      'openCashCommissionDebtRecords', (select pg_catalog.count(*) from public.provider_cash_commission_records r
        where r.created_at >= v_start and r.created_at < v_end)
    ) into v_metrics;

  elsif p_dashboard = 'trust' then
    select pg_catalog.jsonb_build_object(
      'reportsSubmitted', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end),
      'reportsActioned', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end and r.status = 'actioned'),
      'reportsDismissed', (select pg_catalog.count(*) from public.trust_reports r
        where r.created_at >= v_start and r.created_at < v_end and r.status = 'dismissed'),
      'enforcementActions', (select pg_catalog.count(*) from public.trust_enforcement_actions a
        where a.created_at >= v_start and a.created_at < v_end),
      'permanentBans', (select pg_catalog.count(*) from public.trust_enforcement_actions a
        where a.created_at >= v_start and a.created_at < v_end and a.action_type = 'permanent_ban'),
      'appealsSubmitted', (select pg_catalog.count(*) from public.trust_appeals ap
        where ap.created_at >= v_start and ap.created_at < v_end),
      'appealsOverturned', (select pg_catalog.count(*) from public.trust_appeals ap
        where ap.created_at >= v_start and ap.created_at < v_end
          and ap.status in ('overturned','partially_overturned')),
      'disputesOpened', (select pg_catalog.count(*) from public.disputes d
        where d.created_at >= v_start and d.created_at < v_end),
      'disputesResolved', (select pg_catalog.count(*) from public.disputes d
        where d.created_at >= v_start and d.created_at < v_end and d.status in ('resolved','closed')),
      'reviewReports', (select pg_catalog.count(*) from public.review_reports r
        where r.created_at >= v_start and r.created_at < v_end),
      'reviewModerationActions', (select pg_catalog.count(*) from public.review_moderation_events m
        where m.created_at >= v_start and m.created_at < v_end),
      'reviewsPublished', (select pg_catalog.count(*) from public.reviews rv
        where rv.created_at >= v_start and rv.created_at < v_end and rv.deleted_at is null)
    ) into v_metrics;

  elsif p_dashboard = 'verification' then
    select pg_catalog.jsonb_build_object(
      'submitted', pg_catalog.count(*) filter (where v.submitted_at >= v_start and v.submitted_at < v_end),
      'approved', pg_catalog.count(*) filter (where v.status = 'approved'),
      'rejected', pg_catalog.count(*) filter (where v.status = 'rejected'),
      'awaitingReview', pg_catalog.count(*) filter (where v.status in ('submitted','under_review')),
      'requiresResubmission', pg_catalog.count(*) filter (where v.status = 'requires_resubmission'),
      'expired', pg_catalog.count(*) filter (where v.status = 'expired'),
      'certificatesSubmitted', (select pg_catalog.count(*) from public.provider_certifications c
        where c.submitted_at >= v_start and c.submitted_at < v_end),
      'certificatesApproved', (select pg_catalog.count(*) from public.provider_certifications c
        where c.status = 'approved' and c.deleted_at is null)
    ) into v_metrics
    from public.provider_verifications v;

  elsif p_dashboard = 'notifications' then
    select pg_catalog.jsonb_build_object(
      'notificationsCreated', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end),
      'unread', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end and n.read_at is null),
      'requiredActionOpen', (select pg_catalog.count(*) from public.notifications n
        where n.created_at >= v_start and n.created_at < v_end
          and n.required_action and n.action_resolved_at is null),
      'deliveryFailures', (select pg_catalog.count(*) from private.notification_delivery_attempts a
        where a.attempted_at >= v_start and a.attempted_at < v_end and a.status = 'failed'),
      'pushDeliveryEnabled', (select c.push_delivery_enabled from private.notification_configuration c where c.singleton),
      'schedulerEnabled', (select c.scheduler_enabled from private.notification_configuration c where c.singleton)
    ) into v_metrics;

  else
    select pg_catalog.jsonb_build_object(
      'requestsCreated', (select pg_catalog.count(*) from public.marketplace_requests r
        where r.created_at >= v_start and r.created_at < v_end),
      'bookingsCreated', (select pg_catalog.count(*) from public.bookings b
        where b.created_at >= v_start and b.created_at < v_end),
      'bookingsCompleted', (select pg_catalog.count(*) from public.bookings b
        where b.created_at >= v_start and b.created_at < v_end and b.status = 'completed'),
      'publishedWorkers', (select pg_catalog.count(*) from public.provider_profiles p
        where p.is_published and p.deleted_at is null),
      'openDisputes', (select pg_catalog.count(*) from public.disputes d
        where d.status in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review')),
      'openReports', (select pg_catalog.count(*) from public.trust_reports r
        where r.status in ('submitted','triage','investigating')),
      'activeIncidents', (select pg_catalog.count(*) from public.operational_incidents i
        where i.status in ('open','mitigating','monitoring')),
      'onlinePaymentsEnabled', (select c.gateway_mode <> 'disabled' from private.payment_configuration c where c.id),
      'marketplaceEnabled', (select m.enabled from private.marketplace_configuration m where m.singleton)
    ) into v_metrics;
  end if;

  perform private.staff_log_access(v_actor, 'analytics', 'view_analytics', p_dashboard, 1);
  return pg_catalog.jsonb_build_object(
    'dashboard', p_dashboard,
    'from', v_from, 'to', v_to,
    'timezone', v_config.display_timezone,
    'timeBasis', 'record creation time, bucketed by the reporting timezone',
    'minimumCell', v_config.analytics_minimum_cell,
    'partial', v_to >= (pg_catalog.now() at time zone v_config.display_timezone)::date,
    'generatedAt', pg_catalog.now(),
    'metrics', coalesce(v_metrics,'{}'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_business_report(p_preset text DEFAULT 'last_30_days'::text, p_custom_from date DEFAULT NULL::date, p_custom_to date DEFAULT NULL::date, p_comparison text DEFAULT 'previous_period'::text, p_category text DEFAULT NULL::text, p_governorate text DEFAULT NULL::text, p_verification_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_case(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  perform private.staff_log_access(v_actor, 'case_notes', v_queue.capability_key,
    'assignment:'||p_assignment_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'assignmentId', v_row.id, 'queueKey', v_row.queue_key, 'subjectType', v_row.subject_type,
    'subjectId', v_row.subject_id, 'status', v_row.status, 'priority', v_row.priority,
    'reasonCode', v_row.reason_code, 'assignedTo', v_row.assigned_to, 'assignedAt', v_row.assigned_at,
    'dueAt', v_row.due_at, 'escalatedAt', v_row.escalated_at, 'resolvedAt', v_row.resolved_at,
    'closedAt', v_row.closed_at, 'lockVersion', v_row.lock_version, 'createdAt', v_row.created_at,
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status,
        'actorId', e.actor_id, 'assigneeId', e.assignee_id, 'note', e.note, 'createdAt', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      from public.operational_assignment_events e where e.assignment_id = p_assignment_id),
    'privateNotes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', n.id, 'authorId', n.author_id, 'note', n.note, 'createdAt', n.created_at
      ) order by n.created_at), '[]'::jsonb)
      from private.operational_case_notes n where n.assignment_id = p_assignment_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_overview(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_caps text[]; v_profile public.profiles%rowtype; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_customer_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if 'view_contact_details' = any(v_caps) then
    v_contact := pg_catalog.jsonb_build_object(
      'phone', v_profile.phone,
      'email', private.account_contact_email(p_user_id));
  end if;
  perform private.staff_log_access(v_actor, 'customer_overview', 'view_safe_customer_profile',
    'account:'||p_user_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'userId', v_profile.id,
    'displayName', v_profile.display_name,
    'preferredLanguage', v_profile.preferred_language,
    'accountStatus', case when v_profile.deleted_at is not null then 'deleted' else 'active' end,
    'createdAt', v_profile.created_at,
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = p_user_id),'good_standing'),
    'restrictions', coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'marketplaceRemoved', nullif(s.marketplace_removed,false),
        'communicationRestricted', nullif(s.communication_restricted,false),
        'reviewRestricted', nullif(s.review_restricted,false),
        'paymentHold', nullif(s.payment_hold,false)))
      from public.trust_account_state s where s.user_id = p_user_id), '{}'::jsonb),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'cancelled'),
      'active', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id
                 and b.status not in ('completed','cancelled','rejected','refunded'))),
    'disputesOpened', (select pg_catalog.count(*)::integer from public.disputes d where d.opened_by = p_user_id),
    'reportsFiled', (select pg_catalog.count(*)::integer from public.trust_reports r where r.reporter_id = p_user_id),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = p_user_id),
    'supportCases', (select pg_catalog.count(*)::integer from public.support_tickets t where t.requester_id = p_user_id),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_worker_overview(p_provider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_caps text[]; v_provider public.provider_profiles%rowtype;
  v_financial jsonb := '{}'::jsonb; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_worker_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_provider from public.provider_profiles p where p.id = p_provider_id;
  if v_provider.id is null then raise exception 'Worker not found' using errcode = 'P0002'; end if;
  if 'view_financial_ledger' = any(v_caps) then
    select pg_catalog.jsonb_build_object(
      'currency','EGP',
      'pendingMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status in ('pending_job_completion','pending_release')),0)::text,
      'availableMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'available'),0)::text,
      'paidOutMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'paid_out'),0)::text,
      'heldMinor', coalesce(pg_catalog.sum(e.held_minor),0)::text)
      into v_financial
    from public.provider_earnings_ledger e where e.provider_id = p_provider_id;
    v_financial := v_financial || pg_catalog.jsonb_build_object(
      'openWithdrawals', (select pg_catalog.count(*)::integer from public.provider_withdrawal_requests w
                          where w.provider_id = p_provider_id and w.status in ('requested','under_review','processing')),
      'activeHolds', (select pg_catalog.count(*)::integer from public.provider_earning_holds h
                      where h.provider_id = p_provider_id and h.status = 'active'));
  end if;
  if 'view_contact_details' = any(v_caps) and v_provider.user_id is not null then
    select pg_catalog.jsonb_build_object('phone', pr.phone) into v_contact
    from public.profiles pr where pr.id = v_provider.user_id;
  end if;
  perform private.staff_log_access(v_actor, 'worker_overview', 'view_safe_worker_profile',
    'worker:'||p_provider_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'providerId', v_provider.id,
    'userId', v_provider.user_id,
    'displayName', v_provider.display_name,
    'professionKey', v_provider.profession_key,
    'primaryCategoryId', v_provider.primary_category_id,
    'onboardingStatus', v_provider.onboarding_status,
    'isPublished', v_provider.is_published,
    'isVerified', v_provider.is_verified,
    'isAvailable', v_provider.is_available,
    'accountStatus', case when v_provider.deleted_at is not null then 'deleted' else 'active' end,
    'ratingAverage', v_provider.rating_average,
    'reviewCount', v_provider.review_count,
    'completedJobs', v_provider.completed_jobs,
    'verification', (select pg_catalog.jsonb_build_object('status', v.status, 'submittedAt', v.submitted_at,
        'reviewedAt', v.reviewed_at, 'expiresAt', v.expires_at)
      from public.provider_verifications v where v.provider_id = p_provider_id),
    'certificates', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'type', c.certificate_type, 'status', c.status, 'expiresAt', c.expires_at)
        order by c.created_at desc), '[]'::jsonb)
      from public.provider_certifications c where c.provider_id = p_provider_id and c.deleted_at is null),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'cancelled')),
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = v_provider.user_id),'good_standing'),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = v_provider.user_id),
    'financial', v_financial,
    'financialVisible', 'view_financial_ledger' = any(v_caps),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_audit_search(p_source text, p_from timestamp with time zone, p_to timestamp with time zone, p_actor_id uuid DEFAULT NULL::uuid, p_entity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_from timestamptz := coalesce(p_from, pg_catalog.now() - pg_catalog.make_interval(days => 30));
  v_to timestamptz := coalesce(p_to, pg_catalog.now());
begin
  v_actor := private.require_staff_capability('view_audit_logs');
  if p_source not in ('audit_logs','staff_audit','trust_moderation','payment_audit','dispute_events',
                      'configuration_history','staff_role_history','support_events','operational_events') then
    raise exception 'Unknown audit source' using errcode = '22023';
  end if;
  if v_to < v_from or v_to - v_from > pg_catalog.make_interval(days => 366) then
    raise exception 'Audit range must be within 366 days' using errcode = '22023';
  end if;

  if p_source = 'audit_logs' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select a.created_at at, pg_catalog.jsonb_build_object('id',a.id,'at',a.created_at,'actorId',a.actor_id,
        'action',a.action,'entityType',a.entity_type,'entityId',a.entity_id) item
      from public.audit_logs a
      where a.created_at between v_from and v_to
        and (p_actor_id is null or a.actor_id = p_actor_id)
        and (p_entity_id is null or a.entity_id = p_entity_id)
      order by a.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'staff_audit' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select s.created_at at, pg_catalog.jsonb_build_object('id',s.id,'at',s.created_at,'actorId',s.actor_id,
        'action',s.action,'entityType',s.entity_type,'entityId',s.entity_id,'capabilityKey',s.capability_key,
        'breakGlass',s.break_glass,'reason',s.reason) item
      from private.staff_audit_events s
      where s.created_at between v_from and v_to
        and (p_actor_id is null or s.actor_id = p_actor_id)
        and (p_entity_id is null or s.entity_id = p_entity_id)
      order by s.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'trust_moderation' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select t.created_at at, pg_catalog.jsonb_build_object('id',t.id,'at',t.created_at,'actorId',t.actor_id,
        'action',t.action,'entityType',t.entity_type,'entityId',t.entity_id,'reason',t.reason) item
      from private.trust_moderation_audit t
      where t.created_at between v_from and v_to
        and (p_actor_id is null or t.actor_id = p_actor_id)
        and (p_entity_id is null or t.entity_id = p_entity_id)
      order by t.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'payment_audit' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select p.created_at at, pg_catalog.jsonb_build_object('id',p.id,'at',p.created_at,'actorId',p.actor_id,
        'action',p.event_type,'entityType','payment','entityId',coalesce(p.payment_id,p.withdrawal_id,p.refund_id),
        'actorKind',p.actor_kind) item
      from private.payment_audit_events p
      where p.created_at between v_from and v_to
        and (p_actor_id is null or p.actor_id = p_actor_id)
        and (p_entity_id is null or p.payment_id = p_entity_id or p.withdrawal_id = p_entity_id
             or p.refund_id = p_entity_id or p.booking_id = p_entity_id)
      order by p.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'dispute_events' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select d.created_at at, pg_catalog.jsonb_build_object('id',d.id,'at',d.created_at,'actorId',d.actor_id,
        'action',d.event_type,'entityType','dispute','entityId',d.dispute_id,'actorClass',d.actor_class,
        'state',d.state) item
      from public.dispute_events d
      where d.created_at between v_from and v_to
        and (p_actor_id is null or d.actor_id = p_actor_id)
        and (p_entity_id is null or d.dispute_id = p_entity_id or d.booking_id = p_entity_id)
      order by d.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'configuration_history' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select c.created_at at, pg_catalog.jsonb_build_object('id',c.id,'at',c.created_at,'actorId',c.created_by,
        'action','configuration_'||c.status,'entityType','configuration','entityId',c.id,
        'domainKey',c.domain_key,'environment',c.environment,'version',c.version,
        'approvedBy',c.approved_by) item
      from private.staff_configuration_versions c
      where c.created_at between v_from and v_to
        and (p_actor_id is null or c.created_by = p_actor_id or c.approved_by = p_actor_id)
        and (p_entity_id is null or c.id = p_entity_id)
      order by c.created_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'staff_role_history' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select g.granted_at at, pg_catalog.jsonb_build_object('id',g.id,'at',g.granted_at,'actorId',g.granted_by,
        'action', case when g.revoked_at is null then 'staff_role_active' else 'staff_role_revoked' end,
        'entityType','staff_role_grant','entityId',g.id,'roleKey',g.role_key,'subjectId',g.user_id,
        'revokedAt',g.revoked_at) item
      from public.staff_role_grants g
      where g.granted_at between v_from and v_to
        and (p_actor_id is null or g.granted_by = p_actor_id or g.user_id = p_actor_id)
        and (p_entity_id is null or g.id = p_entity_id)
      order by g.granted_at desc limit v_limit offset v_offset) rows;
  elsif p_source = 'support_events' then
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select e.created_at at, pg_catalog.jsonb_build_object('id',e.id,'at',e.created_at,'actorId',e.actor_id,
        'action',e.action,'entityType','support_case','entityId',e.ticket_id,'actorRole',e.actor_role) item
      from public.support_ticket_events e
      where e.created_at between v_from and v_to
        and (p_actor_id is null or e.actor_id = p_actor_id)
        and (p_entity_id is null or e.ticket_id = p_entity_id)
      order by e.created_at desc limit v_limit offset v_offset) rows;
  else
    select coalesce(pg_catalog.jsonb_agg(item order by at desc), '[]'::jsonb) into v_rows from (
      select e.created_at at, pg_catalog.jsonb_build_object('id',e.id,'at',e.created_at,'actorId',e.actor_id,
        'action',e.action,'entityType','operational_assignment','entityId',e.assignment_id,
        'fromStatus',e.from_status,'toStatus',e.to_status) item
      from public.operational_assignment_events e
      where e.created_at between v_from and v_to
        and (p_actor_id is null or e.actor_id = p_actor_id)
        and (p_entity_id is null or e.assignment_id = p_entity_id)
      order by e.created_at desc limit v_limit offset v_offset) rows;
  end if;

  perform private.staff_log_access(v_actor, 'audit_explorer', 'view_audit_logs',
    p_source, pg_catalog.jsonb_array_length(coalesce(v_rows,'[]'::jsonb)));
  return pg_catalog.jsonb_build_object('source', p_source, 'from', v_from, 'to', v_to,
    'rows', coalesce(v_rows,'[]'::jsonb));
end;
$function$;
