begin;

select plan(35);

select has_table('public', 'conversation_typing', 'chat typing table exists');
select has_column('public', 'messages', 'booking_id', 'messages are booking scoped');
select has_column('public', 'messages', 'client_id', 'messages have idempotency keys');
select has_function('public', 'send_booking_message', array['uuid', 'text', 'text', 'text', 'text', 'uuid'], 'message send RPC exists');
select has_function('public', 'mark_booking_messages_read', array['uuid'], 'message read RPC exists');
select has_function('public', 'set_booking_typing', array['uuid', 'boolean'], 'typing RPC exists');
select is(has_function_privilege('anon', 'public.send_booking_message(uuid,text,text,text,text,uuid)', 'EXECUTE'), false, 'anon cannot send messages');
select is(has_function_privilege('authenticated', 'public.send_booking_message(uuid,text,text,text,text,uuid)', 'EXECUTE'), true, 'authenticated can invoke message RPC');
select is(has_table_privilege('authenticated', 'public.messages', 'INSERT'), false, 'clients cannot insert messages directly');
select is(has_table_privilege('authenticated', 'public.messages', 'UPDATE'), false, 'clients cannot update messages directly');
select is(has_table_privilege('authenticated', 'public.message_attachments', 'INSERT'), false, 'clients cannot insert attachment metadata directly');
select is((select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat_attachment_participant_upload'), 1, 'scoped chat upload policy exists');
select is((select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat_attachment_sender_delete'), 1, 'scoped chat delete policy exists');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_booking_participant_read'), 1, 'participant message read policy exists');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','51000000-0000-0000-0000-000000000001','authenticated','authenticated','chat-customer-1@test.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','51000000-0000-0000-0000-000000000002','authenticated','authenticated','chat-customer-2@test.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','52000000-0000-0000-0000-000000000001','authenticated','authenticated','chat-provider-1@test.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','52000000-0000-0000-0000-000000000002','authenticated','authenticated','chat-provider-2@test.local','',now(),'{}','{}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published) values
  ('53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','Chat provider one','professional','approved',true),
  ('53000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000002','Chat provider two','professional','approved',true),
  ('53000000-0000-0000-0000-000000000003',null,'Seed provider','professional','approved',true);

-- Booking audit/security triggers require the creating customer identity even
-- when the fixture inserts deterministic IDs as the migration owner.
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
select booking_id,customer_id,provider_id,s.id,'pending_provider_approval','Chat test','fixed',100,'A chat test booking issue',current_date + 2,'12:00','Test address',request_key
from (values
  ('54000000-0000-0000-0000-000000000001'::uuid,'51000000-0000-0000-0000-000000000001'::uuid,'53000000-0000-0000-0000-000000000001'::uuid,'chat-booking-1'),
  ('54000000-0000-0000-0000-000000000002'::uuid,'51000000-0000-0000-0000-000000000001'::uuid,'53000000-0000-0000-0000-000000000003'::uuid,'chat-booking-seed')
) as source(booking_id,customer_id,provider_id,request_key)
cross join lateral (select id from public.services where is_active and deleted_at is null order by id limit 1) s;

set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','Hello provider',null,null,'55000000-0000-0000-0000-000000000001')$$, 'customer can send a text message');
select is((select count(*)::integer from public.messages where booking_id='54000000-0000-0000-0000-000000000001' and message_type='text'),1,'one text message is created');
select is((select count(*)::integer from public.conversations where booking_id='54000000-0000-0000-0000-000000000001'),1,'exactly one conversation is created');
reset role;
select is((select count(*)::integer from public.notifications where type='booking_message' and data->>'booking_id'='54000000-0000-0000-0000-000000000001'),1,'one recipient notification is created');
set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','Hello provider',null,null,'55000000-0000-0000-0000-000000000001')$$, 'same client id is idempotent');
select is((select count(*)::integer from public.messages where booking_id='54000000-0000-0000-0000-000000000001' and message_type='text'),1,'replay does not duplicate the message');
reset role;
select is((select count(*)::integer from public.notifications where type='booking_message' and data->>'booking_id'='54000000-0000-0000-0000-000000000001'),1,'replay does not duplicate notification');
set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','   ',null,null,'55000000-0000-0000-0000-000000000002')$$,'22023','Invalid text message','whitespace-only messages are rejected');
select throws_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000002','text','No assigned provider',null,null,'55000000-0000-0000-0000-000000000003')$$,'42501','Conversation is not available','seed provider without a user cannot access chat');

select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','Unauthorized',null,null,'55000000-0000-0000-0000-000000000004')$$,'42501','Conversation is not available','other customer cannot send');
select is((select count(*)::integer from public.messages where booking_id='54000000-0000-0000-0000-000000000001'),0,'other customer cannot read messages');
select throws_ok($$select public.mark_booking_messages_read('54000000-0000-0000-0000-000000000001')$$,'42501','Conversation is not available','other customer cannot mark messages read');

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','Unauthorized provider',null,null,'55000000-0000-0000-0000-000000000005')$$,'42501','Conversation is not available','other provider cannot send');
select is((select count(*)::integer from public.messages where booking_id='54000000-0000-0000-0000-000000000001'),0,'other provider cannot read messages');
select throws_ok($$insert into public.messages(conversation_id,booking_id,message_type,body) values('56000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000001','system','forged')$$,'42501','permission denied for table messages','participants cannot create system messages directly');

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.send_booking_message('54000000-0000-0000-0000-000000000001','text','Hello customer',null,null,'55000000-0000-0000-0000-000000000006')$$,'assigned provider can send');
select lives_ok($$select public.mark_booking_messages_read('54000000-0000-0000-0000-000000000001')$$,'recipient can mark incoming messages read');
select is((select count(*)::integer from public.messages where booking_id='54000000-0000-0000-0000-000000000001' and sender_id='51000000-0000-0000-0000-000000000001' and read_at is not null),1,'only incoming customer message is read');
select lives_ok($$select public.set_booking_typing('54000000-0000-0000-0000-000000000001',true)$$,'participant can set typing');
select is((select count(*)::integer from public.conversation_typing where booking_id='54000000-0000-0000-0000-000000000001' and user_id='52000000-0000-0000-0000-000000000001'),1,'typing state is scoped to current user and booking');
select ok((select expires_at <= now() + interval '8 seconds' from public.conversation_typing where booking_id='54000000-0000-0000-0000-000000000001' and user_id='52000000-0000-0000-0000-000000000001'),'typing state has a bounded expiry');

reset role;
select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
