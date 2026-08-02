import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { activeDisputeStates, DISPUTE_REASONS, DISPUTE_STATES } from '../src/disputes/dispute-types.ts';

const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

const migration = read('supabase/migrations/202608020001_wps013_disputes_resolution.sql');
const repository = read('src/disputes/dispute-repository.ts');
const mockState = read('src/disputes/mock-dispute-state.ts');
const reviewRepository = read('src/reviews/review-repository.ts');
const chatRepository = read('src/chat/chat-repository.ts');
const types = read('src/disputes/dispute-types.ts');
const panel = read('components/warsha/BookingDisputePanel.tsx');
const translations = read('src/disputes/dispute-translations.ts');
const notifications = read('src/notifications/notification-translations.ts');
const chat = read('src/chat/chat-translations.ts');
const conversation = read('app/conversation/[bookingId].tsx');
const customer = read('app/booking/[id].tsx');
const worker = read('app/provider-job/[id].tsx');
const realtime = read('src/realtime/realtime-service.ts');
const wps = read('docs/wps/WPS-013-disputes-resolution.md');
const wes = read('docs/wes/WES-013-disputes-resolution.md');
const index = read('docs/wps/WPS-INDEX.md');

equal(DISPUTE_REASONS.length, 10, 'all ten approved reasons exist');
equal(DISPUTE_STATES.length, 10, 'all ten lifecycle states exist');
equal(activeDisputeStates.length, 6, 'active state set is explicit');
for (const reason of DISPUTE_REASONS) {
  match(types, new RegExp(`'${reason}'`), `${reason} is typed`);
  match(translations, new RegExp(`reason_${reason}`), `${reason} is localized`);
}
for (const state of DISPUTE_STATES) {
  match(types, new RegExp(`'${state}'`), `${state} is typed`);
  match(translations, new RegExp(`state_${state}`), `${state} is localized`);
}

for (const rpc of ['get_booking_dispute','create_booking_dispute_draft','submit_booking_dispute','respond_booking_dispute','register_dispute_evidence','withdraw_booking_dispute','assign_booking_dispute','request_dispute_evidence','start_dispute_review','add_dispute_staff_note','resolve_booking_dispute','reject_booking_dispute','close_booking_dispute']) {
  match(migration, new RegExp(`function public\\.${rpc}`), `${rpc} is implemented`);
  match(repository, new RegExp(`['"]${rpc}['"]`), `${rpc} is called through the repository`);
}
match(migration, /disputes_one_active_booking_idx/, 'one active case is database enforced');
match(migration, /status in \('resolved','closed','rejected'\)/, 'decided cases cannot be reopened as another dispute');
match(migration, /private\.dispute_eligible_until/, 'eligibility is server authoritative');
match(migration, /private\.dispute_policy_config/, 'eligibility and upload limits are configurable');
match(migration, /'operationEvents'.*booking_operation_events/, 'inspection and checklist evidence remains linked through WPS-012');
match(migration, /'attachments'.*booking_attachments/, 'booking attachment source key matches the client projection');
match(migration, /'messages'.*public\.messages/, 'conversation source key matches the client projection');
match(migration, /private\.dispute_can_transition/, 'server owns state transitions');
match(migration, /dispute_events_immutable/, 'case history is immutable');
match(migration, /on conflict\(dispute_id,idempotency_key\) do nothing/, 'event retries never update immutable history');
match(migration, /visibility in \('participants','staff'\)/, 'staff-private event visibility is explicit');
match(migration, /resolution_type.*partial_compensation/, 'approved outcomes are constrained');
match(migration, /process_financial_refund/, 'pre-release compensation delegates to WPS-007');
match(migration, /create_post_release_financial_case/, 'post-release compensation delegates to WPS-007');
notMatch(migration, /insert into public\.financial_ledger_entries/, 'dispute flow does not invent ledger entries');
match(migration, /private\.create_dispute_return_visit/, 'return resolution has a bounded integration helper');
match(migration, /insert into public\.booking_return_visits/, 'return resolution reuses WPS-012 table');
notMatch(migration, /insert into public\.bookings[^]*resolution_type/, 'resolution does not create another booking');
match(migration, /dispute_publication_hold_id/, 'review publication hold is explicit and auditable');
match(migration, /moderation_status='flagged'/, 'submitted cases use existing WPS-011 non-public state');
match(migration, /when p_action='hide' then 'hidden'/, 'staff-hidden reviews remain distinct');
notMatch(migration, /update public\.provider_profiles[^]*(rating|rank|confidence)/i, 'disputes never manipulate reputation or ranking');

match(migration, /insert into public\.conversations/, 'communication reuses WPS-009 conversation');
match(migration, /'dispute_response'/, 'participant responses carry immutable source provenance');
match(migration, /new\.visibility='staff'/, 'internal notes do not enter conversation projection');
match(migration, /source_event_id/, 'projected messages reference case events');
for (const type of ['dispute_opened','dispute_evidence_requested','dispute_evidence_submitted','dispute_under_review','dispute_resolved','dispute_closed']) {
  match(migration, new RegExp(type), `${type} is durable`);
  match(notifications, new RegExp(type), `${type} is localized`);
}
match(migration, /'dispute:'\|\|new\.id/, 'notification dedupe uses immutable event identity');
match(chat, /dispute_evidence_requested/, 'case system messages are localized');
match(conversation, /event\.startsWith\('dispute_'\)/, 'conversation renders localized case events');

match(migration, /'dispute-evidence','dispute-evidence',false/, 'evidence bucket remains private');
match(migration, /8388608/, 'server evidence limit is 8 MB');
for (const mime of ['image/jpeg','image/png','image/webp','image/heic','application/pdf']) match(migration, new RegExp(mime.replace('/', '\\/')), `${mime} is server allowed`);
match(migration, /owner_id<>uid::text/, 'registration validates authoritative object owner');
match(migration, /content_hash/, 'duplicate content has a server identity');
match(migration, /dispute_evidence_hash_unique/, 'duplicate evidence is database constrained');
match(migration, /file_name !~ '\[\[:cntrl:\]\]'/, 'stored display filenames reject controls');
match(migration, /dispute_evidence_object_read/, 'registered object read is participant scoped');
match(migration, /dispute_evidence_unregistered_delete/, 'only unregistered staged evidence can be removed');
match(migration, /grant select\(id,booking_id,opened_by/, 'case table grants expose only participant-safe columns');
notMatch(migration, /grant select on public\.disputes/, 'case table has no broad select grant');
match(migration, /private\.can_read_registered_dispute_evidence/, 'private paths stay behind a scoped Storage helper');
notMatch(repository, /getPublicUrl/, 'client never creates public evidence URLs');
match(repository, /createSignedUrl\(internal\.storagePath, 900\)/, 'client uses 15-minute signed URLs');
match(repository, /MIMES\.has\(mime\)/, 'client validates MIME');
match(repository, /file\.size > MAX_BYTES/, 'client validates file size');
match(repository, /contentHash/, 'client supplies deterministic duplicate evidence identity');
match(repository, /await client\.storage\.from\('dispute-evidence'\)\.remove/, 'failed registration removes only staged upload');

match(repository, /environment\.dataMode === 'supabase' \? supabaseRepository : mockRepository/, 'data-mode selection is static');
notMatch(repository, /catch\s*\([^)]*\)\s*\{[^}]*mockRepository/i, 'Supabase errors never fall back to Mock');
match(repository, /MOCK_KEY = 'warsha:disputes:v1'/, 'Mock case data is isolated');
match(repository, /accountId !== 'mock-user'/, 'Mock worker access is server-persona isolated');
match(repository, /accountId !== 'mock-customer'/, 'Mock case creation is customer-persona isolated');
match(repository, /accountId !== 'mock-staff'/, 'Mock staff actions require the staff persona');
match(repository, /role === 'staff' \? dispute\.events/, 'Mock staff can read internal notes while participants cannot');
match(repository, /activeDisputeStates\.includes/, 'Mock enforces one active case');
match(repository, /mockEligibleUntil/, 'Mock applies eligibility windows');
match(repository, /mockCanTransition/, 'Mock uses the same explicit lifecycle graph');
match(repository, /stored\.evidence\.length >= 10/, 'Mock applies evidence count limit');
match(repository, /staffAction/, 'Mock implements staff transitions');
match(repository, /input\.type === 'partial_compensation'/, 'Mock requires financial delegation');
match(repository, /delegateMockDisputeFinancialAction/, 'Mock delegates compensation to the WPS-007 store');
match(repository, /setMockDisputeEarningHold/, 'Mock applies and releases the WPS-007 dispute hold');
match(repository, /createMockDisputeReturnVisit/, 'Mock resolution reuses the WPS-012 return-visit store');
match(repository, /createMockNotification/, 'Mock generates durable notification parity');
match(repository, /setMockReviewDisputeHold/, 'Mock applies and releases the WPS-011 publication hold');
match(mockState, /PUBLICATION_HOLD_STATES/, 'Mock review submission can detect an active dispute');
match(reviewRepository, /disputeHoldId/, 'Mock review visibility records dispute provenance');
match(reviewRepository, /visible: !disputeHoldId/, 'Mock review submission respects an existing dispute');
match(reviewRepository, /review\.visible = !review\.staffHidden && !review\.disputeHoldId/, 'Mock moderation restore cannot bypass a dispute hold');
match(chatRepository, /appendMockDisputeConversationEvent/, 'Mock projects dispute events into the WPS-009 conversation');
match(chatRepository, /\['mock-customer', 'mock-user'\]/, 'Mock conversation projection reaches both participants');

match(panel, /DocumentPicker\.getDocumentAsync/, 'participant UI supports private PDF evidence');
match(panel, /ImagePicker\.launchImageLibraryAsync/, 'participant UI supports image evidence');
match(panel, /accessibilityRole="radio"/, 'reason/response choices expose radio semantics');
match(panel, /accessibilityState=\{\{ checked: selected \}\}/, 'radio selected state is exposed');
match(panel, /accessibilityState=\{\{ disabled: busy \|\| disabled, busy \}\}/, 'action disabled and busy state is exposed');
match(panel, /accessibilityRole="progressbar"/, 'loading state exposes progress semantics');
match(panel, /accessibilityRole="link"/, 'signed evidence exposes link semantics');
match(panel, /minHeight: 44/, 'controls meet touch target floor');
match(panel, /flexWrap: 'wrap'/, 'small-screen choices wrap');
match(panel, /isRTL && styles\.reverse/, 'participant rows reverse in RTL');
match(panel, /dt\('loadError'\)/, 'load error is explicit');
match(panel, /accessibilityRole="alert"/, 'load failure is announced');
match(panel, /dt\('noEvidence'\)/, 'empty evidence state is explicit');
match(panel, /ActivityIndicator/, 'loading/busy state is explicit');
match(customer, /BookingDisputePanel booking=\{booking\} role="customer"/, 'customer booking detail exposes disputes');
match(worker, /BookingDisputePanel booking=\{job\} role="worker"/, 'worker job detail exposes responses');
match(realtime, /bookingDispute\(bookingId/, 'case changes use RLS-scoped invalidation');

match(translations, /Dispute resolution/, 'English case copy exists');
match(translations, /حل النزاع/, 'Egyptian Arabic case copy exists');
match(translations, /مبتتمسحش/, 'Arabic evidence retention copy is natural and explicit');
match(wps, /WPS-013/, 'product specification exists');
match(wes, /WES-013/, 'engineering specification exists');
match(index, /WPS-013-disputes-resolution/, 'authority index registers WPS-013');

const mottoTargets = ['app/+html.tsx','public/manifest.webmanifest','app.json','src/i18n/translations.ts','scripts/render-brand-assets.ps1','docs/brand/WARSHA-BRAND-SYSTEM.md','scripts/brand-system.test.mts'];
const motto = mottoTargets.map(read).join('\n');
match(motto, /YOUR WORK, OUR MISSION/, 'approved English motto remains active');
match(motto, /شغلك مهمتنا/, 'approved Arabic motto remains active');
notMatch(motto, /YOUR WORK\. OUR MISSION\.|YOUR BUSINESS\. MORE JOBS\./, 'superseded active motto is absent');

console.log(`WPS-013 disputes and resolution checks passed: ${checks} contracts across eligibility, evidence, lifecycle, integrations, Mock, localization, accessibility, and brand.`);
