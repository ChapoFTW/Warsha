-- Workers authenticate with a phone number and password in the product, while
-- Supabase Auth continues to use its email/password credential provider. The
-- email used for that provider is an opaque, server-generated credential key;
-- it is not contact information and never leaves the trusted auth boundary.

-- ---------------------------------------------------------------------------
-- 1. Private phone -> auth credential mapping
-- ---------------------------------------------------------------------------

create table if not exists private.worker_auth_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique,
  credential_id uuid not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  constraint worker_auth_identities_phone_check
    check (phone ~ '^\+20(10|11|12|15)[0-9]{8}$')
);

comment on table private.worker_auth_identities is
  'Trusted worker sign-in mapping. The client supplies a phone number; only the worker-auth Edge Function may resolve it to an opaque email/password Auth credential.';

revoke all on private.worker_auth_identities from public, anon, authenticated, service_role;

create table if not exists private.worker_auth_registrations (
  credential_id uuid primary key,
  phone text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint worker_auth_registrations_phone_check
    check (phone ~ '^\+20(10|11|12|15)[0-9]{8}$'),
  constraint worker_auth_registrations_expiry_check
    check (expires_at > created_at)
);

comment on table private.worker_auth_registrations is
  'Short-lived service-created proof that a worker Auth insert was initiated by the trusted broker. The auth.users trigger consumes it atomically.';

revoke all on private.worker_auth_registrations from public, anon, authenticated, service_role;

create or replace function private.worker_auth_email(p_credential_id uuid)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'worker.' || pg_catalog.replace(p_credential_id::text, '-', '')
    || '@auth.warsha.invalid'
$$;

comment on function private.worker_auth_email(uuid) is
  'Derives the reserved, non-contact Supabase Auth email from a server-generated worker credential UUID.';

revoke all on function private.worker_auth_email(uuid) from public, anon, authenticated, service_role;

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('worker_auth_register', 'Worker account registration', 'account', 5, 3600, true,
   'wps018_limiter',
   'The Edge auth broker checks worker phone availability through a service-role-only RPC. The limiter stores only a salted-by-policy SHA-256 subject hash.'),
  ('worker_auth_sign_in', 'Worker phone and password sign-in', 'account', 10, 300, true,
   'wps018_limiter',
   'The Edge auth broker resolves a phone to its opaque credential through a service-role-only RPC. GoTrue also rate-limits the resulting password attempt.')
on conflict (policy_key) do update set
  surface = excluded.surface,
  scope = excluded.scope,
  max_events = excluded.max_events,
  window_seconds = excluded.window_seconds,
  enabled = excluded.enabled,
  enforced_by = excluded.enforced_by,
  notes = excluded.notes,
  updated_at = pg_catalog.now();

create or replace function public.prepare_worker_auth_registration(
  p_phone text,
  p_credential_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
begin
  if v_phone !~ '^\+20(10|11|12|15)[0-9]{8}$' then
    return false;
  end if;
  if p_credential_id is null then return false; end if;

  perform private.enforce_rate_limit('worker_auth_register', v_phone);

  delete from private.worker_auth_registrations r
  where r.expires_at <= pg_catalog.now();

  if exists (
    select 1 from private.worker_auth_identities i where i.phone = v_phone)
    or exists (select 1 from public.profiles p where p.phone = v_phone)
    or exists (select 1 from private.worker_auth_registrations r where r.phone = v_phone)
  then
    return false;
  end if;

  insert into private.worker_auth_registrations(credential_id, phone, expires_at)
  values (p_credential_id, v_phone, pg_catalog.now() + interval '10 minutes');
  return true;
exception when unique_violation then
  return false;
end;
$$;

comment on function public.prepare_worker_auth_registration(text,uuid) is
  'Service-role-only worker registration preflight. It reserves a UUID credential for ten minutes but never returns an Auth identifier.';

revoke all on function public.prepare_worker_auth_registration(text,uuid) from public, anon, authenticated;
grant execute on function public.prepare_worker_auth_registration(text,uuid) to service_role;

create or replace function public.cancel_worker_auth_registration(p_credential_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.worker_auth_registrations r
  where r.credential_id = p_credential_id
$$;

comment on function public.cancel_worker_auth_registration(uuid) is
  'Service-role-only cleanup for a broker reservation when GoTrue rejects the corresponding user creation.';

revoke all on function public.cancel_worker_auth_registration(uuid) from public, anon, authenticated;
grant execute on function public.cancel_worker_auth_registration(uuid) to service_role;

create or replace function public.resolve_worker_auth_identity(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_credential_id uuid;
begin
  if v_phone !~ '^\+20(10|11|12|15)[0-9]{8}$' then
    return null;
  end if;

  perform private.enforce_rate_limit('worker_auth_sign_in', v_phone);

  select i.credential_id into v_credential_id
  from private.worker_auth_identities i
  where i.phone = v_phone;

  return private.worker_auth_email(v_credential_id);
end;
$$;

comment on function public.resolve_worker_auth_identity(text) is
  'Service-role-only phone-to-credential resolver for the worker-auth Edge Function. Clients and signed-in accounts have no EXECUTE privilege.';

revoke all on function public.resolve_worker_auth_identity(text) from public, anon, authenticated;
grant execute on function public.resolve_worker_auth_identity(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Auth trigger: trust the broker, not display text or client metadata
-- ---------------------------------------------------------------------------

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
  trusted_worker_registration boolean := false;
  worker_credential_id uuid;
begin
  if contact_phone is not null and contact_phone !~ '^\+20(10|11|12|15)[0-9]{8}$' then
    contact_phone := null;
  end if;

  -- GoTrue applies custom app_metadata after this insert trigger. The trust
  -- proof therefore cannot live there: the service-role broker first writes a
  -- short-lived private reservation, then passes its UUID in user metadata.
  -- A public Auth caller may copy the metadata shape but cannot create the
  -- matching private row.
  if selected_role = 'provider' then
    if contact_phone is null
      or new.phone is not null
      or new.phone_confirmed_at is not null
    then
      raise exception 'Invalid trusted worker identity' using errcode = '22023';
    end if;

    if coalesce(new.raw_user_meta_data->>'worker_identity_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      raise exception 'Worker registration requires the trusted auth service'
        using errcode = '42501';
    end if;

    worker_credential_id := (new.raw_user_meta_data->>'worker_identity_id')::uuid;
    select exists (
      select 1 from private.worker_auth_registrations r
      where r.credential_id = worker_credential_id
        and r.phone = contact_phone
        and r.expires_at > pg_catalog.now()
      for update)
    into trusted_worker_registration;

    if not trusted_worker_registration then
      raise exception 'Worker registration requires the trusted auth service'
        using errcode = '42501';
    end if;

    if pg_catalog.lower(coalesce(new.email, ''))
       <> private.worker_auth_email(worker_credential_id) then
      raise exception 'Invalid trusted worker credential' using errcode = '22023';
    end if;
  end if;

  insert into public.profiles
    (id, display_name, phone, preferred_language, terms_accepted_at, privacy_accepted_at)
  values (
    new.id,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data->>'display_name'), ''),
      case when trusted_worker_registration then 'Warsha worker'
           else pg_catalog.split_part(coalesce(new.email, new.phone, 'Warsha user'), '@', 1)
      end),
    contact_phone,
    case when new.raw_user_meta_data->>'preferred_language' = 'ar' then 'ar' else 'en' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz,
    (new.raw_user_meta_data->>'privacy_accepted_at')::timestamptz);

  insert into public.customer_profiles(id) values (new.id);
  insert into public.user_roles(user_id, role) values (new.id, 'customer');

  if selected_role = 'provider' then
    insert into private.worker_auth_identities(user_id, phone, credential_id)
    values (new.id, contact_phone, worker_credential_id);
    delete from private.worker_auth_registrations r
    where r.credential_id = worker_credential_id;

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

  -- External email and SMS delivery are disabled for synthetic workers. The
  -- email is a password-provider key, never a communications preference.
  insert into public.notification_preferences
    (user_id, email_enabled, sms_enabled)
  values (new.id, not trusted_worker_registration, false);
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'Bootstraps customer accounts directly and trusted synthetic worker accounts through a private phone mapping; never enables phone auth or SMS.';

-- ---------------------------------------------------------------------------
-- 3. Synthetic email is not contact information
-- ---------------------------------------------------------------------------

create or replace function private.account_contact_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from private.worker_auth_identities i where i.user_id = u.id)
      then null
    else u.email
  end
  from auth.users u
  where u.id = p_user_id
$$;

comment on function private.account_contact_email(uuid) is
  'Returns a real contact email only. The synthetic worker password-provider identity is deliberately null.';

revoke all on function private.account_contact_email(uuid) from public, anon, authenticated, service_role;

create or replace function private.worker_activation_gates(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider public.provider_profiles;
  v_onboarding public.account_onboarding;
  v_auth record;
  v_identity private.provider_verification_identities;
  v_verification public.provider_verifications;
  v_record public.worker_criminal_record_submissions;
  v_trust text;
begin
  if p_user_id is null then return '{}'::jsonb; end if;

  select * into v_onboarding from public.account_onboarding o where o.user_id = p_user_id;
  select * into v_provider from public.provider_profiles p
   where p.user_id = p_user_id and p.deleted_at is null;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at,
         u.banned_until, u.deleted_at,
         exists (select 1 from private.worker_auth_identities i where i.user_id = u.id)
           as synthetic_identity
    into v_auth from auth.users u where u.id = p_user_id;
  select * into v_identity from private.provider_verification_identities i
   where i.provider_id = v_provider.id;
  select * into v_verification from public.provider_verifications v
   where v.provider_id = v_provider.id;
  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;
  select t.trust_level into v_trust
  from public.trust_account_state t where t.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'authenticated_account', v_auth.deleted_at is null,
    'phone_number_provided', private.account_contact_phone(p_user_id) is not null,
    -- A synthetic address is confirmed internally only so the password
    -- provider can issue a session. It is excluded from the contact-email gate
    -- rather than being represented as a verified communication method.
    'verified_email_if_present',
      coalesce(v_auth.synthetic_identity, false)
      or v_auth.email is null or v_auth.email_confirmed_at is not null,
    'worker_role_selected', coalesce(v_onboarding.intended_role = 'worker', false),
    'legal_name_complete',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_identity.legal_name, ''))) between 2 and 120,
    'profile_photo', v_provider.avatar_url is not null,
    'biography',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_provider.about, ''))) between 20 and 500,
    'services_configured', exists (
      select 1 from public.provider_services ps
      where ps.provider_id = v_provider.id and ps.is_active),
    'service_area_configured', exists (
      select 1 from public.provider_service_areas a
      where a.provider_id = v_provider.id
        and a.radius_km between 1 and 250
        and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0),
    'current_address_provided', exists (
      select 1 from public.addresses ad
      where ad.customer_id = p_user_id and ad.deleted_at is null
        and ad.pin_confirmed_at is not null),
    'national_id_front_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front'),
    'national_id_back_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back'),
    'national_id_approved', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front' and d.status = 'approved')
      and exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back' and d.status = 'approved'),
    'identity_fields_confirmed', v_identity.confirmed_at is not null,
    'criminal_record_uploaded', v_record.id is not null,
    'criminal_record_approved', coalesce(v_record.status in ('clear', 'approved'), false),
    'worker_agreement_accepted', v_onboarding.worker_agreement_accepted_at is not null,
    'document_processing_accepted', v_onboarding.document_processing_accepted_at is not null,
    'identity_verification_approved', coalesce(v_verification.status = 'approved', false),
    'not_banned', v_auth.banned_until is null or v_auth.banned_until <= pg_catalog.now(),
    'no_blocking_trust_action',
      coalesce(v_trust, 'good_standing') not in ('suspended', 'banned', 'under_investigation')
      and not exists (
        select 1 from public.trust_account_state t
        where t.user_id = p_user_id and (t.marketplace_removed or t.profile_hidden)),
    'provider_status_allowed', coalesce(v_provider.onboarding_status = 'approved', false),
    'not_deactivated', exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id and pr.deactivated_at is null and pr.deleted_at is null),
    'no_deletion_pending', not exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = p_user_id
        and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'))
  );
end;
$$;

comment on function private.worker_activation_gates(uuid) is
  'Worker activation gates contact phone presence while explicitly excluding synthetic Auth email from contact verification.';

create or replace function public.get_staff_customer_overview(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_caps text[]; v_profile public.profiles%rowtype; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_customer_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if 'view_contact_details' = any(v_caps) then
    v_contact := pg_catalog.jsonb_build_object(
      'phone', v_profile.phone,
      'email', private.account_contact_email(p_user_id));
  end if;
  perform private.staff_log_access(v_actor, 'customer_overview', 'view_safe_customer_profile',
    'account:'||p_user_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'userId', v_profile.id,
    'displayName', v_profile.display_name,
    'preferredLanguage', v_profile.preferred_language,
    'accountStatus', case when v_profile.deleted_at is not null then 'deleted' else 'active' end,
    'createdAt', v_profile.created_at,
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = p_user_id),'good_standing'),
    'restrictions', coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'marketplaceRemoved', nullif(s.marketplace_removed,false),
        'communicationRestricted', nullif(s.communication_restricted,false),
        'reviewRestricted', nullif(s.review_restricted,false),
        'paymentHold', nullif(s.payment_hold,false)))
      from public.trust_account_state s where s.user_id = p_user_id), '{}'::jsonb),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'cancelled'),
      'active', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id
                 and b.status not in ('completed','cancelled','rejected','refunded'))),
    'disputesOpened', (select pg_catalog.count(*)::integer from public.disputes d where d.opened_by = p_user_id),
    'reportsFiled', (select pg_catalog.count(*)::integer from public.trust_reports r where r.reporter_id = p_user_id),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = p_user_id),
    'supportCases', (select pg_catalog.count(*)::integer from public.support_tickets t where t.requester_id = p_user_id),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Help copy and privacy inventory
-- ---------------------------------------------------------------------------

update public.help_article_translations t
set summary = 'Customers use email and password. Workers use phone and password.',
    body = 'Customers sign in with their email address and password.'
      || pg_catalog.chr(10) || pg_catalog.chr(10)
      || 'Workers sign in with the phone number and password they used at registration. '
      || 'No email address or SMS code is required.'
      || pg_catalog.chr(10) || pg_catalog.chr(10)
      || 'Customer password reset links are sent to the customer email address. '
      || 'A worker phone number is contact information only.'
from public.help_articles a
where a.id = t.article_id and a.slug = 'signing-in' and t.locale = 'en';

update public.help_article_translations t
set summary = 'العميل بيدخل بالإيميل والباسورد، والفني برقم التليفون والباسورد.',
    body = 'العميل بيدخل بالإيميل والباسورد بتوعه.'
      || pg_catalog.chr(10) || pg_catalog.chr(10)
      || 'الفني بيدخل برقم التليفون والباسورد اللي سجل بيهم. '
      || 'مش محتاج إيميل أو كود رسالة.'
      || pg_catalog.chr(10) || pg_catalog.chr(10)
      || 'رابط إعادة باسورد العميل بيتبعت لإيميل العميل. رقم تليفون الفني بيانات تواصل بس.'
from public.help_articles a
where a.id = t.article_id and a.slug = 'signing-in' and t.locale = 'ar';

update public.help_article_translations t
set body = pg_catalog.replace(t.body,
  'Register with your email address and a password, and give us a phone number '
    || 'so customers can reach you on the day. Confirm your email address to '
    || 'finish. No code is sent to your phone.',
  'Register with your full name, phone number and password. You do not need an '
    || 'email address, and Warsha sends no email confirmation or SMS code. Use '
    || 'the same phone number and password when you sign in.')
from public.help_articles a
where a.id = t.article_id and a.slug = 'getting-started-worker' and t.locale = 'en';

update public.help_article_translations t
set body = pg_catalog.replace(t.body,
  'سجّل بالإيميل والباسورد، واكتب رقم تليفونك عشان العميل يوصلك يوم الشغل. '
    || 'أكد إيميلك عشان تخلص. مفيش كود بيتبعت على تليفونك.',
  'سجّل باسمك الكامل ورقم تليفونك والباسورد. مش محتاج إيميل، ومفيش رسالة '
    || 'تأكيد أو كود SMS. ادخل بعد كده بنفس رقم التليفون والباسورد.')
from public.help_articles a
where a.id = t.article_id and a.slug = 'getting-started-worker' and t.locale = 'ar';

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('worker_auth_identities', 'private', 'worker_auth_identities', 'table', 'account_private',
   'Map a worker contact phone to the opaque Supabase email/password credential used by the trusted authentication broker.',
   'WPS-023/WPS-024 worker authentication correction', 'Account deletion.',
   'delete', false, null,
   'No client or staff role can read this table. The credential UUID is server-generated, the derived .invalid email is never stored here, and the phone remains unverified contact information.'),
  ('worker_auth_registrations', 'private', 'worker_auth_registrations', 'table', 'account_private',
   'Hold a short-lived service-created proof while GoTrue inserts a broker-requested worker account.',
   'WPS-023/WPS-024 worker authentication correction', 'Ten-minute expiry or completion.',
   'delete', false, null,
   'The auth trigger consumes successful reservations. The broker cancels failed attempts, and every preflight prunes expired rows. No client or staff role has table access.')
on conflict (entry_key) do update set
  purpose = excluded.purpose,
  authority = excluded.authority,
  retention_trigger = excluded.retention_trigger,
  deletion_treatment = excluded.deletion_treatment,
  export_included = excluded.export_included,
  staff_capability = excluded.staff_capability,
  notes = excluded.notes;
