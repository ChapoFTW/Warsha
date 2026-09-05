import { signedUrlSeconds } from '@/src/storage/signed-url-policy';
import { File } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

import type { Booking, BookingStatus } from '@/src/bookings/booking-types';
import { localBookingRepository } from '@/src/bookings/booking-repository';
import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { createMockNotification } from '@/src/notifications/notification-repository';
import { paymentRepository } from '@/src/payments/payment-repository';
import { providerJobRepository } from '@/src/provider-jobs/provider-job-repository';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import {
  canTransitionOperation,
  isRoleUpdate,
  operationBookingStatus,
  operationStateFromBooking,
  type AdditionalWorkRequest,
  type DelayReason,
  type InspectionResponse,
  type JobOperation,
  type OperationActor,
  type OperationEvent,
  type OperationRole,
  type OperationState,
  type OperationUpdateKey,
  type ProgressMedia,
  type ProgressUpload,
  type ReturnVisit,
  type WarrantyCommitment,
} from './job-operation-types';

const MOCK_KEY = 'warsha:job-operations:v1';
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MEDIA_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
let mockQueue: Promise<unknown> = Promise.resolve();

type AdditionalWorkInput = { explanation: string; photoIds: string[]; estimatedAdjustmentMinor?: number; idempotencyKey: string };
type ReadyInput = { checklist: string[]; warranty: WarrantyCommitment; note?: string; idempotencyKey: string };

export type JobOperationRepository = {
  get(booking: Booking, accountId: string, role: OperationRole): Promise<JobOperation | null>;
  transition(booking: Booking, accountId: string, role: OperationRole, state: OperationState, note: string | undefined, key: string): Promise<void>;
  publishUpdate(booking: Booking, accountId: string, role: OperationRole, update: OperationUpdateKey, key: string): Promise<void>;
  reportDelay(booking: Booking, accountId: string, role: OperationRole, reason: DelayReason, minutes: number | undefined, note: string, key: string): Promise<void>;
  uploadMedia(booking: Booking, accountId: string, role: OperationRole, upload: ProgressUpload): Promise<void>;
  submitAdditionalWork(booking: Booking, accountId: string, role: OperationRole, input: AdditionalWorkInput): Promise<void>;
  respondAdditionalWork(booking: Booking, accountId: string, role: OperationRole, requestId: string, decision: 'approved' | 'rejected' | 'needs_clarification', note: string, key: string): Promise<void>;
  readyForInspection(booking: Booking, accountId: string, role: OperationRole, input: ReadyInput): Promise<void>;
  respondInspection(booking: Booking, accountId: string, role: OperationRole, response: InspectionResponse, checklist: string[], note: string, key: string): Promise<void>;
  requestReturnVisit(booking: Booking, accountId: string, role: OperationRole, reason: string, key: string): Promise<void>;
  respondReturnVisit(booking: Booking, accountId: string, role: OperationRole, returnVisitId: string, accept: boolean, note: string, key: string): Promise<void>;
};

function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function now() { return new Date().toISOString(); }
function assertMockParticipant(accountId: string, role: OperationRole) {
  const expected = role === 'worker' ? 'mock-user' : 'mock-customer';
  if (accountId !== expected) throw new Error('Operation is not available for this account.');
}
function asObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function optionalString(value: unknown) { return typeof value === 'string' && value ? value : undefined; }
function listStrings(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }

function mapEvent(raw: unknown): OperationEvent {
  const row = asObject(raw);
  return {
    id: String(row.id), bookingId: String(row.bookingId ?? row.booking_id),
    sectionNumber: Number(row.sectionNumber ?? row.section_number ?? 1),
    state: String(row.state) as OperationState, eventType: String(row.eventType ?? row.event_type),
    actor: String(row.actor ?? row.actor_class ?? 'system') as OperationActor,
    actorId: optionalString(row.actorId ?? row.actor_id), note: optionalString(row.note),
    metadata: asObject(row.metadata), createdAt: String(row.createdAt ?? row.created_at),
  };
}
function mapMedia(raw: unknown): ProgressMedia & { storagePath?: string } {
  const row = asObject(raw);
  return {
    id: String(row.id), bookingId: String(row.bookingId ?? row.booking_id),
    sectionNumber: Number(row.sectionNumber ?? row.section_number ?? 1), uploaderId: String(row.uploaderId ?? row.uploader_id),
    phase: String(row.phase) as ProgressMedia['phase'], mimeType: String(row.mimeType ?? row.mime_type),
    byteSize: Number(row.byteSize ?? row.byte_size), sortOrder: Number(row.sortOrder ?? row.sort_order),
    caption: optionalString(row.caption), url: optionalString(row.url),
    storagePath: optionalString(row.storagePath ?? row.storage_path), createdAt: String(row.createdAt ?? row.created_at),
  };
}
function mapAdditional(raw: unknown): AdditionalWorkRequest {
  const row = asObject(raw);
  return {
    id: String(row.id), bookingId: String(row.bookingId ?? row.booking_id), sectionNumber: Number(row.sectionNumber ?? row.section_number ?? 1),
    explanation: String(row.explanation), decision: String(row.decision ?? row.status) as AdditionalWorkRequest['decision'],
    estimatedAdjustmentMinor: row.estimatedAdjustmentMinor == null && row.estimated_adjustment_minor == null ? undefined : Number(row.estimatedAdjustmentMinor ?? row.estimated_adjustment_minor),
    priceAdjustmentId: optionalString(row.priceAdjustmentId ?? row.price_adjustment_id), photoIds: listStrings(row.photoIds ?? row.photo_ids),
    createdAt: String(row.createdAt ?? row.created_at), decidedAt: optionalString(row.decidedAt ?? row.decided_at),
  };
}
function mapReturn(raw: unknown): ReturnVisit {
  const row = asObject(raw);
  return {
    id: String(row.id), bookingId: String(row.bookingId ?? row.booking_id), sectionNumber: Number(row.sectionNumber ?? row.section_number),
    reason: String(row.reason), status: String(row.status) as ReturnVisit['status'], requestedAt: String(row.requestedAt ?? row.requested_at),
    respondedAt: optionalString(row.respondedAt ?? row.responded_at), completedAt: optionalString(row.completedAt ?? row.completed_at),
  };
}
async function hydrateSignedMedia(media: ReturnType<typeof mapMedia>[]) {
  const client = getSupabaseClient();
  return Promise.all(media.map(async item => {
    if (!item.storagePath) return item;
    const { data, error } = await client.storage.from('job-progress-media').createSignedUrl(item.storagePath, signedUrlSeconds('job-progress-media'));
    if (error) throw error;
    const { storagePath: _privatePath, ...safe } = item;
    return { ...safe, url: data.signedUrl };
  }));
}
function mapOperation(raw: unknown, signedMedia?: ProgressMedia[]): JobOperation {
  const row = asObject(raw);
  const warranty = asObject(row.warranty);
  return {
    bookingId: String(row.bookingId ?? row.booking_id), currentState: String(row.currentState ?? row.current_state) as OperationState,
    currentSection: Number(row.currentSection ?? row.current_section ?? 1), workerChecklist: listStrings(row.workerChecklist ?? row.worker_checklist),
    customerChecklist: listStrings(row.customerChecklist ?? row.customer_checklist),
    warranty: { kind: String(warranty.kind ?? 'none') as WarrantyCommitment['kind'], days: warranty.days == null ? undefined : Number(warranty.days), startsAt: optionalString(warranty.startsAt ?? warranty.starts_at), endsAt: optionalString(warranty.endsAt ?? warranty.ends_at) },
    events: Array.isArray(row.events) ? row.events.map(mapEvent) : [], media: signedMedia ?? (Array.isArray(row.media) ? row.media.map(mapMedia) : []),
    additionalWork: Array.isArray(row.additionalWork ?? row.additional_work) ? ((row.additionalWork ?? row.additional_work) as unknown[]).map(mapAdditional) : [],
    returnVisits: Array.isArray(row.returnVisits ?? row.return_visits) ? ((row.returnVisits ?? row.return_visits) as unknown[]).map(mapReturn) : [],
    updatedAt: String(row.updatedAt ?? row.updated_at ?? now()),
  };
}

async function call(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().rpc(name, parameters);
  if (error) throw error;
  return data;
}
const supabaseRepository: JobOperationRepository = {
  async get(booking) {
    const data = await call('get_booking_operation', { p_booking_id: booking.id });
    if (!data) return null;
    const row = asObject(data); const rawMedia = Array.isArray(row.media) ? row.media.map(mapMedia) : [];
    return mapOperation(row, await hydrateSignedMedia(rawMedia));
  },
  async transition(booking, _accountId, _role, state, note, key) { await call('transition_booking_operation', { p_booking_id: booking.id, p_to_state: state, p_note: note ?? null, p_idempotency_key: key }); },
  async publishUpdate(booking, _accountId, _role, update, key) { await call('publish_booking_operation_update', { p_booking_id: booking.id, p_update_key: update, p_idempotency_key: key }); },
  async reportDelay(booking, _accountId, _role, reason, minutes, note, key) { await call('report_booking_operation_delay', { p_booking_id: booking.id, p_reason: reason, p_delay_minutes: minutes ?? null, p_note: note || null, p_idempotency_key: key }); },
  async uploadMedia(booking, _accountId, _role, upload) {
    const client = getSupabaseClient(); const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw authError ?? new Error('Authentication required');
    const file = new File(upload.uri); const mime = upload.mimeType || file.type || 'image/jpeg';
    if (!file.exists || !MEDIA_MIMES.has(mime) || file.size < 1 || file.size > MAX_MEDIA_BYTES) throw new Error('Invalid progress photo.');
    const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] === 'heif' ? 'heif' : mime.split('/')[1];
    const safeId = upload.clientId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
    if (safeId.length < 12) throw new Error('Invalid progress photo name.');
    const path = `${user.id}/${booking.id}/operations/${upload.phase}/${safeId}.${extension}`;
    const { error } = await client.storage.from('job-progress-media').upload(path, await file.arrayBuffer(), { contentType: mime, upsert: false });
    if (error) throw error;
    try {
      await call('register_job_progress_media', { p_booking_id: booking.id, p_storage_path: path, p_phase: upload.phase, p_caption: upload.caption || null, p_sort_order: upload.sortOrder, p_client_id: upload.clientId });
    } catch (reason) { await client.storage.from('job-progress-media').remove([path]); throw reason; }
  },
  async submitAdditionalWork(booking, _accountId, _role, input) { await call('submit_additional_work_request', { p_booking_id: booking.id, p_explanation: input.explanation, p_photo_ids: input.photoIds, p_estimated_adjustment_minor: input.estimatedAdjustmentMinor ?? null, p_idempotency_key: input.idempotencyKey }); },
  async respondAdditionalWork(_booking, _accountId, _role, requestId, decision, note, key) { await call('respond_additional_work_request', { p_request_id: requestId, p_decision: decision, p_note: note || null, p_idempotency_key: key }); },
  async readyForInspection(booking, _accountId, _role, input) { await call('mark_job_ready_for_inspection', { p_booking_id: booking.id, p_checklist: input.checklist, p_warranty_kind: input.warranty.kind, p_custom_warranty_days: input.warranty.days ?? null, p_note: input.note || null, p_idempotency_key: input.idempotencyKey }); },
  async respondInspection(booking, _accountId, _role, response, checklist, note, key) { await call('respond_job_inspection', { p_booking_id: booking.id, p_response: response, p_checklist: checklist, p_note: note || null, p_idempotency_key: key }); },
  async requestReturnVisit(booking, _accountId, _role, reason, key) { await call('request_booking_return_visit', { p_booking_id: booking.id, p_reason: reason, p_idempotency_key: key }); },
  async respondReturnVisit(_booking, _accountId, _role, returnVisitId, accept, note, key) { await call('respond_booking_return_visit', { p_return_visit_id: returnVisitId, p_accept: accept, p_note: note || null, p_idempotency_key: key }); },
};

type MockState = { operations: Record<string, JobOperation>; keys: Record<string, string> };
async function readMock(): Promise<MockState> { const raw = await Storage.getItem(MOCK_KEY); if (!raw) return { operations: {}, keys: {} }; try { return JSON.parse(raw) as MockState; } catch { return { operations: {}, keys: {} }; } }
async function writeMock(state: MockState) { await Storage.setItem(MOCK_KEY, JSON.stringify(state)); }
function initialOperation(booking: Booking): JobOperation | null {
  const state = operationStateFromBooking(booking.status); if (!state) return null; const timestamp = now();
  return { bookingId: booking.id, currentState: state, currentSection: 1, workerChecklist: [], customerChecklist: [], warranty: { kind: 'none' }, events: [{ id: id('operation-event'), bookingId: booking.id, sectionNumber: 1, state, eventType: state, actor: 'system', metadata: { source: 'booking_backfill' }, createdAt: timestamp }], media: [], additionalWork: [], returnVisits: [], updatedAt: timestamp };
}
async function mockAtomic<T>(operation: (state: MockState) => Promise<T> | T) { const result = mockQueue.then(async () => { const state = await readMock(); const value = await operation(state); await writeMock(state); return value; }); mockQueue = result.then(() => undefined, () => undefined); return result; }
function requireOperation(state: MockState, booking: Booking) { const operation = state.operations[booking.id] ?? initialOperation(booking); if (!operation) throw new Error('Job operations are not available.'); state.operations[booking.id] = operation; return operation; }
async function syncMockBookingStatus(booking: Booking, role: OperationRole, status: BookingStatus) {
  if (booking.status === status || booking.status === 'completed') return;
  if (role === 'worker') await providerJobRepository.advance(booking.id, status);
  else await localBookingRepository.updateStatus(booking.id, status, 'Job operation update');
}
function addEvent(operation: JobOperation, state: OperationState, eventType: string, actor: OperationActor, note?: string, metadata: Record<string, unknown> = {}) { const event: OperationEvent = { id: id('operation-event'), bookingId: operation.bookingId, sectionNumber: operation.currentSection, state, eventType, actor, note: note || undefined, metadata, createdAt: now() }; operation.currentState = state; operation.updatedAt = event.createdAt; operation.events.push(event); emitMockRealtime({ table: 'booking_operation_events', event: 'INSERT', id: event.id }); return event; }
async function notifyMock(operation: JobOperation, event: string, eventId: string) { await createMockNotification(`operation_${event}`, operation.bookingId, undefined, `operation:${eventId}`); }
function ensureKey(state: MockState, key: string) { if (state.keys[key]) return false; state.keys[key] = now(); return true; }

export async function createMockDisputeReturnVisit(bookingId: string, reason: string, key: string) {
  if (environment.dataMode !== 'mock') throw new Error('Mock dispute return visits are disabled outside Mock mode.');
  const booking = (await localBookingRepository.list()).find(item => item.id === bookingId);
  if (!booking || booking.status !== 'completed' || reason.trim().length < 3) throw new Error('Return visit is unavailable.');
  let returnVisitId = '';
  await mockAtomic(async state => {
    const operation = requireOperation(state, booking);
    const existing = operation.returnVisits.find(item => item.status === 'requested' && operation.events.some(event => event.metadata.sourceDisputeKey === key && event.metadata.returnVisitId === item.id));
    if (existing) { returnVisitId = existing.id; return; }
    if (!ensureKey(state, key)) throw new Error('Return visit retry could not be resolved.');
    if (operation.returnVisits.some(item => !['declined', 'completed'].includes(item.status))) throw new Error('A return visit is already open.');
    operation.currentSection += 1;
    const visit: ReturnVisit = { id: id('return-visit'), bookingId, sectionNumber: operation.currentSection, reason: reason.trim(), status: 'requested', requestedAt: now() };
    operation.returnVisits.push(visit); returnVisitId = visit.id;
    const event = addEvent(operation, 'completed', 'return_visit_requested', 'staff', reason, { returnVisitId: visit.id, sourceDisputeKey: key });
    await notifyMock(operation, 'return_visit', event.id);
  });
  return returnVisitId;
}

const mockRepository: JobOperationRepository = {
  async get(booking, accountId, role) { assertMockParticipant(accountId, role); return mockAtomic(state => structuredClone(requireOperation(state, booking))); },
  async transition(booking, accountId, role, target, note, key) { assertMockParticipant(accountId, role); if (role !== 'worker') throw new Error('Only the worker can publish this transition.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); if (!canTransitionOperation(operation.currentState, target) || target === 'completed') throw new Error('Invalid operation transition.'); await syncMockBookingStatus(booking, role, operationBookingStatus[target]); const event = addEvent(operation, target, target, 'worker', note, { bookingStatus: operationBookingStatus[target] }); await notifyMock(operation, target, event.id); }); },
  async publishUpdate(booking, accountId, role, update, key) { assertMockParticipant(accountId, role); if (!isRoleUpdate(role, update)) throw new Error('Update is not available.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); const event = addEvent(operation, operation.currentState, `update_${update}`, role); await notifyMock(operation, update, event.id); }); },
  async reportDelay(booking, accountId, role, reason, minutes, note, key) { assertMockParticipant(accountId, role); if (role !== 'worker' || (minutes != null && (minutes < 1 || minutes > 1440))) throw new Error('Invalid delay.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); const event = addEvent(operation, reason === 'waiting_for_parts' ? 'waiting_for_parts' : operation.currentState, 'delay', 'worker', note, { reason, minutes }); await notifyMock(operation, 'delay', event.id); }); },
  async uploadMedia(booking, accountId, role, upload) { assertMockParticipant(accountId, role); const mime = upload.mimeType || 'image/jpeg'; const file = new File(upload.uri); if (!file.exists || !MEDIA_MIMES.has(mime) || file.size < 1 || file.size > MAX_MEDIA_BYTES) throw new Error('Invalid progress photo.'); await mockAtomic(state => { const operation = requireOperation(state, booking); const media: ProgressMedia = { id: id('progress-media'), bookingId: booking.id, sectionNumber: operation.currentSection, uploaderId: accountId, phase: upload.phase, mimeType: mime, byteSize: file.size, sortOrder: upload.sortOrder, caption: upload.caption?.trim() || undefined, url: upload.uri, createdAt: now() }; operation.media.push(media); operation.updatedAt = media.createdAt; emitMockRealtime({ table: 'job_progress_media', event: 'INSERT', id: media.id }); }); },
  async submitAdditionalWork(booking, accountId, role, input) { assertMockParticipant(accountId, role); if (role !== 'worker' || input.explanation.trim().length < 3) throw new Error('A clear explanation is required.'); await mockAtomic(async state => { if (!ensureKey(state, input.idempotencyKey)) return; const operation = requireOperation(state, booking); await syncMockBookingStatus(booking, role, 'work_in_progress'); const adjustment = input.estimatedAdjustmentMinor ? await paymentRepository.proposePriceAdjustment(`operation-finance:${booking.id}`, booking.providerId, booking.id, String(input.estimatedAdjustmentMinor), input.explanation.trim(), `${input.idempotencyKey}:wps007`) : undefined; const request: AdditionalWorkRequest = { id: id('additional-work'), bookingId: booking.id, sectionNumber: operation.currentSection, explanation: input.explanation.trim(), decision: 'pending', estimatedAdjustmentMinor: input.estimatedAdjustmentMinor, priceAdjustmentId: adjustment?.id, photoIds: input.photoIds.filter(photoId => operation.media.some(media => media.id === photoId && media.uploaderId === accountId)), createdAt: now() }; operation.additionalWork.push(request); const event = addEvent(operation, 'waiting_for_approval', 'additional_work_requested', 'worker', request.explanation, { requestId: request.id, hasPriceAdjustment: Boolean(request.priceAdjustmentId) }); await notifyMock(operation, 'additional_work', event.id); }); },
  async respondAdditionalWork(booking, accountId, role, requestId, decision, note, key) { assertMockParticipant(accountId, role); if (role !== 'customer') throw new Error('Only the customer can respond.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); const request = operation.additionalWork.find(item => item.id === requestId && ['pending','needs_clarification'].includes(item.decision)); if (!request) throw new Error('Additional work request is unavailable.'); if (request.priceAdjustmentId && decision !== 'needs_clarification') await paymentRepository.respondPriceAdjustment(`operation-finance:${booking.id}`, request.priceAdjustmentId, decision === 'approved'); request.decision = decision; request.decidedAt = now(); const next = decision === 'needs_clarification' ? 'waiting_for_approval' : 'resumed'; const event = addEvent(operation, next, `additional_work_${decision}`, 'customer', note, { requestId }); await notifyMock(operation, `additional_work_${decision}`, event.id); }); },
  async readyForInspection(booking, accountId, role, input) { assertMockParticipant(accountId, role); if (role !== 'worker') throw new Error('Only the worker can request inspection.'); await mockAtomic(async state => { if (!ensureKey(state, input.idempotencyKey)) return; const operation = requireOperation(state, booking); if (!['started', 'resumed'].includes(operation.currentState) || !['work_finished', 'area_cleaned', 'photos_uploaded', 'customer_informed'].every(item => input.checklist.includes(item)) || !operation.media.some(item => item.phase === 'after' && item.sectionNumber === operation.currentSection)) throw new Error('Completion checklist is incomplete.'); operation.workerChecklist = [...input.checklist]; if (operation.currentSection === 1) operation.warranty = input.warranty; addEvent(operation, 'finished', 'finished', 'worker', input.note); const event = addEvent(operation, 'customer_inspection', 'customer_inspection', 'system'); await notifyMock(operation, 'inspection', event.id); }); },
  async respondInspection(booking, accountId, role, response, checklist, note, key) { assertMockParticipant(accountId, role); if (role !== 'customer') throw new Error('Only the customer can inspect.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); if (operation.currentState !== 'customer_inspection') throw new Error('Inspection is unavailable.'); if (response === 'approve' && !['work_inspected', 'satisfied', 'close_booking'].every(item => checklist.includes(item))) throw new Error('Inspection checklist is incomplete.'); operation.customerChecklist = [...checklist]; const next: OperationState = response === 'approve' ? 'completed' : 'resumed'; const event = addEvent(operation, next, response === 'approve' ? 'completed' : `inspection_${response}`, 'customer', note); const returnVisit = operation.returnVisits.find(item => item.sectionNumber === operation.currentSection && ['accepted', 'in_progress'].includes(item.status)); if (response === 'approve' && !returnVisit) await syncMockBookingStatus(booking, role, 'completed'); if (response === 'approve' && operation.warranty.kind !== 'none' && !returnVisit) { const days = operation.warranty.days ?? Number(operation.warranty.kind.split('_')[0]); operation.warranty = { ...operation.warranty, days, startsAt: event.createdAt, endsAt: new Date(Date.parse(event.createdAt) + days * 86400000).toISOString() }; } if (response === 'approve' && returnVisit) { returnVisit.status = 'completed'; returnVisit.completedAt = event.createdAt; } await notifyMock(operation, response === 'approve' ? 'completed' : response, event.id); if (response === 'approve' && !returnVisit) await createMockNotification('review_unlocked', booking.id, undefined, `review-unlocked:${booking.id}`); }); },
  async requestReturnVisit(booking, accountId, role, reason, key) { assertMockParticipant(accountId, role); if (role !== 'customer' || booking.status !== 'completed' || reason.trim().length < 3) throw new Error('Return visit is unavailable.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); if (operation.returnVisits.some(item => !['declined', 'completed'].includes(item.status))) throw new Error('A return visit is already open.'); operation.currentSection += 1; const visit: ReturnVisit = { id: id('return-visit'), bookingId: booking.id, sectionNumber: operation.currentSection, reason: reason.trim(), status: 'requested', requestedAt: now() }; operation.returnVisits.push(visit); const event = addEvent(operation, 'completed', 'return_visit_requested', 'customer', reason, { returnVisitId: visit.id }); await notifyMock(operation, 'return_visit', event.id); }); },
  async respondReturnVisit(booking, accountId, role, returnVisitId, accept, note, key) { assertMockParticipant(accountId, role); if (role !== 'worker') throw new Error('Only the worker can respond.'); await mockAtomic(async state => { if (!ensureKey(state, key)) return; const operation = requireOperation(state, booking); const visit = operation.returnVisits.find(item => item.id === returnVisitId && item.status === 'requested'); if (!visit) throw new Error('Return visit is unavailable.'); visit.status = accept ? 'accepted' : 'declined'; visit.respondedAt = now(); const event = addEvent(operation, accept ? 'confirmed' : 'completed', accept ? 'return_visit_accepted' : 'return_visit_declined', 'worker', note, { returnVisitId }); await notifyMock(operation, accept ? 'return_visit_accepted' : 'return_visit_declined', event.id); }); },
};

export const jobOperationRepository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
export function operationAccountId(dataMode: 'mock' | 'supabase', authenticatedId: string | undefined, role: OperationRole) { return dataMode === 'mock' ? role === 'worker' ? 'mock-user' : 'mock-customer' : authenticatedId ?? ''; }
export function isOperationBookingStatus(status: BookingStatus) { return operationStateFromBooking(status) !== undefined; }
export function operationIdempotency(prefix: string) { return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`; }
