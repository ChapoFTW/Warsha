-- Push delivery, which the notification system has been describing but not doing.
--
-- WPS-014 built a complete durable inbox: an event catalogue, categories,
-- priorities, grouping, deduplication, required-action semantics, quiet hours,
-- per-category preferences, and — already — `private.notification_device_tokens`
-- and `private.notification_delivery_attempts`. Then it switched the whole
-- outward half off by CHECK constraint: `push_provider in ('disabled')`,
-- `check (not push_delivery_enabled)`, `check (not token_registration_enabled)`.
-- `public.register_push_token` ended `raise exception 'Push provider is
-- disabled'` and nothing has ever written a row to either table.
--
-- The consequence in the product is not subtle. `quote_invitation` is
-- `action_required`, `quiet_hours_bypass`, `mandatory_in_app` — a worker is
-- supposed to be interrupted by it. What actually happened is that the row
-- waited in a list until the worker next opened the app. A marketplace whose
-- opportunities expire cannot reach its workers only when they happen to look.
--
-- This migration is the delivery half. It changes nothing about what a
-- notification IS: the trigger below runs after `private.prepare_notification`
-- has already decided category, priority, audience, deduplication and grouping,
-- and it reads those decisions rather than making its own.
--
-- ===========================================================================
-- Why Expo Push Service, and not APNs and FCM directly
-- ===========================================================================
--
-- Warsha is an Expo application: `expo ~54`, `expo-updates`, EAS builds, EAS
-- credentials. Sending through Expo means ONE outbound HTTPS call to
-- `https://exp.host/--/api/v2/push/send` with a list of `ExpoPushToken[...]`
-- values, and Expo fans out to APNs and FCM using the credentials EAS already
-- holds for this project.
--
-- Doing it directly instead would mean: an APNs ES256 JWT signed with a `.p8`
-- key over HTTP/2, an FCM v1 OAuth exchange against a Google service account,
-- two more secrets in Edge Function environment, two more rotation procedures
-- in the secret-rotation runbook, and an HTTP/2 client in Deno. It buys
-- Warsha nothing at this stage: the same two services deliver the same
-- notification either way, and `expo-notifications` returns an Expo token on
-- the device regardless.
--
-- The one thing it costs is a dependency on Expo's relay for delivery. That is
-- recorded honestly rather than hidden: the provider is a column, the failure
-- is a recorded outcome, and swapping it later is a new `push_provider` value
-- plus a sibling of the dispatch function — not a change to anything below.
--
-- ===========================================================================
-- What a client may and may not do
-- ===========================================================================
--
--   * A client may register a token for ITSELF and revoke a token for ITSELF.
--     Both RPCs read `auth.uid()` and never take a user id.
--   * A client may not read any token, its own included. The tables stay in
--     `private` with every grant revoked; there is no view, no RLS policy, and
--     no `public.*` function that returns one.
--   * A client may not cause a push to anybody. There is no send RPC. The only
--     way a push comes into being is a row in `public.notifications`, which is
--     written by SECURITY DEFINER triggers and functions the client cannot
--     insert into — `revoke insert on public.notifications from authenticated`
--     has been in force since WPS-014.
--   * The queue is claimed by `service_role` only, through `public.warsha_*`
--     wrappers, because an Edge Function reaching `private` through PostgREST
--     fails silently on hosted.
--
-- ===========================================================================
-- Storage of the token itself
-- ===========================================================================
--
-- `notification_device_tokens.encrypted_token` was declared `not null` and never
-- written. There is no key-management authority in this database, and a column
-- encrypted with a key stored in the same database is not encrypted — it is
-- obfuscated against exactly nobody who could read the column in the first
-- place. Claiming otherwise in a column name is worse than not doing it.
--
-- So the token is stored as it is, in a `private` table with every grant
-- revoked from `public`, `anon` and `authenticated`. THAT is the control, and
-- it is the same control protecting every other private table here. The old
-- column is left in place, nullable and unused, because migrations are
-- forward-only; the comment on it says so in the database as well as here.

-- ---------------------------------------------------------------------------
-- 1. The provider is allowed to exist
-- ---------------------------------------------------------------------------
-- The three flags stay independently switchable and default to off. Nothing
-- here turns push on; it makes turning it on possible, and the coherence check
-- makes the incoherent state ("delivery enabled, no provider") unrepresentable.

alter table private.notification_configuration
  drop constraint if exists notification_configuration_push_provider_check,
  drop constraint if exists notification_configuration_push_delivery_enabled_check,
  drop constraint if exists notification_configuration_token_registration_enabled_check,
  drop constraint if exists notification_configuration_scheduler_enabled_check;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select con.conname from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'private' and rel.relname = 'notification_configuration'
      and con.contype = 'c'
      and pg_catalog.pg_get_constraintdef(con.oid) ~ '(push_provider|push_delivery_enabled|token_registration_enabled|scheduler_enabled)'
  loop
    execute pg_catalog.format('alter table private.notification_configuration drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table private.notification_configuration
  add column if not exists provider_endpoint text,
  add column if not exists max_delivery_attempts integer not null default 3,
  add column if not exists batch_size integer not null default 100;

alter table private.notification_configuration
  add constraint notification_configuration_provider_check
    check (push_provider in ('disabled', 'expo')),
  add constraint notification_configuration_coherent_check
    check (push_provider <> 'disabled'
      or not (push_delivery_enabled or token_registration_enabled or scheduler_enabled)),
  add constraint notification_configuration_attempts_check
    check (max_delivery_attempts between 1 and 10),
  add constraint notification_configuration_batch_check
    check (batch_size between 1 and 100);

comment on column private.notification_configuration.push_provider is
  'disabled, or expo for Expo Push Service. Delivery, registration and the '
  'scheduler are separately switchable and all three require a provider.';

-- ---------------------------------------------------------------------------
-- 2. A device, and which account currently holds it
-- ---------------------------------------------------------------------------
-- `installation_id` is the rotation key. A push token is not stable: the OS
-- reissues it after a reinstall, a restore, or at its own discretion, and an
-- app that only ever inserted would accumulate dead rows and send every
-- notification several times to one phone. The installation is stable, so a new
-- token for a known installation REPLACES the old row rather than adding one.
--
-- `locale` is per device rather than per account on purpose: a person with a
-- phone in Arabic and a tablet in English is one account with two correct
-- answers, and the account-level `profiles.preferred_language` is the fallback
-- when a device did not say.

alter table private.notification_device_tokens
  alter column encrypted_token drop not null;

comment on column private.notification_device_tokens.encrypted_token is
  'Unused and always null. Declared by WPS-014, never written. There is no key '
  'authority in this database, so the token is protected by this table being '
  'private with every client grant revoked. Kept because migrations are '
  'forward-only; read notification_device_tokens.token instead.';

alter table private.notification_device_tokens
  add column if not exists token text,
  add column if not exists installation_id text,
  add column if not exists locale text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists failure_count integer not null default 0;

alter table private.notification_device_tokens
  add constraint notification_device_tokens_token_check
    check (token is null or pg_catalog.length(token) between 16 and 4096),
  add constraint notification_device_tokens_installation_check
    check (installation_id is null or pg_catalog.length(installation_id) between 8 and 200),
  add constraint notification_device_tokens_locale_check
    check (locale is null or locale in ('en', 'ar', 'fr')),
  add constraint notification_device_tokens_revoked_reason_check
    check (revoked_reason is null or revoked_reason in (
      'signed_out', 'replaced', 'claimed_by_another_account',
      'provider_rejected', 'account_closed', 'account_deactivated')),
  add constraint notification_device_tokens_failure_count_check
    check (failure_count between 0 and 100);

-- One live row per installation, per account.
create unique index if not exists notification_device_tokens_installation_active_idx
  on private.notification_device_tokens(user_id, installation_id)
  where revoked_at is null and installation_id is not null;

-- And one live row per TOKEN across the whole table. This is the cross-account
-- rule, not a tidiness rule: a physical device that signs in as somebody else
-- must stop receiving the previous person's notifications, and the token is
-- what the provider delivers to. Registration below enforces it by revoking the
-- other account's row rather than by failing, because failing would leave the
-- new person silently unreachable.
create unique index if not exists notification_device_tokens_active_token_idx
  on private.notification_device_tokens(token_hash)
  where revoked_at is null;

create index if not exists notification_device_tokens_owner_active_idx
  on private.notification_device_tokens(user_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 3. What a lock screen is allowed to say
-- ---------------------------------------------------------------------------
-- Category-generic, in three languages, and that is the whole vocabulary.
--
-- WPS-014 gave each of the sixty-odd events a `generic_title`/`generic_body`
-- pair, and `notification_preferences.generic_previews` lets a person ask for
-- richer in-app copy. Neither is used here, and the reason is worth stating
-- because it looks like a missing feature:
--
-- A lock screen is the one Warsha surface a stranger reads. Somebody glancing
-- at a phone on a table learns whatever it says. So there is no preference to
-- make it say more — not because the per-event strings are unsafe (they were
-- written to be safe) but because a setting that CAN reveal more is a setting
-- somebody enables and then forgets, and the failure mode is a person's dispute
-- or payment being legible to whoever is nearby.
--
-- Ten categories times three languages is also the whole reason this is
-- localisable at all. Reproducing sixty events in three languages inside SQL
-- would be a second copy of `src/notifications/notification-copy.ts`, and that
-- table is the one both platforms read. Thirty strings that say only which part
-- of Warsha changed can be kept in step with a test, and
-- `notification-catalogue.test.mts` does exactly that.

create table if not exists private.notification_push_copy (
  category text not null check (category in (
    'marketplace', 'bookings', 'messages', 'payments', 'worker_account',
    'reviews', 'disputes', 'security', 'system', 'support')),
  language text not null check (language in ('en', 'ar', 'fr')),
  title text not null check (pg_catalog.length(title) between 1 and 80),
  body text not null check (pg_catalog.length(body) between 1 and 160),
  primary key (category, language)
);

insert into private.notification_push_copy(category, language, title, body) values
  ('marketplace', 'en', 'Marketplace update', 'Your service request has an update.'),
  ('bookings', 'en', 'Booking update', 'Your booking has an update.'),
  ('messages', 'en', 'New message', 'You have a new message in Warsha.'),
  ('payments', 'en', 'Payment update', 'Your payment status changed.'),
  ('worker_account', 'en', 'Worker account update', 'Your worker account has an update.'),
  ('reviews', 'en', 'Review update', 'A review has an update.'),
  ('disputes', 'en', 'Dispute update', 'Your dispute has an update.'),
  ('security', 'en', 'Account security update', 'Your Warsha account security changed.'),
  ('system', 'en', 'Warsha update', 'You have an update in Warsha.'),
  ('support', 'en', 'Support update', 'Your support case has an update.'),

  ('marketplace', 'ar', 'تحديث في السوق', 'فيه تحديث على طلب الخدمة بتاعك.'),
  ('bookings', 'ar', 'تحديث في الحجز', 'فيه تحديث على حجزك.'),
  ('messages', 'ar', 'رسالة جديدة', 'عندك رسالة جديدة في ورشة.'),
  ('payments', 'ar', 'تحديث في الدفع', 'حالة الدفع بتاعتك اتغيرت.'),
  ('worker_account', 'ar', 'تحديث في حساب الصنايعي', 'فيه تحديث على حساب الصنايعي بتاعك.'),
  ('reviews', 'ar', 'تحديث في التقييم', 'فيه تحديث على تقييم.'),
  ('disputes', 'ar', 'تحديث في الشكوى', 'فيه تحديث على الشكوى بتاعتك.'),
  ('security', 'ar', 'تحديث في أمان الحساب', 'فيه تغيير في أمان حسابك في ورشة.'),
  ('system', 'ar', 'تحديث من ورشة', 'عندك تحديث في ورشة.'),
  ('support', 'ar', 'تحديث في الدعم', 'فيه تحديث على طلب الدعم بتاعك.'),

  ('marketplace', 'fr', 'Mise à jour de la demande', 'Votre demande de service a une mise à jour.'),
  ('bookings', 'fr', 'Mise à jour de la réservation', 'Votre réservation a une mise à jour.'),
  ('messages', 'fr', 'Nouveau message', 'Vous avez un nouveau message dans Warsha.'),
  ('payments', 'fr', 'Mise à jour du paiement', 'Le statut de votre paiement a changé.'),
  ('worker_account', 'fr', 'Mise à jour du compte artisan', 'Votre compte artisan a une mise à jour.'),
  ('reviews', 'fr', 'Mise à jour d’un avis', 'Un avis a une mise à jour.'),
  ('disputes', 'fr', 'Mise à jour du litige', 'Votre litige a une mise à jour.'),
  ('security', 'fr', 'Sécurité du compte', 'La sécurité de votre compte Warsha a changé.'),
  ('system', 'fr', 'Mise à jour Warsha', 'Vous avez une mise à jour dans Warsha.'),
  ('support', 'fr', 'Mise à jour du support', 'Votre demande d’assistance a une mise à jour.')
on conflict (category, language) do update set
  title = excluded.title, body = excluded.body;

-- ---------------------------------------------------------------------------
-- 4. The queue is the attempt record
-- ---------------------------------------------------------------------------
-- `private.notification_delivery_attempts` already existed with the right
-- columns and a `pending` status nothing ever produced. Adding a second table
-- called `push_queue` would leave two places recording the same event, so this
-- widens the one that is there: a row is created pending, claimed, sent, and
-- ends in a terminal state, carrying its own retry schedule.
--
-- The rendered `title`/`body` are stored on the row rather than resolved at
-- send time. A person who changes their language after a notification is
-- queued should still get the message in the language they had when it was
-- addressed to them, and a queue row that renders itself later is a queue row
-- whose content depends on when the worker happened to run.

alter table private.notification_delivery_attempts
  drop constraint if exists notification_delivery_attempts_status_check;

alter table private.notification_delivery_attempts
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists language text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists priority text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default pg_catalog.now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists provider_receipt_id text,
  add column if not exists created_at timestamptz not null default pg_catalog.now();

alter table private.notification_delivery_attempts
  add constraint notification_delivery_attempts_status_check
    check (status in ('pending', 'sending', 'delivered', 'failed', 'suppressed', 'disabled', 'dropped')),
  add constraint notification_delivery_attempts_language_check
    check (language is null or language in ('en', 'ar', 'fr')),
  add constraint notification_delivery_attempts_attempts_check
    check (attempt_count between 0 and 10);

-- One queued push per notification per device. This is the deduplication that
-- matters at this layer: `prepare_notification` already refused a duplicate
-- notification, and this refuses a duplicate DELIVERY of a notification that
-- was legitimately created once.
create unique index if not exists notification_delivery_attempts_unique_idx
  on private.notification_delivery_attempts(notification_id, token_id)
  where notification_id is not null and token_id is not null;

create index if not exists notification_delivery_attempts_claimable_idx
  on private.notification_delivery_attempts(next_attempt_at, id)
  where status = 'pending';

revoke all on private.notification_push_copy from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. When quiet hours end
-- ---------------------------------------------------------------------------
-- `private.notification_quiet_hours_active` already answers "is it quiet now".
-- Delaying rather than dropping needs the other half: the next moment it is
-- not. Computed in the person's own timezone, which is the column's whole
-- reason for existing.

create or replace function private.notification_quiet_hours_end_at(
  p_user_id uuid,
  p_at timestamptz default pg_catalog.now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  preference public.notification_preferences;
  local_now timestamp;
  candidate timestamp;
begin
  select * into preference from public.notification_preferences p where p.user_id = p_user_id;
  if not coalesce(preference.quiet_hours_enabled, false) then return p_at; end if;
  if preference.quiet_hours_end is null then return p_at; end if;

  local_now := (p_at at time zone preference.timezone);
  candidate := local_now::date + preference.quiet_hours_end;
  if candidate <= local_now then candidate := candidate + interval '1 day'; end if;
  return candidate at time zone preference.timezone;
end;
$$;

revoke all on function private.notification_quiet_hours_end_at(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. A notification becomes queued pushes
-- ---------------------------------------------------------------------------
-- Runs AFTER insert, so it only ever sees rows that survived
-- `prepare_notification` — a deduplicated, grouped or preference-suppressed
-- event never reaches here, and does not need to be re-decided.
--
-- The suppression rules it applies on top are the ones that are specific to
-- the outward channel:
--
--   * the provider must be configured and delivery switched on;
--   * the person must have turned push on (`push_enabled`), which is a
--     separate act from allowing the category in the inbox;
--   * a device must exist;
--   * quiet hours DELAY rather than drop, unless the event is one WPS-014
--     already marked as bypassing them.
--
-- A suppressed push is recorded, not discarded. "Nothing was sent" and "nothing
-- was attempted" are different operational facts and an outage looks like one
-- of them.

create or replace function private.enqueue_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configuration private.notification_configuration;
  preference public.notification_preferences;
  catalogue private.notification_event_catalog%rowtype;
  account_language text;
  quiet boolean;
  bypass boolean;
  send_at timestamptz := pg_catalog.now();
  device record;
  queued integer := 0;
begin
  select * into configuration from private.notification_configuration where singleton;
  if not coalesce(configuration.push_delivery_enabled, false)
    or coalesce(configuration.push_provider, 'disabled') = 'disabled' then
    insert into private.notification_operational_events(event_key, user_id, notification_id, metadata)
    values ('push_disabled', new.user_id, new.id,
      pg_catalog.jsonb_build_object('reason', 'delivery_disabled'));
    return new;
  end if;

  select * into preference from public.notification_preferences p where p.user_id = new.user_id;
  if not coalesce(preference.push_enabled, false) then
    insert into private.notification_operational_events(event_key, user_id, notification_id, metadata)
    values ('preference_suppressed', new.user_id, new.id,
      pg_catalog.jsonb_build_object('channel', 'push', 'reason', 'push_off'));
    return new;
  end if;

  select * into catalogue from private.notification_event_catalog c where c.event_type = new.event_key;
  bypass := coalesce(catalogue.quiet_hours_bypass, false)
    or new.priority in ('critical', 'action_required');
  quiet := private.notification_quiet_hours_active(new.user_id, send_at);
  if quiet and not bypass then
    send_at := private.notification_quiet_hours_end_at(new.user_id, send_at);
  end if;

  select p.preferred_language into account_language
  from public.profiles p where p.id = new.user_id;

  for device in
    select t.id, coalesce(t.locale, account_language, 'en') as language
    from private.notification_device_tokens t
    where t.user_id = new.user_id and t.revoked_at is null and t.token is not null
  loop
    insert into private.notification_delivery_attempts(
      notification_id, token_id, user_id, channel, status, language,
      title, body, payload, priority, next_attempt_at)
    select new.id, device.id, new.user_id, 'push', 'pending', device.language,
      copy.title, copy.body,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'notificationId', new.id,
        'category', new.category,
        'routeType', new.route_type,
        'resourceId', new.resource_id,
        'audience', new.audience,
        'requiredAction', new.required_action)),
      new.priority, send_at
    from private.notification_push_copy copy
    where copy.category = new.category and copy.language = device.language
    on conflict do nothing;
    queued := queued + 1;
  end loop;

  if queued = 0 then
    insert into private.notification_operational_events(event_key, user_id, notification_id, metadata)
    values ('push_disabled', new.user_id, new.id,
      pg_catalog.jsonb_build_object('reason', 'no_device'));
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_push_delivery() from public, anon, authenticated;

drop trigger if exists notifications_push_enqueue on public.notifications;
create trigger notifications_push_enqueue after insert on public.notifications
for each row execute function private.enqueue_push_delivery();

-- ---------------------------------------------------------------------------
-- 7. Registering and revoking a device — the client half
-- ---------------------------------------------------------------------------

create or replace function public.register_my_push_device(
  p_token text,
  p_platform text,
  p_app_version text,
  p_installation_id text,
  p_locale text default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  configuration private.notification_configuration;
  digest_hex text;
  existing private.notification_device_tokens;
  token_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if p_platform not in ('android', 'ios', 'web')
    or pg_catalog.length(coalesce(p_token, '')) not between 16 and 4096
    or pg_catalog.length(coalesce(p_app_version, '')) not between 1 and 40
    or pg_catalog.length(coalesce(p_installation_id, '')) not between 8 and 200
    or (p_locale is not null and p_locale not in ('en', 'ar', 'fr'))
    or pg_catalog.length(coalesce(p_device_label, '')) > 100
  then raise exception 'Invalid push registration' using errcode = '22023'; end if;

  select * into configuration from private.notification_configuration where singleton;
  if not coalesce(configuration.token_registration_enabled, false)
    or coalesce(configuration.push_provider, 'disabled') = 'disabled' then
    insert into private.notification_operational_events(event_key, user_id, metadata)
    values ('push_disabled', uid, pg_catalog.jsonb_build_object('reason', 'registration_disabled'));
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'provider', coalesce(configuration.push_provider, 'disabled'));
  end if;

  -- A deactivated or closed account does not accumulate devices.
  if exists (select 1 from public.profiles p where p.id = uid and p.deactivated_at is not null) then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'provider', configuration.push_provider);
  end if;

  digest_hex := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- The same physical device signing in as somebody else. Revoke rather than
  -- reject: the previous account must stop receiving, and the new one must
  -- start, and a rejection would silently deliver neither outcome.
  update private.notification_device_tokens
  set revoked_at = pg_catalog.now(), revoked_reason = 'claimed_by_another_account',
      updated_at = pg_catalog.now()
  where token_hash = digest_hex and revoked_at is null and user_id <> uid;

  -- A new token for a known installation replaces the old one rather than
  -- adding a second live row that would double every notification.
  update private.notification_device_tokens
  set revoked_at = pg_catalog.now(), revoked_reason = 'replaced', updated_at = pg_catalog.now()
  where user_id = uid and installation_id = p_installation_id
    and revoked_at is null and token_hash <> digest_hex;

  select * into existing from private.notification_device_tokens t
  where t.user_id = uid and t.token_hash = digest_hex;

  if existing.id is not null then
    -- Registering again is the normal case: an app does it every launch.
    update private.notification_device_tokens
    set revoked_at = null, revoked_reason = null, failure_count = 0,
        token = p_token, installation_id = p_installation_id, platform = p_platform,
        app_version = p_app_version, locale = coalesce(p_locale, locale),
        device_label = coalesce(p_device_label, device_label),
        last_seen_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = existing.id
    returning id into token_id;
  else
    insert into private.notification_device_tokens(
      user_id, token_hash, token, platform, app_version, device_label,
      installation_id, locale, last_seen_at)
    values (uid, digest_hex, p_token, p_platform, p_app_version, p_device_label,
      p_installation_id, p_locale, pg_catalog.now())
    returning id into token_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'registered', 'provider', configuration.push_provider, 'deviceId', token_id);
end;
$$;

-- The WPS-014 signature, which always raised. It is kept working rather than
-- left broken: nothing calls it today, and a caller that finds it should get
-- the behaviour its name promises. Without an installation id the token itself
-- identifies the device, which is correct if less durable across reinstalls.
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_app_version text,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.register_my_push_device(
    p_token, p_platform, p_app_version,
    pg_catalog.encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'),
    null, p_device_label);
  if result->>'status' <> 'registered' then
    raise exception 'Push registration is unavailable' using errcode = '55000';
  end if;
  return (result->>'deviceId')::uuid;
end;
$$;

create or replace function public.revoke_my_push_device(p_installation_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update private.notification_device_tokens
  set revoked_at = coalesce(revoked_at, pg_catalog.now()),
      revoked_reason = coalesce(revoked_reason, 'signed_out'),
      token = null, updated_at = pg_catalog.now()
  where user_id = uid and installation_id = p_installation_id and revoked_at is null;
end;
$$;

-- Signing out everywhere, and the path a password change should take.
create or replace function public.revoke_my_push_tokens()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update private.notification_device_tokens
  set revoked_at = coalesce(revoked_at, pg_catalog.now()),
      revoked_reason = coalesce(revoked_reason, 'signed_out'),
      token = null, updated_at = pg_catalog.now()
  where user_id = uid and revoked_at is null;
end;
$$;

-- What the client needs in order to decide whether to ask for permission at
-- all. It returns capability and this account's own device count — never a
-- token, never another account's anything.
create or replace function public.get_my_push_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  configuration private.notification_configuration;
  preference public.notification_preferences;
  devices integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into configuration from private.notification_configuration where singleton;
  select * into preference from public.notification_preferences p where p.user_id = uid;
  select pg_catalog.count(*)::integer into devices
  from private.notification_device_tokens t
  where t.user_id = uid and t.revoked_at is null;

  return pg_catalog.jsonb_build_object(
    'provider', coalesce(configuration.push_provider, 'disabled'),
    'registrationAvailable', coalesce(configuration.token_registration_enabled, false),
    'deliveryAvailable', coalesce(configuration.push_delivery_enabled, false),
    'pushEnabled', coalesce(preference.push_enabled, false),
    'deviceCount', coalesce(devices, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Turning push on is a preference, and it was hard-wired off
-- ---------------------------------------------------------------------------
-- `update_my_notification_preferences` rejected any key but the three it knew
-- and ended every call with `push_enabled = false`. Both are widened here, and
-- nothing else about the function changes.

create or replace function public.update_my_notification_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current_preferences public.notification_preferences;
  configuration private.notification_configuration;
  categories jsonb; quiet jsonb; quiet_enabled boolean; quiet_start time; quiet_end time;
  zone text; generic boolean; push boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_preferences is null or pg_catalog.jsonb_typeof(p_preferences) <> 'object'
    or p_preferences - array['categories', 'quietHours', 'genericPreviews', 'pushEnabled'] <> '{}'::jsonb
  then raise exception 'Invalid notification preferences' using errcode = '22023'; end if;

  insert into public.notification_preferences(user_id, push_enabled, email_enabled, sms_enabled)
  values (uid, false, false, false) on conflict (user_id) do nothing;
  select * into current_preferences from public.notification_preferences p where p.user_id = uid for update;
  select * into configuration from private.notification_configuration where singleton;

  categories := coalesce(p_preferences->'categories', current_preferences.category_preferences);
  if not private.notification_category_preferences_valid(categories)
  then raise exception 'Invalid notification categories' using errcode = '22023'; end if;

  quiet := coalesce(p_preferences->'quietHours', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(quiet) <> 'object'
    or quiet - array['enabled', 'start', 'end', 'timezone'] <> '{}'::jsonb
  then raise exception 'Invalid quiet hours' using errcode = '22023'; end if;
  quiet_enabled := coalesce((quiet->>'enabled')::boolean, current_preferences.quiet_hours_enabled);
  quiet_start := case when quiet ? 'start' then nullif(quiet->>'start', '')::time else current_preferences.quiet_hours_start end;
  quiet_end := case when quiet ? 'end' then nullif(quiet->>'end', '')::time else current_preferences.quiet_hours_end end;
  zone := coalesce(nullif(quiet->>'timezone', ''), current_preferences.timezone);
  generic := coalesce((p_preferences->>'genericPreviews')::boolean, current_preferences.generic_previews);

  -- Asking for push when the platform cannot deliver it stores false rather
  -- than raising: the answer to "can I have push" is a capability question the
  -- client already asked, and a preference screen should not fail on it.
  push := coalesce((p_preferences->>'pushEnabled')::boolean, current_preferences.push_enabled)
    and coalesce(configuration.push_delivery_enabled, false);

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone)
    or (quiet_enabled and (quiet_start is null or quiet_end is null or quiet_start is not distinct from quiet_end))
  then raise exception 'Invalid quiet hours' using errcode = '22023'; end if;

  update public.notification_preferences
  set category_preferences = categories, quiet_hours_enabled = quiet_enabled,
      quiet_hours_start = quiet_start, quiet_hours_end = quiet_end, timezone = zone,
      generic_previews = generic, push_enabled = push,
      email_enabled = false, sms_enabled = false, updated_at = pg_catalog.now()
  where user_id = uid;

  -- Turning push off is also an instruction to stop delivering to the devices
  -- already registered. Leaving them live would keep sending to somebody who
  -- just said no.
  if not push then
    update private.notification_device_tokens
    set revoked_at = coalesce(revoked_at, pg_catalog.now()),
        revoked_reason = coalesce(revoked_reason, 'signed_out'),
        token = null, updated_at = pg_catalog.now()
    where user_id = uid and revoked_at is null;
  end if;

  return public.get_my_notification_preferences();
exception when invalid_text_representation then
  raise exception 'Invalid notification preferences' using errcode = '22023';
end;
$$;

create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  preference public.notification_preferences;
  configuration private.notification_configuration;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.notification_preferences(user_id, push_enabled, email_enabled, sms_enabled)
  values (uid, false, false, false) on conflict (user_id) do nothing;
  select * into preference from public.notification_preferences p where p.user_id = uid;
  select * into configuration from private.notification_configuration where singleton;

  return pg_catalog.jsonb_build_object(
    'categories', preference.category_preferences,
    'inAppEnabled', true,
    'pushEnabled', coalesce(preference.push_enabled, false),
    'pushAvailable', coalesce(configuration.push_delivery_enabled, false),
    'genericPreviews', preference.generic_previews,
    'quietHours', pg_catalog.jsonb_build_object(
      'enabled', preference.quiet_hours_enabled,
      'start', case when preference.quiet_hours_start is null then null
        else pg_catalog.to_char(preference.quiet_hours_start, 'HH24:MI') end,
      'end', case when preference.quiet_hours_end is null then null
        else pg_catalog.to_char(preference.quiet_hours_end, 'HH24:MI') end,
      'timezone', preference.timezone));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Account lifecycle
-- ---------------------------------------------------------------------------
-- Deletion is already handled structurally: `notification_device_tokens.user_id`
-- is `on delete cascade`. Deactivation is not deletion and needs saying.

create or replace function private.revoke_push_on_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deactivated_at is not null and old.deactivated_at is null then
    update private.notification_device_tokens
    set revoked_at = pg_catalog.now(), revoked_reason = 'account_deactivated',
        token = null, updated_at = pg_catalog.now()
    where user_id = new.id and revoked_at is null;
    update private.notification_delivery_attempts
    set status = 'dropped', completed_at = pg_catalog.now()
    where user_id = new.id and status in ('pending', 'sending');
  end if;
  return new;
end;
$$;

revoke all on function private.revoke_push_on_deactivation() from public, anon, authenticated;

drop trigger if exists profiles_revoke_push_on_deactivation on public.profiles;
create trigger profiles_revoke_push_on_deactivation after update of deactivated_at on public.profiles
for each row execute function private.revoke_push_on_deactivation();

-- ---------------------------------------------------------------------------
-- 10. The dispatcher's surface
-- ---------------------------------------------------------------------------
-- `public.warsha_*` wrappers, granted only to `service_role`, because an Edge
-- Function calling `.schema('private')` through PostgREST fails silently on
-- hosted. Every one of these is unreachable by `anon` and `authenticated`.

create or replace function public.warsha_push_configuration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare configuration private.notification_configuration;
begin
  select * into configuration from private.notification_configuration where singleton;
  return pg_catalog.jsonb_build_object(
    'provider', coalesce(configuration.push_provider, 'disabled'),
    'deliveryEnabled', coalesce(configuration.push_delivery_enabled, false),
    'registrationEnabled', coalesce(configuration.token_registration_enabled, false),
    'maxAttempts', coalesce(configuration.max_delivery_attempts, 3),
    'batchSize', coalesce(configuration.batch_size, 100),
    'endpoint', configuration.provider_endpoint);
end;
$$;

-- Claiming is `for update skip locked`, so two dispatchers running at once
-- take disjoint work rather than sending the same push twice.
create or replace function public.warsha_push_claim_batch(p_limit integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  configuration private.notification_configuration;
  claim_limit integer;
  claimed jsonb;
begin
  select * into configuration from private.notification_configuration where singleton;
  if not coalesce(configuration.push_delivery_enabled, false)
    or coalesce(configuration.push_provider, 'disabled') = 'disabled' then
    return pg_catalog.jsonb_build_object('status', 'disabled', 'items', '[]'::jsonb);
  end if;

  claim_limit := least(greatest(coalesce(p_limit, configuration.batch_size), 1), configuration.batch_size);

  with candidate as (
    select a.id from private.notification_delivery_attempts a
    where a.status = 'pending' and a.next_attempt_at <= pg_catalog.now()
    order by a.next_attempt_at, a.id
    limit claim_limit
    for update skip locked
  ), taken as (
    update private.notification_delivery_attempts a
    set status = 'sending', claimed_at = pg_catalog.now(),
        attempt_count = a.attempt_count + 1
    from candidate c where a.id = c.id
    returning a.id, a.token_id, a.language, a.title, a.body, a.payload, a.priority
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', t.id, 'token', d.token, 'platform', d.platform,
    'language', t.language, 'title', t.title, 'body', t.body,
    'payload', t.payload, 'priority', t.priority)), '[]'::jsonb)
  into claimed
  from taken t join private.notification_device_tokens d on d.id = t.token_id
  where d.revoked_at is null and d.token is not null;

  return pg_catalog.jsonb_build_object('status', 'ok', 'items', claimed);
end;
$$;

-- One outcome per claimed row. `p_retryable` decides between another attempt
-- and a terminal failure; `p_revoke_token` is how the provider telling us a
-- device is gone becomes a revoked row rather than an error repeated forever.
create or replace function public.warsha_push_record_result(
  p_attempt_id uuid,
  p_status text,
  p_provider_code text default null,
  p_receipt_id text default null,
  p_retryable boolean default false,
  p_revoke_token boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt private.notification_delivery_attempts;
  configuration private.notification_configuration;
  final_status text;
begin
  if p_status not in ('delivered', 'failed') then
    raise exception 'Invalid push result' using errcode = '22023';
  end if;

  select * into attempt from private.notification_delivery_attempts a
  where a.id = p_attempt_id for update;
  if attempt.id is null then
    raise exception 'Delivery attempt not found' using errcode = 'P0002';
  end if;

  select * into configuration from private.notification_configuration where singleton;

  if p_revoke_token and attempt.token_id is not null then
    update private.notification_device_tokens
    set revoked_at = coalesce(revoked_at, pg_catalog.now()),
        revoked_reason = coalesce(revoked_reason, 'provider_rejected'),
        token = null, updated_at = pg_catalog.now()
    where id = attempt.token_id;
    -- Anything else queued for a device that no longer exists is not worth
    -- retrying, and retrying it is how a dead token becomes a permanent error
    -- loop in the dispatcher's logs.
    update private.notification_delivery_attempts
    set status = 'dropped', completed_at = pg_catalog.now(), provider_code = 'device_not_registered'
    where token_id = attempt.token_id and status = 'pending';
  end if;

  if p_status = 'delivered' then
    final_status := 'delivered';
  elsif p_retryable and not p_revoke_token
    and attempt.attempt_count < coalesce(configuration.max_delivery_attempts, 3) then
    final_status := 'pending';
  else
    final_status := 'failed';
  end if;

  update private.notification_delivery_attempts
  set status = final_status,
      provider_code = coalesce(p_provider_code, provider_code),
      provider_receipt_id = coalesce(p_receipt_id, provider_receipt_id),
      claimed_at = case when final_status = 'pending' then null else claimed_at end,
      completed_at = case when final_status = 'pending' then null else pg_catalog.now() end,
      -- Exponential, in whole minutes, and bounded by max_delivery_attempts.
      next_attempt_at = case when final_status = 'pending'
        then pg_catalog.now() + (interval '1 minute' * pg_catalog.power(4, attempt.attempt_count))
        else next_attempt_at end
  where id = attempt.id;

  if attempt.token_id is not null and p_status = 'failed' and not p_revoke_token then
    update private.notification_device_tokens
    set failure_count = least(failure_count + 1, 100), updated_at = pg_catalog.now()
    where id = attempt.token_id;
  elsif p_status = 'delivered' and attempt.token_id is not null then
    update private.notification_device_tokens
    set failure_count = 0, last_seen_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = attempt.token_id;
  end if;

  return pg_catalog.jsonb_build_object('id', attempt.id, 'status', final_status);
end;
$$;

-- A dispatcher that dies mid-batch leaves rows in `sending` forever. This is
-- the only thing that returns them, and it is time-based rather than
-- process-based because there is nothing to ask.
create or replace function public.warsha_push_release_stalled(p_older_than_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare released integer;
begin
  if p_older_than_minutes not between 1 and 1440 then
    raise exception 'Invalid stall window' using errcode = '22023';
  end if;
  update private.notification_delivery_attempts
  set status = 'pending', claimed_at = null, next_attempt_at = pg_catalog.now()
  where status = 'sending'
    and claimed_at < pg_catalog.now() - (interval '1 minute' * p_older_than_minutes);
  get diagnostics released = row_count;
  return released;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.register_my_push_device(text,text,text,text,text,text)',
    'public.register_push_token(text,text,text,text)',
    'public.revoke_my_push_device(text)',
    'public.revoke_my_push_tokens()',
    'public.get_my_push_state()',
    'public.get_my_notification_preferences()',
    'public.update_my_notification_preferences(jsonb)'
  ] loop
    execute 'revoke all on function ' || signature || ' from public, anon';
    execute 'grant execute on function ' || signature || ' to authenticated';
  end loop;

  foreach signature in array array[
    'public.warsha_push_configuration()',
    'public.warsha_push_claim_batch(integer)',
    'public.warsha_push_record_result(uuid,text,text,text,boolean,boolean)',
    'public.warsha_push_release_stalled(integer)'
  ] loop
    execute 'revoke all on function ' || signature || ' from public, anon, authenticated';
    execute 'grant execute on function ' || signature || ' to service_role';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Erasing a subject is not tampering with history
-- ---------------------------------------------------------------------------
-- `private.notification_source_links` refuses every UPDATE and DELETE, which is
-- right: the record of which event produced which notification is audit
-- history and nobody may rewrite it.
--
-- It also refuses the DELETE that `on delete cascade` issues when a
-- `public.profiles` row goes, and that is a different thing wearing the same
-- clothes. `delete from public.profiles where id = ...` fails outright, with
-- "Notification source history is immutable", for any account that has ever
-- received a single notification — which is every account. The guard against
-- rewriting somebody's history had become a guard against erasing it.
--
-- That matters here specifically because this migration relies on the cascade:
-- `notification_device_tokens.user_id` is `on delete cascade`, and the claim
-- "deleting an account destroys its push tokens" is only true if the delete can
-- happen at all.
--
-- The distinction the trigger was missing is whether the SUBJECT still exists.
-- A cascade fires after the parent row is gone, so "no profile" is precisely
-- "this row is being erased along with the person it describes". Tampering —
-- which always happens while the profile is there — is refused exactly as
-- before.
--
-- NINE OTHER TABLES REFUSE THE SAME CASCADE and are deliberately left alone:
-- `public.legal_acceptances`, `public.referral_attributions`,
-- `public.referral_codes`, `public.referral_rewards`, `public.staff_role_grants`,
-- `public.trust_enforcement_actions`, `public.trust_reports`,
-- `public.worker_onboarding_events` and `private.staff_access_reviews`. Whether
-- a legal acceptance or a trust report survives an erasure request is a
-- retention decision with a legal answer, not an engineering one, and WPS-022
-- records Warsha's policy as `anonymize` rather than delete. They are named
-- here so the next person to write the erasure executor has the list.

create or replace function private.reject_notification_source_link_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return old;
  end if;
  raise exception 'Notification source history is immutable' using errcode = '55000';
end;
$$;

revoke all on function private.reject_notification_source_link_mutation() from public, anon, authenticated;
