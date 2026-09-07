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
check(/outcome\.status !== 'ready' \|\| !auth\.session/.test(resetScreen),
  'the reset screen still requires both a ready status and a session');
check(/outcome\.status === 'checking' \|\| outcome\.status === 'processing'/.test(resetScreen),
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

// ---------------------------------------------------------------------------
// The same journey in a browser
// ---------------------------------------------------------------------------
//
// Web recovery is a second implementation of the same product rule, and the
// value of these checks is that it is not allowed to become a second *model*.
// The parser, the policy and the finishing behaviour are the mobile ones; only
// the delivery differs, because a browser has no deep link.

const callback = read('web/lib/auth-callback.ts');
const webActions = read('web/lib/auth-actions.ts');
const webReset = read('web/app/app/reset-password/page.tsx');
const webForgot = read('web/app/app/forgot-password/page.tsx');
const webConfirm = read('web/app/app/auth/confirm/page.tsx');
const gate = read('web/components/startup-gate.tsx');
const policy = read('src/auth/password-policy.ts');
const appCopySource = read('web/lib/app-copy.ts');

/** Present in BOTH language blocks, not only English. */
function webCopyHas(key: string): boolean {
  return appCopySource.split(`${key}:`).length === 3;
}

/**
 * Comments removed before a leak check.
 *
 * These rules are about what a function *returns*. A comment explaining why it
 * must not reveal whether an address exists is not itself a reveal — the first
 * version of these checks failed on its own guard-rail prose, which is a false
 * positive worth designing out rather than wording around.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// The gate exemption is the whole reason web recovery works. A recovery link
// establishes a session, so without it the account resolves and the visitor is
// routed to their home page — the browser shape of the mobile race above.
check(/CALLBACK_APP_ROUTES/.test(gate),
  'THE STARTUP GATE KNOWS ABOUT CALLBACK ROUTES');
check(/CALLBACK_APP_ROUTES\s*=\s*\[[^\]]*'\/reset-password'/.test(gate),
  'AND /reset-password IS ONE, SO A RECOVERY SESSION CANNOT REDIRECT THE FORM AWAY');
check(/CALLBACK_APP_ROUTES\s*=\s*\[[^\]]*'\/auth\/confirm'/.test(gate),
  'as is /auth/confirm, so a confirmed account is told so rather than routed off');
check(gate.indexOf('isCallbackAppRoute(path)') < gate.indexOf("resolution.status === 'loading'"),
  'and the exemption is tested BEFORE the resolution, including while it is loading');

// The URL has to be read before supabase-js consumes it and calls replaceState.
check(/typeof window === 'undefined' \? null : window\.location\.href/.test(callback),
  'THE CALLBACK URL IS SNAPSHOTTED AT MODULE SCOPE, BEFORE ANY EFFECT RUNS');
check(/readAuthCallbackParameters/.test(callback),
  'and parsed with the mobile parser rather than a second one');
check(!/console\.(log|info|warn|error)/.test(callback),
  'and nothing about the link is logged');
check(!/localStorage|sessionStorage|document\.cookie/.test(callback),
  'and the snapshot is never written to storage');

// Arriving without a callback is not a grant. This is the mobile screen's
// `recoveryStatus !== 'ready'` rule, expressed in what a browser can observe.
check(/arrived\.kind !== 'recovery' \|\| arrived\.failure/.test(webReset),
  'A VISITOR WHO SIMPLY TYPES /reset-password SEES THE INVALID CARD, NOT THE FORM');
// Readiness used to be decided by awaiting `getSession()`, because URL exchange
// happened during client initialisation. It no longer does: the page exchanges
// the credential itself, onto a client that persists nothing, and readiness is
// the result of THAT. The change is the P0 fix, so the assertion moves with it.
check(/setSession\(\{/.test(webReset),
  'readiness is decided by an explicit exchange the page performs itself');
check(/access_token: credential\.accessToken/.test(webReset),
  'using the credential the link carried, handed over deliberately');

// One password policy, read by both surfaces.
check(/PASSWORD_MIN_LENGTH = 8/.test(policy),
  'THERE IS ONE PASSWORD POLICY MODULE');
check(/from '@\/src\/auth\/password-policy'/.test(resetScreen),
  'the mobile reset screen reads it');
check(/password-policy/.test(webReset),
  'and so does the web reset form');
check(/password-policy/.test(webActions),
  'and the web action that performs the update');
check(!/\/\[A-Z\]\/\.test\(password\)/.test(resetScreen),
  'so the mobile screen no longer carries its own copy of the rules');
// The fifth rule joined on 2026-09-05. It is listed here for the same reason as
// the other four: adding a rule to the policy and forgetting to translate it
// leaves an Arabic reader looking at an English checklist item.
for (const rule of ['passwordLengthRequirement', 'passwordUppercaseRequirement',
  'passwordLowercaseRequirement', 'passwordNumberRequirement',
  'passwordSpecialRequirement']) {
  check(policy.includes(rule), `the policy still states ${rule}`);
  check(webCopyHas(rule), `and the web says it in both languages: ${rule}`);
}

// --- The new password is typed twice ---------------------------------------
// Step 9 of the flow: a password chosen once and mistyped is a password nobody
// can use, and the account is now locked behind it. Both platforms require the
// confirmation to match BEFORE the update is attempted, so the failure is a
// sentence rather than a lockout.

check(/passwordsMatch/.test(resetScreen) && /passwordMismatch/.test(resetScreen),
  'the mobile reset screen requires the confirmation to match');
check(/disabled=\{busy \|\| !passwordValid \|\| !passwordsMatch\}/.test(resetScreen),
  'AND WILL NOT SUBMIT UNTIL IT DOES');
check(/confirmation/.test(webReset) && /passwordMismatch|match/i.test(webReset),
  'and so does the web one');

// --- Repeated requests are coalesced ---------------------------------------
// Somebody who presses Send twice should send one email, not two. This is a
// courtesy on top of GoTrue's own rate limiting, not a replacement for it --
// the server limit is the control, and it is a dashboard setting rather than
// anything this repository can assert.
check(/runAuthSingleFlight/.test(read('src/auth/auth-request-guard.ts')),
  'simultaneous auth requests are coalesced into one');

// Anti-enumeration, again, in the browser.
const webRequest = stripComments(webActions.slice(
  webActions.indexOf('export async function requestPasswordReset'),
  webActions.indexOf('export async function updatePassword'),
));
check(!/user.*not.*found|no.*such.*account|USER_NOT_FOUND|does not exist/i.test(webRequest),
  'THE WEB RESET REQUEST REVEALS NOTHING ABOUT WHETHER THE ADDRESS EXISTS');
check(/failure: 'server'/.test(webRequest),
  'and collapses every non-transport refusal into one indistinguishable answer');
check(webCopyHas('forgotSentBody'),
  'and the screen it shows is worded to be true either way, in both languages');
check(/If that address has a Warsha account/.test(appCopySource),
  'saying "if that address has an account" rather than confirming that it does');

// Finishing must revoke everything, exactly as the app does.
check(/finishPasswordRecovery[\s\S]{0,400}signOut\(\{ scope: 'global' \}\)/.test(webActions),
  'FINISHING A WEB RESET SIGNS OUT GLOBALLY TOO');
check(/finishPasswordRecovery\(recoveryClient\)/.test(webReset),
  'and the page calls it on the CONTAINED client before reporting success');

// The redirect target is this origin's own route. Web recovery must not borrow
// the native deep link, and must not require native configuration to change.
check(/redirectTo: `\$\{window\.location\.origin\}\/reset-password`/.test(webActions),
  'THE WEB ASKS FOR A LINK BACK TO ITS OWN ORIGIN, NOT THE APP SCHEME');
check(!/warsha:\/\//.test(stripComments(webActions)),
  'and never builds the native scheme');

// The route the signup email already named must exist.
check(/emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/confirm`/.test(webActions),
  'signup still sends people to /auth/confirm');
check(webConfirm.length > 0, 'AND THAT ROUTE NOW EXISTS');
check(/arrivedBy/.test(webConfirm), 'and it reads the same callback snapshot');

// Forgot-password must be reachable while signed out, or it is decoration.
check(/PUBLIC_APP_ROUTES\s*=\s*\[[^\]]*'\/forgot-password'/.test(gate),
  'FORGOT-PASSWORD IS REACHABLE WHILE SIGNED OUT');
check(/href="\/forgot-password"/.test(read('web/app/app/sign-in/page.tsx')),
  'and sign-in links to it, which is the only way anybody finds it');
check(/forgotWorkerNote/.test(webForgot),
  'and a worker is told plainly that a phone account has no address to email');

// ===========================================================================
// RECOVERY-SESSION CONTAINMENT  (P0, 2026-09-07)
// ===========================================================================
//
// Reported and reproduced: clicking a recovery link put the visitor inside the
// normal Warsha web app without a new password ever being set.
//
// Root cause, confirmed against a live stack. `detectSessionInUrl: true`
// consumed the link's credential during initialisation of the SHARED,
// PERSISTED client, so a full application session was written to the origin's
// storage before the password form was even submitted. Routing could not
// contain that: `/reset-password` was exempted from `StartupGate`, which made
// that route tolerate the session while every OTHER route treated it as an
// ordinary signed-in visitor.
//
// Measured with the real token, aal1 / amr=otp / role=authenticated:
//   own profile     HTTP 200     bookings       HTTP 200
//   addresses       HTTP 200     notifications  HTTP 200
//   staff RPC write HTTP 403     provider activate HTTP 403
//
// So the staff gates held — AAL2, recent-auth and capability all refused — and
// the customer surface did not. That is the defect.

const browserClient = read('web/lib/supabase-browser.ts');
const sharedClient = read('web/lib/supabase.ts');
const resetPage = read('web/app/app/reset-password/page.tsx');
const confirmPage = read('web/app/app/auth/confirm/page.tsx');
const callbackLib = read('web/lib/auth-callback.ts');
const actions = read('web/lib/auth-actions.ts');

// --- The credential is no longer consumed into the shared session -----------
check(/detectSessionInUrl:\s*false/.test(browserClient),
  'THE SHARED CLIENT NO LONGER CONSUMES CREDENTIALS FROM THE ADDRESS BAR');
check(!/detectSessionInUrl:\s*true/.test(browserClient),
  'and there is no remaining client that does');

// --- A recovery client that cannot become a session -------------------------
check(/export function createRecoveryClient/.test(browserClient),
  'a recovery-only client exists');
const recoveryBlock = browserClient.slice(browserClient.indexOf('export function createRecoveryClient'));
check(/persistSession:\s*false/.test(recoveryBlock),
  'IT PERSISTS NOTHING — there is no storage entry to survive the page');
check(/autoRefreshToken:\s*false/.test(recoveryBlock),
  'and does not refresh, so the grant stays as short-lived as it was issued');
check(/detectSessionInUrl:\s*false/.test(recoveryBlock),
  'and does not read the address bar either');
check(/export function recoverySupabase/.test(sharedClient),
  'and it is exposed separately from the shared client');
check(!/let recoveryClient|recoveryClient =\s*createRecoveryClient/.test(sharedClient),
  'DELIBERATELY NOT MEMOISED — a cached recovery client is a second app session');

// --- The reset page uses it, and never the shared one -----------------------
check(/recoverySupabase\(\)/.test(resetPage),
  'the reset page exchanges onto the contained client');
check(!/\bsupabase\(\)/.test(resetPage),
  'AND NEVER TOUCHES THE SHARED CLIENT, so no persisted session can be created');
check(/callbackCredential\(\)/.test(resetPage),
  'it reads the credential explicitly rather than relying on initialisation');
check(/updatePassword\(password, recoveryClient\)/.test(resetPage),
  'the password is set on the contained client');
check(/finishPasswordRecovery\(recoveryClient\)/.test(resetPage),
  'and the contained client is what gets signed out');

// --- Confirmation still signs you in, because it is meant to ----------------
check(/callbackCredential\(\)/.test(confirmPage) && /setSession/.test(confirmPage),
  'email confirmation exchanges explicitly onto the shared client');
check(/const client = supabase\(\)/.test(confirmPage),
  'AND STILL SIGNS THE VISITOR IN — confirming an address is supposed to');

// --- Nothing logs the credential --------------------------------------------
check(!/console\.(log|warn|error|info)\([^)]*credential/i.test(callbackLib + resetPage),
  'THE CREDENTIAL IS NEVER LOGGED');
check(!/localStorage|sessionStorage|document\.cookie/.test(resetPage + callbackLib),
  'and never written to browser storage by Warsha code');

// --- A finished reset revokes everything ------------------------------------
check(/signOut\(\{\s*scope:\s*'global'\s*\}\)/.test(actions),
  'FINISHING A RESET REVOKES EVERY SESSION THE OLD PASSWORD COULD HAVE OPENED');
check(/scope:\s*'local'/.test(actions),
  'and clears the shared client on this origin too, so nothing stale survives');

// --- Expired and refreshed links stay on the recovery surface ---------------
// Verified against the exact shapes a live GoTrue emits.
const expiredRedirect = readAuthCallbackParameters(
  'https://app.usewarsha.com/reset-password#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired&sb=');
equal(expiredRedirect.kind, 'recovery', 'an expired redirect is still recognised as recovery');
check(Boolean(expiredRedirect.errorCode), 'and carries the provider error code');

const refreshed = readAuthCallbackParameters('https://app.usewarsha.com/reset-password');
check(!refreshed.accessToken && !refreshed.refreshToken,
  'A REFRESH CARRIES NO CREDENTIAL, so the page cannot mistake it for a grant');
check(/if \(!credential\)/.test(resetPage),
  'and the page refuses without one rather than falling through to a form');

// The route stays exempt from the gate so it can show its own error card, and
// that is now safe precisely because no session was created.
check(/CALLBACK_APP_ROUTES\s*=\s*\[[^\]]*'\/reset-password'/.test(gate),
  'the reset route still owns its own lifecycle');

console.log(`Password recovery: ${checks} checks passed.`);
