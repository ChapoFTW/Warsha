-- Repairs customer profile self-service access without weakening RLS.
--
-- Defects fixed (manual alpha, 2026-08-01):
-- 1. public.profiles carries owner-scoped RLS policies, but anon/authenticated
--    never received table privileges, so the customer profile screen could
--    neither read nor save the account's own display name in Supabase mode.
-- 2. The profiles_public_provider_select policy subqueries
--    public.provider_profiles directly. Clients hold no privilege on that
--    table, so evaluating the policy raised "permission denied for table
--    provider_profiles" on every direct profiles query once privileges exist.
--    The provider lookup now runs inside a SECURITY DEFINER helper, matching
--    the existing private.is_provider_publicly_discoverable pattern.
--
-- Grants stay minimal: SELECT plus a column-limited UPDATE. Row access is
-- still enforced by the unchanged owner policies, and the public-provider
-- read keeps exactly the prior semantics.

create or replace function private.is_public_provider_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    where p.user_id = p_user_id
      and private.is_provider_publicly_discoverable(p.id)
  )
$$;

revoke all on function private.is_public_provider_user(uuid) from public;
grant execute on function private.is_public_provider_user(uuid) to anon, authenticated;

drop policy if exists profiles_public_provider_select on public.profiles;
create policy profiles_public_provider_select on public.profiles
for select to anon, authenticated
using (private.is_public_provider_user(profiles.id));

grant select on public.profiles to anon, authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;

-- The same missing-grant defect blocks the other owner-scoped legacy tables
-- used by the profile and become-a-worker flows. Each already carries the
-- intended RLS policies (addresses_own_all, favourites_own_all,
-- providers_owner_read, providers_public_read); only the table privileges the
-- policies were designed to gate were never granted. Writes to
-- provider_profiles stay RPC-only: no insert/update/delete is granted.
grant select, insert, update, delete on public.addresses to authenticated;
grant select, insert, update, delete on public.favourites to authenticated;
grant select on public.provider_profiles to authenticated;
grant select on public.provider_services to anon, authenticated;
grant select on public.provider_service_areas to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.service_categories to anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
