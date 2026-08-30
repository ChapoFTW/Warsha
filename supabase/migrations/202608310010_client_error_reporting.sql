-- Warsha had no way to learn that a client had broken.
--
-- There is no error boundary on either surface, no unhandled-rejection handler,
-- and no path by which a client can report a failure. An uncaught render error
-- is a blank screen, and the first anybody hears of it is a customer saying the
-- app "stopped working". Every operational event Warsha records today is
-- recorded by the server, about itself.
--
-- This is the receiving end: one function a client may call to say that
-- something failed, landing in `private.operational_log_events` beside every
-- other operational event, so a client failure is visible in the same place as
-- a server one rather than in a second system nobody opens.
--
-- ---------------------------------------------------------------------------
-- Why there is no error message here
--
-- The first version of this took a message and truncated it to 500 characters.
-- `private.operational_payload_safe` rejected the whole payload, and
-- `record_operational_event` replaced it with `{"redacted": true}` -- because
-- that function refuses any key named `message`, `body`, `note`, `content`,
-- `document` and a dozen others, along with any value that looks like a JWT, an
-- email address or an Egyptian phone number.
--
-- That is not an obstacle to work around. An operations log is read by staff,
-- and a client error message is unbounded text from a customer's device: it
-- routinely contains the URL they were on, the record they were opening, and
-- whatever a library decided to interpolate. Renaming the field to slip past
-- the filter would defeat a privacy control on purpose.
--
-- So this records the error's CLASS and its LOCATION and nothing else.
-- "TypeError in DiscoverPage on web, fatal" identifies a defect precisely and
-- carries nothing about the person who met it. A message and a stack are what a
-- vendor crash SDK is for, under its own retention and access rules, and
-- adopting one is a decision with a dashboard and a data-processing agreement
-- attached -- not something to smuggle in through a log table.

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('client_error_report', 'Client error reporting', 'account', 30, 300, true,
   'wps018_limiter',
   'A broken screen retries. Thirty reports in five minutes is enough to see a '
   'fault and few enough that a render loop cannot fill the log.')
on conflict (policy_key) do update
  set max_events = excluded.max_events,
      window_seconds = excluded.window_seconds,
      enabled = excluded.enabled,
      notes = excluded.notes;

create or replace function public.report_client_error(
  p_surface text,
  p_name text,
  p_component text default null,
  p_fatal boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text;
  v_component text;
begin
  if p_surface not in ('web', 'native', 'admin') then
    raise exception 'Unknown surface' using errcode = '22023';
  end if;

  -- Per account. Only `authenticated` may execute this, so there is always one.
  perform private.enforce_rate_limit('client_error_report', v_user::text);

  -- An error class and a component name, both narrow. Anything that is not a
  -- plausible identifier is discarded rather than stored, because the one thing
  -- this must never become is a channel for free text.
  v_name := pg_catalog.left(
    pg_catalog.regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9_.-]', '', 'g'), 60);
  v_component := pg_catalog.left(
    pg_catalog.regexp_replace(coalesce(p_component, ''), '[^A-Za-z0-9_./-]', '', 'g'), 60);

  perform private.record_operational_event(
    'client',
    case when p_fatal then 'client_error_fatal' else 'client_error' end,
    case when p_fatal then 'error' else 'warning' end,
    pg_catalog.jsonb_build_object(
      'surface', p_surface,
      'errorName', case when v_name = '' then 'Error' else v_name end,
      'component', case when v_component = '' then 'unknown' else v_component end,
      'signedIn', v_user is not null
    ),
    -- `operational_log_actor_kind_check` allows customer, worker, staff and
    -- system. A signed-out browser is none of the first three.
    case when v_user is null then 'system' else 'customer' end
  );
end;
$$;

-- Authenticated only, deliberately.
--
-- The first version granted this to `anon` as well, reasoning that a sign-in
-- screen which throws is exactly the one nobody can report from.
-- `client-role-authority.test.sql` refused it: Warsha asserts that exactly nine
-- functions are anon-executable and names them, and all nine are reads. This
-- is a write.
--
-- That guard is right and the reasoning behind it wins. An anonymous write
-- endpoint is a new abuse surface on a surface deliberately kept read-only, and
-- its rate-limit bucket would have to be shared across every anonymous caller,
-- so one client in a render loop would silence reporting for everybody. The
-- cost of the alternative is bounded: failures before sign-in are not reported
-- from the device, and are visible instead in the auth logs and in whatever
-- crash SDK is adopted later.
revoke all on function public.report_client_error(text, text, text, boolean) from public, anon;
grant execute on function public.report_client_error(text, text, text, boolean)
  to authenticated;

comment on function public.report_client_error(text, text, text, boolean) is
  'Lets a client report that it failed. Records the error class, the component '
  'and the surface only -- no message, no stack, no identity beyond the '
  'session -- because this lands in an operations log that staff read.';
