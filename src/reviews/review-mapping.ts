import type { BookingReview, RatingSummary, ReviewInput, ReviewSort } from './review-types.ts';

/**
 * How a review row from the server becomes a review, on every surface.
 *
 * These lived inside the phone's repository, beside `expo-file-system` and
 * `expo-sqlite`, so the web could not use them and would have had to re-read
 * the same JSON its own way. They are platform-free and shared now: the phone's
 * repository and the web's read the same rows into the same shapes, send the
 * same arguments, and hold photos to the same rules.
 */
export type Raw = Record<string, unknown>;

/** The rules `submit_booking_review_v2` and the storage bucket enforce. */
export const REVIEW_MAX_IMAGES = 4;
export const REVIEW_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const REVIEW_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const REVIEW_COMMENT_MAX = 2000;
export const REVIEW_REPLY_MAX = 1500;

/**
 * Where a review photo is stored. `private.is_safe_review_attachment_path`
 * accepts only `<account>/<booking>/review/<32 to 64 hex>.<jpg|png|webp>`.
 */
export function reviewAttachmentPath(accountId: string, bookingId: string, hash: string, mimeType: string): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const hex = hash.toLowerCase().replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 64);
  return `${accountId}/${bookingId}/review/${hex}.${extension}`;
}

export function mapReview(row: Raw, urls = new Map<string, string>(), exposePaths = false): BookingReview {
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

export function mapSummary(row: Raw, reviews: BookingReview[], sort: ReviewSort): RatingSummary {
  const distribution = row.distribution as Raw ?? {}; const dimensions = row.dimensions as Raw ?? {}; const badges = row.badges as Raw ?? {}; const confidence = row.confidence as Raw ?? {};
  return {
    average: Number(row.average ?? 0), count: Number(row.count ?? 0), distribution: { 1: Number(distribution['1'] ?? 0), 2: Number(distribution['2'] ?? 0), 3: Number(distribution['3'] ?? 0), 4: Number(distribution['4'] ?? 0), 5: Number(distribution['5'] ?? 0) },
    dimensions: { professionalism: Number(dimensions.professionalism ?? 0), quality: Number(dimensions.quality ?? 0), punctuality: Number(dimensions.punctuality ?? 0), communication: Number(dimensions.communication ?? 0), value: Number(dimensions.value ?? 0) }, reviews,
    completedJobs: Number(row.completed_jobs ?? 0), responseRate: row.response_rate === null || row.response_rate === undefined ? undefined : Number(row.response_rate), responseSample: Number(row.response_sample ?? 0), completionRate: row.completion_rate === null || row.completion_rate === undefined ? undefined : Number(row.completion_rate), completionSample: Number(row.completion_sample ?? 0), repeatCustomerPercentage: row.repeat_customer_percentage === null || row.repeat_customer_percentage === undefined ? undefined : Number(row.repeat_customer_percentage), repeatCustomerSample: Number(row.repeat_customer_sample ?? 0), yearsOnPlatform: Number(row.years_on_platform ?? 0),
    badges: { identityVerified: Boolean(badges.identityVerified), skillCertificateVerified: Boolean(badges.skillCertificateVerified), professionalCertificateVerified: Boolean(badges.professionalCertificateVerified), topRated: Boolean(badges.topRated), fastResponder: Boolean(badges.fastResponder), experienced: Boolean(badges.experienced) },
    confidence: { score: Number(confidence.score ?? 0), policyVersion: String(confidence.policy_version ?? 'wps011-v1'), evidenceSufficient: Boolean(confidence.evidence_sufficient) }, sort,
  };
}

/**
 * The scores, words and anonymity both writers take, by the names the
 * functions declare. PostgREST finds a function by its argument names, so one
 * name too many is not ignored — it is "no such function".
 */
const scoreArgs = (input: ReviewInput) => ({
  p_rating: input.rating,
  p_professionalism: input.dimensions.professionalism,
  p_quality: input.dimensions.quality,
  p_punctuality: input.dimensions.punctuality,
  p_communication: input.dimensions.communication,
  p_value: input.dimensions.value,
  p_comment: input.comment.trim(),
  p_is_anonymous: input.isAnonymous,
});

/** `submit_booking_review_v2(p_booking_id, …scores, p_attachment_paths)`. */
export const submitReviewArgs = (input: ReviewInput, attachmentPaths: string[]) => ({
  p_booking_id: input.bookingId, ...scoreArgs(input), p_attachment_paths: attachmentPaths,
});

/**
 * `edit_booking_review(p_review_id, …scores, p_attachment_paths)` — no booking
 * id. The phone sent the submit arguments plus `p_review_id`, so every edit
 * against the real backend asked for a function that does not exist and
 * failed; Mock never calls the server, which is why nobody saw it.
 */
export const editReviewArgs = (reviewId: string, input: ReviewInput, attachmentPaths: string[]) => ({
  p_review_id: reviewId, ...scoreArgs(input), p_attachment_paths: attachmentPaths,
});
