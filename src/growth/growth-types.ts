/**
 * WPS-021 growth contracts and pure rules.
 *
 * Two independent systems live here and never reference each other:
 *
 *   1. REFERRAL PROGRAMS. Staff approve the PROGRAM once, in advance. After
 *      that the server grants rewards AUTOMATICALLY on qualification. A granted
 *      reward is immediately available, expires, and is consumed by exactly one
 *      booking. It is never "pending approval".
 *   2. ADMIN PROMOTIONS. Staff approve a CAMPAIGN once. The server then decides
 *      per user from transparent criteria. Nothing here reads referral state.
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

/**
 * A reward granted automatically on qualification.
 *
 * `available` means usable right now on an eligible booking. There is
 * deliberately no state meaning "waiting for a human": nobody approves an
 * individual referral, so no such state can exist.
 */
export type ReferralRewardStatus = 'available' | 'consumed' | 'expired' | 'revoked';

export type ReferralReward = {
  id: string;
  status: ReferralRewardStatus;
  rewardType: 'fixed' | 'percentage';
  rewardValue: number;
  /** The ceiling, in minor units. A percentage reward can never exceed it. */
  maxRewardMinor: string;
  grantedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  /** Redemption conditions, so the screen can state them rather than imply them. */
  minimumBookingMinor: string;
  categoryKeys: string[];
};

export type ReferralSummary = {
  pending: number;
  qualified: number;
  expired: number;
  /** Referred accounts are counted, never named. */
  rewards: ReferralReward[];
};

/**
 * The single benefit a booking may receive.
 *
 * `source` is the discriminator, and it matters to the customer: a referral
 * reward is something they earned, a campaign is something Warsha offered.
 */
export type BookingBenefit =
  | { eligible: false }
  | {
      eligible: true;
      source: 'referral_reward';
      rewardId: string;
      programKey: string;
      discountMinor: string;
      expiresAt: string;
    }
  | {
      eligible: true;
      source: 'campaign';
      campaignId: string;
      campaignKey: string;
      titleEn: string;
      titleAr: string;
      descriptionEn: string;
      descriptionAr: string;
      discountMinor: string;
      endsAt: string;
    };

export type GrowthLifecycleStatus =
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
  status: GrowthLifecycleStatus;
  audience: GrowthRole;
  environment: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  /** Mandatory ceiling for a percentage campaign; null only for a fixed one. */
  maxDiscountMinor: string | null;
  startsAt: string;
  endsAt: string;
  budgetMinor: string;
  budgetConsumedMinor: string;
  globalRedemptionLimit: number;
  redemptionCount: number;
  /** Transparent eligibility criteria. No score, no inference. */
  minCompletedBookings: number;
  maxCompletedBookings: number | null;
  minAccountAgeDays: number;
  minInactiveDays: number | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
};

export type StaffReferralProgram = {
  id: string;
  programKey: string;
  version: number;
  displayNameEn: string;
  displayNameAr: string;
  status: GrowthLifecycleStatus;
  audience: GrowthRole;
  environment: string;
  qualifyingEvent: 'first_completed_booking' | 'any_completed_booking';
  beneficiary: 'referrer' | 'referred' | 'both';
  rewardType: 'fixed' | 'percentage';
  rewardValue: number;
  maxRewardMinor: string;
  rewardExpiryDays: number;
  startsAt: string;
  endsAt: string;
  budgetMinor: string;
  budgetConsumedMinor: string;
  rewardCount: number;
  perReferrerLimit: number;
  cancellationTreatment: 'restore' | 'consume';
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

/** Upper-cases and trims. Does not repair ambiguous glyphs — see above. */
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

/**
 * The reward's effective status for display.
 *
 * A reward whose expiry has passed but whose row still says `available` reads
 * as expired, because that is what it is. The server applies the same rule.
 */
export function effectiveRewardStatus(
  reward: Pick<ReferralReward, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): ReferralRewardStatus {
  if (reward.status === 'available' && Date.parse(reward.expiresAt) <= now) return 'expired';
  return reward.status;
}

/** Whole days until a reward expires, floored at zero. */
export function daysUntilExpiry(expiresAt: string, now: number = Date.now()): number {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.ceil(remaining / 86_400_000);
}

/**
 * The discount a reward is worth on a booking of this size.
 *
 * Clamped one minor unit below the booking, because WPS-007 requires a customer
 * total of at least one. The server computes the same value; this exists so the
 * client can show an amount without a round trip, never to decide eligibility.
 */
export function rewardDiscountMinor(
  reward: Pick<ReferralReward, 'rewardType' | 'rewardValue' | 'maxRewardMinor'>,
  baseMinor: number,
): number {
  if (!Number.isFinite(baseMinor) || baseMinor < 2) return 0;
  const ceiling = Number(reward.maxRewardMinor);
  const raw =
    reward.rewardType === 'fixed'
      ? reward.rewardValue * 100
      : Math.round((baseMinor * reward.rewardValue) / 100);
  return Math.max(Math.min(raw, ceiling, baseMinor - 1), 0);
}

export const emptyReferralSummary: ReferralSummary = {
  pending: 0,
  qualified: 0,
  expired: 0,
  rewards: [],
};
