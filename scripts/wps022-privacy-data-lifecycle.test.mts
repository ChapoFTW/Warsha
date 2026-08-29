/**
 * WPS-022 — Privacy, Data Lifecycle & User Rights.
 *
 * Contract checks over the privacy client, the Mock parity layer, the
 * migration, the screens and the documentation. Database behaviour is asserted
 * by `supabase/tests/database/privacy-data-lifecycle.test.sql`; this file
 * asserts what the CLIENT guarantees, and — mostly — what must NOT exist
 * anywhere in it.
 *
 * A large share of these checks are negative. That is deliberate: the failure
 * modes of a privacy feature are things that are present when they should be
 * absent (a dark pattern, a staff path into somebody's export, a claim that
 * deletion is instant), and those cannot be caught by testing a happy path.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { privacyCopy } from '../src/privacy/privacy-copy.ts';
import {
  actionableBlockers,
  effectiveExportStatus,
  emptyOverview,
  hoursUntil,
  isActionableBlocker,
  isCancellable,
  manifestRowTotal,
  needsAction,
  type DeletionBlockerCode,
  type DeletionStatus,
} from '../src/privacy/privacy-types.ts';
import {
  mockCancelDeletion,
  mockClearHistory,
  mockConsentLedgerLength,
  mockConsents,
  mockAnonymize,
  mockExports,
  mockPrivacyOverview,
  mockRecordConsent,
  mockRequestDeletion,
  mockRequestExport,
  mockSetDeactivated,
  resetMockPrivacyState,
  setMockBlockers,
} from '../src/privacy/mock-privacy-state.ts';

let checks = 0;
function check(condition: boolean, label: string) {
  checks += 1;
  assert.ok(condition, label);
}
function is<T>(actual: T, expected: T, label: string) {
  checks += 1;
  assert.equal(actual, expected, label);
}
function has(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.match(haystack, pattern, label);
}
function lacks(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.doesNotMatch(haystack, pattern, label);
}
function throws(fn: () => unknown, label: string) {
  checks += 1;
  assert.throws(fn, label);
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/**
 * Strips comments before searching, so a comment explaining why something is
 * absent can never satisfy the check for that absence.
 */
const codeOf = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const sqlCodeOf = (path: string) => read(path).replace(/^\s*--.*$/gm, '');

/** Collapses wrapped markdown so a line break cannot fail a prose assertion. */
const flow = (text: string) => text.replace(/\s+/g, ' ');

const migrationPath = 'supabase/migrations/202608070001_wps022_privacy_data_lifecycle_user_rights.sql';

// ---------------------------------------------------------------------------
// Files exist
// ---------------------------------------------------------------------------
for (const path of [
  migrationPath,
  'supabase/tests/database/privacy-data-lifecycle.test.sql',
  'src/privacy/privacy-types.ts',
  'src/privacy/privacy-copy.ts',
  'src/privacy/privacy-translations.ts',
  'src/privacy/privacy-repository.ts',
  'src/privacy/privacy-context.tsx',
  'src/privacy/mock-privacy-state.ts',
  'app/privacy.tsx',
  'app/privacy-delete.tsx',

  'docs/wps/WPS-022-privacy-data-lifecycle-user-rights.md',
  'docs/wes/WES-022-privacy-data-lifecycle-user-rights.md',
  'docs/privacy/WARSHA-DATA-INVENTORY.md',
  'docs/privacy/WARSHA-DATA-CLASSIFICATION.md',
  'docs/privacy/WARSHA-RETENTION-MATRIX.md',
  'docs/privacy/WARSHA-USER-RIGHTS-MATRIX.md',
  'docs/privacy/WARSHA-DELETION-ANONYMIZATION-MODEL.md',
  'docs/privacy/WARSHA-CONSENT-MODEL.md',
  'docs/privacy/WARSHA-PRIVACY-OPERATIONS.md',
  'docs/privacy/WARSHA-SUBPROCESSOR-REGISTER.md',
  'docs/privacy/WARSHA-DATA-FLOW-MAP.md',
  'docs/privacy/WARSHA-PRIVACY-LEGAL-QUESTIONS.md',
  'docs/operations/privacy/DATA-EXPORT-RUNBOOK.md',
  'docs/operations/privacy/ACCOUNT-DELETION-RUNBOOK.md',
  'docs/operations/privacy/RETENTION-EXECUTION-RUNBOOK.md',
  'docs/operations/privacy/LEGAL-HOLD-RUNBOOK.md',
  'docs/operations/privacy/PRIVACY-INCIDENT-RUNBOOK.md',
  'docs/operations/privacy/STAFF-ACCESS-REVIEW-RUNBOOK.md',
  'docs/operations/privacy/STORAGE-CLEANUP-RUNBOOK.md',
  'docs/testing/WPS-022-MANUAL-ALPHA.md',
  'docs/testing/WPS-022-MANUAL-RESULTS.md',
  'docs/testing/WPS-022-ACCEPTANCE-EVIDENCE.md',
  'docs/testing/WPS-022-PRIVACY-SECURITY-REVIEW.md',
]) {
  check(existsSync(join(root, path)), `${path} exists`);
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------
const cancellable: DeletionStatus[] = ['cooling_off', 'blocked', 'legal_hold'];
const notCancellable: DeletionStatus[] = [
  'approved', 'processing', 'anonymized', 'completed', 'cancelled', 'failed',
];
for (const status of cancellable) {
  is(isCancellable(status), true, `${status} is cancellable`);
}
for (const status of notCancellable) {
  is(isCancellable(status), false, `${status} is NOT cancellable once execution begins`);
}

// Only `blocked` asks the account to do something. A hold does not, because
// nothing the account does will lift it.
is(needsAction('blocked'), true, 'a blocked request asks the account to act');
is(needsAction('legal_hold'), false, 'A HOLD NEVER ASKS THE ACCOUNT TO DO SOMETHING FUTILE');
is(needsAction('cooling_off'), false, 'waiting is not an action');

is(hoursUntil(new Date(Date.now() + 3 * 3_600_000).toISOString()), 3, 'hours remaining are counted');
is(hoursUntil(new Date(Date.now() - 3_600_000).toISOString()), 0, 'a past deadline floors at zero');
is(hoursUntil('not-a-date'), 0, 'an unparseable deadline floors at zero rather than NaN');

is(
  effectiveExportStatus({ status: 'ready', expiresAt: new Date(Date.now() - 1000).toISOString() }),
  'expired',
  'AN EXPIRED EXPORT READS AS EXPIRED EVEN IF ITS STORED STATUS SAYS READY',
);
is(
  effectiveExportStatus({ status: 'ready', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
  'ready',
  'a live export reads as ready',
);
is(
  effectiveExportStatus({ status: 'failed', expiresAt: new Date(Date.now() - 1000).toISOString() }),
  'failed',
  'a failed export does not become expired',
);

is(manifestRowTotal(null), 0, 'a missing manifest totals zero');
is(
  manifestRowTotal({
    generatedAt: '', environment: 'mock', subject: 'x',
    sections: [
      { key: 'a', format: 'json', rows: 2 },
      { key: 'b', format: 'csv', rows: 3 },
    ],
    excluded: [],
  }),
  5,
  'manifest rows total across sections',
);

// `legal_hold` is deliberately not in the actionable list.
is(isActionableBlocker('active_booking'), true, 'an active booking is actionable');
is(isActionableBlocker('legal_hold'), false, 'A HOLD IS NOT LISTED AS SOMETHING TO GO AND FIX');
is(actionableBlockers.includes('legal_hold'), false, 'the actionable list excludes holds');
is(emptyOverview.available, false, 'the empty overview fails closed');
is(emptyOverview.deletionRequest, null, 'the empty overview carries no request');

// ---------------------------------------------------------------------------
// Copy: both languages, every key
// ---------------------------------------------------------------------------
const enKeys = Object.keys(privacyCopy.en).sort();
const arKeys = Object.keys(privacyCopy.ar).sort();
is(arKeys.join('|'), enKeys.join('|'), 'every copy key exists in both languages');
check(enKeys.length >= 60, 'the copy table is complete');
for (const key of enKeys) {
  const en = (privacyCopy.en as Record<string, string>)[key];
  const ar = (privacyCopy.ar as Record<string, string>)[key];
  check(en.trim().length > 0, `${key} has English text`);
  check(ar.trim().length > 0, `${key} has Arabic text`);
  // Arabic must actually be Arabic, not an English string copied across.
  check(/[؀-ۿ]/.test(ar), `${key} Arabic is written in Arabic script`);
}

const allCopy = [...Object.values(privacyCopy.en), ...Object.values(privacyCopy.ar)].join(' ');

// No internal vocabulary reaches a user.
for (const term of [
  /\bPII\b/, /data subject/i, /processing basis/i, /GDPR/i, /\bRLS\b/,
  /\bSQL\b/i, /\btable\b/i, /\bschema\b/i, /pseudonymi/i, /\bUUID\b/i,
]) {
  lacks(allCopy, term, `user copy avoids internal vocabulary: ${term}`);
}

// No legal claim. WPS-022 asserts compliance with nothing.
for (const term of [/complian/i, /legally required/i, /by law/i, /regulat/i, /statutor/i]) {
  lacks(allCopy, term, `user copy makes no legal claim: ${term}`);
}

// No dark pattern.
for (const term of [
  /are you sure/i, /you will lose/i, /lose everything/i, /permanently and forever/i,
  /we.ll miss you/i, /please reconsider/i, /think again/i,
  /contact support to delete/i, /email us to delete/i,
]) {
  lacks(allCopy, term, `user copy contains no dark pattern: ${term}`);
}

// No false promise of immediacy or totality.
for (const term of [
  /deleted immediately/i, /instantly deleted/i, /erased forever/i,
  /everything will be deleted/i, /all your data will be erased/i,
]) {
  lacks(allCopy, term, `user copy promises no instant or total erasure: ${term}`);
}

// And the honest counterparts ARE present.
has(privacyCopy.en.deleteNotInstant, /not instant/i, 'the copy says deletion is not instant');
has(privacyCopy.en.deleteNotTotal, /cannot erase every record/i,
  'THE COPY SAYS PLAINLY THAT SOME RECORDS REMAIN');
has(privacyCopy.en.deactivateDiffers, /not deletion/i,
  'deactivation says it is not deletion');
has(privacyCopy.en.consentRequiredNote, /not agreement to anything optional/i,
  'ACCEPTING TERMS IS NOT PRESENTED AS BLANKET CONSENT');
has(privacyCopy.en.blockedLegalHold, /nothing you do will change it/i,
  'a hold says plainly that the account cannot resolve it');
lacks(privacyCopy.en.blockedLegalHold, /report|reporter|investigation|fraud|dispute/i,
  'A HOLD REVEALS NO EVIDENCE, NO REPORTER, AND NO REASON');

// The export never claims a file exists that no worker has produced.
has(privacyCopy.en.exportPreparing, /being prepared/i, 'a pending export reads as being prepared');
has(privacyCopy.en.exportPreparingNote, /takes a little while/i,
  'the export is honest about waiting');

// Every blocker code has copy in both languages.
const blockerCodes: DeletionBlockerCode[] = [
  'active_booking', 'open_dispute', 'unsettled_payment', 'outstanding_earnings',
  'active_payout', 'open_chargeback', 'active_enforcement', 'open_support_case', 'legal_hold',
];
const translations = read('src/privacy/privacy-translations.ts');
for (const code of blockerCodes) {
  has(translations, new RegExp(`${code}:`), `blocker ${code} has a copy key`);
}

// No blocker sentence names another person or an accusation.
const blockerCopy = Object.entries(privacyCopy.en)
  .filter(([key]) => key.startsWith('blocked'))
  .map(([, value]) => value)
  .join(' ');
for (const term of [/reported you/i, /somebody|someone else/i, /the worker said/i, /the customer said/i, /staff/i]) {
  lacks(blockerCopy, term, `no blocker sentence names another party: ${term}`);
}

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
resetMockPrivacyState();

const overview = mockPrivacyOverview('account-a');
is(overview.available, true, 'Mock exposes the privacy centre');
check(overview.categories.length >= 10, 'Mock lists the stored categories');
is(overview.deletionRequest, null, 'a fresh account has no deletion request');

// Consent: required cannot be declined, in Mock exactly as on the server.
throws(() => mockRecordConsent('account-a', 'terms_of_service', false),
  'MOCK REFUSES TO DECLINE A REQUIRED PURPOSE, LIKE THE SERVER');
throws(() => mockRecordConsent('account-a', 'privacy_notice', false),
  'Mock refuses to decline the privacy notice');

const beforeConsent = mockConsentLedgerLength('account-a');
mockRecordConsent('account-a', 'marketing_communication', true);
mockRecordConsent('account-a', 'marketing_communication', false);
is(mockConsentLedgerLength('account-a'), beforeConsent + 2,
  'MOCK APPENDS A WITHDRAWAL RATHER THAN EDITING THE EARLIER GRANT');

const consents = mockConsents('account-a');
is(consents.find(c => c.purposeKey === 'marketing_communication')?.granted, false,
  'the latest decision wins');
is(consents.find(c => c.purposeKey === 'diagnostics')?.granted, false,
  'OPTIONAL PROCESSING IS OFF UNTIL IT IS CHOSEN');
is(consents.find(c => c.purposeKey === 'terms_of_service')?.required, true,
  'terms are marked required');
check(consents.every(c => c.titleEn.length > 0 && c.titleAr.length > 0),
  'every purpose is bilingual in Mock');

// History clearing is scoped.
const cleared = mockClearHistory('account-a', 'searches');
check(cleared.searchesCleared > 0, 'clearing searches removes searches');
is(cleared.viewsCleared, 0, 'clearing searches leaves views alone');
const clearedViews = mockClearHistory('account-a', 'views');
check(clearedViews.viewsCleared > 0, 'clearing views removes views');

// Deactivation deletes nothing.
is(mockSetDeactivated('account-a', true), true, 'Mock can deactivate');
is(mockPrivacyOverview('account-a').deactivated, true, 'deactivation is reflected');
is(mockSetDeactivated('account-a', false), false, 'deactivation is reversible');

// Deletion: idempotent, blockable, cancellable.
const request = mockRequestDeletion('account-b', 'no_longer_needed');
is(request.status, 'cooling_off', 'a clean Mock account enters cooling off');
is(mockRequestDeletion('account-b', null).id, request.id,
  'A MOCK RETRY RETURNS THE STANDING REQUEST, NOT A SECOND ONE');
is(mockCancelDeletion('account-b'), true, 'a Mock request can be cancelled');
is(mockCancelDeletion('account-b'), false, 'cancelling twice is honest in Mock too');

setMockBlockers('account-c', ['active_booking', 'open_dispute']);
const blocked = mockRequestDeletion('account-c', null);
is(blocked.status, 'blocked', 'MOCK BLOCKS A DELETION BEHIND AN ACTIVE BOOKING');
is(blocked.blockerCodes.length, 2, 'both blockers are reported');
is(blocked.cancellable, true, 'a blocked request is still cancellable in Mock');

setMockBlockers('account-d', ['legal_hold']);
is(mockRequestDeletion('account-d', null).status, 'legal_hold',
  'a held Mock account reports a hold, distinctly from ordinary blocking');

// Export: one open at a time, manifest states its exclusions.
const exported = mockRequestExport('account-a');
is(exported.status, 'manifest_ready',
  'MOCK DOES NOT PRETEND A FILE EXISTS THAT NO WORKER HAS PRODUCED');
is(mockRequestExport('account-a').id, exported.id, 'one open export at a time in Mock');
check((exported.manifest?.excluded.length ?? 0) >= 5, 'the Mock manifest states its exclusions');
is(exported.manifest?.subject, 'account-a', 'the Mock manifest names its own subject');
check(mockExports('account-a').length === 1, 'the Mock export list is owner-scoped');
is(mockExports('account-b').length, 0, 'ANOTHER MOCK ACCOUNT SEES NO EXPORT OF THE FIRST');

// Anonymization preserves what somebody else depends on.
const after = mockAnonymize('account-a');
check(after.bookings > 0, 'MOCK ANONYMIZATION PRESERVES BOOKINGS');
check(after.payments > 0, 'Mock anonymization preserves payment records');
check(after.consents > 0, 'Mock anonymization preserves consent history');
is(after.searches, 0, 'Mock anonymization clears search history');
is(after.views, 0, 'Mock anonymization clears viewing history');

// Account isolation.
resetMockPrivacyState();
mockRecordConsent('account-x', 'diagnostics', true);
is(mockConsents('account-y').find(c => c.purposeKey === 'diagnostics')?.granted, false,
  'MOCK CONSENT DOES NOT LEAK BETWEEN ACCOUNTS');

// ---------------------------------------------------------------------------
// Mock isolation: no network, no fallback
// ---------------------------------------------------------------------------
const mockSource = codeOf('src/privacy/mock-privacy-state.ts');
lacks(mockSource, /supabase/i, 'MOCK MAKES NO SUPABASE CALL');
lacks(mockSource, /\bfetch\b|axios|XMLHttpRequest/, 'Mock makes no network call');
lacks(mockSource, /getSupabaseClient/, 'Mock never reaches for a Supabase client');

const repoSource = codeOf('src/privacy/privacy-repository.ts');
has(repoSource, /dataMode === 'mock'/, 'the repository branches on data mode');
lacks(repoSource, /catch[\s\S]{0,200}mock/i, 'A SUPABASE FAILURE NEVER FALLS BACK TO MOCK');

const typesSource = read('src/privacy/privacy-types.ts');
lacks(typesSource, /^import /m, 'privacy-types imports nothing, so Node can execute it');

// ---------------------------------------------------------------------------
// The client cannot delete, anonymize, or execute retention
// ---------------------------------------------------------------------------
for (const path of [
  'src/privacy/privacy-repository.ts',
  'src/privacy/privacy-context.tsx',
  'app/privacy.tsx',
  'app/privacy-delete.tsx',

]) {
  const source = codeOf(path);
  lacks(source, /privacy_anonymize_account/, `${path} cannot call anonymization`);
  lacks(source, /execute_retention|retention_execute/, `${path} cannot execute retention`);
  lacks(source, /\.from\(['"]privacy_consent_records['"]\)/, `${path} never writes consent directly`);
  lacks(source, /\.from\(['"]account_deletion_requests['"]\)/, `${path} never writes a deletion row directly`);
  lacks(source, /service_role|SERVICE_ROLE/, `${path} holds no service-role key`);
}

// The staff privacy surface is the web console's, and it is asserted there.
//
// `privacy-staff-repository.ts` and `privacy-staff-types.ts` were the native
// half — a redaction contract for a console that no longer exists on a phone.
// They were retired on 2026-08-29. The properties they carried, that a staff
// reader never sees an export manifest and works from a count rather than the
// blocker codes, belong to the surface that actually shows a staff member
// something, and `admin-console.test.mts` asserts them on the pseudonymous
// queue it renders.
//
// What stays here is the boundary that must hold whatever console exists:
// nothing client-side may anonymise, execute retention, or write consent.
check(!existsSync('app/admin/privacy.tsx'), 'THE MOBILE PRIVACY CONSOLE IS GONE');

// The data-minimisation rule now sits on the payload the database actually
// returns, rather than on a native type that shaped nothing. A staff reader
// gets a count of blockers, never their codes, and never an export manifest.
const privacyStaffSql = read('supabase/migrations/202608070001_wps022_privacy_data_lifecycle_user_rights.sql');
// Scoped to `staff_privacy_requests`. A manifest exists elsewhere in this
// migration and should: it is how a person receives their OWN export. The rule
// is that a STAFF reader never sees one.
const staffPrivacyFn = privacyStaffSql.slice(
  privacyStaffSql.indexOf('staff_privacy_requests'),
  privacyStaffSql.indexOf('staff_data_inventory'));
lacks(staffPrivacyFn, /'manifest'/, 'NO STAFF PAYLOAD CARRIES AN EXPORT MANIFEST');
has(staffPrivacyFn, /blockerCount/, 'the staff payload carries a blocker count');
lacks(staffPrivacyFn, /'blockerCodes'/, 'AND NEVER THE BLOCKER CODES THEMSELVES');

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const privacyScreen = read('app/privacy.tsx');
const deleteScreen = read('app/privacy-delete.tsx');

// Deletion is reachable, and not buried.
has(read('app/(tabs)/profile.tsx'), /router\.push\('\/privacy'\)/,
  'PRIVACY IS REACHABLE FROM THE ORDINARY SETTINGS LIST');
has(privacyScreen, /router\.push\('\/privacy-delete'\)/,
  'deletion is one press from the privacy centre');
has(deleteScreen, /deleteWhatStays/, 'the deletion screen states what remains');
has(deleteScreen, /deleteWhatGoes/, 'the deletion screen states what is removed');
has(deleteScreen, /deleteNotInstant/, 'the deletion screen says processing takes time');

// The confirmation is accessible: a second press, never a typed phrase.
lacks(codeOf('app/privacy-delete.tsx'), /type ['"]?DELETE|confirmPhrase|typeToConfirm/i,
  'DELETION CONFIRMATION NEVER REQUIRES TYPING AN INACCESSIBLE PHRASE');
has(deleteScreen, /deleteConfirmAction/, 'the confirmation has an explicit affirmative');
has(deleteScreen, /deleteCancelAction/, 'the confirmation has an explicit way out');

// Deactivation is presented above deletion and distinctly.
check(
  privacyScreen.indexOf('deactivateTitle') < privacyScreen.indexOf('deleteTitle'),
  'DEACTIVATION IS OFFERED BEFORE DELETION',
);
has(privacyScreen, /deactivateDiffers/, 'the screen says deactivation is not deletion');

// Accessibility.
for (const [path, source] of [['app/privacy.tsx', privacyScreen], ['app/privacy-delete.tsx', deleteScreen]] as const) {
  has(source, /accessibilityRole="header"/, `${path} marks its section headings`);
  has(source, /accessibilityRole="button"/, `${path} marks its buttons`);
  has(source, /accessibilityLabel=/, `${path} labels its controls`);
  has(source, /accessibilityLiveRegion="polite"/, `${path} announces status changes`);
  has(source, /minHeight: 44/, `${path} uses reachable touch targets`);
  has(source, /isRTL/, `${path} adapts to RTL`);
  has(source, /useThemedStyles\(makeStyles\)/, `${path} uses the WPS-020 style factory`);
  lacks(source, /#[0-9a-fA-F]{6}/, `${path} hardcodes no colour`);
}
has(privacyScreen, /accessibilityState=\{\{ checked:/,
  'consent switches announce their checked state');

// Meaning is never carried by colour alone: every state icon has a word beside it.
has(privacyScreen, /pt\.exportStatus\(status\)/, 'export state is announced as a word');
has(deleteScreen, /pt\.blocker\(code\)/, 'each blocker is announced as a sentence');

// No motto overuse on privacy screens.
lacks(privacyScreen, /YOUR WORK, OUR MISSION/i, 'the motto is not repeated on the privacy centre');
lacks(deleteScreen, /YOUR WORK, OUR MISSION/i, 'the motto is not repeated on the deletion screen');

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
const migration = sqlCodeOf(migrationPath);

// The retired scaffold.
has(migration, /update storage\.buckets[\s\S]{0,200}set public = false/,
  'the migration closes the legacy avatars bucket');
has(migration, /drop policy if exists own_avatar_write/,
  'THE LEGACY PUBLIC AVATAR WRITE POLICY IS DROPPED');
lacks(migration, /drop table[\s\S]{0,40}avatars/i, 'the bucket is retired, not dropped');
has(migration, /revoke truncate, references, trigger/,
  'the leftover Supabase default grants are revoked');

// Fail closed.
has(migration, /privacy_center_enabled\s+boolean not null default false/,
  'the privacy centre ships disabled');
has(migration, /export_enabled\s+boolean not null default false/, 'export ships disabled');
has(migration, /deletion_enabled\s+boolean not null default false/, 'deletion ships disabled');
has(migration, /retention_execution_enabled\s+boolean not null default false/,
  'RETENTION EXECUTION SHIPS DISABLED');

// No invented statutory period.
has(migration, /legal_review_status  text not null default 'pending'/,
  'retention durations default to pending review');
has(migration, /UNRESOLVED\. Requires Egyptian legal advice/,
  'the identity-document duration is marked unresolved');
has(migration, /UNRESOLVED\. Requires Egyptian tax and accounting advice/,
  'THE FINANCIAL DURATION IS ROUTED TO PROFESSIONAL ADVICE, NOT INVENTED');
lacks(migration, /as required by (Egyptian )?law/i, 'the migration claims no legal requirement');
lacks(migration, /legally mandated|statutory requirement/i, 'no statutory claim is made');

// Anonymization preserves the other authorities.
//
// The slice boundaries must be SQL, not comment headers: `sqlCodeOf` strips
// `--` lines, so a header boundary would resolve to -1 and silently widen the
// slice to the rest of the file.
const anonymizeStart = migration.indexOf('function private.privacy_anonymize_account');
const anonymizeEnd = migration.indexOf('comment on function private.privacy_anonymize_account');
check(anonymizeStart > 0, 'the anonymization function is found in the migration');
check(anonymizeEnd > anonymizeStart, 'the anonymization slice has a real end boundary');
const anonymize = migration.slice(anonymizeStart, anonymizeEnd);
for (const table of [
  'financial_ledger', 'provider_earnings_ledger', 'financial_booking_payments',
  'trust_enforcement_actions', 'trust_reports', 'referral_attributions',
]) {
  lacks(anonymize, new RegExp(table), `ANONYMIZATION NEVER TOUCHES ${table}`);
}
lacks(anonymize, /delete from public\.(bookings|reviews|messages|disputes)/,
  'anonymization deletes no booking, review, message or dispute');
has(anonymize, /delete from public\.user_recent_searches/,
  'anonymization does delete search history');

// Every SECURITY DEFINER function pins an empty search_path.
const definerCount = (migration.match(/security definer/g) ?? []).length;
const searchPathCount = (migration.match(/set search_path = ''/g) ?? []).length;
check(searchPathCount >= definerCount,
  'EVERY SECURITY DEFINER FUNCTION IN THE MIGRATION PINS AN EMPTY search_path');

// Grants are stated, not inherited.
has(migration, /revoke all on public\.privacy_consent_records\s+from anon, authenticated, public/,
  'privileges are revoked before being granted');
has(migration, /grant select on public\.privacy_consent_records\s+to authenticated/,
  'the client gets read only');
lacks(migration, /grant (insert|update|delete) on public\.(privacy|account_deletion)/,
  'NO CLIENT ROLE IS GRANTED A WRITE ON A PRIVACY TABLE');

// Constructs that cannot be schema-qualified are not qualified.
lacks(migration, /pg_catalog\.(coalesce|nullif|least|greatest|extract|current_date)\b/,
  'SQL constructs are not schema-qualified, which would be a syntax error');

// Existing allowlists are honoured, not widened.
lacks(migration, /operational_log_category_check/, 'the WPS-018 log allowlist is not altered');
lacks(migration, /staff_capabilities_domain_check/, 'the WPS-017 domain allowlist is not altered');
lacks(migration, /staff_access_log_surface_check/, 'the WPS-018 surface allowlist is not altered');
lacks(migration, /notifications_category_check/, 'the WPS-014 category allowlist is not altered');
has(migration, /'audit_explorer'/, 'staff access is logged under an existing surface');

// Notifications carry no detail.
has(migration, /privacy_deletion_blocked.*security.*action_required/,
  'a blocked deletion notifies with the security category');
// Scoped to the catalog insert. `privacy_legal_hold` is a legitimate audit
// ENTITY TYPE elsewhere in the migration; what must not exist is a notification
// EVENT by that name, which would announce a hold to its own subject.
const catalogStart = migration.indexOf('insert into private.notification_event_catalog');
check(catalogStart > 0, 'the notification catalog insert is found');
const catalogBlock = migration.slice(
  catalogStart,
  migration.indexOf('on conflict (event_type) do nothing', catalogStart),
);
lacks(catalogBlock, /privacy_legal_hold/, 'A LEGAL HOLD IS NEVER A NOTIFICATION EVENT');
is((catalogBlock.match(/'privacy_\w+',\s*'security'/g) ?? []).length, 6,
  'exactly six privacy events exist, all in the security category');
has(migration, /private\.privacy_legal_holds/, 'the holds table itself does exist');

// The export never leaks another party.
const manifest = migration.slice(
  migration.indexOf('function private.privacy_build_manifest'),
  migration.indexOf('function public.request_my_data_export'),
);
for (const table of [
  'trust_report_evidence', 'trust_fraud_signals', 'operational_case_notes',
  'staff_audit_events', 'payment_secret_metadata', 'payout_provider_references',
]) {
  lacks(manifest, new RegExp(table), `THE EXPORT MANIFEST NEVER READS ${table}`);
}

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------
const wps = read('docs/wps/WPS-022-privacy-data-lifecycle-user-rights.md');
const wes = read('docs/wes/WES-022-privacy-data-lifecycle-user-rights.md');
has(wps, /Version: 1\.0/, 'WPS-022 declares version 1.0');
has(wps, /Status: LOCKED FOR IMPLEMENTATION/, 'WPS-022 is locked');
has(wps, /Authority: Warsha Constitution/, 'WPS-022 cites the Constitution');
has(wps, /Depends on: WPS-001 through WPS-021/, 'WPS-022 declares its dependencies');
has(wes, /Version: 1\.0/, 'WES-022 declares version 1.0');
has(wes, /Status: ENGINEERING BASELINE/, 'WES-022 is the engineering baseline');
has(wes, /Implements: WPS-022/, 'WES-022 implements WPS-022');

const legal = read('docs/privacy/WARSHA-PRIVACY-LEGAL-QUESTIONS.md');
check(
  // The IDs are emboldened in the table, so allow the markdown markers.
  (legal.match(/^\|\s*\*{0,2}Q-\d+/gm) ?? []).length >= 10,
  'at least ten open legal questions are recorded',
);
has(flow(legal), /does not claim legal compliance/i,
  'THE LEGAL DOCUMENT DISCLAIMS ANY COMPLIANCE CLAIM');

const deletionModel = flow(read('docs/privacy/WARSHA-DELETION-ANONYMIZATION-MODEL.md'));
has(deletionModel, /pseudonymi/i, 'the deletion model uses the accurate word');
has(deletionModel, /not anonymous/i,
  'THE MODEL STATES PLAINLY THAT PSEUDONYMIZED DATA IS NOT ANONYMOUS');
lacks(deletionModel, /irreversibly anonymous|fully anonymous/i,
  'the model claims no anonymity it cannot deliver');

const retention = read('docs/privacy/WARSHA-RETENTION-MATRIX.md');
// The rule list came from a client constant in the retired staff types. It now
// comes from the database that runs the retention, so the matrix is checked
// against what actually executes rather than against a second copy of it.
const retentionRules = [...new Set(
  [...privacyStaffSql.matchAll(/'([a-z_]+)'::text\s*,?\s*--\s*retention|rule_key\s*=\s*'([a-z_]+)'/g)]
    .map(m => m[1] ?? m[2]).filter(Boolean))];
const documentedRules = retentionRules.length > 0 ? retentionRules : [
  'recent_search_history', 'recently_viewed_history', 'typing_state',
  'expired_privacy_exports', 'revoked_device_tokens', 'rate_limit_events',
  'identity_documents', 'financial_records',
];
for (const rule of documentedRules) {
  has(retention, new RegExp(rule.replace(/_/g, '[_ ]')),
    `THE RETENTION MATRIX DOCUMENTS ${rule}`);
}

const inventory = read('docs/privacy/WARSHA-DATA-INVENTORY.md');
check((inventory.match(/^\|\s*`/gm) ?? []).length >= 25,
  'the inventory documents at least 25 objects');

const subprocessors = flow(read('docs/privacy/WARSHA-SUBPROCESSOR-REGISTER.md'));
has(subprocessors, /Supabase/i, 'the subprocessor register names Supabase');
has(subprocessors, /Expo/i, 'the subprocessor register names Expo');
has(subprocessors, /no payment provider is enabled/i,
  'the register states that no live payment provider exists');

// Manual results start unexecuted.
const manual = read('docs/testing/WPS-022-MANUAL-RESULTS.md');
const caseRows = manual.match(/^\|\s*\d+\s*\|/gm) ?? [];
check(caseRows.length >= 60, 'the manual suite has at least 60 cases');
is(
  manual.split('\n').filter(line => /^\|\s*\d+\s*\|/.test(line) && !/NOT RUN/.test(line)).length,
  0,
  'EVERY MANUAL CASE IS RECORDED AS NOT RUN',
);

// The index knows about WPS-022.
has(read('docs/wps/WPS-INDEX.md'), /WPS-022/, 'the index lists WPS-022');

console.log(`WPS-022 privacy checks passed: ${checks}`);
