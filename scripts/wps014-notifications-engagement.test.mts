import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isQuietTime, notificationAccountId, notificationDefinition } from '../src/notifications/notification-policy.ts';
import { externalNotificationPreview, pushCapability, pushDeliveryPolicy, simulateMockPush } from '../src/notifications/notification-push-adapter.ts';
import { notificationCategories } from '../src/notifications/notification-types.ts';

const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

const migration = read('supabase/migrations/202608020002_wps014_notifications_engagement.sql');
const repository = read('src/notifications/notification-repository.ts');
const context = read('src/notifications/notification-context.tsx');
const screen = read('app/notifications.tsx');
const preferences = read('app/notification-preferences.tsx');
const translations = read('src/notifications/notification-engagement-translations.ts');
const pushAdapter = read('src/notifications/notification-push-adapter.ts');
const reminderSimulation = read('src/notifications/notification-reminder-simulation.ts');
const realtime = read('src/realtime/realtime-service.ts');
const marketplaceMock = read('src/marketplace-intelligence/mock-marketplace-repository.ts');
const header = read('components/warsha/Header.tsx');
const providerOverlay = read('components/warsha/ProviderModeOverlay.tsx');
const wps = read('docs/wps/WPS-014-notifications-engagement.md');
const wes = read('docs/wes/WES-014-notifications-engagement.md');
const index = read('docs/wps/WPS-INDEX.md');
const packageJson = read('package.json');
const supabaseRepositorySection = repository.slice(repository.indexOf('const supabaseRepository'));

equal(notificationCategories.length, 9, 'nine product categories are explicit');
for (const category of notificationCategories) {
  match(migration, new RegExp(`'${category}'`), `${category} is database constrained`);
  match(translations, new RegExp(`${category}:`), `${category} is localized`);
  const preview = externalNotificationPreview(category);
  ok(preview.length > 10, `${category} has a generic external preview`);
  notMatch(preview, /@|\+20|card|wallet|address|filename/i, `${category} preview contains no obvious private value`);
}

for (const priority of ['critical', 'action_required', 'important', 'informational'] as const) {
  match(migration, new RegExp(`'${priority}'`), `${priority} is database constrained`);
  const definition = notificationDefinition(priority === 'critical' ? 'payment_failed' : priority === 'action_required' ? 'quote_selected' : priority === 'important' ? 'booking_confirmed' : 'booking_message');
  equal(definition.priority, priority, `${priority} policy is deterministic`);
}

const message = notificationDefinition('booking_message');
equal(message.category, 'messages', 'message category is normalized');
equal(message.groupFamily, 'conversation', 'messages group by conversation');
equal(message.routeType, 'conversation', 'message route is typed');
equal(message.mandatoryInApp, false, 'ordinary message category can be controlled');
const quote = notificationDefinition('quote_received');
equal(quote.groupFamily, 'marketplace_quotes', 'quote arrivals group by request');
equal(quote.routeType, 'marketplace_request', 'quote route is typed');
const selected = notificationDefinition('quote_selected');
equal(selected.audience, 'worker', 'selected quote is worker scoped');
equal(selected.requiredAction, true, 'selected quote requires action');
equal(selected.mandatoryInApp, true, 'selected quote cannot be silenced in-app');
equal(notificationDefinition('marketplace_booking_confirmed').routeType, 'booking', 'confirmed marketplace request routes to booking');
equal(notificationDefinition('review_unlocked').category, 'reviews', 'review opportunity uses reviews category');
equal(notificationDefinition('review_unlocked').audience, 'customer', 'review opportunity is customer scoped');
equal(notificationDefinition('verification_expired').priority, 'action_required', 'expired verification requires worker action');
const payment = notificationDefinition('payment_failed');
equal(payment.category, 'payments', 'payment failure remains financial');
equal(payment.priority, 'critical', 'payment failure priority is critical');
equal(payment.mandatoryInApp, true, 'financial failure is mandatory in-app');
const security = notificationDefinition('password_changed');
equal(security.category, 'security', 'password change is security');
equal(security.priority, 'critical', 'password change is critical');
equal(notificationAccountId('mock', undefined, 'customer'), 'mock-customer', 'Mock customer has isolated account key');
equal(notificationAccountId('mock', undefined, 'provider'), 'mock-user', 'Mock worker has isolated account key');
equal(notificationAccountId('supabase', 'account-1', 'customer'), 'account-1', 'Supabase uses authenticated account');

equal(isQuietTime(new Date(2026, 7, 2, 23, 0), '22:00', '06:00'), true, 'cross-midnight late segment is quiet');
equal(isQuietTime(new Date(2026, 7, 2, 5, 30), '22:00', '06:00'), true, 'cross-midnight early segment is quiet');
equal(isQuietTime(new Date(2026, 7, 2, 12, 0), '22:00', '06:00'), false, 'cross-midnight daytime is not quiet');
equal(isQuietTime(new Date(2026, 7, 2, 10, 0), '09:00', '17:00'), true, 'same-day window is quiet');
equal(isQuietTime(new Date(2026, 7, 2, 18, 0), '09:00', '17:00'), false, 'same-day outside is not quiet');
equal(isQuietTime(new Date(), '22:00', '22:00'), false, 'equal endpoints fail closed');
equal(isQuietTime(new Date(), 'bad', '06:00'), false, 'malformed time fails closed');

equal(pushCapability.available, false, 'push capability is unavailable');
equal(pushCapability.provider, 'disabled', 'push provider is disabled');
equal(pushCapability.tokenRegistration, false, 'token registration is disabled');
equal(pushCapability.delivery, false, 'delivery is disabled');
equal(pushCapability.scheduler, false, 'scheduler is disabled');
equal(pushDeliveryPolicy({ priority: 'critical', quietHoursActive: false, pushPreference: true }).state, 'disabled', 'even critical push fails closed without provider');
equal(simulateMockPush('messages').state, 'simulation_only', 'Mock push is explicitly simulation only');
equal(simulateMockPush('messages').delivered, false, 'Mock push never claims delivery');
notMatch(pushAdapter, /fetch\(|axios|expo-notifications|ExponentPushToken|fcm|apns|onesignal/i, 'push adapter has no provider import or network request');
match(reminderSimulation, /review_unlocked: \{ policyKey: 'review_opportunity', delayHours: 48 \}/, 'review reminder simulation uses a conservative delay');
match(reminderSimulation, /maxAttempts: 2 as const/, 'Mock reminder simulation caps attempts');
match(translations, /booking_approaching: 'Your confirmed booking is approaching\.'/,'English reminder copy is explicit');
match(translations, /booking_approaching: 'ميعاد الحجز المؤكد قرب\.'/,'Egyptian Arabic reminder copy is explicit');
match(reminderSimulation, /warsha:notification-reminder-simulations:v1:\$\{accountId\}/, 'Mock reminder ledger is account scoped');
match(reminderSimulation, /review_submitted: \['review_opportunity'\]/, 'Mock review completion suppresses its reminder');
notMatch(reminderSimulation, /setTimeout|setInterval|fetch\(/, 'Mock reminder ledger has no scheduler or network call');

for (const eventKey of ['marketplace_booking_confirmed','review_unlocked','verification_expired','cash_debt_threshold_warning','review_publication_held','dispute_response_required']) {
  equal((translations.match(new RegExp(`^    ${eventKey}:`, 'gm')) ?? []).length, 2, `${eventKey} has English and Egyptian Arabic event copy`);
}

for (const column of ['event_key','category','priority','audience','action_type','route_type','resource_id','source_key','source_event_id','group_family','group_key','group_count','required_action','last_event_at','archived_at']) match(migration, new RegExp(`add column if not exists ${column}`), `${column} extends the existing table`);
match(migration, /create trigger notifications_prepare_wps014 before insert on public\.notifications/, 'one shared insert normalization trigger exists');
match(migration, /private\.notification_safe_payload/, 'payload sanitation is centralized');
for (const prohibited of ['message','address','file_name','phone','email','amount','staff_note','evidence']) notMatch(migration.match(/function private\.notification_safe_payload[^]*?\$\$;/)?.[0] ?? '', new RegExp(`'${prohibited}'`), `${prohibited} is not allowlisted in payload sanitizer`);
match(migration, /pg_advisory_xact_lock/, 'group updates serialize races');
match(migration, /unique\(user_id,source_key\)/, 'source links enforce recipient/source uniqueness');
match(migration, /notifications_open_group_unique_idx/, 'open groups have a database uniqueness guard');
match(migration, /on conflict\(user_id,source_key\) do nothing/, 'source retries are idempotent');
match(migration, /legacy_operation_milestone.*provider_on_the_way.*provider_arrived.*job_started.*work_in_progress.*completed/s, 'five legacy milestones suppress coarse duplicate notification');
notMatch(migration, /drop table public\.notifications|create table public\.notification_events/, 'no parallel durable event system replaces notifications');

for (const rpc of ['get_my_notifications','get_my_notification_counts','mark_notification_read','mark_all_notifications_read','archive_notification','get_my_notification_preferences','update_my_notification_preferences','resolve_notification_route','register_push_token','revoke_push_token','revoke_my_push_tokens']) match(migration, new RegExp(`function public\\.${rpc}`), `${rpc} is implemented`);
match(migration, /revoke insert,update,delete on public\.notifications from authenticated/, 'direct notification writes are revoked');
match(migration, /revoke insert,update,delete on public\.notification_preferences from authenticated/, 'direct preference writes are revoked');
match(migration, /set search_path=''/, 'security functions pin empty search path');
match(migration, /Push token registration is disabled/, 'token boundary fails closed explicitly');
match(migration, /scheduler_enabled boolean not null default false/, 'scheduler defaults off');
match(migration, /push_delivery_enabled boolean not null default false/, 'delivery defaults off');
match(migration, /private\.notification_action_is_open/, 'archive checks source action state');
match(migration, /Resolve this action before archiving it/, 'unresolved actions cannot disappear');
match(migration, /pg_timezone_names/, 'timezone is database validated');
match(migration, /quiet_hours_start<preference\.quiet_hours_end/, 'same-day and cross-midnight policy is explicit');
match(migration, /policy_key='booking_approaching'/, 'approaching-booking reminder jobs are prepared');
match(migration, /suppress_notification_reminders_from_event/, 'terminal notification events suppress reminders');
match(migration, /suppress_review_opportunity_reminder/, 'submitted review suppresses opportunity reminder');
match(migration, /notification_deduplicated.*notification_grouped.*notification_archived/s, 'privacy-safe operational metrics cover dedupe, grouping, and archive');

match(repository, /environment\.dataMode === 'supabase' \? supabaseRepository : mockRepository/, 'repository selection is static');
notMatch(supabaseRepositorySection, /mockRead\(|mockWrite\(|mockRepository\./, 'Supabase errors do not fall back to Mock');
match(repository, /warsha:notifications:\$\{VERSION\}:\$\{accountId\}/, 'Mock inbox is account scoped');
match(repository, /warsha:notification-preferences:\$\{VERSION\}:\$\{accountId\}/, 'Mock preferences are account scoped');
match(repository, /grouped\.groupCount \+= 1/, 'Mock grouping updates count');
match(repository, /item\.requiredAction && item\.actionOpen/, 'Mock unresolved archive guard mirrors server');
match(repository, /resolveRoute/, 'Mock and Supabase expose typed route resolution');
match(repository, /pushEnabled: false, pushAvailable: false/, 'Mock preferences do not pretend push exists');
match(marketplaceMock, /createMockNotification\('quote_received'/, 'Mock marketplace produces quote notifications');
match(marketplaceMock, /createMockNotification\('quote_selected'/, 'Mock marketplace produces selection notification');
match(marketplaceMock, /createMockNotification\('request_cancelled'/, 'Mock marketplace produces cancellation notification');

match(context, /provider\.mode === 'provider' \? 'worker' : 'customer'/, 'current app mode scopes the inbox');
match(context, /generation\.current/, 'stale async completions are invalidated');
match(context, /setItems\(\[\]\).*setCounts\(emptyCounts\)/s, 'scope switch clears old rows and counts');
match(context, /setTimeout\([^]*120\)/, 'Realtime bursts are coalesced');
match(context, /item\.groupCount > previous\.groupCount/, 'group updates can produce one reconciled foreground banner');
match(context, /realtimeService\.notifications/, 'central Realtime helper is reused');
match(context, /AppState\.addEventListener/, 'foreground reconciliation exists');
match(context, /unsubscribe\(\)/, 'Realtime cleanup is explicit');
match(context, /resolveRoute[^]*markRead/, 'opening revalidates route before navigation');
notMatch(context, /Linking\.openURL|window\.location|href=/, 'notification context cannot navigate arbitrary URLs');

match(screen, /notificationCategories\.map/, 'unified center exposes category filters');
match(screen, /state\.setArchived/, 'unified center exposes archive history');
match(screen, /accessibilityRole="tab"/, 'filters expose tab semantics');
match(screen, /accessibilityLabel=\{accessibility\}/, 'rows announce composite state');
match(screen, /item\.groupCount/, 'group count is visible and announced');
match(screen, /item\.actionOpen/, 'required actions show a non-color lock state');
match(preferences, /pushUnavailable/, 'preference UI truthfully labels disabled push');
match(preferences, /mandatory\.has\(category\)/, 'mandatory categories cannot be misleadingly disabled');
match(preferences, /validTime/, 'quiet-hour input is locally validated');
match(preferences, /minHeight: 48/, 'time inputs meet touch target baseline');
match(realtime, /select: \['id'\]/, 'Realtime payload requests identifiers only');
match(header, /chatUnreadCount/, 'customer header renders authoritative chat badge count');
match(providerOverlay, /chatUnreadCount/, 'worker overlay renders authoritative chat badge count');

for (const phrase of ['Version | 1.0','LOCKED FOR IMPLEMENTATION','WPS-001 through WPS-013','No AI-generated','No ranking','stable source key','quiet hours','fails closed']) match(wps, new RegExp(phrase, 'i'), `WPS includes ${phrase}`);
for (const phrase of ['ENGINEERING BASELINE','202608020002_wps014_notifications_engagement.sql','private.notification_source_links','resolve_notification_route','Mock']) match(wes, new RegExp(phrase, 'i'), `WES includes ${phrase}`);
match(index, /WPS-014-notifications-engagement\.md/, 'authority index registers WPS-014');
match(index, /WES-014-notifications-engagement\.md/, 'authority index registers WES-014');
match(packageJson, /"test:wps014"/, 'package exposes WPS-014 regression command');

for (const path of ['docs/testing/WPS-014-ACCEPTANCE-EVIDENCE.md','docs/testing/WPS-014-MANUAL-ALPHA.md','docs/testing/WPS-014-MANUAL-RESULTS.md']) ok(read(path).length > 500, `${path} exists with evidence content`);
for (const doc of ['WPS-001','WPS-002','WPS-003','WPS-004','WPS-005','WPS-006','WPS-007','WPS-008','WPS-009','WPS-010','WPS-011','WPS-012','WPS-013']) {
  const file = read(`docs/wps/${doc}-${({ 'WPS-001':'foundation-authentication','WPS-002':'customer-experience','WPS-003':'independent-worker-experience','WPS-004':'booking-lifecycle','WPS-005':'realtime-notifications','WPS-006':'trust-reviews-verification','WPS-007':'financial-system','WPS-008':'marketplace-intelligence','WPS-009':'communication-collaboration','WPS-010':'worker-profiles-portfolio','WPS-011':'reviews-reputation','WPS-012':'job-execution-operations','WPS-013':'disputes-resolution' } as Record<string,string>)[doc]}.md`);
  match(file, /WPS-014/, `${doc} cross-references WPS-014`);
}

console.log(`WPS-014 notification contracts: ${checks} checks passed.`);
