-- ACCOUNT LOOKUP FOR STAFF ROLE GRANTS
--
-- `manage_staff_roles` can grant a staff role but had no way to find the person
-- it is granting to. `staff_safe_search` is the general account search and
-- belongs to `safe_search`, which support and review roles hold and
-- `security_administrator` deliberately does not. So the only role that can
-- grant staff roles was the one role that could not identify a candidate, and
-- the form fell back to asking an operator to paste a UUID that no Warsha
-- surface displays.
--
-- Widening `safe_search` to `security_administrator` would have fixed the
-- symptom by handing a governance role a general customer-search facility it
-- has no other reason to hold. This is the narrower answer: a lookup that
-- exists only to answer "is this the right person to make staff?".
--
-- What keeps it narrow:
--   * exact email match only — no partial, no wildcard, no browsing, so it
--     cannot be used to enumerate or scrape accounts;
--   * at most one result;
--   * the email is returned masked, which confirms identity without disclosing
--     an address the operator did not already have;
--   * display name only, which `get_staff_role_directory` already returns to
--     this same capability for every existing grant holder;
--   * no phone, no address, no contact detail, no verification state;
--   * rate limited, and every lookup is written to the access log and the audit
--     trail against the operator.
--
-- It is volatile because it records that access. Verification taught us what a
-- stable function that writes costs; a lookup is a button press, not a page
-- load, so a read-write transaction is correct here.

-- The access log constrains its surfaces, and none of them described this. A
-- grant lookup is deliberately not filed as `safe_search`: an auditor reviewing
-- who searched for whom should be able to tell a governance lookup from a
-- support search. Widening a check constraint leaves every existing row valid.
alter table private.staff_access_log
  drop constraint if exists staff_access_log_surface_check;
alter table private.staff_access_log
  add constraint staff_access_log_surface_check check (surface in (
    'safe_search','customer_overview','worker_overview','audit_explorer',
    'export_request','export_preview','analytics','case_notes','staff_role_grant'));

insert into private.rate_limit_policies(
  policy_key, surface, scope, max_events, window_seconds, enforced_by, notes
) values (
  'staff_grant_lookup', 'Staff role grant account lookup', 'account', 20, 300,
  'wps018_limiter',
  'An exact-email lookup used to identify a staff role candidate. Limited so a '
  || 'privileged account cannot be used to test addresses in bulk.'
) on conflict (policy_key) do nothing;

create or replace function public.staff_lookup_grant_candidate(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_local text;
  v_domain text;
  v_id uuid;
  v_name text;
  v_status text;
  v_roles jsonb;
begin
  -- Capability first. `manage_staff_roles` is high risk and carries
  -- requires_reauth, so a stale session is refused here exactly as it is at the
  -- grant itself.
  v_actor := private.require_staff_capability('manage_staff_roles');

  -- `position(x in y)` is special grammar and cannot be schema-qualified, the
  -- same trap `pg_catalog.extract(... from ...)` sets. strpos is a plain
  -- function and qualifies cleanly.
  if pg_catalog.strpos(v_email, '@') < 2 or pg_catalog.length(v_email) < 6 then
    raise exception 'A complete email address is required' using errcode = '22023';
  end if;
  -- No wildcards, no partial matching. The operator must already know the
  -- address; this confirms which account it is, it does not help them look.
  if v_email ~ '[%_*]' then
    raise exception 'Wildcard lookup is not permitted' using errcode = '22023';
  end if;

  perform private.enforce_rate_limit('staff_grant_lookup', v_actor::text);

  select u.id into v_id
  from auth.users u
  where pg_catalog.lower(u.email) = v_email
  limit 1;

  if v_id is null then
    perform private.staff_log_access(
      v_actor, 'staff_role_grant', 'manage_staff_roles', 'grant_candidate_lookup', 0);
    return pg_catalog.jsonb_build_object('found', false);
  end if;

  select p.display_name into v_name from public.profiles p where p.id = v_id;

  select case
    when exists (select 1 from public.account_deletion_requests d
                 where d.user_id = v_id and d.anonymized_at is not null) then 'closed'
    when exists (select 1 from public.trust_enforcement_actions a
                 where a.subject_user_id = v_id
                   and a.action_type in ('suspension','permanent_ban')
                   and (a.expires_at is null or a.expires_at > pg_catalog.now()))
      then 'restricted'
    else 'good_standing'
  end into v_status;

  -- Current staff roles, so an operator can see they are about to duplicate or
  -- widen an existing grant rather than discovering it afterwards.
  select coalesce(pg_catalog.jsonb_agg(g.role_key order by g.role_key), '[]'::jsonb)
  into v_roles
  from public.staff_role_grants g
  where g.user_id = v_id and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());

  v_local := pg_catalog.split_part(v_email, '@', 1);
  v_domain := pg_catalog.split_part(v_email, '@', 2);

  perform private.staff_log_access(
    v_actor, 'staff_role_grant', 'manage_staff_roles', 'grant_candidate_lookup', 1);
  perform private.record_staff_audit(
    v_actor, 'manage_staff_roles', 'grant_candidate_looked_up',
    'profile', v_id, 'Identifying a staff role candidate',
    pg_catalog.jsonb_build_object('emailDomain', v_domain));

  return pg_catalog.jsonb_build_object(
    'found', true,
    'accountId', v_id,
    'displayName', v_name,
    -- Enough to confirm the right person, not enough to be a new disclosure.
    'emailMasked', pg_catalog.left(v_local, 1)
      || pg_catalog.repeat('•', greatest(pg_catalog.length(v_local) - 1, 1))
      || '@' || v_domain,
    'accountStatus', v_status,
    'staffRoles', v_roles,
    -- The grant itself refuses this; saying so early is kinder than a refusal
    -- after the form is filled in.
    'isSelf', v_id = v_actor);
end;
$$;

comment on function public.staff_lookup_grant_candidate(text) is
  'Exact-email lookup identifying a candidate for a staff role grant. Requires '
  'manage_staff_roles, is rate limited and audited, returns at most one account, '
  'and discloses only a display name, a masked email, account status and current '
  'staff roles.';

revoke all on function public.staff_lookup_grant_candidate(text) from public, anon;
grant execute on function public.staff_lookup_grant_candidate(text) to authenticated;
