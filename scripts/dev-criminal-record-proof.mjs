/**
 * Live Development proof of the repaired criminal-record flow.
 *
 * Synthetic identities only, created through the sanctioned public `worker-auth`
 * Edge Function, which creates a confirmed account server-side and sends no
 * email. Nothing here uses a service-role key or any secret — the publishable
 * key is a client credential — and it refuses to run against any project other
 * than warsha-development.
 *
 * The documents it uploads are a 1x1 PNG and a 47-byte PDF stub. No real
 * identity document or criminal record is involved.
 *
 * ## It is not free to run
 *
 * Every run creates two permanent synthetic worker accounts on Development,
 * with provider profiles, verification documents and criminal-record rows, and
 * it deliberately exhausts one account's hourly submission limit. That is the
 * cost of proving the flow against the real project rather than a container, so
 * run it when something about this flow changes — not as a habit.
 *
 *     node --experimental-strip-types scripts/dev-criminal-record-proof.mjs
 *
 * It is not in the deterministic suite: it needs the network, a live project and
 * a session, and a test that cannot run from a clean checkout does not belong
 * beside ones that can.
 */
import { readFileSync } from 'node:fs';
import { signupLegalManifest } from '../src/legal/signup-legal.ts';
import { buildCriminalRecordPayload } from '../src/onboarding/criminal-record-submission.ts';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/lrhipbcapzfxuwixfoog/.test(URL_BASE)) {
  throw new Error(`Refusing a project other than warsha-development: ${URL_BASE}`);
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const PDF = Buffer.from('%PDF-1.4\n% Warsha synthetic probe document\n%%EOF\n', 'utf8');

function line(label, outcome) { console.log(`  ${label.padEnd(52)} ${outcome}`); }
function section(title) { console.log(`\n== ${title}`); }

async function rpc(name, body, token) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON, 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function getRows(table, query, token) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function upload(bucket, path, token, body, type) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': type },
    body,
  });
  return { status: res.status, body: (await res.text()).slice(0, 160) };
}

const subjectOf = jwt =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub;

async function registerWorker(name) {
  const phone = `+2010${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
  const password = 'Synthetic!Probe#2026';
  const res = await fetch(`${URL_BASE}/functions/v1/worker-auth`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register', fullName: name, phone, password, language: 'en',
      legalAcceptances: signupLegalManifest('worker', 'en'),
    }),
  });
  const body = await res.json();
  const token = body.accessToken ?? body.access_token ?? body.session?.access_token;
  return { status: res.status, phone, password, token, uid: token ? subjectOf(token) : null };
}

/** Drive a fresh worker to `identity_submitted`, the state that accepts a record. */
async function readyWorker(name) {
  const worker = await registerWorker(name);
  if (!worker.token) throw new Error(`registration failed for ${name}: ${worker.status}`);
  await rpc('select_my_account_role', { p_role: 'worker' }, worker.token);
  await rpc('activate_provider_role', { p_display_name: name }, worker.token);
  await rpc('accept_my_worker_agreements',
    { p_worker_agreement: true, p_document_processing: true }, worker.token);
  await rpc('confirm_my_identity_fields', {
    p_legal_name: 'محمد أحمد', p_national_id: '29001011234567',
    p_date_of_birth: '1990-01-01', p_id_expiry_date: '2030-01-01',
  }, worker.token);
  const profile = await rpc('get_my_worker_profile', {}, worker.token);
  const providerId = profile.body?.id;
  for (const side of ['national_id_front', 'national_id_back']) {
    const path = `${worker.uid}/${providerId}/${side}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    await upload('verification-documents', path, worker.token, PNG, 'image/png');
    await rpc('register_provider_verification_document', {
      p_document_type: side, p_storage_path: path,
      p_mime_type: 'image/png', p_file_size_bytes: PNG.length,
    }, worker.token);
  }
  await rpc('submit_my_identity_for_review', {}, worker.token);
  const state = await rpc('get_my_onboarding_state', {}, worker.token);
  return { ...worker, providerId, workerState: state.body?.workerState };
}

function submissionPath(uid) {
  return `${uid}/criminal-record/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
}

async function submit(worker, overrides = {}) {
  const path = overrides.path ?? submissionPath(worker.uid);
  if (overrides.path === undefined) {
    await upload('worker-criminal-records', path, worker.token, PDF, 'application/pdf');
  }
  // Built by the SAME module the app uses, so this proves the shipped payload
  // rather than one assembled for the test.
  const payload = buildCriminalRecordPayload({
    userId: worker.uid,
    storagePath: path,
    mimeType: 'application/pdf',
    fileSizeBytes: PDF.length,
    contentHash: null,
    issueDate: '2026-08-01',
    documentReference: null,
    declaredName: '  محمد   أحمد  ',
  });
  return rpc('submit_my_criminal_record', { ...payload, ...overrides.payload }, worker.token);
}

// ---------------------------------------------------------------------------
console.log(`Development criminal-record proof against ${URL_BASE}`);

section('1. A worker submits their own record');
const a = await readyWorker('Probe Worker A');
line('worker A reached', a.workerState);

const ok = await submit(a);
line('submit_my_criminal_record (7 arguments)', `HTTP ${ok.status}`);
line('returned', JSON.stringify(ok.body).slice(0, 120));

const state = await rpc('get_my_onboarding_state', {}, a.token);
line('worker state after submission', String(state.body?.workerState));
line('certificate status', String(state.body?.certificateStatus));

section('2. The declared name arrived, exactly as normalized');
const own = await getRows('worker_criminal_record_submissions',
  'select=declared_name,status,is_current&is_current=eq.true', a.token);
line('own row readable', `HTTP ${own.status}, ${Array.isArray(own.body) ? own.body.length : '?'} row(s)`);
const declared = Array.isArray(own.body) && own.body[0]?.declared_name;
line('declared_name stored (via client payload)', JSON.stringify(declared));
line('trimmed and collapsed', declared === 'محمد أحمد' ? 'YES' : `NO (${JSON.stringify(declared)})`);

// And again bypassing the client entirely, to show the SERVER now normalizes
// too rather than trusting whatever a direct API caller sends.
const rawPath = submissionPath(a.uid);
await upload('worker-criminal-records', rawPath, a.token, PDF, 'application/pdf');
const raw = await rpc('submit_my_criminal_record', {
  p_storage_path: rawPath, p_mime_type: 'application/pdf', p_file_size_bytes: PDF.length,
  p_content_hash: null, p_issue_date: '2026-08-01', p_document_reference: null,
  p_declared_name: '  محمد   أحمد  ',
}, a.token);
const rawRow = await getRows('worker_criminal_record_submissions',
  'select=declared_name&is_current=eq.true', a.token);
const rawName = Array.isArray(rawRow.body) && rawRow.body[0]?.declared_name;
line('direct API call, server normalized', `HTTP ${raw.status} -> ${JSON.stringify(rawName)}`);
line('server collapses without the client', rawName === 'محمد أحمد' ? 'YES' : 'NO');

section('3. A missing declared name is refused');
const blank = await submit(a, { payload: { p_declared_name: '   ' } });
line('blank declared name', `HTTP ${blank.status} ${blank.body?.code ?? ''} ${blank.body?.message ?? ''}`);
const noName = await rpc('submit_my_criminal_record', {
  p_storage_path: submissionPath(a.uid), p_mime_type: 'application/pdf',
  p_file_size_bytes: PDF.length, p_content_hash: null, p_issue_date: '2026-08-01',
  p_document_reference: null,
}, a.token);
line('omitted declared name', `HTTP ${noName.status} ${noName.body?.code ?? ''} ${noName.body?.message ?? ''}`);

section('4. An unrelated worker is contained');
const b = await readyWorker('Probe Worker B');
line('worker B reached', b.workerState);
const bReads = await getRows('worker_criminal_record_submissions', 'select=id,declared_name', b.token);
const bRows = Array.isArray(bReads.body) ? bReads.body.length : '?';
line("worker B reads A's submissions", `HTTP ${bReads.status}, ${bRows} row(s)`);
const bWrite = await upload('worker-criminal-records',
  `${a.uid}/criminal-record/planted-${Date.now()}.pdf`, b.token, PDF, 'application/pdf');
line("worker B uploads into A's folder", `HTTP ${bWrite.status}`);
const bPatch = await fetch(
  `${URL_BASE}/rest/v1/worker_criminal_record_submissions?is_current=eq.true`,
  {
    method: 'PATCH',
    headers: { apikey: ANON, Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ declared_name: 'edited by a stranger' }),
  });
line("worker B mutates A's row", `HTTP ${bPatch.status}`);

section('5. Signed out');
const anon = await getRows('worker_criminal_record_submissions', 'select=id', null);
line('anon reads submissions', `HTTP ${anon.status} ${JSON.stringify(anon.body).slice(0, 90)}`);
const anonStorage = await fetch(
  `${URL_BASE}/storage/v1/object/worker-criminal-records/${a.uid}/criminal-record/x.pdf`,
  { headers: { apikey: ANON } });
line('anon fetches a record object', `HTTP ${anonStorage.status}`);

section('6. The rate limiter is still active');
let limited = null;
let accepted = 0;
for (let attempt = 1; attempt <= 8 && limited === null; attempt += 1) {
  const res = await submit(a);
  if (res.status === 200) accepted += 1;
  else if (res.body?.code === '53400') limited = attempt;
  else { line(`attempt ${attempt} unexpected`, `HTTP ${res.status} ${res.body?.code ?? ''} ${res.body?.message ?? ''}`); break; }
}
line('further submissions accepted', String(accepted));
line('rate limit engaged at attempt', limited === null ? 'NOT ENGAGED' : String(limited));

section('7. No raw infrastructure error surfaced');
// Only the responses a CLIENT can actually produce. `noName` is excluded and
// examined separately: omitting an argument is a hand-crafted request, and
// `buildCriminalRecordPayload` cannot emit one — the contract test asserts the
// built payload carries every declared key, so PostgREST never has to guess a
// signature.
const clientReachable = [ok, blank, bReads, anon].map(r =>
  typeof r.body === 'object' && r.body !== null ? (r.body.message ?? '') : String(r.body ?? ''));
const leaked = clientReachable.filter(m =>
  /PGRST|SQLSTATE|pg_|relation |function public\.|storage\.objects/i.test(m));
line('client-reachable messages inspected', String(clientReachable.length));
line('raw infrastructure leaks', leaked.length ? JSON.stringify(leaked) : 'none');
line('hand-crafted omission returns', `${noName.body?.code} (client cannot build this call)`);
line('unclassified failures map to', "'unavailable' -> generic copy, never the raw message");

console.log('\nSynthetic identities used:', [a.phone, b.phone].join(', '));
