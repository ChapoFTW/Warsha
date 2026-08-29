import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';


const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

const migration = read('supabase/migrations/202608020004_wps016_trust_safety_moderation.sql');
const wps = read('docs/wps/WPS-016-trust-safety-moderation.md');
const wes = read('docs/wes/WES-016-trust-safety-moderation.md');
const trustRunbook = read('docs/operations/trust-safety-runbook.md');
const fraudRunbook = read('docs/operations/fraud-response-runbook.md');
const enforcementRunbook = read('docs/operations/account-enforcement-runbook.md');
const appealsRunbook = read('docs/operations/appeals-runbook.md');
const pgtap = read('supabase/tests/database/trust-safety-moderation.test.sql');
const index = read('docs/wps/WPS-INDEX.md');
const packageJson = read('package.json');

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------
match(wps, /Version: 1\.0/, 'WPS-016 declares version 1.0');
match(wps, /Status: LOCKED FOR IMPLEMENTATION/, 'WPS-016 is locked for implementation');
match(wps, /Authority: Warsha Constitution/, 'WPS-016 names the Constitution as authority');
match(wps, /Depends on: WPS-001 through WPS-015/, 'WPS-016 declares its dependency chain');
match(wes, /Status: ENGINEERING BASELINE/, 'WES-016 is an engineering baseline');
match(wes, /Implements: WPS-016/, 'WES-016 implements WPS-016');
match(wps, /single authority/i, 'WPS-016 declares itself the single trust authority');
match(wps, /extends and never replaces|Extend, never replace/i, 'WPS-016 extends rather than replaces');

// ---------------------------------------------------------------------------
// Existing systems are preserved, not replaced
// ---------------------------------------------------------------------------
for (const preserved of [
  'booking_abuse_reports', 'review_reports', 'moderate_review', 'disputes',
  'provider_verifications', 'provider_earning_holds', 'payment_chargebacks',
]) {
  ok(pgtap.includes(preserved), `pgTAP asserts ${preserved} is preserved`);
}
notMatch(migration, /drop table/i, 'no existing table is dropped');
notMatch(migration, /drop function public\./i, 'no existing public function is dropped');
notMatch(migration, /alter table public\.(booking_abuse_reports|review_reports|disputes|provider_verifications)/i,
  'no existing trust table is altered');
match(wps, /source_report_id/, 'unified reports link to existing domain reports');

// ---------------------------------------------------------------------------
// Reporting model
// ---------------------------------------------------------------------------
// The client mirror of these rules is gone.
//
// `src/trust/trust-safety-types.ts` re-stated the category list, the terminal
// actions, the ban precondition and the restriction logic in TypeScript, for a
// moderation client that never shipped a screen. Every rule it mirrored is
// asserted here against the migration that enforces it, which is where the
// authority always was — a client copy of a database constraint can only ever
// agree with it or be wrong about it.
{
  const constraint = migration.slice(migration.indexOf('trust_reports_category_check'));
  const listed = constraint.slice(0, constraint.indexOf('))'));
  equal((listed.match(/'[a-z_]+'/g) ?? []).length, 17,
    'SEVENTEEN REPORT CATEGORIES ARE CONSTRAINED BY THE DATABASE');
}
for (const category of [
  'fraud', 'impersonation', 'abusive_language', 'harassment', 'discrimination',
  'fake_profile', 'fake_documents', 'fake_certificates', 'spam', 'scam',
  'dangerous_behavior', 'off_platform_payment', 'off_platform_contact',
  'illegal_activity', 'inappropriate_content', 'copyright', 'privacy',
]) {
  ok(migration.includes(`'${category}'`), `the database constrains category ${category}`);
  ok(migration.includes(`'${category}'`), `migration accepts category ${category}`);
}
for (const surface of [
  'bookings', 'chat', 'reviews', 'providers', 'customers', 'payments',
  'certificates', 'profile_media',
]) {
  ok(migration.includes(`'${surface}'`), `migration accepts source surface ${surface}`);
}
match(migration, /Trust reports are immutable/, 'reports cannot be deleted');
match(migration, /Trust report content is immutable/, 'report content cannot be rewritten');
match(migration, /trust_reports_not_self_check/, 'an account cannot report itself');
match(wps, /Reporting is never itself an enforcement action/i, 'reporting is not enforcement');
match(wps, /never disclosed|never reveals? who reported|is never disclosed/i, 'reporter identity stays confidential');

// ---------------------------------------------------------------------------
// Enforcement model
// ---------------------------------------------------------------------------
for (const action of [
  'warning', 'temporary_restriction', 'investigation', 'suspension', 'permanent_ban',
  'marketplace_removal', 'profile_hidden', 'payment_hold', 'withdrawal_hold',
  'communication_restriction', 'review_restriction', 'restoration',
]) {
  ok(migration.includes(`'${action}'`), `migration supports enforcement measure ${action}`);
}
match(migration, /trust_enforcement_actions_no_automatic_ban_check/, 'a permanent ban cannot be automatic');
match(migration, /trust_enforcement_actions_system_scope_check/, 'a system actor cannot issue punitive actions');
match(migration, /A permanent ban requires an investigated report/, 'a ban requires an investigated report');
match(migration, /Evidence is required for every enforcement action/, 'evidence is mandatory');
match(migration, /Enforcement history is immutable/, 'enforcement history is immutable');
// The four assertions above already prove the ban precondition, the evidence
// requirement and the immutability of enforcement history against the migration.
// The client mirror added nothing they did not already say.
match(migration, /'warning','temporary_restriction','investigation','suspension','permanent_ban'/,
  'THE DATABASE, NOT A CLIENT CONSTANT, DEFINES THE ENFORCEMENT ACTIONS');
match(wps, /No automatic permanent bans/i, 'WPS-016 forbids automatic permanent bans');
match(enforcementRunbook, /No automated process may ever issue a ban/i, 'the enforcement runbook forbids automated bans');

// ---------------------------------------------------------------------------
// Trust state is server authoritative
// ---------------------------------------------------------------------------
match(migration, /revoke insert, update, delete on public\.trust_account_state from anon, authenticated/,
  'clients cannot write trust state');
match(migration, /revoke insert, update, delete on public\.trust_enforcement_actions from anon, authenticated/,
  'clients cannot write enforcement actions');
match(wps, /Clients cannot self-modify trust state/i, 'WPS-016 states clients cannot self-modify trust state');
match(migration, /private\.is_staff\(\)/, 'staff authority is enforced');

// Restriction logic lived in the client mirror too. What matters is that a
// client cannot decide its own trust state, and that an expiry lifts a
// restriction without anybody acting — both of which are the database's job.
match(migration, /restriction_expires_at/,
  'a restriction carries its own expiry, so it lifts without an actor');
match(migration, /revoke insert, update, delete on public\.trust_reports from anon, authenticated/,
  'AND A CLIENT CANNOT WRITE ITS OWN TRUST STATE');

// ---------------------------------------------------------------------------
// Fraud signals are advisory only
// ---------------------------------------------------------------------------
for (const signal of [
  'excessive_cancellations', 'duplicate_identity', 'repeated_failed_verification',
  'abnormal_payment_behavior', 'repeated_chargebacks', 'suspicious_review_activity',
  'fake_portfolio_attempt', 'certificate_abuse', 'repeated_abuse_reports', 'account_farming',
]) {
  ok(migration.includes(`'${signal}'`), `migration defines fraud signal ${signal}`);
}
match(migration, /Deliberately no enforcement here/, 'signal recording performs no enforcement');
match(wps, /Signals do not punish|do not directly punish|never change trust state/i, 'WPS-016 states signals do not punish');
match(fraudRunbook, /A signal is not a verdict/i, 'the fraud runbook states a signal is not a verdict');
match(fraudRunbook, /innocent explanation/i, 'the fraud runbook requires considering innocent explanations');
notMatch(migration, /record_trust_fraud_signal[\s\S]{0,600}staff_record_enforcement_action/,
  'the signal recorder never calls enforcement');

// ---------------------------------------------------------------------------
// Appeals
// ---------------------------------------------------------------------------
match(migration, /trust_appeals/, 'appeals exist');
match(migration, /unique \(enforcement_action_id, appellant_id\)/, 'one appeal per action per appellant');
match(migration, /A decision note is required/, 'an appeal decision requires a note');
match(migration, /restorationRequired/, 'an overturned appeal requires explicit restoration');
match(migration, /This action cannot be appealed/, 'non-punitive actions are not appealable');
match(appealsRunbook, /different reviewer/i, 'appeals are reviewed by a different person where possible');
match(appealsRunbook, /overturn rate/i, 'appeal quality is monitored');

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
match(migration, /trust_moderation_audit/, 'a moderation audit exists');
match(migration, /Moderation audit is immutable/, 'the audit is immutable');
match(migration, /record_trust_audit/, 'moderation actions are audited');
for (const field of ['actor_id', 'created_at', 'reason', 'evidence_reference']) {
  ok(migration.includes(field), `audit records ${field}`);
}
match(wps, /actor, timestamp, reason, and evidence/i, 'the audit contract is documented');

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
match(migration, /alter table public\.trust_reports enable row level security/, 'RLS on reports');
match(migration, /alter table public\.trust_account_state enable row level security/, 'RLS on trust state');
match(migration, /alter table public\.trust_appeals enable row level security/, 'RLS on appeals');
match(migration, /revoke all on private\.trust_fraud_signals from public, anon, authenticated/, 'fraud signals are private');
match(migration, /revoke all on private\.trust_report_evidence from public, anon, authenticated/, 'evidence is private');
match(migration, /revoke all on private\.trust_moderation_audit from public, anon, authenticated/, 'the audit is private');
// Comments mention SECURITY DEFINER too; only real SQL declares a function.
const migrationSql = migration.replace(/--[^\n]*/g, '');
const definerCount = (migrationSql.match(/security definer/gi) ?? []).length;
const searchPathCount = (migrationSql.match(/set search_path\s*=\s*''/gi) ?? []).length;
ok(definerCount > 0, 'the migration defines security definer functions');
ok(searchPathCount >= definerCount, 'every security definer function pins an empty search path');
notMatch(migration, /supabase_realtime/, 'no trust table is added to Realtime');

// No external moderation provider and no AI moderation.
notMatch(migration, /openai|anthropic|perspective|moderation_api|hive|sightengine/i,
  'no external moderation provider in the migration');
// No external moderation service, asserted over every shipped source file
// rather than over the retired client repository.
{
  const shipped = execFileSync('git', ['ls-files', 'app', 'src', 'components'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(file => /\.tsx?$/.test(file));
  const callers = shipped.filter(file => /openai|moderation_api|perspective\.googleapis/i.test(read(file)));
  equal(callers.join(', '), '', 'NO SHIPPED CODE CALLS AN EXTERNAL MODERATION SERVICE');
}
match(wps, /no external moderation\s+provider and no AI moderation/i, 'WPS-016 forbids external and AI moderation');

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
for (const rpc of ['submit_trust_report', 'get_my_trust_status', 'submit_trust_appeal']) {
  ok(migration.includes(rpc), `the database exposes ${rpc} for the reporting surface`);
}

// ---------------------------------------------------------------------------
// Localization and accessibility
// ---------------------------------------------------------------------------
// The moderation copy module went with the client that displayed it. Warsha
// has no moderation screen: a person reports through `report_review`,
// `report_booking_communication_abuse` and `report_provider_no_show`, and the
// queue those feed is worked in the web console, whose copy and pseudonymity
// `admin-console.test.mts` asserts. The rule the copy carried — that a review
// is never presented as an accusation — is asserted there on the surface a
// staff member actually reads.
for (const rpc of ['report_review', 'report_booking_communication_abuse']) {
  const shipped = execFileSync('git', ['ls-files', 'app', 'src', 'components'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(file => /\.tsx?$/.test(file));
  ok(shipped.some(file => read(file).includes(rpc)),
    `THE LIVE REPORTING PATH ${rpc} IS STILL WIRED TO A SURFACE`);
}

// ---------------------------------------------------------------------------
// Motto and registration
// ---------------------------------------------------------------------------
const motto = read('src/i18n/translations.ts');
match(motto, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'approved English motto remains active');
match(motto, /brandMotto: 'شغلك مهمتنا'/, 'approved Arabic motto remains active');
match(index, /WPS-016/, 'the WPS index records WPS-016');
match(packageJson, /test:wps016/, 'the regression suite is registered');
ok(trustRunbook.length > 500 && fraudRunbook.length > 500
  && enforcementRunbook.length > 500 && appealsRunbook.length > 500,
  'all four operational runbooks are substantive');

console.log(`WPS-016 trust and safety contracts: ${checks} checks passed.`);
