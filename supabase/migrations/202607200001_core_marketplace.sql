create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 2 and 100), avatar_url text, phone text,
  preferred_language text not null default 'en' check(preferred_language in ('en','ar')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('customer','provider','support','admin')), created_at timestamptz not null default now(),
  primary key(user_id,role)
);
create table public.customer_profiles (id uuid primary key references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.service_categories (
  id text primary key check(id ~ '^[a-z0-9-]+$'), translation_key text not null unique, description_key text not null,
  icon_name text not null, sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.services (
  id uuid primary key default gen_random_uuid(), category_id text not null references public.service_categories(id), name text not null,
  description text, pricing_type text not null check(pricing_type in ('fixed','starting','inspection','hourly','quote')),
  price_egp numeric(12,2) not null check(price_egp>=0), duration_label text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.provider_profiles (
  id uuid primary key references public.profiles(id) on delete cascade, primary_category_id text references public.service_categories(id),
  profession_key text not null, about text not null default '', cover_image_url text, experience_years integer not null default 0 check(experience_years>=0),
  rating_average numeric(2,1) not null default 0 check(rating_average between 0 and 5), review_count integer not null default 0 check(review_count>=0),
  completed_jobs integer not null default 0 check(completed_jobs>=0), starting_price_egp numeric(12,2) check(starting_price_egp>=0),
  response_time_label text, location_label text, service_radius_km numeric(6,2) check(service_radius_km>=0), languages text[] not null default '{}', skills text[] not null default '{}',
  is_verified boolean not null default false, is_available boolean not null default false, is_published boolean not null default false,
  cancellation_policy text, guarantee_text text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.provider_services (
  provider_id uuid not null references public.provider_profiles(id) on delete cascade, service_id uuid not null references public.services(id) on delete cascade,
  custom_price_egp numeric(12,2) check(custom_price_egp>=0), is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(provider_id,service_id)
);
create table public.provider_availability (id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.provider_profiles(id) on delete cascade,weekday smallint check(weekday between 0 and 6),available_date date,start_time time not null,end_time time not null,check(end_time>start_time),check((weekday is null)<>(available_date is null)),created_at timestamptz not null default now());
create table public.provider_service_areas (id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.provider_profiles(id) on delete cascade,governorate text not null,district text,latitude double precision,longitude double precision,radius_km numeric(6,2) check(radius_km>0),created_at timestamptz not null default now());
create table public.addresses (id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customer_profiles(id) on delete cascade,label text not null,address_line text not null,governorate text not null,district text,latitude double precision,longitude double precision,is_default boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz);
create table public.provider_portfolio (id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.provider_profiles(id) on delete cascade,image_path text not null,caption text,sort_order integer not null default 0,created_at timestamptz not null default now());
create table public.provider_certifications (id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.provider_profiles(id) on delete cascade,title text not null,issuer text,document_path text,is_public boolean not null default false,created_at timestamptz not null default now());
create table public.provider_verification_documents (id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.provider_profiles(id) on delete cascade,document_type text not null,storage_path text not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_at timestamptz not null default now());

create table public.bookings (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customer_profiles(id), provider_id uuid not null references public.provider_profiles(id), service_id uuid not null references public.services(id),
  status text not null default 'confirmed' check(status in ('draft','pending_provider_approval','accepted','rejected','rescheduling_requested','confirmed','provider_on_the_way','provider_arrived','job_started','awaiting_quote_approval','work_in_progress','awaiting_customer_confirmation','completed','cancelled','disputed','refunded','no_show')),
  service_name_snapshot text not null, pricing_type text not null check(pricing_type in ('fixed','starting','inspection','hourly','quote')), estimated_price_egp numeric(12,2) not null check(estimated_price_egp>=0), final_price_egp numeric(12,2) check(final_price_egp>=0),
  issue_description text not null check(length(issue_description)>=8), scheduled_date date not null, scheduled_time time not null, address_id uuid references public.addresses(id), address_snapshot text not null,
  idempotency_key text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), cancelled_at timestamptz, deleted_at timestamptz
);
create table public.booking_status_history (id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete cascade,status text not null,actor_id uuid references public.profiles(id),metadata jsonb not null default '{}',created_at timestamptz not null default now());
create table public.booking_attachments (id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete cascade,uploader_id uuid not null references public.profiles(id),storage_path text not null,mime_type text,created_at timestamptz not null default now());

create index services_category_idx on public.services(category_id) where deleted_at is null;
create index providers_category_published_idx on public.provider_profiles(primary_category_id,is_published) where deleted_at is null;
create index bookings_customer_created_idx on public.bookings(customer_id,created_at desc) where deleted_at is null;
create index bookings_provider_schedule_idx on public.bookings(provider_id,scheduled_date,scheduled_time) where status not in ('cancelled','rejected');
create index booking_history_booking_idx on public.booking_status_history(booking_id,created_at);

create or replace function private.record_booking_status() returns trigger language plpgsql security definer set search_path='' as $$ begin if tg_op='INSERT' or old.status is distinct from new.status then insert into public.booking_status_history(booking_id,status,actor_id) values(new.id,new.status,(select auth.uid())); end if; return new; end $$;
create trigger booking_status_audit after insert or update of status on public.bookings for each row execute function private.record_booking_status();
create or replace function public.cancel_own_booking(booking_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin update public.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where id=booking_id and customer_id=(select auth.uid()) and status in ('pending_provider_approval','accepted','confirmed'); if not found then raise exception 'Booking cannot be cancelled'; end if; end $$;
revoke all on function public.cancel_own_booking(uuid) from public; grant execute on function public.cancel_own_booking(uuid) to authenticated;

do $$ declare t text; begin foreach t in array array['profiles','customer_profiles','service_categories','services','provider_profiles','provider_services','addresses','bookings'] loop execute format('create trigger %I_updated_at before update on public.%I for each row execute function private.set_updated_at()',t,t); end loop; end $$;
