-- Two doors that were wider than the job needed.
--
-- ## 1. Seconding a subprocessor decision cost you the criminal records
--
-- `public.staff_approve_dual_control` authorises the approver with
-- `private.require_staff_capability(v_row.capability_key)` — the approver must
-- hold THE SAME capability as the request. For an external-provider activation
-- that capability is `manage_subprocessors`, and until now exactly two roles
-- carried it:
--
--   security_administrator   18 capabilities, critical tier
--   super_administrator      48 capabilities, critical tier
--
-- So the cheapest way to give somebody the power to second a Maps activation
-- was to also give them `review_criminal_records`, `manage_staff_roles`,
-- `manage_legal_holds`, `publish_legal_version`, `manage_kill_switches` and
-- `manage_feature_flags`. A second pair of eyes on a subprocessor decision
-- should not come with a worker's criminal record attached to it.
--
-- This adds one role that carries exactly what seconding the decision needs:
--
--   manage_subprocessors      the capability the approval gate actually checks
--   review_legal_governance   so the approval is informed rather than blind.
--                             Its own description reads "No personal data."
--   view_operations_home      so the holder can reach the surface at all
--
-- Nothing else. No personal data, no criminal records, no staff administration,
-- no kill switches, no flags, no legal publication. It cannot approve its own
-- request either, because `staff_approve_dual_control` refuses
-- `v_uid = v_row.requested_by` regardless of role.
--
-- ## 2. Bootstrap was a permanent unguarded door
--
-- `private.bootstrap_staff_role` existed to solve one real problem: the first
-- administrator cannot be granted by an administrator, because there isn't one.
-- It solved it by having no guard at all. That made it a permanent mechanism for
-- adding arbitrary staff identities outside governed role administration, for
-- the entire life of the platform.
--
-- The circularity it exists to break is genuinely two identities deep, not one.
-- Granting a role through the governed path consumes dual control, and dual
-- control needs two distinct identities, so the first TWO have to come from
-- somewhere else. After that the quorum exists and the governed path works.
--
-- So bootstrap is now bounded by exactly that: it establishes the initial
-- quorum and then closes. Once two distinct active staff identities exist it
-- refuses, and names the door to use instead.
--
-- ## The break-glass boundary, stated honestly
--
-- This constrains the FUNCTION. It does not constrain the database owner, and
-- it is not pretending to. Anyone holding owner or superuser credentials can
-- still `insert into public.staff_role_grants` directly, and no trigger here
-- would stop them — the immutability trigger on that table guards UPDATE and
-- DELETE, not INSERT. That is the real break-glass path and it is deliberate:
-- a platform that can lock its own owner out of recovery has traded a rare
-- emergency for a permanent one.
--
-- What changes is that break-glass now looks like break-glass. It requires
-- credentials that ordinary operations never use, it leaves a grant whose
-- `granted_by` is null, and it cannot be reached through any RPC. The
-- application-level door is bounded; the owner-level door is documented rather
-- than disguised.
--
-- ## What this does NOT weaken
--
-- No capability is added to any existing role. No gate is relaxed.
-- `required_approval_count` is untouched, so production still needs two
-- distinct identities for everything that asked for two before.

-- ---------------------------------------------------------------------------
-- 1. The narrow role
-- ---------------------------------------------------------------------------

insert into public.staff_roles(role_key, display_name, description, risk_tier, sort_order)
values (
  'subprocessor_approver',
  'Subprocessor Approver',
  'Seconds subprocessor and external-provider activation decisions. Holds the '
  || 'approval capability and the governance register needed to make that '
  || 'decision informed, and no access to personal data of any kind.',
  'elevated',
  75)
on conflict (role_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  risk_tier    = excluded.risk_tier,
  sort_order   = excluded.sort_order;

insert into public.staff_role_capabilities(role_key, capability_key) values
  ('subprocessor_approver', 'manage_subprocessors'),
  ('subprocessor_approver', 'review_legal_governance'),
  ('subprocessor_approver', 'view_operations_home')
on conflict (role_key, capability_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Bootstrap, bounded to the initial quorum
-- ---------------------------------------------------------------------------

create or replace function private.bootstrap_staff_role(
  p_user_id uuid, p_role_key text, p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_identities integer;
begin
  if p_user_id is null or p_role_key is null then
    raise exception 'A user and a role are required' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_roles r where r.role_key = p_role_key) then
    raise exception 'Unknown staff role' using errcode = '22023';
  end if;

  -- Re-running an existing live grant creates no new authority, so it stays
  -- idempotent even after the door has closed. This is checked BEFORE the
  -- quorum gate on purpose: a caller repeating themselves is not a third
  -- identity, and failing them would make the function unsafe to retry.
  select g.id into v_id
  from public.staff_role_grants g
  where g.user_id = p_user_id
    and g.role_key = p_role_key
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());
  if v_id is not null then
    return v_id;
  end if;

  -- The quorum gate. Distinct IDENTITIES, not grants: one person holding two
  -- roles is one person, and dual control counts people.
  select pg_catalog.count(distinct g.user_id) into v_identities
  from public.staff_role_grants g
  where g.revoked_at is null
    and (g.expires_at is null or g.expires_at > pg_catalog.now());

  if v_identities >= 2 then
    raise exception
      'Bootstrap is closed: % active staff identities already exist. '
      'Use public.staff_grant_role, which is governed.', v_identities
      using errcode = '42501';
  end if;

  insert into public.staff_role_grants(user_id, role_key, granted_by, reason, idempotency_key)
  values (p_user_id, p_role_key, null, pg_catalog.btrim(p_reason),
          'bootstrap:'||p_role_key||':'||p_user_id::text)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  -- The only way to reach here with a null id is a bootstrap grant that was
  -- later revoked. Re-opening it silently would resurrect authority somebody
  -- deliberately withdrew.
  if v_id is null then
    raise exception
      'A previous bootstrap grant for this account and role was revoked. '
      'Use public.staff_grant_role, which is governed.'
      using errcode = '42501';
  end if;
  return v_id;
end;
$$;

comment on function private.bootstrap_staff_role(uuid, text, text) is
  'Establishes the initial dual-control quorum and then closes. Refuses once '
  'two distinct active staff identities exist, because from that point the '
  'governed path public.staff_grant_role can consume dual control. Constrains '
  'the function only: a database owner can still insert a grant directly, which '
  'is the documented break-glass path.';

revoke all on function private.bootstrap_staff_role(uuid,text,text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The successor path already exists, and this migration does not fork it
-- ---------------------------------------------------------------------------
--
-- The refusal above names `public.staff_grant_role`, which has existed since
-- WPS-017 with the signature
--
--     staff_grant_role(uuid, text, text, text, timestamptz default null)
--                      user  role  reason idem  expires
--
-- and already enforces `manage_staff_roles`, the platform assurance level,
-- `requires_reauth` (true for that capability), a reason, an idempotency key, a
-- refusal to grant a role to your own account, and an audit row. That is the
-- governed path, and bootstrap now hands over to it.
--
-- NOTHING IS REDEFINED HERE ON PURPOSE. An earlier draft of this migration
-- added a four-argument overload carrying dual control, which would have left
-- two functions of the same name resolved by argument shape — the exact
-- ambiguity Warsha has already been bitten by once with
-- `submit_my_criminal_record`. One name, one function.
--
-- ## The one property the catalogue asks for and that function does not have
--
-- `manage_staff_roles` is `dual_control = true`, and `staff_grant_role` never
-- calls `private.consume_dual_control`. Today the second identity is supplied
-- by the prohibition on granting to your own account, which
-- `web/app/admin/staff/page.tsx` documents as a deliberate reading: "the second
-- person *is* the prohibition on granting to yourself".
--
-- That is weaker than the catalogue declares. Granting somebody else a role is
-- still one identity acting alone. Closing it means a real approval queue for
-- role grants, and it is NOT closed here, for two reasons worth stating rather
-- than burying:
--
--   1. It would break the admin grant surface, which offers the grant directly
--      and has no request/approve flow for roles the way the providers page
--      does. Shipping the gate without the surface leaves a button that can
--      only fail.
--
--   2. Approving a `manage_staff_roles` request requires `manage_staff_roles`,
--      so it needs TWO holders of that capability. Production currently has
--      one. Turning it on today would make staff onboarding impossible except
--      by break-glass — trading a documented weakness for an undocumented
--      deadlock.
--
-- So this migration bounds bootstrap and points it at the existing governed
-- path, and the dual-control gap in that path is recorded here as an open
-- decision rather than silently half-closed.
