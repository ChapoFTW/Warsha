/**
 * WPS-019 — Customer Support, Help Center & Knowledge Management.
 *
 * Contract checks over the repository, the Mock parity layer, the knowledge
 * base, the migration, and the surfaces. Database behaviour is asserted by
 * `supabase/tests/database/customer-support-help-center.test.sql`; this file
 * asserts what the client guarantees and what the migration must contain.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  mockHelpArticles,
  mockHelpCategories,
  mockResolutionReasons,
  mockSlaPolicy,
  mockSupportMacros,
} from '../src/support/mock-support-state.ts';
import {
  helpCategoryKeys,
  helpSurfaceForRoute,
  supportAttachmentExtension,
  supportAttachmentMaxBytes,
  supportAttachmentMaxPerCase,
  supportAttachmentMimeTypes,
  supportAttachmentPath,
  supportCategories,
  supportLinkedTypes,
  supportLocales,
  supportMaxReopens,
  supportReopenWindowDays,
  supportStatuses,
  supportSurfaces,
} from '../src/support/support-types.ts';
import { supportCopy } from '../src/support/support-copy.ts';
import { notificationCategories } from '../src/notifications/notification-types.ts';

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

const migration = readFileSync('supabase/migrations/202608040001_wps019_customer_support_help_center.sql', 'utf8');
const migrationSql = migration.replace(/--[^\n]*/g, '');
const pgTap = readFileSync('supabase/tests/database/customer-support-help-center.test.sql', 'utf8');
const repository = readFileSync('src/support/support-repository.ts', 'utf8');
const context = readFileSync('src/support/support-context.tsx', 'utf8');
const helpScreen = readFileSync('app/help/index.tsx', 'utf8');
const articleScreen = readFileSync('app/help/article/[slug].tsx', 'utf8');
const caseScreen = readFileSync('app/support/case/[id].tsx', 'utf8');
const newCaseScreen = readFileSync('app/support/new.tsx', 'utf8');
const casesScreen = readFileSync('app/support/index.tsx', 'utf8');
const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
const audit = readFileSync('docs/architecture/support-architecture-audit.md', 'utf8');
const wps = readFileSync('docs/wps/WPS-019-customer-support-help-center.md', 'utf8');
const wes = readFileSync('docs/wes/WES-019-customer-support-help-center.md', 'utf8');

// ---------------------------------------------------------------------------
// 1. The existing architecture is extended, not duplicated
// ---------------------------------------------------------------------------
has(migrationSql, /alter table public\.support_tickets/, 'the migration extends the existing ticket table');
has(migrationSql, /alter table public\.support_messages/, 'the migration extends the existing message table');
lacks(migrationSql, /create table if not exists public\.support_tickets/, 'the migration never recreates the ticket table');
lacks(migrationSql, /create table if not exists public\.support_messages/, 'the migration never recreates the message table');
lacks(migrationSql, /create table[^;]*support_conversations/, 'no parallel support conversation table is created');
has(migrationSql, /private\.open_support_case_impl\(/, 'the new intake delegates to the preserved WPS-017 body');
lacks(migrationSql, /create or replace function private\.\w+_impl\(/, 'WPS-019 creates no new preserved implementation');

// Forward-only: nothing destructive.
lacks(migrationSql, /^\s*drop\s+table\s/im, 'the migration drops no table');
lacks(migrationSql, /^\s*truncate\s/im, 'the migration truncates nothing');
lacks(migrationSql, /alter\s+table\s+\S+\s+drop\s+column/i, 'the migration drops no column');
lacks(migrationSql, /^\s*drop\s+function\s+public\./im, 'the migration drops no public function');
lacks(migrationSql, /pg_catalog\.extract\s*\(/i, 'no schema-qualified EXTRACT grammar defect');

// Every SECURITY DEFINER function pins an empty search path.
const definers = (migrationSql.match(/security\s+definer/gi) ?? []).length;
const pinned = (migrationSql.match(/set\s+search_path\s*=\s*''/gi) ?? []).length;
check(definers > 0 && pinned >= definers,
  `every SECURITY DEFINER function pins an empty search path (${definers} definers, ${pinned} pinned)`);

// WPS-019 gates on the WPS-017 capability model, not the legacy staff gate.
lacks(migrationSql, /require_domain_staff\(/, 'no WPS-019 function uses the legacy domain staff gate');
has(migrationSql, /private\.require_staff_capability\('manage_support_cases'\)/, 'staff reads require the support capability');
has(migrationSql, /private\.require_support_staff_write\('manage_support_cases'\)/, 'staff writes require the support capability plus the limiter');
lacks(migrationSql, /create table[^;]*staff_roles|insert into public\.staff_roles/, 'WPS-019 introduces no staff role');
lacks(migrationSql, /insert into public\.staff_capabilities/, 'WPS-019 introduces no staff capability');
lacks(migrationSql, /insert into public\.staff_queues/, 'WPS-019 introduces no work queue');

// ---------------------------------------------------------------------------
// 2. Row level security and grants
// ---------------------------------------------------------------------------
for (const table of ['help_categories', 'help_articles', 'help_article_translations',
  'help_article_versions', 'help_article_feedback', 'support_ticket_attachments']) {
  has(migrationSql, new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} has row level security enabled`);
  has(migrationSql, new RegExp(`revoke all on public\\.${table} from anon`),
    `${table} is unreachable by anon`);
  has(migrationSql, new RegExp(`revoke insert, update, delete on public\\.${table} from anon, authenticated`),
    `${table} accepts no direct client write`);
}
has(migrationSql, /grant execute on function %s to authenticated/, 'every WPS-019 RPC is granted only to authenticated');
has(migrationSql, /revoke all on function %s from public, anon, authenticated/, 'every WPS-019 RPC revokes the default grant first');
has(migrationSql, /revoke all on private\.help_search_log from public, anon, authenticated/, 'search telemetry is private');
has(migrationSql, /revoke all on private\.support_macros from public, anon, authenticated/, 'macros are private');
has(migrationSql, /revoke all on private\.support_sla_policy from public, anon, authenticated/, 'service levels are private');

// ---------------------------------------------------------------------------
// 3. Storage
// ---------------------------------------------------------------------------
has(migrationSql, /insert into storage\.buckets[\s\S]{0,200}'support-attachments','support-attachments',false/,
  'the support attachment bucket is private');
has(migrationSql, /file_size_limit[\s\S]{0,80}8388608/, 'the bucket declares an 8 MB limit');
has(migrationSql, /array\['image\/jpeg','image\/png','image\/heic','application\/pdf'\]/,
  'the bucket allows exactly JPEG, PNG, HEIC, and PDF');
has(migrationSql, /create policy support_attachment_upload on storage\.objects/, 'an upload policy exists');
has(migrationSql, /create policy support_attachment_read on storage\.objects/, 'a read policy exists');
has(migrationSql, /create policy support_attachment_orphan_delete on storage\.objects/, 'an orphan-delete policy exists');
has(migrationSql, /private\.can_read_support_attachment\(name\)/, 'read is restricted to a registered attachment on a visible case');
has(migrationSql, /not private\.support_attachment_registered\(name\)/, 'only an unregistered object can be deleted by its uploader');
// The registration RPC re-reads the object rather than trusting the client.
has(migrationSql, /from storage\.objects o[\s\S]{0,200}bucket_id = 'support-attachments'/,
  'registration re-reads the uploaded object from storage');
has(migrationSql, /v_object\.owner_id <> v_uid::text/, 'registration refuses an object owned by someone else');
has(migrationSql, /name !~ '\(\\\.\\\.\|\/\/\|\\\\\)'/, 'the upload policy refuses a traversing path');

// ---------------------------------------------------------------------------
// 4. Notifications reuse WPS-014
// ---------------------------------------------------------------------------
is(notificationCategories.length, 10, 'the notification category set gains support and nothing else');
check(notificationCategories.includes('support'), 'support is a first-class notification category');
for (const category of ['marketplace', 'bookings', 'messages', 'payments', 'worker_account',
  'reviews', 'disputes', 'security', 'system'] as const) {
  check(notificationCategories.includes(category), `the pre-existing ${category} category is preserved`);
}
has(migrationSql, /insert into private\.notification_event_catalog/, 'support events are registered in the WPS-014 catalog');
for (const event of ['support_case_opened', 'support_case_assigned', 'support_case_replied',
  'support_case_resolved', 'support_case_reopened', 'support_survey_available',
  'staff_support_case_assigned', 'staff_support_customer_reply', 'staff_support_worker_reply']) {
  has(migrationSql, new RegExp(`'${event}'`), `${event} is catalogued`);
}
lacks(migrationSql, /create table[^;]*support_notifications/, 'no second notification table is created');
has(migrationSql, /private\.notify_staff\(/, 'staff alerts reuse the WPS-017 staff notification path');
// A support notification carries a pointer, never the customer's problem. The
// assertion is scoped to the notification builder itself: a case subject in an
// API response is correct, a case subject in a lock-screen payload is not.
const notifyStart = migrationSql.indexOf('function private.notify_support_participant');
const notifyEnd = migrationSql.indexOf('function private.support_ticket_before_insert');
const notifyBuilder = migrationSql.slice(notifyStart, notifyEnd);
check(notifyStart > 0 && notifyEnd > notifyStart && notifyBuilder.length < 2000,
  'the support notification builder was located and bounded for inspection');
has(notifyBuilder, /jsonb_build_object\('case_id', p_case_id\)/, 'a support notification carries only the case id');
lacks(notifyBuilder, /\bsubject\b/, 'no support notification payload carries a case subject');
lacks(notifyBuilder, /v_ticket\.|t\.body|p_body/, 'no support notification payload reads the case body');
// Staff alerts go through the WPS-017 helper, which takes only UUID payloads.
lacks(migrationSql, /notify_staff\([^;]*subject/, 'no staff alert payload carries a case subject');

// Push, tokens, and schedulers stay off.
lacks(migrationSql, /push_delivery_enabled\s*=\s*true/, 'WPS-019 enables no push delivery');
lacks(migrationSql, /token_registration_enabled\s*=\s*true/, 'WPS-019 enables no token registration');
lacks(migrationSql, /scheduler_enabled\s*=\s*true/, 'WPS-019 enables no scheduler');

// ---------------------------------------------------------------------------
// 5. Search — deterministic, bounded, and never generative
// ---------------------------------------------------------------------------
has(migrationSql, /websearch_to_tsquery\('simple'/, 'exact search uses Postgres full text');
has(migrationSql, /extensions\.word_similarity\(/, 'spelling tolerance uses trigram word similarity');
has(migrationSql, /'too_short'/, 'a short query is refused explicitly rather than scanned');
has(migrationSql, /'empty'/, 'an empty result is an explicit state');
has(migrationSql, /'approximate'/, 'an approximate result is labelled as approximate');
has(migrationSql, /having pg_catalog\.count\(distinct l\.user_id\) >= 5/,
  'popular searches are suppressed below five distinct accounts');
lacks(migrationSql, /openai|anthropic|embedding|gpt|llm/i, 'no AI or embedding service appears anywhere in search');
lacks(repository, /openai|anthropic|embedding|gpt|llm/i, 'the repository contacts no AI service');
has(migrationSql, /perform private\.enforce_rate_limit\('support_help_search'\)/, 'search is rate limited server-side');

// ---------------------------------------------------------------------------
// 6. Rate limiting reuses the WPS-018 limiter
// ---------------------------------------------------------------------------
for (const policy of ['support_case_reply', 'support_help_search', 'support_attachment_register',
  'support_case_reopen', 'support_article_feedback']) {
  has(migrationSql, new RegExp(`'${policy}'`), `${policy} declares a rate limit policy`);
}
has(migrationSql, /'wps018_limiter'/, 'every new policy names the WPS-018 limiter as its owner');
lacks(migrationSql, /'client_only_gap'/, 'no WPS-019 surface is left to a client-only limit');
lacks(migrationSql, /create table if not exists private\.rate_limit/, 'no second rate limiter is created');

// ---------------------------------------------------------------------------
// 7. Ticket lifecycle and reopen rules are server-decided
// ---------------------------------------------------------------------------
has(migrationSql, /'canReopen'/, 'the server states whether a case can be reopened');
has(migrationSql, /'canReply'/, 'the server states whether a case accepts replies');
has(migrationSql, /'canAttach'/, 'the server states whether a case accepts attachments');
has(migrationSql, /'surveyAvailable'/, 'the server states whether the survey is open');
has(migrationSql, /Only a resolved support case can be reopened/, 'a non-resolved case cannot be reopened');
has(migrationSql, /This support case cannot be reopened again/, 'the reopen ceiling is enforced');
has(migrationSql, /The reopen window for this support case has passed/, 'the reopen window is enforced');
has(migrationSql, /Only cases from the same requester can be merged/, 'cross-account merge is refused');
has(migrationSql, /merged_into_id is null or merged_into_id <> id/, 'a case cannot be merged into itself');
has(migrationSql, /support_tickets_satisfaction_check/, 'a satisfaction score is constrained to 1-5');
has(migrationSql, /reopened_count between 0 and 3/, 'the reopen ceiling is also a constraint');

// Service levels and notifications come from triggers, so the untouched
// WPS-017 RPCs get the full lifecycle without their bodies being rewritten.
has(migrationSql, /create trigger support_tickets_sla_defaults before insert/, 'service levels are applied on insert');
has(migrationSql, /create trigger support_messages_lifecycle after insert/, 'the first response is stamped from the message stream');
has(migrationSql, /create trigger support_tickets_lifecycle_notify after update/, 'status changes notify from the ticket itself');

// ---------------------------------------------------------------------------
// 8. Escalation points at the authoritative record; it never copies it
// ---------------------------------------------------------------------------
has(migrationSql, /support_tickets_linked_check/, 'a linked record is constrained to a known type');
has(migrationSql, /private\.support_linked_record_visible/, 'a link is refused unless the caller can see the record');
has(migrationSql, /Linked record not found/, 'an invisible linked record is refused');
lacks(migrationSql, /insert into public\.disputes/, 'WPS-019 never opens a dispute on a participant behalf');
lacks(migrationSql, /insert into public\.trust_reports/, 'WPS-019 never files an abuse report on a participant behalf');
lacks(migrationSql, /insert into public\.conversations|insert into public\.messages\b/, 'WPS-019 never writes to booking chat');

// ---------------------------------------------------------------------------
// 9. Types and contracts
// ---------------------------------------------------------------------------
is(supportCategories.length, 9, 'the WPS-017 category set is preserved exactly');
is(supportStatuses.length, 6, 'the WPS-017 status set is preserved exactly');
is(supportSurfaces.length, 15, 'every declared originating surface is typed');
is(supportLinkedTypes.length, 9, 'every linkable record type is typed');
is(supportLocales.length, 2, 'exactly two locales are supported');
is(supportAttachmentMaxBytes, 8 * 1024 * 1024, 'the attachment limit matches the bucket');
is(supportAttachmentMaxPerCase, 10, 'the per-case attachment ceiling matches the constraint');
is(supportReopenWindowDays, 14, 'the reopen window matches the server');
is(supportMaxReopens, 3, 'the reopen ceiling matches the server');
is(supportAttachmentMimeTypes.length, 4, 'exactly four attachment types are accepted');

// Support categories and statuses belong to WPS-017. WPS-019 must not restate
// them — a second definition is exactly the duplication this WPS forbids — so
// they are verified against their owning migration instead.
const wps017 = readFileSync('supabase/migrations/202608020005_wps017_operations_analytics_admin.sql', 'utf8');
for (const category of supportCategories) {
  has(wps017, new RegExp(`'${category}'`), `the ${category} category is still owned by WPS-017`);
}
for (const status of supportStatuses) {
  has(wps017, new RegExp(`'${status}'`), `the ${status} status is still owned by WPS-017`);
}
lacks(migrationSql, /add constraint support_tickets_category_check/,
  'WPS-019 does not redefine the WPS-017 category constraint');
lacks(migrationSql, /add constraint support_tickets_status_check/,
  'WPS-019 does not redefine the WPS-017 status constraint');
for (const surface of supportSurfaces) {
  has(migrationSql, new RegExp(`'${surface}'`), `the ${surface} surface exists in the database`);
}
for (const linked of supportLinkedTypes) {
  has(migrationSql, new RegExp(`'${linked}'`), `the ${linked} linked type exists in the database`);
}

is(supportAttachmentExtension('image/jpeg'), 'jpg', 'JPEG maps to a safe extension');
is(supportAttachmentExtension('application/pdf'), 'pdf', 'PDF maps to a safe extension');
is(supportAttachmentExtension('image/svg+xml'), null, 'an unsupported type has no extension');
is(supportAttachmentPath('u', 'c', 'f', 'pdf'), 'u/c/f.pdf', 'the attachment path binds user, case, and file');

is(helpSurfaceForRoute('/booking/123'), 'booking', 'a booking screen asks for booking help');
is(helpSurfaceForRoute('/conversation/123'), 'chat', 'a chat screen asks for messaging help');
is(helpSurfaceForRoute('/provider-earnings'), 'earnings', 'the earnings screen asks for earnings help');
is(helpSurfaceForRoute('/provider-verification'), 'verification', 'the verification screen asks for verification help');
is(helpSurfaceForRoute('/worker/verification'), 'verification', 'the canonical worker verification screen asks for verification help');
is(helpSurfaceForRoute('/worker/requests/quote-1'), 'marketplace', 'canonical worker requests ask for marketplace help');
is(helpSurfaceForRoute('/'), 'help_center', 'an unmapped route falls back to the general help centre');

// ---------------------------------------------------------------------------
// 10. Mock parity
// ---------------------------------------------------------------------------
is(mockHelpCategories.length, 12, 'Mock carries every help category');
is(mockHelpArticles.length, 29, 'Mock carries every help article');
for (const key of helpCategoryKeys) {
  check(mockHelpCategories.some(c => c.categoryKey === key), `Mock carries the ${key} category`);
  has(migrationSql, new RegExp(`'${key}'`), `the ${key} category is seeded in the database`);
}
for (const article of mockHelpArticles) {
  has(migrationSql, new RegExp(`'${article.slug}'`), `the ${article.slug} article is seeded in the database`);
  check(mockHelpCategories.some(c => c.categoryKey === article.categoryKey),
    `${article.slug} belongs to a real category in Mock`);
  for (const locale of supportLocales) {
    check(article.title[locale].trim().length > 2, `${article.slug} has a ${locale} title in Mock`);
    check(article.summary[locale].trim().length > 2, `${article.slug} has a ${locale} summary in Mock`);
  }
  // English and Arabic must be different strings; an untranslated copy is worse
  // than an obvious gap because it looks finished.
  check(article.title.en !== article.title.ar, `${article.slug} is genuinely translated, not copied`);
  for (const related of article.related) {
    check(mockHelpArticles.some(a => a.slug === related),
      `${article.slug} points at a real related article in Mock`);
  }
}
for (const category of mockHelpCategories) {
  check(category.title.en !== category.title.ar, `the ${category.categoryKey} category is genuinely translated`);
}

// Mock never reaches Supabase. The check is on imports and calls, not on prose:
// the file legitimately explains what Supabase mode does differently.
const mockState = readFileSync('src/support/mock-support-state.ts', 'utf8');
lacks(mockState, /^import .*(supabase|lib\/supabase)/im, 'Mock state imports no Supabase module');
lacks(mockState, /getSupabaseClient\s*\(/, 'Mock state never constructs a Supabase client');
lacks(mockState, /\.rpc\s*\(|\.from\s*\(|fetch\s*\(/, 'Mock state performs no network call of any kind');
const mockBranches = (repository.match(/environment\.dataMode === 'mock'/g) ?? []).length;
check(mockBranches >= 14, `every repository method has an explicit Mock branch (${mockBranches})`);
has(repository, /Staff actions are unavailable in Mock mode/, 'Mock refuses staff actions rather than faking them');
has(repository, /mockAccount\(accountKey\)/, 'every Mock read and write is scoped to an account key');

is(mockSupportMacros.filter(m => m.locale === 'en').length, 3, 'Mock carries English macros');
is(mockSupportMacros.filter(m => m.locale === 'ar').length, 3, 'Mock carries Egyptian Arabic macros');
is(mockResolutionReasons.en.length, mockResolutionReasons.ar.length,
  'both locales expose the same resolution reasons');
is(mockSlaPolicy.length, 4, 'Mock carries a service level for every priority');
for (const entry of mockSlaPolicy) {
  check(entry.resolutionHours >= entry.firstResponseHours,
    `${entry.priority} resolves no sooner than it responds`);
}

// ---------------------------------------------------------------------------
// 11. Account isolation
// ---------------------------------------------------------------------------
has(context, /loadedAccount === accountKey \? cases : \[\]/, 'cases render only for the account that loaded them');
has(context, /generation\.current/, 'a stale response is discarded rather than rendered');
has(context, /setCases\(\[\]\)/, 'an account change clears the case list first');
has(repository, /if \(!found\) throw new Error\('Support case not found'\)/,
  'a Mock case belonging to another account is simply not found');

// ---------------------------------------------------------------------------
// 12. Localization
// ---------------------------------------------------------------------------
const enKeys = Object.keys(supportCopy.en).sort();
const arKeys = Object.keys(supportCopy.ar).sort();
is(enKeys.join('|'), arKeys.join('|'), 'English and Egyptian Arabic expose exactly the same keys');
check(enKeys.length >= 60, `the support vocabulary is complete (${enKeys.length} keys)`);
for (const key of enKeys) {
  const en = supportCopy.en[key as keyof typeof supportCopy.en];
  const ar = supportCopy.ar[key as keyof typeof supportCopy.ar];
  check(en.trim().length > 0, `${key} has English copy`);
  check(ar.trim().length > 0, `${key} has Egyptian Arabic copy`);
  check(/[؀-ۿ]/.test(ar), `${key} is genuinely Arabic, not an English placeholder`);
}
for (const status of supportStatuses) {
  check(`status_${status}` in supportCopy.en, `${status} is labelled in English`);
  check(`status_${status}` in supportCopy.ar, `${status} is labelled in Egyptian Arabic`);
}
for (const category of supportCategories) {
  check(`category_${category}` in supportCopy.en, `${category} is labelled in English`);
  check(`category_${category}` in supportCopy.ar, `${category} is labelled in Egyptian Arabic`);
}

// The database ships both languages too, and the macros and reasons are bilingual.
has(migrationSql, /title_ar text not null/, 'a help category cannot exist without an Arabic title');
has(migrationSql, /label_en text not null,\s*label_ar text not null/, 'every resolution reason is bilingual');
has(migrationSql, /An English translation is required before publishing/,
  'an article cannot be published without an English body');

// The approved motto is never altered by WPS-019, and WPS-019 never restates it.
lacks(migration, /YOUR WORK, OUR MISSION/i, 'WPS-019 does not restate the motto in the migration');
const baseTranslations = readFileSync('src/i18n/translations.ts', 'utf8');
has(baseTranslations, /YOUR WORK, OUR MISSION/, 'the approved English motto is unchanged');
has(baseTranslations, /شغلك مهمتنا/, 'the approved Arabic motto is unchanged');
lacks(readFileSync('src/support/support-copy.ts', 'utf8'), /OUR MISSION|مهمتنا/i,
  'the support vocabulary does not duplicate the motto');

// ---------------------------------------------------------------------------
// 13. Accessibility and RTL
// ---------------------------------------------------------------------------
for (const [name, screen] of [
  ['help centre', helpScreen], ['article', articleScreen], ['case thread', caseScreen],
  ['new case', newCaseScreen], ['case list', casesScreen],
] as const) {
  has(screen, /accessibilityRole=/, `the ${name} screen declares accessibility roles`);
  has(screen, /accessibilityLabel=/, `the ${name} screen labels its controls`);
  has(screen, /isRTL && styles\.reverse|copy\.isRTL/, `the ${name} screen mirrors for RTL`);
}
has(helpScreen, /minHeight: 44/, 'the help centre keeps touch targets at 44 points');
has(caseScreen, /minHeight: 4[48]|minWidth: 48/, 'the case thread keeps touch targets large enough');
has(newCaseScreen, /accessibilityRole="radiogroup"/, 'the topic picker is announced as a group');
has(newCaseScreen, /accessibilityState=\{\{ selected: category === option \}\}/, 'the selected topic is announced');
has(caseScreen, /accessibilityRole="radiogroup"/, 'the satisfaction scale is announced as a group');
has(articleScreen, /body\.split\('\\n\\n'\)/, 'article paragraphs are separate blocks for screen readers');
has(helpScreen, /chevron-left' : 'chevron-right'/, 'the disclosure chevron follows reading direction');
has(caseScreen, /accessibilityRole="alert"|error=\{actionError/, 'errors reach a screen reader');

// ---------------------------------------------------------------------------
// 14. Wiring
// ---------------------------------------------------------------------------
has(rootLayout, /<SupportProvider>/, 'the support provider is mounted');
has(rootLayout, /Stack\.Screen name="help\/index"/, 'the help centre index is registered as a route');
has(rootLayout, /Stack\.Screen name="support\/index"/, 'the support index is registered as a route');
has(readFileSync('app/(tabs)/profile.tsx', 'utf8'), /router\.push\('\/help'\)/, 'the profile tab reaches the help centre');
has(readFileSync('app/(tabs)/profile.tsx', 'utf8'), /router\.push\('\/support'\)/, 'the profile tab reaches support cases');
has(readFileSync('src/notifications/notification-context.tsx', 'utf8'),
  /case 'support_case':/, 'a support notification opens the case it points at');

// The staff surface is capability-gated in the client too, and says plainly
// that the client gate is not the security boundary.
// Administration is web-only — see docs/constitution/cross-platform-parity.md.
// The staff support queue moved to admin.usewarsha.com, where the console suite asserts its capability gate.
// Its absence from mobile is the assertion that remains here.
check(!existsSync('app/admin/support.tsx'), 'THE MOBILE STAFF SUPPORT QUEUE IS GONE');

// ---------------------------------------------------------------------------
// 15. Documentation
// ---------------------------------------------------------------------------
has(audit, /what already exists/i, 'the audit records what already existed');
has(audit, /dormant/i, 'the audit records what was dormant');
has(audit, /duplicated/i, 'the audit records what would have been duplicated');
has(audit, /must remain unchanged/i, 'the audit records what must not change');
has(audit, /support_tickets/, 'the audit names the pre-existing tables');
has(wps, /LOCKED/, 'WPS-019 is locked');
has(wes, /WES-019/, 'WES-019 exists');
has(wps, /NOT RUN/, 'WPS-019 states that manual acceptance has not run');
has(readFileSync('docs/wps/WPS-INDEX.md', 'utf8'), /WPS-019/, 'the index registers WPS-019');

const manual = readFileSync('docs/testing/WPS-019-MANUAL-ALPHA.md', 'utf8');
const results = readFileSync('docs/testing/WPS-019-MANUAL-RESULTS.md', 'utf8');
has(manual, /NOT RUN/, 'every manual case starts NOT RUN');
has(results, /NOT RUN/, 'the results file records NOT RUN');
lacks(results, /\bPASS\b/, 'no manual case is recorded as passed');
check(!/\|\s*(PASSED|passed)\s*\|/.test(results), 'no manual case is recorded as passing');

// The pgTAP suite covers the security properties, not just the happy path.
has(pgTap, /another account cannot read a case it does not own/, 'cross-account denial is asserted');
has(pgTap, /an anonymous caller cannot/, 'anonymous denial is asserted');
has(pgTap, /an internal note never reaches the requester/, 'private notes are asserted');
has(pgTap, /a verification reviewer cannot open the support queue/, 'narrow-role denial is asserted');
has(pgTap, /the third search is refused by the server/, 'rate limiting is asserted');
has(pgTap, /search never returns a draft or archived article/, 'unpublished content is asserted unreachable');
has(pgTap, /every published article has an Egyptian Arabic body/, 'complete localization is asserted');

// ---------------------------------------------------------------------------
// The same support case, in a browser
// ---------------------------------------------------------------------------
//
// The web support page had no reply box because an earlier audit concluded
// `reply_support_case` and `get_my_support_cases` had never shipped. They had:
// both are defined in WPS-017 and granted in the same migration, and the audit
// missed them because it only matched single-line function signatures. These
// checks make that conclusion impossible to reach again by accident.

const webSupport = readFileSync('web/lib/support.ts', 'utf8');
const webSupportPage = readFileSync('web/app/app/support/page.tsx', 'utf8');
const webCopy = readFileSync('web/lib/app-copy.ts', 'utf8');

/** Present in BOTH language blocks of the web dictionary, not only English. */
const inBothLanguages = (key: string) => webCopy.split(`${key}:`).length === 3;

// The authority exists. Asserted against the migration, not against a memory.
has(wps017, /create or replace function public\.reply_support_case\(p_case_id uuid, p_body text, p_idempotency_key text\)/,
  'reply_support_case IS DEFINED IN WPS-017');
has(wps017, /create or replace function public\.get_my_support_cases\(\)/,
  'get_my_support_cases IS DEFINED IN WPS-017');
has(wps017, /'public\.reply_support_case\(uuid,text,text\)'/,
  'and reply_support_case is granted');
has(wps017, /'public\.get_my_support_cases\(\)'/,
  'and get_my_support_cases is granted');

// So the web must call them.
has(webSupportPage, /rpc\('reply_support_case'/, 'THE WEB SUPPORT PAGE CAN ACTUALLY REPLY');
has(webSupportPage, /rpc\('get_my_support_cases'/, 'and lists cases through the governed RPC');
has(webSupportPage, /rpc\('get_my_support_case'/, 'and opens one through the governed RPC');
has(webSupportPage, /rpc\('reopen_support_case'/, 'and can reopen where the server allows it');
has(webSupportPage, /rpc\('submit_support_satisfaction'/, 'and can rate a finished case');

// The stale claim must not come back.
lacks(webSupport, /do not exist|was never shipped|never shipped/i,
  'the web support module no longer claims those RPCs are missing');
lacks(webSupportPage, /never shipped|nowhere to send it/i,
  'and neither does the page');
lacks(webCopy, /supportReplyByEmail/,
  'and the "replies arrive by email" copy is gone, because replies now happen here');

// Permission is asked, not computed. The reopen rule alone is three conditions
// including a fourteen-day window; a client that re-derives it will drift.
has(webSupportPage, /detail\.canReply/, 'REPLYING IS OFFERED ONLY WHEN THE SERVER SAYS canReply');
has(webSupportPage, /detail\.canReopen/, 'and reopening only when the server says canReopen');
has(webSupportPage, /detail\.surveyAvailable/, 'and the survey only when the server offers it');
lacks(webSupportPage, /status === 'resolved' &&/,
  'and the page never re-derives the reopen rule for itself');

// Limits are transcribed from the server's own constraints.
has(wps017, /pg_catalog\.length\(pg_catalog\.btrim\(coalesce\(p_body,''\)\)\) not between 1 and 4000/,
  'the server bounds a reply at 4000 characters');
has(webSupport, /REPLY_MAX = 4000/, 'and the web uses that same bound');
has(webSupport, /REOPEN_MAX = 2000/, 'and the reopen reason bound the server states');

// Vocabulary comes from the shared module, so both surfaces offer one set.
has(webSupport, /from '\.\.\/\.\.\/src\/support\/support-types\.ts'/,
  'THE WEB READS THE SHARED SUPPORT VOCABULARY RATHER THAN RESTATING IT');
lacks(webSupport, /'account_access', 'booking_help'/,
  'so the category list exists in exactly one place');

// Idempotency: a double send must not post the paragraph twice.
has(wps017, /select m\.id into v_existing from public\.support_messages m/,
  'the server dedupes a reply on its idempotency key');
has(webSupportPage, /p_idempotency_key: idempotencyKey/, 'and the web always sends one');
has(webSupportPage, /setIdempotencyKey\(newIdempotencyKey\(\)\)/,
  'and takes a fresh key only after a send succeeds');

// Staff-only material is never sent to a participant, at the source.
has(wps017, /where m\.ticket_id = t\.id and m\.visibility = 'participants'/,
  'the list RPC returns only participant-visible messages');
// Comments stripped: the rule is about what the CODE does. A comment
// explaining that staff notes never arrive is not the page filtering them.
const webSupportCode = webSupportPage
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
lacks(webSupportCode, /internal|staff_only|visibility/i,
  'so the browser has no staff-only material to filter, and does not pretend to');
has(webSupportPage, /supportFromWarsha/,
  'and Warsha’s side of a conversation is labelled by role, never by a staff name');

// Both languages, as always.
for (const key of ['supportReplyLabel', 'supportSendReply', 'supportReopenAction',
  'supportHistory', 'supportRateLabel', 'supportCaseClosed', 'supportFromWarsha',
  'supportReopenExhausted', 'supportReopenWindowPassed']) {
  check(inBothLanguages(key), `the web says "${key}" in both languages`);
}

// Every status and action the server can produce has a sentence.
for (const status of supportStatuses) {
  check(inBothLanguages(`supportStatus_${status}`),
    `and names the "${status}" status in both languages`);
}
for (const action of ['opened', 'replied', 'status_changed', 'escalated', 'resolved', 'closed']) {
  check(inBothLanguages(`supportAction_${action}`),
    `and the "${action}" history entry in both languages`);
}

console.log(`WPS-019 customer support: ${checks} checks passed.`);
