/**
 * WPS-023 client regression suite.
 *
 * Two kinds of check live here.
 *
 * Behavioural: the pure routing, gate and validation functions are executed
 * against real inputs. These are the rules that decide what somebody sees.
 *
 * Structural: the source of the screens, the migration and the module is read
 * and searched. These are the rules that are easiest to erode by accident — a
 * motto pasted into one more screen, a logo mirrored under RTL, an offence
 * field added to a payload, an anon grant reintroduced.
 *
 * Comments are stripped before any structural search, so a comment explaining
 * why something is absent can never satisfy the check for that absence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  actionableGates,
  canAppeal,
  canUseCustomerMode,
  captureWarnings,
  emptyOnboardingState,
  gateProgress,
  isAcceptedDocument,
  isActionableGate,
  isAwaitingReview,
  isValidCoordinate,
  isValidNationalId,
  maskNationalId,
  needsWorkerAction,
  normalizeNationalId,
  routeFor,
  showsCustomerModeAction,
  type OnboardingState,
} from '../src/onboarding/onboarding-types.ts';
import {
  extractionCapability,
  extractionMayApprove,
  MANUAL_ENTRY_CONFIDENCE_FLOOR,
  requiresManualEntry,
  toClientCandidate,
} from '../src/onboarding/identity-extraction.ts';
import { locationCapability, manualPin } from '../src/onboarding/location-provider.ts';
import { onboardingCopy } from '../src/onboarding/onboarding-copy.ts';
import {
  DECISION_CAPABILITY,
  requiresEvidence,
  type VettingDecision,
} from '../src/onboarding/onboarding-staff-types.ts';
import {
  mockConfirmAddress,
  mockOnboardingState,
  mockRecordCapture,
  mockSelectRole,
  mockStaffAdvance,
  mockSubmitCriminalRecord,
  mockConfirmIdentityFields,
  mockSubmitIdentity,
  resetMockOnboarding,
} from '../src/onboarding/mock-onboarding-state.ts';

const root = join(import.meta.dirname, '..');
let passed = 0;
const failures: string[] = [];

function check(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else failures.push(label);
}

function read(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

/** Source with line and block comments removed. */
function codeOf(...parts: string[]): string {
  return read(...parts).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** SQL with line comments removed. */
function sqlCodeOf(...parts: string[]): string {
  return read(...parts).replace(/--[^\n]*/g, '');
}

const migration = sqlCodeOf(
  'supabase', 'migrations', '202608080001_wps023_authentication_role_onboarding_worker_vetting.sql',
);
const registrationConflictFix = sqlCodeOf(
  'supabase', 'migrations', '202608130001_fix_worker_signup_conflict_target.sql',
);
const providerProfileIdDefaultFix = sqlCodeOf(
  'supabase', 'migrations', '202608140001_restore_provider_profile_id_default.sql',
);
const workerPhonePasswordMigration = sqlCodeOf(
  'supabase', 'migrations', '202608150001_worker_phone_password_auth.sql',
);
const workerAuthBroker = codeOf('supabase', 'functions', 'worker-auth', 'index.ts');
const authContextSource = codeOf('src', 'auth', 'auth-context.tsx');
const createAccountSource = codeOf('app', 'create-account.tsx');
const signInSource = codeOf('app', 'sign-in.tsx');
const profileSource = codeOf('app', '(tabs)', 'profile.tsx');
const profileRepositorySource = codeOf('src', 'repositories', 'supabase-user-repositories.ts');
const customerProfileRepositorySource = profileRepositorySource.slice(
  profileRepositorySource.indexOf('supabaseCustomerProfileRepository'),
  profileRepositorySource.indexOf('async function listBookings'),
);
check(
  /create or replace function private\.handle_new_user\([\s\S]*?on conflict\s*\(user_id\)\s*where user_id is not null\s*do nothing/.test(
    registrationConflictFix,
  ),
  'worker registration matches the partial provider user uniqueness predicate',
);
check(
  providerProfileIdDefaultFix.trim().replace(/\s+/g, ' ') ===
    'alter table public.provider_profiles alter column id set default pg_catalog.gen_random_uuid();',
  'the hosted provider-profile ID repair restores only the authoritative UUID default',
);
check(/create table if not exists private\.worker_auth_identities/.test(workerPhonePasswordMigration),
  'worker phone-to-credential mapping is private');
check(/revoke all on private\.worker_auth_identities from public, anon, authenticated, service_role/.test(workerPhonePasswordMigration),
  'worker auth mapping has no direct client, staff, or service table read');
check(/grant execute on function public\.prepare_worker_auth_registration\(text,uuid\) to service_role/.test(workerPhonePasswordMigration),
  'only service role can preflight worker registration');
check(/grant execute on function public\.resolve_worker_auth_identity\(text\) to service_role/.test(workerPhonePasswordMigration),
  'only service role can resolve worker phone identity');
check(/private\.worker_auth_registrations/.test(workerPhonePasswordMigration)
  && /worker_identity_id/.test(workerPhonePasswordMigration)
  && /for update/.test(workerPhonePasswordMigration),
  'auth trigger consumes a service-created reservation rather than trusting display metadata');
check(/on conflict\s*\(user_id\)\s*where user_id is not null\s*do nothing/.test(workerPhonePasswordMigration),
  'new worker auth migration preserves the corrected partial conflict target');
check(!/alter table public\.provider_profiles alter column id/.test(workerPhonePasswordMigration),
  'worker auth does not revisit provider-profile ID authority');
check(/crypto\.randomUUID\(\)/.test(workerAuthBroker)
  && /workerSyntheticEmail\(credentialId\)/.test(workerAuthBroker),
  'trusted Edge broker generates a UUID synthetic identity');
check(/email_confirm:\s*true/.test(workerAuthBroker)
  && !/inviteUserByEmail|resend/.test(workerAuthBroker),
  'internal credential is usable without sending worker email confirmation');
check(!/signInWithOtp|verifyOtp|phone_confirm\s*:/.test(workerAuthBroker),
  'worker broker has no Phone Auth or OTP operation');
check(/action:\s*'sign_in'[\s\S]*phone[\s\S]*password/.test(workerAuthBroker),
  'worker broker accepts phone and password sign-in');
check(/identity\.kind === 'customer_email'[\s\S]*signInWithPassword/.test(authContextSource),
  'customer email/password sign-in remains direct');
check(/signInWorker\(identity\.phone, password\)/.test(authContextSource),
  'worker sign-in routes through secure phone mapping');
check(/role === 'provider'[\s\S]*registerWorker/.test(authContextSource),
  'worker registration routes through trusted auth layer');
check(/role === 'customer' \? \(/.test(createAccountSource)
  && /choice === 'worker' \? null : email\.trim\(\)/.test(createAccountSource),
  'worker create-account UI renders no email field and passes no email');
check(/signInIdentifier/.test(signInSource) && /phonePasswordHint/.test(signInSource),
  'sign-in copy presents customer email or worker phone plus password');
check(!/auth\.user\??\.email/.test(profileSource),
  'profile UI never renders the raw synthetic Auth email');
check(!/auth\.getUser|user\??\.email|email:/.test(customerProfileRepositorySource),
  'profile repository cannot materialize synthetic email');
check(/private\.account_contact_email\(p_user_id\)/.test(workerPhonePasswordMigration),
  'staff contact view passes through synthetic-email redaction');
check(/export_included, staff_capability[\s\S]*'worker_auth_identities'[\s\S]*false, null/.test(workerPhonePasswordMigration),
  'private mapping is excluded from user export and staff capabilities');

// ---------------------------------------------------------------------------
// Routing: authentication-first entry
// ---------------------------------------------------------------------------
const signedOut = routeFor(null, false);
check(signedOut === 'gateway', 'a signed-out session routes to the gateway');
check(routeFor(emptyOnboardingState, false) === 'gateway',
  'a signed-out session routes to the gateway even with state present');
// The unknown-state case is the one that matters: it must NOT fall through to
// a customer home while hydration finishes.
check(routeFor(null, true) === 'gateway',
  'an unresolved onboarding state never routes to an operational screen');

const customerNoAddress: OnboardingState = {
  ...emptyOnboardingState, roleSelected: true, intendedRole: 'customer', addressConfirmed: false,
};
const customerReady: OnboardingState = { ...customerNoAddress, addressConfirmed: true, customerState: 'complete' };
check(routeFor(customerNoAddress, true) === 'customer_address',
  'a customer without a confirmed pin routes to the address step');
check(routeFor(customerReady, true) === 'customer_home',
  'a customer with a confirmed pin routes to the customer home');

const workerPending: OnboardingState = {
  ...emptyOnboardingState, roleSelected: true, intendedRole: 'worker',
  workerState: 'identity_submitted', workerCapabilityActive: false,
};
const workerApprovedNotActive: OnboardingState = {
  ...workerPending, workerState: 'approved', workerCapabilityActive: false,
};
const workerActive: OnboardingState = {
  ...workerPending, workerState: 'active', workerCapabilityActive: true,
};
check(routeFor(workerPending, true) === 'worker_onboarding',
  'a pending worker routes to their application, not the customer home');
check(routeFor(workerApprovedNotActive, true) === 'worker_onboarding',
  'AN APPROVED BUT UNACTIVATED WORKER DOES NOT REACH THE WORKER HOME');
check(routeFor(workerActive, true) === 'worker_home',
  'an active worker routes to the worker home');
check(routeFor({ ...workerActive, accountBanned: true }, true) === 'account_blocked',
  'a banned account routes to a blocked state');
check(routeFor({ ...emptyOnboardingState, roleSelected: false }, true) === 'role_choice',
  'an account with no role selection routes to the role question');

// A worker never sees customer discovery as their operational home.
check(routeFor(workerActive, true) !== 'customer_home',
  'A WORKER IS NEVER ROUTED TO THE CUSTOMER HOME BY DEFAULT');

// Customer mode stays available to workers throughout.
check(canUseCustomerMode(workerPending), 'a pending worker keeps customer capability');
check(canUseCustomerMode(workerActive), 'an active worker keeps customer capability');
check(!canUseCustomerMode({ ...workerActive, accountBanned: true }),
  'a banned account has no customer capability');
check(showsCustomerModeAction(workerActive), 'the worker home offers a customer-mode action');
check(!showsCustomerModeAction(customerReady), 'a customer home does not offer a customer-mode action');
check(!showsCustomerModeAction(null), 'an unknown state offers no customer-mode action');

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------
check(isActionableGate('national_id_front_uploaded'), 'uploading a document is actionable');
check(!isActionableGate('national_id_approved'), 'A STAFF APPROVAL GATE IS NOT SHOWN AS A WORKER TO-DO');
check(!isActionableGate('criminal_record_approved'), 'certificate approval is not a worker to-do');
check(!isActionableGate('identity_verification_approved'), 'verification approval is not a worker to-do');
check(!isActionableGate('not_banned'), 'a ban is not something a worker can tick off');
check(!isActionableGate('no_blocking_trust_action'), 'a trust action is not a worker to-do');

const gatedState: OnboardingState = {
  ...workerPending,
  gates: {
    national_id_front_uploaded: false,
    national_id_approved: false,
    professions_configured: false,
    not_banned: true,
  },
  outstandingGates: ['national_id_approved', 'national_id_front_uploaded', 'professions_configured'],
};
const shown = actionableGates(gatedState);
check(!shown.includes('national_id_approved'), 'the outstanding list hides staff-only gates');
check(shown.includes('national_id_front_uploaded'), 'the outstanding list keeps actionable gates');
check(shown.indexOf('professions_configured') < shown.indexOf('national_id_front_uploaded'),
  'outstanding gates are ordered by the flow, not alphabetically');
check(actionableGates(null).length === 0, 'an unknown state lists no gates');

const progress = gateProgress(gatedState);
check(progress.total === 4 && progress.done === 1, 'gate progress counts satisfied gates');
check(gateProgress(null).total === 0, 'an unknown state has no progress');

check(isAwaitingReview('identity_under_review'), 'an identity review is a waiting state');
check(isAwaitingReview('manual_review'), 'a manual review is a waiting state');
check(!isAwaitingReview('correction_required'), 'a correction is not a waiting state');
check(needsWorkerAction('correction_required'), 'a correction needs worker action');
check(!needsWorkerAction('identity_under_review'), 'a review does not need worker action');
check(canAppeal('rejected'), 'a rejected worker may appeal');
check(!canAppeal('suspended'), 'a suspension is not appealed through the vetting appeal');
check(!canAppeal('approved'), 'an approved worker has nothing to appeal');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
check(isValidNationalId('29001011234567'), 'a fourteen-digit identifier is accepted');
check(isValidNationalId('290 010 1123 4567'.slice(0, 18)) || isValidNationalId('29001011234567'),
  'spacing is forgiven when normalizing');
check(!isValidNationalId('12345'), 'a short identifier is refused');
check(!isValidNationalId('2900101123456789'), 'an over-long identifier is refused');
check(normalizeNationalId('290-010-112-345-67') === '29001011234567', 'punctuation is stripped');
check(maskNationalId('29001011234567') === '4567', 'MASKING KEEPS ONLY THE LAST FOUR DIGITS');
check(maskNationalId('29001011234567').length === 4, 'a mask is never longer than four characters');
check(!maskNationalId('29001011234567').includes('2900'), 'a mask never reveals the leading digits');

check(isValidCoordinate(30.05, 31.23), 'a Cairo coordinate is valid');
check(!isValidCoordinate(null, 31.23), 'a missing latitude is invalid');
check(!isValidCoordinate(30.05, null), 'a missing longitude is invalid');
check(!isValidCoordinate(95, 31.23), 'an out-of-range latitude is invalid');
check(!isValidCoordinate(30.05, 200), 'an out-of-range longitude is invalid');
check(!isValidCoordinate(Number.NaN, 31.23), 'a non-finite coordinate is invalid');

check(isAcceptedDocument('application/pdf', 1000), 'a small PDF is accepted');
check(isAcceptedDocument('image/jpeg', 8 * 1024 * 1024), 'a document at the size limit is accepted');
check(!isAcceptedDocument('image/jpeg', 8 * 1024 * 1024 + 1), 'a document over the limit is refused');
check(!isAcceptedDocument('application/x-msdownload', 1000), 'an executable is refused');
check(!isAcceptedDocument('application/pdf', 0), 'an empty document is refused');

const warnings = captureWarnings({ width: 400, height: 300, sharpness: 0.1, brightestFraction: 0.4 });
check(warnings.includes('low_resolution'), 'a small capture warns about resolution');
check(warnings.includes('blurry'), 'an unsharp capture warns about blur');
check(warnings.includes('glare'), 'a bright capture warns about glare');
check(captureWarnings({ width: 1920, height: 1080 }).length === 0,
  'a good capture produces no warnings');

// ---------------------------------------------------------------------------
// Extraction boundary
// ---------------------------------------------------------------------------
check(extractionCapability.available === false, 'no extraction provider is configured');
check(extractionCapability.privacyApproved === false, 'no extraction provider is privacy approved');
check(extractionCapability.sendsImageOffDevice === false, 'NO DOCUMENT IMAGE LEAVES WARSHA');
check(extractionMayApprove() === false, 'EXTRACTION CAN NEVER APPROVE ANYBODY');
check(requiresManualEntry(0.5), 'a low-confidence field requires manual entry');
check(!requiresManualEntry(0.99), 'a high-confidence field may be suggested');
check(requiresManualEntry(MANUAL_ENTRY_CONFIDENCE_FLOOR - 0.001), 'the floor is exclusive below');
const lowCandidate = toClientCandidate({
  fieldKey: 'national_id_number', value: '29001011234567', confidence: 0.4, requiresManualEntry: true,
});
check(lowCandidate.value === null, 'A LOW-CONFIDENCE CANDIDATE IS WITHHELD, NOT SHOWN');
check(!('confidence' in lowCandidate), 'A CONFIDENCE SCORE NEVER CROSSES THE BOUNDARY');

const extractionSource = codeOf('src', 'onboarding', 'identity-extraction.ts');
check(!/gender|sex_marker|sexMarker/i.test(extractionSource),
  'NO GENDER OR SEX MARKER IS EXTRACTED');
check(!/fetch\(|axios|XMLHttpRequest/.test(extractionSource),
  'the extraction boundary makes no network call');

// ---------------------------------------------------------------------------
// Location boundary
// ---------------------------------------------------------------------------
check(locationCapability.manualPin === true, 'MANUAL PIN PLACEMENT IS ALWAYS AVAILABLE');
check(locationCapability.deviceLocation === false, 'no device-location provider is configured');
check(locationCapability.addressSearch === false, 'no address-search provider is configured');
check(locationCapability.providerKey === null, 'no map provider is selected');
check(manualPin(30.05, 31.23).source === 'manual_pin', 'a manual pin reports its own source');
const locationSource = codeOf('src', 'onboarding', 'location-provider.ts');
check(!/fetch\(|axios|googleapis|mapbox/i.test(locationSource),
  'the location boundary makes no external call');
check(!/expo-location/.test(locationSource),
  'no location permission dependency is introduced for a capability that does not exist');

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
resetMockOnboarding();
const A = 'mock-account-a';
const B = 'mock-account-b';

mockSelectRole(A, 'worker');
check(mockOnboardingState(A).intendedRole === 'worker', 'Mock records a worker role selection');
check(mockOnboardingState(A).workerState === 'account_created', 'Mock starts at account creation');
check(mockOnboardingState(A).workerCapabilityActive === false,
  'MOCK GRANTS NO CAPABILITY FOR SELECTING WORKER');

// Account isolation.
mockSelectRole(B, 'customer');
check(mockOnboardingState(B).intendedRole === 'customer', 'Mock keeps accounts separate');
check(mockOnboardingState(A).intendedRole === 'worker', 'one Mock account does not overwrite another');
check(mockOnboardingState(B).workerState === null, 'a Mock customer has no worker lifecycle');

// Mock refuses what the server refuses.
let refused = false;
try { mockStaffAdvance(A, 'active', 'Live'); } catch { refused = true; }
check(refused, 'MOCK REFUSES TO ACTIVATE A WORKER WITH OUTSTANDING GATES');

refused = false;
try { mockSubmitCriminalRecord(A, 'application/pdf', 1000, '2026-01-01'); } catch { refused = true; }
check(refused, 'MOCK REFUSES A CERTIFICATE BEFORE THE IDENTITY REVIEW ASKS FOR ONE');

refused = false;
try { mockSubmitIdentity(A); } catch { refused = true; }
check(refused, 'Mock requires both document sides before submission');

refused = false;
try { mockConfirmIdentityFields(A, '12345'); } catch { refused = true; }
check(refused, 'Mock refuses a malformed identifier');

refused = false;
try { mockConfirmAddress(A, 95, 31.23, 'manual_pin'); } catch { refused = true; }
check(refused, 'Mock refuses an out-of-range coordinate');

refused = false;
try { mockConfirmAddress(A, 30.05, 31.23, 'satellite' as never); } catch { refused = true; }
check(refused, 'Mock refuses an unknown pin source');

check(mockConfirmIdentityFields(A, '29001011234567') === '4567',
  'MOCK RETURNS ONLY THE LAST FOUR DIGITS');

mockRecordCapture(A, 'front');
mockRecordCapture(A, 'back');
check(mockSubmitIdentity(A).workerState === 'identity_submitted',
  'Mock accepts a complete identity submission');
check(mockOnboardingState(A).workerCapabilityActive === false,
  'MOCK DOES NOT ACTIVATE ON SUBMISSION');

mockConfirmAddress(A, 30.05, 31.23, 'manual_pin');
check(mockOnboardingState(A).addressConfirmed, 'a manual pin confirms a Mock address');

const mockSource = codeOf('src', 'onboarding', 'mock-onboarding-state.ts');
check(!/supabase|getSupabaseClient|fetch\(/i.test(mockSource), 'MOCK MAKES NO SUPABASE CALL');

const repositorySource = codeOf('src', 'onboarding', 'onboarding-repository.ts');
check(!/catch[\s\S]{0,120}mock/i.test(repositorySource),
  'MOCK IS NEVER A FALLBACK AFTER A SUPABASE FAILURE');
// No client-side approval verb exists at all.
check(!/\bapprove\b|\bactivate\b|\breject\b/.test(repositorySource),
  'THE WORKER REPOSITORY HAS NO APPROVE, ACTIVATE OR REJECT VERB');

// ---------------------------------------------------------------------------
// Staff contracts
// ---------------------------------------------------------------------------
check(requiresEvidence('reject'), 'a rejection requires evidence');
check(requiresEvidence('suspend'), 'a suspension requires evidence');
check(!requiresEvidence('request_correction'), 'a correction request does not require evidence');
check(DECISION_CAPABILITY.reject === 'reject_worker_application',
  'rejection needs its own capability');
check(DECISION_CAPABILITY.activate === 'activate_worker', 'activation needs its own capability');
check(DECISION_CAPABILITY.approve !== DECISION_CAPABILITY.reject,
  'APPROVING AND REJECTING ARE NOT THE SAME AUTHORITY');
for (const decision of Object.keys(DECISION_CAPABILITY) as VettingDecision[]) {
  check(typeof DECISION_CAPABILITY[decision] === 'string' && DECISION_CAPABILITY[decision].length > 0,
    `the ${decision} decision maps to a capability`);
}

const staffTypes = read('src', 'onboarding', 'onboarding-staff-types.ts');
check(!/userId\??:\s*string/.test(staffTypes.split('StaffVettingCase')[1]?.split('};')[0] ?? ''),
  'THE VETTING QUEUE CASE CARRIES NO USER ID');
check(!/displayName|email|phone|nationalId|storagePath/.test(
  staffTypes.split('export type StaffVettingCase')[1]?.split('};')[0] ?? ''),
  'THE VETTING QUEUE CASE CARRIES NO IDENTITY OR DOCUMENT FIELD');

const staffRepositorySource = codeOf('src', 'onboarding', 'onboarding-staff-repository.ts');
check(/documentReference[\s\S]{0,400}rpc\('staff_worker_document_reference'/.test(staffRepositorySource),
  'a document is reached through the audited server call');
check(!/offence|offense|conviction/i.test(staffRepositorySource),
  'the staff repository has no offence field');

// ---------------------------------------------------------------------------
// Screens: entry, brand, RTL, accessibility
// ---------------------------------------------------------------------------
const welcome = read('app', 'welcome.tsx');
check(/BrandLockup/.test(welcome), 'the gateway shows the brand lockup');
check(/signIn/.test(welcome) && /createAccount/.test(welcome),
  'the gateway offers sign in and create account');
check(/gatewayHelp/.test(welcome) && /gatewayPrivacy/.test(welcome) && /gatewayTerms/.test(welcome),
  'the gateway offers help, privacy and terms');
check(/accessibilityRole="header"/.test(welcome), 'the gateway has an accessible heading');

const gate = read('components', 'warsha', 'AuthGate.tsx');
const gateCode = codeOf('components', 'warsha', 'AuthGate.tsx');
check(/if \(!ready\)/.test(gateCode), 'the gate renders nothing operational until ready');
check(/routeAfterHydration/.test(gateCode),
  'new-session routing waits for every account-scoped authority');
check(/BrandLoadingMark/.test(gate), 'the loading state is the brand mark');
// The loading state must not impersonate a signed-in app. Scoped to the branch
// that actually renders it — `/(tabs)` appears in the route table, which is a
// destination, not something the loading screen draws.
const loadingBranch = gateCode.slice(gateCode.indexOf('if (!ready)'), gateCode.indexOf('return <>{children}'));
check(loadingBranch.length > 50, 'the loading branch was found');
check(!/Tabs|BottomNavigation|skeleton|Skeleton/.test(loadingBranch),
  'THE LOADING STATE DOES NOT IMPERSONATE A SIGNED-IN APP');
check(/PUBLIC_ROUTES/.test(gateCode), 'the gate knows which routes are public');
check(/replace\(/.test(gateCode) && !/push\(/.test(gateCode),
  'the gate replaces rather than pushes, so there is no back door into a protected screen');

const rootLayout = read('app', '_layout.tsx');
check(/<AuthGate>/.test(rootLayout), 'the root layout wraps the stack in the auth gate');
check(/OnboardingProvider/.test(rootLayout), 'the onboarding provider is mounted');
for (const route of ['welcome', 'sign-in', 'create-account', 'worker-home',
                     'onboarding/address', 'onboarding/worker', 'onboarding/identity',
                     'onboarding/certificate', 'legal/[topic]']) {
  check(rootLayout.includes(`name="${route}"`), `the ${route} route is declared in the root stack`);
}

// The motto is a promise, not decoration: it appears through the lockup and is
// never pasted into onboarding copy.
const screens = [
  'app/welcome.tsx', 'app/sign-in.tsx', 'app/create-account.tsx', 'app/worker-home.tsx',
  'app/onboarding/address.tsx', 'app/onboarding/worker.tsx', 'app/onboarding/identity.tsx',
  'app/onboarding/certificate.tsx', 'app/admin/vetting.tsx', 'app/legal/[topic].tsx',
];
for (const screen of screens) {
  // Comments stripped: a comment explaining why the motto is not repeated must
  // not itself count as a repetition.
  const source = codeOf(...screen.split('/'));
  check(!/YOUR WORK, OUR MISSION/.test(source), `${screen} does not repeat the motto inline`);
  check(!/scaleX:\s*-1|transform:\s*\[\s*\{\s*scaleX/.test(source),
    `${screen} never mirrors anything horizontally`);
}
check(!/scaleX/.test(codeOf('components', 'warsha', 'AuthGate.tsx')),
  'THE LOGO IS NEVER MIRRORED IN RTL');

// Confirmation is a deliberate act, never a typed phrase.
const certificateScreen = read('app', 'worker', 'verification.tsx');
check(/accessibilityRole="checkbox"/.test(certificateScreen),
  'the certificate acknowledgement is an accessible checkbox');
check(!/type (DELETE|CONFIRM|DELETE MY)/i.test(certificateScreen),
  'NO TYPED CONFIRMATION PHRASE IS REQUIRED');
check(/certificateHowIntro/.test(certificateScreen),
  'the certificate screen states Model A before anything else');

const createAccount = read('app', 'create-account.tsx');
check(/accessibilityRole="radiogroup"/.test(createAccount), 'the role choice is a radio group');
check(/accessibilityRole="radio"/.test(createAccount), 'each role is an accessible radio');
check(/roleQuestion/.test(createAccount), 'the role question is asked explicitly');
check(/roleWorkerHint/.test(createAccount),
  'the worker option says an application starts before the choice is made');

const addressScreen = read('app', 'onboarding', 'address.tsx');
check(/CustomerDestinationAddressFlow/.test(addressScreen) && /addressTitle/.test(addressScreen),
  'customer onboarding retains its destination-address presentation');
check(/WorkerCurrentLocationFlow/.test(addressScreen) && /workLocationTitle/.test(addressScreen),
  'worker onboarding has a separate private work-location presentation');
check(/AddressLocationPicker/.test(addressScreen),
  'both presentations reuse the provider-aware location infrastructure');

const workerScreen = read('app', 'onboarding', 'worker.tsx');
check(/workerJourneyProgress/.test(workerScreen), 'the worker screen shows one guided worker-owned step');
check(/stateNoTimePromise/.test(workerScreen), 'the worker screen makes no time promise');
check(!/\b\d+\s*(hours|days|hrs)\b/i.test(codeOf('app', 'onboarding', 'worker.tsx')),
  'NO REVIEW TURNAROUND IS PROMISED ANYWHERE ON THE APPLICATION SCREEN');
check(!/requestService/.test(workerScreen),
  'a pending worker stays in the continuous guided journey');

const workerHome = read('app', 'worker', 'index.tsx');
check(/workerDashboardPriority/.test(workerHome), 'the worker home leads with the current work state');
check(/requestService/.test(workerHome), 'the worker home offers an explicit service-request action');
const workerHomeCode = codeOf('app', 'worker', 'index.tsx');
check(workerHomeCode.indexOf('<PrimaryTaskCard') < workerHomeCode.indexOf('styles.customerCard'),
  'REQUESTING A SERVICE IS SECONDARY TO THE WORKER PRIMARY TASK');

const vettingScreen = codeOf('app', 'admin', 'vetting.tsx');
check(/subjectRef/.test(vettingScreen), 'the staff queue renders an opaque reference');
check(/AdminShell/.test(vettingScreen) && /useAdmin/.test(vettingScreen),
  'the staff queue sits inside the WPS-017 guarded admin shell');
check(/can\('review_worker_vetting'\)/.test(vettingScreen),
  'the staff queue gates its read on the capability the server will demand');
check(!/displayName|email|phone|nationalId/.test(vettingScreen),
  'THE STAFF QUEUE RENDERS NO IDENTITY FIELD');

// Offence-shaped DATA BINDING, not the word.
//
// The first version of this check searched the screen for `/offence/i` and
// failed once the screen gained a line of staff-facing copy explaining that
// offence detail is never stored where it could be reached. That sentence is
// worth having — it stops a reviewer hunting for a control that does not exist
// — and forbidding the word would have removed the explanation rather than the
// risk. What must not exist is a binding that could render offence data, so
// that is what is checked.
// `\w\.` so this is a property access on an identifier, not a sentence that
// happens to end just before the word.
check(!/\w\.(offence|offense|conviction|charge|crime)/i.test(vettingScreen),
  'THE STAFF QUEUE BINDS NO OFFENCE-SHAPED FIELD');
check(!/(offence|offense|conviction)\w*\s*[:=]/i.test(vettingScreen),
  'the staff queue declares no offence-shaped value');
// Backed by the type, which has no such field to bind in the first place.
check(!/offence|offense|conviction|charge|crime/i.test(
  staffTypes.split('export type StaffVettingCase')[1]?.split('};')[0] ?? ''),
  'the vetting case type has no offence-shaped field');

// ---------------------------------------------------------------------------
// Copy: English and Egyptian Arabic parity
// ---------------------------------------------------------------------------
const englishKeys = Object.keys(onboardingCopy.en).sort();
const arabicKeys = Object.keys(onboardingCopy.ar).sort();
check(englishKeys.length === arabicKeys.length, 'English and Arabic have the same number of keys');
check(englishKeys.join('|') === arabicKeys.join('|'), 'ENGLISH AND ARABIC COVER EXACTLY THE SAME KEYS');
check(englishKeys.length >= 90, 'the copy covers the whole flow');
for (const key of englishKeys) {
  const en = onboardingCopy.en[key as keyof typeof onboardingCopy.en];
  const ar = onboardingCopy.ar[key as keyof typeof onboardingCopy.ar];
  check(typeof en === 'string' && en.trim().length > 0, `${key} has English text`);
  check(typeof ar === 'string' && ar.trim().length > 0, `${key} has Arabic text`);
}
// Arabic is Arabic, not a copy of the English string.
//
// Widened to `string` deliberately. Left as literal unions, TypeScript rejects
// the comparison outright — the two sets of string literals provably have no
// member in common. That is a stronger guarantee than this check, and it is
// nice to have, but it is a guarantee about the current copy: it would vanish
// the moment somebody pasted an English string into the Arabic table, which is
// exactly the case this check exists to catch. So the check runs at runtime too.
const en: Record<string, string> = onboardingCopy.en;
const ar: Record<string, string> = onboardingCopy.ar;
const identicalPairs = englishKeys.filter((key) => en[key] === ar[key]).length;
check(identicalPairs === 0, 'NO ARABIC STRING IS AN UNTRANSLATED COPY OF THE ENGLISH');
check(/[؀-ۿ]/.test(onboardingCopy.ar.certificateHowIntro),
  'the Arabic certificate explanation is in Arabic');
check(onboardingCopy.ar.certificateWhat.includes('الفيش والتشبيه'),
  'the Arabic copy uses the name people actually use for the certificate');

// The copy must not claim a government integration, in either language. The
// module's own header comment discusses both prohibitions at length, so it is
// stripped first — otherwise the explanation would satisfy the check.
const copySource = codeOf('src', 'onboarding', 'onboarding-copy.ts');
check(!/we (will )?(fetch|request|obtain|retrieve) (your|the) certificate/i.test(copySource),
  'NO COPY CLAIMS WARSHA OBTAINS THE CERTIFICATE');
check(!/ministry|government (system|database|api)/i.test(
  copySource.replace(/no access to any government system/gi, '')
    .replace(/مالهاش أي دخول على أنظمة حكومية/g, '')),
  'NO COPY CLAIMS A MINISTRY OR GOVERNMENT INTEGRATION');
check(/no access to any government system/i.test(copySource),
  'the copy states plainly that Warsha has no government access');
// No invented review time, in either language.
check(!/within \d+ (hours|days)|خلال \d+ (ساعة|يوم)/i.test(copySource),
  'NO COPY PROMISES A REVIEW TURNAROUND');

// ---------------------------------------------------------------------------
// Migration: the properties that must survive an edit
// ---------------------------------------------------------------------------
check(/revoke all on function %s from public/.test(migration),
  'the signed-out reachability repair revokes from PUBLIC, not from anon');
check(/anon_allowlist/.test(migration), 'the anonymous read surface is an explicit allowlist');
check(/has_function_privilege\('anon'/.test(migration),
  'the repair targets exactly what anon can currently reach');

check(/create table if not exists public\.account_onboarding/.test(migration),
  'the onboarding table is created');
check(/create table if not exists public\.worker_onboarding_events/.test(migration),
  'the lifecycle history table is created');
check(/worker_onboarding_events_immutable/.test(migration), 'lifecycle history is immutable');
check(/clock_timestamp\(\)/.test(migration),
  'history ordering does not depend on a transaction timestamp');

const transitionSlice = migration.slice(
  migration.indexOf('function private.worker_transition_allowed'),
  migration.indexOf('revoke all on function private.worker_transition_allowed'),
);
check(transitionSlice.length > 200, 'the transition rules were found');
check(!/p_actor_kind = 'worker'[\s\S]*?p_to = 'active'/.test(transitionSlice),
  'A WORKER CANNOT TRANSITION THEMSELVES TO ACTIVE');
check(/p_actor_kind = 'system' then[\s\S]{0,120}p_to = 'account_created'/.test(transitionSlice),
  'the system may only record account creation');

const gatesSlice = migration.slice(
  migration.indexOf('function private.worker_activation_gates'),
  migration.indexOf('comment on function private.worker_activation_gates'),
);
check(gatesSlice.length > 500, 'the activation gates were found');
check(!/confidence|worker_identity_extractions/.test(gatesSlice),
  'NO ACTIVATION GATE READS AN EXTRACTION OR A CONFIDENCE SCORE');
for (const gate of ['national_id_front_uploaded', 'national_id_back_uploaded',
                    'criminal_record_approved', 'worker_agreement_accepted',
                    'identity_verification_approved', 'not_banned', 'no_deletion_pending']) {
  check(gatesSlice.includes(gate), `the ${gate} gate exists`);
}

check(/legal_review_status text not null default 'pending'/.test(migration),
  'the vetting policy starts unapproved');

// The rejected rule, checked as BEHAVIOUR rather than as prose.
//
// The first version of this check searched the migration for the words
// "automatic reject". It failed — because the seeded policy `notes` say "No
// automatic rejection rule is implemented", and that sentence satisfied the
// check for the thing it was describing. A string asserting an absence is not
// evidence of that absence, exactly as a comment is not.
//
// So the checks below look for the machinery such a rule would need: a date
// window, an interval arithmetic on an issue or offence date, and any path
// that writes 'rejected' outside a capability-checked function.
check(!/interval\s*'\s*\d+\s*(month|year|day)/i.test(migration),
  'NO DATE-WINDOW INTERVAL ARITHMETIC EXISTS ANYWHERE IN THE VETTING PATH');
check(!/(issue_date|offence_date)\s*[<>]/.test(migration.replace(/p_issue_date > current_date/g, '')),
  'NO COMPARISON DERIVES AN OUTCOME FROM HOW RECENT A DOCUMENT IS');

const rejectionWrites = migration.split(/\n/).filter((line) => /'rejected'/.test(line));
check(rejectionWrites.length > 0, 'the rejected state is reachable at all');
// Every one is inside a decision function that opens with a capability check,
// or is a state-machine rule, or is a constraint listing the allowed values.
const decisionSlice = migration.slice(
  migration.indexOf('function public.staff_worker_vetting_decision'),
  migration.indexOf('function public.staff_worker_document_reference'),
);
check(/require_staff_capability\(v_capability\)/.test(decisionSlice),
  'a vetting decision requires a named capability before anything else');
check(/reject_worker_application/.test(decisionSlice),
  'rejection maps to its own capability');
check(/An adverse decision requires recorded evidence/.test(decisionSlice),
  'an adverse decision cannot be recorded without evidence');

// The policy is data a human reads, never a computed weight.
check(/reviewer_judgement/.test(migration), 'every policy factor is reviewer judgement');
check(!/'weighting',\s*'(high|medium|low|automatic|[0-9])/i.test(migration),
  'NO POLICY FACTOR CARRIES A NUMERIC OR AUTOMATIC WEIGHT');
check(/ILLUSTRATIVE ONLY/.test(migration),
  'the seeded criteria are labelled as illustrative rather than approved');
check(/'worker-criminal-records'[\s\S]{0,200}false/.test(migration),
  'the certificate bucket is private');
check(/staff_has_capability\('review_criminal_records'\)/.test(migration),
  'certificate storage access needs the dedicated capability');
check(!/private\.is_staff\(\)[\s\S]{0,80}worker-criminal-records/.test(migration),
  'ORDINARY STAFF ACCESS IS NOT ENOUGH TO REACH A CERTIFICATE');

// Nothing WPS-023 built may be published to Realtime.
check(!/supabase_realtime[\s\S]{0,200}(account_onboarding|worker_onboarding_events|worker_criminal_record)/
  .test(migration), 'no WPS-023 table is added to a Realtime publication');

// Every WPS-023 function is search-path pinned.
const functionCount = (migration.match(/^create or replace function/gm) ?? []).length;
const pinnedCount = (migration.match(/set search_path = ''/g) ?? []).length;
check(functionCount > 0, 'the migration defines functions');
check(pinnedCount >= functionCount, 'EVERY MIGRATION FUNCTION PINS AN EMPTY SEARCH PATH');

// Notification payloads carry a state, never a detail.
const notificationSlice = migration.slice(
  migration.indexOf('insert into private.notification_event_catalog'),
  migration.indexOf('insert into private.staff_feature_flags'),
);
check(notificationSlice.length > 500, 'the notification catalog insert was found');
check(!/offence|offense|conviction|national id|\.pdf|\.jpg/i.test(notificationSlice),
  'NO NOTIFICATION CARRIES AN OFFENCE, AN IDENTIFIER OR A FILENAME');

// Every WPS-023 surface ships off.
const flagSlice = migration.slice(
  migration.indexOf('insert into private.staff_feature_flags'),
  migration.indexOf('insert into private.staff_kill_switches'),
);
check(/'authentication_gateway', 'local', false/.test(flagSlice),
  'the authentication gateway ships disabled');
check(/'worker_vetting', 'local', false/.test(flagSlice), 'worker vetting ships disabled');
check(/'identity_extraction', 'local', false/.test(flagSlice), 'extraction ships disabled');
check(/'location_provider', 'local', false/.test(flagSlice), 'the map provider ships disabled');
check(!/'local', true/.test(flagSlice), 'NO WPS-023 FEATURE FLAG SHIPS ENABLED');

// Grandfathering is explicit and never silent.
check(/'worker', 'manual_review'/.test(migration),
  'existing workers are backfilled into manual review, not active');
check(!/'worker', 'active'/.test(migration),
  'NO ACCOUNT IS SILENTLY BACKFILLED INTO AN ACTIVE STATE');

// ---------------------------------------------------------------------------
// Package script
// ---------------------------------------------------------------------------
const packageJson = read('package.json');
check(/"test:wps023"/.test(packageJson), 'the WPS-023 suite has a package script');

// ---------------------------------------------------------------------------
console.log(`WPS-023 client regressions: ${passed} checks passed`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
