// Two copies of one password policy, held to the same answer.
//
// ## Why there are two
//
// `src/auth/password-policy.ts` is the authority: every client reads it, and the
// sign-up screen renders its five requirements as a live checklist. The
// `worker-auth` Edge Function runs in Deno from `supabase/functions/`, does not
// share the app's module graph, and no function in this repository imports from
// `src/` — so `supabase/functions/_shared/worker-auth-password.ts` restates it.
//
// A restated rule drifts. This file is what stops that: both implementations are
// run over the same corpus and must agree on every input.
//
// ## What the drift already cost
//
// `worker-auth` accepted any password of six characters or more, and creates the
// account with `admin.createUser`, which bypasses GoTrue's own
// `password_min_length`. So on that path neither the platform setting nor the
// app's checklist enforced anything. Measured against hosted Development: the
// app refuses `abc123`, and worker registration accepted it and returned a
// session for a real account.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordMeetsPolicy }
  from '../src/auth/password-policy.ts';
import {
  WORKER_PASSWORD_MAX_BYTES, WORKER_PASSWORD_MIN_LENGTH, workerPasswordMeetsPolicy,
} from '../supabase/functions/_shared/worker-auth-password.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

// ---------------------------------------------------------------------------
// 1. The constants agree
// ---------------------------------------------------------------------------

check(WORKER_PASSWORD_MIN_LENGTH === PASSWORD_MIN_LENGTH,
  `the Edge Function minimum (${WORKER_PASSWORD_MIN_LENGTH}) equals the client's (${PASSWORD_MIN_LENGTH})`);
check(WORKER_PASSWORD_MAX_BYTES === PASSWORD_MAX_BYTES,
  'and so does the bcrypt byte ceiling');

// ---------------------------------------------------------------------------
// 2. They agree on every password in the corpus
// ---------------------------------------------------------------------------
// Chosen to cross every boundary in the rule rather than to look varied: one
// character either side of the minimum, each character class missing in turn,
// and the byte ceiling, which is a BYTE count and so behaves differently for
// Arabic than for Latin.

const CORPUS = [
  '',
  'abc123',                       // the password Development actually accepted
  'Abc12!',                       // 6, every class, still too short
  'Abc123!',                      // 7, one under
  'Abc1234!',                     // 8, satisfies everything
  'abcd1234!',                    // no uppercase
  'ABCD1234!',                    // no lowercase
  'Abcdefg!',                     // no digit
  'Abcd1234',                     // no symbol
  'Passw0rd!',
  'محمد1234!A',                   // Arabic with every class present
  'مُحَمَّدٌ!1A',                       // Arabic diacritics, multi-byte
  'Chloé123!',                    // French diacritic
  'Aa1' + 'é'.repeat(40),    // multi-byte run near the ceiling
  `Aa1!${'x'.repeat(68)}`,        // exactly 72 bytes
  `Aa1!${'x'.repeat(69)}`,        // 73 bytes, over the ceiling
  `Aa1!${'م'.repeat(40)}`,   // 2-byte characters, well over the ceiling
  ' Aa1234! ',                    // padded — neither implementation trims
  'Aa1 234!',                // non-breaking space counts as a symbol
];

for (const password of CORPUS) {
  const client = passwordMeetsPolicy(password);
  const edge = workerPasswordMeetsPolicy(password);
  const shown = JSON.stringify(password.length > 24 ? `${password.slice(0, 21)}…` : password);
  check(client === edge,
    `BOTH IMPLEMENTATIONS AGREE ON ${shown} (client ${client}, edge ${edge})`);
}

// The specific one that was accepted in production-shaped conditions.
check(!passwordMeetsPolicy('abc123') && !workerPasswordMeetsPolicy('abc123'),
  'AND NEITHER ACCEPTS abc123, WHICH WORKER REGISTRATION ONCE DID');

// ---------------------------------------------------------------------------
// 3. The Edge Function applies it where a password is chosen, and only there
// ---------------------------------------------------------------------------
// Sign-in must keep accepting whatever an existing worker already set.
// Enforcing a new policy there would lock out the accounts it exists to
// protect, which is a worse outcome than the weak password it would refuse.

const fn = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');
const registerAt = fn.indexOf("body.action === 'register'");
const signInAt = fn.indexOf("body.action === 'sign_in'");
const policyAt = fn.indexOf('workerPasswordMeetsPolicy(password)');

check(registerAt > 0 && signInAt > registerAt, 'the register branch precedes the sign-in branch');
check(policyAt > registerAt && policyAt < signInAt,
  'THE POLICY IS APPLIED INSIDE THE REGISTER BRANCH');
check(fn.slice(signInAt).indexOf('workerPasswordMeetsPolicy') === -1,
  'AND NOT ON SIGN-IN — AN EXISTING WORKER IS NOT LOCKED OUT BY A NEW RULE');

// The loose bound both actions share is still there: sign-in needs some ceiling.
check(/password\.length < 6 \|\| password\.length > 128/.test(fn),
  'the shared length bound remains for both actions');

console.log(`Worker-auth password contract: ${checks} checks passed.`);
