import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

const migration = read('supabase/migrations/202608010005_wps011_reviews_reputation.sql');
const repository = read('src/reviews/review-repository.ts');
const context = read('src/reviews/review-context.tsx');
const types = read('src/reviews/review-types.ts');
const bookingUi = read('components/warsha/BookingReviewCard.tsx');
const profileUi = read('components/warsha/ProviderReviewSummary.tsx');
const replyUi = read('components/warsha/ProviderReviewReply.tsx');
const translations = read('src/reviews/review-translations.ts');
const supabaseAdapter = read('src/data/adapters/supabase-adapter.ts');

for (const field of ['professionalism_rating','quality_rating','punctuality_rating','communication_rating','value_rating','edit_deadline_at','revision']) match(migration, new RegExp(field), `${field} is migrated`);
for (const table of ['review_edit_events','review_reports','review_report_events','review_helpfulness_votes','review_moderation_events']) match(migration, new RegExp(`create table public\\.${table}`), `${table} exists`);
for (const rpc of ['submit_booking_review_v2','edit_booking_review','vote_review_helpfulness','report_review','review_report_transition','moderate_review','get_booking_review_v2','get_provider_reputation_summary','get_marketplace_catalog_v2']) match(migration, new RegExp(`function public\\.${rpc}`), `${rpc} is implemented`);
match(migration, /status='completed'/, 'review eligibility remains completed-booking-only');
match(migration, /on conflict\(booking_id\) do nothing/, 'one review per booking remains idempotent');
match(migration, /edit_window_hours[^]*72/, '72-hour configurable edit policy exists');
match(migration, /review edit window has closed/i, 'expired edits are rejected');
match(migration, /review_moderation_events/, 'moderation audit is retained');
match(migration, /moderation_status=next_status/, 'moderation uses soft visibility state');
notMatch(migration, /delete from public\.reviews/, 'WPS-011 never deletes review rows');
match(migration, /primary key\(review_id, voter_id\)/, 'duplicate helpful votes are structurally prevented');
match(migration, /r\.customer_id=uid/, 'review authors cannot vote their own reviews');
match(migration, /p\.user_id=uid/, 'reviewed providers cannot vote on their own reputation');
match(migration, /'spam','abuse','fake_review','offensive_content'/, 'locked report reasons are server validated');
match(migration, /private\.is_staff\(\)/, 'staff moderation is server-authorized');
match(migration, /set search_path=''/, 'definer functions use empty search path');
match(migration, /review_attachment_public_signed_read/, 'visible review photos support private signed retrieval');
match(migration, /drop table public\.review_attachments/, 'private attachment paths are removed from Realtime publication');
match(migration, /image_refs/, 'public feed provides adapter-only signed hydration references');
for (const secret of ['moderation_reason','reporter_id','resolution_note','customer_id']) notMatch(migration.match(/function public\.get_provider_reputation_summary[^]*?end \$\$/)?.[0] ?? '', new RegExp(`'${secret}'`), `public reputation does not project ${secret}`);
for (const metric of ['completed_jobs','response_rate','completion_rate','repeat_customer_percentage','years_on_platform']) match(migration, new RegExp(`'${metric}'`), `${metric} is projected`);
for (const badge of ['topRated','fastResponder','experienced']) match(migration, new RegExp(`'${badge}'`), `${badge} follows deterministic rules`);
match(migration, /'policy_version','wps011-v1'/, 'confidence score is versioned');
notMatch(migration, /matching_score|ranking_score|invitation_score/, 'reputation migration does not mutate ranking scores');

for (const sort of ['newest','highest_rated','lowest_rated','most_helpful']) match(types + repository + profileUi, new RegExp(sort), `${sort} is implemented across client layers`);
for (const dimension of ['professionalism','quality','punctuality','communication','value']) match(types + bookingUi + profileUi, new RegExp(dimension), `${dimension} is collected and displayed`);
match(repository, /environment\.dataMode === 'supabase' \? supabase : mock/, 'repository mode selection is static');
notMatch(repository, /catch\s*\([^)]*\)\s*\{[^}]*\bmock\./i, 'repository has no hidden Supabase-to-Mock fallback');
match(repository, /file\.md5/, 'review photos use content fingerprints for safe immutable names');
// The lifetime is no longer written here. `src/storage/signed-url-policy.ts` is
// the single authority and `scripts/signed-url-policy.test.mts` fails on any
// literal at a call site, so asserting the policy call is a stronger form of
// the same requirement: the URL expires, and it expires by the declared rule.
match(repository, /createSignedUrls\(refs, signedUrlSeconds\('review-attachments'\)\)/,
  'review images use expiring signed URLs, with the lifetime read from the shared policy');
match(repository, /5 \* 1024 \* 1024/, 'client enforces 5 MB image limit');
match(repository, /\['image\/jpeg', 'image\/png', 'image\/webp'\]/, 'client MIME allowlist is exact');
match(repository, /ownerAccountId/, 'Mock review editing is account-scoped');
match(repository, /state\.votes\.find/, 'Mock prevents duplicate vote rows');
match(repository, /localBookingRepository\.list\(\)/, 'Mock verifies the authoritative local booking before review creation');
match(repository, /booking\.status !== 'completed'/, 'Mock rejects reviews before booking completion');
match(repository, /review\.providerId === mockProviderId\(accountId\)/, 'Mock prevents reviewed providers from voting on their own reputation');
match(repository, /item\.ownerAccountId === accountId/, 'Mock reviewed-booking projection is customer-account scoped');
match(repository, /myVote: state\.votes\.find/, 'Mock derives private vote state for the requesting account');
match(repository, /reportEvents\.push/, 'Mock retains immutable report workflow events');
match(repository, /moderationEvents\.push/, 'Mock retains immutable soft-hide and restore events');
match(repository, /simulateModeration/, 'Mock supports moderation visibility parity');
match(repository, /environment\.dataMode !== 'mock'/, 'Mock staff harness is fail-closed outside Mock mode');
for (const method of ['edit','vote','report']) match(context, new RegExp(`${method}:`), `review context exposes ${method}`);
match(bookingUi, /accessibilityRole="radiogroup"/, 'rating groups expose accessibility semantics');
match(bookingUi, /accessibilityRole="radio"/, 'star choices expose selected radio state');
match(bookingUi, /accessibilityRole="checkbox"/, 'anonymous choice exposes checkbox state');
match(profileUi, /accessibilityRole="alert"/, 'review errors and confirmations are announced');
match(profileUi, /flexWrap: 'wrap'/, 'review metrics and actions wrap on small screens');
match(profileUi, /summary\.distribution\[star\]/, 'provider profiles render the overall rating distribution');
match(profileUi, /review\.dimensions\[key\]/, 'provider profiles render every score on each review');
match(replyUi, /immutableReply/, 'provider UI explains reply immutability');
match(translations, /English|Rate this service/, 'English review copy exists');
match(translations, /قيّم الخدمة/, 'Egyptian Arabic review copy exists');
match(translations, /ratingDistribution/, 'rating distribution is localized in both languages');
match(bookingUi + profileUi, /isRTL/, 'review surfaces implement RTL direction');
match(supabaseAdapter, /get_marketplace_catalog_v2/, 'marketplace adapter consumes sanitized reputation projection');

const mottoFiles = ['app/+html.tsx','public/manifest.webmanifest','src/i18n/translations.ts','scripts/render-brand-assets.ps1','docs/brand/WARSHA-BRAND-SYSTEM.md','docs/decisions/brand-decisions.md','docs/wps/WPS-009-communication-collaboration.md','docs/wps/WPS-011-reviews-reputation.md'];
const mottoText = mottoFiles.map(read).join('\n');
match(mottoText, /YOUR WORK, OUR MISSION/, 'approved English motto is present');
match(mottoText, /شغلك مهمتنا/, 'approved Arabic motto is present');
const activeMottoFiles = ['app/+html.tsx','public/manifest.webmanifest','src/i18n/translations.ts','scripts/render-brand-assets.ps1'];
const activeMottoText = activeMottoFiles.map(read).join('\n');
notMatch(activeMottoText, /YOUR WORK\. OUR MISSION\.|YOUR BUSINESS\. MORE JOBS\.|Warsha finishes your work safely, for the fairest price\./, 'active surfaces contain no superseded motto');
const config = read('app.json');
match(config, /warsha-current-approved-icon\.png/, 'Expo config selects the approved high-resolution icon for native splash rendering');
notMatch(config, /warsha-current-approved-splash\.png/, 'Expo config does not enlarge the obsolete 512px splash raster');
notMatch(config, /warsha-brand-splash\.png/, 'Expo config does not select legacy splash asset');
ok(read('scripts/brand-system.test.mts').includes('YOUR WORK, OUR MISSION'), 'brand regression locks the English motto');
ok(read('scripts/brand-system.test.mts').includes('شغلك مهمتنا'), 'brand regression locks the Arabic motto');

console.log(`WPS-011 reviews and reputation checks passed: ${checks} contracts across database, client, Mock, localization, accessibility, and motto.`);
