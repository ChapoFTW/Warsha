/**
 * WPS-022 privacy contracts and pure rules.
 *
 * This module imports nothing so the regression suite can execute it directly
 * under Node, and so the rules below cannot drift from the ones the server
 * enforces without a test noticing.
 *
 * Two ideas shape every type here.
 *
 *   1. DEACTIVATION AND DELETION ARE DIFFERENT PRODUCTS. They are separate
 *      types with separate verbs, never a boolean on one shared "account
 *      status", because a shared type invites a screen that blurs them.
 *   2. A BLOCKED REQUEST IS A REAL STATE, NOT AN ERROR. Someone who cannot
 *      delete yet is told which of their own commitments is in the way, in a
 *      code that names no other person and carries no evidence.
 */

export type PrivacyLanguage = 'en' | 'ar';

/** A user-facing category of stored information, from the server's registry. */
export type PrivacyCategory = {
  key: string;
  labelEn: string;
  labelAr: string;
  /** Whether this category can appear in the account's own export. */
  exportable: boolean;
};

/**
 * Deletion request states.
 *
 * `blocked` and `legal_hold` are deliberately distinct. Both mean "not yet",
 * but the first is something the account can resolve itself and the second is
 * not, and telling someone to go finish a booking when nothing they do will
 * help would be worse than saying nothing.
 */
export type DeletionStatus =
  | 'cooling_off'
  | 'blocked'
  | 'legal_hold'
  | 'approved'
  | 'processing'
  | 'anonymized'
  | 'completed'
  | 'cancelled'
  | 'failed';

/**
 * Why a deletion cannot proceed.
 *
 * Every code is an opaque slug. None names a person, quotes evidence, or
 * reveals that somebody reported the account — a blocked-deletion screen is an
 * oblique channel, and it must not leak through one.
 */
export type DeletionBlockerCode =
  | 'active_booking'
  | 'open_dispute'
  | 'unsettled_payment'
  | 'outstanding_earnings'
  | 'active_payout'
  | 'open_chargeback'
  | 'active_enforcement'
  | 'open_support_case'
  | 'legal_hold';

export type DeletionRequest = {
  id: string;
  status: DeletionStatus;
  requestedAt: string;
  coolingOffEndsAt: string;
  blockerCodes: DeletionBlockerCode[];
  cancellable: boolean;
};

export type PrivacyOverview = {
  /** False means the surface is off. The screen says so rather than erroring. */
  available: boolean;
  exportAvailable: boolean;
  deletionAvailable: boolean;
  policyVersion: string;
  coolingOffHours: number;
  deactivated: boolean;
  categories: PrivacyCategory[];
  deletionRequest: DeletionRequest | null;
};

export type ConsentPurposeKey =
  | 'terms_of_service'
  | 'privacy_notice'
  | 'service_communication'
  | 'marketing_communication'
  | 'referral_communication'
  | 'diagnostics'
  | 'location_use'
  | 'identity_verification';

export type ConsentEntry = {
  purposeKey: ConsentPurposeKey;
  /** A required purpose is acknowledged, never offered as a choice. */
  required: boolean;
  currentVersion: string;
  titleEn: string;
  titleAr: string;
  explanationEn: string;
  explanationAr: string;
  granted: boolean;
  decidedAt: string | null;
  decidedVersion: string | null;
};

export type ExportStatus = 'requested' | 'manifest_ready' | 'ready' | 'expired' | 'failed' | 'cancelled';

export type ExportSection = {
  key: string;
  format: 'json' | 'csv';
  rows: number;
};

export type ExportManifest = {
  generatedAt: string;
  environment: string;
  subject: string;
  sections: ExportSection[];
  /** What the export deliberately leaves out, stated in the file itself. */
  excluded: string[];
};

export type ExportRequest = {
  id: string;
  status: ExportStatus;
  requestedAt: string;
  expiresAt: string;
  manifest: ExportManifest | null;
  downloadCount: number;
};

export type HistoryScope = 'all' | 'searches' | 'views';

export type PrivacyRepositoryContract = {
  overview: () => Promise<PrivacyOverview>;
  consents: () => Promise<ConsentEntry[]>;
  recordConsent: (purposeKey: ConsentPurposeKey, granted: boolean) => Promise<void>;
  clearHistory: (scope: HistoryScope) => Promise<{ searchesCleared: number; viewsCleared: number }>;
  setDeactivated: (deactivated: boolean) => Promise<boolean>;
  requestDeletion: (reasonCode: string | null) => Promise<DeletionRequest | null>;
  cancelDeletion: () => Promise<boolean>;
  requestExport: () => Promise<ExportRequest | null>;
  exports: () => Promise<ExportRequest[]>;
};

/**
 * Is a deletion request still the account's to cancel?
 *
 * Once execution starts there is nothing left to cancel, and a button that
 * appears to work is worse than no button — so this is computed rather than
 * trusted from a flag the server may have set before execution began.
 */
export function isCancellable(status: DeletionStatus): boolean {
  return status === 'cooling_off' || status === 'blocked' || status === 'legal_hold';
}

/**
 * Does this state still need something from the account?
 *
 * Only `blocked` does. `legal_hold` does not, because nothing the account does
 * will lift it, and implying otherwise sends someone to cancel bookings that
 * were never the problem.
 */
export function needsAction(status: DeletionStatus): boolean {
  return status === 'blocked';
}

/** Whole hours until the cooling-off window closes, floored at zero. */
export function hoursUntil(iso: string, now: number = Date.now()): number {
  const remaining = Date.parse(iso) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.ceil(remaining / 3_600_000);
}

/**
 * An export's effective status.
 *
 * A request whose expiry has passed reads as expired even if its stored status
 * still says ready, because that is what it is. The server applies the same
 * rule when it lists them.
 */
export function effectiveExportStatus(
  request: Pick<ExportRequest, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): ExportStatus {
  const open = request.status === 'requested' || request.status === 'manifest_ready'
    || request.status === 'ready';
  if (open && Date.parse(request.expiresAt) <= now) return 'expired';
  return request.status;
}

/** Total rows across an export manifest, for a one-line summary. */
export function manifestRowTotal(manifest: ExportManifest | null): number {
  if (!manifest) return 0;
  return manifest.sections.reduce((total, section) => total + (section.rows ?? 0), 0);
}

/**
 * Blocker codes an account can resolve by itself, in the order it should.
 *
 * `legal_hold` is absent by design: it is not something anyone can act on, and
 * listing it beside actionable items would imply it is.
 */
export const actionableBlockers: readonly DeletionBlockerCode[] = [
  'active_booking',
  'open_dispute',
  'unsettled_payment',
  'outstanding_earnings',
  'active_payout',
  'open_chargeback',
  'open_support_case',
  'active_enforcement',
];

export function isActionableBlocker(code: DeletionBlockerCode): boolean {
  return actionableBlockers.includes(code);
}

export const emptyOverview: PrivacyOverview = {
  available: false,
  exportAvailable: false,
  deletionAvailable: false,
  policyVersion: '',
  coolingOffHours: 0,
  deactivated: false,
  categories: [],
  deletionRequest: null,
};
