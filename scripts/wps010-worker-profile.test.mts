import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { replaceMediaAtomically } from '../src/providers/media-replacement.ts';
import {
  providerCertificateStorageKey,
  providerPortfolioStorageKey,
  providerStorageKey,
} from '../src/providers/provider-account-scope.ts';
import {
  emptyProviderDraft,
  providerChecklist,
  providerCompletion,
  validateCertificate,
  validatePortfolioItem,
} from '../src/providers/provider-types.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const complete = {
  ...emptyProviderDraft,
  avatarPath: 'private/avatar.jpg',
  profession: 'plumbing',
  about: 'I repair home plumbing carefully and explain the work clearly.',
  services: [{ serviceId: 'service-1', name: 'Leak repair' }],
  areas: [{ governorate: 'Cairo', district: 'Maadi', radiusKm: 15 }],
};

assert.deepEqual(providerChecklist(complete, true), { photo: true, professions: true, services: true, area: true, verification: true });
assert.equal(providerCompletion(complete, true), 100, 'plain five-item checklist reaches 100%');
assert.equal(providerChecklist(emptyProviderDraft, false).verification, false, 'draft does not invent verification');
assert.throws(() => validatePortfolioItem({ title: 'x', description: '', status: 'draft' }), /title/);
assert.throws(() => validatePortfolioItem({ title: 'Valid title', description: 'x'.repeat(501), status: 'draft' }), /description/);
assert.doesNotThrow(() => validatePortfolioItem({ title: 'Sink repair', description: 'Replaced damaged pipe.', status: 'published' }));
assert.throws(() => validateCertificate({ type: 'professional', title: 'x' }), /title/);
assert.doesNotThrow(() => validateCertificate({ type: 'qualification', title: 'Safety course', issuer: 'Training center' }));

for (const key of [providerStorageKey, providerPortfolioStorageKey, providerCertificateStorageKey]) {
  assert.notEqual(key('worker-a'), key('worker-b'), 'Mock persistence key is account-scoped');
  assert.match(key('worker-a'), /worker-a$/, 'account id is part of the scoped key');
}

{
  const events: string[] = [];
  const result = await replaceMediaAtomically({
    previousPath: 'old.jpg',
    stage: async () => { events.push('stage'); return 'new.jpg'; },
    register: async (next, expected) => { events.push(`register:${next}:${expected}`); },
    authorize: async path => { events.push(`authorize:${path}`); return 'signed-new'; },
    remove: async paths => { events.push(`remove:${paths.join(',')}`); },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(result, { path: 'new.jpg', authorized: 'signed-new' });
  assert.deepEqual(events, ['stage', 'register:new.jpg:old.jpg', 'authorize:new.jpg', 'remove:old.jpg']);
}

{
  const events: string[] = [];
  await assert.rejects(() => replaceMediaAtomically({
    previousPath: 'old.jpg',
    stage: async () => 'new.jpg',
    register: async (next, expected) => { events.push(`register:${next}:${expected}`); },
    authorize: async () => { throw new Error('signing failed'); },
    remove: async paths => { events.push(`remove:${paths.join(',')}`); },
  }), /signing failed/);
  assert.deepEqual(events, ['register:new.jpg:old.jpg', 'register:old.jpg:new.jpg', 'remove:new.jpg'], 'failed authorization restores prior metadata before deleting staging');
  assert.ok(!events.includes('remove:old.jpg'), 'previous photo is preserved on replacement failure');
}

{
  const events: string[] = [];
  await assert.rejects(() => replaceMediaAtomically({
    previousPath: 'old.jpg',
    stage: async () => 'new.jpg',
    register: async () => { throw new Error('registration failed'); },
    authorize: async () => 'unreachable',
    remove: async paths => { events.push(`remove:${paths.join(',')}`); },
  }), /registration failed/);
  assert.deepEqual(events, ['remove:new.jpg'], 'failed registration removes only the staged object');
}

const migration = read('supabase/migrations/202608010004_wps010_worker_profiles_portfolio.sql');
for (const contract of [
  'provider_portfolio_images',
  'get_my_worker_profile',
  'set_my_provider_profile_photo',
  'save_my_provider_portfolio_item',
  'register_my_provider_portfolio_image',
  'get_my_provider_certificates',
  'review_provider_certificate',
  'professional_certificate_verified',
  "('profile-images', 'profile-images', false",
  "('provider-portfolios', 'provider-portfolios', false",
  "('provider-certificates', 'provider-certificates', false",
]) assert.ok(migration.includes(contract), `${contract} exists in the forward migration`);
assert.match(migration, /create policy provider_services_owner_read/, 'draft service owner read is fixed');
assert.match(migration, /create policy provider_areas_owner_read/, 'draft area owner read is fixed');
assert.match(migration, /create policy portfolio_owner_manage/, 'portfolio metadata owner access is fixed');
assert.match(migration, /create policy certifications_owner_read/, 'certificate metadata owner access is fixed');
assert.match(migration, /phone_confirmed_at is not null/, 'discovery requires confirmed phone');
assert.match(migration, /v\.status = 'approved'/, 'discovery requires approved identity');
const onboardingCorrection = read('supabase/migrations/202608160001_wps025_worker_onboarding_product_corrections.sql');
assert.doesNotMatch(onboardingCorrection, /btrim\(p\.about\)/, 'optional biography is not a discovery requirement');
assert.match(onboardingCorrection, /btrim\(p\.profession_key\)/, 'discovery requires the worker profession identity');
assert.match(migration, /p_content_hash !~ '\^\[0-9a-f\]\{32\}\$'/, 'portfolio registration requires a content fingerprint');

const catalog = migration.slice(migration.lastIndexOf('create or replace function public.get_marketplace_catalog'));
for (const forbidden of ['phone_confirmed_at', 'email', 'rejection_reason', 'reviewed_by', 'cash_debt', 'matching_score', 'latitude', 'longitude']) {
  assert.ok(!catalog.includes(forbidden), `public catalog omits ${forbidden}`);
}

const repository = read('src/providers/provider-repository.ts');
assert.match(repository, /environment\.dataMode === 'supabase' \? supabaseRepository : mockRepository/, 'repository mode is selected once');
assert.doesNotMatch(repository, /catch[^}]+mockRepository/s, 'Supabase failures do not fall back to Mock writes');
assert.match(repository, /file\.md5/, 'portfolio uses file-content fingerprinting');
assert.match(repository, /upsert: false/g, 'private media uses immutable staging objects');

const providerMode = read('app/worker/profile.tsx');
const portfolioScreen = read('app/provider-portfolio.tsx');
const certificateScreen = read('app/provider-certificates.tsx');
const publicScreen = read('app/provider/[id].tsx');
const localization = read('src/i18n/worker-profile-translations.ts');
const workerPhotoPicker = read('components/warsha/WorkerPhotoPicker.tsx');
assert.doesNotMatch(workerPhotoPicker, /allowsEditing: true/, 'profile photo never invokes the native crop activity');
assert.match(workerPhotoPicker, /context\.crop\(/, 'profile photo is center-cropped in the Warsha preview flow');
assert.doesNotMatch(providerMode, /accessibilityRole="tab"/, 'worker profile is one focused screen rather than a hidden tab system');
assert.match(portfolioScreen, /accessibilityRole="alert"/, 'portfolio privacy warning is announced');
assert.match(portfolioScreen, /selectionLimit: remaining/, 'portfolio image count is bounded at selection');
assert.match(certificateScreen, /copyToCacheDirectory: true/, 'SDK 54 document selection is immediately readable');
assert.match(certificateScreen, /application\/pdf/, 'certificate picker accepts the specified private document types');
assert.match(publicScreen, /requestQuote/, 'Request a Quote remains the profile primary action');
assert.doesNotMatch(publicScreen, /bookNow|create_customer_booking/, 'profile does not make direct fixed booking primary');
assert.match(localization, /صور الشغل/, 'Egyptian Arabic profile copy exists');
assert.match([providerMode, portfolioScreen, certificateScreen, publicScreen].join('\n'), /isRTL/, 'worker and public screens handle RTL');
assert.match([providerMode, portfolioScreen, certificateScreen].join('\n'), /maxWidth: (?:680|720)/, 'forms retain a bounded small-screen-safe layout');

const reviewMigration = read('supabase/migrations/202607270001_reviews_ratings.sql');
assert.match(reviewMigration, /status = 'completed'/, 'existing review submission remains completed-booking gated');

console.log('WPS-010 worker-profile checks passed: privacy, account scope, rollback, limits, portfolio, certificates, localization, and quote action.');
