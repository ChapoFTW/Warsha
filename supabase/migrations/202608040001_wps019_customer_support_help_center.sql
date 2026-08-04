-- ===========================================================================
-- WPS-019 — Customer Support, Help Center & Knowledge Management
-- ===========================================================================
--
-- This migration EXTENDS the support architecture that already exists. It
-- creates no second ticket system, no second chat, no second notification
-- system, no second staff role model, and no second audit trail.
--
-- What already existed before this file (see
-- docs/architecture/support-architecture-audit.md):
--   * public.support_tickets      — 202607200002, extended by WPS-017
--   * public.support_messages     — 202607200002, extended by WPS-017
--   * public.support_ticket_events— WPS-017, immutable
--   * open_support_case / reply_support_case / get_my_support_cases
--   * staff_transition_support_case / staff_add_support_note /
--     get_staff_support_case
--   * capability `manage_support_cases`, queue `support_cases`, and the
--     generic WPS-017 assignment layer
--   * the WPS-018 rate-limiting wrapper around open_support_case, whose
--     original body lives at private.open_support_case_impl
--
-- The audit's headline finding: that backend was complete and unreachable.
-- No customer, worker, or staff surface ever called it, and there was no
-- knowledge base at all. WPS-019 closes that, and adds the article system that
-- prevents most cases from ever being opened.
--
-- Forward-only. Nothing here drops a table, a column, or a public function.
-- ===========================================================================

-- Trigram matching backs the deliberate, bounded spelling tolerance in help
-- search. There is no AI, no embedding, and no external service anywhere in
-- WPS-019 search.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Knowledge base
-- ---------------------------------------------------------------------------
--
-- Categories carry inline English and Egyptian Arabic labels: the set is small,
-- fixed, and always needed together. Articles use a per-locale translation row
-- because their bodies are long, independently versioned, and independently
-- searchable.

create table if not exists public.help_categories (
  category_key text primary key,
  audience text not null default 'all',
  icon text not null default 'help-outline',
  surfaces text[] not null default '{}',
  sort_order integer not null default 100,
  published boolean not null default true,
  title_en text not null,
  title_ar text not null,
  summary_en text not null,
  summary_ar text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint help_categories_key_check check (category_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint help_categories_audience_check check (audience in ('customer','worker','all')),
  constraint help_categories_title_check check (
    pg_catalog.length(pg_catalog.btrim(title_en)) between 2 and 80
    and pg_catalog.length(pg_catalog.btrim(title_ar)) between 2 and 80)
);

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_key text not null references public.help_categories(category_key) on delete restrict,
  status text not null default 'draft',
  audience text not null default 'all',
  surfaces text[] not null default '{}',
  tags text[] not null default '{}',
  related_slugs text[] not null default '{}',
  sort_order integer not null default 100,
  version integer not null default 1,
  view_count integer not null default 0,
  helpful_count integer not null default 0,
  not_helpful_count integer not null default 0,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint help_articles_slug_check check (slug ~ '^[a-z][a-z0-9-]{2,80}$'),
  constraint help_articles_status_check check (status in ('draft','published','archived')),
  constraint help_articles_audience_check check (audience in ('customer','worker','all')),
  constraint help_articles_version_check check (version >= 1),
  constraint help_articles_counts_check check (
    view_count >= 0 and helpful_count >= 0 and not_helpful_count >= 0),
  -- A published article must record when it was published; an archived one must
  -- record when it was archived. State and timestamp cannot drift apart.
  constraint help_articles_published_check check (status <> 'published' or published_at is not null),
  constraint help_articles_archived_check check (status <> 'archived' or archived_at is not null),
  constraint help_articles_tag_count_check check (
    pg_catalog.array_length(tags,1) is null or pg_catalog.array_length(tags,1) <= 12),
  constraint help_articles_related_count_check check (
    pg_catalog.array_length(related_slugs,1) is null or pg_catalog.array_length(related_slugs,1) <= 6)
);
create index if not exists help_articles_category_idx on public.help_articles(category_key, sort_order);
create index if not exists help_articles_published_idx on public.help_articles(status, sort_order) where status = 'published';
create index if not exists help_articles_surfaces_idx on public.help_articles using gin(surfaces);
create index if not exists help_articles_tags_idx on public.help_articles using gin(tags);

create table if not exists public.help_article_translations (
  article_id uuid not null references public.help_articles(id) on delete cascade,
  locale text not null,
  title text not null,
  summary text not null,
  body text not null,
  updated_at timestamptz not null default pg_catalog.now(),
  -- `simple` is used deliberately for both locales: Postgres ships no Arabic
  -- stemmer, and a stemmer applied to only one language would make relevance
  -- asymmetric between English and Egyptian Arabic.
  search_vector tsvector generated always as (
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(title,'')), 'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(summary,'')), 'B')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(body,'')), 'C')
  ) stored,
  primary key (article_id, locale),
  constraint help_article_translations_locale_check check (locale in ('en','ar')),
  constraint help_article_translations_title_check check (
    pg_catalog.length(pg_catalog.btrim(title)) between 3 and 160),
  constraint help_article_translations_summary_check check (
    pg_catalog.length(pg_catalog.btrim(summary)) between 3 and 400),
  constraint help_article_translations_body_check check (
    pg_catalog.length(pg_catalog.btrim(body)) between 10 and 20000)
);
create index if not exists help_article_translations_search_idx
  on public.help_article_translations using gin(search_vector);
create index if not exists help_article_translations_title_trgm_idx
  on public.help_article_translations using gin(title extensions.gin_trgm_ops);

-- Version history is append-only. An editor can never quietly rewrite what a
-- customer was told last month.
create table if not exists public.help_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.help_articles(id) on delete cascade,
  version integer not null,
  locale text not null,
  status text not null,
  title text not null,
  summary text not null,
  body text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_note text,
  created_at timestamptz not null default pg_catalog.now(),
  unique (article_id, version, locale),
  constraint help_article_versions_locale_check check (locale in ('en','ar')),
  constraint help_article_versions_status_check check (status in ('draft','published','archived'))
);
create index if not exists help_article_versions_article_idx
  on public.help_article_versions(article_id, version desc);

create table if not exists public.help_article_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.help_articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  locale text not null,
  helpful boolean not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (article_id, user_id),
  constraint help_article_feedback_locale_check check (locale in ('en','ar'))
);

-- Search telemetry lives in `private`. It stores the normalized query and the
-- searching account, and nothing else — never a result, never a document.
create table if not exists private.help_search_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  locale text not null,
  query_normalized text not null,
  surface text,
  result_count integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  constraint help_search_log_locale_check check (locale in ('en','ar')),
  constraint help_search_log_query_check check (
    pg_catalog.length(query_normalized) between 2 and 100)
);
create index if not exists help_search_log_user_idx on private.help_search_log(user_id, created_at desc);
create index if not exists help_search_log_query_idx on private.help_search_log(query_normalized, created_at desc);
revoke all on private.help_search_log from public, anon, authenticated;

create or replace function private.prevent_help_version_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Help article history is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_help_version_mutation() from public, anon, authenticated;
drop trigger if exists help_article_versions_immutable on public.help_article_versions;
create trigger help_article_versions_immutable
before update or delete on public.help_article_versions
for each row execute function private.prevent_help_version_mutation();

-- ---------------------------------------------------------------------------
-- 2. Support case extension
-- ---------------------------------------------------------------------------
--
-- Every column is additive. The WPS-017 columns, constraints, statuses, and
-- categories are untouched, so open_support_case, reply_support_case,
-- get_my_support_cases, and every staff RPC keep working exactly as specified.

alter table public.support_tickets
  add column if not exists linked_type text,
  add column if not exists linked_id uuid,
  add column if not exists origin_surface text not null default 'help_center',
  add column if not exists locale text not null default 'en',
  add column if not exists requester_mode text not null default 'customer',
  add column if not exists first_response_at timestamptz,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists reopened_count integer not null default 0,
  add column if not exists merged_into_id uuid references public.support_tickets(id) on delete set null,
  add column if not exists resolution_reason text,
  add column if not exists satisfaction_score smallint,
  add column if not exists satisfaction_comment text,
  add column if not exists satisfaction_submitted_at timestamptz,
  add column if not exists attachment_count integer not null default 0;

alter table public.support_tickets
  drop constraint if exists support_tickets_linked_check,
  drop constraint if exists support_tickets_origin_surface_check,
  drop constraint if exists support_tickets_locale_check,
  drop constraint if exists support_tickets_requester_mode_check,
  drop constraint if exists support_tickets_reopened_check,
  drop constraint if exists support_tickets_satisfaction_check,
  drop constraint if exists support_tickets_merge_check,
  drop constraint if exists support_tickets_attachment_count_check,
  -- A linked record is a POINTER to the authoritative domain record. WPS-019
  -- never copies a booking, payment, dispute, or verification into a ticket.
  add constraint support_tickets_linked_check check (
    (linked_type is null and linked_id is null)
    or (linked_type in ('booking','payment','dispute','verification','review',
                        'marketplace_request','conversation','withdrawal','provider_profile')
        and linked_id is not null)),
  add constraint support_tickets_origin_surface_check check (origin_surface in (
    'help_center','booking','payment','verification','portfolio','notification','review',
    'dispute','marketplace','chat','settings','account','onboarding','earnings','other')),
  add constraint support_tickets_locale_check check (locale in ('en','ar')),
  add constraint support_tickets_requester_mode_check check (requester_mode in ('customer','worker')),
  add constraint support_tickets_reopened_check check (reopened_count between 0 and 3),
  add constraint support_tickets_satisfaction_check check (
    (satisfaction_score is null and satisfaction_submitted_at is null)
    or (satisfaction_score between 1 and 5 and satisfaction_submitted_at is not null)),
  -- A ticket can never be merged into itself.
  add constraint support_tickets_merge_check check (merged_into_id is null or merged_into_id <> id),
  add constraint support_tickets_attachment_count_check check (attachment_count between 0 and 10);

create index if not exists support_tickets_requester_idx
  on public.support_tickets(requester_id, created_at desc);
create index if not exists support_tickets_linked_idx
  on public.support_tickets(linked_type, linked_id) where linked_id is not null;
create index if not exists support_tickets_sla_idx
  on public.support_tickets(first_response_due_at)
  where first_response_at is null and status in ('open','in_progress');

alter table public.support_messages
  add column if not exists macro_key text,
  add column if not exists attachment_id uuid;
alter table public.support_messages
  drop constraint if exists support_messages_macro_check,
  add constraint support_messages_macro_check check (
    macro_key is null or macro_key ~ '^[a-z][a-z0-9_]{2,48}$');

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  content_hash text not null,
  client_id text not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (ticket_id, uploader_id, client_id),
  constraint support_attachments_mime_check check (mime_type in (
    'image/jpeg','image/png','image/heic','application/pdf')),
  constraint support_attachments_size_check check (byte_size between 1 and 8388608),
  constraint support_attachments_hash_check check (content_hash ~ '^[a-f0-9]{32,64}$'),
  constraint support_attachments_name_check check (
    pg_catalog.length(pg_catalog.btrim(file_name)) between 1 and 120
    and pg_catalog.strpos(file_name,'/') = 0
    and pg_catalog.strpos(file_name, pg_catalog.chr(92)) = 0
    and file_name !~ '[[:cntrl:]]')
);
create index if not exists support_ticket_attachments_ticket_idx
  on public.support_ticket_attachments(ticket_id, created_at);
-- The same file cannot be attached twice to the same case.
create unique index if not exists support_ticket_attachments_hash_idx
  on public.support_ticket_attachments(ticket_id, content_hash);

alter table public.support_messages
  drop constraint if exists support_messages_attachment_fk,
  add constraint support_messages_attachment_fk
    foreign key (attachment_id) references public.support_ticket_attachments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Service levels, macros, and resolution reasons
-- ---------------------------------------------------------------------------
--
-- These are internal operating policy, so they live in `private`. A customer is
-- never shown a target they were not promised.

create table if not exists private.support_sla_policy (
  priority text primary key,
  first_response_hours integer not null,
  resolution_hours integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint support_sla_priority_check check (priority in ('urgent','high','normal','low')),
  constraint support_sla_hours_check check (
    first_response_hours between 1 and 168 and resolution_hours between 1 and 720
    and resolution_hours >= first_response_hours)
);
revoke all on private.support_sla_policy from public, anon, authenticated;

insert into private.support_sla_policy(priority, first_response_hours, resolution_hours) values
  ('urgent', 2, 24),
  ('high',   6, 48),
  ('normal',24, 96),
  ('low',   48,168)
on conflict (priority) do update set
  first_response_hours = excluded.first_response_hours,
  resolution_hours = excluded.resolution_hours,
  updated_at = pg_catalog.now();

create table if not exists private.support_resolution_reasons (
  reason_key text primary key,
  label_en text not null,
  label_ar text not null,
  requires_note boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,
  constraint support_resolution_key_check check (reason_key ~ '^[a-z][a-z0-9_]{2,48}$')
);
revoke all on private.support_resolution_reasons from public, anon, authenticated;

insert into private.support_resolution_reasons(reason_key, label_en, label_ar, requires_note, sort_order) values
  ('answered','Question answered','تم الرد على السؤال',false,10),
  ('guided_to_article','Guided to a help article','تم توجيه العميل لمقال المساعدة',false,20),
  ('fixed_by_warsha','Fixed by Warsha','تم الحل من وارشة',true,30),
  ('resolved_by_participant','Resolved by the requester','اتحل من صاحب الطلب',false,40),
  ('escalated_elsewhere','Escalated to the owning team','تم تحويله للفريق المختص',true,50),
  ('duplicate','Duplicate of another case','مكرر مع حالة تانية',false,60),
  ('no_response','No response from the requester','مفيش رد من صاحب الطلب',false,70),
  ('out_of_scope','Outside Warsha support','خارج نطاق دعم وارشة',true,80)
on conflict (reason_key) do update set
  label_en = excluded.label_en, label_ar = excluded.label_ar,
  requires_note = excluded.requires_note, sort_order = excluded.sort_order;

-- Macros are staff writing aids. They are never sent automatically: a macro
-- fills the reply box, a human still presses send, and the sent message records
-- which macro produced it.
create table if not exists private.support_macros (
  macro_key text primary key,
  category text not null,
  locale text not null,
  title text not null,
  body text not null,
  suggested_resolution text references private.support_resolution_reasons(reason_key),
  active boolean not null default true,
  sort_order integer not null default 100,
  constraint support_macros_key_check check (macro_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint support_macros_locale_check check (locale in ('en','ar')),
  constraint support_macros_body_check check (
    pg_catalog.length(pg_catalog.btrim(body)) between 10 and 2000)
);
revoke all on private.support_macros from public, anon, authenticated;

insert into private.support_macros(macro_key, category, locale, title, body, suggested_resolution, sort_order) values
  ('ack_en','other','en','Acknowledge',
   'Thanks for contacting Warsha. We have your case and someone is looking at it now. We will reply here as soon as we have an answer for you.',null,10),
  ('ack_ar','other','ar','استلام الطلب',
   'شكرًا لتواصلك مع وارشة. حالتك وصلتنا وفيه حد بيراجعها دلوقتي. هنرد عليك هنا أول ما يكون عندنا إجابة.',null,20),
  ('payment_pending_en','payment_question','en','Payment still pending',
   'A cash payment is confirmed by the worker after the job. If the amount still looks wrong after that, reply here with the booking date and we will check the ledger entry for you.','answered',30),
  ('payment_pending_ar','payment_question','ar','الدفع لسه معلق',
   'الدفع كاش بيتأكد من الصنايعي بعد ما الشغل يخلص. لو المبلغ لسه مش مظبوط بعد كده، ابعتلنا هنا تاريخ الحجز وإحنا هنراجع القيد بنفسنا.','answered',40),
  ('verification_docs_en','verification_help','en','Verification documents',
   'Verification needs a clear photo of your national ID, front and back, with all four corners visible and no glare. Upload it again from the verification screen and we will review it.','guided_to_article',50),
  ('verification_docs_ar','verification_help','ar','مستندات التوثيق',
   'التوثيق محتاج صورة واضحة من بطاقتك الشخصية، وش وضهر، وأركانها الأربعة ظاهرة ومن غير لمعة. ارفعها تاني من شاشة التوثيق وإحنا هنراجعها.','guided_to_article',60),
  ('dispute_redirect_en','booking_help','en','This belongs in a dispute',
   'What you are describing is a dispute about the job itself, which has its own process with evidence and a decision. Open it from the booking screen and support will stay available here for anything else.','escalated_elsewhere',70),
  ('dispute_redirect_ar','booking_help','ar','ده مكانه في نزاع',
   'اللي بتوصفه ده نزاع على الشغل نفسه، وليه مسار مخصوص بأدلة وقرار. افتحه من شاشة الحجز، والدعم هيفضل موجود هنا لأي حاجة تانية.','escalated_elsewhere',80),
  ('closing_en','other','en','Closing the case',
   'We are marking this case resolved. If anything is still open, reply here within fourteen days and it reopens automatically.','answered',90),
  ('closing_ar','other','ar','قفل الحالة',
   'إحنا بنقفل الحالة دي كمحلولة. لو لسه فيه حاجة ناقصة، رد هنا خلال أربعتاشر يوم وهتفتح تاني لوحدها.','answered',100)
on conflict (macro_key) do update set
  category = excluded.category, locale = excluded.locale, title = excluded.title,
  body = excluded.body, suggested_resolution = excluded.suggested_resolution,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 4. Rate limits (WPS-018 limiter; no new limiter is created)
-- ---------------------------------------------------------------------------

insert into private.rate_limit_policies(policy_key, surface, scope, max_events, window_seconds, enforced_by, notes) values
  ('support_case_reply','Support case replies','account',60,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around the WPS-019 reply path.'),
  ('support_help_search','Help centre searches','account',120,300,'wps018_limiter',
   'Enforced by the WPS-018 limiter; search is read-only but enumerable.'),
  ('support_attachment_register','Support attachment registration','account',30,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter around registration; storage policy caps size and type.'),
  ('support_case_reopen','Support case reopens','account',10,86400,'wps018_limiter',
   'Enforced by the WPS-018 limiter; three reopens per case is also enforced by constraint.'),
  ('support_article_feedback','Help article feedback','account',60,3600,'wps018_limiter',
   'Enforced by the WPS-018 limiter; one vote per article per account is enforced by unique index.')
on conflict (policy_key) do update set
  surface = excluded.surface, scope = excluded.scope, max_events = excluded.max_events,
  window_seconds = excluded.window_seconds, enforced_by = excluded.enforced_by,
  notes = excluded.notes, updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 5. Notification integration (WPS-014 extended, never replaced)
-- ---------------------------------------------------------------------------
--
-- A tenth category and a thirteenth route type. Nothing about the existing nine
-- categories or twelve route types changes. WPS-017 already added `case_id` to
-- the UUID payload allowlist and already resolves it as a resource id, so the
-- payload allowlist and resource resolver are untouched here.

alter table public.notifications
  drop constraint if exists notifications_category_check,
  drop constraint if exists notifications_route_type_check,
  add constraint notifications_category_check check (category is null or category in (
    'marketplace','bookings','messages','payments','worker_account','reviews',
    'disputes','security','system','support'
  )),
  add constraint notifications_route_type_check check (route_type is null or route_type in (
    'marketplace_request','worker_opportunities','worker_quote','booking','conversation',
    'provider_profile','booking_payment','worker_earnings','verification','booking_review',
    'booking_dispute','preferences','support_case'
  ));

alter table private.notification_event_catalog
  drop constraint if exists notification_event_catalog_category_check,
  drop constraint if exists notification_event_catalog_route_type_check,
  add constraint notification_event_catalog_category_check check (category in (
    'marketplace','bookings','messages','payments','worker_account','reviews',
    'disputes','security','system','support'
  )),
  add constraint notification_event_catalog_route_type_check check (route_type is null or route_type in (
    'marketplace_request','worker_opportunities','worker_quote','booking','conversation',
    'provider_profile','booking_payment','worker_earnings','verification','booking_review',
    'booking_dispute','preferences','support_case'
  ));

create or replace function private.notification_category_preferences_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select pg_catalog.jsonb_typeof(p_value)='object'
    and p_value - array['marketplace','bookings','messages','payments','worker_account',
                        'reviews','disputes','security','system','support'] = '{}'::jsonb
    and not exists (
      select 1 from pg_catalog.jsonb_each(p_value) entry
      where pg_catalog.jsonb_typeof(entry.value) <> 'boolean'
    )
$$;
revoke all on function private.notification_category_preferences_valid(jsonb) from public, anon, authenticated;

-- Unchanged WPS-014/WPS-017 derivation with one added branch. `staff_support_%`
-- keeps matching the staff rules first because it starts with `staff_`.
create or replace function private.notification_category(p_type text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_type like 'support\_%' then 'support'
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
revoke all on function private.notification_category(text) from public, anon, authenticated;

create or replace function private.notification_route_type(p_type text,p_category text,p_data jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when p_category='support' and p_data ? 'case_id' then 'support_case'
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
revoke all on function private.notification_route_type(text,text,jsonb) from public, anon, authenticated;

-- New accounts get an explicit support toggle, and existing accounts are
-- backfilled to enabled so nobody silently loses a reply from Warsha.
alter table public.notification_preferences
  alter column category_preferences set default '{
    "marketplace":true,"bookings":true,"messages":true,"payments":true,
    "worker_account":true,"reviews":true,"disputes":true,"security":true,
    "system":true,"support":true
  }'::jsonb;

update public.notification_preferences
set category_preferences = category_preferences || '{"support":true}'::jsonb
where not (category_preferences ? 'support');

-- The category filter on the inbox query is an allowlist; `support` has to be
-- added or a client could never filter to it.
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
  if p_limit not between 1 and 50 or (p_category is not null and p_category not in ('marketplace','bookings','messages','payments','worker_account','reviews','disputes','security','system','support'))
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
revoke all on function public.get_my_notifications(text,timestamptz,uuid,integer,boolean,text)
  from public, anon, authenticated;
grant execute on function public.get_my_notifications(text,timestamptz,uuid,integer,boolean,text)
  to authenticated;

-- A support case route is authorized at open time like every other route: the
-- requester, or a staff member who can work support cases. Nothing else.
create or replace function public.resolve_notification_route(p_notification_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); n public.notifications; booking_id uuid; target_request_id uuid; quote_id uuid; provider_id uuid; invitation_id uuid; allowed boolean:=false; route_resource uuid;
begin
  if uid is null or not private.notification_mode_allowed(uid,p_mode) then return pg_catalog.jsonb_build_object('status','inaccessible'); end if;
  select * into n from public.notifications owned where owned.id=p_notification_id and owned.user_id=uid and private.notification_visible_in_mode(owned.audience,p_mode);
  if n.id is null then return pg_catalog.jsonb_build_object('status','inaccessible'); end if;
  if n.route_type is null then return pg_catalog.jsonb_build_object('status','no_action'); end if;
  if n.route_type='preferences' then return pg_catalog.jsonb_build_object('status','ok','routeType','preferences'); end if;
  if n.route_type='support_case' then
    route_resource:=private.notification_data_uuid(n.data,'case_id');
    if route_resource is not null and private.support_case_visible(route_resource) then
      return pg_catalog.jsonb_build_object('status','ok','routeType','support_case','resourceId',route_resource);
    end if;
    insert into private.notification_operational_events(event_key,user_id,notification_id)
    values('route_inaccessible',uid,n.id);
    return pg_catalog.jsonb_build_object('status',case when route_resource is null then 'stale' else 'inaccessible' end);
  end if;
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
revoke all on function public.resolve_notification_route(uuid,text) from public, anon, authenticated;
grant execute on function public.resolve_notification_route(uuid,text) to authenticated;

insert into private.notification_event_catalog(
  event_type,category,priority,action_type,route_type,required_action,mandatory_in_app,quiet_hours_bypass,group_family,generic_title,generic_body
) values
  ('support_case_opened','support','informational','open_support_case','support_case',false,false,false,null,
   'Support case opened','Warsha received your support case.'),
  ('support_case_assigned','support','informational','open_support_case','support_case',false,false,false,null,
   'Support case update','Someone at Warsha is looking at your case.'),
  ('support_case_replied','support','important','open_support_case','support_case',false,true,false,null,
   'Warsha replied','There is a new reply on your support case.'),
  ('support_case_resolved','support','important','open_support_case','support_case',false,true,false,null,
   'Support case resolved','Your support case was marked resolved.'),
  ('support_case_reopened','support','important','open_support_case','support_case',false,false,false,null,
   'Support case reopened','Your support case was reopened.'),
  ('support_survey_available','support','informational','open_support_case','support_case',false,false,false,null,
   'How did we do?','Tell us how your support case went.'),
  ('staff_support_case_assigned','system','action_required',null,null,true,true,false,null,
   'Support case assigned','A support case is assigned to you.'),
  ('staff_support_customer_reply','system','action_required',null,null,true,true,false,null,
   'Customer replied','A customer replied on a support case.'),
  ('staff_support_worker_reply','system','action_required',null,null,true,true,false,null,
   'Worker replied','A worker replied on a support case.'),
  ('staff_support_sla_breach','system','action_required',null,null,true,true,true,null,
   'Support case overdue','A support case passed its first-response target.')
on conflict(event_type) do update set
  category=excluded.category,priority=excluded.priority,action_type=excluded.action_type,
  route_type=excluded.route_type,required_action=excluded.required_action,
  mandatory_in_app=excluded.mandatory_in_app,quiet_hours_bypass=excluded.quiet_hours_bypass,
  group_family=excluded.group_family,generic_title=excluded.generic_title,generic_body=excluded.generic_body;

-- ---------------------------------------------------------------------------
-- 6. Support helpers
-- ---------------------------------------------------------------------------

-- WPS-019 is a WPS-017-native surface, so it gates on the capability model
-- directly rather than through `require_domain_staff`. That gate exists to
-- preserve the PRE-WPS-017 `is_staff()` behaviour for legacy RPCs, and a
-- WPS-017 support agent deliberately does not satisfy it: the agent holds
-- `manage_support_cases` and specifically not `legacy_domain_staff_actions`.
--
-- Using the legacy gate here would have locked the support role out of support.
-- The write variant adds the same privileged-action limiter WPS-018 applies, so
-- a compromised staff session still cannot drive bulk mutations.
create or replace function private.require_support_staff_write(p_capability text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid;
begin
  v_uid := private.require_staff_capability(p_capability);
  perform private.enforce_rate_limit('staff_privileged_action', v_uid::text);
  return v_uid;
end;
$$;
revoke all on function private.require_support_staff_write(text) from public, anon, authenticated;

create or replace function private.support_requester_mode(p_category text, p_surface text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_surface in ('portfolio','earnings','verification','onboarding') then 'worker'
    when p_category in ('worker_onboarding','verification_help','withdrawal_question') then 'worker'
    else 'customer' end
$$;
revoke all on function private.support_requester_mode(text,text) from public, anon, authenticated;

-- Ownership is derived on the server from the ticket row. No caller ever states
-- who owns a case.
create or replace function private.support_case_visible(p_case_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.support_tickets t
    where t.id = p_case_id
      and (t.requester_id = (select auth.uid())
           or private.staff_has_capability('manage_support_cases')))
$$;
revoke all on function private.support_case_visible(uuid) from public, anon, authenticated;
grant execute on function private.support_case_visible(uuid) to authenticated;

create or replace function private.support_attachment_registered(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.support_ticket_attachments a where a.storage_path = p_path)
$$;
revoke all on function private.support_attachment_registered(text) from public, anon, authenticated;
grant execute on function private.support_attachment_registered(text) to authenticated;

create or replace function private.can_read_support_attachment(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.support_ticket_attachments a
    join public.support_tickets t on t.id = a.ticket_id
    where a.storage_path = p_path
      and (t.requester_id = (select auth.uid())
           or private.staff_has_capability('manage_support_cases')))
$$;
revoke all on function private.can_read_support_attachment(text) from public, anon, authenticated;
grant execute on function private.can_read_support_attachment(text) to authenticated;

-- A support notification carries only the case id. It never carries a subject,
-- a body, or any detail of the customer's problem.
create or replace function private.notify_support_participant(
  p_user_id uuid, p_event_key text, p_case_id uuid, p_source_suffix text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null or p_case_id is null then return; end if;
  if p_event_key not like 'support\_%' then
    raise exception 'Support notifications must use a support event key' using errcode = '22023';
  end if;
  insert into public.notifications(user_id, type, title, body, data, event_key, source_key)
  values (p_user_id, p_event_key, 'Warsha support', 'Your support case has an update.',
          pg_catalog.jsonb_build_object('case_id', p_case_id), p_event_key,
          p_case_id::text || ':' || p_source_suffix);
exception when unique_violation then
  return;
end;
$$;
revoke all on function private.notify_support_participant(uuid,text,uuid,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Lifecycle triggers
-- ---------------------------------------------------------------------------
--
-- Service levels and notifications are applied by trigger rather than inside
-- the RPCs. That is deliberate: it means the untouched WPS-017 functions
-- (open_support_case, reply_support_case, staff_transition_support_case,
-- staff_add_support_note) gain the full WPS-019 lifecycle without a single line
-- of their bodies being rewritten.

create or replace function private.support_ticket_before_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_policy private.support_sla_policy%rowtype;
begin
  new.locale := coalesce(new.locale, 'en');
  new.requester_mode := coalesce(nullif(new.requester_mode,''),
    private.support_requester_mode(new.category, new.origin_surface));
  select * into v_policy from private.support_sla_policy p where p.priority = new.priority;
  if v_policy.priority is not null then
    new.first_response_due_at := coalesce(new.first_response_due_at,
      pg_catalog.now() + pg_catalog.make_interval(hours => v_policy.first_response_hours));
    new.resolution_due_at := coalesce(new.resolution_due_at,
      pg_catalog.now() + pg_catalog.make_interval(hours => v_policy.resolution_hours));
  end if;
  return new;
end;
$$;
revoke all on function private.support_ticket_before_insert() from public, anon, authenticated;
drop trigger if exists support_tickets_sla_defaults on public.support_tickets;
create trigger support_tickets_sla_defaults before insert on public.support_tickets
for each row execute function private.support_ticket_before_insert();

create or replace function private.support_ticket_after_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.notify_support_participant(new.requester_id, 'support_case_opened', new.id, 'opened');
  return null;
end;
$$;
revoke all on function private.support_ticket_after_insert() from public, anon, authenticated;
drop trigger if exists support_tickets_opened_notify on public.support_tickets;
create trigger support_tickets_opened_notify after insert on public.support_tickets
for each row execute function private.support_ticket_after_insert();

create or replace function private.support_ticket_after_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('resolved','closed') then
      perform private.notify_support_participant(new.requester_id,
        case when new.status = 'resolved' then 'support_case_resolved' else 'support_case_resolved' end,
        new.id, new.status || ':' || new.updated_at::text);
      -- The survey is offered once the case reaches a terminal state and only
      -- if the requester has not already answered it.
      if new.satisfaction_submitted_at is null then
        perform private.notify_support_participant(new.requester_id,
          'support_survey_available', new.id, 'survey');
      end if;
    elsif new.status = 'open' and old.status in ('resolved','closed') then
      perform private.notify_support_participant(new.requester_id,
        'support_case_reopened', new.id, 'reopened:' || new.reopened_count::text);
    end if;
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    perform private.notify_support_participant(new.requester_id,
      'support_case_assigned', new.id, 'assigned:' || new.assigned_to::text);
    perform private.notify_staff(new.assigned_to, 'staff_support_case_assigned',
      pg_catalog.jsonb_build_object('case_id', new.id),
      'staff_support_case_assigned:' || new.id::text);
  end if;
  return null;
end;
$$;
revoke all on function private.support_ticket_after_update() from public, anon, authenticated;
drop trigger if exists support_tickets_lifecycle_notify on public.support_tickets;
create trigger support_tickets_lifecycle_notify after update on public.support_tickets
for each row execute function private.support_ticket_after_update();

-- First response is stamped from the message stream itself, so it is impossible
-- for a staff reply to be sent without the clock stopping.
create or replace function private.support_message_after_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_ticket public.support_tickets%rowtype; v_is_staff boolean;
begin
  select * into v_ticket from public.support_tickets t where t.id = new.ticket_id;
  if v_ticket.id is null then return null; end if;
  v_is_staff := new.sender_id is distinct from v_ticket.requester_id;

  if v_is_staff and new.visibility = 'participants' then
    if v_ticket.first_response_at is null then
      update public.support_tickets set first_response_at = pg_catalog.now()
      where id = new.ticket_id and first_response_at is null;
    end if;
    perform private.notify_support_participant(v_ticket.requester_id,
      'support_case_replied', new.ticket_id, 'reply:' || new.id::text);
  elsif not v_is_staff and v_ticket.assigned_to is not null then
    perform private.notify_staff(v_ticket.assigned_to,
      case when v_ticket.requester_mode = 'worker'
        then 'staff_support_worker_reply' else 'staff_support_customer_reply' end,
      pg_catalog.jsonb_build_object('case_id', new.ticket_id),
      'staff_support_reply:' || new.id::text);
  end if;
  return null;
end;
$$;
revoke all on function private.support_message_after_insert() from public, anon, authenticated;
drop trigger if exists support_messages_lifecycle on public.support_messages;
create trigger support_messages_lifecycle after insert on public.support_messages
for each row execute function private.support_message_after_insert();

-- ---------------------------------------------------------------------------
-- 8. Storage
-- ---------------------------------------------------------------------------
--
-- Private bucket, server-validated. The three-part WPS-013 pattern is reused:
-- a path-binding INSERT policy, a registration RPC that re-reads the object
-- server-side, and a SELECT policy that only exposes a REGISTERED object.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-attachments','support-attachments',false,8388608,
       array['image/jpeg','image/png','image/heic','application/pdf']::text[])
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_attachment_upload on storage.objects;
create policy support_attachment_upload on storage.objects for insert to authenticated with check(
  bucket_id = 'support-attachments'
  and exists(
    select 1 from public.support_tickets t
    where t.id::text = (storage.foldername(name))[2]
      and t.requester_id = (select auth.uid())
      and t.status <> 'closed'
      and name ~ ('^' || (select auth.uid())::text || '/' || t.id::text
                  || '/[A-Za-z0-9-]{12,100}\.(jpg|jpeg|png|heic|pdf)$')
      and name !~ '(\.\.|//|\\)')
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/heic','application/pdf')
  and nullif(metadata->>'size','')::bigint between 1 and 8388608
);

drop policy if exists support_attachment_read on storage.objects;
create policy support_attachment_read on storage.objects for select to authenticated using(
  bucket_id = 'support-attachments' and private.can_read_support_attachment(name)
);

-- An upload that never completed registration is the uploader's to remove. A
-- registered one is evidence and is not deletable from the client.
drop policy if exists support_attachment_orphan_delete on storage.objects;
create policy support_attachment_orphan_delete on storage.objects for delete to authenticated using(
  bucket_id = 'support-attachments'
  and owner_id = (select auth.uid())::text
  and not private.support_attachment_registered(name)
);

-- ---------------------------------------------------------------------------
-- 9. Knowledge base read API
-- ---------------------------------------------------------------------------
--
-- Read is open to any authenticated account. A draft or archived article is
-- never returned to a non-staff caller, in any function, in any locale.

create or replace function private.help_locale(p_locale text)
returns text language sql immutable set search_path='' as $$
  select case when p_locale = 'ar' then 'ar' else 'en' end
$$;
revoke all on function private.help_locale(text) from public, anon, authenticated;

create or replace function private.help_can_author()
returns boolean language sql stable security definer set search_path='' as $$
  select private.staff_has_capability('manage_support_cases')
$$;
revoke all on function private.help_can_author() from public, anon, authenticated;
grant execute on function private.help_can_author() to authenticated;

create or replace function public.get_help_center(p_locale text default 'en', p_surface text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return pg_catalog.jsonb_build_object(
    'locale', v_locale,
    'surface', p_surface,
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'categoryKey', c.category_key,
        'title', case when v_locale = 'ar' then c.title_ar else c.title_en end,
        'summary', case when v_locale = 'ar' then c.summary_ar else c.summary_en end,
        'icon', c.icon, 'audience', c.audience, 'surfaces', pg_catalog.to_jsonb(c.surfaces),
        'articleCount', (select pg_catalog.count(*)::integer from public.help_articles a
                         where a.category_key = c.category_key and a.status = 'published')
      ) order by c.sort_order, c.category_key)
      from public.help_categories c where c.published), '[]'::jsonb),
    -- Context-aware suggestions: when support is opened from a surface, that
    -- surface's articles come first. This is an ordering rule over authored
    -- metadata, not a recommendation model.
    'suggested', coalesce((
      select pg_catalog.jsonb_agg(item order by ordinal, sort_order, slug)
      from (
        select pg_catalog.jsonb_build_object(
                 'slug', a.slug, 'categoryKey', a.category_key,
                 'title', tr.title, 'summary', tr.summary) item,
               case when p_surface is not null and a.surfaces @> array[p_surface] then 0 else 1 end ordinal,
               a.sort_order, a.slug
        from public.help_articles a
        join public.help_article_translations tr
          on tr.article_id = a.id and tr.locale = v_locale
        where a.status = 'published'
          and (p_surface is null or a.surfaces @> array[p_surface])
        limit 8) ranked), '[]'::jsonb),
    'popular', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug', a.slug, 'categoryKey', a.category_key,
        'title', tr.title, 'summary', tr.summary, 'viewCount', a.view_count)
        order by a.view_count desc, a.sort_order, a.slug)
      from public.help_articles a
      join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
      where a.status = 'published' and a.view_count > 0
      limit 5), '[]'::jsonb),
    'generatedAt', pg_catalog.now());
end;
$$;

create or replace function public.get_help_category(p_category_key text, p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
  v_category public.help_categories%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_category from public.help_categories c
  where c.category_key = p_category_key and c.published;
  if v_category.category_key is null then
    raise exception 'Help category not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'categoryKey', v_category.category_key,
    'title', case when v_locale = 'ar' then v_category.title_ar else v_category.title_en end,
    'summary', case when v_locale = 'ar' then v_category.summary_ar else v_category.summary_en end,
    'icon', v_category.icon, 'audience', v_category.audience,
    'articles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug', a.slug, 'title', tr.title, 'summary', tr.summary,
        'tags', pg_catalog.to_jsonb(a.tags), 'audience', a.audience)
        order by a.sort_order, a.slug)
      from public.help_articles a
      join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
      where a.category_key = v_category.category_key and a.status = 'published'), '[]'::jsonb));
end;
$$;

create or replace function public.get_help_article(p_slug text, p_locale text default 'en')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
  v_article public.help_articles%rowtype; v_translation public.help_article_translations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_article from public.help_articles a where a.slug = p_slug;
  if v_article.id is null or (v_article.status <> 'published' and not private.help_can_author()) then
    raise exception 'Help article not found' using errcode = 'P0002';
  end if;
  select * into v_translation from public.help_article_translations tr
  where tr.article_id = v_article.id and tr.locale = v_locale;
  -- A missing translation falls back to English rather than showing nothing.
  if v_translation.article_id is null then
    select * into v_translation from public.help_article_translations tr
    where tr.article_id = v_article.id and tr.locale = 'en';
    v_locale := 'en';
  end if;
  if v_translation.article_id is null then
    raise exception 'Help article not found' using errcode = 'P0002';
  end if;

  update public.help_articles set view_count = view_count + 1 where id = v_article.id;

  return pg_catalog.jsonb_build_object(
    'slug', v_article.slug, 'categoryKey', v_article.category_key,
    'status', v_article.status, 'locale', v_locale, 'version', v_article.version,
    'title', v_translation.title, 'summary', v_translation.summary, 'body', v_translation.body,
    'tags', pg_catalog.to_jsonb(v_article.tags), 'audience', v_article.audience,
    'updatedAt', v_translation.updated_at,
    'helpfulCount', v_article.helpful_count, 'notHelpfulCount', v_article.not_helpful_count,
    'myFeedback', (select f.helpful from public.help_article_feedback f
                   where f.article_id = v_article.id and f.user_id = v_uid),
    'related', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug', r.slug, 'title', rt.title, 'summary', rt.summary) order by r.sort_order, r.slug)
      from public.help_articles r
      join public.help_article_translations rt on rt.article_id = r.id and rt.locale = v_locale
      where r.status = 'published'
        and (r.slug = any(v_article.related_slugs)
             or (pg_catalog.array_length(v_article.related_slugs,1) is null
                 and r.category_key = v_article.category_key and r.id <> v_article.id))
      limit 4), '[]'::jsonb));
end;
$$;

create or replace function public.submit_help_article_feedback(
  p_slug text, p_helpful boolean, p_locale text default 'en')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_article public.help_articles%rowtype;
  v_existing boolean; v_locale text := private.help_locale(p_locale);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_helpful is null then raise exception 'Feedback is required' using errcode = '22023'; end if;
  perform private.enforce_rate_limit('support_article_feedback');
  select * into v_article from public.help_articles a where a.slug = p_slug and a.status = 'published';
  if v_article.id is null then raise exception 'Help article not found' using errcode = 'P0002'; end if;

  select f.helpful into v_existing from public.help_article_feedback f
  where f.article_id = v_article.id and f.user_id = v_uid;
  if v_existing is not null and v_existing = p_helpful then
    return pg_catalog.jsonb_build_object('slug', p_slug, 'helpful', p_helpful, 'duplicate', true);
  end if;

  insert into public.help_article_feedback(article_id, user_id, locale, helpful)
  values (v_article.id, v_uid, v_locale, p_helpful)
  on conflict (article_id, user_id) do update set helpful = excluded.helpful, created_at = pg_catalog.now();

  update public.help_articles set
    helpful_count = (select pg_catalog.count(*)::integer from public.help_article_feedback f
                     where f.article_id = v_article.id and f.helpful),
    not_helpful_count = (select pg_catalog.count(*)::integer from public.help_article_feedback f
                         where f.article_id = v_article.id and not f.helpful),
    updated_at = pg_catalog.now()
  where id = v_article.id;

  return pg_catalog.jsonb_build_object('slug', p_slug, 'helpful', p_helpful, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Search
-- ---------------------------------------------------------------------------

create or replace function private.help_normalize_query(p_query text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.left(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p_query,'')), '\s+', ' ', 'g')),
    100)
$$;
revoke all on function private.help_normalize_query(text) from public, anon, authenticated;

create or replace function public.search_help_articles(
  p_query text, p_locale text default 'en', p_surface text default null, p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
  v_query text := private.help_normalize_query(p_query); v_limit integer := least(greatest(coalesce(p_limit,10),1),25);
  v_tsquery tsquery; v_results jsonb; v_count integer; v_mode text := 'exact';
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if pg_catalog.length(v_query) < 2 then
    return pg_catalog.jsonb_build_object('query', v_query, 'locale', v_locale,
      'mode','too_short','results','[]'::jsonb,'resultCount',0);
  end if;
  perform private.enforce_rate_limit('support_help_search');

  begin
    v_tsquery := pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, v_query);
  exception when others then
    v_tsquery := null;
  end;

  if v_tsquery is not null then
    select coalesce(pg_catalog.jsonb_agg(item order by rank desc, sort_order, slug), '[]'::jsonb)
    into v_results
    from (
      select pg_catalog.jsonb_build_object(
               'slug', a.slug, 'categoryKey', a.category_key, 'title', tr.title,
               'summary', tr.summary, 'tags', pg_catalog.to_jsonb(a.tags),
               'match','exact') item,
             pg_catalog.ts_rank_cd(tr.search_vector, v_tsquery)
               + case when p_surface is not null and a.surfaces @> array[p_surface] then 0.5 else 0 end
               + case when a.tags @> array[v_query] then 0.5 else 0 end rank,
             a.sort_order, a.slug
      from public.help_articles a
      join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
      where a.status = 'published' and tr.search_vector @@ v_tsquery
      limit v_limit) ranked;
  else
    v_results := '[]'::jsonb;
  end if;

  v_count := pg_catalog.jsonb_array_length(v_results);

  -- Bounded spelling tolerance. It runs only when the exact search found
  -- nothing, so a correctly spelled query never has its results diluted.
  --
  -- `word_similarity` rather than `similarity`: the question is whether the
  -- query approximately matches a WORD in the title, not whether it resembles
  -- the whole title. Comparing whole strings scores a short query against a
  -- long title so low that a real typo never matches.
  if v_count = 0 then
    v_mode := 'approximate';
    select coalesce(pg_catalog.jsonb_agg(item order by score desc, sort_order, slug), '[]'::jsonb)
    into v_results
    from (
      select pg_catalog.jsonb_build_object(
               'slug', a.slug, 'categoryKey', a.category_key, 'title', tr.title,
               'summary', tr.summary, 'tags', pg_catalog.to_jsonb(a.tags),
               'match','approximate') item,
             greatest(
               extensions.word_similarity(v_query, pg_catalog.lower(tr.title)),
               extensions.word_similarity(v_query, pg_catalog.lower(tr.summary)),
               extensions.word_similarity(v_query, pg_catalog.array_to_string(a.tags,' '))) score,
             a.sort_order, a.slug
      from public.help_articles a
      join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
      where a.status = 'published'
        and greatest(
              extensions.word_similarity(v_query, pg_catalog.lower(tr.title)),
              extensions.word_similarity(v_query, pg_catalog.lower(tr.summary)),
              extensions.word_similarity(v_query, pg_catalog.array_to_string(a.tags,' '))) > 0.5
      limit v_limit) approx;
    v_count := pg_catalog.jsonb_array_length(v_results);
    if v_count = 0 then v_mode := 'empty'; end if;
  end if;

  insert into private.help_search_log(user_id, locale, query_normalized, surface, result_count)
  values (v_uid, v_locale, v_query, p_surface, v_count);

  return pg_catalog.jsonb_build_object(
    'query', v_query, 'locale', v_locale, 'mode', v_mode,
    'results', v_results, 'resultCount', v_count);
end;
$$;

-- Recent searches are the caller's own. Popular searches are suppressed below
-- five distinct accounts, so one person's query can never become everyone's
-- suggestion — the same minimum-cell rule WPS-017 applies to analytics.
create or replace function public.get_help_search_suggestions(p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return pg_catalog.jsonb_build_object(
    'locale', v_locale,
    'recent', coalesce((
      select pg_catalog.jsonb_agg(q order by last_at desc)
      from (
        select l.query_normalized q, pg_catalog.max(l.created_at) last_at
        from private.help_search_log l
        where l.user_id = v_uid and l.locale = v_locale
          and l.created_at > pg_catalog.now() - pg_catalog.make_interval(days => 30)
        group by l.query_normalized
        order by pg_catalog.max(l.created_at) desc
        limit 8) recent), '[]'::jsonb),
    'popular', coalesce((
      select pg_catalog.jsonb_agg(q order by uses desc, q)
      from (
        select l.query_normalized q, pg_catalog.count(distinct l.user_id)::integer uses
        from private.help_search_log l
        where l.locale = v_locale
          and l.created_at > pg_catalog.now() - pg_catalog.make_interval(days => 30)
        group by l.query_normalized
        having pg_catalog.count(distinct l.user_id) >= 5
        order by pg_catalog.count(distinct l.user_id) desc
        limit 6) popular), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Support case API — customer and worker
-- ---------------------------------------------------------------------------
--
-- The four-argument public.open_support_case is the WPS-018 rate-limiting
-- wrapper and is NOT modified. This eight-argument overload adds the WPS-019
-- context and delegates the case creation itself to the same preserved
-- implementation, so there is exactly one intake path.
--
-- The overload declares NO default values. That keeps the four-argument call
-- unambiguous for every existing caller and for every existing test.

create or replace function private.support_linked_record_visible(p_type text, p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid());
begin
  if p_type is null or p_id is null then return true; end if;
  if v_uid is null then return false; end if;
  return case p_type
    when 'booking' then exists(
      select 1 from public.bookings b left join public.provider_profiles p on p.id = b.provider_id
      where b.id = p_id and (b.customer_id = v_uid or p.user_id = v_uid))
    when 'conversation' then exists(
      select 1 from public.bookings b left join public.provider_profiles p on p.id = b.provider_id
      where b.id = p_id and (b.customer_id = v_uid or p.user_id = v_uid))
    when 'payment' then exists(
      select 1 from public.payments pay join public.bookings b on b.id = pay.booking_id
      left join public.provider_profiles p on p.id = b.provider_id
      where pay.id = p_id and (b.customer_id = v_uid or p.user_id = v_uid))
    when 'dispute' then exists(
      select 1 from public.disputes d join public.bookings b on b.id = d.booking_id
      left join public.provider_profiles p on p.id = b.provider_id
      where d.id = p_id and (b.customer_id = v_uid or p.user_id = v_uid))
    when 'review' then exists(
      select 1 from public.reviews r left join public.provider_profiles p on p.id = r.provider_id
      where r.id = p_id and (r.customer_id = v_uid or p.user_id = v_uid))
    when 'marketplace_request' then exists(
      select 1 from public.marketplace_requests r where r.id = p_id and r.customer_id = v_uid)
    when 'verification' then exists(
      select 1 from public.provider_profiles p where p.id = p_id and p.user_id = v_uid)
    when 'provider_profile' then exists(
      select 1 from public.provider_profiles p where p.id = p_id and p.user_id = v_uid)
    when 'withdrawal' then exists(
      select 1 from public.provider_withdrawal_requests w
      join public.provider_profiles p on p.id = w.provider_id
      where w.id = p_id and p.user_id = v_uid)
    else false end;
end;
$$;
revoke all on function private.support_linked_record_visible(text,uuid) from public, anon, authenticated;

create or replace function public.open_support_case(
  p_category text, p_subject text, p_body text, p_idempotency_key text,
  p_linked_type text, p_linked_id uuid, p_origin_surface text, p_locale text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb; v_case_id uuid;
  v_surface text := coalesce(nullif(pg_catalog.btrim(coalesce(p_origin_surface,'')),''), 'help_center');
  v_locale text := private.help_locale(p_locale);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if p_linked_type is not null and not private.support_linked_record_visible(p_linked_type, p_linked_id) then
    raise exception 'Linked record not found' using errcode = '42501';
  end if;
  if v_surface not in ('help_center','booking','payment','verification','portfolio','notification',
    'review','dispute','marketplace','chat','settings','account','onboarding','earnings','other') then
    raise exception 'Invalid support surface' using errcode = '22023';
  end if;

  -- Same limiter policy and same preserved WPS-017 body as the four-argument
  -- wrapper. There is no second intake and no duplicated validation.
  perform private.enforce_rate_limit('support_case_open');
  v_result := private.open_support_case_impl(p_category, p_subject, p_body, p_idempotency_key);
  v_case_id := (v_result->>'caseId')::uuid;

  if not coalesce((v_result->>'duplicate')::boolean, false) then
    update public.support_tickets set
      linked_type = p_linked_type,
      linked_id = case when p_linked_type is null then null else p_linked_id end,
      origin_surface = v_surface,
      locale = v_locale,
      requester_mode = private.support_requester_mode(p_category, v_surface),
      updated_at = pg_catalog.now()
    where id = v_case_id and requester_id = v_uid;
  end if;

  return v_result || pg_catalog.jsonb_build_object('originSurface', v_surface, 'locale', v_locale);
end;
$$;

create or replace function public.get_my_support_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id and t.requester_id = v_uid;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  return pg_catalog.jsonb_build_object(
    'caseId', v_ticket.id, 'subject', v_ticket.subject, 'category', v_ticket.category,
    'status', v_ticket.status, 'priority', v_ticket.priority, 'locale', v_ticket.locale,
    'originSurface', v_ticket.origin_surface, 'linkedType', v_ticket.linked_type,
    'linkedId', v_ticket.linked_id, 'requesterMode', v_ticket.requester_mode,
    'createdAt', v_ticket.created_at, 'lastReplyAt', v_ticket.last_reply_at,
    'resolvedAt', v_ticket.resolved_at, 'closedAt', v_ticket.closed_at,
    'reopenedCount', v_ticket.reopened_count,
    -- Reopen rules are stated by the server so the client never invents them.
    'canReply', v_ticket.status <> 'closed',
    'canReopen', v_ticket.status = 'resolved' and v_ticket.reopened_count < 3
      and v_ticket.resolved_at is not null
      and v_ticket.resolved_at > pg_catalog.now() - pg_catalog.make_interval(days => 14),
    'canAttach', v_ticket.status <> 'closed' and v_ticket.attachment_count < 10,
    'surveyAvailable', v_ticket.status in ('resolved','closed') and v_ticket.satisfaction_submitted_at is null,
    'satisfactionScore', v_ticket.satisfaction_score,
    'messages', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', m.id, 'body', m.body, 'fromMe', m.sender_id = v_uid,
        'attachmentId', m.attachment_id, 'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
      from public.support_messages m
      where m.ticket_id = p_case_id and m.visibility = 'participants'),
    'attachments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'storagePath', a.storage_path, 'fileName', a.file_name,
        'mimeType', a.mime_type, 'byteSize', a.byte_size, 'createdAt', a.created_at)
        order by a.created_at), '[]'::jsonb)
      from public.support_ticket_attachments a where a.ticket_id = p_case_id),
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'toStatus', e.to_status,
        'actorRole', e.actor_role, 'createdAt', e.created_at) order by e.created_at), '[]'::jsonb)
      from public.support_ticket_events e where e.ticket_id = p_case_id));
end;
$$;

create or replace function public.reopen_support_case(
  p_case_id uuid, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 3 and 2000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid reopen request' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('support_case_reopen');

  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;

  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;

  -- A closed case is final. A resolved case reopens for fourteen days, at most
  -- three times; after that the requester opens a new case that carries a
  -- pointer to this one.
  if v_ticket.status <> 'resolved' then
    raise exception 'Only a resolved support case can be reopened' using errcode = '22023';
  end if;
  if v_ticket.reopened_count >= 3 then
    raise exception 'This support case cannot be reopened again' using errcode = '22023';
  end if;
  if v_ticket.resolved_at is null
     or v_ticket.resolved_at <= pg_catalog.now() - pg_catalog.make_interval(days => 14) then
    raise exception 'The reopen window for this support case has passed' using errcode = '22023';
  end if;

  update public.support_tickets set
    status = 'open', reopened_count = reopened_count + 1, resolved_at = null,
    resolution_reason = null, last_reply_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_uid, pg_catalog.btrim(p_reason), 'participants', p_idempotency_key);

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, 'open', 'status_changed', v_uid, 'participant',
          'Reopened by the requester', p_idempotency_key);

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', 'open', 'duplicate', false);
end;
$$;

create or replace function public.submit_support_satisfaction(
  p_case_id uuid, p_score smallint, p_comment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
  v_comment text := nullif(pg_catalog.btrim(coalesce(p_comment,'')),'');
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_score is null or p_score not between 1 and 5 then
    raise exception 'A satisfaction score between 1 and 5 is required' using errcode = '22023';
  end if;
  if v_comment is not null and pg_catalog.length(v_comment) > 1000 then
    raise exception 'Comment is too long' using errcode = '22023';
  end if;
  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  if v_ticket.status not in ('resolved','closed') then
    raise exception 'The survey opens when the case is resolved' using errcode = '22023';
  end if;
  if v_ticket.satisfaction_submitted_at is not null then
    return pg_catalog.jsonb_build_object('caseId', p_case_id,
      'score', v_ticket.satisfaction_score, 'duplicate', true);
  end if;
  update public.support_tickets set
    satisfaction_score = p_score, satisfaction_comment = v_comment,
    satisfaction_submitted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;
  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'score', p_score, 'duplicate', false);
end;
$$;

-- The client's claim about its own upload is never trusted: the object is
-- re-read from storage.objects and its owner, type, size, and path are checked
-- on the server before a row exists.
create or replace function public.register_support_attachment(
  p_case_id uuid, p_storage_path text, p_file_name text, p_content_hash text, p_client_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
  v_object record; v_id uuid; v_name text := pg_catalog.btrim(coalesce(p_file_name,''));
  v_hash text := pg_catalog.lower(coalesce(p_content_hash,''));
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if pg_catalog.length(v_name) not between 1 and 120
     or pg_catalog.strpos(v_name,'/') > 0 or pg_catalog.strpos(v_name, pg_catalog.chr(92)) > 0
     or v_name ~ '[[:cntrl:]]'
     or v_hash !~ '^[a-f0-9]{32,64}$'
     or pg_catalog.length(coalesce(p_client_id,'')) not between 8 and 200 then
    raise exception 'Invalid support attachment' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('support_attachment_register');

  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;
  if v_ticket.attachment_count >= 10 then
    raise exception 'Support attachment limit reached' using errcode = '22023';
  end if;

  -- Idempotent retry: the same client id returns the same row rather than
  -- creating a second attachment after a dropped connection.
  select a.id into v_id from public.support_ticket_attachments a
  where a.ticket_id = p_case_id and a.uploader_id = v_uid and a.client_id = p_client_id;
  if v_id is not null then return v_id; end if;

  select o.metadata->>'mimetype' mime_type,
         nullif(o.metadata->>'size','')::bigint byte_size,
         o.owner_id
  into v_object
  from storage.objects o
  where o.bucket_id = 'support-attachments' and o.name = p_storage_path;

  if not found or v_object.owner_id <> v_uid::text
     or v_object.mime_type not in ('image/jpeg','image/png','image/heic','application/pdf')
     or v_object.byte_size is null or v_object.byte_size not between 1 and 8388608
     or p_storage_path !~ ('^' || v_uid::text || '/' || p_case_id::text || '/[A-Za-z0-9-]{12,100}\.(jpg|jpeg|png|heic|pdf)$')
     or p_storage_path ~ '(\.\.|//|\\)' then
    raise exception 'Invalid support attachment' using errcode = '22023';
  end if;

  if exists(select 1 from public.support_ticket_attachments a
            where a.ticket_id = p_case_id and a.content_hash = v_hash) then
    raise exception 'This file is already attached to the case' using errcode = '23505';
  end if;

  insert into public.support_ticket_attachments(
    ticket_id, uploader_id, storage_path, file_name, mime_type, byte_size, content_hash, client_id)
  values (p_case_id, v_uid, p_storage_path, v_name, v_object.mime_type, v_object.byte_size, v_hash, p_client_id)
  returning id into v_id;

  update public.support_tickets set
    attachment_count = attachment_count + 1, updated_at = pg_catalog.now()
  where id = p_case_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Support case API — staff
-- ---------------------------------------------------------------------------
--
-- Every staff function below requires the EXISTING `manage_support_cases`
-- capability through the EXISTING WPS-018 gate. WPS-019 introduces no staff
-- role, no capability, and no bypass.

create or replace function public.get_staff_support_queue(
  p_status text default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  return pg_catalog.jsonb_build_object(
    'generatedAt', pg_catalog.now(),
    'counts', pg_catalog.jsonb_build_object(
      'open', (select pg_catalog.count(*)::integer from public.support_tickets t where t.status = 'open'),
      'inProgress', (select pg_catalog.count(*)::integer from public.support_tickets t where t.status = 'in_progress'),
      'waitingParticipant', (select pg_catalog.count(*)::integer from public.support_tickets t where t.status = 'waiting_participant'),
      'escalated', (select pg_catalog.count(*)::integer from public.support_tickets t where t.status = 'escalated'),
      'mine', (select pg_catalog.count(*)::integer from public.support_tickets t
               where t.assigned_to = v_actor and t.status in ('open','in_progress','waiting_participant','escalated')),
      'breachedFirstResponse', (select pg_catalog.count(*)::integer from public.support_tickets t
               where t.first_response_at is null and t.first_response_due_at < pg_catalog.now()
                 and t.status in ('open','in_progress'))),
    'cases', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'caseId', t.id, 'subject', t.subject, 'category', t.category, 'status', t.status,
        'priority', t.priority, 'requesterMode', t.requester_mode, 'locale', t.locale,
        'originSurface', t.origin_surface, 'linkedType', t.linked_type, 'linkedId', t.linked_id,
        'assignedTo', t.assigned_to, 'createdAt', t.created_at, 'lastReplyAt', t.last_reply_at,
        'firstResponseDueAt', t.first_response_due_at, 'firstResponseAt', t.first_response_at,
        'resolutionDueAt', t.resolution_due_at, 'attachmentCount', t.attachment_count,
        'reopenedCount', t.reopened_count,
        'firstResponseBreached', t.first_response_at is null and t.first_response_due_at < pg_catalog.now(),
        'mergedIntoId', t.merged_into_id)
        order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                 t.first_response_due_at nulls last, t.created_at)
      from public.support_tickets t
      where t.merged_into_id is null
        and (p_status is null or t.status = p_status)
        and (p_status is not null or t.status in ('open','in_progress','waiting_participant','escalated'))
      limit v_limit), '[]'::jsonb));
end;
$$;

create or replace function public.staff_assign_support_case(
  p_case_id uuid, p_assignee uuid, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_ticket public.support_tickets%rowtype; v_target uuid;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid assignment' using errcode = '22023';
  end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  v_target := coalesce(p_assignee, v_actor);

  -- An assignee must actually be able to work the case; assignment can never
  -- grant access it does not already have.
  if not exists(select 1 from public.staff_role_grants g
                where g.user_id = v_target and g.revoked_at is null)
     or not ('manage_support_cases' = any(private.staff_capability_keys(v_target))) then
    raise exception 'The assignee cannot work support cases' using errcode = '42501';
  end if;

  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'assignedTo', v_ticket.assigned_to, 'duplicate', true);
  end if;

  update public.support_tickets set
    assigned_to = v_target,
    status = case when status = 'open' then 'in_progress' else status end,
    updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status,
          case when v_ticket.status = 'open' then 'in_progress' else v_ticket.status end,
          'assigned', v_actor, 'staff',
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_assigned',
    'support_case', p_case_id, 'Support case assigned');

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'assignedTo', v_target, 'duplicate', false);
end;
$$;

-- Merging never deletes anything. The duplicate is closed, keeps its own
-- immutable history, and gains a pointer to the surviving case.
create or replace function public.staff_merge_support_cases(
  p_source_case_id uuid, p_target_case_id uuid, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_source public.support_tickets%rowtype; v_target public.support_tickets%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_source_case_id = p_target_case_id then
    raise exception 'A support case cannot be merged into itself' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.length(v_reason) > 1000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'A merge reason is required' using errcode = '22023';
  end if;

  select * into v_source from public.support_tickets t where t.id = p_source_case_id for update;
  select * into v_target from public.support_tickets t where t.id = p_target_case_id for update;
  if v_source.id is null or v_target.id is null then
    raise exception 'Support case not found' using errcode = 'P0002';
  end if;
  if v_source.requester_id <> v_target.requester_id then
    raise exception 'Only cases from the same requester can be merged' using errcode = '22023';
  end if;
  if v_source.merged_into_id is not null then
    return pg_catalog.jsonb_build_object('sourceCaseId', p_source_case_id,
      'targetCaseId', v_source.merged_into_id, 'duplicate', true);
  end if;
  if v_target.merged_into_id is not null then
    raise exception 'The target case is itself merged' using errcode = '22023';
  end if;

  update public.support_tickets set
    merged_into_id = p_target_case_id, status = 'closed', closed_at = pg_catalog.now(),
    resolution_reason = 'duplicate', updated_at = pg_catalog.now()
  where id = p_source_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_source_case_id, v_source.status, 'closed', 'closed', v_actor, 'staff',
          'Merged: ' || v_reason, p_idempotency_key);
  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_target_case_id, v_target.status, v_target.status, 'note_added', v_actor, 'staff',
          'Merged in case ' || p_source_case_id::text, p_idempotency_key || ':target');

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_merged',
    'support_case', p_source_case_id, 'Merged into ' || p_target_case_id::text);

  return pg_catalog.jsonb_build_object('sourceCaseId', p_source_case_id,
    'targetCaseId', p_target_case_id, 'duplicate', false);
end;
$$;

create or replace function public.staff_resolve_support_case(
  p_case_id uuid, p_resolution_reason text, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
  v_reason private.support_resolution_reasons%rowtype;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;
  select * into v_reason from private.support_resolution_reasons r
  where r.reason_key = p_resolution_reason and r.active;
  if v_reason.reason_key is null then
    raise exception 'Invalid resolution reason' using errcode = '22023';
  end if;
  if v_reason.requires_note and v_note is null then
    raise exception 'This resolution reason requires a note' using errcode = '22023';
  end if;

  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;

  update public.support_tickets set
    status = 'resolved', resolution_reason = p_resolution_reason,
    resolved_at = pg_catalog.now(), assigned_to = coalesce(assigned_to, v_actor),
    updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, 'resolved', 'resolved', v_actor, 'staff',
          coalesce(v_note, v_reason.label_en), p_idempotency_key);

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_resolved',
    'support_case', p_case_id, 'Resolved: ' || p_resolution_reason);

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', 'resolved', 'duplicate', false);
end;
$$;

create or replace function public.get_staff_support_toolkit(p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_locale text := private.help_locale(p_locale);
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  return pg_catalog.jsonb_build_object(
    'macros', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'macroKey', m.macro_key, 'category', m.category, 'locale', m.locale,
        'title', m.title, 'body', m.body, 'suggestedResolution', m.suggested_resolution)
        order by m.sort_order, m.macro_key)
      from private.support_macros m where m.active and m.locale = v_locale), '[]'::jsonb),
    'resolutionReasons', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reasonKey', r.reason_key,
        'label', case when v_locale = 'ar' then r.label_ar else r.label_en end,
        'requiresNote', r.requires_note) order by r.sort_order, r.reason_key)
      from private.support_resolution_reasons r where r.active), '[]'::jsonb),
    'slaPolicy', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'priority', s.priority, 'firstResponseHours', s.first_response_hours,
        'resolutionHours', s.resolution_hours) order by s.first_response_hours)
      from private.support_sla_policy s), '[]'::jsonb));
end;
$$;

-- Analytics reuses the WPS-017 minimum-cell rule: a bucket below five cases is
-- suppressed rather than reported, so an individual case is never identifiable
-- from an aggregate.
create or replace function public.get_staff_support_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_days integer := least(greatest(coalesce(p_days,30),1),365); v_from timestamptz;
begin
  v_actor := private.require_staff_capability('view_analytics');
  v_from := pg_catalog.now() - pg_catalog.make_interval(days => v_days);
  return pg_catalog.jsonb_build_object(
    'windowDays', v_days,
    'minimumCell', 5,
    'totals', pg_catalog.jsonb_build_object(
      'opened', (select pg_catalog.count(*)::integer from public.support_tickets t where t.created_at >= v_from),
      'resolved', (select pg_catalog.count(*)::integer from public.support_tickets t
                   where t.resolved_at >= v_from),
      'reopened', (select coalesce(pg_catalog.sum(t.reopened_count),0)::integer
                   from public.support_tickets t where t.created_at >= v_from),
      'merged', (select pg_catalog.count(*)::integer from public.support_tickets t
                 where t.merged_into_id is not null and t.updated_at >= v_from)),
    'byCategory', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('category', category, 'cases', cases)
        order by cases desc, category)
      from (
        select t.category, pg_catalog.count(*)::integer cases
        from public.support_tickets t where t.created_at >= v_from
        group by t.category having pg_catalog.count(*) >= 5) grouped), '[]'::jsonb),
    'satisfaction', pg_catalog.jsonb_build_object(
      'responses', (select pg_catalog.count(*)::integer from public.support_tickets t
                    where t.satisfaction_submitted_at >= v_from),
      'averageScore', (select case when pg_catalog.count(*) >= 5
                         then pg_catalog.round(pg_catalog.avg(t.satisfaction_score), 2) end
                       from public.support_tickets t where t.satisfaction_submitted_at >= v_from)),
    'firstResponse', pg_catalog.jsonb_build_object(
      'answered', (select pg_catalog.count(*)::integer from public.support_tickets t
                   where t.first_response_at >= v_from),
      'breached', (select pg_catalog.count(*)::integer from public.support_tickets t
                   where t.created_at >= v_from and t.first_response_at is null
                     and t.first_response_due_at < pg_catalog.now())),
    'knowledgeBase', pg_catalog.jsonb_build_object(
      'publishedArticles', (select pg_catalog.count(*)::integer from public.help_articles a where a.status = 'published'),
      'searchesWithNoResult', (select pg_catalog.count(*)::integer from private.help_search_log l
                               where l.created_at >= v_from and l.result_count = 0)),
    'generatedAt', pg_catalog.now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Knowledge base authoring (staff)
-- ---------------------------------------------------------------------------

create or replace function public.staff_upsert_help_article(
  p_slug text, p_category_key text, p_locale text, p_title text, p_summary text, p_body text,
  p_tags text[], p_surfaces text[], p_related_slugs text[], p_audience text, p_change_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_article public.help_articles%rowtype; v_locale text := private.help_locale(p_locale);
  v_new_version integer;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_slug !~ '^[a-z][a-z0-9-]{2,80}$' then
    raise exception 'Invalid article slug' using errcode = '22023';
  end if;
  if not exists(select 1 from public.help_categories c where c.category_key = p_category_key) then
    raise exception 'Help category not found' using errcode = 'P0002';
  end if;
  if coalesce(p_audience,'all') not in ('customer','worker','all') then
    raise exception 'Invalid audience' using errcode = '22023';
  end if;

  select * into v_article from public.help_articles a where a.slug = p_slug for update;
  if v_article.id is null then
    insert into public.help_articles(
      slug, category_key, status, audience, surfaces, tags, related_slugs, created_by, updated_by)
    values (p_slug, p_category_key, 'draft', coalesce(p_audience,'all'),
            coalesce(p_surfaces,'{}'), coalesce(p_tags,'{}'), coalesce(p_related_slugs,'{}'),
            v_actor, v_actor)
    returning * into v_article;
    v_new_version := v_article.version;
  else
    v_new_version := v_article.version + 1;
    update public.help_articles set
      category_key = p_category_key, audience = coalesce(p_audience, audience),
      surfaces = coalesce(p_surfaces, surfaces), tags = coalesce(p_tags, tags),
      related_slugs = coalesce(p_related_slugs, related_slugs),
      version = v_new_version, updated_by = v_actor, updated_at = pg_catalog.now()
    where id = v_article.id
    returning * into v_article;
  end if;

  insert into public.help_article_translations(article_id, locale, title, summary, body, updated_at)
  values (v_article.id, v_locale, pg_catalog.btrim(p_title), pg_catalog.btrim(p_summary),
          pg_catalog.btrim(p_body), pg_catalog.now())
  on conflict (article_id, locale) do update set
    title = excluded.title, summary = excluded.summary, body = excluded.body,
    updated_at = pg_catalog.now();

  insert into public.help_article_versions(
    article_id, version, locale, status, title, summary, body, changed_by, change_note)
  values (v_article.id, v_new_version, v_locale, v_article.status,
          pg_catalog.btrim(p_title), pg_catalog.btrim(p_summary), pg_catalog.btrim(p_body),
          v_actor, nullif(pg_catalog.btrim(coalesce(p_change_note,'')),''))
  on conflict (article_id, version, locale) do nothing;

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'help_article_saved',
    'support_case', v_article.id, 'Saved help article ' || p_slug);

  return pg_catalog.jsonb_build_object('slug', p_slug, 'version', v_new_version,
    'status', v_article.status, 'locale', v_locale);
end;
$$;

create or replace function public.staff_set_help_article_status(
  p_slug text, p_status text, p_change_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_article public.help_articles%rowtype;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_status not in ('draft','published','archived') then
    raise exception 'Invalid article status' using errcode = '22023';
  end if;
  select * into v_article from public.help_articles a where a.slug = p_slug for update;
  if v_article.id is null then raise exception 'Help article not found' using errcode = 'P0002'; end if;
  -- An article cannot be published in a language nobody wrote.
  if p_status = 'published' and not exists(
    select 1 from public.help_article_translations tr where tr.article_id = v_article.id and tr.locale = 'en') then
    raise exception 'An English translation is required before publishing' using errcode = '22023';
  end if;

  update public.help_articles set
    status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, pg_catalog.now()) else published_at end,
    archived_at = case when p_status = 'archived' then pg_catalog.now() else archived_at end,
    updated_by = v_actor, updated_at = pg_catalog.now()
  where id = v_article.id;

  insert into public.help_article_versions(
    article_id, version, locale, status, title, summary, body, changed_by, change_note)
  select v_article.id, v_article.version, tr.locale, p_status, tr.title, tr.summary, tr.body,
         v_actor, nullif(pg_catalog.btrim(coalesce(p_change_note,'')),'')
  from public.help_article_translations tr where tr.article_id = v_article.id
  on conflict (article_id, version, locale) do nothing;

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'help_article_' || p_status,
    'support_case', v_article.id, 'Help article ' || p_slug || ' set to ' || p_status);

  return pg_catalog.jsonb_build_object('slug', p_slug, 'status', p_status);
end;
$$;

create or replace function public.get_staff_help_articles(p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_locale text := private.help_locale(p_locale);
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'slug', a.slug, 'categoryKey', a.category_key, 'status', a.status, 'version', a.version,
      'audience', a.audience, 'title', tr.title, 'viewCount', a.view_count,
      'helpfulCount', a.helpful_count, 'notHelpfulCount', a.not_helpful_count,
      'localesAvailable', (select coalesce(pg_catalog.jsonb_agg(t2.locale order by t2.locale), '[]'::jsonb)
                           from public.help_article_translations t2 where t2.article_id = a.id),
      'updatedAt', a.updated_at)
      order by a.category_key, a.sort_order, a.slug)
    from public.help_articles a
    left join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Row level security
-- ---------------------------------------------------------------------------

alter table public.help_categories enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_article_translations enable row level security;
alter table public.help_article_versions enable row level security;
alter table public.help_article_feedback enable row level security;
alter table public.support_ticket_attachments enable row level security;

drop policy if exists help_categories_read on public.help_categories;
create policy help_categories_read on public.help_categories for select to authenticated
  using (published or private.help_can_author());

drop policy if exists help_articles_read on public.help_articles;
create policy help_articles_read on public.help_articles for select to authenticated
  using (status = 'published' or private.help_can_author());

drop policy if exists help_article_translations_read on public.help_article_translations;
create policy help_article_translations_read on public.help_article_translations for select to authenticated
  using (exists(select 1 from public.help_articles a
                where a.id = help_article_translations.article_id
                  and (a.status = 'published' or private.help_can_author())));

drop policy if exists help_article_versions_read on public.help_article_versions;
create policy help_article_versions_read on public.help_article_versions for select to authenticated
  using (private.help_can_author());

drop policy if exists help_article_feedback_read on public.help_article_feedback;
create policy help_article_feedback_read on public.help_article_feedback for select to authenticated
  using (user_id = (select auth.uid()) or private.help_can_author());

drop policy if exists support_ticket_attachments_read on public.support_ticket_attachments;
create policy support_ticket_attachments_read on public.support_ticket_attachments for select to authenticated
  using (private.support_case_visible(ticket_id));

-- ---------------------------------------------------------------------------
-- 15. Grants
-- ---------------------------------------------------------------------------
--
-- Read through RLS; every write goes through a SECURITY DEFINER RPC. `anon`
-- reaches nothing: the help centre is for signed-in accounts only, so a scraper
-- cannot enumerate the knowledge base or the support surface.

revoke all on public.help_categories from anon;
revoke all on public.help_articles from anon;
revoke all on public.help_article_translations from anon;
revoke all on public.help_article_versions from anon;
revoke all on public.help_article_feedback from anon;
revoke all on public.support_ticket_attachments from anon;

grant select on public.help_categories, public.help_articles, public.help_article_translations,
  public.help_article_versions, public.help_article_feedback, public.support_ticket_attachments
  to authenticated;

revoke insert, update, delete on public.help_categories from anon, authenticated;
revoke insert, update, delete on public.help_articles from anon, authenticated;
revoke insert, update, delete on public.help_article_translations from anon, authenticated;
revoke insert, update, delete on public.help_article_versions from anon, authenticated;
revoke insert, update, delete on public.help_article_feedback from anon, authenticated;
revoke insert, update, delete on public.support_ticket_attachments from anon, authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.get_help_center(text,text)',
    'public.get_help_category(text,text)',
    'public.get_help_article(text,text)',
    'public.submit_help_article_feedback(text,boolean,text)',
    'public.search_help_articles(text,text,text,integer)',
    'public.get_help_search_suggestions(text)',
    'public.open_support_case(text,text,text,text,text,uuid,text,text)',
    'public.get_my_support_case(uuid)',
    'public.reopen_support_case(uuid,text,text)',
    'public.submit_support_satisfaction(uuid,smallint,text)',
    'public.register_support_attachment(uuid,text,text,text,text)',
    'public.get_staff_support_queue(text,integer)',
    'public.staff_assign_support_case(uuid,uuid,text,text)',
    'public.staff_merge_support_cases(uuid,uuid,text,text)',
    'public.staff_resolve_support_case(uuid,text,text,text)',
    'public.get_staff_support_toolkit(text)',
    'public.get_staff_support_analytics(integer)',
    'public.staff_upsert_help_article(text,text,text,text,text,text,text[],text[],text[],text,text)',
    'public.staff_set_help_article_status(text,text,text)',
    'public.get_staff_help_articles(text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute pg_catalog.format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$$;

-- Support tables are never broadcast over Realtime. A case is polled by its
-- owner and by staff; there is no public channel that could leak a subject line.

-- ---------------------------------------------------------------------------
-- 16. Seed knowledge base
-- ---------------------------------------------------------------------------
--
-- Every article is authored, reviewed English and Egyptian Arabic. Nothing here
-- is machine-generated, at seed time or at read time.

insert into public.help_categories(
  category_key, audience, icon, surfaces, sort_order, title_en, title_ar, summary_en, summary_ar) values
  ('getting_started','all','rocket-launch','{onboarding,help_center}',10,
   'Getting started','البداية',
   'How Warsha works, and what to expect the first time.',
   'وارشة بتشتغل إزاي، وإيه اللي تتوقعه أول مرة.'),
  ('booking_help','customer','event-note','{booking,help_center}',20,
   'Bookings','الحجوزات',
   'Booking a worker, tracking the job, and changing your plans.',
   'إزاي تحجز صنايعي، وتتابع الشغل، وتغيّر مواعيدك.'),
  ('payment_help','all','payments','{payment,help_center}',30,
   'Payments','الدفع',
   'What you pay, when you pay it, and how refunds work.',
   'بتدفع كام، وإمتى، والاسترجاع بيشتغل إزاي.'),
  ('worker_help','customer','handyman','{help_center,marketplace}',40,
   'Choosing a worker','اختيار الصنايعي',
   'Comparing quotes, reading profiles, and what verification means.',
   'مقارنة العروض، وقراءة الملفات، ويعني إيه صنايعي موثّق.'),
  ('dispute_help','all','gavel','{dispute,help_center}',50,
   'When something goes wrong','لما حاجة تبوظ',
   'Reporting a problem with a job and how a dispute is decided.',
   'إزاي تبلّغ عن مشكلة في الشغل، والنزاع بيتحل إزاي.'),
  ('verification_help','worker','verified-user','{verification,help_center}',60,
   'Verification','التوثيق',
   'What Warsha checks, which documents are needed, and how long it takes.',
   'وارشة بتراجع إيه، وإيه المستندات المطلوبة، وبتاخد قد إيه.'),
  ('account_help','all','manage-accounts','{settings,account,help_center}',70,
   'Your account','حسابك',
   'Signing in, changing your details, and keeping the account safe.',
   'تسجيل الدخول، وتغيير بياناتك، وحماية حسابك.'),
  ('notification_help','all','notifications','{notification,settings,help_center}',80,
   'Notifications','الإشعارات',
   'Choosing what Warsha tells you about, and quiet hours.',
   'تختار وارشة تبلّغك بإيه، وساعات الهدوء.'),
  ('chat_help','all','forum','{chat,help_center}',90,
   'Messages','الرسائل',
   'Talking to the other side of a booking, safely.',
   'الكلام مع الطرف التاني في الحجز، بأمان.'),
  ('review_help','all','star-rate','{review,help_center}',100,
   'Reviews','التقييمات',
   'Leaving a review, editing it, and how ratings are calculated.',
   'إزاي تكتب تقييم، وتعدّله، والتقييمات بتتحسب إزاي.'),
  ('trust_help','all','shield','{help_center,settings}',110,
   'Trust and safety','الأمان والثقة',
   'Staying safe, spotting a scam, and reporting abuse.',
   'إزاي تفضل بأمان، وتكتشف النصب، وتبلّغ عن إساءة.'),
  ('worker_earnings_help','worker','account-balance-wallet','{earnings,portfolio,help_center}',120,
   'Working on Warsha','الشغل على وارشة',
   'Quotes, your profile, your portfolio, and getting paid.',
   'العروض، وملفك، وأعمالك، وفلوسك.')
on conflict (category_key) do update set
  audience = excluded.audience, icon = excluded.icon, surfaces = excluded.surfaces,
  sort_order = excluded.sort_order, title_en = excluded.title_en, title_ar = excluded.title_ar,
  summary_en = excluded.summary_en, summary_ar = excluded.summary_ar, updated_at = pg_catalog.now();

insert into public.help_articles(
  slug, category_key, status, audience, surfaces, tags, related_slugs, sort_order, published_at) values
  ('how-warsha-works','getting_started','published','all','{onboarding,help_center}',
   '{start,basics,how}','{how-to-book,how-payments-work}',10,pg_catalog.now()),
  ('getting-started-worker','getting_started','published','worker','{onboarding,portfolio}',
   '{worker,start,onboarding}','{worker-verification,quote-guidance}',20,pg_catalog.now()),
  ('how-to-book','booking_help','published','customer','{booking,marketplace,help_center}',
   '{booking,request,quote}','{booking-statuses,cancel-a-booking}',10,pg_catalog.now()),
  ('booking-statuses','booking_help','published','all','{booking,notification}',
   '{status,tracking,booking}','{how-to-book,worker-did-not-arrive}',20,pg_catalog.now()),
  ('cancel-a-booking','booking_help','published','customer','{booking,settings}',
   '{cancel,reschedule,booking}','{how-to-book,refunds}',30,pg_catalog.now()),
  ('worker-did-not-arrive','booking_help','published','customer','{booking,dispute}',
   '{no-show,late,booking}','{open-a-dispute,booking-statuses}',40,pg_catalog.now()),
  ('how-payments-work','payment_help','published','all','{payment,booking}',
   '{payment,cash,price}','{refunds,extra-work-approval}',10,pg_catalog.now()),
  ('refunds','payment_help','published','customer','{payment,dispute}',
   '{refund,money-back,payment}','{how-payments-work,open-a-dispute}',20,pg_catalog.now()),
  ('extra-work-approval','payment_help','published','all','{payment,booking}',
   '{extra,change,price}','{how-payments-work,how-to-book}',30,pg_catalog.now()),
  ('choosing-a-worker','worker_help','published','customer','{marketplace,help_center}',
   '{quote,compare,choose}','{what-verified-means,how-reviews-work}',10,pg_catalog.now()),
  ('what-verified-means','worker_help','published','all','{marketplace,verification}',
   '{verified,trust,badge}','{choosing-a-worker,staying-safe}',20,pg_catalog.now()),
  ('open-a-dispute','dispute_help','published','all','{dispute,booking}',
   '{dispute,problem,complaint}','{how-a-dispute-is-decided,refunds}',10,pg_catalog.now()),
  ('how-a-dispute-is-decided','dispute_help','published','all','{dispute}',
   '{dispute,evidence,decision}','{open-a-dispute,report-abuse}',20,pg_catalog.now()),
  ('worker-verification','verification_help','published','worker','{verification,onboarding}',
   '{verification,id,documents}','{verification-documents,getting-started-worker}',10,pg_catalog.now()),
  ('verification-documents','verification_help','published','worker','{verification}',
   '{documents,id,photo}','{worker-verification,skill-certificates}',20,pg_catalog.now()),
  ('skill-certificates','verification_help','published','worker','{verification,portfolio}',
   '{certificate,skill,badge}','{verification-documents,portfolio-guidance}',30,pg_catalog.now()),
  ('signing-in','account_help','published','all','{account,settings}',
   '{login,password,otp}','{account-security,change-your-phone-number}',10,pg_catalog.now()),
  ('account-security','account_help','published','all','{account,settings}',
   '{security,password,safety}','{signing-in,staying-safe}',20,pg_catalog.now()),
  ('change-your-phone-number','account_help','published','all','{account,settings}',
   '{phone,number,otp}','{signing-in,account-security}',30,pg_catalog.now()),
  ('notification-settings','notification_help','published','all','{notification,settings}',
   '{notifications,quiet,alerts}','{booking-statuses}',10,pg_catalog.now()),
  ('booking-chat-rules','chat_help','published','all','{chat,booking}',
   '{chat,message,contact}','{staying-safe,report-abuse}',10,pg_catalog.now()),
  ('how-reviews-work','review_help','published','all','{review,booking}',
   '{review,rating,stars}','{editing-your-review,choosing-a-worker}',10,pg_catalog.now()),
  ('editing-your-review','review_help','published','all','{review}',
   '{review,edit,change}','{how-reviews-work}',20,pg_catalog.now()),
  ('staying-safe','trust_help','published','all','{help_center,settings,chat}',
   '{safety,scam,fraud}','{report-abuse,account-security}',10,pg_catalog.now()),
  ('report-abuse','trust_help','published','all','{help_center,chat,review}',
   '{report,abuse,block}','{staying-safe,open-a-dispute}',20,pg_catalog.now()),
  ('quote-guidance','worker_earnings_help','published','worker','{marketplace,earnings}',
   '{quote,price,win}','{getting-started-worker,portfolio-guidance}',10,pg_catalog.now()),
  ('portfolio-guidance','worker_earnings_help','published','worker','{portfolio}',
   '{portfolio,photos,profile}','{quote-guidance,skill-certificates}',20,pg_catalog.now()),
  ('getting-paid','worker_earnings_help','published','worker','{earnings,payment}',
   '{earnings,payout,withdraw}','{withdrawal-guidance,how-payments-work}',30,pg_catalog.now()),
  ('withdrawal-guidance','worker_earnings_help','published','worker','{earnings}',
   '{withdraw,payout,wallet}','{getting-paid}',40,pg_catalog.now())
on conflict (slug) do update set
  category_key = excluded.category_key, status = excluded.status, audience = excluded.audience,
  surfaces = excluded.surfaces, tags = excluded.tags, related_slugs = excluded.related_slugs,
  sort_order = excluded.sort_order, published_at = coalesce(public.help_articles.published_at, excluded.published_at),
  updated_at = pg_catalog.now();

insert into public.help_article_translations(article_id, locale, title, summary, body)
select a.id, v.locale, v.title, v.summary, v.body
from (values
  ('how-warsha-works','en','How Warsha works',
   'Describe the job, compare quotes from independent workers, and pay a fair price.',
   'Warsha connects you with independent skilled workers near you. You describe the job once, and workers who can do it send you quotes.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Quotes keep arriving after the first one, so you are never pushed to accept immediately. You compare the price, the rating, and the profile, then you choose.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Once you accept a quote the booking is confirmed, a private chat opens, and you can follow the job from your orders screen until it is finished.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Warsha stays with you the whole way. If something goes wrong there is a dispute process, and support is here for everything else.'),
  ('how-warsha-works','ar','وارشة بتشتغل إزاي',
   'اوصف الشغلانة، قارن العروض من الصنايعية، وادفع سعر عادل.',
   'وارشة بتوصلك بصنايعية مستقلين قريبين منك. انت بتوصف الشغلانة مرة واحدة، والصنايعية اللي يقدروا يعملوها بيبعتولك عروض.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'العروض بتفضل تيجي بعد أول واحد، فمحدش بيضغط عليك توافق على طول. انت بتقارن السعر والتقييم والملف، وبعدين تختار.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'أول ما توافق على عرض، الحجز بيتأكد، وبيتفتح شات خاص، وتقدر تتابع الشغل من شاشة الطلبات لحد ما يخلص.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وارشة معاك للآخر. لو حصلت مشكلة فيه مسار نزاع، والدعم موجود لأي حاجة تانية.'),
  ('getting-started-worker','en','Getting started as a worker',
   'Create your profile, get verified, and start receiving job requests.',
   'Register with your phone number. You will get a code by SMS to confirm it is you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Fill in your profile: your trade, the areas you cover, and a few words about your experience. Add photos of finished work — customers choose the workers they can see.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Send your ID for verification. A verified badge makes a real difference to how often you are chosen.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You are available by default. When a request matches your trade and area, you will be invited to quote. There is no complicated schedule to keep up to date.'),
  ('getting-started-worker','ar','تبدأ إزاي كصنايعي',
   'اعمل ملفك، وثّق حسابك، وابدأ تستقبل طلبات شغل.',
   'سجّل برقم تليفونك. هيوصلك كود بالرسايل عشان نتأكد إنه انت.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'املا ملفك: صنعتك، والمناطق اللي بتشتغل فيها، وكلمتين عن خبرتك. وحط صور لشغل خلصته — الزباين بيختاروا الصنايعي اللي شايفين شغله.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'ابعت بطاقتك للتوثيق. علامة التوثيق بتفرق فعلًا في عدد المرات اللي بتتختار فيها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'انت متاح افتراضيًا. أول ما يجي طلب يناسب صنعتك ومنطقتك، هتتدعى تقدّم عرض. مفيش جدول معقد لازم تفضل تحدّثه.'),
  ('how-to-book','en','How to book a worker',
   'Describe the job once, then compare the quotes that come back.',
   'Start from the home screen or from a category, and describe what you need: what is wrong, where you are, and when suits you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Add a photo if you can. A photo gets you a more accurate price and fewer questions.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Workers who cover your area send quotes. The cheapest fair quote is usually shown first, but you can read every profile before you decide.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Accept the one you want. The booking is confirmed, the chat opens, and the other quotes are closed automatically.'),
  ('how-to-book','ar','إزاي تحجز صنايعي',
   'اوصف الشغلانة مرة واحدة، وبعدين قارن العروض اللي هتيجي.',
   'ابدأ من الشاشة الرئيسية أو من قسم، واوصف اللي انت محتاجه: إيه المشكلة، وانت فين، وإمتى يناسبك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'حط صورة لو تقدر. الصورة بتجيبلك سعر أدق وأسئلة أقل.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الصنايعية اللي بيغطّوا منطقتك هيبعتوا عروض. أرخص عرض عادل بيظهر عادةً الأول، بس تقدر تقرا كل ملف قبل ما تقرر.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وافق على اللي عايزه. الحجز بيتأكد، والشات بيتفتح، وباقي العروض بتتقفل لوحدها.'),
  ('booking-statuses','en','What each booking status means',
   'From confirmed to completed, and what you can do at each step.',
   'Confirmed means the worker accepted and the job is scheduled.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'On the way and Arrived are set by the worker so you know when to expect them at the door.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Started and In progress mean work has begun. If the job turns out to need more work than quoted, the worker sends you a price change to approve first.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Completed is confirmed by you, not by the worker alone. After that you can leave a review, and the warranty period begins.'),
  ('booking-statuses','ar','كل حالة حجز معناها إيه',
   'من التأكيد لحد الانتهاء، وتقدر تعمل إيه في كل خطوة.',
   'مؤكد يعني الصنايعي وافق والشغلانة اتحجزت.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'في الطريق ووصل بيحطهم الصنايعي عشان تعرف هييجي إمتى.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'بدأ والشغل شغال يعني الشغل ابتدى. لو الشغلانة طلعت محتاجة شغل أكتر من المتفق عليه، الصنايعي بيبعتلك تعديل سعر توافق عليه الأول.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'خلصت انت اللي بتأكدها، مش الصنايعي لوحده. بعدها تقدر تكتب تقييم، وبتبدأ فترة الضمان.'),
  ('cancel-a-booking','en','Cancelling or rescheduling',
   'What happens when plans change, and when a fee applies.',
   'You can cancel from the booking screen. Tell the worker as early as you can — they may have turned down other work for you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Cancelling before the worker sets off costs nothing.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If the worker has already arrived, a call-out amount may apply. It is shown to you before you confirm the cancellation, never afterwards.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'To change the time instead, use reschedule and agree the new time in the chat.'),
  ('cancel-a-booking','ar','الإلغاء أو تغيير الميعاد',
   'بيحصل إيه لما الظروف تتغير، والرسوم بتنطبق إمتى.',
   'تقدر تلغي من شاشة الحجز. قول للصنايعي بدري قد ما تقدر — يمكن يكون رفض شغل تاني عشانك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الإلغاء قبل ما الصنايعي يتحرك مش بيكلّف حاجة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو الصنايعي وصل بالفعل، ممكن يبقى فيه مقابل معاينة. بيتعرضلك قبل ما تأكد الإلغاء، مش بعده.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو عايز تغيّر الميعاد بس، استخدم تغيير الميعاد واتفقوا على الوقت الجديد في الشات.'),
  ('worker-did-not-arrive','en','The worker did not arrive',
   'What to do about a no-show, and how it affects the worker.',
   'First, check the chat. Traffic in Cairo is what it is, and most late arrivals are announced there.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If there is no message and the time has clearly passed, report a no-show from the booking screen.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You are not charged for a job that did not happen, and Warsha can help you rebook with someone else quickly.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A confirmed no-show is recorded against the worker. Repeat no-shows affect how often they are invited to quote.'),
  ('worker-did-not-arrive','ar','الصنايعي مجاش',
   'تعمل إيه لو محدش جه، وده بيأثر إزاي على الصنايعي.',
   'الأول، بص على الشات. زحمة القاهرة معروفة، ومعظم التأخير بيتقال هناك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو مفيش أي رسالة والميعاد عدى بوضوح، بلّغ عن عدم الحضور من شاشة الحجز.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'مش هتتحاسب على شغل ماحصلش، ووارشة تقدر تساعدك تحجز مع حد تاني بسرعة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'عدم الحضور المؤكد بيتسجّل على الصنايعي. وتكراره بيأثر على عدد المرات اللي بيتدعى فيها يقدّم عروض.'),
  ('how-payments-work','en','How payments work',
   'You pay the agreed price. Warsha takes its commission from the worker, not from you.',
   'The price you accept in the quote is the price of the job. Warsha does not add a fee on top for you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Payment is in cash today, handed to the worker when the job is done. The worker confirms it in the app and it appears on your booking.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Warsha takes a ten percent commission from the worker, which is already included in the price you were quoted.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If the job needs more work than quoted, you approve the new amount before the work continues. Nothing is ever added silently.'),
  ('how-payments-work','ar','الدفع بيشتغل إزاي',
   'انت بتدفع السعر المتفق عليه. وارشة بتاخد عمولتها من الصنايعي، مش منك.',
   'السعر اللي وافقت عليه في العرض هو سعر الشغلانة. وارشة مش بتزوّد عليك رسوم.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الدفع دلوقتي كاش، بتديه للصنايعي بعد ما الشغل يخلص. الصنايعي بيأكده في التطبيق وبيظهر على حجزك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وارشة بتاخد عمولة عشرة في المية من الصنايعي، وهي أصلًا داخلة في السعر اللي اتعرض عليك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو الشغلانة محتاجة شغل أكتر، انت اللي بتوافق على المبلغ الجديد قبل ما الشغل يكمّل. مفيش حاجة بتتزوّد في السر.'),
  ('refunds','en','Refunds',
   'When money comes back, and how long it takes.',
   'If a job was not done, or was not done as agreed, you can ask for money back through a dispute.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Support cannot decide a refund on its own. A refund follows a dispute decision, so both sides get to explain what happened.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'For a cash payment, a refund is arranged directly and recorded against the booking so there is a record for both of you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You will see every step on the booking screen. Nothing about your money changes without a record.'),
  ('refunds','ar','استرجاع الفلوس',
   'الفلوس بترجع إمتى، وبتاخد قد إيه.',
   'لو الشغلانة ماتعملتش، أو ماتعملتش زي المتفق، تقدر تطلب فلوسك ترجع من خلال نزاع.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الدعم مش بيقرر الاسترجاع لوحده. الاسترجاع بيمشي ورا قرار النزاع، عشان الطرفين يقولوا اللي حصل.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'في الدفع الكاش، الاسترجاع بيتظبط مباشرة وبيتسجّل على الحجز عشان يبقى فيه إثبات ليكم الاتنين.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'هتشوف كل خطوة على شاشة الحجز. مفيش حاجة بتحصل في فلوسك من غير تسجيل.'),
  ('extra-work-approval','en','When the job needs extra work',
   'A price change needs your approval before the work continues.',
   'Sometimes the real problem is bigger than it looked in a photo. That is normal.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'The worker sends you a price change explaining what else is needed and what it costs. The work pauses until you answer.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You can approve it, or decline and keep the original scope. Declining does not cancel the booking.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If you are not sure, ask in the chat first. A good worker will explain it without pressure.'),
  ('extra-work-approval','ar','لما الشغلانة تحتاج شغل زيادة',
   'تعديل السعر لازم موافقتك قبل ما الشغل يكمّل.',
   'ساعات المشكلة الحقيقية بتبقى أكبر من اللي باينة في الصورة. وده طبيعي.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الصنايعي بيبعتلك تعديل سعر يشرح فيه المطلوب الزيادة وتكلفته. والشغل بيقف لحد ما ترد.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'تقدر توافق، أو ترفض وتكمّل بالمتفق عليه الأول. الرفض مش بيلغي الحجز.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو مش متأكد، اسأل في الشات الأول. الصنايعي الكويس هيشرحلك من غير ضغط.'),
  ('choosing-a-worker','en','Choosing between quotes',
   'Price matters, but it is not the only thing to look at.',
   'Warsha shows you the fairest price first, not an advert. Nobody pays to be at the top.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Open the profile before you decide. Look at the finished work, the rating, and how many jobs the worker has completed.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A verified worker has given Warsha identity documents that a person has checked. It is not a guarantee of quality, but it is a real check.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A very low quote from a new account with no photos deserves a question in the chat before you accept it.'),
  ('choosing-a-worker','ar','تختار بين العروض إزاي',
   'السعر مهم، بس مش الحاجة الوحيدة اللي تبص عليها.',
   'وارشة بتوريك أعدل سعر الأول، مش إعلان. محدش بيدفع عشان يبقى فوق.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'افتح الملف قبل ما تقرر. بص على الشغل اللي خلص، والتقييم، وعدد الشغلانات اللي عملها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الصنايعي الموثّق ده قدّم لوارشة مستندات هوية وحد راجعها. دي مش ضمانة جودة، بس دي مراجعة حقيقية.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'عرض رخيص أوي من حساب جديد من غير صور يستاهل سؤال في الشات قبل ما توافق.'),
  ('what-verified-means','en','What the verified badge means',
   'A person at Warsha checked the worker''s identity documents.',
   'A verified worker has submitted a national ID and had it reviewed by a member of Warsha staff.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'It means Warsha knows who they are. It is not a rating and it is not a guarantee that a specific job will go well.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Some workers also hold a skill certificate. That is a separate, optional check on a specific trade.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Read the reviews for quality. Read the badge for identity. They answer different questions.'),
  ('what-verified-means','ar','علامة التوثيق معناها إيه',
   'حد في وارشة راجع مستندات هوية الصنايعي.',
   'الصنايعي الموثّق قدّم بطاقة شخصية وراجعها حد من فريق وارشة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'ده معناه إن وارشة عارفة هو مين. مش تقييم، ومش ضمان إن شغلانة معينة هتمشي كويس.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'فيه صنايعية كمان عندهم شهادة مهارة. دي مراجعة تانية اختيارية على صنعة معينة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'اقرا التقييمات عشان الجودة. وبص على العلامة عشان الهوية. كل واحدة بترد على سؤال مختلف.'),
  ('open-a-dispute','en','Opening a dispute',
   'For a real problem with the job itself, not a general question.',
   'Open a dispute when the work was not done, was done badly, or the amount is wrong and the worker will not fix it.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Start from the booking screen. Explain what happened and attach photos — evidence decides disputes.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'There is a time window after the job is completed, and the warranty period extends it. Open it as soon as you know there is a problem.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'For anything that is not a dispute — a question, a login problem, a payment you do not understand — contact support instead. It is faster.'),
  ('open-a-dispute','ar','فتح نزاع',
   'للمشاكل الحقيقية في الشغل نفسه، مش للأسئلة العامة.',
   'افتح نزاع لما الشغل ماتعملش، أو اتعمل وحش، أو المبلغ غلط والصنايعي مش راضي يظبطه.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'ابدأ من شاشة الحجز. اشرح اللي حصل وارفع صور — الأدلة هي اللي بتحسم النزاعات.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'فيه مدة بعد ما الشغل يخلص، وفترة الضمان بتمدّها. افتحه أول ما تعرف إن فيه مشكلة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'أي حاجة تانية مش نزاع — سؤال، مشكلة دخول، دفعة مش فاهمها — كلّم الدعم بدل كده. هيبقى أسرع.'),
  ('how-a-dispute-is-decided','en','How a dispute is decided',
   'Both sides explain, evidence is reviewed, and a person decides.',
   'When a dispute opens, both you and the worker are asked for your side and for evidence.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Warsha staff review it. Nothing is decided automatically and nothing is decided by a machine.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'The decision states what happens to the money and why. It is recorded on the booking permanently.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'While a dispute is open, any review of that booking is held back so a decision is never influenced by public pressure.'),
  ('how-a-dispute-is-decided','ar','النزاع بيتحل إزاي',
   'الطرفين بيشرحوا، والأدلة بتتراجع، وحد بيقرر.',
   'أول ما النزاع يتفتح، بيتطلب منك ومن الصنايعي إن كل واحد يقول وجهة نظره ويقدّم أدلة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'فريق وارشة بيراجعه. مفيش حاجة بتتقرر أوتوماتيك ومفيش حاجة بيقررها جهاز.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'القرار بيوضح الفلوس هتتصرف إزاي وليه. وبيتسجّل على الحجز بشكل دائم.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وطول ما النزاع مفتوح، أي تقييم على الحجز ده بيتأجّل عشان القرار ما يتأثرش بضغط علني.'),
  ('worker-verification','en','Getting verified',
   'What Warsha checks and how long it takes.',
   'Verification is how customers know who they are letting into their home. It is the single biggest thing you can do to get more work.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Go to verification from your worker profile and upload your national ID.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A member of Warsha staff reviews every submission by hand. If something is unclear you will be asked to send it again, with the reason.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Your documents are stored privately. They are never shown to customers and never appear on your public profile.'),
  ('worker-verification','ar','توثيق حسابك',
   'وارشة بتراجع إيه، وبياخد قد إيه.',
   'التوثيق هو اللي بيخلي الزبون يعرف مين اللي داخل بيته. وده أكتر حاجة ممكن تعملها عشان شغلك يزيد.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'روح على التوثيق من ملفك كصنايعي وارفع بطاقتك الشخصية.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'حد من فريق وارشة بيراجع كل طلب بإيده. لو فيه حاجة مش واضحة هيتطلب منك ترفعها تاني، مع السبب.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'مستنداتك متخزّنة بشكل خاص. عمرها ما بتتعرض للزباين ولا بتظهر في ملفك العام.'),
  ('verification-documents','en','Which documents to send',
   'A clear national ID, front and back.',
   'Send your national ID: front and back, in two separate photos.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'All four corners must be visible. Do not crop the edges.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Photograph it flat in good light with no flash glare. Most rejections are a glare across the number, not a real problem with the card.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If your submission is rejected, the reason is shown on the verification screen. Fix that one thing and send it again.'),
  ('verification-documents','ar','المستندات المطلوبة',
   'بطاقة شخصية واضحة، وش وضهر.',
   'ابعت بطاقتك الشخصية: الوش والضهر، في صورتين منفصلين.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لازم الأركان الأربعة تكون ظاهرة. ماتقصّش الحواف.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'صوّرها مفرودة في نور كويس من غير لمعة فلاش. أغلب الرفض بيبقى بسبب لمعة على الرقم، مش مشكلة حقيقية في البطاقة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو طلبك اترفض، السبب بيظهر في شاشة التوثيق. ظبّط الحاجة دي وابعت تاني.'),
  ('skill-certificates','en','Skill certificates',
   'Optional proof of training in a specific trade.',
   'A skill certificate is separate from identity verification. It is optional.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If you have training or a trade qualification, upload it from your profile. Staff review it and attach it to the trade it belongs to.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A relevant certificate is shown on your public profile for that trade only, so it means something to the customer reading it.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A certificate does not replace identity verification, and it does not move you up the list on its own.'),
  ('skill-certificates','ar','شهادات المهارة',
   'إثبات اختياري لتدريب في صنعة معينة.',
   'شهادة المهارة حاجة منفصلة عن توثيق الهوية. وهي اختيارية.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو عندك تدريب أو مؤهل في صنعة، ارفعه من ملفك. الفريق بيراجعه ويربطه بالصنعة اللي بتخصّها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الشهادة اللي ليها علاقة بتظهر في ملفك العام للصنعة دي بس، عشان تبقى ليها معنى عند الزبون اللي بيقراها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الشهادة مش بديل عن توثيق الهوية، ومش بتوديك لفوق في القايمة لوحدها.'),
  ('signing-in','en','Signing in',
   'Customers use email and password. Workers use a phone number.',
   'If you book work, you sign in with your email address and a password.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If you do work, you sign in with your phone number and a code sent by SMS.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Forgot your password? Use the reset link on the sign-in screen and follow the email.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Code not arriving? Check the number is right, wait a full minute, then request it again. Repeated requests in a short time are slowed down on purpose.'),
  ('signing-in','ar','تسجيل الدخول',
   'الزباين بإيميل وباسورد. الصنايعية برقم التليفون.',
   'لو بتحجز شغل، بتدخل بالإيميل والباسورد.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو بتشتغل، بتدخل برقم تليفونك وكود بيوصلك برسالة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'نسيت الباسورد؟ استخدم رابط إعادة التعيين في شاشة الدخول واتبع الإيميل.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الكود مش بيوصل؟ اتأكد إن الرقم صح، استنى دقيقة كاملة، وبعدين اطلبه تاني. الطلبات المتكررة في وقت قصير بتتبطّأ عن قصد.'),
  ('account-security','en','Keeping your account safe',
   'Warsha will never ask you for your password or your code.',
   'Nobody from Warsha will ever ask you for your password or for the code sent to your phone. Anyone who asks is not from Warsha.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Keep the conversation inside the app. A chat that moves outside Warsha loses the record that protects you.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If you think someone else has been in your account, change your password immediately and contact support.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Warsha notifies you when your password, email, or phone number changes. If you get one of those and it was not you, act on it.'),
  ('account-security','ar','حماية حسابك',
   'وارشة عمرها ما هتطلب منك الباسورد ولا الكود.',
   'محدش من وارشة هيطلب منك الباسورد ولا الكود اللي بيوصل تليفونك. أي حد بيطلب كده مش من وارشة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'خلّي الكلام جوه التطبيق. الشات اللي بيخرج بره وارشة بيضيّع السجل اللي بيحميك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو حاسس إن حد تاني دخل حسابك، غيّر الباسورد فورًا وكلّم الدعم.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وارشة بتبلّغك لما الباسورد أو الإيميل أو رقم التليفون يتغيّر. لو جالك إشعار من دول وانت مش اللي عملته، تحرّك بسرعة.'),
  ('change-your-phone-number','en','Changing your phone number',
   'Verify the new number before the old one stops working.',
   'Change your number from your profile. You will confirm the new number with a code before it takes effect.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Do it while you still have the old number, if you can. It makes recovery much easier if anything goes wrong.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If you have already lost access to the old number, contact support. You will be asked to confirm details only the account owner would know.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Your bookings, reviews, and earnings history stay with your account, not with the number.'),
  ('change-your-phone-number','ar','تغيير رقم تليفونك',
   'أكّد الرقم الجديد قبل ما القديم يبطّل.',
   'غيّر رقمك من ملفك. هتأكد الرقم الجديد بكود قبل ما يشتغل.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'اعملها وانت لسه معاك الرقم القديم لو تقدر. ده بيسهّل الاسترجاع لو حصلت أي مشكلة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو الرقم القديم راح منك خلاص، كلّم الدعم. هيتطلب منك تأكيد تفاصيل صاحب الحساب بس هو اللي يعرفها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'حجوزاتك وتقييماتك وسجل أرباحك بيفضلوا مع حسابك، مش مع الرقم.'),
  ('notification-settings','en','Choosing your notifications',
   'Turn categories on or off, and set quiet hours.',
   'Warsha groups notifications by subject: bookings, messages, payments, reviews, support, and so on.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Turn off any category you do not want from notification settings.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Some things always reach you: a payment change, a dispute update, a security alert, and a reply from support. Those matter too much to be missed.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Quiet hours hold back everything that is not urgent until the morning.'),
  ('notification-settings','ar','تختار إشعاراتك',
   'شغّل أو اقفل الأقسام، واظبط ساعات الهدوء.',
   'وارشة بتقسّم الإشعارات حسب الموضوع: حجوزات، رسايل، فلوس، تقييمات، دعم، وهكذا.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'اقفل أي قسم مش عايزه من إعدادات الإشعارات.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'فيه حاجات بتوصلك دايمًا: تغيير في الدفع، تحديث نزاع، تنبيه أمان، ورد من الدعم. دي أهم من إنها تفوت.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'ساعات الهدوء بتأجّل أي حاجة مش مستعجلة لحد الصبح.'),
  ('booking-chat-rules','en','Messaging safely',
   'The chat opens with the booking and keeps a record for both of you.',
   'A private chat opens as soon as a booking is confirmed, and stays available while the job is live.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You can send photos and PDFs. They are private to the two of you and to Warsha staff if a dispute is opened.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Keep it in the app. If somebody asks you to move to another app or to pay outside Warsha, that is the moment to report them.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'The chat closes a while after the job ends. Anything you may need later — a receipt, a photo of the work — save it before then.'),
  ('booking-chat-rules','ar','الرسايل بأمان',
   'الشات بيتفتح مع الحجز وبيحتفظ بسجل ليكم الاتنين.',
   'شات خاص بيتفتح أول ما الحجز يتأكد، وبيفضل شغال طول ما الشغلانة قايمة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'تقدر تبعت صور وملفات PDF. وهي خاصة بيكم انتوا الاتنين، وبفريق وارشة لو اتفتح نزاع.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'خلّيك جوه التطبيق. لو حد طلب منك تنتقلوا لتطبيق تاني أو تدفع بره وارشة، دي اللحظة اللي تبلّغ عنه فيها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الشات بيتقفل بعد الشغلانة بفترة. أي حاجة ممكن تحتاجها بعدين — إيصال، صورة للشغل — احفظها قبل كده.'),
  ('how-reviews-work','en','How reviews work',
   'Only a real completed booking can be reviewed.',
   'You can review a worker after a booking is completed. No booking, no review — that is what keeps the ratings honest.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'You rate the work on more than one dimension, not just a single star count, so a worker who is excellent but late is described accurately.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'The worker can reply once, publicly. Their reply cannot be edited afterwards.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A rating built on very few jobs is shown with less confidence, so a single review does not make or break someone.'),
  ('how-reviews-work','ar','التقييمات بتشتغل إزاي',
   'الحجز الحقيقي اللي خلص هو بس اللي يتقيّم.',
   'تقدر تقيّم الصنايعي بعد ما الحجز يخلص. مفيش حجز يبقى مفيش تقييم — ده اللي بيخلي التقييمات صادقة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'انت بتقيّم الشغل في أكتر من جانب، مش نجوم بس، عشان الصنايعي الشاطر بس اللي بيتأخر يتوصف بدقة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الصنايعي يقدر يرد مرة واحدة، بشكل علني. وردّه مش بيتعدّل بعد كده.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'التقييم المبني على شغلانات قليلة بيتعرض بثقة أقل، عشان تقييم واحد ما يبنيش أو يهدّش حد.'),
  ('editing-your-review','en','Editing or removing a review',
   'You have a short window to change your mind.',
   'You can edit your review for a limited period after you post it.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'After that it is fixed. A rating that can be rewritten at any time is worth nothing to the next customer reading it.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If a review breaks the rules — abuse, personal details, something untrue about a person — report it and staff will look at it.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Staff can hide a review, and when they do the reason is recorded. Nothing is deleted quietly.'),
  ('editing-your-review','ar','تعديل أو حذف تقييم',
   'عندك وقت قصير تغيّر رأيك فيه.',
   'تقدر تعدّل تقييمك لمدة محدودة بعد ما تنشره.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'بعد كده بيتثبّت. التقييم اللي ممكن يتغيّر في أي وقت ماله أي قيمة عند الزبون اللي جاي يقراه.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو تقييم كسر القواعد — إساءة، بيانات شخصية، كلام مش حقيقي عن حد — بلّغ عنه والفريق هيبص عليه.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الفريق يقدر يخفي تقييم، ولما يعمل كده السبب بيتسجّل. مفيش حاجة بتتمسح في السر.'),
  ('staying-safe','en','Staying safe',
   'The common scams, and the one rule that stops all of them.',
   'The rule: keep the money and the conversation inside Warsha. Every scam starts with someone trying to move you out.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Be careful with a request to pay a deposit to a personal wallet before any work starts, or a price that is far below every other quote.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Be careful with anyone who refuses to talk in the app chat, or who asks for the code sent to your phone.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If something feels wrong, it costs you nothing to report it and choose someone else.'),
  ('staying-safe','ar','خليك بأمان',
   'أشهر طرق النصب، والقاعدة الواحدة اللي بتوقّفها كلها.',
   'القاعدة: خلّي الفلوس والكلام جوه وارشة. كل عملية نصب بتبدأ بحد بيحاول يطلّعك بره.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'خد بالك من طلب عربون على محفظة شخصية قبل ما أي شغل يبدأ، أو سعر أقل بكتير من كل العروض التانية.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'خد بالك من أي حد رافض يتكلم في شات التطبيق، أو بيطلب الكود اللي وصل تليفونك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو حاسس إن فيه حاجة غلط، مش هيكلّفك حاجة إنك تبلّغ وتختار حد تاني.'),
  ('report-abuse','en','Reporting abuse',
   'One report form, wherever you saw the problem.',
   'You can report a message, a review, a profile, or a booking from the screen you are on.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Say what happened in your own words. A specific report is acted on faster than a general one.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Reports go to a person, not to an automatic system. Nobody is permanently banned by a machine.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If an action is taken against your account and you believe it is wrong, you can appeal it and a different decision-maker reviews it.'),
  ('report-abuse','ar','التبليغ عن إساءة',
   'استمارة تبليغ واحدة، من أي مكان شفت فيه المشكلة.',
   'تقدر تبلّغ عن رسالة أو تقييم أو ملف أو حجز من الشاشة اللي انت فيها.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'قول اللي حصل بكلامك انت. البلاغ المحدد بيتم التصرف فيه أسرع من العام.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'البلاغات بتروح لبني آدم، مش لنظام أوتوماتيك. محدش بيتحظر نهائي بقرار جهاز.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو اتاخد إجراء ضد حسابك وشايف إنه غلط، تقدر تتظلّم وحد تاني هيراجعه.'),
  ('quote-guidance','en','Writing a quote that wins',
   'Be quick, be specific, and price it honestly.',
   'Speed matters. Quotes keep arriving after the first one, but the early ones get read most carefully.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Break the price down: labour, materials, and anything else. A customer who understands the number argues with it less.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Do not quote low to win and then push a price change on site. Warsha records approvals, customers notice, and it costs you the rating.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'If the photo does not show enough, say what you need to see. Asking a good question is often what gets you chosen.'),
  ('quote-guidance','ar','تكتب عرض يكسب إزاي',
   'كن سريع، وواضح، وسعّر بأمانة.',
   'السرعة فارقة. العروض بتفضل تيجي بعد أول واحد، بس اللي بدري بيتقرا بتركيز أكتر.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'فصّل السعر: مصنعية، وخامات، وأي حاجة تانية. الزبون اللي فاهم الرقم بيتناقش فيه أقل.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'ماتنزلش السعر عشان تكسب وبعدين تطلع تعديل سعر على الأرض. وارشة بتسجّل الموافقات، والزباين بتلاحظ، وده بيضرّ تقييمك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'لو الصورة مش مبيّنة كفاية، قول انت محتاج تشوف إيه. السؤال الكويس كتير بيكون هو سبب اختيارك.'),
  ('portfolio-guidance','en','Building your portfolio',
   'Photographs of finished work are what customers actually look at.',
   'Add photos of work you finished. Clear, well-lit, and showing the result rather than the mess halfway through.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Group them by trade so a customer looking for a plumber sees plumbing first.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Never post a photo of the inside of a customer''s home without asking them. It is their home.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'A short honest description of your experience beats a long list of claims. Customers read the photos and the reviews far more than the text.'),
  ('portfolio-guidance','ar','تبني معرض أعمالك',
   'صور الشغل اللي خلص هي اللي الزباين بيبصوا عليها فعلًا.',
   'حط صور لشغل خلصته. واضحة، ونورها كويس، وبتوري النتيجة مش اللخبطة اللي في النص.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'رتّبها حسب الصنعة عشان الزبون اللي بيدور على سباك يشوف السباكة الأول.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'عمرك ما تنشر صورة من جوه بيت زبون من غير ما تستأذنه. ده بيته.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وصف قصير وصادق لخبرتك أحسن من قايمة طويلة من الكلام. الزباين بيقروا الصور والتقييمات أكتر بكتير من النص.'),
  ('getting-paid','en','Getting paid',
   'How your earnings are calculated and when they become available.',
   'When a job is completed and paid, the amount is recorded against your account.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Warsha takes a ten percent commission. It is already included in the price the customer accepted, so there is no surprise deduction.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Earnings become available for withdrawal after a short holding period following completion.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Every amount is recorded as a ledger entry you can see. If a number looks wrong, contact support with the booking and it will be traced.'),
  ('getting-paid','ar','فلوسك بتوصلك إزاي',
   'أرباحك بتتحسب إزاي وبتبقى متاحة إمتى.',
   'لما الشغلانة تخلص وتتدفع، المبلغ بيتسجّل على حسابك.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'وارشة بتاخد عمولة عشرة في المية. وهي أصلًا داخلة في السعر اللي الزبون وافق عليه، فمفيش خصم مفاجئ.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الأرباح بتبقى متاحة للسحب بعد فترة قصيرة من انتهاء الشغلانة.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'كل مبلغ بيتسجّل كقيد تقدر تشوفه. لو رقم شكله غلط، كلّم الدعم ومعاك الحجز وهنتتبّعه.'),
  ('withdrawal-guidance','en','Withdrawing your earnings',
   'The minimum amount, and what to check before you request.',
   'You can request a withdrawal once your available balance reaches the minimum of two hundred pounds.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Check the destination details carefully before you submit. A wrong wallet number is slow to recover.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Requests are reviewed by staff before they are sent. You will see the status change on the earnings screen.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'Money held against an open dispute is not available until the dispute is decided. That protects you as much as the customer.'),
  ('withdrawal-guidance','ar','سحب أرباحك',
   'الحد الأدنى، وإيه اللي تراجعه قبل ما تطلب.',
   'تقدر تطلب سحب أول ما رصيدك المتاح يوصل الحد الأدنى وهو ميتين جنيه.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'راجع بيانات التحويل كويس قبل ما تبعت. رقم المحفظة الغلط استرجاعه بيبقى بطيء.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الطلبات بيراجعها الفريق قبل ما تتبعت. وهتشوف الحالة بتتغيّر في شاشة الأرباح.'||pg_catalog.chr(10)||pg_catalog.chr(10)||
   'الفلوس المحجوزة على نزاع مفتوح مش متاحة لحد ما النزاع يتحسم. وده بيحميك انت زي ما بيحمي الزبون.')
) as v(slug, locale, title, summary, body)
join public.help_articles a on a.slug = v.slug
on conflict (article_id, locale) do update set
  title = excluded.title, summary = excluded.summary, body = excluded.body,
  updated_at = pg_catalog.now();

-- The seed corpus is version 1 of every article, recorded immutably so a later
-- edit is always visible as a change against a known baseline.
insert into public.help_article_versions(article_id, version, locale, status, title, summary, body, change_note)
select tr.article_id, a.version, tr.locale, a.status, tr.title, tr.summary, tr.body,
       'WPS-019 seed corpus'
from public.help_article_translations tr
join public.help_articles a on a.id = tr.article_id
on conflict (article_id, version, locale) do nothing;
