import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canTransitionOperation, operationBookingStatus, operationTransitions, OPERATION_STATES } from '../src/job-operations/job-operation-types.ts';

const root=process.cwd(); let checks=0;
const read=(path:string)=>readFileSync(join(root,path),'utf8');
const ok=(value:unknown,message:string)=>{checks+=1;assert.ok(value,message)};
const equal=(actual:unknown,expected:unknown,message:string)=>{checks+=1;assert.equal(actual,expected,message)};
const match=(value:string,pattern:RegExp,message:string)=>{checks+=1;assert.match(value,pattern,message)};
const notMatch=(value:string,pattern:RegExp,message:string)=>{checks+=1;assert.doesNotMatch(value,pattern,message)};

const migration=read('supabase/migrations/202608010006_wps012_job_execution_operations.sql');
const types=read('src/job-operations/job-operation-types.ts');
const repository=read('src/job-operations/job-operation-repository.ts');
const panel=read('components/warsha/JobOperationsPanel.tsx');
const translations=read('src/job-operations/job-operation-translations.ts');
const chat=read('src/chat/chat-translations.ts');
const notifications=read('src/notifications/notification-translations.ts')
  + read('src/notifications/notification-copy.ts');
const providerScreen=read('app/provider-job/[id].tsx');
const customerScreen=read('app/booking/[id].tsx');
const realtime=read('src/realtime/realtime-service.ts');

equal(OPERATION_STATES.length,13,'all 13 locked operation states exist');
for(const state of OPERATION_STATES)ok(types.includes(`'${state}'`),`${state} is declared`);
ok(canTransitionOperation('confirmed','traveling'),'confirmed advances to traveling');
ok(!canTransitionOperation('confirmed','arrived'),'confirmed cannot skip arrival');
ok(canTransitionOperation('traveling','waiting_for_customer'),'traveling may wait for customer');
ok(canTransitionOperation('customer_inspection','completed'),'customer inspection may complete');
ok(!canTransitionOperation('completed','resumed'),'completed is terminal inside a section');
equal(operationBookingStatus.waiting_for_approval,'work_in_progress','waiting approval reuses coarse work state');
equal(operationBookingStatus.returning_later,'work_in_progress','returning later does not invent booking status');
equal(operationTransitions.finished[0],'customer_inspection','finished always leads to inspection');

for(const table of ['booking_operations','booking_operation_events','job_progress_media','booking_additional_work_requests','booking_return_visits'])match(migration,new RegExp(`create table public\\.${table}`),`${table} is forward migrated`);
for(const rpc of ['get_booking_operation','transition_booking_operation','publish_booking_operation_update','report_booking_operation_delay','register_job_progress_media','submit_additional_work_request','respond_additional_work_request','mark_job_ready_for_inspection','respond_job_inspection','request_booking_return_visit','respond_booking_return_visit'])match(migration,new RegExp(`function public\\.${rpc}`),`${rpc} is implemented`);
match(migration,/private\.job_operation_can_transition/,'server owns transition graph');
match(migration,/booking_operation_events_immutable/,'timeline has immutable trigger');
match(migration,/revoke all on public\.booking_operations/,'direct operational writes are revoked');
match(migration,/private\.is_booking_participant\(booking_id\)/,'participant RLS is reused');
match(migration,/private\.is_staff\(\)/,'staff audit visibility is explicit');
match(migration,/set search_path=''/,'definer functions use an empty search path');
match(migration,/private\.record_job_operation_side_effects/,'one trigger owns chat and notification side effects');
match(migration,/'source_event_id'/,'system messages carry server event provenance');
match(migration,/on conflict do nothing/,'durable side effects are deduplicated');
match(migration,/public\.propose_booking_price_adjustment/,'additional work reuses WPS-007 proposal authority');
match(migration,/public\.respond_booking_price_adjustment/,'additional work decision reuses WPS-007 response authority');
notMatch(migration,/insert into public\.financial_booking_payments/,'WPS-012 does not duplicate payment creation');
match(migration,/update public\.bookings set status='completed'/,'customer inspection closes the canonical booking');
match(migration,/review_unlocked/,'completion generates review unlock');
notMatch(migration,/insert into public\.reviews/,'operations never create or manipulate reviews');
match(migration,/unique\(booking_id,section_number\)/,'return sections remain unique inside one booking');
notMatch(migration,/insert into public\.bookings[^]*return_visit/,'return visits do not create bookings');
match(migration,/warranty_ends_at=case/,'warranty dates are created at completion');
match(migration,/selected_worker_quote_id/,'approved quote warranty remains a minimum commitment');

match(migration,/job-progress-media[^]*public=false/,'progress bucket is private');
match(migration,/8388608/,'media is bounded to 8 MB');
for(const mime of ['image/jpeg','image/png','image/webp','image/heic','image/heif'])match(migration,new RegExp(mime.replace('/','\\/')),`${mime} is server allowed`);
match(migration,/is_safe_job_progress_path/,'server validates safe operation media paths');
match(migration,/owner_id is distinct from uid::text/,'registration verifies Storage ownership');
// Lifetime read from `src/storage/signed-url-policy.ts` rather than restated.
match(repository,/createSignedUrl\(item\.storagePath, signedUrlSeconds\('job-progress-media'\)\)/,
  'client returns only expiring signed URLs, with the lifetime read from the shared policy');
notMatch(repository,/getPublicUrl/,'client never creates public progress URLs');
match(repository,/file\.size > MAX_MEDIA_BYTES/,'client validates media size before upload');
match(repository,/MEDIA_MIMES\.has/,'client validates media MIME before upload');
match(repository,/catch \(reason\) \{ await client\.storage[^]*remove/,'failed registration rolls back staged upload');

match(repository,/environment\.dataMode === 'supabase' \? supabaseRepository : mockRepository/,'data mode selection is static');
notMatch(repository,/catch\s*\([^)]*\)\s*\{[^}]*mockRepository/i,'there is no Supabase-to-Mock fallback');
match(repository,/assertMockParticipant/,'Mock actions are account and role scoped');
match(repository,/syncMockBookingStatus/,'Mock preserves canonical booking integration');
match(repository,/paymentRepository\.proposePriceAdjustment/,'Mock reuses WPS-007 proposal logic');
match(repository,/paymentRepository\.respondPriceAdjustment/,'Mock reuses WPS-007 decision logic');
match(repository,/returnVisits\.some/,'Mock prevents duplicate open return visits');
match(repository,/operation\.currentSection \+= 1/,'Mock return visits open timeline sections');
match(repository,/createMockNotification\('review_unlocked'/,'Mock unlocks review after customer completion');

match(panel,/accessibilityRole="checkbox"/,'checklists expose checkbox semantics');
match(panel,/accessibilityRole="radio"/,'bounded choices expose radio semantics');
match(panel,/accessibilityState=\{\{disabled: disabled \|\| busy, busy\}\}/,'actions expose disabled and busy state');
match(panel,/minHeight: 44/,'interactive controls retain 44-point targets');
match(panel,/flexWrap: 'wrap'/,'small-screen actions wrap');
match(panel,/isRTL && styles\.reverse/,'operation surfaces reverse row direction for RTL');
match(panel,/photoTooLarge/,'media failure state is localized');
match(panel,/pendingPhoto/,'failed uploads remain retryable in UI state');
match(panel,/WORKER_CHECKLIST\.every/,'worker checklist gates inspection');
match(panel,/CUSTOMER_CHECKLIST/,'customer checklist is rendered');
match(panel,/review_later/,'review-later checklist stays non-destructive');
match(panel,/customDays/,'custom warranty is bounded in UI');
match(panel,/sameBooking/,'return-visit continuity is explained');
match(providerScreen,/JobOperationsPanel booking=\{job\} role="worker"/,'worker job detail uses WPS-012');
match(customerScreen,/JobOperationsPanel booking=\{booking\} role="customer"/,'customer booking detail uses WPS-012');
match(realtime,/bookingOperations\(bookingId/,'operational changes use Realtime invalidation');

match(translations,/Job progress/,'English product copy exists');
match(translations,/متابعة الشغل/,'Egyptian Arabic product copy exists');
for(const state of OPERATION_STATES)match(translations,new RegExp(`state_${state}`),`${state} is localized`);
match(chat,/operation_additional_work_requested/,'WPS-009 system messages localize additional work');
match(chat,/operation_return_visit_requested/,'WPS-009 system messages localize return visits');
match(notifications,/operation_waiting_for_approval/,'durable operation notification is localized');
match(notifications,/review_unlockedBody/,'review unlock notification is localized');

const mottoTargets=['app/+html.tsx','public/manifest.webmanifest','app.json','src/i18n/translations.ts','scripts/render-brand-assets.ps1','docs/brand/WARSHA-BRAND-SYSTEM.md','scripts/brand-system.test.mts'];
const motto=mottoTargets.map(read).join('\n');
match(motto,/YOUR WORK, OUR MISSION/,'approved English motto remains present');
match(motto,/شغلك مهمتنا/,'approved Arabic motto remains present');
notMatch(motto,/YOUR WORK\. OUR MISSION\.|YOUR BUSINESS\. MORE JOBS\./,'superseded active motto is absent');

console.log(`WPS-012 job execution and operations checks passed: ${checks} contracts across lifecycle, timeline, finance, media, Mock, localization, accessibility, and brand.`);
