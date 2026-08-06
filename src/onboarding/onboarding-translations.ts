import { useLocalization } from '@/src/i18n/localization';

import { onboardingCopy, type OnboardingCopyKey } from './onboarding-copy';
import type { CaptureWarning, CertificateStatus, WorkerState } from './onboarding-types';

/**
 * Every lifecycle state maps to a sentence that says what is happening and who
 * has it. None of them names a reviewer, and none of them predicts a date:
 * there is no measured review time, so promising one would be inventing an SLA
 * nobody has agreed to staff.
 */
const workerStateKeys: Record<WorkerState, OnboardingCopyKey> = {
  account_created: 'stateAccountCreated',
  onboarding_incomplete: 'stateOnboardingIncomplete',
  identity_required: 'stateIdentityRequired',
  identity_submitted: 'stateIdentitySubmitted',
  identity_under_review: 'stateIdentityUnderReview',
  criminal_record_required: 'stateCertificateRequired',
  criminal_record_submitted: 'stateCertificateSubmitted',
  criminal_record_under_review: 'stateCertificateUnderReview',
  correction_required: 'stateCorrectionRequired',
  manual_review: 'stateManualReview',
  rejected: 'stateRejected',
  appeal_pending: 'stateAppealPending',
  // Approved is not active, and the copy does not let the two blur together.
  // Somebody told "you are live" who cannot yet take a job would reasonably
  // think the product is broken.
  approved: 'stateApproved',
  active: 'stateActive',
  suspended: 'stateSuspended',
};

const certificateStatusKeys: Record<CertificateStatus, OnboardingCopyKey> = {
  submitted: 'stateCertificateSubmitted',
  under_review: 'stateCertificateUnderReview',
  clear: 'stateApproved',
  approved: 'stateApproved',
  correction_required: 'correctionTitle',
  manual_review: 'stateManualReview',
  rejected: 'rejectionTitle',
};

const captureWarningKeys: Record<CaptureWarning, OnboardingCopyKey> = {
  blurry: 'identityWarnBlurry',
  glare: 'identityWarnGlare',
  low_resolution: 'identityWarnResolution',
  edges_not_visible: 'identityWarnEdges',
};

/** Each actionable gate gets the sentence for the step that satisfies it. */
const gateKeys: Record<string, OnboardingCopyKey> = {
  worker_role_selected: 'roleQuestion',
  verified_phone: 'stateOnboardingIncomplete',
  worker_agreement_accepted: 'workerAgreementTitle',
  document_processing_accepted: 'workerDocumentConsent',
  legal_name_complete: 'identityLegalName',
  profile_photo: 'workerHomeProfile',
  biography: 'workerHomeProfile',
  services_configured: 'workerHomeProfile',
  service_area_configured: 'workerHomeProfile',
  current_address_provided: 'addressTitle',
  national_id_front_uploaded: 'identityFront',
  national_id_back_uploaded: 'identityBack',
  identity_fields_confirmed: 'identityFieldsTitle',
  criminal_record_uploaded: 'certificateTitle',
};

export function useOnboardingText() {
  const { language, isRTL } = useLocalization();
  const locale = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    isRTL,
    text: (key: OnboardingCopyKey) => onboardingCopy[locale][key],
    workerState: (state: WorkerState) => onboardingCopy[locale][workerStateKeys[state]],
    certificateStatus: (status: CertificateStatus) =>
      onboardingCopy[locale][certificateStatusKeys[status]],
    captureWarning: (warning: CaptureWarning) =>
      onboardingCopy[locale][captureWarningKeys[warning]],
    // A gate with no sentence returns the generic outstanding-steps line rather
    // than a raw slug, so a gate added later can never leak `national_id_back`
    // onto somebody's screen.
    gate: (gate: string) =>
      onboardingCopy[locale][gateKeys[gate] ?? 'stateOnboardingIncomplete'],
  };
}

export { onboardingCopy };
export type { OnboardingCopyKey };
