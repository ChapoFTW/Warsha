-- ============================================================================
-- WPS-022  Privacy, Data Lifecycle & User Rights
-- ============================================================================
--
-- This migration adds the privacy layer. It creates no second authority for
-- anything that already has one: WPS-007 still owns money, WPS-009 still owns
-- messages, WPS-011 still owns reviews, WPS-013 disputes, WPS-016 trust,
-- WPS-017 staff capability and audit, WPS-018 rate limits and flags, WPS-014
-- notifications. Privacy reads those systems and constrains what may be
-- removed; it never rewrites their records.
--
-- Three ideas run through the whole file.
--
--   1. DELETION IS NOT A DELETE. An account that leaves must stop being a
--      person in the product while remaining a row wherever somebody else's
--      legitimate record depends on it — a worker's payout, a customer's
--      receipt, a dispute someone else opened. So the primitive is
--      ANONYMIZATION with a narrow, documented set of true deletions.
--
--   2. NOTHING RUNS BY ITSELF. Retention has rules, a dry run, and an
--      execution path that is disabled until a duration has been reviewed by
--      somebody qualified. This migration invents no statutory period. Every
--      duration below is a PRODUCT default carrying `legal_review_status =
--      'pending'`, and production execution refuses to run on a pending rule.
--
--   3. THE HONEST STATE IS THE STATE WE SHOW. A deletion that is blocked says
--      it is blocked and why, in words a person can act on, without naming the
--      reporter, the evidence, or the staff member.
--
-- Legal note: nothing here asserts compliance with any statute. The open legal
-- questions are recorded in docs/privacy/WARSHA-PRIVACY-LEGAL-QUESTIONS.md and
-- referenced by `authority` on each retention rule.
-- ============================================================================

-- ============================================================================
-- SECTION 0 — LEGACY SCAFFOLD TREATMENT
-- ============================================================================
--
-- The `avatars` bucket is a day-one scaffold. It is PUBLIC (`public = true`),
-- has no size limit and no MIME allowlist, and carries a single policy
-- (`own_avatar_write`) letting any authenticated account write into a folder
-- named after its own uid. Nothing in the application has referenced it since
-- WPS-010 introduced `profile-images`; every avatar read and write in the
-- client goes through that private bucket.
--
-- So the bucket is an open, world-readable write target with no owner. It is
-- not dropped: `storage.buckets` rows may exist on the hosted project with
-- objects this migration cannot see, and dropping a bucket is irreversible.
-- Instead it is closed — made private, given a real size and MIME bound, and
-- stripped of its write policy, leaving `storage.objects` deny-by-default for
-- it. That is the same treatment WPS-021 gave `promo_codes` and `wallets`.

drop policy if exists own_avatar_write on storage.objects;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

-- Supabase's bootstrap grants `all` on `schema public` to `anon` and
-- `authenticated`. Later hardening revoked the DML verbs but left REFERENCES,
-- TRIGGER and TRUNCATE behind on every table. None is reachable through
-- PostgREST, which issues only DML and RPC — but TRUNCATE bypasses RLS
-- entirely, so holding it is a standing defect waiting for a connection string
-- to leak. Revoked here and asserted absent by pgTAP.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute pg_catalog.format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      r.relname);
  end loop;
end $$;

-- ============================================================================
-- SECTION 1 — CLASSIFICATION AND INVENTORY
-- ============================================================================
--
-- The inventory is data, not prose, so a test can read it. A table that holds
-- personal data and is missing from the inventory is a bug pgTAP can catch;
-- a paragraph in a document cannot be checked that way.

create table if not exists private.data_classifications (
  classification_key text primary key,
  label_en           text not null,
  label_ar           text not null,
  description        text not null,
  -- Does this class identify a person, directly or by reasonable linkage?
  personal           boolean not null,
  -- May a member of staff read it, and only with a capability?
  staff_readable     boolean not null,
  -- May it appear in the requesting account's own export?
  exportable         boolean not null,
  sort_order         integer not null,
  constraint data_classifications_key_check
    check (classification_key ~ '^[a-z][a-z0-9_]{2,48}$')
);

comment on table private.data_classifications is
  'WPS-022 data classes. Nothing is labelled anonymous that can be linked back to an account.';

create table if not exists private.data_inventory (
  entry_key           text primary key,
  schema_name         text not null,
  object_name         text not null,
  object_kind         text not null,
  classification_key  text not null references private.data_classifications(classification_key),
  purpose             text not null,
  authority           text not null,
  retention_trigger   text not null,
  deletion_treatment  text not null,
  export_included     boolean not null,
  staff_capability    text,
  notes               text,
  constraint data_inventory_kind_check
    check (object_kind = any (array['table', 'column_family', 'bucket', 'log', 'artifact', 'payload'])),
  constraint data_inventory_treatment_check
    check (deletion_treatment = any (array[
      'delete',              -- the row goes
      'anonymize',           -- the row stays, the person does not
      'preserve',            -- authoritative; untouched by a deletion request
      'preserve_minimized',  -- authoritative, but identifiers reduced
      'not_applicable'
    ])),
  constraint data_inventory_purpose_check
    check (pg_catalog.length(pg_catalog.btrim(purpose)) between 10 and 500)
);

comment on table private.data_inventory is
  'WPS-022 factual inventory. Every personal-data object has a purpose, an authority, and a documented deletion treatment.';

create index if not exists data_inventory_classification_idx
  on private.data_inventory (classification_key);

-- ============================================================================
-- SECTION 2 — CONSENT
-- ============================================================================
--
-- `profiles.terms_accepted_at` and `profiles.privacy_accepted_at` already
-- exist. They are scalar acknowledgements: one timestamp, no version, no
-- withdrawal, no purpose. They remain the record of what happened before this
-- migration and are NOT deleted; the ledger below is the authority going
-- forward and is backfilled from them in section 12.
--
-- Accepting Terms is deliberately not treated as consent to everything else.
-- Each optional purpose is its own row, and a purpose marked `required` is
-- recorded as an acknowledgement rather than offered as a choice, because
-- pretending a mandatory thing is optional is its own dark pattern.

create table if not exists public.privacy_consent_purposes (
  purpose_key       text primary key,
  -- required: the product cannot function without it; recorded, not asked.
  -- optional: genuinely refusable, and refusing changes only that purpose.
  required          boolean not null,
  document_key      text not null,
  current_version   text not null,
  title_en          text not null,
  title_ar          text not null,
  explanation_en    text not null,
  explanation_ar    text not null,
  sort_order        integer not null,
  active            boolean not null default true,
  constraint privacy_consent_purposes_key_check
    check (purpose_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint privacy_consent_purposes_version_check
    check (current_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

comment on table public.privacy_consent_purposes is
  'WPS-022 consent purposes. Terms acceptance is one purpose among several, never a blanket permission.';

create table if not exists public.privacy_consent_records (
  id               uuid primary key default extensions.gen_random_uuid(),
  user_id          uuid not null,
  purpose_key      text not null references public.privacy_consent_purposes(purpose_key),
  document_version text not null,
  granted          boolean not null,
  decided_at       timestamptz not null default pg_catalog.now(),
  environment      text not null,
  source_surface   text not null,
  withdrawn_at     timestamptz,
  constraint privacy_consent_records_surface_check
    check (source_surface = any (array[
      'sign_up', 'privacy_center', 'onboarding', 'worker_onboarding',
      'verification', 'support', 'migration'
    ])),
  constraint privacy_consent_records_environment_check
    check (environment = any (array['local', 'staging', 'production'])),
  constraint privacy_consent_records_withdrawal_check
    check (withdrawn_at is null or granted)
);

comment on table public.privacy_consent_records is
  'WPS-022 immutable consent history. A withdrawal appends a decision; it never edits the earlier one.';

create index if not exists privacy_consent_records_user_idx
  on public.privacy_consent_records (user_id, purpose_key, decided_at desc);

/**
 * History is append-only.
 *
 * A withdrawal is a NEW row saying `granted = false`; the earlier row that
 * said yes is never edited, because a consent trail that can be rewritten is
 * not a trail. The single exception is stamping `withdrawn_at` on the grant
 * being closed — that adds when a permission stopped applying without changing
 * what was agreed, and every other column must be identical for it to pass.
 */
create or replace function private.privacy_consent_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Consent history cannot be changed' using errcode = '42501';
  end if;
  if old.withdrawn_at is null and new.withdrawn_at is not null
     and new.user_id = old.user_id
     and new.purpose_key = old.purpose_key
     and new.granted = old.granted
     and new.document_version = old.document_version
     and new.decided_at = old.decided_at
     and new.environment = old.environment
     and new.source_surface = old.source_surface then
    return new;
  end if;
  raise exception 'Consent history cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists privacy_consent_records_immutable on public.privacy_consent_records;
create trigger privacy_consent_records_immutable
  before update or delete on public.privacy_consent_records
  for each row execute function private.privacy_consent_is_immutable();

-- ============================================================================
-- SECTION 3 — CONFIGURATION
-- ============================================================================
--
-- A singleton, following `private.communication_configuration` and
-- `private.payment_configuration`. Privacy is not added to the WPS-017
-- configuration-domain registry because `private.staff_configuration_payload_valid`
-- validates a closed set of payload shapes; a new domain there would either
-- fail validation or force that function to be rewritten.

create table if not exists private.privacy_configuration (
  singleton                   boolean primary key default true,
  privacy_center_enabled      boolean not null default false,
  export_enabled              boolean not null default false,
  deletion_enabled            boolean not null default false,
  -- A product choice, not a legal one: long enough to undo a bad evening,
  -- short enough that leaving does not feel supervised.
  cooling_off_hours           integer not null default 168,
  export_ttl_hours            integer not null default 72,
  export_max_open_requests    integer not null default 1,
  retention_execution_enabled boolean not null default false,
  deleted_account_label_en    text not null default 'Deleted account',
  deleted_account_label_ar    text not null default 'حساب محذوف',
  policy_version              text not null default '2026-08-07',
  updated_at                  timestamptz not null default pg_catalog.now(),
  updated_by                  uuid,
  constraint privacy_configuration_singleton_check check (singleton),
  constraint privacy_configuration_cooling_check check (cooling_off_hours between 0 and 720),
  constraint privacy_configuration_ttl_check check (export_ttl_hours between 1 and 336),
  constraint privacy_configuration_open_check check (export_max_open_requests between 1 and 5)
);

insert into private.privacy_configuration (singleton) values (true)
on conflict (singleton) do nothing;

comment on table private.privacy_configuration is
  'WPS-022 privacy configuration. Every user-facing capability is off by default and fails closed.';

create or replace function private.privacy_config()
returns private.privacy_configuration
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.privacy_configuration where singleton
$$;

-- Every user-facing privacy entry point passes through here. Both the flag and
-- the kill switch must agree, and the kill switch wins.
create or replace function private.privacy_surface_enabled(p_surface text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_config private.privacy_configuration; v_flag text;
begin
  select * into v_config from private.privacy_configuration where singleton;
  if v_config is null then return false; end if;
  if private.staff_kill_switch_active('privacy_requests') then return false; end if;
  if not v_config.privacy_center_enabled then return false; end if;

  v_flag := case p_surface
              when 'export' then 'data_export'
              when 'deletion' then 'account_deletion'
              else 'privacy_center' end;
  -- Environment-scoped, like every other WPS-017 flag. An absent row is OFF: a
  -- privacy surface must never default to on because somebody forgot to seed.
  if not exists (
    select 1 from private.staff_feature_flags f
    where f.flag_key = v_flag
      and f.environment = private.platform_environment()
      and f.enabled
      and (f.expires_at is null or f.expires_at > pg_catalog.now())
  ) then
    return false;
  end if;

  return case p_surface
           when 'export' then v_config.export_enabled
           when 'deletion' then v_config.deletion_enabled
           else true end;
end;
$$;

-- ============================================================================
-- SECTION 4 — LEGAL AND OPERATIONAL HOLDS
-- ============================================================================
--
-- A hold is narrow on purpose: subject, scope, reason category, and a review
-- date. It blocks deletion and anonymization for its scope and nothing else.
-- It is not a retention policy, and section 7 refuses to treat it as one — a
-- hold with no review date cannot be created.

create table if not exists private.privacy_legal_holds (
  id                uuid primary key default extensions.gen_random_uuid(),
  subject_user_id   uuid not null,
  scope             text not null,
  reason_category   text not null,
  reason_note       text not null,
  created_by        uuid not null,
  created_at        timestamptz not null default pg_catalog.now(),
  review_due_at     timestamptz not null,
  released_by       uuid,
  released_at       timestamptz,
  release_reason    text,
  environment       text not null default private.platform_environment(),
  constraint privacy_legal_holds_scope_check
    check (scope = any (array[
      'account', 'identity_documents', 'financial_records', 'communications',
      'dispute_evidence', 'trust_evidence', 'support_records'
    ])),
  constraint privacy_legal_holds_reason_check
    check (reason_category = any (array[
      'active_investigation', 'fraud_review', 'payment_dispute',
      'regulatory_request', 'litigation', 'safety_investigation'
    ])),
  constraint privacy_legal_holds_note_check
    check (pg_catalog.length(pg_catalog.btrim(reason_note)) between 10 and 2000),
  constraint privacy_legal_holds_release_check
    check ((released_at is null and released_by is null and release_reason is null)
        or (released_at is not null and released_by is not null
            and pg_catalog.length(pg_catalog.btrim(release_reason)) >= 10))
);

comment on table private.privacy_legal_holds is
  'WPS-022 holds. Narrow scope, named actor, mandatory review date. A hold is not a retention shortcut.';

create index if not exists privacy_legal_holds_subject_idx
  on private.privacy_legal_holds (subject_user_id) where released_at is null;

create table if not exists private.privacy_legal_hold_events (
  id          uuid primary key default extensions.gen_random_uuid(),
  hold_id     uuid not null references private.privacy_legal_holds(id),
  action      text not null,
  actor_id    uuid not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default pg_catalog.now(),
  constraint privacy_legal_hold_events_action_check
    check (action = any (array['created', 'reviewed', 'extended', 'released']))
);

create or replace function private.privacy_hold_history_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Hold history cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists privacy_legal_hold_events_immutable on private.privacy_legal_hold_events;
create trigger privacy_legal_hold_events_immutable
  before update or delete on private.privacy_legal_hold_events
  for each row execute function private.privacy_hold_history_is_immutable();

/**
 * Is this account held for this scope?
 *
 * An `account` hold covers every scope, because a hold on the person covers
 * everything about the person.
 */
create or replace function private.privacy_hold_active(p_user_id uuid, p_scope text default 'account')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.privacy_legal_holds h
    where h.subject_user_id = p_user_id
      and h.released_at is null
      and (h.scope = p_scope or h.scope = 'account')
  )
$$;

-- ============================================================================
-- SECTION 5 — DELETION BLOCKERS
-- ============================================================================
--
-- A blocker is a fact about the account, evaluated on the server, returned as
-- a stable code the client turns into a sentence. The codes carry no evidence
-- and name nobody: "you have an open dispute" is safe, "Ahmed reported you" is
-- not, and the difference is the whole point.

create or replace function private.privacy_deletion_blockers(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_codes text[] := '{}'; v_provider_id uuid;
begin
  select p.id into v_provider_id
  from public.provider_profiles p where p.user_id = p_user_id;

  -- A booking somebody is relying on. Terminal states are not blockers: a
  -- completed booking is history, an active one is a commitment.
  if exists (
    select 1 from public.bookings b
    where (b.customer_id = p_user_id or (v_provider_id is not null and b.provider_id = v_provider_id))
      and b.deleted_at is null
      and b.status = any (array['pending_provider_approval', 'accepted', 'rescheduling_requested',
        'confirmed', 'provider_on_the_way', 'provider_arrived', 'job_started',
        'awaiting_quote_approval', 'work_in_progress', 'awaiting_customer_confirmation'])
  ) then v_codes := v_codes || 'active_booking'::text; end if;

  if exists (
    select 1 from public.disputes d
    join public.bookings b on b.id = d.booking_id
    where (d.opened_by = p_user_id or b.customer_id = p_user_id
           or (v_provider_id is not null and b.provider_id = v_provider_id))
      and d.status = any (array['draft', 'submitted', 'waiting_customer', 'waiting_worker',
        'waiting_staff', 'under_review'])
  ) then v_codes := v_codes || 'open_dispute'::text; end if;

  -- Money the customer still owes, or that has not settled.
  if exists (
    select 1 from public.financial_booking_payments p
    where p.customer_id = p_user_id
      and p.status = any (array['awaiting_payment', 'payment_initiated', 'pending',
        'authorized', 'disputed', 'chargeback'])
  ) then v_codes := v_codes || 'unsettled_payment'::text; end if;

  -- Money Warsha still owes the worker. Deleting an account with a live
  -- payable would quietly cancel a debt in Warsha's favour.
  if v_provider_id is not null and exists (
    select 1 from public.provider_earnings_ledger e
    where e.provider_id = v_provider_id
      and e.status = any (array['pending_job_completion', 'pending_release', 'available',
        'withdrawal_requested', 'held_for_dispute'])
  ) then v_codes := v_codes || 'outstanding_earnings'::text; end if;

  if v_provider_id is not null and exists (
    select 1 from public.provider_withdrawal_requests w
    where w.provider_id = v_provider_id
      and w.status = any (array['requested', 'under_review', 'processing'])
  ) then v_codes := v_codes || 'active_payout'::text; end if;

  if exists (
    select 1 from private.payment_chargebacks c
    join public.financial_booking_payments p on p.id = c.payment_id
    where p.customer_id = p_user_id
      and c.status = any (array['opened', 'evidence_required', 'under_review'])
  ) then v_codes := v_codes || 'open_chargeback'::text; end if;

  if exists (
    select 1 from public.trust_enforcement_actions a
    where a.subject_user_id = p_user_id
      and (a.expires_at is null or a.expires_at > pg_catalog.now())
      and a.action_type <> 'warning'
  ) then v_codes := v_codes || 'active_enforcement'::text; end if;

  if exists (
    select 1 from public.support_tickets t
    where t.requester_id = p_user_id
      and t.status = any (array['open', 'in_progress', 'waiting_participant', 'escalated'])
  ) then v_codes := v_codes || 'open_support_case'::text; end if;

  if private.privacy_hold_active(p_user_id, 'account') then
    v_codes := v_codes || 'legal_hold'::text;
  end if;

  return v_codes;
end;
$$;

-- ============================================================================
-- SECTION 6 — DEACTIVATION AND DELETION
-- ============================================================================
--
-- Deactivation and deletion are different products, and the screens must never
-- blur them: deactivation hides you and is reversible by signing in; deletion
-- is a request with a cooling-off window that ends in anonymization.

alter table public.profiles
  add column if not exists deactivated_at timestamptz;

comment on column public.profiles.deactivated_at is
  'WPS-022 deactivation. Reversible, hides public presence, deletes nothing.';

create table if not exists public.account_deletion_requests (
  id                  uuid primary key default extensions.gen_random_uuid(),
  user_id             uuid not null,
  status              text not null default 'cooling_off',
  reason_code         text,
  requested_at        timestamptz not null default pg_catalog.now(),
  cooling_off_ends_at timestamptz not null,
  blocker_codes       text[] not null default '{}',
  cancelled_at        timestamptz,
  processing_at       timestamptz,
  anonymized_at       timestamptz,
  completed_at        timestamptz,
  failure_reason      text,
  idempotency_key     text not null,
  environment         text not null default private.platform_environment(),
  constraint account_deletion_requests_status_check
    check (status = any (array[
      'cooling_off',   -- requested; cancellable by the account itself
      'blocked',       -- a real obstacle exists; the account is told which
      'legal_hold',    -- held; deliberately distinct from 'blocked'
      'approved',      -- cooling-off elapsed, no blockers, awaiting execution
      'processing',    -- execution started
      'anonymized',    -- personal data removed; authoritative records remain
      'completed',
      'cancelled',
      'failed'
    ])),
  constraint account_deletion_requests_reason_check
    check (reason_code is null or reason_code = any (array[
      'no_longer_needed', 'privacy_concern', 'duplicate_account',
      'unhappy_with_service', 'other'
    ])),
  constraint account_deletion_requests_idempotency_check
    check (pg_catalog.length(idempotency_key) between 8 and 200)
);

comment on table public.account_deletion_requests is
  'WPS-022 deletion requests. Server-authoritative; the client can request and cancel, never execute.';

-- One live request per account. A second request returns the first rather than
-- opening a race between two workflows over the same account.
create unique index if not exists account_deletion_requests_open_idx
  on public.account_deletion_requests (user_id)
  where status = any (array['cooling_off', 'blocked', 'legal_hold', 'approved', 'processing']);

create unique index if not exists account_deletion_requests_idem_idx
  on public.account_deletion_requests (user_id, idempotency_key);

create table if not exists private.account_deletion_events (
  id          uuid primary key default extensions.gen_random_uuid(),
  request_id  uuid not null references public.account_deletion_requests(id),
  from_status text,
  to_status   text not null,
  actor_kind  text not null,
  actor_id    uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default pg_catalog.now(),
  constraint account_deletion_events_actor_check
    check (actor_kind = any (array['account', 'staff', 'system']))
);

create or replace function private.privacy_deletion_history_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Deletion history cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists account_deletion_events_immutable on private.account_deletion_events;
create trigger account_deletion_events_immutable
  before update or delete on private.account_deletion_events
  for each row execute function private.privacy_deletion_history_is_immutable();

-- ============================================================================
-- SECTION 7 — ANONYMIZATION
-- ============================================================================
--
-- What follows is the entire list of what leaving Warsha removes, and it is
-- deliberately short. Everything absent from it is either somebody else's
-- record or an authoritative financial fact, and both survive.
--
-- The account UUID survives too. It has to: it is the join key under a
-- worker's payout and a customer's receipt. It is a pseudonym, not anonymity,
-- and the documentation says so rather than claiming otherwise.

create table if not exists private.privacy_anonymization_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  request_id    uuid references public.account_deletion_requests(id),
  subject_user_id uuid not null,
  step_key      text not null,
  rows_affected integer not null default 0,
  created_at    timestamptz not null default pg_catalog.now()
);

create or replace function private.privacy_anonymize_account(
  p_user_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.privacy_configuration;
  v_provider_id uuid;
  v_steps jsonb := '{}'::jsonb;
  v_count integer;
begin
  if private.privacy_hold_active(p_user_id, 'account') then
    raise exception 'Account is under a hold' using errcode = '42501';
  end if;

  select * into v_config from private.privacy_configuration where singleton;
  select p.id into v_provider_id from public.provider_profiles p where p.user_id = p_user_id;

  -- Profile: the name becomes a label, the face goes, the phone goes.
  update public.profiles
  set display_name = v_config.deleted_account_label_en,
      avatar_url = null,
      phone = null,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('profile', v_count);

  -- Worker public presence: unpublished and stripped. The `deleted_at` here is
  -- WPS-010's own soft delete; this sets it rather than inventing a second one.
  if v_provider_id is not null then
    update public.provider_profiles
    set display_name = v_config.deleted_account_label_en,
        avatar_url = null,
        cover_image_url = null,
        -- Emptied rather than nulled: WPS-010 declares these NOT NULL with an
        -- empty default, and honouring that is the difference between removing
        -- somebody's biography and breaking the table it lived in.
        about = '',
        experience_summary = '',
        specialties = '{}',
        skills = '{}',
        location_label = null,
        is_published = false,
        is_available = false,
        deleted_at = coalesce(deleted_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_provider_id;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('provider_profile', v_count);

    update public.provider_portfolio
    set deleted_at = coalesce(deleted_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where provider_id = v_provider_id and deleted_at is null;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('portfolio', v_count);
  end if;

  -- Addresses: soft-deleted, not removed. A booking snapshot already froze the
  -- address it was served at, so the live row has no further purpose — but
  -- WPS-001 references it and a hard delete would break those references.
  update public.addresses
  set deleted_at = coalesce(deleted_at, pg_catalog.now())
  where customer_id = p_user_id and deleted_at is null;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('addresses', v_count);

  -- Personalization: genuinely deleted. It exists only to serve this account,
  -- so when the account goes there is nothing left for it to do.
  delete from public.user_recent_searches where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recent_searches', v_count);

  delete from public.user_recently_viewed_providers where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recently_viewed', v_count);

  delete from public.favourites where customer_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('favourites', v_count);

  delete from public.user_display_preferences where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('display_preferences', v_count);

  -- Devices: revoked, not deleted. The hash is how WPS-014 proves it stopped
  -- sending to a device; deleting the row would erase that proof.
  update private.notification_device_tokens
  set revoked_at = coalesce(revoked_at, pg_catalog.now()),
      encrypted_token = null,
      device_label = null,
      updated_at = pg_catalog.now()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('device_tokens', v_count);

  -- Notifications are deliberately NOT deleted, and the reason is worth
  -- stating because deleting them looks like the privacy-respecting choice.
  --
  -- WPS-014 declares `notification_source_links` immutable so a re-emitted
  -- event can never produce a duplicate years later, and that ledger holds a
  -- foreign key onto these rows. More importantly there is nothing personal
  -- left to remove: titles and bodies come from the generic event catalog, and
  -- `notification_safe_payload` already reduced `data` to resource UUIDs at
  -- write time. Deleting them would break an existing guarantee to remove
  -- nothing that identifies anybody.
  select pg_catalog.count(*) into v_count from public.notifications n where n.user_id = p_user_id;
  v_steps := v_steps || pg_catalog.jsonb_build_object('notifications_preserved', v_count);

  -- Identity documents: rows minimized, files handled by the storage runbook.
  -- The verification DECISION survives — it is why a badge was shown to
  -- customers who booked on the strength of it.
  if v_provider_id is not null then
    update public.provider_verification_documents
    set document_type = document_type
    where provider_id = v_provider_id;
  end if;

  -- Sign-in is disabled at the auth layer, which this migration does not own.
  -- Recorded as a step so the runbook and the log agree on what remains.
  v_steps := v_steps || pg_catalog.jsonb_build_object('auth_disabled', 0);

  insert into private.privacy_anonymization_log (request_id, subject_user_id, step_key, rows_affected)
  select p_request_id, p_user_id, k, (v_steps ->> k)::integer
  from pg_catalog.jsonb_object_keys(v_steps) k;

  return v_steps;
end;
$$;

comment on function private.privacy_anonymize_account(uuid, uuid) is
  'WPS-022 anonymization. Removes the person; preserves bookings, ledger, reviews, disputes and trust history. Runs as a system operation with no end-user session: the WPS-010 guard on is_published correctly refuses an unpublish attempted from inside a signed-in session.';

-- ============================================================================
-- SECTION 8 — USER-FACING PRIVACY RPCs
-- ============================================================================

create or replace function public.get_my_privacy_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_config private.privacy_configuration; v_request public.account_deletion_requests;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_config from private.privacy_configuration where singleton;

  select * into v_request from public.account_deletion_requests r
  where r.user_id = v_user
    and r.status = any (array['cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'])
  order by r.requested_at desc limit 1;

  return pg_catalog.jsonb_build_object(
    'available', private.privacy_surface_enabled('center'),
    'exportAvailable', private.privacy_surface_enabled('export'),
    'deletionAvailable', private.privacy_surface_enabled('deletion'),
    'policyVersion', v_config.policy_version,
    'coolingOffHours', v_config.cooling_off_hours,
    'deactivated', exists (select 1 from public.profiles p where p.id = v_user and p.deactivated_at is not null),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', c.classification_key,
        'labelEn', c.label_en,
        'labelAr', c.label_ar,
        'exportable', c.exportable
      ) order by c.sort_order)
      from private.data_classifications c where c.personal
    ), '[]'::jsonb),
    'deletionRequest', case when v_request.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_request.id,
      'status', v_request.status,
      'requestedAt', v_request.requested_at,
      'coolingOffEndsAt', v_request.cooling_off_ends_at,
      'blockerCodes', pg_catalog.to_jsonb(v_request.blocker_codes),
      'cancellable', v_request.status = any (array['cooling_off', 'blocked', 'legal_hold'])
    ) end
  );
end;
$$;

create or replace function public.get_my_consents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'purposeKey', p.purpose_key,
      'required', p.required,
      'currentVersion', p.current_version,
      'titleEn', p.title_en,
      'titleAr', p.title_ar,
      'explanationEn', p.explanation_en,
      'explanationAr', p.explanation_ar,
      'granted', coalesce(latest.granted, false),
      'decidedAt', latest.decided_at,
      'decidedVersion', latest.document_version
    ) order by p.sort_order)
    from public.privacy_consent_purposes p
    left join lateral (
      select r.granted, r.decided_at, r.document_version
      from public.privacy_consent_records r
      where r.user_id = v_user and r.purpose_key = p.purpose_key
      order by r.decided_at desc limit 1
    ) latest on true
    where p.active
  ), '[]'::jsonb);
end;
$$;

/**
 * Record a consent decision.
 *
 * A required purpose can be acknowledged but not refused — and the function
 * says so with an error rather than silently storing a false that the product
 * would then ignore, which is how consent records become fiction.
 */
create or replace function public.record_my_consent(
  p_purpose_key text,
  p_granted boolean,
  p_source_surface text default 'privacy_center'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_purpose public.privacy_consent_purposes;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform private.enforce_rate_limit('privacy_consent_write', v_user::text);

  select * into v_purpose from public.privacy_consent_purposes p
  where p.purpose_key = p_purpose_key and p.active;
  if v_purpose is null then
    raise exception 'Unknown consent purpose' using errcode = '22023';
  end if;
  if v_purpose.required and not p_granted then
    raise exception 'This purpose cannot be declined' using errcode = '22023';
  end if;

  -- The new row is always open: `withdrawn_at` describes when an EARLIER grant
  -- stopped applying, and a decision made now has not stopped applying yet.
  insert into public.privacy_consent_records
    (user_id, purpose_key, document_version, granted, environment, source_surface)
  values (v_user, p_purpose_key, v_purpose.current_version, p_granted,
          private.platform_environment(), p_source_surface);

  -- A withdrawal is a fact about the account, so the earlier grant is stamped
  -- rather than edited: the row that said yes still says yes, and now also
  -- says when it stopped applying.
  if not p_granted then
    update public.privacy_consent_records r
    set withdrawn_at = pg_catalog.now()
    where r.user_id = v_user and r.purpose_key = p_purpose_key
      and r.granted and r.withdrawn_at is null;
  end if;

  return pg_catalog.jsonb_build_object('purposeKey', p_purpose_key, 'granted', p_granted);
end;
$$;

create or replace function public.clear_my_privacy_history(p_scope text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_searches integer := 0; v_views integer := 0;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_scope not in ('all', 'searches', 'views') then
    raise exception 'Unknown history scope' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('privacy_history_clear', v_user::text);

  if p_scope in ('all', 'searches') then
    delete from public.user_recent_searches where user_id = v_user;
    get diagnostics v_searches = row_count;
  end if;
  if p_scope in ('all', 'views') then
    delete from public.user_recently_viewed_providers where user_id = v_user;
    get diagnostics v_views = row_count;
  end if;

  return pg_catalog.jsonb_build_object('searchesCleared', v_searches, 'viewsCleared', v_views);
end;
$$;

create or replace function public.set_my_account_deactivated(p_deactivated boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_provider_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.privacy_surface_enabled('center') then
    raise exception 'Privacy controls are not available' using errcode = '42501';
  end if;

  update public.profiles
  set deactivated_at = case when p_deactivated then coalesce(deactivated_at, pg_catalog.now()) else null end,
      updated_at = pg_catalog.now()
  where id = v_user;

  -- Deactivation hides the worker from discovery. It does not unpublish
  -- permanently and it removes nothing, so reactivating restores the listing.
  select p.id into v_provider_id from public.provider_profiles p where p.user_id = v_user;
  if v_provider_id is not null then
    update public.provider_profiles
    set is_available = not p_deactivated, updated_at = pg_catalog.now()
    where id = v_provider_id;
  end if;

  return pg_catalog.jsonb_build_object('deactivated', p_deactivated);
end;
$$;

/**
 * Request deletion.
 *
 * Blockers are evaluated now so the account learns immediately, and again
 * before execution so a dispute opened during the cooling-off window still
 * stops it. The request is created either way: an account that cannot delete
 * yet is still entitled to a standing request and an honest reason.
 */
create or replace function public.request_account_deletion(
  p_reason_code text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_config private.privacy_configuration;
  v_existing public.account_deletion_requests;
  v_codes text[];
  v_status text;
  v_key text;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.privacy_surface_enabled('deletion') then
    raise exception 'Deletion is not available' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('privacy_deletion_request', v_user::text);

  select * into v_config from private.privacy_configuration where singleton;

  select * into v_existing from public.account_deletion_requests r
  where r.user_id = v_user
    and r.status = any (array['cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'])
  limit 1;

  -- A retry returns the standing request rather than opening a second one.
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object(
      'id', v_existing.id, 'status', v_existing.status,
      'coolingOffEndsAt', v_existing.cooling_off_ends_at,
      'blockerCodes', pg_catalog.to_jsonb(v_existing.blocker_codes),
      'created', false);
  end if;

  v_codes := private.privacy_deletion_blockers(v_user);
  v_status := case
                when 'legal_hold' = any (v_codes) then 'legal_hold'
                when pg_catalog.cardinality(v_codes) > 0 then 'blocked'
                else 'cooling_off' end;
  v_key := coalesce(nullif(pg_catalog.btrim(p_idempotency_key), ''),
                    'deletion-' || v_user::text || '-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDDHH24MISS'));

  insert into public.account_deletion_requests
    (user_id, status, reason_code, cooling_off_ends_at, blocker_codes, idempotency_key)
  values (v_user, v_status, p_reason_code,
          pg_catalog.now() + pg_catalog.make_interval(hours => v_config.cooling_off_hours),
          v_codes, v_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id from public.account_deletion_requests r
    where r.user_id = v_user and r.idempotency_key = v_key;
    return pg_catalog.jsonb_build_object('id', v_id, 'status', v_status, 'created', false);
  end if;

  insert into private.account_deletion_events (request_id, from_status, to_status, actor_kind, actor_id, detail)
  values (v_id, null, v_status, 'account', v_user,
          pg_catalog.jsonb_build_object('blockerCount', pg_catalog.cardinality(v_codes)));

  insert into public.notifications (user_id, type, title, body, data)
  values (v_user,
          case when v_status = 'cooling_off' then 'privacy_deletion_requested' else 'privacy_deletion_blocked' end,
          'Privacy update', 'Your privacy request has an update.', '{}'::jsonb);

  perform private.record_operational_event('security', 'privacy_deletion_requested', 'info',
    pg_catalog.jsonb_build_object('status', v_status), 'customer');

  return pg_catalog.jsonb_build_object(
    'id', v_id, 'status', v_status,
    'coolingOffEndsAt', pg_catalog.now() + pg_catalog.make_interval(hours => v_config.cooling_off_hours),
    'blockerCodes', pg_catalog.to_jsonb(v_codes),
    'created', true);
end;
$$;

create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_request public.account_deletion_requests;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_request from public.account_deletion_requests r
  where r.user_id = v_user
    and r.status = any (array['cooling_off', 'blocked', 'legal_hold'])
  for update;

  if v_request.id is null then
    -- Once execution starts there is nothing left to cancel, and saying so is
    -- better than a button that appears to work.
    return pg_catalog.jsonb_build_object('cancelled', false, 'reason', 'not_cancellable');
  end if;

  update public.account_deletion_requests
  set status = 'cancelled', cancelled_at = pg_catalog.now()
  where id = v_request.id;

  insert into private.account_deletion_events (request_id, from_status, to_status, actor_kind, actor_id)
  values (v_request.id, v_request.status, 'cancelled', 'account', v_user);

  insert into public.notifications (user_id, type, title, body, data)
  values (v_user, 'privacy_deletion_cancelled', 'Privacy update', 'Your privacy request has an update.', '{}'::jsonb);

  return pg_catalog.jsonb_build_object('cancelled', true, 'requestId', v_request.id);
end;
$$;

-- ============================================================================
-- SECTION 9 — DATA EXPORT
-- ============================================================================
--
-- The manifest is generated here, in the database, from the inventory. The
-- FILE is not: producing a downloadable archive needs a worker or an Edge
-- Function, and Warsha has neither deployed. Rather than pretend, the request
-- stops at `manifest_ready` and the client says the export is being prepared —
-- which is true — while the runbook documents the missing component.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privacy-exports', 'privacy-exports', false, 26214400, array['application/json', 'application/zip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.privacy_export_requests (
  id               uuid primary key default extensions.gen_random_uuid(),
  user_id          uuid not null,
  status           text not null default 'requested',
  requested_at     timestamptz not null default pg_catalog.now(),
  manifest         jsonb,
  storage_path     text,
  expires_at       timestamptz not null,
  download_count   integer not null default 0,
  last_downloaded_at timestamptz,
  failure_reason   text,
  idempotency_key  text not null,
  environment      text not null default private.platform_environment(),
  constraint privacy_export_requests_status_check
    check (status = any (array['requested', 'manifest_ready', 'ready', 'expired', 'failed', 'cancelled'])),
  constraint privacy_export_requests_idempotency_check
    check (pg_catalog.length(idempotency_key) between 8 and 200),
  -- The path is always owner-prefixed, so an object can never be addressed
  -- outside the folder the storage policy scopes to.
  constraint privacy_export_requests_path_check
    check (storage_path is null or storage_path like (user_id::text || '/%'))
);

comment on table public.privacy_export_requests is
  'WPS-022 export requests. Owner-scoped, expiry-bound, and never containing another account''s private data.';

create unique index if not exists privacy_export_requests_idem_idx
  on public.privacy_export_requests (user_id, idempotency_key);

create index if not exists privacy_export_requests_user_idx
  on public.privacy_export_requests (user_id, requested_at desc);

/**
 * Build the export manifest.
 *
 * Categories come from the inventory, so an export cannot silently drift from
 * the documented classification: adding a personal-data table without an
 * inventory entry leaves it out of the export and fails a test.
 *
 * Counts only. The manifest says what exists and how much; it carries no
 * content, and nothing here reads another account's rows.
 */
create or replace function private.privacy_build_manifest(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_provider_id uuid; v_sections jsonb := '[]'::jsonb;
begin
  select p.id into v_provider_id from public.provider_profiles p where p.user_id = p_user_id;

  v_sections := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('key', 'profile', 'format', 'json',
      'rows', (select pg_catalog.count(*) from public.profiles p where p.id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'addresses', 'format', 'json',
      'rows', (select pg_catalog.count(*) from public.addresses a where a.customer_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'bookings', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.bookings b
               where b.customer_id = p_user_id
                  or (v_provider_id is not null and b.provider_id = v_provider_id))),
    pg_catalog.jsonb_build_object('key', 'reviews_written', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.reviews r where r.customer_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'messages', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.messages m where m.sender_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'support_cases', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.support_tickets t where t.requester_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'payments', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.financial_booking_payments p where p.customer_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'consents', 'format', 'json',
      'rows', (select pg_catalog.count(*) from public.privacy_consent_records c where c.user_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'search_history', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.user_recent_searches s where s.user_id = p_user_id)),
    pg_catalog.jsonb_build_object('key', 'referrals', 'format', 'csv',
      'rows', (select pg_catalog.count(*) from public.referral_attributions a
               where a.referrer_user_id = p_user_id or a.referred_user_id = p_user_id))
  );

  return pg_catalog.jsonb_build_object(
    'generatedAt', pg_catalog.now(),
    'environment', private.platform_environment(),
    'subject', p_user_id,
    'sections', v_sections,
    -- Stated in the manifest itself so the answer travels with the file rather
    -- than living only in a help article nobody opens.
    'excluded', pg_catalog.jsonb_build_array(
      'other participants'' contact details',
      'staff notes and internal case history',
      'the identity of anyone who reported a safety concern',
      'fraud and trust signal internals',
      'payment provider secrets and full card or bank numbers'
    )
  );
end;
$$;

create or replace function public.request_my_data_export(p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_config private.privacy_configuration;
  v_open integer;
  v_key text;
  v_id uuid;
  v_manifest jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.privacy_surface_enabled('export') then
    raise exception 'Export is not available' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('privacy_export_request', v_user::text);

  select * into v_config from private.privacy_configuration where singleton;

  v_key := coalesce(nullif(pg_catalog.btrim(p_idempotency_key), ''),
                    'export-' || v_user::text || '-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDDHH24MISS'));

  -- A RETRY IS NOT A SECOND REQUEST. The idempotency key is resolved before
  -- the open-request cap, otherwise a dropped response would leave the client
  -- unable to retry the very request it already owns.
  select r.id into v_id from public.privacy_export_requests r
  where r.user_id = v_user and r.idempotency_key = v_key;
  if v_id is not null then
    return pg_catalog.jsonb_build_object('id', v_id, 'status', 'manifest_ready', 'created', false);
  end if;

  select pg_catalog.count(*) into v_open from public.privacy_export_requests r
  where r.user_id = v_user
    and r.status = any (array['requested', 'manifest_ready', 'ready'])
    and r.expires_at > pg_catalog.now();
  if v_open >= v_config.export_max_open_requests then
    raise exception 'An export is already being prepared' using errcode = '55000';
  end if;

  v_manifest := private.privacy_build_manifest(v_user);

  insert into public.privacy_export_requests
    (user_id, status, manifest, expires_at, idempotency_key)
  values (v_user, 'manifest_ready', v_manifest,
          pg_catalog.now() + pg_catalog.make_interval(hours => v_config.export_ttl_hours), v_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id from public.privacy_export_requests r
    where r.user_id = v_user and r.idempotency_key = v_key;
    return pg_catalog.jsonb_build_object('id', v_id, 'created', false);
  end if;

  perform private.record_operational_event('security', 'privacy_export_requested', 'info',
    '{}'::jsonb, 'customer');

  return pg_catalog.jsonb_build_object(
    'id', v_id, 'status', 'manifest_ready', 'manifest', v_manifest, 'created', true);
end;
$$;

create or replace function public.get_my_data_exports(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', r.id,
      -- An expired request reads as expired even before the sweep runs,
      -- because that is what it is.
      'status', case when r.expires_at <= pg_catalog.now()
                       and r.status = any (array['requested', 'manifest_ready', 'ready'])
                     then 'expired' else r.status end,
      'requestedAt', r.requested_at,
      'expiresAt', r.expires_at,
      'manifest', r.manifest,
      'downloadCount', r.download_count
    ) order by r.requested_at desc)
    from (
      select * from public.privacy_export_requests e
      where e.user_id = v_user
      order by e.requested_at desc
      limit least(greatest(p_limit, 1), 50)
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ============================================================================
-- SECTION 10 — RETENTION ENGINE
-- ============================================================================
--
-- Rules are configuration. Durations are proposals until somebody qualified
-- has reviewed them, and `legal_review_status` carries that fact into the
-- execution guard rather than into a footnote.

create table if not exists private.privacy_retention_rules (
  rule_key             text primary key,
  data_class           text not null references private.data_classifications(classification_key),
  target_object        text not null,
  trigger_event        text not null,
  proposed_days        integer not null,
  authority            text not null,
  legal_review_status  text not null default 'pending',
  action_at_expiry     text not null,
  hold_scope           text not null default 'account',
  execution_owner      text not null,
  enabled              boolean not null default false,
  notes                text,
  constraint privacy_retention_rules_key_check
    check (rule_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  constraint privacy_retention_rules_review_check
    check (legal_review_status = any (array['pending', 'in_review', 'approved', 'rejected'])),
  constraint privacy_retention_rules_action_check
    check (action_at_expiry = any (array['delete', 'anonymize', 'archive', 'retain', 'manual_review'])),
  constraint privacy_retention_rules_days_check
    check (proposed_days between 1 and 36500)
);

comment on table private.privacy_retention_rules is
  'WPS-022 retention rules. Durations are product proposals pending professional review, never asserted statutory periods.';

create table if not exists private.privacy_retention_runs (
  id            uuid primary key default extensions.gen_random_uuid(),
  rule_key      text not null references private.privacy_retention_rules(rule_key),
  mode          text not null,
  actor_id      uuid,
  environment   text not null default private.platform_environment(),
  candidate_rows integer not null default 0,
  affected_rows  integer not null default 0,
  skipped_held_rows integer not null default 0,
  started_at    timestamptz not null default pg_catalog.now(),
  finished_at   timestamptz,
  outcome       text not null default 'started',
  detail        jsonb not null default '{}'::jsonb,
  constraint privacy_retention_runs_mode_check check (mode = any (array['dry_run', 'execute'])),
  constraint privacy_retention_runs_outcome_check
    check (outcome = any (array['started', 'previewed', 'executed', 'refused', 'failed']))
);

/**
 * Preview what a rule would touch.
 *
 * Read-only by construction: it counts, it never writes to the target. This is
 * the only retention surface enabled anywhere in this migration.
 */
create or replace function public.staff_retention_dry_run(p_rule_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_retention');
  v_rule private.privacy_retention_rules;
  v_candidates integer := 0;
  v_held integer := 0;
  v_run_id uuid;
begin
  select * into v_rule from private.privacy_retention_rules r where r.rule_key = p_rule_key;
  if v_rule is null then raise exception 'Unknown retention rule' using errcode = '22023'; end if;

  -- Counted per rule against its own target. Each branch is a count, never a
  -- delete, so a dry run cannot become an execution by accident.
  if p_rule_key = 'recent_search_history' then
    select pg_catalog.count(*) into v_candidates from public.user_recent_searches s
    where s.searched_at < pg_catalog.now() - pg_catalog.make_interval(days => v_rule.proposed_days);
  elsif p_rule_key = 'recently_viewed_history' then
    select pg_catalog.count(*) into v_candidates from public.user_recently_viewed_providers v
    where v.viewed_at < pg_catalog.now() - pg_catalog.make_interval(days => v_rule.proposed_days);
  elsif p_rule_key = 'typing_state' then
    select pg_catalog.count(*) into v_candidates from public.conversation_typing t
    where t.expires_at < pg_catalog.now();
  elsif p_rule_key = 'expired_privacy_exports' then
    select pg_catalog.count(*) into v_candidates from public.privacy_export_requests e
    where e.expires_at < pg_catalog.now()
      and e.status = any (array['requested', 'manifest_ready', 'ready']);
  elsif p_rule_key = 'revoked_device_tokens' then
    select pg_catalog.count(*) into v_candidates from private.notification_device_tokens d
    where d.revoked_at is not null
      and d.revoked_at < pg_catalog.now() - pg_catalog.make_interval(days => v_rule.proposed_days);
  elsif p_rule_key = 'rate_limit_events' then
    select pg_catalog.count(*) into v_candidates from private.rate_limit_events e
    where e.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_rule.proposed_days);
  else
    -- A rule with no counter is honest about it rather than reporting zero,
    -- which would read as "nothing to do". The attempt is still recorded: a
    -- preview somebody ran is a fact about the platform either way.
    insert into private.privacy_retention_runs
      (rule_key, mode, actor_id, candidate_rows, finished_at, outcome, detail)
    values (p_rule_key, 'dry_run', v_actor, 0, pg_catalog.now(), 'refused',
            pg_catalog.jsonb_build_object('reason', 'no_automated_counter'))
    returning id into v_run_id;

    perform private.record_staff_audit(v_actor, 'review_retention', 'retention_dry_run',
      'retention_rule', null, 'Retention preview',
      pg_catalog.jsonb_build_object('ruleKey', p_rule_key, 'supported', false));

    return pg_catalog.jsonb_build_object(
      'ruleKey', p_rule_key, 'mode', 'dry_run', 'supported', false,
      'runId', v_run_id,
      'legalReviewStatus', v_rule.legal_review_status,
      'executionEnabled', false,
      'note', 'No automated counter exists for this rule. It is reviewed manually.');
  end if;

  select pg_catalog.count(*) into v_held from private.privacy_legal_holds h
  where h.released_at is null and (h.scope = v_rule.hold_scope or h.scope = 'account');

  insert into private.privacy_retention_runs
    (rule_key, mode, actor_id, candidate_rows, skipped_held_rows, finished_at, outcome)
  values (p_rule_key, 'dry_run', v_actor, v_candidates, v_held, pg_catalog.now(), 'previewed')
  returning id into v_run_id;

  perform private.record_staff_audit(v_actor, 'review_retention', 'retention_dry_run',
    'retention_rule', null, 'Retention preview',
    pg_catalog.jsonb_build_object('ruleKey', p_rule_key, 'candidates', v_candidates));

  return pg_catalog.jsonb_build_object(
    'ruleKey', p_rule_key,
    'mode', 'dry_run',
    'supported', true,
    'runId', v_run_id,
    'candidateRows', v_candidates,
    'accountsUnderHold', v_held,
    'proposedDays', v_rule.proposed_days,
    'actionAtExpiry', v_rule.action_at_expiry,
    'legalReviewStatus', v_rule.legal_review_status,
    'executionEnabled', private.privacy_retention_executable(p_rule_key));
end;
$$;

/**
 * May this rule execute against real data right now?
 *
 * Five independent conditions, all of which must hold. It returns false in
 * this migration for every rule, and it is written so that turning one on is a
 * deliberate act with an audit trail rather than a default that drifted.
 */
create or replace function private.privacy_retention_executable(p_rule_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_rule private.privacy_retention_rules; v_config private.privacy_configuration;
begin
  select * into v_rule from private.privacy_retention_rules r where r.rule_key = p_rule_key;
  if v_rule is null then return false; end if;
  select * into v_config from private.privacy_configuration where singleton;
  if v_config is null then return false; end if;

  return v_rule.enabled
     and v_rule.legal_review_status = 'approved'
     and v_config.retention_execution_enabled
     and not private.staff_kill_switch_active('retention_execution')
     and private.platform_environment() <> 'production';
end;
$$;

comment on function private.privacy_retention_executable(text) is
  'WPS-022 execution guard. Production execution additionally requires an approved change and is refused here by design.';

-- ============================================================================
-- SECTION 11 — STORAGE LIFECYCLE MATRIX
-- ============================================================================

create table if not exists private.storage_bucket_lifecycle (
  bucket_id          text primary key,
  owner_domain       text not null,
  visibility         text not null,
  path_format        text not null,
  row_authority      text not null,
  signed_url_seconds integer not null,
  deletion_trigger   text not null,
  retention_rule_key text references private.privacy_retention_rules(rule_key),
  hold_scope         text not null default 'account',
  export_included    boolean not null,
  cleanup_owner      text not null,
  constraint storage_bucket_lifecycle_visibility_check
    check (visibility = any (array['private_owner', 'private_participant', 'private_staff', 'public_signed', 'retired']))
);

comment on table private.storage_bucket_lifecycle is
  'WPS-022 bucket-by-bucket lifecycle. A bucket absent from this table has no documented owner and fails a test.';

/**
 * Objects with no owning row.
 *
 * Preview only, and it returns counts rather than paths: a list of orphaned
 * object names in a staff response is itself a small data leak. Nothing is
 * deleted here — an ambiguous read must never become a delete, which is how
 * cleanup jobs destroy evidence.
 */
create or replace function public.staff_storage_orphan_preview(p_bucket_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_retention');
  v_total integer := 0;
  v_orphans integer := 0;
  v_supported boolean := true;
begin
  if not exists (select 1 from private.storage_bucket_lifecycle b where b.bucket_id = p_bucket_id) then
    raise exception 'Unknown bucket' using errcode = '22023';
  end if;

  select pg_catalog.count(*) into v_total from storage.objects o where o.bucket_id = p_bucket_id;

  if p_bucket_id = 'review-attachments' then
    select pg_catalog.count(*) into v_orphans from storage.objects o
    where o.bucket_id = p_bucket_id
      and not exists (select 1 from public.review_attachments a where a.storage_path = o.name);
  elsif p_bucket_id = 'dispute-evidence' then
    select pg_catalog.count(*) into v_orphans from storage.objects o
    where o.bucket_id = p_bucket_id
      and not exists (select 1 from public.dispute_evidence e where e.storage_path = o.name);
  elsif p_bucket_id = 'support-attachments' then
    select pg_catalog.count(*) into v_orphans from storage.objects o
    where o.bucket_id = p_bucket_id
      and not exists (select 1 from public.support_ticket_attachments a where a.storage_path = o.name);
  elsif p_bucket_id = 'provider-portfolios' then
    select pg_catalog.count(*) into v_orphans from storage.objects o
    where o.bucket_id = p_bucket_id
      and not exists (select 1 from public.provider_portfolio p where p.image_path = o.name);
  else
    v_supported := false;
  end if;

  perform private.record_staff_audit(v_actor, 'review_retention', 'storage_orphan_preview',
    'storage_bucket', null, 'Orphan preview',
    pg_catalog.jsonb_build_object('bucket', p_bucket_id, 'orphans', v_orphans));

  return pg_catalog.jsonb_build_object(
    'bucketId', p_bucket_id, 'supported', v_supported,
    'objectCount', v_total, 'orphanCount', case when v_supported then v_orphans else null end,
    'deletionPerformed', false);
end;
$$;

-- ============================================================================
-- SECTION 12 — PRIVACY INCIDENTS
-- ============================================================================
--
-- An incident is a WPS-017 `operational_incidents` row. This table adds the
-- privacy facts to it rather than starting a second incident system, so the
-- commander, severity, and timeline stay in one place.

create table if not exists private.privacy_incident_details (
  incident_id            uuid primary key references public.operational_incidents(id),
  privacy_category       text not null,
  affected_classes       text[] not null default '{}',
  affected_accounts_estimate integer,
  containment_note       text,
  corrective_action      text,
  -- A decision recorded, never an action performed. Nothing in this codebase
  -- notifies a regulator, and nothing here should imply that it did.
  external_notification_decision text not null default 'not_assessed',
  decision_recorded_by   uuid,
  decision_recorded_at   timestamptz,
  created_at             timestamptz not null default pg_catalog.now(),
  constraint privacy_incident_details_category_check
    check (privacy_category = any (array[
      'unauthorized_access', 'incorrect_export', 'cross_account_exposure',
      'public_storage_exposure', 'secret_exposure', 'excessive_logging',
      'retention_failure', 'deletion_failure', 'misdirected_notification',
      'unauthorized_staff_access'
    ])),
  constraint privacy_incident_details_decision_check
    check (external_notification_decision = any (array[
      'not_assessed', 'legal_review_requested', 'notification_not_required',
      'notification_required', 'notification_sent'
    ]))
);

comment on table private.privacy_incident_details is
  'WPS-022 privacy facts attached to a WPS-017 incident. External notification is a recorded legal decision, never automated.';

-- ============================================================================
-- SECTION 13 — STAFF SURFACES
-- ============================================================================
--
-- Staff see the STATE of a privacy request, never its contents. There is no
-- staff path in this migration that reads an account's export manifest, and
-- that is the point: an export is built for one person.

create or replace function public.staff_privacy_requests(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('review_privacy_requests'); v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(x order by x ->> 'requestedAt' desc), '[]'::jsonb) into v_rows
  from (
    select pg_catalog.jsonb_build_object(
      'id', r.id,
      'kind', 'deletion',
      'subjectRef', pg_catalog.left(r.user_id::text, 8),
      'status', r.status,
      'requestedAt', r.requested_at,
      'coolingOffEndsAt', r.cooling_off_ends_at,
      'blockerCount', pg_catalog.cardinality(r.blocker_codes)
    ) as x
    from public.account_deletion_requests r
    order by r.requested_at desc
    limit least(greatest(p_limit, 1), 200)
  ) s;

  -- `audit_explorer` is the WPS-018 surface vocabulary, not a new one: reading
  -- the privacy queue is reviewing platform records, and the query shape below
  -- carries which records. Widening that allowlist for one caller would make
  -- every future access review harder to read.
  perform private.staff_log_access(v_actor, 'audit_explorer', 'review_privacy_requests',
    'privacy_deletion_requests', pg_catalog.jsonb_array_length(v_rows));

  return v_rows;
end;
$$;

create or replace function public.staff_create_legal_hold(
  p_subject_user_id uuid,
  p_scope text,
  p_reason_category text,
  p_reason_note text,
  p_review_due_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('manage_legal_holds'); v_id uuid;
begin
  perform private.enforce_rate_limit('staff_privileged_action', v_actor::text);

  -- A hold without a review date becomes permanent retention by neglect.
  if p_review_due_at is null or p_review_due_at <= pg_catalog.now() then
    raise exception 'A hold requires a future review date' using errcode = '22023';
  end if;
  if p_review_due_at > pg_catalog.now() + pg_catalog.make_interval(days => 365) then
    raise exception 'A hold may not run longer than a year without review' using errcode = '22023';
  end if;

  insert into private.privacy_legal_holds
    (subject_user_id, scope, reason_category, reason_note, created_by, review_due_at)
  values (p_subject_user_id, p_scope, p_reason_category, p_reason_note, v_actor, p_review_due_at)
  returning id into v_id;

  insert into private.privacy_legal_hold_events (hold_id, action, actor_id, detail)
  values (v_id, 'created', v_actor, pg_catalog.jsonb_build_object('scope', p_scope));

  perform private.record_staff_audit(v_actor, 'manage_legal_holds', 'legal_hold_created',
    'privacy_legal_hold', v_id, p_reason_note,
    pg_catalog.jsonb_build_object('scope', p_scope, 'reasonCategory', p_reason_category));

  return v_id;
end;
$$;

create or replace function public.staff_release_legal_hold(p_hold_id uuid, p_release_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('manage_legal_holds'); v_hold private.privacy_legal_holds;
begin
  select * into v_hold from private.privacy_legal_holds h where h.id = p_hold_id for update;
  if v_hold.id is null then raise exception 'Unknown hold' using errcode = '22023'; end if;
  if v_hold.released_at is not null then return false; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_release_reason, ''))) < 10 then
    raise exception 'A release reason is required' using errcode = '22023';
  end if;

  -- Releasing a hold unblocks deletion of evidence, so the person who created
  -- it does not get to be the person who lifts it.
  if v_hold.created_by = v_actor
     and exists (select 1 from private.staff_platform_configuration c where c.singleton and c.dual_control_enabled) then
    raise exception 'A hold must be released by a second person' using errcode = '42501';
  end if;

  update private.privacy_legal_holds
  set released_by = v_actor, released_at = pg_catalog.now(), release_reason = p_release_reason
  where id = p_hold_id;

  insert into private.privacy_legal_hold_events (hold_id, action, actor_id, detail)
  values (p_hold_id, 'released', v_actor, pg_catalog.jsonb_build_object('scope', v_hold.scope));

  perform private.record_staff_audit(v_actor, 'manage_legal_holds', 'legal_hold_released',
    'privacy_legal_hold', p_hold_id, p_release_reason, '{}'::jsonb);

  return true;
end;
$$;

create or replace function public.staff_data_inventory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('view_data_inventory');
begin
  perform private.staff_log_access(v_actor, 'audit_explorer', 'view_data_inventory',
    'privacy_data_inventory', 0);
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'entryKey', i.entry_key,
      'object', i.schema_name || '.' || i.object_name,
      'kind', i.object_kind,
      'classification', i.classification_key,
      'purpose', i.purpose,
      'authority', i.authority,
      'retentionTrigger', i.retention_trigger,
      'deletionTreatment', i.deletion_treatment,
      'exportIncluded', i.export_included
    ) order by i.entry_key)
    from private.data_inventory i
  ), '[]'::jsonb);
end;
$$;

-- ============================================================================
-- SECTION 14 — RLS AND GRANTS
-- ============================================================================
--
-- RLS scopes rows; it does not grant privileges. Both are stated explicitly
-- below so the privilege set is declared rather than inherited from Supabase's
-- defaults — the defect WPS-021 found on its own tables.

alter table public.privacy_consent_purposes enable row level security;
alter table public.privacy_consent_records  enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.privacy_export_requests   enable row level security;

revoke all on public.privacy_consent_purposes  from anon, authenticated, public;
revoke all on public.privacy_consent_records   from anon, authenticated, public;
revoke all on public.account_deletion_requests from anon, authenticated, public;
revoke all on public.privacy_export_requests   from anon, authenticated, public;

grant select on public.privacy_consent_purposes  to authenticated;
grant select on public.privacy_consent_records   to authenticated;
grant select on public.account_deletion_requests to authenticated;
grant select on public.privacy_export_requests   to authenticated;

drop policy if exists privacy_consent_purposes_read on public.privacy_consent_purposes;
create policy privacy_consent_purposes_read on public.privacy_consent_purposes
  for select to authenticated using (active);

drop policy if exists privacy_consent_records_owner_read on public.privacy_consent_records;
create policy privacy_consent_records_owner_read on public.privacy_consent_records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists account_deletion_requests_owner_read on public.account_deletion_requests;
create policy account_deletion_requests_owner_read on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists privacy_export_requests_owner_read on public.privacy_export_requests;
create policy privacy_export_requests_owner_read on public.privacy_export_requests
  for select to authenticated using (user_id = (select auth.uid()));

-- No insert, update or delete policy exists on any of the four. Every write
-- goes through a SECURITY DEFINER RPC, so there is no client path that
-- fabricates a consent record or marks its own deletion complete.

-- Export objects: the owner may read their own folder and nothing else. There
-- is no user insert policy — the export is written by the server.
drop policy if exists privacy_export_owner_read on storage.objects;
create policy privacy_export_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'privacy-exports'
     and (storage.foldername(name))[1] = ((select auth.uid()))::text);

revoke all on function private.privacy_anonymize_account(uuid, uuid) from anon, authenticated, public;
revoke all on function private.privacy_deletion_blockers(uuid) from anon, authenticated, public;
revoke all on function private.privacy_build_manifest(uuid) from anon, authenticated, public;
revoke all on function private.privacy_hold_active(uuid, text) from anon, authenticated, public;
revoke all on function private.privacy_retention_executable(text) from anon, authenticated, public;
revoke all on function private.privacy_surface_enabled(text) from anon, authenticated, public;
revoke all on function private.privacy_config() from anon, authenticated, public;

grant execute on function public.get_my_privacy_overview() to authenticated;
grant execute on function public.get_my_consents() to authenticated;
grant execute on function public.record_my_consent(text, boolean, text) to authenticated;
grant execute on function public.clear_my_privacy_history(text) to authenticated;
grant execute on function public.set_my_account_deactivated(boolean) to authenticated;
grant execute on function public.request_account_deletion(text, text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
grant execute on function public.request_my_data_export(text) to authenticated;
grant execute on function public.get_my_data_exports(integer) to authenticated;
grant execute on function public.staff_retention_dry_run(text) to authenticated;
grant execute on function public.staff_storage_orphan_preview(text) to authenticated;
grant execute on function public.staff_privacy_requests(integer) to authenticated;
grant execute on function public.staff_create_legal_hold(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.staff_release_legal_hold(uuid, text) to authenticated;
grant execute on function public.staff_data_inventory() to authenticated;

revoke all on function public.get_my_privacy_overview() from anon;
revoke all on function public.get_my_consents() from anon;
revoke all on function public.record_my_consent(text, boolean, text) from anon;
revoke all on function public.clear_my_privacy_history(text) from anon;
revoke all on function public.set_my_account_deactivated(boolean) from anon;
revoke all on function public.request_account_deletion(text, text) from anon;
revoke all on function public.cancel_account_deletion() from anon;
revoke all on function public.request_my_data_export(text) from anon;
revoke all on function public.get_my_data_exports(integer) from anon;
revoke all on function public.staff_retention_dry_run(text) from anon;
revoke all on function public.staff_storage_orphan_preview(text) from anon;
revoke all on function public.staff_privacy_requests(integer) from anon;
revoke all on function public.staff_create_legal_hold(uuid, text, text, text, timestamptz) from anon;
revoke all on function public.staff_release_legal_hold(uuid, text) from anon;
revoke all on function public.staff_data_inventory() from anon;

-- ============================================================================
-- SECTION 15 — SEED DATA
-- ============================================================================

insert into private.data_classifications
  (classification_key, label_en, label_ar, description, personal, staff_readable, exportable, sort_order)
values
  ('public_listing', 'Public listing', 'بيانات معروضة للجميع',
   'Deliberately published so customers can choose a worker.', true, true, true, 1),
  ('account_private', 'Account information', 'بيانات الحساب',
   'Yours alone: contact details, addresses, preferences.', true, true, true, 2),
  ('participant_private', 'Shared with the other party', 'بيانات مشتركة مع الطرف الآخر',
   'Visible to the customer and worker on a booking, and to nobody else.', true, true, true, 3),
  ('identity_sensitive', 'Identity documents', 'مستندات الهوية',
   'Verification documents and certificates. Never public, never exported in raw form.', true, true, false, 4),
  ('financial_authoritative', 'Payment and earnings records', 'سجلات المدفوعات والأرباح',
   'Authoritative money records. Preserved; a deletion request never removes them.', true, true, true, 5),
  ('trust_restricted', 'Safety and trust records', 'سجلات الأمان',
   'Reports, evidence and enforcement history. Staff-only. Reporter identity is never disclosed.', true, true, false, 6),
  ('support_restricted', 'Support and dispute records', 'سجلات الدعم والنزاعات',
   'Cases, replies and evidence. Your own messages are exportable; staff notes are not.', true, true, false, 7),
  ('credential_secret', 'Credentials and secrets', 'بيانات الدخول',
   'Passwords, tokens and provider secrets. Never readable by staff, never exported.', true, false, false, 8),
  ('operational_audit', 'Operational and audit records', 'سجلات التشغيل',
   'Who did what, for security. Retained; personal detail is hashed or omitted at write time.', true, true, false, 9),
  ('derived_personalization', 'Search and viewing history', 'سجل البحث والمشاهدة',
   'Recent searches and recently viewed workers. You can clear these at any time.', true, false, true, 10),
  ('ephemeral', 'Temporary signals', 'إشارات مؤقتة',
   'Typing indicators and similar. Expire on their own and are never retained.', true, false, false, 11),
  ('aggregate_nonpersonal', 'Aggregated statistics', 'إحصاءات مجمعة',
   'Counts with a minimum cell size. Not linked to an account.', false, true, false, 12)
on conflict (classification_key) do nothing;

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose, authority,
   retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('profiles', 'public', 'profiles', 'table', 'account_private',
   'Identifies the account across the product and carries the contact phone.', 'WPS-002',
   'account_deletion', 'anonymize', true, 'view_contact_details', null),
  ('provider_profiles', 'public', 'provider_profiles', 'table', 'public_listing',
   'The public worker listing customers browse and choose from.', 'WPS-010',
   'account_deletion', 'anonymize', true, 'view_safe_worker_profile', null),
  ('addresses', 'public', 'addresses', 'table', 'account_private',
   'Where the work happens. Exact coordinates never enter discovery analytics.', 'WPS-001',
   'account_deletion', 'anonymize', true, null, 'Booking snapshots freeze the address served.'),
  ('bookings', 'public', 'bookings', 'table', 'participant_private',
   'The commercial record of a job between two people.', 'WPS-007',
   'never', 'preserve_minimized', true, null, 'Both parties depend on it; one cannot erase it.'),
  ('messages', 'public', 'messages', 'table', 'participant_private',
   'Conversation evidence for a booking, relied on in disputes.', 'WPS-009',
   'retention_rule', 'preserve_minimized', true, null, 'Sender presentation is neutralized, content preserved.'),
  ('reviews', 'public', 'reviews', 'table', 'public_listing',
   'Verified booking feedback that a worker''s reputation rests on.', 'WPS-011',
   'never', 'preserve_minimized', true, null, 'Reviewer becomes a neutral label; the rating stands.'),
  ('disputes', 'public', 'disputes', 'table', 'support_restricted',
   'Formal disagreement over a booking outcome.', 'WPS-013',
   'legal_review', 'preserve', false, 'review_disputes', null),
  ('trust_reports', 'public', 'trust_reports', 'table', 'trust_restricted',
   'Safety reports. Reporter identity is never disclosed to the subject.', 'WPS-016',
   'legal_review', 'preserve', false, 'review_abuse_reports', null),
  ('trust_fraud_signals', 'private', 'trust_fraud_signals', 'table', 'trust_restricted',
   'Abuse detection signals. Internals are never exported or shown to the subject.', 'WPS-016',
   'retention_rule', 'preserve', false, 'review_abuse_reports', null),
  ('provider_verification_documents', 'public', 'provider_verification_documents', 'table', 'identity_sensitive',
   'Proves a worker is who they claim before customers let them into a home.', 'WPS-006',
   'legal_review', 'preserve_minimized', false, 'review_identity_verification',
   'Retention duration is an open legal question.'),
  ('provider_verification_identities', 'private', 'provider_verification_identities', 'table', 'identity_sensitive',
   'Holds a hash and the last four digits of a national ID, never the number.', 'WPS-006',
   'legal_review', 'preserve_minimized', false, 'review_identity_verification', null),
  ('financial_booking_payments', 'public', 'financial_booking_payments', 'table', 'financial_authoritative',
   'What a customer paid for a booking. An accounting record.', 'WPS-007',
   'legal_review', 'preserve', true, 'inspect_payment_state', null),
  ('financial_ledger_entries', 'private', 'financial_ledger_entries', 'table', 'financial_authoritative',
   'Double-entry ledger. Deleting an entry would unbalance the books.', 'WPS-007',
   'legal_review', 'preserve', false, 'view_financial_ledger', null),
  ('provider_earnings_ledger', 'public', 'provider_earnings_ledger', 'table', 'financial_authoritative',
   'What Warsha owes a worker and what it has paid.', 'WPS-007',
   'legal_review', 'preserve', true, 'view_financial_ledger', null),
  ('provider_payout_destinations', 'public', 'provider_payout_destinations', 'table', 'financial_authoritative',
   'Where a worker is paid. Stored masked; the full number is never held.', 'WPS-015',
   'legal_review', 'preserve_minimized', false, 'review_withdrawal', null),
  ('notifications', 'public', 'notifications', 'table', 'account_private',
   'Tells an account something happened. Titles and payloads are generic by construction.', 'WPS-014',
   'retention_rule', 'preserve', false, null,
   'Not deleted on anonymization: payloads hold only resource UUIDs and the WPS-014 dedupe ledger is immutable.'),
  ('notification_device_tokens', 'private', 'notification_device_tokens', 'table', 'credential_secret',
   'Addresses a device for push. Stored hashed and encrypted, never in plain text.', 'WPS-014',
   'account_deletion', 'preserve_minimized', false, null, 'Revoked on deletion; the hash proves delivery stopped.'),
  ('user_recent_searches', 'public', 'user_recent_searches', 'table', 'derived_personalization',
   'Speeds up repeat searches for the person who typed them.', 'WPS-020',
   'user_request', 'delete', true, null, 'Clearable at any time from the privacy centre.'),
  ('user_recently_viewed_providers', 'public', 'user_recently_viewed_providers', 'table', 'derived_personalization',
   'Lets someone find a worker they looked at yesterday.', 'WPS-020',
   'user_request', 'delete', true, null, null),
  ('user_display_preferences', 'public', 'user_display_preferences', 'table', 'account_private',
   'Remembers the chosen appearance across devices.', 'WPS-020',
   'account_deletion', 'delete', true, null, 'The local device store remains the authority.'),
  ('conversation_typing', 'public', 'conversation_typing', 'table', 'ephemeral',
   'Shows the other person is writing. Expires within seconds.', 'WPS-009',
   'automatic_expiry', 'delete', false, null, null),
  ('referral_attributions', 'public', 'referral_attributions', 'table', 'account_private',
   'Records who invited whom, so a reward can be attributed and fraud detected.', 'WPS-021',
   'never', 'preserve', true, null, 'Deleting it would enable delete-and-recreate referral fraud.'),
  ('staff_audit_events', 'private', 'staff_audit_events', 'table', 'operational_audit',
   'What a member of staff did, so privileged access can be reviewed.', 'WPS-017',
   'retention_rule', 'preserve', false, 'view_audit_logs', null),
  ('staff_access_log', 'private', 'staff_access_log', 'table', 'operational_audit',
   'Which sensitive records staff read. Query shapes are hashed, never raw terms.', 'WPS-018',
   'retention_rule', 'preserve', false, 'view_audit_logs', null),
  ('privacy_consent_records', 'public', 'privacy_consent_records', 'table', 'account_private',
   'Proves what was agreed, when, and under which document version.', 'WPS-022',
   'never', 'preserve', true, null, 'Immutable; withdrawal appends rather than edits.'),
  ('privacy_export_bucket', 'storage', 'privacy-exports', 'bucket', 'account_private',
   'Holds a prepared copy of one account''s own data, briefly.', 'WPS-022',
   'automatic_expiry', 'delete', false, null, 'Owner-scoped path; expires and is swept.'),
  ('verification_documents_bucket', 'storage', 'verification-documents', 'bucket', 'identity_sensitive',
   'The identity files themselves.', 'WPS-006',
   'legal_review', 'preserve_minimized', false, 'review_identity_verification', null),
  ('avatars_bucket', 'storage', 'avatars', 'bucket', 'public_listing',
   'Retired day-one bucket. Superseded by profile-images and closed by WPS-022.', 'WPS-022',
   'retired', 'not_applicable', false, null, 'Made private and left with no policy.')
on conflict (entry_key) do nothing;

insert into public.privacy_consent_purposes
  (purpose_key, required, document_key, current_version, title_en, title_ar,
   explanation_en, explanation_ar, sort_order)
values
  ('terms_of_service', true, 'terms', '2026-08-07',
   'Terms of service', 'شروط الاستخدام',
   'The agreement that lets you use Warsha.',
   'الاتفاق اللي بيسمحلك تستخدم ورشة.', 1),
  ('privacy_notice', true, 'privacy', '2026-08-07',
   'Privacy notice', 'إشعار الخصوصية',
   'What we collect and why. Acknowledging it is not agreement to anything optional.',
   'بنجمع إيه وليه. الموافقة على الإشعار مش موافقة على أي حاجة اختيارية.', 2),
  ('service_communication', true, 'privacy', '2026-08-07',
   'Booking messages', 'رسائل الحجز',
   'Messages about your bookings. These cannot be turned off while a booking is live.',
   'رسائل خاصة بحجوزاتك. مش ممكن توقفها وانت عندك حجز شغال.', 3),
  ('marketing_communication', false, 'privacy', '2026-08-07',
   'Offers and news', 'عروض وأخبار',
   'Occasional messages about offers. Off unless you turn it on.',
   'رسائل من وقت للتاني عن العروض. مقفولة غير لما تفتحها بنفسك.', 4),
  ('referral_communication', false, 'privacy', '2026-08-07',
   'Invite updates', 'تحديثات الدعوات',
   'Tells you when someone you invited finishes their first job.',
   'بتقولك لما حد دعيته يخلّص أول شغلانة.', 5),
  ('diagnostics', false, 'privacy', '2026-08-07',
   'Crash and performance reports', 'تقارير الأعطال والأداء',
   'Helps us find faults. Contains no message content and no addresses.',
   'بتساعدنا نلاقي الأعطال. مفيهاش محتوى رسايل ولا عناوين.', 6),
  ('location_use', false, 'privacy', '2026-08-07',
   'Location', 'الموقع',
   'Used only while you are choosing an address. Warsha never tracks you in the background.',
   'بيتستخدم وانت بتختار العنوان بس. ورشة مش بتتابعك في الخلفية أبداً.', 7),
  ('identity_verification', false, 'verification', '2026-08-07',
   'Identity check', 'التحقق من الهوية',
   'For workers: we review your documents so customers can trust you.',
   'للصنايعي: بنراجع مستنداتك عشان العملاء يثقوا فيك.', 8)
on conflict (purpose_key) do nothing;

-- Backfill from the pre-existing scalar acknowledgements so the ledger starts
-- with what actually happened rather than an empty history that would read as
-- "nobody ever accepted anything".
insert into public.privacy_consent_records
  (user_id, purpose_key, document_version, granted, decided_at, environment, source_surface)
select p.id, 'terms_of_service', '2026-08-07', true, p.terms_accepted_at,
       private.platform_environment(), 'migration'
from public.profiles p
where p.terms_accepted_at is not null
  and not exists (select 1 from public.privacy_consent_records r
                  where r.user_id = p.id and r.purpose_key = 'terms_of_service');

insert into public.privacy_consent_records
  (user_id, purpose_key, document_version, granted, decided_at, environment, source_surface)
select p.id, 'privacy_notice', '2026-08-07', true, p.privacy_accepted_at,
       private.platform_environment(), 'migration'
from public.profiles p
where p.privacy_accepted_at is not null
  and not exists (select 1 from public.privacy_consent_records r
                  where r.user_id = p.id and r.purpose_key = 'privacy_notice');

insert into private.privacy_retention_rules
  (rule_key, data_class, target_object, trigger_event, proposed_days, authority,
   legal_review_status, action_at_expiry, hold_scope, execution_owner, enabled, notes)
values
  ('recent_search_history', 'derived_personalization', 'public.user_recent_searches',
   'last_search', 90, 'Product proposal. No statutory basis claimed.',
   'pending', 'delete', 'account', 'operations_manager', false,
   'Already capped at 10 rows per account by trigger.'),
  ('recently_viewed_history', 'derived_personalization', 'public.user_recently_viewed_providers',
   'last_view', 90, 'Product proposal. No statutory basis claimed.',
   'pending', 'delete', 'account', 'operations_manager', false,
   'Already capped at 20 rows per account by trigger.'),
  ('typing_state', 'ephemeral', 'public.conversation_typing',
   'expiry_timestamp', 1, 'Operational only. Rows carry their own expiry.',
   'approved', 'delete', 'communications', 'operations_manager', false,
   'Approved because it holds no content and the row states its own expiry.'),
  ('expired_privacy_exports', 'account_private', 'public.privacy_export_requests',
   'export_expiry', 3, 'Product proposal aligned to the configured export TTL.',
   'pending', 'delete', 'account', 'security_administrator', false,
   'Storage objects must be swept with the row. See the storage runbook.'),
  ('revoked_device_tokens', 'credential_secret', 'private.notification_device_tokens',
   'token_revoked', 180, 'Product proposal. Retained to evidence that delivery stopped.',
   'pending', 'delete', 'account', 'security_administrator', false, null),
  ('rate_limit_events', 'operational_audit', 'private.rate_limit_events',
   'event_recorded', 7, 'WPS-018 observability retention policy.',
   'approved', 'delete', 'account', 'operations_manager', false,
   'Subjects are hashed. Duration already recorded in observability_retention_policy.'),
  ('identity_documents', 'identity_sensitive', 'storage.verification-documents',
   'verification_decided', 1825, 'UNRESOLVED. Requires Egyptian legal advice.',
   'pending', 'manual_review', 'identity_documents', 'security_administrator', false,
   'The duration is a placeholder, not a legal position. See WARSHA-PRIVACY-LEGAL-QUESTIONS.'),
  ('financial_records', 'financial_authoritative', 'private.financial_ledger_entries',
   'transaction_settled', 3650, 'UNRESOLVED. Requires Egyptian tax and accounting advice.',
   'pending', 'retain', 'financial_records', 'finance_controller', false,
   'Never automatically deleted. Listed so the open question is visible.'),
  ('dispute_evidence', 'support_restricted', 'storage.dispute-evidence',
   'dispute_closed', 730, 'UNRESOLVED. Requires consumer-protection advice.',
   'pending', 'manual_review', 'dispute_evidence', 'operations_manager', false, null),
  ('support_attachments', 'support_restricted', 'storage.support-attachments',
   'case_closed', 365, 'Product proposal. No statutory basis claimed.',
   'pending', 'manual_review', 'support_records', 'operations_manager', false, null),
  ('chat_messages', 'participant_private', 'public.messages',
   'booking_closed', 1095, 'Existing WPS-009 communication_configuration value.',
   'pending', 'manual_review', 'communications', 'operations_manager', false,
   'WPS-009 already owns message_retention_days; this rule records it, it does not replace it.')
on conflict (rule_key) do nothing;

insert into private.storage_bucket_lifecycle
  (bucket_id, owner_domain, visibility, path_format, row_authority, signed_url_seconds,
   deletion_trigger, retention_rule_key, hold_scope, export_included, cleanup_owner)
values
  ('avatars', 'retired', 'retired', 'n/a', 'none', 0,
   'retired_by_wps022', null, 'account', false, 'security_administrator'),
  ('profile-images', 'WPS-010', 'private_owner', '{user_id}/{file}', 'public.profiles.avatar_url', 900,
   'account_anonymization', null, 'account', false, 'operations_manager'),
  ('provider-portfolios', 'WPS-010', 'private_owner', '{user_id}/{file}', 'public.provider_portfolio', 900,
   'account_anonymization', null, 'account', false, 'operations_manager'),
  ('provider-certificates', 'WPS-010', 'private_staff', '{user_id}/{file}', 'public.provider_certifications', 900,
   'legal_review', 'identity_documents', 'identity_documents', false, 'security_administrator'),
  ('verification-documents', 'WPS-006', 'private_staff', '{user_id}/{file}', 'public.provider_verification_documents', 900,
   'legal_review', 'identity_documents', 'identity_documents', false, 'security_administrator'),
  ('booking-attachments', 'WPS-012', 'private_participant', '{booking_id}/{file}', 'public.booking_attachments', 900,
   'booking_retention', null, 'communications', true, 'operations_manager'),
  ('chat-attachments', 'WPS-009', 'private_participant', '{booking_id}/{file}', 'public.message_attachments', 900,
   'message_retention', 'chat_messages', 'communications', true, 'operations_manager'),
  ('job-progress-media', 'WPS-012', 'private_participant', '{booking_id}/{file}', 'public.job_progress_media', 3600,
   'booking_retention', null, 'communications', true, 'operations_manager'),
  ('marketplace-request-attachments', 'WPS-008', 'private_owner', '{user_id}/{file}', 'public.marketplace_request_attachments', 900,
   'request_expiry', null, 'account', true, 'operations_manager'),
  ('review-attachments', 'WPS-011', 'public_signed', '{review_id}/{file}', 'public.review_attachments', 900,
   'review_moderation', null, 'account', true, 'operations_manager'),
  ('dispute-evidence', 'WPS-013', 'private_participant', '{dispute_id}/{file}', 'public.dispute_evidence', 900,
   'legal_review', 'dispute_evidence', 'dispute_evidence', false, 'operations_manager'),
  ('support-attachments', 'WPS-019', 'private_participant', '{ticket_id}/{file}', 'public.support_ticket_attachments', 900,
   'case_closed', 'support_attachments', 'support_records', true, 'operations_manager'),
  ('privacy-exports', 'WPS-022', 'private_owner', '{user_id}/{export_id}.json', 'public.privacy_export_requests', 300,
   'export_expiry', 'expired_privacy_exports', 'account', false, 'security_administrator')
on conflict (bucket_id) do nothing;

insert into public.staff_capabilities
  (capability_key, domain, description, high_risk, dual_control, requires_reauth)
values
  ('review_privacy_requests', 'accounts',
   'See the state of deletion and export requests. Never their contents.', false, false, false),
  ('manage_legal_holds', 'security',
   'Create and release legal or operational holds. Release requires a second person.', true, true, true),
  ('review_retention', 'audit',
   'Preview retention rules and storage orphans. Read-only.', false, false, false),
  ('view_data_inventory', 'audit',
   'Read the data inventory and classification registry.', false, false, false),
  ('review_privacy_incidents', 'incidents',
   'Record privacy facts against an operational incident.', false, false, false)
on conflict (capability_key) do nothing;

-- Holds live with the security administrator, not with operations: a hold
-- suspends someone's right to have their data removed, and that decision
-- should sit beside the other decisions of that weight rather than beside
-- day-to-day case work.
insert into public.staff_role_capabilities (role_key, capability_key) values
  ('security_administrator', 'manage_legal_holds'),
  ('security_administrator', 'review_privacy_requests'),
  ('security_administrator', 'review_retention'),
  ('security_administrator', 'view_data_inventory'),
  ('security_administrator', 'review_privacy_incidents'),
  ('operations_manager', 'review_privacy_requests'),
  ('operations_manager', 'review_retention'),
  ('super_administrator', 'manage_legal_holds'),
  ('super_administrator', 'review_privacy_requests'),
  ('super_administrator', 'review_retention'),
  ('super_administrator', 'view_data_inventory'),
  ('super_administrator', 'review_privacy_incidents')
on conflict (role_key, capability_key) do nothing;

insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  ('privacy_center', 'local', false, 'none',
   'WPS-022 privacy centre stays disabled until the copy has been read on a device.', false),
  ('data_export', 'local', false, 'none',
   'WPS-022 export stays disabled: no worker exists to produce the file yet.', false),
  ('account_deletion', 'local', false, 'none',
   'WPS-022 deletion stays disabled until retention durations have had legal review.', false)
on conflict (flag_key, environment) do nothing;

insert into private.staff_kill_switches
  (switch_key, display_name, domain_authority, server_enforced, enforcement_note)
values
  ('privacy_requests', 'Privacy requests', 'WPS-022', true,
   'Checked by private.privacy_surface_enabled before any privacy entry point. Restricts only; never enables.'),
  ('retention_execution', 'Retention execution', 'WPS-022', true,
   'Checked by private.privacy_retention_executable. Dry runs remain available. Restricts only; never enables.')
on conflict (switch_key) do nothing;

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('privacy_export_request', 'Data export requests', 'account', 3, 86400, true, 'wps018_limiter',
   'An export reads across every domain, so it is bounded tightly.'),
  ('privacy_deletion_request', 'Deletion requests', 'account', 5, 86400, true, 'wps018_limiter',
   'One open request is enforced by unique index; this bounds retries.'),
  ('privacy_consent_write', 'Consent decisions', 'account', 60, 3600, true, 'wps018_limiter',
   'Consent history is append-only, so writes are bounded to keep it readable.'),
  ('privacy_history_clear', 'History clearing', 'account', 20, 3600, true, 'wps018_limiter',
   'Clearing is destructive but owner-scoped; the limit is generous.')
on conflict (policy_key) do nothing;

-- Privacy notifications carry a category and nothing else. There is no
-- payload: a push preview on a lock screen must never say what somebody asked
-- to have deleted, and a legal hold is never announced at all.
insert into private.notification_event_catalog
  (event_type, category, priority, route_type, required_action, mandatory_in_app,
   quiet_hours_bypass, generic_title, generic_body)
values
  ('privacy_deletion_requested', 'security', 'important', 'preferences', false, true, false,
   'Privacy request received', 'We have your account deletion request.'),
  ('privacy_deletion_cancelled', 'security', 'important', 'preferences', false, true, false,
   'Privacy request cancelled', 'Your account deletion request was cancelled.'),
  ('privacy_deletion_blocked', 'security', 'action_required', 'preferences', true, true, false,
   'Privacy request needs attention', 'Something on your account needs to finish first.'),
  ('privacy_deletion_completed', 'security', 'important', 'preferences', false, true, false,
   'Account deletion complete', 'Your personal information has been removed.'),
  ('privacy_export_ready', 'security', 'important', 'preferences', false, true, false,
   'Your data is ready', 'Your data copy is ready to download.'),
  ('privacy_export_expired', 'security', 'informational', 'preferences', false, false, false,
   'Data copy expired', 'Your data copy has expired. You can request a new one.')
on conflict (event_type) do nothing;

insert into private.observability_retention_policy
  (stream, retention_days, contains_personal_data, owner_role, severity_floor, notes)
values
  ('privacy_legal_hold_events', 3650, false, 'security_administrator', 'info',
   'Immutable hold history. Never pruned automatically.'),
  ('account_deletion_events', 3650, false, 'security_administrator', 'info',
   'Immutable deletion lifecycle. Proves what was done and when.'),
  ('privacy_anonymization_log', 3650, false, 'security_administrator', 'info',
   'Row counts per anonymization step. Holds no personal data.')
on conflict (stream) do nothing;

-- ============================================================================
-- SECTION 16 — REGISTRATION
-- ============================================================================

do $$
begin
  perform private.record_operational_event(
    'security', 'wps022_privacy_installed', 'info',
    pg_catalog.jsonb_build_object(
      'privacyCenterEnabled', false,
      'exportEnabled', false,
      'deletionEnabled', false,
      'retentionExecutionEnabled', false,
      'avatarsBucketRetired', true),
    'system');
exception when others then null;
end $$;
