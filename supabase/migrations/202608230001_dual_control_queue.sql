-- DUAL-CONTROL APPROVAL QUEUE
--
-- Dual control was complete except for one thing: nothing could list a pending
-- request. `staff_request_dual_control` creates one, `staff_approve_dual_control`
-- approves one *by id*, and `consume_dual_control` spends it — so the second
-- person could only approve a request whose UUID somebody had handed them out
-- of band. A governance control nobody can find is a governance control nobody
-- uses.
--
-- This adds the missing read surface and nothing else. It grants no new power:
-- a request is visible only to a staff member who already holds the capability
-- the request is against, which is exactly the set of people entitled to
-- approve it. The refusal to self-approve stays where it already is, in the
-- table constraint and in `staff_approve_dual_control`.
--
-- Read-only on purpose, and `stable` accordingly. PostgREST runs a stable
-- function in a read-only transaction, so a queue that logged its own access
-- would be unable to run from the console that displays it.

create or replace function public.staff_dual_control_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_capabilities text[];
  v_rows jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;
  if private.staff_session_revoked() then
    raise exception 'This session was revoked' using errcode = '42501';
  end if;
  if not private.staff_mfa_satisfied() then
    raise exception 'Multi-factor authentication is required' using errcode = '42501';
  end if;

  v_capabilities := private.staff_capability_keys(v_actor);

  select coalesce(pg_catalog.jsonb_agg(row order by row->>'requestedAt' desc), '[]'::jsonb)
  into v_rows
  from (
    select pg_catalog.jsonb_build_object(
      'id', r.id,
      'capabilityKey', r.capability_key,
      'actionKey', r.action_key,
      'subjectRef', r.subject_ref,
      'reason', r.requested_reason,
      'environment', r.environment,
      'requestedAt', r.created_at,
      'requestedByName', requester.display_name,
      -- The requester is named so an approver knows who they are seconding, and
      -- so nobody has to look a staff id up somewhere else to find out.
      'requestedByMe', r.requested_by = v_actor,
      'approvedAt', r.approved_at,
      'approvedByName', approver.display_name,
      'approvedByMe', r.approved_by is not null and r.approved_by = v_actor,
      'approvalNote', r.approval_note,
      'consumedAt', r.consumed_at,
      'expiresAt', r.expires_at,
      'expired', r.expires_at <= pg_catalog.now(),
      -- Advisory only. `staff_approve_dual_control` re-checks every one of these
      -- and refuses regardless of what this said.
      'canApprove', r.requested_by <> v_actor
        and r.approved_by is null
        and r.consumed_at is null
        and r.expires_at > pg_catalog.now()
    ) as row
    from private.staff_dual_control_requests r
    join public.profiles requester on requester.id = r.requested_by
    left join public.profiles approver on approver.id = r.approved_by
    -- Only requests against a capability this staff member already holds. That
    -- is precisely the set they could approve, so the queue reveals nothing
    -- they were not already entitled to act on.
    where r.capability_key = any(v_capabilities)
      and r.consumed_at is null
      and r.expires_at > pg_catalog.now() - pg_catalog.make_interval(days => 7)
  ) queued;

  return pg_catalog.jsonb_build_object(
    'requests', v_rows,
    'generatedAt', pg_catalog.now());
end;
$$;

comment on function public.staff_dual_control_queue() is
  'Read-only list of dual-control requests a staff member is entitled to act on. '
  'Adds no authority: visibility is limited to capabilities already held, and '
  'approval remains governed by staff_approve_dual_control.';

revoke all on function public.staff_dual_control_queue() from public, anon;
grant execute on function public.staff_dual_control_queue() to authenticated;
