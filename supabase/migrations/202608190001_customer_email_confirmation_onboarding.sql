-- Customer email confirmation handoff
--
-- Customer signup returns no authenticated session while Confirm email is on,
-- so the client cannot call select_my_account_role until after the email link
-- has been verified. Record the already-chosen customer onboarding intent at
-- that authoritative transition. This grants no new capability: every account
-- already has the customer role, and worker activation ignores this row.

create or replace function private.handle_customer_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;

  -- Trusted worker credentials are confirmed internally at creation and never
  -- use customer email delivery. Keep the boundary explicit even if a future
  -- Auth change produces a later confirmation update.
  if new.raw_user_meta_data->>'account_role' = 'provider'
     or exists (
       select 1
       from private.worker_auth_identities i
       where i.user_id = new.id)
  then
    return new;
  end if;

  insert into public.account_onboarding
    (user_id, intended_role, worker_state)
  values
    (new.id, 'customer', null)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function private.handle_customer_email_confirmation() is
  'Idempotently starts customer onboarding only after GoTrue confirms a real customer email; excludes trusted worker identities.';

revoke all on function private.handle_customer_email_confirmation()
  from public, anon, authenticated, service_role;

drop trigger if exists on_customer_email_confirmed on auth.users;
create trigger on_customer_email_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function private.handle_customer_email_confirmation();
