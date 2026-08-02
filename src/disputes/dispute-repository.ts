import { File } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

import type { Booking } from '@/src/bookings/booking-types';
import { appendMockDisputeConversationEvent } from '@/src/chat/chat-repository';
import { environment } from '@/src/config/environment';
import { createMockDisputeReturnVisit } from '@/src/job-operations/job-operation-repository';
import { getSupabaseClient } from '@/src/lib/supabase';
import { createMockNotification } from '@/src/notifications/notification-repository';
import { delegateMockDisputeFinancialAction, setMockDisputeEarningHold } from '@/src/payments/payment-repository';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import { setMockReviewDisputeHold } from '@/src/reviews/review-repository';
import {
  activeDisputeStates,
  type BookingDispute,
  type DisputeEvent,
  type DisputeEvidence,
  type DisputeReason,
  type DisputeResolution,
  type DisputeResponse,
  type DisputeRole,
  type DisputeState,
  type DisputeUpload,
} from './dispute-types';

const MOCK_KEY = 'warsha:disputes:v1';
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const MAX_BYTES = 8 * 1024 * 1024;
const EMPTY_SOURCES: BookingDispute['evidenceSources'] = {
  bookingTimeline: 0, attachments: 0, messages: 0, progressPhotos: 0,
  operationEvents: 0,
  additionalWork: 0, returnVisits: 0, reviews: 0, reviewReplies: 0,
  noShowReports: 0, warrantyRecorded: false,
};

type StoredDispute = BookingDispute & { openedBy: string };
type MockState = { disputes: StoredDispute[]; keys: string[] };
type ResolutionInput = { type: DisputeResolution['type']; summary: string; financialAction?: DisputeResolution['financialAction']; paymentId?: string; amountMinor?: number };
type StaffAction = 'assign' | 'request_customer' | 'request_worker' | 'review' | 'reject' | 'close';

export type DisputeRepository = {
  get(booking: Booking, accountId: string, role: DisputeRole): Promise<BookingDispute | null>;
  createDraft(booking: Booking, accountId: string, reason: DisputeReason, description: string, key: string): Promise<string>;
  submit(disputeId: string, accountId: string, key: string): Promise<void>;
  respond(disputeId: string, accountId: string, role: Exclude<DisputeRole, 'staff'>, response: DisputeResponse, body: string, key: string): Promise<void>;
  uploadEvidence(dispute: BookingDispute, accountId: string, upload: DisputeUpload): Promise<void>;
  withdraw(disputeId: string, accountId: string, reason: string, key: string): Promise<void>;
  staffAction(disputeId: string, accountId: string, action: StaffAction, note: string, key: string): Promise<void>;
  staffNote(disputeId: string, accountId: string, note: string, participantVisible: boolean, key: string): Promise<void>;
  resolve(disputeId: string, accountId: string, input: ResolutionInput, key: string): Promise<void>;
};

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function string(value: unknown) { return typeof value === 'string' && value ? value : undefined; }
function list(value: unknown) { return Array.isArray(value) ? value : []; }

function mapEvent(value: unknown): DisputeEvent {
  const row = object(value);
  return {
    id: String(row.id), state: String(row.state) as DisputeState,
    eventType: String(row.eventType ?? row.event_type), actor: String(row.actor ?? row.actor_class) as DisputeEvent['actor'],
    note: string(row.note), metadata: object(row.metadata), createdAt: String(row.createdAt ?? row.created_at),
  };
}
function mapEvidence(value: unknown): DisputeEvidence & { storagePath?: string } {
  const row = object(value);
  return {
    id: String(row.id), uploaderRole: String(row.uploaderRole ?? row.uploader_role) as DisputeEvidence['uploaderRole'],
    mimeType: String(row.mimeType ?? row.mime_type), byteSize: Number(row.byteSize ?? row.byte_size),
    fileName: String(row.fileName ?? row.file_name), url: string(row.url),
    storagePath: string(row.storagePath ?? row.storage_path), createdAt: String(row.createdAt ?? row.created_at),
  };
}
function mapDispute(value: unknown): BookingDispute {
  const row = object(value); const resolution = object(row.resolution); const sources = object(row.evidenceSources ?? row.evidence_sources);
  return {
    id: String(row.id), bookingId: String(row.bookingId ?? row.booking_id), viewerRole: String(row.viewerRole ?? row.viewer_role) as DisputeRole,
    openedByRole: String(row.openedByRole ?? row.opened_by_role) as BookingDispute['openedByRole'],
    reason: String(row.reason) as DisputeReason, state: String(row.state ?? row.status) as DisputeState,
    description: String(row.description), eligibleUntil: string(row.eligibleUntil ?? row.eligible_until), createdAt: String(row.createdAt ?? row.created_at),
    submittedAt: string(row.submittedAt ?? row.submitted_at), reviewStartedAt: string(row.reviewStartedAt ?? row.review_started_at),
    resolvedAt: string(row.resolvedAt ?? row.resolved_at), closedAt: string(row.closedAt ?? row.closed_at),
    resolution: Object.keys(resolution).length ? {
      type: String(resolution.type) as DisputeResolution['type'], summary: String(resolution.summary),
      financialAction: String(resolution.financialAction ?? resolution.financial_action ?? 'none') as DisputeResolution['financialAction'],
      returnVisitId: string(resolution.returnVisitId ?? resolution.return_visit_id),
    } : undefined,
    events: list(row.events).map(mapEvent), evidence: list(row.evidence).map(mapEvidence),
    evidenceSources: {
      bookingTimeline: Number(sources.bookingTimeline ?? sources.booking_timeline ?? 0), attachments: Number(sources.attachments ?? 0),
      messages: Number(sources.messages ?? 0), operationEvents: Number(sources.operationEvents ?? sources.operation_events ?? 0), progressPhotos: Number(sources.progressPhotos ?? sources.progress_photos ?? 0),
      additionalWork: Number(sources.additionalWork ?? sources.additional_work ?? 0), returnVisits: Number(sources.returnVisits ?? sources.return_visits ?? 0),
      reviews: Number(sources.reviews ?? 0), reviewReplies: Number(sources.reviewReplies ?? sources.review_replies ?? 0),
      noShowReports: Number(sources.noShowReports ?? sources.no_show_reports ?? 0), warrantyRecorded: Boolean(sources.warrantyRecorded ?? sources.warranty_recorded),
    },
  };
}

async function call(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().rpc(name, parameters);
  if (error) throw error;
  return data;
}
async function signedEvidence(dispute: BookingDispute) {
  const client = getSupabaseClient();
  return Promise.all(dispute.evidence.map(async evidence => {
    const internal = evidence as DisputeEvidence & { storagePath?: string };
    if (!internal.storagePath) return evidence;
    const { data, error } = await client.storage.from('dispute-evidence').createSignedUrl(internal.storagePath, 900);
    if (error) throw error;
    const { storagePath: _privatePath, ...safe } = internal;
    return { ...safe, url: data.signedUrl };
  }));
}
function cleanFileName(name: string | null | undefined, mime: string) {
  const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const base = (name ?? `evidence.${extension}`).replace(/[\\/\x00-\x1f\x7f]/g, '-').trim().slice(0, 120);
  return base || `evidence.${extension}`;
}
function contentHash(bytes: Uint8Array) {
  const lanes = [2166136261, 2246822519, 3266489917, 668265263];
  for (let index = 0; index < bytes.length; index += 1) {
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= bytes[index] + lane * 31;
      lanes[lane] = Math.imul(lanes[lane], 16777619 + lane * 2) >>> 0;
    }
  }
  return lanes.map(value => value.toString(16).padStart(8, '0')).join('');
}

const supabaseRepository: DisputeRepository = {
  async get(booking) {
    const data = await call('get_booking_dispute', { p_booking_id: booking.id });
    if (!data) return null;
    const dispute = mapDispute(data);
    return { ...dispute, evidence: await signedEvidence(dispute) };
  },
  async createDraft(booking, _accountId, reason, description, key) {
    return String(await call('create_booking_dispute_draft', { p_booking_id: booking.id, p_reason: reason, p_description: description, p_idempotency_key: key }));
  },
  async submit(disputeId, _accountId, key) { await call('submit_booking_dispute', { p_dispute_id: disputeId, p_idempotency_key: key }); },
  async respond(disputeId, _accountId, _role, response, body, key) { await call('respond_booking_dispute', { p_dispute_id: disputeId, p_response_type: response, p_body: body, p_idempotency_key: key }); },
  async uploadEvidence(dispute, _accountId, upload) {
    const client = getSupabaseClient(); const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) throw userError ?? new Error('Authentication required');
    const file = new File(upload.uri); const mime = upload.mimeType || file.type;
    if (!file.exists || !mime || !MIMES.has(mime) || file.size < 1 || file.size > MAX_BYTES) throw new Error('Invalid dispute evidence');
    const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const safeId = upload.clientId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 100);
    if (safeId.length < 12) throw new Error('Invalid dispute evidence name');
    const bytes = new Uint8Array(await file.arrayBuffer()); const hash = contentHash(bytes);
    const path = `${user.id}/${dispute.bookingId}/${dispute.id}/evidence/${safeId}.${extension}`;
    const { error } = await client.storage.from('dispute-evidence').upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
    try {
      await call('register_dispute_evidence', { p_dispute_id: dispute.id, p_storage_path: path, p_file_name: cleanFileName(upload.fileName, mime), p_content_hash: hash, p_client_id: upload.clientId });
    } catch (registerError) {
      await client.storage.from('dispute-evidence').remove([path]);
      throw registerError;
    }
  },
  async withdraw(disputeId, _accountId, reason, key) { await call('withdraw_booking_dispute', { p_dispute_id: disputeId, p_reason: reason, p_idempotency_key: key }); },
  async staffAction(disputeId, _accountId, action, note, key) {
    if (action === 'assign') await call('assign_booking_dispute', { p_dispute_id: disputeId, p_note: note || null, p_idempotency_key: key });
    else if (action === 'request_customer' || action === 'request_worker') await call('request_dispute_evidence', { p_dispute_id: disputeId, p_target: action === 'request_customer' ? 'customer' : 'worker', p_note: note, p_idempotency_key: key });
    else if (action === 'review') await call('start_dispute_review', { p_dispute_id: disputeId, p_note: note || null, p_idempotency_key: key });
    else if (action === 'reject') await call('reject_booking_dispute', { p_dispute_id: disputeId, p_reason: note, p_idempotency_key: key });
    else await call('close_booking_dispute', { p_dispute_id: disputeId, p_note: note || null, p_idempotency_key: key });
  },
  async staffNote(disputeId, _accountId, note, participantVisible, key) { await call('add_dispute_staff_note', { p_dispute_id: disputeId, p_note: note, p_participant_visible: participantVisible, p_idempotency_key: key }); },
  async resolve(disputeId, _accountId, input, key) {
    await call('resolve_booking_dispute', { p_dispute_id: disputeId, p_resolution_type: input.type, p_summary: input.summary, p_financial_action: input.financialAction ?? 'none', p_payment_id: input.paymentId ?? null, p_amount_minor: input.amountMinor ?? null, p_idempotency_key: key });
  },
};

let mockQueue: Promise<unknown> = Promise.resolve();
async function readMock(): Promise<MockState> {
  const raw = await Storage.getItem(MOCK_KEY); if (!raw) return { disputes: [], keys: [] };
  try { const state = JSON.parse(raw) as MockState; return { disputes: state.disputes ?? [], keys: state.keys ?? [] }; } catch { return { disputes: [], keys: [] }; }
}
async function writeMock(state: MockState, bookingId?: string) {
  await Storage.setItem(MOCK_KEY, JSON.stringify(state));
  emitMockRealtime({ table: 'disputes', event: 'UPDATE', bookingId });
  emitMockRealtime({ table: 'dispute_events', event: 'INSERT', bookingId });
}
async function atomic<T>(operation: (state: MockState) => Promise<T> | T): Promise<T> {
  const run = mockQueue.then(async () => { const state = await readMock(); const result = await operation(state); await writeMock(state); return result; });
  mockQueue = run.then(() => undefined, () => undefined); return run;
}
function ensureKey(state: MockState, key: string) { if (state.keys.includes(key)) return false; state.keys.push(key); return true; }
function mockDispute(state: MockState, disputeId: string) { const result = state.disputes.find(item => item.id === disputeId); if (!result) throw new Error('Dispute not found'); return result; }
function mockEvent(dispute: StoredDispute, eventType: string, actor: DisputeEvent['actor'], note?: string, metadata: Record<string, unknown> = {}) {
  dispute.events.push({ id: id('mock-dispute-event'), state: dispute.state, eventType, actor, note: note?.trim() || undefined, metadata, createdAt: now() });
}
function mockEligibleUntil(booking: Booking) {
  if (['confirmed', 'provider_on_the_way', 'provider_arrived', 'job_started', 'work_in_progress'].includes(booking.status)) return new Date(8640000000000000).toISOString();
  const terminal = [...booking.history].reverse().find(item => item.status === booking.status)?.at ?? booking.updatedAt ?? booking.createdAt;
  if (booking.status === 'completed' || booking.status === 'disputed') return new Date(Date.parse(terminal) + 14 * 86400000).toISOString();
  if (booking.status === 'no_show') return new Date(Date.parse(terminal) + 48 * 3600000).toISOString();
  return undefined;
}
function mockCanTransition(from: DisputeState, to: DisputeState) {
  const graph: Partial<Record<DisputeState, readonly DisputeState[]>> = {
    draft: ['submitted', 'cancelled'],
    submitted: ['waiting_customer', 'waiting_worker', 'waiting_staff', 'under_review', 'rejected', 'cancelled'],
    waiting_customer: ['waiting_staff', 'under_review', 'cancelled'],
    waiting_worker: ['waiting_staff', 'under_review', 'cancelled'],
    waiting_staff: ['waiting_customer', 'waiting_worker', 'under_review', 'resolved', 'rejected', 'cancelled'],
    under_review: ['waiting_customer', 'waiting_worker', 'resolved', 'rejected'],
    resolved: ['closed'],
    rejected: ['closed'],
  };
  return graph[from]?.includes(to) ?? false;
}
function notify(type: string, dispute: StoredDispute, eventId: string) { return createMockNotification(type, dispute.bookingId, undefined, `dispute:${eventId}`); }
async function project(dispute: StoredDispute) {
  const event = dispute.events.at(-1);
  if (!event || event.state === 'draft' || event.metadata.visibility === 'staff') return;
  await appendMockDisputeConversationEvent({ bookingId: dispute.bookingId, eventId: event.id, eventType: event.eventType, actor: event.actor, note: event.note });
}

const mockRepository: DisputeRepository = {
  async get(booking, accountId, role) {
    const state = await readMock(); const dispute = [...state.disputes].filter(item => item.bookingId === booking.id && (role !== 'worker' || item.state !== 'draft')).sort((a, b) => Number(activeDisputeStates.includes(b.state)) - Number(activeDisputeStates.includes(a.state)) || b.createdAt.localeCompare(a.createdAt))[0];
    if (!dispute) return null;
    const authorized = role === 'customer' ? dispute.openedBy === accountId : role === 'worker' ? accountId === 'mock-user' : accountId === 'mock-staff';
    if (!authorized) throw new Error('Dispute not available');
    return { ...dispute, viewerRole: role, events: role === 'staff' ? dispute.events : dispute.events.filter(event => event.metadata.visibility !== 'staff') };
  },
  async createDraft(booking, accountId, reason, description, key) {
    return atomic(async state => {
      if (accountId !== 'mock-customer') throw new Error('Dispute is not available');
      const existing = state.disputes.find(item => item.openedBy === accountId && item.events.some(event => event.metadata.key === key)); if (existing) return existing.id;
      const eligibleUntil = mockEligibleUntil(booking);
      if (!eligibleUntil || Date.parse(eligibleUntil) < Date.now() || state.disputes.some(item => item.bookingId === booking.id && (activeDisputeStates.includes(item.state) || ['resolved', 'closed', 'rejected'].includes(item.state)))) throw new Error('Dispute is not available');
      if (description.trim().length < 10 || description.trim().length > 4000) throw new Error('Invalid dispute');
      const dispute: StoredDispute = { id: id('mock-dispute'), bookingId: booking.id, viewerRole: 'customer', openedByRole: 'customer', openedBy: accountId, reason, state: 'draft', description: description.trim(), eligibleUntil, createdAt: now(), events: [], evidence: [], evidenceSources: { ...EMPTY_SOURCES, bookingTimeline: booking.history.length, attachments: booking.attachments.length } };
      mockEvent(dispute, 'draft_created', 'customer', description, { key }); state.disputes.push(dispute); return dispute.id;
    });
  },
  async submit(disputeId, accountId, key) {
    await atomic(async state => { if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (dispute.openedBy !== accountId || dispute.state !== 'draft' || !dispute.eligibleUntil || Date.parse(dispute.eligibleUntil) < Date.now()) throw new Error('Dispute cannot be submitted'); dispute.state = 'submitted'; dispute.submittedAt = now(); mockEvent(dispute, 'submitted', 'customer'); await setMockDisputeEarningHold(dispute.bookingId, dispute.id, true); await setMockReviewDisputeHold(dispute.bookingId, dispute.id, true); await project(dispute); await notify('dispute_opened', dispute, dispute.events.at(-1)!.id); });
  },
  async respond(disputeId, accountId, role, response, body, key) {
    await atomic(async state => { if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (body.trim().length < 3 || body.trim().length > 2000) throw new Error('Invalid response'); if (role === 'customer' && (dispute.openedBy !== accountId || dispute.state !== 'waiting_customer' || response !== 'respond')) throw new Error('Response unavailable'); if (role === 'worker' && (accountId !== 'mock-user' || !['submitted', 'waiting_worker'].includes(dispute.state) || !['respond', 'accept_responsibility', 'contest'].includes(response))) throw new Error('Response unavailable'); dispute.state = 'waiting_staff'; mockEvent(dispute, role === 'customer' ? 'customer_response' : response === 'accept_responsibility' ? 'worker_accepted_responsibility' : response === 'contest' ? 'worker_contested' : 'worker_response', role, body); await project(dispute); });
  },
  async uploadEvidence(dispute, accountId, upload) {
    const file = new File(upload.uri); const mime = upload.mimeType || file.type; const bytes = upload.byteSize ?? file.size;
    if (!file.exists || !mime || !MIMES.has(mime) || bytes < 1 || bytes > MAX_BYTES) throw new Error('Invalid dispute evidence');
    await atomic(async state => { const stored = mockDispute(state, dispute.id); const authorized = dispute.viewerRole === 'customer' ? stored.openedBy === accountId : dispute.viewerRole === 'worker' && accountId === 'mock-user'; if (!authorized || !activeDisputeStates.includes(stored.state) || (dispute.viewerRole === 'worker' && stored.state === 'draft')) throw new Error('Evidence unavailable'); if (stored.evidence.length >= 10) throw new Error('Evidence limit reached'); const hash = contentHash(new Uint8Array(await file.arrayBuffer())); if (stored.evidence.some(item => (item as DisputeEvidence & { metadataHash?: string }).metadataHash === hash)) throw new Error('Duplicate dispute evidence'); const evidence = { id: id('mock-evidence'), uploaderRole: dispute.viewerRole as 'customer' | 'worker', mimeType: mime, byteSize: bytes, fileName: cleanFileName(upload.fileName, mime), url: upload.uri, createdAt: now(), metadataHash: hash } as DisputeEvidence & { metadataHash: string }; stored.evidence.push(evidence); mockEvent(stored, 'evidence_submitted', dispute.viewerRole, undefined, { evidenceId: evidence.id }); await project(stored); await notify('dispute_evidence_submitted', stored, stored.events.at(-1)!.id); });
  },
  async withdraw(disputeId, accountId, reason, key) {
    await atomic(async state => { if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (dispute.openedBy !== accountId || !['draft', 'submitted', 'waiting_customer', 'waiting_worker', 'waiting_staff'].includes(dispute.state) || reason.trim().length < 3) throw new Error('Dispute cannot be withdrawn'); dispute.state = 'cancelled'; mockEvent(dispute, 'cancelled', 'customer', reason); if (dispute.submittedAt) { await setMockDisputeEarningHold(dispute.bookingId, dispute.id, false); await setMockReviewDisputeHold(dispute.bookingId, dispute.id, false); await project(dispute); await notify('dispute_cancelled', dispute, dispute.events.at(-1)!.id); } });
  },
  async staffAction(disputeId, accountId, action, note, key) {
    await atomic(async state => { if (accountId !== 'mock-staff') throw new Error('Staff access required'); if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (action === 'close') { if (!mockCanTransition(dispute.state, 'closed')) throw new Error('Close unavailable'); dispute.state = 'closed'; dispute.closedAt = now(); mockEvent(dispute, 'closed', 'staff', note); await notify('dispute_closed', dispute, dispute.events.at(-1)!.id); } else { if (!activeDisputeStates.includes(dispute.state) || dispute.state === 'draft') throw new Error('Staff action unavailable'); if (action === 'assign') { dispute.state = dispute.state === 'submitted' ? 'waiting_staff' : dispute.state; mockEvent(dispute, 'assigned', 'staff', note); } else if (action === 'request_customer' || action === 'request_worker') { const next = action === 'request_customer' ? 'waiting_customer' : 'waiting_worker'; if (!mockCanTransition(dispute.state, next)) throw new Error('Staff action unavailable'); dispute.state = next; mockEvent(dispute, 'evidence_requested', 'staff', note, { target: action === 'request_customer' ? 'customer' : 'worker' }); await notify('dispute_evidence_requested', dispute, dispute.events.at(-1)!.id); } else if (action === 'review') { if (!mockCanTransition(dispute.state, 'under_review')) throw new Error('Staff action unavailable'); dispute.state = 'under_review'; dispute.reviewStartedAt = now(); mockEvent(dispute, 'review_started', 'staff', note); await notify('dispute_under_review', dispute, dispute.events.at(-1)!.id); } else { if (!mockCanTransition(dispute.state, 'rejected')) throw new Error('Staff action unavailable'); dispute.state = 'rejected'; dispute.resolvedAt = now(); dispute.resolution = { type: 'no_action', summary: note, financialAction: 'none' }; mockEvent(dispute, 'rejected', 'staff', note); await setMockDisputeEarningHold(dispute.bookingId, dispute.id, false); await setMockReviewDisputeHold(dispute.bookingId, dispute.id, false); await notify('dispute_resolved', dispute, dispute.events.at(-1)!.id); } } await project(dispute); });
  },
  async staffNote(disputeId, accountId, note, participantVisible, key) {
    await atomic(async state => { if (accountId !== 'mock-staff') throw new Error('Staff access required'); if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (['closed', 'cancelled'].includes(dispute.state) || note.trim().length < 3) throw new Error('Staff note unavailable'); mockEvent(dispute, participantVisible ? 'staff_update' : 'internal_note', 'staff', note, participantVisible ? {} : { visibility: 'staff' }); await project(dispute); });
  },
  async resolve(disputeId, accountId, input, key) {
    await atomic(async state => { if (accountId !== 'mock-staff') throw new Error('Staff access required'); if (!ensureKey(state, key)) return; const dispute = mockDispute(state, disputeId); if (!mockCanTransition(dispute.state, 'resolved') || input.summary.trim().length < 3) throw new Error('Resolution unavailable'); if (input.type === 'partial_compensation' && (!input.financialAction || input.financialAction === 'none' || !input.paymentId || !input.amountMinor)) throw new Error('Financial delegation required'); if (input.type === 'partial_compensation') await delegateMockDisputeFinancialAction({ bookingId: dispute.bookingId, paymentId: input.paymentId!, amountMinor: input.amountMinor!, action: input.financialAction as 'pre_release_refund' | 'post_release_case', idempotencyKey: `${key}:wps007` }); const returnVisitId = input.type === 'return_visit' || input.type === 'warranty_work' ? await createMockDisputeReturnVisit(dispute.bookingId, input.summary, `${key}:wps012`) : undefined; dispute.state = 'resolved'; dispute.resolvedAt = now(); dispute.resolution = { type: input.type, summary: input.summary.trim(), financialAction: input.financialAction ?? 'none', returnVisitId }; mockEvent(dispute, 'resolved', 'staff', input.summary, { financialDelegated: input.financialAction !== 'none' }); await setMockDisputeEarningHold(dispute.bookingId, dispute.id, false); await setMockReviewDisputeHold(dispute.bookingId, dispute.id, false); await project(dispute); await notify('dispute_resolved', dispute, dispute.events.at(-1)!.id); });
  },
};

export const disputeRepository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
export function disputeAccountId(mode: 'mock' | 'supabase', authenticatedId: string | undefined, role: DisputeRole) { return mode === 'mock' ? role === 'staff' ? 'mock-staff' : role === 'worker' ? 'mock-user' : 'mock-customer' : authenticatedId ?? ''; }
