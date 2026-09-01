-- Push delivery: who may register a device, and who may cause a push.
--
-- The security property this file exists to hold is a single sentence: a client
-- can register and revoke ITS OWN device and can do nothing else. It cannot
-- read a token, it cannot address a notification to somebody, and it cannot
-- send anything at all — there is no send surface reachable by `authenticated`.
--
-- Everything else here is lifecycle: a phone that changes hands, a token the
-- operating system reissued, an account that was deactivated, a provider
-- saying a device is gone. Each of those has a wrong behaviour that is easy to
-- ship and hard to notice, and each has an assertion below.
--
-- The configuration is switched on inside this transaction and rolled back with
-- it. That is what lets the enqueue path be exercised at all — the default is
-- off — and it is why nothing here changes what any environment does.

begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- 1. The shape of the authority
-- ---------------------------------------------------------------------------

select has_table('private','notification_push_copy','lock-screen copy is a private table');
select has_column('private','notification_device_tokens','installation_id','devices are identified by installation');
select has_column('private','notification_device_tokens','locale','a device records the language it reads');
select has_column('private','notification_device_tokens','revoked_reason','revocation records why');
select has_column('private','notification_delivery_attempts','next_attempt_at','delivery carries its own retry schedule');

select has_function('public','register_my_push_device',array['text','text','text','text','text','text'],'self-registration RPC exists');
select has_function('public','revoke_my_push_device',array['text'],'per-device revocation RPC exists');
select has_function('public','revoke_my_push_tokens',array[]::text[],'account-wide revocation RPC exists');
select has_function('public','get_my_push_state',array[]::text[],'capability RPC exists');
select has_function('public','warsha_push_claim_batch',array['integer'],'dispatcher claim wrapper exists');
select has_function('public','warsha_push_record_result',array['uuid','text','text','text','boolean','boolean'],'dispatcher result wrapper exists');

-- ---------------------------------------------------------------------------
-- 2. Nothing a client can reach can send, read a token, or drain the queue
-- ---------------------------------------------------------------------------
-- This is the section that matters most. If any of these becomes true, a
-- signed-in person can reach somebody else's device.

select is(has_table_privilege('authenticated','private.notification_device_tokens','SELECT'),false,'no client may read any device token');
select is(has_table_privilege('authenticated','private.notification_push_copy','SELECT'),false,'not even the preview copy table is client readable');
select is(has_table_privilege('anon','private.notification_device_tokens','SELECT'),false,'and anonymous certainly may not');

select is(has_function_privilege('authenticated','public.warsha_push_claim_batch(integer)','EXECUTE'),false,'A CLIENT CANNOT CLAIM THE DELIVERY QUEUE');
select is(has_function_privilege('authenticated','public.warsha_push_record_result(uuid,text,text,text,boolean,boolean)','EXECUTE'),false,'a client cannot write a delivery outcome');
select is(has_function_privilege('authenticated','public.warsha_push_configuration()','EXECUTE'),false,'a client cannot read the provider configuration');
select is(has_function_privilege('anon','public.register_my_push_device(text,text,text,text,text,text)','EXECUTE'),false,'anonymous cannot register a device');

-- There is no function anywhere that a client may execute and that takes a
-- recipient. Stated as a catalogue query rather than a list, so a future
-- `send_push_to(user_id)` fails here on the day it is written.
select is_empty(
  $$
  select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like '%push%'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and pg_get_function_identity_arguments(p.oid) like '%uuid%'
  $$,
  'NO CLIENT-REACHABLE PUSH FUNCTION ACCEPTS AN IDENTIFIER FOR SOMEBODY ELSE');

-- ---------------------------------------------------------------------------
-- 3. Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','e1500000-0000-4000-8000-000000000001','authenticated','authenticated','push-one@test.local',null,'',now(),null,'{}','{"display_name":"Push One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1500000-0000-4000-8000-000000000002','authenticated','authenticated','push-two@test.local',null,'',now(),null,'{}','{"display_name":"Push Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e1500000-0000-4000-8000-000000000003','authenticated','authenticated','push-three@test.local',null,'',now(),null,'{}','{"display_name":"Push Three"}',now(),now());

update public.profiles set preferred_language='ar' where id='e1500000-0000-4000-8000-000000000002';
update public.profiles set preferred_language='fr' where id='e1500000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- 4. Registration fails closed until a provider is configured
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000001',true);
select is(public.register_my_push_device('ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]','android','1.0.0','install-one','en',null)->>'status','unavailable','REGISTRATION IS REFUSED WHILE THE PROVIDER IS DISABLED');
select is(public.get_my_push_state()->>'provider','disabled','and the client is told so plainly');
reset role;
-- Read as the owner role: the assertion two sections above proves a client
-- cannot read this table, so a client session cannot be the one to check it.
select is((select count(*)::integer from private.notification_device_tokens),0,'nothing was stored');

-- The coherence constraint: flags cannot be true without a provider.
select throws_ok(
  $$update private.notification_configuration set push_delivery_enabled=true where singleton$$,
  '23514',
  null,
  'DELIVERY CANNOT BE ENABLED WITHOUT A PROVIDER');

update private.notification_configuration
set push_provider='expo', token_registration_enabled=true, push_delivery_enabled=true
where singleton;

-- ---------------------------------------------------------------------------
-- 5. A client registers only itself, and registering twice is not two devices
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000001',true);
select is(public.register_my_push_device('ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]','android','1.0.0','install-one','en','Phone')->>'status','registered','a signed-in person registers their own device');
-- An app registers on every launch. That must stay one device.
select lives_ok($$select public.register_my_push_device('ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]','android','1.0.1','install-one','en','Phone')$$,'re-registering the same token is accepted');
-- A person with two phones has two devices.
select lives_ok($$select public.register_my_push_device('ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]','ios','1.0.1','install-two','ar','Tablet')$$,'a second installation registers separately');
select is(public.get_my_push_state()->>'deviceCount','2','the client is told how many devices it has');
-- The operating system reissued the token. Same phone, new value.
select lives_ok($$select public.register_my_push_device('ExponentPushToken[cccccccccccccccccccc]','android','1.0.1','install-one','en','Phone')$$,'a rotated token registers');
reset role;

select is((select user_id::text from private.notification_device_tokens where installation_id='install-one' and revoked_at is null),'e1500000-0000-4000-8000-000000000001','THE ROW BELONGS TO THE CALLER, NOT TO ANY ARGUMENT');
select is((select app_version from private.notification_device_tokens where installation_id='install-one' and revoked_at is null),'1.0.1','the newer app version is recorded');
select is((select count(*)::integer from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000001' and revoked_at is null),2,'DUPLICATE REGISTRATION IS ONE DEVICE, AND TWO PHONES ARE TWO');
select is((select revoked_reason from private.notification_device_tokens where token_hash=encode(extensions.digest('ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]','sha256'),'hex')),'replaced','TOKEN ROTATION REPLACES THE ROW AND SAYS WHY');

-- ---------------------------------------------------------------------------
-- 6. A phone that changes hands
-- ---------------------------------------------------------------------------
-- The same physical device signs in as somebody else. The previous account must
-- stop receiving immediately; anything less delivers one person's notifications
-- to another.

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000002',true);
select is(public.register_my_push_device('ExponentPushToken[cccccccccccccccccccc]','android','1.0.1','install-one','ar',null)->>'status','registered','the new account registers the same physical device');
reset role;
select is((select count(*)::integer from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000001' and revoked_at is null),1,'THE PREVIOUS ACCOUNT LOSES THE DEVICE IT NO LONGER HOLDS');
select is((select revoked_reason from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000001' and revoked_at is not null and token_hash=encode(extensions.digest('ExponentPushToken[cccccccccccccccccccc]','sha256'),'hex')),'claimed_by_another_account','and the reason is recorded rather than guessed');
select is((select count(*)::integer from private.notification_device_tokens where revoked_at is null and token_hash=encode(extensions.digest('ExponentPushToken[cccccccccccccccccccc]','sha256'),'hex')),1,'exactly one account holds a live token at a time');

-- One account cannot revoke another's device: revocation is scoped to the
-- caller, so naming somebody else's installation does nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.revoke_my_push_device('install-two')$$,'a stranger may call revoke with somebody else’s installation id');
reset role;
select is((select count(*)::integer from private.notification_device_tokens where installation_id='install-two' and revoked_at is null),1,'AND IT REVOKES NOTHING — REVOCATION IS SCOPED TO THE CALLER');

-- ---------------------------------------------------------------------------
-- 7. Signing out takes the token with it
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.revoke_my_push_device('install-one')$$,'signing out on one device revokes that device');
reset role;
select is((select revoked_reason from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000002' and installation_id='install-one'),'signed_out','the reason is signing out');
select is((select token from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000002' and installation_id='install-one'),null,'AND THE TOKEN ITSELF IS ERASED, NOT MERELY FLAGGED');

-- ---------------------------------------------------------------------------
-- 8. A notification becomes queued pushes
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000001',true);
select is(public.update_my_notification_preferences('{"pushEnabled":true}')->>'pushEnabled','true','push is a preference somebody turns on');
select is(public.register_my_push_device('ExponentPushToken[dddddddddddddddddddd]','android','1.0.1','install-three','en',null)->>'status','registered','and a device to send to');
reset role;
-- Registering earlier devices then turning push on left the first two live;
-- narrow to the one device this section is about.
update private.notification_device_tokens set revoked_at=now(), revoked_reason='signed_out', token=null
where user_id='e1500000-0000-4000-8000-000000000001' and installation_id in ('install-one','install-two');

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1500000-0000-4000-8000-000000000001','dispute_opened','x','x','{}','push-dispute-1');

select is((select count(*)::integer from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001'),1,'A NOTIFICATION QUEUES ONE PUSH PER LIVE DEVICE');
select is((select status from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001'),'pending','queued rather than sent, because sending is not the database’s job');

-- Safe preview: the queued text is the category copy and nothing else.
select is((select title from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001'),'Dispute update','the lock screen says which part of Warsha changed');
select is((select body from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001'),'Your dispute has an update.','AND NOTHING ELSE — NO NAME, NO AMOUNT, NO REFERENCE');
select is((select payload->>'routeType' from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001'),'booking_dispute','the payload carries a destination');
select is_empty(
  $$select 1 from private.notification_delivery_attempts
    where payload ?| array['message','address','phone','email','amount','displayName']$$,
  'and carries no legible field of any kind');

-- A person who never turned push on gets nothing queued, even for a critical
-- event. The inbox row still exists; only the outward channel is silent.
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1500000-0000-4000-8000-000000000003','dispute_opened','x','x','{}','push-dispute-3');
select is((select count(*)::integer from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000003'),0,'PUSH IS OFF BY DEFAULT AND STAYS OFF UNTIL SOMEBODY ASKS');
select is((select count(*)::integer from public.notifications where user_id='e1500000-0000-4000-8000-000000000003' and event_key='dispute_opened'),1,'while the durable inbox row is unaffected');

-- ---------------------------------------------------------------------------
-- 9. Localisation, per device
-- ---------------------------------------------------------------------------
-- The device says what language it reads. Two devices on one account in two
-- languages is one account with two correct answers.

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.register_my_push_device('ExponentPushToken[eeeeeeeeeeeeeeeeeeee]','ios','1.0.1','install-four','ar',null)$$,'a second device reading Arabic');
select lives_ok($$select public.register_my_push_device('ExponentPushToken[ffffffffffffffffffff]','ios','1.0.1','install-five','fr',null)$$,'and a third reading French');
reset role;

insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1500000-0000-4000-8000-000000000001','payment_failed','x','x','{}','push-payment-1');

select is((select count(distinct language)::integer from private.notification_delivery_attempts where notification_id=(select id from public.notifications where source_key='payment_failed:push-payment-1')),3,'ONE NOTIFICATION IS RENDERED IN EACH DEVICE’S OWN LANGUAGE');
select is((select body from private.notification_delivery_attempts a join private.notification_device_tokens t on t.id=a.token_id where t.installation_id='install-four' and a.notification_id=(select id from public.notifications where source_key='payment_failed:push-payment-1')),'حالة الدفع بتاعتك اتغيرت.','the Arabic device gets Arabic');
select is((select body from private.notification_delivery_attempts a join private.notification_device_tokens t on t.id=a.token_id where t.installation_id='install-five' and a.notification_id=(select id from public.notifications where source_key='payment_failed:push-payment-1')),'Le statut de votre paiement a changé.','and the French device gets French');

-- Every category has every language. A missing row would silently queue nothing.
select is((select count(*)::integer from private.notification_push_copy),30,'ten categories times three languages, with no gaps');
select is_empty(
  $$select c.category from (select unnest(array['marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system','support']) as category) c
    cross join (select unnest(array['en','ar','fr']) as language) l
    where not exists (select 1 from private.notification_push_copy p where p.category=c.category and p.language=l.language)$$,
  'and no category is missing a language');
-- French must be French, not English left in place — the same gate the
-- repository applies to `notification-copy.ts`.
select is_empty(
  $$select fr.category from private.notification_push_copy fr
    join private.notification_push_copy en on en.category=fr.category and en.language='en'
    where fr.language='fr' and (fr.title=en.title or fr.body=en.body)$$,
  'NO FRENCH ENTRY IS AN ENGLISH ONE LEFT IN PLACE');

-- ---------------------------------------------------------------------------
-- 10. Quiet hours delay rather than drop
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.update_my_notification_preferences('{"pushEnabled":true,"quietHours":{"enabled":true,"start":"00:00","end":"23:59","timezone":"Africa/Cairo"}}')$$,'a person asks not to be disturbed');
select lives_ok($$select public.register_my_push_device('ExponentPushToken[11111111111111111111]','android','1.0.1','install-six','ar',null)$$,'and has a device');
reset role;

-- `review_reply` is informational: it waits.
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1500000-0000-4000-8000-000000000002','review_reply','x','x','{}','push-quiet-1');
select ok((select next_attempt_at from private.notification_delivery_attempts where notification_id=(select id from public.notifications where source_key='review_reply:push-quiet-1')) > now(),
  'AN INFORMATIONAL PUSH IN QUIET HOURS IS DELAYED, NOT DISCARDED');

-- `dispute_opened` is critical: WPS-014 already said it bypasses quiet hours.
insert into public.notifications(user_id,type,title,body,data,dedupe_key)
values('e1500000-0000-4000-8000-000000000002','dispute_opened','x','x','{}','push-quiet-2');
select ok((select next_attempt_at from private.notification_delivery_attempts where notification_id=(select id from public.notifications where source_key='dispute_opened:push-quiet-2')) <= now(),
  'and a critical one still goes now');

-- ---------------------------------------------------------------------------
-- 11. The dispatcher's half
-- ---------------------------------------------------------------------------

-- A device the provider says is gone is revoked, and everything else queued for
-- it is dropped rather than retried into a permanent error loop.
select is((select count(*)::integer from private.notification_delivery_attempts where token_id=(select id from private.notification_device_tokens where installation_id='install-six') and status='pending'),2,'two pushes are queued for the device about to fail');
select is(
  public.warsha_push_record_result(
    (select id from private.notification_delivery_attempts where token_id=(select id from private.notification_device_tokens where installation_id='install-six') order by created_at limit 1),
    'failed','DeviceNotRegistered',null,false,true)->>'status',
  'failed','a provider rejection is recorded as a failure');
select is((select revoked_reason from private.notification_device_tokens where installation_id='install-six'),'provider_rejected','AN INVALID TOKEN IS CLEANED UP, NOT RETRIED FOREVER');
select is((select token from private.notification_device_tokens where installation_id='install-six'),null,'and the dead token is erased');
select is((select count(*)::integer from private.notification_delivery_attempts where token_id=(select id from private.notification_device_tokens where installation_id='install-six') and status='pending'),0,'nothing is left queued for a device that no longer exists');

-- A retryable failure is scheduled again, up to the configured ceiling.
select is(
  public.warsha_push_record_result(
    (select id from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000001' and status='pending' order by created_at limit 1),
    'failed','MessageRateExceeded',null,true,false)->>'status',
  'pending','A RETRYABLE FAILURE GOES BACK ON THE QUEUE');

-- Claiming is what the Edge Function does, and it must never hand out a token
-- for a revoked device.
select ok((select pg_catalog.jsonb_array_length(public.warsha_push_claim_batch(5)->'items')) >= 1,'the dispatcher can claim work');
select is_empty(
  $$select 1 from private.notification_delivery_attempts a
    join private.notification_device_tokens t on t.id = a.token_id
    where a.status = 'sending' and t.revoked_at is not null$$,
  'and never claims work for a revoked device');

-- ---------------------------------------------------------------------------
-- 12. Turning push off, deactivating, and deleting
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000001',true);
select is(public.update_my_notification_preferences('{"pushEnabled":false}')->>'pushEnabled','false','somebody turns push off');
reset role;
select is((select count(*)::integer from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000001' and revoked_at is null),0,'TURNING PUSH OFF REVOKES THE DEVICES IT WAS SENDING TO');

-- Deactivation is not deletion, and it must still stop delivery.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1500000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.register_my_push_device('ExponentPushToken[22222222222222222222]','android','1.0.1','install-seven','ar',null)$$,'an active account with a device');
reset role;
update public.profiles set deactivated_at=now() where id='e1500000-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000002' and revoked_at is null),0,'DEACTIVATING AN ACCOUNT STOPS ITS PUSHES');
select is((select revoked_reason from private.notification_device_tokens where installation_id='install-seven'),'account_deactivated','with the reason recorded');
select is((select count(*)::integer from private.notification_delivery_attempts where user_id='e1500000-0000-4000-8000-000000000002' and status in ('pending','sending')),0,'and drops whatever was still queued');

-- Deletion removes the rows outright, by the foreign key rather than by a
-- trigger somebody could forget to write.
--
-- The third account already has a notification, which is the case that used to
-- make this impossible: `notification_source_links` refused the cascade and the
-- whole profile delete failed with "Notification source history is immutable".
-- Erasing a subject is not tampering with their history, and the guard now
-- tells the two apart.
insert into private.notification_device_tokens(user_id,token_hash,token,platform,app_version,installation_id)
values('e1500000-0000-4000-8000-000000000003','deletion-fixture-hash','ExponentPushToken[33333333333333333333]','android','1.0.1','install-eight');
select ok((select count(*) from private.notification_source_links where user_id='e1500000-0000-4000-8000-000000000003') > 0,'the account being erased has notification history');
select lives_ok($$delete from public.profiles where id='e1500000-0000-4000-8000-000000000003'$$,'AN ACCOUNT WITH NOTIFICATION HISTORY CAN BE ERASED AT ALL');
select is((select count(*)::integer from private.notification_device_tokens where user_id='e1500000-0000-4000-8000-000000000003'),0,'DELETING AN ACCOUNT DELETES ITS DEVICE TOKENS');
select is((select count(*)::integer from private.notification_source_links where user_id='e1500000-0000-4000-8000-000000000003'),0,'and its notification source history goes with it');

-- While the subject exists, the history is still untouchable.
select throws_ok(
  $$delete from private.notification_source_links where user_id='e1500000-0000-4000-8000-000000000001'$$,
  '55000','Notification source history is immutable',
  'BUT TAMPERING WITH A LIVE ACCOUNT’S HISTORY IS REFUSED EXACTLY AS BEFORE');

select * from finish();
rollback;
