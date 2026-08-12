import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readAuthCallbackParameters } from '../src/auth/email-confirmation.ts';

/**
 * Password recovery, end to end.
 *
 * A valid reset link rendered as "invalid, expired, or already used" on a real
 * device. Email delivery worked, the deep link opened the app, and the screen
 * still refused — so the defect was after the handoff.
 *
 * The cause was a race in `src/auth/auth-context.tsx`, not the URL. Startup
 * hydration reads `getSession()` (null, because somebody resetting a password
 * is signed out), then awaits `getUser()` over the network. While it awaited,
 * the recovery link arrived, established a session and set the status to
 * `ready`. Hydration then finished and wrote its captured `null` over the top.
 *
 * `app/reset-password.tsx` renders the invalid card when
 * `recoveryStatus !== 'ready' || !auth.session`. After the race it saw exactly
 * `ready` **and** no session — the one combination that looks like a consumed
 * token and is not.
 *
 * These checks cover the URL shapes Warsha actually receives and the ordering
 * rule that keeps the race closed.
 */

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const read = (path: string) => readFileSync(path, 'utf8');
const authContext = read('src/auth/auth-context.tsx');
const resetScreen = read('app/reset-password.tsx');

// ---------------------------------------------------------------------------
// The URL shapes Warsha actually receives
// ---------------------------------------------------------------------------
//
// supabase-js defaults to `flowType: 'implicit'` and the client sets no
// override, so `/auth/v1/verify` redirects with tokens in the **fragment**.
// A `?code=` only appears under PKCE. Both are parsed, because the default is a
// library default and could move under us.

const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.aaa.bbb';
const REFRESH = 'v1beta-refresh-token';

// 1. Implicit recovery on a standalone build — the real production shape.
const implicit = readAuthCallbackParameters(
  `warsha://reset-password#access_token=${ACCESS}&expires_in=3600`
  + `&refresh_token=${REFRESH}&token_type=bearer&type=recovery`,
);
equal(implicit.kind, 'recovery', 'THE IMPLICIT FRAGMENT URL IS RECOGNISED AS RECOVERY');
equal(implicit.accessToken, ACCESS, 'and its access token is read out of the fragment');
equal(implicit.refreshToken, REFRESH, 'and its refresh token too');
equal(implicit.error, undefined, 'with no error');

// 2. PKCE recovery, should the library default ever change.
const pkce = readAuthCallbackParameters('warsha://reset-password?code=abc123def456');
equal(pkce.kind, 'recovery', 'a PKCE code URL is recognised as recovery');
equal(pkce.code, 'abc123def456', 'and the code is read from the query string');

// 3. Expo dev-client shape, which carries the /--/ separator.
const devUrl = readAuthCallbackParameters(
  `exp://192.168.1.5:8081/--/reset-password#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`,
);
equal(devUrl.kind, 'recovery', 'the Expo dev-client URL is recognised as recovery');
equal(devUrl.accessToken, ACCESS, 'and its tokens survive the /--/ path');

// 4. A genuinely consumed or expired token. This is what a real failure looks
//    like, and it must stay distinguishable from the race above.
const expired = readAuthCallbackParameters(
  'warsha://reset-password#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired',
);
equal(expired.kind, 'recovery', 'an error callback is still a recovery callback');
check(expired.error, 'A GENUINELY EXPIRED LINK REPORTS AN ERROR');
equal(expired.accessToken, undefined, 'and carries no tokens');

// 5. Query-form error, which Supabase uses for some failures.
const queryError = readAuthCallbackParameters(
  'warsha://reset-password?error=access_denied&error_code=otp_expired',
);
check(queryError.error, 'an error in the query string is read too');

// 6. Bare deep link with nothing attached. `path.includes('reset-password')`
//    makes this recovery, so it must be treated as invalid rather than as a
//    session — this is the shape a stripped fragment would produce.
const bare = readAuthCallbackParameters('warsha://reset-password');
equal(bare.kind, 'recovery', 'a bare reset-password link is recovery by path');
equal(bare.accessToken, undefined, 'with no tokens');
equal(bare.code, undefined, 'and no code');

// 7. Signup confirmation must not be misread as recovery.
const signup = readAuthCallbackParameters(
  `warsha://auth/confirm#access_token=${ACCESS}&refresh_token=${REFRESH}&type=signup`,
);
equal(signup.kind, 'signup', 'A CONFIRMATION LINK IS NOT TREATED AS A PASSWORD RESET');

// Fragment must win over a same-named query parameter: Supabase puts the real
// token in the fragment, and a stale query value must not shadow it.
const both = readAuthCallbackParameters(
  `warsha://reset-password?access_token=stale#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`,
);
equal(both.accessToken, ACCESS, 'the fragment value wins over a query value of the same name');

// ---------------------------------------------------------------------------
// The race that made a valid link look expired
// ---------------------------------------------------------------------------

check(/if \(active && !callbackHandled\.current\) setSession\(verifiedSession\)/.test(authContext),
  'STARTUP HYDRATION DOES NOT OVERWRITE A SESSION A CALLBACK ALREADY ESTABLISHED');
check(/if \(active && !callbackHandled\.current\) setSession\(null\)/.test(authContext),
  'and a hydration failure does not clear one either');
check(/if \(!callbackHandled\.current\) \{\s*\n\s*await client\.auth\.signOut\(\{ scope: 'local' \}\)/.test(authContext),
  'NOR DOES HYDRATION SIGN OUT LOCALLY AND DELETE THE RECOVERY SESSION');

// The screen's refusal condition is the other half of the bug: `ready` with no
// session rendered as invalid. Both halves are asserted so neither drifts.
check(/recoveryStatus !== 'ready' \|\| !auth\.session/.test(resetScreen),
  'the reset screen still requires both a ready status and a session');
check(/recoveryStatus === 'checking' \|\| auth\.recoveryStatus === 'processing'/.test(resetScreen),
  'and shows a loader while the callback is still resolving, never the invalid card');

// The callback marks ownership before it awaits anything, so hydration
// finishing mid-flight cannot win.
const handler = authContext.slice(authContext.indexOf('const handleAuthUrl'));
const guardAt = handler.indexOf('callbackHandled.current = true');
const awaitAt = handler.indexOf('await client.auth');
check(guardAt >= 0 && awaitAt > guardAt,
  'THE CALLBACK CLAIMS OWNERSHIP BEFORE ITS FIRST AWAIT, NOT AFTER');

// ---------------------------------------------------------------------------
// What must not regress while fixing this
// ---------------------------------------------------------------------------

check(/detectSessionInUrl:false|detectSessionInUrl: false/.test(read('src/lib/supabase.ts')),
  'the client still handles auth URLs itself rather than sniffing them');
check(/persistSession:true|persistSession: true/.test(read('src/lib/supabase.ts')),
  'and still persists sessions');
check(/resetPasswordForEmail\(email, \{ redirectTo \}\)/.test(authContext),
  'the reset request still targets the app deep link');
check(/Linking\.createURL\('reset-password'\)/.test(authContext),
  'built from the Expo linking helper, so it matches the scheme the build uses');

// Anti-enumeration: requesting a reset must not reveal whether the address
// exists. The call is fire-and-forget apart from transport errors.
const requestBlock = authContext.slice(
  authContext.indexOf('requestPasswordReset:'),
  authContext.indexOf('finishPasswordRecovery:'),
);
check(!/user.*not.*found|no.*such.*account|USER_NOT_FOUND/i.test(requestBlock),
  'REQUESTING A RESET REVEALS NOTHING ABOUT WHETHER THE ADDRESS EXISTS');

// Finishing recovery must end the elevated session everywhere, not just here.
check(/finishPasswordRecovery[\s\S]{0,400}signOut\(\{ scope: 'global' \}\)/.test(authContext),
  'FINISHING A RESET SIGNS OUT GLOBALLY, SO THE RECOVERY SESSION CANNOT LINGER');

// Worker phone auth and ordinary email sign-in are untouched by this change.
check(/verifyOtp\(\{ phone: normalized/.test(authContext),
  'worker phone verification is unchanged');

console.log(`Password recovery: ${checks} checks passed.`);
