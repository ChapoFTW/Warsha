import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appCopy } from '../web/lib/app-copy.ts';
import { CONSOLE_AREAS, mayEnter, visibleAreas } from '../web/lib/console-areas.ts';
import {
  auditDetail, AUDIT_MAX_RANGE_DAYS, AUDIT_SOURCES,
  parseAuditPayload, parseRoleDirectory, parseSafeSearch, parseVettingQueue,
} from '../web/lib/console-payloads.ts';
import {
  DUAL_CONTROL_CAPABILITIES, freshnessRemaining, isReauthRefusal,
  needsReauth, needsSecondPerson, reauthNeedFor, REAUTH_CAPABILITIES,
} from '../web/lib/reauth.ts';
import { parseStaffSession } from '../web/lib/staff.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const readWeb = (...parts: string[]) => readFileSync(join('web', ...parts), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// These RPCs are defined across several migrations, so the whole corpus is
// searched rather than one file that happened to hold the first of them.
const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(join('supabase/migrations', name), 'utf8'))
  .join('\n');

// --- Navigation names the capability the RPC actually demands ---------------
// If these disagreed, the console would offer a door onto a refusal.
const CAPABILITY_OF: Record<string, string> = {
  users: 'safe_search',
  verification: 'review_worker_vetting',
  staff: 'manage_staff_roles',
  audit: 'view_audit_logs',
};
for (const [key, capability] of Object.entries(CAPABILITY_OF)) {
  const area = CONSOLE_AREAS.find((candidate) => candidate.key === key);
  check(area?.capability === capability,
    `the ${key} area requires the capability its RPC demands (${capability})`);
}

// The capability strings must exist in the database, not just in the client.
const RPC_CAPABILITY: Record<string, string> = {
  staff_safe_search: 'safe_search',
  staff_worker_vetting_queue: 'review_worker_vetting',
  get_staff_role_directory: 'manage_staff_roles',
  staff_audit_search: 'view_audit_logs',
};
for (const [rpc, capability] of Object.entries(RPC_CAPABILITY)) {
  const body = migrations.slice(migrations.indexOf(`function public.${rpc}`));
  check(body.slice(0, 900).includes(`require_staff_capability('${capability}')`),
    `${rpc} REALLY DOES REQUIRE ${capability} IN THE DATABASE`);
}

// --- A session without capabilities sees nothing but the dashboard ----------
const nobody = parseStaffSession({ isStaff: true, platformReady: true, capabilities: [] });
equal(visibleAreas(nobody).map((a) => a.key), ['dashboard'],
  'A STAFF ACCOUNT WITH NO CAPABILITIES IS OFFERED NO PRIVILEGED AREA');
for (const href of ['/users', '/verification', '/staff', '/audit']) {
  check(!mayEnter(nobody, href), `${href} is not offered without its capability`);
}

const support = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['safe_search'],
});
equal(visibleAreas(support).map((a) => a.key), ['dashboard', 'users'],
  'a capability grants exactly its own area and no other');
check(mayEnter(support, '/users'), 'the granted area is reachable');
check(!mayEnter(support, '/staff'),
  'SEARCHING USERS DOES NOT IMPLY MANAGING STAFF ROLES');
check(!mayEnter(support, '/audit'), 'nor reading the audit log');

const anonymous = parseStaffSession(null);
equal(visibleAreas(anonymous).map((a) => a.key), ['dashboard'],
  'a non-staff session is offered nothing privileged');
check(!mayEnter(anonymous, '/users'), 'a non-staff session may enter nothing');

// --- Least privilege in the pages themselves --------------------------------
for (const [page, capability] of [
  ['users', 'safe_search'],
  ['verification', 'review_worker_vetting'],
  ['staff', 'manage_staff_roles'],
  ['audit', 'view_audit_logs'],
] as const) {
  const source = readWeb('app', 'admin', page, 'page.tsx');
  check(source.includes(`hasCapability(session, '${capability}')`),
    `the ${page} page checks ${capability} before it calls anything`);
  check(/if \(!allowed\) return;|disabled=\{!allowed/.test(source),
    `the ${page} page does not fetch when the capability is absent`);
}

// --- The audit view cannot write --------------------------------------------
const audit = strip(readWeb('app', 'admin', 'audit', 'page.tsx'));
check(!/insert|update|delete|staff_record|staff_grant|staff_revoke/i.test(audit),
  'THE AUDIT VIEW HAS NO WRITE PATH; AN EDITABLE AUDIT TRAIL IS NOT ONE');
check(/p_from/.test(audit) && /p_to/.test(audit),
  'the audit query is bounded rather than unbounded over an append-only log');

// --- No privileged credential in the console --------------------------------
const consoleSources = ['users', 'verification', 'staff', 'audit']
  .map((page) => readWeb('app', 'admin', page, 'page.tsx'))
  .concat(
    readWeb('components', 'console-shell.tsx'),
    readWeb('components', 'console-bits.tsx'),
    readWeb('components', 'reauth-dialog.tsx'),
    readWeb('lib', 'console-areas.ts'),
    readWeb('lib', 'console-payloads.ts'),
    readWeb('lib', 'reauth.ts'),
  )
  .join('\n');
check(!/service_role|SERVICE_ROLE|supabase_admin/i.test(consoleSources),
  'NO SERVICE ROLE CREDENTIAL APPEARS ANYWHERE IN THE CONSOLE');
check(!/from\('auth\.users'\)|from\('profiles'\)/.test(consoleSources),
  'the console reads through governed RPCs, not directly from account tables');

// ===========================================================================
// PAYLOAD SHAPES MATCH THE FUNCTIONS THAT PRODUCE THEM
// ===========================================================================
//
// Each of these reads the `jsonb_build_object(...)` in the migration and
// asserts the client parses the same keys. A console that renders a column the
// server never sends shows an empty column forever and nobody notices.

function fieldsOf(rpc: string): string {
  const at = migrations.indexOf(`function public.${rpc}`);
  assert.ok(at >= 0, `${rpc} exists in the migrations`);
  const end = migrations.indexOf('$$;', at);
  assert.ok(end > at, `${rpc} has a complete function body`);
  return migrations.slice(at, end + 3);
}

// staff_safe_search -> { results: [{kind,id,status,createdAt}], count }
const safeSearchSql = fieldsOf('staff_safe_search');
for (const field of ['kind', 'id', 'status', 'createdAt']) {
  check(safeSearchSql.includes(`'${field}'`),
    `staff_safe_search really builds ${field}`);
}
check(safeSearchSql.includes("'results', v_results"),
  'staff_safe_search wraps its rows in `results`');
const parsedSearch = parseSafeSearch({
  results: [{ kind: 'account', id: 'a', status: 'good_standing', createdAt: 'x' }],
  count: 1,
});
equal(parsedSearch.count, 1, 'the search payload count is read from the server');
equal(parsedSearch.results[0]?.kind, 'account', 'and each row keeps its kind');
equal(parseSafeSearch(null).results, [], 'a null payload parses to no rows, not a crash');
equal(parseSafeSearch({ results: [null, { kind: 'worker' }] }).results.length, 1,
  'a malformed row is dropped rather than rendered as blanks');

// The twelve kinds the client offers must be the twelve the server validates.
const kindGuard = safeSearchSql.slice(safeSearchSql.indexOf('p_kind not in'));
const usersPage = readWeb('app', 'admin', 'users', 'page.tsx');
for (const kind of [
  'booking', 'marketplace_request', 'dispute', 'review', 'trust_report', 'payment',
  'withdrawal', 'reconciliation_exception', 'support_case', 'incident', 'account', 'worker',
]) {
  check(kindGuard.slice(0, 400).includes(`'${kind}'`), `the server accepts kind ${kind}`);
  check(usersPage.includes(`'${kind}'`), `the console offers kind ${kind}`);
}

// staff_worker_vetting_queue -> { cases: [...], count }
const vettingSql = fieldsOf('staff_worker_vetting_queue');
for (const field of ['subjectRef', 'workerState', 'waitingSince', 'hasCertificate', 'priority']) {
  check(vettingSql.includes(`'${field}'`), `the vetting queue really builds ${field}`);
}
equal(parseVettingQueue({ cases: [{ subjectRef: 'ab', workerState: 'manual_review' }], count: 1 })
  .cases.length, 1, 'a vetting case parses');
equal(parseVettingQueue(undefined).cases, [], 'an absent vetting payload parses to no cases');

// THE QUEUE IS PSEUDONYMOUS. This is the privacy property that matters most on
// this surface, and it is asserted against the SQL, not against a comment.
check(/'subjectRef',\s*pg_catalog\.encode\(pg_catalog\.sha256/.test(vettingSql),
  'THE VETTING QUEUE RETURNS A HASH, NOT A USER ID');
const verificationPage = readWeb('app', 'admin', 'verification', 'page.tsx');
check(!/userId|displayName|\bemail\b|\bphone\b/i.test(strip(verificationPage)),
  'THE VETTING QUEUE PAGE RENDERS NO NAME, EMAIL OR PHONE — IT HAS NONE TO RENDER');

// The six worker states the queue selects must all have a label.
const stateGuard = vettingSql.slice(vettingSql.indexOf('worker_state in ('));
for (const state of [
  'identity_submitted', 'identity_under_review', 'criminal_record_submitted',
  'criminal_record_under_review', 'manual_review', 'appeal_pending',
]) {
  check(stateGuard.slice(0, 300).includes(`'${state}'`), `the queue selects ${state}`);
  check(`state_${state}` in appCopy.en, `state ${state} has an English label`);
  check(`state_${state}` in appCopy.ar, `state ${state} has an Arabic label`);
}

// get_staff_role_directory -> { roles, capabilities, grants }
const directorySql = fieldsOf('get_staff_role_directory');
for (const field of [
  'roleKey', 'displayName', 'riskTier', 'capabilityKey', 'domain',
  'highRisk', 'dualControl', 'requiresReauth', 'grantedAt', 'expiresAt',
]) {
  check(directorySql.includes(`'${field}'`), `the role directory really builds ${field}`);
}
const directory = parseRoleDirectory({ roles: [{ roleKey: 'x' }], capabilities: [], grants: [] });
equal(directory.roles.length, 1, 'the role directory parses roles');
equal(parseRoleDirectory(null).grants, [], 'an absent directory parses to no grants');

// staff_audit_search -> { source, from, to, rows }
const auditSql = fieldsOf('staff_audit_search');
check(auditSql.includes("'rows', coalesce(v_rows"), 'the audit payload wraps its rows in `rows`');
for (const field of ['id', 'at', 'actorId', 'action', 'entityType', 'entityId']) {
  check(auditSql.includes(`'${field}'`), `the audit payload really builds ${field}`);
}
// EVERY source the client offers must be one the server accepts. A source this
// list invented would reach the database and raise 22023.
const sourceGuard = auditSql.slice(auditSql.indexOf('p_source not in'));
for (const source of AUDIT_SOURCES) {
  check(sourceGuard.slice(0, 500).includes(`'${source}'`),
    `THE SERVER ACCEPTS AUDIT SOURCE ${source}`);
  check(`source_${source}` in appCopy.en, `audit source ${source} has an English label`);
  check(`source_${source}` in appCopy.ar, `audit source ${source} has an Arabic label`);
}
equal(AUDIT_SOURCES.length, 9, 'all nine audit sources are offered, not a subset');
check(auditSql.includes(`days => ${AUDIT_MAX_RANGE_DAYS}`),
  'the client bounds the range at the same 366 days the server does');

const auditPayload = parseAuditPayload({
  source: 'staff_audit', from: 'a', to: 'b',
  rows: [{ id: '1', at: 'x', actorId: null, action: 'grant', entityType: null, entityId: null }],
});
equal(auditPayload.rows.length, 1, 'the audit payload parses its rows');
equal(parseAuditPayload(null).rows, [], 'an absent audit payload parses to no rows');
equal(auditDetail({
  id: '1', at: 'x', actorId: null, action: 'a', entityType: null, entityId: null,
  breakGlass: true, capabilityKey: 'manage_staff_roles', reason: 'incident',
}), 'break-glass · manage_staff_roles · incident',
  'break-glass leads the detail, because it is the thing a reader must not miss');
equal(auditDetail({
  id: '1', at: 'x', actorId: null, action: 'a', entityType: null, entityId: null,
  fromStatus: 'open', toStatus: 'closed',
}), 'open → closed', 'a status transition reads as a transition');
equal(auditDetail({ id: '1', at: 'x', actorId: null, action: 'a', entityType: null, entityId: null }),
  '', 'a source with no extra detail produces none rather than a placeholder');

// ===========================================================================
// FRESH RE-AUTHENTICATION
// ===========================================================================

// The reauth and dual-control sets must match `staff_capabilities` exactly.
// Reading them out of the inserts is the only way to keep them honest as
// capabilities are added.
const capabilityRows = [...migrations.matchAll(
  /\(\s*'([a-z_]+)'\s*,\s*'[a-z_]+'\s*,\s*'(?:[^']|'')*'\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/g,
)];
const declared = new Map<string, { dual: boolean; reauth: boolean }>();
for (const [, key, , dual, reauth] of capabilityRows) {
  if (!declared.has(key)) declared.set(key, { dual: dual === 'true', reauth: reauth === 'true' });
}
check(declared.size >= 40, `the capability catalogue was found (${declared.size} capabilities)`);
for (const [key, flags] of declared) {
  check(REAUTH_CAPABILITIES.has(key) === flags.reauth,
    `${key}: the client's requires_reauth matches the database`);
  check(DUAL_CONTROL_CAPABILITIES.has(key) === flags.dual,
    `${key}: the client's dual_control matches the database`);
}

// The gate itself.
check(needsReauth('manage_staff_roles'),
  'MANAGING STAFF ROLES NEEDS A FRESH SIGN-IN — THE STAFF PAGE DEPENDS ON THIS');
check(needsReauth('view_contact_details'),
  'looking up an email or phone needs a fresh sign-in');
check(!needsReauth('safe_search'), 'an ordinary lookup does not');
check(!needsReauth('view_audit_logs'), 'nor does reading the audit log');
check(needsSecondPerson('reject_worker_application'),
  'rejecting a worker application needs a second person');
check(!needsSecondPerson('activate_worker'),
  'activating one does not — the asymmetry is deliberate');

const fresh = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['manage_staff_roles'],
  reauthValid: true, reauthWindowSeconds: 900, sessionFreshnessSeconds: 60,
});
const stale = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['manage_staff_roles'],
  reauthValid: false, reauthWindowSeconds: 900, sessionFreshnessSeconds: 4000,
});
equal(reauthNeedFor(fresh, 'manage_staff_roles').kind, 'ready',
  'a fresh session may proceed');
equal(reauthNeedFor(stale, 'manage_staff_roles').kind, 'stale',
  'a stale session is asked to confirm');
equal(reauthNeedFor(fresh, 'approve_permanent_ban').kind, 'missing-capability',
  'A CAPABILITY THE ROLE LACKS IS NOT A FRESHNESS PROBLEM AND IS NOT OFFERED ONE');
equal(reauthNeedFor(stale, 'safe_search').kind, 'missing-capability',
  'and a capability outside the grant stays refused however fresh the session');

const revoked = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['manage_staff_roles'],
  reauthValid: true, sessionRevoked: true, sessionFreshnessSeconds: 10,
});
equal(reauthNeedFor(revoked, 'manage_staff_roles').kind, 'revoked',
  'A REVOKED SESSION IS TOLD IT WAS REVOKED, NOT SENT ROUND A PASSWORD LOOP');

const noMfa = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['manage_staff_roles'],
  mfaRequired: true, mfaSatisfied: false, sessionFreshnessSeconds: 10,
});
equal(reauthNeedFor(noMfa, 'manage_staff_roles').kind, 'mfa',
  'a required second factor is named as such rather than as staleness');

equal(freshnessRemaining(fresh), 840, 'remaining freshness is window minus age');
equal(freshnessRemaining(stale), 0, 'and never negative');
equal(freshnessRemaining(parseStaffSession({ isStaff: true, platformReady: true })), 0,
  'a session with no freshness claim has none, rather than a default that grants access');

check(isReauthRefusal({ message: 'Re-authentication required' }),
  'the freshness refusal is recognised');
check(!isReauthRefusal({ message: 'Staff capability required' }),
  'A CAPABILITY REFUSAL IS NOT OFFERED A RE-AUTHENTICATION DIALOG');
check(!isReauthRefusal({ message: 'Admin platform is unavailable' }),
  'nor is an unavailable platform');
check(!isReauthRefusal(null), 'nor is an absent error');

// The dialog must perform a real authentication event. `staff_reauthenticate`
// alone cannot make a stale token fresh — it verifies and raises. A dialog that
// only called the RPC would loop forever.
const dialog = readWeb('components', 'reauth-dialog.tsx');
check(/challengeAndVerify|signInWithPassword/.test(dialog),
  'THE REAUTH DIALOG PERFORMS A REAL AUTHENTICATION, NOT ONLY THE ATTESTATION RPC');
check(dialog.includes('staff_reauthenticate'),
  'and registers the attestation afterwards');
check(dialog.indexOf('signInWithPassword') < dialog.indexOf("rpc('staff_reauthenticate')"),
  'in that order: authenticate first, attest second');
check(/const \{ data: user \} = await client\.auth\.getUser\(\)/.test(dialog),
  'THE ACCOUNT IS TAKEN FROM THE LIVE SESSION, NEVER TYPED — THIS CANNOT BE POINTED AT ANOTHER USER');
check(!/localStorage|sessionStorage|console\.(log|warn|error)/.test(dialog),
  'THE RE-ENTERED CREDENTIAL IS NEVER STORED OR LOGGED');
check(/setPassword\(''\)/.test(dialog),
  'and is cleared from state once used');

// The staff page depends on freshness for its *read*, so it must handle the
// refusal rather than showing an empty table.
const staffPage = readWeb('app', 'admin', 'staff', 'page.tsx');
check(/isReauthRefusal\(error\)/.test(staffPage),
  'the staff page recovers from a freshness refusal in place');
check(/ReauthDialog/.test(staffPage), 'by offering the dialog');

// ===========================================================================
// PRIVILEGED MUTATIONS
// ===========================================================================
//
// The audit that mattered most: **no second staff-role system was written.**
// WPS-017 already governs grant and revoke, and these assert the console calls
// exactly those and nothing else.

for (const [rpc, capability] of [
  ['staff_grant_role', 'manage_staff_roles'],
  ['staff_revoke_role', 'manage_staff_roles'],
] as const) {
  const body = migrations.slice(migrations.indexOf(`function public.${rpc}`));
  check(body.slice(0, 700).includes(`require_staff_capability('${capability}')`),
    `${rpc} REQUIRES ${capability} IN THE DATABASE`);
  // A reason is not optional on either, and the console must not pretend it is.
  check(body.slice(0, 900).includes('A reason is required'),
    `${rpc} REFUSES AN EMPTY REASON SERVER-SIDE`);
  // Granted to `authenticated`, so the browser calls it as the staff member
  // rather than needing any elevated credential.
  check(migrations.includes(`'public.${rpc}(`),
    `${rpc} is granted to the authenticated staff session`);
}

// SELF-ESCALATION. The single most important property on this surface.
const grantSql = migrations.slice(migrations.indexOf('function public.staff_grant_role'));
check(/p_user_id = v_actor/.test(grantSql.slice(0, 800)),
  'staff_grant_role REFUSES A GRANT TO THE ACTOR\'S OWN ACCOUNT, IN THE DATABASE');
check(/cannot grant a role to their own account/.test(grantSql.slice(0, 900)),
  'and says so, which is the message the console maps');

const mutations = readWeb('lib', 'staff-mutations.ts');
const actions = readWeb('components', 'staff-role-actions.tsx');
check(/isSelfGrant/.test(actions) && /isSelfGrant/.test(mutations),
  'THE CONSOLE ALSO REFUSES A SELF-GRANT BEFORE SENDING IT');
check(/disabled=\{!ready \|\| busy\}/.test(actions),
  'and keeps the button disabled until the action could actually succeed');
check(/!self/.test(actions), 'with the self check part of readiness, not a warning beside it');

// Revoking clears sessions, which is why no separate control is offered.
const revokeSql = migrations.slice(migrations.indexOf('function public.staff_revoke_role'));
check(/staff_session_attestations\s*\n?\s*set revoked_at/.test(revokeSql.slice(0, 1200)),
  'REVOKING A ROLE ALSO REVOKES THE ACCOUNT\'S SESSION ATTESTATIONS');

// Reason and idempotency bounds match the server's.
check(/REASON_MIN = 3/.test(mutations), 'the client uses the same 3-character reason minimum');
check(/IDEMPOTENCY_MIN = 8/.test(mutations) && /IDEMPOTENCY_MAX = 200/.test(mutations),
  'and the same 8..200 idempotency-key bounds');
check(/length\(coalesce\(p_idempotency_key,''\)\) not between 8 and 200/.test(grantSql.slice(0, 1600)),
  'which are the bounds the database actually enforces');
check(/useState\(newIdempotencyKey\)/.test(actions),
  'THE IDEMPOTENCY KEY IS GENERATED ONCE PER FORM, SO A DOUBLE SUBMIT CANNOT GRANT TWICE');

// A freshness refusal must reopen the dialog; a capability refusal must not.
check(/isReauthRefusal\(error\)\) onNeedsReauth\(\)/.test(actions),
  'a freshness refusal on a mutation reopens the re-authentication dialog');
check(/classifyRefusal/.test(actions),
  'and every other refusal is named rather than shown as a Postgres message');
for (const refusal of ['self', 'already-active', 'unknown-role', 'reason-required', 'reauth', 'capability']) {
  check(mutations.includes(`'${refusal}'`), `the refusal "${refusal}" is classified`);
}

// No dual-control workflow was invented where the database has none.
check(!/staff_request_dual_control|staff_approve_dual_control/.test(actions),
  'NO APPROVAL QUEUE IS INVENTED FOR ROLE GRANTS; THE SELF-GRANT BAN IS THE CONTROL');

// And no client-side role writing of any kind.
check(!/from\('staff_role_grants'\)|\.insert\(|\.update\(|\.delete\(/.test(actions + mutations),
  'THE BROWSER NEVER WRITES A ROLE ROW DIRECTLY; IT CALLS THE GOVERNED RPC');

// --- Bilingual, like every other surface ------------------------------------
const enKeys = Object.keys(appCopy.en).sort();
const arKeys = Object.keys(appCopy.ar).sort();
equal(arKeys, enKeys, 'every console string exists in both languages');
for (const key of [
  'usersTitle', 'verificationTitle', 'staffTitle', 'auditTitle', 'usersRefused',
  'reauthTitle', 'reauthBodyPassword', 'reauthDeniedTitle', 'reauthRevokedBody',
  'usersNotDirectory', 'verificationPseudonymous', 'auditNoOutcome',
  'colTime', 'colActor', 'colAction', 'colTarget', 'colDetail',
]) {
  check(/[؀-ۿ]/.test(appCopy.ar[key as keyof typeof appCopy.ar]),
    `ar.${key} is written in Arabic`);
}

// The old copy promised a name search the RPC has never offered. Promising a
// capability the database refuses is worse than offering none.
check(!/by name|name, email/i.test(appCopy.en.usersLead),
  'THE LOOKUP DOES NOT ADVERTISE A NAME SEARCH THAT DOES NOT EXIST');
check(!appCopy.ar.usersLead.includes('بالاسم'),
  'and does not advertise one in Arabic either');

// --- Direction and overflow ---------------------------------------------------
const tableCss = readWeb('components', 'console-table.module.css');
check(/overflow-x: auto/.test(tableCss),
  'wide tables scroll inside their own container, so the page never scrolls sideways');
check(/direction: ltr/.test(tableCss) && /unicode-bidi: isolate/.test(tableCss),
  'IDENTIFIERS STAY LEFT-TO-RIGHT INSIDE AN ARABIC PAGE');
check(!/margin-left|margin-right|text-align:\s*left/.test(tableCss),
  'the console holds no physical direction that would strand Arabic');
const shellCss = readWeb('components', 'console-shell.module.css');
check(/border-inline-end/.test(shellCss),
  'the sidebar sits on the reading edge and mirrors in Arabic');
const dialogCss = readWeb('components', 'reauth-dialog.module.css');
check(!/margin-left|margin-right|padding-left|padding-right/.test(dialogCss),
  'the dialog uses logical properties so it mirrors in Arabic');
check(/border-inline-start/.test(dialogCss) && /padding-inline-start/.test(dialogCss),
  'including its failure message');

// Warsha is monochrome. A console that invents a green "safe" and a red
// "danger" has invented brand, and the two would then disagree with the app.
const bits = readWeb('components', 'console-bits.tsx');
for (const source of [bits, tableCss, dialogCss]) {
  check(!/#[0-9a-f]{3,8}\b/i.test(source.replace(/rgb\(0 0 0[^)]*\)/g, '')),
    'NO RAW COLOUR IS INVENTED IN THE CONSOLE; IT USES THE DESIGN TOKENS');
}
check(/dir="ltr"/.test(bits), 'identifiers are explicitly left-to-right');
check(/Intl\.DateTimeFormat/.test(bits) && /timeZone/.test(bits),
  'timestamps are rendered in the console timezone rather than the reader\'s');
check(/ar-EG/.test(bits), 'and in Egyptian Arabic when the console is in Arabic');

// --- One account, opened from a lookup -------------------------------------
//
// The console could find a record and then show four columns about it. The
// overview RPCs that answer "who is this and what state are they in" had been
// contract-read but never rendered.

const detail = readWeb('components', 'account-detail.tsx');
const accounts = readWeb('lib', 'console-accounts.ts');
const auditPage = readWeb('app', 'admin', 'audit', 'page.tsx');
const consoleCopy = readWeb('lib', 'app-copy.ts');
const inBoth = (key: string) => consoleCopy.split(`${key}:`).length === 3;

// The capability each overview demands, asserted against the database.
for (const [rpc, capability] of Object.entries({
  get_staff_customer_overview: 'view_safe_customer_profile',
  get_staff_worker_overview: 'view_safe_worker_profile',
})) {
  const body = migrations.slice(migrations.lastIndexOf(`function public.${rpc}`));
  check(body.slice(0, 900).includes(`require_staff_capability('${capability}')`),
    `${rpc} REALLY DOES REQUIRE ${capability} IN THE DATABASE`);
  check(new RegExp(`rpc\\('${rpc}'`).test(detail), `and the console calls ${rpc}`);
}

// Contact details and money are separate capabilities, and the server says so.
check(/'view_contact_details' = any\(v_caps\)/.test(migrations),
  'CONTACT DETAILS ARE GATED BY A SEPARATE CAPABILITY IN THE DATABASE');
check(/'view_financial_ledger' = any\(v_caps\)/.test(migrations),
  'and the financial ledger by another one');
check(/contactVisible/.test(accounts) && /financialVisible/.test(accounts),
  'the payload parser carries both visibility flags');
check(/contactVisible\s*$\n?\s*\?/m.test(accounts) || /contactVisible\s*\n?\s*\?/.test(accounts),
  'and only populates contact when the server said it was visible');
check(/detailContactWithheld/.test(detail) && /detailFinancialWithheld/.test(detail),
  'AND THE CONSOLE SAYS "WITHHELD" RATHER THAN RENDERING AN EMPTY FIELD');
check(inBoth('detailContactWithheld') && inBoth('detailFinancialWithheld'),
  'in both languages');

// Opening an overview is itself audited, so it must not be prefetched.
check(/staff_log_access\(v_actor, 'customer_overview'/.test(migrations),
  'OPENING A CUSTOMER OVERVIEW IS LOGGED SERVER-SIDE');
check(/staff_log_access\(v_actor, 'worker_overview'/.test(migrations),
  'and so is opening a worker overview');
check(/setOpen\(\{ kind: overviewKind, id: row\.id \}\)/.test(usersPage),
  'so the console loads one only when an operator asks for it');
check(!/useEffect[\s\S]{0,200}get_staff_customer_overview/.test(usersPage),
  'and never prefetches overviews for a page of results');

// Still a lookup, not a directory: no per-account route was introduced.
check(!existsSync(join('web', 'app', 'admin', 'users', '[id]')),
  'THERE IS NO PER-ACCOUNT URL, SO THE LOOKUP CANNOT BECOME A DIRECTORY');
check(/overviewKindFor/.test(usersPage),
  'and only the two kinds with an overview behind them offer a control');
check(/if \(kind === 'account'\) return 'customer'/.test(accounts),
  'mapping the lookup kind to the right overview');

// Money crosses as minor-unit strings and is formatted by the shared module.
check(/pg_catalog\.sum\(e\.net_minor\)[\s\S]{0,120}::text/.test(migrations),
  'the server sends money as text, because a piastre count outgrows a JS number');
check(/pendingMinor: text\(money\.pendingMinor\)/.test(accounts),
  'and the parser keeps it a string');
check(/from '@\/src\/payments\/money'/.test(detail),
  'AND THE CONSOLE FORMATS IT WITH THE SHARED MONEY MODULE');
check(!/\/ 100|toFixed\(2\)|Number\(.*Minor/.test(strip(detail)),
  'rather than dividing by a hundred itself');

// Refusal and absence are different answers.
check(/'refused' \| 'not_found' \| 'failed'/.test(accounts),
  'A REFUSAL AND A MISSING RECORD ARE DISTINGUISHED');
check(inBoth('detailRefused') && inBoth('detailNotFound'),
  'and each has its own sentence in both languages');

// --- Audit linkage ---------------------------------------------------------
//
// `staff_audit_search` has taken `p_actor_id` and `p_entity_id` since WPS-017.
// The page never passed them, so investigating one account meant reading pages
// of unrelated entries.
check(/p_actor_id uuid default null, p_entity_id uuid default null/.test(migrations),
  'THE AUDIT SEARCH ACCEPTS ACTOR AND ENTITY FILTERS IN THE DATABASE');
check(/p_entity_id: UUID\.test\(entityId\) \? entityId : null/.test(auditPage),
  'AND THE CONSOLE NOW PASSES THEM');
check(/p_actor_id: UUID\.test\(actorId\) \? actorId : null/.test(auditPage),
  'both of them');
check(/detailOpenAudit/.test(detail) && /onOpenAudit/.test(usersPage),
  'and an account detail can hand its subject to the trail');
check(/\/audit\?entity=/.test(usersPage), 'through the address the audit page reads');
check(/UUID\.test\(value\) \? value : ''/.test(auditPage),
  'which is ignored unless it is a real identifier, so nothing arbitrary reaches an RPC');
check(inBoth('auditSubject') && inBoth('auditActor') && inBoth('auditIdentifierIgnored'),
  'and the new filters are named in both languages');

// The audit view stays read-only. This is the property that matters most here.
check(!/\.rpc\('staff_(?!audit_search)/.test(strip(auditPage)),
  'THE AUDIT PAGE STILL CALLS NOTHING BUT THE SEARCH');
check(!/insert|update|delete/i.test(strip(auditPage)),
  'and has no write path of any kind');

// Every state and restriction the overviews can return has a sentence.
for (const key of ['accountStatus_active', 'accountStatus_deleted',
  'trust_good_standing', 'trust_restricted', 'trust_suspended', 'trust_banned',
  'restriction_marketplaceRemoved', 'restriction_communicationRestricted',
  'restriction_reviewRestricted', 'restriction_paymentHold']) {
  check(inBoth(key), `the console names "${key}" in both languages`);
}

console.log(`Admin console: ${checks} checks passed.`);
