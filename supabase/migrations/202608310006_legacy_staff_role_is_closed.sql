-- There are two definitions of "staff", and only one of them is governed.
--
-- `private.is_staff` answers true for either of:
--
--   1. a row in `public.user_roles` with role 'admin' or 'support'  -- legacy
--   2. an active grant in `public.staff_role_grants` carrying the
--      `legacy_domain_staff_actions` capability                     -- governed
--
-- Thirty-six RLS policies are gated on that function. The staff console is not:
-- it requires the governed grant, and answers "your account is authenticated
-- but has no active staff role" to anybody holding only the legacy row.
--
-- So a legacy row is staff at the API and not staff in the console. It has no
-- expiry, no `granted_by`, no reason, no revocation record, and it does not
-- appear anywhere a Security Administrator would look. WPS-017 kept the legacy
-- branch working on purpose and `operations-admin-platform.test.sql` asserts it
-- still does, so the branch is not removed here -- removing it could lock out
-- an administrator this repository cannot see.
--
-- What is removed is the ability to make a NEW one.
--
-- Nothing in the product ever created one. `handle_new_user` writes 'customer'
-- and 'provider', `ensure_customer_profile` writes 'customer',
-- `activate_provider_role` writes 'provider', and `anon` and `authenticated`
-- hold SELECT on the table and nothing else. A staff row could only ever arrive
-- by hand, and by hand is precisely the path that leaves no trail.
--
-- After this, staff is granted one way: `staff_role_grants`, which records who
-- granted it, why, when it expires, and when it was revoked -- and which
-- `prevent_staff_role_grant_mutation` already makes immutable.

create or replace function private.refuse_new_legacy_staff_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('admin', 'support') then
    raise exception
      'Staff access is granted through public.staff_role_grants, not user_roles'
      using errcode = '42501',
            hint = 'Insert a staff_role_grants row with a role_key, a reason and '
                   'an idempotency key so the grant can be audited and revoked.';
  end if;
  return new;
end;
$$;

comment on function private.refuse_new_legacy_staff_role() is
  'Closes the ungoverned path to staff access. Existing legacy rows keep '
  'working so no administrator is locked out; new ones must go through '
  'staff_role_grants, which records who, why, and until when.';

drop trigger if exists refuse_new_legacy_staff_role on public.user_roles;
create trigger refuse_new_legacy_staff_role
  before insert or update on public.user_roles
  for each row execute function private.refuse_new_legacy_staff_role();
