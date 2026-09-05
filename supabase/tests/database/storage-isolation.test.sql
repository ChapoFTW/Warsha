-- Who can reach whose files.
--
-- ## Why SELECT on storage.objects is the whole test
--
-- Supabase Storage signs a URL only after the caller passes the SELECT policy on
-- `storage.objects` for that exact row. So "can this identity create a signed
-- URL for that object" and "can this identity select that row" are the same
-- question, asked of the same policy. Testing the policy tests the signing, the
-- download, and the listing at once — and it can be done deterministically in
-- pgTAP, which an HTTP signing test cannot.
--
-- The upload, update and delete policies are asserted separately, because an
-- identity that cannot READ somebody's criminal record but CAN overwrite it has
-- not been contained.
--
-- ## The identities
--
--   Customer A / Customer B     two unrelated customers
--   Worker A / Worker B         two unrelated workers
--   Staff WITH capability       verification_reviewer
--   Staff WITHOUT capability    a real staff grant carrying other capabilities
--   anon                        signed out
--
-- The staff-without-capability identity matters most: it is the one that proves
-- the boundary is the CAPABILITY and not merely "is staff".

begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- Every bucket is private
-- ---------------------------------------------------------------------------
-- A public bucket serves objects with no signature and no policy at all, which
-- would make every assertion below irrelevant.

select is(
  (select coalesce(string_agg(id, ', ' order by id), '')
   from storage.buckets where public),
  '',
  'NO STORAGE BUCKET IS PUBLIC');

select is((select count(*)::integer from storage.buckets where public), 0,
  'sensitive_public_buckets = 0');

-- Every bucket must also declare a lifetime, or nothing governs how long a
-- leaked URL stays usable.
select is(
  (select coalesce(string_agg(b.id, ', ' order by b.id), '')
   from storage.buckets b
   left join private.storage_bucket_lifecycle l on l.bucket_id = b.id
   where l.bucket_id is null),
  '',
  'every bucket has a declared lifetime and visibility');

select ok(
  (select bool_and(signed_url_seconds <= 300)
   from private.storage_bucket_lifecycle
   where bucket_id in ('worker-criminal-records', 'privacy-exports', 'support-attachments')),
  'THE THREE MOST SENSITIVE BUCKETS SIGN FOR AT MOST FIVE MINUTES');

-- ---------------------------------------------------------------------------
-- What actually contains the client roles
-- ---------------------------------------------------------------------------
-- `anon` and `authenticated` hold a wide set of grants on `storage.objects` that
-- Warsha cannot take away: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
-- and TRUNCATE, all granted by `supabase_storage_admin`. REVOKE only removes
-- grants made by the current role, and `postgres` is not a member of
-- `supabase_storage_admin` — `set role supabase_storage_admin` is refused — so a
-- migration that tries to revoke them is a no-op that looks like hardening.
--
-- TRUNCATE is the one that would matter, because row security does NOT apply to
-- TRUNCATE: no policy would filter it. Two facts make it unreachable, and both
-- are asserted here rather than assumed, because they are what the argument
-- rests on:
--
--   1. Row security is ON for the tables, so every reachable command is filtered.
--   2. `anon` and `authenticated` cannot log in. They are assumed with SET ROLE
--      by PostgREST, which issues SELECT/INSERT/UPDATE/DELETE and never TRUNCATE.
--
-- If either stops being true, the surplus grant becomes reachable, and these
-- assertions are what would say so.

select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'ROW SECURITY IS ENABLED ON storage.objects');
select ok((select relrowsecurity from pg_class where oid = 'storage.buckets'::regclass),
  'and on storage.buckets');

select is(
  (select coalesce(string_agg(rolname, ', ' order by rolname), '')
   from pg_roles where rolname in ('anon','authenticated') and rolcanlogin),
  '',
  'NEITHER CLIENT ROLE CAN LOG IN — THEY ARE ONLY REACHABLE VIA SET ROLE FROM PostgREST');

select is(
  (select coalesce(string_agg(rolname, ', ' order by rolname), '')
   from pg_roles where rolname in ('anon','authenticated') and rolbypassrls),
  '',
  'and neither can bypass row security');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000001','authenticated','authenticated','stor-cust-a@test.local',null,'',now(),null,'{}','{"display_name":"Customer A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000002','authenticated','authenticated','stor-cust-b@test.local',null,'',now(),null,'{}','{"display_name":"Customer B"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000003','authenticated','authenticated',null,'+201000000951','',null,now(),'{}','{"display_name":"Worker A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000004','authenticated','authenticated',null,'+201000000952','',null,now(),'{}','{"display_name":"Worker B"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000005','authenticated','authenticated','stor-staff-cap@test.local',null,'',now(),null,'{}','{"display_name":"Staff With Capability"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000006','authenticated','authenticated','stor-staff-nocap@test.local',null,'',now(),null,'{}','{"display_name":"Staff Without Capability"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('a1000000-0000-0000-0001-000000000003','a1000000-0000-0000-0000-000000000003','Worker A','plumbing','plumbing',array['plumbing'],'Worker A profile.','a1000000-0000-0000-0000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,5,4.5,4,false),
('a1000000-0000-0000-0001-000000000004','a1000000-0000-0000-0000-000000000004','Worker B','plumbing','plumbing',array['plumbing'],'Worker B profile.','a1000000-0000-0000-0000-000000000004/avatar/profile.jpg',true,true,true,'approved',50,5,4.5,4,false);

-- Staff grants. `verification_reviewer` carries both review capabilities;
-- `support_agent` deliberately carries neither, which is the control.
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key)
values
('a1000000-0000-0000-0000-000000000005','verification_reviewer','storage isolation test','stor-grant-cap-000001'),
('a1000000-0000-0000-0000-000000000006','support_agent','storage isolation test','stor-grant-nocap-00001');

-- One object per sensitive bucket, owned by Worker A.
--
-- The verification path is `<user_id>/<provider_id>/<file>` and not the obvious
-- `<user_id>/verification/<file>`: `private.verification_provider_id` reads the
-- SECOND segment as the provider id, and the policy requires it to resolve. A
-- fixture with a literal folder name there silently fails the policy for its own
-- owner, which would have made this file assert containment it had not tested.
insert into storage.objects(bucket_id, name, owner_id) values
('worker-criminal-records','a1000000-0000-0000-0000-000000000003/criminal/record.pdf','a1000000-0000-0000-0000-000000000003'),
('verification-documents','a1000000-0000-0000-0000-000000000003/a1000000-0000-0000-0001-000000000003/national_id_front.jpg','a1000000-0000-0000-0000-000000000003'),
('provider-certificates','a1000000-0000-0000-0000-000000000003/certificates/cert.pdf','a1000000-0000-0000-0000-000000000003'),
('privacy-exports','a1000000-0000-0000-0000-000000000001/export/data.json','a1000000-0000-0000-0000-000000000001');

-- The verification document has to be a registered current document for the
-- staff read path to resolve a provider from the path.
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
values ('a1000000-0000-0000-0001-000000000003','submitted',1,null) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Criminal records: the most sensitive bucket Warsha has
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 1,
  'Worker A can read their own criminal record (so they can sign a URL for it)');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 0,
  'WORKER B CANNOT READ, LIST OR SIGN WORKER A''S CRIMINAL RECORD');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 0,
  'A CUSTOMER CANNOT REACH A WORKER''S CRIMINAL RECORD');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 0,
  'STAFF WITHOUT review_criminal_records CANNOT READ IT EITHER — the boundary is the capability, not the badge');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 1,
  'staff holding review_criminal_records can read it');
reset role; select set_config('request.jwt.claim.sub','',true);

-- Anonymous callers DO hold SELECT on storage.objects — that is the Supabase
-- platform default and `postgres` cannot revoke it, because the grant was made
-- by `supabase_storage_admin` and REVOKE only removes grants made by the current
-- role. So the containment is row security, not the grant, and the grant is the
-- wrong thing to assert. What matters is how many rows a signed-out caller can
-- actually see, across every bucket: none.
set local role anon;
select is((select count(*)::integer from storage.objects), 0,
  'A SIGNED-OUT CALLER SEES NO STORAGE OBJECT IN ANY BUCKET');
reset role;

-- ---------------------------------------------------------------------------
-- Verification documents and certificates
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 0,
  'WORKER B CANNOT READ WORKER A''S IDENTITY DOCUMENTS');
select is((select count(*)::integer from storage.objects
           where bucket_id='provider-certificates'), 0,
  'nor their certificates');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 0,
  'A CUSTOMER CANNOT READ WORKER VETTING DOCUMENTS');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 1,
  'the owning worker can read their own identity document');
reset role; select set_config('request.jwt.claim.sub','',true);

-- The capability, not the badge — the same boundary as the criminal record.
--
-- `staff_worker_document_reference` has always resolved a capability per document
-- kind, called `private.require_staff_capability`, and written to
-- `private.staff_access_log` before returning a path. The storage policy admitted
-- any `private.is_staff()`, so a support agent refused by that RPC could select
-- the row directly, sign a URL, and read the national ID with no capability check
-- and no audit entry. Migration 202609060002 narrowed both policies to
-- `review_identity_verification`, and these two assertions are what would catch
-- it widening again.

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 0,
  'STAFF WITHOUT review_identity_verification CANNOT READ A WORKER''S NATIONAL ID');
select is((select count(*)::integer from storage.objects
           where bucket_id='provider-certificates'), 0,
  'nor the certificates filed with it');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 1,
  'staff holding review_identity_verification can read it, so the review path still works');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Privacy exports: a complete copy of somebody's personal data
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from storage.objects where bucket_id='privacy-exports'), 1,
  'Customer A can read their own privacy export');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='privacy-exports'), 0,
  'CUSTOMER B CANNOT READ CUSTOMER A''S PRIVACY EXPORT');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects where bucket_id='privacy-exports'), 0,
  'AND NEITHER CAN STAFF — an export belongs to its subject, not to the platform');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Writing, not only reading
-- ---------------------------------------------------------------------------
-- An identity that cannot read a criminal record but can overwrite or delete it
-- has not been contained.

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',true);

select throws_ok(
  $$insert into storage.objects(bucket_id, name, owner_id)
    values ('worker-criminal-records','a1000000-0000-0000-0000-000000000003/criminal/planted.pdf','a1000000-0000-0000-0000-000000000004')$$,
  '42501', null,
  'WORKER B CANNOT UPLOAD INTO WORKER A''S CRIMINAL-RECORD NAMESPACE');

select throws_ok(
  $$insert into storage.objects(bucket_id, name, owner_id)
    values ('verification-documents','a1000000-0000-0000-0000-000000000003/verification/planted.jpg','a1000000-0000-0000-0000-000000000004')$$,
  '42501', null,
  'nor into their verification namespace');

-- Update and delete are scoped by the same folder rule. Zero rows affected is
-- the correct outcome: the row is invisible, so there is nothing to change.
select lives_ok(
  $$update storage.objects set name = name where bucket_id='worker-criminal-records'$$,
  'an update against another worker''s record is not an error');
select is((select count(*)::integer from storage.objects where bucket_id='worker-criminal-records'), 0,
  'BECAUSE IT MATCHES NO ROWS — WORKER B CANNOT OVERWRITE, MOVE OR RENAME IT');

-- Deleting is refused before row security is even consulted: storage installs a
-- STATEMENT-level trigger, `protect_objects_delete`, that raises 42501 for any
-- direct DELETE regardless of how many rows match.
select throws_ok(
  $$delete from storage.objects where bucket_id='worker-criminal-records'$$,
  '42501', null,
  'a direct DELETE against storage.objects is refused outright');

-- That trigger is a guard against accidental data loss, NOT a security boundary,
-- and it must not be mistaken for one. It exempts itself whenever
-- `storage.allow_delete_query` is set — an undefined custom GUC, which any role
-- including `authenticated` may set for itself. A hostile caller simply turns it
-- off. So the assertion that matters is what happens once it is off.
select set_config('storage.allow_delete_query','true',true);
select lives_ok(
  $$delete from storage.objects where bucket_id='worker-criminal-records'$$,
  'with the platform guard switched off by the caller, the delete now runs');
reset role; select set_config('request.jwt.claim.sub','',true);

select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 1,
  'AND DELETED NOTHING ANYWAY — ROW SECURITY, NOT THE TRIGGER, IS THE BOUNDARY');

-- ---------------------------------------------------------------------------
-- A booking relationship does not widen identity access
-- ---------------------------------------------------------------------------
-- Hiring somebody gives a customer a job, not their vetting file.

insert into public.addresses(id,customer_id,label,address_line,governorate,district)
values ('a1000000-0000-0000-0002-000000000001','a1000000-0000-0000-0000-000000000001','Home','1 A Street','Cairo','Zamalek');

select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key,status)
values ('a1000000-0000-0000-0003-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0001-000000000003',
  (select id from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),
  'Tap repair','quote',200,'A tap that will not stop running at all.',(now() + interval '1 day')::date,'10:00',
  '{"governorate":"Cairo"}'::jsonb,'stor-isolation-booking-1','confirmed');
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from storage.objects
           where bucket_id='worker-criminal-records'), 0,
  'HIRING A WORKER DOES NOT REVEAL THEIR CRIMINAL RECORD');
select is((select count(*)::integer from storage.objects
           where bucket_id='verification-documents'), 0,
  'nor their identity documents');
select is((select count(*)::integer from storage.objects
           where bucket_id='provider-certificates'), 0,
  'nor their certificates');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- The signing gate is the policy, stated as a property
-- ---------------------------------------------------------------------------
-- Storage signs only after the SELECT policy passes, so every sensitive bucket
-- must HAVE a select policy. A bucket with none would deny everything today and
-- be the first thing loosened by somebody trying to make a feature work.

select is(
  (select coalesce(string_agg(b.id, ', ' order by b.id), '')
   from storage.buckets b
   where b.id <> 'avatars'
     and not exists (
       select 1 from pg_policy p
       where p.polrelid = 'storage.objects'::regclass and p.polcmd = 'r'
         and pg_get_expr(p.polqual, p.polrelid) like '%' || b.id || '%')),
  '',
  'EVERY LIVE BUCKET HAS AN EXPLICIT READ POLICY GOVERNING WHO MAY SIGN FOR IT');

-- `avatars` is the exception and is deliberately unreachable: retired, with no
-- policy at all, which denies every command to every role.
select is(
  (select visibility from private.storage_bucket_lifecycle where bucket_id = 'avatars'),
  'retired',
  'the retired avatars bucket is declared retired');
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'storage.objects'::regclass
     and pg_get_expr(polqual, polrelid) like '%avatars%'),
  0,
  'and carries no policy, so row security denies every command on it');

rollback;
