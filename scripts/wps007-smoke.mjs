import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const PERSONAS = {
  customer: {
    email: 'wps007.customer.a@warsha.test',
    name: 'WPS-007 Customer A',
    role: 'customer',
  },
  providerA: {
    email: 'wps007.provider.a@warsha.test',
    name: 'WPS-007 Provider A',
    role: 'provider',
  },
  providerB: {
    email: 'wps007.provider.b@warsha.test',
    name: 'WPS-007 Provider B',
    role: 'provider',
  },
  staff: {
    email: 'wps007.staff@warsha.test',
    name: 'WPS-007 Staff',
    role: 'customer',
  },
};
const PASSWORD = 'WarshaSmoke!2026';
const PROJECT_ID = readProjectId();
const DATABASE_CONTAINER = `supabase_db_${PROJECT_ID}`;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{2,199}$/;
const PAYMENT_EVENTS = {
  pending: 'payment.pending',
  success: 'payment.succeeded',
  failure: 'payment.failed',
};

function readProjectId() {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const match = config.match(/^\s*project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m);
  if (!match) throw new Error('supabase/config.toml does not define project_id.');
  return match[1];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed.\n${result.stderr || result.stdout || ''}`.trim(),
    );
  }
  return result.stdout ?? '';
}

function localStatusEnvironment() {
  const override = process.env.SUPABASE_CLI_BINARY_OVERRIDE;
  const output = override
    ? run(override, ['status', '-o', 'env'])
    : run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'env']);
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=["']?(.*?)["']?$/);
    if (match) values[match[1]] = match[2];
  }
  const apiUrl = values.API_URL;
  const serviceKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
  const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;
  if (!apiUrl || !serviceKey || !anonKey) {
    throw new Error(
      'Could not read the local API URL and local keys. Start Supabase and set '
      + 'SUPABASE_CLI_BINARY_OVERRIDE if the npm CLI wrapper cannot initialize.',
    );
  }
  const parsed = new URL(apiUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local Supabase URL: ${parsed.origin}`);
  }
  return { apiUrl, serviceKey, anonKey };
}

function psql(sql, variables = {}) {
  const args = [
    'exec',
    '-i',
    DATABASE_CONTAINER,
    'psql',
    '-X',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-v', `${key}=${value}`);
  }
  return run('docker', args, { input: sql });
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeToken(value, label) {
  if (!SAFE_TOKEN.test(value ?? '')) throw new Error(`Invalid ${label}.`);
  return value;
}

function minorFromEgp(value) {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value ?? '')) {
    throw new Error('Amount must be a positive EGP value with at most two decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor < 1n || minor > 1_000_000_000n) throw new Error('Amount is outside the smoke-test range.');
  return minor.toString();
}

async function ensureUser(admin, persona) {
  let page = 1;
  let existing;
  while (!existing) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    existing = data.users.find(user => user.email?.toLowerCase() === persona.email);
    if (existing || data.users.length < 100) break;
    page += 1;
  }
  const metadata = {
    display_name: persona.name,
    preferred_language: 'en',
    account_role: persona.role,
    terms_accepted_at: '2026-07-29T00:00:00.000Z',
    privacy_accepted_at: '2026-07-29T00:00:00.000Z',
    wps007_smoke_persona: true,
  };
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: persona.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user.id;
}

const fixtureSql = `
begin;

insert into public.user_roles(user_id, role)
select id, 'admin'
from auth.users
where email = ${literal(PERSONAS.staff.email)}
on conflict do nothing;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = ${literal(PERSONAS.staff.email)}),
  true
);

update public.provider_profiles p
set display_name = v.display_name,
    profession_key = 'plumbing',
    primary_category_id = 'plumbing',
    about = 'Local WPS-007 financial smoke-test provider.',
    experience_years = 8,
    starting_price_egp = 200,
    response_time_label = 'Development fixture',
    location_label = 'Cairo',
    service_radius_km = 15,
    languages = array['Arabic', 'English'],
    skills = array['Local smoke testing'],
    is_verified = true,
    skill_certificate_verified = true,
    is_available = true,
    is_published = true,
    onboarding_status = 'approved',
    deleted_at = null
from (
  values
    (${literal(PERSONAS.providerA.email)}, ${literal(PERSONAS.providerA.name)}),
    (${literal(PERSONAS.providerB.email)}, ${literal(PERSONAS.providerB.name)})
) as v(email, display_name)
join auth.users u on u.email = v.email
where p.user_id = u.id;

insert into public.provider_verifications(
  provider_id, status, revision, skill_certificate_answer,
  reviewed_by, reviewed_at, created_at, updated_at
)
select
  p.id, 'approved', 1, 'yes', staff.id, now(), now(), now()
from public.provider_profiles p
join auth.users u on u.id = p.user_id
cross join lateral (
  select id from auth.users where email = ${literal(PERSONAS.staff.email)}
) staff
where u.email in (
  ${literal(PERSONAS.providerA.email)},
  ${literal(PERSONAS.providerB.email)}
)
on conflict (provider_id) do update
set status = 'approved',
    revision = greatest(public.provider_verifications.revision, 1),
    skill_certificate_answer = 'yes',
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = excluded.updated_at;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = ${literal(PERSONAS.customer.email)}),
  true
);

with fixture(
  id, fixture_key, status, customer_total, provider_gross, promotion,
  service_name, provider_email
) as (
  values
    ('77000000-0000-4000-8000-000000000001'::uuid, 'wps007-c01-online-success', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'C-01 Online mock payment success', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000002'::uuid, 'wps007-c02-failure-retry', 'completed', 800::numeric, 800::numeric, 0::numeric, 'C-02 Failure and retry', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000003'::uuid, 'wps007-c03-duplicate-event', 'completed', 700::numeric, 700::numeric, 0::numeric, 'C-03 Duplicate gateway event', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000004'::uuid, 'wps007-c04-cash-selection', 'completed', 400::numeric, 400::numeric, 0::numeric, 'C-04 Cash selection', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000005'::uuid, 'wps007-c05-cash-accepted', 'completed', 600::numeric, 600::numeric, 0::numeric, 'C-05 Cash accepted', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000006'::uuid, 'wps007-c06-cash-disputed', 'completed', 450::numeric, 450::numeric, 0::numeric, 'C-06 Cash disputed', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000007'::uuid, 'wps007-c07-full-refund', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'C-07 Full pre-release refund', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000008'::uuid, 'wps007-c08-partial-refund', 'completed', 999.99::numeric, 999.99::numeric, 0::numeric, 'C-08 Partial pre-release refund', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000009'::uuid, 'wps007-c09-price-accepted', 'work_in_progress', 500::numeric, 500::numeric, 0::numeric, 'C-09 Accepted price revision', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000010'::uuid, 'wps007-c10-price-rejected', 'work_in_progress', 500::numeric, 500::numeric, 0::numeric, 'C-10 Rejected price revision', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000011'::uuid, 'wps007-c11-promotion', 'completed', 900::numeric, 1000::numeric, 100::numeric, 'C-11 Warsha-funded promotion', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000012'::uuid, 'wps007-p02-six-hour-release', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-02 Six-hour release', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000013'::uuid, 'wps007-p03-customer-release', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-03 Customer-confirmed release', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000014'::uuid, 'wps007-p04-dispute-hold', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-04 Dispute hold', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000015'::uuid, 'wps007-p07-withdrawal-paid', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-07 Successful mock withdrawal funding', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000016'::uuid, 'wps007-p08-withdrawal-failed', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-08 Failed mock withdrawal funding', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000017'::uuid, 'wps007-p09-cash-debt-exact', 'completed', 5000::numeric, 5000::numeric, 0::numeric, 'P-09/P-10 Cash debt exactly EGP 500', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000018'::uuid, 'wps007-p10-cash-debt-above', 'completed', 1::numeric, 1::numeric, 0::numeric, 'P-10 Cash debt above EGP 500', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000019'::uuid, 'wps007-p11-online-debt-offset', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-11 Online debt offset', ${literal(PERSONAS.providerA.email)}),
    ('77000000-0000-4000-8000-000000000020'::uuid, 'wps007-p13-recovery', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'P-13 Post-release recovery', ${literal(PERSONAS.providerB.email)}),
    ('77000000-0000-4000-8000-000000000021'::uuid, 'wps007-p13-recovery-offset', 'completed', 500::numeric, 500::numeric, 0::numeric, 'P-13 Future recovery offset', ${literal(PERSONAS.providerB.email)}),
    ('77000000-0000-4000-8000-000000000022'::uuid, 'wps007-s01-earning-hold', 'completed', 1000::numeric, 1000::numeric, 0::numeric, 'S-01 Explicit earning hold', ${literal(PERSONAS.providerA.email)})
)
insert into public.bookings(
  id, customer_id, provider_id, service_id, status, service_name_snapshot,
  pricing_type, estimated_price_egp, final_price_egp, issue_description,
  scheduled_date, scheduled_time, address_snapshot, booking_type, notes,
  price_breakdown, idempotency_key, customer_name_snapshot
)
select
  f.id,
  customer.id,
  provider.id,
  service.id,
  f.status,
  f.service_name,
  'fixed',
  f.customer_total,
  f.customer_total,
  'Local WPS-007 manual financial smoke-test fixture.',
  current_date,
  '12:00',
  'WPS-007 local test address, Cairo',
  'scheduled',
  'Development-only fixture. No real service or money.',
  jsonb_build_object(
    'servicePrice', f.provider_gross,
    'transportationFee', 0,
    'emergencySurcharge', 0,
    'discount', f.promotion,
    'estimatedTotal', f.customer_total,
    'pricingType', 'fixed'
  ),
  f.fixture_key,
  ${literal(PERSONAS.customer.name)}
from fixture f
cross join lateral (
  select cp.id
  from public.customer_profiles cp
  join auth.users u on u.id = cp.id
  where u.email = ${literal(PERSONAS.customer.email)}
) customer
cross join lateral (
  select p.id
  from public.provider_profiles p
  join auth.users u on u.id = p.user_id
  where u.email = f.provider_email
) provider
cross join lateral (
  select s.id from public.services s
  where s.is_active and s.deleted_at is null
  order by s.id
  limit 1
) service
on conflict (id) do nothing;

update private.payment_configuration
set gateway_mode = 'disabled',
    payout_mode = 'disabled',
    automatic_release_scheduler_enabled = false
where id;

commit;
`;

async function prepare() {
  const { apiUrl, serviceKey } = localStatusEnvironment();
  const admin = createClient(apiUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const persona of Object.values(PERSONAS)) await ensureUser(admin, persona);
  process.stdout.write(psql(fixtureSql));
  console.log('WPS-007 local personas and 22 isolated booking fixtures are ready.');
  printPersonas();
  console.log('Financial modes remain disabled. Run `npm run smoke:wps007 -- modes on` when ready.');
}

function printPersonas() {
  for (const [key, persona] of Object.entries(PERSONAS)) {
    console.log(`${key}: ${persona.email}`);
  }
  console.log(`local-only password: ${PASSWORD}`);
}

function startExpo() {
  const { apiUrl, anonKey } = localStatusEnvironment();
  console.log(`Starting Expo against local Supabase at ${apiUrl}.`);
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['start', '--', '--clear'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      EXPO_PUBLIC_DATA_MODE: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: apiUrl,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Expo exited with status ${result.status}.`);
}

function modes(value) {
  if (!['on', 'off', 'status'].includes(value)) throw new Error('Use modes on, modes off, or modes status.');
  if (value === 'status') {
    process.stdout.write(psql(`
      select policy_version, gateway_mode, payout_mode,
             automatic_release_scheduler_enabled
      from private.payment_configuration where id;
    `));
    return;
  }
  const mode = value === 'on' ? 'mock' : 'disabled';
  process.stdout.write(psql(`
    update private.payment_configuration
    set gateway_mode = ${literal(mode)},
        payout_mode = ${literal(mode)},
        automatic_release_scheduler_enabled = false
    where id;
    select gateway_mode, payout_mode, automatic_release_scheduler_enabled
    from private.payment_configuration where id;
  `));
  console.log(value === 'on'
    ? 'Local mock gateway and payout modes enabled; automatic scheduler remains disabled.'
    : 'All WPS-007 financial development modes restored to disabled.');
}

function event(fixtureKey, outcome, suppliedEventId) {
  safeToken(fixtureKey, 'fixture key');
  const eventType = PAYMENT_EVENTS[outcome];
  if (!eventType) throw new Error('Outcome must be pending, success, or failure.');
  const eventId = suppliedEventId
    ? safeToken(suppliedEventId, 'event id')
    : `wps007-${outcome}-${Date.now()}`;
  process.stdout.write(psql(`
    select private.process_mock_payment_event(
      ${literal(eventId)},
      (
        select a.id
        from private.payment_attempts a
        join public.financial_booking_payments p on p.id = a.payment_id
        join public.bookings b on b.id = p.booking_id
        where b.idempotency_key = ${literal(fixtureKey)}
        order by a.attempt_number desc
        limit 1
      ),
      ${literal(eventType)},
      true
    ) as trusted_mock_result;
  `));
  console.log(`Trusted local event id: ${eventId}`);
}

function intent(fixtureKey, method, idempotencyKey) {
  safeToken(fixtureKey, 'fixture key');
  if (!['online', 'cash'].includes(method)) throw new Error('Payment method must be online or cash.');
  safeToken(idempotencyKey, 'idempotency key');
  process.stdout.write(psql(`
    begin;
    select set_config(
      'request.jwt.claim.sub',
      (select id::text from auth.users where email = ${literal(PERSONAS.customer.email)}),
      true
    );
    set local role authenticated;
    select public.create_booking_payment_intent(
      (select id from public.bookings where idempotency_key = ${literal(fixtureKey)}),
      ${literal(idempotencyKey)},
      ${literal(method)}
    ) as payment_intent;
    commit;
  `));
}

function gatewayFee(fixtureKey, egp, eventId) {
  safeToken(fixtureKey, 'fixture key');
  safeToken(eventId, 'gateway fee event id');
  const amountMinor = minorFromEgp(egp);
  process.stdout.write(psql(`
    select private.record_gateway_fee(
      (
        select p.id from public.financial_booking_payments p
        join public.bookings b on b.id = p.booking_id
        where b.idempotency_key = ${literal(fixtureKey)}
      ),
      ${amountMinor},
      ${literal(eventId)}
    ) as gateway_fee_recorded;
  `));
}

function scheduler(fixtureKey) {
  safeToken(fixtureKey, 'fixture key');
  process.stdout.write(psql(`
    begin;
    update private.payment_configuration
    set automatic_release_scheduler_enabled = true
    where id;
    update public.provider_earnings_ledger e
    set release_eligible_at = now() - interval '1 second',
        updated_at = now()
    from public.bookings b
    where b.id = e.booking_id
      and b.idempotency_key = ${literal(fixtureKey)};
    select private.release_eligible_provider_earnings(100) as released_count;
    update private.payment_configuration
    set automatic_release_scheduler_enabled = false
    where id;
    commit;
    select automatic_release_scheduler_enabled
    from private.payment_configuration where id;
  `));
}

function staffContextSql() {
  return `
    select set_config(
      'request.jwt.claim.sub',
      (select id::text from auth.users where email = ${literal(PERSONAS.staff.email)}),
      true
    );
    set local role authenticated;
  `;
}

function refund(fixtureKey, egp, idempotencyKey) {
  safeToken(fixtureKey, 'fixture key');
  safeToken(idempotencyKey, 'idempotency key');
  const amountMinor = minorFromEgp(egp);
  process.stdout.write(psql(`
    begin;
    ${staffContextSql()}
    select public.process_financial_refund(
      (
        select p.id from public.financial_booking_payments p
        join public.bookings b on b.id = p.booking_id
        where b.idempotency_key = ${literal(fixtureKey)}
      ),
      ${amountMinor},
      'WPS-007 local staff smoke test',
      ${literal(idempotencyKey)}
    ) as refund_result;
    commit;
  `));
}

function hold(fixtureKey, action, egp, idempotencyKey) {
  safeToken(fixtureKey, 'fixture key');
  if (!['hold', 'release'].includes(action)) throw new Error('Hold action must be hold or release.');
  safeToken(idempotencyKey, 'idempotency key');
  const amountMinor = minorFromEgp(egp);
  process.stdout.write(psql(`
    begin;
    ${staffContextSql()}
    select public.set_provider_earning_hold(
      (
        select e.id from public.provider_earnings_ledger e
        join public.bookings b on b.id = e.booking_id
        where b.idempotency_key = ${literal(fixtureKey)}
      ),
      ${literal(action)},
      ${amountMinor},
      'WPS-007 local staff review',
      ${literal(idempotencyKey)}
    ) as hold_result;
    commit;
  `));
}

function withdrawal(status, idempotencyKey, provider = 'a') {
  if (!['under_review', 'processing', 'paid', 'failed', 'cancelled'].includes(status)) {
    throw new Error('Unsupported withdrawal review status.');
  }
  safeToken(idempotencyKey, 'idempotency key');
  const email = provider.toLowerCase() === 'b'
    ? PERSONAS.providerB.email
    : PERSONAS.providerA.email;
  process.stdout.write(psql(`
    begin;
    create temporary table wps007_withdrawal_target(
      id uuid primary key
    ) on commit drop;
    insert into wps007_withdrawal_target(id)
    select w.id
    from public.provider_withdrawal_requests w
    join public.provider_profiles p on p.id = w.provider_id
    join auth.users u on u.id = p.user_id
    where u.email = ${literal(email)}
      and (
        w.status not in ('paid', 'failed', 'cancelled', 'reversed')
        or w.status = ${literal(status)}
      )
    order by
      (w.status not in ('paid', 'failed', 'cancelled', 'reversed')) desc,
      w.requested_at desc
    limit 1;
    grant select on wps007_withdrawal_target to authenticated;
    ${staffContextSql()}
    select public.review_provider_withdrawal(
      (select id from wps007_withdrawal_target),
      ${literal(status)},
      'WPS-007 local staff payout simulation',
      ${literal(idempotencyKey)}
    ) as withdrawal_result;
    commit;
  `));
}

function providerEmail(provider) {
  return provider?.toLowerCase() === 'b'
    ? PERSONAS.providerB.email
    : PERSONAS.providerA.email;
}

function destination(provider, type, idempotencyKey) {
  if (!['mobile_wallet', 'bank_account'].includes(type)) {
    throw new Error('Destination type must be mobile_wallet or bank_account.');
  }
  safeToken(idempotencyKey, 'idempotency key');
  const email = providerEmail(provider);
  const value = type === 'mobile_wallet'
    ? provider?.toLowerCase() === 'b' ? '01000000002' : '01000000001'
    : provider?.toLowerCase() === 'b' ? 'EG00WARSHASMOKE0002' : 'EG00WARSHASMOKE0001';
  process.stdout.write(psql(`
    begin;
    select set_config(
      'request.jwt.claim.sub',
      (select id::text from auth.users where email = ${literal(email)}),
      true
    );
    set local role authenticated;
    select public.save_my_payout_destination(
      ${literal(type)},
      'WPS-007 local ${type === 'mobile_wallet' ? 'wallet' : 'bank'}',
      ${literal(value)},
      true,
      true,
      ${literal(idempotencyKey)}
    ) as destination_result;
    commit;
  `));
}

function requestWithdrawal(provider, egp, idempotencyKey) {
  safeToken(idempotencyKey, 'idempotency key');
  const email = providerEmail(provider);
  const amountMinor = minorFromEgp(egp);
  process.stdout.write(psql(`
    begin;
    select set_config(
      'request.jwt.claim.sub',
      (select id::text from auth.users where email = ${literal(email)}),
      true
    );
    set local role authenticated;
    select public.request_provider_withdrawal(
      ${amountMinor},
      (
        select d.id
        from public.provider_payout_destinations d
        where d.status = 'active'
        order by d.is_preferred desc, d.created_at desc
        limit 1
      ),
      ${literal(idempotencyKey)}
    ) as withdrawal_result;
    commit;
  `));
}

function dispute(fixtureKey, action) {
  safeToken(fixtureKey, 'fixture key');
  if (!['open', 'resolve'].includes(action)) throw new Error('Dispute action must be open or resolve.');
  if (action === 'open') {
    process.stdout.write(psql(`
      begin;
      select set_config(
        'request.jwt.claim.sub',
        (select id::text from auth.users where email = ${literal(PERSONAS.customer.email)}),
        true
      );
      insert into public.disputes(booking_id, opened_by, reason, status, description)
      select b.id, b.customer_id, 'service_issue', 'submitted',
             'WPS-007 local customer dispute simulation'
      from public.bookings b
      where b.idempotency_key = ${literal(fixtureKey)}
        and not exists (
          select 1 from public.disputes d
          where d.booking_id = b.id
            and lower(d.status) not in ('resolved', 'closed', 'rejected', 'cancelled')
        );
      update public.bookings
      set status = 'disputed', updated_at = now()
      where idempotency_key = ${literal(fixtureKey)}
        and status in ('job_started', 'work_in_progress', 'completed');
      commit;
    `));
  } else {
    process.stdout.write(psql(`
      update public.disputes d
      set status = 'resolved', updated_at = now()
      from public.bookings b
      where b.id = d.booking_id
        and b.idempotency_key = ${literal(fixtureKey)}
        and lower(d.status) not in ('resolved', 'closed', 'rejected', 'cancelled');
    `));
  }
}

function financialCase(command, fixtureKey, egp, idempotencyKey, caseType = 'post_release_refund') {
  safeToken(fixtureKey, 'fixture key');
  safeToken(idempotencyKey, 'idempotency key');
  const amountMinor = minorFromEgp(egp);
  if (command === 'create') {
    if (!['post_release_refund', 'chargeback'].includes(caseType)) throw new Error('Invalid case type.');
    process.stdout.write(psql(`
      begin;
      ${staffContextSql()}
      select public.create_post_release_financial_case(
        (
          select p.id from public.financial_booking_payments p
          join public.bookings b on b.id = p.booking_id
          where b.idempotency_key = ${literal(fixtureKey)}
        ),
        ${literal(caseType)},
        ${amountMinor},
        'WPS-007 reviewed local financial case',
        ${literal(idempotencyKey)}
      ) as case_result;
      commit;
    `));
    return;
  }
  if (command !== 'decide') throw new Error('Case command must be create or decide.');
  process.stdout.write(psql(`
    begin;
    create temporary table wps007_case_target(
      id uuid primary key
    ) on commit drop;
    insert into wps007_case_target(id)
    select c.id
    from public.provider_financial_cases c
    join public.bookings b on b.id = c.booking_id
    where b.idempotency_key = ${literal(fixtureKey)}
    order by c.created_at desc
    limit 1;
    grant select on wps007_case_target to authenticated;
    ${staffContextSql()}
    select public.decide_post_release_financial_case(
      (select id from wps007_case_target),
      ${amountMinor},
      'WPS-007 reviewed provider responsibility',
      ${literal(idempotencyKey)}
    ) as decision_result;
    commit;
  `));
}

function observe(fixtureKey) {
  safeToken(fixtureKey, 'fixture key');
  process.stdout.write(psql(`
    \\pset pager off
    \\pset null '(null)'
    select b.id, b.idempotency_key, b.service_name_snapshot, b.status,
           b.final_price_egp, b.price_breakdown
    from public.bookings b
    where b.idempotency_key = ${literal(fixtureKey)};

    select p.id, p.payment_method, p.status, p.amount_minor, p.refunded_minor,
           p.gateway_fee_minor, p.currency, p.customer_reference, p.paid_at,
           s.version, s.customer_total_minor, s.provider_gross_minor,
           s.promotion_minor, s.commission_minor, s.provider_net_minor
    from public.financial_booking_payments p
    join public.bookings b on b.id = p.booking_id
    join public.booking_price_snapshots s on s.id = p.price_snapshot_id
    where b.idempotency_key = ${literal(fixtureKey)};

    select a.id, a.attempt_number, a.status, a.provider_adapter,
           a.idempotency_key, a.created_at, a.updated_at
    from private.payment_attempts a
    join public.financial_booking_payments p on p.id = a.payment_id
    join public.bookings b on b.id = p.booking_id
    where b.idempotency_key = ${literal(fixtureKey)}
    order by a.attempt_number;

    select e.id, e.status, e.gross_minor, e.commission_minor, e.net_minor,
           e.debt_offset_minor, e.held_minor, e.provider_completed_at,
           e.release_eligible_at, e.customer_confirmed_at, e.available_at
    from public.provider_earnings_ledger e
    join public.bookings b on b.id = e.booking_id
    where b.idempotency_key = ${literal(fixtureKey)};

    select r.status, r.amount_minor, r.provider_reversal_minor,
           r.commission_reversal_minor, r.promotion_reversal_minor,
           r.tax_reversal_minor, r.customer_reference, r.created_at
    from public.financial_refunds r
    join public.financial_booking_payments p on p.id = r.payment_id
    join public.bookings b on b.id = p.booking_id
    where b.idempotency_key = ${literal(fixtureKey)}
    order by r.created_at;

    select c.status, c.gross_minor, c.commission_minor, c.outstanding_minor,
           c.currency, c.created_at, c.updated_at
    from public.provider_cash_commission_records c
    join public.bookings b on b.id = c.booking_id
    where b.idempotency_key = ${literal(fixtureKey)};

    select c.status, c.case_type, c.amount_minor, c.provider_responsibility_minor,
           c.recovered_available_minor, c.provider_debt_minor,
           c.warsha_absorbed_minor, c.decided_at
    from public.provider_financial_cases c
    join public.bookings b on b.id = c.booking_id
    where b.idempotency_key = ${literal(fixtureKey)}
    order by c.created_at;

    select w.status, w.amount_minor, w.currency, w.provider_reference,
           w.destination_masked_snapshot, w.requested_at, w.completed_at
    from public.provider_withdrawal_requests w
    where w.provider_id = (
      select b.provider_id
      from public.bookings b
      where b.idempotency_key = ${literal(fixtureKey)}
    )
    order by w.requested_at desc;

    select
      private.financial_debt_balance(
        b.provider_id,
        'provider_cash_commission_debt'
      ) as cash_commission_debt_minor,
      private.financial_debt_balance(
        b.provider_id,
        'provider_recovery_debt'
      ) as recovery_debt_minor,
      private.available_earnings_balance(b.provider_id) as available_earnings_minor
    from public.bookings b
    where b.idempotency_key = ${literal(fixtureKey)};

    select t.transaction_type, t.actor_kind, t.idempotency_key, t.created_at,
           a.account_type, e.direction, e.amount_minor
    from private.financial_ledger_transactions t
    join private.financial_ledger_entries e on e.transaction_id = t.id
    join private.financial_ledger_accounts a on a.id = e.account_id
    join public.bookings b on b.id = t.booking_id
    where b.idempotency_key = ${literal(fixtureKey)}
    order by t.created_at, t.id, a.account_type;

    select n.user_id, n.type, n.title, n.body, n.dedupe_key, n.created_at
    from public.notifications n
    join public.bookings b on b.id::text = n.data ->> 'booking_id'
    where b.idempotency_key = ${literal(fixtureKey)}
    order by n.created_at;
  `));
}

function probes() {
  process.stdout.write(psql(`
    \\pset pager off
    begin;
    create temporary table wps007_probe_ids(
      persona text primary key,
      user_id uuid not null,
      provider_id uuid
    ) on commit drop;
    insert into wps007_probe_ids(persona, user_id, provider_id)
    select v.persona, u.id, p.id
    from (
      values
        ('customer', ${literal(PERSONAS.customer.email)}),
        ('provider_a', ${literal(PERSONAS.providerA.email)}),
        ('provider_b', ${literal(PERSONAS.providerB.email)})
    ) v(persona, email)
    join auth.users u on u.email = v.email
    left join public.provider_profiles p on p.user_id = u.id;
    grant select on wps007_probe_ids to authenticated;

    select set_config(
      'request.jwt.claim.sub',
      (select user_id::text from wps007_probe_ids where persona = 'customer'),
      true
    );
    set local role authenticated;
    select 'customer_provider_earnings_rows' as check_name, count(*) as visible_rows
    from public.provider_earnings_ledger;
    select 'customer_payout_destination_rows' as check_name, count(*) as visible_rows
    from public.provider_payout_destinations;

    reset role;
    select set_config(
      'request.jwt.claim.sub',
      (select user_id::text from wps007_probe_ids where persona = 'provider_a'),
      true
    );
    set local role authenticated;
    select 'provider_a_provider_b_earnings_rows' as check_name, count(*) as visible_rows
    from public.provider_earnings_ledger e
    where e.provider_id = (
      select provider_id from wps007_probe_ids where persona = 'provider_b'
    );
    select 'provider_a_provider_b_destinations_rows' as check_name, count(*) as visible_rows
    from public.provider_payout_destinations d
    where d.provider_id = (
      select provider_id from wps007_probe_ids where persona = 'provider_b'
    );

    reset role;
    select set_config(
      'request.jwt.claim.sub',
      (select user_id::text from wps007_probe_ids where persona = 'provider_b'),
      true
    );
    set local role authenticated;
    select 'provider_b_provider_a_earnings_rows' as check_name, count(*) as visible_rows
    from public.provider_earnings_ledger e
    where e.provider_id = (
      select provider_id from wps007_probe_ids where persona = 'provider_a'
    );
    rollback;

    select 'anon_payment_select' as check_name,
           has_table_privilege('anon', 'public.financial_booking_payments', 'SELECT') as allowed
    union all
    select 'anon_earning_select',
           has_table_privilege('anon', 'public.provider_earnings_ledger', 'SELECT')
    union all
    select 'anon_destination_select',
           has_table_privilege('anon', 'public.provider_payout_destinations', 'SELECT')
    union all
    select 'authenticated_private_ledger_select',
           has_table_privilege('authenticated', 'private.financial_ledger_entries', 'SELECT');

    select gateway_mode, payout_mode, automatic_release_scheduler_enabled
    from private.payment_configuration where id;
  `));
}

function help() {
  console.log(`WPS-007 local-only smoke harness

  prepare
  personas
  start-expo
  modes on|off|status
  intent <fixture-key> online|cash <idempotency-key>
  event <fixture-key> pending|success|failure [event-id]
  fee <fixture-key> <amount-egp> <event-id>
  scheduler <fixture-key>
  refund <fixture-key> <amount-egp> <idempotency-key>
  hold <fixture-key> hold|release <amount-egp> <idempotency-key>
  destination <a|b> mobile_wallet|bank_account <idempotency-key>
  request-withdrawal <a|b> <amount-egp> <idempotency-key>
  withdrawal <under_review|processing|paid|failed|cancelled> <idempotency-key> [a|b]
  dispute <fixture-key> open|resolve
  case create <fixture-key> <amount-egp> <idempotency-key> [post_release_refund|chargeback]
  case decide <fixture-key> <provider-responsibility-egp> <idempotency-key>
  observe <fixture-key>
  probes

Every command refuses a non-local Supabase API. This script never contacts a
payment or payout provider and never runs a hosted migration.`);
}

const [command = 'help', ...args] = process.argv.slice(2);
try {
  if (command === 'prepare') await prepare();
  else if (command === 'personas') printPersonas();
  else if (command === 'start-expo') startExpo();
  else if (command === 'modes') modes(args[0]);
  else if (command === 'intent') intent(args[0], args[1], args[2]);
  else if (command === 'event') event(args[0], args[1], args[2]);
  else if (command === 'fee') gatewayFee(args[0], args[1], args[2]);
  else if (command === 'scheduler') scheduler(args[0]);
  else if (command === 'refund') refund(args[0], args[1], args[2]);
  else if (command === 'hold') hold(args[0], args[1], args[2], args[3]);
  else if (command === 'destination') destination(args[0], args[1], args[2]);
  else if (command === 'request-withdrawal') requestWithdrawal(args[0], args[1], args[2]);
  else if (command === 'withdrawal') withdrawal(args[0], args[1], args[2]);
  else if (command === 'dispute') dispute(args[0], args[1]);
  else if (command === 'case') financialCase(args[0], args[1], args[2], args[3], args[4]);
  else if (command === 'observe') observe(args[0]);
  else if (command === 'probes') probes();
  else help();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
