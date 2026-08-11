/**
 * WPS-021 — Growth, Referrals, Promotions & Customer Acquisition.
 *
 * Contract checks over the growth client, the Mock parity layer, the migration,
 * and every surface. Database behaviour is asserted by
 * `supabase/tests/database/growth-referrals-promotions.test.sql`; this file
 * asserts what the client guarantees, what the locked scope says must NOT exist
 * anywhere, and — after the correction — that nothing implies a human approves
 * an individual referral.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { growthCopy } from '../src/growth/growth-copy.ts';
import {
  daysUntilExpiry,
  effectiveRewardStatus,
  emptyReferralSummary,
  formatMinorAsEgp,
  formatReferralCodeForDisplay,
  isReferralCodeShape,
  normalizeReferralCode,
  referralCodeAccessibilityLabel,
  referralCodeAlphabet,
  referralCodeLength,
  referralShareUrl,
  rewardDiscountMinor,
  type StaffCampaign,
  type StaffReferralProgram,
} from '../src/growth/growth-types.ts';
import {
  mockBookingBenefit,
  mockCancelBooking,
  mockClaimReferralCode,
  mockExpireRewards,
  mockQualifyReferral,
  mockRedeemBookingBenefit,
  mockReferralCode,
  mockReferralSummary,
  mockResetGrowthState,
  mockSetAccountFacts,
  mockSetGrowthFlags,
  mockStaffCampaigns,
  mockStaffReferralPrograms,
  mockUpsertCampaign,
  mockUpsertReferralProgram,
} from '../src/growth/mock-growth-state.ts';

let checks = 0;
function check(condition: boolean, label: string) {
  checks += 1;
  assert.ok(condition, label);
}
function is<T>(actual: T, expected: T, label: string) {
  checks += 1;
  assert.equal(actual, expected, label);
}
function has(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.match(haystack, pattern, label);
}
function lacks(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.doesNotMatch(haystack, pattern, label);
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/**
 * Source with comments removed. Every "this must NOT appear" assertion runs
 * against this, so a comment explaining why something is absent cannot fail the
 * check that it is absent.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sqlCodeOf = (source: string) => source.replace(/^\s*--.*$/gm, '');
/** Prose wraps, so doc assertions tolerate a newline wherever a space appears. */
const flow = (text: string) => text.replace(/\s+/g, ' ');

const migration = read('supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql');
const migrationCode = sqlCodeOf(migration);
const typesSource = read('src/growth/growth-types.ts');
const mockSource = read('src/growth/mock-growth-state.ts');
const mockCode = codeOf(mockSource);
const repositorySource = read('src/growth/growth-repository.ts');
const contextSource = read('src/growth/growth-context.tsx');
const referralsScreen = read('app/referrals.tsx');
const bannerSource = read('components/warsha/EligiblePromotionBanner.tsx');
const wps = read('docs/wps/WPS-021-growth-referrals-promotions.md');
const wes = read('docs/wes/WES-021-growth-referrals-promotions.md');

// ---------------------------------------------------------------------------
// Code shape
// ---------------------------------------------------------------------------
is(referralCodeLength, 10, 'a referral code is ten characters');
is(referralCodeAlphabet.length, 31, 'the alphabet holds 31 symbols');
for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
  check(
    !referralCodeAlphabet.includes(ambiguous),
    `the alphabet excludes ${ambiguous}, which is misread when a code is spoken`,
  );
}
check(
  new Set(referralCodeAlphabet).size === referralCodeAlphabet.length,
  'no symbol appears twice in the alphabet',
);
check(isReferralCodeShape('ABCDEFGHJK'), 'a well-formed code is accepted');
check(!isReferralCodeShape('ABCDEFGHI0'), 'a code containing an excluded glyph is rejected');
check(!isReferralCodeShape('SHORT'), 'a short code is rejected');
check(!isReferralCodeShape('ABCDEFGHJKL'), 'an over-long code is rejected');
is(normalizeReferralCode('  abcdefghjk '), 'ABCDEFGHJK', 'input is trimmed and upper-cased');
is(formatReferralCodeForDisplay('ABCDEFGHJK'), 'ABCDE FGHJK', 'display splits the code');
is(
  referralCodeAccessibilityLabel('ABCDEFGHJK'),
  'A B C D E F G H J K',
  'a screen reader spells the code out rather than pronouncing it as a word',
);
is(
  referralShareUrl('https://warsha.app/', 'ABCDEFGHJK'),
  'https://warsha.app/join?ref=ABCDEFGHJK',
  'the share link carries the code',
);
has(migration, /referral_codes_code_check check \(code ~ '\^\[2-9A-HJKMNP-Z\]\{10\}\$'\)/,
  'the database constrains the code to the same alphabet the client validates');

// ---------------------------------------------------------------------------
// Pure reward rules
// ---------------------------------------------------------------------------
is(formatMinorAsEgp('5000'), '50', 'minor units render as EGP');
is(formatMinorAsEgp('5050'), '50.50', 'piastres are preserved');
is(formatMinorAsEgp('not a number'), '0', 'a malformed amount renders as zero, never as NaN');

const fixedReward = { rewardType: 'fixed' as const, rewardValue: 50, maxRewardMinor: '5000' };
is(rewardDiscountMinor(fixedReward, 100000), 5000, 'a fixed 50 EGP reward is 5000 minor units');
is(
  rewardDiscountMinor(fixedReward, 3000),
  2999,
  'a reward larger than the booking is clamped one minor unit below it, so WPS-007 always has something to charge',
);
const pctReward = { rewardType: 'percentage' as const, rewardValue: 10, maxRewardMinor: '5000' };
is(rewardDiscountMinor(pctReward, 100000), 5000, 'a percentage reward is capped by its ceiling');
is(rewardDiscountMinor(pctReward, 20000), 2000, 'and is proportional below the cap');
is(rewardDiscountMinor(pctReward, 1), 0, 'a booking too small to discount yields nothing');

const live = new Date(Date.now() + 5 * 86_400_000).toISOString();
const dead = new Date(Date.now() - 86_400_000).toISOString();
is(
  effectiveRewardStatus({ status: 'available', expiresAt: dead }),
  'expired',
  'an available reward past its expiry reads as expired',
);
is(
  effectiveRewardStatus({ status: 'available', expiresAt: live }),
  'available',
  'a live reward reads as available',
);
is(daysUntilExpiry(dead), 0, 'an expired reward has zero days left');
check(daysUntilExpiry(live) >= 4 && daysUntilExpiry(live) <= 5, 'days remaining is computed');

// ---------------------------------------------------------------------------
// Fail closed
// ---------------------------------------------------------------------------
mockResetGrowthState();
is(mockReferralCode('a', 'customer').available, false, 'referrals are off by default');
is(
  mockClaimReferralCode('a', 'ABCDEFGHJK').reason,
  'unavailable',
  'claiming is refused while referrals are off',
);
is(
  mockBookingBenefit('a', 'booking-1', 100000, 'customer').eligible,
  false,
  'no benefit exists by default',
);
has(migration, /'growth_referrals','local',false,'none'/, 'the referral flag ships disabled');
has(migration, /'growth_promotions','local',false,'none'/, 'the promotion flag ships disabled');
has(migrationCode, /if v_row\.flag_key is null or not v_row\.enabled then return false/,
  'an ABSENT flag resolves to off rather than on');

// ---------------------------------------------------------------------------
// Referral codes and claiming
// ---------------------------------------------------------------------------
mockSetGrowthFlags({ referrals: true });
const first = mockReferralCode('account-a', 'customer');
check(first.available, 'a code is issued once referrals are enabled');
const codeA = first.available ? first.code : '';
check(isReferralCodeShape(codeA), 'the Mock code matches the shared shape rule');
const reissued = mockReferralCode('account-a', 'customer');
is(reissued.available ? reissued.code : null, codeA, 'an account holds one code for its lifetime');
const second = mockReferralCode('account-b', 'customer');
check((second.available ? second.code : '') !== codeA, 'two accounts receive different codes');

is(mockClaimReferralCode('account-a', codeA).reason, 'self', 'SELF-REFERRAL FAILS');
is(mockClaimReferralCode('account-b', 'ZZZZZZZZZZ').reason, 'invalid', 'an unknown code is rejected');
is(mockClaimReferralCode('account-b', 'nope').reason, 'invalid', 'a malformed code is rejected');
is(mockClaimReferralCode('account-b', codeA).accepted, true, 'a valid code is claimed');
is(
  mockClaimReferralCode('account-b', codeA).reason,
  'already_attributed',
  'an account is attributed only once, ever',
);
is(mockReferralSummary('account-a').pending, 1, 'the referrer sees one pending invite');

// ---------------------------------------------------------------------------
// No reward for signup; no reward without an approved programme
// ---------------------------------------------------------------------------
is(mockReferralSummary('account-a').rewards.length, 0, 'NO REWARD EXISTS FOR A SIGNUP ALONE');
mockQualifyReferral('account-b');
is(
  mockReferralSummary('account-a').rewards.length,
  0,
  'AN INACTIVE REFERRAL PROGRAMME GRANTS NOTHING',
);
is(
  mockReferralSummary('account-a').qualified,
  1,
  'the referral still qualified: the fact happened whether or not a programme was running',
);

// An approved programme, drafted and activated by staff in advance.
const program: StaffReferralProgram = {
  id: 'program-1',
  programKey: 'launch_referral',
  version: 1,
  displayNameEn: 'Invite a friend',
  displayNameAr: 'ادعُ صاحبك',
  status: 'active',
  audience: 'customer',
  environment: 'local',
  qualifyingEvent: 'first_completed_booking',
  beneficiary: 'referrer',
  rewardType: 'fixed',
  rewardValue: 50,
  maxRewardMinor: '5000',
  rewardExpiryDays: 90,
  startsAt: new Date(Date.now() - 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  budgetMinor: '1000000',
  budgetConsumedMinor: '0',
  rewardCount: 0,
  perReferrerLimit: 10,
  cancellationTreatment: 'restore',
  createdBy: 'staff-a',
  approvedBy: 'staff-b',
  createdAt: new Date().toISOString(),
};
mockUpsertReferralProgram(program);

// ---------------------------------------------------------------------------
// AUTOMATIC qualification and issuance
// ---------------------------------------------------------------------------
const codeC = mockReferralCode('account-c', 'customer');
is(mockClaimReferralCode('account-c', codeA).accepted, true, 'a third account is attributed');
is(
  mockReferralSummary('account-a').rewards.length,
  0,
  'attribution alone earns nothing even with a live programme',
);

mockQualifyReferral('account-c');
is(
  mockReferralSummary('account-a').rewards.length,
  1,
  'QUALIFICATION AUTOMATICALLY GRANTS THE REWARD — no staff step of any kind',
);
is(
  mockReferralSummary('account-a').rewards[0].status,
  'available',
  'THE REWARD IS IMMEDIATELY AVAILABLE, not pending anyone approval',
);
is(
  mockStaffReferralPrograms()[0].budgetConsumedMinor,
  '5000',
  'the programme budget reserved the reward ceiling at grant time',
);
is(mockStaffReferralPrograms()[0].rewardCount, 1, 'the programme counted the reward');
check(
  Date.parse(mockReferralSummary('account-a').rewards[0].expiresAt) > Date.now(),
  'the reward carries a live expiry',
);

// Idempotency.
mockQualifyReferral('account-c');
mockQualifyReferral('account-c');
is(
  mockReferralSummary('account-a').rewards.length,
  1,
  'DUPLICATE QUALIFICATION IS IDEMPOTENT: no duplicate reward',
);
is(
  mockStaffReferralPrograms()[0].budgetConsumedMinor,
  '5000',
  'and no duplicate budget reservation',
);

// Privacy: referred accounts are counted, never named.
const summaryJson = JSON.stringify(mockReferralSummary('account-a'));
lacks(summaryJson, /account-b|account-c/, 'the summary discloses no referred account identifier');
is(emptyReferralSummary.rewards.length, 0, 'the empty summary carries no reward');

// ---------------------------------------------------------------------------
// AUTOMATIC redemption
// ---------------------------------------------------------------------------
const benefit = mockBookingBenefit('account-a', 'booking-1', 100000, 'customer');
check(benefit.eligible, 'THE REWARD AUTOMATICALLY BECOMES USABLE ON AN ELIGIBLE BOOKING');
is(benefit.eligible ? benefit.source : null, 'referral_reward', 'the benefit is the referral reward');
is(benefit.eligible ? benefit.discountMinor : null, '5000', 'worth the fixed 50 EGP');

is(
  mockBookingBenefit('account-b', 'booking-9', 100000, 'customer').eligible,
  false,
  'an account holding no reward has no benefit',
);

const redeemed = mockRedeemBookingBenefit('account-a', 'booking-1', 100000, 'customer');
is(redeemed.redeemed, true, 'the reward is redeemed');
is(redeemed.source, 'referral_reward', 'the redemption records its source');
is(
  mockReferralSummary('account-a').rewards[0].status,
  'consumed',
  'THE REWARD IS CONSUMED EXACTLY ONCE',
);
assert.throws(
  () => mockRedeemBookingBenefit('account-a', 'booking-1', 100000, 'customer'),
  /not available/,
  'a second redemption on the same booking throws',
);
checks += 1;
is(
  mockBookingBenefit('account-a', 'booking-1', 100000, 'customer').eligible,
  false,
  'a booking that already carries a benefit is no longer eligible',
);

// Cancellation restores the reward.
mockCancelBooking('booking-1');
is(
  mockReferralSummary('account-a').rewards[0].status,
  'available',
  'the default cancellation treatment RESTORES the reward to the customer',
);

// Expiry.
is(mockExpireRewards(), 0, 'nothing expires while the reward is live');

// ---------------------------------------------------------------------------
// Admin campaigns are INDEPENDENT of referrals
// ---------------------------------------------------------------------------
const campaign: StaffCampaign = {
  id: 'campaign-1',
  campaignKey: 'welcome_back',
  version: 1,
  displayNameEn: 'Welcome back',
  displayNameAr: 'نورت تاني',
  status: 'active',
  audience: 'customer',
  environment: 'local',
  discountType: 'percentage',
  discountValue: 10,
  maxDiscountMinor: '5000',
  startsAt: new Date(Date.now() - 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  budgetMinor: '1000000',
  budgetConsumedMinor: '0',
  globalRedemptionLimit: 100,
  redemptionCount: 0,
  minCompletedBookings: 1,
  maxCompletedBookings: null,
  minAccountAgeDays: 0,
  minInactiveDays: null,
  createdBy: 'staff-a',
  approvedBy: 'staff-b',
  createdAt: new Date().toISOString(),
};
mockUpsertCampaign(campaign);
mockSetGrowthFlags({ promotions: true });

// account-d has never referred anybody and holds no reward.
mockSetAccountFacts('account-d', { completedBookings: 1, accountAgeDays: 30 });
is(
  mockReferralSummary('account-d').rewards.length,
  0,
  'the campaign candidate holds no referral reward',
);
const campaignBenefit = mockBookingBenefit('account-d', 'booking-2', 100000, 'customer');
check(campaignBenefit.eligible, 'ADMIN PROMOTIONS WORK INDEPENDENTLY OF REFERRAL STATE');
is(campaignBenefit.eligible ? campaignBenefit.source : null, 'campaign', 'the source is a campaign');
is(campaignBenefit.eligible ? campaignBenefit.discountMinor : null, '5000', 'capped at the ceiling');

// Transparent criteria are actually enforced.
mockSetAccountFacts('account-e', { completedBookings: 0, accountAgeDays: 30 });
is(
  mockBookingBenefit('account-e', 'booking-3', 100000, 'customer').eligible,
  false,
  'an account below the completed-booking criterion is not eligible',
);

// The referral kill switch does not close campaigns.
mockSetGrowthFlags({ referralsKillSwitch: true });
is(
  mockBookingBenefit('account-d', 'booking-2', 100000, 'customer').eligible,
  true,
  'THE REFERRAL KILL SWITCH DOES NOT AFFECT ADMIN PROMOTIONS',
);
mockSetGrowthFlags({ referralsKillSwitch: false, promotionsKillSwitch: true });
is(
  mockBookingBenefit('account-d', 'booking-2', 100000, 'customer').eligible,
  false,
  'the promotion kill switch closes campaigns immediately',
);
mockSetGrowthFlags({ promotionsKillSwitch: false });

is(
  mockRedeemBookingBenefit('account-d', 'booking-2', 100000, 'customer').source,
  'campaign',
  'the campaign benefit is redeemed',
);
is(mockStaffCampaigns()[0].redemptionCount, 1, 'the campaign counter advanced once');

mockResetGrowthState();

// ---------------------------------------------------------------------------
// The locked scope, asserted as absences
// ---------------------------------------------------------------------------
const customerSurfaces = [referralsScreen, bannerSource].map(codeOf).join('\n');
lacks(customerSurfaces, /promo[ -]?code/i, 'no customer surface mentions a promo code');
lacks(customerSurfaces, /\bwallet\b/i, 'no customer surface mentions a wallet');
lacks(customerSurfaces, /\bbalance\b/i, 'no customer surface shows a balance');
lacks(customerSurfaces, /\bcredits?\b/i, 'no customer surface offers credits');
lacks(customerSurfaces, /countdown|flash sale|streak|mystery|spin|scratch/i,
  'no gambling-style or urgency mechanic exists on any customer surface');
lacks(codeOf(repositorySource), /browseCampaigns|listPublicCampaigns/,
  'the client has no way to browse campaigns');

// THE CORRECTION, asserted directly: no customer-facing string suggests a human
// is reviewing a reward, or that it waits on a campaign.
const customerCopy = JSON.stringify(growthCopy);
lacks(customerCopy, /pending admin|awaiting approval|pending approval/i,
  'NO COPY SAYS A REWARD IS PENDING ADMIN APPROVAL');
lacks(customerCopy, /waiting for a campaign|future admin|admin-funded/i,
  'NO COPY SAYS A REWARD WAITS FOR A CAMPAIGN');
lacks(codeOf(referralsScreen), /entitlement/i,
  'the referral screen does not describe a reward as an inert entitlement');
has(growthCopy.en.howItWorksThree, /automatically/i,
  'the customer is told the reward arrives automatically');
has(growthCopy.en.automaticNotice, /automatic/i,
  'and that nobody has to approve it');

// No second financial system anywhere in the growth module.
const growthClient = [typesSource, mockSource, repositorySource, contextSource].map(codeOf).join('\n');
lacks(growthClient, /ledger/i, 'the growth client references no ledger');
lacks(growthClient, /\bpayout\b/i, 'the growth client references no payout');
lacks(growthClient, /balance_egp|walletBalance/i, 'the growth client holds no balance');

// ---------------------------------------------------------------------------
// Mock isolation
// ---------------------------------------------------------------------------
lacks(mockCode, /supabase/i, 'Mock imports no Supabase module');
lacks(mockCode, /getSupabaseClient|createClient/, 'Mock constructs no client');
lacks(mockCode, /fetch\(|axios|XMLHttpRequest/, 'Mock performs no network call');
has(repositorySource, /environment\.dataMode === 'mock'/, 'the repository branches on the data mode');
const mockBranches = (repositorySource.match(/environment\.dataMode === 'mock'/g) ?? []).length;
const rpcCalls = (repositorySource.match(/\.rpc\(/g) ?? []).length;
check(mockBranches >= rpcCalls, 'every Supabase path has a Mock branch in front of it');
lacks(codeOf(repositorySource), /catch[\s\S]{0,120}mock/i,
  'a Supabase failure never falls back into Mock');
// The client cannot grant itself a reward.
lacks(codeOf(repositorySource), /grantReward|issueReward|approveReferral/,
  'THE CLIENT HAS NO PATH THAT GRANTS OR APPROVES A REWARD');

// ---------------------------------------------------------------------------
// Account isolation
// ---------------------------------------------------------------------------
has(contextSource, /generation\.current/, 'the context carries a generation guard');
has(contextSource, /accountRef\.current !== key/, 'a late response for a stale account is discarded');
has(contextSource, /loadedAccount === accountKey/,
  'nothing renders for an account other than the loaded one');

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------
const enKeys = Object.keys(growthCopy.en).sort();
const arKeys = Object.keys(growthCopy.ar).sort();
assert.deepEqual(enKeys, arKeys, 'every growth string exists in both languages');
checks += 1;
check(enKeys.length >= 50, 'the growth copy covers the full surface');
for (const key of enKeys) {
  const value = growthCopy.ar[key as keyof typeof growthCopy.ar];
  check(
    typeof value === 'string' && value.trim().length > 0,
    `the Arabic string for ${key} is present`,
  );
  check(
    /[؀-ۿ]/.test(value) || /^[0-9\s]+$/.test(value),
    `the Arabic string for ${key} is actually Arabic, not an untranslated copy`,
  );
}
has(referralsScreen, /isRTL/, 'the referral screen honours RTL');
has(bannerSource, /isRTL/, 'the benefit banner honours RTL');

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------
has(referralsScreen, /accessibilityLabel=\{referralCodeAccessibilityLabel\(code\)\}/,
  'the code is announced character by character');
has(referralsScreen, /selectable/, 'the code is selectable text, not an image');
has(referralsScreen, /accessibilityLiveRegion="polite"/, 'the claim result is announced');
has(bannerSource, /accessibilityLiveRegion="polite"/, 'the benefit announces itself');
has(bannerSource, /accessibilityState=\{\{ disabled: busy \}\}/,
  'the apply control reports its disabled state');
check(
  (referralsScreen.match(/minHeight: 44/g) ?? []).length >= 3,
  'touch targets meet the 44pt minimum',
);
// State is never carried by colour alone: each state ships an icon and a word.
has(bannerSource, /name="check-circle-outline"/, 'the applied state has an icon');
has(bannerSource, /benefitApplied/, 'and a word');
has(referralsScreen, /gt\.rewardStatus\(status\)/, 'reward state is rendered as a word');
has(referralsScreen, /'redeem'\s*:/, 'and carries a distinct icon per state');
// Each reward row announces its state, worth, and expiry as one summary.
has(referralsScreen, /\[statusText, worth, expiry\]\.filter\(Boolean\)\.join/,
  'a reward is announced as a single accessible summary');

lacks(codeOf(referralsScreen), /#[0-9a-fA-F]{6}|rgba?\(/, 'the referral screen holds no colour literal');
lacks(codeOf(bannerSource), /#[0-9a-fA-F]{6}|rgba?\(/, 'the banner holds no colour literal');
has(referralsScreen, /useThemedStyles\(makeStyles\)/, 'the screen uses the WPS-020 style factory');
has(bannerSource, /useThemedStyles\(makeStyles\)/, 'the banner uses the WPS-020 style factory');

// ---------------------------------------------------------------------------
// Migration: the corrected model
// ---------------------------------------------------------------------------
has(migration, /create table if not exists public\.referral_programs/,
  'referral programmes exist as their own authority');
has(migration, /create table if not exists public\.referral_rewards/,
  'rewards are a first-class redeemable object');
has(migration, /create table if not exists public\.booking_benefit_redemptions/,
  'one redemption table covers both benefit sources');
lacks(migrationCode, /referral_reward_entitlements/,
  'THE INERT ENTITLEMENT MODEL IS GONE');
lacks(migrationCode, /campaign_eligibility_grants/,
  'THE REFERRAL-TO-CAMPAIGN COUPLING IS GONE');
lacks(migrationCode, /requires_grant/,
  'a campaign no longer depends on a referral-issued grant');

// Automatic issuance, and no per-referral human step.
has(migration, /create or replace function private\.grant_referral_reward/,
  'reward issuance is a server function');
has(migrationCode, /perform private\.qualify_referral_for_booking\(new\.id\)/,
  'qualification runs from the booking-completion trigger, not a staff action');
lacks(migrationCode, /require_staff_capability[\s\S]{0,200}grant_referral_reward/,
  'NO STAFF CAPABILITY GATES AN INDIVIDUAL REWARD');
has(migration, /booking_id uuid not null unique/,
  'ONE BENEFIT PER BOOKING is a unique constraint, not a check');
has(migration, /booking_benefit_exclusive_check/,
  'a redemption cannot name both a reward and a campaign');

// Independence.
has(migration, /create or replace function private\.evaluate_referral_benefit/,
  'the referral evaluator is separate');
has(migration, /create or replace function private\.evaluate_promotion_eligibility/,
  'the campaign evaluator is separate');
// Transparent campaign criteria only.
for (const criterion of ['min_completed_bookings', 'max_completed_bookings',
  'min_account_age_days', 'min_inactive_days']) {
  has(migration, new RegExp(criterion), `campaigns support the ${criterion} criterion`);
}
lacks(migrationCode, /behaviou?ral_score|likely_to_convert|inferred_|high_value|propensity/i,
  'NO OPAQUE OR INFERRED ELIGIBILITY CRITERION EXISTS');

// Reuse.
has(migration, /private\.consume_dual_control/, 'activation consumes WPS-018 dual control');
has(migration, /private\.record_trust_fraud_signal/, 'fraud signals go to the WPS-016 sink');
has(migration, /private\.record_operational_event/, 'analytics go to the WPS-018 sink');
has(migration, /private\.enforce_rate_limit/, 'rate limiting uses the WPS-018 limiter');
has(migration, /private\.record_staff_audit/, 'staff actions write a WPS-017 audit row');
has(migration, /private\.create_booking_price_snapshot/, 'money goes through the WPS-007 authority');
has(migration, /final_price_egp = \(v_base - p_discount\)::numeric \/ 100/,
  'the customer-facing price is reduced, so provider gross is not inflated');

lacks(migrationCode, /create table .*(ledger|wallet|balance)/i,
  'the migration creates no ledger, wallet, or balance table');
lacks(migrationCode, /alter table private\.trust_fraud_signals/i,
  'WPS-021 does not widen the WPS-016 fraud vocabulary to fit itself');
lacks(migrationCode, /drop table/i, 'the migration drops no table');
lacks(migrationCode, /pg_catalog\.extract\(/i,
  'EXTRACT is never schema-qualified: its grammar is special and that is a syntax error');

// Retired scaffolds.
has(migration, /drop policy if exists public_active_promos on public\.promo_codes/,
  'the enumerable promo policy is dropped');
has(migration, /revoke all on public\.wallets from anon, authenticated, public/,
  'the dormant wallet scaffold loses every grant');
has(migration, /alter table public\.wallets enable row level security/,
  'RLS is enabled on wallets so a future GRANT still returns nothing');

// Every WPS-021 SECURITY DEFINER function pins an empty search path.
const definers = migration.match(/create or replace function[\s\S]*?\$\$;/g) ?? [];
check(definers.length >= 20, 'the migration defines the expected function surface');
for (const fn of definers) {
  const name = /function (\w+\.\w+)/.exec(fn)?.[1] ?? 'unknown';
  if (!/security definer/.test(fn)) continue;
  check(/set search_path\s*=\s*''/.test(fn), `${name} pins an empty search_path`);
}

// Grants.
has(migration, /grant select on public\.referral_rewards to authenticated/,
  'an owner can read their own reward');
lacks(migrationCode, /grant (insert|update|delete)[\s\S]{0,80}to authenticated/i,
  'A CLIENT HOLDS NO WRITE GRANT ON ANY GROWTH TABLE');
lacks(migrationCode, /grant .* on public\.(growth_campaigns|referral_programs)/i,
  'no grant exposes a campaign or programme to a client');

// Immutability and dual control.
has(migration, /An approved referral program is immutable\. Create a new version\./,
  'an approved programme cannot be edited');
has(migration, /An activated campaign is immutable\. Create a new version\./,
  'an activated campaign cannot be edited');
has(migration, /A referral program cannot be activated by its creator/,
  'the creator cannot activate their own programme');
has(migration, /A campaign cannot be activated by its creator/,
  'the creator cannot activate their own campaign');
has(migration, /referral_programs_creator_not_approver_check/,
  'and a table constraint says the same thing independently');
has(migration, /A reward cannot be moved to another account|beneficiary_user_id is distinct from old\.beneficiary_user_id/,
  'a reward cannot be transferred');

// Separate staff surfaces.
for (const capability of ['manage_referral_programs', 'approve_referral_program',
  'manage_growth_campaigns', 'approve_growth_campaign']) {
  has(migration, new RegExp(`'${capability}'`), `the ${capability} capability is registered`);
}
// Administration is web-only — see docs/constitution/cross-platform-parity.md.
// The campaigns console moved to admin.usewarsha.com. Its absence is the assertion.
check(!existsSync('app/admin/campaigns.tsx'), 'THE MOBILE CAMPAIGNS CONSOLE IS GONE');

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------
for (const doc of [
  'docs/wps/WPS-021-growth-referrals-promotions.md',
  'docs/wes/WES-021-growth-referrals-promotions.md',
  'docs/architecture/growth-architecture.md',
  'docs/security/growth-fraud-model.md',
  'docs/decisions/promotion-scope-and-legacy-scaffolds.md',
  'docs/testing/WPS-021-MANUAL-ALPHA.md',
  'docs/testing/WPS-021-MANUAL-RESULTS.md',
  'docs/testing/WPS-021-ACCEPTANCE-EVIDENCE.md',
]) {
  check(existsSync(join(root, doc)), `${doc} exists`);
}

const wpsFlow = flow(wps);
has(wpsFlow, /YOUR WORK, OUR MISSION/, 'the motto is preserved in English');
has(wps, /شغلك مهمتنا/, 'the motto is preserved in Arabic');
has(wpsFlow, /No reward for signing up\. Ever\./, 'the specification states the qualification rule');
has(wpsFlow, /WPS-007 remains the sole financial and ledger authority/,
  'the specification defers to WPS-007');
has(wpsFlow, /automatic/i, 'the specification describes automatic issuance');
lacks(flow(codeOf(wps)), /inert entitlement requiring/i,
  'the specification no longer describes the corrected-away model as current');
has(flow(wes), /automatic/i, 'the engineering baseline explains automatic issuance');

// Every manual case begins as NOT RUN.
const manualResults = read('docs/testing/WPS-021-MANUAL-RESULTS.md');
lacks(manualResults, /^\|\s*\d+\s*\|[^|]*\|\s*(PASS|FAIL)\s*\|/m,
  'no manual case is recorded as executed');
has(manualResults, /NOT RUN/, 'the manual results record the cases as NOT RUN');
const caseRows = (manualResults.match(/^\|\s*\d+\s*\|[^|]*\|\s*NOT RUN\s*\|/gm) ?? []).length;
check(caseRows >= 60, 'the manual suite covers the corrected model');

const index = read('docs/wps/WPS-INDEX.md');
has(index, /WPS-021-growth-referrals-promotions\.md/, 'WPS-021 is registered in the index');
has(index, /WES-021-growth-referrals-promotions\.md/, 'WES-021 is registered in the index');

// ---------------------------------------------------------------------------
// Nothing was enabled
// ---------------------------------------------------------------------------
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};
check(
  !Object.keys(packageJson.dependencies).some(dep =>
    /clipboard|analytics|segment|amplitude|branch|appsflyer/i.test(dep)),
  'NO EXTERNAL MARKETING, ATTRIBUTION, OR ANALYTICS PROVIDER WAS ADDED',
);
check(
  typeof packageJson.scripts['test:wps021'] === 'string',
  'the WPS-021 suite is registered as an npm script',
);

console.log(`WPS-021 growth, referrals and promotions: ${checks} checks passed.`);
