-- ===========================================================================
-- WPS-024 — REGISTRATION AUTHENTICATION CORRECTION
-- ===========================================================================
--
-- LOCKED PRODUCT DECISION
--
--   Phone numbers are REQUIRED CONTACT INFORMATION.
--   Phone OTP verification is NOT required to register, as a customer or as a
--   worker. Customers and workers authenticate with EMAIL AND PASSWORD, and
--   email verification remains required.
--   Supabase Phone Auth stays disabled. No SMS provider is required to launch.
--
-- WHAT WAS ACTUALLY WRONG
--
-- Registration could not complete. `activate_provider_role` raised
-- 'Verified phone required' unless `auth.users.phone_confirmed_at` was set, and
-- the only thing that sets it is an SMS one-time code from a provider Warsha
-- has not configured and is not configuring. `private.worker_activation_gates`
-- carried the same requirement as a gate, and `is_provider_publicly_
-- discoverable` carried it a third time.
--
-- So the state of the product before this migration was: no worker could
-- register, no worker could be activated, and no worker could ever appear in
-- search — and each of the three would have been discovered separately, by a
-- person, at a different point in the funnel.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- It does not weaken authentication. Authentication moves from an SMS code
-- nobody can receive to an email and a password, which is the method WPS-001
-- already established for customers and which Supabase enforces email
-- confirmation on. It removes no RLS policy, grants no new privilege, and
-- relaxes no capability check.
--
-- It does not delete the OTP infrastructure. `assertPhoneAuthAvailable`, the
-- phone-change RPC path and the rate-limit policy all remain, unused by
-- registration, ready for verify-phone, change-phone and any future high-risk
-- step-up. Every one of them still FAILS CLOSED while Phone Auth is disabled.
--
-- THE DISTINCTION THIS MIGRATION IS BUILT AROUND
--
-- A phone number ON FILE and a phone number PROVEN are different facts, and the
-- schema now says which one it holds. `phone_number_provided` is a contact
-- detail somebody typed. `auth.users.phone_confirmed_at` remains the only place
-- that means "this person demonstrated they hold this handset", it is still
-- null for everybody, and nothing below pretends otherwise.

-- ---------------------------------------------------------------------------
-- SECTION 1. PHONE AS REQUIRED CONTACT INFORMATION
-- ---------------------------------------------------------------------------
--
-- `public.profiles.phone` was populated from `auth.users.phone`, which only the
-- OTP registration path ever set. An email-and-password registration would have
-- stored no number at all — so the correction has to carry the number the
-- person typed from the sign-up call into the profile.

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
  -- The number the person typed at registration, normalised on the client to
  -- E.164 and re-checked here. `new.phone` stays authoritative when it is set,
  -- because that path means Supabase Auth itself owns the number.
  contact_phone text := coalesce(
    new.phone,
    nullif(pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'contact_phone', '')), ''));
begin
  -- Shape-checked rather than trusted. A malformed number is dropped, not
  -- stored: a contact detail nobody can dial is worse than a blank one,
  -- because a blank one is visibly missing.
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
    on conflict (user_id) do nothing;
  end if;

  insert into public.notification_preferences(user_id) values (new.id);
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'WPS-024 correction. Carries the registration contact number into the profile; phone auth not required.';

/**
 * Uniqueness, preserved rather than introduced.
 *
 * Before the correction a phone number reached `public.profiles` only by way of
 * `auth.users.phone`, which Supabase keeps unique. Moving collection to an
 * ordinary form field would have silently dropped that property, and two
 * accounts sharing a contact number is how a dispatcher rings the wrong worker.
 *
 * Partial, because a null phone is an absent contact detail and any number of
 * accounts may be missing one — a unique index over nulls would allow exactly
 * one such account to exist.
 *
 * This index will FAIL LOUDLY on an environment that already holds duplicate
 * numbers. That is the intended behaviour: the duplicates need a decision from
 * a person, and a migration that quietly tolerated them would hide the problem
 * at the moment it is cheapest to fix.
 */
create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null;

comment on index public.profiles_phone_unique_idx is
  'WPS-024. One account per contact number, preserving what auth.users.phone used to guarantee.';

/**
 * One definition of "this account has a contact number", used by all three
 * places that ask.
 *
 * It reads BOTH stores, and that is not belt-and-braces — the two genuinely
 * diverge. `public.profiles.phone` is written once, by the insert trigger.
 * `auth.users.phone` is what Supabase updates when somebody confirms or changes
 * a number through `updateUser`, and nothing syncs that back. An account that
 * confirmed its number through the very flow WPS-024 keeps would otherwise read
 * as having no number at all.
 *
 * Written as a function rather than repeated inline because it was repeated
 * inline three times before, in three slightly different forms, and that is how
 * a rule ends up being enforced in two places and not the third.
 */
create or replace function private.account_contact_phone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(coalesce(
    (select pr.phone from public.profiles pr where pr.id = p_user_id),
    (select u.phone from auth.users u where u.id = p_user_id),
    '')), '')
$$;

comment on function private.account_contact_phone(uuid) is
  'WPS-024. The contact number on file, from either store. Never evidence of possession.';

revoke all on function private.account_contact_phone(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 2. WORKER ROLE ACTIVATION
-- ---------------------------------------------------------------------------
--
-- The function that raised 'Verified phone required'. It now requires a phone
-- number to be ON FILE, which is the locked decision stated exactly: required
-- contact information, not required verification.
--
-- Everything else is preserved unchanged — the display-name bounds, the
-- idempotent return of an existing provider id, the unique-violation recovery,
-- and the deliberate re-raise of 42501 and 22023 so an authorization failure is
-- never flattened into a generic error.

create or replace function public.activate_provider_role(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid pg_catalog.uuid := (select auth.uid());
  result_id pg_catalog.uuid;
  has_contact_phone boolean;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_display_name)) not between 2 and 100 then
    raise exception 'Invalid provider information' using errcode = '22023';
  end if;

  select p.id into result_id
  from public.provider_profiles p
  where p.user_id = uid;
  if result_id is not null then
    return result_id;
  end if;

  -- A contact number, not a proven one. The message says which, because
  -- 'Verified phone required' sent people looking for a code that was never
  -- sent, from a provider that was never configured.
  has_contact_phone := private.account_contact_phone(uid) is not null;
  if not coalesce(has_contact_phone, false) then
    raise exception 'Contact phone number required' using errcode = '22023';
  end if;

  perform public.ensure_customer_profile();
  insert into public.user_roles(user_id, role)
  values(uid, 'provider')
  on conflict(user_id, role) do nothing;

  insert into public.provider_profiles(
    user_id, display_name, profession_key, onboarding_status,
    is_published, is_verified
  ) values (
    uid, pg_catalog.btrim(p_display_name), 'professional', 'draft', false, false
  )
  returning id into result_id;
  return result_id;
exception
  when unique_violation then
    select p.id into result_id from public.provider_profiles p where p.user_id = uid;
    if result_id is not null then return result_id; end if;
    raise;
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then
    raise exception 'Unable to activate provider role' using errcode = 'P0001';
end;
$$;

comment on function public.activate_provider_role(text) is
  'WPS-024 correction. Requires a contact phone number on file, never a verified one.';

-- ---------------------------------------------------------------------------
-- SECTION 3. THE ACTIVATION GATE
-- ---------------------------------------------------------------------------
--
-- `verified_phone` becomes `phone_number_provided`. The key is renamed rather
-- than redefined in place, because a gate called `verified_phone` that passes
-- for an unverified number is a lie that every future reader would believe.
--
-- Reproduced in full with two entries changed. A gate that is missing evaluates
-- to false, so a partial redefinition here would silently deactivate every
-- worker — which is why the whole function is restated rather than patched.

create or replace function private.worker_activation_gates(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 set search_path = ''
AS $function$
declare
  v_provider public.provider_profiles;
  v_onboarding public.account_onboarding;
  v_auth record;
  v_identity private.provider_verification_identities;
  v_verification public.provider_verifications;
  v_record public.worker_criminal_record_submissions;
  v_trust text;
begin
  if p_user_id is null then
    return '{}'::jsonb;
  end if;

  select * into v_onboarding from public.account_onboarding o where o.user_id = p_user_id;
  select * into v_provider from public.provider_profiles p
   where p.user_id = p_user_id and p.deleted_at is null;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at, u.banned_until, u.deleted_at
    into v_auth from auth.users u where u.id = p_user_id;
  select * into v_identity from private.provider_verification_identities i
   where i.provider_id = v_provider.id;
  select * into v_verification from public.provider_verifications v
   where v.provider_id = v_provider.id;
  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;

  -- WPS-016 owns trust state. Read it, never restate it: the levels below are
  -- that authority's, and a worker who is restricted there is not activated
  -- here regardless of how their onboarding looks.
  select t.trust_level into v_trust
  from public.trust_account_state t where t.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'authenticated_account', v_auth.deleted_at is null,
    -- WPS-024 correction. A phone number is REQUIRED CONTACT INFORMATION and
    -- is gated as such. It is not evidence of anything: nobody has proved they
    -- hold the handset, and this gate must never be read as if they had.
    'phone_number_provided', private.account_contact_phone(p_user_id) is not null,
    -- WPS-024 correction. Every account now registers with an email address,
    -- and email verification remains required. This gate previously returned a
    -- hardcoded true while its comment described a check it did not perform —
    -- the kind of claim that gets believed. It now performs it.
    'verified_email_if_present',
      v_auth.email is null or v_auth.email_confirmed_at is not null,
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
    'not_banned',
      v_auth.banned_until is null or v_auth.banned_until <= pg_catalog.now(),
    'no_blocking_trust_action',
      coalesce(v_trust, 'good_standing') not in ('suspended', 'banned', 'under_investigation')
      and not exists (
        select 1 from public.trust_account_state t
        where t.user_id = p_user_id and (t.marketplace_removed or t.profile_hidden)),
    'provider_status_allowed',
      coalesce(v_provider.onboarding_status = 'approved', false),
    'not_deactivated', exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id and pr.deactivated_at is null and pr.deleted_at is null),
    'no_deletion_pending', not exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = p_user_id and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'))
  );
end;
$function$;

comment on function private.worker_activation_gates(uuid) is
  'WPS-024 correction. Gates a phone number on file, not a verified handset.';

-- ---------------------------------------------------------------------------
-- SECTION 4. PUBLIC DISCOVERY
-- ---------------------------------------------------------------------------
--
-- The third copy of the same requirement, and the one that would have been
-- found last. WPS-010 requires a confirmed phone before a worker appears in
-- search. Left alone, every worker would have completed onboarding, passed
-- staff review, been approved — and never appeared, with nothing in the
-- verification record to explain why.
--
-- The other eleven conditions are unchanged. A worker still has to be verified,
-- published, approved, unbanned, un-deleted, hold an unexpired approved
-- verification, and carry a name, a biography, a photograph and a live service.

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
      -- WPS-024 correction. A reachable contact number, not a proven one.
      and private.account_contact_phone(p.user_id) is not null
      and p.is_verified and p.is_published
      and p.onboarding_status = 'approved' and p.deleted_at is null
      and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > pg_catalog.now())
      and pg_catalog.length(pg_catalog.btrim(p.display_name)) between 2 and 100
      and pg_catalog.length(pg_catalog.btrim(p.about)) between 20 and 500
      and p.avatar_url is not null
      and exists (
        select 1 from public.provider_services ps
        where ps.provider_id = p.id and ps.is_active)
  )
$$;

comment on function private.is_provider_publicly_discoverable(uuid) is
  'WPS-024 correction. Discovery requires a contact number on file, not a verified handset.';

-- ---------------------------------------------------------------------------
-- SECTION 5. THE OTP INFRASTRUCTURE IS KEPT, AND KEPT OFF
-- ---------------------------------------------------------------------------
--
-- Nothing here is deleted. The rate-limit policy that governs OTP requests
-- stays exactly as WPS-018 wrote it, so the day somebody turns Phone Auth on
-- for an explicit verify-phone or change-phone flow, the limit is already in
-- force rather than being remembered afterwards.
--
-- Its note is corrected, because it described a registration flow that no
-- longer exists and would have been read as evidence that one did.

update private.rate_limit_policies
set notes = 'Five requests per account per fifteen minutes. NOT used during registration: '
         || 'WPS-024 removed the phone-verification dependency from customer and worker '
         || 'sign-up. This governs the explicit verify-phone and change-phone flows, which '
         || 'remain unavailable while Supabase Phone Auth is disabled.'
where policy_key = 'auth_otp_request';

-- ---------------------------------------------------------------------------
-- SECTION 6. THE HELP CENTRE STOPS DESCRIBING A FLOW THAT NO LONGER EXISTS
-- ---------------------------------------------------------------------------
--
-- WPS-019 published articles telling workers to register with a phone number
-- and wait for an SMS code. Leaving them would be worse than leaving the code
-- path itself: somebody who cannot find the SMS screen would read the help
-- centre, be told it exists, and conclude the fault is theirs.
--
-- Targeted replacements rather than rewritten bodies — everything these
-- articles say about profiles, verification and availability is still true, and
-- restating it would risk losing it.

update public.help_article_translations t
set summary = 'Everyone signs in with an email address and a password.',
    body = 'Whether you book work or do work, you sign in with your email '
        || 'address and your password.' || pg_catalog.chr(10) || pg_catalog.chr(10)
        || 'Your phone number is contact information, so a customer or a worker '
        || 'can reach you about a job. It is not how you sign in, and you are '
        || 'not asked for a code to register.' || pg_catalog.chr(10) || pg_catalog.chr(10)
        || 'Forgotten your password? Use the reset link on the sign-in screen '
        || 'and follow the email.'
from public.help_articles a
where a.id = t.article_id and a.slug = 'signing-in' and t.locale = 'en';

update public.help_article_translations t
set summary = 'الكل بيدخل بالإيميل والباسورد.',
    body = 'سواء بتحجز شغل أو بتشتغل، بتدخل بالإيميل والباسورد بتاعك.'
        || pg_catalog.chr(10) || pg_catalog.chr(10)
        || 'رقم تليفونك بيانات تواصل، عشان العميل أو الصنايعي يوصلك بخصوص الشغل. '
        || 'مش طريقة الدخول، ومحدش هيطلب منك كود عشان تسجل.'
        || pg_catalog.chr(10) || pg_catalog.chr(10)
        || 'نسيت الباسورد؟ استخدم رابط إعادة التعيين في شاشة الدخول واتبع الإيميل.'
from public.help_articles a
where a.id = t.article_id and a.slug = 'signing-in' and t.locale = 'ar';

update public.help_article_translations t
set body = pg_catalog.replace(t.body,
  'Register with your phone number. You will get a code by SMS to confirm it is you.',
  'Register with your email address and a password, and give us a phone number '
  || 'so customers can reach you on the day. Confirm your email address to '
  || 'finish. No code is sent to your phone.')
from public.help_articles a
where a.id = t.article_id and a.slug = 'getting-started-worker' and t.locale = 'en';

update public.help_article_translations t
set body = pg_catalog.replace(t.body,
  'سجّل برقم تليفونك. هيوصلك كود بالرسايل عشان نتأكد إنه انت.',
  'سجّل بالإيميل والباسورد، واكتب رقم تليفونك عشان العميل يوصلك يوم الشغل. '
  || 'أكد إيميلك عشان تخلص. مفيش كود بيتبعت على تليفونك.')
from public.help_articles a
where a.id = t.article_id and a.slug = 'getting-started-worker' and t.locale = 'ar';

-- The decision is recorded where a reviewer looks for the reasoning behind a
-- deliberately absent capability, rather than only in a migration comment.
insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('profiles_contact_phone', 'public', 'profiles.phone', 'column_family', 'account_private',
   'Hold the contact number a person supplied at registration.',
   'WPS-024', 'Account deletion.',
   'delete', true, 'view_contact_details',
   'REQUIRED contact information, NOT verified. Nobody has demonstrated they hold the handset. '
   || 'auth.users.phone_confirmed_at remains the only field that would mean that, and it is '
   || 'null for every account because Supabase Phone Auth is disabled.')
on conflict (entry_key) do update set notes = excluded.notes;
