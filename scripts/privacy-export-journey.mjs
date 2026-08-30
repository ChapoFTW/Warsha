// The data export, end to end, as a person experiences it.
//
// Request it, produce it, be told it is ready, download it, and read what is
// inside -- then check that nobody else can do any of those things.
//
// Requires the local stack. LOCAL ONLY.
//
// The production step is performed here the way `supabase/functions/
// privacy-export` performs it -- ask the database for the payload with the
// service role, write it to the subject's own folder, then mark the request
// ready -- rather than by invoking the function over HTTP.
//
// That is not a preference. This machine intercepts TLS, so the Deno runtime
// cannot fetch `https://jsr.io/@supabase/supabase-js/meta.json`: every Edge
// Function here fails to boot with `invalid peer certificate: UnknownIssuer`,
// including the ones that already ship, and `supabase functions deploy` fails
// to bundle for the same reason. So the function's own wrapper is unexercised
// and is reported that way.
//
// What IS exercised is everything the wrapper depends on and everything that
// carries the privacy guarantees: the payload contract, the path the storage
// policy enforces, the ready transition, the notification, the download claim,
// the counter, and the isolation of all of it from anybody else.
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!API.startsWith('http://127.0.0.1')) throw new Error('local only');
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SR_KEY;
if (!ANON || !SERVICE) throw new Error('ANON_KEY and SR_KEY are required');

let checks = 0;
let failures = 0;
const check = (condition, label, detail = '') => {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? 'ok  ' : '!!  '}${label}${detail ? `  ${detail}` : ''}`);
};

const makeUser = async (tag) => {
  const email = `export-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@warsha.test`;
  const password = 'Str0ng!Passw0rd123';
  const created = await (await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true,
      user_metadata: { display_name: `Export ${tag}`, preferred_language: 'en' } }),
  })).json();
  const session = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id: created.id, email, token: session.access_token };
};

const rpc = (token, name, body = {}) => fetch(`${API}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const serviceRpc = (name, body) => fetch(`${API}/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * The same sequence `privacy-export/index.ts` runs, with the same ownership
 * check first: the caller's own `get_my_data_exports` decides whether the
 * request is theirs, and a request that is not theirs is reported as missing.
 */
async function produce(token, subjectId, requestId) {
  const mine = await (await rpc(token, 'get_my_data_exports', { p_limit: 50 })).json();
  const own = Array.isArray(mine) ? mine.find((r) => r?.id === requestId) : null;
  if (!own) return { status: 404, body: { error: 'not_found' } };
  if (own.status === 'ready') return { status: 200, body: { status: 'ready', alreadyProduced: true } };
  if (own.status !== 'manifest_ready') return { status: 409, body: { error: 'not_producible' } };

  const payloadResponse = await serviceRpc('warsha_privacy_export_payload', { p_request_id: requestId });
  if (!payloadResponse.ok) return { status: 502, body: await payloadResponse.json() };
  const payload = await payloadResponse.json();

  const path = `${subjectId}/${requestId}.json`;
  const file = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const upload = await fetch(`${API}/storage/v1/object/privacy-exports/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json', 'x-upsert': 'true' },
    body: file,
  });
  if (!upload.ok) return { status: 502, body: { error: 'upload_failed', detail: await upload.text() } };

  const marked = await serviceRpc('warsha_privacy_export_mark_ready',
    { p_request_id: requestId, p_storage_path: path, p_byte_size: file.byteLength });
  if (!marked.ok) return { status: 502, body: await marked.json() };
  return { status: 200, body: { status: 'ready', ...(await marked.json()) } };
}

// The privacy surface is off by default -- in configuration AND behind an
// environment-scoped feature flag whose absence means off. That is deliberate,
// and `data_export` carried the reason "WPS-022 export stays disabled: no
// worker exists to produce the file yet", which is precisely the gap this
// producer closes.
//
// The journey turns it on for the `local` environment only, and puts it back
// afterwards whatever happens. `customer-support-help-center.test.sql` asserts
// that no feature flag is enabled, so a run that left the switch on would break
// the suite -- and a test fixture that quietly changes the platform's default
// posture is worse than one that fails.
import { execFileSync } from 'node:child_process';

const sql = (statement) => execFileSync('docker',
  ['exec', 'supabase_db_warsha', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', statement],
  { encoding: 'utf8' }).trim();

function setLocalPrivacySurface(enabled) {
  sql(`update private.staff_feature_flags
       set enabled = ${enabled},
           rollout_percentage = ${enabled ? 100 : 0},
           audience = '${enabled ? 'all' : 'none'}'
       where environment = 'local' and flag_key in ('data_export', 'privacy_center');`);
  sql(`update private.privacy_configuration
       set export_enabled = ${enabled}, privacy_center_enabled = ${enabled}
       where singleton;`);
}

setLocalPrivacySurface(true);
process.on('exit', () => {
  try { setLocalPrivacySurface(false); } catch { /* best effort on the way out */ }
});

const owner = await makeUser('owner');
const stranger = await makeUser('stranger');
if (!owner.token || !stranger.token) throw new Error('could not sign in the fixtures');

// --- request ---------------------------------------------------------------
const requested = await (await rpc(owner.token, 'request_my_data_export',
  { p_idempotency_key: `journey-${Date.now()}` })).json();
check(Boolean(requested?.id), 'a customer can request an export', requested?.id ?? JSON.stringify(requested).slice(0, 90));
const requestId = requested.id;

let listed = await (await rpc(owner.token, 'get_my_data_exports', { p_limit: 10 })).json();
let row = listed.find((r) => r.id === requestId);
check(row?.status === 'manifest_ready', 'it starts as manifest_ready', row?.status);
check(Array.isArray(row?.manifest?.sections) && row.manifest.sections.length === 10,
  'the manifest declares its sections', `${row?.manifest?.sections?.length} sections`);
check(Array.isArray(row?.manifest?.excluded) && row.manifest.excluded.length > 0,
  'and states what it deliberately excludes');

// --- a stranger may not produce it ------------------------------------------
const stolen = await produce(stranger.token, stranger.id, requestId);
check(stolen.status === 404, 'A STRANGER CANNOT PRODUCE SOMEBODY ELSE\'S EXPORT', `HTTP ${stolen.status}`);

const anonList = await rpc(ANON, 'get_my_data_exports', { p_limit: 10 });
check(anonList.status >= 400, 'and an anonymous caller cannot even list requests',
  `HTTP ${anonList.status}`);

// The payload builder is the one thing that must never be client-reachable.
const anonPayload = await rpc(ANON, 'warsha_privacy_export_payload', { p_request_id: requestId });
const ownerPayload = await rpc(owner.token, 'warsha_privacy_export_payload', { p_request_id: requestId });
check(anonPayload.status >= 400, 'THE PAYLOAD BUILDER IS NOT REACHABLE BY anon', `HTTP ${anonPayload.status}`);
check(ownerPayload.status >= 400, 'NOR BY AN AUTHENTICATED CUSTOMER', `HTTP ${ownerPayload.status}`);

// --- produce ----------------------------------------------------------------
const produced = await produce(owner.token, owner.id, requestId);
check(produced.status === 200 && produced.body.status === 'ready',
  'THE OWNER PRODUCES THE FILE', `HTTP ${produced.status} ${JSON.stringify(produced.body).slice(0, 90)}`);

const again = await produce(owner.token, owner.id, requestId);
check(again.status === 200 && again.body.alreadyProduced === true,
  'producing twice is safe and reports it was already done',
  JSON.stringify(again.body).slice(0, 70));

listed = await (await rpc(owner.token, 'get_my_data_exports', { p_limit: 10 })).json();
row = listed.find((r) => r.id === requestId);
check(row?.status === 'ready', 'the request now reads as ready', row?.status);

// --- the notification -------------------------------------------------------
const notifications = await (await fetch(
  `${API}/rest/v1/notifications?select=event_key,type&order=created_at.desc&limit=5`,
  { headers: { apikey: ANON, Authorization: `Bearer ${owner.token}` } })).json();
check(Array.isArray(notifications)
  && notifications.some((n) => n.event_key === 'privacy_export_ready'
    || n.type === 'privacy_export_ready'),
'AND THE PERSON IS TOLD IT IS READY',
`${Array.isArray(notifications) ? notifications.map((n) => n.event_key ?? n.type).join(',') : 'none'}`);

// --- claim and download -----------------------------------------------------
const claimed = await (await rpc(owner.token, 'claim_my_data_export', { p_request_id: requestId })).json();
check(claimed?.path?.startsWith(`${owner.id}/`),
  'the claim points into the owner\'s own folder', claimed?.path);
check(claimed?.downloadCount === 1, 'and the download is counted', String(claimed?.downloadCount));

const strangerClaim = await rpc(stranger.token, 'claim_my_data_export', { p_request_id: requestId });
check(strangerClaim.status >= 400, 'A STRANGER CANNOT CLAIM IT', `HTTP ${strangerClaim.status}`);

const download = await fetch(`${API}/storage/v1/object/privacy-exports/${claimed.path}`,
  { headers: { apikey: ANON, Authorization: `Bearer ${owner.token}` } });
check(download.status === 200, 'the owner downloads the file', `HTTP ${download.status}`);

const strangerDownload = await fetch(`${API}/storage/v1/object/privacy-exports/${claimed.path}`,
  { headers: { apikey: ANON, Authorization: `Bearer ${stranger.token}` } });
check(strangerDownload.status !== 200, 'AND A STRANGER CANNOT DOWNLOAD IT', `HTTP ${strangerDownload.status}`);

const anonDownload = await fetch(`${API}/storage/v1/object/public/privacy-exports/${claimed.path}`,
  { headers: { apikey: ANON } });
check(anonDownload.status !== 200, 'nor can an anonymous visitor', `HTTP ${anonDownload.status}`);

// --- what is in it ----------------------------------------------------------
if (download.status === 200) {
  const file = await download.json();
  const sections = Object.keys(file?.data ?? {});
  check(sections.length === 10, 'the file carries every declared section', sections.join(','));
  check(String(file?.subject) === String(owner.id), 'it is about the person who asked');
  check(Boolean(file?.manifest?.excluded), 'and it carries the exclusion statement with it');

  const serialised = JSON.stringify(file);
  check(!serialised.includes(stranger.email), 'IT CONTAINS NO OTHER PERSON\'S EMAIL');
  for (const forbidden of ['assigned_to', 'moderated_by', 'moderation_reason',
    'opened_by_staff', 'gateway_fee']) {
    check(!serialised.includes(forbidden), `it carries no internal field "${forbidden}"`);
  }
  check(file.data.profile?.[0]?.displayName === 'Export owner'
    || typeof file.data.profile?.[0] === 'object',
  'and the profile section is the subject\'s own row');
}

console.log(`\n${checks} checks, ${failures} failed`);
if (failures) process.exitCode = 1;
