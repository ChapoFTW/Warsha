-- Can a worker actually be deleted?
--
-- ## Why this file exists
--
-- Until 202609060007 the answer was no. Not for a test fixture, not for a real
-- worker, not for anything: `private.refresh_notification_discoverability()`
-- fired while the thing it describes was disappearing and took the delete down
-- with it, in two different ways.
--
--   deleting an auth user   ownership is SET NULL, the provider trigger fires,
--                           the function looks up an owner who is now NULL, and
--                           `notifications.user_id` is NOT NULL
--
--   deleting a provider     the cascade reaches provider_verifications,
--                           provider_services and provider_service_areas, whose
--                           triggers DO fire on DELETE, and the function
--                           re-inserts discoverability state for a provider that
--                           no longer exists
--
-- Nobody noticed because Warsha's erasure path anonymises rather than deletes,
-- so nothing in the product ever tried. That is exactly the kind of capability
-- that stays broken until somebody needs it, which is why the assertions below
-- are about deletion succeeding rather than about the trigger's internals.
--
-- ## What is deliberately NOT asserted
--
-- That a provider row disappears when its owner does. It does not, and that is
-- the schema's choice: `provider_profiles.user_id` references `profiles`
-- ON DELETE SET NULL, so deleting an account leaves an ownerless provider row
-- rather than destroying marketplace history. This file asserts that the delete
-- SUCCEEDS and leaves nothing inconsistent behind; it does not relitigate that
-- retention decision.

begin;
select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures: a worker with everything a real one has
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,phone,encrypted_password,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000001','authenticated','authenticated','+201000000991','',now(),'{}','{"display_name":"Delete Me A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000002','authenticated','authenticated','+201000000992','',now(),'{}','{"display_name":"Delete Me B"}',now(),now()),
('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000003','authenticated','authenticated','+201000000993','',now(),'{}','{"display_name":"Keep Me"}',now(),now());

-- Discoverability is a high bar, and a fixture that does not clear it proves
-- nothing: `private.is_provider_publicly_discoverable` requires a live owner
-- with a contact phone, a verified and published approved profile, an avatar,
-- an approved verification, and at least one active service. Without all of
-- that the value is always false, no transition ever occurs, and the very code
-- path this file exists to test never runs.
insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('f7000000-0000-0000-0001-000000000001','f7000000-0000-0000-0000-000000000001','Delete Me A','plumbing','plumbing',array['plumbing'],'Draft worker.',null,false,true,false,'draft',50,0,0,0,false),
('f7000000-0000-0000-0001-000000000002','f7000000-0000-0000-0000-000000000002','Delete Me B','plumbing','plumbing',array['plumbing'],'Published worker.','f7000000-0000-0000-0000-000000000002/avatar/p.jpg',true,true,true,'approved',50,5,4.5,4,false),
('f7000000-0000-0000-0001-000000000003','f7000000-0000-0000-0000-000000000003','Keep Me','plumbing','plumbing',array['plumbing'],'Untouched worker.','f7000000-0000-0000-0000-000000000003/avatar/p.jpg',true,true,true,'approved',50,5,4.5,4,false);

-- Approved verifications and active services, so B and C are genuinely
-- discoverable and deleting them is a real transition rather than a no-op.
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
values
('f7000000-0000-0000-0001-000000000002','approved',1,now()),
('f7000000-0000-0000-0001-000000000003','approved',1,now());

insert into public.provider_services(provider_id, service_id, is_active)
select p.id, (select id from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1), true
from public.provider_profiles p
where p.id in ('f7000000-0000-0000-0001-000000000002','f7000000-0000-0000-0001-000000000003');

-- ---------------------------------------------------------------------------
-- 1. Discoverability still works for ordinary changes
-- ---------------------------------------------------------------------------
-- Asserted first. Every deletion assertion below is only meaningful if the
-- machinery is actually running, and a fix that quietly disabled it would pass
-- the rest of this file.

select is(
  (select count(*)::integer from private.notification_discoverability_state
   where provider_id in ('f7000000-0000-0000-0001-000000000001','f7000000-0000-0000-0001-000000000002')),
  2,
  'creating a provider records its discoverability state');

select is(
  (select discoverable from private.notification_discoverability_state
   where provider_id = 'f7000000-0000-0000-0001-000000000002'),
  true,
  'AND THE PUBLISHED WORKER IS ACTUALLY DISCOVERABLE — without this the rest proves nothing');

-- Flip a published worker out of discoverability and back, and require a
-- notification each way.
update public.provider_profiles set is_published = false
where id = 'f7000000-0000-0000-0001-000000000002';
select ok(
  (select count(*) from public.notifications
   where user_id = 'f7000000-0000-0000-0000-000000000002'
     and type = 'worker_profile_unavailable') >= 1,
  'A REAL TRANSITION STILL NOTIFIES THE WORKER — the fix did not mute the feature');

update public.provider_profiles set is_published = true
where id = 'f7000000-0000-0000-0001-000000000002';
select ok(
  (select count(*) from public.notifications
   where user_id = 'f7000000-0000-0000-0000-000000000002'
     and type = 'worker_profile_discoverable') >= 1,
  'and notifies again when it comes back');

select is(
  (select discoverable from private.notification_discoverability_state
   where provider_id = 'f7000000-0000-0000-0001-000000000002'),
  true,
  'and the recorded state follows the change');

-- ---------------------------------------------------------------------------
-- 2. Deleting an account whose provider profile is a draft
-- ---------------------------------------------------------------------------
-- The first of the two original failures. Before 202609060007 this raised
-- "null value in column user_id of relation notifications".

select lives_ok(
  $$delete from auth.users where id = 'f7000000-0000-0000-0000-000000000001'$$,
  'AN AUTH USER WHO OWNS A DRAFT PROVIDER PROFILE CAN BE DELETED');

select is((select count(*)::integer from auth.users
           where id = 'f7000000-0000-0000-0000-000000000001'), 0,
  'the account is gone');
select is((select count(*)::integer from public.profiles
           where id = 'f7000000-0000-0000-0000-000000000001'), 0,
  'and its profile cascaded away with it');

-- The provider row SURVIVES, ownerless. That is the schema's SET NULL choice,
-- asserted here so a future change to it is a deliberate one.
select is((select user_id from public.provider_profiles
           where id = 'f7000000-0000-0000-0001-000000000001'), null,
  'the provider profile survives with no owner, as ON DELETE SET NULL specifies');

-- ---------------------------------------------------------------------------
-- 3. No notification was invented for a recipient who no longer exists
-- ---------------------------------------------------------------------------

select is((select count(*)::integer from public.notifications where user_id is null), 0,
  'NO NOTIFICATION EXISTS WITH A NULL RECIPIENT');

select is(
  (select count(*)::integer from public.notifications
   where data->>'provider_id' = 'f7000000-0000-0000-0001-000000000001'
     and type in ('worker_profile_discoverable','worker_profile_unavailable')),
  0,
  'and none was written about the provider whose owner just disappeared');

-- The state row is still maintained, because the provider still exists.
select is(
  (select count(*)::integer from private.notification_discoverability_state
   where provider_id = 'f7000000-0000-0000-0001-000000000001'),
  1,
  'its discoverability state is still tracked — the provider row is still there');

-- ---------------------------------------------------------------------------
-- 4. Deleting a published provider profile directly
-- ---------------------------------------------------------------------------
-- The second original failure, and the harder one: this cascade reaches the
-- child tables whose triggers fire on DELETE.

select lives_ok(
  $$delete from public.provider_profiles where id = 'f7000000-0000-0000-0001-000000000002'$$,
  'A PUBLISHED PROVIDER PROFILE CAN BE DELETED, CASCADES AND ALL');

select is((select count(*)::integer from public.provider_profiles
           where id = 'f7000000-0000-0000-0001-000000000002'), 0,
  'the provider row is gone');

select is((select count(*)::integer from public.provider_verifications
           where provider_id = 'f7000000-0000-0000-0001-000000000002'), 0,
  'its verification rows cascaded away');

-- ---------------------------------------------------------------------------
-- 5. No discoverability state was resurrected
-- ---------------------------------------------------------------------------
-- This is the assertion that would have caught the foreign-key failure: the
-- state row must be gone and must not have been re-created by a trigger firing
-- during the cascade.

select is(
  (select count(*)::integer from private.notification_discoverability_state
   where provider_id = 'f7000000-0000-0000-0001-000000000002'),
  0,
  'NO DISCOVERABILITY STATE SURVIVES OR IS RE-CREATED FOR THE DELETED PROVIDER');

select is(
  (select count(*)::integer from private.notification_discoverability_state s
   where not exists (select 1 from public.provider_profiles p where p.id = s.provider_id)),
  0,
  'and no state row anywhere points at a provider that does not exist');

-- ---------------------------------------------------------------------------
-- 6. Deleting the owner of a published provider
-- ---------------------------------------------------------------------------
-- Both paths at once: a real account, a published provider, a discoverability
-- flip, and no recipient by the time it happens.

select lives_ok(
  $$delete from auth.users where id = 'f7000000-0000-0000-0000-000000000003'$$,
  'THE OWNER OF A PUBLISHED PROVIDER CAN BE DELETED TOO');

select is((select count(*)::integer from public.notifications where user_id is null), 0,
  'still no null-recipient notification');

select is((select user_id from public.provider_profiles
           where id = 'f7000000-0000-0000-0001-000000000003'), null,
  'and that provider is ownerless rather than destroyed');

-- Deleting the now-ownerless provider must also work.
select lives_ok(
  $$delete from public.provider_profiles where id = 'f7000000-0000-0000-0001-000000000003'$$,
  'and an ownerless provider can then be removed');

select is(
  (select count(*)::integer from private.notification_discoverability_state
   where provider_id = 'f7000000-0000-0000-0001-000000000003'),
  0,
  'leaving no discoverability state behind');

-- ---------------------------------------------------------------------------
-- 7. Nothing else moved
-- ---------------------------------------------------------------------------
-- Seeded providers are untouched by any of the above, so a fix that deleted too
-- much would fail here.

select ok(
  (select count(*) from public.provider_profiles where user_id is not null) > 0,
  'providers belonging to other accounts are untouched');

rollback;
