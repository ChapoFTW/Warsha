/**
 * The server recovery transaction, exercised end to end against a real stack.
 *
 * ## Why this exists
 *
 * `scripts/recovery-scanner-resistance.test.mjs` proves that opening a link
 * consumes nothing. It never presses the button. So when the deliberate submit
 * began failing in Production, every gate was green: the scanner test only
 * covered the GET half, and the unit assertions read source rather than running
 * it.
 *
 * The failure it missed: a recovery session is `aal1`, and an account holding a
 * verified TOTP factor cannot change its password on one. The provider answers
 * `insufficient_aal` / HTTP 401, "AAL2 session is required to update email or
 * password when MFA is enabled." That refusal is correct — otherwise reading
 * somebody's mailbox would be enough to defeat their authenticator — and the
 * route now completes the challenge in the same request instead of collapsing
 * it into "something went wrong on our side".
 *
 * This runs the REAL route handler, in a real Next server, against the local
 * Supabase stack, for both account shapes.
 *
 * ## Running it
 *
 *   npx supabase start
 *   npm run build --prefix web      (once, or after changing the route)
 *   npm run test:recovery-transaction
 *
 * Not part of `test:all`: CI has no Supabase stack. It is a release gate, run
 * with the scanner test.
 */
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';

const WEB = 'http://127.0.0.1:3100';
const APP_HOST = 'app.localhost:3100';

let checks = 0;
let failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
};

// --- The local stack ---------------------------------------------------------
const shell = process.platform === 'win32';
// stderr ignored on purpose: the CLI prints "Stopped services: [...]" there,
// and `shell: true` is needed on Windows or spawnSync refuses the .cmd shim.
const status = JSON.parse(execFileSync(
  'npx', ['supabase', 'status', '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell },
));
const API = status.API_URL;
const PUB = status.PUBLISHABLE_KEY;
const SECRET = status.SECRET_KEY;

const admin = (path, init = {}) => fetch(API + path, {
  ...init,
  headers: {
    apikey: SECRET, Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json', ...(init.headers ?? {}),
  },
});
const anon = (path, init = {}) => fetch(API + path, {
  ...init,
  headers: { apikey: PUB, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});
const signIn = (email, password) => anon('/auth/v1/token?grant_type=password', {
  method: 'POST', body: JSON.stringify({ email, password }),
});

/** POST the recovery route exactly as the browser does. */
const submit = (body) => fetch(`${WEB}/api/auth/recover`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', host: APP_HOST },
  body: JSON.stringify(body),
});

// --- TOTP, so a probe can hold a genuinely verified factor -------------------
const base32 = (secret) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const totp = (secret) => {
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = crypto.createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24 | digest[offset + 1] << 16
    | digest[offset + 2] << 8 | digest[offset + 3]) % 1_000_000;
  return String(value).padStart(6, '0');
};

async function makeAccount(label, { withMfa }) {
  const email = `recovery-transaction-${label}-${Date.now()}@warsha.test`;
  const password = 'Txn0!Old-7731';
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((response) => response.json());
  let secret = null;
  if (withMfa) {
    const session = await signIn(email, password).then((response) => response.json());
    const authed = (path, init = {}) => fetch(API + path, {
      ...init,
      headers: {
        apikey: PUB, Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json', ...(init.headers ?? {}),
      },
    });
    const factorResponse = await authed('/auth/v1/factors', {
      method: 'POST',
      body: JSON.stringify({ friendly_name: label, factor_type: 'totp', issuer: 'Warsha' }),
    });
    const factor = await factorResponse.json();
    secret = factor.totp?.secret ?? null;
    if (!secret) {
      console.log(`  enrolment failed: HTTP ${factorResponse.status} `
        + `${JSON.stringify(factor).slice(0, 200)}`);
      return { id: created.id, email, password, secret: null };
    }
    const challenge = await authed(`/auth/v1/factors/${factor.id}/challenge`, { method: 'POST' })
      .then((response) => response.json());
    await authed(`/auth/v1/factors/${factor.id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ challenge_id: challenge.id, code: totp(secret) }),
    });
  }
  return { id: created.id, email, password, secret };
}

const freshHash = async (email) => {
  const link = await admin('/auth/v1/admin/generate_link', {
    method: 'POST', body: JSON.stringify({ type: 'recovery', email }),
  }).then((response) => response.json());
  return link.hashed_token ?? link.properties?.hashed_token;
};

// --- The server under test ---------------------------------------------------
//
// Built here, deliberately. Next inlines `NEXT_PUBLIC_*` at BUILD time, in
// server code as well as client bundles, so passing the local URL to
// `next start` changes nothing: the route keeps whatever project it was
// compiled against. The first run of this test looked like a broken token and
// was actually a local token being offered to the Production project.
//
// Rebuilding locally is harmless to a release: `vercel deploy` uploads source
// and builds remotely, so this `.next` never reaches Production.
const webDirectory = new URL('../web/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const localEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: API,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB,
};
console.log('building the web app against the local stack...');
execFileSync('npx', ['next', 'build'], {
  cwd: webDirectory, shell, env: localEnvironment, stdio: ['ignore', 'ignore', 'inherit'],
});

/*
 * Refuse to run if anything already holds the port.
 *
 * This cost an hour. A server left over from an earlier run kept answering on
 * 3100 — spawned through a shell, so `kill()` had killed the shell and not
 * `next start` — and because that leftover had been built against a DIFFERENT
 * project, every local token it was offered came back `expired_or_used`. The
 * test reported a broken recovery transaction and the transaction was fine.
 *
 * A gate that can silently be answered by the wrong server is worse than no
 * gate, so this one stops rather than guesses.
 */
const portIsFree = await fetch(`${WEB}/api/auth/recover`, { method: 'GET' })
  .then(() => false).catch(() => true);
if (!portIsFree) {
  console.error('FAIL  something is already listening on 3100. Stop it and re-run:');
  console.error('      npx kill-port 3100   (or close the earlier test run)');
  process.exit(1);
}

const server = spawn('npx', ['next', 'start', '-p', '3100'], {
  cwd: webDirectory, shell, env: localEnvironment,
});
const serverLog = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

const waitForServer = async () => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const probe = await fetch(`${WEB}/api/auth/recover`, { method: 'GET' });
      if (probe.status === 405) return true;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

const created = [];
try {
  check(await waitForServer(), 'the built web server is answering');

  // =========================================================================
  // 1. An ordinary account: the whole transaction, in one deliberate POST
  // =========================================================================
  const plain = await makeAccount('plain', { withMfa: false });
  created.push(plain.id);
  const NEW_PASSWORD = 'Txn0!New-9942';

  const hash = await freshHash(plain.email);
  check(Boolean(hash), 'a recovery token hash is issued');

  const before = await submit({ tokenHash: hash, password: 'short' });
  check(before.status === 400 && (await before.json()).failure === 'weak_password',
    'A WEAK PASSWORD IS REFUSED SERVER-SIDE');
  check((await signIn(plain.email, plain.password)).ok,
    'and that refusal did not spend the token');

  const wrongType = await submit({ tokenHash: hash, password: NEW_PASSWORD, type: 'signup' });
  check(wrongType.status === 400 && (await wrongType.json()).failure === 'invalid',
    'AN UNSUPPORTED CALLBACK TYPE IS REFUSED');
  check((await signIn(plain.email, plain.password)).ok, 'and that did not spend it either');

  const done = await submit({ tokenHash: hash, password: NEW_PASSWORD });
  const doneBody = await done.text();
  check(done.status === 200 && doneBody === '{"ok":true}',
    'THE DELIBERATE SUBMIT COMPLETES THE WHOLE TRANSACTION', `HTTP ${done.status} ${doneBody}`);
  check(!done.headers.get('set-cookie'),
    'AND SETS NO COOKIE, so no session follows the request home');
  check((done.headers.get('cache-control') ?? '').includes('no-store'),
    'and the answer is never stored');

  check((await signIn(plain.email, NEW_PASSWORD)).ok, 'the new password signs in');
  check(!(await signIn(plain.email, plain.password)).ok, 'AND THE OLD PASSWORD NO LONGER DOES');

  const replay = await submit({ tokenHash: hash, password: 'Txn0!Replay-55' });
  check(replay.status === 400 && (await replay.json()).failure === 'expired_or_used',
    'REPLAYING THE SPENT HASH IS REFUSED');
  check(!(await signIn(plain.email, 'Txn0!Replay-55')).ok,
    'and the password did not change a second time');

  // The recovery authority must never be usable as a customer API credential.
  const hostile = await fetch(`${API}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: PUB, Authorization: `Bearer ${hash}` },
  });
  check(hostile.status === 401,
    'THE TOKEN HASH READS NO CUSTOMER DATA', `HTTP ${hostile.status}`);

  // =========================================================================
  // 2. An account with an authenticator: the regression this test exists for
  // =========================================================================
  const guarded = await makeAccount('mfa', { withMfa: true });
  created.push(guarded.id);
  check(Boolean(guarded.secret), 'a probe with a verified TOTP factor exists');
  // Without a factor there is nothing to regress against, and continuing would
  // report a series of failures that all mean "the stack has MFA switched off".
  if (!guarded.secret) throw new Error('TOTP enrolment is disabled on this stack');

  const mfaHash = await freshHash(guarded.email);
  const withoutCode = await submit({ tokenHash: mfaHash, password: NEW_PASSWORD });
  const withoutBody = await withoutCode.json();
  check(withoutCode.status === 400 && withoutBody.failure === 'mfa_required',
    'AN MFA ACCOUNT IS TOLD A CODE IS NEEDED, NOT THAT WARSHA BROKE',
    JSON.stringify(withoutBody));
  check((await signIn(guarded.email, guarded.password)).ok,
    'AND THE PASSWORD WAS NOT CHANGED without the second factor');

  const badCodeHash = await freshHash(guarded.email);
  const badCode = await submit({ tokenHash: badCodeHash, password: NEW_PASSWORD, code: '000000' });
  const badBody = await badCode.json();
  check(badCode.status === 400 && badBody.failure === 'mfa_invalid',
    'A WRONG CODE IS AN ORDINARY REFUSAL', JSON.stringify(badBody));
  check((await signIn(guarded.email, guarded.password)).ok,
    'and still no password change');

  const malformed = await submit({ tokenHash: mfaHash, password: NEW_PASSWORD, code: 'abc' });
  check(malformed.status === 400 && (await malformed.json()).failure === 'mfa_invalid',
    'a malformed code never reaches the provider');

  const goodHash = await freshHash(guarded.email);
  const accepted = await submit({
    tokenHash: goodHash, password: NEW_PASSWORD, code: totp(guarded.secret),
  });
  const acceptedBody = await accepted.text();
  check(accepted.status === 200 && acceptedBody === '{"ok":true}',
    'WITH THE CURRENT CODE THE PASSWORD CHANGES', `HTTP ${accepted.status} ${acceptedBody}`);
  check((await signIn(guarded.email, NEW_PASSWORD)).ok,
    'the new password signs in on the MFA account too');
  check(!(await signIn(guarded.email, guarded.password)).ok, 'and the old one does not');

  // =========================================================================
  // 3. The diagnostics must name the step and carry nothing else
  // =========================================================================
  const logs = serverLog.join('\n');
  const emitted = [...logs.matchAll(/\{"operation":"password-recovery"[^\n]*\}/g)].map(([l]) => l);
  check(emitted.length > 0, `the route reports its steps (${emitted.length} lines)`);
  check(emitted.some((line) => line.includes('"failure_class":"mfa_required"')),
    'INCLUDING THE STEP THAT FAILED IN PRODUCTION');
  for (const line of emitted) {
    const parsed = JSON.parse(line);
    const keys = Object.keys(parsed).sort().join(',');
    check(keys === 'failure_class,http_status,operation,provider_code,step'
      || keys === 'failure_class,operation,step'
      || keys === 'failure_class,operation,provider_code,step'
      || keys === 'failure_class,http_status,operation,step',
      `a diagnostic carries only named fields: ${keys}`);
  }
  const secrets = [hash, mfaHash, goodHash, NEW_PASSWORD, plain.password, guarded.secret]
    .filter(Boolean).filter((value) => logs.includes(value));
  check(secrets.length === 0,
    'AND THE LOGS CONTAIN NO HASH, NO PASSWORD AND NO TOTP SECRET');
} catch (error) {
  console.log('ERROR ' + String(error).slice(0, 300));
  failures += 1;
} finally {
  for (const id of created.filter(Boolean)) {
    await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
  // `shell: true` means `server.pid` is the shell, not `next start`. Killing the
  // shell alone leaves the server listening, which is precisely how a stale
  // process came to answer for this test once already.
  if (server.pid) {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        server.kill('SIGKILL');
      }
    } catch { /* already gone */ }
  }
}

console.log(failures === 0
  ? `\nRecovery transaction: ${checks} checks passed.`
  : `\n${failures} of ${checks} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
