/**
 * WPS-021 growth contracts and pure rules.
 *
 * This module imports nothing so it can be executed directly by Node in the
 * regression suite, and so the rules below cannot drift from the ones the
 * server enforces without a test noticing.
 */

export type GrowthRole = 'customer' | 'worker';

export type ReferralCodeState =
  | { available: false }
  | {
      available: true;
      code: string;
      status: 'active' | 'revoked';
      role: GrowthRole;
      createdAt: string;
    };

export type ReferralClaimReason =
  | 'accepted'
  | 'invalid'
  | 'self'
  | 'already_attributed'
  | 'unavailable';

export type ReferralClaimResult = { accepted: boolean; reason: ReferralClaimReason };

export type RewardEntitlement = {
  id: string;
  ruleKey: string;
  /**
   * `recorded` means earned and not yet honoured. It is deliberately not called
   * `pending payout` — an entitlement is not money and never becomes a balance.
   */
  status: 'recorded' | 'fulfilled' | 'void';
  grantedAt: string;
  fulfilledAt: string | null;
};

export type ReferralSummary = {
  pending: number;
  qualified: number;
  expired: number;
  /** Referred accounts are counted, never named. */
  rewards: RewardEntitlement[];
};

export type EligiblePromotion =
  | { eligible: false }
  | {
      eligible: true;
      campaignId: string;
      campaignKey: string;
      titleEn: string;
      titleAr: string;
      descriptionEn: string;
      descriptionAr: string;
      /** Minor units, as a string, matching the WPS-007 money convention. */
      discountMinor: string;
      endsAt: string;
    };

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'expired'
  | 'cancelled';

export type StaffCampaign = {
  id: string;
  campaignKey: string;
  version: number;
  displayNameEn: string;
  displayNameAr: string;
  status: CampaignStatus;
  audience: GrowthRole;
  environment: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startsAt: string;
  endsAt: string;
  budgetMinor: string;
  budgetConsumedMinor: string;
  globalRedemptionLimit: number;
  redemptionCount: number;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
};

/**
 * 31 symbols, excluding 0 O 1 I L. A referral code is read aloud across a room
 * and typed by somebody who did not hear it clearly, so the ambiguous glyphs
 * are not in the alphabet at all rather than being corrected afterwards.
 */
export const referralCodeAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const referralCodeLength = 10;

const referralCodePattern = /^[2-9A-HJKMNP-Z]{10}$/;

/** Upper-cases and trims. Does not repair ambiguous glyphs — see below. */
export function normalizeReferralCode(input: string): string {
  return (input ?? '').trim().toUpperCase();
}

export function isReferralCodeShape(input: string): boolean {
  return referralCodePattern.test(normalizeReferralCode(input));
}

/**
 * Splits a code for display only. The value that is copied, shared, and sent to
 * the server is always the unformatted code.
 */
export function formatReferralCodeForDisplay(code: string): string {
  const normalized = normalizeReferralCode(code);
  if (!referralCodePattern.test(normalized)) return normalized;
  return `${normalized.slice(0, 5)} ${normalized.slice(5)}`;
}

/**
 * Reads a code out one character at a time for a screen reader. "K5" is
 * otherwise announced as a word, and a code announced as a word cannot be
 * written down.
 */
export function referralCodeAccessibilityLabel(code: string): string {
  return normalizeReferralCode(code).split('').join(' ');
}

export function referralShareUrl(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/join?ref=${normalizeReferralCode(code)}`;
}

/** Minor units to a display string. Kept here so Mock and UI agree exactly. */
export function formatMinorAsEgp(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) return '0';
  return (value / 100).toFixed(2).replace(/\.00$/, '');
}

export const emptyReferralSummary: ReferralSummary = {
  pending: 0,
  qualified: 0,
  expired: 0,
  rewards: [],
};
