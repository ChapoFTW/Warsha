-- =============================================================================
-- WPS-021 — Growth, Referrals, Promotions & Customer Acquisition
-- =============================================================================
--
-- Authority: Constitution -> WPS-007 (money) -> WPS-008 (ranking) ->
--            WPS-014 (notifications) -> WPS-016 (enforcement) ->
--            WPS-017/018 (staff, config, dual control, limits, observability)
--
-- This migration introduces NO financial system. A promotion reaches a customer
-- price through exactly one route: `bookings.price_breakdown.discount`, which
-- `private.create_booking_price_snapshot` already reads and posts to the
-- `warsha_promotion_expense` account. That function computes
--
--     provider_gross_minor := customer_total_minor + promotion_minor - tax_minor
--
-- so a promotion is arithmetically incapable of reducing worker gross, the
-- commission basis, provider net, or payout eligibility. WPS-021 does not
-- reimplement that rule; it is forbidden from bypassing it.
--
-- Everything else is reuse:
--   dual control      -> private.consume_dual_control              (WPS-018)
--   fail-closed flag  -> private.staff_feature_flags               (WPS-017)
--   kill switch       -> private.staff_kill_switches               (WPS-017)
--   staff capability  -> private.require_staff_capability          (WPS-018)
--   staff audit       -> private.record_staff_audit                (WPS-017)
--   fraud signals     -> private.record_trust_fraud_signal         (WPS-016)
--   notifications     -> private.prepare_notification              (WPS-014)
--   rate limiting     -> private.enforce_rate_limit                (WPS-018)
--   analytics         -> private.record_operational_event          (WPS-018)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Retire the dormant promo scaffold
-- ---------------------------------------------------------------------------
--
-- `public.promo_codes` and `public.promo_code_uses` have existed since
-- 202607200002. No application code, RPC, or test references them, and
-- `public_active_promos` granted every authenticated account SELECT on every
-- active code — enumerable by anyone signed in.
--
-- They are RETIRED IN PLACE, not dropped. They exist on the hosted project and
-- `promo_code_uses` carries foreign keys into `customer_profiles` and
-- `bookings`; a drop is irreversible and would discard any historical row.
-- Retiring loses nothing and can be undone.
--
-- RLS is enabled with NO POLICY. Revoking grants alone would leave the tables
-- one accidental GRANT away from being readable again; RLS with no policy means
-- even a future grant returns zero rows.

drop policy if exists public_active_promos on public.promo_codes;

alter table public.promo_codes enable row level security;
alter table public.promo_code_uses enable row level security;

revoke all on public.promo_codes from anon, authenticated, public;
revoke all on public.promo_code_uses from anon, authenticated, public;

comment on table public.promo_codes is
  'RETIRED by WPS-021. Superseded by public.growth_campaigns. RLS enabled with no policy: unreachable from PostgREST. Do not revive - WPS-021 forbids a second promotion system.';
comment on table public.promo_code_uses is
  'RETIRED by WPS-021. Superseded by public.campaign_redemptions. RLS enabled with no policy: unreachable from PostgREST.';

-- The same 202607200002 migration also left `public.wallets`, carrying a
-- `balance_egp` column, and `public.wallet_transactions`. Both are empty and
-- referenced by no application code. They are retired here for a sharper reason
-- than tidiness: WPS-021's locked scope forbids a customer wallet and a customer
-- credit balance, and a dormant balance column is exactly what someone would
-- revive when asked to build referral credits. A reward entitlement is not a
-- balance and must never acquire one.

revoke all on public.wallets from anon, authenticated, public;
revoke all on public.wallet_transactions from anon, authenticated, public;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

comment on table public.wallets is
  'RETIRED by WPS-021. Warsha has NO customer wallet and NO customer credit balance. WPS-007 is the sole financial authority. Do not revive: a referral reward is an entitlement, not a balance.';
comment on table public.wallet_transactions is
  'RETIRED by WPS-021. Warsha has no customer wallet. WPS-007 is the sole financial authority.';

-- ---------------------------------------------------------------------------
-- 1. Referral codes
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete cascade,
  owner_role text not null,
  code text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  constraint referral_codes_role_check check (owner_role in ('customer','worker')),
  constraint referral_codes_status_check check (status in ('active','revoked')),
  -- 31-symbol alphabet excluding 0 O 1 I L: read aloud and typed by hand.
  constraint referral_codes_code_check check (code ~ '^[2-9A-HJKMNP-Z]{10}$'),
  constraint referral_codes_revoked_check
    check ((status = 'revoked') = (revoked_at is not null)),
  constraint referral_codes_reason_check
    check (revoke_reason is null
           or pg_catalog.length(pg_catalog.btrim(revoke_reason)) between 3 and 500)
);
create index if not exists referral_codes_active_idx
  on public.referral_codes(code) where status = 'active';

alter table public.referral_codes enable row level security;

drop policy if exists referral_codes_owner_select on public.referral_codes;
create policy referral_codes_owner_select on public.referral_codes
  for select to authenticated using (owner_user_id = (select auth.uid()));

-- The code text is immutable for everyone, including staff. Attribution is
-- already recorded against it; rotating it would orphan that history.
create or replace function private.prevent_referral_code_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Referral codes are immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.owner_user_id is distinct from old.owner_user_id
     or new.owner_role is distinct from old.owner_role
     or new.created_at is distinct from old.created_at then
    raise exception 'Referral codes are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_referral_code_mutation() from public, anon, authenticated;
drop trigger if exists referral_codes_immutable on public.referral_codes;
create trigger referral_codes_immutable before update or delete
on public.referral_codes for each row
execute function private.prevent_referral_code_mutation();

-- ---------------------------------------------------------------------------
-- 2. Attribution
-- ---------------------------------------------------------------------------

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  -- One attribution per referred account, for its lifetime.
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  referred_role text not null,
  status text not null default 'pending',
  attributed_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  qualifying_booking_id uuid references public.bookings(id) on delete set null,
  qualified_at timestamptz,
  rejected_reason text,
  constraint referral_attributions_no_self check (referrer_user_id <> referred_user_id),
  constraint referral_attributions_role_check check (referred_role in ('customer','worker')),
  constraint referral_attributions_status_check
    check (status in ('pending','qualified','rejected','expired')),
  constraint referral_attributions_qualified_check
    check ((status = 'qualified') = (qualified_at is not null)),
  constraint referral_attributions_window_check check (expires_at > attributed_at)
);
create index if not exists referral_attributions_referrer_idx
  on public.referral_attributions(referrer_user_id, attributed_at desc);
create index if not exists referral_attributions_pending_idx
  on public.referral_attributions(referred_user_id) where status = 'pending';

alter table public.referral_attributions enable row level security;

drop policy if exists referral_attributions_participant_select on public.referral_attributions;
create policy referral_attributions_participant_select on public.referral_attributions
  for select to authenticated
  using (referrer_user_id = (select auth.uid()) or referred_user_id = (select auth.uid()));

create or replace function private.prevent_referral_attribution_rewrite()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Referral attribution is immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.referral_code_id is distinct from old.referral_code_id
     or new.referrer_user_id is distinct from old.referrer_user_id
     or new.referred_user_id is distinct from old.referred_user_id
     or new.attributed_at is distinct from old.attributed_at then
    raise exception 'Referral attribution is immutable' using errcode = '55000';
  end if;
  -- A terminal attribution never moves again.
  if old.status in ('qualified','rejected','expired') and new.status is distinct from old.status then
    raise exception 'Referral attribution is already final' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_referral_attribution_rewrite() from public, anon, authenticated;
drop trigger if exists referral_attributions_immutable on public.referral_attributions;
create trigger referral_attributions_immutable before update or delete
on public.referral_attributions for each row
execute function private.prevent_referral_attribution_rewrite();

-- ---------------------------------------------------------------------------
-- 3. Reward rules and entitlements
-- ---------------------------------------------------------------------------
--
-- An entitlement is NOT money. It carries no spendable value, cannot be
-- transferred, cannot be summed into a balance, and posts no ledger row. It
-- becomes real only when staff link its rule to an approved campaign and the
-- beneficiary later redeems that campaign through WPS-007. This is what lets
-- WPS-021 honestly claim it creates no second financial system: there is no
-- balance to reconcile because there is no balance.

create table if not exists public.growth_reward_rules (
  rule_key text not null,
  version integer not null default 1,
  display_name text not null,
  beneficiary text not null,
  referrer_campaign_key text,
  referred_campaign_key text,
  monthly_entitlement_limit integer not null default 10,
  lifetime_entitlement_limit integer not null default 50,
  attribution_window_days integer not null default 90,
  active boolean not null default false,
  environment text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (rule_key, version),
  constraint growth_reward_rules_key_check check (rule_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  constraint growth_reward_rules_beneficiary_check
    check (beneficiary in ('referrer','referred','both')),
  constraint growth_reward_rules_env_check check (environment in ('local','staging','production')),
  constraint growth_reward_rules_monthly_check check (monthly_entitlement_limit between 1 and 1000),
  constraint growth_reward_rules_lifetime_check check (lifetime_entitlement_limit between 1 and 10000),
  constraint growth_reward_rules_window_check check (attribution_window_days between 1 and 365),
  -- A rule that names a beneficiary must be able to reach one.
  constraint growth_reward_rules_target_check check (
    (beneficiary = 'referrer' and referrer_campaign_key is not null)
    or (beneficiary = 'referred' and referred_campaign_key is not null)
    or (beneficiary = 'both')
    or (referrer_campaign_key is null and referred_campaign_key is null))
);
alter table public.growth_reward_rules enable row level security;
revoke all on public.growth_reward_rules from anon, authenticated, public;

create table if not exists public.referral_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid not null references public.referral_attributions(id) on delete cascade,
  beneficiary_user_id uuid not null references public.profiles(id) on delete cascade,
  beneficiary_role text not null,
  rule_key text not null,
  rule_version integer not null,
  campaign_key text,
  status text not null default 'recorded',
  granted_at timestamptz not null default pg_catalog.now(),
  fulfilled_at timestamptz,
  -- Idempotency: one entitlement per beneficiary per attribution, forever.
  unique (attribution_id, beneficiary_user_id),
  constraint referral_rewards_role_check check (beneficiary_role in ('customer','worker')),
  constraint referral_rewards_status_check check (status in ('recorded','fulfilled','void')),
  constraint referral_rewards_fulfilled_check
    check ((status = 'fulfilled') = (fulfilled_at is not null))
);
create index if not exists referral_rewards_beneficiary_idx
  on public.referral_reward_entitlements(beneficiary_user_id, granted_at desc);

alter table public.referral_reward_entitlements enable row level security;

drop policy if exists referral_rewards_owner_select on public.referral_reward_entitlements;
create policy referral_rewards_owner_select on public.referral_reward_entitlements
  for select to authenticated using (beneficiary_user_id = (select auth.uid()));

create or replace function private.prevent_reward_entitlement_rewrite()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reward history is immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.attribution_id is distinct from old.attribution_id
     or new.beneficiary_user_id is distinct from old.beneficiary_user_id
     or new.rule_key is distinct from old.rule_key
     or new.rule_version is distinct from old.rule_version
     or new.granted_at is distinct from old.granted_at then
    raise exception 'Reward history is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_reward_entitlement_rewrite() from public, anon, authenticated;
drop trigger if exists referral_rewards_immutable on public.referral_reward_entitlements;
create trigger referral_rewards_immutable before update or delete
on public.referral_reward_entitlements for each row
execute function private.prevent_reward_entitlement_rewrite();

-- ---------------------------------------------------------------------------
-- 4. Campaigns
-- ---------------------------------------------------------------------------
--
-- No policy is created on this table. A campaign is never readable by a client
-- directly: visibility is an eligibility RESULT computed server-side, not a row
-- a customer can select. That is the difference between "you have an offer" and
-- "here is every code we run".

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  version integer not null default 1,
  display_name_en text not null,
  display_name_ar text not null,
  description_en text not null,
  description_ar text not null,
  status text not null default 'draft',
  environment text not null,
  audience text not null,
  discount_type text not null,
  discount_value numeric(12,2) not null,
  max_discount_minor bigint,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  budget_minor bigint not null,
  budget_consumed_minor bigint not null default 0,
  global_redemption_limit integer not null,
  redemption_count integer not null default 0,
  per_account_limit integer not null default 1,
  first_booking_only boolean not null default false,
  requires_grant boolean not null default false,
  service_ids uuid[] not null default '{}',
  category_keys text[] not null default '{}',
  governorate_keys text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  unique (campaign_key, version),
  constraint growth_campaigns_key_check check (campaign_key ~ '^[a-z][a-z0-9_]{2,64}$'),
  constraint growth_campaigns_status_check
    check (status in ('draft','scheduled','active','paused','expired','cancelled')),
  constraint growth_campaigns_env_check check (environment in ('local','staging','production')),
  constraint growth_campaigns_audience_check check (audience in ('customer','worker')),
  constraint growth_campaigns_type_check check (discount_type in ('percentage','fixed')),
  -- A percentage campaign must declare a ceiling. Without one, an expensive
  -- booking silently becomes an unbounded Warsha expense.
  constraint growth_campaigns_percentage_check check (
    discount_type <> 'percentage'
    or (discount_value between 1 and 50 and max_discount_minor is not null and max_discount_minor > 0)),
  constraint growth_campaigns_fixed_check check (
    discount_type <> 'fixed' or discount_value > 0),
  constraint growth_campaigns_window_check check (ends_at > starts_at),
  constraint growth_campaigns_budget_check check (budget_minor between 1 and 100000000000),
  constraint growth_campaigns_consumed_check
    check (budget_consumed_minor between 0 and budget_minor),
  constraint growth_campaigns_global_limit_check
    check (global_redemption_limit between 1 and 1000000),
  constraint growth_campaigns_count_check
    check (redemption_count between 0 and global_redemption_limit),
  constraint growth_campaigns_account_limit_check check (per_account_limit between 1 and 100),
  -- Anything past draft has been approved by a second person.
  constraint growth_campaigns_approval_check
    check (status = 'draft' or (approved_by is not null and approved_at is not null)),
  constraint growth_campaigns_creator_not_approver_check
    check (approved_by is null or created_by is null or approved_by <> created_by)
);
create index if not exists growth_campaigns_active_idx
  on public.growth_campaigns(environment, audience, ends_at)
  where status = 'active';

alter table public.growth_campaigns enable row level security;
revoke all on public.growth_campaigns from anon, authenticated, public;

-- Once a campaign leaves draft it is frozen. A change requires a new version,
-- which must itself be approved. Only the operational counters and the
-- lifecycle timestamps may still move.
create or replace function private.prevent_campaign_rewrite()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Campaign history is immutable' using errcode = '55000';
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.campaign_key is distinct from old.campaign_key
     or new.version is distinct from old.version
     or new.display_name_en is distinct from old.display_name_en
     or new.display_name_ar is distinct from old.display_name_ar
     or new.description_en is distinct from old.description_en
     or new.description_ar is distinct from old.description_ar
     or new.environment is distinct from old.environment
     or new.audience is distinct from old.audience
     or new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
     or new.max_discount_minor is distinct from old.max_discount_minor
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.budget_minor is distinct from old.budget_minor
     or new.global_redemption_limit is distinct from old.global_redemption_limit
     or new.per_account_limit is distinct from old.per_account_limit
     or new.first_booking_only is distinct from old.first_booking_only
     or new.requires_grant is distinct from old.requires_grant
     or new.service_ids is distinct from old.service_ids
     or new.category_keys is distinct from old.category_keys
     or new.governorate_keys is distinct from old.governorate_keys
     or new.created_by is distinct from old.created_by
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'An activated campaign is immutable. Create a new version.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_campaign_rewrite() from public, anon, authenticated;
drop trigger if exists growth_campaigns_immutable on public.growth_campaigns;
create trigger growth_campaigns_immutable before update or delete
on public.growth_campaigns for each row
execute function private.prevent_campaign_rewrite();

-- ---------------------------------------------------------------------------
-- 5. Eligibility grants and redemptions
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_eligibility_grants (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  entitlement_id uuid references public.referral_reward_entitlements(id) on delete cascade,
  granted_at timestamptz not null default pg_catalog.now(),
  unique (campaign_key, user_id),
  constraint campaign_grants_source_check check (source in ('referral_reward','staff'))
);
alter table public.campaign_eligibility_grants enable row level security;
revoke all on public.campaign_eligibility_grants from anon, authenticated, public;

create table if not exists public.campaign_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.growth_campaigns(id) on delete restrict,
  campaign_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- One promotion per booking. Enforced by a unique index, not a status check:
  -- a check can be raced, a unique index cannot.
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  discount_minor bigint not null,
  status text not null default 'applied',
  redeemed_at timestamptz not null default pg_catalog.now(),
  reversed_at timestamptz,
  released_minor bigint not null default 0,
  idempotency_key text not null unique,
  constraint campaign_redemptions_amount_check check (discount_minor between 1 and 1000000000),
  constraint campaign_redemptions_status_check check (status in ('applied','reversed')),
  constraint campaign_redemptions_reversed_check
    check ((status = 'reversed') = (reversed_at is not null)),
  constraint campaign_redemptions_released_check
    check (released_minor between 0 and discount_minor)
);
create index if not exists campaign_redemptions_campaign_idx
  on public.campaign_redemptions(campaign_id, redeemed_at desc);
create index if not exists campaign_redemptions_user_idx
  on public.campaign_redemptions(user_id, campaign_key);

alter table public.campaign_redemptions enable row level security;

drop policy if exists campaign_redemptions_owner_select on public.campaign_redemptions;
create policy campaign_redemptions_owner_select on public.campaign_redemptions
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Code generation
-- ---------------------------------------------------------------------------

create or replace function private.growth_random_code(p_length integer default 10)
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  -- 31 symbols. 0 O 1 I L are excluded because a referral code is read aloud
  -- across a room and typed by somebody who did not hear it clearly.
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_out text := '';
  v_byte integer;
  v_guard integer := 0;
begin
  while pg_catalog.length(v_out) < p_length loop
    v_guard := v_guard + 1;
    -- A pathological entropy source must not hang a transaction.
    if v_guard > p_length * 20 then
      raise exception 'Could not generate a referral code' using errcode = '55000';
    end if;
    v_byte := pg_catalog.get_byte(extensions.gen_random_bytes(1), 0);
    -- Rejection sampling, not modulo. 256 mod 31 = 8, so a plain modulo would
    -- make the first eight symbols measurably more likely than the rest.
    -- 248 = 8 * 31, so bytes below it map uniformly.
    if v_byte < 248 then
      v_out := v_out || pg_catalog.substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function private.growth_random_code(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Gates
-- ---------------------------------------------------------------------------

create or replace function private.growth_feature_enabled(p_flag text, p_audience text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_row private.staff_feature_flags%rowtype;
begin
  select * into v_row from private.staff_feature_flags f
  where f.flag_key = p_flag and f.environment = private.platform_environment();
  -- An absent flag is OFF. A growth feature must never default to on because
  -- somebody forgot to seed a row.
  if v_row.flag_key is null or not v_row.enabled then return false; end if;
  if v_row.expires_at is not null and v_row.expires_at <= pg_catalog.now() then return false; end if;
  return v_row.audience = 'all' or v_row.audience = p_audience;
end;
$$;
revoke all on function private.growth_feature_enabled(text,text) from public, anon, authenticated;

create or replace function private.growth_promotions_open(p_audience text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if private.staff_kill_switch_active('growth_promotions') then return false; end if;
  return private.growth_feature_enabled('growth_promotions', p_audience);
end;
$$;
revoke all on function private.growth_promotions_open(text) from public, anon, authenticated;

create or replace function private.growth_actor_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case
    when exists (select 1 from public.provider_profiles p
                 where p.user_id = p_user_id and p.deleted_at is null) then 'worker'
    else 'customer' end
$$;
revoke all on function private.growth_actor_role(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Referral RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_referral_code()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.referral_codes%rowtype;
  v_role text;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.growth_feature_enabled('growth_referrals', private.growth_actor_role(v_uid)) then
    return pg_catalog.jsonb_build_object('available', false);
  end if;

  select * into v_row from public.referral_codes c where c.owner_user_id = v_uid;

  if v_row.id is null then
    perform private.enforce_rate_limit('growth_referral_code');
    v_role := private.growth_actor_role(v_uid);
    -- Collision is handled by the unique index rather than a pre-check, because
    -- `select where not exists` then `insert` is a race. At 31^10 the retry path
    -- is effectively unreachable, but it exists rather than being assumed away.
    loop
      v_attempt := v_attempt + 1;
      begin
        insert into public.referral_codes(owner_user_id, owner_role, code)
        values (v_uid, v_role, private.growth_random_code(10))
        returning * into v_row;
        exit;
      exception when unique_violation then
        if v_attempt >= 5 then raise; end if;
      end;
    end loop;
    perform private.record_operational_event(
      'marketplace', 'growth.referral_code_issued', 'info',
      pg_catalog.jsonb_build_object('role', v_role), 'system');
  end if;

  return pg_catalog.jsonb_build_object(
    'available', true,
    'code', v_row.code,
    'status', v_row.status,
    'role', v_row.owner_role,
    'createdAt', v_row.created_at);
end;
$$;
revoke all on function public.get_my_referral_code() from public, anon;
grant execute on function public.get_my_referral_code() to authenticated;

create or replace function public.claim_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code public.referral_codes%rowtype;
  v_role text;
  v_window integer;
  v_normalized text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('growth_referral_claim');

  if not private.growth_feature_enabled('growth_referrals', private.growth_actor_role(v_uid)) then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'unavailable');
  end if;

  v_normalized := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  if v_normalized !~ '^[2-9A-HJKMNP-Z]{10}$' then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;

  select * into v_code from public.referral_codes c
  where c.code = v_normalized and c.status = 'active';

  -- A wrong code and a revoked code return the same answer. Distinguishing them
  -- would turn this into a code oracle.
  if v_code.id is null then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;

  if v_code.owner_user_id = v_uid then
    -- WPS-016 owns the signal vocabulary and constrains it to ten keys. Growth
    -- abuse is mapped onto that vocabulary rather than widening the constraint,
    -- so these land in the queue staff already triage; the growth specifics ride
    -- in safe_detail. A self-referral is one person acting as two parties.
    perform private.record_trust_fraud_signal(
      v_uid, 'duplicate_identity', 'low', 1,
      pg_catalog.jsonb_build_object('growthSignal', 'self_referral_attempt',
                                    'surface', 'referral_claim'));
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'self');
  end if;

  if exists (select 1 from public.referral_attributions a where a.referred_user_id = v_uid) then
    return pg_catalog.jsonb_build_object('accepted', false, 'reason', 'already_attributed');
  end if;

  -- Circular: the person whose code this is was themselves referred by the
  -- account now claiming it. Recorded, never punished — WPS-016 decides.
  if exists (
    select 1 from public.referral_attributions a
    where a.referred_user_id = v_code.owner_user_id and a.referrer_user_id = v_uid
  ) then
    perform private.record_trust_fraud_signal(
      v_code.owner_user_id, 'account_farming', 'low', 1,
      pg_catalog.jsonb_build_object('growthSignal', 'circular_referral',
                                    'surface', 'referral_claim'));
  end if;

  v_role := private.growth_actor_role(v_uid);
  select coalesce(pg_catalog.max(r.attribution_window_days), 90) into v_window
  from public.growth_reward_rules r
  where r.active and r.environment = private.platform_environment();

  insert into public.referral_attributions(
    referral_code_id, referrer_user_id, referred_user_id, referred_role, expires_at)
  values (v_code.id, v_code.owner_user_id, v_uid, v_role,
          pg_catalog.now() + pg_catalog.make_interval(days => coalesce(v_window, 90)));

  -- Velocity is advisory. It never blocks the claim.
  if (select pg_catalog.count(*) from public.referral_attributions a
      where a.referrer_user_id = v_code.owner_user_id
        and a.attributed_at > pg_catalog.now() - pg_catalog.make_interval(days => 1)) > 10 then
    perform private.record_trust_fraud_signal(
      v_code.owner_user_id, 'account_farming', 'medium', 1,
      pg_catalog.jsonb_build_object('growthSignal', 'signup_burst',
                                    'surface', 'referral_claim'));
  end if;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (v_code.owner_user_id, 'referral_pending', 'Referral update',
          'Someone joined Warsha with your invite.',
          pg_catalog.jsonb_build_object('role', v_role),
          'referral-pending:' || v_uid::text)
  on conflict do nothing;

  perform private.record_operational_event(
    'marketplace', 'growth.referral_claimed', 'info',
    pg_catalog.jsonb_build_object('outcome', 'accepted', 'role', v_role), 'system');

  return pg_catalog.jsonb_build_object('accepted', true, 'reason', 'accepted');
end;
$$;
revoke all on function public.claim_referral_code(text) from public, anon;
grant execute on function public.claim_referral_code(text) to authenticated;

create or replace function public.get_my_referral_summary(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'pending', (select pg_catalog.count(*) from public.referral_attributions a
                where a.referrer_user_id = v_uid and a.status = 'pending'),
    'qualified', (select pg_catalog.count(*) from public.referral_attributions a
                  where a.referrer_user_id = v_uid and a.status = 'qualified'),
    'expired', (select pg_catalog.count(*) from public.referral_attributions a
                where a.referrer_user_id = v_uid and a.status in ('expired','rejected')),
    -- Referred accounts are counted, never named. A referrer has no claim on
    -- another person's identity merely because they shared a code.
    'rewards', coalesce((
      select pg_catalog.jsonb_agg(x order by x->>'grantedAt' desc)
      from (
        select pg_catalog.jsonb_build_object(
                 'id', e.id, 'ruleKey', e.rule_key, 'status', e.status,
                 'grantedAt', e.granted_at, 'fulfilledAt', e.fulfilled_at) as x
        from public.referral_reward_entitlements e
        where e.beneficiary_user_id = v_uid
        order by e.granted_at desc
        limit v_limit
      ) s), '[]'::jsonb));
end;
$$;
revoke all on function public.get_my_referral_summary(integer) from public, anon;
grant execute on function public.get_my_referral_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Qualification
-- ---------------------------------------------------------------------------
--
-- Signing up earns nothing. A referral qualifies only when the referred account
-- completes a booking that carries a WPS-007 price snapshot.

create or replace function private.qualify_referral_for_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_booking public.bookings%rowtype;
  v_attr public.referral_attributions%rowtype;
  v_rule public.growth_reward_rules%rowtype;
  v_month integer;
  v_life integer;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null or v_booking.status <> 'completed' then return; end if;
  if not exists (select 1 from public.booking_price_snapshots s
                 where s.booking_id = p_booking_id) then
    return;
  end if;

  select * into v_attr from public.referral_attributions a
  where a.referred_user_id = v_booking.customer_id and a.status = 'pending'
  for update;
  if v_attr.id is null then return; end if;

  if v_attr.expires_at <= pg_catalog.now() then
    update public.referral_attributions
      set status = 'expired', rejected_reason = 'window_elapsed'
      where id = v_attr.id;
    return;
  end if;

  select * into v_rule from public.growth_reward_rules r
  where r.active and r.environment = private.platform_environment()
  order by r.version desc limit 1;

  update public.referral_attributions
    set status = 'qualified', qualified_at = pg_catalog.now(),
        qualifying_booking_id = p_booking_id
    where id = v_attr.id;

  if v_rule.rule_key is null then
    -- Qualification is recorded even with no active rule. The attribution is
    -- the fact; the reward is a policy decision that can arrive later.
    return;
  end if;

  select pg_catalog.count(*) into v_month
  from public.referral_reward_entitlements e
  where e.beneficiary_user_id = v_attr.referrer_user_id
    and e.granted_at > pg_catalog.now() - pg_catalog.make_interval(days => 30);
  select pg_catalog.count(*) into v_life
  from public.referral_reward_entitlements e
  where e.beneficiary_user_id = v_attr.referrer_user_id;

  if v_rule.beneficiary in ('referrer','both')
     and v_month < v_rule.monthly_entitlement_limit
     and v_life < v_rule.lifetime_entitlement_limit then
    insert into public.referral_reward_entitlements(
      attribution_id, beneficiary_user_id, beneficiary_role,
      rule_key, rule_version, campaign_key)
    values (v_attr.id, v_attr.referrer_user_id,
            private.growth_actor_role(v_attr.referrer_user_id),
            v_rule.rule_key, v_rule.version, v_rule.referrer_campaign_key)
    on conflict (attribution_id, beneficiary_user_id) do nothing;
  end if;

  if v_rule.beneficiary in ('referred','both') then
    insert into public.referral_reward_entitlements(
      attribution_id, beneficiary_user_id, beneficiary_role,
      rule_key, rule_version, campaign_key)
    values (v_attr.id, v_attr.referred_user_id, v_attr.referred_role,
            v_rule.rule_key, v_rule.version, v_rule.referred_campaign_key)
    on conflict (attribution_id, beneficiary_user_id) do nothing;
  end if;

  -- An entitlement that names a campaign becomes a grant. Without a campaign it
  -- stays recorded and unfulfilled: Warsha owes nothing it has not approved.
  insert into public.campaign_eligibility_grants(campaign_key, user_id, source, entitlement_id)
  select e.campaign_key, e.beneficiary_user_id, 'referral_reward', e.id
  from public.referral_reward_entitlements e
  where e.attribution_id = v_attr.id and e.campaign_key is not null
  on conflict (campaign_key, user_id) do nothing;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select e.beneficiary_user_id, 'referral_qualified', 'Referral update',
         'A referral you made has been confirmed.',
         pg_catalog.jsonb_build_object('rule_key', e.rule_key),
         'referral-qualified:' || e.id::text
  from public.referral_reward_entitlements e
  where e.attribution_id = v_attr.id
  on conflict do nothing;

  perform private.record_operational_event(
    'marketplace', 'growth.referral_qualified', 'info',
    pg_catalog.jsonb_build_object('ruleKey', v_rule.rule_key), 'system');
end;
$$;
revoke all on function private.qualify_referral_for_booking(uuid) from public, anon, authenticated;

create or replace function private.growth_booking_completed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    -- Idempotent by construction: the attribution is already terminal on a
    -- second firing, and the entitlement carries a unique key.
    perform private.qualify_referral_for_booking(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.growth_booking_completed() from public, anon, authenticated;
drop trigger if exists growth_booking_completed_wps021 on public.bookings;
create trigger growth_booking_completed_wps021 after insert or update of status
on public.bookings for each row execute function private.growth_booking_completed();

-- ---------------------------------------------------------------------------
-- 10. Eligibility
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER is justified here: this reads private.staff_feature_flags,
-- private.staff_kill_switches, and public.growth_campaigns, none of which the
-- caller may read directly. Returning the RESULT rather than the rows is the
-- entire privacy design.

create or replace function private.evaluate_promotion_eligibility(
  p_user_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_booking public.bookings%rowtype;
  v_campaign public.growth_campaigns%rowtype;
  v_category text;
  v_governorate text;
  v_first_booking boolean;
  v_base_minor bigint;
  v_discount bigint;
  v_role text;
begin
  if p_user_id is null or p_booking_id is null then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  select * into v_booking from public.bookings b
  where b.id = p_booking_id and b.customer_id = p_user_id and b.deleted_at is null;
  if v_booking.id is null then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  v_role := private.growth_actor_role(p_user_id);
  -- 1 + 2: flag and kill switch, cheapest checks first.
  if not private.growth_promotions_open(v_role) then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  -- 12: a booking already carrying a promotion never gets a second one.
  if exists (select 1 from public.campaign_redemptions r
             where r.booking_id = p_booking_id and r.status = 'applied') then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  select s.category_id into v_category
  from public.services s where s.id = v_booking.service_id;
  select a.governorate into v_governorate
  from public.addresses a where a.id = v_booking.address_id;
  select not exists (
    select 1 from public.bookings b
    where b.customer_id = p_user_id and b.id <> p_booking_id
      and b.status = 'completed' and b.deleted_at is null)
  into v_first_booking;

  v_base_minor := pg_catalog.round(
    coalesce(v_booking.final_price_egp, v_booking.estimated_price_egp) * 100)::bigint;
  if v_base_minor < 1 then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  -- 3..11 in one pass. Deterministic ordering means the same booking always
  -- sees the same offer; a shuffling offer would look like a trick.
  select * into v_campaign
  from public.growth_campaigns c
  where c.status = 'active'
    and c.approved_by is not null
    and c.environment = private.platform_environment()
    and c.audience = v_role
    and c.starts_at <= pg_catalog.now()
    and c.ends_at > pg_catalog.now()
    and c.redemption_count < c.global_redemption_limit
    and c.budget_consumed_minor < c.budget_minor
    and (not c.first_booking_only or v_first_booking)
    and (pg_catalog.cardinality(c.service_ids) = 0 or v_booking.service_id = any(c.service_ids))
    and (pg_catalog.cardinality(c.category_keys) = 0 or v_category = any(c.category_keys))
    and (pg_catalog.cardinality(c.governorate_keys) = 0 or v_governorate = any(c.governorate_keys))
    and (not c.requires_grant or exists (
          select 1 from public.campaign_eligibility_grants g
          where g.campaign_key = c.campaign_key and g.user_id = p_user_id))
    and (select pg_catalog.count(*) from public.campaign_redemptions r
         where r.campaign_key = c.campaign_key and r.user_id = p_user_id
           and r.status = 'applied') < c.per_account_limit
  order by
    case when c.discount_type = 'fixed'
         then least(c.discount_value * 100, v_base_minor)
         else least(pg_catalog.round(v_base_minor * c.discount_value / 100), c.max_discount_minor)
    end desc,
    c.ends_at asc,
    c.campaign_key asc
  limit 1;

  if v_campaign.id is null then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  if v_campaign.discount_type = 'fixed' then
    v_discount := least((v_campaign.discount_value * 100)::bigint, v_base_minor);
  else
    v_discount := least(
      pg_catalog.round(v_base_minor * v_campaign.discount_value / 100)::bigint,
      v_campaign.max_discount_minor);
  end if;
  -- A promotion never exceeds the booking. WPS-007 requires a customer total of
  -- at least one minor unit, so the discount is clamped before it is offered.
  v_discount := least(v_discount, v_base_minor - 1);
  v_discount := least(v_discount, v_campaign.budget_minor - v_campaign.budget_consumed_minor);

  if v_discount < 1 then
    return pg_catalog.jsonb_build_object('eligible', false);
  end if;

  return pg_catalog.jsonb_build_object(
    'eligible', true,
    'campaignId', v_campaign.id,
    'campaignKey', v_campaign.campaign_key,
    'titleEn', v_campaign.display_name_en,
    'titleAr', v_campaign.display_name_ar,
    'descriptionEn', v_campaign.description_en,
    'descriptionAr', v_campaign.description_ar,
    'discountMinor', v_discount::text,
    'endsAt', v_campaign.ends_at);
end;
$$;
revoke all on function private.evaluate_promotion_eligibility(uuid,uuid) from public, anon, authenticated;

create or replace function public.get_my_eligible_promotion(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('growth_promotion_lookup');
  begin
    v_result := private.evaluate_promotion_eligibility(v_uid, p_booking_id);
  exception when others then
    -- A configuration mistake must not break checkout. It resolves to no offer.
    return pg_catalog.jsonb_build_object('eligible', false);
  end;
  if coalesce((v_result->>'eligible')::boolean, false) then
    perform private.record_operational_event(
      'marketplace', 'growth.promotion_offered', 'info',
      pg_catalog.jsonb_build_object(
        'campaignKey', v_result->>'campaignKey',
        'discountMinor', (v_result->>'discountMinor')::bigint), 'system');
  end if;
  return v_result;
end;
$$;
revoke all on function public.get_my_eligible_promotion(uuid) from public, anon;
grant execute on function public.get_my_eligible_promotion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Redemption
-- ---------------------------------------------------------------------------

create or replace function public.redeem_promotion(p_booking_id uuid, p_campaign_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_campaign public.growth_campaigns%rowtype;
  v_result jsonb;
  v_discount bigint;
  v_breakdown jsonb;
  v_base bigint;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('growth_promotion_redeem');

  select * into v_campaign from public.growth_campaigns c
  where c.campaign_key = p_campaign_key and c.status = 'active'
    and c.environment = private.platform_environment()
  order by c.version desc limit 1;
  if v_campaign.id is null then
    raise exception 'This offer is not available' using errcode = '42501';
  end if;

  -- The lock is taken BEFORE eligibility is re-evaluated. Evaluating first and
  -- trusting the answer afterwards is the classic time-of-check bug: two
  -- customers would both redeem the final unit of budget.
  perform 1 from public.growth_campaigns c where c.id = v_campaign.id for update;

  v_result := private.evaluate_promotion_eligibility(v_uid, p_booking_id);
  if not coalesce((v_result->>'eligible')::boolean, false)
     or v_result->>'campaignKey' is distinct from p_campaign_key then
    raise exception 'This offer is not available' using errcode = '42501';
  end if;
  v_discount := (v_result->>'discountMinor')::bigint;

  insert into public.campaign_redemptions(
    campaign_id, campaign_key, user_id, booking_id, discount_minor, idempotency_key)
  values (v_campaign.id, v_campaign.campaign_key, v_uid, p_booking_id, v_discount,
          'redeem:' || p_booking_id::text);

  update public.growth_campaigns
    set budget_consumed_minor = budget_consumed_minor + v_discount,
        redemption_count = redemption_count + 1
    where id = v_campaign.id;

  -- The ONLY route a promotion takes to a customer price.
  --
  -- WPS-007 treats final_price_egp as the CUSTOMER-FACING total and derives
  --     provider_gross := customer_total + promotion
  -- so the customer-facing price must come down by the discount. Writing only
  -- price_breakdown.discount would leave the customer paying full price and
  -- inflate provider gross above the job's value — Warsha would be funding a
  -- bonus nobody authorised instead of a discount. Reducing the customer price
  -- and recording the promotion makes provider gross land back on the original
  -- job value, which is what "Warsha-funded" means.
  select coalesce(b.price_breakdown, '{}'::jsonb),
         pg_catalog.round(coalesce(b.final_price_egp, b.estimated_price_egp) * 100)::bigint
    into v_breakdown, v_base
  from public.bookings b where b.id = p_booking_id;

  update public.bookings
    set price_breakdown = v_breakdown
        || pg_catalog.jsonb_build_object('discount', (v_discount::numeric / 100)),
        final_price_egp = (v_base - v_discount)::numeric / 100,
        updated_at = pg_catalog.now()
    where id = p_booking_id;
  perform private.create_booking_price_snapshot(p_booking_id);

  update public.referral_reward_entitlements
    set status = 'fulfilled', fulfilled_at = pg_catalog.now()
    where beneficiary_user_id = v_uid and campaign_key = p_campaign_key and status = 'recorded';

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (v_uid, 'promotion_redeemed', 'Offer applied',
          'A Warsha offer was applied to your booking.',
          pg_catalog.jsonb_build_object('booking_id', p_booking_id),
          'promotion-redeemed:' || p_booking_id::text)
  on conflict do nothing;

  if (select pg_catalog.count(*) from public.campaign_redemptions r
      where r.user_id = v_uid
        and r.redeemed_at > pg_catalog.now() - pg_catalog.make_interval(days => 7)) > 5 then
    perform private.record_trust_fraud_signal(
      v_uid, 'abnormal_payment_behavior', 'low', 1,
      pg_catalog.jsonb_build_object('growthSignal', 'promotion_velocity',
                                    'surface', 'promotion_redeem'));
  end if;

  perform private.record_operational_event(
    'marketplace', 'growth.promotion_redeemed', 'info',
    pg_catalog.jsonb_build_object('campaignKey', p_campaign_key, 'discountMinor', v_discount),
    'system');

  return pg_catalog.jsonb_build_object('redeemed', true, 'discountMinor', v_discount::text);
end;
$$;
revoke all on function public.redeem_promotion(uuid,text) from public, anon;
grant execute on function public.redeem_promotion(uuid,text) to authenticated;

-- Budget released when a booking stops being billable. WPS-007 already reverses
-- the ledger expense proportionally; this releases the campaign budget so the
-- two do not drift.
create or replace function private.growth_release_on_cancel()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row public.campaign_redemptions%rowtype;
begin
  if new.status not in ('cancelled','refunded') or old.status is not distinct from new.status then
    return new;
  end if;
  select * into v_row from public.campaign_redemptions r
  where r.booking_id = new.id and r.status = 'applied' for update;
  if v_row.id is null then return new; end if;

  update public.campaign_redemptions
    set status = 'reversed', reversed_at = pg_catalog.now(),
        released_minor = v_row.discount_minor
    where id = v_row.id;
  update public.growth_campaigns
    set budget_consumed_minor = greatest(budget_consumed_minor - v_row.discount_minor, 0),
        redemption_count = greatest(redemption_count - 1, 0)
    where id = v_row.campaign_id;
  -- Clear the discount from the booking as well, so a later re-snapshot cannot
  -- apply a promotion that no redemption row backs any more.
  update public.bookings
    set price_breakdown = coalesce(price_breakdown,'{}'::jsonb)
        || pg_catalog.jsonb_build_object('discount', 0),
        final_price_egp = final_price_egp + (v_row.discount_minor::numeric / 100)
    where id = new.id and final_price_egp is not null;
  return new;
end;
$$;
revoke all on function private.growth_release_on_cancel() from public, anon, authenticated;
drop trigger if exists growth_release_on_cancel_wps021 on public.bookings;
create trigger growth_release_on_cancel_wps021 after update of status
on public.bookings for each row execute function private.growth_release_on_cancel();

-- ---------------------------------------------------------------------------
-- 12. Staff administration
-- ---------------------------------------------------------------------------

insert into public.staff_capabilities(
  capability_key, domain, description, high_risk, dual_control, requires_reauth) values
  ('manage_growth_campaigns','marketplace','Draft and submit growth campaigns.',true,false,false),
  ('approve_growth_campaign','marketplace','Approve and activate a growth campaign.',true,true,true)
on conflict (capability_key) do update set
  domain = excluded.domain, description = excluded.description,
  high_risk = excluded.high_risk, dual_control = excluded.dual_control,
  requires_reauth = excluded.requires_reauth;

insert into public.staff_role_capabilities(role_key, capability_key) values
  ('marketplace_operations','manage_growth_campaigns'),
  ('operations_manager','manage_growth_campaigns'),
  ('operations_manager','approve_growth_campaign'),
  ('super_administrator','manage_growth_campaigns'),
  ('super_administrator','approve_growth_campaign')
on conflict (role_key, capability_key) do nothing;

create or replace function public.staff_create_campaign_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid; v_id uuid; v_key text; v_version integer;
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  v_key := p_payload->>'campaignKey';
  select coalesce(pg_catalog.max(c.version), 0) + 1 into v_version
  from public.growth_campaigns c where c.campaign_key = v_key;

  insert into public.growth_campaigns(
    campaign_key, version, display_name_en, display_name_ar,
    description_en, description_ar, environment, audience,
    discount_type, discount_value, max_discount_minor,
    starts_at, ends_at, budget_minor, global_redemption_limit,
    per_account_limit, first_booking_only, requires_grant,
    service_ids, category_keys, governorate_keys, created_by)
  values (
    v_key, v_version, p_payload->>'displayNameEn', p_payload->>'displayNameAr',
    p_payload->>'descriptionEn', p_payload->>'descriptionAr',
    private.platform_environment(), p_payload->>'audience',
    p_payload->>'discountType', (p_payload->>'discountValue')::numeric,
    nullif(p_payload->>'maxDiscountMinor','')::bigint,
    (p_payload->>'startsAt')::timestamptz, (p_payload->>'endsAt')::timestamptz,
    (p_payload->>'budgetMinor')::bigint, (p_payload->>'globalRedemptionLimit')::integer,
    coalesce((p_payload->>'perAccountLimit')::integer, 1),
    coalesce((p_payload->>'firstBookingOnly')::boolean, false),
    coalesce((p_payload->>'requiresGrant')::boolean, false),
    coalesce((select pg_catalog.array_agg(x::uuid)
              from pg_catalog.jsonb_array_elements_text(
                coalesce(p_payload->'serviceIds','[]'::jsonb)) x), '{}'),
    coalesce((select pg_catalog.array_agg(x)
              from pg_catalog.jsonb_array_elements_text(
                coalesce(p_payload->'categoryKeys','[]'::jsonb)) x), '{}'),
    coalesce((select pg_catalog.array_agg(x)
              from pg_catalog.jsonb_array_elements_text(
                coalesce(p_payload->'governorateKeys','[]'::jsonb)) x), '{}'),
    v_uid)
  returning id into v_id;

  perform private.record_staff_audit(v_uid, 'manage_growth_campaigns', 'campaign_drafted',
    'growth_campaign', v_id, 'Campaign draft created',
    pg_catalog.jsonb_build_object('campaignKey', v_key, 'version', v_version));
  return pg_catalog.jsonb_build_object('id', v_id, 'campaignKey', v_key, 'version', v_version);
end;
$$;
revoke all on function public.staff_create_campaign_draft(jsonb) from public, anon;
grant execute on function public.staff_create_campaign_draft(jsonb) to authenticated;

create or replace function public.staff_activate_campaign(p_campaign_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid; v_row public.growth_campaigns%rowtype;
begin
  v_uid := private.require_staff_capability('approve_growth_campaign');
  select * into v_row from public.growth_campaigns c where c.id = p_campaign_id for update;
  if v_row.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft campaign can be activated' using errcode = '22023';
  end if;
  -- Independent of dual control, and deliberately so: where dual control is off
  -- for the environment, this is the check that still prevents one person from
  -- authoring and activating their own spending.
  if v_row.created_by is not null and v_row.created_by = v_uid then
    raise exception 'A campaign cannot be activated by its creator' using errcode = '42501';
  end if;
  perform private.consume_dual_control(
    'approve_growth_campaign', 'activate_campaign', p_campaign_id::text);

  update public.growth_campaigns
    set status = case when starts_at > pg_catalog.now() then 'scheduled' else 'active' end,
        approved_by = v_uid, approved_at = pg_catalog.now(),
        activated_at = pg_catalog.now()
    where id = p_campaign_id;

  perform private.record_staff_audit(v_uid, 'approve_growth_campaign', 'campaign_activated',
    'growth_campaign', p_campaign_id, coalesce(nullif(pg_catalog.btrim(p_note),''), 'Campaign activated'),
    pg_catalog.jsonb_build_object('campaignKey', v_row.campaign_key));
  return pg_catalog.jsonb_build_object('id', p_campaign_id, 'activated', true);
end;
$$;
revoke all on function public.staff_activate_campaign(uuid,text) from public, anon;
grant execute on function public.staff_activate_campaign(uuid,text) to authenticated;

create or replace function public.staff_set_campaign_state(
  p_campaign_id uuid, p_state text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid; v_row public.growth_campaigns%rowtype;
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  if p_state not in ('paused','active','cancelled','expired') then
    raise exception 'Unsupported campaign state' using errcode = '22023';
  end if;
  select * into v_row from public.growth_campaigns c where c.id = p_campaign_id for update;
  if v_row.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_row.status = 'draft' then
    raise exception 'A draft campaign must be activated first' using errcode = '22023';
  end if;
  if v_row.status in ('cancelled','expired') then
    raise exception 'This campaign is already final' using errcode = '22023';
  end if;
  -- Resuming is only ever a return to the approved window, never an extension.
  if p_state = 'active' and v_row.status <> 'paused' then
    raise exception 'Only a paused campaign can resume' using errcode = '22023';
  end if;

  update public.growth_campaigns
    set status = p_state,
        paused_at = case when p_state = 'paused' then pg_catalog.now() else paused_at end,
        cancelled_at = case when p_state = 'cancelled' then pg_catalog.now() else cancelled_at end
    where id = p_campaign_id;

  perform private.record_staff_audit(v_uid, 'manage_growth_campaigns', 'campaign_' || p_state,
    'growth_campaign', p_campaign_id, coalesce(nullif(pg_catalog.btrim(p_reason),''), 'State change'),
    pg_catalog.jsonb_build_object('campaignKey', v_row.campaign_key, 'state', p_state));
  return pg_catalog.jsonb_build_object('id', p_campaign_id, 'status', p_state);
end;
$$;
revoke all on function public.staff_set_campaign_state(uuid,text,text) from public, anon;
grant execute on function public.staff_set_campaign_state(uuid,text,text) to authenticated;

create or replace function public.get_staff_campaigns(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid; v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  return coalesce((
    select pg_catalog.jsonb_agg(x order by x->>'createdAt' desc)
    from (
      select pg_catalog.jsonb_build_object(
        'id', c.id, 'campaignKey', c.campaign_key, 'version', c.version,
        'displayNameEn', c.display_name_en, 'displayNameAr', c.display_name_ar,
        'status', c.status, 'audience', c.audience, 'environment', c.environment,
        'discountType', c.discount_type, 'discountValue', c.discount_value,
        'startsAt', c.starts_at, 'endsAt', c.ends_at,
        'budgetMinor', c.budget_minor::text,
        'budgetConsumedMinor', c.budget_consumed_minor::text,
        'globalRedemptionLimit', c.global_redemption_limit,
        'redemptionCount', c.redemption_count,
        'createdBy', c.created_by, 'approvedBy', c.approved_by,
        'createdAt', c.created_at) as x
      from public.growth_campaigns c
      order by c.created_at desc
      limit v_limit
    ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.get_staff_campaigns(integer) from public, anon;
grant execute on function public.get_staff_campaigns(integer) to authenticated;

-- Answers "would this account qualify" WITHOUT creating a redemption,
-- consuming budget, or notifying anyone.
create or replace function public.staff_preview_campaign_eligibility(
  p_user_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid;
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  return private.evaluate_promotion_eligibility(p_user_id, p_booking_id);
end;
$$;
revoke all on function public.staff_preview_campaign_eligibility(uuid,uuid) from public, anon;
grant execute on function public.staff_preview_campaign_eligibility(uuid,uuid) to authenticated;

create or replace function public.staff_revoke_referral_code(p_code_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid;
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  -- Revocation never deletes the code or its attribution history.
  update public.referral_codes
    set status = 'revoked', revoked_at = pg_catalog.now(),
        revoked_by = v_uid, revoke_reason = pg_catalog.btrim(p_reason)
    where id = p_code_id and status = 'active';
  if not found then
    raise exception 'Referral code not found' using errcode = 'P0002';
  end if;
  perform private.record_staff_audit(v_uid, 'manage_growth_campaigns', 'referral_code_revoked',
    'referral_code', p_code_id, pg_catalog.btrim(p_reason), '{}'::jsonb);
  return pg_catalog.jsonb_build_object('id', p_code_id, 'revoked', true);
end;
$$;
revoke all on function public.staff_revoke_referral_code(uuid,text) from public, anon;
grant execute on function public.staff_revoke_referral_code(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Reuse registrations: flags, kill switch, limits, notifications
-- ---------------------------------------------------------------------------

insert into private.staff_feature_flags(
  flag_key, environment, enabled, audience, reason, is_kill_switch) values
  ('growth_referrals','local',false,'none',
   'WPS-021 referrals stay disabled until growth operations sign-off.',false),
  ('growth_promotions','local',false,'none',
   'WPS-021 promotions stay disabled: campaigns are staff-approved and off by default.',false)
on conflict (flag_key, environment) do nothing;

insert into private.staff_kill_switches(
  switch_key, display_name, domain_authority, server_enforced, enforcement_note) values
  ('growth_promotions','Growth promotions','WPS-021',true,
   'Checked by private.growth_promotions_open before any eligibility evaluation. Restricts only; never enables.')
on conflict (switch_key) do nothing;

insert into private.rate_limit_policies(
  policy_key, surface, scope, max_events, window_seconds, enforced_by, notes) values
  ('growth_referral_code','Referral code issuance','account',5,3600,'wps018_limiter',
   'Code creation is once per account; the limit bounds repeated first-call attempts.'),
  ('growth_referral_claim','Referral code claim','account',10,3600,'wps018_limiter',
   'Bounds brute-force guessing of the 31^10 code space.'),
  ('growth_promotion_lookup','Promotion eligibility lookup','account',60,3600,'wps018_limiter',
   'Bounds probing for campaign existence through repeated eligibility calls.'),
  ('growth_promotion_redeem','Promotion redemption','account',10,3600,'wps018_limiter',
   'Bounds redemption attempts per account.')
on conflict (policy_key) do nothing;

-- Five events. None is critical, none is action_required, none bypasses quiet
-- hours. WPS-014 handles preferences, grouping, and dedupe unchanged.
insert into private.notification_event_catalog(
  event_type, category, priority, action_type, route_type,
  required_action, mandatory_in_app, quiet_hours_bypass, group_family,
  generic_title, generic_body) values
  ('referral_qualified','system','important',null,null,false,false,false,null,
   'Referral update','A referral you made has been confirmed.'),
  ('referral_pending','system','informational',null,null,false,false,false,null,
   'Referral update','Someone joined Warsha with your invite.'),
  ('promotion_available','system','informational',null,null,false,false,false,null,
   'Offer available','You have a Warsha offer available.'),
  ('promotion_expiring','system','informational',null,null,false,false,false,null,
   'Offer ending','A Warsha offer is ending soon.'),
  ('promotion_redeemed','system','informational',null,null,false,false,false,null,
   'Offer applied','A Warsha offer was applied to your booking.')
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------
-- 14. Grants
-- ---------------------------------------------------------------------------
--
-- An RLS policy scopes rows; it does not grant a privilege. These four tables
-- carry an owner policy, so they also need SELECT for that policy to mean
-- anything. SELECT only: every write goes through an RPC that enforces the
-- rules, so a client holds no path to insert an attribution, mint a code, or
-- forge a redemption. The campaign tables are deliberately absent from this
-- list and receive no grant at all.

-- Supabase's default privileges hand every new public table a set of grants to
-- anon and authenticated. Revoke first, then grant back exactly what is needed,
-- so the final privilege set is stated here rather than inherited.
revoke all on public.referral_codes from anon, authenticated, public;
revoke all on public.referral_attributions from anon, authenticated, public;
revoke all on public.referral_reward_entitlements from anon, authenticated, public;
revoke all on public.campaign_redemptions from anon, authenticated, public;

grant select on public.referral_codes to authenticated;
grant select on public.referral_attributions to authenticated;
grant select on public.referral_reward_entitlements to authenticated;
grant select on public.campaign_redemptions to authenticated;

comment on table public.growth_campaigns is
  'WPS-021 staff-created promotional campaigns. No RLS policy and no grant by design: campaigns are never client-readable. Visibility is an eligibility RESULT from private.evaluate_promotion_eligibility.';
comment on table public.referral_reward_entitlements is
  'WPS-021 reward entitlements. NOT money, NOT a balance, NOT a credit. Posts no ledger row. Becomes real only through a staff-approved campaign redemption under WPS-007.';
