-- French product-language preference
--
-- Legal documents remain separately versioned in English and Arabic. This
-- migration only expands the non-authoritative presentation preference stored
-- on profiles; it does not publish or fabricate a French legal corpus.

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;
alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'ar', 'fr'));

create or replace function private.sync_new_user_preferred_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_language text := new.raw_user_meta_data ->> 'preferred_language';
begin
  if v_language in ('en', 'ar', 'fr') then
    update public.profiles
    set preferred_language = v_language
    where id = new.id
      and preferred_language is distinct from v_language;
  end if;
  return new;
end;
$$;

comment on function private.sync_new_user_preferred_language() is
  'Persists the supported product-language preference after the canonical new-user trigger creates the profile.';
revoke all on function private.sync_new_user_preferred_language()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created_z_sync_language on auth.users;
create trigger on_auth_user_created_z_sync_language
after insert on auth.users
for each row execute function private.sync_new_user_preferred_language();
