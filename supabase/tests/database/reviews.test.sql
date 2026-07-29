begin;

select plan(60);

-- The Storage API sets this transaction-local guard before deleting object
-- metadata. pgTAP exercises the same RLS path directly inside its transaction.
select set_config('storage.allow_delete_query', 'true', true);

select has_table('public', 'review_attachments', 'review attachment metadata exists');
select has_function('public', 'submit_booking_review', array['uuid', 'smallint', 'text', 'text[]'], 'review RPC exists');
select has_function('public', 'reply_to_booking_review', array['uuid', 'text'], 'reply RPC exists');
select has_function('public', 'get_provider_rating_summary', array['uuid'], 'aggregate RPC exists');
select is(has_function_privilege('anon', 'public.submit_booking_review(uuid,smallint,text,text[])', 'EXECUTE'), false, 'anonymous users cannot submit reviews');
select is(has_function_privilege('authenticated', 'public.submit_booking_review(uuid,smallint,text,text[])', 'EXECUTE'), true, 'authenticated users can invoke the review RPC');
select is(has_function_privilege('anon', 'public.reply_to_booking_review(uuid,text)', 'EXECUTE'), false, 'anonymous users cannot submit replies');
select is(
  (
    select coalesce(pg_catalog.bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), false)
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.submit_booking_review(uuid,smallint,text,text[])'::pg_catalog.regprocedure
  ),
  false,
  'PUBLIC has no review RPC execution grant'
);
select is(has_table_privilege('authenticated', 'public.reviews', 'INSERT'), false, 'direct review inserts are denied');
select is(has_table_privilege('authenticated', 'public.reviews', 'UPDATE'), false, 'direct review updates are denied');
select is(has_table_privilege('authenticated', 'public.review_responses', 'INSERT'), false, 'direct reply inserts are denied');
select is(has_table_privilege('authenticated', 'public.review_responses', 'UPDATE'), false, 'direct reply updates are denied');
select is(has_table_privilege('authenticated', 'public.review_attachments', 'INSERT'), false, 'direct attachment metadata inserts are denied');
select is(has_table_privilege('authenticated', 'public.notifications', 'INSERT'), false, 'direct durable notification inserts are denied');
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'review_attachment_insert',
        'review_attachment_select',
        'review_attachment_delete'
      )
  ),
  3,
  'three scoped review Storage policies exist'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'UPDATE'
      and policyname like 'review_attachment%'
  ),
  0,
  'review attachment overwrite has no policy'
);
select is((select public from storage.buckets where id = 'review-attachments'), false, 'review attachment bucket is private');
select is((select file_size_limit from storage.buckets where id = 'review-attachments'), 5242880::bigint, 'review attachment bucket limit is 5 MB');
select is(
  (select allowed_mime_types from storage.buckets where id = 'review-attachments'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'review attachment bucket accepts only JPEG, PNG, and WebP'
);
select is(private.review_attachment_booking_id('../bad.jpg'), null, 'unsafe attachment path cannot be parsed');
select is(
  private.review_attachment_booking_id(
    '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg'
  ),
  '74000000-0000-0000-0000-000000000001'::uuid,
  'valid attachment path resolves its booking'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'review-c1@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'review-c2@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'review-p1@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'review-p2@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now());

insert into public.provider_profiles (
  id,
  user_id,
  display_name,
  profession_key,
  onboarding_status,
  is_published
)
values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Review provider one', 'professional', 'approved', true),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'Review provider two', 'professional', 'approved', true),
  ('73000000-0000-0000-0000-000000000003', null, 'Ownerless review provider', 'professional', 'approved', true),
  ('73000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000001', 'Self provider', 'professional', 'approved', true);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
insert into public.bookings (
  id,
  customer_id,
  provider_id,
  service_id,
  status,
  service_name_snapshot,
  pricing_type,
  estimated_price_egp,
  issue_description,
  scheduled_date,
  scheduled_time,
  address_snapshot,
  idempotency_key
)
select v.id::uuid,
       v.customer_id::uuid,
       v.provider_id::uuid,
       s.id,
       v.status,
       'Review service',
       'fixed',
       100,
       'Review test issue',
       current_date,
       '12:00',
       'Test address',
       v.key
from (
  values
    ('74000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'completed', 'review-complete'),
    ('74000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'confirmed', 'review-incomplete'),
    ('74000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000004', 'completed', 'review-self'),
    ('74000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000003', 'completed', 'review-ownerless')
) v(id, customer_id, provider_id, status, key)
cross join lateral (
  select id
  from public.services
  where is_active and deleted_at is null
  order by id
  limit 1
) s;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
insert into public.bookings (
  id,
  customer_id,
  provider_id,
  service_id,
  status,
  service_name_snapshot,
  pricing_type,
  estimated_price_egp,
  issue_description,
  scheduled_date,
  scheduled_time,
  address_snapshot,
  idempotency_key
)
select '74000000-0000-0000-0000-000000000003',
       '71000000-0000-0000-0000-000000000002',
       '73000000-0000-0000-0000-000000000001',
       s.id,
       'completed',
       'Review service',
       'fixed',
       100,
       'Review test issue',
       current_date,
       '12:00',
       'Test address',
       'review-other'
from public.services s
where s.is_active and s.deleted_at is null
order by s.id
limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'review-attachments',
    '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg'
  )$$,
  'customer can stage an attachment for their completed booking'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'review-attachments',
    '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/wrong-customer.jpg'
  )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'another customer cannot stage an attachment'
);

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'review-attachments',
    '72000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/provider.jpg'
  )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'provider cannot stage a customer review attachment'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.submit_booking_review(
    '74000000-0000-0000-0000-000000000001',
    5::smallint,
    '   ',
    array['71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg']
  )$$,
  'completed booking customer can submit a review'
);
select is(
  (select comment from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
  null,
  'whitespace-only review text becomes null'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.review_attachments a
    join public.reviews r on r.id = a.review_id
    where r.booking_id = '74000000-0000-0000-0000-000000000001'
  ),
  1,
  'submitted attachment metadata is linked once'
);
select lives_ok(
  $$select public.submit_booking_review(
    '74000000-0000-0000-0000-000000000001',
    5::smallint,
    'retry',
    array['71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg']
  )$$,
  'review retry is idempotent'
);
select is(
  (select pg_catalog.count(*)::integer from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
  1,
  'one review exists per booking'
);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000002', 5::smallint, null, array[]::text[])$$,
  '42501',
  'Review is not available',
  'incomplete booking is denied'
);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000003', 5::smallint, null, array[]::text[])$$,
  '42501',
  'Review is not available',
  'other customer booking is denied'
);

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000001', 5::smallint, null, array[]::text[])$$,
  '42501',
  'Review is not available',
  'provider cannot submit the customer review'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000004', 5::smallint, null, array[]::text[])$$,
  '42501',
  'Review is not available',
  'customer cannot review their own provider profile'
);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000005', 0::smallint, null, array[]::text[])$$,
  '22023',
  'Invalid rating',
  'rating below one is denied'
);
select throws_ok(
  $$select public.submit_booking_review('74000000-0000-0000-0000-000000000005', 6::smallint, null, array[]::text[])$$,
  '22023',
  'Invalid rating',
  'rating above five is denied'
);
select throws_ok(
  $$select public.submit_booking_review(
    '74000000-0000-0000-0000-000000000005',
    5::smallint,
    repeat('x', 2001),
    array[]::text[]
  )$$,
  '22023',
  'Invalid review',
  'review text limit is enforced'
);
select throws_ok(
  $$select public.reply_to_booking_review(
    (select id from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
    'customer reply'
  )$$,
  '42501',
  'Reply is not available',
  'customer cannot create a provider reply'
);

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.reply_to_booking_review(
    (select id from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
    'wrong provider'
  )$$,
  '42501',
  'Reply is not available',
  'wrong provider cannot reply'
);

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.reply_to_booking_review(
    (select id from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
    'Thanks'
  )$$,
  'assigned provider can reply'
);
select lives_ok(
  $$select public.reply_to_booking_review(
    (select id from public.reviews where booking_id = '74000000-0000-0000-0000-000000000001'),
    'retry'
  )$$,
  'duplicate provider reply retry is idempotent'
);

reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from public.review_responses rr
    join public.reviews r on r.id = rr.review_id
    where r.booking_id = '74000000-0000-0000-0000-000000000001'
  ),
  1,
  'exactly one provider reply exists'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where type = 'new_review'
      and data ->> 'booking_id' = '74000000-0000-0000-0000-000000000001'
  ),
  1,
  'review retry creates one durable notification'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where type = 'review_reply'
      and data ->> 'booking_id' = '74000000-0000-0000-0000-000000000001'
  ),
  1,
  'reply retry creates one durable notification'
);
select is(
  (
    select data - array['booking_id', 'review_id']::text[]
    from public.notifications
    where type = 'new_review'
      and data ->> 'booking_id' = '74000000-0000-0000-0000-000000000001'
  ),
  '{}'::jsonb,
  'new-review notification payload contains only routing identifiers'
);
select is(
  (
    select data - array['booking_id', 'review_id', 'reply_id']::text[]
    from public.notifications
    where type = 'review_reply'
      and data ->> 'booking_id' = '74000000-0000-0000-0000-000000000001'
  ),
  '{}'::jsonb,
  'reply notification payload contains only routing identifiers'
);
select is(
  ((public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001') ->> 'count')::integer),
  1,
  'visible review is included in aggregate count'
);
select is(
  ((public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001') ->> 'average')::numeric),
  5.0,
  'visible review is included in aggregate average'
);
select is(
  public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001')
    -> 'reviews' -> 0 -> 'review_responses' -> 0 ->> 'body',
  'Thanks',
  'aggregate payload includes the authoritative provider reply'
);
select is(
  (
    public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001')
      -> 'reviews' -> 0
  ) ? 'moderation_status',
  false,
  'aggregate payload excludes moderation fields'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
delete from storage.objects
where bucket_id = 'review-attachments'
  and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg';
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from storage.objects
    where bucket_id = 'review-attachments'
      and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg'
  ),
  1,
  'provider cannot delete customer review attachment'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
delete from storage.objects
where bucket_id = 'review-attachments'
  and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg';
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from storage.objects
    where bucket_id = 'review-attachments'
      and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/review/safe-1.jpg'
  ),
  1,
  'persisted review attachment cannot be removed by retry cleanup'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'review-attachments',
    '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000005/review/staged.jpg'
  )$$,
  'customer can stage cleanup test attachment'
);
delete from storage.objects
where bucket_id = 'review-attachments'
  and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000005/review/staged.jpg';
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from storage.objects
    where bucket_id = 'review-attachments'
      and name = '71000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000005/review/staged.jpg'
  ),
  0,
  'customer can delete their own unpersisted staged attachment'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.submit_booking_review(
    '74000000-0000-0000-0000-000000000005',
    4::smallint,
    'Ownerless provider review',
    array[]::text[]
  )$$,
  'completed ownerless provider booking can still be reviewed'
);
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where type = 'new_review'
      and data ->> 'booking_id' = '74000000-0000-0000-0000-000000000005'
  ),
  0,
  'ownerless provider does not create an invalid notification'
);

update public.reviews
set moderation_status = 'hidden',
    moderation_reason = 'test moderation',
    moderated_at = pg_catalog.now(),
    moderated_by = '71000000-0000-0000-0000-000000000002'
where booking_id = '74000000-0000-0000-0000-000000000001';
select is(
  ((public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001') ->> 'count')::integer),
  0,
  'hidden review is excluded from aggregate count'
);
select is(
  ((public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001') ->> 'average')::numeric),
  0::numeric,
  'hidden review is excluded from aggregate average'
);
select is(
  pg_catalog.jsonb_array_length(
    public.get_provider_rating_summary('73000000-0000-0000-0000-000000000001') -> 'reviews'
  ),
  0,
  'hidden review is excluded from recent public reviews'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.reviews
    where booking_id = '74000000-0000-0000-0000-000000000001'
  ),
  1,
  'customer retains intended participant read access to hidden review'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.reviews
    where booking_id = '74000000-0000-0000-0000-000000000001'
  ),
  0,
  'anonymous readers cannot read hidden review'
);
reset role;

select * from finish();
rollback;
