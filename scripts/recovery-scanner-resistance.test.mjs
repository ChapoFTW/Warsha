/**
 * Recovery links must survive being fetched by machines.
 *
 * ## The failure this reproduces
 *
 * The recovery email used to link to `/auth/v1/verify`, which CONSUMES the
 * single-use token on the first GET. Mail providers, security products, link
 * expanders and preview generators fetch links automatically, so the token was
 * routinely spent before the human clicked. The person then reached a password
 * form built on a credential that no longer existed, typed a new password, and
 * was told the link had expired — on a link they had just been sent. Requesting
 * another email did the same thing.
 *
 * So this file fetches the link the way those machines do, repeatedly, BEFORE
 * any human action, and then requires that the recovery still works.
 *
 * It runs against the local stack: a real GoTrue, a real Postgres, real emails
 * in Mailpit. The probe account is created and deleted here.
 *
 * Run: node scripts/recovery-scanner-resistance.test.mjs
 */

import { execFileSync } from 'node:child_process';

/*
 * Keys are read from the running stack, never written down here. The secret
 * audit refuses a Supabase secret key in tracked source, and it is right to:
 * a local default committed today is a habit that commits a real one later.
 */
function localKeys() {
  // `shell: true` on Windows: spawnSync refuses a .cmd shim with EINVAL
  // otherwise, which is a Node platform quirk rather than anything about this
  // test.
  const status = JSON.parse(execFileSync(
    'npx', ['supabase', 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' },
  ));
  return {
    api: status.API_URL,
    mail: status.MAILPIT_URL ?? status.INBUCKET_URL,
    pub: status.PUBLISHABLE_KEY,
    secret: status.SECRET_KEY,
  };
}

const local = localKeys();
const API = process.env.WARSHA_LOCAL_API ?? local.api;
const MAIL = process.env.WARSHA_LOCAL_MAIL ?? local.mail;
const PUB = process.env.WARSHA_LOCAL_PUBLISHABLE ?? local.pub;
const SECRET = process.env.WARSHA_LOCAL_SECRET ?? local.secret;

const OLD_PASSWORD = 'Sc4nner!Old99';
const NEW_PASSWORD = 'Sc4nner!New77';
const REDIRECT = 'http://127.0.0.1:3000/auth/recovery';

let checks = 0;
let failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

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

/** The exchange the SERVER performs on submit. Nothing else may do this. */
async function consumeAndSetPassword(tokenHash, password) {
  const verify = await anon('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ token_hash: tokenHash, type: 'recovery' }),
  });
  if (!verify.ok) return { ok: false, stage: 'verify', status: verify.status };
  const session = await verify.json();
  const update = await fetch(`${API}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: PUB, Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  return { ok: update.ok, stage: 'update', status: update.status, token: session.access_token };
}

const signIn = (email, password) => anon('/auth/v1/token?grant_type=password', {
  method: 'POST', body: JSON.stringify({ email, password }),
});

const email = `scanner-probe-${Date.now()}@warsha.test`;
let userId = null;

try {
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: OLD_PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  userId = created.id ?? null;
  check(Boolean(userId), 'probe account created');
  if (!userId) throw new Error('no probe account');

  await anon(`/auth/v1/recover?redirect_to=${encodeURIComponent(REDIRECT)}`, {
    method: 'POST', body: JSON.stringify({ email }),
  });
  await new Promise((r) => setTimeout(r, 1500));

  const box = await fetch(`${MAIL}/api/v1/messages?limit=40`).then((r) => r.json());
  const message = (box.messages ?? []).find((m) => (m.To ?? []).some((t) => t.Address === email));
  check(Boolean(message), 'recovery email delivered');
  if (!message) throw new Error('no email');
  const body = await fetch(`${MAIL}/api/v1/message/${message.ID}`).then((r) => r.json());
  const html = body.HTML || body.Text || '';
  const href = (html.match(/href="([^"]+)"/) ?? [])[1]?.replace(/&amp;/g, '&') ?? '';

  // The link must not be the consuming endpoint at all.
  check(!href.includes('/auth/v1/verify'),
    'THE EMAIL DOES NOT LINK TO THE CONSUMING VERIFY ENDPOINT');
  const url = new URL(href);
  const tokenHash = url.searchParams.get('token_hash');
  check(Boolean(tokenHash), 'the link carries a token hash');
  check(url.searchParams.get('type') === 'recovery', 'and declares its type');
  check(url.origin + url.pathname === REDIRECT, 'and points at the Warsha recovery route',
    url.origin + url.pathname);
  if (!tokenHash) throw new Error('no token hash');

  // ---------------------------------------------------------------------
  // The machines. Four fetches before the human does anything at all.
  // ---------------------------------------------------------------------
  const fetches = [];
  for (const label of ['mail scanner GET', 'link preview GET', 'browser GET', 'refresh GET']) {
    const r = await fetch(href, { redirect: 'manual' }).catch(() => null);
    fetches.push(`${label}:${r ? r.status : 'unreachable'}`);
  }
  console.log(`      (fetched ${fetches.length}x before submit: ${fetches.join(', ')})`);

  // The page itself is not served here, so what matters is that NONE of those
  // fetches reached a token-consuming endpoint. Proven by the recovery still
  // working below, which is the only proof that counts.
  const stillOld = await signIn(email, OLD_PASSWORD);
  check(stillOld.ok, 'THE OLD PASSWORD STILL WORKS — no fetch changed anything');

  // ---------------------------------------------------------------------
  // The human. One deliberate submit.
  // ---------------------------------------------------------------------
  const result = await consumeAndSetPassword(tokenHash, NEW_PASSWORD);
  check(result.ok, 'THE DELIBERATE SUBMIT SUCCEEDS AFTER FOUR MACHINE FETCHES',
    result.ok ? '' : `${result.stage} HTTP ${result.status}`);

  const newWorks = await signIn(email, NEW_PASSWORD);
  check(newWorks.ok, 'the new password signs in', `HTTP ${newWorks.status}`);
  const oldFails = await signIn(email, OLD_PASSWORD);
  check(!oldFails.ok, 'AND THE OLD PASSWORD NO LONGER DOES', `HTTP ${oldFails.status}`);

  // ---------------------------------------------------------------------
  // Replay. The same hash must be worthless now.
  // ---------------------------------------------------------------------
  const replay = await consumeAndSetPassword(tokenHash, 'R3play!Attempt55');
  check(!replay.ok, 'REPLAYING THE SPENT TOKEN HASH IS REFUSED',
    `${replay.stage} HTTP ${replay.status}`);
  const afterReplay = await signIn(email, 'R3play!Attempt55');
  check(!afterReplay.ok, 'and the password did not change a second time');
  const stillNew = await signIn(email, NEW_PASSWORD);
  check(stillNew.ok, 'the password chosen by the person is the one that stands');
} catch (error) {
  console.log('ERROR ' + String(error).slice(0, 200));
  failures += 1;
} finally {
  if (userId) {
    const del = await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`cleanup: probe account deleted (HTTP ${del.status})`);
  }
}

console.log(failures === 0
  ? `\nRecovery scanner resistance: ${checks} checks passed.`
  : `\n${failures} of ${checks} checks FAILED.`);
process.exit(failures === 0 ? 0 : 1);
