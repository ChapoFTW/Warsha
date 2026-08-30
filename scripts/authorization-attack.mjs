// Can one person reach another person's things?
//
// pgTAP asserts policies as the database sees them. This asks the question the
// way an attacker does: over HTTP, with a real session, against real rows
// belonging to somebody else. Every check here is a thing that must FAIL.
//
// LOCAL ONLY. It creates accounts and data.
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!API.startsWith('http://127.0.0.1')) throw new Error('local only');
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SR_KEY;
if (!ANON || !SERVICE) throw new Error('ANON_KEY and SR_KEY are required');

let checks = 0;
let failures = 0;
const denied = (status) => status === 401 || status === 403 || status === 404 || status === 406;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : '!!  '}${label}${detail ? `  ${detail}` : ''}`);
};

const makeUser = async (tag) => {
  const email = `attack-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@warsha.test`;
  const password = 'Str0ng!Passw0rd123';
  const created = await (await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true,
      user_metadata: { display_name: `Attack ${tag}`, preferred_language: 'en' } }),
  })).json();
  const session = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id: created.id, email, token: session.access_token };
};

const as = (token, path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  },
});

const rpc = (token, name, body = {}) => as(token, `rpc/${name}`, {
  method: 'POST', body: JSON.stringify(body),
});

const alice = await makeUser('alice');
const bob = await makeUser('bob');
if (!alice.token || !bob.token) throw new Error('could not sign in the fixtures');
console.log(`alice ${alice.id}\nbob   ${bob.id}\n`);

// ---------------------------------------------------------------------------
// 1. Alice creates something worth stealing
// ---------------------------------------------------------------------------
const addressResponse = await as(alice.token, 'addresses', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({
    customer_id: alice.id, label: 'Home', address_line: '12 Secret Street',
    governorate: 'Cairo', district: 'Maadi',
  }),
});
const addressRows = addressResponse.ok ? await addressResponse.json() : [];
const aliceAddress = Array.isArray(addressRows) ? addressRows[0] : null;
check(Boolean(aliceAddress?.id), 'alice can create her own address',
  aliceAddress?.id ?? `HTTP ${addressResponse.status}`);

// ---------------------------------------------------------------------------
// 2. Direct object reference: Bob asks for Alice's row by id
// ---------------------------------------------------------------------------
if (aliceAddress?.id) {
  const stolen = await as(bob.token, `addresses?id=eq.${aliceAddress.id}&select=*`);
  const rows = stolen.ok ? await stolen.json() : [];
  check(stolen.status !== 200 || rows.length === 0,
    'BOB CANNOT READ ALICE\'S ADDRESS BY ID',
    `HTTP ${stolen.status}, ${Array.isArray(rows) ? rows.length : '?'} rows`);

  const edited = await as(bob.token, `addresses?id=eq.${aliceAddress.id}`, {
    method: 'PATCH', body: JSON.stringify({ address_line: 'OWNED' }),
  });
  const editedRows = edited.ok ? await edited.text() : '';
  check(denied(edited.status) || editedRows === '' || editedRows === '[]',
    'BOB CANNOT EDIT ALICE\'S ADDRESS', `HTTP ${edited.status}`);

  const removed = await as(bob.token, `addresses?id=eq.${aliceAddress.id}`, { method: 'DELETE' });
  check(denied(removed.status) || (await removed.text()) === '' || removed.status === 204,
    'and a delete does not remove it', `HTTP ${removed.status}`);

  const stillThere = await as(alice.token, `addresses?id=eq.${aliceAddress.id}&select=id`);
  const aliceRows = stillThere.ok ? await stillThere.json() : [];
  check(Array.isArray(aliceRows) && aliceRows.length === 1,
    'ALICE\'S ADDRESS SURVIVED BOB\'S DELETE', `${aliceRows.length} rows`);
}

// ---------------------------------------------------------------------------
// 3. Enumeration: can Bob list tables that hold other people's rows?
// ---------------------------------------------------------------------------
for (const table of ['addresses', 'bookings', 'notifications', 'messages',
  'support_tickets', 'reviews', 'privacy_export_requests', 'privacy_consent_records',
  'provider_withdrawal_requests', 'provider_payout_destinations']) {
  const listed = await as(bob.token, `${table}?select=*&limit=50`);
  const rows = listed.ok ? await listed.json() : [];
  const foreign = Array.isArray(rows)
    ? rows.filter((r) => {
      const owner = r.customer_id ?? r.user_id ?? r.requester_id ?? r.sender_id ?? r.uploader_id;
      return owner && owner !== bob.id;
    }) : [];
  check(foreign.length === 0, `${table}: no row belonging to anybody else`,
    `HTTP ${listed.status}, ${Array.isArray(rows) ? rows.length : 0} rows, ${foreign.length} foreign`);
}

// ---------------------------------------------------------------------------
// 4. Role escalation: a customer reaching for staff authority
// ---------------------------------------------------------------------------
const staffFunctions = ['staff_request_export', 'staff_export_preview',
  'staff_retention_dry_run', 'staff_business_export_preview', 'staff_privacy_requests'];
for (const fn of staffFunctions) {
  const attempt = await rpc(bob.token, fn, {});
  check(attempt.status !== 200, `a customer cannot call ${fn}`, `HTTP ${attempt.status}`);
}

// A customer must not be able to make themselves staff.
for (const table of ['user_roles', 'admin_role_assignments', 'admin_roles', 'admin_permissions']) {
  const write = await as(bob.token, table, {
    method: 'POST', body: JSON.stringify({ user_id: bob.id, role: 'admin' }),
  });
  check(write.status !== 200 && write.status !== 201,
    `NO SELF-PROMOTION THROUGH ${table}`, `HTTP ${write.status}`);
}

// ---------------------------------------------------------------------------
// 5. Money: the withdrawal path, from a customer with no provider profile
// ---------------------------------------------------------------------------
const withdrawal = await rpc(bob.token, 'request_provider_withdrawal', {
  p_amount_minor: 100000,
  p_payout_destination_id: '00000000-0000-4000-8000-000000000000',
  p_idempotency_key: 'attack-withdrawal-0001',
});
const withdrawalBody = await withdrawal.text();
check(withdrawal.status !== 200,
  'A CUSTOMER CANNOT REQUEST A PROVIDER WITHDRAWAL',
  `HTTP ${withdrawal.status} ${withdrawalBody.slice(0, 90)}`);

// The financial ledger must not be readable or writable by a client at all.
for (const table of ['financial_accounts', 'financial_entries', 'financial_booking_payments',
  'provider_earnings', 'payments', 'refunds']) {
  const read = await as(bob.token, `${table}?select=*&limit=5`);
  const rows = read.ok ? await read.json() : [];
  const foreign = Array.isArray(rows)
    ? rows.filter((r) => (r.customer_id ?? r.provider_id ?? r.user_id) !== bob.id) : [];
  check(foreign.length === 0, `${table}: no foreign financial row is visible`,
    `HTTP ${read.status}, ${foreign.length} foreign`);
}

// ---------------------------------------------------------------------------
// 6. Anonymous, with only the publishable key
// ---------------------------------------------------------------------------
// `profiles` is included deliberately. It held a public-provider read policy
// and a column grant on every column, so any anonymous caller could read a
// published professional's phone number. 202608310001 removed both.
for (const table of ['profiles', 'addresses', 'bookings', 'notifications',
  'privacy_export_requests', 'provider_withdrawal_requests']) {
  const read = await as(ANON, `${table}?select=*&limit=5`);
  const rows = read.ok ? await read.json() : [];
  check(!Array.isArray(rows) || rows.length === 0,
    `anon reads no rows from ${table}`, `HTTP ${read.status}, ${Array.isArray(rows) ? rows.length : 0} rows`);
}

// ---------------------------------------------------------------------------
// 7. Signing out ends the session
// ---------------------------------------------------------------------------
// An access token is a signed statement, not a database lookup, so it stays
// valid until it expires and no logout can recall it. That is a property of
// the scheme rather than a defect, and the control that matters is the one
// that decides whether the session can CONTINUE: the refresh token. If that is
// revoked, a stolen access token is worth at most the remainder of one hour.
const session = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: bob.email, password: 'Str0ng!Passw0rd123' }),
})).json();

const claims = JSON.parse(
  Buffer.from(session.access_token.split('.')[1], 'base64').toString());
const lifetime = claims.exp - claims.iat;
check(lifetime <= 3600, 'AN ACCESS TOKEN LIVES AT MOST AN HOUR', `${lifetime}s`);

await fetch(`${API}/auth/v1/logout`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` },
});

const refreshed = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ refresh_token: session.refresh_token }),
});
check(refreshed.status >= 400,
  'AND THE SESSION CANNOT BE CONTINUED AFTER SIGNING OUT',
  `refresh -> HTTP ${refreshed.status}`);

console.log(`\n${checks} authorization checks, ${failures} failed`);
if (failures) process.exitCode = 1;
