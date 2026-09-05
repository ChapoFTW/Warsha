/**
 * How much brute force does Warsha's sign-in actually absorb?
 *
 * ## Why a probe and not a test
 *
 * Two sign-in surfaces exist and they are protected by different things:
 *
 *   worker sign-in     the `worker-auth` Edge Function, which calls
 *                      `private.enforce_rate_limit('worker_auth_sign_in')`
 *                      before it touches GoTrue. That limit is Warsha's own,
 *                      lives in `private.rate_limit_policies`, and is real.
 *
 *   customer sign-in   GoTrue's `/auth/v1/token` directly. Warsha's limiter
 *                      cannot reach it: it runs before any SQL. What protects
 *                      it is whatever the platform applies, and
 *                      `supabase/config.toml` records that `sign_in_sign_ups`
 *                      could not be declared through the CLI at 2.116.0.
 *
 * Nothing in the repository measured either. This does, against Development,
 * with synthetic accounts and a bounded number of attempts.
 *
 * ## What it will not do
 *
 * It never targets a real account, never tries a password that might work on
 * one, and never runs more attempts than are needed to see a threshold. Attempt
 * counts are constants at the top of the file so the blast radius is readable
 * before the file is run.
 *
 *     node --experimental-strip-types scripts/dev-auth-bruteforce-probe.mjs
 *
 * Each run creates two permanent synthetic worker accounts on Development.
 */
import { readFileSync } from 'node:fs';
import { signupLegalManifest } from '../src/legal/signup-legal.ts';

const FAILURES_BEFORE_CORRECT = 5;   // must stay under the worker limit
const FAILURES_TO_FIND_LIMIT = 15;   // enough to cross a limit of 10
const GOTRUE_ATTEMPTS = 40;          // enough to cross a per-5-minute limit of 30

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/lrhipbcapzfxuwixfoog/.test(URL_BASE)) {
  throw new Error(`Refusing a project other than warsha-development: ${URL_BASE}`);
}

const PASSWORD = 'Synthetic!Probe#2026';
const WRONG = 'DefinitelyNotThePassword#1';

function line(label, outcome) { console.log(`  ${label.padEnd(46)} ${outcome}`); }
function section(title) { console.log(`\n== ${title}`); }

async function workerAuth(body) {
  const started = Date.now();
  const res = await fetch(`${URL_BASE}/functions/v1/worker-auth`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, code: parsed.code, body: parsed, ms: Date.now() - started };
}

async function register(name) {
  const phone = `+2010${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
  const res = await workerAuth({
    action: 'register', fullName: name, phone, password: PASSWORD, language: 'en',
    legalAcceptances: signupLegalManifest('worker', 'en'),
  });
  return { phone, ok: res.status === 200, status: res.status };
}

const signIn = (phone, password) => workerAuth({ action: 'sign_in', phone, password });

console.log(`Bounded sign-in probe against ${URL_BASE}`);

// ---------------------------------------------------------------------------
section('1. A correct password still works after a few failures');
const a = await register('Probe BruteForce A');
line('registered account A', a.ok ? 'yes' : `no (HTTP ${a.status})`);
if (!a.ok) process.exit(1);

const beforeCodes = [];
for (let i = 1; i <= FAILURES_BEFORE_CORRECT; i += 1) {
  const res = await signIn(a.phone, WRONG);
  beforeCodes.push(`${res.status}/${res.code}`);
}
line(`${FAILURES_BEFORE_CORRECT} wrong passwords`, [...new Set(beforeCodes)].join(', '));

const recovered = await signIn(a.phone, PASSWORD);
line('then the correct password', `HTTP ${recovered.status} ${recovered.code ?? 'session issued'}`);
line('LEGITIMATE SIGN-IN STILL WORKS', recovered.status === 200 ? 'YES' : 'NO');

// ---------------------------------------------------------------------------
section('2. Where the worker limit engages');
const b = await register('Probe BruteForce B');
line('registered account B', b.ok ? 'yes' : `no (HTTP ${b.status})`);

let throttledAt = null;
const codes = [];
for (let i = 1; i <= FAILURES_TO_FIND_LIMIT; i += 1) {
  const res = await signIn(b.phone, WRONG);
  codes.push(`${res.status}/${res.code}`);
  if (res.status === 429 || res.code === 'rate_limited') { throttledAt = i; break; }
}
line('attempts made', String(codes.length));
line('distinct responses', [...new Set(codes)].join(', '));
line('THROTTLE ENGAGED AT ATTEMPT', throttledAt === null ? `NOT WITHIN ${FAILURES_TO_FIND_LIMIT}` : String(throttledAt));

if (throttledAt !== null) {
  const blocked = await signIn(b.phone, PASSWORD);
  line('correct password while throttled', `HTTP ${blocked.status} ${blocked.code ?? 'session issued'}`);
  line('note', 'a throttle that holds is expected; it is time-bounded, not a lockout');
}

// ---------------------------------------------------------------------------
section('3. Anti-enumeration');
const unknownPhone = `+2010${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
const c = await register('Probe BruteForce C');
const known = await signIn(c.phone, WRONG);
const unknown = await signIn(unknownPhone, WRONG);
line('known phone, wrong password', `HTTP ${known.status} ${known.code}`);
line('unknown phone, wrong password', `HTTP ${unknown.status} ${unknown.code}`);
line('RESPONSES INDISTINGUISHABLE', known.status === unknown.status && known.code === unknown.code ? 'YES' : 'NO');
line('timing (known / unknown)', `${known.ms}ms / ${unknown.ms}ms`);

// ---------------------------------------------------------------------------
section('4. The GoTrue password endpoint, which Warsha cannot limit');
let gotrueLimited = null;
const gotrueCodes = new Set();
for (let i = 1; i <= GOTRUE_ATTEMPTS; i += 1) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `probe-${i}@example.com`, password: WRONG }),
  });
  gotrueCodes.add(res.status);
  if (res.status === 429) { gotrueLimited = i; break; }
}
line(`${GOTRUE_ATTEMPTS} failed password attempts`, `statuses ${[...gotrueCodes].join(', ')}`);
line('PLATFORM 429 SEEN AT ATTEMPT', gotrueLimited === null ? `NOT WITHIN ${GOTRUE_ATTEMPTS}` : String(gotrueLimited));

console.log('\nSynthetic accounts created:', [a.phone, b.phone, c.phone].join(', '));
