-- WPS-012 Job Execution & Operations. Forward-only; no hosted execution is authorized here.

create table public.booking_operations (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  current_state text not null check (current_state in ('confirmed','traveling','arrived','waiting_for_customer','started','waiting_for_approval','waiting_for_parts','paused','resumed','returning_later','finished','customer_inspection','completed')),
  current_section integer not null default 1 check (current_section between 1 and 100),
  worker_checklist text[] not null default '{}'::text[],
  customer_checklist text[] not null default '{}'::text[],
  warranty_kind text not null default 'none' check (warranty_kind in ('none','30_days','60_days','90_days','custom')),
  warranty_days integer check (warranty_days between 1 and 365),
  warranty_starts_at timestamptz,
  warranty_ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check ((warranty_kind='none' and warranty_days is null) or (warranty_kind<>'none' and warranty_days is not null)),
  check ((warranty_starts_at is null and warranty_ends_at is null) or (warranty_starts_at is not null and warranty_ends_at>warranty_starts_at))
);

create table public.booking_operation_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  section_number integer not null check (section_number between 1 and 100),
  state text not null check (state in ('confirmed','traveling','arrived','waiting_for_customer','started','waiting_for_approval','waiting_for_parts','paused','resumed','returning_later','finished','customer_inspection','completed')),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  actor_class text not null check (actor_class in ('customer','worker','system','staff')),
  actor_id uuid references public.profiles(id),
  note text check (note is null or char_length(note) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  unique(booking_id,idempotency_key)
);

create table public.job_progress_media (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  section_number integer not null check (section_number between 1 and 100),
  uploader_id uuid not null references public.profiles(id),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size bigint not null check (byte_size between 1 and 8388608),
  phase text not null check (phase in ('before','during','after')),
  caption text check (caption is null or char_length(caption) between 1 and 500),
  sort_order integer not null default 0 check (sort_order between 0 and 99999),
  client_id text not null check (char_length(client_id) between 8 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  unique(booking_id,uploader_id,client_id)
);

create table public.booking_additional_work_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  section_number integer not null check (section_number between 1 and 100),
  requested_by uuid not null references public.profiles(id),
  explanation text not null check (char_length(explanation) between 3 and 2000),
  photo_ids uuid[] not null default '{}'::uuid[] check (cardinality(photo_ids)<=8),
  estimated_adjustment_minor bigint check (estimated_adjustment_minor between 1 and 1000000000),
  price_adjustment_id uuid references public.booking_price_adjustments(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_clarification')),
  decision_note text check (decision_note is null or char_length(decision_note) between 1 and 1000),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  unique(booking_id,idempotency_key),
  check ((status='pending' and decided_at is null and decided_by is null) or (status<>'pending' and decided_at is not null and decided_by is not null))
);

create table public.booking_return_visits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  section_number integer not null check (section_number between 2 and 100),
  requested_by uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 3 and 2000),
  status text not null default 'requested' check (status in ('requested','accepted','declined','in_progress','completed')),
  response_note text check (response_note is null or char_length(response_note) between 1 and 1000),
  responded_by uuid references public.profiles(id),
  requested_at timestamptz not null default pg_catalog.now(),
  responded_at timestamptz,
  completed_at timestamptz,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  unique(booking_id,section_number),
  unique(booking_id,idempotency_key)
);

create unique index booking_return_visit_open_unique on public.booking_return_visits(booking_id)
where status in ('requested','accepted','in_progress');
create index booking_operation_events_timeline_idx on public.booking_operation_events(booking_id,section_number,created_at,id);
create index job_progress_media_order_idx on public.job_progress_media(booking_id,section_number,phase,sort_order,created_at);
create index booking_additional_work_timeline_idx on public.booking_additional_work_requests(booking_id,section_number,created_at);
create unique index operation_system_message_source_unique on public.messages((metadata->>'source_event_id'))
where metadata ? 'source_event_id' and metadata->>'event' like 'operation_%';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('job-progress-media','job-progress-media',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.job_operation_state_for_booking(p_status text)
returns text language sql immutable set search_path='' as $$
  select case p_status when 'confirmed' then 'confirmed' when 'provider_on_the_way' then 'traveling'
    when 'provider_arrived' then 'arrived' when 'job_started' then 'started'
    when 'work_in_progress' then 'resumed' when 'completed' then 'completed' end
$$;

create or replace function private.job_operation_booking_status(p_state text)
returns text language sql immutable set search_path='' as $$
  select case p_state when 'confirmed' then 'confirmed' when 'traveling' then 'provider_on_the_way'
    when 'arrived' then 'provider_arrived' when 'waiting_for_customer' then 'provider_arrived'
    when 'started' then 'job_started' when 'completed' then 'completed' else 'work_in_progress' end
$$;

create or replace function private.job_operation_can_transition(p_from text,p_to text)
returns boolean language sql immutable set search_path='' as $$
  select case p_from
    when 'confirmed' then p_to in ('traveling')
    when 'traveling' then p_to in ('arrived','waiting_for_customer')
    when 'arrived' then p_to in ('waiting_for_customer','started')
    when 'waiting_for_customer' then p_to in ('arrived','started')
    when 'started' then p_to in ('waiting_for_approval','waiting_for_parts','paused','finished')
    when 'waiting_for_approval' then p_to in ('resumed','waiting_for_parts','paused')
    when 'waiting_for_parts' then p_to in ('resumed','returning_later','paused')
    when 'paused' then p_to in ('resumed','returning_later')
    when 'resumed' then p_to in ('waiting_for_approval','waiting_for_parts','paused','finished')
    when 'returning_later' then p_to in ('traveling','resumed')
    when 'finished' then p_to in ('customer_inspection')
    when 'customer_inspection' then p_to in ('completed','resumed')
    else false end
$$;

create or replace function private.ensure_booking_operation(p_booking_id uuid)
returns public.booking_operations
language plpgsql security definer set search_path=''
as $$
declare booking_row public.bookings; operation_row public.booking_operations; initial_state text;
begin
  select * into booking_row from public.bookings where id=p_booking_id and deleted_at is null;
  initial_state:=private.job_operation_state_for_booking(booking_row.status);
  if booking_row.id is null or initial_state is null then raise exception 'Job operations are unavailable' using errcode='22023'; end if;
  insert into public.booking_operations(booking_id,current_state,warranty_kind)
  values(p_booking_id,initial_state,'none') on conflict(booking_id) do nothing;
  select * into operation_row from public.booking_operations where booking_id=p_booking_id;
  insert into public.booking_operation_events(booking_id,section_number,state,event_type,actor_class,metadata,idempotency_key)
  values(p_booking_id,operation_row.current_section,operation_row.current_state,operation_row.current_state,'system',
    pg_catalog.jsonb_build_object('source','booking_backfill'),'bootstrap:'||p_booking_id::text)
  on conflict(booking_id,idempotency_key) do nothing;
  return operation_row;
end;
$$;

create or replace function private.append_booking_operation_event(
  p_booking_id uuid,p_section integer,p_state text,p_event_type text,p_actor_class text,
  p_actor_id uuid,p_note text,p_metadata jsonb,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  insert into public.booking_operation_events(booking_id,section_number,state,event_type,actor_class,actor_id,note,metadata,idempotency_key)
  values(p_booking_id,p_section,p_state,p_event_type,p_actor_class,p_actor_id,nullif(pg_catalog.btrim(coalesce(p_note,'')),''),coalesce(p_metadata,'{}'::jsonb),p_idempotency_key)
  on conflict(booking_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into event_id;
  return event_id;
end;
$$;

create or replace function private.operation_actor(p_booking_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when b.customer_id=(select auth.uid()) then 'customer'
    when p.user_id=(select auth.uid()) then 'worker'
    when private.is_staff() then 'staff' end
  from public.bookings b left join public.provider_profiles p on p.id=b.provider_id where b.id=p_booking_id and b.deleted_at is null
$$;

create or replace function private.is_safe_job_progress_path(p_path text,p_user uuid,p_booking uuid,p_phase text)
returns boolean language sql immutable set search_path='' as $$
  select p_path ~ ('^'||p_user::text||'/'||p_booking::text||'/operations/'||p_phase||'/[A-Za-z0-9-]{12,80}\.(jpg|jpeg|png|webp|heic|heif)$')
    and p_path !~ '(\.\.|//|\\)'
$$;

revoke all on function private.job_operation_state_for_booking(text) from public,anon,authenticated;
revoke all on function private.job_operation_booking_status(text) from public,anon,authenticated;
revoke all on function private.job_operation_can_transition(text,text) from public,anon,authenticated;
revoke all on function private.ensure_booking_operation(uuid) from public,anon,authenticated;
revoke all on function private.append_booking_operation_event(uuid,integer,text,text,text,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.operation_actor(uuid) from public,anon,authenticated;
revoke all on function private.is_safe_job_progress_path(text,uuid,uuid,text) from public,anon,authenticated;

-- Keep WPS-004 history, but let the fine-grained WPS-012 event own user-facing
-- chat/notification side effects for operation-authoritative status changes.
create or replace function private.record_booking_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); provider_uid uuid; recipient uuid; event_type text; history_id uuid; operation_managed boolean:=coalesce(pg_catalog.current_setting('warsha.operation_authority',true),'')='true';
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if tg_op='INSERT' or old.status is distinct from new.status then
    select p.user_id into provider_uid from public.provider_profiles p where p.id=new.provider_id;
    if uid is distinct from new.customer_id and uid is distinct from provider_uid then raise exception 'Booking action is not available' using errcode='42501'; end if;
    insert into public.booking_status_history(booking_id,status,actor_id) values(new.id,new.status,uid) returning id into history_id;
    if not operation_managed then
      if tg_op='INSERT' then recipient:=provider_uid; event_type:='new_booking_request';
      elsif uid=new.customer_id then
        recipient:=provider_uid;
        if old.status='rescheduling_requested' and new.status<>'cancelled' then
          if new.scheduled_date is not distinct from old.proposed_scheduled_date and new.scheduled_time is not distinct from old.proposed_scheduled_time
          then event_type:='booking_reschedule_accepted'; else event_type:='booking_reschedule_rejected'; end if;
        else event_type:='booking_'||new.status; end if;
      else recipient:=new.customer_id; event_type:='booking_'||new.status; end if;
      if recipient is not null and recipient is distinct from uid then
        insert into public.notifications(user_id,type,title,body,data)
        values(recipient,event_type,'Booking update','Your booking has a new update.',pg_catalog.jsonb_build_object('booking_id',new.id,'status',new.status,'history_id',history_id)) on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.record_booking_status() from public,anon,authenticated;

create or replace function private.record_booking_chat_system_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare conversation_id uuid; provider_user_id uuid;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  if pg_catalog.current_setting('warsha.operation_authority',true)='true' then return new; end if;
  if not private.booking_chat_is_activated(new.id) then return new; end if;
  select p.user_id into provider_user_id from public.provider_profiles p where p.id=new.provider_id;
  if provider_user_id is null then return new; end if;
  insert into public.conversations(booking_id) values(new.id)
  on conflict(booking_id) where booking_id is not null do update set updated_at=pg_catalog.now() returning id into conversation_id;
  insert into public.conversation_members(conversation_id,user_id) values(conversation_id,new.customer_id),(conversation_id,provider_user_id) on conflict do nothing;
  insert into public.messages(conversation_id,booking_id,sender_id,message_type,metadata)
  values(conversation_id,new.id,null,'status',pg_catalog.jsonb_build_object('event','booking_'||new.status));
  return new;
end;
$$;
revoke all on function private.record_booking_chat_system_message() from public,anon,authenticated;

create or replace function private.reject_operation_event_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Operational timeline events are immutable' using errcode='42501'; end;
$$;
revoke all on function private.reject_operation_event_mutation() from public,anon,authenticated;
create trigger booking_operation_events_immutable before update or delete on public.booking_operation_events
for each row execute function private.reject_operation_event_mutation();

create or replace function public.get_booking_operation(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare operation_row public.booking_operations; result jsonb;
begin
  if not private.is_booking_participant(p_booking_id) and not private.is_staff() then raise exception 'Job operation not found' using errcode='42501'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id);
  select pg_catalog.jsonb_build_object(
    'bookingId',operation_row.booking_id,'currentState',operation_row.current_state,'currentSection',operation_row.current_section,
    'workerChecklist',pg_catalog.to_jsonb(operation_row.worker_checklist),'customerChecklist',pg_catalog.to_jsonb(operation_row.customer_checklist),
    'warranty',pg_catalog.jsonb_build_object('kind',operation_row.warranty_kind,'days',operation_row.warranty_days,'startsAt',operation_row.warranty_starts_at,'endsAt',operation_row.warranty_ends_at),
    'events',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',e.id,'bookingId',e.booking_id,'sectionNumber',e.section_number,'state',e.state,'eventType',e.event_type,'actor',e.actor_class,'actorId',e.actor_id,'note',e.note,'metadata',e.metadata,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) from public.booking_operation_events e where e.booking_id=p_booking_id),
    'media',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'bookingId',m.booking_id,'sectionNumber',m.section_number,'uploaderId',m.uploader_id,'storagePath',m.storage_path,'mimeType',m.mime_type,'byteSize',m.byte_size,'phase',m.phase,'caption',m.caption,'sortOrder',m.sort_order,'createdAt',m.created_at) order by m.section_number,m.phase,m.sort_order,m.created_at),'[]'::jsonb) from public.job_progress_media m where m.booking_id=p_booking_id),
    'additionalWork',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'bookingId',a.booking_id,'sectionNumber',a.section_number,'explanation',a.explanation,'photoIds',pg_catalog.to_jsonb(a.photo_ids),'estimatedAdjustmentMinor',a.estimated_adjustment_minor,'priceAdjustmentId',a.price_adjustment_id,'decision',a.status,'createdAt',a.created_at,'decidedAt',a.decided_at) order by a.created_at,a.id),'[]'::jsonb) from public.booking_additional_work_requests a where a.booking_id=p_booking_id),
    'returnVisits',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'bookingId',r.booking_id,'sectionNumber',r.section_number,'reason',r.reason,'status',r.status,'requestedAt',r.requested_at,'respondedAt',r.responded_at,'completedAt',r.completed_at) order by r.section_number),'[]'::jsonb) from public.booking_return_visits r where r.booking_id=p_booking_id),
    'updatedAt',operation_row.updated_at
  ) into result;
  return result;
end;
$$;

create or replace function public.transition_booking_operation(p_booking_id uuid,p_to_state text,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); actor text; operation_row public.booking_operations; booking_row public.bookings; event_id uuid; target_booking_status text;
begin
  actor:=private.operation_actor(p_booking_id);
  if uid is null or actor is distinct from 'worker' then raise exception 'Worker operation is not available' using errcode='42501'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id);
  select e.id into event_id from public.booking_operation_events e where e.booking_id=p_booking_id and e.idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if p_to_state in ('finished','customer_inspection','completed') or not private.job_operation_can_transition(operation_row.current_state,p_to_state)
  then raise exception 'Invalid operation transition' using errcode='22023'; end if;
  if operation_row.current_section>1 and not exists(select 1 from public.booking_return_visits r where r.booking_id=p_booking_id and r.section_number=operation_row.current_section and r.status in ('accepted','in_progress'))
  then raise exception 'Return visit is not active' using errcode='22023'; end if;
  target_booking_status:=private.job_operation_booking_status(p_to_state);
  if booking_row.status<>'completed' and booking_row.status is distinct from target_booking_status then
    perform pg_catalog.set_config('warsha.operation_authority','true',true);
    update public.bookings set status=target_booking_status,updated_at=pg_catalog.now() where id=p_booking_id;
    perform pg_catalog.set_config('warsha.operation_authority','false',true);
  end if;
  update public.booking_operations set current_state=p_to_state,updated_at=pg_catalog.now() where booking_id=p_booking_id;
  update public.booking_return_visits set status='in_progress' where booking_id=p_booking_id and section_number=operation_row.current_section and status='accepted';
  event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,p_to_state,p_to_state,'worker',uid,p_note,'{}'::jsonb,p_idempotency_key);
  return event_id;
end;
$$;

create or replace function public.publish_booking_operation_update(p_booking_id uuid,p_update_key text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); actor text; operation_row public.booking_operations; allowed boolean; event_id uuid;
begin
  actor:=private.operation_actor(p_booking_id);
  operation_row:=private.ensure_booking_operation(p_booking_id);
  allowed:=(actor='worker' and p_update_key in ('worker_on_my_way','worker_arrived','worker_waiting_outside','worker_started','worker_needs_parts','worker_return_tomorrow','worker_running_late','worker_finished'))
    or (actor='customer' and p_update_key in ('customer_arriving_shortly','customer_inspected','customer_approved_additional_work'));
  if uid is null or not allowed then raise exception 'Operation update is not available' using errcode='42501'; end if;
  event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,operation_row.current_state,'update_'||p_update_key,actor,uid,null,'{}'::jsonb,p_idempotency_key);
  return event_id;
end;
$$;

create or replace function public.report_booking_operation_delay(p_booking_id uuid,p_reason text,p_delay_minutes integer,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; next_state text; event_id uuid;
begin
  if private.operation_actor(p_booking_id) is distinct from 'worker' then raise exception 'Worker delay update is not available' using errcode='42501'; end if;
  if p_reason not in ('running_late','traffic','waiting_for_parts','weather','need_customer','need_helper','need_tomorrow') or (p_delay_minutes is not null and p_delay_minutes not between 1 and 1440) or pg_catalog.length(coalesce(p_note,''))>1000
  then raise exception 'Invalid delay update' using errcode='22023'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id);
  select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  next_state:=operation_row.current_state;
  if p_reason='waiting_for_parts' and private.job_operation_can_transition(operation_row.current_state,'waiting_for_parts') then next_state:='waiting_for_parts'; end if;
  update public.booking_operations set current_state=next_state,updated_at=pg_catalog.now() where booking_id=p_booking_id;
  if next_state is distinct from operation_row.current_state then perform pg_catalog.set_config('warsha.operation_authority','true',true); update public.bookings set status='work_in_progress',updated_at=pg_catalog.now() where id=p_booking_id and status<>'completed'; perform pg_catalog.set_config('warsha.operation_authority','false',true); end if;
  event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,next_state,'delay','worker',uid,p_note,pg_catalog.jsonb_build_object('reason',p_reason,'delayMinutes',p_delay_minutes),p_idempotency_key);
  return event_id;
end;
$$;

create or replace function public.register_job_progress_media(p_booking_id uuid,p_storage_path text,p_phase text,p_caption text,p_sort_order integer,p_client_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; object_row record; media_id uuid; mime text; bytes bigint;
begin
  if uid is null or private.operation_actor(p_booking_id) is null or private.operation_actor(p_booking_id) not in ('worker','customer') then raise exception 'Progress media is not available' using errcode='42501'; end if;
  if p_phase not in ('before','during','after') or p_sort_order not between 0 and 99999 or pg_catalog.length(pg_catalog.btrim(coalesce(p_caption,'')))>500 or not private.is_safe_job_progress_path(p_storage_path,uid,p_booking_id,p_phase)
  then raise exception 'Invalid progress media' using errcode='22023'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id);
  select o.metadata->>'mimetype' as mime_type,nullif(o.metadata->>'size','')::bigint as byte_size,o.owner_id into object_row
  from storage.objects o where o.bucket_id='job-progress-media' and o.name=p_storage_path;
  mime:=object_row.mime_type; bytes:=object_row.byte_size;
  if object_row.owner_id is distinct from uid::text or mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') or bytes not between 1 and 8388608
  then raise exception 'Invalid progress media object' using errcode='22023'; end if;
  if (select count(*) from public.job_progress_media m where m.booking_id=p_booking_id and m.section_number=operation_row.current_section)>=30 then raise exception 'Progress photo limit reached' using errcode='22023'; end if;
  insert into public.job_progress_media(booking_id,section_number,uploader_id,storage_path,mime_type,byte_size,phase,caption,sort_order,client_id)
  values(p_booking_id,operation_row.current_section,uid,p_storage_path,mime,bytes,p_phase,nullif(pg_catalog.btrim(coalesce(p_caption,'')),''),p_sort_order,p_client_id)
  on conflict(booking_id,uploader_id,client_id) do update set client_id=excluded.client_id returning id into media_id;
  perform private.append_booking_operation_event(p_booking_id,operation_row.current_section,operation_row.current_state,'progress_photo_uploaded',private.operation_actor(p_booking_id),uid,null,pg_catalog.jsonb_build_object('mediaId',media_id,'phase',p_phase),'media:'||media_id::text);
  return media_id;
end;
$$;

create or replace function public.submit_additional_work_request(p_booking_id uuid,p_explanation text,p_photo_ids uuid[],p_estimated_adjustment_minor bigint,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; request_id uuid; adjustment jsonb; adjustment_id uuid;
begin
  if private.operation_actor(p_booking_id) is distinct from 'worker' then raise exception 'Additional work is not available' using errcode='42501'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id);
  select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  select a.id into request_id from public.booking_additional_work_requests a where a.booking_id=p_booking_id and a.idempotency_key=p_idempotency_key;
  if request_id is not null then return request_id; end if;
  if operation_row.current_state not in ('started','resumed') or pg_catalog.length(pg_catalog.btrim(coalesce(p_explanation,''))) not between 3 and 2000 or cardinality(coalesce(p_photo_ids,'{}'::uuid[]))>8
    or (p_estimated_adjustment_minor is not null and p_estimated_adjustment_minor not between 1 and 1000000000)
  then raise exception 'Invalid additional work request' using errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(p_photo_ids,'{}'::uuid[])) photo_id where not exists(select 1 from public.job_progress_media m where m.id=photo_id and m.booking_id=p_booking_id and m.section_number=operation_row.current_section and m.uploader_id=uid))
  then raise exception 'Invalid additional work photo' using errcode='22023'; end if;
  if p_estimated_adjustment_minor is not null then
    adjustment:=public.propose_booking_price_adjustment(p_booking_id,p_estimated_adjustment_minor,pg_catalog.btrim(p_explanation),p_idempotency_key||':wps007');
    adjustment_id:=(adjustment->>'id')::uuid;
  end if;
  insert into public.booking_additional_work_requests(booking_id,section_number,requested_by,explanation,photo_ids,estimated_adjustment_minor,price_adjustment_id,idempotency_key)
  values(p_booking_id,operation_row.current_section,uid,pg_catalog.btrim(p_explanation),coalesce(p_photo_ids,'{}'::uuid[]),p_estimated_adjustment_minor,adjustment_id,p_idempotency_key)
  returning id into request_id;
  update public.booking_operations set current_state='waiting_for_approval',updated_at=pg_catalog.now() where booking_id=p_booking_id;
  perform pg_catalog.set_config('warsha.operation_authority','true',true);
  update public.bookings set status='work_in_progress',updated_at=pg_catalog.now() where id=p_booking_id and status='job_started';
  perform pg_catalog.set_config('warsha.operation_authority','false',true);
  perform private.append_booking_operation_event(p_booking_id,operation_row.current_section,'waiting_for_approval','additional_work_requested','worker',uid,p_explanation,pg_catalog.jsonb_build_object('requestId',request_id,'hasPriceAdjustment',adjustment_id is not null),'additional-event:'||request_id::text);
  return request_id;
end;
$$;

create or replace function public.respond_additional_work_request(p_request_id uuid,p_decision text,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); request_row public.booking_additional_work_requests; operation_row public.booking_operations; event_id uuid; accepted boolean;
begin
  select * into request_row from public.booking_additional_work_requests where id=p_request_id for update;
  if request_row.id is null or private.operation_actor(request_row.booking_id) is distinct from 'customer' then raise exception 'Additional work response is not available' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected','needs_clarification') or (p_decision='needs_clarification' and pg_catalog.length(pg_catalog.btrim(coalesce(p_note,'')))<3) or pg_catalog.length(coalesce(p_note,''))>1000
  then raise exception 'Invalid additional work response' using errcode='22023'; end if;
  if request_row.status not in ('pending','needs_clarification') then return (select e.id from public.booking_operation_events e where e.booking_id=request_row.booking_id and e.metadata->>'requestId'=p_request_id::text order by e.created_at desc limit 1); end if;
  if request_row.price_adjustment_id is not null and p_decision in ('approved','rejected') then
    accepted:=p_decision='approved'; perform public.respond_booking_price_adjustment(request_row.price_adjustment_id,accepted);
  end if;
  update public.booking_additional_work_requests set status=p_decision,decision_note=nullif(pg_catalog.btrim(coalesce(p_note,'')),''),decided_by=uid,decided_at=pg_catalog.now() where id=p_request_id;
  select * into operation_row from public.booking_operations where booking_id=request_row.booking_id for update;
  if p_decision<>'needs_clarification' then update public.booking_operations set current_state='resumed',updated_at=pg_catalog.now() where booking_id=request_row.booking_id; end if;
  event_id:=private.append_booking_operation_event(request_row.booking_id,request_row.section_number,case when p_decision='needs_clarification' then 'waiting_for_approval' else 'resumed' end,'additional_work_'||p_decision,'customer',uid,p_note,pg_catalog.jsonb_build_object('requestId',p_request_id),p_idempotency_key);
  return event_id;
end;
$$;

create or replace function public.mark_job_ready_for_inspection(p_booking_id uuid,p_checklist text[],p_warranty_kind text,p_custom_warranty_days integer,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; selected_warranty_days integer; quote_warranty integer; event_id uuid;
begin
  if private.operation_actor(p_booking_id) is distinct from 'worker' then raise exception 'Inspection is not available' using errcode='42501'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id); select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  select e.id into event_id from public.booking_operation_events e where e.booking_id=p_booking_id and e.idempotency_key=p_idempotency_key||':inspection';
  if event_id is not null then return event_id; end if;
  if operation_row.current_state not in ('started','resumed') or not (array['work_finished','area_cleaned','photos_uploaded','customer_informed']::text[] <@ coalesce(p_checklist,'{}'::text[]))
    or exists(select 1 from public.booking_additional_work_requests a where a.booking_id=p_booking_id and a.section_number=operation_row.current_section and a.status in ('pending','needs_clarification'))
    or not exists(select 1 from public.job_progress_media m where m.booking_id=p_booking_id and m.section_number=operation_row.current_section and m.phase='after')
  then raise exception 'Completion checklist is incomplete' using errcode='22023'; end if;
  if p_warranty_kind not in ('none','30_days','60_days','90_days','custom') then raise exception 'Invalid warranty commitment' using errcode='22023'; end if;
  selected_warranty_days:=case p_warranty_kind when '30_days' then 30 when '60_days' then 60 when '90_days' then 90 when 'custom' then p_custom_warranty_days end;
  select q.warranty_days into quote_warranty from public.bookings b left join public.worker_quotes q on q.id=b.selected_worker_quote_id where b.id=p_booking_id;
  if quote_warranty is not null and (selected_warranty_days is null or selected_warranty_days<quote_warranty) then selected_warranty_days:=quote_warranty; p_warranty_kind:='custom'; end if;
  if (p_warranty_kind='none' and selected_warranty_days is not null) or (p_warranty_kind<>'none' and selected_warranty_days not between 1 and 365) then raise exception 'Invalid warranty commitment' using errcode='22023'; end if;
  update public.booking_operations set current_state='finished',worker_checklist=p_checklist,
    warranty_kind=case when operation_row.current_section=1 then p_warranty_kind else warranty_kind end,
    warranty_days=case when operation_row.current_section=1 then selected_warranty_days else booking_operations.warranty_days end,
    updated_at=pg_catalog.now() where booking_id=p_booking_id;
  perform private.append_booking_operation_event(p_booking_id,operation_row.current_section,'finished','finished','worker',uid,p_note,pg_catalog.jsonb_build_object('checklist',p_checklist,'warrantyKind',p_warranty_kind,'warrantyDays',selected_warranty_days),p_idempotency_key||':finished');
  update public.booking_operations set current_state='customer_inspection',updated_at=pg_catalog.now() where booking_id=p_booking_id;
  event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,'customer_inspection','customer_inspection','system',null,null,'{}'::jsonb,p_idempotency_key||':inspection');
  return event_id;
end;
$$;

create or replace function public.respond_job_inspection(p_booking_id uuid,p_response text,p_checklist text[],p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; event_id uuid; completion_time timestamptz:=pg_catalog.now(); return_visit_id uuid;
begin
  if private.operation_actor(p_booking_id) is distinct from 'customer' then raise exception 'Inspection response is not available' using errcode='42501'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id); select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  select e.id into event_id from public.booking_operation_events e where e.booking_id=p_booking_id and e.idempotency_key=p_idempotency_key;
  if event_id is not null then return event_id; end if;
  if operation_row.current_state<>'customer_inspection' or p_response not in ('approve','request_clarification','report_remaining_issue') or (p_response<>'approve' and pg_catalog.length(pg_catalog.btrim(coalesce(p_note,'')))<3) or pg_catalog.length(coalesce(p_note,''))>1000
  then raise exception 'Invalid inspection response' using errcode='22023'; end if;
  if p_response='approve' and not (array['work_inspected','satisfied','close_booking']::text[] <@ coalesce(p_checklist,'{}'::text[])) then raise exception 'Inspection checklist is incomplete' using errcode='22023'; end if;
  if p_response='approve' then
    select r.id into return_visit_id from public.booking_return_visits r where r.booking_id=p_booking_id and r.section_number=operation_row.current_section and r.status in ('accepted','in_progress') for update;
    if return_visit_id is null then
      update public.booking_operations set current_state='completed',customer_checklist=p_checklist,
        warranty_starts_at=case when warranty_kind='none' then null else completion_time end,
        warranty_ends_at=case when warranty_kind='none' then null else completion_time+pg_catalog.make_interval(days=>warranty_days) end,
        updated_at=completion_time where booking_id=p_booking_id;
      perform pg_catalog.set_config('warsha.operation_authority','true',true); update public.bookings set status='completed',completion_notes=nullif(pg_catalog.btrim(coalesce(p_note,'')),''),updated_at=completion_time where id=p_booking_id and status='work_in_progress'; perform pg_catalog.set_config('warsha.operation_authority','false',true);
    else
      update public.booking_operations set current_state='completed',customer_checklist=p_checklist,updated_at=completion_time where booking_id=p_booking_id;
      update public.booking_return_visits set status='completed',completed_at=completion_time where id=return_visit_id;
    end if;
    event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,'completed','completed','customer',uid,p_note,pg_catalog.jsonb_build_object('checklist',p_checklist,'returnVisitId',return_visit_id),p_idempotency_key);
  else
    update public.booking_operations set current_state='resumed',customer_checklist=p_checklist,updated_at=completion_time where booking_id=p_booking_id;
    event_id:=private.append_booking_operation_event(p_booking_id,operation_row.current_section,'resumed','inspection_'||p_response,'customer',uid,p_note,pg_catalog.jsonb_build_object('checklist',p_checklist),p_idempotency_key);
  end if;
  return event_id;
end;
$$;

create or replace function public.request_booking_return_visit(p_booking_id uuid,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); operation_row public.booking_operations; visit_id uuid; next_section integer;
begin
  if private.operation_actor(p_booking_id) is distinct from 'customer' or not exists(select 1 from public.bookings b where b.id=p_booking_id and b.status='completed') then raise exception 'Return visit is not available' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'Return visit reason is required' using errcode='22023'; end if;
  operation_row:=private.ensure_booking_operation(p_booking_id); select * into operation_row from public.booking_operations where booking_id=p_booking_id for update;
  select r.id into visit_id from public.booking_return_visits r where r.booking_id=p_booking_id and r.idempotency_key=p_idempotency_key;
  if visit_id is not null then return visit_id; end if;
  if exists(select 1 from public.booking_return_visits r where r.booking_id=p_booking_id and r.status in ('requested','accepted','in_progress')) then raise exception 'A return visit is already open' using errcode='22023'; end if;
  next_section:=operation_row.current_section+1;
  insert into public.booking_return_visits(booking_id,section_number,requested_by,reason,idempotency_key)
  values(p_booking_id,next_section,uid,pg_catalog.btrim(p_reason),p_idempotency_key) returning id into visit_id;
  update public.booking_operations set current_section=next_section,current_state='completed',worker_checklist='{}',customer_checklist='{}',updated_at=pg_catalog.now() where booking_id=p_booking_id;
  perform private.append_booking_operation_event(p_booking_id,next_section,'completed','return_visit_requested','customer',uid,p_reason,pg_catalog.jsonb_build_object('returnVisitId',visit_id),'return-event:'||visit_id::text);
  return visit_id;
end;
$$;

create or replace function public.respond_booking_return_visit(p_return_visit_id uuid,p_accept boolean,p_note text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); visit_row public.booking_return_visits; event_id uuid; next_state text;
begin
  select * into visit_row from public.booking_return_visits where id=p_return_visit_id for update;
  if visit_row.id is null or private.operation_actor(visit_row.booking_id) is distinct from 'worker' then raise exception 'Return visit response is not available' using errcode='42501'; end if;
  if visit_row.status<>'requested' then return (select e.id from public.booking_operation_events e where e.booking_id=visit_row.booking_id and e.idempotency_key=p_idempotency_key); end if;
  if not p_accept and pg_catalog.length(pg_catalog.btrim(coalesce(p_note,'')))<3 then raise exception 'A decline reason is required' using errcode='22023'; end if;
  next_state:=case when p_accept then 'confirmed' else 'completed' end;
  update public.booking_return_visits set status=case when p_accept then 'accepted' else 'declined' end,response_note=nullif(pg_catalog.btrim(coalesce(p_note,'')),''),responded_by=uid,responded_at=pg_catalog.now() where id=p_return_visit_id;
  update public.booking_operations set current_state=next_state,updated_at=pg_catalog.now() where booking_id=visit_row.booking_id;
  event_id:=private.append_booking_operation_event(visit_row.booking_id,visit_row.section_number,next_state,case when p_accept then 'return_visit_accepted' else 'return_visit_declined' end,'worker',uid,p_note,pg_catalog.jsonb_build_object('returnVisitId',p_return_visit_id),p_idempotency_key);
  return event_id;
end;
$$;

create or replace function private.record_job_operation_side_effects()
returns trigger language plpgsql security definer set search_path='' as $$
declare booking_row record; conversation_id uuid; recipient uuid; notification_type text;
begin
  select b.customer_id,p.user_id as provider_user_id into booking_row from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=new.booking_id;
  if booking_row.customer_id is null or booking_row.provider_user_id is null then return new; end if;
  insert into public.conversations(booking_id) values(new.booking_id)
    on conflict(booking_id) where booking_id is not null do update set updated_at=pg_catalog.now() returning id into conversation_id;
  insert into public.conversation_members(conversation_id,user_id) values(conversation_id,booking_row.customer_id),(conversation_id,booking_row.provider_user_id) on conflict do nothing;
  insert into public.messages(conversation_id,booking_id,sender_id,message_type,metadata)
  values(conversation_id,new.booking_id,null,'status',pg_catalog.jsonb_build_object('event','operation_'||new.event_type,'source_event_id',new.id,'state',new.state,'section_number',new.section_number)) on conflict do nothing;
  notification_type:=case
    when new.event_type in ('traveling','arrived','started','paused','resumed','waiting_for_approval','finished','completed') then 'operation_'||new.event_type
    when new.event_type='customer_inspection' then 'operation_inspection'
    when new.event_type='delay' then 'operation_delay'
    when new.event_type like 'additional_work_%' then 'operation_additional_work'
    when new.event_type like 'return_visit_%' then 'operation_return_visit'
  end;
  if notification_type is not null then
    recipient:=case when new.actor_class='worker' then booking_row.customer_id when new.actor_class='customer' then booking_row.provider_user_id end;
    if recipient is not null and recipient is distinct from new.actor_id then
      insert into public.notifications(user_id,type,title,body,data,dedupe_key)
      values(recipient,notification_type,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text) on conflict do nothing;
    elsif new.actor_class='system' then
      insert into public.notifications(user_id,type,title,body,data,dedupe_key)
      values(booking_row.customer_id,notification_type,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text),
        (booking_row.provider_user_id,notification_type,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text) on conflict do nothing;
    end if;
  end if;
  if new.event_type='completed' then
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    values(booking_row.customer_id,'review_unlocked','Review available','You can now review this completed booking.',pg_catalog.jsonb_build_object('booking_id',new.booking_id),'review-unlocked:'||new.booking_id::text) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.record_job_operation_side_effects() from public,anon,authenticated;
create trigger booking_operation_event_side_effects after insert on public.booking_operation_events
for each row execute function private.record_job_operation_side_effects();

-- Preserve WPS-001 through WPS-011 callers: legacy booking milestones synchronize forward into WPS-012.
create or replace function private.sync_booking_operation_from_legacy_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare mapped_state text; operation_row public.booking_operations; section_no integer;
begin
  if old.status is not distinct from new.status then return new; end if;
  if pg_catalog.current_setting('warsha.operation_authority',true)='true' then return new; end if;
  mapped_state:=private.job_operation_state_for_booking(new.status); if mapped_state is null then return new; end if;
  insert into public.booking_operations(booking_id,current_state,warranty_kind) values(new.id,mapped_state,'none') on conflict(booking_id) do nothing;
  select * into operation_row from public.booking_operations where booking_id=new.id for update; section_no:=operation_row.current_section;
  if operation_row.current_state is distinct from mapped_state and not exists(select 1 from public.booking_operation_events e where e.booking_id=new.id and e.metadata->>'bookingHistoryStatus'=new.status and e.created_at>=pg_catalog.now()-interval '2 seconds') then
    update public.booking_operations set current_state=mapped_state,updated_at=pg_catalog.now() where booking_id=new.id;
    perform private.append_booking_operation_event(new.id,section_no,mapped_state,mapped_state,'system',null,null,pg_catalog.jsonb_build_object('source','legacy_booking_status','bookingHistoryStatus',new.status),'legacy-status:'||new.status||':'||pg_catalog.clock_timestamp()::text);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_booking_operation_from_legacy_status() from public,anon,authenticated;
create trigger sync_booking_operation_from_legacy_status after update of status on public.bookings
for each row execute function private.sync_booking_operation_from_legacy_status();

alter table public.booking_operations enable row level security;
alter table public.booking_operation_events enable row level security;
alter table public.job_progress_media enable row level security;
alter table public.booking_additional_work_requests enable row level security;
alter table public.booking_return_visits enable row level security;

create policy booking_operations_participant_read on public.booking_operations for select to authenticated using(private.is_booking_participant(booking_id) or private.is_staff());
create policy booking_operation_events_participant_read on public.booking_operation_events for select to authenticated using(private.is_booking_participant(booking_id) or private.is_staff());
create policy job_progress_media_participant_read on public.job_progress_media for select to authenticated using(private.is_booking_participant(booking_id) or private.is_staff());
create policy booking_additional_work_participant_read on public.booking_additional_work_requests for select to authenticated using(private.is_booking_participant(booking_id) or private.is_staff());
create policy booking_return_visits_participant_read on public.booking_return_visits for select to authenticated using(private.is_booking_participant(booking_id) or private.is_staff());

revoke all on public.booking_operations,public.booking_operation_events,public.job_progress_media,public.booking_additional_work_requests,public.booking_return_visits from public,anon,authenticated;
grant select on public.booking_operations,public.booking_operation_events,public.job_progress_media,public.booking_additional_work_requests,public.booking_return_visits to authenticated;

drop policy if exists job_progress_media_upload on storage.objects;
create policy job_progress_media_upload on storage.objects for insert to authenticated with check(
  bucket_id='job-progress-media' and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text and (storage.foldername(name))[3]='operations'
  and (storage.foldername(name))[4] in ('before','during','after')
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
  and private.is_booking_participant(((storage.foldername(name))[2])::uuid)
);
drop policy if exists job_progress_media_participant_object_read on storage.objects;
create policy job_progress_media_participant_object_read on storage.objects for select to authenticated using(
  bucket_id='job-progress-media' and exists(select 1 from public.job_progress_media m where m.storage_path=name and (private.is_booking_participant(m.booking_id) or private.is_staff()))
);
drop policy if exists job_progress_media_unregistered_owner_delete on storage.objects;
create policy job_progress_media_unregistered_owner_delete on storage.objects for delete to authenticated using(
  bucket_id='job-progress-media' and owner_id=(select auth.uid())::text and not exists(select 1 from public.job_progress_media m where m.storage_path=name)
);

revoke all on function public.get_booking_operation(uuid) from public,anon,authenticated;
revoke all on function public.transition_booking_operation(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.publish_booking_operation_update(uuid,text,text) from public,anon,authenticated;
revoke all on function public.report_booking_operation_delay(uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.register_job_progress_media(uuid,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.submit_additional_work_request(uuid,text,uuid[],bigint,text) from public,anon,authenticated;
revoke all on function public.respond_additional_work_request(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_job_ready_for_inspection(uuid,text[],text,integer,text,text) from public,anon,authenticated;
revoke all on function public.respond_job_inspection(uuid,text,text[],text,text) from public,anon,authenticated;
revoke all on function public.request_booking_return_visit(uuid,text,text) from public,anon,authenticated;
revoke all on function public.respond_booking_return_visit(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.get_booking_operation(uuid) to authenticated;
grant execute on function public.transition_booking_operation(uuid,text,text,text) to authenticated;
grant execute on function public.publish_booking_operation_update(uuid,text,text) to authenticated;
grant execute on function public.report_booking_operation_delay(uuid,text,integer,text,text) to authenticated;
grant execute on function public.register_job_progress_media(uuid,text,text,text,integer,text) to authenticated;
grant execute on function public.submit_additional_work_request(uuid,text,uuid[],bigint,text) to authenticated;
grant execute on function public.respond_additional_work_request(uuid,text,text,text) to authenticated;
grant execute on function public.mark_job_ready_for_inspection(uuid,text[],text,integer,text,text) to authenticated;
grant execute on function public.respond_job_inspection(uuid,text,text[],text,text) to authenticated;
grant execute on function public.request_booking_return_visit(uuid,text,text) to authenticated;
grant execute on function public.respond_booking_return_visit(uuid,boolean,text,text) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['booking_operations','booking_operation_events','job_progress_media','booking_additional_work_requests','booking_return_visits'] loop
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name)
    then execute pg_catalog.format('alter publication supabase_realtime add table public.%I',table_name); end if;
  end loop;
end $$;
