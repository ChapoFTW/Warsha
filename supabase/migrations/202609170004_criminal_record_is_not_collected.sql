-- Warsha does not collect criminal records.
--
-- The owner's decision stands and was reaffirmed on 2026-09-17: do not require
-- a criminal-record certificate until legal consultation has actually
-- happened. No legal review has taken place, and nothing here represents one.
--
-- The implementation had drifted from that decision. WPS-023 and WPS-024 made
-- the certificate part of every Professional's path:
--
--   * `criminal_record_uploaded` and `criminal_record_approved` were activation
--     gates, so no Professional could be activated without both;
--   * `criminal_record_uploaded` was forced into the provisional gates, so
--     nobody could even start provisionally;
--   * provisional activation was attempted only when a certificate was
--     submitted, so a Professional who did everything else waited forever;
--   * the staff path to approval ran through `criminal_record_required`;
--   * the storage policy and `submit_my_criminal_record` accepted uploads
--     from any Professional at any time.
--
-- ## What this does
--
-- One policy fact, `private.worker_vetting_policy.criminal_record_required`,
-- false, and every one of the places above reads it:
--
--   * the two gates exist only while it is true;
--   * provisional activation is attempted when identity is submitted, which is
--     now the last step a Professional takes;
--   * staff may approve from identity review, with the ordinary vetting
--     capability, and cannot open a certificate review;
--   * the upload RPC and the storage insert policy refuse new material;
--   * the onboarding state tells both clients, so neither shows the step.
--
-- ## What this deliberately keeps
--
-- The capability. The submissions table, the private bucket, the review RPCs,
-- the read and delete policies and every existing submission are untouched.
-- A Professional can still read or delete a record they already sent, and a
-- reviewer holding `review_criminal_records` can still read one. Turning the
-- policy back on is a migration with its own recorded decision, not a switch
-- anyone can flip.
--
-- ## Existing Professionals
--
-- A Professional left in `identity_submitted` or `criminal_record_required`
-- was waiting only for the certificate. Each is offered provisional activation
-- through the existing function, which still enforces every other provisional
-- gate and the worker-activation kill switch, and still records the transition
-- and tells the Professional. The count is reported. Nobody whose other gates
-- are unmet is moved.

-- ---------------------------------------------------------------------------
-- 1. The policy fact
-- ---------------------------------------------------------------------------
create table private.worker_vetting_policy (
  singleton boolean primary key default true check (singleton),
  criminal_record_required boolean not null default false,
  decision_reference text not null
    check (pg_catalog.length(pg_catalog.btrim(decision_reference)) between 10 and 500),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table private.worker_vetting_policy enable row level security;
revoke all on private.worker_vetting_policy from public, anon, authenticated;

insert into private.worker_vetting_policy (singleton, criminal_record_required, decision_reference)
values (true, false,
  'Owner decision, reaffirmed 2026-09-17: do not require a criminal-record certificate until legal consultation has actually happened.');

create or replace function private.criminal_record_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.criminal_record_required from private.worker_vetting_policy p where p.singleton),
    false)
$$;

-- Read by the storage insert policy, which runs as the uploading user. It
-- returns one policy boolean and nothing about anybody.
revoke all on function private.criminal_record_required() from public, anon;
grant execute on function private.criminal_record_required() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Gates that exist only while criminal records are collected
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.worker_activation_gates(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
    -- The Professional's work location, not any address they happen to have.
    -- "Any confirmed address" let a Customer who became a Professional pass
    -- this step on the strength of their home pin, so they were never asked
    -- where they work and matching never learned it. A stale anchor still
    -- counts as provided: it was given, and staleness is matching's concern.
    'current_address_provided', exists (
      select 1 from private.worker_matching_locations l
      where l.provider_id = v_provider.id
        and l.verification_state <> 'rejected'),
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
  )
  -- Only while Warsha collects criminal records. A gate that cannot be
  -- satisfied, for a requirement that does not exist, is a closed door.
  || case when private.criminal_record_required() then pg_catalog.jsonb_build_object(
    'criminal_record_uploaded', v_record.id is not null,
    'criminal_record_approved', coalesce(v_record.status in ('clear', 'approved'), false))
  else '{}'::jsonb end;
end;
$function$;

CREATE OR REPLACE FUNCTION private.worker_provisional_gates(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (
    select pg_catalog.jsonb_object_agg(g.key, g.value)
    from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
    where g.key not in ('national_id_approved', 'criminal_record_approved',
                        'identity_verification_approved', 'provider_status_allowed')
  ) || pg_catalog.jsonb_build_object(
    'legal_agreements_accepted', private.legal_gate_satisfied(p_user_id)
  )
  || case when private.criminal_record_required() then pg_catalog.jsonb_build_object(
    'criminal_record_uploaded',
      coalesce((private.worker_activation_gates(p_user_id) ->> 'criminal_record_uploaded')::boolean, false))
  else '{}'::jsonb end
$function$;

-- ---------------------------------------------------------------------------
-- 3. The journey ends at identity; staff approve from identity review
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.worker_transition_allowed(p_from text, p_to text, p_actor_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_actor_kind = 'worker' then
      (p_from = 'account_created' and p_to = 'onboarding_incomplete')
      or (p_from in ('onboarding_incomplete', 'correction_required') and p_to = 'identity_required')
      or (p_from in ('account_created', 'onboarding_incomplete', 'identity_required',
                     'correction_required')
          and p_to = 'identity_submitted')
      -- WPS-024: `identity_submitted` added. The worker no longer waits for a
      -- reviewer to unlock the certificate step.
      or (p_from in ('identity_submitted', 'criminal_record_required', 'correction_required')
          and p_to = 'criminal_record_submitted')
      or (p_from = 'rejected' and p_to = 'appeal_pending')
    when p_actor_kind = 'staff' then
      (p_from = 'identity_submitted' and p_to in ('identity_under_review', 'correction_required', 'manual_review'))
      -- 202609170004: approval from identity review, used while criminal
      -- records are not collected. `staff_worker_vetting_decision` refuses it
      -- while they are.
      or (p_from = 'identity_under_review' and p_to in ('criminal_record_required', 'correction_required', 'manual_review', 'rejected', 'approved'))
      or (p_from = 'criminal_record_submitted' and p_to in ('criminal_record_under_review', 'correction_required', 'manual_review'))
      or (p_from = 'criminal_record_under_review' and p_to in ('approved', 'correction_required', 'manual_review', 'rejected'))
      -- WPS-024: review of a worker who is already working. Every outcome
      -- WPS-023 allowed from a submission state is allowed from here, and
      -- `suspended` is added because the whole point of post-activation review
      -- is being able to stop someone who is already taking jobs.
      or (p_from = 'provisionally_active' and p_to in (
            'identity_under_review', 'criminal_record_under_review',
            'correction_required', 'manual_review', 'approved', 'rejected', 'suspended'))
      or (p_from = 'manual_review' and p_to in ('approved', 'correction_required', 'rejected'))
      or (p_from = 'appeal_pending' and p_to in ('approved', 'rejected', 'correction_required', 'manual_review'))
      or (p_from = 'approved' and p_to in ('active', 'suspended'))
      or (p_from = 'active' and p_to = 'suspended')
      or (p_from = 'suspended' and p_to in ('active', 'rejected'))
    when p_actor_kind = 'system' then
      -- Account creation, as before.
      (p_from is null and p_to = 'account_created')
      -- WPS-024: provisional activation. Reachable only from a state where the
      -- worker has actually submitted something, and only to
      -- `provisionally_active` — never to a state that expresses a judgement.
      -- 202609170004: `criminal_record_required` too, for a Professional who
      -- was waiting only for a certificate Warsha no longer asks for.
      or (p_from in ('criminal_record_submitted', 'identity_submitted', 'correction_required',
                     'criminal_record_required')
          and p_to = 'provisionally_active')
    else false
  end
$function$;

CREATE OR REPLACE FUNCTION private.worker_try_provisional_activation(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state text;
  v_blocked integer;
begin
  select o.worker_state into v_state
  from public.account_onboarding o where o.user_id = p_user_id;

  if v_state is null
     or v_state not in ('criminal_record_submitted', 'identity_submitted', 'correction_required',
                        'criminal_record_required') then
    return false;
  end if;

  -- The kill switch WPS-023 registered for worker activation governs this too.
  -- A stop control that only stops the slower of the two activation paths is
  -- not a stop control.
  if exists (
    select 1 from private.staff_kill_switches k
    where k.switch_key = 'worker_activation' and k.active
  ) then
    return false;
  end if;

  select pg_catalog.count(*)::integer into v_blocked
  from pg_catalog.jsonb_each(private.worker_provisional_gates(p_user_id)) g
  where g.value = 'false'::jsonb;

  if v_blocked > 0 then
    return false;
  end if;

  perform private.worker_transition(
    p_user_id, 'provisionally_active', null, 'system',
    'provisional_activation',
    'Your application is complete and you can start taking work. Our team will review it.');

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_my_identity_for_review()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_gates jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  v_gates := private.worker_activation_gates(v_user);
  if not ((v_gates ->> 'national_id_front_uploaded')::boolean
          and (v_gates ->> 'national_id_back_uploaded')::boolean) then
    raise exception 'Both sides of the national identity document are required'
      using errcode = '22023';
  end if;
  if not (v_gates ->> 'identity_fields_confirmed')::boolean then
    raise exception 'Identity details must be confirmed before review' using errcode = '22023';
  end if;

  perform private.worker_transition(
    v_user, 'identity_submitted', v_user, 'worker',
    'identity_submitted', 'Your identity documents were received and are waiting for review.');

  -- Identity is the last step a Professional takes while criminal records are
  -- not collected, so this is where WPS-024's "the worker does not wait for a
  -- person" now applies. Every provisional gate is still enforced.
  if not private.criminal_record_required() then
    perform private.worker_try_provisional_activation(v_user);
  end if;

  return public.get_my_onboarding_state();
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_worker_vetting_decision(p_user_id uuid, p_decision text, p_reason_code text, p_safe_reason text, p_private_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_capability text;
  v_target text;
  v_provider uuid;
begin
  -- Capability follows the weight of the decision, not the shape of the call.
  -- Approving somebody and rejecting them are not the same authority.
  v_capability := case p_decision
    when 'start_identity_review' then 'review_identity_verification'
    when 'start_certificate_review' then 'review_criminal_records'
    when 'request_correction' then 'review_worker_vetting'
    when 'escalate_manual_review' then 'review_worker_vetting'
    -- A criminal-record reviewer only while criminal records are collected.
    when 'approve' then case when private.criminal_record_required()
      then 'review_criminal_records' else 'review_worker_vetting' end
    when 'activate' then 'activate_worker'
    when 'reject' then 'reject_worker_application'
    when 'suspend' then 'reject_worker_application'
    when 'reinstate' then 'activate_worker'
    else null
  end;
  if v_capability is null then
    raise exception 'Unknown vetting decision' using errcode = '22023';
  end if;
  if p_decision = 'start_certificate_review' and not private.criminal_record_required() then
    raise exception 'Criminal records are not currently collected' using errcode = '55000';
  end if;
  if p_decision = 'approve' and private.criminal_record_required() and exists (
    select 1 from public.account_onboarding o
    where o.user_id = p_user_id and o.worker_state = 'identity_under_review'
  ) then
    raise exception 'A criminal record must be reviewed before approval' using errcode = '22023';
  end if;

  v_actor := private.require_staff_capability(v_capability);

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_safe_reason, ''))) not between 3 and 400 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  -- An adverse decision must carry evidence. A rejection with an empty note is
  -- a rejection nobody can review later.
  if p_decision in ('reject', 'suspend')
     and pg_catalog.length(pg_catalog.btrim(coalesce(p_private_note, ''))) < 10 then
    raise exception 'An adverse decision requires recorded evidence' using errcode = '22023';
  end if;

  v_target := case p_decision
    when 'start_identity_review' then 'identity_under_review'
    when 'start_certificate_review' then 'criminal_record_under_review'
    when 'request_correction' then 'correction_required'
    when 'escalate_manual_review' then 'manual_review'
    when 'approve' then 'approved'
    when 'activate' then 'active'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'reinstate' then 'active'
  end;

  perform private.worker_transition(
    p_user_id, v_target, v_actor, 'staff', p_reason_code, p_safe_reason,
    'wps023-v1', p_private_note);

  -- Once a decision exists, the account can no longer switch its intended role
  -- out from under it.
  update public.account_onboarding
  set role_selection_locked = true, updated_at = pg_catalog.now()
  where user_id = p_user_id;

  -- Activation is the only point at which discoverability changes, and it is
  -- refused unless every gate independently passes.
  if p_decision in ('activate', 'reinstate') then
    if exists (
      select 1 from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
      where g.value = 'false'::jsonb
    ) then
      raise exception 'Activation gates are not satisfied' using errcode = '22023';
    end if;
    select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;
    update public.provider_profiles set is_published = true, updated_at = pg_catalog.now()
     where id = v_provider;
  elsif p_decision in ('reject', 'suspend') then
    select p.id into v_provider from public.provider_profiles p where p.user_id = p_user_id;
    update public.provider_profiles set is_published = false, updated_at = pg_catalog.now()
     where id = v_provider;
  end if;

  perform private.record_staff_audit(
    v_actor, v_capability, 'worker_vetting_decision', 'worker_onboarding', p_user_id,
    p_safe_reason,
    pg_catalog.jsonb_build_object('decision', p_decision, 'policyVersion', 'wps023-v1'));

  return pg_catalog.jsonb_build_object('decision', p_decision, 'state', v_target);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The upload refuses; the state says so
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_my_criminal_record(p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_content_hash text, p_issue_date date, p_document_reference text, p_declared_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Nothing is collected that Warsha does not currently require.
  if not private.criminal_record_required() then
    raise exception 'Criminal records are not currently collected' using errcode = '55000';
  end if;
  perform private.enforce_rate_limit('worker_criminal_record_submit');

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  -- The path must sit under the caller's own folder. A path naming another
  -- account is refused here as well as by the storage policy, because two
  -- independent checks is the point.
  if p_storage_path is null
     or pg_catalog.split_part(p_storage_path, '/', 1) <> v_user::text then
    raise exception 'Invalid document path' using errcode = '42501';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/heic', 'application/pdf') then
    raise exception 'Unsupported document format' using errcode = '22023';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes not between 1 and 8388608 then
    raise exception 'Document is too large' using errcode = '22023';
  end if;
  if p_issue_date is null or p_issue_date > current_date then
    raise exception 'Invalid issue date' using errcode = '22023';
  end if;
  if pg_catalog.length(private.normalize_declared_name(coalesce(p_declared_name, ''))) not between 2 and 120 then
    raise exception 'Invalid declared name' using errcode = '22023';
  end if;

  -- Superseding, not deleting. A prior submission is evidence a reviewer may
  -- need, and WPS-022 retention decides when it goes.
  update public.worker_criminal_record_submissions
  set is_current = false, updated_at = pg_catalog.now()
  where provider_id = v_provider and is_current;

  insert into public.worker_criminal_record_submissions (
    provider_id, storage_path, mime_type, file_size_bytes, content_hash,
    issue_date, document_reference, declared_name, policy_version
  ) values (
    v_provider, p_storage_path, p_mime_type, p_file_size_bytes, p_content_hash,
    p_issue_date, nullif(pg_catalog.btrim(coalesce(p_document_reference, '')), ''),
    private.normalize_declared_name(p_declared_name), 'wps023-v1'
  )
  returning id into v_id;

  perform private.worker_transition(
    v_user, 'criminal_record_submitted', v_user, 'worker',
    'certificate_submitted', 'Your criminal record was received and is waiting for review.');

  return pg_catalog.jsonb_build_object('submissionId', v_id, 'status', 'submitted');
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.account_onboarding;
  v_provider public.provider_profiles;
  v_gates jsonb;
  v_address_confirmed boolean;
  v_deactivated boolean;
  v_deletion text;
  v_banned boolean;
  v_latest public.worker_onboarding_events;
  v_record public.worker_criminal_record_submissions;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.account_onboarding o where o.user_id = v_user;
  select * into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;

  select exists (
    select 1 from public.addresses a
    where a.customer_id = v_user and a.deleted_at is null and a.pin_confirmed_at is not null
  ) into v_address_confirmed;

  select pr.deactivated_at is not null into v_deactivated
  from public.profiles pr where pr.id = v_user;

  select r.status into v_deletion
  from public.account_deletion_requests r
  where r.user_id = v_user and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing')
  order by r.requested_at desc limit 1;

  select u.banned_until is not null and u.banned_until > pg_catalog.now() into v_banned
  from auth.users u where u.id = v_user;

  select * into v_latest from public.worker_onboarding_events e
   where e.user_id = v_user order by e.created_at desc, e.id desc limit 1;

  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;

  v_gates := case
    when v_row.intended_role = 'worker' then private.worker_activation_gates(v_user)
    else '{}'::jsonb
  end;

  return pg_catalog.jsonb_build_object(
    'roleSelected', v_row.user_id is not null,
    'intendedRole', v_row.intended_role,
    'roleSelectionLocked', coalesce(v_row.role_selection_locked, false),
    'customerState', coalesce(v_row.customer_state, 'address_required'),
    'addressConfirmed', coalesce(v_address_confirmed, false),
    'workerState', v_row.worker_state,
    'workerStateChangedAt', v_row.worker_state_changed_at,
    'workerAgreementAccepted', v_row.worker_agreement_accepted_at is not null,
    'documentProcessingAccepted', v_row.document_processing_accepted_at is not null,
    'gates', v_gates,
    -- Whether the criminal-record step exists at all. Both clients build the
    -- journey from this rather than from a constant.
    'criminalRecordRequired', private.criminal_record_required(),
    'outstandingGates', coalesce((
      select pg_catalog.jsonb_agg(g.key order by g.key)
      from pg_catalog.jsonb_each(v_gates) g
      where g.value = 'false'::jsonb
    ), '[]'::jsonb),
    -- The only permission fact in this payload.
    'workerCapabilityActive', private.worker_capability_active(v_user),
    'certificateStatus', v_record.status,
    'certificateSafeReason', v_record.safe_outcome_reason,
    'latestSafeReason', v_latest.safe_reason,
    'latestReasonCode', v_latest.reason_code,
    'accountDeactivated', coalesce(v_deactivated, false),
    'deletionStatus', v_deletion,
    'accountBanned', coalesce(v_banned, false)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_worker_vetting_detail(p_subject_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.require_staff_capability('review_worker_vetting');
  v_user uuid;
  v_provider uuid;
begin
  select o.user_id into v_user
  from public.account_onboarding o
  where pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(o.user_id::text, 'UTF8')), 'hex')
        = p_subject_ref;
  if v_user is null then
    raise exception 'Unknown case' using errcode = '22023';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;

  perform private.record_staff_audit(
    v_actor, 'review_worker_vetting', 'open_case', 'worker_vetting', v_user,
    'Opened a vetting case for review.',
    pg_catalog.jsonb_build_object('subjectRef', p_subject_ref));

  return pg_catalog.jsonb_build_object(
    'subjectRef', p_subject_ref,
    'workerState', (select o.worker_state from public.account_onboarding o where o.user_id = v_user),
    -- So the console offers only the decisions this policy allows.
    'criminalRecordRequired', private.criminal_record_required(),
    'capabilityTier', private.worker_capability_tier(v_user),
    'gates', private.worker_activation_gates(v_user),
    'provisionalGates', private.worker_provisional_gates(v_user),
    'documents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentType', d.document_type, 'status', d.status,
        'captureSource', d.capture_source, 'pageSide', d.page_side)
        order by d.document_type)
      from public.provider_verification_documents d
      where d.provider_id = v_provider and d.is_current), '[]'::jsonb),
    'certificate', (
      select pg_catalog.jsonb_build_object('status', c.status, 'issueDate', c.issue_date)
      from public.worker_criminal_record_submissions c
      where c.provider_id = v_provider and c.is_current),
    -- The OCR trail: that it ran, what it produced, how long it took. No
    -- confidence value, and no extracted value.
    'extractionRuns', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentType', r.document_type, 'outcome', r.outcome,
        'providerVersion', r.provider_version, 'fieldsExtracted', r.fields_extracted,
        'requestedAt', r.requested_at)
        order by r.requested_at desc)
      from private.ocr_requests r
      where r.provider_id = v_provider), '[]'::jsonb),
    'fieldsConfirmedByWorker', (
      select i.confirmed_at is not null
      from private.provider_verification_identities i where i.provider_id = v_provider)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. No new material reaches the bucket
-- ---------------------------------------------------------------------------
-- Read and delete stay exactly as they were: a Professional keeps access to,
-- and control over, anything they already sent.
drop policy if exists worker_criminal_record_owner_insert on storage.objects;
create policy worker_criminal_record_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worker-criminal-records'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.criminal_record_required()
  );

-- ---------------------------------------------------------------------------
-- 6. Professionals who were waiting only for a certificate
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_offered integer := 0;
  v_activated integer := 0;
begin
  for v_user in
    select o.user_id from public.account_onboarding o
    where o.intended_role = 'worker'
      and o.worker_state in ('identity_submitted', 'criminal_record_required')
    order by o.user_id
  loop
    v_offered := v_offered + 1;
    if private.worker_try_provisional_activation(v_user) then
      v_activated := v_activated + 1;
    end if;
  end loop;
  raise notice 'criminal record no longer required: % Professional(s) offered provisional activation, % activated',
    v_offered, v_activated;
end;
$$;
