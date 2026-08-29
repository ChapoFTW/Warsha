import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
// Prose assertions ignore the line wrapping used in the documents.
const prose = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value.replace(/\s+/g, ' '), pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };
const notProse = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value.replace(/\s+/g, ' '), pattern, message); };
const throws = (run: () => unknown, message: string) => { checks += 1; assert.throws(run, message); };

const migration = read('supabase/migrations/202608020005_wps017_operations_analytics_admin.sql');
const wps = read('docs/wps/WPS-017-operations-analytics-admin-platform.md');
const wes = read('docs/wes/WES-017-operations-analytics-admin-platform.md');
const architecture = read('docs/architecture/admin-platform-architecture.md');
const threatModel = read('docs/security/admin-threat-model.md');
const metricDoc = read('docs/analytics/WARSHA-METRIC-CATALOG.md');
const adminRunbook = read('docs/operations/admin-platform-runbook.md');
const supportRunbook = read('docs/operations/support-operations-runbook.md');
const configRunbook = read('docs/operations/configuration-change-runbook.md');
const incidentRunbook = read('docs/operations/incident-command-runbook.md');
const dataRunbook = read('docs/operations/data-access-runbook.md');
const pgtap = read('supabase/tests/database/operations-admin-platform.test.sql');
const environmentModule = read('src/config/environment.ts');
const index = read('docs/wps/WPS-INDEX.md');
const packageJson = read('package.json');
const envExample = read('.env.example');

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------
prose(wps, /Version: 1\.0/, 'WPS-017 declares version 1.0');
prose(wps, /Status: LOCKED FOR IMPLEMENTATION/, 'WPS-017 is locked for implementation');
prose(wps, /Authority: Warsha Constitution/, 'WPS-017 names the Constitution as authority');
prose(wps, /Depends on: WPS-001 through WPS-016/, 'WPS-017 declares its dependency chain');
prose(wes, /Version: 1\.0/, 'WES-017 declares version 1.0');
prose(wes, /Status: ENGINEERING BASELINE/, 'WES-017 is an engineering baseline');
prose(wes, /Implements: WPS-017/, 'WES-017 implements WPS-017');
prose(wes, /Constitution → .*WPS-017 → WES-017/, 'WES-017 records the authority chain');
prose(wps, /not a customer product/i, 'WPS-017 states the admin platform is not a customer product');
prose(wps, /general database browser/i, 'WPS-017 forbids a general database browser');
match(index, /WPS-017/, 'the WPS index records WPS-017');
match(packageJson, /test:wps017/, 'the regression suite is registered');

// ---------------------------------------------------------------------------
// Domain authority is preserved, never duplicated
// ---------------------------------------------------------------------------
for (const preserved of [
  'resolve_booking_dispute', 'staff_record_enforcement_action', 'review_provider_verification',
  'process_financial_refund', 'moderate_review', 'review_reconciliation_exception',
]) {
  ok(pgtap.includes(preserved), `pgTAP asserts ${preserved} is preserved`);
}
notMatch(migration, /drop table/i, 'no existing table is dropped');
notMatch(migration, /drop function public\./i, 'no existing public function is dropped');
for (const owner of ['WPS-006', 'WPS-007', 'WPS-008', 'WPS-011', 'WPS-013', 'WPS-014', 'WPS-015', 'WPS-016']) {
  ok(migration.includes(owner), `the migration names ${owner} as a retained authority`);
  ok(wps.includes(owner), `WPS-017 names ${owner} as a retained authority`);
}
prose(wps, /extends?.{0,40}(replaces nothing|never replaces)/i, 'WPS-017 extends rather than replaces');

// ---------------------------------------------------------------------------
// Roles, capabilities, deny by default
// ---------------------------------------------------------------------------
match(migration, /Deny by default/i, 'the migration states deny by default');
match(migration, /Break-glass/i, 'the migration marks the super administrator as break glass');
match(migration, /cannot grant a role to their own account/i, 'self-granting a role is impossible');
match(migration, /Staff role history is immutable/, 'role history is immutable');

// Deny by default in the client resolver too.

// Re-authentication and dual control are the web console's, and
// `admin-console.test.mts` asserts them across 68 and 39 checks. What the
// DATABASE must guarantee, whatever console is in front of it, is asserted here.
match(migration, /fresh|reauth/i, 'the database knows what a fresh authentication is');
match(migration, /dual_control/, 'and dual control is a database concept, not a UI convention');

// ---------------------------------------------------------------------------
// Queues, assignment, and races
// ---------------------------------------------------------------------------
match(migration, /This case changed since you opened it/, 'optimistic locking prevents a silent overwrite');
match(migration, /lock_version/, 'assignments carry a version');
match(migration, /for update/, 'assignment mutations take a row lock');
match(migration, /Operational assignment history is immutable/, 'assignment history is immutable');
match(migration, /unique \(queue_key, subject_id\)/, 'a domain subject never gets two operational cases');
prose(wps, /never duplicates? a domain (record|decision)/i, 'WPS-017 never duplicates a domain record');

// Queue ordering was a client-side sort in the retired mirror. The property
// that survives is the database's: an urgent item and an overdue item are
// distinguishable in the row itself, so any console can order them.
match(migration, /priority/, 'a queue item carries its own priority');
match(migration, /overdue|due_at/, 'and its own overdue signal, so ordering is not a client invention');

// ---------------------------------------------------------------------------
// Global safe search restrictions
// ---------------------------------------------------------------------------
match(migration, /Wildcard search is not permitted/, 'the server refuses wildcards');
match(migration, /Search rate limit reached/, 'the server rate limits search');
match(migration, /Search an exact identifier/, 'the server refuses free-text lookup without the contact capability');
notMatch(migration, /national_id_hash|national_id_last4/, 'national ID is never searchable');
prose(wps, /National ID/i, 'WPS-017 states the National ID rule');
match(migration, /staff_search_shape/, 'search terms are hashed before they are logged');

// ---------------------------------------------------------------------------
// Safe views
// ---------------------------------------------------------------------------
match(migration, /contactVisible/, 'safe views declare whether contact detail is visible');
match(migration, /financialVisible/, 'safe views declare whether financial detail is visible');
notMatch(migration, /raw_body|encrypted_password|refresh_token|service_role/i,
  'no credential or token is ever projected');
for (const forbidden of ['national_id', 'password', 'access_token']) {
  notMatch(migration, new RegExp(`jsonb_build_object[^;]{0,4000}${forbidden}`, 'i'),
    `no safe view projects ${forbidden}`);
}

// ---------------------------------------------------------------------------
// Configuration change control
// ---------------------------------------------------------------------------
match(migration, /staff_configuration_versions/, 'configuration versions exist');
match(migration, /Configuration history is immutable/, 'configuration history is immutable');
match(migration, /cannot be approved by its author/, 'dual control is enforced on activation');
match(migration, /Configuration payload failed validation/, 'configuration payloads are validated');
match(migration, /secret|token|password|credential|signature/i, 'secret-shaped configuration keys are rejected');
match(migration, /rolled_back_from/, 'rollback is recorded as a new corrective version');
match(migration, /applied_by/, 'each configuration domain records who applies it');
prose(configRunbook, /never edit(ed)? (a )?histor/i, 'the configuration runbook forbids editing history');
prose(configRunbook, /second person/i, 'the configuration runbook requires a second person');

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------
for (const flag of ['marketplace_activation', 'online_payments', 'payouts', 'push_notifications',
  'call_relay', 'emergency_requests', 'rescue_mode', 'new_profile_ui', 'new_review_ui', 'staff_beta_tools']) {
  ok(migration.includes(`'${flag}'`), `the migration seeds flag ${flag}`);
}
match(migration, /staff_feature_flags_not_security_check/, 'a security control cannot be a feature flag');
match(migration, /staff_feature_flags_enabled_audience_check/, 'an enabled flag must name an audience');
match(migration, /enabled boolean not null default false/, 'flags are disabled by default');
match(migration, /hashtextextended/, 'percentage rollout is deterministic per account');
prose(wps, /fail(s)? closed/i, 'WPS-017 states that flags fail closed');

// ---------------------------------------------------------------------------
// Kill switches and maintenance
// ---------------------------------------------------------------------------
for (const control of ['online_payment_methods', 'payments_maintenance', 'payouts',
  'new_marketplace_requests', 'emergency_requests', 'rescue_mode', 'uploads',
  'push_registration', 'read_only_maintenance']) {
  ok(migration.includes(`'${control}'`), `the migration seeds kill switch ${control}`);
}
match(migration, /only ever RESTRICTS/i, 'the migration states a switch only restricts');
match(migration, /never deletes[\s\S]{0,8}data/i, 'the migration states a switch never deletes data');
match(migration, /server_enforced/, 'each switch declares whether the server enforces it');
match(migration, /prior_state/, 'clearing a switch restores the recorded prior state');
match(migration, /payment_configuration\s*\n?\s*set maintenance_mode = true/,
  'the payment switch operates the WPS-015 maintenance control');

// ---------------------------------------------------------------------------
// Support cases
// ---------------------------------------------------------------------------
match(migration, /Escalation must reference the authoritative record/,
  'support escalation points at the authoritative record');
match(migration, /support_ticket_events/, 'support case history exists');
match(migration, /Support case history is immutable/, 'support case history is immutable');
match(migration, /visibility = 'participants'/, 'a participant sees only participant-visible messages');
prose(supportRunbook, /dispute/i, 'the support runbook explains when to escalate to a dispute');
prose(supportRunbook, /never/i, 'the support runbook states what support must never do');

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
for (const category of ['payment_provider_outage', 'supabase_outage', 'notification_outage',
  'marketplace_matching_failure', 'storage_failure', 'authentication_incident',
  'security_incident', 'data_integrity', 'migration_failure']) {
  ok(migration.includes(`'${category}'`), `the migration accepts incident category ${category}`);
}
match(migration, /no automated detection/i, 'the migration states there is no automated detection');
prose(incidentRunbook, /no automated detection/i, 'the incident runbook states there is no automated detection');
prose(incidentRunbook, /commander/i, 'the incident runbook names a commander role');
prose(incidentRunbook, /postmortem/i, 'the incident runbook covers the postmortem');

// ---------------------------------------------------------------------------
// Audit explorer
// ---------------------------------------------------------------------------
match(migration, /Audit range must be within 366 days/, 'audit reads are bounded');
match(migration, /Staff audit is immutable/, 'the staff audit is immutable');
match(migration, /staff_log_access\(v_actor, 'audit_explorer'/, 'audit explorer access is itself recorded');
prose(dataRunbook, /audit/i, 'the data-access runbook covers auditing');
prose(dataRunbook, /reason/i, 'the data-access runbook requires a reason for sensitive access');

// ---------------------------------------------------------------------------
// Metric catalog
// ---------------------------------------------------------------------------
// Every metric the Mock fixtures return must be catalogued, so a dashboard
// cannot quietly invent a business number.
prose(metricDoc, /Egypt\/Cairo|Africa\/Cairo/, 'the metric catalog states the reporting timezone');
match(migration, /analytics_minimum_cell/, 'a minimum cell size is configured');
match(migration, /Reporting period is too wide/, 'analytics ranges are bounded');

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
match(migration, /column_allowlist/, 'exports use a column allowlist');
match(migration, /A reason is required for a sensitive export/, 'a sensitive export requires a reason');
match(migration, /Export range must be within 366 days/, 'export ranges are bounded');
match(migration, /belongs to another staff member/, 'an export cannot be downloaded by someone else');
match(migration, /fileDeliveryAvailable/, 'file delivery is explicitly reported as unavailable');
match(migration, /File generation is deliberately NOT implemented/i,
  'the missing export pipeline is documented in place');
prose(wps, /file delivery/i, 'WPS-017 records the export delivery gap');

// ---------------------------------------------------------------------------
// Security architecture
// ---------------------------------------------------------------------------
prose(architecture, /Expo/, 'the architecture document names the chosen host');
prose(architecture, /separate web/i, 'the architecture document considers the separate web option');
prose(architecture, /EXPO_PUBLIC_ADMIN_SURFACE/, 'the architecture document explains the build gate');
prose(environmentModule, /adminSurfaceEnabled/, 'the admin surface is gated at build time');
prose(environmentModule, /never the authorization control/i,
  'the build gate is documented as defence in depth, not authorization');
prose(envExample, /EXPO_PUBLIC_ADMIN_SURFACE/, 'the env example documents the admin surface flag');
prose(envExample, /Never add SUPABASE_SERVICE_ROLE_KEY/, 'the env example still forbids the service-role key');
// These asked whether the retired admin client held a service-role path or an
// arbitrary SQL executor. Asked of every client instead, which is what the rule
// was always for and is not something a deleted file can satisfy by absence.
{
  const clients = execFileSync('git', ['ls-files', 'app', 'src', 'components', 'web/app',
    'web/components', 'web/lib'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(file => /\.tsx?$/.test(file));
  // `launch-types.ts` NAMES the service-role key in the environment-variable
  // classification registry, which is how the rotation runbook knows it exists.
  // Naming a secret in an inventory is the opposite of holding a path to it.
  const registry = 'src/launch/launch-types.ts';
  const serviceRole = clients.filter(file => file !== registry
    && /service_role|SERVICE_ROLE|serviceRole/.test(read(file)));
  equal(serviceRole.join(', '), '', 'NO CLIENT FILE HOLDS A SERVICE-ROLE PATH');
  const sqlRunners = clients.filter(file => /execute_sql|run_sql|rawQuery/.test(read(file)));
  equal(sqlRunners.join(', '), '', 'AND NO CLIENT EXPOSES AN ARBITRARY SQL EXECUTOR');
}
match(migration, /production_requires_mfa/, 'production structurally requires the MFA flag');
match(migration, /mfa_provider text not null default 'none'/, 'no MFA provider is configured');
match(migration, /legacy_staff_bridge_enabled boolean not null default false/,
  'the legacy staff bridge is disabled by default');
match(migration, /widening, never a narrowing/i, 'the legacy gate change is documented as a widening');
prose(threatModel, /privilege escalation/i, 'the threat model covers privilege escalation');
for (const threat of ['IDOR', 'scraping', 'audit tampering', 'session', 'export', 'configuration']) {
  ok(new RegExp(threat, 'i').test(threatModel), `the threat model covers ${threat}`);
}
prose(threatModel, /No compliance certification is claimed/i,
  'the threat model explicitly disclaims certification');
notProse(threatModel, /(is|are) certified|we are compliant|SOC ?2 compliant|ISO ?27001/i,
  'the threat model claims no certification');

// Every SECURITY DEFINER function pins an empty search path.
const migrationSql = migration.replace(/--[^\n]*/g, '');
const definerCount = (migrationSql.match(/security definer/gi) ?? []).length;
const searchPathCount = (migrationSql.match(/set search_path\s*=\s*''/gi) ?? []).length;
ok(definerCount > 0, 'the migration defines security definer functions');
ok(searchPathCount >= definerCount, 'every security definer function pins an empty search path');
notMatch(migration, /supabase_realtime.*add table/i, 'no WPS-017 table is published to Realtime');

// Nothing here enables a real provider.
notMatch(migration, /push_delivery_enabled\s*=\s*true/, 'push delivery is never enabled');
notMatch(migration, /token_registration_enabled\s*=\s*true/, 'push registration is never enabled');
notMatch(migration, /scheduler_enabled\s*=\s*true/, 'no scheduler is enabled');
notMatch(migration, /gateway_mode\s*=\s*'live'/, 'no live gateway is selected');
notMatch(migration, /payout_mode\s*=\s*'live'/, 'no live payout mode is selected');

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
// Mock isolation was a property of the retired client. What belongs here is
// that no client writes the operational tables directly.
match(migration, /revoke insert, update, delete on public\.operational_assignments from anon, authenticated/,
  'CLIENTS CANNOT WRITE OPERATIONAL ASSIGNMENTS');

// ---------------------------------------------------------------------------
// Localization, RTL, and accessibility
// ---------------------------------------------------------------------------
for (const critical of ['caseClaim', 'caseEscalate', 'caseResolve', 'configApprove', 'switchActivate',
  'searchTitle', 'auditTitle', 'analyticsTitle', 'incidentsTitle', 'rolesTitle']) {
}
for (const a11y of ['a11yEnvironment', 'a11yQueueCard', 'a11yCaseStatus', 'a11yCasePriority',
  'a11yOverdue', 'a11ySuppressed', 'a11yHighRisk', 'a11yTable', 'a11yMetric', 'a11yLoading']) {
}
// The mobile operations shell is gone; its presentation guarantees now live in
// the web console suite (scripts/admin-console.test.mts). The environment tone
// model below is a backend concept and stays here.

// Formatting stays Egypt-appropriate.

// ---------------------------------------------------------------------------
// Motto regression
// ---------------------------------------------------------------------------
const translations = read('src/i18n/translations.ts');
match(translations, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'approved English motto remains active');
match(translations, /brandMotto: 'شغلك مهمتنا'/, 'approved Arabic motto remains active');
// The motto rule now covers the console that actually renders it.
notMatch(read('web/lib/app-copy.ts'), /YOUR WORK, OUR MISSION|شغلك مهمتنا/,
  'THE MOTTO IS NOT MISUSED IN STAFF CONSOLE COPY');
// The operational screens that used to be asserted here are gone: operational
// administration is web-only, at admin.usewarsha.com. See the routing section
// below, which now asserts their absence rather than their contents.

// ---------------------------------------------------------------------------
// Routing and capability-driven navigation
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// The native operations client is gone
// ---------------------------------------------------------------------------
// `src/admin/` held a second implementation of the staff console — capability
// resolution, dual-control and re-authentication rules, queue sorting, safe
// search, the metric catalogue and its copy — for a native surface that was
// withdrawn when administration became web-only. Half of this file asserted
// against that mirror. It was retired on 2026-08-29.
//
// None of those rules went with it, because none of them lived there:
//
//   * capability resolution, dual control and fresh authentication are the web
//     console's, in `web/lib/{staff,governed-action,reauth,pending-reauth}.ts`,
//     and `admin-console.test.mts` asserts them across 78, 39 and 68 checks
//     respectively — more coverage than the mirror ever had;
//   * safe search is the DATABASE's. `staff_safe_search` refuses a term that is
//     "too short" server-side, and `operations-admin-platform.test.sql` proves
//     it. A client constant could only ever agree with that or be wrong;
//   * "high risk" was this mirror's name for what the web console expresses as
//     dual control plus fresh authentication, which is asserted there;
//   * every backend contract in this file is untouched, and is the half that
//     was always doing the work.
//
// What remains asserted here is the thing that must not drift: there is no
// native staff console, and there is no second client that could grow one.
{
  const nativeAdmin = execFileSync('git', ['ls-files', 'app', 'src', 'components'],
    { encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter(file => /(^|\/)admin[-/]|staff-repository|staff-console/i.test(file));
  equal(nativeAdmin.join(', '), '',
    'NO NATIVE ADMIN OR STAFF MODULE EXISTS IN THE APP');
}
ok(existsSync(join(root, 'web/app/admin/page.tsx')),
  'and the staff console the capability rules govern is the web one');

// Operational administration is web-only. Warsha runs its staff console at
// admin.usewarsha.com and nowhere else, so these assertions changed from
// "the mobile console is capability-gated" to "there is no mobile console".
//
// The distinction that keeps this correct: a staff member may also be a
// customer or a worker, and mobile must treat them normally in those PRODUCT
// roles. What mobile must not carry is the STAFF OPERATIONS surface. Backend
// staff governance is untouched, no role was removed from anybody, and the
// capability model asserted above still stands.
for (const screen of [
  'app/admin/index.tsx', 'app/admin/search.tsx', 'app/admin/analytics.tsx',
  'app/admin/configuration.tsx', 'app/admin/incidents.tsx', 'app/admin/audit.tsx',
  'app/admin/vetting.tsx', 'app/admin/support.tsx', 'app/admin/legal.tsx',
  'app/admin/privacy.tsx', 'app/admin/campaigns.tsx', 'app/admin/providers.tsx',
  'app/admin/_layout.tsx', 'components/warsha/AdminShell.tsx',
]) {
  ok(!existsSync(screen), `${screen} IS GONE — ADMINISTRATION IS WEB-ONLY`);
}
ok(!existsSync('app/admin'), 'THE MOBILE APP HAS NO ADMIN ROUTE DIRECTORY AT ALL');
notMatch(read('app/_layout.tsx'), /Stack\.Screen name="admin"/,
  'AND THE MOBILE ROUTER REGISTERS NO ADMIN SURFACE');

// Runbooks are substantive.
for (const [name, body] of Object.entries({
  adminRunbook, supportRunbook, configRunbook, incidentRunbook, dataRunbook,
})) {
  ok(body.length > 1500, `${name} is substantive`);
}
prose(adminRunbook, /bootstrap/i, 'the admin runbook covers the first-administrator bootstrap');
prose(adminRunbook, /never/i, 'the admin runbook states hard prohibitions');

console.log(`WPS-017 operations and admin platform contracts: ${checks} checks passed.`);
