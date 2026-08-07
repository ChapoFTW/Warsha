-- ============================================================================
-- WPS-024 — LEGAL, PRIVACY, COMPLIANCE AND GOVERNANCE
-- ============================================================================
--
-- Authority: Warsha Constitution. Extends WPS-001 through WPS-023.
--
-- What this migration is for
-- --------------------------
-- Warsha has consent (WPS-022) and it has verification (WPS-023). What it has
-- never had is an AGREEMENT: a versioned document, with a publication date, an
-- effective date, a hash of its exact words, and a record binding a named
-- person to the exact version they read in the exact language they read it in.
--
-- WPS-022's `privacy_consent_purposes` carries a `document_key` and a
-- `current_version`, which was the right shape and the right seam. It has no
-- documents behind it. This migration supplies them, and does it by EXTENDING
-- that model rather than building a second one: `record_my_consent` still
-- works, `privacy_consent_records` is still the consent ledger, and the new
-- acceptance ledger sits alongside it for the thing consent records cannot
-- express — that a specific person agreed to a specific TEXT.
--
-- The three hard decisions in here
-- --------------------------------
-- 1. THE TEXT LIVES IN THE REPOSITORY, THE HASH LIVES HERE. Thirty thousand
--    words of legal prose inside a SQL file would be unreviewable and would
--    make correcting a comma a database migration. So `src/legal/` holds the
--    corpus, this register holds `content_hash_en` / `content_hash_ar`, and
--    the client sends back the hash of what it actually rendered. Three
--    independent SHA-256 implementations — TypeScript, Node, Postgres — are
--    pinned to each other by test. An acceptance therefore names an exact text
--    rather than a document that may since have changed.
--
-- 2. MATERIALITY IS A COLUMN, NOT A JUDGEMENT AT DISPLAY TIME. `change_class`
--    decides whether a person is asked to accept again. Getting this wrong in
--    either direction is a real failure: not asking for a change to identity
--    processing is a consent failure, and asking for a fixed typo trains
--    everyone to tap past the ones that matter. So the class is recorded when
--    the version is published, is immutable afterwards, and the publishing
--    function refuses a material change with no change summary.
--
-- 3. WORKER ACTIVATION MOVES FROM POST-REVIEW TO PRE-REVIEW. WPS-024's locked
--    product decision is that a worker becomes provisionally active on
--    submission and staff review happens afterwards. WPS-023 built the
--    opposite. Section 7 implements the change and is explicit about what it
--    does and does not weaken: the system gains the ability to grant a
--    PROVISIONAL capability, and gains no ability whatsoever to make a
--    DECISION. `system` still cannot reach `active`, `approved`, `rejected` or
--    `suspended`, and every one of WPS-023's state-machine assertions still
--    passes unedited. What changes is that capability no longer waits for a
--    human; what does not change is that a human still makes every judgement.
--
-- What this migration does NOT do
-- -------------------------------
-- It does not integrate Google Cloud Vision, Google Maps Platform, or any
-- payment gateway. All three are recorded in `private.subprocessors` with
-- `integration_status = 'approved_not_integrated'`, which is the accurate
-- state and is the entire point of publishing a register. It does not assert a
-- lawful basis as settled, because none has been confirmed by advice. It does
-- not claim compliance with any statute, certification or standard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1. THE DOCUMENT REGISTER
-- ---------------------------------------------------------------------------
--
-- Two tables, not one. A document is a stable thing with a key, an audience
-- and a purpose; a version is an immutable snapshot of words. Collapsing them
-- would mean either losing history on every republication or duplicating the
-- audience on every row and letting the two drift.

create table if not exists public.legal_documents (
  document_key      text primary key,
  category          text not null
    check (category in ('agreement', 'privacy', 'conduct', 'commerce', 'safety',
                        'register', 'platform')),
  -- `public` is readable signed-out; `all` is every account regardless of
  -- role. They are not synonyms and the distinction is load-bearing: `public`
  -- widens the signed-out surface that WPS-023 section 0 deliberately narrowed.
  audience          text not null
    check (audience in ('public', 'all', 'customer', 'worker', 'staff')),
  -- Whether the reader is asked to accept this document explicitly. Most of
  -- the corpus is incorporated by reference into the two agreements instead;
  -- twelve acceptance screens produce twelve unread documents.
  requires_acceptance boolean not null default false,
  authoritative_language text not null default 'en'
    check (authoritative_language in ('en', 'ar')),
  sort_order        integer not null,
  active            boolean not null default true,
  created_at        timestamptz not null default pg_catalog.now(),
  constraint legal_documents_key_check
    check (document_key ~ '^[a-z][a-z0-9_]{2,60}$')
);

comment on table public.legal_documents is
  'WPS-024 legal document register. One row per document; versions live separately.';

create table if not exists public.legal_document_versions (
  document_key      text not null references public.legal_documents(document_key),
  version           text not null,
  -- The hash of the canonicalised text of each language, computed over the
  -- title, summary, headings, paragraphs and bullets. Whitespace is normalised
  -- before hashing so a reflowed paragraph does not invalidate every
  -- acceptance ever recorded; words are not, because changing a word changes
  -- the agreement.
  content_hash_en   text not null check (content_hash_en ~ '^[0-9a-f]{64}$'),
  content_hash_ar   text not null check (content_hash_ar ~ '^[0-9a-f]{64}$'),
  -- Where the text actually lives, so an auditor reading this row can find the
  -- words it is a hash of.
  content_locator   text not null,
  published_at      date not null,
  effective_at      date not null,
  supersedes_version text,
  change_class      text not null
    check (change_class in ('initial', 'editorial', 'non_material', 'material', 'urgent')),
  change_summary_en text not null,
  change_summary_ar text not null,
  -- True when the Arabic is a faithful summary rather than a full parallel
  -- text. Surfaced to the reader on the page; never hidden in a footnote.
  arabic_is_summary boolean not null default false,
  status            text not null default 'published'
    check (status in ('draft', 'published', 'superseded', 'withdrawn')),
  created_at        timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (document_key, version),
  constraint legal_versions_version_check check (version ~ '^[0-9]+\.[0-9]+$'),
  constraint legal_versions_effective_check check (effective_at >= published_at),
  -- An initial version has nothing to supersede; anything else must say what
  -- it replaced, or the chain has a hole in it.
  constraint legal_versions_supersedes_check
    check ((change_class = 'initial') = (supersedes_version is null)),
  -- A material change with no summary is a material change nobody can read.
  constraint legal_versions_summary_check
    check (
      change_class in ('initial', 'editorial', 'non_material')
      or (pg_catalog.length(pg_catalog.btrim(change_summary_en)) >= 20
          and pg_catalog.length(pg_catalog.btrim(change_summary_ar)) >= 10)
    )
);

comment on table public.legal_document_versions is
  'WPS-024 immutable agreement versions. content_hash binds an acceptance to exact words.';

create index if not exists legal_document_versions_current_idx
  on public.legal_document_versions (document_key, effective_at desc)
  where status = 'published';

-- Only one published version per document at a time. Two would make "the
-- current version" ambiguous, and every re-consent decision downstream reads
-- that phrase.
create unique index if not exists legal_document_versions_single_published_idx
  on public.legal_document_versions (document_key)
  where status = 'published';

/**
 * A published version is immutable.
 *
 * Its words, its dates, its class and its summary are what somebody was shown
 * and what they agreed to. The only permitted change is `status` moving
 * forward — draft to published, published to superseded or withdrawn — because
 * that records what happened to the version without altering what it said.
 *
 * A version that can be edited after acceptance is not a version. It is a
 * moving target with a number on it, and every acceptance pointing at it
 * becomes a record of nothing.
 */
create or replace function private.legal_version_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'A legal version cannot be deleted' using errcode = '42501';
  end if;
  if new.document_key = old.document_key
     and new.version = old.version
     and new.content_hash_en = old.content_hash_en
     and new.content_hash_ar = old.content_hash_ar
     and new.content_locator = old.content_locator
     and new.published_at = old.published_at
     and new.effective_at = old.effective_at
     and new.change_class = old.change_class
     and new.change_summary_en = old.change_summary_en
     and new.change_summary_ar = old.change_summary_ar
     and new.arabic_is_summary = old.arabic_is_summary
     and new.supersedes_version is not distinct from old.supersedes_version
     and new.created_at = old.created_at
     and old.status is distinct from new.status
     and (
       (old.status = 'draft' and new.status in ('published', 'withdrawn'))
       or (old.status = 'published' and new.status in ('superseded', 'withdrawn'))
     ) then
    return new;
  end if;
  raise exception 'A published legal version cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists legal_document_versions_immutable on public.legal_document_versions;
create trigger legal_document_versions_immutable
  before update or delete on public.legal_document_versions
  for each row execute function private.legal_version_is_immutable();

revoke all on function private.legal_version_is_immutable() from public, anon, authenticated;

-- Publication history, append-only. Separate from the versions table because
-- "what this version says" and "what happened to this version" are different
-- questions and only the first is immutable in the strong sense.
create table if not exists private.legal_version_events (
  id            uuid primary key default extensions.gen_random_uuid(),
  document_key  text not null,
  version       text not null,
  event_type    text not null
    check (event_type in ('drafted', 'published', 'superseded', 'withdrawn')),
  actor_id      uuid references public.profiles(id),
  reason        text not null,
  -- `clock_timestamp()`, following WPS-023: `now()` is the transaction start,
  -- so publishing a version and superseding its predecessor in one transaction
  -- would record both at the same instant and lose their order.
  created_at    timestamptz not null default pg_catalog.clock_timestamp()
);

revoke all on table private.legal_version_events from public, anon, authenticated;

create or replace function private.legal_version_events_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Legal publication history is immutable' using errcode = '42501';
end;
$$;

drop trigger if exists legal_version_events_immutable on private.legal_version_events;
create trigger legal_version_events_immutable
  before update or delete on private.legal_version_events
  for each row execute function private.legal_version_events_immutable();

revoke all on function private.legal_version_events_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 2. THE ACCEPTANCE LEDGER
-- ---------------------------------------------------------------------------
--
-- WPS-022's `privacy_consent_records` answers "did this person consent to this
-- purpose". This answers a different question: "which exact text did this
-- person agree to, in which language, and can we still prove it". Both are
-- needed and neither subsumes the other — a purpose can outlive a dozen
-- document versions, and a document version can cover several purposes.

create table if not exists public.legal_acceptances (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  document_key      text not null references public.legal_documents(document_key),
  version           text not null,
  -- A decline is recorded as a decline. It is never stored as an acceptance,
  -- and inactivity never becomes one: there is no third value here that could
  -- be read as "probably agreed".
  decision          text not null check (decision in ('accepted', 'declined')),
  -- Which text they actually read. Recorded because English governs where the
  -- two disagree, and if a difference is ever found it must be knowable which
  -- one was in front of the person.
  accepted_language text not null check (accepted_language in ('en', 'ar')),
  -- sha256(user || document || version || content_hash || language || instant).
  -- Binds the person to the words. Recomputable from the row plus the register,
  -- so a tampered row is detectable rather than merely unlikely.
  acceptance_hash   text not null check (acceptance_hash ~ '^[0-9a-f]{64}$'),
  -- The hash of the text the CLIENT says it rendered, checked against the
  -- register before this row is written. A client that rendered stale text
  -- cannot record an acceptance of the current version.
  rendered_hash     text not null check (rendered_hash ~ '^[0-9a-f]{64}$'),
  source_surface    text not null
    check (source_surface in ('sign_up', 'onboarding', 'worker_onboarding',
                              'legal_centre', 'reconsent', 'privacy_center',
                              'verification', 'support', 'migration')),
  account_role      text check (account_role in ('customer', 'worker')),
  environment       text not null check (environment in ('local', 'staging', 'production')),
  -- Free text from a decline. Optional, bounded, and never shown to anyone but
  -- staff — a person explaining why they will not agree is not publishing.
  decline_reason    text,
  accepted_at       timestamptz not null default pg_catalog.clock_timestamp(),
  constraint legal_acceptances_version_check check (version ~ '^[0-9]+\.[0-9]+$'),
  -- One constraint rather than a column check plus a table check: Postgres
  -- auto-names a column check `<table>_<column>_check`, which is exactly the
  -- name a table-level constraint on the same column wants, and the two
  -- collide at creation time.
  constraint legal_acceptances_decline_reason_check
    check (
      decline_reason is null
      or (decision = 'declined'
          and pg_catalog.length(pg_catalog.btrim(decline_reason)) between 1 and 1000)
    ),
  foreign key (document_key, version)
    references public.legal_document_versions(document_key, version)
);

comment on table public.legal_acceptances is
  'WPS-024 append-only acceptance ledger. A decline is stored as a decline, never as consent.';

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, document_key, accepted_at desc);

/**
 * Append-only, with no exception at all.
 *
 * WPS-022's consent trigger permits exactly one update — stamping
 * `withdrawn_at` on a grant that has ended. This one permits none, because an
 * acceptance has no equivalent: a later decision is a new row, and the earlier
 * acceptance remains true as a statement about a moment. Nothing about it ever
 * needs to change.
 */
create or replace function private.legal_acceptance_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Acceptance history cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists legal_acceptances_immutable on public.legal_acceptances;
create trigger legal_acceptances_immutable
  before update or delete on public.legal_acceptances
  for each row execute function private.legal_acceptance_is_immutable();

revoke all on function private.legal_acceptance_is_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3. CONFIGURATION
-- ---------------------------------------------------------------------------
--
-- Follows `private.privacy_configuration`. Not registered in the WPS-017
-- configuration-domain registry for the same reason WPS-022 was not:
-- `private.staff_configuration_payload_valid` validates a closed set of
-- payload shapes and a new domain there would force that function to be
-- rewritten.

create table if not exists private.legal_configuration (
  singleton               boolean primary key default true,
  legal_centre_enabled    boolean not null default false,
  reconsent_enforced      boolean not null default false,
  -- Days a person may keep using affected functionality after a material
  -- version becomes effective before it is actually withheld. Zero means the
  -- gate applies immediately, which is what `urgent` needs.
  reconsent_grace_days    integer not null default 14
    check (reconsent_grace_days between 0 and 90),
  updated_at              timestamptz not null default pg_catalog.now(),
  constraint legal_configuration_singleton check (singleton)
);

insert into private.legal_configuration (singleton) values (true)
on conflict (singleton) do nothing;

revoke all on table private.legal_configuration from public, anon, authenticated;

create or replace function private.legal_config()
returns private.legal_configuration
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.legal_configuration where singleton
$$;

revoke all on function private.legal_config() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 4. WHAT A PERSON OWES
-- ---------------------------------------------------------------------------

/**
 * The current published version of a document, if there is one.
 *
 * `effective_at <= current_date` matters: a version can be published today and
 * take effect next month, and until it does, the previous version is what
 * governs and what people should be asked about.
 */
-- `returns setof`, NOT `returns public.legal_document_versions`.
--
-- A composite-returning SQL function yields ONE ROW OF NULLS when nothing
-- matches, not zero rows. Every `join lateral ... on true` downstream would
-- then produce a phantom obligation with a NULL version, which reads as
-- outstanding — so a document with no effective version would silently
-- become something every account owed and nobody could ever satisfy.
-- `setof` returns no rows, the inner lateral join drops the document, and the
-- absence of a version means the absence of an obligation.
create or replace function private.legal_current_version(p_document_key text)
returns setof public.legal_document_versions
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from public.legal_document_versions v
  where v.document_key = p_document_key
    and v.status = 'published'
    and v.effective_at <= current_date
  order by v.effective_at desc, v.version desc
  limit 1
$$;

revoke all on function private.legal_current_version(text) from public, anon, authenticated;

/**
 * The role WPS-024 evaluates an account against.
 *
 * Reads WPS-023's `intended_role`, which that specification is explicit is a
 * PREFERENCE and never an authorization fact. That is exactly the right use of
 * it: which agreement addresses you is a question about who you are trying to
 * be, not about what you are permitted to do.
 */
create or replace function private.legal_account_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.intended_role
  from public.account_onboarding o
  where o.user_id = p_user_id
$$;

revoke all on function private.legal_account_role(uuid) from public, anon, authenticated;

/**
 * Everything this account is addressed by, with what it has and has not
 * accepted.
 *
 * Customer and worker agreements are evaluated independently and deliberately:
 * a customer asked to re-accept Customer Terms must not be dragged through
 * Worker Terms, and an account that is both must satisfy both separately. That
 * falls out of the audience filter rather than being special-cased.
 */
create or replace function private.legal_obligations(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'documentKey', d.document_key,
        'version', v.version,
        'category', d.category,
        'audience', d.audience,
        'changeClass', v.change_class,
        'changeSummaryEn', v.change_summary_en,
        'changeSummaryAr', v.change_summary_ar,
        'effectiveAt', v.effective_at,
        'arabicIsSummary', v.arabic_is_summary,
        'acceptedVersion', latest.version,
        'acceptedAt', latest.accepted_at,
        'acceptedLanguage', latest.accepted_language,
        'lastDecision', latest.decision,
        -- Outstanding when the account has not ACCEPTED this exact version.
        -- A decline leaves it outstanding rather than resolving it, because a
        -- decline is not a way to make an obligation go away — it is a way to
        -- decline the functionality.
        'outstanding', coalesce(latest.decision, 'none') <> 'accepted'
                       or latest.version is distinct from v.version,
        -- Only a class that may restrict actually blocks. An editorial change
        -- that nobody re-accepted is outstanding and harmless.
        'blocking', (coalesce(latest.decision, 'none') <> 'accepted'
                     or latest.version is distinct from v.version)
                    and v.change_class in ('initial', 'material', 'urgent')
      )
      order by d.sort_order
    ),
    '[]'::jsonb
  )
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  left join lateral (
    select a.version, a.accepted_at, a.accepted_language, a.decision
    from public.legal_acceptances a
    where a.user_id = p_user_id and a.document_key = d.document_key
    order by a.accepted_at desc
    limit 1
  ) latest on true
  where d.active
    and d.requires_acceptance
    and (
      d.audience = 'all'
      or d.audience = private.legal_account_role(p_user_id)
    )
$$;

revoke all on function private.legal_obligations(uuid) from public, anon, authenticated;

/**
 * The single boolean every gate should read.
 *
 * True when nothing that may restrict is outstanding. Returns true when the
 * enforcement switch is off, so that turning re-consent on is a deliberate,
 * revocable act rather than something that silently locks every account out
 * the moment this migration lands.
 */
create or replace function private.legal_gate_satisfied(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (select c.reconsent_enforced from private.legal_configuration c where c.singleton)
      then true
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(private.legal_obligations(p_user_id)) o
      where (o.value ->> 'blocking')::boolean
    )
  end
$$;

revoke all on function private.legal_gate_satisfied(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5. READER AND ACCEPTANCE RPCS
-- ---------------------------------------------------------------------------

/**
 * The register: metadata for every published document.
 *
 * Returns no text. The text ships in the application bundle, so serving it
 * here would be a second copy that could disagree with the one on screen —
 * which is the one thing the hash exists to prevent.
 *
 * AUTHENTICATED ONLY, and that deserves an explanation, because a person
 * plainly must be able to read the terms before creating an account.
 *
 * They can. The corpus is bundled, so the signed-out reader renders the real,
 * complete text from the device with no server call at all — which is both
 * faster and strictly more private than fetching it. What the signed-out
 * reader does not get is the register: version numbers, effective dates and
 * hashes. Those matter only for deciding what somebody still owes, and nobody
 * owes anything until they have an account.
 *
 * The first draft granted this to `anon`. WPS-023's assertion that no function
 * outside its nine sanctioned reads is anon-executable failed, correctly:
 * WPS-023 section 0 closed that surface deliberately after finding fifteen
 * functions reachable through a residual PUBLIC grant, and reopening it for
 * data the client already has would have spent a real security property on
 * nothing. `app/legal/[topic].tsx` already made the same call for the same
 * reason.
 */
create or replace function public.get_legal_document_register()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'documentKey', d.document_key,
        'category', d.category,
        'audience', d.audience,
        'requiresAcceptance', d.requires_acceptance,
        'authoritativeLanguage', d.authoritative_language,
        'version', v.version,
        'publishedAt', v.published_at,
        'effectiveAt', v.effective_at,
        'changeClass', v.change_class,
        'changeSummaryEn', v.change_summary_en,
        'changeSummaryAr', v.change_summary_ar,
        'arabicIsSummary', v.arabic_is_summary,
        'contentHashEn', v.content_hash_en,
        'contentHashAr', v.content_hash_ar,
        'supersedesVersion', v.supersedes_version
      )
      order by d.sort_order
    ),
    '[]'::jsonb
  )
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  where d.active and d.audience <> 'staff'
$$;

comment on function public.get_legal_document_register() is
  'WPS-024 published register. Metadata only, authenticated only; the bundled text is what the hash binds.';

create or replace function public.get_my_legal_obligations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_obligations jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_obligations := private.legal_obligations(v_user);

  return pg_catalog.jsonb_build_object(
    'role', private.legal_account_role(v_user),
    'obligations', v_obligations,
    'satisfied', private.legal_gate_satisfied(v_user),
    'enforced', (select c.reconsent_enforced from private.legal_configuration c where c.singleton),
    'graceDays', (select c.reconsent_grace_days from private.legal_configuration c where c.singleton),
    'blocking', coalesce((
      select pg_catalog.jsonb_agg(o.value)
      from pg_catalog.jsonb_array_elements(v_obligations) o
      where (o.value ->> 'blocking')::boolean
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Record an acceptance.
 *
 * `p_rendered_hash` is the hash of the text the client actually put on screen.
 * Checking it here is the difference between "this person agreed to version
 * 1.1" and "this person tapped a button while a stale bundle showed them
 * version 1.0". A client running old code cannot record an acceptance of a
 * version it never displayed, and that failure is loud rather than silent.
 */
create or replace function public.accept_legal_document(
  p_document_key text,
  p_version text,
  p_language text,
  p_rendered_hash text,
  p_source_surface text default 'legal_centre'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_version public.legal_document_versions;
  v_expected text;
  v_role text;
  v_acceptance_hash text;
  v_at timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_language not in ('en', 'ar') then
    raise exception 'Unsupported language' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('legal_acceptance_write', v_user::text);

  select * into v_version
  from public.legal_document_versions v
  where v.document_key = p_document_key and v.version = p_version;

  if v_version.document_key is null then
    raise exception 'Unknown legal version' using errcode = '22023';
  end if;
  if v_version.status <> 'published' then
    raise exception 'That version is not published' using errcode = '22023';
  end if;
  if v_version.effective_at > current_date then
    raise exception 'That version is not yet effective' using errcode = '22023';
  end if;

  v_expected := case when p_language = 'ar'
    then v_version.content_hash_ar else v_version.content_hash_en end;
  if p_rendered_hash is distinct from v_expected then
    raise exception 'The document shown does not match the published version'
      using errcode = '22023';
  end if;

  v_role := private.legal_account_role(v_user);

  -- Binds person, document, exact words, language and instant into one value.
  -- `digest` lives in `extensions` and is not guaranteed present;
  -- `pg_catalog.sha256(bytea)` and `convert_to` are core and need no extension.
  v_acceptance_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      v_user::text || '|' || p_document_key || '|' || p_version || '|'
        || v_expected || '|' || p_language || '|' || v_at::text,
      'UTF8')),
    'hex');

  insert into public.legal_acceptances
    (user_id, document_key, version, decision, accepted_language, acceptance_hash,
     rendered_hash, source_surface, account_role, environment, accepted_at)
  values
    (v_user, p_document_key, p_version, 'accepted', p_language, v_acceptance_hash,
     p_rendered_hash, p_source_surface, v_role, private.platform_environment(), v_at);

  -- Keep WPS-022 in step. The consent purpose that names this document is
  -- moved to the accepted version, so the privacy centre and the legal centre
  -- never disagree about what someone agreed to. This is why WPS-024 extends
  -- that model instead of replacing it.
  update public.privacy_consent_purposes p
  set current_version = v_version.published_at::text
  where p.document_key = p_document_key and p.active
    and p.current_version <> v_version.published_at::text;

  return pg_catalog.jsonb_build_object(
    'documentKey', p_document_key,
    'version', p_version,
    'decision', 'accepted',
    'acceptedAt', v_at,
    'acceptanceHash', v_acceptance_hash
  );
end;
$$;

comment on function public.accept_legal_document(text, text, text, text, text) is
  'WPS-024 acceptance. Refuses when the rendered hash does not match the published version.';

/**
 * Record a decline.
 *
 * Exists as its own verb because the alternative — treating a decline as
 * "simply not accepting yet" — is how consent records become fiction. A person
 * who read a material change and said no has made a decision, and the ledger
 * says so.
 *
 * Returns the functionality that stops, so the screen showing the consequence
 * is reading it from the server rather than inventing it. A decline screen
 * that overstates the consequence is coercion.
 */
create or replace function public.decline_legal_document(
  p_document_key text,
  p_version text,
  p_language text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_version public.legal_document_versions;
  v_document public.legal_documents;
  v_expected text;
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_restrictions jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_language not in ('en', 'ar') then
    raise exception 'Unsupported language' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('legal_acceptance_write', v_user::text);

  select * into v_version
  from public.legal_document_versions v
  where v.document_key = p_document_key and v.version = p_version;
  if v_version.document_key is null or v_version.status <> 'published' then
    raise exception 'Unknown legal version' using errcode = '22023';
  end if;

  select * into v_document from public.legal_documents d where d.document_key = p_document_key;

  v_expected := case when p_language = 'ar'
    then v_version.content_hash_ar else v_version.content_hash_en end;

  insert into public.legal_acceptances
    (user_id, document_key, version, decision, accepted_language, acceptance_hash,
     rendered_hash, source_surface, account_role, environment, decline_reason, accepted_at)
  values
    (v_user, p_document_key, p_version, 'declined', p_language,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
       v_user::text || '|' || p_document_key || '|' || p_version || '|declined|' || v_at::text,
       'UTF8')), 'hex'),
     v_expected, 'reconsent', private.legal_account_role(v_user),
     private.platform_environment(), nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''), v_at);

  -- Only a class that may restrict produces a restriction. An editorial change
  -- someone declined costs them nothing, and the screen must not pretend
  -- otherwise.
  v_restrictions := case
    when v_version.change_class not in ('material', 'urgent') then '[]'::jsonb
    when v_document.audience = 'worker' then
      '["take_new_work","worker_dashboard"]'::jsonb
    when v_document.audience = 'customer' then
      '["create_booking"]'::jsonb
    else '["create_booking","take_new_work"]'::jsonb
  end;

  return pg_catalog.jsonb_build_object(
    'documentKey', p_document_key,
    'version', p_version,
    'decision', 'declined',
    'declinedAt', v_at,
    'restricts', v_restrictions,
    -- Stated in the payload rather than only in the policy, because the
    -- screen that shows a consequence must also show what survives it.
    'alwaysAvailable',
      '["read_records","export_data","support","appeals","close_account"]'::jsonb
  );
end;
$$;

comment on function public.decline_legal_document(text, text, text, text) is
  'WPS-024 decline. Never recorded as consent; returns only restrictions the class permits.';

create or replace function public.get_my_legal_acceptances(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(row_to_json(r) order by r.accepted_at desc)
    from (
      select a.document_key, a.version, a.decision, a.accepted_at,
             a.accepted_language, a.acceptance_hash, a.source_surface, a.account_role
      from public.legal_acceptances a
      where a.user_id = v_user
      order by a.accepted_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- SECTION 6. GOVERNANCE REGISTERS
-- ---------------------------------------------------------------------------

create table if not exists private.subprocessors (
  subprocessor_key    text primary key,
  display_name        text not null,
  purpose             text not null,
  data_categories     text[] not null,
  processing_location text not null,
  -- The distinction that makes this register worth publishing. A supplier that
  -- has been approved but has received no data is not a supplier that is
  -- processing your data, and collapsing the two would make the register a
  -- statement about intent rather than about fact.
  integration_status  text not null
    check (integration_status in ('in_use', 'approved_not_integrated', 'retired')),
  -- Whether the supplier's terms forbid using Warsha data to improve the
  -- supplier's own models. Not a boolean about a promise Warsha made — a
  -- boolean about a contract Warsha checked.
  training_prohibited boolean not null,
  agreement_status    text not null
    check (agreement_status in ('signed', 'pending', 'not_required', 'not_started')),
  governing_document  text not null,
  added_at            date not null,
  notes               text not null,
  constraint subprocessors_key_check check (subprocessor_key ~ '^[a-z][a-z0-9_]{2,60}$'),
  -- A supplier cannot be in use for identity data without the training
  -- prohibition confirmed. Written as a constraint rather than a policy note
  -- because a policy note does not stop an INSERT.
  constraint subprocessors_identity_training_check
    check (
      integration_status <> 'in_use'
      or not ('identity_documents' = any(data_categories))
      or training_prohibited
    )
);

comment on table private.subprocessors is
  'WPS-024 subprocessor register. approved_not_integrated means no data has reached it.';

revoke all on table private.subprocessors from public, anon, authenticated;

create table if not exists private.processing_activities (
  activity_key       text primary key,
  display_name       text not null,
  purpose            text not null,
  data_categories    text[] not null,
  data_subjects      text[] not null,
  recipients         text[] not null,
  -- The basis Warsha PROPOSES. Paired with `legal_review_status` because the
  -- honest thing to record before advice is what was proposed and that it is
  -- unconfirmed, following the pattern WPS-022 established for retention.
  proposed_basis     text not null,
  legal_review_status text not null default 'pending'
    check (legal_review_status in ('pending', 'in_review', 'approved', 'rejected')),
  retention_rule_key text,
  safeguards         text not null,
  authority          text not null,
  notes              text not null,
  constraint processing_activities_key_check check (activity_key ~ '^[a-z][a-z0-9_]{2,60}$')
);

comment on table private.processing_activities is
  'WPS-024 data processing register. proposed_basis is a proposal until legal_review_status says otherwise.';

revoke all on table private.processing_activities from public, anon, authenticated;

/**
 * Declared machine-learning uses.
 *
 * The `permitted_for_training` column carries a CHECK that pins it false for
 * identity data. That is the strongest available form of "SHALL NOT by
 * default": flipping it is not a configuration change a tired person can make
 * at midnight, it is a migration that has to be written, reviewed and
 * deployed — which is exactly the friction the AI Usage Policy promises.
 */
create table if not exists private.ai_use_declarations (
  use_key               text primary key,
  display_name          text not null,
  provider_key          text references private.subprocessors(subprocessor_key),
  processing_location   text not null check (processing_location in ('server', 'device', 'none')),
  status                text not null
    check (status in ('in_use', 'approved_not_integrated', 'prohibited')),
  covers_identity_data  boolean not null,
  permitted_for_training boolean not null default false,
  -- What this use may never determine. Published, and asserted by test against
  -- the code that could otherwise drift away from it.
  prohibited_decisions  text[] not null,
  human_confirmation_required boolean not null default true,
  governing_document    text not null,
  notes                 text not null,
  constraint ai_use_declarations_key_check check (use_key ~ '^[a-z][a-z0-9_]{2,60}$'),
  constraint ai_use_identity_training_check
    check (not (covers_identity_data and permitted_for_training)),
  constraint ai_use_human_confirmation_check
    check (human_confirmation_required),
  constraint ai_use_prohibited_not_empty_check
    check (pg_catalog.array_length(prohibited_decisions, 1) >= 1)
);

comment on table private.ai_use_declarations is
  'WPS-024 AI register. A CHECK, not a policy note, prevents training on identity data.';

revoke all on table private.ai_use_declarations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 7. PROVISIONAL WORKER ACTIVATION
-- ---------------------------------------------------------------------------
--
-- WPS-024's locked product decision: a worker becomes provisionally active on
-- submission and staff review happens afterwards. WPS-023 built the opposite,
-- and this section changes it.
--
-- What is being weakened, stated plainly rather than buried: a worker can now
-- take work before a human has looked at their documents. That is a real
-- reduction in assurance and it is a deliberate product trade. The reasoning is
-- in `docs/decisions/worker-provisional-activation.md`. The mitigation is that
-- the worker's profile does not describe them as verified until review is
-- done, and that a post-review finding can suspend them immediately.
--
-- What is NOT being weakened, and is worth being precise about:
--
--   * `system` gains the ability to grant a PROVISIONAL capability. It gains
--     no ability to make a DECISION. It still cannot reach `active`,
--     `approved`, `rejected` or `suspended` — every WPS-023 assertion on that
--     passes unedited.
--   * Provisional activation still requires gates. A smaller set, but a set:
--     documents uploaded, fields confirmed by the worker, certificate
--     submitted, agreements accepted, phone verified, not banned, no blocking
--     trust action. A worker who has submitted nothing activates nothing.
--   * Full `active` still requires a human. `worker_activation_gates` is
--     untouched, and `approved -> active` is still a staff transition.
--   * The worker still cannot move themselves anywhere near either state.

alter table public.account_onboarding
  drop constraint if exists account_onboarding_worker_state_check;

alter table public.account_onboarding
  add constraint account_onboarding_worker_state_check
  check (worker_state in (
    'account_created',
    'onboarding_incomplete',
    'identity_required',
    'identity_submitted',
    'identity_under_review',
    'criminal_record_required',
    'criminal_record_submitted',
    'criminal_record_under_review',
    -- WPS-024. Placed between submission and review because that is where it
    -- sits in the worker's experience: everything is in, nothing has been
    -- judged, and work can start.
    'provisionally_active',
    'correction_required',
    'manual_review',
    'rejected',
    'appeal_pending',
    'approved',
    'active',
    'suspended'
  ));

/**
 * The gates for PROVISIONAL activation.
 *
 * `worker_activation_gates` minus the three that require a human to have
 * decided something — `national_id_approved`, `criminal_record_approved`,
 * `identity_verification_approved` — plus the WPS-024 legal gate.
 *
 * Built by subtraction from the full set rather than written out again, so a
 * gate added to WPS-023 automatically applies here too. Writing a second list
 * would mean a future gate protecting full activation and silently not
 * protecting provisional activation, which is the more dangerous of the two.
 */
create or replace function private.worker_provisional_gates(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select pg_catalog.jsonb_object_agg(g.key, g.value)
    from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
    where g.key not in ('national_id_approved', 'criminal_record_approved',
                        'identity_verification_approved', 'provider_status_allowed')
  ) || pg_catalog.jsonb_build_object(
    'criminal_record_uploaded',
      coalesce((private.worker_activation_gates(p_user_id) ->> 'criminal_record_uploaded')::boolean, false),
    'legal_agreements_accepted', private.legal_gate_satisfied(p_user_id)
  )
$$;

comment on function private.worker_provisional_gates(uuid) is
  'WPS-024 pre-review gates. The full set minus staff decisions, plus the legal gate.';

revoke all on function private.worker_provisional_gates(uuid) from public, anon, authenticated;

/**
 * Which tier of capability an account holds.
 *
 * `none`, `provisional` or `full`. Exposed so a surface can tell a customer
 * "review in progress" honestly, rather than the platform having to choose
 * between calling an unreviewed worker verified and calling them nothing.
 */
create or replace function private.worker_capability_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when o.worker_state = 'active'
        and not exists (
          select 1 from pg_catalog.jsonb_each(private.worker_activation_gates(p_user_id)) g
          where g.value = 'false'::jsonb)
        then 'full'
      when o.worker_state = 'provisionally_active'
        and not exists (
          select 1 from pg_catalog.jsonb_each(private.worker_provisional_gates(p_user_id)) g
          where g.value = 'false'::jsonb)
        then 'provisional'
      else 'none'
    end
    from public.account_onboarding o
    where o.user_id = p_user_id
  ), 'none')
$$;

revoke all on function private.worker_capability_tier(uuid) from public, anon, authenticated;

/**
 * The single worker authorization answer, amended.
 *
 * Was: every full gate passed AND a human activated. Now: either that, or
 * every provisional gate passed AND the account reached `provisionally_active`.
 *
 * WPS-023's assertions on this function all concern accounts that hold neither
 * — a fresh account, and an `approved` account that nobody activated — and
 * both still return false, because `approved` is neither `active` nor
 * `provisionally_active`.
 */
create or replace function private.worker_capability_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.worker_capability_tier(p_user_id) in ('provisional', 'full')
$$;

comment on function private.worker_capability_active(uuid) is
  'WPS-024 worker authorization: full activation by a human, or provisional activation by submission.';

/**
 * The state machine, amended.
 *
 * Three additions, each stated with what it does not permit:
 *
 *   * worker: `identity_submitted -> criminal_record_submitted`. The worker
 *     can now reach the certificate step directly instead of waiting for staff
 *     to place them in `criminal_record_required`. WPS-023 kept the two
 *     reviews in order by making the worker wait; WPS-024 keeps them in order
 *     by reviewing both after activation instead. `criminal_record_required`
 *     remains reachable so a reviewer can still send someone back for one.
 *   * system: submission states -> `provisionally_active`. The gates are
 *     checked by the caller, and the caller is the only function that holds
 *     execute on the transition.
 *   * staff: `provisionally_active ->` any review or adverse state. This is
 *     the post-activation review the locked decision requires.
 *
 * `system` still cannot reach `active`, `approved`, `rejected` or `suspended`.
 * That is the property WPS-023's assertions were protecting and it survives
 * intact; what changes is that granting a provisional capability is no longer
 * classified as a decision, because it is not one.
 */
create or replace function private.worker_transition_allowed(
  p_from text,
  p_to text,
  p_actor_kind text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_actor_kind = 'worker' then
      (p_from = 'account_created' and p_to = 'onboarding_incomplete')
      or (p_from in ('onboarding_incomplete', 'correction_required') and p_to = 'identity_required')
      or (p_from in ('account_created', 'onboarding_incomplete', 'identity_required',
                     'correction_required')
          and p_to = 'identity_submitted')
      -- WPS-024: `identity_submitted` added. The worker no longer waits for a
      -- reviewer to unlock the certificate step.
      or (p_from in ('identity_submitted', 'criminal_record_required', 'correction_required')
          and p_to = 'criminal_record_submitted')
      or (p_from = 'rejected' and p_to = 'appeal_pending')
    when p_actor_kind = 'staff' then
      (p_from = 'identity_submitted' and p_to in ('identity_under_review', 'correction_required', 'manual_review'))
      or (p_from = 'identity_under_review' and p_to in ('criminal_record_required', 'correction_required', 'manual_review', 'rejected'))
      or (p_from = 'criminal_record_submitted' and p_to in ('criminal_record_under_review', 'correction_required', 'manual_review'))
      or (p_from = 'criminal_record_under_review' and p_to in ('approved', 'correction_required', 'manual_review', 'rejected'))
      -- WPS-024: review of a worker who is already working. Every outcome
      -- WPS-023 allowed from a submission state is allowed from here, and
      -- `suspended` is added because the whole point of post-activation review
      -- is being able to stop someone who is already taking jobs.
      or (p_from = 'provisionally_active' and p_to in (
            'identity_under_review', 'criminal_record_under_review',
            'correction_required', 'manual_review', 'approved', 'rejected', 'suspended'))
      or (p_from = 'manual_review' and p_to in ('approved', 'correction_required', 'rejected'))
      or (p_from = 'appeal_pending' and p_to in ('approved', 'rejected', 'correction_required', 'manual_review'))
      or (p_from = 'approved' and p_to in ('active', 'suspended'))
      or (p_from = 'active' and p_to = 'suspended')
      or (p_from = 'suspended' and p_to in ('active', 'rejected'))
    when p_actor_kind = 'system' then
      -- Account creation, as before.
      (p_from is null and p_to = 'account_created')
      -- WPS-024: provisional activation. Reachable only from a state where the
      -- worker has actually submitted something, and only to
      -- `provisionally_active` — never to a state that expresses a judgement.
      or (p_from in ('criminal_record_submitted', 'identity_submitted', 'correction_required')
          and p_to = 'provisionally_active')
    else false
  end
$$;

revoke all on function private.worker_transition_allowed(text, text, text) from public, anon, authenticated;

comment on function private.worker_transition_allowed(text, text, text) is
  'WPS-024 amended state machine. system may grant a provisional capability and may make no decision.';

/**
 * Attempt provisional activation.
 *
 * Called at the end of the submission RPCs. Silent when the gates are not all
 * satisfied — this is an opportunistic promotion, not a request that can fail,
 * and raising here would turn "your certificate was uploaded" into an error
 * because an unrelated profile field was blank.
 *
 * Returns true only when it actually promoted, so a caller can tell the
 * difference between "already active" and "just activated" without inferring
 * it from the state.
 */
create or replace function private.worker_try_provisional_activation(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_blocked integer;
begin
  select o.worker_state into v_state
  from public.account_onboarding o where o.user_id = p_user_id;

  if v_state is null
     or v_state not in ('criminal_record_submitted', 'identity_submitted', 'correction_required') then
    return false;
  end if;

  -- The kill switch WPS-023 registered for worker activation governs this too.
  -- A stop control that only stops the slower of the two activation paths is
  -- not a stop control.
  if exists (
    select 1 from private.staff_kill_switches k
    where k.switch_key = 'worker_activation' and k.active
  ) then
    return false;
  end if;

  select pg_catalog.count(*)::integer into v_blocked
  from pg_catalog.jsonb_each(private.worker_provisional_gates(p_user_id)) g
  where g.value = 'false'::jsonb;

  if v_blocked > 0 then
    return false;
  end if;

  perform private.worker_transition(
    p_user_id, 'provisionally_active', null, 'system',
    'provisional_activation',
    'Your application is complete and you can start taking work. Our team will review it.');

  return true;
end;
$$;

revoke all on function private.worker_try_provisional_activation(uuid) from public, anon, authenticated;

comment on function private.worker_try_provisional_activation(uuid) is
  'WPS-024 opportunistic provisional activation. Silent when a gate is unmet; never grants a decision.';

/**
 * Certificate submission, amended to attempt provisional activation.
 *
 * The body is WPS-023's, unchanged, with one call added at the end. Restated
 * in full rather than patched because Postgres has no way to append to a
 * function body, and a second wrapper function would leave two entry points
 * where WPS-023's tests exercise one.
 */
create or replace function public.submit_my_criminal_record(
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_issue_date date,
  p_content_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('worker_certificate_upload', v_user::text);

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  if p_storage_path is null or p_storage_path !~ ('^' || v_user::text || '/') then
    raise exception 'A certificate must be stored under your own account path'
      using errcode = '42501';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic') then
    raise exception 'Unsupported certificate format' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 8388608 then
    raise exception 'Certificate exceeds the maximum size' using errcode = '22023';
  end if;
  if p_issue_date is not null and p_issue_date > current_date then
    raise exception 'A certificate cannot be issued in the future' using errcode = '22023';
  end if;

  update public.worker_criminal_record_submissions
  set is_current = false
  where provider_id = v_provider and is_current;

  insert into public.worker_criminal_record_submissions
    (provider_id, storage_path, mime_type, size_bytes, issue_date, content_hash,
     status, is_current)
  values
    (v_provider, p_storage_path, p_mime_type, p_size_bytes, p_issue_date, p_content_hash,
     'submitted', true);

  perform private.worker_transition(
    v_user, 'criminal_record_submitted', v_user, 'worker',
    'criminal_record_submitted',
    'Your certificate was received and is waiting for review.');

  -- WPS-024. Everything is in; the worker does not wait for a person.
  perform private.worker_try_provisional_activation(v_user);

  return public.get_my_onboarding_state();
end;
$$;

comment on function public.submit_my_criminal_record(text, text, bigint, date, text) is
  'WPS-024 certificate submission. Attempts provisional activation; never records an approval.';

-- ---------------------------------------------------------------------------
-- SECTION 8. STAFF GOVERNANCE SURFACES
-- ---------------------------------------------------------------------------

/**
 * Publish a version.
 *
 * Refuses more than it accepts, on purpose. A material change with no summary,
 * a version that supersedes nothing, a duplicate version, an effective date
 * before publication — each is a way for the register to stop meaning what it
 * says, and each is refused here rather than discovered later by somebody
 * trying to work out what a person actually agreed to.
 */
create or replace function public.staff_publish_legal_version(
  p_document_key text,
  p_version text,
  p_content_hash_en text,
  p_content_hash_ar text,
  p_change_class text,
  p_change_summary_en text,
  p_change_summary_ar text,
  p_effective_at date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('publish_legal_version');
  v_previous public.legal_document_versions;
  v_document public.legal_documents;
begin
  select * into v_document from public.legal_documents d where d.document_key = p_document_key;
  if v_document.document_key is null then
    raise exception 'Unknown legal document' using errcode = '22023';
  end if;
  if p_version !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'A version must be major.minor' using errcode = '22023';
  end if;
  if exists (select 1 from public.legal_document_versions v
             where v.document_key = p_document_key and v.version = p_version) then
    raise exception 'That version already exists' using errcode = '22023';
  end if;
  if p_change_class not in ('editorial', 'non_material', 'material', 'urgent') then
    raise exception 'Unknown change class' using errcode = '22023';
  end if;
  if p_effective_at < current_date then
    raise exception 'A version cannot take effect in the past' using errcode = '22023';
  end if;
  if p_change_class in ('material', 'urgent')
     and pg_catalog.length(pg_catalog.btrim(coalesce(p_change_summary_en, ''))) < 20 then
    raise exception 'A material change requires a change summary' using errcode = '22023';
  end if;

  select * into v_previous from private.legal_current_version(p_document_key);
  if v_previous.document_key is null then
    raise exception 'No published version exists to supersede' using errcode = '22023';
  end if;

  insert into public.legal_document_versions
    (document_key, version, content_hash_en, content_hash_ar, content_locator,
     published_at, effective_at, supersedes_version, change_class,
     change_summary_en, change_summary_ar, arabic_is_summary, status)
  values
    (p_document_key, p_version, p_content_hash_en, p_content_hash_ar,
     'src/legal/legal-corpus.ts', current_date, p_effective_at, v_previous.version,
     p_change_class, p_change_summary_en, p_change_summary_ar,
     v_previous.arabic_is_summary, 'draft');

  -- Supersede first, then publish. The partial unique index permits exactly one
  -- published row per document, so the other order would collide — and that
  -- collision is the index doing its job.
  update public.legal_document_versions
  set status = 'superseded'
  where document_key = p_document_key and version = v_previous.version;

  update public.legal_document_versions
  set status = 'published'
  where document_key = p_document_key and version = p_version;

  insert into private.legal_version_events (document_key, version, event_type, actor_id, reason)
  values
    (p_document_key, v_previous.version, 'superseded', v_actor,
     'Superseded by ' || p_version),
    (p_document_key, p_version, 'published', v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'publish_legal_version', 'publish', 'legal_document', null,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'documentKey', p_document_key, 'version', p_version,
      'changeClass', p_change_class, 'supersedes', v_previous.version));

  return pg_catalog.jsonb_build_object(
    'documentKey', p_document_key,
    'version', p_version,
    'supersedes', v_previous.version,
    'changeClass', p_change_class,
    'effectiveAt', p_effective_at,
    'forcesReconsent', p_change_class in ('material', 'urgent'));
end;
$$;

comment on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text) is
  'WPS-024 versioning. Refuses a material change with no summary and a version that supersedes nothing.';

/**
 * The governance overview.
 *
 * Counts and states, not personal data. A reviewer needs to know that eleven
 * accounts have declined the new Worker Terms; they do not need to know which
 * eleven, and this function cannot tell them.
 */
create or replace function public.staff_legal_governance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('review_legal_governance');
begin
  return pg_catalog.jsonb_build_object(
    'documents', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentKey', d.document_key,
        'category', d.category,
        'audience', d.audience,
        'requiresAcceptance', d.requires_acceptance,
        'version', v.version,
        'changeClass', v.change_class,
        'effectiveAt', v.effective_at,
        'versionCount', (select pg_catalog.count(*) from public.legal_document_versions x
                         where x.document_key = d.document_key),
        'accepted', (select pg_catalog.count(*) from public.legal_acceptances a
                     where a.document_key = d.document_key and a.version = v.version
                       and a.decision = 'accepted'),
        'declined', (select pg_catalog.count(*) from public.legal_acceptances a
                     where a.document_key = d.document_key and a.version = v.version
                       and a.decision = 'declined')
      ) order by d.sort_order), '[]'::jsonb)
      from public.legal_documents d
      join lateral (select * from private.legal_current_version(d.document_key)) v on true
      where d.active),
    'subprocessors', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', s.subprocessor_key, 'name', s.display_name,
        'status', s.integration_status, 'trainingProhibited', s.training_prohibited,
        'agreementStatus', s.agreement_status) order by s.subprocessor_key), '[]'::jsonb)
      from private.subprocessors s),
    'processingActivities', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', p.activity_key, 'name', p.display_name,
        'reviewStatus', p.legal_review_status) order by p.activity_key), '[]'::jsonb)
      from private.processing_activities p),
    'aiUses', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', a.use_key, 'name', a.display_name, 'status', a.status,
        'coversIdentityData', a.covers_identity_data,
        'permittedForTraining', a.permitted_for_training) order by a.use_key), '[]'::jsonb)
      from private.ai_use_declarations a),
    'configuration', pg_catalog.jsonb_build_object(
      'legalCentreEnabled', (select c.legal_centre_enabled from private.legal_configuration c where c.singleton),
      'reconsentEnforced', (select c.reconsent_enforced from private.legal_configuration c where c.singleton),
      'graceDays', (select c.reconsent_grace_days from private.legal_configuration c where c.singleton)),
    'actor', v_actor
  );
end;
$$;

comment on function public.staff_legal_governance_overview() is
  'WPS-024 governance overview. Counts and states only; no reviewer learns who declined.';

-- ---------------------------------------------------------------------------
-- SECTION 9. RLS AND GRANTS
-- ---------------------------------------------------------------------------

alter table public.legal_documents enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.legal_acceptances enable row level security;

-- Authenticated only, for the same reason `get_legal_document_register` is:
-- the signed-out reader renders the bundled corpus and needs nothing from
-- here, so opening the table to `anon` would widen the signed-out surface to
-- serve a client that is not asking.
drop policy if exists legal_documents_readable on public.legal_documents;
create policy legal_documents_readable on public.legal_documents
  for select to authenticated
  using (active and audience <> 'staff');

drop policy if exists legal_versions_readable on public.legal_document_versions;
create policy legal_versions_readable on public.legal_document_versions
  for select to authenticated
  using (exists (
    select 1 from public.legal_documents d
    where d.document_key = legal_document_versions.document_key
      and d.active and d.audience <> 'staff'));

-- An acceptance is readable only by the person it is about. Staff reach counts
-- through `staff_legal_governance_overview`, which returns no identity — a
-- reviewer establishing that someone declined has no business knowing who.
drop policy if exists legal_acceptances_own on public.legal_acceptances;
create policy legal_acceptances_own on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Revoke first, then grant exactly SELECT.
--
-- A new table in `public` inherits Supabase's default privileges, which give
-- the client roles everything — including TRUNCATE, REFERENCES and TRIGGER.
-- `grant select` is additive and would leave all of that in place. WPS-022
-- asserts the absence of those privileges across every public table as a
-- property, and it caught this: three tables created here failed that
-- assertion until these revokes were added.
--
-- Every write goes through a SECURITY DEFINER function that checks the hash,
-- the publication state and the effective date. A client that could INSERT
-- here could record an acceptance of text it never displayed, which is the one
-- thing this whole subsystem exists to prevent.
revoke all on table public.legal_documents from public, anon, authenticated;
revoke all on table public.legal_document_versions from public, anon, authenticated;
revoke all on table public.legal_acceptances from public, anon, authenticated;

grant select on table public.legal_documents to authenticated;
grant select on table public.legal_document_versions to authenticated;
grant select on table public.legal_acceptances to authenticated;

revoke all on function public.get_legal_document_register() from public;
revoke all on function public.get_my_legal_obligations() from public;
revoke all on function public.accept_legal_document(text, text, text, text, text) from public;
revoke all on function public.decline_legal_document(text, text, text, text) from public;
revoke all on function public.get_my_legal_acceptances(integer) from public;
revoke all on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text) from public;
revoke all on function public.staff_legal_governance_overview() from public;
revoke all on function public.submit_my_criminal_record(text, text, bigint, date, text) from public;

-- Every WPS-024 function requires an account. The signed-out legal reader uses
-- the bundled corpus and makes no call, so WPS-023's nine sanctioned signed-out
-- reads stay nine. The pgTAP suite asserts that as a property.
grant execute on function public.get_legal_document_register() to authenticated;
grant execute on function public.get_my_legal_obligations() to authenticated;
grant execute on function public.accept_legal_document(text, text, text, text, text) to authenticated;
grant execute on function public.decline_legal_document(text, text, text, text) to authenticated;
grant execute on function public.get_my_legal_acceptances(integer) to authenticated;
grant execute on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text) to authenticated;
grant execute on function public.staff_legal_governance_overview() to authenticated;
grant execute on function public.submit_my_criminal_record(text, text, bigint, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 10. SEED — THE DOCUMENT REGISTER
-- ---------------------------------------------------------------------------

insert into public.legal_documents
  (document_key, category, audience, requires_acceptance, authoritative_language, sort_order)
values
  ('customer_terms', 'agreement', 'customer', true, 'en', 1),
  ('worker_terms', 'agreement', 'worker', true, 'en', 2),
  ('privacy_policy', 'privacy', 'all', true, 'en', 3),
  ('worker_verification_policy', 'privacy', 'worker', true, 'en', 4),
  ('acceptable_use_policy', 'conduct', 'all', false, 'en', 5),
  ('worker_code_of_conduct', 'conduct', 'worker', false, 'en', 6),
  ('content_policy', 'conduct', 'all', false, 'en', 7),
  ('intellectual_property_policy', 'conduct', 'all', false, 'en', 8),
  ('trust_safety_policy', 'safety', 'all', false, 'en', 9),
  ('appeals_policy', 'safety', 'all', false, 'en', 10),
  ('cancellation_policy', 'commerce', 'all', false, 'en', 11),
  ('refund_policy', 'commerce', 'all', false, 'en', 12),
  ('ai_usage_policy', 'privacy', 'all', false, 'en', 13),
  ('ocr_usage_policy', 'privacy', 'worker', false, 'en', 14),
  ('location_data_policy', 'privacy', 'all', false, 'en', 15),
  ('data_processing_policy', 'privacy', 'all', false, 'en', 16),
  ('data_retention_policy', 'privacy', 'all', false, 'en', 17),
  ('cookie_policy', 'privacy', 'public', false, 'en', 18),
  ('subprocessor_register', 'register', 'public', false, 'en', 19),
  ('data_processing_register', 'register', 'public', false, 'en', 20),
  ('data_retention_register', 'register', 'public', false, 'en', 21),
  ('incident_response_policy', 'platform', 'public', false, 'en', 22),
  ('security_disclosure_policy', 'platform', 'public', false, 'en', 23),
  ('accessibility_statement', 'platform', 'public', false, 'en', 24),
  ('version_history', 'platform', 'public', false, 'en', 25),
  ('legal_contact', 'platform', 'public', false, 'en', 26)
on conflict (document_key) do nothing;

-- Version 1.0 of everything. The hashes are computed from `src/legal/` by
-- `scripts/wps024-legal-compliance-governance.test.mts`, which fails if the
-- corpus and this register ever disagree. That test is the only thing holding
-- these two files together and it is meant to be.
insert into public.legal_document_versions
  (document_key, version, content_hash_en, content_hash_ar, content_locator,
   published_at, effective_at, supersedes_version, change_class,
   change_summary_en, change_summary_ar, arabic_is_summary, status)
values
  ('customer_terms', '1.0', 'd6ec64e8adc7dab0b43091a0a41fd73811a8f0df216047c5d41cc9dbed3ca079', 'b4d838b0807770ccc19126a8f972e80519300cf1134437fe2ebbc2f67651ac36', 'src/legal/legal-corpus-agreements.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the Warsha customer agreement.', 'أول نسخة منشورة من اتفاق العميل مع ورشة.', false, 'published'),
  ('worker_terms', '1.0', '58eba2506edf2ed2e47a02e996f281b64be318f417cfdcf2cb0da64df17a7687', 'e1eb8abfdf38513f7788b53e82c9aa071dfb0a9ecf122350abbe57a93eae962e', 'src/legal/legal-corpus-agreements.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the Warsha worker agreement.', 'أول نسخة منشورة من اتفاق الصنايعي مع ورشة.', false, 'published'),
  ('privacy_policy', '1.0', '079e38df734fd37032ce50f37ca871fbe1faaa1ebb72a1d5bd0f5d24e1cb762f', '01abfdaa0d7b50e980004de383a3a1a469a37fce6f38b6b9a1720d68119d035e', 'src/legal/legal-corpus-agreements.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the Warsha privacy policy.', 'أول نسخة منشورة من سياسة الخصوصية بتاعة ورشة.', false, 'published'),
  ('worker_verification_policy', '1.0', '243c8b8d7aa94d9457eb71f2486be4b2724e2e70195e0637ef36ece952c0d82f', 'e049273bd63d38b988d391a402c1f8e14df9c4514344160f370111350f198847', 'src/legal/legal-corpus-agreements.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the worker verification policy.', 'أول نسخة منشورة من سياسة التحقق من الصنايعي.', false, 'published'),
  ('acceptable_use_policy', '1.0', 'fde24ffda8fcbad3cdcb4bac86b5fccd80335d8a8803b485a2943fc26f09b891', 'a3f2c04f81010c673c7bbbef7327a7721e7f4dfbdebdb0b0bf0c3e514eaa77cb', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the acceptable use policy.', 'أول نسخة منشورة من سياسة الاستخدام المقبول.', false, 'published'),
  ('worker_code_of_conduct', '1.0', '84b1edcf540afd631a671c152388616df1df53d71f570b360cb1f20275fefc7d', '8a732be9f318b67deac7429dc863a06c806a2a8d2e39077ee3af044039e498a0', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the worker code of conduct.', 'أول نسخة منشورة من ميثاق سلوك الصنايعي.', false, 'published'),
  ('content_policy', '1.0', 'ebaa44fd58b038a0f7610baa8c44f5ed01320d07dc8d590f24e44b85d736029c', 'dbf79a6d56aca830fe90443fcb97ec203d206316a4348bff924d19fa3e478b52', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the content policy.', 'أول نسخة منشورة من سياسة المحتوى.', false, 'published'),
  ('intellectual_property_policy', '1.0', '951814dfdbaee0dad1b0dcf1d0c5ed0ced5f4fc41092ebac8a01b8aba3227efc', '8be32f427188f87420e18f492757357eccf387b8c3b17642290981f963ed708b', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the copyright and intellectual property policy.', 'أول نسخة منشورة من سياسة حقوق النشر والملكية الفكرية.', false, 'published'),
  ('trust_safety_policy', '1.0', '47ff8557f2353690a96cf86eb10b84b56a631c205fae11ab73f0741d855a6fff', 'da7f7f146f7e8572242df860504a2041adcdcc890073f2bd6da003b9be4b9ab5', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the trust and safety policy.', 'أول نسخة منشورة من سياسة الثقة والأمان.', false, 'published'),
  ('appeals_policy', '1.0', '007150d15b2293c3b681d2ae3ccce86553a777214fc5a858127e3bec4043f457', '34b249173a7407100051e342f62a9134f49177c263934b7360b9d96b66acdbcb', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the appeals policy.', 'أول نسخة منشورة من سياسة الاستئناف.', false, 'published'),
  ('cancellation_policy', '1.0', '085db6e4252c387b302512dcafaefda9d47afb5ea43ea0be9c79e42d6adcd175', '323c49a9bcfda2c8415a2d8abfba1302f897e391deb4d08675cb1ec298e99f20', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the cancellation policy.', 'أول نسخة منشورة من سياسة الإلغاء.', false, 'published'),
  ('refund_policy', '1.0', '112ed0028ef2afcb832e1fc7f01cea4d82feed4283f4d4e372e4af9b188c6d60', '75fbbf45c336af6b5b8a8a9e70c6fde92965cf681e119d8c29933d0f9dbe8725', 'src/legal/legal-corpus-conduct.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the refund policy.', 'أول نسخة منشورة من سياسة الاسترداد.', false, 'published'),
  ('ai_usage_policy', '1.0', '4c7067c23c50c710573bad1372977f5d33c20ef7e3b239352d7b8c62a8de32c1', 'ae845a2555b24af62983703b3c597dd2231856548b394f7ad5799de4099aa0a6', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the AI usage policy.', 'أول نسخة منشورة من سياسة استخدام الذكاء الاصطناعي.', true, 'published'),
  ('ocr_usage_policy', '1.0', '930934df1ceaf159e46f9d648585e8a39fbe89f2c0495c50ad81b2ca89b969fa', 'b88c353442d6fb99f8088fa2ebc876e9c9d068230729dba66e0ff5918ed09590', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the OCR usage policy.', 'أول نسخة منشورة من سياسة استخدام التعرف الضوئي على الحروف.', true, 'published'),
  ('location_data_policy', '1.0', '55472f316200bba87645914ba42db11d59b63ffd5162e8137faa29ffc84f8b7d', '60b8299711d6fa7e671112a32bf14c274e75c1608db39167e19425b4366716d8', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the location data policy.', 'أول نسخة منشورة من سياسة بيانات الموقع.', true, 'published'),
  ('data_processing_policy', '1.0', 'cd55ba510e30b8cc4d5814e6103f09753e1536cef8dd7143c73f2f8c928700fe', '0f112a2d6081c3b5a21fcd9a6b1b34d34cb07ddbf084cda12c229258c6bad14b', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the data processing policy.', 'أول نسخة منشورة من سياسة معالجة البيانات.', true, 'published'),
  ('data_retention_policy', '1.0', '7e7d4089ba7a69104fb6c45672e5481f19ea3742c710cae2448c0ce526f16bdb', 'ad969b284a1574301903ba801bee1c38d794fd2ebce5940a95e8c789187d183b', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the data retention policy.', 'أول نسخة منشورة من سياسة الاحتفاظ بالبيانات.', true, 'published'),
  ('cookie_policy', '1.0', 'db61f7c020034e4d724a1e369bf515928aba57d5846dd756c483479861a2c045', '6d2557aed614d0f3224cc2dd047e8f8a2910daa309a944215090cd60ce73abba', 'src/legal/legal-corpus-data.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the cookie policy.', 'أول نسخة منشورة من سياسة الكوكيز.', true, 'published'),
  ('subprocessor_register', '1.0', '12a8a37988280fb2054edde7d4bb7f2b38e4467f60b08cbd0632dcd2932a48e0', '3e33d7bbbf6dfeb8bc8904942d7f651a27a01219da9222a82735c1ab387ccd78', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the subprocessor register.', 'أول نسخة منشورة من سجل المعالِجات الفرعية.', true, 'published'),
  ('data_processing_register', '1.0', '597f33928326184ddbdb94725d6a278c0c5e37812efe72f898014b0147023d00', '99bd41d3939a56f7588f3434c2556c7c86440c8f32043fbd01c29403c9d60189', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the data processing register.', 'أول نسخة منشورة من سجل معالجة البيانات.', true, 'published'),
  ('data_retention_register', '1.0', '338ee6b445c20112401959f50deecd364827d51de1aa5301c03e1f1861772b88', 'a65a2868ddd9c2aaac3547df150442aeec8c178bff8190db01b73a3debffde16', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the data retention register.', 'أول نسخة منشورة من سجل الاحتفاظ بالبيانات.', true, 'published'),
  ('incident_response_policy', '1.0', '47a72a1c5afbc5a25cfc5ccfbc89bf8dfd84b42e039230edb83e91fed9048cfd', '1001140e0f945e75b9dd523905e816f8351b4b0eafb1e3f3fae92175162b6f53', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the incident response policy.', 'أول نسخة منشورة من سياسة الاستجابة للحوادث.', true, 'published'),
  ('security_disclosure_policy', '1.0', '66c5db95bc8abccddef0584d6d58e8a31fd8b277f6113d4f50371418dc85b460', '39e9eb28129025f0d6323692e3c462620968c31f754cddaca65c145462664d01', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the security disclosure policy.', 'أول نسخة منشورة من سياسة الإفصاح الأمني.', true, 'published'),
  ('accessibility_statement', '1.0', '6186ac61a083d88484012c8c2cb065a9d2103a1432f5bb4eb60cfb896a1a0351', '921470db29fca51b063199b440944c03a4d67866830b1f44312feb0aa7dcb8d9', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the accessibility statement.', 'أول نسخة منشورة من بيان إمكانية الوصول.', true, 'published'),
  ('version_history', '1.0', '225b7e5b7d59651cbc37e748622ffde7525f7b8c2bc2b9efc49ce819255c682f', '164c0f35db5dd397bdaeb6c01121eec00b024252c33444aa67ceede946ae56ad', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the version history.', 'أول نسخة منشورة من سجل النسخ.', true, 'published'),
  ('legal_contact', '1.0', '9caf958c63e0c70c02a1b2b5692512231834f30a74ef35c37f5f23dd8fb42be4', '3045f735918be7304a294d23f0816c26d2cd4193e68d04350efe154b268c2f12', 'src/legal/legal-corpus-registers.ts', '2026-08-06', '2026-08-06', null, 'initial', 'First published version of the legal contact page.', 'أول نسخة منشورة من صفحة التواصل القانوني.', true, 'published')
on conflict (document_key, version) do nothing;

insert into private.legal_version_events (document_key, version, event_type, actor_id, reason)
select v.document_key, v.version, 'published', null,
       'WPS-024 initial publication of the Warsha legal corpus.'
from public.legal_document_versions v
where v.status = 'published'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 11. SEED — SUBPROCESSORS, ACTIVITIES AND AI USES
-- ---------------------------------------------------------------------------

insert into private.subprocessors
  (subprocessor_key, display_name, purpose, data_categories, processing_location,
   integration_status, training_prohibited, agreement_status, governing_document,
   added_at, notes)
values
  ('supabase', 'Supabase',
   'Database, authentication, file storage and realtime messaging.',
   array['account', 'bookings', 'messages', 'payments', 'addresses', 'identity_documents',
         'criminal_records'],
   'Managed cloud infrastructure; region recorded in operational configuration.',
   'in_use', true, 'pending', 'subprocessor_register', '2026-08-06',
   'The platform itself. Access enforced by RLS on every table; identity documents in '
   || 'private storage reached only through short-lived signed links.'),
  ('expo_eas', 'Expo Application Services',
   'Building and distributing the mobile applications.',
   array['build_artefacts', 'diagnostics'],
   'Managed cloud infrastructure.',
   'in_use', true, 'not_required', 'subprocessor_register', '2026-08-06',
   'No account data, bookings, messages or documents. Over-the-air updates are '
   || 'configured but not enabled, so no update channel serves this application.'),
  ('google_cloud_vision', 'Google Cloud Vision',
   'Extracting the text printed on a National ID so a worker need not type it.',
   array['identity_documents'],
   'Google Cloud, region to be recorded on integration.',
   'approved_not_integrated', true, 'not_started', 'ocr_usage_policy', '2026-08-06',
   'No document has been sent. Identity fields are entered by hand in this version. '
   || 'Moving to in_use requires a new version of the OCR, AI and privacy policies, '
   || 'an updated register and renewed acceptance from affected workers.'),
  ('google_maps_platform', 'Google Maps Platform',
   'Map display, address search and conversion between an address and coordinates.',
   array['addresses'],
   'Google Cloud, region to be recorded on integration.',
   'approved_not_integrated', true, 'not_started', 'location_data_policy', '2026-08-06',
   'Not integrated. Address search and device positioning report as unavailable and '
   || 'manual pin placement is the working path. No map surface pretends to be live.')
on conflict (subprocessor_key) do nothing;

insert into private.processing_activities
  (activity_key, display_name, purpose, data_categories, data_subjects, recipients,
   proposed_basis, legal_review_status, retention_rule_key, safeguards, authority, notes)
values
  ('account_authentication', 'Account and authentication',
   'Create and secure an account, sign a person in, and recover access.',
   array['name', 'phone', 'email', 'authentication_state'],
   array['customers', 'workers', 'staff'], array['supabase'],
   'Performance of the agreement', 'pending', null,
   'RLS on every table; phone verification required for worker capability.',
   'WPS-001, WPS-023', 'Basis proposed, not confirmed by advice.'),
  ('worker_verification', 'Worker verification',
   'Establish who a worker is before they enter a customer home.',
   array['identity_documents', 'identity_fields', 'criminal_records', 'reviewer_assessments'],
   array['workers'], array['supabase', 'verification_staff', 'google_cloud_vision'],
   'Substantial public interest in safety, and performance of the agreement',
   'pending', 'worker_criminal_records',
   'Private storage; capability-gated access with re-authentication; every access logged; '
   || 'offence detail confined to a private reviewer record no client can read.',
   'WPS-023, WPS-024',
   'Both proposed bases are unconfirmed and no eligibility policy has passed legal review. '
   || 'google_cloud_vision is listed as a recipient because it is the approved extraction '
   || 'provider; its subprocessor entry records that it is not yet integrated and has '
   || 'received no document.'),
  ('bookings_execution', 'Bookings and job execution',
   'Arrange, perform, track and complete work.',
   array['booking_details', 'scheduling', 'addresses', 'job_records', 'photographs'],
   array['customers', 'workers'], array['supabase', 'google_maps_platform'],
   'Performance of the agreement', 'pending', null,
   'Address detail released to a worker only at the point in a booking where it is needed.',
   'WPS-004, WPS-012',
   'Basis proposed, not confirmed by advice. google_maps_platform is listed as a recipient '
   || 'because it is the approved map provider; its subprocessor entry records that it is '
   || 'not yet integrated and has received no address.'),
  ('messaging', 'Messaging',
   'Let the two sides of a booking communicate, and provide evidence for a dispute.',
   array['message_content', 'message_metadata'],
   array['customers', 'workers'], array['supabase'],
   'Performance of the agreement, and legitimate interest in dispute resolution',
   'pending', null,
   'Not read routinely; access for a report or dispute is logged.',
   'WPS-009', 'Basis proposed, not confirmed by advice.'),
  ('payments_earnings', 'Payments and earnings',
   'Collect payment, calculate commission, record earnings, make payouts, process refunds.',
   array['amounts', 'methods', 'ledger_entries', 'payout_records'],
   array['customers', 'workers'], array['supabase'],
   'Performance of the agreement, and legal obligation for financial records',
   'pending', null,
   'Append-only ledger. No full card number stored. No gateway engaged in this version.',
   'WPS-015', 'Basis proposed, not confirmed by advice.'),
  ('trust_safety', 'Trust, safety and moderation',
   'Prevent and respond to harm, fraud and abuse.',
   array['reports', 'moderation_records', 'trust_state', 'enforcement_decisions'],
   array['customers', 'workers'], array['supabase', 'safety_staff'],
   'Legitimate interest in user safety, and legal obligation where reporting is required',
   'pending', null,
   'Every adverse decision carries recorded evidence and is appealable to a different person.',
   'WPS-016', 'Basis proposed, not confirmed by advice.'),
  ('reviews_reputation', 'Reviews and reputation',
   'Let customers see how a worker has performed.',
   array['ratings', 'review_text', 'replies', 'aggregate_scores'],
   array['customers', 'workers'], array['supabase', 'other_users'],
   'Performance of the agreement', 'pending', null,
   'Content policy enforced; unfavourable reviews are never removed for being unfavourable.',
   'WPS-011', 'Basis proposed, not confirmed by advice.'),
  ('support_cases', 'Support',
   'Answer questions and resolve problems.',
   array['support_conversations', 'case_records'],
   array['customers', 'workers'], array['supabase', 'support_staff'],
   'Performance of the agreement', 'pending', null,
   'An agent sees the case, not identity documents.',
   'WPS-019', 'Basis proposed, not confirmed by advice.'),
  ('notifications', 'Notifications',
   'Tell someone something they need to know about their account or a booking.',
   array['event_type', 'target_account', 'delivery_state'],
   array['customers', 'workers'], array['supabase'],
   'Performance of the agreement for service messages; consent for optional messages',
   'pending', null,
   'Payloads carry a state and nothing more: no identity number, filename, offence text, '
   || 'address or staff note.',
   'WPS-014', 'Basis proposed, not confirmed by advice.'),
  ('legal_consent', 'Consent and agreements',
   'Record which version of which document a person accepted, in which language, and when.',
   array['account', 'document_key', 'version', 'decision', 'language', 'acceptance_hash'],
   array['customers', 'workers'], array['supabase'],
   'Legal obligation to demonstrate consent, and performance of the agreement',
   'pending', 'legal_acceptances',
   'Append-only. A decline is recorded as a decline. Acceptance binds to a content hash.',
   'WPS-022, WPS-024', 'Basis proposed, not confirmed by advice.'),
  ('diagnostics', 'Diagnostics',
   'Find and fix faults.',
   array['app_version', 'platform', 'crash_traces'],
   array['customers', 'workers'], array['supabase', 'expo_eas'],
   'Consent', 'pending', null,
   'Off unless turned on; withdrawable at any time. No message content, addresses or identity data.',
   'WPS-018', 'Basis proposed, not confirmed by advice.')
on conflict (activity_key) do nothing;

insert into private.ai_use_declarations
  (use_key, display_name, provider_key, processing_location, status,
   covers_identity_data, permitted_for_training, prohibited_decisions,
   human_confirmation_required, governing_document, notes)
values
  ('identity_text_extraction', 'Identity document text extraction',
   'google_cloud_vision', 'server', 'approved_not_integrated',
   true, false,
   array['document_authenticity', 'identity_authenticity', 'forgery_detection',
         'criminal_eligibility', 'account_suspension', 'appeal_outcome'],
   true, 'ocr_usage_policy',
   'Assistive only: pre-fills a form the worker then confirms. Confidence values are '
   || 'internal and are never a reason for any decision. A low-confidence or ambiguous '
   || 'extraction never produces a rejection. Not integrated in this version.')
on conflict (use_key) do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 12. SEED — CAPABILITIES, LIMITS, NOTIFICATIONS, FLAGS AND REGISTERS
-- ---------------------------------------------------------------------------

insert into public.staff_capabilities
  (capability_key, domain, description, high_risk, dual_control, requires_reauth)
values
  ('review_legal_governance', 'configuration',
   'See the legal register, acceptance counts and governance state. No personal data.',
   false, false, false),
  ('publish_legal_version', 'configuration',
   'Publish a new version of a legal document. Requires a second person.',
   true, true, true),
  ('manage_subprocessors', 'configuration',
   'Add or change a subprocessor entry. Requires a second person.',
   true, true, true)
on conflict (capability_key) do nothing;

insert into public.staff_role_capabilities (role_key, capability_key) values
  ('operations_manager', 'review_legal_governance'),
  ('security_administrator', 'review_legal_governance'),
  ('security_administrator', 'publish_legal_version'),
  ('security_administrator', 'manage_subprocessors'),
  ('super_administrator', 'review_legal_governance'),
  ('super_administrator', 'publish_legal_version'),
  ('super_administrator', 'manage_subprocessors')
on conflict (role_key, capability_key) do nothing;

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('legal_acceptance_write', 'accept_legal_document', 'account', 60, 3600, true, 'wps018_limiter',
   'Accepting and declining share a limit. Generous, because a person working through '
   || 'a re-consent flow legitimately writes several in a row, and a limit that stops '
   || 'them halfway leaves them unable to finish and unable to work.')
on conflict (policy_key) do nothing;

insert into private.notification_event_catalog
  (event_type, category, priority, action_type, route_type, required_action,
   mandatory_in_app, quiet_hours_bypass, generic_title, generic_body)
values
  ('legal_update_available', 'system', 'informational', null, 'preferences', false, false, false,
   'Our terms have changed', 'A document you accepted has a new version.'),
  ('legal_acceptance_required', 'system', 'action_required', null, 'preferences', true, true, false,
   'Please review our updated terms', 'A change needs your agreement before you continue.'),
  ('legal_acceptance_recorded', 'system', 'informational', null, 'preferences', false, false, false,
   'Agreement recorded', 'Your acceptance has been saved.'),
  ('worker_provisionally_active', 'worker_account', 'important', null, 'verification', false, true, false,
   'You can start taking work', 'Your application is complete. Our team will review it.')
on conflict (event_type) do nothing;

-- Every surface ships disabled, following WPS-023. `reconsent_enforced` is the
-- one that matters: turning it on before anyone has walked the flow would lock
-- every existing account out of booking and working at once, because nobody
-- has accepted a version that did not exist until this migration ran.
insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  ('legal_centre', 'local', false, 'none',
   'WPS-024 legal centre stays off until the reader has been seen on a device.', false),
  ('legal_reconsent', 'local', false, 'none',
   'WPS-024 re-consent enforcement stays off. Enabling it before the flow has been walked '
   || 'would block every existing account from booking and working at once.', false),
  ('provisional_worker_activation', 'local', false, 'none',
   'WPS-024 provisional activation stays off until the post-activation review queue has '
   || 'been walked end to end.', false)
on conflict (flag_key, environment) do nothing;

insert into private.staff_kill_switches
  (switch_key, display_name, domain_authority, server_enforced, active, reason, enforcement_note)
values
  ('legal_reconsent_gate', 'Re-consent gate', 'configuration', true, false,
   'WPS-024 stop control for re-consent enforcement.',
   'When active, no account is blocked for an outstanding agreement. Intended for the case '
   || 'where a published version turns out to be wrong and the gate must be lifted faster '
   || 'than a corrected version can be published.')
on conflict (switch_key) do nothing;

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('legal_documents', 'public', 'legal_documents', 'table', 'aggregate_nonpersonal',
   'Publish which legal documents exist and who they address.',
   'WPS-024', 'Never; the register is not personal data.',
   'preserve', false, null,
   'No personal data, and authenticated-only anyway: a signed-out reader gets the full '
   || 'text from the bundled corpus without a server call, so nothing here needs anon.'),
  ('legal_document_versions', 'public', 'legal_document_versions', 'table', 'aggregate_nonpersonal',
   'Hold the immutable version history and the content hash each acceptance points at.',
   'WPS-024', 'Never; a superseded version is what somebody agreed to.',
   'preserve', false, null,
   'No personal data. A version is never deleted, because deleting it would orphan every '
   || 'acceptance that names it.'),
  ('legal_acceptances', 'public', 'legal_acceptances', 'table', 'account_private',
   'Record which exact text a person agreed to, in which language, and when.',
   'WPS-024', 'Account closure, subject to the obligation to demonstrate consent.',
   'preserve_minimized', true, null,
   'Append-only with no exception. A decline is stored as a decline and never as consent.'),
  ('legal_version_events', 'private', 'legal_version_events', 'table', 'operational_audit',
   'Record what happened to each version and who published it.',
   'WPS-024', 'Never.',
   'preserve', false, 'review_legal_governance',
   'Staff actor identities only. No user data.'),
  ('subprocessors', 'private', 'subprocessors', 'table', 'operational_audit',
   'Record every supplier that processes personal data, and whether it is actually in use.',
   'WPS-024', 'Retirement of the supplier.',
   'preserve', false, 'manage_subprocessors',
   'approved_not_integrated is a distinct state from in_use and the difference is the '
   || 'point of the register.'),
  ('processing_activities', 'private', 'processing_activities', 'table', 'operational_audit',
   'Record every processing activity, its purpose and its proposed lawful basis.',
   'WPS-024', 'Retirement of the activity.',
   'preserve', false, 'review_legal_governance',
   'proposed_basis is a proposal. legal_review_status says whether anyone has confirmed it.'),
  ('ai_use_declarations', 'private', 'ai_use_declarations', 'table', 'operational_audit',
   'Record every declared machine-learning use and what it may never decide.',
   'WPS-024', 'Retirement of the use.',
   'preserve', false, 'review_legal_governance',
   'A CHECK constraint, not a policy note, prevents training on identity data.')
on conflict (entry_key) do nothing;

insert into private.privacy_retention_rules
  (rule_key, data_class, target_object, trigger_event, proposed_days, authority,
   legal_review_status, action_at_expiry, hold_scope, execution_owner, enabled, notes)
values
  ('legal_acceptances', 'account_private', 'public.legal_acceptances', 'account_closure',
   2555,
   'Product proposal. No statutory basis claimed. The obligation to demonstrate consent '
   || 'has no established period for this platform.',
   'pending', 'manual_review', 'account', 'security_administrator', false,
   'Seven years is a placeholder for professional advice, not a finding. Action at expiry '
   || 'is manual_review rather than delete precisely because deleting the record that '
   || 'proves someone agreed to something is the one deletion that cannot be undone by '
   || 'asking them again.')
on conflict (rule_key) do nothing;

-- WPS-022 owns consent purposes. Point the two acceptance-bearing purposes at
-- the documents that now actually exist, so the privacy centre and the legal
-- centre cannot disagree about what someone agreed to.
update public.privacy_consent_purposes
set document_key = 'customer_terms'
where purpose_key = 'terms_of_service' and document_key = 'terms';

update public.privacy_consent_purposes
set document_key = 'privacy_policy'
where purpose_key = 'privacy_notice' and document_key = 'privacy';

comment on table public.legal_acceptances is
  'WPS-024 append-only acceptance ledger. Binds a person to an exact text, language and instant.';
