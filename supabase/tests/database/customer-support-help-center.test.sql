begin;
select no_plan();

-- WPS-019 — Customer Support, Help Center & Knowledge Management.
--
-- Same fixture contract as WPS-017/WPS-018: the caller presents the claims
-- PostgREST sets from a real signed access token, because the staff gate
-- verifies session freshness from the `amr` record.
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1', p_age_seconds integer default 0)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'aal', p_aal,
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint - p_age_seconds))
  )::text, true);
end $fn$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','help_categories','help categories exist');
select has_table('public','help_articles','help articles exist');
select has_table('public','help_article_translations','localized article bodies exist');
select has_table('public','help_article_versions','article version history exists');
select has_table('public','help_article_feedback','article feedback exists');
select has_table('public','support_ticket_attachments','support attachments exist');
select has_table('private','help_search_log','search telemetry is private');
select has_table('private','support_macros','staff macros are private');
select has_table('private','support_resolution_reasons','resolution reasons are private');
select has_table('private','support_sla_policy','the service level policy is private');

-- WPS-019 extends the existing support architecture. Nothing it depends on was
-- replaced, and no parallel system was created.
select has_table('public','support_tickets','the pre-existing ticket table is preserved');
select has_table('public','support_messages','the pre-existing message table is preserved');
select has_table('public','support_ticket_events','WPS-017 case history is preserved');
select has_function('public','reply_support_case','the WPS-017 reply path is preserved');
select has_function('public','get_my_support_cases','the WPS-017 list path is preserved');
select has_function('public','staff_transition_support_case','the WPS-017 staff transition is preserved');
select has_function('public','staff_add_support_note','the WPS-017 staff note is preserved');
select has_function('public','get_staff_support_case','the WPS-017 staff read is preserved');
select has_function('public','open_support_case','the intake keeps its public name');
select has_function('private','open_support_case_impl','the WPS-017 intake body is still preserved in private');

-- There is exactly one support intake. The WPS-019 overload delegates to the
-- same preserved implementation rather than duplicating validation.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_support_case'),
  2, 'open_support_case has exactly two signatures: the WPS-018 wrapper and the WPS-019 overload');
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like '%\_impl'),
  30, 'WPS-019 adds no preserved implementation; the WPS-018 count is unchanged');

-- No second chat, no second dispute system, no second moderation system.
select has_table('public','conversations','WPS-009 chat is preserved and not reused');
select has_table('public','disputes','WPS-013 disputes are preserved');
select has_table('public','trust_reports','WPS-016 reports are preserved');
select is(
  (select count(*)::integer from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname in ('support_conversations','support_chats','help_tickets','knowledge_tickets')),
  0, 'WPS-019 created no parallel support or chat table');

-- Every new public table carries row level security, which the WPS-018 release
-- verification requires of the whole schema.
select is((select relrowsecurity from pg_class where oid='public.help_categories'::regclass),true,'RLS on help categories');
select is((select relrowsecurity from pg_class where oid='public.help_articles'::regclass),true,'RLS on help articles');
select is((select relrowsecurity from pg_class where oid='public.help_article_translations'::regclass),true,'RLS on translations');
select is((select relrowsecurity from pg_class where oid='public.help_article_versions'::regclass),true,'RLS on version history');
select is((select relrowsecurity from pg_class where oid='public.help_article_feedback'::regclass),true,'RLS on feedback');
select is((select relrowsecurity from pg_class where oid='public.support_ticket_attachments'::regclass),true,'RLS on attachments');

select is(
  (select count(*)::integer from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table still has RLS enabled');

-- Every WPS-019 SECURITY DEFINER function pins an empty search path.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname in ('public','private')
     and (p.proname like 'help\_%' or p.proname like 'get\_help\_%' or p.proname like 'support\_%'
          or p.proname in ('search_help_articles','submit_help_article_feedback',
             'get_my_support_case','reopen_support_case','submit_support_satisfaction',
             'register_support_attachment','notify_support_participant'))
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%')),
  0, 'every WPS-019 security definer function pins an empty search path');

select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='private' and table_name in ('help_search_log','support_macros',
    'support_resolution_reasons','support_sla_policy') and grantee in ('anon','authenticated','PUBLIC')),
  0, 'no WPS-019 private table is exposed to a client role');

select is((select count(*)::integer from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime' and tablename in ('help_articles','help_article_translations',
    'help_article_versions','help_article_feedback','support_ticket_attachments','support_tickets','support_messages')),
  0, 'no WPS-019 table is broadcast over Realtime');

-- ---------------------------------------------------------------------------
-- Knowledge base content
-- ---------------------------------------------------------------------------
select ok((select count(*) from public.help_categories) >= 12, 'the category set is seeded');
select ok((select count(*) from public.help_articles where status='published') >= 25,
  'the published article corpus is seeded');

-- Localization is complete, not partial. A half-translated help centre is worse
-- than an untranslated one because the gap is invisible until a customer hits it.
select is(
  (select count(*)::integer from public.help_articles a
   where a.status='published'
     and not exists(select 1 from public.help_article_translations t
                    where t.article_id=a.id and t.locale='en')),
  0, 'every published article has an English body');
select is(
  (select count(*)::integer from public.help_articles a
   where a.status='published'
     and not exists(select 1 from public.help_article_translations t
                    where t.article_id=a.id and t.locale='ar')),
  0, 'every published article has an Egyptian Arabic body');
select is(
  (select count(*)::integer from public.help_categories c
   where pg_catalog.btrim(c.title_ar) = '' or pg_catalog.btrim(c.summary_ar) = ''),
  0, 'every category is labelled in both languages');

-- Every article the seed corpus points at actually exists, in both directions.
select is(
  (select count(*)::integer from public.help_articles a,
     unnest(a.related_slugs) related
   where not exists(select 1 from public.help_articles r where r.slug = related)),
  0, 'every related-article pointer resolves to a real article');

-- The knowledge base covers every help topic the specification requires.
select is(
  (select count(*)::integer from (values
     ('getting_started'),('booking_help'),('payment_help'),('worker_help'),('dispute_help'),
     ('verification_help'),('account_help'),('notification_help'),('chat_help'),('review_help'),
     ('trust_help'),('worker_earnings_help')) as required(key)
   where not exists(select 1 from public.help_categories c where c.category_key = required.key)),
  0, 'every required help category exists');

-- Version history is immutable, for the table owner too.
select ok((select count(*) from public.help_article_versions) > 0, 'the seed corpus is versioned');
select throws_ok($$update public.help_article_versions set title='rewritten'$$,'55000',
  'Help article history is immutable','a published article version cannot be rewritten');
select throws_ok($$delete from public.help_article_versions$$,'55000',
  'Help article history is immutable','a published article version cannot be deleted');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000001','authenticated','authenticated','wps019-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000002','authenticated','authenticated','wps019-support@test.local','',now(),'{}','{"display_name":"Support Agent"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000003','authenticated','authenticated','wps019-customer@test.local','',now(),'{}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000004','authenticated','authenticated','wps019-other@test.local','',now(),'{}','{"display_name":"Other Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000005','authenticated','authenticated','wps019-worker@test.local','',now(),'{}','{"display_name":"Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1900000-0000-4000-8000-000000000006','authenticated','authenticated','wps019-verifier@test.local','',now(),'{}','{"display_name":"Verification Reviewer"}',now(),now());

insert into public.customer_profiles(id) values
  ('a1900000-0000-4000-8000-000000000003'),
  ('a1900000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published,is_verified)
values ('b1900000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000005','WPS019 Worker','plumber','approved',true,true);

select ok(private.bootstrap_staff_role('a1900000-0000-4000-8000-000000000001','security_administrator',
  'WPS-019 fixture bootstrap') is not null, 'the fixture administrator is bootstrapped by a DBA');

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000001');
select ok(public.staff_grant_role('a1900000-0000-4000-8000-000000000002','support_agent',
  'WPS-019 fixture','wps019-grant-0001') is not null, 'a support agent is granted');
select ok(public.staff_grant_role('a1900000-0000-4000-8000-000000000006','verification_reviewer',
  'WPS-019 fixture','wps019-grant-0002') is not null, 'a verification reviewer is granted');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous denial
-- ---------------------------------------------------------------------------
set local role anon;
-- Denial happens at the grant, before the function body runs at all. That is a
-- stronger boundary than an in-body check, so these assert the SQLSTATE class
-- rather than the application message an anonymous caller never reaches.
select throws_ok($$select public.get_help_center('en',null)$$,'42501',null,
  'an anonymous caller cannot read the help centre');
select throws_ok($$select public.search_help_articles('payment','en',null,10)$$,'42501',null,
  'an anonymous caller cannot search the knowledge base');
select throws_ok($$select public.get_my_support_case('00000000-0000-4000-8000-000000000000')$$,'42501',null,
  'an anonymous caller cannot read a support case');
select is((select count(*)::integer from information_schema.role_table_grants
  where grantee='anon' and table_schema='public'
    and table_name in ('help_articles','help_article_translations','help_categories',
      'support_ticket_attachments','support_tickets','support_messages')),
  0, 'anon holds no grant on any support or knowledge table');
reset role;

-- ---------------------------------------------------------------------------
-- Help centre reads
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');

select ok(pg_catalog.jsonb_array_length(public.get_help_center('en',null)->'categories') >= 12,
  'the help centre lists every published category');
select is(public.get_help_center('ar',null)->>'locale','ar','the help centre answers in Egyptian Arabic');
select is(public.get_help_center('kl',null)->>'locale','en','an unknown locale falls back to English');

-- Context-aware ordering: opening support from a surface puts that surface first.
select is(
  public.get_help_center('en','payment')->'suggested'->0->>'categoryKey','payment_help',
  'opening support from payment surfaces payment help first');
select is(
  public.get_help_center('en','verification')->'suggested'->0->>'categoryKey','verification_help',
  'opening support from verification surfaces verification help first');
select ok(
  pg_catalog.jsonb_array_length(public.get_help_center('en','dispute')->'suggested') > 0,
  'every declared surface returns at least one suggestion');

select is(public.get_help_article('how-payments-work','en')->>'slug','how-payments-work',
  'an article reads by slug');
select ok(pg_catalog.length(public.get_help_article('how-payments-work','ar')->>'body') > 50,
  'the Arabic body is a real translation, not a stub');
select isnt(public.get_help_article('how-payments-work','ar')->>'body',
  public.get_help_article('how-payments-work','en')->>'body',
  'the Arabic body is not the English body');
select ok(pg_catalog.jsonb_array_length(public.get_help_article('how-payments-work','en')->'related') > 0,
  'related articles are returned');
select throws_ok($$select public.get_help_article('no-such-article','en')$$,'P0002',
  'Help article not found','an unknown slug is refused');

select ok(pg_catalog.jsonb_array_length(public.get_help_category('payment_help','en')->'articles') > 0,
  'a category lists its articles');
select throws_ok($$select public.get_help_category('no_such_category','en')$$,'P0002',
  'Help category not found','an unknown category is refused');

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
select is(public.search_help_articles('payment','en',null,10)->>'mode','exact',
  'a matching English query searches exactly');
select ok((public.search_help_articles('payment','en',null,10)->>'resultCount')::integer > 0,
  'an English query returns results');
select ok((public.search_help_articles('الدفع','ar',null,10)->>'resultCount')::integer > 0,
  'an Egyptian Arabic query returns results');
select is(public.search_help_articles('a','en',null,10)->>'mode','too_short',
  'a one-character query is refused rather than scanning the corpus');
select is(public.search_help_articles('zzzzqqqqxxxx','en',null,10)->>'mode','empty',
  'a query with no match returns an explicit empty state');
select is(public.search_help_articles('paymnt','en',null,10)->>'mode','approximate',
  'a misspelled query falls back to bounded spelling tolerance');
select ok((public.search_help_articles('paymnt','en',null,10)->>'resultCount')::integer > 0,
  'the misspelled query still finds the article');
select is(
  public.search_help_articles('verification','en',null,10)->'results'->0->>'match','exact',
  'an exact match is labelled so the client never presents a guess as certain');

-- Search never returns unpublished content, in any locale or mode.
select ok((select count(*) from public.help_articles where status <> 'published') >= 0,
  'the corpus may contain unpublished articles');
select is(
  (select count(*)::integer
   from pg_catalog.jsonb_array_elements(public.search_help_articles('warsha','en',null,25)->'results') hit
   join public.help_articles a on a.slug = hit->>'slug'
   where a.status <> 'published'),
  0, 'search never returns a draft or archived article');

select ok(pg_catalog.jsonb_array_length(public.get_help_search_suggestions('en')->'recent') > 0,
  'a caller sees their own recent searches');
-- Minimum-cell suppression: one account searching cannot create a popular term.
select is(pg_catalog.jsonb_array_length(public.get_help_search_suggestions('en')->'popular'),0,
  'a query from a single account is suppressed from popular searches');

-- Article feedback
select is((public.submit_help_article_feedback('how-payments-work',true,'en'))->>'duplicate','false',
  'an account can mark an article helpful');
select is((public.submit_help_article_feedback('how-payments-work',true,'en'))->>'duplicate','true',
  'the same vote twice is idempotent');
reset role;
select is((select helpful_count from public.help_articles where slug='how-payments-work'),1,
  'the helpful count reflects exactly one account');

-- ---------------------------------------------------------------------------
-- Support case lifecycle
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');

-- The preserved four-argument intake still works exactly as WPS-017 specified.
select ok((public.open_support_case('technical_issue','Legacy intake still works',
  'Opened through the four-argument signature.','wps019-legacy-key-1')->>'caseId') is not null,
  'the preserved four-argument intake is unambiguous and still works');

-- The eight-argument overload adds context.
select ok((public.open_support_case('payment_question','Payment looks wrong',
  'The amount on my booking does not match the quote.','wps019-case-key-1',
  null,null,'payment','en')->>'caseId') is not null,
  'the contextual intake opens a case');
select set_config('wps019.case', (select id::text from public.support_tickets
  where requester_id='a1900000-0000-4000-8000-000000000003' and idempotency_key='wps019-case-key-1'), false);

select is((select origin_surface from public.support_tickets where id=current_setting('wps019.case')::uuid),
  'payment','the originating surface is recorded on the case');
select is((select locale from public.support_tickets where id=current_setting('wps019.case')::uuid),
  'en','the case records the locale it was opened in');
select is((select requester_mode from public.support_tickets where id=current_setting('wps019.case')::uuid),
  'customer','a payment question from a customer surface is a customer case');

-- Service levels are applied on insert, so no case is ever untimed.
select ok((select first_response_due_at from public.support_tickets where id=current_setting('wps019.case')::uuid)
  is not null, 'a first response target is set when the case opens');
select ok((select resolution_due_at from public.support_tickets where id=current_setting('wps019.case')::uuid)
  > (select first_response_due_at from public.support_tickets where id=current_setting('wps019.case')::uuid),
  'the resolution target is later than the first response target');

-- Idempotency is preserved through the overload.
select is((public.open_support_case('payment_question','Payment looks wrong',
  'The amount on my booking does not match the quote.','wps019-case-key-1',
  null,null,'payment','en')->>'duplicate'),'true','the contextual intake is idempotent');

select throws_ok($$select public.open_support_case('payment_question','Bad surface','Body text',
  'wps019-case-key-2',null,null,'not_a_surface','en')$$,'22023',
  'Invalid support surface','an unknown originating surface is refused');

-- A caller cannot link a case to a record they cannot see.
select throws_ok($$select public.open_support_case('booking_help','Not my booking','Body text',
  'wps019-case-key-3','booking','11111111-1111-4111-8111-111111111111','booking','en')$$,'42501',
  'Linked record not found','a case cannot be linked to a record the caller cannot see');

-- Worker-side context
select is((public.open_support_case('withdrawal_question','Withdrawal question',
  'When does my balance become available?','wps019-worker-key-1',null,null,'earnings','ar')->>'duplicate'),
  'false','a worker surface opens a case');
select is((select requester_mode from public.support_tickets where idempotency_key='wps019-worker-key-1'),
  'worker','an earnings question is recorded as a worker case');
select is((select locale from public.support_tickets where idempotency_key='wps019-worker-key-1'),
  'ar','the case records that it was opened in Arabic');

-- The owner reads their own case, with staff notes excluded.
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'caseId',
  current_setting('wps019.case'),'the owner reads their own case');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'canReply','true',
  'an open case accepts replies');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'canReopen','false',
  'an open case cannot be reopened');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'surveyAvailable','false',
  'the survey is not offered before resolution');
reset role;

-- Cross-account denial
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000004');
select throws_ok(
  pg_catalog.format($$select public.get_my_support_case(%L)$$, current_setting('wps019.case')),
  'P0002','Support case not found','another account cannot read a case it does not own');
select throws_ok(
  pg_catalog.format($$select public.reopen_support_case(%L,'Let me in','wps019-intruder-1')$$,
    current_setting('wps019.case')),
  'P0002','Support case not found','another account cannot reopen a case it does not own');
select throws_ok(
  pg_catalog.format($$select public.submit_support_satisfaction(%L,5::smallint,null)$$,
    current_setting('wps019.case')),
  'P0002','Support case not found','another account cannot rate a case it does not own');
select is((select count(*)::integer from public.support_tickets t
  where t.requester_id='a1900000-0000-4000-8000-000000000003'),0,
  'row level security hides another account''s cases entirely');
reset role;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
select is((select category from private.notification_event_catalog where event_type='support_case_opened'),
  'support','support events are catalogued in the support category');
select is((select route_type from private.notification_event_catalog where event_type='support_case_replied'),
  'support_case','a support reply routes to the case');
select is((select mandatory_in_app from private.notification_event_catalog where event_type='support_case_replied'),
  true,'a reply from Warsha cannot be silenced by a category preference');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type in ('support_case_opened','support_case_assigned','support_case_replied',
    'support_case_resolved','support_case_reopened','support_survey_available',
    'staff_support_case_assigned','staff_support_customer_reply','staff_support_worker_reply')),
  9, 'every required support notification event is catalogued');

select is((select count(*)::integer from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_opened'),
  3, 'opening a case notifies the requester, once per case');
select is((select category from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_opened' limit 1),
  'support','the support notification lands in the support category');
select is((select audience from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_opened' limit 1),
  'all','a support notification is visible in both customer and worker mode');

-- The notification carries a pointer, never the customer's problem.
select is((select n.data from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_opened'
    and n.data->>'case_id'=current_setting('wps019.case')),
  pg_catalog.jsonb_build_object('case_id',current_setting('wps019.case')),
  'a support notification carries only the case id, never the subject or body');

-- ---------------------------------------------------------------------------
-- Staff workflow
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select throws_ok($$select public.get_staff_support_queue(null,50)$$,'42501',
  'Staff capability required','a customer cannot open the support queue');
select throws_ok($$select public.get_staff_support_toolkit('en')$$,'42501',
  'Staff capability required','a customer cannot read staff macros');
select throws_ok($$select public.staff_upsert_help_article('sneaky','payment_help','en','T','S',
  'A body long enough to pass validation.',null,null,null,'all',null)$$,'42501',
  'Staff capability required','a customer cannot author a help article');
reset role;

-- A narrow staff role cannot reach support just by being staff.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000006');
select throws_ok($$select public.get_staff_support_queue(null,50)$$,'42501',
  'Staff capability required','a verification reviewer cannot open the support queue');
select throws_ok($$select public.staff_merge_support_cases(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','x','wps019-merge-1')$$,
  '42501','Staff capability required','a verification reviewer cannot merge support cases');
reset role;

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');

select ok(pg_catalog.jsonb_array_length(public.get_staff_support_queue(null,50)->'cases') >= 3,
  'a support agent sees the open queue');
select ok((public.get_staff_support_queue(null,50)->'counts'->>'open')::integer >= 1,
  'the queue reports its own open count');
select ok(pg_catalog.jsonb_array_length(public.get_staff_support_toolkit('en')->'macros') > 0,
  'a support agent sees English macros');
select ok(pg_catalog.jsonb_array_length(public.get_staff_support_toolkit('ar')->'macros') > 0,
  'a support agent sees Egyptian Arabic macros');
select ok(pg_catalog.jsonb_array_length(public.get_staff_support_toolkit('en')->'resolutionReasons') >= 8,
  'the resolution reason catalogue is available');

select ok((public.staff_assign_support_case(current_setting('wps019.case')::uuid,
  null,'Taking this one','wps019-assign-1')->>'assignedTo') is not null,
  'a support agent can assign a case to themselves');
select is((public.staff_assign_support_case(current_setting('wps019.case')::uuid,
  null,'Taking this one','wps019-assign-1')->>'duplicate'),'true',
  'assignment is idempotent');
select throws_ok(
  pg_catalog.format($$select public.staff_assign_support_case(%L,'a1900000-0000-4000-8000-000000000003',
    'Assign to a customer','wps019-assign-2')$$, current_setting('wps019.case')),
  '42501','The assignee cannot work support cases',
  'a case cannot be assigned to an account that cannot work it');

-- A staff reply stops the first-response clock, from the message stream itself.
select ok(public.reply_support_case(current_setting('wps019.case')::uuid,
  'Thanks for reporting this. Checking the ledger entry now.','wps019-staff-reply-1') is not null,
  'a support agent replies to the case');
reset role;
select ok((select first_response_at from public.support_tickets
  where id=current_setting('wps019.case')::uuid) is not null,
  'the first staff reply stamps the first response time');
select is((select count(*)::integer from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_replied'),
  1,'a staff reply notifies the requester');

-- A staff note is never visible to the requester.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select ok(public.staff_add_support_note(current_setting('wps019.case')::uuid,
  'Internal: ledger entry looks correct, customer misread the quote.','wps019-note-1') is not null,
  'a support agent records an internal note');
reset role;
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select is(
  (select count(*)::integer
   from pg_catalog.jsonb_array_elements(
     public.get_my_support_case(current_setting('wps019.case')::uuid)->'messages') m
   where m->>'body' like 'Internal:%'),
  0, 'an internal note never reaches the requester');
reset role;
select is((select count(*)::integer from public.support_messages m
  where m.ticket_id=current_setting('wps019.case')::uuid and m.visibility='staff'),1,
  'the internal note exists and is marked staff-only');

-- Resolution
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select throws_ok(
  pg_catalog.format($$select public.staff_resolve_support_case(%L,'not_a_reason','x','wps019-resolve-0')$$,
    current_setting('wps019.case')),
  '22023','Invalid resolution reason','an unknown resolution reason is refused');
select throws_ok(
  pg_catalog.format($$select public.staff_resolve_support_case(%L,'fixed_by_warsha',null,'wps019-resolve-0')$$,
    current_setting('wps019.case')),
  '22023','This resolution reason requires a note','a reason that requires a note refuses an empty one');
select is((public.staff_resolve_support_case(current_setting('wps019.case')::uuid,
  'answered','Explained the quote breakdown.','wps019-resolve-1')->>'status'),'resolved',
  'a support agent resolves the case');
select is((public.staff_resolve_support_case(current_setting('wps019.case')::uuid,
  'answered','Explained the quote breakdown.','wps019-resolve-1')->>'duplicate'),'true',
  'resolution is idempotent');
reset role;

select is((select resolution_reason from public.support_tickets where id=current_setting('wps019.case')::uuid),
  'answered','the resolution reason is recorded on the case');
select ok((select resolved_at from public.support_tickets where id=current_setting('wps019.case')::uuid)
  is not null,'the resolution time is recorded');
select is((select count(*)::integer from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_resolved'),
  1,'resolution notifies the requester');
select is((select count(*)::integer from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_survey_available'),
  1,'the satisfaction survey is offered once the case is resolved');

-- ---------------------------------------------------------------------------
-- Reopen rules and satisfaction
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'canReopen','true',
  'a freshly resolved case can be reopened');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'surveyAvailable','true',
  'the survey is offered once the case is resolved');

select is((public.reopen_support_case(current_setting('wps019.case')::uuid,
  'The amount is still wrong.','wps019-reopen-1')->>'status'),'open',
  'the requester reopens a resolved case');
select is((public.reopen_support_case(current_setting('wps019.case')::uuid,
  'The amount is still wrong.','wps019-reopen-1')->>'duplicate'),'true',
  'reopening is idempotent');
select throws_ok(
  pg_catalog.format($$select public.reopen_support_case(%L,'Again','wps019-reopen-2')$$,
    current_setting('wps019.case')),
  '22023','Only a resolved support case can be reopened',
  'an already open case cannot be reopened again');
reset role;

select is((select reopened_count from public.support_tickets where id=current_setting('wps019.case')::uuid),
  1,'the reopen is counted');
select ok((select resolved_at from public.support_tickets where id=current_setting('wps019.case')::uuid)
  is null,'reopening clears the resolution timestamp');
select is((select count(*)::integer from public.notifications n
  where n.user_id='a1900000-0000-4000-8000-000000000003' and n.event_key='support_case_reopened'),
  1,'reopening notifies the requester');

-- The reopen window is enforced against the clock, not against trust.
update public.support_tickets set status='resolved', resolved_at=pg_catalog.now() - interval '20 days'
where id=current_setting('wps019.case')::uuid;
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select throws_ok(
  pg_catalog.format($$select public.reopen_support_case(%L,'Too late','wps019-reopen-3')$$,
    current_setting('wps019.case')),
  '22023','The reopen window for this support case has passed',
  'a case resolved twenty days ago cannot be reopened');
select is(public.get_my_support_case(current_setting('wps019.case')::uuid)->>'canReopen','false',
  'the server reports the expired window rather than letting the client guess');

-- Satisfaction
select is((public.submit_support_satisfaction(current_setting('wps019.case')::uuid,5::smallint,
  'Sorted quickly.')->>'duplicate'),'false','the requester rates the case');
select is((public.submit_support_satisfaction(current_setting('wps019.case')::uuid,1::smallint,
  'Changed my mind.')->>'duplicate'),'true','a satisfaction score cannot be resubmitted');
select throws_ok(
  pg_catalog.format($$select public.submit_support_satisfaction(%L,9::smallint,null)$$,
    current_setting('wps019.case')),
  '22023','A satisfaction score between 1 and 5 is required','an out-of-range score is refused');
reset role;
select is((select satisfaction_score::integer from public.support_tickets where id=current_setting('wps019.case')::uuid),
  5,'the first submitted score is the one kept');

-- ---------------------------------------------------------------------------
-- Reopen ceiling
-- ---------------------------------------------------------------------------
update public.support_tickets set status='resolved', resolved_at=pg_catalog.now(), reopened_count=3
where id=current_setting('wps019.case')::uuid;
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select throws_ok(
  pg_catalog.format($$select public.reopen_support_case(%L,'One more time','wps019-reopen-4')$$,
    current_setting('wps019.case')),
  '22023','This support case cannot be reopened again',
  'a case cannot be reopened a fourth time');
reset role;

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select ok((public.open_support_case('payment_question','Duplicate of my payment question',
  'Same problem, opened twice by mistake.','wps019-dupe-key-1',null,null,'payment','en')->>'caseId')
  is not null,'a duplicate case is opened');
select set_config('wps019.dupe', (select id::text from public.support_tickets
  where idempotency_key='wps019-dupe-key-1'), false);
reset role;

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select throws_ok(
  pg_catalog.format($$select public.staff_merge_support_cases(%L,%L,'Same thing','wps019-merge-self')$$,
    current_setting('wps019.dupe'), current_setting('wps019.dupe')),
  '22023','A support case cannot be merged into itself','a case cannot be merged into itself');
select throws_ok(
  pg_catalog.format($$select public.staff_merge_support_cases(%L,%L,null,'wps019-merge-noreason')$$,
    current_setting('wps019.dupe'), current_setting('wps019.case')),
  '22023','A merge reason is required','a merge without a reason is refused');
select is((public.staff_merge_support_cases(current_setting('wps019.dupe')::uuid,
  current_setting('wps019.case')::uuid,'Same payment question','wps019-merge-1')->>'duplicate'),'false',
  'a duplicate case merges into the surviving case');
select is((public.staff_merge_support_cases(current_setting('wps019.dupe')::uuid,
  current_setting('wps019.case')::uuid,'Same payment question','wps019-merge-1')->>'duplicate'),'true',
  'merging is idempotent');
reset role;

select is((select merged_into_id from public.support_tickets where id=current_setting('wps019.dupe')::uuid),
  current_setting('wps019.case')::uuid,'the merged case points at the survivor');
select is((select status from public.support_tickets where id=current_setting('wps019.dupe')::uuid),
  'closed','the merged case is closed, not deleted');
select ok((select count(*) from public.support_ticket_events
  where ticket_id=current_setting('wps019.dupe')::uuid) > 0,
  'the merged case keeps its own immutable history');
select ok((select count(*) from public.support_ticket_events
  where ticket_id=current_setting('wps019.case')::uuid and note like 'Merged in case%') = 1,
  'the surviving case records what was merged into it');

-- Merging across accounts is refused: it would expose one customer to another.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select ok((public.open_support_case('technical_issue','Mine','Body text for my own case.',
  'wps019-mine-key-1',null,null,'settings','en')->>'caseId') is not null,'a third case is opened');
reset role;
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000004');
select ok((public.open_support_case('technical_issue','Theirs','Body text for a different account.',
  'wps019-theirs-key-1',null,null,'settings','en')->>'caseId') is not null,
  'another account opens a case');
reset role;
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select throws_ok(
  pg_catalog.format($$select public.staff_merge_support_cases(
    (select id from public.support_tickets where idempotency_key='wps019-mine-key-1'),
    (select id from public.support_tickets where idempotency_key='wps019-theirs-key-1'),
    'Different people','wps019-merge-cross')$$),
  '22023','Only cases from the same requester can be merged',
  'cases from different accounts can never be merged');
reset role;

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------
select is((select public from storage.buckets where id='support-attachments'),false,
  'the support attachment bucket is private');
select is((select file_size_limit::bigint from storage.buckets where id='support-attachments'),8388608::bigint,
  'the support attachment bucket caps file size');
select is((select allowed_mime_types from storage.buckets where id='support-attachments'),
  array['image/jpeg','image/png','image/heic','application/pdf'],
  'the bucket accepts only the specified types');
select ok((select count(*) from pg_catalog.pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname in ('support_attachment_upload','support_attachment_read','support_attachment_orphan_delete')) = 3,
  'upload, read, and orphan-delete policies all exist');

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
-- Registration refuses a path that does not exist in storage, whatever the
-- client asserts about its own upload.
select throws_ok(
  pg_catalog.format($$select public.register_support_attachment(%L,
    %L,'receipt.pdf','a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6','wps019-client-1')$$,
    current_setting('wps019.case'),
    'a1900000-0000-4000-8000-000000000003/'||current_setting('wps019.case')||'/aaaaaaaaaaaa.pdf'),
  '22023','Invalid support attachment',
  'an attachment that does not exist in storage is refused');
select throws_ok(
  pg_catalog.format($$select public.register_support_attachment(%L,
    'some/other/path.pdf','../escape.pdf','a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6','wps019-client-2')$$,
    current_setting('wps019.case')),
  '22023','Invalid support attachment','a traversing file name is refused');
select throws_ok(
  pg_catalog.format($$select public.register_support_attachment(%L,
    'p','name.pdf','not-a-hash','wps019-client-3')$$, current_setting('wps019.case')),
  '22023','Invalid support attachment','a malformed content hash is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.rate_limit_policies
  where policy_key in ('support_case_open','support_case_reply','support_help_search',
    'support_attachment_register','support_case_reopen','support_article_feedback')),
  6,'every WPS-019 surface declares a rate limit policy');
select is((select count(*)::integer from private.rate_limit_policies
  where policy_key like 'support\_%' and enforced_by='client_only_gap'),
  0,'no WPS-019 surface is left to a client-only limit');

-- The limiter refuses, on the server, once the bucket is full.
update private.rate_limit_policies set max_events=2 where policy_key='support_help_search';
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000004');
select lives_ok($$select public.search_help_articles('booking','en',null,5)$$,'the first search is allowed');
select lives_ok($$select public.search_help_articles('payment','en',null,5)$$,'the second search is allowed');
select throws_ok($$select public.search_help_articles('review','en',null,5)$$,'53400',
  'Too many attempts. Please wait and try again.','the third search is refused by the server');
reset role;
update private.rate_limit_policies set max_events=120 where policy_key='support_help_search';

-- The limiter stores a hash, never a raw account identifier.
select is((select count(*)::integer from private.rate_limit_events e
  where e.subject_hash like '%a1900000%'),0,
  'no raw account identifier reaches the rate limit counter');

-- ---------------------------------------------------------------------------
-- Staff authoring and analytics
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');

select is((public.staff_upsert_help_article('wps019-draft-article','payment_help','en',
  'A new draft article','A summary for the draft article.',
  'This is the body of a draft article that is long enough to satisfy validation.',
  array['draft','test'],array['payment'],array['how-payments-work'],'all','Initial draft')->>'status'),
  'draft','a new article starts as a draft');
select is((public.staff_upsert_help_article('wps019-draft-article','payment_help','en',
  'A new draft article, revised','A revised summary for the draft article.',
  'This is the revised body of the draft article, still long enough to validate.',
  null,null,null,null,'Second pass')->>'version'),'2',
  'saving again creates a new version');
reset role;

select is((select count(*)::integer from public.help_article_versions v
  join public.help_articles a on a.id=v.article_id where a.slug='wps019-draft-article'),
  2,'both versions of the draft are retained');

-- A draft is invisible to a customer in every read path.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select throws_ok($$select public.get_help_article('wps019-draft-article','en')$$,'P0002',
  'Help article not found','a customer cannot read a draft article');
select is((select count(*)::integer from public.help_articles where slug='wps019-draft-article'),0,
  'row level security hides a draft article from a customer');
reset role;

-- Staff can read their own draft.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select is(public.get_help_article('wps019-draft-article','en')->>'status','draft',
  'a support agent can read a draft article');
select throws_ok($$select public.staff_set_help_article_status('wps019-draft-article','not_a_status',null)$$,
  '22023','Invalid article status','an unknown article status is refused');
select is((public.staff_set_help_article_status('wps019-draft-article','published','Ready'))->>'status',
  'published','a support agent publishes the article');
reset role;

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000003');
select is(public.get_help_article('wps019-draft-article','en')->>'status','published',
  'a customer can read the article once it is published');
reset role;

-- An article cannot be published in a language nobody wrote.
set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select ok(public.staff_upsert_help_article('wps019-arabic-only','payment_help','ar',
  'مقال بالعربي بس','ملخص المقال اللي بالعربي بس.',
  'ده نص المقال اللي اتكتب بالعربي بس، وطويل كفاية عشان يعدي التحقق.',
  null,null,null,'all','Arabic first') is not null,'an article can be drafted in Arabic first');
select throws_ok($$select public.staff_set_help_article_status('wps019-arabic-only','published',null)$$,
  '22023','An English translation is required before publishing',
  'an article cannot be published without an English body');

-- Analytics
select throws_ok($$select public.get_staff_support_analytics(30)$$,'42501',
  'Staff capability required','a support agent without analytics cannot read support analytics');
reset role;

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000001');
select ok(public.staff_grant_role('a1900000-0000-4000-8000-000000000002','operations_manager',
  'Analytics for the fixture','wps019-grant-0003') is not null,'the agent also becomes an operations manager');
reset role;

set local role authenticated;
select pg_temp.act_as('a1900000-0000-4000-8000-000000000002');
select ok((public.get_staff_support_analytics(30)->'totals'->>'opened')::integer > 0,
  'support analytics reports opened cases');
select is((public.get_staff_support_analytics(30)->>'minimumCell'),'5',
  'support analytics declares its minimum cell size');
-- Minimum-cell suppression: the fixture has too few cases per category to publish.
select is(pg_catalog.jsonb_array_length(public.get_staff_support_analytics(30)->'byCategory'),0,
  'a category below the minimum cell is suppressed, not reported');
select is((public.get_staff_support_analytics(30)->'satisfaction'->>'averageScore'),null,
  'an average built on fewer than five responses is suppressed');
select ok((public.get_staff_support_analytics(30)->'knowledgeBase'->>'publishedArticles')::integer >= 25,
  'support analytics reports the size of the knowledge base');
reset role;

-- ---------------------------------------------------------------------------
-- Audit coverage
-- ---------------------------------------------------------------------------
select ok((select count(*) from private.staff_audit_events
  where capability_key='manage_support_cases'
    and action in ('support_case_assigned','support_case_merged','support_case_resolved')) >= 3,
  'every staff support action is written to the WPS-017 audit');
select ok((select count(*) from private.staff_audit_events
  where action in ('help_article_saved','help_article_published')) >= 2,
  'knowledge base authoring is audited');
select throws_ok($$update public.support_ticket_events set note='rewritten'$$,'55000',
  'Support case history is immutable','case history stays immutable under WPS-019');

-- ---------------------------------------------------------------------------
-- Nothing was enabled
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.notification_configuration c
  where c.singleton and (c.push_delivery_enabled or c.token_registration_enabled or c.scheduler_enabled)),
  0,'WPS-019 enables no push delivery, token registration, or scheduler');
select is((select count(*)::integer from private.staff_feature_flags where enabled),0,
  'WPS-019 enables no feature flag');
select is((select count(*)::integer from private.staff_kill_switches where active),0,
  'WPS-019 activates no kill switch');

select * from finish();
rollback;
