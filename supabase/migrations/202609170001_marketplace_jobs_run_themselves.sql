-- The marketplace's timers run without somebody running them.
--
-- WES-008 made every timed marketplace consequence a durable row in
-- `private.marketplace_jobs` and built the other half for a worker to lease
-- them: `lease_marketplace_jobs` (SKIP LOCKED), `run_marketplace_job`,
-- `complete_marketplace_job`, with retries and backoff. It required "request
-- background jobs independent of a client".
--
-- The worker was never built. No Edge Function, no scheduler, no migration and
-- no script calls `run_marketplace_job`; `expire_marketplace_request` and
-- `expire_selected_confirmation` have no other caller. The suite's "trusted
-- worker leases due jobs" assertion leased them by hand. So wherever the
-- marketplace is on:
--
--   additional_wave      never ran. A request only ever reached its first
--                        wave: `first_wave_size` Professionals, three by
--                        default, however many cover the area.
--   expire_request       never ran. Requests stayed open past `expires_at`,
--                        and so did their invitations and quotes.
--   expire_confirmation  never ran. A selected Professional who never
--                        confirmed left the request waiting indefinitely.
--   rescue / refresh_*   never ran.
--
-- ## What this does
--
-- `private.drain_marketplace_jobs` is the worker: it leases due jobs through
-- the existing lease function and runs each through the existing runner, which
-- already isolates a failing job, records its error and schedules its retry.
-- Nothing about what a job does changes.
--
-- pg_cron calls it every minute. A minute is the granularity: a two-minute
-- confirmation window may close up to a minute late, never early, because
-- every job function re-checks its own deadline against the clock before
-- acting. A lease that outlives its runner is picked up again when it expires.
--
-- The drain does not consult the kill switch. Expiry must still happen while
-- the marketplace is switched off, and the functions that must not run then —
-- a new wave — already refuse through `assert_marketplace_ready`, which
-- becomes the job's recorded error and retry.
--
-- WPS-008 kept processing off "until a trusted worker and monitoring are
-- approved". 202608250004 set `scheduler_enabled`; the worker is this. For
-- monitoring, a job that exhausts its retries is written to the WPS-018
-- operational log as an error, with its kind and error code and nothing else,
-- so a failure that would otherwise sit silently in the queue is visible where
-- operations already look. Whether anything alerts on that log is a separate,
-- unchanged question.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.drain_marketplace_jobs(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.marketplace_jobs;
  v_ids uuid[] := '{}';
  v_leased integer := 0;
  v_succeeded integer := 0;
  v_failed record;
  v_terminal integer := 0;
begin
  for v_job in
    select * from private.lease_marketplace_jobs(
      'drain:' || pg_catalog.txid_current()::text,
      least(greatest(coalesce(p_limit, 50), 1), 100))
  loop
    v_leased := v_leased + 1;
    v_ids := v_ids || v_job.id;
    if private.run_marketplace_job(v_job.id) then
      v_succeeded := v_succeeded + 1;
    end if;
  end loop;

  -- Only jobs this run gave up on, so a failure is reported once, when it
  -- happens, not every minute afterwards. One flat event per job: the
  -- operational log accepts scalar detail only, and the kind, error code and
  -- attempt count are all an operator needs to find it in the queue.
  for v_failed in
    select j.job_kind, j.last_error_code, j.attempt_count
    from private.marketplace_jobs j
    where j.id = any(v_ids) and j.state = 'terminal_failed'
  loop
    v_terminal := v_terminal + 1;
    perform private.record_operational_event(
      'marketplace', 'marketplace.job_terminal_failure', 'error',
      pg_catalog.jsonb_build_object(
        'jobKind', v_failed.job_kind,
        'errorCode', coalesce(v_failed.last_error_code, 'unknown'),
        'attempts', v_failed.attempt_count));
  end loop;

  return pg_catalog.jsonb_build_object(
    'leased', v_leased, 'succeeded', v_succeeded, 'terminalFailures', v_terminal);
end;
$$;

revoke all on function private.drain_marketplace_jobs(integer) from public, anon, authenticated;

-- Named, so re-applying replaces the schedule instead of adding a second one.
select cron.schedule(
  'warsha-marketplace-jobs',
  '* * * * *',
  $$select private.drain_marketplace_jobs(50)$$
);
