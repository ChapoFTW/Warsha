import assert from 'node:assert/strict';

/**
 * The sealed recovery transaction, at its edges.
 *
 * `scripts/recovery-transaction.test.mjs` proves the envelope works inside the
 * real journey, but it needs a Supabase stack and a built web app, so it does
 * not run in CI. These are the properties that can be checked anywhere, and
 * they are the ones that matter if the sealing is ever changed: an envelope
 * that opens when it should not is a recovery session handed to whoever holds
 * a cookie.
 */

process.env.RECOVERY_STATE_SECRET = 'a-test-secret-of-at-least-thirty-two-characters';

const {
  clearedRecoveryCookie,
  openRecoveryState,
  readRecoveryCookie,
  recoveryCookie,
  recoveryStateAvailable,
  sealRecoveryState,
} = await import('../web/lib/recovery-state.ts');

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const TOKEN = 'v1-refresh-token-value-that-must-never-be-readable';

// --- It round-trips, and only for this server -------------------------------
const sealed = sealRecoveryState(TOKEN)!;
check(sealed, 'a refresh token seals into an envelope');
equal(openRecoveryState(sealed), TOKEN, 'AND OPENS BACK TO THE SAME TOKEN');
check(!sealed.includes(TOKEN), 'THE TOKEN IS NOT PRESENT IN THE ENVELOPE');
check(!sealed.includes(TOKEN.slice(0, 12)), 'not even a recognisable prefix of it');
equal(sealed.split('.').length, 3, 'the envelope is iv.tag.ciphertext');

// Two seals of the same token differ: the IV is random, so a cookie cannot be
// recognised as "the same recovery" by anybody watching.
check(sealRecoveryState(TOKEN) !== sealRecoveryState(TOKEN),
  'TWO SEALS OF THE SAME TOKEN ARE DIFFERENT — the IV is fresh each time');

// --- Tampering fails closed --------------------------------------------------
const [iv, tag, body] = sealed.split('.');
for (const [label, forged] of [
  ['a flipped ciphertext byte', `${iv}.${tag}.${body.slice(0, -2)}${body.endsWith('A') ? 'BB' : 'AA'}`],
  ['a swapped tag', `${iv}.${Buffer.alloc(16, 7).toString('base64url')}.${body}`],
  ['a swapped iv', `${Buffer.alloc(12, 9).toString('base64url')}.${tag}.${body}`],
  ['a truncated envelope', `${iv}.${tag}`],
  ['an empty string', ''],
  ['unrelated text', 'not-an-envelope-at-all'],
  ['a short iv', `${Buffer.alloc(4, 1).toString('base64url')}.${tag}.${body}`],
] as const) {
  equal(openRecoveryState(forged), null, `${label} opens nothing`);
}

// --- A different key opens nothing -------------------------------------------
process.env.RECOVERY_STATE_SECRET = 'a-DIFFERENT-secret-of-at-least-thirty-two-chars';
equal(openRecoveryState(sealed), null,
  'AN ENVELOPE FROM ANOTHER KEY OPENS NOTHING — a cookie is useless elsewhere');
process.env.RECOVERY_STATE_SECRET = 'a-test-secret-of-at-least-thirty-two-characters';
equal(openRecoveryState(sealed), TOKEN, 'and the right key still opens it');

// --- Expiry is sealed inside, not carried by the cookie ----------------------
const now = Date.now();
const old = sealRecoveryState(TOKEN, now - 60 * 60 * 1000)!;
equal(openRecoveryState(old, now), null, 'AN EXPIRED ENVELOPE OPENS NOTHING');
equal(openRecoveryState(sealRecoveryState(TOKEN, now)!, now + 9 * 60 * 1000), TOKEN,
  'one sealed nine minutes ago still opens');
equal(openRecoveryState(sealRecoveryState(TOKEN, now)!, now + 11 * 60 * 1000), null,
  'AND ONE SEALED ELEVEN MINUTES AGO DOES NOT — the window is inside the payload');

// --- Without a secret, nothing is sealed at all ------------------------------
// The route falls back to its single-request behaviour rather than putting a
// live refresh token in a cookie unsealed. A missing configuration must never
// become the insecure path.
delete process.env.RECOVERY_STATE_SECRET;
check(!recoveryStateAvailable(), 'WITHOUT A SECRET THE FEATURE REPORTS ITSELF UNAVAILABLE');
equal(sealRecoveryState(TOKEN), null, 'AND SEALS NOTHING — no unsealed fallback exists');
equal(openRecoveryState(sealed), null, 'and opens nothing');
process.env.RECOVERY_STATE_SECRET = 'short';
check(!recoveryStateAvailable(), 'a too-short secret is treated as no secret');
process.env.RECOVERY_STATE_SECRET = 'a-test-secret-of-at-least-thirty-two-characters';
check(recoveryStateAvailable(), 'and a real one restores it');

// --- The cookie carries the attributes that make it safe ---------------------
const cookie = recoveryCookie(sealed);
for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict']) {
  check(cookie.includes(attribute), `the cookie is ${attribute}`);
}
check(cookie.includes('Path=/api/auth/recover'),
  'AND SCOPED TO THE ONE ROUTE THAT CAN OPEN IT, so it rides on no other request');
check(/Max-Age=600\b/.test(cookie), 'and expires in ten minutes');
check(cookie.startsWith('warsha_recovery='), 'under one known name');

const cleared = clearedRecoveryCookie();
check(cleared.startsWith('warsha_recovery=;'), 'clearing sends an empty value');
check(cleared.includes('Max-Age=0'), 'AND EXPIRES IT IMMEDIATELY');
check(cleared.includes('Path=/api/auth/recover'),
  'on the same path, or the browser would keep the original');

// --- Reading it back out of a header -----------------------------------------
equal(readRecoveryCookie(`warsha_recovery=${sealed}`), sealed, 'the cookie reads back');
equal(readRecoveryCookie(`other=1; warsha_recovery=${sealed}; another=2`), sealed,
  'even among other cookies');
equal(readRecoveryCookie('other=1; another=2'), undefined, 'and is absent when it is absent');
equal(readRecoveryCookie(null), undefined, 'a missing header is not a crash');
equal(readRecoveryCookie('warsha_recovery='), undefined,
  'AND A CLEARED COOKIE READS AS NOTHING, not as an empty transaction');

console.log(`Recovery state: ${checks} checks passed.`);
