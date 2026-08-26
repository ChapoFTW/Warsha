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
import { buildCapabilityHelp, capabilityLabel } from '../web/lib/capabilities.ts';
import { parseGrantCandidate } from '../web/lib/console-payloads.ts';
import {
  BINDABLE_ENVIRONMENTS, bindingOffer, bindingReasonValid, parseVerification,
  projectRefFromSupabaseUrl, summarizeVerification,
} from '../web/lib/platform.ts';
import {
  createPendingReauthStore, MAX_REAUTH_RETRIES, PENDING_REAUTH_TTL_MS,
} from '../web/lib/pending-reauth.ts';
import { runGovernedAction, type InFlightLatch } from '../web/lib/governed-action.ts';
import {
  actionAvailability, activationSteps, activationSubject, featureFlagEnabled,
  MAPS_FEATURE_FLAG, providerHealthVerified, providerPolicyState, VISION_PROVIDER_KEY,
  VISION_REQUIRED_LEGAL_DOCUMENTS,
} from '../web/lib/providers.ts';
import { environmentBinding, parseStaffSession } from '../web/lib/staff.ts';

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
  platform: 'manage_feature_flags',
  providers: 'review_legal_governance',
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
  staff_bind_platform_environment: 'manage_feature_flags',
  verify_platform_release: 'view_audit_logs',
  staff_activate_external_provider: 'manage_subprocessors',
  staff_set_feature_flag: 'manage_feature_flags',
};
for (const [rpc, capability] of Object.entries(RPC_CAPABILITY)) {
  const body = migrations.slice(migrations.indexOf(`function public.${rpc}`));
  check(body.slice(0, 900).includes(`require_staff_capability('${capability}')`),
    `${rpc} REALLY DOES REQUIRE ${capability} IN THE DATABASE`);
}

// --- Capability-free staff may read the dashboard and internal manual -------
const nobody = parseStaffSession({ isStaff: true, platformReady: true, capabilities: [] });
equal(visibleAreas(nobody).map((a) => a.key), ['dashboard', 'help'],
  'A STAFF ACCOUNT WITH NO CAPABILITIES IS OFFERED ONLY NON-PRIVILEGED AREAS');
for (const href of ['/users', '/verification', '/staff', '/audit']) {
  check(!mayEnter(nobody, href), `${href} is not offered without its capability`);
}

const support = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['safe_search'],
});
equal(visibleAreas(support).map((a) => a.key), ['dashboard', 'users', 'help'],
  'a capability grants exactly its own area and no other');
check(mayEnter(support, '/users'), 'the granted area is reachable');
check(!mayEnter(support, '/staff'),
  'SEARCHING USERS DOES NOT IMPLY MANAGING STAFF ROLES');
check(!mayEnter(support, '/audit'), 'nor reading the audit log');

const anonymous = parseStaffSession(null);
equal(visibleAreas(anonymous).map((a) => a.key), ['dashboard', 'help'],
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
// It must also carry the call to re-send: this previously passed a bare
// notification, so the dialog reopened and the mutation was lost.
check(/isReauthRefusal\(error\)\) onNeedsReauth\('\w+', \(\) => \{ void \w+\(\); \}\)/.test(actions),
  'A FRESHNESS REFUSAL ON A MUTATION CARRIES THE CALL TO RE-SEND, NOT JUST A SIGNAL');
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

// --- Vetting decisions and enforcement ------------------------------------
//
// The finding that shaped this: **there is no product role to grant.** A search
// of every migration for a staff RPC that adds or removes Customer or Worker
// access returns nothing, and that is the design rather than a gap. Customer
// access is implied by having an account; worker access is
// `private.worker_capability_active`, a verdict computed from the onboarding
// state machine and the activation gates. So the governed way to give a worker
// access is `activate` — a vetting decision — and the way to take it away is
// `suspend`, `reject`, or an enforcement action.

const decisions = readWeb('lib', 'console-decisions.ts');
const decisionPanel = readWeb('components', 'vetting-decision.tsx');
const enforcementPanel = readWeb('components', 'enforcement-action.tsx');
const workerCase = readWeb('components', 'worker-case.tsx');

check(!/create or replace function public\.staff_(grant|revoke|set)_product_role/.test(migrations),
  'THERE IS NO PRODUCT-ROLE GRANT RPC IN THE DATABASE');
check(/private\.worker_capability_active/.test(migrations),
  'because worker access is a computed verdict');
// Comments stripped: `console-decisions.ts` explains at length why no such RPC
// exists, and naming the thing that must not be built is the documentation.
check(!/staff_grant_product_role|staff_set_product_role|grant_customer_role/.test(
  strip(decisions) + strip(decisionPanel) + strip(enforcementPanel) + strip(workerCase)),
  'AND THE CONSOLE INVENTS NO SUCH THING');
check(/productRolesFor/.test(readWeb('lib', 'account.ts')),
  'the client still derives product roles from server state');

// Capability follows the decision. Copied from the migration, asserted against it.
const decisionFn = migrations.slice(migrations.indexOf('function public.staff_worker_vetting_decision'));
for (const [decision, capability] of Object.entries({
  approve: 'review_criminal_records',
  activate: 'activate_worker',
  reject: 'reject_worker_application',
  suspend: 'reject_worker_application',
  request_correction: 'review_worker_vetting',
  start_identity_review: 'review_identity_verification',
})) {
  check(decisionFn.slice(0, 1600).includes(`when '${decision}' then '${capability}'`),
    `the database maps ${decision} to ${capability}`);
  check(new RegExp(`${decision}: '${capability}'`).test(decisions),
    `AND THE CONSOLE USES THE SAME CAPABILITY FOR ${decision}`);
}

// Only legal transitions are offered.
check(/worker_transition_allowed/.test(migrations),
  'the database has a transition table');
check(/STAFF_TRANSITIONS/.test(decisions),
  'and the console mirrors the staff branch of it');
check(/decisionsFrom/.test(decisionPanel),
  'SO A DECISION THE STATE MACHINE WOULD REFUSE IS NEVER OFFERED');
check(/criminal_record_under_review: \['approved'/.test(decisions),
  'including the certificate-review branch, which is the fiddly one');

// Adverse decisions demand evidence, and the number is the server's.
check(/adverse decision requires recorded evidence/.test(migrations),
  'the database refuses an adverse decision with no evidence');
check(/coalesce\(p_private_note, ''\)\)\) < 10/.test(migrations),
  'at fewer than ten characters');
check(/EVIDENCE_MIN = 10/.test(decisions), 'AND THE CONSOLE USES TEN');
check(/ADVERSE_DECISIONS[\s\S]{0,80}'reject', 'suspend'/.test(decisions),
  'for exactly the two decisions the database calls adverse');
check(/adverse \|\| evidenceValid/.test(decisionPanel),
  'and will not submit without it');

// Activation gates are shown, never judged.
check(/Activation gates are not satisfied/.test(migrations),
  'the database refuses activation when a gate fails');
check(/'gates-unsatisfied'/.test(decisions) && /decisionGates/.test(decisionPanel),
  'and the console explains that refusal rather than pre-empting it');
check(!/gates\.every|allGatesPass/.test(strip(decisionPanel)),
  'AND NEVER DECIDES FOR ITSELF WHETHER ACTIVATION WILL WORK');

// Enforcement: the vocabulary is the table's check constraints, exactly.
const enforcementTypes = migrations.slice(
  migrations.indexOf('trust_enforcement_actions_type_check'),
  migrations.indexOf('trust_enforcement_actions_reason_check'));
for (const action of ['warning', 'temporary_restriction', 'investigation', 'suspension',
  'permanent_ban', 'marketplace_removal', 'profile_hidden', 'payment_hold',
  'withdrawal_hold', 'communication_restriction', 'review_restriction', 'restoration']) {
  check(enforcementTypes.includes(`'${action}'`), `the table permits ${action}`);
  check(decisions.includes(`'${action}'`), `and the console offers ${action}`);
  check(inBoth(`enforcement_${action}`), `naming it in both languages`);
}
check(/'restoration'/.test(decisions),
  'RESTORATION IS THE BACKEND\'S OWN REVERSAL, AND THE ONLY UNDO OFFERED');
check(!/unban|un_ban|reverse_ban/i.test(strip(enforcementPanel) + strip(decisions)),
  'so no inverse action the schema does not model is invented');

// A permanent ban is a separate authority with two extra constraints.
check(/when p_action_type = 'permanent_ban'\s*\n?\s*then 'approve_permanent_ban'/.test(migrations),
  'a permanent ban needs approve_permanent_ban in the database');
check(/action === 'permanent_ban' \? 'approve_permanent_ban'/.test(decisions),
  'AND THE CONSOLE ASKS FOR THE SAME CAPABILITY');
check(/consume_dual_control\('approve_permanent_ban'/.test(migrations),
  'and consumes dual control');
check(/enforcementDualControl/.test(enforcementPanel), 'which the console says up front');
check(/action_type <> 'permanent_ban' or \(actor_kind = 'staff' and report_id is not null\)/.test(migrations),
  'and must cite an investigated report');
check(/permanentBanRequiresReport/.test(decisions) && /needsReport/.test(enforcementPanel),
  'which the console requires before it will submit');
check(/action_type <> 'permanent_ban' or expires_at is null/.test(migrations),
  'and may never carry an expiry');
check(/mayCarryExpiry/.test(decisions) && /canExpire \? \(/.test(enforcementPanel),
  'SO THE EXPIRY FIELD IS NOT EVEN SHOWN FOR ONE');

// Enforcement history is immutable, and the console says so before acting.
check(/Enforcement history is immutable/.test(migrations),
  'the database refuses to update an enforcement row');
check(/enforcementImmutable/.test(enforcementPanel) && inBoth('enforcementImmutable'),
  'AND THE CONSOLE WARNS THAT THE ACTION CANNOT BE UNDONE, IN BOTH LANGUAGES');

// Bounds transcribed rather than chosen.
check(/between 3 and 300/.test(migrations) && /PUBLIC_REASON_MAX = 300/.test(decisions),
  'the public reason bound matches the table');
check(/between 3 and 2000/.test(migrations) && /EVIDENCE_SUMMARY_MAX = 2000/.test(decisions),
  'and the evidence bound');
check(/not between 3 and 400/.test(migrations) && /SAFE_REASON_MAX = 400/.test(decisions),
  'and the safe reason bound');

// Idempotency on an action that cannot be undone.
check(/unique \(idempotency_key\)/.test(migrations),
  'the enforcement table is unique on its idempotency key');
check(/p_idempotency_key: idempotencyKey/.test(enforcementPanel),
  'AND THE CONSOLE ALWAYS SENDS ONE');
check(/setIdempotencyKey\(newIdempotencyKey\(\)\)/.test(enforcementPanel),
  'taking a fresh one only after the action is recorded');

// Freshness: a reauth dialog only for a freshness refusal.
for (const panel of [decisionPanel, enforcementPanel]) {
  check(/refusal === 'reauth'/.test(panel),
    'a re-authentication dialog opens ONLY for a freshness refusal');
  check(/ReauthDialog/.test(panel), 'and it is the real one');
}
check(/'capability'/.test(decisions),
  'a capability refusal is a different answer, because re-authenticating cannot fix it');

// The pseudonymous reference is derived, never reversed.
check(/encode\(pg_catalog\.sha256\(pg_catalog\.convert_to\(o\.user_id::text, 'UTF8'\)\), 'hex'\)/
  .test(migrations), 'the server derives the subject reference by SHA-256');
check(/subtle\.digest\('SHA-256'/.test(decisions),
  'AND THE CONSOLE COMPUTES THE SAME HASH FROM A USER ID IT ALREADY HOLDS');
check(/require_staff_capability\('review_worker_vetting'\)/.test(migrations),
  'opening a case still demands the capability');
check(/record_staff_audit\(\s*\n?\s*v_actor, 'review_worker_vetting', 'open_case'/.test(migrations),
  'and still logs the access');

// The OCR trail carries no confidence and no extracted value.
// Asserted against the payload rather than the prose beside it: the
// `extractionRuns` object is built from five fields, and neither a confidence
// value nor an extracted value is one of them.
const vettingDetailSql = fieldsOf('staff_worker_vetting_detail');
const extractionBlock = vettingDetailSql.slice(vettingDetailSql.indexOf("'extractionRuns'"));
check(!/confidence/i.test(extractionBlock.slice(0, 600)),
  'THE VETTING DETAIL SENDS NO CONFIDENCE SCORE');
check(!/'extractedValue'|'fields',/.test(extractionBlock.slice(0, 600)),
  'and no extracted value, so a reviewer must read the document itself');
check(!/confidence/i.test(strip(workerCase).replace(/caseOcrNote/g, '')),
  'AND THE CONSOLE HAS NO CONFIDENCE FIELD TO RENDER');

// Both languages for everything new.
for (const key of ['decisionTitle', 'decisionImpact', 'decisionSafeReason',
  'decisionEvidenceRequired', 'decisionGates', 'decisionReauth', 'decisionDualControl',
  'enforcementTitle', 'enforcementEvidence', 'enforcementReport', 'caseTitle',
  'caseOcrNote', 'decision_approve', 'decision_reject', 'decision_activate']) {
  check(inBoth(key), `the console says "${key}" in both languages`);
}

// --- The console may not misrepresent which data it is showing --------------
// A hosted project is born carrying the `local` bootstrap row, so `local` is
// the truth on a laptop and a configuration fault anywhere else. Reporting it
// as a quiet badge in both cases is what let a hosted console look local.
const bound = (environment?: string) => parseStaffSession({ isStaff: true, environment });

equal(environmentBinding(bound('local'), 'localhost').state, 'labelled',
  'a developer machine may legitimately report local');
equal(environmentBinding(bound('local'), '127.0.0.1').state, 'labelled',
  'the loopback address is a developer machine too');
equal(environmentBinding(bound('local'), 'admin.usewarsha.com'),
  { state: 'misconfigured', reason: 'unbound', reported: 'local' },
  'A HOSTED CONSOLE REPORTING local IS AN UNBOUND BACKEND, NOT A LABEL');
equal(environmentBinding(bound('development'), 'admin.usewarsha.com'),
  { state: 'labelled', label: 'DEVELOPMENT' },
  'a bound development project says so');
equal(environmentBinding(bound('staging'), 'admin.usewarsha.com').state, 'labelled',
  'staging is a bound hosted environment');
equal(environmentBinding(bound('production'), 'admin.usewarsha.com').state, 'production',
  'production is concluded only from the exact string');
equal(environmentBinding(bound(undefined), 'admin.usewarsha.com'),
  { state: 'misconfigured', reason: 'unbound', reported: null },
  'A MISSING ENVIRONMENT IS A FAULT AND IS NEVER READ AS PRODUCTION');
equal(environmentBinding(bound('prod'), 'admin.usewarsha.com'),
  { state: 'misconfigured', reason: 'unknown', reported: 'prod' },
  'an unrecognised environment is a fault, not a near-enough match');
check(environmentBinding(bound(undefined), 'localhost').state === 'misconfigured',
  'even locally, no environment at all is still unbound');

for (const key of ['consoleEnvironmentFault', 'consoleEnvironmentUnbound',
  'consoleEnvironmentUnknown']) {
  check(inBoth(key), `the console explains "${key}" in both languages`);
}

// --- Capability identifiers are not operator-facing vocabulary --------------
equal(capabilityLabel('manage_kill_switches'), 'Manage kill switches',
  'a capability key is spoken as words');
equal(capabilityLabel('view_audit_logs'), 'View audit logs',
  'and reads as a sentence, not an identifier');
const capabilityHelp = buildCapabilityHelp(
  JSON.parse(readFileSync('web/lib/generated-admin-help.json', 'utf8')).articles,
);
check(capabilityHelp('review_privacy_incidents') !== null,
  'a capability offers the manual section that explains it');
check(capabilityHelp('not_a_capability') === null,
  'and claims no explanation it does not have');

// --- Platform environment binding and release verification ------------------
// Both reuse existing database authority. The console decides only what to
// offer; every guard below is also enforced by the RPC.
equal(projectRefFromSupabaseUrl('https://lrhipbcapzfxuwixfoog.supabase.co'),
  'lrhipbcapzfxuwixfoog',
  'the project reference is read from the connection, not typed by an operator');
equal(projectRefFromSupabaseUrl('http://127.0.0.1:54321'), null,
  'a local stack yields no project reference, so no binding is offered');
equal(projectRefFromSupabaseUrl('https://short.supabase.co'), null,
  'a reference that cannot satisfy the RPC is refused before it is offered');
equal(projectRefFromSupabaseUrl(undefined), null, 'and a missing URL offers nothing');

const staff = (environment?: string) => parseStaffSession({ isStaff: true, environment });
equal(bindingOffer(staff('local'), 'lrhipbcapzfxuwixfoog'),
  { kind: 'available', from: 'local', projectRef: 'lrhipbcapzfxuwixfoog' },
  'the one-way transition is offered from the unbound bootstrap row');
equal(bindingOffer(staff('development'), 'lrhipbcapzfxuwixfoog').kind, 'bound',
  'an already-bound project is stated as fact, not offered as an action');
equal(bindingOffer(staff('production'), 'lrhipbcapzfxuwixfoog').kind, 'bound',
  'AND PRODUCTION IS NEVER OFFERED A BINDING CONTROL');
equal(bindingOffer(staff('local'), null).kind, 'unavailable',
  'no project reference means no actionable control: fail closed');
equal(bindingOffer(staff(undefined), 'lrhipbcapzfxuwixfoog').kind, 'unavailable',
  'an unknown environment means no actionable control either');
equal(bindingOffer(parseStaffSession({ isStaff: false }), 'lrhipbcapzfxuwixfoog').kind,
  'unavailable', 'and a non-staff session is offered nothing at all');
check(!(BINDABLE_ENVIRONMENTS as readonly string[]).includes('production'),
  'THE CONSOLE CANNOT TARGET PRODUCTION THROUGH THIS OPERATION');

check(!bindingReasonValid('too short'), 'a reason below the RPC minimum is refused early');
check(bindingReasonValid('Identifying the hosted development backend.'),
  'a meaningful reason is accepted');
check(!bindingReasonValid('x'.repeat(1001)), 'and one beyond the RPC maximum is refused');

const verification = parseVerification({
  environment: 'development', failures: 2, passed: false,
  generatedAt: '2026-08-21T00:00:00Z',
  checks: [
    { check: 'public_tables_without_rls', observed: 0, expected: 0, passed: true, description: 'RLS' },
    { check: 'unowned_rate_limits', observed: 1, expected: 0, passed: false, description: 'rate limits' },
    { check: 'anon_private_grants', observed: 3, expected: 0, passed: false, description: 'private grants' },
  ],
});
check(verification !== null, 'a verification payload is parsed');
const digest = summarizeVerification(verification!);
equal(digest.passed.length, 1, 'passing checks are counted');
equal(digest.expectedFailures.map((entry) => entry.check), ['unowned_rate_limits'],
  'the recorded open gap is reported as expected rather than hidden');
equal(digest.unexpectedFailures.map((entry) => entry.check), ['anon_private_grants'],
  'anything else that fails is unexpected');
check(digest.blocking, 'and an unexpected failure blocks');
check(!summarizeVerification(parseVerification({
  checks: [{ check: 'unowned_rate_limits', observed: 1, expected: 0, passed: false, description: '' }],
})!).blocking,
  'THE KNOWN OPEN GAP ALONE DOES NOT BLOCK A RELEASE');
equal(parseVerification(null), null, 'a missing payload is not invented');

for (const key of ['platformTitle', 'platformEnvHeading', 'platformEnvExplain',
  'platformEnvUnconfigured', 'platformEnvDevelopment', 'platformEnvConfirmOneWay',
  'platformEnvConfirmNoDeploy', 'platformEnvBlocked', 'platformVerifyHeading',
  'platformVerifyExpected', 'platformVerifyUnexpected', 'platformVerifyTechnical',
  'console_platform']) {
  check(inBoth(key), `the platform tools say "${key}" in both languages`);
}

const platformPage = readFileSync('web/app/admin/platform/page.tsx', 'utf8');
check(!/service_role|serviceRole/.test(platformPage),
  'THE PLATFORM TOOLS NEVER REACH FOR A SERVICE ROLE');
check(/rpc\('staff_bind_platform_environment'/.test(platformPage)
  && /rpc\('verify_platform_release'/.test(platformPage),
  'both tools call the existing RPCs rather than mutating tables');
check(/p_expected_current_environment: 'local'/.test(platformPage),
  'the expected-current-environment guard is sent, not omitted');
check(/isReauthRefusal/.test(platformPage),
  'a freshness refusal is recovered in place rather than swallowed');
check(/platformEnvConfirmTitle/.test(platformPage) && /confirming/.test(platformPage),
  'the change requires an explicit confirmation step');

// --- Release verification stays observational -------------------------------
// PostgREST runs a `stable` function in a read-only transaction. A verification
// that writes from inside itself cannot run through the surface built to run it.
const verificationMigration = readFileSync(
  'supabase/migrations/202608220003_read_only_release_verification.sql', 'utf8');
const verifyBody = verificationMigration.slice(
  verificationMigration.indexOf('function public.verify_platform_release'),
  verificationMigration.indexOf('function public.staff_record_release_verification'));
check(/stable/.test(verifyBody),
  'release verification is declared stable');
check(!/staff_log_access|insert\s+into/i.test(verifyBody),
  'AND WRITES NOTHING, SO THE READ-ONLY GUARANTEE IS TRUE');
check(/require_staff_capability\('view_audit_logs'\)/.test(verifyBody),
  'while still refusing a caller without the capability');

const telemetryBody = verificationMigration.slice(
  verificationMigration.indexOf('function public.staff_record_release_verification'));
check(/volatile/.test(telemetryBody),
  'the separated telemetry is volatile, so it is honestly a write');
check(/staff_log_access/.test(telemetryBody),
  'and it is what records the access');
check(/staff_record_release_verification/.test(platformPage),
  'the console records access separately from the verification it displays');


// --- Provider activation follows the database's order, not a friendlier one --
const ready = {
  environment: 'development',
  credentialConfigured: true,
  provider: {
    providerKey: 'google_maps_platform', displayName: 'Google Maps Platform',
    purpose: '', status: 'implemented_awaiting_credential', enabled: false,
    environments: ['local', 'staging', 'development'],
    featureFlag: 'location_provider', killSwitch: 'location_provider',
  },
  request: null,
  featureEnabled: false,
  healthVerified: false,
  mayActivate: true,
  mayManageFlags: true,
};

const pending = activationSteps(ready);
equal(pending.environment, 'done', 'a bound development environment satisfies step one');
equal(pending.credential, 'done', 'a configured credential satisfies step two');
equal(pending.prerequisites, 'done', 'a registered provider with both switches is ready');
equal(pending.approvalRequested, 'ready', 'the operator may raise the approval request');
equal(pending.activate, 'blocked', 'BUT ACTIVATION IS BLOCKED UNTIL SOMEBODY ELSE APPROVES');
equal(pending.feature, 'blocked',
  'AND THE FEATURE CANNOT BE SWITCHED ON BEFORE ACTIVATION');

const raised = activationSteps({
  ...ready,
  request: {
    id: 'r1', capabilityKey: 'manage_subprocessors', actionKey: 'activate_external_provider',
    subjectRef: 'google_maps_platform:development', reason: 'x', environment: 'development',
    requestedAt: null, requestedByName: 'Me', requestedByMe: true,
    approvedAt: null, approvedByName: null, approvalNote: null,
    expiresAt: null, expired: false, canApprove: false,
  },
});
equal(raised.approvalRequested, 'done', 'the raised request is recorded');
equal(raised.approvalGranted, 'waiting',
  'A REQUESTER IS NEVER OFFERED THEIR OWN APPROVAL; IT WAITS FOR SOMEONE ELSE');
equal(raised.activate, 'blocked', 'and activation stays blocked while it waits');

// The second identity is structural: no combination of capabilities makes the
// approval step actionable for the person who raised it.
for (const mayActivate of [true, false]) {
  for (const mayManageFlags of [true, false]) {
    const states = activationSteps({ ...raised === raised ? ready : ready, mayActivate, mayManageFlags,
      request: {
        id: 'r1', capabilityKey: 'manage_subprocessors', actionKey: 'activate_external_provider',
        subjectRef: 'google_maps_platform:development', reason: 'x', environment: 'development',
        requestedAt: null, requestedByName: 'Me', requestedByMe: true,
        approvedAt: null, approvedByName: null, approvalNote: null,
        expiresAt: null, expired: false, canApprove: false,
      } });
    check(states.approvalGranted !== 'ready',
      'NO CAPABILITY COMBINATION LETS A REQUESTER APPROVE THEIR OWN REQUEST');
  }
}

const approved = activationSteps({
  ...ready,
  request: {
    id: 'r1', capabilityKey: 'manage_subprocessors', actionKey: 'activate_external_provider',
    subjectRef: 'google_maps_platform:development', reason: 'x', environment: 'development',
    requestedAt: null, requestedByName: 'Colleague', requestedByMe: false,
    approvedAt: '2026-08-23T00:00:00Z', approvedByName: 'Second', approvalNote: 'ok',
    expiresAt: null, expired: false, canApprove: false,
  },
});
equal(approved.activate, 'ready', 'once a second person approves, activation may proceed');

const live = activationSteps({
  ...ready,
  provider: { ...ready.provider, status: 'active' },
  featureEnabled: false,
});
equal(live.activated, 'done', 'an active provider reports activation complete');
equal(live.feature, 'ready', 'and only then may the feature be switched on');

const unbound = activationSteps({ ...ready, environment: 'local' });
equal(unbound.environment, 'blocked', 'an unbound environment blocks everything');
equal(unbound.activate, 'blocked', 'including activation');

const noCredential = activationSteps({ ...ready, credentialConfigured: false });
equal(noCredential.prerequisites, 'blocked',
  'a missing credential blocks the prerequisites step');

// Identity extraction has a second kind of prerequisite. Its own register says
// no identity document may reach the provider until the material legal changes,
// provider agreement and processing-basis review are complete. The database
// activation RPC does not infer those facts, so the console must not invite an
// operator to request activation while the governance overview says otherwise.
const visionPolicyPayload = ({ readyForIdentityData }: { readyForIdentityData: boolean }) => ({
  documents: VISION_REQUIRED_LEGAL_DOCUMENTS.map((documentKey) => ({
    documentKey,
    versionCount: readyForIdentityData ? 2 : 1,
    changeClass: readyForIdentityData ? 'material' : 'initial',
  })),
  subprocessors: [{
    key: VISION_PROVIDER_KEY,
    agreementStatus: readyForIdentityData ? 'signed' : 'not_started',
    trainingProhibited: true,
  }],
  processingActivities: [{
    key: 'worker_verification',
    reviewStatus: readyForIdentityData ? 'approved' : 'pending',
  }],
  aiUses: [{
    key: 'identity_text_extraction', status: 'approved_not_integrated',
    coversIdentityData: true, permittedForTraining: false,
  }],
  configuration: { reconsentEnforced: readyForIdentityData },
});
const blockedVisionPolicy = providerPolicyState(
  VISION_PROVIDER_KEY, visionPolicyPayload({ readyForIdentityData: false }));
check(!blockedVisionPolicy.ready,
  'VISION POLICY READINESS IS FALSE WHILE MATERIAL HUMAN GOVERNANCE IS PENDING');
check(blockedVisionPolicy.trainingProhibited && blockedVisionPolicy.aiUseApproved,
  'existing no-training and assistive-use controls are preserved independently');

const visionReady = {
  ...ready,
  provider: {
    ...ready.provider,
    providerKey: VISION_PROVIDER_KEY,
    displayName: 'Google Cloud Vision',
    featureFlag: 'identity_extraction',
    killSwitch: 'identity_extraction',
  },
  policyReady: blockedVisionPolicy.ready,
  automaticHealthProbe: false,
};
const visionBlocked = activationSteps(visionReady);
equal(visionBlocked.prerequisites, 'blocked',
  'THE VISION ACTIVATION WORKFLOW STAYS CLOSED AT THE LEGAL GATE');
equal(visionBlocked.approvalRequested, 'blocked',
  'and cannot raise a technical approval request before that gate');
equal(activationSteps({
  ...visionReady,
  provider: { ...visionReady.provider, status: 'active' },
  featureEnabled: false,
}).feature, 'blocked',
  'AN OUT-OF-BAND REGISTRY ACTIVATION STILL CANNOT OPEN THE FEATURE ACTION');

const approvedVisionPolicy = providerPolicyState(
  VISION_PROVIDER_KEY, visionPolicyPayload({ readyForIdentityData: true }));
check(approvedVisionPolicy.ready,
  'Vision becomes policy-ready only when every observable commitment is ready');
equal(activationSteps({ ...visionReady, policyReady: approvedVisionPolicy.ready })
  .approvalRequested, 'ready',
  'then the existing dual-control request is the next step, never bypassed');

const liveVision = activationSteps({
  ...visionReady,
  policyReady: true,
  provider: { ...visionReady.provider, status: 'active' },
  featureEnabled: true,
});
equal(liveVision.health, 'waiting',
  'VISION OFFERS NO BROWSER HEALTH ACTION THAT WOULD PROCESS OR BILL A DOCUMENT');
check(providerHealthVerified([{
  providerKey: VISION_PROVIDER_KEY,
  lastSuccessAt: '2026-08-27T10:00:00Z',
}], VISION_PROVIDER_KEY),
  'a later synthetic device success is observable without making another OCR call');
check(!providerHealthVerified([{
  providerKey: VISION_PROVIDER_KEY,
  lastSuccessAt: null,
}], VISION_PROVIDER_KEY),
  'an untested provider is never reported as verified');

equal(activationSubject('google_maps_platform', 'development'),
  'google_maps_platform:development',
  'the dual-control subject matches what the activation RPC consumes');

// --- The page shows no credential material ----------------------------------
const providersPage = readFileSync('web/app/admin/providers/page.tsx', 'utf8');
// Comments explain what is deliberately absent, so they are stripped before
// asserting that the rendered surface names none of it.
const providersRendered = strip(providersPage);
check(!/service_role|SERVICE_ROLE/i.test(providersPage),
  'the provider page reaches for no service role');
check(!/GOOGLE_MAPS_SERVER_KEY|GOOGLE_MAPS_SERVER_API_KEY|digest/i.test(providersRendered),
  'AND NAMES NO SECRET, NO ENVIRONMENT VARIABLE, AND NO DIGEST');
// The probe moved into `lib/providers.ts` when the page stopped being
// Maps-only: a credential lives in an Edge Function's runtime, so each provider
// answers its own capability question. The rule is unchanged and now applies to
// both — a boolean, never a value.
const providersLib = readFileSync('web/lib/providers.ts', 'utf8');
check(/serverCredentialAvailable/.test(providersLib)
  && /credentialConfigured/.test(providersLib),
  'it asks only whether a credential is configured');
// Secret NAMES, not provider keys: `google_cloud_vision` is a public
// identifier the registry is supposed to carry, while
// `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` is the thing that must never appear.
check(!/GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT|GOOGLE_MAPS_SERVER_KEY|GOOGLE_MAPS_SERVER_API_KEY|private_key|digest/i
  .test(strip(providersLib)),
  'AND THE PROBE REGISTRY NAMES NO SECRET AND NO ENVIRONMENT VARIABLE');
check(/credentialProbe/.test(providersPage),
  'the page reads the probe through that registry rather than hardcoding one provider');

// Both governed providers are reachable, or the OCR activation has no screen.
for (const key of ['google_maps_platform', 'google_cloud_vision']) {
  check(providersLib.includes(`'${key}'`), `${key} is a governed provider the console can drive`);
}
check(/automaticHealthProbe: false/.test(providersLib),
  'A PROVIDER WITH NO HARMLESS TEST DOES NOT GET A TEST BUTTON');
check(/if \(!governed\.automaticHealthProbe\) return;/.test(providersPage),
  'and the health runner refuses it in code, not only in the markup');
check(/rpc\('staff_legal_governance_overview'/.test(providersPage)
  && /policyReady: policy\.ready/.test(providersPage),
  'the Vision sequence reads the existing legal authority and feeds it into the gate');
check(/rpc\('staff_provider_health'/.test(providersPage)
  && /providerHealthVerified/.test(providersPage),
  'device health is re-read from the staff-only rollup without another provider call');
check(/providerWords\('providerMapsName'\)/.test(providersPage)
  && /providerWords\('providerMapsPurpose'\)/.test(providersPage)
  && /providerWords\('providerApprovalWhy'\)/.test(providersPage)
  && /providerWords\('providerFeatureTitle'\)/.test(providersPage),
  'provider-specific identity copy replaces Maps wording throughout the Vision view');

for (const key of [
  'providerMapsName_vision', 'providerMapsPurpose_vision',
  'providerStepWhy_prerequisites_vision', 'providerApprovalWhy_vision',
  'providerFeatureTitle_vision', 'providerFeatureBody_vision',
  'providerFeatureAction_vision', 'providerHealthTitle_vision',
  'providerHealthAction_vision', 'providerPolicyWhy_vision',
  'providerPolicyDocuments', 'providerPolicyAgreement',
  'providerPolicyProcessingBasis', 'providerPolicyTraining',
  'providerPolicyAiUse', 'providerPolicyReconsent',
]) {
  check(key in appCopy.en, `${key} has English provider copy`);
  check(key in appCopy.ar, `${key} has Arabic provider copy`);
  check(key in appCopy.fr, `${key} has French provider copy`);
}

// Generalising the page must not have loosened the governance it renders.
for (const rpc of ['staff_request_dual_control', 'staff_approve_dual_control',
  'staff_activate_external_provider', 'staff_set_feature_flag']) {
  check(providersPage.includes(rpc), `${rpc} is still the only way this page acts`);
}
check(/state\.approvalGranted = approved \? 'done' : requested \? 'waiting' : 'blocked';/
  .test(providersLib),
  'AND THE SECOND APPROVAL IS STILL NEVER READY FOR THE PERSON WHO REQUESTED IT');
check(/staff_request_dual_control/.test(providersPage)
  && /staff_approve_dual_control/.test(providersPage)
  && /staff_activate_external_provider/.test(providersPage)
  && /staff_set_feature_flag/.test(providersPage),
  'every action reuses an existing governed authority');

const queueMigration = readFileSync(
  'supabase/migrations/202608230001_dual_control_queue.sql', 'utf8');
check(/\bstable\b/.test(queueMigration) && !/insert\s+into|staff_log_access/i.test(queueMigration),
  'the approval queue is read-only, so it runs in PostgREST read-only transactions');
check(/r\.capability_key = any\(v_capabilities\)/.test(queueMigration),
  'THE QUEUE SHOWS ONLY REQUESTS THE VIEWER ALREADY HOLDS THE CAPABILITY FOR');
check(/r\.requested_by <> v_actor/.test(queueMigration),
  'and never marks a requester able to approve their own request');


// --- Staff role grants: choosing an account, never transcribing one ----------
// `manage_staff_roles` could grant a role but not identify anyone to grant it
// to, because general account search belongs to `safe_search`, which
// `security_administrator` deliberately does not hold.
equal(parseGrantCandidate({ found: false }), null,
  'an unknown address yields no candidate rather than a blank one');
equal(parseGrantCandidate(null), null, 'and a missing payload is not invented');

const candidate = parseGrantCandidate({
  found: true,
  accountId: 'a1700000-0000-4000-8000-000000000002',
  displayName: 'Support Agent',
  emailMasked: 'w•••••@test.local',
  accountStatus: 'good_standing',
  staffRoles: ['support_agent'],
  isSelf: false,
});
check(candidate !== null, 'a found account parses');
equal(candidate!.accountId, 'a1700000-0000-4000-8000-000000000002',
  'THE CANONICAL UUID IS CARRIED INTERNALLY FOR SUBMISSION');
equal(candidate!.staffRoles, ['support_agent'],
  'existing staff roles are shown so a grant is not duplicated blindly');
check(!('email' in (candidate as object)) && !('phone' in (candidate as object)),
  'and no raw contact detail is carried at all');

const grantForm = readFileSync('web/components/staff-role-actions.tsx', 'utf8');
check(/staff_lookup_grant_candidate/.test(grantForm),
  'the grant form uses the governed lookup authority');
check(!/staff_safe_search/.test(grantForm),
  'AND NOT THE BROADER ACCOUNT SEARCH IT IS NOT ENTITLED TO');
check(/type="email"/.test(grantForm),
  'the operator identifies the account by email, not by identifier');
check(/clearCandidate/.test(grantForm) && /grantChooseDifferent/.test(grantForm),
  'A WRONGLY CHOSEN ACCOUNT CAN BE CLEARED BEFORE SUBMISSION');
check(/candidate\.isSelf/.test(grantForm),
  'the operators own account is flagged before they compose the grant');
check(/isSelfGrant\(session\.staffId, subject\)/.test(grantForm),
  'and the self-grant refusal remains in the submit path');
check(!/grantSubjectHelpNoSearch/.test(grantForm),
  'the raw account-id fallback is no longer the workflow');

const lookupMigration = readFileSync(
  'supabase/migrations/202608230002_staff_grant_candidate_lookup.sql', 'utf8');
check(/require_staff_capability\('manage_staff_roles'\)/.test(lookupMigration),
  'the lookup is gated on the grant capability itself');
check(/enforce_rate_limit\('staff_grant_lookup'/.test(lookupMigration),
  'it is rate limited so a privileged account cannot test addresses in bulk');
check(/Wildcard lookup is not permitted/.test(lookupMigration),
  'IT CANNOT BE TURNED INTO A SEARCH');
check(/emailMasked/.test(lookupMigration) && !/'email',/.test(lookupMigration),
  'and it returns a masked address rather than the real one');


// --- A governed action is never silently inert -------------------------------
// The Providers "Activate provider" button did nothing when clicked: no request,
// no error, no dialog. Every action was gated on one `busy` flag that `load()`
// could strand — it set the flag, had no try/finally, and any throwing read
// skipped the reset. The step list still said "You can do this now" because it
// never consulted that flag, so a disabled button looked like a broken one.
equal(actionAvailability('ready', null, false), { enabled: true },
  'a ready step with nothing in flight is pressable');
equal(actionAvailability('ready', null, true),
  { enabled: false, reason: 'refreshing' },
  'A READY STEP BLOCKED BY A REFRESH SAYS SO RATHER THAN GOING QUIET');
equal(actionAvailability('ready', 'activate', false),
  { enabled: false, reason: 'another-action' },
  'and a step blocked by another action says that instead');
// The two structural refusals used to be folded into one silent `not-ready`
// the surface said nothing about, on the grounds that they were self-evident.
// They are not: a greyed button with no sentence beside it reads as broken
// whether it is blocked, unpermitted, or genuinely dead.
equal(actionAvailability('blocked', null, false),
  { enabled: false, reason: 'blocked' },
  'A STEP BLOCKED BEHIND AN EARLIER ONE SAYS THAT, RATHER THAN GOING QUIET');
equal(actionAvailability('waiting', null, false),
  { enabled: false, reason: 'waiting' },
  'AND ONE WAITING ON A PERMISSION THE OPERATOR LACKS SAYS THAT INSTEAD');
equal(actionAvailability('done', null, false),
  { enabled: false, reason: 'done' },
  'and a finished step says it is finished');

// EVERY refusal carries a reason the surface can render. No exceptions: this
// is the invariant that stops a dead control from ever being shippable again.
for (const step of ['done', 'blocked', 'waiting', 'ready'] as const) {
  for (const busyKey of [null, 'feature'] as const) {
    for (const refresh of [false, true] as const) {
      const availability = actionAvailability(step, busyKey, refresh);
      check(availability.enabled || typeof availability.reason === 'string',
        'EVERY UNAVAILABLE ACTION CARRIES A STATEABLE REASON');
    }
  }
}

const providersSource = readFileSync('web/app/admin/providers/page.tsx', 'utf8');
check(/setRefreshing\(false\);\s*\n\s*\}/.test(providersSource),
  'THE REFRESH CLEARS ITS FLAG IN A FINALLY, SO IT CANNOT STRAND THE PAGE');
// The action path's finally now lives in the shared runner, which is where the
// guarantee belongs: every governed button on every page inherits it instead of
// each page having to remember. What stays here are the page's own handlers.
check((providersSource.match(/\}\s*finally\s*\{/g) ?? []).length >= 2,
  'the page handlers it still owns clear their flags in a finally');
const runnerSource = readWeb('lib', 'governed-action.ts');
check(/\}\s*finally\s*\{/.test(runnerSource)
  && /latch\.current = false;/.test(runnerSource)
  && /ports\.setBusy\(null\);/.test(runnerSource),
  'THE SHARED RUNNER RELEASES THE LATCH AND THE LOADING FLAG IN A FINALLY');
check(/catch \(reason\)/.test(runnerSource) && /failedMessage/.test(runnerSource),
  'A THROWN ACTION STILL REPORTS, RATHER THAN LEAVING A DEAD BUTTON');
check(/providerActionFailed/.test(providersSource),
  'and the page supplies the words that failure is reported in');
check(/providerLoadFailed/.test(providersSource),
  'and a failed read is reported instead of silently disabling everything');
check(!/enabled=\{states\.\w+ === 'ready' && busy === null\}/.test(providersSource),
  'no action is gated on the raw global flag any more');
check(!/availability\.reason !== 'not-ready'/.test(providersSource),
  'the surface no longer suppresses any refusal as self-evident');
check(/\{!availability\.enabled \? \(/.test(providersSource),
  'EVERY DISABLED GOVERNED BUTTON RENDERS THE REASON IT IS DISABLED');
for (const key of [
  'providerLoadFailed', 'providerBusyRefreshing', 'providerBusyOtherAction',
  'providerBusyBlocked', 'providerBusyWaiting', 'providerBusyDone',
  'providerActionDone',
]) {
  check(inBoth(key), `the console explains "${key}" in both languages`);
}

// --- The page must be able to see the change it just made -------------------
// "Turn on address search" was the third dead control on this page, and the
// only one where the authority had actually run. `staff_set_feature_flag`
// succeeded, wrote its audit row and its history entry — and then the page
// re-read the flags, matched on `flag_key`, found nothing (the RPC emits
// `flagKey`, like every other staff payload), and redrew "Off" and "You can do
// this now". Every visible fact was identical before and after. A working
// action the surface cannot perceive is a dead button.
const flagsFn = migrations.slice(
  migrations.indexOf('function public.get_staff_feature_flags'));
const flagsBody = flagsFn.slice(0, flagsFn.indexOf('$$;'));
check(/'flagKey'/.test(flagsBody),
  'get_staff_feature_flags emits flagKey, the console-wide camelCase');
check(!/'flag_key'/.test(flagsBody),
  'AND NEVER flag_key — THE SPELLING THE PAGE USED TO MATCH ON');

// Built from the key names the migration itself emits, so the reader cannot
// drift away from the payload again without this failing.
const emittedFlagFields = [...flagsBody.matchAll(/'([A-Za-z_]+)',\s*f\./g)].map((m) => m[1]);
check(emittedFlagFields.includes('flagKey') && emittedFlagFields.includes('environment')
  && emittedFlagFields.includes('enabled'),
  'the payload carries the three fields the console matches on');
const livePayload = [
  { flagKey: MAPS_FEATURE_FLAG, environment: 'development', enabled: true },
  { flagKey: MAPS_FEATURE_FLAG, environment: 'production', enabled: false },
  { flagKey: 'other_flag', environment: 'development', enabled: true },
];
check(featureFlagEnabled(livePayload, MAPS_FEATURE_FLAG, 'development'),
  'THE CONSOLE READS THE FLAG THE RPC ACTUALLY RETURNS');
check(!featureFlagEnabled(livePayload, MAPS_FEATURE_FLAG, 'production'),
  'and an enabled development flag never reports production as on');
check(!featureFlagEnabled(livePayload, MAPS_FEATURE_FLAG, null),
  'an unbound environment resolves no flag at all');
check(!featureFlagEnabled([], MAPS_FEATURE_FLAG, 'development'),
  'an empty payload is off, not a crash');
// The regression itself, stated as a fact: the old reader against the real shape.
check(livePayload.every((row) => (row as Record<string, unknown>).flag_key === undefined),
  'THE PAYLOAD HAS NO flag_key, WHICH IS WHY THE OLD MATCH ALWAYS MISSED');

// Once the page can see the flag, the sequence advances instead of looping.
const switchedOn = activationSteps({
  ...ready,
  provider: { ...ready.provider, status: 'active' },
  featureEnabled: featureFlagEnabled(livePayload, MAPS_FEATURE_FLAG, 'development'),
});
equal(switchedOn.feature, 'done',
  'A SUCCESSFUL SWITCH-ON IS REPORTED AS DONE, NOT OFFERED AGAIN');
equal(switchedOn.health, 'ready',
  'and only a visible switch-on unblocks the health check that follows it');
equal(activationSteps({
  ...ready, provider: { ...ready.provider, status: 'active' }, featureEnabled: false,
}).health, 'blocked',
  'while an unseen switch-on strands the rest of the sequence — the reported symptom');


// --- One governed action, and what it says happened -------------------------
// Driven for real: the runner is free of React precisely so this can call it.
type Trace = {
  busy: (string | null)[]; errors: (string | null)[]; done: (string | null)[];
  refreshes: number; remembered: string[]; calls: number;
};
function harness(result: () => Promise<{ error: unknown } | void>) {
  const trace: Trace = {
    busy: [], errors: [], done: [], refreshes: 0, remembered: [], calls: 0,
  };
  const latch: InFlightLatch = { current: false };
  const action = async () => { trace.calls += 1; return result(); };
  const ports = {
    setBusy: (key: string | null) => { trace.busy.push(key); },
    setError: (message: string | null) => { trace.errors.push(message); },
    setDone: (message: string | null) => { trace.done.push(message); },
    refresh: async () => { trace.refreshes += 1; },
    isReauthRefusal: (failure: unknown) => (failure as { code?: string })?.code === 'reauth',
    rememberReauth: (key: string) => { trace.remembered.push(key); },
    failedMessage: 'refused',
    doneMessage: 'done',
  };
  return { trace, latch, action, ports };
}

// An actionable toggle invokes its authority, shows a loading state, refreshes,
// and says it succeeded.
{
  const { trace, latch, action, ports } = harness(async () => undefined);
  const outcome = await runGovernedAction(latch, 'feature', action, ports);
  equal(outcome, 'done', 'an actionable feature toggle completes');
  equal(trace.calls, 1, 'AND INVOKES ITS AUTHORITY EXACTLY ONCE');
  equal(trace.busy, ['feature', null], 'THE LOADING STATE APPEARS AND IS CLEARED');
  equal(trace.refreshes, 1, 'SUCCESS RE-READS THE HOSTED STATE');
  equal(trace.done.at(-1), 'done',
    'AND SAYS SO OUT LOUD RATHER THAN LEAVING THE OPERATOR TO INFER IT');
  equal(trace.errors, [null], 'no failure is reported for a success');
  equal(latch.current, false, 'and the latch is released');
}

// A refusal is visible. It is never swallowed into a silent no-op.
{
  const refusal = 'Feature flags must target the current platform environment';
  const { trace, latch, action, ports } = harness(async () => ({ error: { message: refusal } }));
  const outcome = await runGovernedAction(latch, 'feature', action, ports);
  equal(outcome, 'failed', 'a refused toggle reports failure');
  equal(trace.errors.at(-1), refusal,
    'THE SERVER OWN REFUSAL IS WHAT THE OPERATOR READS');
  equal(trace.refreshes, 0, 'a refusal does not claim to have re-read anything');
  equal(trace.done.at(-1), null, 'and nothing announces success');
  equal(latch.current, false, 'the latch is released after a refusal');
}

// A throw is a failure too. Silence here is what made a button look broken.
{
  const { trace, latch, action, ports } = harness(async () => {
    throw new Error('network unreachable');
  });
  const outcome = await runGovernedAction(latch, 'feature', action, ports);
  equal(outcome, 'failed', 'a thrown action reports failure');
  equal(trace.errors.at(-1), 'network unreachable', 'AND SAYS WHAT WENT WRONG');
  equal(trace.busy.at(-1), null, 'a throw still clears the loading state');
  equal(latch.current, false, 'and still releases the latch');
}

// A freshness refusal is held for retry, not shown as a dead end.
{
  const { trace, latch, action, ports } = harness(async () => ({ error: { code: 'reauth' } }));
  const outcome = await runGovernedAction(latch, 'feature', action, ports);
  equal(outcome, 'reauth', 'a freshness refusal is recognised as resolvable');
  equal(trace.remembered, ['feature'], 'and the exact call is held for re-sending');
  equal(trace.errors.at(-1), null, 'it is not reported as a plain failure');
}

// Duplicate clicks cannot produce duplicate state changes.
{
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { trace, latch, action, ports } = harness(async () => { await gate; });
  // Both clicks are dispatched before the first has settled — the case React
  // state cannot cover, because `disabled` only updates on the next render.
  const first = runGovernedAction(latch, 'feature', action, ports);
  const second = await runGovernedAction(latch, 'feature', action, ports);
  equal(second, 'duplicate', 'A SECOND CLICK IS REFUSED WHILE THE FIRST IS IN FLIGHT');
  equal(trace.calls, 1, 'AND NEVER REACHES THE AUTHORITY, SO NO SECOND AUDIT ROW EXISTS');
  release!();
  equal(await first, 'done', 'the first click still completes normally');
  equal(trace.calls, 1, 'still exactly one call to the authority');
  equal(trace.refreshes, 1, 'and exactly one re-read');
  // Only once it has settled is the action offered again.
  equal(await runGovernedAction(latch, 'feature', action, ports), 'done',
    'a later, deliberate second change is allowed');
  equal(trace.calls, 2, 'because the latch gates concurrency, not intent');
}

// The runner releases its latch on every terminal path, so no outcome can
// strand the page in the state that started this whole class of defect.
const terminalPaths: (() => Promise<{ error: unknown } | void>)[] = [
  async () => undefined,
  async () => ({ error: { message: 'no' } }),
  async () => ({ error: { code: 'reauth' } }),
  async () => { throw new Error('x'); },
];
for (const path of terminalPaths) {
  const { trace, latch, action, ports } = harness(path);
  await runGovernedAction(latch, 'feature', action, ports);
  check(latch.current === false && trace.busy.at(-1) === null,
    'NO OUTCOME LEAVES A GOVERNED ACTION LATCHED OR A BUTTON STUCK LOADING');
}

// The page routes its actions through that runner rather than a local copy.
check(/runGovernedAction\(inFlight,/.test(providersSource),
  'the providers page uses the shared governed-action runner');
check(/const inFlight = useRef\(false\)/.test(providersSource),
  'AND LATCHES IN A REF, WHICH IS TRUE FOR THE NEXT CLICK NOT THE NEXT PAINT');
check(/featureFlagEnabled\(flags\.data/.test(providersSource),
  'and reads the flag through the tested reader');
check(!/row\.flag_key/.test(providersSource),
  'THE snake_case MATCH THAT CAUSED THIS IS GONE');
check(/setDone\(/.test(providersSource) && /role="status">\{done\}/.test(providersSource),
  'a completed governed action is announced on screen');

// --- The continuation across re-authentication ------------------------------
// The reported defect: Activate provider is refused for freshness, the dialog
// opens, the operator's password is accepted — and nothing else happens. The
// refused call was never stored, so proving the session re-sent nothing. The
// provider sat awaiting activation with no error and no transition.
//
// `staff_activate_external_provider` takes its capability in the `declare`
// block, before it reads any state or consumes the dual-control approval, so
// the refused attempt had no effect and re-sending it is safe. These model the
// full sequence against the real store.
{
  const T0 = 1_700_000_000_000;
  const activation = () => {
    const sent: string[] = [];
    const store = createPendingReauthStore();
    const activate = () => { sent.push('staff_activate_external_provider'); };
    return { sent, store, activate };
  };

  // 1-7. Refused, dialog opens, verification succeeds, the call resumes once.
  {
    const { sent, store, activate } = activation();
    const held = store.remember('activate', 'manage_subprocessors', activate, T0);
    check(held.remember, 'a freshness refusal is held rather than discarded');
    check(store.peek()?.capability === 'manage_subprocessors',
      'THE DIALOG OPENS NAMING THE CAPABILITY THE SERVER ACTUALLY REFUSED');
    const resumed = store.resume(T0 + 8_000);
    check(resumed.resume, 'a proven session resumes the refused activation');
    equal(sent, ['staff_activate_external_provider'],
      'THE ACTIVATION RPC IS SENT EXACTLY ONCE AFTER RE-AUTHENTICATION');
    check(store.peek() === null, 'and nothing is left pending afterwards');
  }

  // 5-6, 10. Exactly once, however many times success arrives.
  {
    const { sent, store, activate } = activation();
    store.remember('activate', 'manage_subprocessors', activate, T0);
    store.resume(T0 + 1_000);
    const second = store.resume(T0 + 1_100);
    const third = store.resume(T0 + 1_200);
    check(!second.resume && second.reason === 'nothing-pending',
      'A SECOND DIALOG SUCCESS FINDS NOTHING PENDING AND SENDS NOTHING');
    check(!third.resume, 'and a third likewise');
    equal(sent.length, 1,
      'THE DUAL-CONTROL APPROVAL CANNOT BE CONSUMED TWICE BY A REPEATED RESUME');
  }

  // 10. Duplicate clicks behind the dialog cannot queue a second attempt.
  {
    const { sent, store, activate } = activation();
    store.remember('activate', 'manage_subprocessors', activate, T0);
    const again = store.remember('activate', 'manage_subprocessors', activate, T0 + 500);
    check(again.remember, 'a repeat of the same refused action is still just one');
    store.resume(T0 + 1_000);
    equal(sent.length, 1, 'DUPLICATE CLICKS PRODUCE ONE ACTIVATION ATTEMPT, NOT TWO');
  }

  // Cancelled re-authentication runs nothing.
  {
    const { sent, store, activate } = activation();
    store.remember('activate', 'manage_subprocessors', activate, T0);
    store.discard();
    check(store.peek() === null, 'cancelling closes the dialog');
    const after = store.resume(T0 + 1_000);
    check(!after.resume, 'CANCELLED RE-AUTHENTICATION DOES NOT RUN THE PENDING ACTION');
    equal(sent.length, 0, 'and no RPC is sent');
  }

  // A rejected password never reaches resume, and cancelling afterwards leaves
  // the operator free to try again rather than refusing them as a repeat.
  {
    const { sent, store, activate } = activation();
    store.remember('activate', 'manage_subprocessors', activate, T0);
    equal(sent.length, 0, 'A FAILED PASSWORD RUNS NOTHING — ONLY SUCCESS CALLS RESUME');
    store.discard();
    const retry = store.remember('activate', 'manage_subprocessors', activate, T0 + 2_000);
    check(retry.remember, 'and a deliberate later attempt is not refused as a repeat');
  }

  // A pending action that has gone stale fails safely instead of firing a
  // privileged call the operator has stopped expecting.
  {
    const { sent, store, activate } = activation();
    store.remember('activate', 'manage_subprocessors', activate, T0);
    const late = store.resume(T0 + PENDING_REAUTH_TTL_MS + 1);
    check(!late.resume && late.reason === 'expired',
      'AN EXPIRED PENDING ACTIVATION FAILS SAFELY RATHER THAN RUNNING LATE');
    equal(sent.length, 0, 'and sends nothing');
  }

  // Another action may not quietly displace one already waiting: the operator
  // would confirm a prompt naming one capability and set a different call off.
  {
    const sent: string[] = [];
    const store = createPendingReauthStore();
    store.remember('activate', 'manage_subprocessors', () => { sent.push('activate'); }, T0);
    const intruder = store.remember('feature', 'manage_feature_flags',
      () => { sent.push('feature'); }, T0 + 100);
    check(!intruder.remember && intruder.reason === 'another-action-pending',
      'ANOTHER ACTION CANNOT SILENTLY OVERWRITE THE PENDING ACTIVATION');
    check(store.peek()?.key === 'activate', 'the activation is still the one waiting');
    store.resume(T0 + 200);
    equal(sent, ['activate'], 'and it is the activation that resumes');
  }

  // A refusal that survives a genuine re-authentication is reported, not
  // looped: a second dialog would hide the real problem behind a prompt.
  {
    const sent: string[] = [];
    const store = createPendingReauthStore();
    const activate = () => { sent.push('activate'); };
    store.remember('activate', 'manage_subprocessors', activate, T0);
    store.resume(T0 + 1_000);
    const looped = store.remember('activate', 'manage_subprocessors', activate, T0 + 2_000);
    check(!looped.remember && looped.reason === 'already-retried',
      'A SECOND FRESHNESS REFUSAL IS REPORTED RATHER THAN REOPENING THE DIALOG');
    equal(MAX_REAUTH_RETRIES, 1, 'one retry, by policy');
    equal(sent.length, 1, 'and still exactly one attempt');
  }
}

// Every surface that opens the dialog must resume what it held. Before this
// fix, five of the six closed the dialog and refreshed instead — which renders
// identically, because a refused action changed nothing.
{
  const SURFACES = [
    'app/admin/providers/page.tsx', 'app/admin/platform/page.tsx',
    'app/admin/staff/page.tsx', 'app/admin/analytics/page.tsx',
    'components/enforcement-action.tsx', 'components/vetting-decision.tsx',
  ];
  for (const surface of SURFACES) {
    const source = readWeb(surface);
    check(/onSuccess=\{reauth\.resume\}/.test(source),
      `${surface} RESUMES THE REFUSED ACTION INSTEAD OF ONLY CLOSING THE DIALOG`);
    check(/onClose=\{reauth\.discard\}/.test(source),
      `${surface} drops the pending action when the operator cancels`);
    check(/usePendingReauth\(/.test(source),
      `${surface} uses the shared continuation, not a private boolean`);
    check(!/askReauth|setReauthFor|setReauthOpen/.test(source),
      `${surface} no longer keeps a hand-rolled reauth boolean`);
  }
  // The trap that made this possible: a gate nothing adopted, alongside six
  // call sites that each improvised.
  const dialog = readWeb('components/reauth-dialog.tsx');
  check(!/useReauthGate/.test(dialog),
    'the unused pre-emptive gate is gone, so there is one primitive, not two');
  check(/export function usePendingReauth/.test(dialog),
    'and the continuation is exported from one place');
}

// The refused call must travel out of a child component, not just a signal
// that one happened — otherwise the parent has nothing to re-send.
{
  const roles = readWeb('components/staff-role-actions.tsx');
  check(/onNeedsReauth: \(key: string, retry: \(\) => void\) => void;/.test(roles),
    'A CHILD HANDS THE PARENT THE CALL TO RE-SEND, NOT MERELY A NOTIFICATION');
  check((roles.match(/onNeedsReauth\('\w+', \(\) => \{ void \w+\(\); \}\)/g) ?? []).length === 3,
    'every refusal in the role actions carries its own retry');
  check(/p_idempotency_key: idempotencyKey/.test(roles),
    'and a re-sent grant carries the same idempotency key, so it cannot double');
}

for (const key of ['reauthAnotherPending', 'reauthAlreadyRetried', 'reauthPendingExpired']) {
  check(inBoth(key), `the console explains "${key}" in both languages`);
}

console.log(`Admin console: ${checks} checks passed.`);
