import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appCopy } from '../web/lib/app-copy.ts';
import { CONSOLE_AREAS, mayEnter, visibleAreas } from '../web/lib/console-areas.ts';
import {
  codeLooksComplete, enrolmentGate, failureMessage, manualKeyGroups, normalizeCode,
  reachedAal2, rotationComplete, rotationFactorName, ROTATION_ORDER, STAFF_FACTOR_NAME,
} from '../web/lib/staff-mfa.ts';

/**
 * Enrolling a staff authenticator, and the one thing that must never leave the
 * browser doing it.
 *
 * Warsha could challenge a factor and could not create one: `mfa.enroll` was
 * called nowhere in the codebase, so the only route to `aal2` for a new staff
 * member was an administrator driving the API on their behalf — which puts the
 * seed in a second person's hands and defeats the point of a second factor.
 *
 * The assertions below are about the seed's blast radius. Most of them are
 * negative, because the property being protected is an ABSENCE: the secret must
 * not reach a Warsha server, a table, a log, an analytics call, an error
 * message, or another operator's session. A negative property cannot be proven
 * by exercising the happy path, so these read the source and require that the
 * dangerous shapes are not present.
 */

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const equal = (actual: unknown, expected: unknown, label: string) => {
  assert.deepEqual(actual, expected, label); checks += 1;
};

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8');
const page = read('web', 'app', 'admin', 'security', 'page.tsx');
const lib = read('web', 'lib', 'staff-mfa.ts');
const reauth = read('web', 'components', 'reauth-dialog.tsx');
const styles = read('web', 'app', 'admin', 'security', 'page.module.css');

// ===========================================================================
// 1. THE GATE
// ===========================================================================

equal(enrolmentGate(null, 0), 'no-account', 'no session cannot enrol');
equal(enrolmentGate({ email: null, emailConfirmedAt: null }, 0), 'no-account',
  'an account with no email address cannot enrol');
equal(enrolmentGate({ email: 'a@b.test', emailConfirmedAt: null }, 0), 'email-unconfirmed',
  'AN UNCONFIRMED EMAIL ADDRESS CANNOT ENROL A SECOND FACTOR');
equal(enrolmentGate({ email: 'a@b.test', emailConfirmedAt: '2026-09-06T00:00:00Z' }, 0), 'ready',
  'a confirmed address with no factor may enrol');
equal(enrolmentGate({ email: 'a@b.test', emailConfirmedAt: '2026-09-06T00:00:00Z' }, 1),
  'already-enrolled', 'an account that already holds a verified factor is not offered another');

check(/enrolmentGate\(/.test(page), 'the page decides what to offer with that gate');
check(/email_confirmed_at/.test(page),
  'and reads the confirmation fact from the identity provider rather than assuming it');

// ===========================================================================
// 2. THE SEED NEVER LEAVES THE BROWSER
// ===========================================================================
//
// Each of these is a route out of the tab. None of them may carry the secret,
// and the cheapest way to guarantee that is for the page not to contain the
// call at all.

check(!/console\.(log|info|warn|error|debug)/.test(page),
  'THE ENROLMENT PAGE LOGS NOTHING — a log line is a copy of the seed');
check(!/\.rpc\(/.test(page),
  'IT CALLS NO WARSHA RPC — nothing it holds can reach a database column');
check(!/fetch\(/.test(page),
  'AND MAKES NO REQUEST OF ITS OWN — the seed has no transport off this machine');
check(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(page),
  'and it is not persisted in the browser either');
check(!/analytics|track\(|reportEvent|captureException/i.test(page),
  'no analytics or error-reporting call can carry it out');

// The secret is held in one state variable. It must appear only where it is
// set, cleared, and rendered — never as an argument to anything.
check(!/secret[^)\n]*\)\s*;?\s*\/\/\s*send/i.test(page), 'the secret is never sent anywhere');
check(!/JSON\.stringify\([^)]*secret/i.test(page),
  'the secret is never serialised, which is how it would reach a body or a log');
check(/forget\(\)/.test(page) && /setSecret\(null\)/.test(page),
  'and it is dropped explicitly once the factor verifies, not left in state');

// Provider error text can quote the request that produced it, and during
// enrolment that request carries the seed. So it is never rendered.
// Aimed at RENDERING provider text, not at destructuring it. `const { error }`
// is how the client returns a failure and says nothing on screen; what must
// never appear is the provider's own message reaching the page, because it can
// quote the request that carried the seed.
check(!/error\.message|String\(error\)|JSON\.stringify\(\s*error/.test(page),
  'PROVIDER ERROR TEXT IS NEVER RENDERED — it can quote the request that carried the seed');
check(!/\{\s*\w*[Ee]rror\.message\s*\}/.test(page),
  'and no error message is interpolated into the markup');
check(/failureMessage\(/.test(page), 'failures are shown as fixed sentences from the copy table');

// ===========================================================================
// 3. NOBODY CAN ENROL A FACTOR FOR SOMEBODY ELSE
// ===========================================================================
//
// This is a property of the API, not a check the page performs.
// `supabase.auth.mfa.enroll` enrols on the calling session and accepts no
// account parameter, so there is no argument shape that aims it at another
// identity. These assertions make sure the page keeps it that way.

check(/mfa\.enroll\(\{/.test(page), 'the page enrols through the Supabase MFA authority');
const enrolCall = page.slice(page.indexOf('mfa.enroll({'), page.indexOf('mfa.enroll({') + 240);
check(/factorType:\s*'totp'/.test(enrolCall), 'as a TOTP factor');
check(/friendlyName:\s*STAFF_FACTOR_NAME/.test(enrolCall), 'with a fixed friendly name');
check(!/userId|user_id|subject|onBehalf|accountId/i.test(enrolCall),
  'AND NO ACCOUNT PARAMETER — THE CALL CANNOT BE AIMED AT ANOTHER STAFF MEMBER');

check(!/auth\.admin|admin\.(listUsers|getUserById|updateUserById|createUser)/.test(page),
  'the page uses no admin identity API');
check(!/service_role|SERVICE_ROLE|supabase_admin/i.test(page + lib),
  'NO PRIVILEGED CREDENTIAL APPEARS IN THE ENROLMENT FLOW');
check(!/listUsers|staff_safe_search|role_directory/i.test(page),
  'it reads no account list, so there is no subject to pick');

// ===========================================================================
// 4. WARSHA IMPLEMENTS NO TOTP OF ITS OWN
// ===========================================================================

check(!/otplib|speakeasy|otpauth|hi-base32|thirty-two/i.test(page + lib),
  'no third-party TOTP library is used');
check(!/createHmac|crypto\.subtle|HMAC|SHA-1/i.test(page + lib),
  'NO WARSHA-OWNED TOTP IMPLEMENTATION — the cryptography belongs to Supabase Auth');
check(!/ABCDEFGHIJKLMNOPQRSTUVWXYZ234567/.test(page + lib),
  'and no base32 alphabet, which is what a home-grown implementation would need');
check(/data\.totp\.secret/.test(page) && /data\.totp\.qr_code/.test(page),
  'the secret and QR come from the provider response, not from Warsha');

// ===========================================================================
// 5. ENROLMENT ENDS IN CHALLENGE, VERIFY, AND A PROVEN aal2
// ===========================================================================

check(/mfa\.challenge\(\{/.test(page), 'enrolment issues a challenge');
check(/mfa\.verify\(\{/.test(page), 'and verifies the code against it');
check(page.indexOf('mfa.challenge({') < page.indexOf('mfa.verify({'),
  'in that order — a verify without a challenge proves nothing');
check(/getAuthenticatorAssuranceLevel\(/.test(page),
  'and then ASKS THE PROVIDER whether the session actually reached the second-factor level');
check(/reachedAal2\(/.test(page), 'which is compared against aal2 rather than assumed');

equal(reachedAal2('aal2'), true, 'aal2 is the level that counts');
equal(reachedAal2('aal1'), false, 'aal1 is not enrolment success');
equal(reachedAal2(null), false, 'and an unknown level is not either');
check(/'not-aal2'/.test(page),
  'a verified factor that did not elevate the session is reported, not silently accepted');

// An abandoned enrolment must not strand an unverified factor.
check(/mfa\.unenroll\(\{/.test(page), 'an abandoned enrolment removes the unverified factor');
check((page.match(/mfa\.unenroll\(\{/g) ?? []).length >= 2,
  'on cancel AND on leaving the page, which are different ways to abandon it');

// ===========================================================================
// 6. THE EXISTING REAUTH PATH IS UNTOUCHED
// ===========================================================================

check(/challengeAndVerify\(/.test(reauth),
  'the reauth dialog still challenges a verified factor exactly as before');
check(/listFactors\(/.test(reauth), 'and still asks which factor the account holds');
check(!/mfa\.enroll\(/.test(reauth),
  'and still does not enrol — re-authentication is not the place to create a factor');

// ===========================================================================
// 7. THE MANUAL FALLBACK
// ===========================================================================

equal(manualKeyGroups('ABCDEFGHIJKLMNOP'), ['ABCD', 'EFGH', 'IJKL', 'MNOP'],
  'the setup key is grouped in fours for someone typing or hearing it');
equal(manualKeyGroups('abcdef'), ['ABCD', 'EF'], 'lower case is normalised and a short tail kept');
equal(manualKeyGroups('AB CD EF GH'), ['ABCD', 'EFGH'], 'whitespace in the provider value is ignored');

equal(codeLooksComplete('123456'), true, 'a six-digit code is complete');
equal(codeLooksComplete('123 456'), true, 'even when the app displayed it with a space');
equal(codeLooksComplete('12345'), false, 'five digits is not');
equal(codeLooksComplete('12345a'), false, 'and neither is a letter');
equal(normalizeCode('123 456'), '123456', 'the code is sent without the spacing');

check(/mfaManualShow|mfaManualHide/.test(page), 'the setup key has a show/hide control');
check(/aria-expanded=\{keyShown\}/.test(page), 'whose state is announced');
check(/dir="ltr"/.test(page),
  'AND THE KEY RENDERS LEFT-TO-RIGHT — base32 is not language and must not reorder in Arabic');
check(/alt=\{words\.mfaQrAlt\}/.test(page), 'the QR has alternative text');
check(!/alt=\{.*secret/i.test(page),
  'WHICH DOES NOT CONTAIN THE KEY — alt text is read aloud and pasted into bug reports');
check(/htmlFor="mfa-code"/.test(page) && /id="mfa-code"/.test(page),
  'the code field has a real label');
check(/autoComplete="one-time-code"/.test(page), 'and accepts an autofilled one-time code');
check(/role="alert"/.test(page), 'failures are announced rather than only shown');
check(/:focus-visible/.test(styles), 'and every control has a visible focus ring');

// ===========================================================================
// 8. THE CONSOLE AREA
// ===========================================================================

const area = CONSOLE_AREAS.find((candidate) => candidate.key === 'security');
check(area !== undefined, 'the console has a security area');
equal(area?.href, '/security', 'at /admin/security');
equal(area?.capability, '',
  'REQUIRING NO CAPABILITY — the least-privileged operator needs aal2 too, and this is where they get it');

const noCapabilities = {
  authenticated: true, staff: true, capabilities: [] as string[], roles: [] as string[],
} as never;
check(mayEnter(noCapabilities, '/security'),
  'a staff member holding nothing at all can still reach their own security page');
check(visibleAreas(noCapabilities).some((candidate) => candidate.key === 'security'),
  'and it is offered to them in the sidebar');
check(!visibleAreas(noCapabilities).some((candidate) => candidate.key === 'staff'),
  'while an area that does need a capability is still hidden from them');

// ===========================================================================
// 9. EVERY WORD, IN EVERY LANGUAGE
// ===========================================================================

const MFA_KEYS = [
  'console_security', 'mfaTitle', 'mfaLead', 'mfaStartTitle', 'mfaStartBody', 'mfaStartAction',
  'mfaForAccount', 'mfaEmailNeededTitle', 'mfaEmailNeededBody', 'mfaEnrolledTitle',
  'mfaEnrolledBody', 'mfaDoneTitle', 'mfaDoneBody', 'mfaScanTitle', 'mfaScanBody', 'mfaQrAlt',
  'mfaManualTitle', 'mfaManualBody', 'mfaManualShow', 'mfaManualHide', 'mfaCodeLabel',
  'mfaConfirmAction', 'mfaCancelAction', 'mfaEnrolFailed', 'mfaCodeRejected', 'mfaNotElevated',
  'mfaUnavailable',
] as const;

for (const key of MFA_KEYS) {
  check(appCopy.en[key]?.length > 0, `en.${key} exists`);
  check(appCopy.ar[key]?.length > 0, `ar.${key} exists`);
  check(appCopy.fr[key]?.length > 0, `fr.${key} exists`);
  check(String(appCopy.ar[key]) !== String(appCopy.en[key]), `ar.${key} is localized`);
  check(String(appCopy.fr[key]) !== String(appCopy.en[key]), `fr.${key} is localized`);
  check(!/[A-Za-z]{4}/.test(String(appCopy.ar[key]).replace(/QR|Warsha/g, '')),
    `ar.${key} has no English left in it`);
}

// The page holds no bare string: every word it says comes from the table.
check(!/>[A-Z][a-z]+ [a-z]+</.test(page.replace(/\{[^}]*\}/g, '')),
  'the page renders no hardcoded English sentence');

// ===========================================================================
// 10. THE FIXED FAILURE SENTENCES
// ===========================================================================

const words = appCopy.en;
equal(failureMessage('start', words), words.mfaEnrolFailed, 'a failed start says so');
equal(failureMessage('code-rejected', words), words.mfaCodeRejected, 'a rejected code says so');
equal(failureMessage('not-aal2', words), words.mfaNotElevated, 'a session that did not elevate says so');
equal(failureMessage('unavailable', words), words.mfaUnavailable, 'and anything else is generic');
check(STAFF_FACTOR_NAME.length > 0 && !/secret|key/i.test(STAFF_FACTOR_NAME),
  'the factor name is a label, not a hint about the key');

// ===========================================================================
// 11. REPLACING A FACTOR NEVER LEAVES THE ACCOUNT WITH NONE
// ===========================================================================
//
// The exposed original factor could not be rotated: the page refuses to enrol
// while a verified factor exists, and the only administrator IS the person
// holding it. So rotation had to become a first-party flow, and the ONE thing
// it must never do is remove the old factor before the new one works.
//
// With `mfa_required` on, an account with no verified factor cannot reach
// `aal2`, and every staff gate needs `aal2`. A rotation that unenrolled first
// would lock the operator out of the console INCLUDING the tools that would
// turn the requirement off, and recovery would need a database-owner
// procedure. That is why the order below is asserted as data.

equal([...ROTATION_ORDER],
  ['confirm-current', 'enrol-new', 'verify-new', 'prove-aal2', 'unenrol-old'],
  'THE OLD FACTOR IS REMOVED LAST, AFTER THE NEW ONE HAS PROVEN ITSELF');
check(ROTATION_ORDER.indexOf('unenrol-old') === ROTATION_ORDER.length - 1,
  'and nothing at all happens after the removal');
check(ROTATION_ORDER.indexOf('prove-aal2') < ROTATION_ORDER.indexOf('unenrol-old'),
  'the session must reach aal2 BEFORE the old factor goes');
check(ROTATION_ORDER.indexOf('confirm-current') === 0,
  'and possession of the current factor is proven before anything is created');

// --- The single removal site, and its guard ---------------------------------
const unenrolCalls = (page.match(/mfa\.unenroll\(\{/g) ?? []).length;
check(unenrolCalls >= 3,
  'unenroll appears for: cancel, unmount, and the completed rotation');
check(/THE ONLY PLACE THE OLD FACTOR IS REMOVED/.test(page),
  'the removal site is marked as the only one');
// The removal must sit behind BOTH the aal2 proof and the rotation mode.
const removalIndex = page.indexOf('THE ONLY PLACE THE OLD FACTOR IS REMOVED');
const aal2Index = page.indexOf('reachedAal2(level?.currentLevel)');
check(aal2Index !== -1 && aal2Index < removalIndex,
  'THE aal2 CHECK IS ABOVE THE REMOVAL IN THE SOURCE, NOT BESIDE IT');
check(/rotation === 'scan-new' && oldFactorId && oldFactorId !== factorId/.test(page),
  'and the removal refuses to run outside a rotation, or on the new factor itself');

// --- A failed verification keeps the old factor -----------------------------
check(/setFailure\(rotation === 'scan-new' \? 'old-kept' : 'code-rejected'\)/.test(page),
  'A REJECTED NEW CODE REPORTS THAT NOTHING WAS REPLACED');
const rejectedBranch = page.slice(page.indexOf("if (verifyError) {"),
  page.indexOf("forget();", page.indexOf("if (verifyError) {")));
check(!/unenroll/.test(rejectedBranch),
  'AND THE FAILURE PATH REMOVES NOTHING — the old factor survives a bad code');

// --- Coexistence is the point, not an accident ------------------------------
equal(rotationComplete(['new-id'], 'new-id', 'old-id'), true,
  'a rotation is complete when exactly one verified factor remains and it is the new one');
equal(rotationComplete(['old-id', 'new-id'], 'new-id', 'old-id'), false,
  'TWO VERIFIED FACTORS MEANS THE ROTATION IS MID-FLIGHT, NOT DONE');
equal(rotationComplete([], 'new-id', 'old-id'), false,
  'AND ZERO FACTORS IS NEVER A SUCCESSFUL OUTCOME');
equal(rotationComplete(['old-id'], 'new-id', 'old-id'), false,
  'nor is the old factor surviving alone');
equal(rotationComplete(['same'], 'same', 'same'), false,
  'and a factor cannot replace itself');
check(/rotationComplete\(remaining, factorId, oldFactorId\)/.test(page),
  'the page confirms the end state by listing factors again, not by assuming');

// --- The new factor needs its own name --------------------------------------
const name = rotationFactorName(new Date('2026-09-07T10:00:00Z'));
equal(name, 'Warsha staff authenticator 2026-09-07', 'the replacement is dated');
check(name !== STAFF_FACTOR_NAME,
  'AND DIFFERS FROM THE EXISTING NAME, because both exist at once and the '
  + 'identity provider refuses a duplicate friendly name');

// --- Possession of the current factor authorises the rotation ---------------
check(/challengeAndVerify\(\{[\s\S]{0,80}factorId: oldFactorId/.test(page),
  'A REPLACEMENT BEGINS BY CHALLENGING THE FACTOR BEING RETIRED');
check(/'current-rejected'/.test(page),
  'and a wrong current code is reported without changing anything');
const confirmBlock = page.slice(page.indexOf('const confirmCurrent'),
  page.indexOf('const beginReplacement'));
check(!/unenroll/.test(confirmBlock),
  'the confirm step removes nothing at all');
check(/mfa\.enroll\(\{/.test(confirmBlock),
  'it enrols the new factor only after the current one answered');

// --- Still nobody else's factor ---------------------------------------------
// Extracted and compared rather than matched with a negative lookahead: `\s*`
// can match empty, which lets a lookahead pass at the wrong offset and turns
// the assertion into one that cannot fail.
const unenrolArgs = [...page.matchAll(/unenroll\(\{\s*factorId:\s*([A-Za-z_$][\w$]*)/g)]
  .map(([, id]) => id);
check(unenrolArgs.length >= 3, 'every unenroll call site was found');
for (const id of unenrolArgs) {
  check(['stranded', 'oldFactorId'].includes(id),
    `unenroll is called with ${id}, a factor id this session owns`);
}
check(!/userId|user_id|subject|onBehalf/i.test(confirmBlock),
  'ANOTHER STAFF ACCOUNT CANNOT ROTATE THIS ONE — no account parameter exists');

// --- The seed rules apply to the replacement too -----------------------------
check(/setSecret\(data\.totp\.secret\)/.test(page),
  'the replacement secret comes from the provider response');
check((page.match(/forget\(\)/g) ?? []).length >= 3,
  'and is dropped on success, on cancel, and on abandoning a replacement');

// --- Every new word, in every language --------------------------------------
const ROTATION_KEYS = [
  'mfaReplaceTitle', 'mfaReplaceBody', 'mfaReplaceAction', 'mfaCurrentTitle',
  'mfaCurrentBody', 'mfaCurrentCodeLabel', 'mfaCurrentAction', 'mfaReplaceScanTitle',
  'mfaReplaceScanBody', 'mfaReplaceDoneTitle', 'mfaReplaceDoneBody',
  'mfaCurrentRejected', 'mfaOldKept',
] as const;
for (const key of ROTATION_KEYS) {
  check(appCopy.en[key]?.length > 0, `en.${key} exists`);
  check(appCopy.ar[key]?.length > 0, `ar.${key} exists`);
  check(appCopy.fr[key]?.length > 0, `fr.${key} exists`);
  check(String(appCopy.ar[key]) !== String(appCopy.en[key]), `ar.${key} is localized`);
  check(String(appCopy.fr[key]) !== String(appCopy.en[key]), `fr.${key} is localized`);
  check(!/[A-Za-z]{4}/.test(String(appCopy.ar[key]).replace(/Warsha/g, '')),
    `ar.${key} has no English left in it`);
}
// The reassurance is the whole point of these two, in every language.
for (const locale of ['en', 'ar', 'fr'] as const) {
  check(String(appCopy[locale].mfaOldKept).length > 20,
    `${locale}.mfaOldKept explains that nothing was replaced`);
  check(String(appCopy[locale].mfaCurrentRejected).length > 20,
    `${locale}.mfaCurrentRejected explains that nothing was changed`);
}

// --- First-time enrolment is untouched --------------------------------------
equal(enrolmentGate({ email: 'a@b.test', emailConfirmedAt: '2026-09-06T00:00:00Z' }, 0), 'ready',
  'FIRST-TIME ENROLMENT STILL WORKS: a confirmed address with no factor may enrol');
check(/friendlyName: STAFF_FACTOR_NAME/.test(page),
  'and still enrols under the plain name, not the dated rotation name');
check(/rotation === 'idle'/.test(page),
  'the replacement offer is only shown when no rotation is already running');

// The rotation code field is labelled and RTL-safe like the enrolment one.
check(/htmlFor="mfa-current-code"/.test(page) && /id="mfa-current-code"/.test(page),
  'the current-code field has a real label');
check((page.match(/dir="ltr"/g) ?? []).length >= 3,
  'and both code fields plus the setup key stay left-to-right inside an Arabic page');

console.log(`Staff MFA enrolment: ${checks} checks passed.`);
