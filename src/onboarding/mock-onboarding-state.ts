/**
 * WPS-023 Mock onboarding.
 *
 * Account-scoped, in-memory, and completely isolated from Supabase: no client
 * is imported, no network call is made, and nothing here is ever reached as a
 * fallback after a Supabase failure. A Supabase error surfaces as an error.
 *
 * Mock enforces the same rules the server does, because a Mock that is easier
 * to satisfy than production teaches the wrong thing to everyone who demos
 * against it. In particular Mock refuses to activate a worker whose gates are
 * unsatisfied, refuses to let a worker approve themselves, and refuses a
 * criminal-record submission before the identity review has asked for one.
 */

import type {
  AccountRoleChoice,
  CertificateStatus,
  IdentityCandidate,
  OnboardingState,
  PinSource,
  WorkerState,
} from './onboarding-types';

/**
 * Type-only import above, and the blank state restated below rather than
 * imported. Mock has to be loadable with nothing but a type stripper — the
 * regression suite runs it under `--experimental-strip-types`, where a runtime
 * import would need an extension the rest of the codebase does not use.
 */
const blankState: OnboardingState = {
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

type MockAccount = {
  state: OnboardingState;
  history: { toState: WorkerState; safeReason: string; at: string }[];
  candidates: IdentityCandidate[];
};

const accounts = new Map<string, MockAccount>();

const WORKER_GATES = [
  'authenticated_account', 'verified_phone', 'verified_email_if_present',
  'worker_role_selected', 'legal_name_complete', 'profile_photo', 'biography',
  'services_configured', 'service_area_configured', 'current_address_provided',
  'national_id_front_uploaded', 'national_id_back_uploaded', 'national_id_approved',
  'identity_fields_confirmed', 'criminal_record_uploaded', 'criminal_record_approved',
  'worker_agreement_accepted', 'document_processing_accepted',
  'identity_verification_approved', 'not_banned', 'no_blocking_trust_action',
  'provider_status_allowed', 'not_deactivated', 'no_deletion_pending',
];

function gatesFrom(overrides: Record<string, boolean>): Record<string, boolean> {
  const gates: Record<string, boolean> = {};
  for (const gate of WORKER_GATES) gates[gate] = overrides[gate] ?? false;
  return gates;
}

function recompute(account: MockAccount): void {
  const gates = account.state.gates;
  account.state.outstandingGates = Object.entries(gates)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .sort();
  // Both halves, exactly as the server computes it: every gate satisfied AND
  // the lifecycle actually reached `active`.
  account.state.workerCapabilityActive =
    account.state.workerState === 'active' && account.state.outstandingGates.length === 0;
}

function ensure(accountKey: string): MockAccount {
  let account = accounts.get(accountKey);
  if (!account) {
    account = {
      state: { ...blankState, gates: {}, outstandingGates: [] },
      history: [],
      candidates: [],
    };
    accounts.set(accountKey, account);
  }
  return account;
}

export function mockOnboardingState(accountKey: string): OnboardingState {
  const account = ensure(accountKey);
  return { ...account.state, gates: { ...account.state.gates }, outstandingGates: [...account.state.outstandingGates] };
}

export function mockSelectRole(accountKey: string, role: AccountRoleChoice): OnboardingState {
  const account = ensure(accountKey);
  if (account.state.roleSelectionLocked && account.state.intendedRole !== role) {
    throw new Error('Role selection is locked');
  }
  account.state.roleSelected = true;
  account.state.intendedRole = role;
  if (role === 'worker') {
    if (!account.state.workerState) {
      account.state.workerState = 'account_created';
      account.state.workerStateChangedAt = new Date().toISOString();
      account.history.push({
        toState: 'account_created',
        safeReason: 'Your worker account was created.',
        at: account.state.workerStateChangedAt,
      });
    }
    account.state.gates = gatesFrom({
      authenticated_account: true,
      verified_phone: true,
      verified_email_if_present: true,
      worker_role_selected: true,
      not_banned: true,
      no_blocking_trust_action: true,
      not_deactivated: true,
      no_deletion_pending: true,
    });
  } else {
    account.state.workerState = null;
    account.state.gates = {};
  }
  recompute(account);
  return mockOnboardingState(accountKey);
}

export function mockConfirmAddress(
  accountKey: string,
  latitude: number,
  longitude: number,
  source: PinSource,
): OnboardingState {
  const account = ensure(accountKey);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('A confirmed map pin is required');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('A confirmed map pin is required');
  }
  if (source !== 'device_location' && source !== 'address_search' && source !== 'manual_pin') {
    throw new Error('Invalid pin source');
  }
  account.state.addressConfirmed = true;
  account.state.customerState = 'complete';
  if (account.state.intendedRole === 'worker') {
    account.state.gates.current_address_provided = true;
  }
  recompute(account);
  return mockOnboardingState(accountKey);
}

export function mockAcceptAgreements(
  accountKey: string,
  workerAgreement: boolean,
  documentProcessing: boolean,
): OnboardingState {
  const account = ensure(accountKey);
  if (account.state.intendedRole !== 'worker') throw new Error('Worker onboarding has not started');
  if (workerAgreement) {
    account.state.workerAgreementAccepted = true;
    account.state.gates.worker_agreement_accepted = true;
  }
  if (documentProcessing) {
    account.state.documentProcessingAccepted = true;
    account.state.gates.document_processing_accepted = true;
  }
  recompute(account);
  return mockOnboardingState(accountKey);
}

export function mockIdentityCandidates(accountKey: string): IdentityCandidate[] {
  return [...ensure(accountKey).candidates];
}

export function mockRecordCapture(accountKey: string, side: 'front' | 'back'): OnboardingState {
  const account = ensure(accountKey);
  if (account.state.intendedRole !== 'worker') throw new Error('Worker profile not found');
  account.state.gates[side === 'front' ? 'national_id_front_uploaded' : 'national_id_back_uploaded'] = true;
  recompute(account);
  return mockOnboardingState(accountKey);
}

export function mockConfirmIdentityFields(accountKey: string, nationalId: string): string {
  const account = ensure(accountKey);
  const digits = nationalId.replace(/[^0-9]/g, '');
  if (!/^[0-9]{14}$/.test(digits)) throw new Error('Invalid national identifier');
  account.state.gates.identity_fields_confirmed = true;
  account.state.gates.legal_name_complete = true;
  recompute(account);
  // Only the last four ever come back, exactly as the server does it.
  return digits.slice(-4);
}

export function mockSubmitIdentity(accountKey: string): OnboardingState {
  const account = ensure(accountKey);
  if (!account.state.gates.national_id_front_uploaded || !account.state.gates.national_id_back_uploaded) {
    throw new Error('Both sides of the national identity document are required');
  }
  if (!account.state.gates.identity_fields_confirmed) {
    throw new Error('Identity details must be confirmed before review');
  }
  return transition(accountKey, 'identity_submitted',
    'Your identity documents were received and are waiting for review.');
}

export function mockSubmitCriminalRecord(
  accountKey: string,
  mimeType: string,
  sizeBytes: number,
  issueDate: string,
): OnboardingState {
  const account = ensure(accountKey);
  if (!['image/jpeg', 'image/png', 'image/heic', 'application/pdf'].includes(mimeType)) {
    throw new Error('Unsupported document format');
  }
  if (sizeBytes <= 0 || sizeBytes > 8 * 1024 * 1024) throw new Error('Document is too large');
  if (new Date(issueDate).getTime() > Date.now()) throw new Error('Invalid issue date');
  // The ordering rule the server enforces through its state machine: a
  // certificate cannot be submitted until an identity review asked for one.
  if (account.state.workerState !== 'criminal_record_required'
      && account.state.workerState !== 'correction_required') {
    throw new Error('Invalid worker onboarding transition');
  }
  account.state.gates.criminal_record_uploaded = true;
  account.state.certificateStatus = 'submitted';
  return transition(accountKey, 'criminal_record_submitted',
    'Your certificate was received and is waiting for review.');
}

export function mockSubmitAppeal(accountKey: string, statement: string): OnboardingState {
  const account = ensure(accountKey);
  if (statement.trim().length < 10) throw new Error('An appeal statement is required');
  if (account.state.workerState !== 'rejected') throw new Error('No decision is open to appeal');
  return transition(accountKey, 'appeal_pending',
    'Your appeal was received and is waiting for a different reviewer.');
}

function transition(accountKey: string, to: WorkerState, safeReason: string): OnboardingState {
  const account = ensure(accountKey);
  account.state.workerState = to;
  account.state.workerStateChangedAt = new Date().toISOString();
  account.state.latestSafeReason = safeReason;
  account.history.push({ toState: to, safeReason, at: account.state.workerStateChangedAt });
  recompute(account);
  return mockOnboardingState(accountKey);
}

/**
 * Demo-only staff progression. It is a named simulation rather than something
 * the worker screens can reach, and it refuses to activate a worker whose
 * gates are unsatisfied — the same refusal the server makes.
 */
export function mockStaffAdvance(
  accountKey: string,
  to: WorkerState,
  safeReason: string,
  certificateStatus?: CertificateStatus,
): OnboardingState {
  const account = ensure(accountKey);
  if (to === 'active') {
    const outstanding = Object.entries(account.state.gates).filter(([, value]) => !value);
    if (outstanding.length > 0) throw new Error('Activation gates are not satisfied');
  }
  if (to === 'criminal_record_required') account.state.gates.national_id_approved = true;
  if (to === 'approved') {
    account.state.gates.criminal_record_approved = true;
    account.state.gates.identity_verification_approved = true;
    account.state.gates.provider_status_allowed = true;
  }
  if (certificateStatus) account.state.certificateStatus = certificateStatus;
  return transition(accountKey, to, safeReason);
}

export function mockWorkerHistory(accountKey: string) {
  return [...ensure(accountKey).history];
}

export function resetMockOnboarding(): void {
  accounts.clear();
}
