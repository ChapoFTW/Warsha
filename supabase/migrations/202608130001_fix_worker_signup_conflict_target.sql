-- Worker sign-up creates its provider profile inside the auth.users insert
-- transaction. provider_profiles.user_id is protected by the partial unique
-- index provider_profiles_user_id_unique, whose predicate is
-- `user_id is not null`. PostgreSQL can only infer that index for ON CONFLICT
-- when the conflict target carries the same predicate.
--
-- This replaces only the trigger function definition. It changes no rows,
-- constraints, policies, ownership, or grants.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role text := case
    when new.raw_user_meta_data->>'account_role' = 'provider' then 'provider'
    else 'customer' end;
  contact_phone text := coalesce(
    new.phone,
    nullif(pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'contact_phone', '')), ''));
begin
  if contact_phone is not null and contact_phone !~ '^\+20(10|11|12|15)[0-9]{8}$' then
    contact_phone := null;
  end if;

  insert into public.profiles
    (id, display_name, phone, preferred_language, terms_accepted_at, privacy_accepted_at)
  values (
    new.id,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data->>'display_name'), ''),
      pg_catalog.split_part(coalesce(new.email, new.phone, 'Warsha user'), '@', 1)),
    contact_phone,
    case when new.raw_user_meta_data->>'preferred_language' = 'ar' then 'ar' else 'en' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz,
    (new.raw_user_meta_data->>'privacy_accepted_at')::timestamptz);

  insert into public.customer_profiles(id) values (new.id);
  insert into public.user_roles(user_id, role) values (new.id, 'customer');

  if selected_role = 'provider' then
    insert into public.user_roles(user_id, role) values (new.id, 'provider')
      on conflict do nothing;
    insert into public.provider_profiles
      (user_id, display_name, profession_key, is_published)
    values (
      new.id,
      coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data->>'display_name'), ''),
               'Warsha provider'),
      'professional', false)
    on conflict (user_id) where user_id is not null do nothing;
  end if;

  insert into public.notification_preferences(user_id) values (new.id);
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'Carries registration contact data into the profile and bootstraps the selected role without phone auth.';
