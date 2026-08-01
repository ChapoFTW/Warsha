import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPLETED_CHAT_WINDOW_MS,
  isBookingChatActivated,
  isBookingChatWritable,
} from '../src/chat/chat-lifecycle.ts';
import {
  disabledCommunicationCapabilities,
  likelyOffPlatformContact,
  safeAttachmentName,
} from '../src/chat/communication-policy.ts';
import { ABUSE_CATEGORIES, QUICK_REPLY_KEYS } from '../src/chat/chat-types.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const confirmedAt = '2026-08-01T08:00:00.000Z';
const confirmed = { status: 'confirmed' as const, history: [{ status: 'confirmed' as const, at: confirmedAt }] };
const completed = { status: 'completed' as const, history: [...confirmed.history, { status: 'completed' as const, at: confirmedAt }] };

assert.equal(isBookingChatActivated({ status: 'pending_provider_approval', history: [] }), false, 'preselection booking does not activate chat');
assert.equal(isBookingChatActivated({ status: 'accepted', history: [] }), false, 'worker acceptance alone does not activate chat');
assert.equal(isBookingChatActivated(confirmed), true, 'confirmed booking activates chat');
assert.equal(isBookingChatActivated({ status: 'cancelled', history: confirmed.history }), true, 'cancelled confirmed booking preserves readable history');
assert.equal(isBookingChatWritable({ status: 'cancelled', history: confirmed.history }), false, 'cancelled booking locks immediately');
assert.equal(isBookingChatWritable(completed, Date.parse(confirmedAt) + COMPLETED_CHAT_WINDOW_MS - 1), true, 'completed chat is writable before 48 hours');
assert.equal(isBookingChatWritable(completed, Date.parse(confirmedAt) + COMPLETED_CHAT_WINDOW_MS), false, 'completed chat locks exactly at 48 hours');
assert.equal(isBookingChatWritable({ status: 'disputed', history: completed.history }, Date.parse(confirmedAt) + 1000), true, 'current disputed behavior preserves the completion-based window');
assert.equal(isBookingChatWritable({ status: 'disputed', history: confirmed.history }, Date.parse(confirmedAt) + 1000), false, 'disputed chat without completion evidence fails closed');

assert.equal(likelyOffPlatformContact('Call me on +20 100 123 4567'), true, 'Egyptian phone pattern is recognized');
assert.equal(likelyOffPlatformContact('كلمني على واتساب'), true, 'Arabic WhatsApp pattern is recognized');
assert.equal(likelyOffPlatformContact('Please bring the replacement part'), false, 'ordinary coordination is not flagged');
assert.equal(safeAttachmentName('../../unsafe\u0000name.pdf'), '..-..-unsafe-name.pdf', 'display filename removes path/control characters');
assert.equal(QUICK_REPLY_KEYS.length, 6, 'quick reply set is bounded');
assert.equal(ABUSE_CATEGORIES.length, 9, 'safety report category set is bounded');
assert.equal(disabledCommunicationCapabilities(confirmed as never).callRelayAvailable, false, 'call relay fails closed');

const migration = read('supabase/migrations/202608010003_wps009_communication_collaboration.sql');
for (const contract of [
  'send_booking_message_v2',
  'get_my_booking_conversations',
  'get_booking_communication_capabilities',
  'request_booking_call_relay',
  'report_booking_communication_abuse',
  'booking_abuse_reports',
  'off_platform_reminder',
  "'status'",
  "'running_late'",
]) assert.ok(migration.includes(contract), `${contract} is implemented by the forward migration`);
assert.match(migration, /call_relay_mode text not null default 'disabled'/, 'telephony defaults to disabled');
assert.match(migration, /message_retention_days integer/, 'retention remains explicit and policy-controlled');
assert.match(migration, /on conflict\(user_id,type,dedupe_key\)/, 'message notification insertion is deduplicated');
assert.doesNotMatch(migration, /tel:|Linking\.openURL|message_text|phone_number/, 'migration exposes no dialer, phone number, or message text notification payload');

const conversation = read('app/conversation/[bookingId].tsx');
assert.match(conversation, /DocumentPicker\.getDocumentAsync/, 'conversation supports SDK 54 document picking');
assert.match(conversation, /copyToCacheDirectory: true/, 'picked PDFs are immediately readable by Expo FileSystem');
assert.match(conversation, /accessibilityState=\{\{ disabled: true \}\}/, 'secure call control is visibly and accessibly disabled');
assert.doesNotMatch(conversation, /tel:|Linking\.openURL/, 'conversation never invokes a real dialer');

const activeBrandSources = [
  read('src/i18n/translations.ts'),
  read('scripts/render-brand-assets.ps1'),
  read('public/manifest.webmanifest'),
  read('app/+html.tsx'),
  read('src/notifications/notification-translations.ts'),
].join('\n');
assert.match(activeBrandSources, /YOUR WORK, OUR MISSION/, 'approved English motto is active');
assert.match(activeBrandSources, /شغلك مهمتنا/, 'approved Arabic motto is active');
assert.doesNotMatch(activeBrandSources, /YOUR BUSINESS\. MORE JOBS\.|YOUR WORK\. OUR MISSION\.|Warsha finishes your work safely, for the fairest price\./, 'active brand surfaces contain no superseded motto');
assert.match(read('docs/constitution/Warsha-Constitution.md'), /Warsha finishes your work safely, for the fairest price\./, 'Constitution mission statement remains allowed');

console.log('WPS-009 communication checks passed: lifecycle, privacy, attachments, reports, relay, notifications, and motto.');
