-- WPS-025 manual-acceptance correction pass 2.
--
-- `provider_profiles.about` already permits an empty value, but the latest
-- hosted activation and discovery predicates still made a 20-character
-- biography mandatory. The product now treats profession selection as the
-- worker's required public identity and biography as optional. This forward
-- migration changes only those two completeness predicates. It does not alter
-- tables, rows, constraints, RLS, grants, verification, staff review or worker
-- capability authorities.

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
    'professions_configured',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_provider.profession_key, ''))) between 2 and 100,
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
  'Worker activation requires profession identity; the public biography is optional. All security, verification and staff-review gates remain unchanged.';

create or replace function private.is_provider_publicly_discoverable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    join auth.users u on u.id = p.user_id
    join public.provider_verifications v on v.provider_id = p.id
    where p.id = p_provider_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and private.account_contact_phone(p.user_id) is not null
      and p.is_verified and p.is_published
      and p.onboarding_status = 'approved' and p.deleted_at is null
      and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > pg_catalog.now())
      and pg_catalog.length(pg_catalog.btrim(p.display_name)) between 2 and 100
      and pg_catalog.length(pg_catalog.btrim(p.profession_key)) between 2 and 100
      and p.avatar_url is not null
      and exists (
        select 1 from public.provider_services ps
        where ps.provider_id = p.id and ps.is_active)
  )
$$;

comment on function private.is_provider_publicly_discoverable(uuid) is
  'Discoverability requires the existing profession identity while allowing an empty optional biography; verification and publication controls are unchanged.';
