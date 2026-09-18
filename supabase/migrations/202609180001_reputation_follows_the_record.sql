-- A Professional's rating, review count and completed jobs follow the record.
--
-- `provider_profiles.rating_average`, `review_count` and `completed_jobs` are
-- what the marketplace reads: the matching score and its new-Professional
-- fairness boost, the quote a Customer compares (`workerRating`,
-- `workerReviewCount`, completed jobs), search sort and the minimum-rating
-- filter. `prevent_provider_approval_changes` keeps an end user from writing
-- them — and nothing else wrote them either. Every real Professional read as
-- 0.0 with no jobs however many reviews they had, while their profile's
-- reputation summary (`private.provider_reputation`, computed from the record)
-- said otherwise. Test fixtures set the columns directly, which hid it.
--
-- The three columns now follow the same rule as that summary:
--   rating_average, review_count — reviews with moderation_status 'visible'
--     and not deleted; so a hidden review, or one held for a dispute
--     ('flagged'), stops counting and counts again when restored;
--   completed_jobs — bookings whose status is 'completed'.
--
-- They are recomputed from the rows, not incremented, so a missed or repeated
-- event cannot drift them. The guard keeps refusing an end user's own write;
-- only the recomputation below, marked by a transaction-local setting no
-- client can reach, is let through.
--
-- Backfill: every Professional is recomputed once. This replaces zeros (and
-- anything a fixture or a hand edit left) with what the record says; nothing
-- is invented.

create or replace function private.prevent_provider_approval_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Unset is NULL, and a NULL here would make the whole condition NULL, which
  -- `if` reads as false: the guard would fail open for a session that has
  -- never recomputed anything. Coalesce so that unset means "not keeping".
  v_keeping_reputation boolean :=
    coalesce(pg_catalog.current_setting('warsha.keeping_reputation', true), '') = 'on';
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
      or (not v_keeping_reputation and (
        old.rating_average is distinct from new.rating_average
        or old.review_count is distinct from new.review_count
        or old.completed_jobs is distinct from new.completed_jobs))
    )
  then
    raise exception 'Protected provider fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_provider_approval_changes()
  from public, anon, authenticated;

create or replace function private.keep_provider_rating(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_average numeric;
  v_count integer;
begin
  if p_provider_id is null then return; end if;
  select coalesce(pg_catalog.round(pg_catalog.avg(r.rating), 1), 0), pg_catalog.count(*)::integer
    into v_average, v_count
  from public.reviews r
  where r.provider_id = p_provider_id
    and r.moderation_status = 'visible'
    and r.deleted_at is null;
  perform pg_catalog.set_config('warsha.keeping_reputation', 'on', true);
  update public.provider_profiles p
     set rating_average = v_average, review_count = v_count
   where p.id = p_provider_id
     and (p.rating_average, p.review_count) is distinct from (v_average, v_count);
  perform pg_catalog.set_config('warsha.keeping_reputation', 'off', true);
end;
$$;
revoke all on function private.keep_provider_rating(uuid) from public, anon, authenticated;

create or replace function private.keep_provider_completed_jobs(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed integer;
begin
  if p_provider_id is null then return; end if;
  select pg_catalog.count(*)::integer into v_completed
  from public.bookings b
  where b.provider_id = p_provider_id and b.status = 'completed';
  perform pg_catalog.set_config('warsha.keeping_reputation', 'on', true);
  update public.provider_profiles p
     set completed_jobs = v_completed
   where p.id = p_provider_id
     and p.completed_jobs is distinct from v_completed;
  perform pg_catalog.set_config('warsha.keeping_reputation', 'off', true);
end;
$$;
revoke all on function private.keep_provider_completed_jobs(uuid) from public, anon, authenticated;

create or replace function private.reviews_keep_provider_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.keep_provider_rating(old.provider_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.provider_id is distinct from old.provider_id) then
    perform private.keep_provider_rating(new.provider_id);
  end if;
  return null;
end;
$$;
revoke all on function private.reviews_keep_provider_rating() from public, anon, authenticated;

drop trigger if exists reviews_keep_provider_rating on public.reviews;
create trigger reviews_keep_provider_rating
  after insert or delete or update of rating, moderation_status, deleted_at, provider_id
  on public.reviews
  for each row execute function private.reviews_keep_provider_rating();

create or replace function private.bookings_keep_provider_completed_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      perform private.keep_provider_completed_jobs(new.provider_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'completed' then
      perform private.keep_provider_completed_jobs(old.provider_id);
    end if;
  elsif (old.status = 'completed') is distinct from (new.status = 'completed')
     or (new.status = 'completed' and new.provider_id is distinct from old.provider_id) then
    perform private.keep_provider_completed_jobs(old.provider_id);
    if new.provider_id is distinct from old.provider_id then
      perform private.keep_provider_completed_jobs(new.provider_id);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.bookings_keep_provider_completed_jobs() from public, anon, authenticated;

drop trigger if exists bookings_keep_provider_completed_jobs on public.bookings;
create trigger bookings_keep_provider_completed_jobs
  after insert or delete or update of status, provider_id
  on public.bookings
  for each row execute function private.bookings_keep_provider_completed_jobs();

-- Backfill from the record.
do $$
declare v_provider uuid;
begin
  for v_provider in select p.id from public.provider_profiles p loop
    perform private.keep_provider_rating(v_provider);
    perform private.keep_provider_completed_jobs(v_provider);
  end loop;
end $$;
