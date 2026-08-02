-- WPS-014 Notifications & Engagement
-- Forward-only extension of the WPS-005 durable inbox. Production push,
-- external delivery, and scheduled processing intentionally remain disabled.

alter table public.notifications
  add column if not exists event_key text,
  add column if not exists category text,
  add column if not exists priority text,
  add column if not exists audience text,
  add column if not exists action_type text,
  add column if not exists route_type text,
  add column if not exists resource_id uuid,
  add column if not exists source_key text,
  add column if not exists source_event_id uuid,
  add column if not exists group_family text,
  add column if not exists group_key text,
  add column if not exists group_count integer not null default 1,
  add column if not exists required_action boolean not null default false,
  add column if not exists last_event_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists action_resolved_at timestamptz;

alter table public.notifications
  add constraint notifications_category_check check (category is null or category in (
    'marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system'
  )),
  add constraint notifications_priority_check check (priority is null or priority in (
    'critical','action_required','important','informational'
  )),
  add constraint notifications_audience_check check (audience is null or audience in ('customer','worker','all')),
  add constraint notifications_route_type_check check (route_type is null or route_type in (
    'marketplace_request','worker_opportunities','worker_quote','booking','conversation','provider_profile',
    'booking_payment','worker_earnings','verification','booking_review','booking_dispute','preferences'
  )),
  add constraint notifications_group_count_check check (group_count > 0),
  add constraint notifications_event_key_check check (event_key is null or event_key ~ '^[a-z0-9_]{1,100}$'),
  add constraint notifications_source_key_check check (source_key is null or pg_catalog.length(source_key) between 1 and 300),
  add constraint notifications_group_key_check check (group_key is null or pg_catalog.length(group_key) between 1 and 300);

create index if not exists notifications_owner_scope_created_idx
  on public.notifications(user_id, audience, created_at desc, id desc)
  where archived_at is null;
create index if not exists notifications_owner_archived_created_idx
  on public.notifications(user_id, archived_at desc, id desc)
  where archived_at is not null;
create index if not exists notifications_owner_category_unread_idx
  on public.notifications(user_id, category, created_at desc)
  where read_at is null and archived_at is null;
create unique index if not exists notifications_owner_source_unique_idx
  on public.notifications(user_id, source_key) where source_key is not null;
create unique index if not exists notifications_open_group_unique_idx
  on public.notifications(user_id, group_key)
  where group_key is not null and read_at is null and archived_at is null;

alter table public.notification_preferences
  add column if not exists category_preferences jsonb not null default '{
    "marketplace":true,"bookings":true,"messages":true,"payments":true,
    "worker_account":true,"reviews":true,"disputes":true,"security":true,"system":true
  }'::jsonb,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists timezone text not null default 'Africa/Cairo',
  add column if not exists generic_previews boolean not null default true;

alter table public.notification_preferences alter column push_enabled set default false;
update public.notification_preferences set push_enabled=false, email_enabled=false, sms_enabled=false;

create or replace function private.notification_category_preferences_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select pg_catalog.jsonb_typeof(p_value)='object'
    and p_value - array['marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system'] = '{}'::jsonb
    and not exists (
      select 1 from pg_catalog.jsonb_each(p_value) entry
      where pg_catalog.jsonb_typeof(entry.value) <> 'boolean'
    )
$$;
revoke all on function private.notification_category_preferences_valid(jsonb) from public,anon,authenticated;

alter table public.notification_preferences
  add constraint notification_preferences_category_shape_check check (
    private.notification_category_preferences_valid(category_preferences)
  ),
  add constraint notification_preferences_quiet_hours_check check (
    not quiet_hours_enabled or (
      quiet_hours_start is not null and quiet_hours_end is not null
      and quiet_hours_start is distinct from quiet_hours_end
    )
  );

create table private.notification_event_catalog (
  event_type text primary key check (event_type ~ '^[a-z0-9_]{1,100}$'),
  category text not null check (category in ('marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system')),
  priority text not null check (priority in ('critical','action_required','important','informational')),
  action_type text,
  route_type text check (route_type is null or route_type in (
    'marketplace_request','worker_opportunities','worker_quote','booking','conversation','provider_profile',
    'booking_payment','worker_earnings','verification','booking_review','booking_dispute','preferences'
  )),
  required_action boolean not null default false,
  mandatory_in_app boolean not null default false,
  quiet_hours_bypass boolean not null default false,
  group_family text check (group_family is null or group_family in ('conversation','marketplace_quotes')),
  generic_title text not null,
  generic_body text not null
);

insert into private.notification_event_catalog(
  event_type,category,priority,action_type,route_type,required_action,mandatory_in_app,quiet_hours_bypass,group_family,generic_title,generic_body
) values
  ('booking_message','messages','informational','open_chat','conversation',false,false,false,'conversation','New message','You have a new message in Warsha.'),
  ('booking_attachment','messages','informational','open_chat','conversation',false,false,false,'conversation','New attachment','You have a new message in Warsha.'),
  ('quote_received','marketplace','important','view_quote','marketplace_request',false,false,false,'marketplace_quotes','Quote update','Your service request has a quote update.'),
  ('quote_revised','marketplace','important','view_quote','marketplace_request',false,false,false,'marketplace_quotes','Quote update','Your service request has a quote update.'),
  ('quote_invitation','marketplace','action_required','view_opportunity','worker_opportunities',true,true,true,null,'New opportunity','A service opportunity requires your attention.'),
  ('emergency_request','marketplace','critical','view_opportunity','worker_opportunities',true,true,true,null,'Urgent opportunity','An urgent service opportunity requires your attention.'),
  ('request_edited','marketplace','important','view_opportunity','worker_opportunities',false,false,false,null,'Request updated','A service request has changed.'),
  ('quote_selected','marketplace','action_required','confirm_job','worker_quote',true,true,true,null,'Confirmation required','A customer selected your quote.'),
  ('marketplace_booking_confirmed','marketplace','important','view_booking','booking',false,true,false,null,'Worker confirmed','Your service request is confirmed.'),
  ('marketplace_request_expired','marketplace','important','view_request','marketplace_request',false,false,false,null,'Request expired','Your service request expired.'),
  ('quote_confirmation_expired','marketplace','critical','view_request','marketplace_request',true,true,true,null,'Confirmation expired','Worker confirmation was not completed.'),
  ('marketplace_no_providers','marketplace','important','view_request','marketplace_request',false,false,false,null,'No workers found','No eligible worker was found yet.'),
  ('marketplace_rematching','marketplace','important','view_request','marketplace_request',false,false,false,null,'Matching restarted','Warsha is looking for another eligible worker.'),
  ('request_awarded_elsewhere','marketplace','informational',null,'worker_opportunities',false,false,false,null,'Request closed','This request was awarded to another worker.'),
  ('request_cancelled','marketplace','important',null,'worker_opportunities',false,true,false,null,'Request cancelled','A service request was cancelled.'),
  ('quote_expired','marketplace','informational',null,'worker_opportunities',false,false,false,null,'Quote expired','Your quote is no longer active.'),
  ('new_booking_request','bookings','action_required','view_booking','booking',true,true,true,null,'New booking','A booking requires your attention.'),
  ('booking_cancelled','bookings','critical','view_booking','booking',false,true,true,null,'Booking cancelled','Your booking was cancelled.'),
  ('operation_additional_work_requested','bookings','action_required','approve_price','booking',true,true,true,null,'Approval required','Additional work requires your decision.'),
  ('operation_additional_work_approved','bookings','important','view_booking','booking',false,true,false,null,'Additional work approved','An additional-work decision is available.'),
  ('operation_additional_work_rejected','bookings','important','view_booking','booking',false,true,false,null,'Additional work declined','An additional-work decision is available.'),
  ('operation_additional_work_needs_clarification','bookings','action_required','view_booking','booking',true,true,true,null,'Clarification required','Additional work requires clarification.'),
  ('operation_waiting_for_approval','bookings','action_required','approve_price','booking',true,true,true,null,'Approval required','Your booking requires a decision.'),
  ('operation_ready_for_inspection','bookings','action_required','inspect_work','booking',true,true,true,null,'Inspection required','Work is ready for your inspection.'),
  ('operation_inspection','bookings','action_required','inspect_work','booking',true,true,true,null,'Inspection required','Work is ready for your inspection.'),
  ('operation_return_visit_requested','bookings','action_required','view_booking','booking',true,true,true,null,'Return visit request','A return visit requires your response.'),
  ('operation_return_visit_accepted','bookings','important','view_booking','booking',false,true,false,null,'Return visit accepted','A return-visit decision is available.'),
  ('operation_return_visit_declined','bookings','important','view_booking','booking',false,true,false,null,'Return visit declined','A return-visit decision is available.'),
  ('payment_required','payments','action_required','view_payment','booking_payment',true,true,true,null,'Payment required','Action is required on your payment.'),
  ('payment_failed','payments','critical','view_payment','booking_payment',true,true,true,null,'Payment needs attention','Your payment status changed.'),
  ('refund_failed','payments','critical','view_payment','booking_payment',true,true,true,null,'Refund needs attention','Your refund status changed.'),
  ('cash_debt_threshold_warning','payments','action_required','view_earnings','worker_earnings',true,true,true,null,'Account action required','Your worker financial account requires attention.'),
  ('verification_submitted','worker_account','informational','view_verification','verification',false,false,false,null,'Verification submitted','Your verification status changed.'),
  ('verification_approved','worker_account','important','view_verification','verification',false,false,false,null,'Verification approved','Your verification status changed.'),
  ('verification_rejected','worker_account','action_required','view_verification','verification',true,true,true,null,'Verification correction required','Your verification requires attention.'),
  ('verification_resubmission_requested','worker_account','action_required','view_verification','verification',true,true,true,null,'Verification correction required','Your verification requires attention.'),
  ('verification_expired','worker_account','action_required','view_verification','verification',true,true,true,null,'Verification expired','Your verification requires attention.'),
  ('certificate_approved','worker_account','important','view_profile','provider_profile',false,false,false,null,'Certificate approved','Your worker profile has an update.'),
  ('certificate_rejected','worker_account','action_required','view_profile','provider_profile',true,true,true,null,'Certificate needs attention','Your worker profile requires attention.'),
  ('worker_profile_discoverable','worker_account','important','view_profile','provider_profile',false,false,false,null,'Profile available','Your worker profile is now visible in the marketplace.'),
  ('worker_profile_unavailable','worker_account','action_required','view_verification','verification',true,true,true,null,'Profile unavailable','Your worker profile requires attention.'),
  ('phone_verification_required','security','action_required','view_preferences','preferences',true,true,true,null,'Phone verification required','Your Warsha account requires attention.'),
  ('password_changed','security','critical',null,null,false,true,true,null,'Password changed','Your Warsha account security changed.'),
  ('email_changed','security','critical',null,null,false,true,true,null,'Email changed','Your Warsha account security changed.'),
  ('phone_changed','security','critical',null,null,false,true,true,null,'Phone changed','Your Warsha account security changed.'),
  ('new_review','reviews','important','view_review','booking_review',false,false,false,null,'New review','A completed booking has a review update.'),
  ('review_unlocked','reviews','important','write_review','booking_review',false,false,false,null,'Review available','A completed booking can now be reviewed.'),
  ('review_reply','reviews','informational','view_review','booking_review',false,false,false,null,'Review reply','A provider replied to a review.'),
  ('review_reported','reviews','important','view_review','booking_review',false,true,false,null,'Report received','Your review report was received.'),
  ('review_moderation_outcome','reviews','important','view_review','booking_review',false,true,false,null,'Review update','A review moderation decision is available.'),
  ('review_publication_held','reviews','important','view_dispute','booking_dispute',false,true,false,null,'Review publication held','Review publication changed because of a dispute.'),
  ('review_publication_restored','reviews','important','view_review','booking_review',false,true,false,null,'Review restored','Review publication is available again.'),
  ('dispute_opened','disputes','critical','view_dispute','booking_dispute',true,true,true,null,'Dispute opened','A booking dispute requires attention.'),
  ('dispute_evidence_requested','disputes','action_required','add_evidence','booking_dispute',true,true,true,null,'Evidence required','A dispute requires evidence.'),
  ('dispute_response_required','disputes','action_required','view_dispute','booking_dispute',true,true,true,null,'Response required','A dispute requires your response.'),
  ('dispute_resolved','disputes','important','view_resolution','booking_dispute',false,true,false,null,'Dispute resolved','A dispute decision is available.'),
  ('dispute_closed','disputes','important','view_resolution','booking_dispute',false,true,false,null,'Dispute closed','A dispute has been closed.'),
  ('communication_report_received','system','important',null,'booking',false,true,false,null,'Report received','Your safety report was received.'),
  ('conversation_read_only','messages','important','open_chat','conversation',false,true,false,null,'Conversation update','A booking conversation is now read-only.')
on conflict(event_type) do update set
  category=excluded.category,priority=excluded.priority,action_type=excluded.action_type,
  route_type=excluded.route_type,required_action=excluded.required_action,
  mandatory_in_app=excluded.mandatory_in_app,quiet_hours_bypass=excluded.quiet_hours_bypass,
  group_family=excluded.group_family,generic_title=excluded.generic_title,generic_body=excluded.generic_body;

create table private.notification_configuration (
  singleton boolean primary key default true check (singleton),
  policy_version integer not null default 1 check (policy_version > 0),
  push_provider text not null default 'disabled' check (push_provider in ('disabled')),
  push_delivery_enabled boolean not null default false check (not push_delivery_enabled),
  token_registration_enabled boolean not null default false check (not token_registration_enabled),
  scheduler_enabled boolean not null default false check (not scheduler_enabled),
  required_action_bypasses_quiet_hours boolean not null default true,
  reminder_attempt_limit integer not null default 2 check (reminder_attempt_limit between 1 and 3),
  updated_at timestamptz not null default pg_catalog.now()
);
insert into private.notification_configuration(singleton) values(true) on conflict(singleton) do nothing;

create table private.notification_source_links (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_key text not null check (pg_catalog.length(source_key) between 1 and 300),
  source_event_id uuid,
  event_type text not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique(user_id,source_key)
);
create index notification_source_links_notification_idx on private.notification_source_links(notification_id,created_at);

create or replace function private.reject_notification_source_link_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Notification source history is immutable' using errcode='55000'; end;
$$;
revoke all on function private.reject_notification_source_link_mutation() from public,anon,authenticated;
create trigger notification_source_links_immutable before update or delete on private.notification_source_links
for each row execute function private.reject_notification_source_link_mutation();

create table private.notification_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  encrypted_token text not null,
  platform text not null check (platform in ('android','ios','web')),
  app_version text not null check (pg_catalog.length(app_version) between 1 and 40),
  device_label text check (device_label is null or pg_catalog.length(device_label) <= 100),
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique(user_id,token_hash)
);

create table private.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  token_id uuid references private.notification_device_tokens(id) on delete restrict,
  channel text not null check (channel in ('push')),
  status text not null check (status in ('pending','delivered','failed','suppressed','disabled')),
  provider_code text,
  attempted_at timestamptz not null default pg_catalog.now()
);

create table private.notification_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_key text not null check (policy_key in (
    'worker_confirmation','booking_approaching','inspection_pending','payment_pending',
    'review_opportunity','dispute_deadline','verification_correction','worker_profile_incomplete','conversation_boundary'
  )),
  resource_type text not null check (resource_type in ('marketplace_request','booking','review','dispute','verification','provider_profile')),
  resource_id uuid not null,
  run_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending','suppressed','completed','disabled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  dedupe_key text not null unique check (pg_catalog.length(dedupe_key) between 8 and 300),
  last_checked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create table private.notification_operational_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key in (
    'notification_created','notification_deduplicated','notification_grouped','notification_archived',
    'push_disabled','reminder_disabled','reminder_suppressed','route_inaccessible','preference_suppressed'
  )),
  user_id uuid references public.profiles(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on private.notification_event_catalog, private.notification_configuration,
  private.notification_source_links, private.notification_device_tokens,
  private.notification_delivery_attempts, private.notification_reminder_jobs,
  private.notification_operational_events from public,anon,authenticated;

create or replace function private.notification_safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path=''
as $$
begin
  if p_value is null or p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return p_value::uuid;
exception when invalid_text_representation then return null;
end;
$$;

create or replace function private.notification_data_uuid(p_data jsonb,p_snake text,p_camel text default null)
returns uuid
language sql
immutable
set search_path=''
as $$
  select private.notification_safe_uuid(coalesce(p_data->>p_snake,case when p_camel is null then null else p_data->>p_camel end))
$$;

create or replace function private.notification_safe_payload(p_data jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'booking_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'booking_id','bookingId'),
    'provider_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'provider_id','providerId'),
    'request_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'request_id','requestId'),
    'quote_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'quote_id','quoteId'),
    'conversation_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'conversation_id','conversationId'),
    'review_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'review_id','reviewId'),
    'dispute_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'dispute_id','disputeId'),
    'payment_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'payment_id','paymentId'),
    'withdrawal_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'withdrawal_id','withdrawalId'),
    'verification_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'verification_id','verificationId'),
    'certification_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'certification_id','certificationId'),
    'report_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'report_id','reportId'),
    'history_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'history_id','historyId'),
    'event_id',private.notification_data_uuid(coalesce(p_data,'{}'::jsonb),'event_id','eventId')
  ))
$$;

create or replace function private.notification_category(p_type text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_type like 'dispute_%' then 'disputes'
    when p_type like 'payment_%' or p_type like 'refund_%' or p_type like 'earnings_%'
      or p_type like 'withdrawal_%' or p_type like 'cash_%' then 'payments'
    when p_type like 'verification_%' or p_type like 'certificate_%'
      or p_type like 'worker_profile_%' then 'worker_account'
    when p_type like 'review_%' or p_type='new_review' then 'reviews'
    when p_type in ('booking_message','booking_attachment','conversation_read_only') then 'messages'
    when p_type like 'quote_%' or p_type like 'request_%' or p_type like 'marketplace_%'
      or p_type in ('emergency_request','rescue_started','worker_no_show_reported','customer_no_show_reported') then 'marketplace'
    when p_type like 'booking_%' or p_type like 'operation_%' or p_type like 'return_visit_%'
      or p_type in ('new_booking_request','worker_running_late','review_unlocked') then 'bookings'
    when p_type like '%password%' or p_type like '%email%' or p_type like '%phone%' or p_type like 'security_%' then 'security'
    else 'system' end
$$;

create or replace function private.notification_priority(p_type text,p_category text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_type like '%cancelled' or p_type like '%failed' or p_type like 'dispute_opened'
      or p_type in ('emergency_request','quote_confirmation_expired','password_changed','email_changed','phone_changed') then 'critical'
    when p_type like '%requested' or p_type like '%required' or p_type like '%pending_approval'
      or p_type like '%resubmission%' or p_type in ('quote_selected','new_booking_request','operation_ready_for_inspection') then 'action_required'
    when p_category in ('messages','system') then 'informational'
    else 'important' end
$$;

create or replace function private.notification_route_type(p_type text,p_category text,p_data jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when p_type in ('booking_message','booking_attachment','conversation_read_only') then 'conversation'
    when p_type in ('quote_invitation','emergency_request','request_edited','request_awarded_elsewhere','request_cancelled','quote_expired') then 'worker_opportunities'
    when p_type='quote_selected' then 'worker_quote'
    when p_category='marketplace' and p_data ? 'request_id' then 'marketplace_request'
    when p_category='payments' and (p_type like 'earnings_%' or p_type like 'withdrawal_%' or p_type like 'cash_%') then 'worker_earnings'
    when p_category='payments' and p_data ? 'booking_id' then 'booking_payment'
    when p_category='worker_account' and p_type like 'verification_%' then 'verification'
    when p_category='worker_account' and p_data ? 'provider_id' then 'provider_profile'
    when p_category='reviews' and p_data ? 'booking_id' then 'booking_review'
    when p_category='disputes' and (p_data ? 'booking_id' or p_data ? 'dispute_id') then 'booking_dispute'
    when p_data ? 'booking_id' then 'booking'
    else null end
$$;

create or replace function private.notification_resource_id(p_route_type text,p_data jsonb)
returns uuid language sql immutable set search_path='' as $$
  select case p_route_type
    when 'marketplace_request' then private.notification_data_uuid(p_data,'request_id')
    when 'worker_quote' then coalesce(private.notification_data_uuid(p_data,'quote_id'),private.notification_data_uuid(p_data,'request_id'))
    when 'booking' then private.notification_data_uuid(p_data,'booking_id')
    when 'conversation' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'conversation_id'))
    when 'provider_profile' then private.notification_data_uuid(p_data,'provider_id')
    when 'booking_payment' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'payment_id'))
    when 'verification' then coalesce(private.notification_data_uuid(p_data,'provider_id'),private.notification_data_uuid(p_data,'verification_id'))
    when 'booking_review' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'review_id'))
    when 'booking_dispute' then coalesce(private.notification_data_uuid(p_data,'booking_id'),private.notification_data_uuid(p_data,'dispute_id'))
    else null end
$$;

create or replace function private.notification_audience(p_user_id uuid,p_type text,p_data jsonb)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare booking_id uuid:=private.notification_data_uuid(p_data,'booking_id'); target_request_id uuid:=private.notification_data_uuid(p_data,'request_id'); provider_id uuid:=private.notification_data_uuid(p_data,'provider_id'); review_id uuid:=private.notification_data_uuid(p_data,'review_id'); dispute_id uuid:=private.notification_data_uuid(p_data,'dispute_id');
begin
  if booking_id is not null then
    if exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=booking_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if target_request_id is not null then
    if exists(select 1 from public.marketplace_requests r where r.id=target_request_id and r.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.quote_invitations i join public.provider_profiles p on p.id=i.provider_id where i.request_id=target_request_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if review_id is not null then
    if exists(select 1 from public.reviews r where r.id=review_id and r.customer_id=p_user_id) then return 'customer'; end if;
    if exists(select 1 from public.reviews r join public.provider_profiles p on p.id=r.provider_id where r.id=review_id and p.user_id=p_user_id) then return 'worker'; end if;
  end if;
  if dispute_id is not null then
    select d.booking_id into booking_id from public.disputes d where d.id=dispute_id;
    if booking_id is not null then return private.notification_audience(p_user_id,p_type,pg_catalog.jsonb_build_object('booking_id',booking_id)); end if;
  end if;
  if provider_id is not null and exists(select 1 from public.provider_profiles p where p.id=provider_id and p.user_id=p_user_id) then return 'worker'; end if;
  if p_type like 'verification_%' or p_type like 'certificate_%' or p_type like 'earnings_%'
    or p_type like 'withdrawal_%' or p_type in ('quote_invitation','quote_selected','emergency_request','request_edited') then return 'worker'; end if;
  return 'all';
end;
$$;

revoke all on function private.notification_safe_uuid(text) from public,anon,authenticated;
revoke all on function private.notification_data_uuid(jsonb,text,text) from public,anon,authenticated;
revoke all on function private.notification_safe_payload(jsonb) from public,anon,authenticated;
revoke all on function private.notification_category(text) from public,anon,authenticated;
revoke all on function private.notification_priority(text,text) from public,anon,authenticated;
revoke all on function private.notification_route_type(text,text,jsonb) from public,anon,authenticated;
revoke all on function private.notification_resource_id(text,jsonb) from public,anon,authenticated;
revoke all on function private.notification_audience(uuid,text,jsonb) from public,anon,authenticated;

create or replace function private.prepare_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare catalog private.notification_event_catalog%rowtype; safe_data jsonb; existing_id uuid; preference_enabled boolean:=true; mandatory boolean:=false; raw_source_key text;
begin
  new.event_key:=pg_catalog.left(coalesce(nullif(new.event_key,''),pg_catalog.regexp_replace(pg_catalog.lower(new.type),'[^a-z0-9_]+','_','g')),100);
  if new.event_key='' then new.event_key:='system_update'; end if;
  safe_data:=private.notification_safe_payload(new.data);
  new.data:=safe_data;
  select * into catalog from private.notification_event_catalog c where c.event_type=new.event_key;
  new.category:=coalesce(catalog.category,private.notification_category(new.event_key));
  new.priority:=coalesce(catalog.priority,private.notification_priority(new.event_key,new.category));
  new.action_type:=catalog.action_type;
  new.route_type:=coalesce(catalog.route_type,private.notification_route_type(new.event_key,new.category,safe_data));
  new.resource_id:=private.notification_resource_id(new.route_type,safe_data);
  new.required_action:=coalesce(catalog.required_action,new.priority='action_required');
  mandatory:=coalesce(catalog.mandatory_in_app,false) or new.required_action or new.priority='critical' or new.category in ('payments','disputes','security');
  new.audience:=private.notification_audience(new.user_id,new.event_key,safe_data);
  new.source_event_id:=coalesce(new.source_event_id,
    private.notification_data_uuid(safe_data,'event_id'),private.notification_data_uuid(safe_data,'history_id'),
    private.notification_data_uuid(safe_data,'report_id'),private.notification_data_uuid(safe_data,'review_id'));
  raw_source_key:=coalesce(nullif(new.source_key,''),nullif(new.dedupe_key,''),coalesce(new.source_event_id,new.resource_id,new.id)::text);
  new.source_key:=new.event_key||':'||case when pg_catalog.length(raw_source_key)<=190 then raw_source_key
    else pg_catalog.left(raw_source_key,125)||':'||pg_catalog.encode(extensions.digest(raw_source_key,'sha256'),'hex') end;
  new.group_family:=catalog.group_family;
  new.group_key:=case
    when catalog.group_family='conversation' and private.notification_data_uuid(safe_data,'booking_id') is not null
      then 'conversation:'||private.notification_data_uuid(safe_data,'booking_id')::text
    when catalog.group_family='marketplace_quotes' and private.notification_data_uuid(safe_data,'request_id') is not null
      then 'marketplace-quotes:'||private.notification_data_uuid(safe_data,'request_id')::text
    else null end;
  new.group_count:=greatest(coalesce(new.group_count,1),1);
  new.last_event_at:=coalesce(new.last_event_at,new.created_at,pg_catalog.now());
  new.title:=coalesce(catalog.generic_title,case new.category
    when 'marketplace' then 'Marketplace update' when 'bookings' then 'Booking update'
    when 'messages' then 'New message' when 'payments' then 'Payment update'
    when 'worker_account' then 'Worker account update' when 'reviews' then 'Review update'
    when 'disputes' then 'Dispute update' when 'security' then 'Account security update' else 'Warsha update' end);
  new.body:=coalesce(catalog.generic_body,case new.category
    when 'marketplace' then 'Your service request has an update.' when 'bookings' then 'Your booking has an update.'
    when 'messages' then 'You have a new message in Warsha.' when 'payments' then 'Your payment status changed.'
    when 'worker_account' then 'Your worker account has an update.' when 'reviews' then 'A review has an update.'
    when 'disputes' then 'Your dispute has an update.' when 'security' then 'Your Warsha account security changed.' else 'You have an update in Warsha.' end);

  if exists(select 1 from public.notifications n where n.user_id=new.user_id and n.source_key=new.source_key)
    or exists(select 1 from private.notification_source_links l where l.user_id=new.user_id and l.source_key=new.source_key) then
    insert into private.notification_operational_events(event_key,user_id,metadata)
    values('notification_deduplicated',new.user_id,pg_catalog.jsonb_build_object('category',new.category));
    return null;
  end if;

  if not mandatory then
    select coalesce((p.category_preferences->>new.category)::boolean,true) into preference_enabled
    from public.notification_preferences p where p.user_id=new.user_id;
    if not coalesce(preference_enabled,true) then
      insert into private.notification_operational_events(event_key,user_id,metadata)
      values('preference_suppressed',new.user_id,pg_catalog.jsonb_build_object('category',new.category));
      return null;
    end if;
  end if;

  if new.group_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':'||new.group_key,0));
    select n.id into existing_id from public.notifications n
    where n.user_id=new.user_id and n.group_key=new.group_key and n.read_at is null and n.archived_at is null
    order by n.created_at desc limit 1 for update;
    if existing_id is not null then
      update public.notifications set group_count=group_count+1,last_event_at=new.last_event_at,created_at=new.last_event_at
      where id=existing_id;
      insert into private.notification_source_links(notification_id,user_id,source_key,source_event_id,event_type)
      values(existing_id,new.user_id,new.source_key,new.source_event_id,new.event_key) on conflict(user_id,source_key) do nothing;
      insert into private.notification_operational_events(event_key,user_id,notification_id,metadata)
      values('notification_grouped',new.user_id,existing_id,pg_catalog.jsonb_build_object('category',new.category));
      return null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.link_notification_source()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.notification_source_links(notification_id,user_id,source_key,source_event_id,event_type)
  values(new.id,new.user_id,new.source_key,new.source_event_id,new.event_key)
  on conflict(user_id,source_key) do nothing;
  insert into private.notification_operational_events(event_key,user_id,notification_id,metadata)
  values('notification_created',new.user_id,new.id,pg_catalog.jsonb_build_object('category',new.category));
  return new;
end;
$$;
revoke all on function private.prepare_notification() from public,anon,authenticated;
revoke all on function private.link_notification_source() from public,anon,authenticated;

drop trigger if exists notifications_prepare_wps014 on public.notifications;
create trigger notifications_prepare_wps014 before insert on public.notifications
for each row execute function private.prepare_notification();
drop trigger if exists notifications_source_link_wps014 on public.notifications;
create trigger notifications_source_link_wps014 after insert on public.notifications
for each row execute function private.link_notification_source();

update public.notifications n set
  event_key=pg_catalog.left(coalesce(nullif(n.event_key,''),pg_catalog.regexp_replace(pg_catalog.lower(n.type),'[^a-z0-9_]+','_','g')),100),
  data=private.notification_safe_payload(n.data),
  category=coalesce(n.category,private.notification_category(n.type)),
  priority=coalesce(n.priority,private.notification_priority(n.type,private.notification_category(n.type))),
  audience=coalesce(n.audience,private.notification_audience(n.user_id,n.type,private.notification_safe_payload(n.data))),
  route_type=coalesce(n.route_type,private.notification_route_type(n.type,private.notification_category(n.type),private.notification_safe_payload(n.data))),
  source_key='legacy:'||n.id::text,
  group_count=greatest(coalesce(n.group_count,1),1),
  last_event_at=coalesce(n.last_event_at,n.created_at),
  archived_at=coalesce(n.archived_at,n.dismissed_at);

-- Retained rows receive the same privacy-safe copy and policy metadata as new
-- rows. Raw historical title/body values are never part of the client surface.
update public.notifications n set
  action_type=c.action_type,
  route_type=coalesce(c.route_type,n.route_type),
  required_action=c.required_action,
  group_family=c.group_family,
  title=c.generic_title,
  body=c.generic_body
from private.notification_event_catalog c
where c.event_type=n.event_key;

update public.notifications n set
  required_action=(n.priority='action_required'),
  title=case n.category
    when 'marketplace' then 'Marketplace update' when 'bookings' then 'Booking update'
    when 'messages' then 'New message' when 'payments' then 'Payment update'
    when 'worker_account' then 'Worker account update' when 'reviews' then 'Review update'
    when 'disputes' then 'Dispute update' when 'security' then 'Account security update' else 'Warsha update' end,
  body=case n.category
    when 'marketplace' then 'Your service request has an update.' when 'bookings' then 'Your booking has an update.'
    when 'messages' then 'You have a new message in Warsha.' when 'payments' then 'Your payment status changed.'
    when 'worker_account' then 'Your worker account has an update.' when 'reviews' then 'A review has an update.'
    when 'disputes' then 'Your dispute has an update.' when 'security' then 'Your Warsha account security changed.' else 'You have an update in Warsha.' end
where not exists(select 1 from private.notification_event_catalog c where c.event_type=n.event_key);

update public.notifications n set resource_id=private.notification_resource_id(n.route_type,n.data)
where n.resource_id is null and n.route_type is not null;

insert into private.notification_source_links(notification_id,user_id,source_key,source_event_id,event_type,created_at)
select n.id,n.user_id,n.source_key,n.source_event_id,n.event_key,n.created_at from public.notifications n
on conflict(user_id,source_key) do nothing;

alter table public.notifications
  alter column event_key set not null,
  alter column category set not null,
  alter column priority set not null,
  alter column audience set not null,
  alter column source_key set not null,
  alter column last_event_at set not null;

create or replace function private.notification_mode_allowed(p_user_id uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_mode
    when 'customer' then exists(select 1 from public.customer_profiles c where c.id=p_user_id)
    when 'worker' then exists(select 1 from public.provider_profiles p where p.user_id=p_user_id and p.deleted_at is null)
    else false end
$$;

create or replace function private.notification_visible_in_mode(p_audience text,p_mode text)
returns boolean language sql immutable set search_path='' as $$
  select p_audience='all' or p_audience=p_mode
$$;

create or replace function private.notification_action_is_open(p_notification public.notifications)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare state text;
begin
  if not p_notification.required_action or p_notification.action_resolved_at is not null then return false; end if;
  if p_notification.event_key='new_booking_request' then
    select b.status into state from public.bookings b where b.id=coalesce(private.notification_data_uuid(p_notification.data,'booking_id'),p_notification.resource_id);
    return coalesce(state='pending_provider_approval',false);
  elsif p_notification.event_key in ('operation_ready_for_inspection','operation_inspection') then
    select o.current_state into state from public.booking_operations o where o.booking_id=private.notification_data_uuid(p_notification.data,'booking_id');
    return coalesce(state='customer_inspection',false);
  elsif p_notification.event_key in ('operation_additional_work_requested','operation_waiting_for_approval') then
    select o.current_state into state from public.booking_operations o where o.booking_id=private.notification_data_uuid(p_notification.data,'booking_id');
    return coalesce(state='waiting_for_approval',false);
  elsif p_notification.event_key='operation_return_visit_requested' then
    return exists(select 1 from public.booking_return_visits v where v.booking_id=private.notification_data_uuid(p_notification.data,'booking_id') and v.status='requested');
  end if;
  if p_notification.route_type='marketplace_request' or p_notification.route_type='worker_quote' then
    select r.status into state from public.marketplace_requests r
    where r.id=coalesce(private.notification_data_uuid(p_notification.data,'request_id'),p_notification.resource_id);
    return coalesce(state not in ('converted_to_booking','cancelled','expired','closed'),false);
  elsif p_notification.route_type in ('booking','conversation') then
    select b.status into state from public.bookings b
    where b.id=coalesce(private.notification_data_uuid(p_notification.data,'booking_id'),p_notification.resource_id);
    return coalesce(state not in ('completed','cancelled','refunded','rejected'),false);
  elsif p_notification.route_type='booking_payment' then
    select f.status into state from public.financial_booking_payments f
    where f.booking_id=private.notification_data_uuid(p_notification.data,'booking_id')
       or f.id=private.notification_data_uuid(p_notification.data,'payment_id') limit 1;
    return coalesce(state in ('awaiting_payment','payment_initiated','pending','failed','expired'),false);
  elsif p_notification.route_type='verification' then
    select v.status into state from public.provider_verifications v
    join public.provider_profiles p on p.id=v.provider_id
    where p.user_id=p_notification.user_id limit 1;
    return coalesce(state in ('not_started','draft','rejected','requires_resubmission','expired'),false);
  elsif p_notification.route_type='booking_dispute' then
    select d.status into state from public.disputes d
    where d.id=private.notification_data_uuid(p_notification.data,'dispute_id')
       or d.booking_id=private.notification_data_uuid(p_notification.data,'booking_id')
    order by d.created_at desc limit 1;
    return coalesce(state in ('submitted','waiting_customer','waiting_worker','waiting_staff','under_review'),false);
  end if;
  return true;
end;
$$;

revoke all on function private.notification_mode_allowed(uuid,text) from public,anon,authenticated;
revoke all on function private.notification_visible_in_mode(text,text) from public,anon,authenticated;
revoke all on function private.notification_action_is_open(public.notifications) from public,anon,authenticated;

create or replace function public.get_my_notifications(
  p_mode text,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20,
  p_archived boolean default false,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); result jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.notification_mode_allowed(uid,p_mode) then raise exception 'Notification mode is not available' using errcode='42501'; end if;
  if p_limit not between 1 and 50 or (p_category is not null and p_category not in ('marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system'))
  then raise exception 'Invalid notification query' using errcode='22023'; end if;
  select coalesce(pg_catalog.jsonb_agg(item order by sort_at desc,item_id desc),'[]'::jsonb) into result
  from (
    select n.id item_id,n.last_event_at sort_at,pg_catalog.jsonb_build_object(
      'id',n.id,'eventKey',n.event_key,'category',n.category,'priority',n.priority,'audience',n.audience,
      'actionType',n.action_type,'routeType',n.route_type,'resourceId',n.resource_id,
      'groupFamily',n.group_family,'groupCount',n.group_count,'requiredAction',n.required_action,
      'actionOpen',private.notification_action_is_open(n),'readAt',n.read_at,'archivedAt',n.archived_at,
      'createdAt',n.created_at,'lastEventAt',n.last_event_at
    ) item
    from public.notifications n
    where n.user_id=uid and private.notification_visible_in_mode(n.audience,p_mode)
      and ((p_archived and n.archived_at is not null) or (not p_archived and n.archived_at is null))
      and (p_before is null or (n.last_event_at,n.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      and (p_category is null or n.category=p_category)
    order by n.last_event_at desc,n.id desc limit p_limit
  ) rows;
  return result;
end;
$$;

create or replace function public.get_my_notification_counts(p_mode text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); category_counts jsonb; global_count integer; chat_count integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.notification_mode_allowed(uid,p_mode) then raise exception 'Notification mode is not available' using errcode='42501'; end if;
  select pg_catalog.count(*)::integer into global_count from public.notifications n
  where n.user_id=uid and n.read_at is null and n.archived_at is null and private.notification_visible_in_mode(n.audience,p_mode);
  select coalesce(pg_catalog.jsonb_object_agg(category,total),'{}'::jsonb) into category_counts
  from (select n.category,pg_catalog.count(*)::integer total from public.notifications n
    where n.user_id=uid and n.read_at is null and n.archived_at is null and private.notification_visible_in_mode(n.audience,p_mode)
    group by n.category) counted;
  select pg_catalog.count(*)::integer into chat_count
  from public.messages m join public.conversations c on c.id=m.conversation_id
  join public.conversation_members cm on cm.conversation_id=c.id and cm.user_id=uid
  where m.sender_id is distinct from uid and m.deleted_at is null
    and m.created_at>coalesce(cm.last_read_at,'-infinity'::timestamptz)
    and exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id
      where b.id=c.booking_id and ((p_mode='customer' and b.customer_id=uid) or (p_mode='worker' and p.user_id=uid)));
  return pg_catalog.jsonb_build_object('globalUnread',global_count,'categoryUnread',category_counts,'chatUnread',chat_count);
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid,p_mode text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null or not private.notification_mode_allowed(uid,p_mode) then raise exception 'Notification is not available' using errcode='42501'; end if;
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now())
  where id=p_notification_id and user_id=uid and archived_at is null and private.notification_visible_in_mode(audience,p_mode);
  if not found then raise exception 'Notification is not available' using errcode='22023'; end if;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now()) where id=p_notification_id and user_id=uid and archived_at is null;
  if not found then raise exception 'Notification is not available' using errcode='22023'; end if;
end;
$$;

create or replace function public.mark_all_notifications_read(p_mode text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null or not private.notification_mode_allowed(uid,p_mode) then raise exception 'Notification mode is not available' using errcode='42501'; end if;
  update public.notifications set read_at=pg_catalog.now()
  where user_id=uid and read_at is null and archived_at is null and private.notification_visible_in_mode(audience,p_mode);
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.notifications set read_at=pg_catalog.now() where user_id=uid and read_at is null and archived_at is null;
end;
$$;

create or replace function public.archive_notification(p_notification_id uuid,p_mode text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); notification_row public.notifications;
begin
  if uid is null or not private.notification_mode_allowed(uid,p_mode) then raise exception 'Notification is not available' using errcode='42501'; end if;
  select * into notification_row from public.notifications n where n.id=p_notification_id and n.user_id=uid
    and n.archived_at is null and private.notification_visible_in_mode(n.audience,p_mode) for update;
  if notification_row.id is null then raise exception 'Notification is not available' using errcode='22023'; end if;
  if private.notification_action_is_open(notification_row) then raise exception 'Resolve this action before archiving it' using errcode='55000'; end if;
  update public.notifications set archived_at=pg_catalog.now(),dismissed_at=coalesce(dismissed_at,pg_catalog.now()),read_at=coalesce(read_at,pg_catalog.now()) where id=notification_row.id;
  insert into private.notification_operational_events(event_key,user_id,notification_id)
  values('notification_archived',uid,notification_row.id);
end;
$$;

create or replace function public.dismiss_notification(p_notification_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); notification_row public.notifications;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into notification_row from public.notifications n where n.id=p_notification_id and n.user_id=uid and n.archived_at is null for update;
  if notification_row.id is null then raise exception 'Notification is not available' using errcode='22023'; end if;
  if private.notification_action_is_open(notification_row) then raise exception 'Resolve this action before archiving it' using errcode='55000'; end if;
  update public.notifications set archived_at=pg_catalog.now(),dismissed_at=coalesce(dismissed_at,pg_catalog.now()),read_at=coalesce(read_at,pg_catalog.now()) where id=notification_row.id;
  insert into private.notification_operational_events(event_key,user_id,notification_id)
  values('notification_archived',uid,notification_row.id);
end;
$$;

create or replace function public.get_my_notification_preferences()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); preference public.notification_preferences;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.notification_preferences(user_id,push_enabled,email_enabled,sms_enabled)
  values(uid,false,false,false) on conflict(user_id) do nothing;
  select * into preference from public.notification_preferences p where p.user_id=uid;
  return pg_catalog.jsonb_build_object(
    'categories',preference.category_preferences,'inAppEnabled',true,'pushEnabled',false,'pushAvailable',false,
    'genericPreviews',preference.generic_previews,
    'quietHours',pg_catalog.jsonb_build_object('enabled',preference.quiet_hours_enabled,
      'start',case when preference.quiet_hours_start is null then null else pg_catalog.to_char(preference.quiet_hours_start,'HH24:MI') end,
      'end',case when preference.quiet_hours_end is null then null else pg_catalog.to_char(preference.quiet_hours_end,'HH24:MI') end,
      'timezone',preference.timezone)
  );
end;
$$;

create or replace function public.update_my_notification_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); current_preferences public.notification_preferences; categories jsonb; quiet jsonb; quiet_enabled boolean; quiet_start time; quiet_end time; zone text; generic boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_preferences is null or pg_catalog.jsonb_typeof(p_preferences)<>'object'
    or p_preferences-array['categories','quietHours','genericPreviews']<>'{}'::jsonb
  then raise exception 'Invalid notification preferences' using errcode='22023'; end if;
  insert into public.notification_preferences(user_id,push_enabled,email_enabled,sms_enabled)
  values(uid,false,false,false) on conflict(user_id) do nothing;
  select * into current_preferences from public.notification_preferences p where p.user_id=uid for update;
  categories:=coalesce(p_preferences->'categories',current_preferences.category_preferences);
  if not private.notification_category_preferences_valid(categories) then raise exception 'Invalid notification categories' using errcode='22023'; end if;
  quiet:=coalesce(p_preferences->'quietHours','{}'::jsonb);
  if pg_catalog.jsonb_typeof(quiet)<>'object' or quiet-array['enabled','start','end','timezone']<>'{}'::jsonb
  then raise exception 'Invalid quiet hours' using errcode='22023'; end if;
  quiet_enabled:=coalesce((quiet->>'enabled')::boolean,current_preferences.quiet_hours_enabled);
  quiet_start:=case when quiet ? 'start' then nullif(quiet->>'start','')::time else current_preferences.quiet_hours_start end;
  quiet_end:=case when quiet ? 'end' then nullif(quiet->>'end','')::time else current_preferences.quiet_hours_end end;
  zone:=coalesce(nullif(quiet->>'timezone',''),current_preferences.timezone);
  generic:=coalesce((p_preferences->>'genericPreviews')::boolean,current_preferences.generic_previews);
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone)
    or (quiet_enabled and (quiet_start is null or quiet_end is null or quiet_start is not distinct from quiet_end))
  then raise exception 'Invalid quiet hours' using errcode='22023'; end if;
  update public.notification_preferences set category_preferences=categories,quiet_hours_enabled=quiet_enabled,
    quiet_hours_start=quiet_start,quiet_hours_end=quiet_end,timezone=zone,generic_previews=generic,
    push_enabled=false,email_enabled=false,sms_enabled=false,updated_at=pg_catalog.now() where user_id=uid;
  return public.get_my_notification_preferences();
exception when invalid_text_representation then raise exception 'Invalid notification preferences' using errcode='22023';
end;
$$;

create or replace function private.notification_quiet_hours_active(p_user_id uuid,p_at timestamptz default pg_catalog.now())
returns boolean language plpgsql stable security definer set search_path='' as $$
declare preference public.notification_preferences; local_time time;
begin
  select * into preference from public.notification_preferences p where p.user_id=p_user_id;
  if not coalesce(preference.quiet_hours_enabled,false) then return false; end if;
  local_time:=(p_at at time zone preference.timezone)::time;
  if preference.quiet_hours_start<preference.quiet_hours_end then return local_time>=preference.quiet_hours_start and local_time<preference.quiet_hours_end; end if;
  return local_time>=preference.quiet_hours_start or local_time<preference.quiet_hours_end;
end;
$$;

create or replace function public.resolve_notification_route(p_notification_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); n public.notifications; booking_id uuid; target_request_id uuid; quote_id uuid; provider_id uuid; invitation_id uuid; allowed boolean:=false; route_resource uuid;
begin
  if uid is null or not private.notification_mode_allowed(uid,p_mode) then return pg_catalog.jsonb_build_object('status','inaccessible'); end if;
  select * into n from public.notifications owned where owned.id=p_notification_id and owned.user_id=uid and private.notification_visible_in_mode(owned.audience,p_mode);
  if n.id is null then return pg_catalog.jsonb_build_object('status','inaccessible'); end if;
  if n.route_type is null then return pg_catalog.jsonb_build_object('status','no_action'); end if;
  if n.route_type='preferences' then return pg_catalog.jsonb_build_object('status','ok','routeType','preferences'); end if;
  if n.route_type='worker_opportunities' then
    if p_mode='worker' and exists(select 1 from public.provider_profiles p where p.user_id=uid and p.deleted_at is null)
    then return pg_catalog.jsonb_build_object('status','ok','routeType','worker_opportunities'); end if;
    return pg_catalog.jsonb_build_object('status','inaccessible');
  end if;
  booking_id:=private.notification_data_uuid(n.data,'booking_id');
  target_request_id:=private.notification_data_uuid(n.data,'request_id');
  quote_id:=private.notification_data_uuid(n.data,'quote_id');
  provider_id:=private.notification_data_uuid(n.data,'provider_id');
  if n.route_type='marketplace_request' then
    select exists(select 1 from public.marketplace_requests r where r.id=target_request_id and r.customer_id=uid) into allowed;
    route_resource:=target_request_id;
  elsif n.route_type='worker_quote' then
    select i.id into invitation_id from public.quote_invitations i
    join public.provider_profiles p on p.id=i.provider_id
    left join public.worker_quotes q on q.invitation_id=i.id
    where p.user_id=uid and ((quote_id is not null and q.id=quote_id) or (target_request_id is not null and i.request_id=target_request_id))
    order by i.invited_at desc limit 1;
    allowed:=p_mode='worker' and invitation_id is not null; route_resource:=invitation_id;
  elsif n.route_type in ('booking','conversation','booking_payment','booking_review','booking_dispute') then
    if booking_id is null and n.route_type='booking_dispute' then select d.booking_id into booking_id from public.disputes d where d.id=private.notification_data_uuid(n.data,'dispute_id'); end if;
    if booking_id is null and n.route_type='booking_review' then select r.booking_id into booking_id from public.reviews r where r.id=private.notification_data_uuid(n.data,'review_id'); end if;
    select exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id
      where b.id=booking_id and ((p_mode='customer' and b.customer_id=uid) or (p_mode='worker' and p.user_id=uid))) into allowed;
    route_resource:=booking_id;
  elsif n.route_type='provider_profile' then
    select exists(select 1 from public.provider_profiles p where p.id=provider_id and (p.user_id=uid or private.is_provider_publicly_discoverable(p.id))) into allowed;
    route_resource:=provider_id;
  elsif n.route_type in ('worker_earnings','verification') then
    allowed:=p_mode='worker' and exists(select 1 from public.provider_profiles p where p.user_id=uid and p.deleted_at is null);
  end if;
  if not coalesce(allowed,false) then
    insert into private.notification_operational_events(event_key,user_id,notification_id)
    values('route_inaccessible',uid,n.id);
    return pg_catalog.jsonb_build_object('status',case when n.resource_id is null and booking_id is null and target_request_id is null then 'stale' else 'inaccessible' end);
  end if;
  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('status','ok','routeType',n.route_type,'resourceId',route_resource));
end;
$$;

create or replace function public.register_push_token(p_token text,p_platform text,p_app_version text,p_device_label text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); enabled boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_platform not in ('android','ios','web') or pg_catalog.length(coalesce(p_token,'')) not between 16 and 4096
    or pg_catalog.length(coalesce(p_app_version,'')) not between 1 and 40 or pg_catalog.length(coalesce(p_device_label,''))>100
  then raise exception 'Invalid push token' using errcode='22023'; end if;
  select token_registration_enabled into enabled from private.notification_configuration where singleton;
  if not coalesce(enabled,false) then
    insert into private.notification_operational_events(event_key,user_id) values('push_disabled',uid);
    raise exception 'Push token registration is disabled' using errcode='55000';
  end if;
  raise exception 'Push provider is disabled' using errcode='55000';
end;
$$;

create or replace function public.revoke_push_token(p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update private.notification_device_tokens set revoked_at=coalesce(revoked_at,pg_catalog.now()),updated_at=pg_catalog.now()
  where user_id=uid and token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
end;
$$;

create or replace function public.revoke_my_push_tokens()
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update private.notification_device_tokens set revoked_at=coalesce(revoked_at,pg_catalog.now()),updated_at=pg_catalog.now() where user_id=uid and revoked_at is null;
end;
$$;

create or replace function private.process_notification_reminders(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid reminder limit' using errcode='22023'; end if;
  select scheduler_enabled into enabled from private.notification_configuration where singleton;
  if not coalesce(enabled,false) then return pg_catalog.jsonb_build_object('status','disabled','claimed',0); end if;
  return pg_catalog.jsonb_build_object('status','disabled','claimed',0);
end;
$$;

revoke all on function private.notification_quiet_hours_active(uuid,timestamptz) from public,anon,authenticated;
revoke all on function private.process_notification_reminders(integer) from public,anon,authenticated;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.get_my_notifications(text,timestamptz,uuid,integer,boolean,text)',
    'public.get_my_notification_counts(text)',
    'public.mark_notification_read(uuid,text)','public.mark_notification_read(uuid)',
    'public.mark_all_notifications_read(text)','public.mark_all_notifications_read()',
    'public.archive_notification(uuid,text)','public.dismiss_notification(uuid)',
    'public.get_my_notification_preferences()','public.update_my_notification_preferences(jsonb)',
    'public.resolve_notification_route(uuid,text)','public.register_push_token(text,text,text,text)',
    'public.revoke_push_token(text)','public.revoke_my_push_tokens()'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon';
    execute 'grant execute on function '||signature||' to authenticated';
  end loop;
end;
$$;

-- Owners keep RLS-protected reads for WPS-005 compatibility. All client writes
-- and all preference writes go through guarded RPCs.
revoke insert,update,delete on public.notifications from authenticated;
revoke insert,update,delete on public.notification_preferences from authenticated;
grant select on public.notifications,public.notification_preferences to authenticated;

-- WPS-012 fine-grained operation events own the five legacy operation milestone
-- notifications. The booking history row is still recorded exactly once.
create or replace function private.record_booking_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); provider_uid uuid; recipient uuid; event_type text; history_id uuid;
  operation_managed boolean:=coalesce(pg_catalog.current_setting('warsha.operation_authority',true),'')='true';
  legacy_operation_milestone boolean:=false;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if tg_op='INSERT' or old.status is distinct from new.status then
    select p.user_id into provider_uid from public.provider_profiles p where p.id=new.provider_id;
    if uid is distinct from new.customer_id and uid is distinct from provider_uid then raise exception 'Booking action is not available' using errcode='42501'; end if;
    insert into public.booking_status_history(booking_id,status,actor_id) values(new.id,new.status,uid) returning id into history_id;
    legacy_operation_milestone:=tg_op='UPDATE' and new.status in ('provider_on_the_way','provider_arrived','job_started','work_in_progress','completed');
    if not operation_managed and not legacy_operation_milestone then
      if tg_op='INSERT' then recipient:=provider_uid; event_type:='new_booking_request';
      elsif uid=new.customer_id then
        recipient:=provider_uid;
        if old.status='rescheduling_requested' and new.status<>'cancelled' then
          if new.scheduled_date is not distinct from old.proposed_scheduled_date and new.scheduled_time is not distinct from old.proposed_scheduled_time
          then event_type:='booking_reschedule_accepted'; else event_type:='booking_reschedule_rejected'; end if;
        else event_type:='booking_'||new.status; end if;
      else recipient:=new.customer_id; event_type:='booking_'||new.status; end if;
      if recipient is not null and recipient is distinct from uid then
        insert into public.notifications(user_id,type,title,body,data,dedupe_key)
        values(recipient,event_type,'Booking update','Your booking has a new update.',
          pg_catalog.jsonb_build_object('booking_id',new.id,'history_id',history_id),'booking-history:'||history_id::text)
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.record_booking_status() from public,anon,authenticated;

-- Retain the WPS-012 compatibility `type` while adding a precise event key so
-- required-action and reminder policy can distinguish requests from outcomes.
create or replace function private.record_job_operation_side_effects()
returns trigger language plpgsql security definer set search_path='' as $$
declare booking_row record; conversation_id uuid; recipient uuid; notification_type text; notification_event_key text;
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
  notification_event_key:=case
    when new.event_type='customer_inspection' then 'operation_ready_for_inspection'
    else 'operation_'||new.event_type end;
  if notification_type is not null then
    recipient:=case when new.actor_class='worker' then booking_row.customer_id when new.actor_class='customer' then booking_row.provider_user_id end;
    if recipient is not null and recipient is distinct from new.actor_id then
      insert into public.notifications(user_id,type,event_key,title,body,data,dedupe_key)
      values(recipient,notification_type,notification_event_key,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text) on conflict do nothing;
    elsif new.actor_class='system' then
      insert into public.notifications(user_id,type,event_key,title,body,data,dedupe_key)
      values(booking_row.customer_id,notification_type,notification_event_key,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text),
        (booking_row.provider_user_id,notification_type,notification_event_key,'Job update','Your booking has a new operational update.',pg_catalog.jsonb_build_object('booking_id',new.booking_id,'event_id',new.id),'operation:'||new.id::text) on conflict do nothing;
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

create or replace function private.notify_marketplace_matching_gap()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if new.status='completed' and new.invited_count=0 and (tg_op='INSERT' or old.status is distinct from new.status or old.invited_count is distinct from new.invited_count) then
    select r.customer_id into recipient from public.marketplace_requests r where r.id=new.request_id;
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    values(recipient,'marketplace_no_providers','Marketplace update','Your service request has an update.',
      pg_catalog.jsonb_build_object('request_id',new.request_id,'event_id',new.id),'marketplace-no-providers:'||new.request_id::text)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_matching_gap_wps014 on private.marketplace_matching_runs;
create trigger marketplace_matching_gap_wps014 after insert or update of status,invited_count on private.marketplace_matching_runs
for each row execute function private.notify_marketplace_matching_gap();

create or replace function private.notify_marketplace_invitation_terminal()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; request_status text; selected_provider uuid; event_type text;
begin
  if old.status is not distinct from new.status or new.status not in ('request_closed','expired') then return new; end if;
  select p.user_id into recipient from public.provider_profiles p where p.id=new.provider_id;
  if recipient is null then return new; end if;
  if new.status='expired' then event_type:='quote_expired';
  else
    select r.status,q.provider_id into request_status,selected_provider from public.marketplace_requests r
      left join public.worker_quotes q on q.id=r.selected_quote_id where r.id=new.request_id;
    if selected_provider=new.provider_id then return new; end if;
    event_type:=case when request_status='cancelled' then 'request_cancelled' else 'request_awarded_elsewhere' end;
  end if;
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(recipient,event_type,'Marketplace update','A service request has changed.',
    pg_catalog.jsonb_build_object('request_id',new.request_id,'event_id',new.id),
    'invitation-terminal:'||new.id::text||':'||new.status)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists marketplace_invitation_terminal_wps014 on public.quote_invitations;
create trigger marketplace_invitation_terminal_wps014 after update of status on public.quote_invitations
for each row execute function private.notify_marketplace_invitation_terminal();

create or replace function private.notify_communication_report_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(new.reporter_id,'communication_report_received','Report received','Your safety report was received.',
    pg_catalog.jsonb_build_object('booking_id',new.booking_id,'report_id',new.id),'communication-report:'||new.id::text)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists communication_report_receipt_wps014 on public.booking_abuse_reports;
create trigger communication_report_receipt_wps014 after insert on public.booking_abuse_reports
for each row execute function private.notify_communication_report_receipt();

create or replace function private.notify_review_report_state()
returns trigger language plpgsql security definer set search_path='' as $$
declare booking_id uuid; event_type text;
begin
  select r.booking_id into booking_id from public.reviews r where r.id=new.review_id;
  if tg_op='INSERT' then event_type:='review_reported';
  elsif old.status is distinct from new.status and new.status in ('resolved','dismissed') then event_type:='review_moderation_outcome';
  else return new; end if;
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(new.reporter_id,event_type,'Review update','A review has an update.',
    pg_catalog.jsonb_build_object('booking_id',booking_id,'review_id',new.review_id,'report_id',new.id),
    'review-report:'||new.id::text||':'||new.status)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists review_report_state_wps014 on public.review_reports;
create trigger review_report_state_wps014 after insert or update of status on public.review_reports
for each row execute function private.notify_review_report_state();

create or replace function private.notify_review_moderation_participants()
returns trigger language plpgsql security definer set search_path='' as $$
declare review_row public.reviews; provider_uid uuid; recipient uuid;
begin
  select * into review_row from public.reviews r where r.id=new.review_id;
  select p.user_id into provider_uid from public.provider_profiles p where p.id=review_row.provider_id;
  foreach recipient in array array[review_row.customer_id,provider_uid] loop
    if recipient is not null and recipient is distinct from new.actor_id then
      insert into public.notifications(user_id,type,title,body,data,dedupe_key)
      values(recipient,'review_moderation_outcome','Review update','A review moderation decision is available.',
        pg_catalog.jsonb_build_object('booking_id',review_row.booking_id,'review_id',review_row.id,'event_id',new.id),
        'review-moderation:'||new.id::text||':'||recipient::text) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists review_moderation_participants_wps014 on public.review_moderation_events;
create trigger review_moderation_participants_wps014 after insert on public.review_moderation_events
for each row execute function private.notify_review_moderation_participants();

create or replace function private.notify_certificate_decision()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if old.status is not distinct from new.status or new.status not in ('approved','rejected') then return new; end if;
  select p.user_id into recipient from public.provider_profiles p where p.id=new.provider_id;
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(recipient,'certificate_'||new.status,'Worker account update','Your worker profile has an update.',
    pg_catalog.jsonb_build_object('provider_id',new.provider_id,'certification_id',new.id),
    'certificate-decision:'||new.id::text||':'||new.status) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists certificate_decision_wps014 on public.provider_certifications;
create trigger certificate_decision_wps014 after update of status on public.provider_certifications
for each row execute function private.notify_certificate_decision();

create or replace function private.notify_payment_required()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('awaiting_payment','payment_initiated') and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    values(new.customer_id,'payment_required','Payment required','Action is required on your payment.',
      pg_catalog.jsonb_build_object('booking_id',new.booking_id,'payment_id',new.id),'payment-required:'||new.id::text)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists payment_required_wps014 on public.financial_booking_payments;
create trigger payment_required_wps014 after insert or update of status on public.financial_booking_payments
for each row execute function private.notify_payment_required();

create table private.notification_cash_debt_state (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  above_threshold boolean not null,
  updated_at timestamptz not null default pg_catalog.now()
);
insert into private.notification_cash_debt_state(provider_id,above_threshold)
select p.id,private.provider_cash_restricted(p.id) from public.provider_profiles p on conflict(provider_id) do nothing;
revoke all on private.notification_cash_debt_state from public,anon,authenticated;

create or replace function private.notify_cash_debt_threshold()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous boolean; current_value boolean; recipient uuid;
begin
  select s.above_threshold into previous from private.notification_cash_debt_state s where s.provider_id=new.provider_id for update;
  current_value:=private.provider_cash_restricted(new.provider_id);
  insert into private.notification_cash_debt_state(provider_id,above_threshold,updated_at)
  values(new.provider_id,current_value,pg_catalog.now()) on conflict(provider_id) do update set above_threshold=excluded.above_threshold,updated_at=excluded.updated_at;
  if not coalesce(previous,false) and current_value then
    select p.user_id into recipient from public.provider_profiles p where p.id=new.provider_id;
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    values(recipient,'cash_debt_threshold_warning','Account action required','Your worker financial account requires attention.',
      pg_catalog.jsonb_build_object('provider_id',new.provider_id),'cash-debt-threshold:'||new.provider_id::text||':'||new.id::text)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists cash_debt_threshold_wps014 on public.provider_cash_commission_records;
create trigger cash_debt_threshold_wps014 after insert or update of outstanding_minor,status on public.provider_cash_commission_records
for each row execute function private.notify_cash_debt_threshold();

create table private.notification_discoverability_state (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  discoverable boolean not null,
  updated_at timestamptz not null default pg_catalog.now()
);
insert into private.notification_discoverability_state(provider_id,discoverable)
select p.id,private.is_provider_publicly_discoverable(p.id) from public.provider_profiles p on conflict(provider_id) do nothing;
revoke all on private.notification_discoverability_state from public,anon,authenticated;

create or replace function private.refresh_notification_discoverability()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_provider_id uuid; previous boolean; current_value boolean; recipient uuid; source_stamp text;
begin
  target_provider_id:=coalesce(
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'provider_id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(new)->>'id'),
    private.notification_safe_uuid(pg_catalog.to_jsonb(old)->>'id')
  );
  if target_provider_id is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  select s.discoverable into previous from private.notification_discoverability_state s where s.provider_id=target_provider_id for update;
  current_value:=private.is_provider_publicly_discoverable(target_provider_id);
  insert into private.notification_discoverability_state(provider_id,discoverable,updated_at)
  values(target_provider_id,current_value,pg_catalog.now()) on conflict(provider_id) do update set discoverable=excluded.discoverable,updated_at=excluded.updated_at;
  if previous is not null and previous is distinct from current_value then
    select p.user_id into recipient from public.provider_profiles p where p.id=target_provider_id;
    source_stamp:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp())::bigint::text;
    insert into public.notifications(user_id,type,title,body,data,dedupe_key)
    values(recipient,case when current_value then 'worker_profile_discoverable' else 'worker_profile_unavailable' end,
      'Worker account update','Your worker profile has an update.',pg_catalog.jsonb_build_object('provider_id',target_provider_id),
      'discoverability:'||target_provider_id::text||':'||current_value::text||':'||source_stamp) on conflict do nothing;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists provider_profile_discoverability_wps014 on public.provider_profiles;
create trigger provider_profile_discoverability_wps014 after insert or update on public.provider_profiles
for each row execute function private.refresh_notification_discoverability();
drop trigger if exists provider_verification_discoverability_wps014 on public.provider_verifications;
create trigger provider_verification_discoverability_wps014 after insert or update or delete on public.provider_verifications
for each row execute function private.refresh_notification_discoverability();
drop trigger if exists provider_services_discoverability_wps014 on public.provider_services;
create trigger provider_services_discoverability_wps014 after insert or update or delete on public.provider_services
for each row execute function private.refresh_notification_discoverability();
drop trigger if exists provider_areas_discoverability_wps014 on public.provider_service_areas;
create trigger provider_areas_discoverability_wps014 after insert or update or delete on public.provider_service_areas
for each row execute function private.refresh_notification_discoverability();

create or replace function private.notify_auth_security_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_type text; source_stamp text;
begin
  source_stamp:=pg_catalog.date_part('epoch',coalesce(new.updated_at,pg_catalog.clock_timestamp()))::numeric::text;
  if old.encrypted_password is distinct from new.encrypted_password then event_type:='password_changed';
  elsif old.email is distinct from new.email then event_type:='email_changed';
  elsif old.phone is distinct from new.phone then event_type:='phone_changed';
  else return new; end if;
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(new.id,event_type,'Account security update','Your Warsha account security changed.','{}'::jsonb,
    'auth-security:'||event_type||':'||new.id::text||':'||source_stamp) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists auth_security_change_wps014 on auth.users;
create trigger auth_security_change_wps014 after update of encrypted_password,email,phone on auth.users
for each row execute function private.notify_auth_security_change();

create or replace function private.schedule_notification_reminder()
returns trigger language plpgsql security definer set search_path='' as $$
declare policy text; resource_type text; target_id uuid; delay interval;
begin
  if new.event_key='quote_selected' then policy:='worker_confirmation';resource_type:='marketplace_request';target_id:=private.notification_data_uuid(new.data,'request_id');delay:=interval '30 minutes';
  elsif new.event_key in ('operation_finished','operation_inspection','operation_ready_for_inspection') then policy:='inspection_pending';resource_type:='booking';target_id:=private.notification_data_uuid(new.data,'booking_id');delay:=interval '6 hours';
  elsif new.event_key='payment_required' then policy:='payment_pending';resource_type:='booking';target_id:=private.notification_data_uuid(new.data,'booking_id');delay:=interval '12 hours';
  elsif new.event_key='review_unlocked' then policy:='review_opportunity';resource_type:='booking';target_id:=private.notification_data_uuid(new.data,'booking_id');delay:=interval '48 hours';
  elsif new.event_key in ('dispute_evidence_requested','dispute_response_required') then policy:='dispute_deadline';resource_type:='dispute';target_id:=coalesce(private.notification_data_uuid(new.data,'dispute_id'),private.notification_data_uuid(new.data,'booking_id'));delay:=interval '12 hours';
  elsif new.event_key in ('verification_rejected','verification_resubmission_requested','verification_expired') then policy:='verification_correction';resource_type:='verification';target_id:=coalesce(private.notification_data_uuid(new.data,'verification_id'),private.notification_data_uuid(new.data,'provider_id'));delay:=interval '72 hours';
  elsif new.event_key='worker_profile_unavailable' then policy:='worker_profile_incomplete';resource_type:='provider_profile';target_id:=private.notification_data_uuid(new.data,'provider_id');delay:=interval '7 days';
  else return new; end if;
  if target_id is not null then
    insert into private.notification_reminder_jobs(user_id,policy_key,resource_type,resource_id,run_after,dedupe_key)
    values(new.user_id,policy,resource_type,target_id,new.created_at+delay,'reminder:'||policy||':'||new.source_key)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_schedule_reminder_wps014 on public.notifications;
create trigger notifications_schedule_reminder_wps014 after insert on public.notifications
for each row execute function private.schedule_notification_reminder();

create or replace function private.suppress_notification_reminders_from_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare booking_id uuid:=private.notification_data_uuid(new.data,'booking_id');
  request_id uuid:=private.notification_data_uuid(new.data,'request_id');
  dispute_id uuid:=private.notification_data_uuid(new.data,'dispute_id');
  provider_id uuid:=private.notification_data_uuid(new.data,'provider_id');
  verification_id uuid:=private.notification_data_uuid(new.data,'verification_id');
  suppressed integer:=0;
begin
  if new.event_key in ('marketplace_booking_confirmed','quote_confirmation_expired') and request_id is not null then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='worker_confirmation' and resource_id=request_id and status='pending';
  elsif new.event_key in ('payment_confirmed','payment_successful','online_payment_confirmed','refund_completed') and booking_id is not null then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='payment_pending' and resource_id=booking_id and status='pending';
  elsif new.event_key in ('operation_completed','operation_inspection_approved','booking_completed','booking_cancelled','booking_refunded','booking_rejected') and booking_id is not null then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where resource_type='booking' and resource_id=booking_id and status='pending';
  elsif new.event_key in ('dispute_resolved','dispute_closed','dispute_cancelled') then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='dispute_deadline' and status='pending'
      and resource_id in (coalesce(dispute_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(booking_id,'00000000-0000-0000-0000-000000000000'::uuid));
  elsif new.event_key='verification_approved' then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='verification_correction' and status='pending'
      and (resource_id in (coalesce(verification_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(provider_id,'00000000-0000-0000-0000-000000000000'::uuid)) or user_id=new.user_id);
  elsif new.event_key='worker_profile_discoverable' and provider_id is not null then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='worker_profile_incomplete' and resource_id=provider_id and status='pending';
  else
    return new;
  end if;
  get diagnostics suppressed=row_count;
  if suppressed>0 then
    insert into private.notification_operational_events(event_key,user_id,notification_id,metadata)
    values('reminder_suppressed',new.user_id,new.id,pg_catalog.jsonb_build_object('count',suppressed));
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_suppress_reminders_wps014 on public.notifications;
create trigger notifications_suppress_reminders_wps014 after insert on public.notifications
for each row execute function private.suppress_notification_reminders_from_event();

create or replace function private.suppress_review_opportunity_reminder()
returns trigger language plpgsql security definer set search_path='' as $$
declare suppressed integer:=0;
begin
  update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
  where user_id=new.customer_id and policy_key='review_opportunity' and resource_type='booking'
    and resource_id=new.booking_id and status='pending';
  get diagnostics suppressed=row_count;
  if suppressed>0 then
    insert into private.notification_operational_events(event_key,user_id,metadata)
    values('reminder_suppressed',new.customer_id,pg_catalog.jsonb_build_object('count',suppressed));
  end if;
  return new;
end;
$$;
drop trigger if exists review_opportunity_suppression_wps014 on public.reviews;
create trigger review_opportunity_suppression_wps014 after insert on public.reviews
for each row execute function private.suppress_review_opportunity_reminder();

create or replace function private.schedule_conversation_boundary()
returns trigger language plpgsql security definer set search_path='' as $$
declare provider_uid uuid; booking_at timestamptz; schedule_changed boolean;
begin
  select p.user_id into provider_uid from public.provider_profiles p where p.id=new.provider_id;
  if tg_op='INSERT' then schedule_changed:=true;
  else schedule_changed:=old.status is distinct from new.status
    or old.scheduled_date is distinct from new.scheduled_date or old.scheduled_time is distinct from new.scheduled_time;
  end if;
  if new.status='confirmed' and schedule_changed then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where policy_key='booking_approaching' and resource_type='booking' and resource_id=new.id and status='pending';
    booking_at:=(new.scheduled_date+new.scheduled_time) at time zone 'Africa/Cairo';
    insert into private.notification_reminder_jobs(user_id,policy_key,resource_type,resource_id,run_after,dedupe_key)
    values(new.customer_id,'booking_approaching','booking',new.id,greatest(pg_catalog.now(),booking_at-interval '2 hours'),
      'booking-approaching:'||new.id::text||':customer:'||new.scheduled_date::text||':'||new.scheduled_time::text)
    on conflict(dedupe_key) do nothing;
    if provider_uid is not null then
      insert into private.notification_reminder_jobs(user_id,policy_key,resource_type,resource_id,run_after,dedupe_key)
      values(provider_uid,'booking_approaching','booking',new.id,greatest(pg_catalog.now(),booking_at-interval '2 hours'),
        'booking-approaching:'||new.id::text||':worker:'||new.scheduled_date::text||':'||new.scheduled_time::text)
      on conflict(dedupe_key) do nothing;
    end if;
  end if;
  if tg_op='UPDATE' and old.status is distinct from new.status and new.status='completed' then
    insert into private.notification_reminder_jobs(user_id,policy_key,resource_type,resource_id,run_after,dedupe_key)
    values(new.customer_id,'conversation_boundary','booking',new.id,pg_catalog.now()+interval '48 hours','conversation-boundary:'||new.id::text||':customer') on conflict(dedupe_key) do nothing;
    if provider_uid is not null then
      insert into private.notification_reminder_jobs(user_id,policy_key,resource_type,resource_id,run_after,dedupe_key)
      values(provider_uid,'conversation_boundary','booking',new.id,pg_catalog.now()+interval '48 hours','conversation-boundary:'||new.id::text||':worker') on conflict(dedupe_key) do nothing;
    end if;
  end if;
  if new.status in ('cancelled','refunded','rejected') then
    update private.notification_reminder_jobs set status='suppressed',last_checked_at=pg_catalog.now()
    where resource_type='booking' and resource_id=new.id and status='pending';
  end if;
  return new;
end;
$$;
drop trigger if exists booking_notification_reminders_wps014 on public.bookings;
create trigger booking_notification_reminders_wps014 after update of status,scheduled_date,scheduled_time on public.bookings
for each row execute function private.schedule_conversation_boundary();
drop trigger if exists booking_notification_reminders_insert_wps014 on public.bookings;
create trigger booking_notification_reminders_insert_wps014 after insert on public.bookings
for each row execute function private.schedule_conversation_boundary();

revoke all on function private.notify_marketplace_matching_gap() from public,anon,authenticated;
revoke all on function private.notify_marketplace_invitation_terminal() from public,anon,authenticated;
revoke all on function private.notify_communication_report_receipt() from public,anon,authenticated;
revoke all on function private.notify_review_report_state() from public,anon,authenticated;
revoke all on function private.notify_review_moderation_participants() from public,anon,authenticated;
revoke all on function private.notify_certificate_decision() from public,anon,authenticated;
revoke all on function private.notify_payment_required() from public,anon,authenticated;
revoke all on function private.notify_cash_debt_threshold() from public,anon,authenticated;
revoke all on function private.refresh_notification_discoverability() from public,anon,authenticated;
revoke all on function private.notify_auth_security_change() from public,anon,authenticated;
revoke all on function private.schedule_notification_reminder() from public,anon,authenticated;
revoke all on function private.suppress_notification_reminders_from_event() from public,anon,authenticated;
revoke all on function private.suppress_review_opportunity_reminder() from public,anon,authenticated;
revoke all on function private.schedule_conversation_boundary() from public,anon,authenticated;
