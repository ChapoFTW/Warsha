-- FIX: `all_time` reporting period could never run
--
-- `business_reporting_period` built its all-time lower bound with
-- `pg_catalog.least(...)`. `least` and `greatest` are parser constructs, not
-- functions in `pg_catalog`, so with `search_path=''` that call raises
-- `function pg_catalog.least(date, date, date) does not exist` — the same trap
-- as `pg_catalog.extract(... from ...)` and `pg_catalog.position(... in ...)`.
--
-- It shipped because every deterministic test exercises a bounded preset and
-- none selected All time, so the one branch that used it was never executed.
-- An operator choosing "All time" in analytics would have hit it. The function
-- is otherwise unchanged.

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
      select least(
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
