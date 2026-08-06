/**
 * WPS-023 contracts and the pure logic that reads them.
 *
 * Import-free on purpose. Everything here is a type or a total function over
 * plain data, so the regression suite can exercise the routing rules without a
 * React tree, a navigator, or a network.
 *
 * The one rule that matters in this file: `workerCapabilityActive` is the only
 * field any caller may treat as permission, and it is computed by the server.
 * Every other field describes what to SHOW. Nothing here decides what someone
 * is allowed to DO — that answer lives in Postgres and arrives over the wire.
 */

export type AccountRoleChoice = 'customer' | 'worker';

export type WorkerState =
  | 'account_created'
  | 'onboarding_incomplete'
  | 'identity_required'
  | 'identity_submitted'
  | 'identity_under_review'
  | 'criminal_record_required'
  | 'criminal_record_submitted'
  | 'criminal_record_under_review'
  | 'correction_required'
  | 'manual_review'
  | 'rejected'
  | 'appeal_pending'
  | 'approved'
  | 'active'
  | 'suspended';

export type CustomerState = 'address_required' | 'complete';

export type PinSource = 'device_location' | 'address_search' | 'manual_pin';

export type CertificateStatus =
  | 'submitted'
  | 'under_review'
  | 'clear'
  | 'approved'
  | 'correction_required'
  | 'manual_review'
  | 'rejected';

export type OnboardingState = {
  roleSelected: boolean;
  intendedRole: AccountRoleChoice | null;
  roleSelectionLocked: boolean;
  customerState: CustomerState;
  addressConfirmed: boolean;
  workerState: WorkerState | null;
  workerStateChangedAt: string | null;
  workerAgreementAccepted: boolean;
  documentProcessingAccepted: boolean;
  gates: Record<string, boolean>;
  outstandingGates: string[];
  /** The only permission fact in this payload. Server-computed. */
  workerCapabilityActive: boolean;
  certificateStatus: CertificateStatus | null;
  certificateSafeReason: string | null;
  latestSafeReason: string | null;
  latestReasonCode: string | null;
  accountDeactivated: boolean;
  deletionStatus: string | null;
  accountBanned: boolean;
};

export type IdentityCandidate = {
  fieldKey: 'national_id_number' | 'legal_name_ar' | 'date_of_birth' | 'id_expiry_date';
  candidateValue: string | null;
  masked: boolean;
  requiresManualEntry: boolean;
};

/**
 * Where the router should send a signed-in account.
 *
 * `gateway` is also the answer for a signed-out session, which is why the
 * function takes a nullable state: an unknown session and a known-absent one
 * both mean "show the gateway", and conflating them here is what stops a
 * protected screen flashing while hydration finishes.
 */
export type RouteTarget =
  | 'gateway'
  | 'role_choice'
  | 'customer_address'
  | 'customer_home'
  | 'worker_onboarding'
  | 'worker_home'
  | 'account_blocked';

export function routeFor(state: OnboardingState | null, signedIn: boolean): RouteTarget {
  if (!signedIn || !state) return 'gateway';
  if (state.accountBanned) return 'account_blocked';
  if (!state.roleSelected || state.intendedRole === null) return 'role_choice';

  if (state.intendedRole === 'worker') {
    // An active worker lands on the worker home. Everyone else in the worker
    // lifecycle lands on their application, including someone who was
    // approved but not yet activated — approval is not permission.
    return state.workerCapabilityActive ? 'worker_home' : 'worker_onboarding';
  }

  return state.addressConfirmed ? 'customer_home' : 'customer_address';
}

/**
 * A worker may always fall back to customer mode. Onboarding does not take
 * away the ability to book a plumber, and a pending application is a bad
 * reason to be locked out of the rest of the product.
 */
export function canUseCustomerMode(state: OnboardingState | null): boolean {
  if (!state) return false;
  return !state.accountBanned && state.roleSelected;
}

/** Whether the worker home should offer "Book a service" as a secondary action. */
export function showsCustomerModeAction(state: OnboardingState | null): boolean {
  return canUseCustomerMode(state) && state?.intendedRole === 'worker';
}

/** The worker is waiting on Warsha, not the other way round. */
export function isAwaitingReview(state: WorkerState | null): boolean {
  return state === 'identity_submitted'
    || state === 'identity_under_review'
    || state === 'criminal_record_submitted'
    || state === 'criminal_record_under_review'
    || state === 'manual_review'
    || state === 'appeal_pending';
}

/** The worker has something to do. */
export function needsWorkerAction(state: WorkerState | null): boolean {
  return state === 'account_created'
    || state === 'onboarding_incomplete'
    || state === 'identity_required'
    || state === 'criminal_record_required'
    || state === 'correction_required';
}

export function canAppeal(state: WorkerState | null): boolean {
  return state === 'rejected';
}

/** Gates the worker can act on, in the order the application asks for them. */
const GATE_ORDER = [
  'worker_role_selected',
  'verified_phone',
  'worker_agreement_accepted',
  'document_processing_accepted',
  'legal_name_complete',
  'profile_photo',
  'biography',
  'services_configured',
  'service_area_configured',
  'current_address_provided',
  'national_id_front_uploaded',
  'national_id_back_uploaded',
  'identity_fields_confirmed',
  'national_id_approved',
  'criminal_record_uploaded',
  'criminal_record_approved',
  'identity_verification_approved',
  'provider_status_allowed',
] as const;

/**
 * Gates a worker cannot fix by doing anything in the app. Showing these as a
 * to-do item would send somebody to solve a problem that is not theirs.
 */
const STAFF_ONLY_GATES = new Set<string>([
  'national_id_approved',
  'criminal_record_approved',
  'identity_verification_approved',
  'provider_status_allowed',
  'not_banned',
  'no_blocking_trust_action',
]);

export function isActionableGate(gate: string): boolean {
  return !STAFF_ONLY_GATES.has(gate);
}

/** Outstanding gates the worker can actually do something about, in order. */
export function actionableGates(state: OnboardingState | null): string[] {
  if (!state) return [];
  return state.outstandingGates
    .filter(isActionableGate)
    .sort((a, b) => {
      const ai = GATE_ORDER.indexOf(a as (typeof GATE_ORDER)[number]);
      const bi = GATE_ORDER.indexOf(b as (typeof GATE_ORDER)[number]);
      return (ai < 0 ? GATE_ORDER.length : ai) - (bi < 0 ? GATE_ORDER.length : bi);
    });
}

/** 0..1 progress across the gates, for a progress announcement. */
export function gateProgress(state: OnboardingState | null): { done: number; total: number } {
  if (!state) return { done: 0, total: 0 };
  const entries = Object.entries(state.gates);
  if (entries.length === 0) return { done: 0, total: 0 };
  return { done: entries.filter(([, value]) => value).length, total: entries.length };
}

/** Egyptian National ID: fourteen digits. Spaces and dashes are forgiven. */
export function normalizeNationalId(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function isValidNationalId(value: string): boolean {
  return /^[0-9]{14}$/.test(normalizeNationalId(value));
}

/** Never render a full identifier. The owner already knows their own number. */
export function maskNationalId(value: string): string {
  const digits = normalizeNationalId(value);
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function isValidCoordinate(latitude: number | null, longitude: number | null): boolean {
  if (latitude === null || longitude === null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
] as const;

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export function isAcceptedDocument(mimeType: string, sizeBytes: number): boolean {
  return (ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)
    && sizeBytes > 0
    && sizeBytes <= MAX_DOCUMENT_BYTES;
}

/** Capture warnings. Advisory only — nothing here blocks an upload. */
export type CaptureWarning = 'blurry' | 'glare' | 'low_resolution' | 'edges_not_visible';

export function captureWarnings(input: {
  width: number;
  height: number;
  sharpness?: number | null;
  brightestFraction?: number | null;
}): CaptureWarning[] {
  const warnings: CaptureWarning[] = [];
  const shortestEdge = Math.min(input.width, input.height);
  if (shortestEdge > 0 && shortestEdge < 720) warnings.push('low_resolution');
  if (input.sharpness !== null && input.sharpness !== undefined && input.sharpness < 0.35) {
    warnings.push('blurry');
  }
  if (
    input.brightestFraction !== null
    && input.brightestFraction !== undefined
    && input.brightestFraction > 0.12
  ) {
    warnings.push('glare');
  }
  return warnings;
}

export const emptyOnboardingState: OnboardingState = {
  roleSelected: false,
  intendedRole: null,
  roleSelectionLocked: false,
  customerState: 'address_required',
  addressConfirmed: false,
  workerState: null,
  workerStateChangedAt: null,
  workerAgreementAccepted: false,
  documentProcessingAccepted: false,
  gates: {},
  outstandingGates: [],
  workerCapabilityActive: false,
  certificateStatus: null,
  certificateSafeReason: null,
  latestSafeReason: null,
  latestReasonCode: null,
  accountDeactivated: false,
  deletionStatus: null,
  accountBanned: false,
};
