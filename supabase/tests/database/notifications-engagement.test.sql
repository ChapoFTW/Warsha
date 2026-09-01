begin;
select no_plan();

select has_table('public','notifications','existing durable notification table remains canonical');
select has_table('public','notification_preferences','existing preference table remains canonical');
select has_table('private','notification_event_catalog','private event catalog exists');
select has_table('private','notification_source_links','private immutable source links exist');
select has_table('private','notification_configuration','private fail-closed configuration exists');
select has_table('private','notification_device_tokens','private token model exists');
select has_table('private','notification_delivery_attempts','private delivery attempts exist');
select has_table('private','notification_reminder_jobs','private reminder jobs exist');
select has_column('public','notifications','category','category metadata exists');
select has_column('public','notifications','priority','priority metadata exists');
select has_column('public','notifications','audience','audience metadata exists');
select has_column('public','notifications','source_key','stable source key exists');
select has_column('public','notifications','group_key','group key exists');
select has_column('public','notifications','group_count','group count exists');
select has_column('public','notifications','archived_at','archive history exists');
select has_column('public','notifications','required_action','required-action state exists');
select has_function('public','get_my_notifications',array['text','timestamp with time zone','uuid','integer','boolean','text'],'safe inbox RPC exists');
select has_function('public','get_my_notification_counts',array['text'],'authoritative counts RPC exists');
select has_function('public','mark_notification_read',array['uuid','text'],'mode-aware read RPC exists');
select has_function('public','mark_all_notifications_read',array['text'],'mode-aware mark-all RPC exists');
select has_function('public','archive_notification',array['uuid','text'],'archive RPC exists');
select has_function('public','get_my_notification_preferences',array[]::text[],'preference read RPC exists');
select has_function('public','update_my_notification_preferences',array['jsonb'],'preference update RPC exists');
select has_function('public','resolve_notification_route',array['uuid','text'],'typed route resolver exists');
select has_function('public','register_push_token',array['text','text','text','text'],'provider-neutral token boundary exists');
select is(has_table_privilege('authenticated','public.notifications','INSERT'),false,'clients cannot forge notifications');
select is(has_table_privilege('authenticated','public.notifications','UPDATE'),false,'clients cannot rewrite notifications');
select is(has_table_privilege('authenticated','public.notifications','DELETE'),false,'clients cannot delete notification history');
select is(has_table_privilege('authenticated','public.notification_preferences','INSERT'),false,'clients cannot bypass preference RPC');
select is(has_table_privilege('authenticated','public.notification_preferences','UPDATE'),false,'clients cannot bypass preference validation');
select is(has_table_privilege('authenticated','public.notification_preferences','DELETE'),false,'clients cannot delete preferences');
select is(has_table_privilege('authenticated','private.notification_device_tokens','SELECT'),false,'device tokens are private');
select is(has_table_privilege('authenticated','private.notification_delivery_attempts','SELECT'),false,'delivery attempts are private');
select is(has_table_privilege('authenticated','private.notification_reminder_jobs','SELECT'),false,'reminder jobs are private');
select is(has_function_privilege('anon','public.get_my_notifications(text,timestamp with time zone,uuid,integer,boolean,text)','EXECUTE'),false,'anonymous role cannot execute inbox RPC');
select is((select push_delivery_enabled from private.notification_configuration where singleton),false,'push delivery is disabled');
select is((select token_registration_enabled from private.notification_configuration where singleton),false,'token registration is disabled');
select is((select scheduler_enabled from private.notification_configuration where singleton),false,'reminder scheduler is disabled');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'),1,'existing notification Realtime publication remains');
select is((select count(*)::integer from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='private'),0,'private delivery data is not published');

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','e1400000-0000-4000-8000-000000000001','authenticated','authenticated','wps014-customer@test.local',null,'',now(),null,'{}','{"display_name":"Notification Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1400000-0000-4000-8000-000000000002','authenticated','authenticated','wps014-other@test.local',null,'',now(),null,'{}','{"display_name":"Unrelated User"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1400000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000001404','',null,now(),'{}','{"display_name":"Notification Worker"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,profession_key,primary_category_id,category_ids,about,experience_years,service_radius_km,is_verified,is_available,is_published,onboarding_status)
values('e1410000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000003','Notification Worker','plumbing','plumbing',array['plumbing'],'Notification test worker profile.',5,15,true,true,true,'approved');

select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select 'e1420000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1410000-0000-4000-8000-000000000001',s.id,'confirmed','Notification fixture','fixed',300,'Notification behavior fixture booking',current_date,'12:00','Private fixture address','wps014-booking'
from public.services s where s.category_id='plumbing' order by s.id limit 1;

insert into public.booking_operations(booking_id,current_state,warranty_kind)
values('e1420000-0000-4000-8000-000000000001','customer_inspection','none');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000003',true);
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('worker',null,null,20,false,null)),1,'worker sees own worker-audience booking request');
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('customer',null,null,20,false,null)),0,'worker-audience notification does not leak into customer mode');
reset role;
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','booking_message','Leaky title','Secret message and address','{"bookingId":"e1420000-0000-4000-8000-000000000001","message":"secret","address":"private","fileName":"secret.pdf"}','message-source-1');
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','booking_message','Another title','Another secret','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','message-source-2');

select is((select count(*)::integer from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),1,'same unread conversation groups into one row');
select is((select group_count from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),2,'group count increments deterministically');
select is((select count(*)::integer from private.notification_source_links where user_id='e1400000-0000-4000-8000-000000000001' and source_key in ('booking_message:message-source-1','booking_message:message-source-2')),2,'both immutable sources remain linked');
select throws_ok($$update private.notification_source_links set event_type='tampered' where source_key='booking_message:message-source-1'$$,'55000','Notification source history is immutable','source relationships cannot be rewritten');
select is((select data from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'{"booking_id":"e1420000-0000-4000-8000-000000000001"}'::jsonb,'payload strips message, filename, and address');
select is((select title from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'New message','server replaces client title with generic copy');
select is((select body from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'You have a new message in Warsha.','server replaces client body with private preview');
select is((select category from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'messages','category is server derived');
select is((select priority from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'informational','priority is server derived');
select is((select route_type from public.notifications where user_id='e1400000-0000-4000-8000-000000000001' and event_key='booking_message'),'conversation','route is server derived');

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','booking_message','Retry','Retry','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','message-source-2') on conflict do nothing;
select is((select count(*)::integer from private.notification_source_links where user_id='e1400000-0000-4000-8000-000000000001' and source_key='booking_message:message-source-2'),1,'trusted source retry remains idempotent');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000001',true);
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('customer',null,null,20,false,null)),1,'owner customer projection returns one grouped row');
select is(public.get_my_notification_counts('customer')->>'globalUnread','1','global unread count is authoritative');
select is(public.get_my_notification_counts('customer')->'categoryUnread'->>'messages','1','category count counts grouped row once');
select is(public.resolve_notification_route((select id from public.notifications where user_id='e1400000-0000-4000-8000-000000000001'),'customer')->>'routeType','conversation','route resolver returns typed conversation target');
select lives_ok($$select public.mark_notification_read((select id from public.notifications where user_id='e1400000-0000-4000-8000-000000000001'),'customer')$$,'owner marks row read');
select is(public.get_my_notification_counts('customer')->>'globalUnread','0','read mutation reconciles global count');

select lives_ok($$select public.update_my_notification_preferences('{"categories":{"marketplace":true,"bookings":true,"messages":false,"payments":true,"worker_account":true,"reviews":true,"disputes":true,"security":true,"system":true},"genericPreviews":true,"quietHours":{"enabled":true,"start":"22:00","end":"06:00","timezone":"Africa/Cairo"}}')$$,'owner stores validated cross-midnight quiet hours');
select is(public.get_my_notification_preferences()->'quietHours'->>'start','22:00','quiet start persists');
select is(public.get_my_notification_preferences()->'quietHours'->>'end','06:00','quiet end persists');
select is(public.get_my_notification_preferences()->>'pushAvailable','false','preference projection does not claim push availability');
select throws_ok($$select public.update_my_notification_preferences('{"quietHours":{"enabled":true,"start":"22:00","end":"22:00","timezone":"Africa/Cairo"}}')$$,'22023','Invalid quiet hours','equal quiet-hour endpoints are rejected');
select throws_ok($$select public.register_push_token('ExponentPushToken[fixture-token-014]','android','1.0.0','fixture')$$,'55000','Push registration is unavailable','token registration still fails closed while the provider is off');
reset role;

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','booking_message','Suppressed','Suppressed','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','message-suppressed');
select is((select count(*)::integer from private.notification_source_links where user_id='e1400000-0000-4000-8000-000000000001' and source_key='booking_message:message-suppressed'),0,'optional disabled category suppresses durable row');

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','operation_inspection','Unsafe','Unsafe','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','inspection-required-1');
select is((select required_action from public.notifications where source_key='operation_inspection:inspection-required-1'),true,'required action is server derived');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.archive_notification((select id from public.notifications where source_key='operation_inspection:inspection-required-1'),'customer')$$,'55000','Resolve this action before archiving it','unresolved action cannot be archived');
reset role;
update public.notifications set action_resolved_at=now() where source_key='operation_inspection:inspection-required-1';
set local role authenticated;
select lives_ok($$select public.archive_notification((select id from public.notifications where source_key='operation_inspection:inspection-required-1'),'customer')$$,'resolved action can be archived');
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('customer',null,null,20,true,null)),1,'archived history remains available');
reset role;

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','review_unlocked','Unsafe','Unsafe','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','review-reminder-1');
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1400000-0000-4000-8000-000000000001','review_unlocked','Retry','Retry','{"booking_id":"e1420000-0000-4000-8000-000000000001"}','review-reminder-1') on conflict do nothing;
select is((select count(*)::integer from private.notification_reminder_jobs where policy_key='review_opportunity' and resource_id='e1420000-0000-4000-8000-000000000001'),1,'review reminder creation is idempotent');

-- `authenticated` deliberately holds no direct UPDATE on public.bookings, so this
-- terminal transition is driven as the table owner with the customer identity set,
-- matching the fixture pattern above. The assertion still exercises the trigger.
select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000001',true);
update public.bookings set status='cancelled' where id='e1420000-0000-4000-8000-000000000001';
select is((select status from private.notification_reminder_jobs where policy_key='review_opportunity' and resource_id='e1420000-0000-4000-8000-000000000001'),'suppressed','terminal booking state suppresses future reminder');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1400000-0000-4000-8000-000000000002',true);
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('customer',null,null,20,false,null)),0,'unrelated account projection contains no owner rows');
select is((select count(*)::integer from public.notifications where user_id='e1400000-0000-4000-8000-000000000001'),0,'unrelated account RLS sees no rows');
select throws_ok($$select public.mark_notification_read((select id from public.notifications where source_key='booking_message:message-source-1'),'customer')$$,'22023','Notification is not available','unrelated account cannot mutate owner row');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
-- EXECUTE is revoked from anon outright, so denial happens at the privilege layer
-- before the in-function authentication check can run. That is the stronger denial.
select throws_ok($$select public.get_my_notifications('customer',null,null,20,false,null)$$,'42501','permission denied for function get_my_notifications','anonymous inbox access is denied');
reset role;

select is(private.process_notification_reminders(20)->>'status','disabled','private reminder processor remains disabled');
select is((select count(*)::integer from private.notification_delivery_attempts),0,'no delivery attempt is fabricated');
select is((select count(*)::integer from private.notification_device_tokens),0,'no token is stored while registration is disabled');
select is((select push_enabled from public.notification_preferences where user_id='e1400000-0000-4000-8000-000000000001'),false,'legacy push flag is forced off');
select is((select email_enabled from public.notification_preferences where user_id='e1400000-0000-4000-8000-000000000001'),false,'email delivery remains off');
select is((select sms_enabled from public.notification_preferences where user_id='e1400000-0000-4000-8000-000000000001'),false,'SMS delivery remains off');

select * from finish();
rollback;
