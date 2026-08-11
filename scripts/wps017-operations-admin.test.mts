import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { adminCopy } from '../src/admin/admin-copy.ts';
import {
  analyticsRangeIsValid,
  anonymousStaffSession,
  canPerform,
  caseStatuses,
  caseStatusTone,
  casePriorities,
  dualControlCapabilities,
  environmentTone,
  formatAge,
  formatEgpMinor,
  hasCapability,
  hasEveryCapability,
  highRiskCapabilities,
  isCaseOpen,
  isHighRisk,
  isSuppressedMetric,
  minimumSearchLength,
  priorityRank,
  priorityTone,
  reauthCapabilities,
  requiresDualControl,
  searchTermIsAllowed,
  sortQueueItems,
  staffCapabilities,
  staffDashboards,
  staffQueueKeys,
  staffRoleKeys,
  supportCategories,
  auditSources,
  type StaffCapability,
  type StaffQueueItem,
  type StaffSession,
} from '../src/admin/admin-types.ts';
import {
  findMetric,
  isDocumentedMetric,
  metricCatalog,
  metricsForDashboard,
} from '../src/admin/metric-catalog.ts';
import {
  mockAnalytics,
  mockCapabilitiesFor,
  mockCase,
  mockClaimCase,
  mockHome,
  mockQueue,
  mockReauthenticate,
  mockSession,
  mockStaffPersonas,
  mockTransitionCase,
  resetMockAdminState,
  setMockPersona,
} from '../src/admin/mock-admin-state.ts';

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
const repository = read('src/admin/admin-repository.ts');
const context = read('src/admin/admin-context.tsx');
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
equal(staffRoleKeys.length, 9, 'nine staff roles are defined');
ok(staffCapabilities.length >= 30, 'the capability catalog is populated');
for (const role of staffRoleKeys) {
  ok(migration.includes(`'${role}'`), `the migration seeds role ${role}`);
}
for (const capability of staffCapabilities) {
  ok(migration.includes(`'${capability}'`), `the migration seeds capability ${capability}`);
}
match(migration, /Deny by default/i, 'the migration states deny by default');
match(migration, /Break-glass/i, 'the migration marks the super administrator as break glass');
match(migration, /cannot grant a role to their own account/i, 'self-granting a role is impossible');
match(migration, /Staff role history is immutable/, 'role history is immutable');

// Deny by default in the client resolver too.
const noSession: StaffSession = anonymousStaffSession;
equal(hasCapability(noSession, 'view_operations_home'), false, 'an anonymous session holds nothing');
const supportSession: StaffSession = {
  isStaff: true, staffId: 's1', roles: ['support_agent'],
  capabilities: ['view_operations_home', 'safe_search', 'manage_support_cases'],
  reauthValid: false, platformReady: true,
};
equal(hasCapability(supportSession, 'view_operations_home'), true, 'a held capability resolves true');
equal(hasCapability(supportSession, 'initiate_refund'), false, 'an unheld capability resolves false');
equal(hasCapability({ ...supportSession, platformReady: false }, 'safe_search'), false,
  'an unready platform denies every capability');
equal(hasCapability({ ...supportSession, isStaff: false }, 'safe_search'), false,
  'a non-staff session denies every capability');
equal(hasEveryCapability(supportSession, ['view_operations_home', 'safe_search']), true,
  'every-capability resolves true when all are held');
equal(hasEveryCapability(supportSession, ['view_operations_home', 'view_audit_logs']), false,
  'every-capability resolves false when one is missing');

// Re-authentication and dual control.
for (const capability of ['manage_staff_roles', 'initiate_refund', 'manage_kill_switches',
  'export_operational_report', 'approve_permanent_ban', 'approve_configuration'] as StaffCapability[]) {
  ok(reauthCapabilities.includes(capability), `${capability} requires re-authentication`);
  ok(isHighRisk(capability), `${capability} is marked high risk`);
}
for (const capability of dualControlCapabilities) {
  equal(requiresDualControl(capability), true, `${capability} requires dual control`);
}
const staleAdmin: StaffSession = {
  isStaff: true, staffId: 's2', roles: ['security_administrator'],
  capabilities: ['manage_staff_roles', 'view_audit_logs'], reauthValid: false, platformReady: true,
};
equal(canPerform(staleAdmin, 'manage_staff_roles'), false, 'a stale session cannot take a high-risk action');
equal(canPerform({ ...staleAdmin, reauthValid: true }, 'manage_staff_roles'), true,
  'a fresh re-authentication unlocks the high-risk action');
equal(canPerform(staleAdmin, 'view_audit_logs'), true, 'a normal capability does not need re-authentication');
// Role removal is immediate: an emptied capability list denies everything.
equal(canPerform({ ...staleAdmin, capabilities: [], reauthValid: true }, 'manage_staff_roles'), false,
  'removing the role removes the capability immediately');
equal(highRiskCapabilities.every(capability => staffCapabilities.includes(capability)), true,
  'every high-risk capability is a real capability');

// ---------------------------------------------------------------------------
// Queues, assignment, and races
// ---------------------------------------------------------------------------
equal(staffQueueKeys.length, 18, 'eighteen work queues are defined');
for (const queue of staffQueueKeys) {
  ok(migration.includes(`'${queue}'`), `the migration seeds queue ${queue}`);
}
equal(caseStatuses.length, 8, 'eight case statuses are defined');
for (const status of caseStatuses) {
  ok(migration.includes(`'${status}'`), `the migration accepts case status ${status}`);
}
for (const priority of casePriorities) {
  ok(migration.includes(`'${priority}'`), `the migration accepts priority ${priority}`);
}
match(migration, /This case changed since you opened it/, 'optimistic locking prevents a silent overwrite');
match(migration, /lock_version/, 'assignments carry a version');
match(migration, /for update/, 'assignment mutations take a row lock');
match(migration, /Operational assignment history is immutable/, 'assignment history is immutable');
match(migration, /unique \(queue_key, subject_id\)/, 'a domain subject never gets two operational cases');
prose(wps, /never duplicates? a domain (record|decision)/i, 'WPS-017 never duplicates a domain record');

equal(priorityRank('urgent') < priorityRank('high'), true, 'urgent outranks high');
equal(priorityRank('high') < priorityRank('normal'), true, 'high outranks normal');
equal(priorityRank('normal') < priorityRank('low'), true, 'normal outranks low');
const queueItems: StaffQueueItem[] = [
  { assignmentId: 'a', subjectType: 'dispute', subjectId: 'd1', status: 'assigned', priority: 'normal', reasonCode: null, assignedTo: null, assignedToName: null, dueAt: null, createdAt: '', updatedAt: '', lockVersion: 1, ageSeconds: 100, overdue: false },
  { assignmentId: 'b', subjectType: 'dispute', subjectId: 'd2', status: 'assigned', priority: 'urgent', reasonCode: null, assignedTo: null, assignedToName: null, dueAt: null, createdAt: '', updatedAt: '', lockVersion: 1, ageSeconds: 10, overdue: false },
  { assignmentId: 'c', subjectType: 'dispute', subjectId: 'd3', status: 'assigned', priority: 'normal', reasonCode: null, assignedTo: null, assignedToName: null, dueAt: null, createdAt: '', updatedAt: '', lockVersion: 1, ageSeconds: 900, overdue: true },
];
const sorted = sortQueueItems(queueItems);
equal(sorted[0].assignmentId, 'b', 'urgent sorts first');
equal(sorted[1].assignmentId, 'c', 'the oldest normal item sorts before the newest');
equal(isCaseOpen('closed'), false, 'a closed case is not open');
equal(isCaseOpen('escalated'), true, 'an escalated case is still open');
equal(caseStatusTone('escalated'), 'error', 'escalation reads as an error tone');
equal(caseStatusTone('resolved'), 'success', 'resolution reads as a success tone');
equal(priorityTone('urgent'), 'error', 'urgent reads as an error tone');
equal(priorityTone('low'), 'neutral', 'low reads as a neutral tone');

// ---------------------------------------------------------------------------
// Global safe search restrictions
// ---------------------------------------------------------------------------
equal(minimumSearchLength >= 6, true, 'the minimum search length is at least six');
equal(searchTermIsAllowed('abc'), false, 'a short term is rejected');
equal(searchTermIsAllowed('abcdef%'), false, 'a wildcard term is rejected');
equal(searchTermIsAllowed('abcdef_'), false, 'an underscore wildcard is rejected');
equal(searchTermIsAllowed('b1700000-0000-4000-8000-000000000001'), true, 'a full identifier is accepted');
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
equal(supportCategories.length, 9, 'nine support categories are defined');
for (const category of supportCategories) {
  ok(migration.includes(`'${category}'`), `the migration accepts support category ${category}`);
}
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
equal(auditSources.length, 9, 'nine audit sources are explorable');
for (const source of auditSources) {
  ok(migration.includes(`'${source}'`), `the migration exposes audit source ${source}`);
}
match(migration, /Audit range must be within 366 days/, 'audit reads are bounded');
match(migration, /Staff audit is immutable/, 'the staff audit is immutable');
match(migration, /staff_log_access\(v_actor, 'audit_explorer'/, 'audit explorer access is itself recorded');
prose(dataRunbook, /audit/i, 'the data-access runbook covers auditing');
prose(dataRunbook, /reason/i, 'the data-access runbook requires a reason for sensitive access');

// ---------------------------------------------------------------------------
// Metric catalog
// ---------------------------------------------------------------------------
equal(staffDashboards.length, 9, 'nine dashboards are defined');
ok(metricCatalog.length >= 60, 'the metric catalog is substantive');
for (const metric of metricCatalog) {
  ok(metric.businessQuestion.length > 10, `${metric.key} documents a business question`);
  ok(metric.sources.length > 0, `${metric.key} documents its sources`);
  ok(metric.numerator.length > 5, `${metric.key} documents a numerator`);
  ok(metric.inclusion.length > 5, `${metric.key} documents inclusion criteria`);
  ok(metric.exclusion.length > 3, `${metric.key} documents exclusion criteria`);
  ok(metric.updateFrequency.length > 5, `${metric.key} documents an update frequency`);
  ok(metric.limitations.length > 10, `${metric.key} documents known limitations`);
  ok(metricDoc.includes(metric.key), `the metric catalog document lists ${metric.key}`);
}
for (const dashboard of staffDashboards) {
  ok(metricsForDashboard(dashboard).length > 0, `dashboard ${dashboard} has documented metrics`);
}
equal(isDocumentedMetric('marketplace', 'requestsCreated'), true, 'a catalogued metric is documented');
equal(isDocumentedMetric('marketplace', 'inventedMetric'), false, 'an uncatalogued metric is not documented');
ok(findMetric('financial', 'commissionMinor')?.privacy === 'financial_restricted',
  'financial metrics are privacy classified as restricted');
ok(findMetric('customers', 'activeCustomers')?.privacy === 'aggregate_suppressed',
  'cohort metrics are privacy classified as suppressed');
// Every metric the Mock fixtures return must be catalogued, so a dashboard
// cannot quietly invent a business number.
for (const dashboard of staffDashboards) {
  for (const key of Object.keys(mockAnalytics(dashboard))) {
    if (key === 'currency') continue;
    ok(isDocumentedMetric(dashboard, key), `mock metric ${dashboard}.${key} is catalogued`);
  }
}
prose(metricDoc, /Egypt\/Cairo|Africa\/Cairo/, 'the metric catalog states the reporting timezone');
match(migration, /analytics_minimum_cell/, 'a minimum cell size is configured');
match(migration, /Reporting period is too wide/, 'analytics ranges are bounded');
equal(analyticsRangeIsValid('2026-01-01', '2026-01-31'), true, 'a normal range is valid');
equal(analyticsRangeIsValid('2026-01-31', '2026-01-01'), false, 'a reversed range is invalid');
equal(analyticsRangeIsValid('2020-01-01', '2026-01-01'), false, 'an unbounded range is invalid');
equal(isSuppressedMetric(null), true, 'a null metric is treated as suppressed');
equal(isSuppressedMetric(0), false, 'zero is not suppression');

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
notMatch(repository, /service_role|SERVICE_ROLE|serviceRole/, 'the admin repository holds no service-role path');
notMatch(context, /service_role|SERVICE_ROLE/, 'the admin context holds no service-role path');
notMatch(repository, /\bexecute_sql\b|\brun_sql\b|rawQuery/, 'there is no arbitrary SQL executor in the client');
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
match(repository, /environment\.dataMode === 'mock'/, 'Mock mode is isolated in the repository');
notMatch(repository, /catch[\s\S]{0,120}mock/i, 'a hosted failure never falls back into a Mock write');
equal(mockStaffPersonas.length, 9, 'a Mock persona exists for every role');
for (const persona of mockStaffPersonas) {
  ok(persona.roles.length > 0, `persona ${persona.id} carries a role`);
}
resetMockAdminState();
setMockPersona('mock-staff-support');
const mockSupport = mockSession();
equal(mockSupport.roles[0], 'support_agent', 'the Mock persona switch works');
equal(mockSupport.capabilities.includes('review_disputes'), false,
  'the Mock support persona cannot reach the dispute queue');
equal(mockHome().queues.some(queue => queue.queueKey === 'open_disputes'), false,
  'Mock queue visibility follows the persona capabilities');
setMockPersona('mock-staff-dispute');
equal(mockHome().queues.some(queue => queue.queueKey === 'open_disputes'), true,
  'a dispute reviewer sees the dispute queue in Mock');
equal(mockCapabilitiesFor(['support_agent']).includes('manage_staff_roles'), false,
  'the Mock capability map denies by default');
equal(mockCapabilitiesFor(['super_administrator']).length >= staffCapabilities.length - 1,
  true, 'the Mock break-glass role reaches everything');
const mockQueueView = mockQueue('open_disputes');
ok(mockQueueView.items.length > 0, 'the Mock dispute queue renders items');
const mockCaseRecord = mockCase(mockQueueView.items[0].assignmentId);
ok(mockCaseRecord !== null, 'a Mock case can be opened');
throws(() => mockTransitionCase(mockQueueView.items[0].assignmentId, 'resolved', 99, null),
  'a stale Mock version is rejected exactly as the server rejects it');
const claimed = mockClaimCase(mockQueueView.items[0].assignmentId, mockQueueView.items[0].lockVersion);
ok(claimed.lockVersion > mockQueueView.items[0].lockVersion, 'claiming advances the Mock version');
mockReauthenticate();
equal(mockSession().reauthValid, true, 'Mock re-authentication is recorded');
resetMockAdminState();
equal(mockSession().reauthValid, false, 'resetting Mock state clears the attestation');

// ---------------------------------------------------------------------------
// Localization, RTL, and accessibility
// ---------------------------------------------------------------------------
const en = adminCopy.en;
const ar = adminCopy.ar;
equal(Object.keys(en).length, Object.keys(ar).length, 'English and Arabic key counts match');
for (const key of Object.keys(en)) {
  ok(key in ar, `Arabic copy exists for ${key}`);
  ok((ar as Record<string, string>)[key].length > 0, `Arabic copy for ${key} is not empty`);
}
match(Object.values(ar).join(' '), /[؀-ۿ]/, 'Arabic copy uses Arabic script');
for (const critical of ['caseClaim', 'caseEscalate', 'caseResolve', 'configApprove', 'switchActivate',
  'searchTitle', 'auditTitle', 'analyticsTitle', 'incidentsTitle', 'rolesTitle']) {
  ok(critical in en && critical in ar, `critical workflow label ${critical} is bilingual`);
}
for (const a11y of ['a11yEnvironment', 'a11yQueueCard', 'a11yCaseStatus', 'a11yCasePriority',
  'a11yOverdue', 'a11ySuppressed', 'a11yHighRisk', 'a11yTable', 'a11yMetric', 'a11yLoading']) {
  ok(a11y in en && a11y in ar, `accessibility label ${a11y} is localized`);
}
// The mobile operations shell is gone; its presentation guarantees now live in
// the web console suite (scripts/admin-console.test.mts). The environment tone
// model below is a backend concept and stays here.
equal(environmentTone('production'), 'error', 'production reads as the strongest tone');
equal(environmentTone('staging'), 'warning', 'staging reads as a warning tone');
equal(environmentTone('development'), 'neutral', 'development is distinct and reads as a neutral tone');
equal(environmentTone('local'), 'neutral', 'local reads as a neutral tone');

// Formatting stays Egypt-appropriate.
match(formatEgpMinor('128450', 'en'), /EGP/, 'English money is labelled EGP');
match(formatEgpMinor('128450', 'ar'), /ج\.م/, 'Arabic money uses the Egyptian pound symbol');
equal(formatEgpMinor(null, 'en'), '—', 'a missing amount renders as an em dash');
match(formatAge(3_600, 'en'), /1h/, 'English ages are compact');
match(formatAge(3_600, 'ar'), /س/, 'Arabic ages use Arabic units');

// ---------------------------------------------------------------------------
// Motto regression
// ---------------------------------------------------------------------------
const translations = read('src/i18n/translations.ts');
match(translations, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'approved English motto remains active');
match(translations, /brandMotto: 'شغلك مهمتنا'/, 'approved Arabic motto remains active');
notMatch(read('src/admin/admin-copy.ts'), /YOUR WORK, OUR MISSION|شغلك مهمتنا/,
  'the motto is not repeated in operational copy');
// The operational screens that used to be asserted here are gone: operational
// administration is web-only, at admin.usewarsha.com. See the routing section
// below, which now asserts their absence rather than their contents.

// ---------------------------------------------------------------------------
// Routing and capability-driven navigation
// ---------------------------------------------------------------------------
//
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
