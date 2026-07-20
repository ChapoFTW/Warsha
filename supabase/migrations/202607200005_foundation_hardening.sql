alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.addresses add column if not exists local_source_id text;
create unique index if not exists addresses_customer_local_source_unique on public.addresses(customer_id,local_source_id) where local_source_id is not null;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare selected_role text:=case when new.raw_user_meta_data->>'account_role'='provider' then 'provider' else 'customer' end;
begin
  insert into public.profiles(id,display_name,phone,preferred_language,terms_accepted_at,privacy_accepted_at)
  values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,new.phone,'Warsha user'),'@',1)),new.phone,case when new.raw_user_meta_data->>'preferred_language'='ar' then 'ar' else 'en' end,(new.raw_user_meta_data->>'terms_accepted_at')::timestamptz,(new.raw_user_meta_data->>'privacy_accepted_at')::timestamptz);
  insert into public.customer_profiles(id) values(new.id);
  insert into public.user_roles(user_id,role) values(new.id,'customer');
  if selected_role='provider' then
    insert into public.user_roles(user_id,role) values(new.id,'provider') on conflict do nothing;
    insert into public.provider_profiles(id,profession_key,is_published) values(new.id,'professional',false) on conflict do nothing;
  end if;
  insert into public.notification_preferences(user_id) values(new.id);
  return new;
end $$;

insert into storage.buckets(id,name,public) values('profile-images','profile-images',true) on conflict(id) do update set public=excluded.public;
create policy profile_images_public_read on storage.objects for select to anon,authenticated using(bucket_id='profile-images');
create policy profile_images_owner_insert on storage.objects for insert to authenticated with check(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_images_owner_update on storage.objects for update to authenticated using(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

create index if not exists favourites_customer_created_idx on public.favourites(customer_id,created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists reviews_provider_created_idx on public.reviews(provider_id,created_at desc) where deleted_at is null;
create unique index if not exists provider_weekly_availability_unique on public.provider_availability(provider_id,weekday,start_time,end_time) where available_date is null;
create unique index if not exists provider_area_seed_unique on public.provider_service_areas(provider_id,governorate,coalesce(district,''));
