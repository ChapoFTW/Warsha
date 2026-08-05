import {
  emptyReferralSummary,
  isReferralCodeShape,
  normalizeReferralCode,
  referralCodeAlphabet,
  referralCodeLength,
  type EligiblePromotion,
  type GrowthRole,
  type ReferralClaimResult,
  type ReferralCodeState,
  type ReferralSummary,
  type RewardEntitlement,
  type StaffCampaign,
  // Explicit extension: this module is executed directly by Node in the
  // regression suite, where extensionless relative resolution does not apply.
} from './growth-types.ts';

/**
 * WPS-021 Mock growth state.
 *
 * Per-account, in-memory, and entirely local: this module imports no Supabase
 * client, constructs no client, and performs no network call. Mock never falls
 * back to Supabase and a Supabase failure never writes here.
 *
 * The one deliberate divergence from the server is code generation. Mock uses a
 * seeded deterministic generator so a test run is reproducible; the server uses
 * `gen_random_bytes` with rejection sampling. The alphabet, the length, and the
 * uniqueness guarantee are identical, so nothing that depends on code *shape*
 * can pass in one mode and fail in the other.
 */

type MockAccount = {
  code: string | null;
  role: GrowthRole;
  createdAt: string;
  status: 'active' | 'revoked';
  attributedTo: string | null;
  referredCount: { pending: number; qualified: number; expired: number };
  rewards: RewardEntitlement[];
  /**
   * Which referred accounts have already qualified. Kept as a separate set
   * rather than encoded into the reward id, because a reward id is returned to
   * the client and must not carry another person's account identifier.
   */
  qualifiedReferred: Set<string>;
  grants: Set<string>;
  redemptions: Map<string, string>;
};

let rewardCounter = 0;

const accounts = new Map<string, MockAccount>();
const codeOwners = new Map<string, string>();

/** Flags default off, exactly as the server seeds them. */
let referralsEnabled = false;
let promotionsEnabled = false;

const mockCampaigns: StaffCampaign[] = [];

let seed = 0x21042100;
function nextSeeded(): number {
  // xorshift32: deterministic, and adequate for a fixture. It is deliberately
  // NOT used for anything security-bearing — the server generates real codes.
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return Math.abs(seed);
}

function generateMockCode(): string {
  let out = '';
  while (out.length < referralCodeLength) {
    out += referralCodeAlphabet[nextSeeded() % referralCodeAlphabet.length];
  }
  return codeOwners.has(out) ? generateMockCode() : out;
}

function account(accountKey: string, role: GrowthRole = 'customer'): MockAccount {
  let existing = accounts.get(accountKey);
  if (!existing) {
    existing = {
      code: null,
      role,
      createdAt: new Date().toISOString(),
      status: 'active',
      attributedTo: null,
      referredCount: { pending: 0, qualified: 0, expired: 0 },
      rewards: [],
      qualifiedReferred: new Set(),
      grants: new Set(),
      redemptions: new Map(),
    };
    accounts.set(accountKey, existing);
  }
  return existing;
}

export function mockSetGrowthFlags(options: { referrals?: boolean; promotions?: boolean }): void {
  if (typeof options.referrals === 'boolean') referralsEnabled = options.referrals;
  if (typeof options.promotions === 'boolean') promotionsEnabled = options.promotions;
}

export function mockResetGrowthState(): void {
  accounts.clear();
  codeOwners.clear();
  mockCampaigns.length = 0;
  referralsEnabled = false;
  promotionsEnabled = false;
  seed = 0x21042100;
  rewardCounter = 0;
}

export function mockReferralCode(accountKey: string, role: GrowthRole): ReferralCodeState {
  if (!referralsEnabled) return { available: false };
  const row = account(accountKey, role);
  if (!row.code) {
    row.code = generateMockCode();
    codeOwners.set(row.code, accountKey);
  }
  return {
    available: true,
    code: row.code,
    status: row.status,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export function mockClaimReferralCode(accountKey: string, input: string): ReferralClaimResult {
  if (!referralsEnabled) return { accepted: false, reason: 'unavailable' };
  const normalized = normalizeReferralCode(input);
  if (!isReferralCodeShape(normalized)) return { accepted: false, reason: 'invalid' };

  const ownerKey = codeOwners.get(normalized);
  const owner = ownerKey ? accounts.get(ownerKey) : undefined;
  // A revoked code and an unknown code answer identically, so this cannot be
  // used as an oracle for which codes exist.
  if (!ownerKey || !owner || owner.status !== 'active') {
    return { accepted: false, reason: 'invalid' };
  }
  if (ownerKey === accountKey) return { accepted: false, reason: 'self' };

  const row = account(accountKey);
  if (row.attributedTo) return { accepted: false, reason: 'already_attributed' };

  row.attributedTo = ownerKey;
  owner.referredCount.pending += 1;
  return { accepted: true, reason: 'accepted' };
}

export function mockReferralSummary(accountKey: string): ReferralSummary {
  const row = accounts.get(accountKey);
  if (!row) return emptyReferralSummary;
  return {
    pending: row.referredCount.pending,
    qualified: row.referredCount.qualified,
    expired: row.referredCount.expired,
    rewards: [...row.rewards].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt)),
  };
}

/**
 * The Mock stand-in for the server's booking-completion trigger. Signing up
 * still earns nothing: only this call, which represents a completed booking,
 * can produce an entitlement, and it is idempotent per referred account.
 */
export function mockQualifyReferral(referredAccountKey: string, campaignKey: string | null): void {
  const referred = accounts.get(referredAccountKey);
  if (!referred?.attributedTo) return;
  const referrer = accounts.get(referred.attributedTo);
  if (!referrer) return;
  // Idempotent: a repeated completion event grants nothing extra.
  if (referrer.qualifiedReferred.has(referredAccountKey)) return;
  referrer.qualifiedReferred.add(referredAccountKey);

  referrer.referredCount.pending = Math.max(referrer.referredCount.pending - 1, 0);
  referrer.referredCount.qualified += 1;
  rewardCounter += 1;
  referrer.rewards.push({
    id: `reward-${rewardCounter}`,
    ruleKey: 'first_job_reward',
    status: 'recorded',
    grantedAt: new Date().toISOString(),
    fulfilledAt: null,
  });
  if (campaignKey) referrer.grants.add(campaignKey);
}

export function mockUpsertCampaign(campaign: StaffCampaign): void {
  const index = mockCampaigns.findIndex((c) => c.id === campaign.id);
  if (index >= 0) mockCampaigns[index] = campaign;
  else mockCampaigns.push(campaign);
}

export function mockStaffCampaigns(): StaffCampaign[] {
  return [...mockCampaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The same twelve-condition gate the server applies, in the same order. Any
 * failure resolves to "no promotion" and discloses no reason, so a client
 * cannot distinguish "no campaign exists" from "you are not eligible".
 */
export function mockEligiblePromotion(
  accountKey: string,
  bookingId: string,
  baseMinor: number,
  role: GrowthRole,
): EligiblePromotion {
  if (!promotionsEnabled) return { eligible: false };
  const row = accounts.get(accountKey);
  if (!row) return { eligible: false };
  if (row.redemptions.has(bookingId)) return { eligible: false };
  if (baseMinor < 1) return { eligible: false };

  const now = Date.now();
  const candidates = mockCampaigns
    .filter((c) => c.status === 'active')
    .filter((c) => c.approvedBy !== null)
    .filter((c) => c.audience === role)
    .filter((c) => Date.parse(c.startsAt) <= now && Date.parse(c.endsAt) > now)
    .filter((c) => c.redemptionCount < c.globalRedemptionLimit)
    .filter((c) => Number(c.budgetConsumedMinor) < Number(c.budgetMinor))
    .filter((c) => row.grants.has(c.campaignKey))
    .filter(
      (c) =>
        [...row.redemptions.values()].filter((key) => key === c.campaignKey).length < 1,
    );

  const scored = candidates
    .map((c) => ({ campaign: c, discount: mockDiscountFor(c, baseMinor) }))
    .filter((entry) => entry.discount >= 1)
    .sort(
      (a, b) =>
        b.discount - a.discount ||
        Date.parse(a.campaign.endsAt) - Date.parse(b.campaign.endsAt) ||
        a.campaign.campaignKey.localeCompare(b.campaign.campaignKey),
    );

  const best = scored[0];
  if (!best) return { eligible: false };
  return {
    eligible: true,
    campaignId: best.campaign.id,
    campaignKey: best.campaign.campaignKey,
    titleEn: best.campaign.displayNameEn,
    titleAr: best.campaign.displayNameAr,
    descriptionEn: best.campaign.displayNameEn,
    descriptionAr: best.campaign.displayNameAr,
    discountMinor: String(best.discount),
    endsAt: best.campaign.endsAt,
  };
}

function mockDiscountFor(campaign: StaffCampaign, baseMinor: number): number {
  const remaining = Number(campaign.budgetMinor) - Number(campaign.budgetConsumedMinor);
  const raw =
    campaign.discountType === 'fixed'
      ? campaign.discountValue * 100
      : Math.round((baseMinor * campaign.discountValue) / 100);
  // Clamped to one minor unit below the booking, because WPS-007 requires a
  // customer total of at least one.
  return Math.min(raw, baseMinor - 1, remaining);
}

export function mockRedeemPromotion(
  accountKey: string,
  bookingId: string,
  campaignKey: string,
  baseMinor: number,
  role: GrowthRole,
): { redeemed: true; discountMinor: string } {
  const offer = mockEligiblePromotion(accountKey, bookingId, baseMinor, role);
  if (!offer.eligible || offer.campaignKey !== campaignKey) {
    throw new Error('This offer is not available');
  }
  const row = account(accountKey);
  // One promotion per booking, matching the server's unique index.
  if (row.redemptions.has(bookingId)) throw new Error('This offer is not available');
  row.redemptions.set(bookingId, campaignKey);

  const campaign = mockCampaigns.find((c) => c.campaignKey === campaignKey);
  if (campaign) {
    campaign.budgetConsumedMinor = String(
      Number(campaign.budgetConsumedMinor) + Number(offer.discountMinor),
    );
    campaign.redemptionCount += 1;
  }
  row.rewards = row.rewards.map((reward) =>
    reward.status === 'recorded'
      ? { ...reward, status: 'fulfilled', fulfilledAt: new Date().toISOString() }
      : reward,
  );
  return { redeemed: true, discountMinor: offer.discountMinor };
}
