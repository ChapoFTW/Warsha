create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,display_name,phone,preferred_language) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,new.phone,'Warsha user'),'@',1)),new.phone,case when new.raw_user_meta_data->>'preferred_language'='ar' then 'ar' else 'en' end);insert into public.customer_profiles(id) values(new.id);insert into public.user_roles(user_id,role) values(new.id,'customer');insert into public.notification_preferences(user_id) values(new.id);return new;end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
insert into public.profiles(id,display_name,phone) select id,coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),split_part(coalesce(email,phone,'Warsha user'),'@',1)),phone from auth.users on conflict(id) do nothing;
insert into public.customer_profiles(id) select id from public.profiles on conflict(id) do nothing;
insert into public.user_roles(user_id,role) select id,'customer' from public.profiles on conflict do nothing;
insert into public.notification_preferences(user_id) select id from public.profiles on conflict do nothing;
