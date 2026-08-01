begin;

select plan(80);

select has_table('public','booking_abuse_reports','communication safety report table exists'); -- 1
select has_column('public','message_attachments','file_name','attachment display names are stored'); -- 2
select has_column('public','message_attachments','byte_size','attachment byte sizes are stored'); -- 3
select has_function('public','send_booking_message_v2',array['uuid','text','text','text','text','text','uuid'],'v2 send RPC exists'); -- 4
select has_function('public','get_my_booking_conversations',array[]::text[],'conversation inbox RPC exists'); -- 5
select has_function('public','get_booking_communication_capabilities',array['uuid'],'capability RPC exists'); -- 6
select has_function('public','request_booking_call_relay',array['uuid','uuid'],'provider-neutral call relay RPC exists'); -- 7
select has_function('public','report_booking_communication_abuse',array['uuid','text','text','uuid','text'],'safety report RPC exists'); -- 8
select is(has_function_privilege('anon','public.send_booking_message_v2(uuid,text,text,text,text,text,uuid)','EXECUTE'),false,'anon cannot send v2 messages'); -- 9
select is(has_function_privilege('authenticated','public.send_booking_message_v2(uuid,text,text,text,text,text,uuid)','EXECUTE'),true,'authenticated can invoke guarded v2 send'); -- 10
select is(has_function_privilege('anon','public.report_booking_communication_abuse(uuid,text,text,uuid,text)','EXECUTE'),false,'anon cannot report communication abuse'); -- 11
select is(has_function_privilege('authenticated','public.report_booking_communication_abuse(uuid,text,text,uuid,text)','EXECUTE'),true,'authenticated can invoke guarded reports'); -- 12
select is(has_table_privilege('authenticated','public.booking_abuse_reports','INSERT'),false,'clients cannot insert report rows directly'); -- 13
select is(has_table_privilege('authenticated','public.booking_abuse_reports','UPDATE'),false,'clients cannot update report rows'); -- 14
select is(has_table_privilege('authenticated','public.booking_abuse_reports','DELETE'),false,'clients cannot delete report rows'); -- 15
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='booking_abuse_reports' and policyname='booking_abuse_reports_staff_read'),1,'staff-only report read policy exists'); -- 16
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='booking_abuse_reports'),0,'safety reports are not in Realtime'); -- 17
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_members'),1,'participant inbox invalidation table is in Realtime'); -- 18
select is((select call_relay_mode from private.communication_configuration where singleton),'disabled','call relay defaults disabled'); -- 19
select is((select retention_policy_status from private.communication_configuration where singleton),'policy_pending','retention deletion fails closed pending policy'); -- 20
select is((select public from storage.buckets where id='chat-attachments'),false,'chat attachment bucket is private'); -- 21
select is((select file_size_limit from storage.buckets where id='chat-attachments'),8388608::bigint,'attachment bucket limit is 8 MB'); -- 22
select ok((select allowed_mime_types @> array['image/jpeg','image/png','image/heic','application/pdf']::text[] from storage.buckets where id='chat-attachments'),'conservative image and PDF MIME types are allowed'); -- 23
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and policyname='chat_attachment_sender_delete'),1,'only orphan cleanup delete policy exists'); -- 24
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and policyname='chat_attachment_participant_upload'),1,'lifecycle-aware upload policy exists'); -- 25

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','61000000-0000-0000-0000-000000000001','authenticated','authenticated','wps009-customer-1@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','61000000-0000-0000-0000-000000000002','authenticated','authenticated','wps009-customer-2@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','62000000-0000-0000-0000-000000000001','authenticated','authenticated','wps009-provider-1@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','62000000-0000-0000-0000-000000000002','authenticated','authenticated','wps009-provider-2@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','63000000-0000-0000-0000-000000000001','authenticated','authenticated','wps009-support@test.local','',now(),'{}','{}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published) values
('64000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','WPS009 Worker One','professional','approved',true),
('64000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','WPS009 Worker Two','professional','approved',true);
insert into public.user_roles(user_id,role) values ('63000000-0000-0000-0000-000000000001','support') on conflict do nothing;

select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select source.id,source.customer_id,source.provider_id,s.id,source.status,'WPS009 service','fixed',100,'Communication collaboration fixture',current_date+2,'12:00','Private address',source.key
from (values
('65000000-0000-0000-0000-000000000001'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000001'::uuid,'pending_provider_approval','wps009-pending'),
('65000000-0000-0000-0000-000000000002'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000001'::uuid,'confirmed','wps009-confirmed'),
('65000000-0000-0000-0000-000000000004'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000001'::uuid,'completed','wps009-completed-open'),
('65000000-0000-0000-0000-000000000005'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000001'::uuid,'completed','wps009-completed-expired'),
('65000000-0000-0000-0000-000000000006'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000001'::uuid,'disputed','wps009-disputed-no-completion'),
('65000000-0000-0000-0000-000000000007'::uuid,'61000000-0000-0000-0000-000000000001'::uuid,'64000000-0000-0000-0000-000000000002'::uuid,'confirmed','wps009-rescue-replacement')
) source(id,customer_id,provider_id,status,key)
cross join lateral (select id from public.services where is_active and deleted_at is null order by id limit 1) s;

select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000002',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select '65000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000002',s.id,'confirmed','Other conversation','fixed',100,'Other account fixture',current_date+2,'12:00','Other private address','wps009-other'
from (select id from public.services where is_active and deleted_at is null order by id limit 1) s;

update public.booking_status_history set created_at=pg_catalog.now()-interval '49 hours'
where booking_id='65000000-0000-0000-0000-000000000005' and status='completed';

set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000001','text','Too early',null,null,null,'66000000-0000-0000-0000-000000000001')$$,'22023','Booking chat is read-only','preselection send fails closed'); -- 26
select throws_ok($$select public.set_booking_typing('65000000-0000-0000-0000-000000000001',true)$$,'22023','Booking chat is read-only','preselection typing fails closed'); -- 27
select is((select count(*)::integer from public.get_my_booking_conversations() row where row->>'bookingId'='65000000-0000-0000-0000-000000000001'),0,'pending booking is absent from the inbox'); -- 28
select is((public.get_booking_communication_capabilities('65000000-0000-0000-0000-000000000002')->>'chatActivated')::boolean,true,'confirmed booking activates chat'); -- 29
select is((public.get_booking_communication_capabilities('65000000-0000-0000-0000-000000000002')->>'chatWritable')::boolean,true,'confirmed booking chat is writable'); -- 30
select is((public.get_booking_communication_capabilities('65000000-0000-0000-0000-000000000002')->>'callRelayAvailable')::boolean,false,'call capability exposes disabled state without a number'); -- 31
select throws_ok($$select public.request_booking_call_relay('65000000-0000-0000-0000-000000000002','66000000-0000-0000-0000-000000000002')$$,'55000','Call relay is not configured','call relay request fails closed'); -- 32
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','Please bring the part',null,null,null,'66000000-0000-0000-0000-000000000003')$$,'participant sends ordinary text'); -- 33
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002' and body='Please bring the part'),1,'ordinary message is preserved'); -- 34
reset role;
select is((select count(*)::integer from public.notifications where type='booking_message' and dedupe_key like 'booking-message:%' and data->>'booking_id'='65000000-0000-0000-0000-000000000002'),1,'message creates one durable notification'); -- 35
select is((select data from public.notifications where type='booking_message' and data->>'booking_id'='65000000-0000-0000-0000-000000000002' order by created_at desc limit 1),jsonb_build_object('booking_id','65000000-0000-0000-0000-000000000002'),'notification payload contains only the booking route'); -- 36
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','Please bring the part',null,null,null,'66000000-0000-0000-0000-000000000003')$$,'message retry is idempotent'); -- 37
reset role;
select is((select count(*)::integer from public.notifications where type='booking_message' and dedupe_key like 'booking-message:%' and data->>'booking_id'='65000000-0000-0000-0000-000000000002'),1,'retry does not duplicate notification'); -- 38
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','quick_reply','confirm_address',null,null,null,'66000000-0000-0000-0000-000000000004')$$,'validated quick reply is accepted'); -- 39
select is((select metadata->>'quick_reply_key' from public.messages where client_id='66000000-0000-0000-0000-000000000004'),'confirm_address','quick reply stores only its localized key'); -- 40
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','system','forged',null,null,null,'66000000-0000-0000-0000-000000000005')$$,'22023','Invalid message type','client cannot forge a system message'); -- 41
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','file',null,'65000000-0000-0000-0000-000000000002/61000000-0000-0000-0000-000000000001/missing.pdf','application/pdf','evidence.pdf','66000000-0000-0000-0000-000000000006')$$,'22023','Uploaded attachment was not found','file metadata requires an owned private object'); -- 42
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','WhatsApp +20 100 123 4567',null,null,null,'66000000-0000-0000-0000-000000000007')$$,'likely off-platform text is preserved'); -- 43
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002' and body='WhatsApp +20 100 123 4567'),1,'off-platform pattern does not block or rewrite the message'); -- 44
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002' and message_type='system' and metadata->>'event'='off_platform_reminder'),1,'neutral server-created off-platform reminder is added'); -- 45
select lives_ok($$select public.mark_booking_messages_read('65000000-0000-0000-0000-000000000002')$$,'participant can clear own unread state'); -- 46
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002' and read_at is not null),0,'unread state does not require exact seen timestamps'); -- 47
reset role;
update public.conversation_members cm set last_read_at=pg_catalog.now()-interval '1 second'
from public.conversations c where c.id=cm.conversation_id and c.booking_id='65000000-0000-0000-0000-000000000002' and cm.user_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','quick_reply','on_my_way',null,null,null,'66000000-0000-0000-0000-000000000008')$$,'assigned worker can send a quick reply'); -- 48
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select ok((select (row->>'unreadCount')::integer >= 1 from public.get_my_booking_conversations() row where row->>'bookingId'='65000000-0000-0000-0000-000000000002'),'inbox shows unread worker activity'); -- 49
select public.mark_booking_messages_read('65000000-0000-0000-0000-000000000002');
select is((select (row->>'unreadCount')::integer from public.get_my_booking_conversations() row where row->>'bookingId'='65000000-0000-0000-0000-000000000002'),0,'mark read clears aggregate unread count'); -- 50
select lives_ok($$select public.report_booking_communication_abuse('65000000-0000-0000-0000-000000000002','off_platform_pressure','Asked to pay elsewhere',null,'wps009-report-customer-0001')$$,'participant can submit booking-scoped safety report'); -- 51
select lives_ok($$select public.report_booking_communication_abuse('65000000-0000-0000-0000-000000000002','off_platform_pressure','Asked to pay elsewhere',null,'wps009-report-customer-0001')$$,'safety report retry is idempotent'); -- 52
reset role;
select is((select count(*)::integer from public.booking_abuse_reports where booking_id='65000000-0000-0000-0000-000000000002'),1,'idempotency stores one immutable report'); -- 53
select is((select accused_id from public.booking_abuse_reports where booking_id='65000000-0000-0000-0000-000000000002'),'62000000-0000-0000-0000-000000000001'::uuid,'accused party is derived from booking membership'); -- 54
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.booking_abuse_reports),0,'reporter cannot read staff-only report row'); -- 55
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002'),0,'other customer cannot read conversation'); -- 56
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','cross account',null,null,null,'66000000-0000-0000-0000-000000000009')$$,'42501','Conversation is not available','other customer cannot send'); -- 57
select throws_ok($$select public.report_booking_communication_abuse('65000000-0000-0000-0000-000000000002','other',null,null,'wps009-report-cross-0001')$$,'42501','Conversation is not available','other customer cannot report against booking participants'); -- 58
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002'),0,'other worker cannot read conversation'); -- 59
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','cross worker',null,null,null,'66000000-0000-0000-0000-000000000010')$$,'42501','Conversation is not available','other worker cannot send'); -- 60
select set_config('request.jwt.claim.sub','63000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.booking_abuse_reports),1,'purpose-limited staff can read safety report'); -- 61
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002'),0,'staff report access does not grant chat-content access'); -- 62
reset role;
select throws_ok($$update public.booking_abuse_reports set details='rewritten' where booking_id='65000000-0000-0000-0000-000000000002'$$,'55000','Communication safety reports are immutable','report cannot be rewritten even by direct trusted SQL'); -- 63
set local role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_booking_typing('65000000-0000-0000-0000-000000000002',true)$$,'worker can set ephemeral typing on active booking'); -- 64
select is((select count(*)::integer from public.conversation_typing where booking_id='65000000-0000-0000-0000-000000000002'),1,'typing record is present before cancellation'); -- 65
reset role;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select lives_ok($$update public.bookings set status='cancelled' where id='65000000-0000-0000-0000-000000000002'$$,'confirmed booking can be cancelled by its customer fixture'); -- 66
select is((select count(*)::integer from public.conversation_typing where booking_id='65000000-0000-0000-0000-000000000002'),0,'cancellation clears ephemeral typing immediately'); -- 67
set local role authenticated;
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000002','text','after cancellation',null,null,null,'66000000-0000-0000-0000-000000000011')$$,'22023','Booking chat is read-only','cancelled booking is immediately read-only'); -- 68
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000004','text','within follow-up window',null,null,null,'66000000-0000-0000-0000-000000000012')$$,'completed booking is writable inside 48 hours'); -- 69
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000005','text','after follow-up window',null,null,null,'66000000-0000-0000-0000-000000000013')$$,'22023','Booking chat is read-only','completed booking locks after 48 hours'); -- 70
reset role;
insert into public.booking_status_history(booking_id,status,actor_id,created_at) values ('65000000-0000-0000-0000-000000000006','completed','61000000-0000-0000-0000-000000000001',pg_catalog.now());
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000006','text','disputed follow-up',null,null,null,'66000000-0000-0000-0000-000000000014')$$,'current disputed behavior uses recorded completion window'); -- 71
reset role;
delete from public.booking_status_history where booking_id='65000000-0000-0000-0000-000000000006' and status='completed';
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.send_booking_message_v2('65000000-0000-0000-0000-000000000006','text','disputed without completion',null,null,null,'66000000-0000-0000-0000-000000000015')$$,'22023','Booking chat is read-only','disputed booking without completion evidence fails closed'); -- 72
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000007'),0,'cancelled original worker cannot read replacement conversation'); -- 73
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.messages where booking_id='65000000-0000-0000-0000-000000000002'),0,'replacement worker cannot read original conversation'); -- 74
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
select ok((select count(*)::integer >= 5 from public.get_my_booking_conversations()),'customer inbox includes confirmed and historical confirmed bookings'); -- 75
reset role;
select is((select count(*)::integer from public.user_roles where user_id in ('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001') and role in ('support','admin')),0,'safety report causes no automatic role or suspension action'); -- 76
select is(has_table_privilege('authenticated','public.messages','DELETE'),false,'clients cannot hard-delete messages'); -- 77
select is(has_table_privilege('authenticated','public.message_attachments','DELETE'),false,'clients cannot hard-delete attachment metadata'); -- 78
select is(has_function_privilege('authenticated','private.is_safe_chat_file_name(text)','EXECUTE'),false,'filename validator is private'); -- 79
select is((select count(*)::integer from public.booking_abuse_reports where reporter_id=accused_id),0,'reporter and accused can never be the same account'); -- 80

select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
