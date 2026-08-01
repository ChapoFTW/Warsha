-- WPS-011 Reviews & Reputation. Forward-only, local implementation.

create table private.review_reputation_config (
  singleton boolean primary key default true check (singleton),
  edit_window_hours integer not null check (edit_window_hours between 1 and 168),
  policy_version text not null check (pg_catalog.length(policy_version) between 1 and 40),
  updated_at timestamptz not null default pg_catalog.now()
);
insert into private.review_reputation_config(singleton, edit_window_hours, policy_version)
values (true, 72, 'wps011-v1') on conflict (singleton) do nothing;
revoke all on private.review_reputation_config from public, anon, authenticated;

alter table public.reviews
  add column if not exists professionalism_rating smallint,
  add column if not exists quality_rating smallint,
  add column if not exists punctuality_rating smallint,
  add column if not exists communication_rating smallint,
  add column if not exists value_rating smallint,
  add column if not exists edit_deadline_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists revision integer not null default 1;
update public.reviews set
  professionalism_rating = coalesce(professionalism_rating, rating),
  quality_rating = coalesce(quality_rating, rating),
  punctuality_rating = coalesce(punctuality_rating, rating),
  communication_rating = coalesce(communication_rating, rating),
  value_rating = coalesce(value_rating, rating),
  edit_deadline_at = coalesce(edit_deadline_at, created_at + interval '72 hours');
alter table public.reviews
  alter column professionalism_rating set not null,
  alter column quality_rating set not null,
  alter column punctuality_rating set not null,
  alter column communication_rating set not null,
  alter column value_rating set not null,
  alter column edit_deadline_at set not null;
alter table public.reviews drop constraint if exists reviews_dimension_ratings_check;
alter table public.reviews add constraint reviews_dimension_ratings_check check (
  professionalism_rating between 1 and 5 and quality_rating between 1 and 5 and
  punctuality_rating between 1 and 5 and communication_rating between 1 and 5 and
  value_rating between 1 and 5 and revision > 0
);
grant select(id,booking_id,customer_id,provider_id,rating,comment,is_anonymous,created_at,updated_at,deleted_at,
  professionalism_rating,quality_rating,punctuality_rating,communication_rating,value_rating,
  edit_deadline_at,edited_at,revision) on public.reviews to anon,authenticated;
create or replace function private.default_review_dimensions()
returns trigger language plpgsql set search_path='' as $$ begin
  new.professionalism_rating:=coalesce(new.professionalism_rating,new.rating);
  new.quality_rating:=coalesce(new.quality_rating,new.rating);
  new.punctuality_rating:=coalesce(new.punctuality_rating,new.rating);
  new.communication_rating:=coalesce(new.communication_rating,new.rating);
  new.value_rating:=coalesce(new.value_rating,new.rating);
  new.edit_deadline_at:=coalesce(new.edit_deadline_at,pg_catalog.now()+interval '72 hours');
  return new;
end $$;
revoke all on function private.default_review_dimensions() from public,anon,authenticated;
drop trigger if exists review_wps011_defaults on public.reviews;
create trigger review_wps011_defaults before insert on public.reviews for each row execute function private.default_review_dimensions();

alter table public.review_attachments
  add column if not exists byte_size bigint,
  add column if not exists content_hash text,
  add column if not exists sort_order integer not null default 0;
alter table public.review_attachments drop constraint if exists review_attachments_wps011_check;
alter table public.review_attachments add constraint review_attachments_wps011_check check (
  (byte_size is null or byte_size between 1 and 5242880) and
  (content_hash is null or content_hash ~ '^[a-f0-9]{32,64}$') and sort_order between 0 and 3
);
create unique index if not exists review_attachments_review_hash_unique
  on public.review_attachments(review_id, content_hash) where content_hash is not null;

create table public.review_edit_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  editor_id uuid not null references public.profiles(id),
  revision integer not null check (revision > 1),
  old_snapshot jsonb not null,
  new_snapshot jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique(review_id, revision)
);
create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  reporter_id uuid not null references public.profiles(id),
  reason text not null check (reason in ('spam','abuse','fake_review','offensive_content')),
  details text not null default '' check (pg_catalog.length(details) <= 1000),
  status text not null default 'submitted' check (status in ('submitted','in_review','resolved','dismissed')),
  assigned_to uuid references public.profiles(id),
  resolution_note text check (resolution_note is null or pg_catalog.length(resolution_note) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  unique(review_id, reporter_id)
);
create table public.review_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.review_reports(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  from_status text,
  to_status text not null,
  note text not null default '' check (pg_catalog.length(note) <= 1000),
  created_at timestamptz not null default pg_catalog.now()
);
create table public.review_helpfulness_votes (
  review_id uuid not null references public.reviews(id) on delete restrict,
  voter_id uuid not null references public.profiles(id),
  vote text not null check (vote in ('helpful','not_helpful')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(review_id, voter_id)
);
create table public.review_moderation_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('hide','restore')),
  reason text not null check (pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 1000),
  previous_status text not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index review_reports_status_created_idx on public.review_reports(status, created_at);
create index review_report_events_report_idx on public.review_report_events(report_id, created_at);
create index review_votes_review_idx on public.review_helpfulness_votes(review_id, vote);
create index review_moderation_events_review_idx on public.review_moderation_events(review_id, created_at);

alter table public.review_edit_events enable row level security;
alter table public.review_reports enable row level security;
alter table public.review_report_events enable row level security;
alter table public.review_helpfulness_votes enable row level security;
alter table public.review_moderation_events enable row level security;
revoke all on public.review_edit_events, public.review_reports, public.review_report_events,
  public.review_helpfulness_votes, public.review_moderation_events from public, anon, authenticated;
grant select on public.review_edit_events, public.review_reports, public.review_helpfulness_votes to authenticated;
grant select on public.review_report_events, public.review_moderation_events to authenticated;

create policy review_edit_events_participant_read on public.review_edit_events for select to authenticated using (
  private.is_staff() or exists (select 1 from public.reviews r join public.provider_profiles p on p.id=r.provider_id
    where r.id=review_id and (r.customer_id=(select auth.uid()) or p.user_id=(select auth.uid())))
);
create policy review_reports_owner_staff_read on public.review_reports for select to authenticated using (
  reporter_id=(select auth.uid()) or private.is_staff()
);
create policy review_report_events_staff_read on public.review_report_events for select to authenticated using (private.is_staff());
create policy review_votes_self_read on public.review_helpfulness_votes for select to authenticated using (voter_id=(select auth.uid()));
create policy review_moderation_events_staff_read on public.review_moderation_events for select to authenticated using (private.is_staff());
drop policy if exists reviews_wps011_staff_read on public.reviews;
create policy reviews_wps011_staff_read on public.reviews for select to authenticated using (private.is_staff());
drop policy if exists review_responses_wps011_staff_read on public.review_responses;
create policy review_responses_wps011_staff_read on public.review_responses for select to authenticated using (private.is_staff());
drop policy if exists review_attachments_wps011_staff_read on public.review_attachments;
create policy review_attachments_wps011_staff_read on public.review_attachments for select to authenticated using (private.is_staff());

create or replace function private.review_edit_window_hours()
returns integer language sql stable security definer set search_path='' as $$
  select edit_window_hours from private.review_reputation_config where singleton
$$;
revoke all on function private.review_edit_window_hours() from public, anon, authenticated;

create or replace function private.is_safe_review_attachment_path(p_path text, p_user uuid, p_booking uuid)
returns boolean language sql immutable set search_path='' as $$
  select p_path ~ ('^' || p_user::text || '/' || p_booking::text || '/review/[A-Za-z0-9_-]{8,100}\.(jpg|png|webp)$')
$$;
revoke all on function private.is_safe_review_attachment_path(text,uuid,uuid) from public, anon, authenticated;

create or replace function private.validate_review_attachment_paths(p_paths text[], p_user uuid, p_booking uuid)
returns void language plpgsql security definer set search_path='' as $$
declare path text; object_row record; normalized text[] := coalesce(p_paths, '{}');
begin
  if pg_catalog.cardinality(normalized) > 4 or pg_catalog.cardinality(normalized) <> (
    select pg_catalog.count(distinct value) from pg_catalog.unnest(normalized) value
  ) then raise exception 'Invalid review images' using errcode='22023'; end if;
  foreach path in array normalized loop
    if not private.is_safe_review_attachment_path(path,p_user,p_booking) then
      raise exception 'Invalid review image path' using errcode='22023';
    end if;
    select o.metadata ->> 'mimetype' mime,
           nullif(o.metadata ->> 'size','')::bigint bytes into object_row
    from storage.objects o where o.bucket_id='review-attachments' and o.name=path;
    if not found or object_row.mime not in ('image/jpeg','image/png','image/webp')
       or object_row.bytes is null or object_row.bytes not between 1 and 5242880 then
      raise exception 'Invalid review image' using errcode='22023';
    end if;
  end loop;
end $$;
revoke all on function private.validate_review_attachment_paths(text[],uuid,uuid) from public, anon, authenticated;

create or replace function private.review_json(p_review_id uuid, p_include_private boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'id',r.id,'booking_id',r.booking_id,'provider_id',r.provider_id,
    'reviewer_name',case when r.is_anonymous then 'Customer' else pg_catalog.left(coalesce(pr.display_name,'Customer'),1)||'.' end,
    'rating',r.rating,'professionalism_rating',r.professionalism_rating,'quality_rating',r.quality_rating,
    'punctuality_rating',r.punctuality_rating,'communication_rating',r.communication_rating,'value_rating',r.value_rating,
    'comment',r.comment,'created_at',r.created_at,'edited_at',r.edited_at,'verified_booking',true,
    'edit_deadline_at',case when p_include_private then r.edit_deadline_at else null end,
    'can_edit',p_include_private and r.customer_id=(select auth.uid()) and pg_catalog.now()<=r.edit_deadline_at,
    'image_refs',coalesce((select pg_catalog.jsonb_agg(a.storage_path order by a.sort_order,a.id) from public.review_attachments a where a.review_id=r.id),'[]'::jsonb),
    'review_responses',case when rr.id is null then '[]'::jsonb else pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',rr.id,'body',rr.body,'created_at',rr.created_at)) end,
    'helpful_count',(select pg_catalog.count(*) from public.review_helpfulness_votes v where v.review_id=r.id and v.vote='helpful'),
    'not_helpful_count',(select pg_catalog.count(*) from public.review_helpfulness_votes v where v.review_id=r.id and v.vote='not_helpful'),
    'my_vote',(select v.vote from public.review_helpfulness_votes v where v.review_id=r.id and v.voter_id=(select auth.uid()))
  )
  from public.reviews r join public.profiles pr on pr.id=r.customer_id
  left join public.review_responses rr on rr.review_id=r.id where r.id=p_review_id
$$;
revoke all on function private.review_json(uuid,boolean) from public, anon, authenticated;

create or replace function public.submit_booking_review_v2(
  p_booking_id uuid, p_rating smallint, p_professionalism smallint, p_quality smallint,
  p_punctuality smallint, p_communication smallint, p_value smallint,
  p_comment text default null, p_is_anonymous boolean default false, p_attachment_paths text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); booking_row public.bookings%rowtype; result public.reviews%rowtype;
  normalized_comment text := nullif(pg_catalog.btrim(coalesce(p_comment,'')),''); path text; inserted boolean := false;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_rating not between 1 and 5 or p_professionalism not between 1 and 5 or p_quality not between 1 and 5
    or p_punctuality not between 1 and 5 or p_communication not between 1 and 5 or p_value not between 1 and 5
    then raise exception 'Invalid rating' using errcode='22023'; end if;
  if normalized_comment is not null and pg_catalog.length(normalized_comment)>2000 then raise exception 'Invalid review' using errcode='22023'; end if;
  select * into booking_row from public.bookings where id=p_booking_id and customer_id=uid and status='completed';
  if not found or exists(select 1 from public.provider_profiles p where p.id=booking_row.provider_id and p.user_id=uid)
    then raise exception 'Review is not available' using errcode='42501'; end if;
  perform private.validate_review_attachment_paths(p_attachment_paths,uid,p_booking_id);
  insert into public.reviews(booking_id,customer_id,provider_id,rating,professionalism_rating,quality_rating,
    punctuality_rating,communication_rating,value_rating,comment,is_anonymous,edit_deadline_at)
  values(p_booking_id,uid,booking_row.provider_id,p_rating,p_professionalism,p_quality,p_punctuality,p_communication,p_value,
    normalized_comment,coalesce(p_is_anonymous,false),pg_catalog.now()+pg_catalog.make_interval(hours=>private.review_edit_window_hours()))
  on conflict(booking_id) do nothing returning * into result;
  inserted := found;
  if result.id is null then select * into result from public.reviews where booking_id=p_booking_id and customer_id=uid; end if;
  if result.id is null then raise exception 'Review is not available' using errcode='42501'; end if;
  foreach path in array coalesce(p_attachment_paths,'{}') loop
    insert into public.review_attachments(review_id,storage_path,mime_type,byte_size,content_hash,sort_order)
    select result.id,path,o.metadata->>'mimetype',(o.metadata->>'size')::bigint,
      pg_catalog.lower((pg_catalog.regexp_match(path,'/([a-fA-F0-9]{32,64})\.(?:jpg|png|webp)$'))[1]),
      pg_catalog.array_position(p_attachment_paths,path)-1 from storage.objects o
    where o.bucket_id='review-attachments' and o.name=path on conflict(storage_path) do nothing;
  end loop;
  if inserted then
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    select p.user_id,'new_review','New review','A customer rated a completed booking.',
      pg_catalog.jsonb_build_object('booking_id',p_booking_id,'review_id',result.id),result.id::text
    from public.provider_profiles p where p.id=result.provider_id and p.user_id is not null and p.user_id<>uid on conflict do nothing;
  end if;
  return private.review_json(result.id,true);
end $$;

create or replace function public.edit_booking_review(
  p_review_id uuid, p_rating smallint, p_professionalism smallint, p_quality smallint,
  p_punctuality smallint, p_communication smallint, p_value smallint,
  p_comment text default null, p_is_anonymous boolean default false, p_attachment_paths text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); row_before public.reviews%rowtype; normalized_comment text:=nullif(pg_catalog.btrim(coalesce(p_comment,'')),''); path text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_rating not between 1 and 5 or p_professionalism not between 1 and 5 or p_quality not between 1 and 5
    or p_punctuality not between 1 and 5 or p_communication not between 1 and 5 or p_value not between 1 and 5
    then raise exception 'Invalid rating' using errcode='22023'; end if;
  if normalized_comment is not null and pg_catalog.length(normalized_comment)>2000 then raise exception 'Invalid review' using errcode='22023'; end if;
  select * into row_before from public.reviews where id=p_review_id and customer_id=uid and deleted_at is null for update;
  if not found or pg_catalog.now()>row_before.edit_deadline_at then raise exception 'Review edit window has closed' using errcode='42501'; end if;
  perform private.validate_review_attachment_paths(p_attachment_paths,uid,row_before.booking_id);
  insert into public.review_edit_events(review_id,editor_id,revision,old_snapshot,new_snapshot)
  values(p_review_id,uid,row_before.revision+1,pg_catalog.to_jsonb(row_before)-array['moderation_reason','moderated_by']::text[],
    pg_catalog.jsonb_build_object('rating',p_rating,'professionalism_rating',p_professionalism,'quality_rating',p_quality,
      'punctuality_rating',p_punctuality,'communication_rating',p_communication,'value_rating',p_value,
      'comment',normalized_comment,'is_anonymous',coalesce(p_is_anonymous,false)));
  update public.reviews set rating=p_rating,professionalism_rating=p_professionalism,quality_rating=p_quality,
    punctuality_rating=p_punctuality,communication_rating=p_communication,value_rating=p_value,
    comment=normalized_comment,is_anonymous=coalesce(p_is_anonymous,false),edited_at=pg_catalog.now(),
    updated_at=pg_catalog.now(),revision=revision+1 where id=p_review_id;
  delete from public.review_attachments where review_id=p_review_id and storage_path<>all(coalesce(p_attachment_paths,'{}'));
  foreach path in array coalesce(p_attachment_paths,'{}') loop
    insert into public.review_attachments(review_id,storage_path,mime_type,byte_size,content_hash,sort_order)
    select p_review_id,path,o.metadata->>'mimetype',(o.metadata->>'size')::bigint,
      pg_catalog.lower((pg_catalog.regexp_match(path,'/([a-fA-F0-9]{32,64})\.(?:jpg|png|webp)$'))[1]),
      pg_catalog.array_position(p_attachment_paths,path)-1 from storage.objects o
    where o.bucket_id='review-attachments' and o.name=path
    on conflict(storage_path) do update set sort_order=excluded.sort_order;
  end loop;
  return private.review_json(p_review_id,true);
end $$;

create or replace function public.get_booking_review_v2(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); review_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select r.id into review_id from public.reviews r join public.provider_profiles p on p.id=r.provider_id
  where r.booking_id=p_booking_id and (r.customer_id=uid or p.user_id=uid or private.is_staff());
  if review_id is null then return null; end if;
  return private.review_json(review_id,true);
end $$;

create or replace function public.vote_review_helpfulness(p_review_id uuid,p_vote text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); row_review public.reviews%rowtype;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_vote not in ('helpful','not_helpful') then raise exception 'Invalid vote' using errcode='22023'; end if;
  select * into row_review from public.reviews where id=p_review_id and moderation_status='visible' and deleted_at is null;
  if not found or row_review.customer_id=uid or exists(select 1 from public.provider_profiles p where p.id=row_review.provider_id and p.user_id=uid)
    then raise exception 'Vote is not available' using errcode='42501'; end if;
  insert into public.review_helpfulness_votes(review_id,voter_id,vote) values(p_review_id,uid,p_vote)
  on conflict(review_id,voter_id) do update set vote=excluded.vote,updated_at=pg_catalog.now();
  return pg_catalog.jsonb_build_object('review_id',p_review_id,'vote',p_vote,
    'helpful_count',(select pg_catalog.count(*) from public.review_helpfulness_votes where review_id=p_review_id and vote='helpful'),
    'not_helpful_count',(select pg_catalog.count(*) from public.review_helpfulness_votes where review_id=p_review_id and vote='not_helpful'));
end $$;

create or replace function public.report_review(p_review_id uuid,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); result public.review_reports%rowtype; details text:=pg_catalog.btrim(coalesce(p_details,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_reason not in ('spam','abuse','fake_review','offensive_content') or pg_catalog.length(details)>1000
    then raise exception 'Invalid report' using errcode='22023'; end if;
  if not exists(select 1 from public.reviews where id=p_review_id and moderation_status='visible' and deleted_at is null)
    then raise exception 'Report is not available' using errcode='42501'; end if;
  insert into public.review_reports(review_id,reporter_id,reason,details) values(p_review_id,uid,p_reason,details)
  on conflict(review_id,reporter_id) do update set reason=excluded.reason,details=excluded.details,
    status=case when public.review_reports.status in ('resolved','dismissed') then 'submitted' else public.review_reports.status end,
    updated_at=pg_catalog.now(),resolved_at=null,resolution_note=null returning * into result;
  return pg_catalog.jsonb_build_object('id',result.id,'review_id',result.review_id,'reason',result.reason,'status',result.status,'created_at',result.created_at);
end $$;

create or replace function public.review_report_transition(p_report_id uuid,p_status text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); old_row public.review_reports%rowtype; next_note text:=pg_catalog.btrim(coalesce(p_note,''));
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_status not in ('in_review','resolved','dismissed') or pg_catalog.length(next_note)>1000 then raise exception 'Invalid report transition' using errcode='22023'; end if;
  select * into old_row from public.review_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  update public.review_reports set status=p_status,assigned_to=uid,resolution_note=nullif(next_note,''),updated_at=pg_catalog.now(),
    resolved_at=case when p_status in ('resolved','dismissed') then pg_catalog.now() else null end where id=p_report_id;
  insert into public.review_report_events(report_id,actor_id,from_status,to_status,note) values(p_report_id,uid,old_row.status,p_status,next_note);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(uid,'review_report_transition','review_report',p_report_id,pg_catalog.jsonb_build_object('status',old_row.status),pg_catalog.jsonb_build_object('status',p_status));
  return pg_catalog.jsonb_build_object('id',p_report_id,'status',p_status);
end $$;

create or replace function public.moderate_review(p_review_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); old_status text; reason text:=pg_catalog.btrim(coalesce(p_reason,'')); next_status text;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action not in ('hide','restore') or pg_catalog.length(reason) not between 1 and 1000 then raise exception 'Invalid moderation action' using errcode='22023'; end if;
  select moderation_status into old_status from public.reviews where id=p_review_id and deleted_at is null for update;
  if not found then raise exception 'Review not found' using errcode='P0002'; end if;
  next_status:=case when p_action='hide' then 'hidden' else 'visible' end;
  update public.reviews set moderation_status=next_status,moderation_reason=reason,moderated_by=uid,moderated_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_review_id;
  insert into public.review_moderation_events(review_id,actor_id,action,reason,previous_status) values(p_review_id,uid,p_action,reason,old_status);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(uid,'review_'||p_action,'review',p_review_id,pg_catalog.jsonb_build_object('moderation_status',old_status),pg_catalog.jsonb_build_object('moderation_status',next_status));
  return pg_catalog.jsonb_build_object('id',p_review_id,'moderation_status',next_status);
end $$;

create or replace function private.provider_reputation(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare avg_rating numeric:=0; review_count integer:=0; completed_count integer:=0; eligible_invites integer:=0; responded_invites integer:=0;
  failure_count integer:=0; customer_count integer:=0; repeat_count integer:=0; response_rate numeric; completion_rate numeric; repeat_rate numeric;
  years integer:=0; rating_points numeric:=0; confidence integer:=0; trust jsonb;
begin
  select coalesce(pg_catalog.avg(r.rating),0),pg_catalog.count(*) into avg_rating,review_count from public.reviews r
    where r.provider_id=p_provider_id and r.moderation_status='visible' and r.deleted_at is null;
  select pg_catalog.count(*) into completed_count from public.bookings b where b.provider_id=p_provider_id and b.status='completed';
  select pg_catalog.count(*),pg_catalog.count(*) filter(where q.responded_at is not null or q.status in ('quoted','declined','withdrawn','accepted'))
    into eligible_invites,responded_invites from public.quote_invitations q where q.provider_id=p_provider_id
      and q.invited_at>=pg_catalog.now()-interval '180 days' and q.status not in ('worker_ineligible','request_closed');
  select pg_catalog.count(*) into failure_count from (
    select c.booking_id from public.marketplace_cancellation_events c where c.booking_id is not null and c.actor_class='worker'
      and exists(select 1 from public.bookings b where b.id=c.booking_id and b.provider_id=p_provider_id)
    union select n.booking_id from public.marketplace_no_show_events n where n.reported_party_class='worker' and n.review_state='confirmed'
      and exists(select 1 from public.bookings b where b.id=n.booking_id and b.provider_id=p_provider_id)
  ) f;
  select pg_catalog.count(*),pg_catalog.count(*) filter(where jobs>=2) into customer_count,repeat_count from (
    select b.customer_id,pg_catalog.count(*) jobs from public.bookings b where b.provider_id=p_provider_id and b.status='completed' group by b.customer_id
  ) customers;
  select greatest(0,pg_catalog.floor(extract(epoch from (pg_catalog.now()-p.created_at))/(365.25*86400)))::integer into years
    from public.provider_profiles p where p.id=p_provider_id;
  response_rate:=case when eligible_invites>0 then pg_catalog.round(responded_invites*100.0/eligible_invites,1) end;
  completion_rate:=case when completed_count+failure_count>0 then pg_catalog.round(completed_count*100.0/(completed_count+failure_count),1) end;
  repeat_rate:=case when customer_count>0 then pg_catalog.round(repeat_count*100.0/customer_count,1) end;
  rating_points:=least(40,avg_rating/5*40);
  confidence:=pg_catalog.round(rating_points + coalesce(completion_rate,0)*.25 + coalesce(response_rate,0)*.15 + coalesce(repeat_rate,0)*.10 + least(review_count,20)*.5)::integer;
  trust:=public.get_provider_trust_indicators(p_provider_id);
  return pg_catalog.jsonb_build_object(
    'average',pg_catalog.round(avg_rating,1),'count',review_count,
    'distribution',pg_catalog.jsonb_build_object('1',(select pg_catalog.count(*) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null and rating=1),'2',(select pg_catalog.count(*) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null and rating=2),'3',(select pg_catalog.count(*) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null and rating=3),'4',(select pg_catalog.count(*) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null and rating=4),'5',(select pg_catalog.count(*) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null and rating=5)),
    'dimensions',coalesce((select pg_catalog.jsonb_build_object('professionalism',pg_catalog.round(pg_catalog.avg(professionalism_rating),1),'quality',pg_catalog.round(pg_catalog.avg(quality_rating),1),'punctuality',pg_catalog.round(pg_catalog.avg(punctuality_rating),1),'communication',pg_catalog.round(pg_catalog.avg(communication_rating),1),'value',pg_catalog.round(pg_catalog.avg(value_rating),1)) from public.reviews where provider_id=p_provider_id and moderation_status='visible' and deleted_at is null),pg_catalog.jsonb_build_object('professionalism',0,'quality',0,'punctuality',0,'communication',0,'value',0)),
    'completed_jobs',completed_count,'response_rate',response_rate,'response_sample',eligible_invites,
    'completion_rate',completion_rate,'completion_sample',completed_count+failure_count,
    'repeat_customer_percentage',repeat_rate,'repeat_customer_sample',customer_count,'years_on_platform',coalesce(years,0),
    'badges',trust||pg_catalog.jsonb_build_object('topRated',review_count>=20 and avg_rating>=4.7 and completion_rate>=90,'fastResponder',eligible_invites>=10 and response_rate>=90,'experienced',completed_count>=50 or years>=3),
    'confidence',pg_catalog.jsonb_build_object('score',confidence,'policy_version','wps011-v1','evidence_sufficient',review_count>=5 and (completion_rate is not null or response_rate is not null))
  );
end $$;
revoke all on function private.provider_reputation(uuid) from public, anon, authenticated;

create or replace function public.get_provider_reputation_summary(p_provider_id uuid,p_sort text default 'newest',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_sort not in ('newest','highest_rated','lowest_rated','most_helpful') or p_limit not between 1 and 50 or p_offset not between 0 and 10000
    then raise exception 'Invalid review query' using errcode='22023'; end if;
  if not private.is_provider_publicly_discoverable(p_provider_id) then return '{}'::jsonb; end if;
  with scored as (
    select r.id,coalesce((select pg_catalog.count(*) from public.review_helpfulness_votes v where v.review_id=r.id and v.vote='helpful'),0) helpful
    from public.reviews r where r.provider_id=p_provider_id and r.moderation_status='visible' and r.deleted_at is null
  ), ordered as (
    select s.*,pg_catalog.row_number() over(order by
      case when p_sort='highest_rated' then r.rating end desc,
      case when p_sort='lowest_rated' then r.rating end asc,
      case when p_sort='most_helpful' then s.helpful end desc,
      r.created_at desc,r.id) seq
    from scored s join public.reviews r on r.id=s.id order by seq limit p_limit offset p_offset
  ) select private.provider_reputation(p_provider_id)||pg_catalog.jsonb_build_object('sort',p_sort,'reviews',
      coalesce(pg_catalog.jsonb_agg(private.review_json(o.id,false) order by o.seq),'[]'::jsonb)) into result from ordered o;
  return coalesce(result,private.provider_reputation(p_provider_id)||pg_catalog.jsonb_build_object('sort',p_sort,'reviews','[]'::jsonb));
end $$;

create or replace function public.get_marketplace_catalog_v2()
returns jsonb language sql stable security definer set search_path='' as $$
  with base as (select public.get_marketplace_catalog() value)
  select pg_catalog.jsonb_set(value,'{providers}',coalesce((select pg_catalog.jsonb_agg(provider||pg_catalog.jsonb_build_object('reputation',private.provider_reputation((provider->>'id')::uuid))) from pg_catalog.jsonb_array_elements(value->'providers') provider),'[]'::jsonb)) from base
$$;

create or replace function private.is_public_review_attachment(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.review_attachments a join public.reviews r on r.id=a.review_id
    where a.storage_path=p_path and r.moderation_status='visible' and r.deleted_at is null
      and private.is_provider_publicly_discoverable(r.provider_id))
$$;
revoke all on function private.is_public_review_attachment(text) from public;
grant execute on function private.is_public_review_attachment(text) to anon,authenticated;
drop policy if exists review_attachment_public_signed_read on storage.objects;
create policy review_attachment_public_signed_read on storage.objects for select to anon,authenticated using (
  bucket_id='review-attachments' and private.is_public_review_attachment(name)
);

do $$ begin
  if exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='review_attachments') then
    alter publication supabase_realtime drop table public.review_attachments;
  end if;
end $$;

do $$ declare signature text; begin foreach signature in array array[
  'submit_booking_review_v2(uuid,smallint,smallint,smallint,smallint,smallint,smallint,text,boolean,text[])',
  'edit_booking_review(uuid,smallint,smallint,smallint,smallint,smallint,smallint,text,boolean,text[])',
  'get_booking_review_v2(uuid)','vote_review_helpfulness(uuid,text)','report_review(uuid,text,text)'
] loop execute pg_catalog.format('revoke all on function public.%s from public, anon, authenticated',signature);
  execute pg_catalog.format('grant execute on function public.%s to authenticated',signature); end loop; end $$;
revoke all on function public.review_report_transition(uuid,text,text),public.moderate_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_report_transition(uuid,text,text),public.moderate_review(uuid,text,text) to authenticated;
revoke all on function public.get_provider_reputation_summary(uuid,text,integer,integer),public.get_marketplace_catalog_v2() from public,anon,authenticated;
grant execute on function public.get_provider_reputation_summary(uuid,text,integer,integer),public.get_marketplace_catalog_v2() to anon,authenticated;
