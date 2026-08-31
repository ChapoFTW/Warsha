/**
 * WPS-018 Production Readiness, Reliability & Launch Operations contracts.
 *
 * WPS-018 introduces no customer feature. It carries the launch model: the
 * environment a build is pointed at, the phase the platform is in, which
 * features may be activated and what each one is still waiting for, and how the
 * client behaves when the server refuses a call for a launch-safety reason.
 *
 * Everything here is a projection of server state or a pure helper. The client
 * never decides an environment, a phase, or an activation.
 */

export type PlatformEnvironment = 'local' | 'development' | 'staging' | 'production';

export const platformEnvironments: readonly PlatformEnvironment[] = [
  'local', 'development', 'staging', 'production',
] as const;

export type LaunchPhase = 'pre_beta' | 'private_beta' | 'public_beta' | 'production';

export const launchPhases: readonly LaunchPhase[] = [
  'pre_beta', 'private_beta', 'public_beta', 'production',
] as const;

export type PlatformStatus = {
  environment: PlatformEnvironment;
  launchPhase: LaunchPhase;
  activeSwitches: string[];
  readOnlyMaintenance: boolean;
  generatedAt: string;
};

/**
 * The fail-closed default. Any client that cannot read platform status must
 * behave as if the platform were in maintenance rather than assume it is open.
 */
export const unknownPlatformStatus: PlatformStatus = {
  environment: 'local',
  launchPhase: 'pre_beta',
  activeSwitches: [],
  readOnlyMaintenance: true,
  generatedAt: '',
};

/**
 * True when a named surface has been restricted by an active kill switch, or
 * while the platform status could not be read at all.
 *
 * This lives in the pure module rather than the repository so it can be tested
 * without an Expo or Supabase runtime, matching every other Warsha domain.
 */
export function surfaceIsRestricted(status: PlatformStatus, switchKey: string): boolean {
  return status.readOnlyMaintenance || status.activeSwitches.includes(switchKey);
}

/* -------------------------------------------------------------------------
 * Feature activation matrix
 * ---------------------------------------------------------------------- */

export type ActivationState =
  /** Built, validated locally, and off. */
  | 'disabled'
  /** Built and usable, but only against simulated data. */
  | 'mock_only'
  /** Usable in a controlled environment with real data. */
  | 'staging_only'
  /** Available to the private beta cohort. */
  | 'private_beta'
  /** Generally available. */
  | 'enabled';

export type ActivationBlocker =
  | 'provider_decision'
  | 'provider_credentials'
  | 'legal_review'
  | 'manual_testing'
  | 'load_testing'
  | 'store_review'
  | 'mfa_provider'
  | 'operational_ownership'
  | 'none';

export type FeatureActivation = {
  featureKey: string;
  displayName: string;
  owningSpecification: string;
  currentState: ActivationState;
  targetPhase: LaunchPhase;
  requiredProvider: string | null;
  requiredSecret: string | null;
  requiredLegalApproval: string | null;
  requiredManualTest: string;
  activationOwner: string;
  rollbackMethod: string;
  blockers: ActivationBlocker[];
};

/**
 * The authoritative activation matrix. Every risky capability ships disabled,
 * and each row states exactly what it is waiting for — never "soon".
 */
export const featureActivationMatrix: readonly FeatureActivation[] = [
  {
    featureKey: 'marketplace', displayName: 'Marketplace matching and quoting',
    owningSpecification: 'WPS-008', currentState: 'disabled', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null, requiredLegalApproval: 'Marketplace terms',
    requiredManualTest: 'WPS-008 manual alpha plus the launch customer and worker suites',
    activationOwner: 'Marketplace Operations',
    rollbackMethod: 'new_marketplace_requests kill switch, which sets the WPS-008 activation flag to false',
    blockers: ['manual_testing', 'legal_review'],
  },
  {
    featureKey: 'emergency', displayName: 'Emergency requests',
    owningSpecification: 'WPS-008', currentState: 'disabled', targetPhase: 'public_beta',
    requiredProvider: null, requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'Emergency dispatch and misuse cases',
    activationOwner: 'Marketplace Operations',
    rollbackMethod: 'emergency_requests kill switch and the WPS-008 eligibility gate',
    blockers: ['manual_testing', 'operational_ownership'],
  },
  {
    featureKey: 'rescue_mode', displayName: 'Rescue Mode',
    owningSpecification: 'WPS-008', currentState: 'disabled', targetPhase: 'public_beta',
    requiredProvider: null, requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'Rescue rematching and customer messaging cases',
    activationOwner: 'Marketplace Operations',
    rollbackMethod: 'rescue_mode kill switch',
    blockers: ['manual_testing', 'operational_ownership'],
  },
  {
    featureKey: 'cash_payments', displayName: 'Cash payment method',
    owningSpecification: 'WPS-007', currentState: 'mock_only', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null,
    requiredLegalApproval: 'Payment terms, receipts, and tax treatment',
    requiredManualTest: 'WPS-007 cash settlement and commission debt cases',
    activationOwner: 'Financial Operations',
    rollbackMethod: 'Payment method availability row for cash',
    blockers: ['legal_review', 'manual_testing'],
  },
  {
    featureKey: 'online_payments', displayName: 'Online card payments',
    owningSpecification: 'WPS-015', currentState: 'disabled', targetPhase: 'public_beta',
    requiredProvider: 'Undecided — see docs/decisions/payment-provider-selection.md',
    requiredSecret: 'Gateway API credentials and webhook signing secret',
    requiredLegalApproval: 'Provider agreement, chargeback liability, consumer protection',
    requiredManualTest: 'WPS-015 manual alpha and the launch financial suite',
    activationOwner: 'Financial Operations',
    rollbackMethod: 'online_payment_methods kill switch and payments_maintenance',
    blockers: ['provider_decision', 'provider_credentials', 'legal_review', 'manual_testing'],
  },
  {
    featureKey: 'payouts', displayName: 'Worker payouts',
    owningSpecification: 'WPS-015', currentState: 'disabled', targetPhase: 'production',
    requiredProvider: 'Undecided — marketplace disbursement licensing unresolved',
    requiredSecret: 'Payout API credentials',
    requiredLegalApproval: 'Disbursement licensing, worker classification, tax withholding',
    requiredManualTest: 'WPS-015 payout and reconciliation cases',
    activationOwner: 'Financial Operations',
    rollbackMethod: 'payouts kill switch, which forces the WPS-015 payout mode to disabled',
    blockers: ['provider_decision', 'provider_credentials', 'legal_review'],
  },
  {
    featureKey: 'release_scheduler', displayName: 'Automatic earnings release',
    owningSpecification: 'WPS-007', currentState: 'disabled', targetPhase: 'production',
    requiredProvider: 'A scheduler Warsha does not yet run',
    requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'Six-hour release timing and hold interaction cases',
    activationOwner: 'Financial Operations',
    rollbackMethod: 'automatic_release_scheduler_enabled configuration flag',
    blockers: ['operational_ownership', 'manual_testing'],
  },
  {
    featureKey: 'push_notifications', displayName: 'Push notifications',
    owningSpecification: 'WPS-014', currentState: 'disabled', targetPhase: 'public_beta',
    requiredProvider: 'Expo push or an equivalent, not selected',
    requiredSecret: 'APNs key and FCM credentials',
    requiredLegalApproval: 'Privacy policy disclosure of push tokens',
    requiredManualTest: 'Delivery, quiet hours, and required-action routing cases',
    activationOwner: 'Operations Manager',
    rollbackMethod: 'push_registration kill switch and the WPS-014 delivery flag',
    blockers: ['provider_decision', 'provider_credentials', 'legal_review'],
  },
  {
    featureKey: 'production_sms', displayName: 'Worker phone OTP delivery',
    owningSpecification: 'WPS-001', currentState: 'mock_only', targetPhase: 'private_beta',
    requiredProvider: 'An Egyptian SMS sender, not selected',
    requiredSecret: 'SMS provider API key and sender ID',
    requiredLegalApproval: 'Sender ID registration',
    requiredManualTest: 'Worker sign-in on a real handset on a real network',
    activationOwner: 'Operations Manager',
    rollbackMethod: 'Supabase Auth SMS provider configuration',
    blockers: ['provider_decision', 'provider_credentials'],
  },
  {
    featureKey: 'call_relay', displayName: 'Masked calling',
    owningSpecification: 'WPS-009', currentState: 'disabled', targetPhase: 'production',
    requiredProvider: 'A telephony relay, not selected',
    requiredSecret: 'Telephony credentials',
    requiredLegalApproval: 'Call recording and number masking compliance',
    requiredManualTest: 'Relay privacy cases',
    activationOwner: 'Operations Manager',
    rollbackMethod: 'call_relay configuration domain',
    blockers: ['provider_decision', 'legal_review'],
  },
  {
    featureKey: 'admin_platform', displayName: 'Staff operations platform',
    owningSpecification: 'WPS-017', currentState: 'staging_only', targetPhase: 'private_beta',
    requiredProvider: 'Supabase TOTP for the production second factor',
    requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'WPS-017 and WPS-018 staff suites',
    activationOwner: 'Security Administrator',
    rollbackMethod: 'admin_platform_enabled configuration flag and role revocation',
    blockers: ['mfa_provider', 'manual_testing'],
  },
  {
    featureKey: 'staff_exports', displayName: 'Operational exports',
    owningSpecification: 'WPS-017', currentState: 'staging_only', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null,
    requiredLegalApproval: 'Data retention and export policy',
    requiredManualTest: 'Export authorization and revalidation cases',
    activationOwner: 'Operations Manager',
    rollbackMethod: 'export_operational_report capability removal',
    blockers: ['legal_review', 'manual_testing'],
  },
  {
    featureKey: 'analytics', displayName: 'Operational analytics',
    owningSpecification: 'WPS-017', currentState: 'staging_only', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'Suppression, timezone, and partial-period cases',
    activationOwner: 'Operations Manager',
    rollbackMethod: 'view_analytics capability removal',
    blockers: ['manual_testing'],
  },
  {
    featureKey: 'trust_enforcement', displayName: 'Trust enforcement and appeals',
    owningSpecification: 'WPS-016', currentState: 'staging_only', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null,
    requiredLegalApproval: 'Account termination and appeal rights',
    requiredManualTest: 'WPS-016 manual alpha and the launch trust suite',
    activationOwner: 'Trust & Safety Reviewer',
    rollbackMethod: 'Capability removal and explicit restoration actions',
    blockers: ['legal_review', 'manual_testing'],
  },
  {
    featureKey: 'support_cases', displayName: 'Support cases',
    owningSpecification: 'WPS-017', currentState: 'staging_only', targetPhase: 'private_beta',
    requiredProvider: null, requiredSecret: null, requiredLegalApproval: null,
    requiredManualTest: 'Participant and staff visibility cases',
    activationOwner: 'Support Agent',
    rollbackMethod: 'manage_support_cases capability removal',
    blockers: ['manual_testing', 'operational_ownership'],
  },
] as const;

export function featureActivation(featureKey: string): FeatureActivation | undefined {
  return featureActivationMatrix.find(entry => entry.featureKey === featureKey);
}

/** A feature is launch-ready only when it has no blocker left. */
export function isLaunchReady(entry: FeatureActivation): boolean {
  return entry.blockers.length === 0
    || (entry.blockers.length === 1 && entry.blockers[0] === 'none');
}

export function blockersForPhase(phase: LaunchPhase): FeatureActivation[] {
  return featureActivationMatrix.filter(
    entry => entry.targetPhase === phase && !isLaunchReady(entry),
  );
}

/* -------------------------------------------------------------------------
 * Pure launch helpers
 * ---------------------------------------------------------------------- */

/** Production is never quiet: the environment must always be visible to staff. */
export function environmentRequiresBanner(environment: PlatformEnvironment): boolean {
  return environment !== 'local';
}

/**
 * A destructive or outward-facing action is refused entirely in an environment
 * the operator did not intend to be in.
 */
export function environmentAllowsRiskyAction(
  environment: PlatformEnvironment,
  acknowledgedEnvironment: PlatformEnvironment | null,
): boolean {
  if (environment !== 'production') return true;
  return acknowledgedEnvironment === 'production';
}

/**
 * The server refuses a rate-limited call with SQLSTATE 53400. The client must
 * present that as "wait and retry", never as a generic failure, and must never
 * retry automatically.
 */
export const rateLimitSqlState = '53400';

export function isRateLimited(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === rateLimitSqlState) return true;
  return typeof candidate.message === 'string' && /too many attempts/i.test(candidate.message);
}

/** A session-security refusal is actionable by the operator; a generic one is not. */
export type StaffRefusalReason =
  | 'reauthentication_required'
  | 'mfa_required'
  | 'session_revoked'
  | 'capability_required'
  | 'platform_unavailable'
  | 'rate_limited'
  | 'unknown';

export function classifyStaffRefusal(error: unknown): StaffRefusalReason {
  if (isRateLimited(error)) return 'rate_limited';
  const message = typeof error === 'object' && error !== null
    && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  if (/re-authentication required/i.test(message)) return 'reauthentication_required';
  if (/multi-factor authentication is required/i.test(message)) return 'mfa_required';
  if (/session was revoked/i.test(message)) return 'session_revoked';
  if (/staff capability required|staff access required/i.test(message)) return 'capability_required';
  if (/admin platform is unavailable/i.test(message)) return 'platform_unavailable';
  return 'unknown';
}

/* -------------------------------------------------------------------------
 * Secret inventory (names and ownership only — never values)
 * ---------------------------------------------------------------------- */

export type SecretClassification = 'public_client' | 'server_only' | 'build_only' | 'signing';

export type SecretRecord = {
  key: string;
  classification: SecretClassification;
  environments: PlatformEnvironment[];
  owner: string;
  storage: string;
  rotation: string;
  clientBundleAllowed: boolean;
};

/**
 * Inventory only. No value is ever recorded here, in the repository, or in a
 * workflow file. `clientBundleAllowed: false` is enforced by the environment
 * audit, which fails the build if such a key appears with an `EXPO_PUBLIC_`
 * prefix.
 */
export const secretInventory: readonly SecretRecord[] = [
  { key: 'EXPO_PUBLIC_SUPABASE_URL', classification: 'public_client', environments: ['local','development','staging','production'], owner: 'Operations Manager', storage: 'EAS environment variables and local .env', rotation: 'Changes only with the project', clientBundleAllowed: true },
  { key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', classification: 'public_client', environments: ['local','development','staging','production'], owner: 'Operations Manager', storage: 'EAS environment variables and local .env', rotation: 'Rotate with the project API keys', clientBundleAllowed: true },
  { key: 'EXPO_PUBLIC_ADMIN_SURFACE', classification: 'public_client', environments: ['local','development','staging'], owner: 'Security Administrator', storage: 'EAS build profile', rotation: 'Not a secret; a build switch', clientBundleAllowed: true },
  // The web surface reads its own pair. Vercel builds from this repository on
  // every push to main, and Next.js inlines `NEXT_PUBLIC_*` at build time, so a
  // Vercel environment missing these produces a web app that renders and cannot
  // reach Supabase at all. They are the same project and the same publishable
  // key as the Expo pair above -- a different variable name, not a second
  // credential -- and they are recorded separately because provisioning a web
  // environment reads this inventory, not eas.json.
  { key: 'NEXT_PUBLIC_SUPABASE_URL', classification: 'public_client', environments: ['local','development','staging','production'], owner: 'Operations Manager', storage: 'Vercel project environment variables and local web/.env.local', rotation: 'Changes only with the project', clientBundleAllowed: true },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', classification: 'public_client', environments: ['local','development','staging','production'], owner: 'Operations Manager', storage: 'Vercel project environment variables and local web/.env.local', rotation: 'Rotate with the project API keys', clientBundleAllowed: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', classification: 'server_only', environments: ['local','development','staging','production'], owner: 'Security Administrator', storage: 'Operator shell only; never in CI, never in a bundle', rotation: 'Supabase dashboard; rotate on any suspicion', clientBundleAllowed: false },
  { key: 'SUPABASE_DB_PASSWORD', classification: 'server_only', environments: ['development','staging','production'], owner: 'Security Administrator', storage: 'Password manager', rotation: 'Supabase dashboard', clientBundleAllowed: false },
  { key: 'SUPABASE_ACCESS_TOKEN', classification: 'build_only', environments: ['staging','production'], owner: 'Security Administrator', storage: 'GitHub environment secret', rotation: 'Supabase account tokens', clientBundleAllowed: false },
  { key: 'PAYMENT_GATEWAY_API_KEY', classification: 'server_only', environments: ['staging','production'], owner: 'Financial Operations', storage: 'Not yet issued; provider undecided', rotation: 'Provider dashboard', clientBundleAllowed: false },
  { key: 'PAYMENT_WEBHOOK_SIGNING_SECRET', classification: 'server_only', environments: ['staging','production'], owner: 'Financial Operations', storage: 'Not yet issued; provider undecided', rotation: 'Provider dashboard', clientBundleAllowed: false },
  { key: 'PAYOUT_API_CREDENTIALS', classification: 'server_only', environments: ['production'], owner: 'Financial Operations', storage: 'Not yet issued; licensing unresolved', rotation: 'Provider dashboard', clientBundleAllowed: false },
  { key: 'SMS_PROVIDER_API_KEY', classification: 'server_only', environments: ['staging','production'], owner: 'Operations Manager', storage: 'Not yet issued; provider undecided', rotation: 'Provider dashboard', clientBundleAllowed: false },
  { key: 'APNS_KEY', classification: 'signing', environments: ['production'], owner: 'Operations Manager', storage: 'Apple Developer account; EAS credentials', rotation: 'Apple Developer account', clientBundleAllowed: false },
  { key: 'FCM_SERVER_CREDENTIALS', classification: 'signing', environments: ['production'], owner: 'Operations Manager', storage: 'Firebase console; EAS credentials', rotation: 'Firebase console', clientBundleAllowed: false },
  { key: 'ANDROID_KEYSTORE', classification: 'signing', environments: ['production'], owner: 'Operations Manager', storage: 'EAS managed credentials', rotation: 'Never rotate after publication; loss blocks updates', clientBundleAllowed: false },
  { key: 'IOS_DISTRIBUTION_CERTIFICATE', classification: 'signing', environments: ['production'], owner: 'Operations Manager', storage: 'EAS managed credentials', rotation: 'Apple Developer account', clientBundleAllowed: false },
  { key: 'EXPO_TOKEN', classification: 'build_only', environments: ['staging','production'], owner: 'Operations Manager', storage: 'GitHub environment secret', rotation: 'Expo account tokens', clientBundleAllowed: false },
  { key: 'GOOGLE_PLAY_SERVICE_ACCOUNT', classification: 'build_only', environments: ['production'], owner: 'Operations Manager', storage: 'GitHub environment secret', rotation: 'Google Cloud console', clientBundleAllowed: false },
  { key: 'APP_STORE_CONNECT_API_KEY', classification: 'build_only', environments: ['production'], owner: 'Operations Manager', storage: 'GitHub environment secret', rotation: 'App Store Connect', clientBundleAllowed: false },
] as const;

/** A key that must never be bundled must never carry the public prefix. */
export function secretIsBundleSafe(record: SecretRecord): boolean {
  return record.clientBundleAllowed || !record.key.startsWith('EXPO_PUBLIC_');
}
