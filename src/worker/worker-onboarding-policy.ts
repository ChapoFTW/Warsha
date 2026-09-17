import type { OnboardingState } from '@/src/onboarding/onboarding-types';

export type WorkerJourneyStep =
  | 'welcome'
  | 'basic_information'
  | 'trade'
  | 'service_area'
  | 'identity'
  | 'criminal_record'
  | 'review';

export const workerJourneySteps: WorkerJourneyStep[] = [
  'welcome',
  'basic_information',
  'trade',
  'service_area',
  'identity',
  'criminal_record',
  'review',
];

/**
 * The steps this Professional is actually asked for. The criminal-record step
 * exists only while the server says Warsha collects criminal records.
 */
export function workerJourneyStepsFor(state: Pick<OnboardingState, 'criminalRecordRequired'>): WorkerJourneyStep[] {
  return state.criminalRecordRequired
    ? workerJourneySteps
    : workerJourneySteps.filter(step => step !== 'criminal_record');
}

function gate(state: OnboardingState, key: string): boolean {
  return state.gates[key] === true;
}

/** The first incomplete worker-owned step. Staff-only gates never appear. */
export function currentWorkerJourneyStep(state: OnboardingState): WorkerJourneyStep {
  if (!state.workerAgreementAccepted || !state.documentProcessingAccepted) return 'welcome';
  if (!gate(state, 'profile_photo')) return 'basic_information';
  if (!gate(state, 'professions_configured') || !gate(state, 'services_configured')) return 'trade';
  if (!gate(state, 'service_area_configured') || !gate(state, 'current_address_provided')) {
    return 'service_area';
  }
  if (
    !gate(state, 'national_id_front_uploaded')
    || !gate(state, 'national_id_back_uploaded')
    || !gate(state, 'identity_fields_confirmed')
  ) return 'identity';
  if (state.criminalRecordRequired && !gate(state, 'criminal_record_uploaded')) return 'criminal_record';
  return 'review';
}

export function workerJourneyProgress(state: OnboardingState) {
  const step = currentWorkerJourneyStep(state);
  const steps = workerJourneyStepsFor(state);
  const index = steps.indexOf(step);
  return { step, current: index + 1, total: steps.length };
}
