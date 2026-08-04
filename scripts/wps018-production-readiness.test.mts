import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  blockersForPhase,
  classifyStaffRefusal,
  environmentAllowsRiskyAction,
  environmentRequiresBanner,
  featureActivation,
  featureActivationMatrix,
  isLaunchReady,
  isRateLimited,
  launchPhases,
  platformEnvironments,
  rateLimitSqlState,
  secretInventory,
  secretIsBundleSafe,
  surfaceIsRestricted,
  unknownPlatformStatus,
} from '../src/launch/launch-types.ts';

const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };
const prose = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value.replace(/\s+/g, ' '), pattern, message); };

const migration = read('supabase/migrations/202608030001_wps018_production_readiness.sql');
const pgtap = read('supabase/tests/database/production-readiness-launch.test.sql');
const wps = read('docs/wps/WPS-018-production-readiness-launch.md');
const wes = read('docs/wes/WES-018-production-readiness-launch.md');
const threatModel = read('docs/security/WPS-018-FINAL-THREAT-MODEL.md');
const gapRegister = read('docs/launch/READINESS-GAP-REGISTER.md');
const environmentMatrix = read('docs/launch/ENVIRONMENT-MATRIX.md');
const betaPlan = read('docs/launch/PRIVATE-BETA-PLAN.md');
const launchPlan = read('docs/launch/PRODUCTION-LAUNCH-PLAN.md');
const checklist = read('docs/launch/LAUNCH-CHECKLIST.md');
const rollbackPlan = read('docs/launch/ROLLBACK-PLAN.md');
const goNoGo = read('docs/launch/GO-NO-GO-CRITERIA.md');
const masterPlan = read('docs/testing/MASTER-MANUAL-TEST-PLAN.md');
const loadPlan = read('docs/testing/WPS-018-LOAD-TEST-PLAN.md');
const launchReadiness = read('docs/testing/WPS-018-LAUNCH-READINESS.md');
const validateWorkflow = read('.github/workflows/validate.yml');
const deployWorkflow = read('.github/workflows/deploy-database.yml');
const appJson = read('app.json');
const easJson = read('eas.json');
const envExample = read('.env.example');
const packageJson = read('package.json');
const index = read('docs/wps/WPS-INDEX.md');

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------
prose(wps, /Version: 1\.0/, 'WPS-018 declares version 1.0');
prose(wps, /Status: LOCKED FOR IMPLEMENTATION/, 'WPS-018 is locked for implementation');
prose(wps, /Authority: Warsha Constitution/, 'WPS-018 names the Constitution as authority');
prose(wps, /Depends on: WPS-001 through WPS-017/, 'WPS-018 declares its dependency chain');
prose(wes, /Status: ENGINEERING BASELINE/, 'WES-018 is an engineering baseline');
prose(wes, /Implements: WPS-018/, 'WES-018 implements WPS-018');
prose(wps, /introduces? no customer feature/i, 'WPS-018 introduces no customer feature');
match(index, /WPS-018/, 'the WPS index records WPS-018');
match(packageJson, /test:wps018/, 'the regression suite is registered');
for (const script of ['audit:secrets', 'audit:migrations', 'audit:environment']) {
  ok(packageJson.includes(script), `${script} is registered`);
}

// ---------------------------------------------------------------------------
// Domain logic was moved, never rewritten
// ---------------------------------------------------------------------------
match(migration, /alter function public\.%I\(%s\) rename to %I/,
  'legacy staff RPCs are renamed rather than reimplemented');
match(migration, /set schema private/, 'the original implementations are moved into the private schema');
notMatch(migration, /drop function public\./i, 'no public function is dropped');
notMatch(migration, /drop table/i, 'no table is dropped');
for (const preserved of ['resolve_booking_dispute', 'staff_record_enforcement_action',
  'review_provider_verification', 'process_financial_refund', 'moderate_review',
  'review_reconciliation_exception']) {
  ok(migration.includes(`public.${preserved}`), `${preserved} keeps its public name`);
  ok(migration.includes(`private.${preserved}_impl`), `${preserved} keeps its original body`);
}
ok(pgtap.includes('preserved verbatim in the private schema'),
  'pgTAP asserts the original implementations are preserved');

// ---------------------------------------------------------------------------
// Admin security closure
// ---------------------------------------------------------------------------
// 1. Server-verified freshness replaces the client attestation.
match(migration, /staff_auth_freshness_seconds/, 'server-verified freshness exists');
match(migration, /'amr'/, 'freshness is read from the signed authentication record');
prose(migration, /GoTrue signs .{0,80}PostgREST verifies/i,
  'the migration states why the claim is server-verified');
// Comments describe what was replaced and should say so; the mechanism itself
// must not accept anything the client asserts.
notMatch(migration.replace(/--[^\n]*/g, ''), /client[- ]attested/i,
  'no executable statement relies on a client attestation');
prose(migration, /client[- ]attested/i,
  'the migration records that the client attestation was replaced');
prose(wps, /server[- ]verifi(ed|able)/i, 'WPS-018 records the replacement');

// 2. MFA enforcement.
match(migration, /staff_mfa_satisfied/, 'MFA enforcement exists');
match(migration, /'aal2'/, 'the assurance level is checked');
match(migration, /supabase_totp/, 'a real second-factor provider is selectable');
match(migration, /Multi-factor authentication is required/, 'a single-factor session is refused');

// 3 and 4. Legacy staff RPC capability gates.
match(migration, /require_domain_staff/, 'the domain staff gate exists');
match(migration, /legacy_staff_rpc_grace_enabled/, 'the legacy grace path is explicit');
match(migration, /staff_platform_legacy_grace_check/, 'production cannot accept the legacy gate');
ok(pgtap.includes('a verification reviewer can no longer reach a dispute RPC'),
  'pgTAP proves the cross-domain gap is closed');

// 5. Narrow roles cannot reach privileged domains.
for (const denial of ['can no longer moderate a review', 'can no longer initiate a refund',
  'cannot read the payment operations summary', 'cannot resolve a reconciliation exception']) {
  ok(pgtap.includes(denial), `pgTAP proves a narrow role ${denial}`);
}

// 6. Session invalidation.
match(migration, /staff_session_revoked/, 'session revocation is checked on every capability');
match(migration, /This session was revoked/, 'a revoked session is refused');
ok(pgtap.includes('a revoked session is refused even with a valid, fresh token'),
  'pgTAP proves revocation beats a valid token');

// 7. Periodic access review.
match(migration, /staff_access_reviews/, 'access reviews are recorded');
match(migration, /access_review_interval_days/, 'a review interval is configured');
match(migration, /cannot review their own access/, 'self-review is refused');

// 8. Dual control.
match(migration, /staff_dual_control_requests/, 'dual control requests exist');
match(migration, /staff_dual_control_distinct_check/, 'the requester can never be the approver');
match(migration, /This action requires a second approver/, 'an irreversible action needs two people');
match(migration, /staff_platform_dual_control_check/, 'production cannot disable dual control');

// 9. The admin surface is not protected by obscurity.
prose(wps, /never.{0,60}(security boundary|bundle)/i,
  'WPS-018 states a bundled route is not a security boundary');
ok(read('scripts/audit-environment.mjs').includes('surfaceEnabled'),
  'the route audit checks the admin guard');

// ---------------------------------------------------------------------------
// Environment model
// ---------------------------------------------------------------------------
equal(platformEnvironments.length, 4, 'four environments are defined');
for (const env of platformEnvironments) {
  ok(migration.includes(`'${env}'`), `the migration accepts environment ${env}`);
  ok(environmentMatrix.includes(env), `the environment matrix documents ${env}`);
}
equal(launchPhases.length, 4, 'four launch phases are defined');
match(migration, /platform_environment_events/, 'environment changes are recorded');
match(migration, /Release history is immutable/, 'environment history cannot be rewritten');
equal(environmentRequiresBanner('production'), true, 'production always shows a banner');
equal(environmentRequiresBanner('staging'), true, 'staging always shows a banner');
equal(environmentRequiresBanner('local'), false, 'local needs no banner');
equal(environmentAllowsRiskyAction('production', null), false,
  'a risky production action is refused without an explicit acknowledgement');
equal(environmentAllowsRiskyAction('production', 'production'), true,
  'an acknowledged production action proceeds');
equal(environmentAllowsRiskyAction('staging', null), true, 'staging needs no acknowledgement');
prose(environmentMatrix, /separate projects?\b/i,
  'the environment matrix requires separate projects');
prose(environmentMatrix, /promotion/i, 'the environment matrix documents the promotion path');

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
for (const policy of ['auth_sign_in', 'auth_otp_request', 'auth_password_reset',
  'marketplace_request_create', 'marketplace_quote_submit', 'booking_message_send',
  'booking_typing_event', 'media_upload', 'review_submit', 'review_report',
  'trust_report_submit', 'trust_appeal_submit', 'communication_abuse_report',
  'dispute_open', 'support_case_open', 'staff_safe_search', 'staff_export_request',
  'staff_privileged_action', 'provider_webhook']) {
  ok(migration.includes(`'${policy}'`), `the migration records a limit for ${policy}`);
}
match(migration, /enforce_rate_limit/, 'a server-authoritative limiter exists');
match(migration, /Unknown rate limit policy/, 'an unknown policy never silently allows traffic');
match(migration, /subject_hash/, 'limiter subjects are hashed');
prose(migration, /rejected call must roll back/i,
  'the migration is honest that a rejection cannot be durably recorded');
equal(isRateLimited({ code: rateLimitSqlState }), true, 'the client recognizes the limiter SQLSTATE');
equal(isRateLimited({ message: 'Too many attempts. Please wait.' }), true,
  'the client recognizes the limiter message');
equal(isRateLimited(new Error('something else')), false, 'an unrelated error is not a rate limit');
equal(classifyStaffRefusal({ message: 'Re-authentication required' }), 'reauthentication_required',
  'a stale-session refusal is actionable');
equal(classifyStaffRefusal({ message: 'Multi-factor authentication is required' }), 'mfa_required',
  'an MFA refusal is actionable');
equal(classifyStaffRefusal({ message: 'This session was revoked' }), 'session_revoked',
  'a revoked-session refusal is actionable');
equal(classifyStaffRefusal({ message: 'Staff capability required' }), 'capability_required',
  'a capability refusal is actionable');
equal(classifyStaffRefusal({ code: rateLimitSqlState }), 'rate_limited', 'a rate limit is classified');
equal(classifyStaffRefusal(new Error('boom')), 'unknown', 'an unrecognized refusal is not guessed');

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------
match(migration, /operational_log_events/, 'structured logs exist');
match(migration, /correlation_id/, 'events carry a correlation identifier');
match(migration, /operational_payload_safe/, 'redaction is enforced at write time');
match(migration, /observability_retention_policy/, 'retention and ownership are declared');
for (const forbidden of ['token', 'secret', 'password', 'otp', 'message', 'national', 'card']) {
  ok(migration.includes(forbidden), `the redaction guard rejects ${forbidden} keys`);
}
prose(wps, /no external observability provider/i,
  'WPS-018 selects no external observability provider');
notMatch(migration, /datadog|sentry|newrelic|honeycomb|logtail/i,
  'no observability provider is wired in');

// ---------------------------------------------------------------------------
// Release verification
// ---------------------------------------------------------------------------
match(migration, /verify_platform_release/, 'a post-deployment verification gate exists');
for (const check of ['anon_private_grants', 'realtime_private', 'push_delivery_enabled',
  'live_payment_modes', 'release_scheduler', 'production_legacy_grace', 'production_without_mfa']) {
  ok(migration.includes(check), `release verification covers ${check}`);
}
ok(pgtap.includes('release verification fails while a launch gate is genuinely open'),
  'the verification gate reports an honest failure rather than a green light');

// ---------------------------------------------------------------------------
// Feature activation matrix
// ---------------------------------------------------------------------------
ok(featureActivationMatrix.length >= 15, 'the activation matrix covers every gated capability');
for (const entry of featureActivationMatrix) {
  ok(entry.owningSpecification.startsWith('WPS-'), `${entry.featureKey} names its owning specification`);
  ok(entry.activationOwner.length > 3, `${entry.featureKey} names an activation owner`);
  ok(entry.rollbackMethod.length > 10, `${entry.featureKey} names a rollback method`);
  ok(entry.requiredManualTest.length > 10, `${entry.featureKey} names a required manual test`);
  ok(launchPhases.includes(entry.targetPhase), `${entry.featureKey} targets a real launch phase`);
}
for (const risky of ['online_payments', 'payouts', 'push_notifications', 'call_relay',
  'production_sms', 'release_scheduler', 'marketplace', 'emergency', 'rescue_mode']) {
  const entry = featureActivation(risky);
  ok(entry !== undefined, `the matrix covers ${risky}`);
  ok(entry !== undefined && entry.currentState !== 'enabled', `${risky} is not enabled`);
  ok(entry !== undefined && !isLaunchReady(entry), `${risky} still records its blockers`);
}
ok(featureActivation('online_payments')?.blockers.includes('provider_decision'),
  'online payments still record the undecided provider');
ok(featureActivation('payouts')?.blockers.includes('legal_review'),
  'payouts still record the licensing blocker');
ok(blockersForPhase('private_beta').length > 0, 'the private beta still has open blockers');

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------
ok(secretInventory.length >= 15, 'the secret inventory is complete');
for (const record of secretInventory) {
  ok(record.owner.length > 3, `${record.key} names an owner`);
  ok(record.storage.length > 5, `${record.key} names a storage location`);
  ok(record.rotation.length > 5, `${record.key} names a rotation method`);
  ok(secretIsBundleSafe(record), `${record.key} is not a bundled secret`);
  ok(record.environments.length > 0, `${record.key} names its environments`);
}
for (const required of ['SUPABASE_SERVICE_ROLE_KEY', 'PAYMENT_WEBHOOK_SIGNING_SECRET',
  'APNS_KEY', 'ANDROID_KEYSTORE', 'IOS_DISTRIBUTION_CERTIFICATE', 'EXPO_TOKEN',
  'GOOGLE_PLAY_SERVICE_ACCOUNT', 'APP_STORE_CONNECT_API_KEY']) {
  ok(secretInventory.some(record => record.key === required), `the inventory records ${required}`);
}
// No inventory row may carry a value.
for (const record of secretInventory) {
  notMatch(record.storage, /eyJ|sk_live|-----BEGIN/, `${record.key} records no value`);
}
match(envExample, /Never add SUPABASE_SERVICE_ROLE_KEY/, 'the env example forbids the service-role key');
notMatch(read('src/launch/launch-types.ts'), /eyJ[A-Za-z0-9_-]{20,}/, 'no token is embedded in the launch module');

// ---------------------------------------------------------------------------
// CI/CD
// ---------------------------------------------------------------------------
for (const gate of ['npm ci', 'typecheck', 'lint', 'check:mojibake', 'git diff --check',
  'audit:secrets', 'audit:migrations', 'audit:environment', 'supabase test db',
  'expo-doctor', '--platform android', '--platform ios', '--platform web']) {
  ok(validateWorkflow.includes(gate), `the validation workflow runs ${gate}`);
}
match(validateWorkflow, /concurrency:/, 'superseded validation runs are cancelled');
match(validateWorkflow, /permissions:\s*\n\s*contents: read/, 'the validation workflow is read-only');
notMatch(validateWorkflow, /secrets\./, 'the validation workflow uses no secret');
match(validateWorkflow, /audit:bundle/, 'exported bundles are scanned for credential values');
// The scan must match credential VALUES; a bare prefix appears in supabase-js's
// own client-side guard and would fail every build.
const bundleAudit = read('scripts/audit-bundle.mjs');
notMatch(bundleAudit, /re: \/sb_secret_\[A-Za-z0-9_-\]\{\d+,\}\//,
  'the bundle scan does not match a bare prefix followed by any characters');
match(bundleAudit, /\(\?=\[A-Za-z0-9_-\]\*\[0-9\]\)/,
  'the bundle scan requires key-material entropy');
prose(bundleAudit, /not the primary control/i, 'the bundle scan records that it is a heuristic');
ok(packageJson.includes('audit:bundle'), 'audit:bundle is registered');
match(deployWorkflow, /workflow_dispatch/, 'database deployment is manual only');
match(deployWorkflow, /environment: \$\{\{ inputs\.environment \}\}/,
  'database deployment runs inside an approved GitHub environment');
match(deployWorkflow, /--dry-run/, 'a dry run always precedes an apply');
match(deployWorkflow, /migration list/, 'ledgers are compared before any change');
match(deployWorkflow, /PRE_MIGRATION_BACKUP_REF/, 'a restore point is required before an apply');
match(deployWorkflow, /verify_platform_release/, 'post-migration verification is required');
match(deployWorkflow, /protected branch/, 'deployment refuses an unreviewed ref');
notMatch(deployWorkflow, /eyJ|sb_secret_|-----BEGIN/, 'no credential is written into the workflow');
notMatch(deployWorkflow, /expo (build|export)|eas build/i,
  'schema deployment never builds or ships a client');

// ---------------------------------------------------------------------------
// Mobile and web release readiness
// ---------------------------------------------------------------------------
match(appJson, /"bundleIdentifier": "com\.warsha\.app"/, 'the iOS bundle identifier is set');
match(appJson, /"package": "com\.warsha\.app"/, 'the Android application id is set');
match(appJson, /"runtimeVersion"/, 'a runtime version policy is set');
match(appJson, /"scheme": "warsha"/, 'the deep link scheme is set');
notMatch(appJson, /"updates"/, 'over-the-air updates are not enabled');
for (const profile of ['development', 'preview', 'production']) {
  ok(easJson.includes(`"${profile}"`), `the ${profile} build profile exists`);
}
match(easJson, /"appVersionSource": "remote"/, 'build numbers are managed remotely');
notMatch(easJson, /SERVICE_ROLE|SECRET|PASSWORD/, 'no secret is written into the build profiles');

// ---------------------------------------------------------------------------
// Launch documents
// ---------------------------------------------------------------------------
for (const [name, body] of Object.entries({
  gapRegister, environmentMatrix, betaPlan, launchPlan, checklist, rollbackPlan,
  goNoGo, masterPlan, loadPlan, launchReadiness, threatModel,
})) {
  ok(body.length > 2000, `${name} is substantive`);
}
for (const runbook of ['deployment', 'rollback', 'backup', 'restore', 'incident-response',
  'secret-rotation', 'access-review', 'release-management', 'mobile-store-submission',
  'dependency-update']) {
  const path = `docs/operations/${runbook}-runbook.md`;
  ok(existsSync(join(root, path)), `${path} exists`);
  ok(read(path).length > 1500, `${path} is substantive`);
}

prose(betaPlan, /stop condition/i, 'the beta plan defines stop conditions');
prose(betaPlan, /consent/i, 'the beta plan covers participant consent');
prose(betaPlan, /cash/i, 'the beta plan names the supported payment method');
prose(goNoGo, /NOT RUN|not run/i, 'go/no-go reflects the unrun manual suites');
prose(rollbackPlan, /cannot be rolled back|forward-only|no down migration/i,
  'the rollback plan is honest about migration rollback limits');
prose(loadPlan, /no load test (has been )?(executed|run)/i,
  'the load plan does not claim results it does not have');
notMatch(loadPlan, /production p95|measured in production/i,
  'the load plan claims no production percentile');
prose(masterPlan, /NOT RUN/i, 'the master test plan records the unrun state');

// Legal readiness must never claim approval.
prose(launchReadiness, /lawyer|legal counsel|professional review/i,
  'launch readiness routes legal items to a professional');
notMatch(launchReadiness, /legally approved|counsel has approved|legally compliant/i,
  'launch readiness claims no legal approval');
notMatch(threatModel, /penetration test(ed|ing)? (was )?(performed|completed|passed)/i,
  'the threat model claims no penetration testing');
prose(threatModel, /residual/i, 'the threat model records residual risk');

// ---------------------------------------------------------------------------
// Fail-closed client behaviour
// ---------------------------------------------------------------------------
equal(unknownPlatformStatus.readOnlyMaintenance, true,
  'an unreadable platform status is treated as maintenance');
equal(surfaceIsRestricted(unknownPlatformStatus, 'anything'), true,
  'every surface is restricted while the status is unknown');
equal(surfaceIsRestricted(
  { ...unknownPlatformStatus, readOnlyMaintenance: false, activeSwitches: ['payouts'] }, 'payouts'),
  true, 'an active kill switch restricts its surface');
equal(surfaceIsRestricted(
  { ...unknownPlatformStatus, readOnlyMaintenance: false, activeSwitches: [] }, 'payouts'),
  false, 'an unrestricted surface stays open');
match(read('src/launch/platform-status-repository.ts'), /fail closed/i,
  'the status repository documents its fail-closed behaviour');

// ---------------------------------------------------------------------------
// Motto and brand
// ---------------------------------------------------------------------------
const translations = read('src/i18n/translations.ts');
match(translations, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'the approved English motto is active');
match(translations, /brandMotto: 'شغلك مهمتنا'/, 'the approved Arabic motto is active');
for (const surface of ['docs/launch/PRIVATE-BETA-PLAN.md', 'docs/launch/PRODUCTION-LAUNCH-PLAN.md']) {
  const body = read(surface);
  if (/motto/i.test(body)) {
    match(body, /YOUR WORK, OUR MISSION/, `${surface} quotes the approved motto exactly`);
  }
}
notMatch(read('src/launch/launch-types.ts'), /YOUR WORK, OUR MISSION/,
  'the motto is not repeated in operational code');

// ---------------------------------------------------------------------------
// Nothing was enabled
// ---------------------------------------------------------------------------
notMatch(migration, /push_delivery_enabled\s*=\s*true/, 'push delivery is never enabled');
notMatch(migration, /token_registration_enabled\s*=\s*true/, 'push registration is never enabled');
notMatch(migration, /gateway_mode\s*=\s*'live'/, 'no live gateway is selected');
notMatch(migration, /payout_mode\s*=\s*'(live|sandbox)'/, 'no live or sandbox payout mode is selected');
notMatch(migration, /automatic_release_scheduler_enabled\s*=\s*true/, 'no scheduler is enabled');
notMatch(migration, /marketplace_configuration set enabled = true/, 'the marketplace is not activated');
ok(pgtap.includes('the marketplace remains disabled'), 'pgTAP asserts the marketplace stays disabled');
ok(pgtap.includes('payouts remain disabled'), 'pgTAP asserts payouts stay disabled');

// Every SECURITY DEFINER function pins a search path.
const migrationSql = migration.replace(/--[^\n]*/g, '');
const definerCount = (migrationSql.match(/security definer/gi) ?? []).length;
const searchPathCount = (migrationSql.match(/set search_path\s*=\s*''/gi) ?? []).length;
ok(definerCount > 0, 'the migration defines security definer functions');
ok(searchPathCount >= definerCount, 'every security definer function pins an empty search path');

console.log(`WPS-018 production readiness contracts: ${checks} checks passed.`);
