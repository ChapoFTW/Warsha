-- v0.6: extend the existing review model without changing applied migrations.

alter table public.reviews
  add column if not exists moderation_status text not null default 'visible'
  check (moderation_status in ('visible', 'hidden', 'flagged'));
alter table public.reviews add column if not exists moderation_reason text;
alter table public.reviews add column if not exists moderated_at timestamptz;
alter table public.reviews
  add column if not exists moderated_by uuid references public.profiles(id);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reviews'::pg_catalog.regclass
      and conname = 'reviews_comment_length'
  ) then
    alter table public.reviews
      add constraint reviews_comment_length
      check (comment is null or pg_catalog.char_length(comment) <= 2000);
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.review_responses'::pg_catalog.regclass
      and conname = 'review_responses_body_length'
  ) then
    alter table public.review_responses
      add constraint review_responses_body_length
      check (pg_catalog.char_length(body) between 1 and 1500);
  end if;
end;
$$;

create table public.review_attachments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  storage_path text not null unique
    check (storage_path !~ '(^|/)\.\.(/|$)'),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default pg_catalog.now()
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'review-attachments',
  'review-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.notifications add column if not exists dedupe_key text;

create unique index if not exists notifications_review_event_unique
  on public.notifications(user_id, type, dedupe_key)
  where dedupe_key is not null
    and type in ('new_review', 'review_reply');
create index if not exists reviews_provider_visible_created_idx
  on public.reviews(provider_id, created_at desc)
  where moderation_status = 'visible' and deleted_at is null;
create index if not exists review_attachments_review_idx
  on public.review_attachments(review_id);

alter table public.review_attachments enable row level security;

-- All review, reply, attachment-metadata, and durable-notification mutations
-- are RPC-only. Review readers never receive moderation reason/actor/timestamps.
revoke select on public.reviews from public, anon, authenticated;
grant select (
  id,
  booking_id,
  customer_id,
  provider_id,
  rating,
  comment,
  is_anonymous,
  created_at,
  moderation_status,
  deleted_at
) on public.reviews to anon, authenticated;
grant select on public.review_responses to anon, authenticated;
revoke insert, update, delete on public.reviews
  from public, anon, authenticated;
revoke insert, update, delete on public.review_responses
  from public, anon, authenticated;
revoke all on public.review_attachments from public, anon, authenticated;
grant select on public.review_attachments to authenticated;
revoke insert, update, delete on public.notifications
  from public, anon, authenticated;

create or replace function private.is_review_participant(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reviews r
    left join public.provider_profiles p on p.id = r.provider_id
    where r.id = p_review_id
      and (
        r.customer_id = (select auth.uid())
        or p.user_id = (select auth.uid())
      )
  );
$$;

revoke all on function private.is_review_participant(uuid)
  from public, anon, authenticated;
grant execute on function private.is_review_participant(uuid) to authenticated;

drop policy if exists reviews_public_read on public.reviews;
drop policy if exists reviews_completed_booking_insert on public.reviews;
drop policy if exists reviews_public_visible_read on public.reviews;
create policy reviews_public_visible_read
on public.reviews for select to anon, authenticated
using (moderation_status = 'visible' and deleted_at is null);

drop policy if exists reviews_participant_read on public.reviews;
create policy reviews_participant_read
on public.reviews for select to authenticated
using (private.is_review_participant(id));

drop policy if exists review_responses_public_read
  on public.review_responses;
create policy review_responses_public_read
on public.review_responses for select to anon, authenticated
using (
  exists (
    select 1
    from public.reviews r
    where r.id = review_id
      and r.moderation_status = 'visible'
      and r.deleted_at is null
  )
);

drop policy if exists review_responses_participant_read
  on public.review_responses;
create policy review_responses_participant_read
on public.review_responses for select to authenticated
using (private.is_review_participant(review_id));

drop policy if exists review_attachments_visible_read
  on public.review_attachments;
drop policy if exists review_attachments_participant_read
  on public.review_attachments;
create policy review_attachments_participant_read
on public.review_attachments for select to authenticated
using (private.is_review_participant(review_id));

create or replace function private.review_attachment_booking_id(p_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/review/[A-Za-z0-9_-]+\.(jpg|png|webp)$' then
    return null;
  end if;
  return ((storage.foldername(p_name))[2])::uuid;
exception
  when invalid_text_representation then return null;
end;
$$;

revoke all on function private.review_attachment_booking_id(text)
  from public, anon, authenticated;
grant execute on function private.review_attachment_booking_id(text)
  to authenticated;

create or replace function private.is_completed_booking_customer(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.customer_id = (select auth.uid())
      and b.status = 'completed'
  );
$$;

revoke all on function private.is_completed_booking_customer(uuid)
  from public, anon, authenticated;
grant execute on function private.is_completed_booking_customer(uuid)
  to authenticated;

-- Storage combines permissive policies with OR. Keep the existing booking-
-- attachment policy from evaluating provider ownership as the invoking role
-- when a request targets another bucket.
create or replace function private.can_manage_booking_attachment(
  p_booking_id text,
  p_attachment_kind text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    left join public.provider_profiles p on p.id = b.provider_id
    where b.id::text = p_booking_id
      and b.deleted_at is null
      and (
        (
          b.customer_id = (select auth.uid())
          and b.status = 'pending_provider_approval'
          and p_attachment_kind is distinct from 'completion'
        )
        or (
          p.user_id = (select auth.uid())
          and p.onboarding_status = 'approved'
          and p.is_published
          and p.deleted_at is null
          and b.status in ('job_started', 'work_in_progress')
          and p_attachment_kind = 'completion'
        )
      )
  );
$$;

revoke all on function private.can_manage_booking_attachment(text, text)
  from public, anon, authenticated;
grant execute on function private.can_manage_booking_attachment(text, text)
  to authenticated;

create or replace function private.can_read_booking_attachment(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking_attachments a
    join public.bookings b on b.id = a.booking_id
    left join public.provider_profiles p on p.id = b.provider_id
    where a.storage_path = p_storage_path
      and b.deleted_at is null
      and (
        b.customer_id = (select auth.uid())
        or p.user_id = (select auth.uid())
      )
  );
$$;

revoke all on function private.can_read_booking_attachment(text)
  from public, anon, authenticated;
grant execute on function private.can_read_booking_attachment(text)
  to authenticated;

drop policy if exists booking_attachment_participant_upload
  on storage.objects;
create policy booking_attachment_participant_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] is not null
  and pg_catalog.lower(storage.extension(name))
    in ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif')
  and private.can_manage_booking_attachment(
    (storage.foldername(name))[2],
    (storage.foldername(name))[3]
  )
);

drop policy if exists booking_attachment_participant_object_read
  on storage.objects;
create policy booking_attachment_participant_object_read
on storage.objects for select to authenticated
using (
  bucket_id = 'booking-attachments'
  and private.can_read_booking_attachment(name)
);

drop policy if exists booking_attachment_owner_delete
  on storage.objects;
create policy booking_attachment_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'booking-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_manage_booking_attachment(
    (storage.foldername(name))[2],
    (storage.foldername(name))[3]
  )
);

drop policy if exists review_attachment_insert on storage.objects;
create policy review_attachment_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'review-attachments'
  and private.review_attachment_booking_id(name) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_completed_booking_customer(
    private.review_attachment_booking_id(name)
  )
);

drop policy if exists review_attachment_select on storage.objects;
create policy review_attachment_select
on storage.objects for select to authenticated
using (
  bucket_id = 'review-attachments'
  and (
    exists (
      select 1
      from public.review_attachments a
      where a.storage_path = name
        and private.is_review_participant(a.review_id)
    )
    or (
      private.review_attachment_booking_id(name) is not null
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and private.is_completed_booking_customer(
        private.review_attachment_booking_id(name)
      )
      and not exists (
        select 1
        from public.review_attachments a
        where a.storage_path = name
      )
    )
  )
);

drop policy if exists review_attachment_delete on storage.objects;
create policy review_attachment_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'review-attachments'
  and private.review_attachment_booking_id(name) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_completed_booking_customer(
    private.review_attachment_booking_id(name)
  )
  and not exists (
    select 1
    from public.review_attachments a
    where a.storage_path = name
  )
);

create or replace function public.get_provider_rating_summary(
  p_provider_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible_reviews as materialized (
    select r.id,
           r.provider_id,
           r.customer_id,
           r.rating,
           r.comment,
           r.is_anonymous,
           r.created_at
    from public.reviews r
    where r.provider_id = p_provider_id
      and r.moderation_status = 'visible'
      and r.deleted_at is null
  ),
  recent_reviews as (
    select v.*
    from visible_reviews v
    order by v.created_at desc
    limit 20
  ),
  recent_payload as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'provider_id', r.provider_id,
          'reviewer_name',
            case
              when r.is_anonymous then 'Customer'
              else pg_catalog.left(coalesce(pr.display_name, 'Customer'), 1) || '.'
            end,
          'rating', r.rating,
          'comment', r.comment,
          'created_at', r.created_at,
          'verified_booking', true,
          'review_responses',
            case
              when rr.id is null then '[]'::jsonb
              else pg_catalog.jsonb_build_array(
                pg_catalog.jsonb_build_object(
                  'id', rr.id,
                  'body', rr.body,
                  'created_at', rr.created_at
                )
              )
            end
        )
        order by r.created_at desc
      ),
      '[]'::jsonb
    ) as reviews
    from recent_reviews r
    join public.profiles pr on pr.id = r.customer_id
    left join public.review_responses rr on rr.review_id = r.id
  )
  select pg_catalog.jsonb_build_object(
    'average',
      coalesce(
        (
          select pg_catalog.round(pg_catalog.avg(v.rating)::numeric, 1)
          from visible_reviews v
        ),
        0
      ),
    'count', (select pg_catalog.count(*) from visible_reviews),
    'distribution',
      pg_catalog.jsonb_build_object(
        '1', (select pg_catalog.count(*) from visible_reviews v where v.rating = 1),
        '2', (select pg_catalog.count(*) from visible_reviews v where v.rating = 2),
        '3', (select pg_catalog.count(*) from visible_reviews v where v.rating = 3),
        '4', (select pg_catalog.count(*) from visible_reviews v where v.rating = 4),
        '5', (select pg_catalog.count(*) from visible_reviews v where v.rating = 5)
      ),
    'reviews', (select p.reviews from recent_payload p)
  );
$$;

create or replace function public.submit_booking_review(
  p_booking_id uuid,
  p_rating smallint,
  p_comment text default null,
  p_attachment_paths text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  booking_row public.bookings%rowtype;
  result public.reviews%rowtype;
  normalized_comment text := nullif(pg_catalog.btrim(coalesce(p_comment, '')), '');
  attachment_paths text[] := coalesce(p_attachment_paths, '{}');
  path text;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Invalid rating' using errcode = '22023';
  end if;
  if normalized_comment is not null
     and pg_catalog.char_length(normalized_comment) > 2000 then
    raise exception 'Invalid review' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(attachment_paths) > 4 then
    raise exception 'Invalid attachment' using errcode = '22023';
  end if;

  select *
  into booking_row
  from public.bookings
  where id = p_booking_id
    and customer_id = uid
    and status = 'completed';
  if not found then
    raise exception 'Review is not available' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.provider_profiles p
    where p.id = booking_row.provider_id
      and p.user_id = uid
  ) then
    raise exception 'Review is not available' using errcode = '42501';
  end if;

  insert into public.reviews (
    booking_id,
    customer_id,
    provider_id,
    rating,
    comment
  )
  values (
    p_booking_id,
    uid,
    booking_row.provider_id,
    p_rating,
    normalized_comment
  )
  on conflict (booking_id) do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.reviews
    where booking_id = p_booking_id
      and customer_id = uid;
  end if;
  if result.id is null then
    raise exception 'Review is not available' using errcode = '42501';
  end if;

  foreach path in array attachment_paths loop
    if private.review_attachment_booking_id(path) is distinct from p_booking_id
       or (storage.foldername(path))[1] is distinct from uid::text
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'review-attachments'
           and o.name = path
       ) then
      raise exception 'Invalid attachment' using errcode = '22023';
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from (
      select a.storage_path
      from public.review_attachments a
      where a.review_id = result.id
      union
      select p.storage_path
      from pg_catalog.unnest(attachment_paths) as p(storage_path)
    ) unique_paths
  ) > 4 then
    raise exception 'Invalid attachment' using errcode = '22023';
  end if;

  foreach path in array attachment_paths loop
    insert into public.review_attachments (
      review_id,
      storage_path,
      mime_type
    )
    values (
      result.id,
      path,
      case
        when path like '%.png' then 'image/png'
        when path like '%.webp' then 'image/webp'
        else 'image/jpeg'
      end
    )
    on conflict (storage_path) do nothing;
  end loop;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key
  )
  select p.user_id,
         'new_review',
         'New review',
         'A customer rated a completed booking.',
         pg_catalog.jsonb_build_object(
           'booking_id', p_booking_id,
           'review_id', result.id
         ),
         result.id::text
  from public.provider_profiles p
  where p.id = result.provider_id
    and p.user_id is not null
    and p.user_id is distinct from uid
  on conflict do nothing;

  return pg_catalog.jsonb_build_object(
    'id', result.id,
    'booking_id', result.booking_id,
    'customer_id', result.customer_id,
    'provider_id', result.provider_id,
    'rating', result.rating,
    'comment', result.comment,
    'is_anonymous', result.is_anonymous,
    'created_at', result.created_at
  );
end;
$$;

create or replace function public.reply_to_booking_review(
  p_review_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized_body text := pg_catalog.btrim(coalesce(p_body, ''));
  result public.review_responses%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.char_length(normalized_body) not between 1 and 1500 then
    raise exception 'Invalid reply' using errcode = '22023';
  end if;

  insert into public.review_responses(review_id, provider_id, body)
  select r.id, r.provider_id, normalized_body
  from public.reviews r
  join public.provider_profiles p on p.id = r.provider_id
  where r.id = p_review_id
    and r.deleted_at is null
    and p.user_id = uid
  on conflict (review_id) do nothing
  returning * into result;

  if result.id is null then
    select rr.*
    into result
    from public.review_responses rr
    join public.provider_profiles p on p.id = rr.provider_id
    where rr.review_id = p_review_id
      and p.user_id = uid;
  end if;
  if result.id is null then
    raise exception 'Reply is not available' using errcode = '42501';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key
  )
  select r.customer_id,
         'review_reply',
         'Provider reply',
         'Your provider replied to your review.',
         pg_catalog.jsonb_build_object(
           'booking_id', r.booking_id,
           'review_id', p_review_id,
           'reply_id', result.id
         ),
         result.id::text
  from public.reviews r
  where r.id = p_review_id
    and r.customer_id is distinct from uid
  on conflict do nothing;

  return pg_catalog.jsonb_build_object(
    'id', result.id,
    'review_id', result.review_id,
    'provider_id', result.provider_id,
    'body', result.body,
    'created_at', result.created_at
  );
end;
$$;

revoke all on function public.submit_booking_review(uuid, smallint, text, text[])
  from public, anon, authenticated;
revoke all on function public.reply_to_booking_review(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_provider_rating_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.submit_booking_review(uuid, smallint, text, text[])
  to authenticated;
grant execute on function public.reply_to_booking_review(uuid, text)
  to authenticated;
grant execute on function public.get_provider_rating_summary(uuid)
  to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reviews'
  ) then
    alter publication supabase_realtime add table public.reviews;
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'review_responses'
  ) then
    alter publication supabase_realtime add table public.review_responses;
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'review_attachments'
  ) then
    alter publication supabase_realtime add table public.review_attachments;
  end if;
end;
$$;
