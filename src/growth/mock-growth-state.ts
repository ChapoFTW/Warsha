import {
  daysUntilExpiry,
  effectiveRewardStatus,
  emptyReferralSummary,
  isReferralCodeShape,
  normalizeReferralCode,
  referralCodeAlphabet,
  referralCodeLength,
  rewardDiscountMinor,
  type BookingBenefit,
  type GrowthRole,
  type ReferralClaimResult,
  type ReferralCodeState,
  type ReferralReward,
  type ReferralSummary,
  type StaffCampaign,
  type StaffReferralProgram,
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
 * It mirrors the corrected model exactly: staff approve a PROGRAM in advance,
 * and qualification then grants a reward AUTOMATICALLY. There is no code path
 * here in which a granted reward waits for a human.
 *
 * The one deliberate divergence from the server is code generation. Mock uses a
 * seeded deterministic generator so a test run is reproducible; the server uses
 * `gen_random_bytes` with rejection sampling. The alphabet, the length, and the
 * uniqueness guarantee are identical.
 */

type MockAccount = {
  code: string | null;
  role: GrowthRole;
  createdAt: string;
  status: 'active' | 'revoked';
  attributedTo: string | null;
  referredCount: { pending: number; qualified: number; expired: number };
  rewards: ReferralReward[];
  /**
   * Which referred accounts have already qualified. Kept as a separate set
   * rather than encoded into the reward id, because a reward id is returned to
   * the client and must not carry another person's account identifier.
   */
  qualifiedReferred: Set<string>;
  completedBookings: number;
  accountAgeDays: number;
};

type MockRedemption = {
  bookingId: string;
  userKey: string;
  source: 'referral_reward' | 'campaign';
  rewardId?: string;
  campaignKey?: string;
  discountMinor: number;
  status: 'applied' | 'reversed';
};

const accounts = new Map<string, MockAccount>();
const codeOwners = new Map<string, string>();
const mockCampaigns: StaffCampaign[] = [];
const mockPrograms: StaffReferralProgram[] = [];
/** Keyed by bookingId: the unique(booking_id) index, expressed as a Map. */
const redemptions = new Map<string, MockRedemption>();

/** Flags default off, exactly as the server seeds them. */
let referralsEnabled = false;
let promotionsEnabled = false;
let referralsKilled = false;
let promotionsKilled = false;

let seed = 0x21042100;
let rewardCounter = 0;

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
      completedBookings: 0,
      accountAgeDays: 0,
    };
    accounts.set(accountKey, existing);
  }
  return existing;
}

export function mockSetGrowthFlags(options: {
  referrals?: boolean;
  promotions?: boolean;
  referralsKillSwitch?: boolean;
  promotionsKillSwitch?: boolean;
}): void {
  if (typeof options.referrals === 'boolean') referralsEnabled = options.referrals;
  if (typeof options.promotions === 'boolean') promotionsEnabled = options.promotions;
  if (typeof options.referralsKillSwitch === 'boolean') referralsKilled = options.referralsKillSwitch;
  if (typeof options.promotionsKillSwitch === 'boolean') promotionsKilled = options.promotionsKillSwitch;
}

export function mockSetAccountFacts(
  accountKey: string,
  facts: { completedBookings?: number; accountAgeDays?: number },
): void {
  const row = account(accountKey);
  if (typeof facts.completedBookings === 'number') row.completedBookings = facts.completedBookings;
  if (typeof facts.accountAgeDays === 'number') row.accountAgeDays = facts.accountAgeDays;
}

export function mockResetGrowthState(): void {
  accounts.clear();
  codeOwners.clear();
  mockCampaigns.length = 0;
  mockPrograms.length = 0;
  redemptions.clear();
  referralsEnabled = false;
  promotionsEnabled = false;
  referralsKilled = false;
  promotionsKilled = false;
  seed = 0x21042100;
  rewardCounter = 0;
}

function referralsOpen(): boolean {
  return referralsEnabled && !referralsKilled;
}
function promotionsOpen(): boolean {
  return promotionsEnabled && !promotionsKilled;
}

// ---------------------------------------------------------------------------
// Referral codes and attribution
// ---------------------------------------------------------------------------

export function mockReferralCode(accountKey: string, role: GrowthRole): ReferralCodeState {
  if (!referralsOpen()) return { available: false };
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
  if (!referralsOpen()) return { accepted: false, reason: 'unavailable' };
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
    rewards: [...row.rewards]
      .map(reward => ({ ...reward, status: effectiveRewardStatus(reward) }))
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt)),
  };
}

// ---------------------------------------------------------------------------
// Referral programs (staff approve these, once, in advance)
// ---------------------------------------------------------------------------

export function mockUpsertReferralProgram(program: StaffReferralProgram): void {
  const index = mockPrograms.findIndex(p => p.id === program.id);
  if (index >= 0) mockPrograms[index] = program;
  else mockPrograms.push(program);
}

export function mockStaffReferralPrograms(): StaffReferralProgram[] {
  return [...mockPrograms].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function activeProgram(role: GrowthRole): StaffReferralProgram | undefined {
  const now = Date.now();
  return mockPrograms
    .filter(p => p.status === 'active')
    .filter(p => p.approvedBy !== null)
    .filter(p => p.audience === role)
    .filter(p => Date.parse(p.startsAt) <= now && Date.parse(p.endsAt) > now)
    .sort((a, b) => b.version - a.version)[0];
}

// ---------------------------------------------------------------------------
// AUTOMATIC qualification and reward issuance
// ---------------------------------------------------------------------------

/**
 * The Mock stand-in for the server's booking-completion trigger.
 *
 * Signing up still earns nothing: only this call, which represents a completed
 * booking, can produce a reward. It is idempotent per referred account, and it
 * grants automatically — no staff step exists anywhere in this function.
 */
export function mockQualifyReferral(
  referredAccountKey: string,
  options: { completedBookings?: number } = {},
): void {
  const referred = accounts.get(referredAccountKey);
  if (!referred?.attributedTo) return;
  const referrer = accounts.get(referred.attributedTo);
  if (!referrer) return;
  // Idempotent: a repeated completion event grants nothing extra.
  if (referrer.qualifiedReferred.has(referredAccountKey)) return;

  referrer.qualifiedReferred.add(referredAccountKey);
  referrer.referredCount.pending = Math.max(referrer.referredCount.pending - 1, 0);
  referrer.referredCount.qualified += 1;

  const program = activeProgram(referred.role);
  // No active program means no reward. The attribution still qualified: the
  // fact happened, whether or not a program was running.
  if (!program) return;

  const completed = options.completedBookings ?? 1;
  if (program.qualifyingEvent === 'first_completed_booking' && completed !== 1) return;

  const reserve =
    program.rewardType === 'fixed'
      ? Math.min(program.rewardValue * 100, Number(program.maxRewardMinor))
      : Number(program.maxRewardMinor);
  if (reserve < 1) return;

  const beneficiaries: { key: string; row: MockAccount; role: GrowthRole }[] = [];
  if (program.beneficiary === 'referrer' || program.beneficiary === 'both') {
    beneficiaries.push({ key: referred.attributedTo, row: referrer, role: referrer.role });
  }
  if (program.beneficiary === 'referred' || program.beneficiary === 'both') {
    beneficiaries.push({ key: referredAccountKey, row: referred, role: referred.role });
  }

  for (const beneficiary of beneficiaries) {
    const held = beneficiary.row.rewards.filter(r => r.status !== 'revoked').length;
    const limit =
      beneficiary.key === referred.attributedTo ? program.perReferrerLimit : 1;
    if (held >= limit) continue;
    // Budget is bounded by reserving the CEILING at grant time.
    if (Number(program.budgetConsumedMinor) + reserve > Number(program.budgetMinor)) continue;

    rewardCounter += 1;
    beneficiary.row.rewards.push({
      id: `reward-${rewardCounter}`,
      status: 'available',
      rewardType: program.rewardType,
      rewardValue: program.rewardValue,
      maxRewardMinor: program.maxRewardMinor,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + program.rewardExpiryDays * 86_400_000).toISOString(),
      consumedAt: null,
      minimumBookingMinor: '0',
      categoryKeys: [],
    });
    program.budgetConsumedMinor = String(Number(program.budgetConsumedMinor) + reserve);
    program.rewardCount += 1;
  }
}

// ---------------------------------------------------------------------------
// Admin campaigns (independent of referrals)
// ---------------------------------------------------------------------------

export function mockUpsertCampaign(campaign: StaffCampaign): void {
  const index = mockCampaigns.findIndex(c => c.id === campaign.id);
  if (index >= 0) mockCampaigns[index] = campaign;
  else mockCampaigns.push(campaign);
}

export function mockStaffCampaigns(): StaffCampaign[] {
  return [...mockCampaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Benefit evaluation
// ---------------------------------------------------------------------------

function referralBenefit(
  accountKey: string,
  bookingId: string,
  baseMinor: number,
): BookingBenefit {
  if (!referralsOpen()) return { eligible: false };
  const row = accounts.get(accountKey);
  if (!row) return { eligible: false };
  const existing = redemptions.get(bookingId);
  if (existing && existing.status === 'applied') return { eligible: false };
  if (baseMinor < 2) return { eligible: false };

  const now = Date.now();
  // Oldest expiry first, so the reward closest to being lost is used first.
  const candidate = row.rewards
    .filter(r => r.status === 'available')
    .filter(r => Date.parse(r.expiresAt) > now)
    .filter(r => baseMinor >= Number(r.minimumBookingMinor))
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0];
  if (!candidate) return { eligible: false };

  const discount = rewardDiscountMinor(candidate, baseMinor);
  if (discount < 1) return { eligible: false };
  return {
    eligible: true,
    source: 'referral_reward',
    rewardId: candidate.id,
    programKey: 'mock_program',
    discountMinor: String(discount),
    expiresAt: candidate.expiresAt,
  };
}

function campaignBenefit(
  accountKey: string,
  bookingId: string,
  baseMinor: number,
  role: GrowthRole,
): BookingBenefit {
  if (!promotionsOpen()) return { eligible: false };
  const row = accounts.get(accountKey);
  const existing = redemptions.get(bookingId);
  if (existing && existing.status === 'applied') return { eligible: false };
  if (baseMinor < 2) return { eligible: false };

  const completed = row?.completedBookings ?? 0;
  const ageDays = row?.accountAgeDays ?? 0;
  const now = Date.now();

  const scored = mockCampaigns
    .filter(c => c.status === 'active')
    .filter(c => c.approvedBy !== null)
    .filter(c => c.audience === role)
    .filter(c => Date.parse(c.startsAt) <= now && Date.parse(c.endsAt) > now)
    .filter(c => c.redemptionCount < c.globalRedemptionLimit)
    .filter(c => Number(c.budgetConsumedMinor) < Number(c.budgetMinor))
    // Transparent criteria only. No score, no inference.
    .filter(c => completed >= c.minCompletedBookings)
    .filter(c => c.maxCompletedBookings === null || completed <= c.maxCompletedBookings)
    .filter(c => ageDays >= c.minAccountAgeDays)
    .filter(
      c =>
        [...redemptions.values()].filter(
          r => r.campaignKey === c.campaignKey && r.userKey === accountKey && r.status === 'applied',
        ).length < 1,
    )
    .map(c => ({ campaign: c, discount: campaignDiscountFor(c, baseMinor) }))
    .filter(entry => entry.discount >= 1)
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
    source: 'campaign',
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

function campaignDiscountFor(campaign: StaffCampaign, baseMinor: number): number {
  const remaining = Number(campaign.budgetMinor) - Number(campaign.budgetConsumedMinor);
  // A percentage campaign is capped by its mandatory ceiling. Without the cap an
  // expensive booking would silently become an unbounded Warsha expense, which
  // is exactly what the server's growth_campaigns_percentage_check forbids.
  const ceiling =
    campaign.maxDiscountMinor === null ? Number.POSITIVE_INFINITY : Number(campaign.maxDiscountMinor);
  const raw =
    campaign.discountType === 'fixed'
      ? campaign.discountValue * 100
      : Math.min(Math.round((baseMinor * campaign.discountValue) / 100), ceiling);
  // Clamped to one minor unit below the booking, because WPS-007 requires a
  // customer total of at least one.
  return Math.max(Math.min(raw, baseMinor - 1, remaining), 0);
}

/**
 * The single benefit a booking may receive. A referral reward the customer
 * already earned wins ties against a campaign, because it is theirs.
 */
export function mockBookingBenefit(
  accountKey: string,
  bookingId: string,
  baseMinor: number,
  role: GrowthRole,
): BookingBenefit {
  const referral = referralBenefit(accountKey, bookingId, baseMinor);
  const campaign = campaignBenefit(accountKey, bookingId, baseMinor, role);
  if (referral.eligible && campaign.eligible) {
    return Number(campaign.discountMinor) > Number(referral.discountMinor) ? campaign : referral;
  }
  return referral.eligible ? referral : campaign;
}

export function mockRedeemBookingBenefit(
  accountKey: string,
  bookingId: string,
  baseMinor: number,
  role: GrowthRole,
): { redeemed: true; source: 'referral_reward' | 'campaign'; discountMinor: string } {
  const benefit = mockBookingBenefit(accountKey, bookingId, baseMinor, role);
  if (!benefit.eligible) throw new Error('This offer is not available');
  // One benefit per booking, matching the server's unique index.
  const existing = redemptions.get(bookingId);
  if (existing && existing.status === 'applied') throw new Error('This offer is not available');

  const discount = Number(benefit.discountMinor);
  if (benefit.source === 'referral_reward') {
    const row = account(accountKey);
    const reward = row.rewards.find(r => r.id === benefit.rewardId);
    if (!reward || reward.status !== 'available') throw new Error('This offer is not available');
    reward.status = 'consumed';
    reward.consumedAt = new Date().toISOString();
    redemptions.set(bookingId, {
      bookingId,
      userKey: accountKey,
      source: 'referral_reward',
      rewardId: reward.id,
      discountMinor: discount,
      status: 'applied',
    });
  } else {
    const campaign = mockCampaigns.find(c => c.campaignKey === benefit.campaignKey);
    if (campaign) {
      campaign.budgetConsumedMinor = String(Number(campaign.budgetConsumedMinor) + discount);
      campaign.redemptionCount += 1;
    }
    redemptions.set(bookingId, {
      bookingId,
      userKey: accountKey,
      source: 'campaign',
      campaignKey: benefit.campaignKey,
      discountMinor: discount,
      status: 'applied',
    });
  }
  return { redeemed: true, source: benefit.source, discountMinor: String(discount) };
}

/** Mirrors the server trigger: cancelling releases budget and restores the reward. */
export function mockCancelBooking(bookingId: string): void {
  const row = redemptions.get(bookingId);
  if (!row || row.status !== 'applied') return;
  row.status = 'reversed';

  if (row.source === 'campaign') {
    const campaign = mockCampaigns.find(c => c.campaignKey === row.campaignKey);
    if (campaign) {
      campaign.budgetConsumedMinor = String(
        Math.max(Number(campaign.budgetConsumedMinor) - row.discountMinor, 0),
      );
      campaign.redemptionCount = Math.max(campaign.redemptionCount - 1, 0);
    }
    return;
  }
  const owner = accounts.get(row.userKey);
  const reward = owner?.rewards.find(r => r.id === row.rewardId);
  if (reward && Date.parse(reward.expiresAt) > Date.now()) {
    reward.status = 'available';
    reward.consumedAt = null;
  }
}

/** Mirrors private.expire_referral_rewards. */
export function mockExpireRewards(): number {
  let count = 0;
  const now = Date.now();
  for (const row of accounts.values()) {
    for (const reward of row.rewards) {
      if (reward.status === 'available' && Date.parse(reward.expiresAt) <= now) {
        reward.status = 'expired';
        count += 1;
      }
    }
  }
  return count;
}

export { daysUntilExpiry };
