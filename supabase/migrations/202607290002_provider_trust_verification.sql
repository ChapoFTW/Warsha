-- Warsha v0.7: lightweight provider trust and verification.
-- National ID material stays outside the API-exposed public schema.

alter table public.provider_profiles
  add column if not exists skill_certificate_verified boolean not null default false;

create table public.provider_verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique references public.provider_profiles(id) on delete cascade,
  status text not null default 'not_started'
    check (status in (
      'not_started',
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'requires_resubmission',
      'expired'
    )),
  revision integer not null default 0 check (revision >= 0),
  skill_certificate_answer text not null default 'not_answered'
    check (skill_certificate_answer in ('not_answered', 'yes', 'no')),
  rejection_reason text check (
    rejection_reason is null or pg_catalog.length(rejection_reason) between 1 and 1000
  ),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table private.provider_verification_identities (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  national_id_hash text not null check (national_id_hash ~ '^[0-9a-f]{64}$'),
  national_id_last4 text not null check (national_id_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.provider_verification_identities from public, anon, authenticated;

-- Preserve the trust state of providers verified before this workflow existed.
insert into public.provider_verifications (
  provider_id,
  status,
  revision,
  reviewed_at,
  created_at,
  updated_at
)
select
  p.id,
  'approved',
  1,
  p.updated_at,
  p.created_at,
  p.updated_at
from public.provider_profiles p
where p.is_verified
on conflict (provider_id) do nothing;

alter table public.provider_verification_documents
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists is_current boolean not null default true,
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

alter table public.provider_verification_documents
  drop constraint if exists provider_verification_documents_status_check;
alter table public.provider_verification_documents
  add constraint provider_verification_documents_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired'));

alter table public.provider_verification_documents
  drop constraint if exists provider_verification_documents_document_type_check;
alter table public.provider_verification_documents
  add constraint provider_verification_documents_document_type_check
  check (document_type in (
    'national_id_front',
    'national_id_back',
    'selfie',
    'skill_certificate',
    'trade_license',
    'qualification',
    'other'
  )) not valid;

with ranked as (
  select
    id,
    pg_catalog.row_number() over (
      partition by provider_id, document_type
      order by created_at desc, id desc
    ) as position
  from public.provider_verification_documents
  where is_current
)
update public.provider_verification_documents d
set is_current = false
from ranked r
where r.id = d.id and r.position > 1;

create unique index provider_verification_documents_current_unique
  on public.provider_verification_documents(provider_id, document_type)
  where is_current;
create index provider_verification_documents_provider_created_idx
  on public.provider_verification_documents(provider_id, created_at desc);

drop trigger if exists provider_verifications_updated_at on public.provider_verifications;
create trigger provider_verifications_updated_at
before update on public.provider_verifications
for each row execute function private.set_updated_at();

drop trigger if exists provider_verification_documents_updated_at
  on public.provider_verification_documents;
create trigger provider_verification_documents_updated_at
before update on public.provider_verification_documents
for each row execute function private.set_updated_at();

create or replace function private.owns_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    where p.id = p_provider_id
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
$$;

create or replace function private.verification_provider_id(p_path text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  segment text := pg_catalog.split_part(p_path, '/', 2);
begin
  if segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return segment::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.provider_verification_is_editable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owns_provider(p_provider_id)
    and coalesce((
      select v.status in (
        'not_started',
        'draft',
        'rejected',
        'requires_resubmission',
        'expired'
      )
      from public.provider_verifications v
      where v.provider_id = p_provider_id
    ), true)
$$;

revoke all on function private.owns_provider(uuid) from public, anon;
revoke all on function private.verification_provider_id(text) from public, anon;
revoke all on function private.provider_verification_is_editable(uuid) from public, anon;
grant execute on function private.owns_provider(uuid) to authenticated;
grant execute on function private.verification_provider_id(text) to authenticated;
grant execute on function private.provider_verification_is_editable(uuid) to authenticated;

create or replace function private.validate_provider_verification_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  allowed boolean := false;
begin
  if old.provider_id is distinct from new.provider_id then
    raise exception 'Verification ownership cannot be changed' using errcode = '42501';
  end if;

  if old.status is not distinct from new.status or uid is null then
    return new;
  end if;

  if private.is_staff() then
    allowed :=
      (old.status = 'submitted' and new.status in (
        'under_review', 'approved', 'rejected', 'requires_resubmission'
      ))
      or (old.status = 'under_review' and new.status in (
        'approved', 'rejected', 'requires_resubmission'
      ))
      or (old.status = 'approved' and new.status = 'expired');
  elsif private.owns_provider(old.provider_id) then
    allowed :=
      (old.status in (
        'not_started', 'rejected', 'requires_resubmission', 'expired'
      ) and new.status = 'draft')
      or (old.status in (
        'not_started', 'draft', 'rejected', 'requires_resubmission', 'expired'
      ) and new.status = 'submitted');
  end if;

  if not allowed then
    raise exception 'Invalid verification status transition' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_provider_verification_transition
  on public.provider_verifications;
create trigger validate_provider_verification_transition
before update on public.provider_verifications
for each row execute function private.validate_provider_verification_transition();
revoke all on function private.validate_provider_verification_transition()
  from public, anon, authenticated;

-- Extend the existing provider-field guard so trust indicators remain staff-only.
create or replace function private.prevent_provider_approval_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and not private.is_staff()
    and (
      (old.onboarding_status is distinct from new.onboarding_status
        and not (
          old.onboarding_status in ('draft', 'more_information_required', 'rejected')
          and new.onboarding_status = 'submitted'
        ))
      or old.is_verified is distinct from new.is_verified
      or old.skill_certificate_verified is distinct from new.skill_certificate_verified
      or old.is_published is distinct from new.is_published
      or old.rating_average is distinct from new.rating_average
      or old.review_count is distinct from new.review_count
      or old.completed_jobs is distinct from new.completed_jobs
    )
  then
    raise exception 'Protected provider fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_provider_approval_changes()
  from public, anon, authenticated;

alter table public.provider_verifications enable row level security;

drop policy if exists provider_verifications_owner_read on public.provider_verifications;
create policy provider_verifications_owner_read
on public.provider_verifications for select to authenticated
using (private.is_staff() or private.owns_provider(provider_id));

drop policy if exists verification_owner_read
  on public.provider_verification_documents;
create policy verification_owner_read
on public.provider_verification_documents for select to authenticated
using (private.is_staff() or private.owns_provider(provider_id));

drop policy if exists verification_owner_insert
  on public.provider_verification_documents;

revoke all on table public.provider_verifications from public, anon, authenticated;
grant select on table public.provider_verifications to authenticated;
revoke insert, update, delete on table public.provider_verification_documents
  from public, anon, authenticated;
grant select on table public.provider_verification_documents to authenticated;

create or replace function public.get_my_provider_verification()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_row public.provider_profiles;
  verification_row public.provider_verifications;
  documents jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.* into provider_row
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if provider_row.id is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;

  select v.* into verification_row
  from public.provider_verifications v
  where v.provider_id = provider_row.id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', d.id,
        'type', d.document_type,
        'status', d.status,
        'storagePath', d.storage_path,
        'mimeType', d.mime_type,
        'fileSizeBytes', d.file_size_bytes,
        'createdAt', d.created_at
      )
      order by d.created_at
    ),
    '[]'::jsonb
  )
  into documents
  from public.provider_verification_documents d
  where d.provider_id = provider_row.id and d.is_current;

  return pg_catalog.jsonb_build_object(
    'id', verification_row.id,
    'providerId', provider_row.id,
    'status', coalesce(verification_row.status, 'not_started'),
    'revision', coalesce(verification_row.revision, 0),
    'skillCertificateAnswer',
      coalesce(verification_row.skill_certificate_answer, 'not_answered'),
    'identityVerified', provider_row.is_verified,
    'skillCertificateVerified', provider_row.skill_certificate_verified,
    'rejectionReason', verification_row.rejection_reason,
    'submittedAt', verification_row.submitted_at,
    'reviewedAt', verification_row.reviewed_at,
    'expiresAt', verification_row.expires_at,
    'documents', documents
  );
end;
$$;

create or replace function public.get_provider_trust_indicators(
  p_provider_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.jsonb_build_object(
        'identityVerified', p.is_verified,
        'skillCertificateVerified', p.skill_certificate_verified
      )
      from public.provider_profiles p
      where p.id = p_provider_id
        and p.is_published
        and p.onboarding_status = 'approved'
        and p.deleted_at is null
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.get_marketplace_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'categories',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', c.id,
            'translation_key', c.translation_key,
            'icon_name', c.icon_name,
            'description_key', c.description_key
          )
          order by c.sort_order, c.id
        )
        from public.service_categories c
        where c.is_active and c.deleted_at is null
      ),
      '[]'::jsonb
    ),
    'services',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'name', s.name,
            'price_egp', s.price_egp,
            'pricing_type', s.pricing_type,
            'duration_label', s.duration_label
          )
          order by s.name, s.id
        )
        from public.services s
        where s.is_active and s.deleted_at is null
      ),
      '[]'::jsonb
    ),
    'providers',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', p.id,
            'display_name', p.display_name,
            'profession_key', p.profession_key,
            'primary_category_id', p.primary_category_id,
            'rating_average', p.rating_average,
            'review_count', p.review_count,
            'starting_price_egp', p.starting_price_egp,
            'avatar_url', p.avatar_url,
            'cover_image_url', p.cover_image_url,
            'is_verified',
              coalesce(
                (public.get_provider_trust_indicators(p.id)
                  ->> 'identityVerified')::boolean,
                false
              ),
            'skill_certificate_verified',
              coalesce(
                (public.get_provider_trust_indicators(p.id)
                  ->> 'skillCertificateVerified')::boolean,
                false
              ),
            'is_available', p.is_available,
            'bookable', p.user_id is not null,
            'emergency_available', p.emergency_available,
            'completed_jobs', p.completed_jobs,
            'experience_years', p.experience_years,
            'response_time_label', p.response_time_label,
            'location_label', p.location_label,
            'service_radius_km', p.service_radius_km,
            'languages', p.languages,
            'about', p.about,
            'skills', p.skills,
            'cancellation_policy', p.cancellation_policy,
            'guarantee_text', p.guarantee_text,
            'provider_services',
            coalesce(
              (
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'service_id', ps.service_id,
                    'custom_price_egp', ps.custom_price_egp,
                    'pricing_type', ps.pricing_type,
                    'transportation_fee_egp',
                      ps.transportation_fee_egp,
                    'emergency_surcharge_egp',
                      ps.emergency_surcharge_egp,
                    'is_active', ps.is_active,
                    'service',
                    pg_catalog.jsonb_build_object(
                      'id', s.id,
                      'name', s.name,
                      'price_egp', s.price_egp,
                      'pricing_type', s.pricing_type,
                      'duration_label', s.duration_label
                    )
                  )
                  order by s.name, s.id
                )
                from public.provider_services ps
                join public.services s on s.id = ps.service_id
                where ps.provider_id = p.id
                  and ps.is_active
                  and s.is_active
                  and s.deleted_at is null
              ),
              '[]'::jsonb
            )
          )
          order by p.rating_average desc, p.display_name, p.id
        )
        from public.provider_profiles p
        where p.is_published
          and p.onboarding_status = 'approved'
          and p.deleted_at is null
      ),
      '[]'::jsonb
    )
  )
$$;

create or replace function public.register_provider_verification_document(
  p_document_type text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  verification_status text;
  actual_mime text;
  actual_size bigint;
  document_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into pid
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if pid is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;
  if p_document_type not in (
    'national_id_front',
    'national_id_back',
    'selfie',
    'skill_certificate',
    'trade_license',
    'qualification',
    'other'
  ) then
    raise exception 'Unsupported verification document' using errcode = '22023';
  end if;
  if p_mime_type not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ) or p_file_size_bytes not between 1 and 8388608 then
    raise exception 'Invalid verification image' using errcode = '22023';
  end if;
  if p_storage_path !~ (
    '^' || uid::text || '/' || pid::text || '/' || p_document_type ||
    '/[A-Za-z0-9_-]{8,160}\.(jpg|jpeg|png|webp|heic|heif)$'
  ) then
    raise exception 'Invalid verification document path' using errcode = '22023';
  end if;

  select
    coalesce(o.metadata->>'mimetype', p_mime_type),
    coalesce(nullif(o.metadata->>'size', '')::bigint, p_file_size_bytes)
  into actual_mime, actual_size
  from storage.objects o
  where o.bucket_id = 'verification-documents'
    and o.name = p_storage_path;
  if actual_mime is null
    or actual_mime not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    )
    or actual_size not between 1 and 8388608
  then
    raise exception 'Verification upload not found' using errcode = '22023';
  end if;

  insert into public.provider_verifications(provider_id, status)
  values(pid, 'draft')
  on conflict(provider_id) do nothing;

  select v.status into verification_status
  from public.provider_verifications v
  where v.provider_id = pid
  for update;
  if verification_status not in (
    'not_started', 'draft', 'rejected', 'requires_resubmission', 'expired'
  ) then
    raise exception 'Verification documents are locked' using errcode = '22023';
  end if;

  update public.provider_verification_documents
  set is_current = false
  where provider_id = pid
    and document_type = p_document_type
    and is_current;

  insert into public.provider_verification_documents(
    provider_id,
    document_type,
    storage_path,
    status,
    mime_type,
    file_size_bytes,
    is_current
  )
  values(
    pid,
    p_document_type,
    p_storage_path,
    'pending',
    actual_mime,
    actual_size,
    true
  )
  returning id into document_id;

  if verification_status <> 'draft' then
    update public.provider_verifications
    set status = 'draft'
    where provider_id = pid;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', document_id,
    'type', p_document_type,
    'status', 'pending'
  );
end;
$$;

create or replace function public.remove_provider_verification_document(
  p_document_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  result_path text;
  verification_status text;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into pid
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if pid is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;

  select v.status into verification_status
  from public.provider_verifications v
  where v.provider_id = pid
  for update;
  if verification_status not in (
    'not_started', 'draft', 'rejected', 'requires_resubmission', 'expired'
  ) then
    raise exception 'Verification documents are locked' using errcode = '22023';
  end if;

  delete from public.provider_verification_documents d
  where d.id = p_document_id
    and d.provider_id = pid
    and d.is_current
  returning d.storage_path into result_path;
  if result_path is null then
    raise exception 'Verification document not found' using errcode = '22023';
  end if;

  if verification_status <> 'draft' then
    update public.provider_verifications
    set status = 'draft'
    where provider_id = pid;
  end if;
  return result_path;
end;
$$;

create or replace function private.create_verification_notification(
  p_provider_id uuid,
  p_verification_id uuid,
  p_status text,
  p_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  event_type text;
begin
  select p.user_id into recipient
  from public.provider_profiles p
  where p.id = p_provider_id;
  event_type := case p_status
    when 'submitted' then 'verification_submitted'
    when 'approved' then 'verification_approved'
    when 'rejected' then 'verification_rejected'
    when 'requires_resubmission' then 'verification_resubmission_requested'
    when 'expired' then 'verification_expired'
    else null
  end;
  if recipient is null or event_type is null then
    return;
  end if;

  insert into public.notifications(
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key
  )
  values(
    recipient,
    event_type,
    'Verification update',
    'Your provider verification has a new update.',
    pg_catalog.jsonb_build_object(
      'provider_id', p_provider_id,
      'verification_id', p_verification_id,
      'status', p_status
    ),
    'verification:' || p_verification_id::text || ':' ||
      p_revision::text || ':' || p_status
  )
  on conflict do nothing;
end;
$$;
revoke all on function private.create_verification_notification(uuid, uuid, text, integer)
  from public, anon, authenticated;

create or replace function public.submit_provider_verification(
  p_national_id text,
  p_has_skill_certificate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  verification_row public.provider_verifications;
  normalized_id text;
  missing_required integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into pid
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if pid is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;

  normalized_id := pg_catalog.translate(
    pg_catalog.regexp_replace(
      coalesce(p_national_id, ''),
      '[[:space:]-]',
      '',
      'g'
    ),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );
  if normalized_id !~ '^[0-9]{14}$' then
    raise exception 'National ID must contain 14 digits' using errcode = '22023';
  end if;

  insert into public.provider_verifications(provider_id, status)
  values(pid, 'not_started')
  on conflict(provider_id) do nothing;
  select v.* into verification_row
  from public.provider_verifications v
  where v.provider_id = pid
  for update;
  if verification_row.status not in (
    'not_started', 'draft', 'rejected', 'requires_resubmission', 'expired'
  ) then
    raise exception 'Verification is already submitted' using errcode = '23505';
  end if;

  select pg_catalog.count(*)::integer into missing_required
  from (
    values ('national_id_front'), ('national_id_back'), ('selfie')
  ) required(document_type)
  where not exists (
    select 1
    from public.provider_verification_documents d
    join storage.objects o
      on o.bucket_id = 'verification-documents'
      and o.name = d.storage_path
    where d.provider_id = pid
      and d.document_type = required.document_type
      and d.is_current
  );
  if missing_required > 0 then
    raise exception 'Required identity photos are missing' using errcode = '22023';
  end if;
  if p_has_skill_certificate and not exists (
    select 1
    from public.provider_verification_documents d
    join storage.objects o
      on o.bucket_id = 'verification-documents'
      and o.name = d.storage_path
    where d.provider_id = pid
      and d.document_type = 'skill_certificate'
      and d.is_current
  ) then
    raise exception 'Skill Certificate photo is missing' using errcode = '22023';
  end if;

  insert into private.provider_verification_identities(
    provider_id,
    national_id_hash,
    national_id_last4
  )
  values(
    pid,
    pg_catalog.encode(extensions.digest(normalized_id, 'sha256'), 'hex'),
    pg_catalog.right(normalized_id, 4)
  )
  on conflict(provider_id) do update
  set national_id_hash = excluded.national_id_hash,
      national_id_last4 = excluded.national_id_last4,
      updated_at = pg_catalog.now();

  update public.provider_verifications
  set status = 'submitted',
      revision = revision + 1,
      skill_certificate_answer =
        case when p_has_skill_certificate then 'yes' else 'no' end,
      rejection_reason = null,
      submitted_at = pg_catalog.now(),
      reviewed_by = null,
      reviewed_at = null,
      expires_at = null
  where provider_id = pid
  returning * into verification_row;

  update public.provider_verification_documents
  set status = 'pending',
      reviewed_by = null,
      reviewed_at = null
  where provider_id = pid and is_current;

  perform private.create_verification_notification(
    pid,
    verification_row.id,
    verification_row.status,
    verification_row.revision
  );

  return pg_catalog.jsonb_build_object(
    'id', verification_row.id,
    'providerId', pid,
    'status', verification_row.status,
    'revision', verification_row.revision,
    'skillCertificateAnswer', verification_row.skill_certificate_answer,
    'submittedAt', verification_row.submitted_at
  );
end;
$$;

create or replace function public.review_provider_verification(
  p_provider_id uuid,
  p_status text,
  p_reason text default null,
  p_expires_at timestamptz default null,
  p_skill_certificate_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  verification_row public.provider_verifications;
  old_status text;
  skill_approved boolean := false;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in (
    'under_review', 'approved', 'rejected', 'requires_resubmission', 'expired'
  ) then
    raise exception 'Invalid review status' using errcode = '22023';
  end if;
  if p_status in ('rejected', 'requires_resubmission')
    and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 3 and 1000
  then
    raise exception 'A review reason is required' using errcode = '22023';
  end if;

  select v.* into verification_row
  from public.provider_verifications v
  where v.provider_id = p_provider_id
  for update;
  if verification_row.id is null then
    raise exception 'Verification not found' using errcode = '22023';
  end if;
  old_status := verification_row.status;

  if p_status = 'approved' then
    if not exists (
      select 1
      from private.provider_verification_identities i
      where i.provider_id = p_provider_id
    ) or (
      select pg_catalog.count(distinct d.document_type)
      from public.provider_verification_documents d
      where d.provider_id = p_provider_id
        and d.is_current
        and d.document_type in ('national_id_front', 'national_id_back', 'selfie')
    ) <> 3 then
      raise exception 'Identity evidence is incomplete' using errcode = '22023';
    end if;
    if p_expires_at is not null and p_expires_at <= pg_catalog.now() then
      raise exception 'Verification expiry must be in the future' using errcode = '22023';
    end if;
    if p_skill_certificate_approved and not exists (
      select 1
      from public.provider_verification_documents d
      where d.provider_id = p_provider_id
        and d.document_type = 'skill_certificate'
        and d.is_current
    ) then
      raise exception 'Skill Certificate evidence is missing' using errcode = '22023';
    end if;
    skill_approved := p_skill_certificate_approved;
  end if;

  update public.provider_verifications
  set status = p_status,
      rejection_reason = case
        when p_status in ('rejected', 'requires_resubmission')
          then pg_catalog.btrim(p_reason)
        else null
      end,
      reviewed_by = uid,
      reviewed_at = pg_catalog.now(),
      expires_at = case
        when p_status = 'approved'
          then coalesce(p_expires_at, pg_catalog.now() + interval '1 year')
        when p_status = 'expired' then coalesce(expires_at, pg_catalog.now())
        else null
      end
  where provider_id = p_provider_id
  returning * into verification_row;

  if p_status = 'approved' then
    update public.provider_verification_documents
    set status = case
          when document_type in ('national_id_front', 'national_id_back', 'selfie')
            then 'approved'
          when document_type = 'skill_certificate' and skill_approved
            then 'approved'
          else status
        end,
        reviewed_by = uid,
        reviewed_at = pg_catalog.now()
    where provider_id = p_provider_id and is_current;
  elsif p_status = 'expired' then
    update public.provider_verification_documents
    set status = 'expired',
        reviewed_by = uid,
        reviewed_at = pg_catalog.now()
    where provider_id = p_provider_id and is_current and status = 'approved';
  end if;

  update public.provider_profiles
  set is_verified = p_status = 'approved',
      skill_certificate_verified = p_status = 'approved' and skill_approved
  where id = p_provider_id;

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  values(
    uid,
    'provider_verification_reviewed',
    'provider_verification',
    verification_row.id,
    pg_catalog.jsonb_build_object('status', old_status),
    pg_catalog.jsonb_build_object(
      'status', verification_row.status,
      'skill_certificate_verified', skill_approved
    )
  );

  perform private.create_verification_notification(
    p_provider_id,
    verification_row.id,
    verification_row.status,
    verification_row.revision
  );

  return pg_catalog.jsonb_build_object(
    'id', verification_row.id,
    'providerId', p_provider_id,
    'status', verification_row.status,
    'revision', verification_row.revision,
    'reviewedAt', verification_row.reviewed_at,
    'expiresAt', verification_row.expires_at,
    'identityVerified', p_status = 'approved',
    'skillCertificateVerified', p_status = 'approved' and skill_approved
  );
end;
$$;

revoke execute on function public.get_my_provider_verification()
  from public, anon, authenticated;
revoke execute on function public.get_provider_trust_indicators(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_marketplace_catalog()
  from public, anon, authenticated;
revoke execute on function public.register_provider_verification_document(text, text, text, bigint)
  from public, anon, authenticated;
revoke execute on function public.remove_provider_verification_document(uuid)
  from public, anon, authenticated;
revoke execute on function public.submit_provider_verification(text, boolean)
  from public, anon, authenticated;
revoke execute on function public.review_provider_verification(uuid, text, text, timestamptz, boolean)
  from public, anon, authenticated;

grant execute on function public.get_my_provider_verification()
  to authenticated;
grant execute on function public.get_provider_trust_indicators(uuid)
  to anon, authenticated;
grant execute on function public.get_marketplace_catalog()
  to anon, authenticated;
grant execute on function public.register_provider_verification_document(text, text, text, bigint)
  to authenticated;
grant execute on function public.remove_provider_verification_document(uuid)
  to authenticated;
grant execute on function public.submit_provider_verification(text, boolean)
  to authenticated;
grant execute on function public.review_provider_verification(uuid, text, text, timestamptz, boolean)
  to authenticated;

update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'verification-documents';

-- Split the old shared policies so verification paths can enforce provider
-- ownership and editable-state checks without changing dispute behavior.
drop policy if exists private_user_uploads on storage.objects;
create policy private_user_uploads
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dispute-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists private_user_reads on storage.objects;
create policy private_user_reads
on storage.objects for select to authenticated
using (
  bucket_id = 'dispute-evidence'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_staff()
  )
);

drop policy if exists verification_document_insert on storage.objects;
create policy verification_document_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.owns_provider(private.verification_provider_id(name))
  and (storage.foldername(name))[3] in (
    'national_id_front',
    'national_id_back',
    'selfie',
    'skill_certificate',
    'trade_license',
    'qualification',
    'other'
  )
  and private.provider_verification_is_editable(
    private.verification_provider_id(name)
  )
  and pg_catalog.lower(storage.extension(name)) in (
    'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'
  )
);

drop policy if exists verification_document_select on storage.objects;
create policy verification_document_select
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and private.verification_provider_id(name) is not null
  and (
    private.is_staff()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and private.owns_provider(private.verification_provider_id(name))
    )
  )
);

drop policy if exists verification_document_delete on storage.objects;
create policy verification_document_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.provider_verification_is_editable(
    private.verification_provider_id(name)
  )
);

-- No verification Storage UPDATE policy is created: existing objects cannot
-- be overwritten. Replacement always uses a fresh path.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_verifications'
  ) then
    alter publication supabase_realtime add table public.provider_verifications;
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_profiles'
  ) then
    alter publication supabase_realtime add table public.provider_profiles;
  end if;
end;
$$;
