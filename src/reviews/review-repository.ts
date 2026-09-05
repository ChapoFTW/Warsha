import { signedUrlSeconds } from '@/src/storage/signed-url-policy';
import Storage from 'expo-sqlite/kv-store';
import { File } from 'expo-file-system';

import { localBookingRepository } from '@/src/bookings/booking-repository';
import { environment } from '@/src/config/environment';
import { providers } from '@/src/data/mock-data';
import { getSupabaseClient } from '@/src/lib/supabase';
import { createMockNotification } from '@/src/notifications/notification-repository';
import { suppressMockReminderSimulations } from '@/src/notifications/notification-reminder-simulation';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import { getMockDisputePublicationHoldId } from '@/src/disputes/mock-dispute-state';

import { emptyDimensions } from './review-types';
import type { BookingReview, RatingSummary, ReputationBadges, ReviewInput, ReviewReport, ReviewReportReason, ReviewSort, ReviewVote } from './review-types';

type StoredReview = BookingReview & {
  ownerAccountId: string;
  visible: boolean;
  disputeHoldId?: string;
  staffHidden?: boolean;
};
type MockReportEvent = { reportId: string; actorId: string; fromStatus: ReviewReport['status']; toStatus: ReviewReport['status']; note: string; createdAt: string };
type MockModerationEvent = { reviewId: string; actorId: string; action: 'hide' | 'restore'; reason: string; previousStatus: 'visible' | 'hidden'; createdAt: string };
type MockState = {
  reviews: StoredReview[];
  votes: { reviewId: string; accountId: string; vote: ReviewVote }[];
  reports: (ReviewReport & { accountId: string; details: string })[];
  reportEvents: MockReportEvent[];
  moderationEvents: MockModerationEvent[];
};
const MOCK_KEY = 'warsha:reviews:v2';
let queue: Promise<unknown> = Promise.resolve();

const dimensionsFrom = (rating: number) => ({ professionalism: rating, quality: rating, punctuality: rating, communication: rating, value: rating });
const emptyBadges = (): ReputationBadges => ({ identityVerified: false, skillCertificateVerified: false, professionalCertificateVerified: false, topRated: false, fastResponder: false, experienced: false });
const emptySummary = (sort: ReviewSort, reviews: BookingReview[] = []): RatingSummary => ({
  average: reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : 0,
  count: reviews.length,
  distribution: { 1: reviews.filter(x => x.rating === 1).length, 2: reviews.filter(x => x.rating === 2).length, 3: reviews.filter(x => x.rating === 3).length, 4: reviews.filter(x => x.rating === 4).length, 5: reviews.filter(x => x.rating === 5).length },
  dimensions: reviews.length ? {
    professionalism: average(reviews.map(x => x.dimensions.professionalism)), quality: average(reviews.map(x => x.dimensions.quality)), punctuality: average(reviews.map(x => x.dimensions.punctuality)), communication: average(reviews.map(x => x.dimensions.communication)), value: average(reviews.map(x => x.dimensions.value)),
  } : emptyDimensions(),
  reviews, completedJobs: 0, responseSample: 0, completionSample: 0, repeatCustomerSample: 0, yearsOnPlatform: 0,
  badges: emptyBadges(), confidence: { score: 0, policyVersion: 'wps011-v1', evidenceSufficient: false }, sort,
});
function average(values: number[]) { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : 0; }
function atomic<T>(operation: () => Promise<T>) { const result = queue.then(operation, operation); queue = result.then(() => undefined, () => undefined); return result; }
function seedState(): MockState {
  const reviews: StoredReview[] = providers.flatMap(provider => provider.reviews.map((item, index) => ({
    id: item.id, bookingId: `mock-seed-${provider.id}-${index}`, providerId: provider.id, reviewerName: item.author,
    rating: item.rating, dimensions: dimensionsFrom(item.rating), comment: item.comment, isAnonymous: false,
    createdAt: new Date('2026-07-12T12:00:00.000Z').toISOString(), canEdit: false, attachments: [], helpfulCount: Math.max(1, 8 - index), notHelpfulCount: 0,
    ownerAccountId: `mock-seed-customer-${index}`, visible: true,
  })));
  return { reviews, votes: [], reports: [], reportEvents: [], moderationEvents: [] };
}
async function readMock() {
  try {
    const value = await Storage.getItem(MOCK_KEY);
    if (!value) return seedState();
    const parsed = JSON.parse(value) as Partial<MockState>;
    return { reviews: parsed.reviews ?? [], votes: parsed.votes ?? [], reports: parsed.reports ?? [], reportEvents: parsed.reportEvents ?? [], moderationEvents: parsed.moderationEvents ?? [] };
  } catch { return seedState(); }
}
async function writeMock(state: MockState) { await Storage.setItem(MOCK_KEY, JSON.stringify(state)); emitMockRealtime({ table: 'reviews', event: 'UPDATE' }); }
export async function setMockReviewDisputeHold(bookingId: string, disputeId: string, hold: boolean) {
  if (environment.dataMode !== 'mock') return;
  await atomic(async () => {
    const state = await readMock();
    const review = state.reviews.find(item => item.bookingId === bookingId);
    if (!review) return;
    if (hold) {
      review.disputeHoldId = disputeId;
      review.visible = false;
    } else if (review.disputeHoldId === disputeId) {
      review.disputeHoldId = undefined;
      review.visible = !review.staffHidden;
    }
    await writeMock(state);
  });
}
function safeRating(input: ReviewInput) {
  const values = [input.rating, ...Object.values(input.dimensions)];
  if (values.some(value => !Number.isInteger(value) || value < 1 || value > 5)) throw new Error('Choose a rating from 1 to 5 for every item.');
  if (input.comment.trim().length > 2000) throw new Error('Review is too long.');
  if (input.attachments.length > 4) throw new Error('Choose no more than four images.');
  if (input.attachments.some(item => !item.storagePath && (!item.mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType) || !item.size || item.size > 5 * 1024 * 1024))) throw new Error('Invalid review image.');
}
function sorted(reviews: StoredReview[], sort: ReviewSort) {
  return [...reviews].sort((a, b) => sort === 'highest_rated' ? b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
    : sort === 'lowest_rated' ? a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
      : sort === 'most_helpful' ? b.helpfulCount - a.helpfulCount || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt));
}
function mockProviderId(accountId: string) {
  const segment = accountId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'account';
  return accountId === 'mock-user' ? 'mostafa' : `mock-provider-${segment}`;
}
function isMockParticipant(review: StoredReview, accountId: string) { return review.ownerAccountId === accountId || review.providerId === mockProviderId(accountId); }
async function requireCompletedMockBooking(input: ReviewInput) {
  const booking = (await localBookingRepository.list()).find(item => item.id === input.bookingId);
  if (!booking || booking.status !== 'completed' || booking.providerId !== input.providerId) throw new Error('Only a completed booking can be reviewed.');
}
function mockSummary(state: MockState, providerId: string, sort: ReviewSort, accountId: string): RatingSummary {
  const reviews = sorted(state.reviews.filter(item => item.providerId === providerId && item.visible), sort).map(item => ({
    ...item,
    myVote: state.votes.find(vote => vote.reviewId === item.id && vote.accountId === accountId)?.vote,
  }));
  const summary = emptySummary(sort, reviews);
  const provider = providers.find(item => item.id === providerId);
  if (!provider) return summary;
  const completedJobs = provider.completedJobs;
  const completionRate = completedJobs > 0 ? 100 : undefined;
  const yearsOnPlatform = 4;
  const badges = {
    identityVerified: provider.verified,
    skillCertificateVerified: Boolean(provider.skillCertificateVerified),
    professionalCertificateVerified: Boolean(provider.professionalCertificateVerified),
    topRated: summary.count >= 20 && summary.average >= 4.7 && completionRate !== undefined && completionRate >= 90,
    fastResponder: false,
    experienced: completedJobs >= 50 || yearsOnPlatform >= 3,
  };
  const confidence = Math.round(summary.average / 5 * 40 + (completionRate ?? 0) * .25 + Math.min(summary.count, 20) * .5);
  return { ...summary, completedJobs, completionRate, completionSample: completedJobs, yearsOnPlatform, badges, confidence: { score: confidence, policyVersion: 'wps011-v1', evidenceSufficient: summary.count >= 5 } };
}

type Raw = Record<string, unknown>;
async function hydrateReviewImages(rows: Raw[], exposePaths: boolean) {
  const refs = rows.flatMap(row => Array.isArray(row.image_refs) ? row.image_refs.map(String) : []);
  if (!refs.length) return rows.map(row => mapReview(row, new Map(), exposePaths));
  const { data, error } = await getSupabaseClient().storage.from('review-attachments').createSignedUrls(refs, signedUrlSeconds('review-attachments'));
  if (error) throw error;
  const urls = new Map(refs.map((path, index) => [path, data?.[index]?.signedUrl ?? '']));
  return rows.map(row => mapReview(row, urls, exposePaths));
}
function mapReview(row: Raw, urls = new Map<string, string>(), exposePaths = false): BookingReview {
  const refs = Array.isArray(row.image_refs) ? row.image_refs.map(String) : [];
  const replies = Array.isArray(row.review_responses) ? row.review_responses as Raw[] : [];
  const reply = replies[0];
  return {
    id: String(row.id), bookingId: String(row.booking_id ?? ''), providerId: String(row.provider_id), reviewerName: String(row.reviewer_name ?? 'Customer'), rating: Number(row.rating),
    dimensions: { professionalism: Number(row.professionalism_rating ?? row.rating), quality: Number(row.quality_rating ?? row.rating), punctuality: Number(row.punctuality_rating ?? row.rating), communication: Number(row.communication_rating ?? row.rating), value: Number(row.value_rating ?? row.rating) },
    comment: String(row.comment ?? ''), isAnonymous: Boolean(row.is_anonymous), createdAt: String(row.created_at), editedAt: row.edited_at ? String(row.edited_at) : undefined,
    editDeadlineAt: row.edit_deadline_at ? String(row.edit_deadline_at) : undefined, canEdit: Boolean(row.can_edit),
    attachments: refs.map((path, index) => ({ id: `${row.id}-${index}`, url: urls.get(path) ?? '', ...(exposePaths ? { storagePath: path } : {}) })),
    reply: reply ? { id: String(reply.id), body: String(reply.body), createdAt: String(reply.created_at) } : undefined,
    helpfulCount: Number(row.helpful_count ?? 0), notHelpfulCount: Number(row.not_helpful_count ?? 0), myVote: row.my_vote === 'helpful' || row.my_vote === 'not_helpful' ? row.my_vote : undefined,
  };
}
function mapSummary(row: Raw, reviews: BookingReview[], sort: ReviewSort): RatingSummary {
  const distribution = row.distribution as Raw ?? {}; const dimensions = row.dimensions as Raw ?? {}; const badges = row.badges as Raw ?? {}; const confidence = row.confidence as Raw ?? {};
  return {
    average: Number(row.average ?? 0), count: Number(row.count ?? 0), distribution: { 1: Number(distribution['1'] ?? 0), 2: Number(distribution['2'] ?? 0), 3: Number(distribution['3'] ?? 0), 4: Number(distribution['4'] ?? 0), 5: Number(distribution['5'] ?? 0) },
    dimensions: { professionalism: Number(dimensions.professionalism ?? 0), quality: Number(dimensions.quality ?? 0), punctuality: Number(dimensions.punctuality ?? 0), communication: Number(dimensions.communication ?? 0), value: Number(dimensions.value ?? 0) }, reviews,
    completedJobs: Number(row.completed_jobs ?? 0), responseRate: row.response_rate === null || row.response_rate === undefined ? undefined : Number(row.response_rate), responseSample: Number(row.response_sample ?? 0), completionRate: row.completion_rate === null || row.completion_rate === undefined ? undefined : Number(row.completion_rate), completionSample: Number(row.completion_sample ?? 0), repeatCustomerPercentage: row.repeat_customer_percentage === null || row.repeat_customer_percentage === undefined ? undefined : Number(row.repeat_customer_percentage), repeatCustomerSample: Number(row.repeat_customer_sample ?? 0), yearsOnPlatform: Number(row.years_on_platform ?? 0),
    badges: { identityVerified: Boolean(badges.identityVerified), skillCertificateVerified: Boolean(badges.skillCertificateVerified), professionalCertificateVerified: Boolean(badges.professionalCertificateVerified), topRated: Boolean(badges.topRated), fastResponder: Boolean(badges.fastResponder), experienced: Boolean(badges.experienced) },
    confidence: { score: Number(confidence.score ?? 0), policyVersion: String(confidence.policy_version ?? 'wps011-v1'), evidenceSufficient: Boolean(confidence.evidence_sufficient) }, sort,
  };
}
function uniqueBookingIds(ids: string[]) { return [...new Set(ids.filter(Boolean))]; }

const mock = {
  async reviewedBookingIds(accountId: string, bookingIds: string[]) { const wanted = new Set(uniqueBookingIds(bookingIds)); return (await readMock()).reviews.filter(item => item.ownerAccountId === accountId && wanted.has(item.bookingId)).map(item => item.bookingId); },
  async summary(accountId: string, providerId: string, sort: ReviewSort) { return mockSummary(await readMock(), providerId, sort, accountId); },
  async byBooking(accountId: string, bookingId: string) { const row = (await readMock()).reviews.find(item => item.bookingId === bookingId); return row && isMockParticipant(row, accountId) ? { ...row, myVote: undefined, canEdit: row.ownerAccountId === accountId && Boolean(row.editDeadlineAt) && Date.now() <= Date.parse(row.editDeadlineAt!) } : undefined; },
  async submit(accountId: string, input: ReviewInput) { return atomic(async () => { safeRating(input); await requireCompletedMockBooking(input); const state = await readMock(); if (state.reviews.some(item => item.bookingId === input.bookingId)) throw new Error('This booking has already been reviewed.'); const now = new Date(); const disputeHoldId = await getMockDisputePublicationHoldId(input.bookingId); const review: StoredReview = { id: `mock-review-${Date.now()}`, bookingId: input.bookingId, providerId: input.providerId, reviewerName: input.isAnonymous ? 'Customer' : 'You', rating: input.rating, dimensions: input.dimensions, comment: input.comment.trim(), isAnonymous: input.isAnonymous, createdAt: now.toISOString(), editDeadlineAt: new Date(now.getTime() + 72 * 3600000).toISOString(), canEdit: true, attachments: input.attachments, helpfulCount: 0, notHelpfulCount: 0, ownerAccountId: accountId, visible: !disputeHoldId, disputeHoldId }; state.reviews.unshift(review); await writeMock(state); await suppressMockReminderSimulations('mock-customer', 'review_submitted', input.bookingId); await createMockNotification('new_review', input.bookingId); return review; }); },
  async edit(accountId: string, reviewId: string, input: ReviewInput) { return atomic(async () => { safeRating(input); const state = await readMock(); const review = state.reviews.find(item => item.id === reviewId && item.ownerAccountId === accountId); if (!review || !review.editDeadlineAt || Date.now() > Date.parse(review.editDeadlineAt)) throw new Error('Review edit window has closed'); Object.assign(review, { rating: input.rating, dimensions: input.dimensions, comment: input.comment.trim(), isAnonymous: input.isAnonymous, reviewerName: input.isAnonymous ? 'Customer' : 'You', attachments: input.attachments, editedAt: new Date().toISOString() }); await writeMock(state); return review; }); },
  async reply(accountId: string, reviewId: string, body: string) { return atomic(async () => { const normalized = body.trim(); if (!normalized || normalized.length > 1500) throw new Error('Enter a reply up to 1,500 characters.'); const state = await readMock(); const review = state.reviews.find(item => item.id === reviewId && item.providerId === mockProviderId(accountId)); if (!review) throw new Error('Reply is not available.'); if (review.reply) return review.reply; review.reply = { id: `mock-reply-${Date.now()}`, body: normalized, createdAt: new Date().toISOString() }; await writeMock(state); await createMockNotification('review_reply', review.bookingId); return review.reply; }); },
  async vote(accountId: string, reviewId: string, vote: ReviewVote) { return atomic(async () => { const state = await readMock(); const review = state.reviews.find(item => item.id === reviewId && item.visible); if (!review || review.ownerAccountId === accountId || review.providerId === mockProviderId(accountId)) throw new Error('Vote is not available.'); const existing = state.votes.find(item => item.reviewId === reviewId && item.accountId === accountId); if (existing) existing.vote = vote; else state.votes.push({ reviewId, accountId, vote }); review.helpfulCount = state.votes.filter(item => item.reviewId === reviewId && item.vote === 'helpful').length; review.notHelpfulCount = state.votes.filter(item => item.reviewId === reviewId && item.vote === 'not_helpful').length; await writeMock(state); return { ...review, myVote: vote }; }); },
  async report(accountId: string, reviewId: string, reason: ReviewReportReason, details: string) { return atomic(async () => { if (!['spam', 'abuse', 'fake_review', 'offensive_content'].includes(reason) || details.trim().length > 1000) throw new Error('Invalid report.'); const state = await readMock(); if (!state.reviews.some(item => item.id === reviewId && item.visible)) throw new Error('Report is not available.'); let report = state.reports.find(item => item.reviewId === reviewId && item.accountId === accountId); if (report) Object.assign(report, { reason, details: details.trim(), status: report.status === 'resolved' || report.status === 'dismissed' ? 'submitted' as const : report.status }); else { report = { id: `mock-report-${Date.now()}`, reviewId, reason, details: details.trim(), status: 'submitted', createdAt: new Date().toISOString(), accountId }; state.reports.push(report); } await writeMock(state); return report; }); },
  async transitionReport(actorId: string, reportId: string, status: Exclude<ReviewReport['status'], 'submitted'>, note: string) { return atomic(async () => { if (!['in_review', 'resolved', 'dismissed'].includes(status) || note.trim().length > 1000) throw new Error('Invalid report transition.'); const state = await readMock(); const report = state.reports.find(item => item.id === reportId); if (!report) throw new Error('Report not found.'); state.reportEvents.push({ reportId, actorId, fromStatus: report.status, toStatus: status, note: note.trim(), createdAt: new Date().toISOString() }); report.status = status; await writeMock(state); return report; }); },
  async simulateModeration(actorId: string, reviewId: string, hidden: boolean, reason = 'Mock staff review') { return atomic(async () => { if (!reason.trim() || reason.trim().length > 1000) throw new Error('Invalid moderation reason.'); const state = await readMock(); const review = state.reviews.find(item => item.id === reviewId); if (!review) throw new Error('Review not found'); const previousStatus = review.visible ? 'visible' : 'hidden'; review.staffHidden = hidden; review.disputeHoldId = hidden ? review.disputeHoldId : await getMockDisputePublicationHoldId(review.bookingId); review.visible = !review.staffHidden && !review.disputeHoldId; state.moderationEvents.push({ reviewId, actorId, action: hidden ? 'hide' : 'restore', reason: reason.trim(), previousStatus, createdAt: new Date().toISOString() }); await writeMock(state); }); },
};

export const reviewMockStaffHarness = {
  transitionReport(actorId: string, reportId: string, status: Exclude<ReviewReport['status'], 'submitted'>, note: string) {
    if (environment.dataMode !== 'mock') throw new Error('Mock review staff harness is disabled outside Mock mode.');
    return mock.transitionReport(actorId, reportId, status, note);
  },
  moderateReview(actorId: string, reviewId: string, hidden: boolean, reason?: string) {
    if (environment.dataMode !== 'mock') throw new Error('Mock review staff harness is disabled outside Mock mode.');
    return mock.simulateModeration(actorId, reviewId, hidden, reason);
  },
};

async function uploadAttachments(input: ReviewInput) {
  const client = getSupabaseClient(); const { data: { user }, error: userError } = await client.auth.getUser(); if (userError || !user) throw userError ?? new Error('Authentication required');
  const paths: string[] = []; const uploaded: string[] = [];
  try {
    for (const [index, attachment] of input.attachments.entries()) {
      if (attachment.storagePath) { paths.push(attachment.storagePath); continue; }
      const file = new File(attachment.url); const mime = attachment.mimeType || file.type;
      if (!file.exists || !mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || file.size > 5 * 1024 * 1024) throw new Error('Invalid review image');
      const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const hash = (file.md5 ?? attachment.contentHash ?? `${Date.now().toString(16)}${index.toString(16).padStart(8, '0')}`).toLowerCase().replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 64);
      const path = `${user.id}/${input.bookingId}/review/${hash}.${extension}`;
      const { error } = await client.storage.from('review-attachments').upload(path, await file.arrayBuffer(), { contentType: mime, upsert: false });
      if (error && !error.message.toLowerCase().includes('duplicate')) throw error;
      if (!error) uploaded.push(path); paths.push(path);
    }
    return { paths, uploaded };
  } catch (error) { if (uploaded.length) await client.storage.from('review-attachments').remove(uploaded); throw error; }
}
const ratingArgs = (input: ReviewInput) => ({ p_booking_id: input.bookingId, p_rating: input.rating, p_professionalism: input.dimensions.professionalism, p_quality: input.dimensions.quality, p_punctuality: input.dimensions.punctuality, p_communication: input.dimensions.communication, p_value: input.dimensions.value, p_comment: input.comment.trim(), p_is_anonymous: input.isAnonymous });

const supabase = {
  async reviewedBookingIds(_accountId: string, bookingIds: string[]) { const ids = uniqueBookingIds(bookingIds); if (!ids.length) return []; const { data, error } = await getSupabaseClient().from('reviews').select('booking_id').in('booking_id', ids); if (error) throw error; return [...new Set((data ?? []).map(row => String(row.booking_id)))]; },
  async summary(_accountId: string, providerId: string, sort: ReviewSort) { const { data, error } = await getSupabaseClient().rpc('get_provider_reputation_summary', { p_provider_id: providerId, p_sort: sort, p_limit: 20, p_offset: 0 }); if (error) throw error; const row = (data ?? {}) as Raw; const reviews = await hydrateReviewImages(Array.isArray(row.reviews) ? row.reviews as Raw[] : [], false); return mapSummary(row, reviews, sort); },
  async byBooking(_accountId: string, bookingId: string) { const { data, error } = await getSupabaseClient().rpc('get_booking_review_v2', { p_booking_id: bookingId }); if (error) throw error; if (!data) return undefined; return (await hydrateReviewImages([data as Raw], true))[0]; },
  async submit(_accountId: string, input: ReviewInput) { const staged = await uploadAttachments(input); try { const { data, error } = await getSupabaseClient().rpc('submit_booking_review_v2', { ...ratingArgs(input), p_attachment_paths: staged.paths }); if (error) throw error; return (await hydrateReviewImages([data as Raw], true))[0]; } catch (error) { if (staged.uploaded.length) await getSupabaseClient().storage.from('review-attachments').remove(staged.uploaded); throw error; } },
  async edit(_accountId: string, reviewId: string, input: ReviewInput) { const previous = input.previousAttachmentPaths ?? []; const staged = await uploadAttachments(input); try { const { data, error } = await getSupabaseClient().rpc('edit_booking_review', { p_review_id: reviewId, ...ratingArgs(input), p_attachment_paths: staged.paths }); if (error) throw error; const removed = previous.filter(path => !staged.paths.includes(path)); if (removed.length) await getSupabaseClient().storage.from('review-attachments').remove(removed); return (await hydrateReviewImages([data as Raw], true))[0]; } catch (error) { if (staged.uploaded.length) await getSupabaseClient().storage.from('review-attachments').remove(staged.uploaded); throw error; } },
  async reply(_accountId: string, reviewId: string, body: string) { const { data, error } = await getSupabaseClient().rpc('reply_to_booking_review', { p_review_id: reviewId, p_body: body.trim() }); if (error) throw error; const row = data as Raw; return { id: String(row.id), body: String(row.body), createdAt: String(row.created_at) }; },
  async vote(_accountId: string, reviewId: string, vote: ReviewVote) { const { error } = await getSupabaseClient().rpc('vote_review_helpfulness', { p_review_id: reviewId, p_vote: vote }); if (error) throw error; },
  async report(_accountId: string, reviewId: string, reason: ReviewReportReason, details: string) { const { data, error } = await getSupabaseClient().rpc('report_review', { p_review_id: reviewId, p_reason: reason, p_details: details.trim() }); if (error) throw error; const row = data as Raw; return { id: String(row.id), reviewId: String(row.review_id), reason: String(row.reason) as ReviewReportReason, status: String(row.status) as ReviewReport['status'], createdAt: String(row.created_at) }; },
};

export const reviewRepository = environment.dataMode === 'supabase' ? supabase : mock;
