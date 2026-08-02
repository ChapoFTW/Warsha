-- WPS-013 Disputes & Resolution. Forward-only; no hosted execution is authorized here.

create table private.dispute_policy_config (
  singleton boolean primary key default true check (singleton),
  post_completion_window_hours integer not null check (post_completion_window_hours between 24 and 720),
  warranty_grace_hours integer not null check (warranty_grace_hours between 0 and 168),
  no_show_window_hours integer not null check (no_show_window_hours between 1 and 168),
  max_evidence_files integer not null check (max_evidence_files between 1 and 20),
  max_evidence_bytes bigint not null check (max_evidence_bytes between 1048576 and 20971520),
  policy_version text not null check (pg_catalog.length(policy_version) between 1 and 40),
  updated_at timestamptz not null default pg_catalog.now()
);
insert into private.dispute_policy_config(
  singleton,post_completion_window_hours,warranty_grace_hours,no_show_window_hours,
  max_evidence_files,max_evidence_bytes,policy_version
) values(true,336,72,48,10,8388608,'wps013-v1') on conflict(singleton) do nothing;
revoke all on private.dispute_policy_config from public,anon,authenticated;

alter table public.disputes
  add column if not exists opened_by_role text not null default 'customer',
  add column if not exists policy_version text not null default 'wps013-v1',
  add column if not exists eligible_until timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists assigned_at timestamptz,
  add column if not exists review_started_at timestamptz,
  add column if not exists resolution_type text,
  add column if not exists resolution_summary text,
  add column if not exists resolution_financial_action text,
  add column if not exists financial_reference_type text,
  add column if not exists financial_reference_id uuid,
  add column if not exists return_visit_id uuid references public.booking_return_visits(id),
  add column if not exists resolved_by uuid references public.profiles(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists idempotency_key text;

update public.disputes set
  status=case when pg_catalog.lower(status) in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review','resolved','closed','rejected','cancelled') then pg_catalog.lower(status) else 'submitted' end,
  reason=case when reason in ('work_incomplete','poor_quality','property_damage','incorrect_additional_work','pricing_disagreement','warranty_disagreement','worker_never_arrived','customer_unavailable','safety_issue','other') then reason else 'other' end,
  opened_by_role=case when opened_by_role in ('customer','worker') then opened_by_role else 'customer' end,
  submitted_at=case when status<>'draft' then coalesce(submitted_at,created_at) else submitted_at end,
  policy_version=coalesce(nullif(policy_version,''),'wps013-v1');

alter table public.disputes
  drop constraint if exists disputes_status_check,
  drop constraint if exists disputes_reason_check,
  drop constraint if exists disputes_opened_by_role_check,
  drop constraint if exists disputes_description_check,
  drop constraint if exists disputes_resolution_type_check,
  drop constraint if exists disputes_resolution_financial_action_check,
  drop constraint if exists disputes_resolution_shape_check,
  add constraint disputes_status_check check(status in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review','resolved','closed','rejected','cancelled')),
  add constraint disputes_reason_check check(reason in ('work_incomplete','poor_quality','property_damage','incorrect_additional_work','pricing_disagreement','warranty_disagreement','worker_never_arrived','customer_unavailable','safety_issue','other')),
  add constraint disputes_opened_by_role_check check(opened_by_role in ('customer','worker')),
  add constraint disputes_description_check check(pg_catalog.length(pg_catalog.btrim(description)) between 10 and 4000),
  add constraint disputes_resolution_type_check check(resolution_type is null or resolution_type in ('booking_upheld','partial_compensation','return_visit','warranty_work','no_action','administrative_action','other')),
  add constraint disputes_resolution_financial_action_check check(resolution_financial_action is null or resolution_financial_action in ('none','pre_release_refund','post_release_case')),
  add constraint disputes_resolution_shape_check check(
    (status not in ('resolved','closed') or (resolution_type is not null and resolved_at is not null and resolved_by is not null and pg_catalog.length(pg_catalog.btrim(resolution_summary)) between 3 and 2000))
  );

create unique index disputes_one_active_booking_idx on public.disputes(booking_id)
where status in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review');
create unique index disputes_opener_idempotency_idx on public.disputes(opened_by,idempotency_key) where idempotency_key is not null;
create index disputes_booking_created_idx on public.disputes(booking_id,created_at desc);
create index disputes_status_updated_idx on public.disputes(status,updated_at desc);

alter table public.dispute_evidence
  add column if not exists booking_id uuid references public.bookings(id),
  add column if not exists mime_type text,
  add column if not exists byte_size bigint,
  add column if not exists file_name text,
  add column if not exists content_hash text,
  add column if not exists client_id text;
update public.dispute_evidence e set booking_id=d.booking_id from public.disputes d where d.id=e.dispute_id and e.booking_id is null;
alter table public.dispute_evidence alter column booking_id set not null;
alter table public.dispute_evidence
  drop constraint if exists dispute_evidence_mime_check,
  drop constraint if exists dispute_evidence_size_check,
  drop constraint if exists dispute_evidence_name_check,
  drop constraint if exists dispute_evidence_hash_check,
  add constraint dispute_evidence_mime_check check(mime_type is null or mime_type in ('image/jpeg','image/png','image/webp','image/heic','application/pdf')),
  add constraint dispute_evidence_size_check check(byte_size is null or byte_size between 1 and 8388608),
  add constraint dispute_evidence_name_check check(file_name is null or (pg_catalog.length(pg_catalog.btrim(file_name)) between 1 and 120 and pg_catalog.strpos(file_name,'/')=0 and pg_catalog.strpos(file_name,pg_catalog.chr(92))=0 and file_name !~ '[[:cntrl:]]')),
  add constraint dispute_evidence_hash_check check(content_hash is null or content_hash ~ '^[a-f0-9]{32,64}$');
create unique index dispute_evidence_storage_unique on public.dispute_evidence(storage_path);
create unique index dispute_evidence_hash_unique on public.dispute_evidence(dispute_id,content_hash) where content_hash is not null;
create unique index dispute_evidence_client_unique on public.dispute_evidence(dispute_id,uploader_id,client_id) where client_id is not null;
create index dispute_evidence_timeline_idx on public.dispute_evidence(dispute_id,created_at,id);

create table public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  state text not null check(state in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review','resolved','closed','rejected','cancelled')),
  event_type text not null check(event_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  actor_class text not null check(actor_class in ('customer','worker','staff','system')),
  actor_id uuid references public.profiles(id),
  visibility text not null default 'participants' check(visibility in ('participants','staff')),
  note text check(note is null or pg_catalog.length(note) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null check(pg_catalog.length(idempotency_key) between 8 and 240),
  created_at timestamptz not null default pg_catalog.now(),
  unique(dispute_id,idempotency_key)
);
create index dispute_events_timeline_idx on public.dispute_events(dispute_id,created_at,id);
create index dispute_events_booking_idx on public.dispute_events(booking_id,created_at,id);
create unique index dispute_system_message_source_unique on public.messages((metadata->>'source_event_id'))
where metadata ? 'source_event_id' and metadata->>'event' like 'dispute_%';

alter table public.reviews add column if not exists dispute_publication_hold_id uuid references public.disputes(id);
create index reviews_dispute_publication_hold_idx on public.reviews(dispute_publication_hold_id) where dispute_publication_hold_id is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dispute-evidence','dispute-evidence',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.dispute_is_active(p_status text)
returns boolean language sql immutable set search_path='' as $$
  select p_status in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review')
$$;

create or replace function private.dispute_is_publication_hold(p_status text)
returns boolean language sql immutable set search_path='' as $$
  select p_status in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review')
$$;

create or replace function private.dispute_actor(p_booking_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when b.customer_id=(select auth.uid()) then 'customer'
    when p.user_id=(select auth.uid()) then 'worker'
    when private.is_staff() then 'staff'
  end
  from public.bookings b join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and b.deleted_at is null
$$;

create or replace function private.dispute_eligible_until(p_booking_id uuid)
returns timestamptz language plpgsql stable security definer set search_path='' as $$
declare booking_row public.bookings; config private.dispute_policy_config; terminal_at timestamptz; warranty_end timestamptz;
begin
  select * into booking_row from public.bookings where id=p_booking_id and deleted_at is null;
  select * into config from private.dispute_policy_config where singleton;
  if booking_row.id is null then return null; end if;
  if booking_row.status in ('confirmed','provider_on_the_way','provider_arrived','job_started','work_in_progress') then return 'infinity'::timestamptz; end if;
  if booking_row.status='completed' then
    select min(created_at) into terminal_at from public.booking_status_history where booking_id=p_booking_id and status='completed';
    select warranty_ends_at into warranty_end from public.booking_operations where booking_id=p_booking_id;
    return greatest(coalesce(terminal_at,booking_row.updated_at)+pg_catalog.make_interval(hours=>config.post_completion_window_hours),coalesce(warranty_end,'-infinity'::timestamptz)+pg_catalog.make_interval(hours=>config.warranty_grace_hours));
  end if;
  if (booking_row.status='cancelled' and booking_row.cancellation_reason='worker_no_show') or booking_row.status='no_show' then
    select max(created_at) into terminal_at from public.booking_status_history where booking_id=p_booking_id and status=booking_row.status;
    return coalesce(terminal_at,booking_row.updated_at)+pg_catalog.make_interval(hours=>config.no_show_window_hours);
  end if;
  if booking_row.status='disputed' then return booking_row.updated_at+pg_catalog.make_interval(hours=>config.post_completion_window_hours); end if;
  return null;
end $$;

create or replace function private.dispute_can_transition(p_from text,p_to text)
returns boolean language sql immutable set search_path='' as $$
  select case p_from
    when 'draft' then p_to in ('submitted','cancelled')
    when 'submitted' then p_to in ('waiting_customer','waiting_worker','waiting_staff','under_review','rejected','cancelled')
    when 'waiting_customer' then p_to in ('waiting_staff','under_review','cancelled')
    when 'waiting_worker' then p_to in ('waiting_staff','under_review','cancelled')
    when 'waiting_staff' then p_to in ('waiting_customer','waiting_worker','under_review','resolved','rejected','cancelled')
    when 'under_review' then p_to in ('waiting_customer','waiting_worker','resolved','rejected')
    when 'resolved' then p_to='closed'
    when 'rejected' then p_to='closed'
    else false end
$$;

create or replace function private.append_dispute_event(
  p_dispute_id uuid,p_booking_id uuid,p_state text,p_event_type text,p_actor_class text,
  p_actor_id uuid,p_visibility text,p_note text,p_metadata jsonb,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  insert into public.dispute_events(dispute_id,booking_id,state,event_type,actor_class,actor_id,visibility,note,metadata,idempotency_key)
  values(p_dispute_id,p_booking_id,p_state,p_event_type,p_actor_class,p_actor_id,p_visibility,nullif(pg_catalog.btrim(coalesce(p_note,'')),''),coalesce(p_metadata,'{}'::jsonb),p_idempotency_key)
  on conflict(dispute_id,idempotency_key) do nothing returning id into event_id;
  if event_id is null then select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key; end if;
  return event_id;
end $$;

create or replace function private.reject_dispute_event_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Dispute history is immutable' using errcode='55000'; end $$;
create trigger dispute_events_immutable before update or delete on public.dispute_events for each row execute function private.reject_dispute_event_mutation();

create or replace function private.is_safe_dispute_evidence_path(p_path text,p_user uuid,p_booking uuid,p_dispute uuid)
returns boolean language sql immutable set search_path='' as $$
  select p_path ~ ('^'||p_user::text||'/'||p_booking::text||'/'||p_dispute::text||'/evidence/[A-Za-z0-9-]{12,100}\.(jpg|jpeg|png|webp|heic|pdf)$')
    and p_path !~ '(\.\.|//|\\)'
$$;

create or replace function private.bootstrap_dispute_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.append_dispute_event(new.id,new.booking_id,new.status,case when new.status='draft' then 'draft_created' else 'submitted' end,
    new.opened_by_role,new.opened_by,'participants',new.description,'{}'::jsonb,'bootstrap:'||new.id::text);
  return new;
end $$;
create trigger bootstrap_dispute_event after insert on public.disputes for each row execute function private.bootstrap_dispute_event();

revoke all on function private.dispute_is_active(text),private.dispute_is_publication_hold(text),private.dispute_actor(uuid),private.dispute_eligible_until(uuid),private.dispute_can_transition(text,text),private.append_dispute_event(uuid,uuid,text,text,text,uuid,text,text,jsonb,text),private.reject_dispute_event_mutation(),private.is_safe_dispute_evidence_path(text,uuid,uuid,uuid),private.bootstrap_dispute_event() from public,anon,authenticated;

create or replace function public.get_booking_dispute(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); viewer_role text; dispute_row public.disputes; result jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  viewer_role:=private.dispute_actor(p_booking_id);
  if viewer_role is null then raise exception 'Dispute not found' using errcode='42501'; end if;
  select * into dispute_row from public.disputes d where d.booking_id=p_booking_id
    and (viewer_role in ('customer','staff') or d.status<>'draft')
    order by private.dispute_is_active(d.status) desc,d.created_at desc limit 1;
  if dispute_row.id is null then return null; end if;
  select pg_catalog.jsonb_build_object(
    'id',dispute_row.id,'bookingId',dispute_row.booking_id,'viewerRole',viewer_role,
    'openedByRole',dispute_row.opened_by_role,'reason',dispute_row.reason,'state',dispute_row.status,
    'description',dispute_row.description,'eligibleUntil',dispute_row.eligible_until,
    'createdAt',dispute_row.created_at,'submittedAt',dispute_row.submitted_at,
    'reviewStartedAt',dispute_row.review_started_at,'resolvedAt',dispute_row.resolved_at,'closedAt',dispute_row.closed_at,
    'resolution',case when dispute_row.resolution_type is null then null else pg_catalog.jsonb_build_object(
      'type',dispute_row.resolution_type,'summary',dispute_row.resolution_summary,
      'financialAction',coalesce(dispute_row.resolution_financial_action,'none'),
      'financialReferenceType',case when viewer_role='staff' then dispute_row.financial_reference_type end,
      'financialReferenceId',case when viewer_role='staff' then dispute_row.financial_reference_id end,
      'returnVisitId',dispute_row.return_visit_id) end,
    'assignedTo',case when viewer_role='staff' then dispute_row.assigned_to end,
    'events',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',e.id,'state',e.state,'eventType',e.event_type,'actor',e.actor_class,
      'note',e.note,'metadata',e.metadata,'visibility',e.visibility,'createdAt',e.created_at
    ) order by e.created_at,e.id),'[]'::jsonb) from public.dispute_events e
      where e.dispute_id=dispute_row.id and (viewer_role='staff' or e.visibility='participants')),
    'evidence',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',e.id,'uploaderRole',case when e.uploader_id=b.customer_id then 'customer' else 'worker' end,
      'storagePath',e.storage_path,'mimeType',e.mime_type,'byteSize',e.byte_size,'fileName',e.file_name,'createdAt',e.created_at
    ) order by e.created_at,e.id),'[]'::jsonb) from public.dispute_evidence e join public.bookings b on b.id=e.booking_id where e.dispute_id=dispute_row.id),
    'evidenceSources',pg_catalog.jsonb_build_object(
      'bookingTimeline',(select pg_catalog.count(*) from public.booking_status_history h where h.booking_id=p_booking_id),
      'attachments',(select pg_catalog.count(*) from public.booking_attachments a where a.booking_id=p_booking_id),
      'messages',(select pg_catalog.count(*) from public.messages m where m.booking_id=p_booking_id and m.deleted_at is null),
      'operationEvents',(select pg_catalog.count(*) from public.booking_operation_events e where e.booking_id=p_booking_id),
      'progressPhotos',(select pg_catalog.count(*) from public.job_progress_media m where m.booking_id=p_booking_id),
      'additionalWork',(select pg_catalog.count(*) from public.booking_additional_work_requests a where a.booking_id=p_booking_id),
      'returnVisits',(select pg_catalog.count(*) from public.booking_return_visits r where r.booking_id=p_booking_id),
      'reviews',(select pg_catalog.count(*) from public.reviews r where r.booking_id=p_booking_id),
      'reviewReplies',(select pg_catalog.count(*) from public.review_responses rr join public.reviews r on r.id=rr.review_id where r.booking_id=p_booking_id),
      'noShowReports',(select pg_catalog.count(*) from public.marketplace_no_show_events n where n.booking_id=p_booking_id),
      'warrantyRecorded',exists(select 1 from public.booking_operations o where o.booking_id=p_booking_id and o.warranty_kind<>'none')
    )
  ) into result;
  return result;
end $$;

create or replace function public.create_booking_dispute_draft(
  p_booking_id uuid,p_reason text,p_description text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); booking_row public.bookings; eligible timestamptz; dispute_id uuid; existing uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_reason not in ('work_incomplete','poor_quality','property_damage','incorrect_additional_work','pricing_disagreement','warranty_disagreement','worker_never_arrived','customer_unavailable','safety_issue','other')
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_description,''))) not between 10 and 4000
    or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200
  then raise exception 'Invalid dispute' using errcode='22023'; end if;
  select id into existing from public.disputes where opened_by=uid and idempotency_key=p_idempotency_key;
  if existing is not null then return existing; end if;
  select * into booking_row from public.bookings where id=p_booking_id and customer_id=uid and deleted_at is null for update;
  eligible:=private.dispute_eligible_until(p_booking_id);
  if booking_row.id is null or eligible is null or eligible<pg_catalog.now()
    or exists(select 1 from public.disputes d where d.booking_id=p_booking_id and private.dispute_is_active(d.status))
    or exists(select 1 from public.disputes d where d.booking_id=p_booking_id and d.status in ('resolved','closed','rejected'))
  then raise exception 'Dispute is not available' using errcode='42501'; end if;
  insert into public.disputes(booking_id,opened_by,opened_by_role,reason,status,description,eligible_until,idempotency_key,policy_version)
  values(p_booking_id,uid,'customer',p_reason,'draft',pg_catalog.btrim(p_description),eligible,p_idempotency_key,'wps013-v1') returning id into dispute_id;
  return dispute_id;
end $$;

create or replace function public.submit_booking_dispute(p_dispute_id uuid,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid retry key' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or dispute_row.opened_by<>uid or dispute_row.status<>'draft' or dispute_row.eligible_until<pg_catalog.now()
  then raise exception 'Dispute cannot be submitted' using errcode='42501'; end if;
  update public.disputes set status='submitted',submitted_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'submitted','submitted','customer',uid,'participants',null,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

create or replace function public.respond_booking_dispute(
  p_dispute_id uuid,p_response_type text,p_body text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; actor text; event_id uuid; event_type text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_response_type not in ('respond','accept_responsibility','contest')
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_body,''))) not between 3 and 2000
    or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240
  then raise exception 'Invalid dispute response' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  actor:=private.dispute_actor(dispute_row.booking_id);
  if actor='customer' and (dispute_row.opened_by<>uid or dispute_row.status<>'waiting_customer' or p_response_type<>'respond') then raise exception 'Dispute response is not available' using errcode='42501'; end if;
  if actor='worker' and (dispute_row.status not in ('submitted','waiting_worker') or p_response_type not in ('respond','accept_responsibility','contest')) then raise exception 'Dispute response is not available' using errcode='42501'; end if;
  if actor not in ('customer','worker') then raise exception 'Dispute response is not available' using errcode='42501'; end if;
  event_type:=case when actor='customer' then 'customer_response' when p_response_type='accept_responsibility' then 'worker_accepted_responsibility' when p_response_type='contest' then 'worker_contested' else 'worker_response' end;
  update public.disputes set status='waiting_staff',updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'waiting_staff',event_type,actor,uid,'participants',p_body,pg_catalog.jsonb_build_object('responseType',p_response_type),p_idempotency_key);
  return event_id;
end $$;

create or replace function public.register_dispute_evidence(
  p_dispute_id uuid,p_storage_path text,p_file_name text,p_content_hash text,p_client_id text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; actor text; object_row record; evidence_id uuid; event_id uuid; config private.dispute_policy_config;
  safe_name text:=pg_catalog.btrim(coalesce(p_file_name,'')); normalized_hash text:=pg_catalog.lower(coalesce(p_content_hash,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(safe_name) not between 1 and 120 or pg_catalog.strpos(safe_name,'/')>0 or pg_catalog.strpos(safe_name,pg_catalog.chr(92))>0 or safe_name ~ '[[:cntrl:]]'
    or normalized_hash !~ '^[a-f0-9]{32,64}$' or pg_catalog.length(coalesce(p_client_id,'')) not between 8 and 200
  then raise exception 'Invalid dispute evidence' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  actor:=private.dispute_actor(dispute_row.booking_id);
  if dispute_row.id is null or actor not in ('customer','worker') or not private.dispute_is_active(dispute_row.status)
    or (actor='worker' and dispute_row.status='draft')
  then raise exception 'Dispute evidence is not available' using errcode='42501'; end if;
  select * into config from private.dispute_policy_config where singleton;
  if (select pg_catalog.count(*) from public.dispute_evidence where dispute_id=p_dispute_id)>=config.max_evidence_files then raise exception 'Dispute evidence limit reached' using errcode='22023'; end if;
  select o.metadata->>'mimetype' mime_type,nullif(o.metadata->>'size','')::bigint byte_size,o.owner_id into object_row
  from storage.objects o where o.bucket_id='dispute-evidence' and o.name=p_storage_path;
  if not found or object_row.owner_id<>uid::text or object_row.mime_type not in ('image/jpeg','image/png','image/webp','image/heic','application/pdf')
    or object_row.byte_size is null or object_row.byte_size not between 1 and config.max_evidence_bytes
    or not private.is_safe_dispute_evidence_path(p_storage_path,uid,dispute_row.booking_id,p_dispute_id)
  then raise exception 'Invalid dispute evidence' using errcode='22023'; end if;
  select id into evidence_id from public.dispute_evidence where dispute_id=p_dispute_id and uploader_id=uid and client_id=p_client_id;
  if evidence_id is not null then return evidence_id; end if;
  if exists(select 1 from public.dispute_evidence where dispute_id=p_dispute_id and content_hash=normalized_hash) then raise exception 'Duplicate dispute evidence' using errcode='23505'; end if;
  insert into public.dispute_evidence(dispute_id,booking_id,uploader_id,storage_path,mime_type,byte_size,file_name,content_hash,client_id)
  values(p_dispute_id,dispute_row.booking_id,uid,p_storage_path,object_row.mime_type,object_row.byte_size,safe_name,normalized_hash,p_client_id) returning id into evidence_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,dispute_row.status,'evidence_submitted',actor,uid,'participants',null,
    pg_catalog.jsonb_build_object('evidenceId',evidence_id,'mimeType',object_row.mime_type),'evidence:'||evidence_id::text);
  return evidence_id;
end $$;

create or replace function public.withdraw_booking_dispute(p_dispute_id uuid,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(reason) not between 3 and 1000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid withdrawal' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or dispute_row.opened_by<>uid or dispute_row.status not in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff')
  then raise exception 'Dispute cannot be withdrawn' using errcode='42501'; end if;
  update public.disputes set status='cancelled',cancelled_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'cancelled','cancelled','customer',uid,'participants',reason,
    pg_catalog.jsonb_build_object('wasSubmitted',dispute_row.submitted_at is not null),p_idempotency_key);
  return event_id;
end $$;

create or replace function public.assign_booking_dispute(p_dispute_id uuid,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid; next_state text;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_note,''))>1000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid assignment' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or dispute_row.status not in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review') then raise exception 'Dispute cannot be assigned' using errcode='22023'; end if;
  next_state:=case when dispute_row.status='submitted' then 'waiting_staff' else dispute_row.status end;
  update public.disputes set assigned_to=uid,assigned_at=coalesce(assigned_at,pg_catalog.now()),status=next_state,updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,next_state,'assigned','staff',uid,'participants',p_note,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

create or replace function public.request_dispute_evidence(p_dispute_id uuid,p_target text,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid; next_state text; note text:=pg_catalog.btrim(coalesce(p_note,''));
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_target not in ('customer','worker') or pg_catalog.length(note) not between 3 and 1000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid evidence request' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  next_state:=case when p_target='customer' then 'waiting_customer' else 'waiting_worker' end;
  if dispute_row.id is null or not private.dispute_can_transition(dispute_row.status,next_state) then raise exception 'Evidence cannot be requested' using errcode='22023'; end if;
  update public.disputes set status=next_state,assigned_to=coalesce(assigned_to,uid),assigned_at=coalesce(assigned_at,pg_catalog.now()),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,next_state,'evidence_requested','staff',uid,'participants',note,pg_catalog.jsonb_build_object('target',p_target),p_idempotency_key);
  return event_id;
end $$;

create or replace function public.start_dispute_review(p_dispute_id uuid,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_note,''))>1000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid review action' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or not private.dispute_can_transition(dispute_row.status,'under_review') then raise exception 'Dispute review cannot start' using errcode='22023'; end if;
  update public.disputes set status='under_review',assigned_to=coalesce(assigned_to,uid),assigned_at=coalesce(assigned_at,pg_catalog.now()),review_started_at=coalesce(review_started_at,pg_catalog.now()),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'under_review','review_started','staff',uid,'participants',p_note,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

create or replace function public.add_dispute_staff_note(p_dispute_id uuid,p_note text,p_participant_visible boolean,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid; note text:=pg_catalog.btrim(coalesce(p_note,''));
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if pg_catalog.length(note) not between 3 and 2000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid staff note' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id;
  if dispute_row.id is null or dispute_row.status in ('closed','cancelled') then raise exception 'Staff note is not available' using errcode='22023'; end if;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,dispute_row.status,case when p_participant_visible then 'staff_update' else 'internal_note' end,'staff',uid,case when p_participant_visible then 'participants' else 'staff' end,note,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

create or replace function private.create_dispute_return_visit(p_dispute_id uuid,p_booking_id uuid,p_reason text,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking_row public.bookings; operation_row public.booking_operations; visit_id uuid; next_section integer;
begin
  select * into booking_row from public.bookings where id=p_booking_id and status='completed' and deleted_at is null for update;
  if booking_row.id is null then raise exception 'Return visit resolution requires a completed booking' using errcode='22023'; end if;
  if exists(select 1 from public.booking_return_visits where booking_id=p_booking_id and status in ('requested','accepted','in_progress')) then raise exception 'A return visit is already open' using errcode='22023'; end if;
  perform private.ensure_booking_operation(p_booking_id);
  select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  next_section:=operation_row.current_section+1;
  if next_section>100 then raise exception 'Return visit limit reached' using errcode='22023'; end if;
  insert into public.booking_return_visits(booking_id,section_number,requested_by,reason,idempotency_key)
  values(p_booking_id,next_section,booking_row.customer_id,p_reason,'dispute-return:'||p_dispute_id::text) returning id into visit_id;
  update public.booking_operations set current_section=next_section,updated_at=pg_catalog.now() where booking_id=p_booking_id;
  perform private.append_booking_operation_event(p_booking_id,next_section,'completed','return_visit_requested','staff',p_actor,p_reason,
    pg_catalog.jsonb_build_object('returnVisitId',visit_id,'sourceDisputeId',p_dispute_id),'dispute-return-event:'||p_dispute_id::text);
  return visit_id;
end $$;
revoke all on function private.create_dispute_return_visit(uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.resolve_booking_dispute(
  p_dispute_id uuid,p_resolution_type text,p_summary text,p_financial_action text,
  p_payment_id uuid,p_amount_minor bigint,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; payment_row public.financial_booking_payments; delegation jsonb; reference_id uuid; reference_type text; visit_id uuid; event_id uuid;
  summary text:=pg_catalog.btrim(coalesce(p_summary,'')); action text:=coalesce(p_financial_action,'none');
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_resolution_type not in ('booking_upheld','partial_compensation','return_visit','warranty_work','no_action','administrative_action','other')
    or pg_catalog.length(summary) not between 3 and 2000 or action not in ('none','pre_release_refund','post_release_case')
    or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200
  then raise exception 'Invalid resolution' using errcode='22023'; end if;
  if (p_resolution_type='partial_compensation' and (action='none' or p_payment_id is null or p_amount_minor is null or p_amount_minor<1))
    or (p_resolution_type<>'partial_compensation' and action<>'none')
  then raise exception 'Invalid financial delegation' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return public.get_booking_dispute(dispute_row.booking_id); end if;
  if dispute_row.id is null or not private.dispute_can_transition(dispute_row.status,'resolved') or (dispute_row.assigned_to is not null and dispute_row.assigned_to<>uid)
  then raise exception 'Dispute cannot be resolved' using errcode='22023'; end if;
  if action<>'none' then
    select * into payment_row from public.financial_booking_payments where id=p_payment_id and booking_id=dispute_row.booking_id;
    if payment_row.id is null or p_amount_minor>payment_row.amount_minor-payment_row.refunded_minor then raise exception 'Financial delegation is not available' using errcode='22023'; end if;
    if action='pre_release_refund' then
      delegation:=public.process_financial_refund(p_payment_id,p_amount_minor,summary,p_idempotency_key||':refund');
      reference_type:='financial_refund';
    else
      delegation:=public.create_post_release_financial_case(p_payment_id,'post_release_refund',p_amount_minor,summary,p_idempotency_key||':case');
      reference_type:='post_release_financial_case';
    end if;
    reference_id:=(delegation->>'id')::uuid;
  end if;
  if p_resolution_type in ('return_visit','warranty_work') then visit_id:=private.create_dispute_return_visit(p_dispute_id,dispute_row.booking_id,summary,uid); end if;
  update public.disputes set status='resolved',resolution_type=p_resolution_type,resolution_summary=summary,
    resolution_financial_action=action,financial_reference_type=reference_type,financial_reference_id=reference_id,
    return_visit_id=visit_id,resolved_by=uid,resolved_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'resolved','resolved','staff',uid,'participants',summary,
    pg_catalog.jsonb_build_object('resolutionType',p_resolution_type,'financialAction',action,'hasFinancialReference',reference_id is not null,'returnVisitId',visit_id),p_idempotency_key);
  return public.get_booking_dispute(dispute_row.booking_id);
end $$;

create or replace function public.reject_booking_dispute(p_dispute_id uuid,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if pg_catalog.length(reason) not between 3 and 2000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid rejection' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or not private.dispute_can_transition(dispute_row.status,'rejected') then raise exception 'Dispute cannot be rejected' using errcode='22023'; end if;
  update public.disputes set status='rejected',resolution_type='no_action',resolution_summary=reason,resolution_financial_action='none',resolved_by=uid,resolved_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'rejected','rejected','staff',uid,'participants',reason,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

create or replace function public.close_booking_dispute(p_dispute_id uuid,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); dispute_row public.disputes; event_id uuid;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_note,''))>1000 or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 240 then raise exception 'Invalid closure' using errcode='22023'; end if;
  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  select id into event_id from public.dispute_events where dispute_id=p_dispute_id and idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if dispute_row.id is null or not private.dispute_can_transition(dispute_row.status,'closed') then raise exception 'Dispute cannot be closed' using errcode='22023'; end if;
  update public.disputes set status='closed',closed_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_dispute_id;
  event_id:=private.append_dispute_event(p_dispute_id,dispute_row.booking_id,'closed','closed','staff',uid,'participants',p_note,'{}'::jsonb,p_idempotency_key);
  return event_id;
end $$;

-- Preserve the dormant pre-WPS-013 direct-insert fixture contract while all
-- authenticated product writes remain RPC-only.
create or replace function private.normalize_dispute_legacy_input()
returns trigger language plpgsql set search_path='' as $$
begin
  new.status:=pg_catalog.lower(coalesce(new.status,'submitted'));
  if new.reason='service_issue' then new.reason:='other'; end if;
  if new.opened_by_role not in ('customer','worker') then new.opened_by_role:='customer'; end if;
  if new.status<>'draft' then new.submitted_at:=coalesce(new.submitted_at,new.created_at,pg_catalog.now()); end if;
  new.policy_version:=coalesce(nullif(new.policy_version,''),'wps013-v1');
  return new;
end $$;
drop trigger if exists disputes_normalize_legacy_input on public.disputes;
create trigger disputes_normalize_legacy_input before insert or update on public.disputes
for each row execute function private.normalize_dispute_legacy_input();
revoke all on function private.normalize_dispute_legacy_input() from public,anon,authenticated;

-- Project participant-visible dispute activity into the existing WPS-009
-- conversation. Staff-private notes never cross this boundary.
create or replace function private.project_dispute_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare booking_row record; conversation_id uuid; recipient uuid; notification_type text; notification_title text; notification_body text;
begin
  if new.visibility='staff' or new.state='draft' then return new; end if;
  select b.customer_id,p.user_id as worker_id into booking_row
  from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=new.booking_id;
  if booking_row.customer_id is null or booking_row.worker_id is null then return new; end if;

  insert into public.conversations(booking_id) values(new.booking_id)
  on conflict(booking_id) where booking_id is not null do update set updated_at=pg_catalog.now()
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id,user_id)
  values(conversation_id,booking_row.customer_id),(conversation_id,booking_row.worker_id) on conflict do nothing;

  if new.event_type in ('customer_response','worker_response','worker_accepted_responsibility','worker_contested') then
    insert into public.messages(conversation_id,booking_id,sender_id,message_type,body,metadata)
    values(conversation_id,new.booking_id,new.actor_id,'text',new.note,
      pg_catalog.jsonb_build_object('event','dispute_response','source_event_id',new.id,'dispute_id',new.dispute_id,'response_type',new.event_type));
  else
    insert into public.messages(conversation_id,booking_id,sender_id,message_type,metadata)
    values(conversation_id,new.booking_id,null,'status',
      pg_catalog.jsonb_build_object('event','dispute_'||new.event_type,'source_event_id',new.id,'dispute_id',new.dispute_id,'state',new.state));
  end if;

  if new.event_type='submitted' then
    recipient:=booking_row.worker_id; notification_type:='dispute_opened'; notification_title:='Dispute opened'; notification_body:='A dispute was opened for your booking.';
  elsif new.event_type='evidence_requested' then
    recipient:=case when new.metadata->>'target'='customer' then booking_row.customer_id else booking_row.worker_id end;
    notification_type:='dispute_evidence_requested'; notification_title:='Evidence requested'; notification_body:='Warsha support requested more dispute evidence.';
  elsif new.event_type='evidence_submitted' then
    recipient:=case when new.actor_class='customer' then booking_row.worker_id else booking_row.customer_id end;
    notification_type:='dispute_evidence_submitted'; notification_title:='Evidence added'; notification_body:='New evidence was added to the dispute.';
  elsif new.event_type='review_started' then
    notification_type:='dispute_under_review'; notification_title:='Dispute under review'; notification_body:='Warsha support is reviewing the dispute.';
  elsif new.event_type in ('resolved','rejected') then
    notification_type:='dispute_resolved'; notification_title:='Dispute resolved'; notification_body:='A resolution is available for the dispute.';
  elsif new.event_type='closed' then
    notification_type:='dispute_closed'; notification_title:='Dispute closed'; notification_body:='The dispute has been closed.';
  elsif new.event_type='cancelled' then
    recipient:=booking_row.worker_id; notification_type:='dispute_cancelled'; notification_title:='Dispute withdrawn'; notification_body:='The customer withdrew the dispute.';
  end if;

  if notification_type is not null then
    if recipient is not null then
      insert into public.notifications(user_id,type,title,body,data,dedupe_key)
      values(recipient,notification_type,notification_title,notification_body,
        pg_catalog.jsonb_build_object('booking_id',new.booking_id,'dispute_id',new.dispute_id,'event_id',new.id),
        'dispute:'||new.id::text||':'||recipient::text)
      on conflict(user_id,type,dedupe_key) where dedupe_key is not null do nothing;
    else
      insert into public.notifications(user_id,type,title,body,data,dedupe_key)
      select target_id,notification_type,notification_title,notification_body,
        pg_catalog.jsonb_build_object('booking_id',new.booking_id,'dispute_id',new.dispute_id,'event_id',new.id),
        'dispute:'||new.id::text||':'||target_id::text
      from (values(booking_row.customer_id),(booking_row.worker_id)) recipients(target_id)
      on conflict(user_id,type,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists dispute_event_projection on public.dispute_events;
create trigger dispute_event_projection after insert on public.dispute_events
for each row execute function private.project_dispute_event();
revoke all on function private.project_dispute_event() from public,anon,authenticated;

-- A submitted dispute holds an unreleased earning and temporarily withholds a
-- review from public reputation. Terminal transitions restore the prior path;
-- they do not create money or change ranking.
create or replace function private.sync_dispute_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
declare earning_row record;
begin
  if new.status is not distinct from old.status then return new; end if;
  if private.dispute_is_publication_hold(new.status) then
    update public.provider_earnings_ledger set status='held_for_dispute',updated_at=pg_catalog.now()
      where booking_id=new.booking_id and status in ('pending_job_completion','pending_release');
    update public.reviews set moderation_status='flagged',dispute_publication_hold_id=new.id,updated_at=pg_catalog.now()
      where booking_id=new.booking_id and moderation_status='visible' and deleted_at is null;
  elsif new.status in ('resolved','closed','rejected','cancelled') then
    update public.reviews set moderation_status='visible',dispute_publication_hold_id=null,updated_at=pg_catalog.now()
      where booking_id=new.booking_id and moderation_status='flagged' and dispute_publication_hold_id=new.id and deleted_at is null;
    for earning_row in select id from public.provider_earnings_ledger where booking_id=new.booking_id and status='held_for_dispute'
    loop
      perform private.release_provider_earning(earning_row.id,'dispute-release:'||new.id::text||':'||earning_row.id::text);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists dispute_dependency_sync on public.disputes;
create trigger dispute_dependency_sync after update of status on public.disputes
for each row execute function private.sync_dispute_dependencies();
revoke all on function private.sync_dispute_dependencies() from public,anon,authenticated;

create or replace function private.hold_review_for_active_dispute()
returns trigger language plpgsql security definer set search_path='' as $$
declare dispute_id uuid;
begin
  select d.id into dispute_id from public.disputes d where d.booking_id=new.booking_id and private.dispute_is_publication_hold(d.status)
    order by d.created_at desc limit 1;
  if dispute_id is not null then new.moderation_status:='flagged'; new.dispute_publication_hold_id:=dispute_id; end if;
  return new;
end $$;
drop trigger if exists review_dispute_publication_hold on public.reviews;
create trigger review_dispute_publication_hold before insert on public.reviews
for each row execute function private.hold_review_for_active_dispute();
revoke all on function private.hold_review_for_active_dispute() from public,anon,authenticated;

create or replace function public.moderate_review(p_review_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); old_status text; hold_id uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,'')); next_status text;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action not in ('hide','restore') or pg_catalog.length(reason) not between 1 and 1000 then raise exception 'Invalid moderation action' using errcode='22023'; end if;
  select moderation_status,dispute_publication_hold_id into old_status,hold_id from public.reviews where id=p_review_id and deleted_at is null for update;
  if not found then raise exception 'Review not found' using errcode='P0002'; end if;
  next_status:=case when p_action='hide' then 'hidden' when hold_id is not null then 'flagged' else 'visible' end;
  update public.reviews set moderation_status=next_status,moderation_reason=reason,moderated_by=uid,moderated_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_review_id;
  insert into public.review_moderation_events(review_id,actor_id,action,reason,previous_status) values(p_review_id,uid,p_action,reason,old_status);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(uid,'review_'||p_action,'review',p_review_id,pg_catalog.jsonb_build_object('moderation_status',old_status),pg_catalog.jsonb_build_object('moderation_status',next_status,'dispute_hold',hold_id is not null));
  return pg_catalog.jsonb_build_object('id',p_review_id,'moderation_status',next_status);
end $$;

-- Legacy clients may still set bookings.status='disputed'. Keep that branch
-- represented without requiring WPS-013's normal flow to mutate booking state.
create or replace function private.bootstrap_legacy_booking_dispute()
returns trigger language plpgsql security definer set search_path='' as $$
declare worker_id uuid; opener uuid; opener_role text;
begin
  if new.status<>'disputed' or (tg_op='UPDATE' and old.status is not distinct from new.status) then return new; end if;
  if exists(select 1 from public.disputes d where d.booking_id=new.id and private.dispute_is_active(d.status)) then return new; end if;
  select p.user_id into worker_id from public.provider_profiles p where p.id=new.provider_id;
  opener:=coalesce((select auth.uid()),new.customer_id);
  opener_role:=case when opener=worker_id then 'worker' else 'customer' end;
  insert into public.disputes(booking_id,opened_by,opened_by_role,reason,status,description,eligible_until,submitted_at,policy_version,idempotency_key)
  values(new.id,opener,opener_role,'other','submitted','Legacy disputed booking retained for support review.',
    new.updated_at+(select pg_catalog.make_interval(hours=>post_completion_window_hours) from private.dispute_policy_config where singleton),
    pg_catalog.now(),'wps013-legacy','legacy-booking:'||new.id::text);
  return new;
end $$;
drop trigger if exists booking_legacy_dispute_bootstrap on public.bookings;
create trigger booking_legacy_dispute_bootstrap after insert or update of status on public.bookings
for each row execute function private.bootstrap_legacy_booking_dispute();
revoke all on function private.bootstrap_legacy_booking_dispute() from public,anon,authenticated;

alter table public.disputes enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.dispute_events enable row level security;
drop policy if exists disputes_participant_read on public.disputes;
drop policy if exists disputes_wps013_read on public.disputes;
create policy disputes_wps013_read on public.disputes for select to authenticated using(
  private.is_staff() or (
    private.is_booking_participant(booking_id)
    and (status<>'draft' or opened_by=(select auth.uid()))
  )
);
drop policy if exists dispute_evidence_participant_read on public.dispute_evidence;
drop policy if exists dispute_evidence_wps013_read on public.dispute_evidence;
create policy dispute_evidence_wps013_read on public.dispute_evidence for select to authenticated using(
  private.is_staff() or private.is_booking_participant(booking_id)
);
drop policy if exists dispute_events_wps013_read on public.dispute_events;
create policy dispute_events_wps013_read on public.dispute_events for select to authenticated using(
  private.is_staff() or (visibility='participants' and private.is_booking_participant(booking_id))
);

revoke all on public.disputes,public.dispute_evidence,public.dispute_events from public,anon,authenticated;
grant select(id,booking_id,opened_by,opened_by_role,reason,status,description,policy_version,eligible_until,submitted_at,review_started_at,resolution_type,resolution_summary,resolution_financial_action,return_visit_id,resolved_at,closed_at,cancelled_at,created_at,updated_at) on public.disputes to authenticated;
grant select(id,dispute_id,booking_id,mime_type,byte_size,file_name,created_at) on public.dispute_evidence to authenticated;
grant select(id,dispute_id,booking_id,state,event_type,actor_class,visibility,note,metadata,created_at) on public.dispute_events to authenticated;

create or replace function private.can_read_registered_dispute_evidence(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.dispute_evidence e where e.storage_path=p_path
    and (private.is_staff() or private.is_booking_participant(e.booking_id)))
$$;
create or replace function private.dispute_evidence_is_registered(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.dispute_evidence e where e.storage_path=p_path)
$$;
revoke all on function private.can_read_registered_dispute_evidence(text),private.dispute_evidence_is_registered(text) from public,anon,authenticated;
grant execute on function private.can_read_registered_dispute_evidence(text),private.dispute_evidence_is_registered(text) to authenticated;

-- Remove the historic owner-folder-only policy for this bucket; paths now bind
-- user, booking, dispute, participant status, object metadata and registration.
drop policy if exists private_user_uploads on storage.objects;
drop policy if exists private_user_reads on storage.objects;
drop policy if exists dispute_evidence_upload on storage.objects;
create policy dispute_evidence_upload on storage.objects for insert to authenticated with check(
  bucket_id='dispute-evidence'
  and exists(select 1 from public.disputes d where d.id::text=(storage.foldername(name))[3]
    and d.booking_id::text=(storage.foldername(name))[2]
    and private.is_booking_participant(d.booking_id)
    and d.status in ('draft','submitted','waiting_customer','waiting_worker','waiting_staff','under_review')
    and name ~ ('^'||(select auth.uid())::text||'/'||d.booking_id::text||'/'||d.id::text||'/evidence/[A-Za-z0-9-]{12,100}\.(jpg|jpeg|png|webp|heic|pdf)$')
    and name !~ '(\.\.|//|\\)')
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','image/heic','application/pdf')
  and nullif(metadata->>'size','')::bigint between 1 and 8388608
);
drop policy if exists dispute_evidence_object_read on storage.objects;
create policy dispute_evidence_object_read on storage.objects for select to authenticated using(
  bucket_id='dispute-evidence' and private.can_read_registered_dispute_evidence(name)
);
drop policy if exists dispute_evidence_unregistered_delete on storage.objects;
create policy dispute_evidence_unregistered_delete on storage.objects for delete to authenticated using(
  bucket_id='dispute-evidence' and owner_id=(select auth.uid())::text
  and not private.dispute_evidence_is_registered(name)
);

do $$ begin
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='disputes') then
    alter publication supabase_realtime add table public.disputes;
  end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dispute_events') then
    alter publication supabase_realtime add table public.dispute_events;
  end if;
end $$;

revoke all on function public.get_booking_dispute(uuid) from public,anon;
revoke all on function public.create_booking_dispute_draft(uuid,text,text,text) from public,anon;
revoke all on function public.submit_booking_dispute(uuid,text) from public,anon;
revoke all on function public.respond_booking_dispute(uuid,text,text,text) from public,anon;
revoke all on function public.register_dispute_evidence(uuid,text,text,text,text) from public,anon;
revoke all on function public.withdraw_booking_dispute(uuid,text,text) from public,anon;
revoke all on function public.assign_booking_dispute(uuid,text,text) from public,anon;
revoke all on function public.request_dispute_evidence(uuid,text,text,text) from public,anon;
revoke all on function public.start_dispute_review(uuid,text,text) from public,anon;
revoke all on function public.add_dispute_staff_note(uuid,text,boolean,text) from public,anon;
revoke all on function public.resolve_booking_dispute(uuid,text,text,text,uuid,bigint,text) from public,anon;
revoke all on function public.reject_booking_dispute(uuid,text,text) from public,anon;
revoke all on function public.close_booking_dispute(uuid,text,text) from public,anon;
revoke all on function public.moderate_review(uuid,text,text) from public,anon;
grant execute on function public.get_booking_dispute(uuid) to authenticated;
grant execute on function public.create_booking_dispute_draft(uuid,text,text,text) to authenticated;
grant execute on function public.submit_booking_dispute(uuid,text) to authenticated;
grant execute on function public.respond_booking_dispute(uuid,text,text,text) to authenticated;
grant execute on function public.register_dispute_evidence(uuid,text,text,text,text) to authenticated;
grant execute on function public.withdraw_booking_dispute(uuid,text,text) to authenticated;
grant execute on function public.assign_booking_dispute(uuid,text,text) to authenticated;
grant execute on function public.request_dispute_evidence(uuid,text,text,text) to authenticated;
grant execute on function public.start_dispute_review(uuid,text,text) to authenticated;
grant execute on function public.add_dispute_staff_note(uuid,text,boolean,text) to authenticated;
grant execute on function public.resolve_booking_dispute(uuid,text,text,text,uuid,bigint,text) to authenticated;
grant execute on function public.reject_booking_dispute(uuid,text,text) to authenticated;
grant execute on function public.close_booking_dispute(uuid,text,text) to authenticated;
grant execute on function public.moderate_review(uuid,text,text) to authenticated;
