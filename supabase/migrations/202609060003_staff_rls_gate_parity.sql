-- The RLS staff gates enforce what the RPC staff gate enforces.
--
-- ## The asymmetry
--
-- `private.require_staff_capability` — the gate every staff RPC calls — checks
-- four things in order: the admin platform is enabled, the session has not been
-- revoked, the required second factor was actually granted by the identity
-- provider, and the caller holds the capability.
--
-- `private.staff_has_capability` and `private.is_staff` — the gates every staff
-- RLS POLICY calls — checked two of the four. A staff member whose session had
-- been revoked, or who held only `aal1` where the platform requires `aal2`, was
-- refused by every RPC and admitted by every policy.
--
-- That matters because policies are not a lesser surface. PostgREST will select
-- straight from a table, and Storage signs a URL for any row whose SELECT policy
-- passes. Migration 202609060002 closed one instance of this shape — staff
-- reading a national ID directly out of `storage.objects` rather than through
-- the audited RPC — and it closed it by routing the policy through
-- `staff_has_capability`. That fix is only worth as much as this function, so
-- this function now enforces the same contract.
--
-- ## What "revoked" has to mean
--
-- Revoking a staff session, or removing a role, is supposed to take effect
-- immediately rather than whenever the access token happens to expire. It did,
-- for RPCs. For direct reads it did not, and the window was as long as the
-- token's remaining life. That is the difference between a revocation and a
-- request to please stop.
--
-- ## Why this changes no behaviour today
--
-- `private.staff_platform_configuration.mfa_required` is false in this
-- environment, so `staff_mfa_satisfied()` returns true without consulting an
-- assurance level, exactly as before. The MFA half of this change is inert until
-- the platform requires a second factor, and correct on the day it does — which
-- is the point of putting it in now rather than discovering the gap then.
--
-- The revocation half is live immediately, and is the intended behaviour change.
--
-- Both functions keep their signatures, volatility, security context and pinned
-- empty `search_path`. They return false rather than raising, because an RLS
-- predicate that raises turns a filtered read into a failed request.

create or replace function private.staff_has_capability(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.staff_platform_ready() then return false; end if;
  -- The two gates the RPC path has always applied and this one did not.
  if private.staff_session_revoked() then return false; end if;
  if not private.staff_mfa_satisfied() then return false; end if;
  if not exists (select 1 from public.staff_capabilities c where c.capability_key = p_capability) then
    return false;
  end if;
  return p_capability = any(private.staff_capability_keys(v_uid));
end;
$$;

create or replace function private.is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  -- Checked before the legacy branch, not after it, so the older
  -- `public.user_roles` path cannot be used to skip them. That table is
  -- SELECT-only to `authenticated` and carries no client write grant, so it
  -- cannot be self-assigned — but a gate that only covers the new path is not a
  -- gate.
  if private.staff_session_revoked() then return false; end if;
  if not private.staff_mfa_satisfied() then return false; end if;
  -- Unchanged legacy result, evaluated first so the hot RLS path stays cheap.
  if exists (select 1 from public.user_roles r
             where r.user_id = v_uid and r.role in ('support','admin')) then
    return true;
  end if;
  if not exists (select 1 from public.staff_role_grants g
                 where g.user_id = v_uid and g.revoked_at is null) then
    return false;
  end if;
  return 'legacy_domain_staff_actions' = any(private.staff_capability_keys(v_uid));
end;
$$;
