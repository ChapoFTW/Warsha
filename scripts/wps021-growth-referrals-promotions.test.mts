/**
 * WPS-021 — Growth, Referrals, Promotions & Customer Acquisition.
 *
 * Contract checks over the growth client, the Mock parity layer, the migration,
 * and every surface. Database behaviour is asserted by
 * `supabase/tests/database/growth-referrals-promotions.test.sql`; this file
 * asserts what the client guarantees, and — just as importantly — what the
 * locked scope says must NOT exist anywhere in the product.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { growthCopy } from '../src/growth/growth-copy.ts';
import {
  emptyReferralSummary,
  formatMinorAsEgp,
  formatReferralCodeForDisplay,
  isReferralCodeShape,
  normalizeReferralCode,
  referralCodeAccessibilityLabel,
  referralCodeAlphabet,
  referralCodeLength,
  referralShareUrl,
} from '../src/growth/growth-types.ts';
import {
  mockClaimReferralCode,
  mockEligiblePromotion,
  mockQualifyReferral,
  mockRedeemPromotion,
  mockReferralCode,
  mockReferralSummary,
  mockResetGrowthState,
  mockSetGrowthFlags,
  mockStaffCampaigns,
  mockUpsertCampaign,
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

const migration = read('supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql');
const migrationCode = sqlCodeOf(migration);
const typesSource = read('src/growth/growth-types.ts');
const mockSource = read('src/growth/mock-growth-state.ts');
const repositorySource = read('src/growth/growth-repository.ts');
const contextSource = read('src/growth/growth-context.tsx');
const referralsScreen = read('app/referrals.tsx');
const bannerSource = read('components/warsha/EligiblePromotionBanner.tsx');
const campaignsScreen = read('app/admin/campaigns.tsx');
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

// The client regex and the database CHECK constraint must describe the same set.
has(migration, /referral_codes_code_check check \(code ~ '\^\[2-9A-HJKMNP-Z\]\{10\}\$'\)/,
  'the database constrains the code to the same alphabet the client validates');

// ---------------------------------------------------------------------------
// Money formatting
// ---------------------------------------------------------------------------
is(formatMinorAsEgp('5000'), '50', 'minor units render as EGP');
is(formatMinorAsEgp('5050'), '50.50', 'piastres are preserved');
is(formatMinorAsEgp('not a number'), '0', 'a malformed amount renders as zero, never as NaN');

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
  mockEligiblePromotion('a', 'booking-1', 100000, 'customer').eligible,
  false,
  'promotions are off by default',
);
has(migration, /'growth_referrals','local',false,'none'/, 'the referral flag ships disabled');
has(migration, /'growth_promotions','local',false,'none'/, 'the promotion flag ships disabled');
has(migrationCode, /if v_row\.flag_key is null or not v_row\.enabled then return false/,
  'an ABSENT flag resolves to off rather than on');

// ---------------------------------------------------------------------------
// Referral code issuance
// ---------------------------------------------------------------------------
mockSetGrowthFlags({ referrals: true });
const first = mockReferralCode('account-a', 'customer');
check(first.available, 'a code is issued once referrals are enabled');
const codeA = first.available ? first.code : '';
check(isReferralCodeShape(codeA), 'the Mock code matches the shared shape rule');
const reissued = mockReferralCode('account-a', 'customer');
is(
  reissued.available ? reissued.code : null,
  codeA,
  'an account holds one code for its lifetime',
);
const second = mockReferralCode('account-b', 'customer');
const codeB = second.available ? second.code : '';
check(codeA !== codeB, 'two accounts receive different codes');

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------
is(mockClaimReferralCode('account-a', codeA).reason, 'self', 'an account cannot claim its own code');
is(mockClaimReferralCode('account-b', 'ZZZZZZZZZZ').reason, 'invalid', 'an unknown code is rejected');
is(mockClaimReferralCode('account-b', 'nope').reason, 'invalid', 'a malformed code is rejected');
is(mockClaimReferralCode('account-b', codeA).accepted, true, 'a valid code is claimed');
is(
  mockClaimReferralCode('account-b', codeA).reason,
  'already_attributed',
  'an account is attributed only once, ever',
);
is(mockReferralSummary('account-a').pending, 1, 'the referrer sees one pending invite');
is(mockReferralSummary('account-a').qualified, 0, 'and nothing qualified yet');

// ---------------------------------------------------------------------------
// No reward for a signup
// ---------------------------------------------------------------------------
is(
  mockReferralSummary('account-a').rewards.length,
  0,
  'NO REWARD EXISTS FOR A SIGNUP ALONE',
);
mockQualifyReferral('account-b', 'referral_thanks');
is(mockReferralSummary('account-a').rewards.length, 1, 'a completed job produces one entitlement');
is(mockReferralSummary('account-a').qualified, 1, 'the invite is now confirmed');
is(mockReferralSummary('account-a').pending, 0, 'and no longer pending');
is(
  mockReferralSummary('account-a').rewards[0].status,
  'recorded',
  'the entitlement is RECORDED, never a balance',
);
mockQualifyReferral('account-b', 'referral_thanks');
mockQualifyReferral('account-b', 'referral_thanks');
is(
  mockReferralSummary('account-a').rewards.length,
  1,
  'qualification is idempotent: a repeated completion event grants nothing extra',
);

// The summary counts referred accounts and never names them.
const summaryJson = JSON.stringify(mockReferralSummary('account-a'));
lacks(summaryJson, /account-b/, 'the summary discloses no referred account identifier');
is(emptyReferralSummary.rewards.length, 0, 'the empty summary carries no reward');

// ---------------------------------------------------------------------------
// Promotions: eligibility is a result, not a row
// ---------------------------------------------------------------------------
const campaign = {
  id: 'campaign-1',
  campaignKey: 'referral_thanks',
  version: 1,
  displayNameEn: 'Thank you',
  displayNameAr: 'شكرا لك',
  status: 'active' as const,
  audience: 'customer' as const,
  environment: 'local',
  discountType: 'percentage' as const,
  discountValue: 10,
  startsAt: new Date(Date.now() - 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  budgetMinor: '1000000',
  budgetConsumedMinor: '0',
  globalRedemptionLimit: 100,
  redemptionCount: 0,
  createdBy: 'staff-a',
  approvedBy: 'staff-b',
  createdAt: new Date().toISOString(),
};
mockUpsertCampaign(campaign);
mockSetGrowthFlags({ promotions: true });

is(
  mockEligiblePromotion('account-a', 'booking-1', 100000, 'customer').eligible,
  true,
  'the granted account is eligible',
);
is(
  mockEligiblePromotion('account-b', 'booking-2', 100000, 'customer').eligible,
  false,
  'an account without a grant sees nothing from a grant-gated campaign',
);
is(
  mockEligiblePromotion('account-a', 'booking-1', 100000, 'worker').eligible,
  false,
  'audience is enforced',
);
is(
  mockEligiblePromotion('account-a', 'booking-1', 0, 'customer').eligible,
  false,
  'a zero-value booking has no promotion',
);

const offer = mockEligiblePromotion('account-a', 'booking-1', 100000, 'customer');
check(offer.eligible, 'the offer resolves');
is(offer.eligible && offer.discountMinor, '10000', 'ten percent of 1000 EGP is 100 EGP');

// A promotion can never take the customer total to zero.
const tiny = mockEligiblePromotion('account-a', 'booking-tiny', 10, 'customer');
check(
  !tiny.eligible || Number(tiny.discountMinor) <= 9,
  'the discount is clamped below the booking value, so WPS-007 always has at least one minor unit to charge',
);

// ---------------------------------------------------------------------------
// Redemption and stacking
// ---------------------------------------------------------------------------
const redeemed = mockRedeemPromotion('account-a', 'booking-1', 'referral_thanks', 100000, 'customer');
is(redeemed.redeemed, true, 'the eligible customer redeems');
is(redeemed.discountMinor, '10000', 'the recorded discount matches the offer');
is(
  mockReferralSummary('account-a').rewards[0].status,
  'fulfilled',
  'the entitlement is fulfilled through the campaign rather than paid directly',
);
assert.throws(
  () => mockRedeemPromotion('account-a', 'booking-1', 'referral_thanks', 100000, 'customer'),
  /not available/,
  'ONE PROMOTION PER BOOKING: a second redemption throws',
);
checks += 1;
is(
  mockEligiblePromotion('account-a', 'booking-1', 100000, 'customer').eligible,
  false,
  'a booking that already carries a promotion is no longer eligible',
);
is(mockStaffCampaigns()[0].redemptionCount, 1, 'the campaign counter advanced exactly once');
is(mockStaffCampaigns()[0].budgetConsumedMinor, '10000', 'budget consumption equals the discount');

// A referral code is not a promo code.
assert.throws(
  () => mockRedeemPromotion('account-b', 'booking-9', codeA, 100000, 'customer'),
  /not available/,
  'A REFERRAL CODE PRESENTED AS A CAMPAIGN KEY REDEEMS NOTHING',
);
checks += 1;

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
lacks(codeOf(repositorySource), /getCampaigns\b|listCampaigns\b|browseCampaigns/,
  'the client has no way to browse campaigns');

// The banner is the only promotion surface, and it renders only on a result.
has(bannerSource, /if \(!offer\.eligible\) return null/,
  'nothing renders unless the server returned an eligibility result');
has(bannerSource, /promotionFunded/, 'the banner states that Warsha funds the offer');

// No second financial system anywhere in the growth module.
const growthClient = [typesSource, mockSource, repositorySource, contextSource].map(codeOf).join('\n');
lacks(growthClient, /ledger/i, 'the growth client references no ledger');
lacks(growthClient, /\bpayout\b/i, 'the growth client references no payout');
lacks(growthClient, /balance_egp|walletBalance/i, 'the growth client holds no balance');

// ---------------------------------------------------------------------------
// Mock isolation
// ---------------------------------------------------------------------------
const mockCode = codeOf(mockSource);
lacks(mockCode, /supabase/i, 'Mock imports no Supabase module');
lacks(mockCode, /getSupabaseClient|createClient/, 'Mock constructs no client');
lacks(mockCode, /fetch\(|axios|XMLHttpRequest/, 'Mock performs no network call');
has(repositorySource, /environment\.dataMode === 'mock'/, 'the repository branches on the data mode');
const mockBranches = (repositorySource.match(/environment\.dataMode === 'mock'/g) ?? []).length;
const rpcCalls = (repositorySource.match(/\.rpc\(/g) ?? []).length;
check(mockBranches >= rpcCalls, 'every Supabase path has a Mock branch in front of it');
lacks(codeOf(repositorySource), /catch[\s\S]{0,120}mock/i,
  'a Supabase failure never falls back into Mock');

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
check(enKeys.length >= 40, 'the growth copy covers the full surface');
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
has(bannerSource, /isRTL/, 'the promotion banner honours RTL');

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------
has(referralsScreen, /accessibilityLabel=\{referralCodeAccessibilityLabel\(code\)\}/,
  'the code is announced character by character');
has(referralsScreen, /selectable/, 'the code is selectable text, not an image');
has(referralsScreen, /accessibilityLiveRegion="polite"/,
  'the claim result is announced');
has(bannerSource, /accessibilityLiveRegion="polite"/, 'the offer announces itself');
has(bannerSource, /accessibilityState=\{\{ disabled: busy \}\}/,
  'the apply control reports its disabled state');
check(
  (referralsScreen.match(/minHeight: 44/g) ?? []).length >= 3,
  'touch targets meet the 44pt minimum',
);
// State is never carried by colour alone: each state ships an icon and a word.
has(bannerSource, /name="check-circle-outline"/, 'the applied state has an icon');
has(bannerSource, /promotionApplied/, 'and a word');
has(referralsScreen, /name=\{reward\.status === 'fulfilled' \? 'check-circle-outline' : 'schedule'\}/,
  'reward state has an icon as well as text');

// No colour literal: WPS-020 owns the palette.
lacks(codeOf(referralsScreen), /#[0-9a-fA-F]{6}|rgba?\(/, 'the referral screen holds no colour literal');
lacks(codeOf(bannerSource), /#[0-9a-fA-F]{6}|rgba?\(/, 'the banner holds no colour literal');
has(referralsScreen, /useThemedStyles\(makeStyles\)/, 'the screen uses the WPS-020 style factory');
has(bannerSource, /useThemedStyles\(makeStyles\)/, 'the banner uses the WPS-020 style factory');

// ---------------------------------------------------------------------------
// Migration: reuse, not reinvention
// ---------------------------------------------------------------------------
has(migration, /private\.consume_dual_control/, 'activation consumes WPS-018 dual control');
has(migration, /private\.record_trust_fraud_signal/, 'fraud signals go to the WPS-016 sink');
has(migration, /private\.record_operational_event/, 'analytics go to the WPS-018 sink');
has(migration, /private\.enforce_rate_limit/, 'rate limiting uses the WPS-018 limiter');
has(migration, /private\.record_staff_audit/, 'staff actions write a WPS-017 audit row');
has(migration, /private\.create_booking_price_snapshot/, 'money goes through the WPS-007 authority');

lacks(migrationCode, /create table .*(ledger|wallet|balance)/i,
  'the migration creates no ledger, wallet, or balance table');
lacks(migrationCode, /alter table private\.trust_fraud_signals/i,
  'WPS-021 does not widen the WPS-016 fraud vocabulary to fit itself');
lacks(migrationCode, /drop table/i, 'the migration drops no table');
lacks(migrationCode, /drop function/i, 'the migration drops no function');

// The retired scaffolds.
has(migration, /drop policy if exists public_active_promos on public\.promo_codes/,
  'the enumerable promo policy is dropped');
has(migration, /revoke all on public\.promo_codes from anon, authenticated, public/,
  'the promo scaffold loses every grant');
has(migration, /revoke all on public\.wallets from anon, authenticated, public/,
  'the dormant wallet scaffold loses every grant');
has(migration, /comment on table public\.wallets is\s*\n?\s*'RETIRED by WPS-021/,
  'the wallet retirement is documented on the table');
has(migration, /alter table public\.wallets enable row level security/,
  'RLS is enabled on wallets so a future GRANT still returns nothing');

// Every WPS-021 function pins an empty search path.
const definers = migration.match(/create or replace function[\s\S]*?\$\$/g) ?? [];
check(definers.length >= 15, 'the migration defines the expected function surface');
for (const fn of definers) {
  const name = /function (\w+\.\w+)/.exec(fn)?.[1] ?? 'unknown';
  if (!/security definer/.test(fn)) continue;
  check(/set search_path\s*=\s*''/.test(fn), `${name} pins an empty search_path`);
}

// Grants: readable where owned, never writable.
has(migration, /grant select on public\.referral_codes to authenticated/,
  'an owner can read their own code');
lacks(migrationCode, /grant (insert|update|delete)[\s\S]{0,80}to authenticated/i,
  'A CLIENT HOLDS NO WRITE GRANT ON ANY GROWTH TABLE');
lacks(migrationCode, /grant .* on public\.growth_campaigns/i,
  'no grant exposes campaigns to a client');

// Immutability.
has(migration, /An activated campaign is immutable\. Create a new version\./,
  'an activated campaign cannot be edited');
has(migration, /Referral codes are immutable/, 'a code cannot be rewritten');
has(migration, /Referral attribution is immutable/, 'attribution cannot be rewritten');
has(migration, /Reward history is immutable/, 'reward history cannot be rewritten');
has(migration, /A campaign cannot be activated by its creator/,
  'the creator cannot activate their own campaign');
has(migration, /growth_campaigns_creator_not_approver_check/,
  'and a table constraint says the same thing independently');

// Concurrency.
has(migration, /for update;?\s*\n\s*v_result := private\.evaluate_promotion_eligibility/,
  'eligibility is re-evaluated INSIDE the campaign row lock, not before it');
has(migration, /booking_id uuid not null unique/,
  'one promotion per booking is a unique constraint, not a status check');

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------
check(existsSync(join(root, 'docs/wps/WPS-021-growth-referrals-promotions.md')), 'WPS-021 exists');
check(existsSync(join(root, 'docs/wes/WES-021-growth-referrals-promotions.md')), 'WES-021 exists');
check(existsSync(join(root, 'docs/architecture/growth-architecture.md')), 'the architecture note exists');
check(existsSync(join(root, 'docs/security/growth-fraud-model.md')), 'the fraud model exists');
check(existsSync(join(root, 'docs/decisions/promotion-scope-and-legacy-scaffolds.md')),
  'the promotion decision log exists');
check(existsSync(join(root, 'docs/testing/WPS-021-MANUAL-ALPHA.md')), 'the manual suite exists');
check(existsSync(join(root, 'docs/testing/WPS-021-MANUAL-RESULTS.md')), 'the manual results exist');
check(existsSync(join(root, 'docs/testing/WPS-021-ACCEPTANCE-EVIDENCE.md')), 'the evidence exists');

has(wps, /YOUR WORK, OUR MISSION/, 'the motto is preserved in English');
has(wps, /شغلك مهمتنا/, 'the motto is preserved in Arabic');
// Prose wraps, so these tolerate a newline wherever a space appears.
const flow = (text: string) => text.replace(/\s+/g, ' ');
const wpsFlow = flow(wps);
has(wpsFlow, /No reward for signing up\. Ever\./, 'the specification states the qualification rule');
has(wpsFlow, /WPS-007 remains the sole financial and ledger authority/,
  'the specification defers to WPS-007');
has(wes, /entitlement/i, 'the engineering baseline explains the entitlement model');

// Every manual case begins as NOT RUN.
const manualResults = read('docs/testing/WPS-021-MANUAL-RESULTS.md');
// Scoped to numbered case rows. The summary table legitimately contains
// `| PASS | 0 |`, and matching that would make this assertion permanently red.
lacks(manualResults, /^\|\s*\d+\s*\|[^|]*\|\s*(PASS|FAIL)\s*\|/m,
  'no manual case is recorded as executed');
has(manualResults, /NOT RUN/, 'the manual results record the cases as NOT RUN');
is(
  (manualResults.match(/^\|\s*\d+\s*\|[^|]*\|\s*NOT RUN\s*\|/gm) ?? []).length,
  62,
  'all 62 manual cases are present and unrun',
);

// The index is current.
const index = read('docs/wps/WPS-INDEX.md');
has(index, /WPS-021-growth-referrals-promotions\.md/, 'WPS-021 is registered in the index');
has(index, /WES-021-growth-referrals-promotions\.md/, 'WES-021 is registered in the index');

// ---------------------------------------------------------------------------
// Nothing was enabled
// ---------------------------------------------------------------------------
const appJson = read('app.json');
lacks(appJson, /expo-clipboard/, 'no new native dependency was added for this feature');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};
check(
  !Object.keys(packageJson.dependencies).some(dep => /clipboard|analytics|segment|amplitude|branch|appsflyer/i.test(dep)),
  'NO EXTERNAL MARKETING, ATTRIBUTION, OR ANALYTICS PROVIDER WAS ADDED',
);
check(
  typeof packageJson.scripts['test:wps021'] === 'string',
  'the WPS-021 suite is registered as an npm script',
);

console.log(`WPS-021 growth, referrals and promotions: ${checks} checks passed.`);
