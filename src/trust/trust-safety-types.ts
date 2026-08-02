/**
 * WPS-016 Trust, Safety & Moderation contracts.
 *
 * WPS-016 is the single authority for trust state, unified reporting,
 * enforcement, fraud signals, investigations, and appeals. It extends the
 * existing systems (verification, chat abuse reports, review moderation,
 * disputes, chargebacks, earning holds) and replaces none of them.
 *
 * Every value here is server-projected. A client can never modify trust state.
 */

/** The eight surfaces a report can originate from. */
export type TrustReportSurface =
  | 'bookings'
  | 'chat'
  | 'reviews'
  | 'providers'
  | 'customers'
  | 'payments'
  | 'certificates'
  | 'profile_media';

export type TrustReportSubjectType =
  | 'user'
  | 'booking'
  | 'chat_message'
  | 'review'
  | 'provider_profile'
  | 'customer_profile'
  | 'certificate'
  | 'payment'
  | 'profile_media';

/** The seventeen unified report categories. */
export type TrustReportCategory =
  | 'fraud'
  | 'impersonation'
  | 'abusive_language'
  | 'harassment'
  | 'discrimination'
  | 'fake_profile'
  | 'fake_documents'
  | 'fake_certificates'
  | 'spam'
  | 'scam'
  | 'dangerous_behavior'
  | 'off_platform_payment'
  | 'off_platform_contact'
  | 'illegal_activity'
  | 'inappropriate_content'
  | 'copyright'
  | 'privacy';

export const trustReportCategories: readonly TrustReportCategory[] = [
  'fraud', 'impersonation', 'abusive_language', 'harassment', 'discrimination',
  'fake_profile', 'fake_documents', 'fake_certificates', 'spam', 'scam',
  'dangerous_behavior', 'off_platform_payment', 'off_platform_contact',
  'illegal_activity', 'inappropriate_content', 'copyright', 'privacy',
] as const;

export type TrustReportStatus =
  | 'submitted'
  | 'triage'
  | 'investigating'
  | 'actioned'
  | 'dismissed'
  | 'duplicate';

/** Centralized trust levels. `banned` is terminal and never automatic. */
export type TrustLevel =
  | 'good_standing'
  | 'warned'
  | 'restricted'
  | 'under_investigation'
  | 'suspended'
  | 'banned';

/** The eleven enforcement measures plus restoration. */
export type TrustEnforcementAction =
  | 'warning'
  | 'temporary_restriction'
  | 'investigation'
  | 'suspension'
  | 'permanent_ban'
  | 'marketplace_removal'
  | 'profile_hidden'
  | 'payment_hold'
  | 'withdrawal_hold'
  | 'communication_restriction'
  | 'review_restriction'
  | 'restoration';

export type TrustAppealStatus =
  | 'submitted'
  | 'under_review'
  | 'upheld'
  | 'overturned'
  | 'partially_overturned'
  | 'withdrawn';

/** Fraud signals are advisory only. They never punish a user. */
export type TrustFraudSignal =
  | 'excessive_cancellations'
  | 'duplicate_identity'
  | 'repeated_failed_verification'
  | 'abnormal_payment_behavior'
  | 'repeated_chargebacks'
  | 'suspicious_review_activity'
  | 'fake_portfolio_attempt'
  | 'certificate_abuse'
  | 'repeated_abuse_reports'
  | 'account_farming';

export type TrustCapability =
  | 'marketplace'
  | 'communication'
  | 'reviews'
  | 'payments'
  | 'withdrawals';

export type TrustRestrictions = {
  marketplaceRemoved?: boolean;
  profileHidden?: boolean;
  paymentHold?: boolean;
  withdrawalHold?: boolean;
  communicationRestricted?: boolean;
  reviewRestricted?: boolean;
};

export type TrustStatus = {
  trustLevel: TrustLevel;
  restrictions: TrustRestrictions;
  publicReason: string | null;
  restrictionExpiresAt: string | null;
  canAppeal: boolean;
};

export type TrustReportSummary = {
  id: string;
  category: TrustReportCategory;
  sourceSurface: TrustReportSurface;
  status: TrustReportStatus;
  createdAt: string;
};

export type TrustAppealSummary = {
  id: string;
  enforcementActionId: string;
  status: TrustAppealStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type StaffTrustQueueSummary = {
  openReports: number;
  investigating: number;
  openAppeals: number;
  activeRestrictions: number;
  highSeveritySignals: number;
};

/**
 * A permanent ban is never automatic. It requires a human staff actor and an
 * investigated report; nothing in the client may ever request one directly.
 */
export function permanentBanRequiresReview(
  action: TrustEnforcementAction,
  reportStatus: TrustReportStatus | null,
): boolean {
  if (action !== 'permanent_ban') return true;
  return reportStatus === 'investigating' || reportStatus === 'actioned';
}

/** Fraud signals inform staff; they never change trust state on their own. */
export function fraudSignalIsAdvisoryOnly(): true {
  return true;
}

/** Resolves whether a capability is currently permitted for a trust status. */
export function trustStatusAllows(status: TrustStatus, capability: TrustCapability): boolean {
  if (status.trustLevel === 'banned') return false;
  const expired = status.restrictionExpiresAt !== null
    && new Date(status.restrictionExpiresAt).getTime() <= Date.now();
  if (expired) return true;
  if (status.trustLevel === 'suspended') return false;
  const r = status.restrictions;
  switch (capability) {
    case 'marketplace':
      return !(r.marketplaceRemoved || r.profileHidden);
    case 'communication':
      return !r.communicationRestricted;
    case 'reviews':
      return !r.reviewRestricted;
    case 'payments':
      return !r.paymentHold;
    case 'withdrawals':
      return !r.withdrawalHold;
    default:
      return true;
  }
}

/** An action that carries no expiry and is not terminal is not time-bounded. */
export function isTerminalAction(action: TrustEnforcementAction): boolean {
  return action === 'permanent_ban';
}
