import { supabase } from '@/lib/supabase';
import {
  editReviewArgs,
  mapReview,
  REVIEW_IMAGE_TYPES,
  REVIEW_MAX_IMAGE_BYTES,
  REVIEW_MAX_IMAGES,
  reviewAttachmentPath,
  submitReviewArgs,
  type Raw,
} from '@/src/reviews/review-mapping';
import type { BookingReview, ReviewDimensions, ProviderReply } from '@/src/reviews/review-types';
import { signedUrlSeconds } from '@/src/storage/signed-url-policy';

/**
 * Reviews on the web, through the same functions the phone calls.
 *
 * There is no second review system here: `get_booking_review_v2`,
 * `submit_booking_review_v2`, `edit_booking_review` and
 * `reply_to_booking_review`, with rows read by the shared `mapReview`, the
 * arguments built by the shared `submitReviewArgs` / `editReviewArgs`, and
 * photos held to the shared limits and stored where the server's path rule
 * accepts them.
 */

const BUCKET = 'review-attachments';

async function withPhotoUrls(row: Raw): Promise<BookingReview> {
  const refs = Array.isArray(row.image_refs) ? row.image_refs.map(String) : [];
  if (!refs.length) return mapReview(row, new Map(), true);
  const { data, error } = await supabase().storage.from(BUCKET)
    .createSignedUrls(refs, signedUrlSeconds('review-attachments'));
  // A photo that cannot be signed is shown as unavailable, not as a failure of
  // the whole review.
  const urls = new Map(refs.map((path, index) => [path, error ? '' : data?.[index]?.signedUrl ?? '']));
  return mapReview(row, urls, true);
}

/** The review on this booking, for its Customer or its Professional; null if none. */
export async function loadBookingReview(bookingId: string): Promise<BookingReview | null> {
  const { data, error } = await supabase().rpc('get_booking_review_v2', { p_booking_id: bookingId });
  if (error) throw error;
  if (!data) return null;
  return withPhotoUrls(data as Raw);
}

export type PhotoProblem = 'type' | 'size' | 'count';

/** Why a chosen photo cannot be used, by the limits the bucket enforces. */
export function photoProblem(file: File, alreadyChosen: number): PhotoProblem | null {
  if (alreadyChosen >= REVIEW_MAX_IMAGES) return 'count';
  if (!(REVIEW_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size <= 0 || file.size > REVIEW_MAX_IMAGE_BYTES) return 'size';
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type ReviewDraft = {
  rating: number;
  dimensions: ReviewDimensions;
  comment: string;
  isAnonymous: boolean;
  /** Photos already on the review that the Customer is keeping. */
  keptPaths: string[];
  /** Photos chosen now. */
  files: File[];
};

/**
 * Publish or edit the Customer's review of a completed booking.
 *
 * New photos are uploaded first, named by their content, then the review is
 * written with every path it should carry. If the write is refused, the
 * photos this call uploaded are removed; if an edit succeeds, photos the
 * Customer took off are removed.
 */
export async function saveBookingReview(
  accountId: string,
  bookingId: string,
  existing: BookingReview | null,
  draft: ReviewDraft,
): Promise<BookingReview> {
  const client = supabase();
  const uploaded: string[] = [];
  const paths = [...draft.keptPaths];
  try {
    for (const file of draft.files) {
      if (photoProblem(file, paths.length)) throw new Error('photo');
      const path = reviewAttachmentPath(accountId, bookingId, await sha256Hex(file), file.type);
      if (paths.includes(path)) continue;
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error && !error.message.toLowerCase().includes('duplicate') && !error.message.toLowerCase().includes('exists')) throw error;
      if (!error) uploaded.push(path);
      paths.push(path);
    }
    const input = {
      bookingId, providerId: existing?.providerId ?? '', rating: draft.rating, dimensions: draft.dimensions,
      comment: draft.comment, isAnonymous: draft.isAnonymous, attachments: [],
    };
    const { data, error } = existing
      ? await client.rpc('edit_booking_review', editReviewArgs(existing.id, input, paths))
      : await client.rpc('submit_booking_review_v2', submitReviewArgs(input, paths));
    if (error) throw error;
    if (existing) {
      const previous = existing.attachments.flatMap((item) => item.storagePath ? [item.storagePath] : []);
      const removed = previous.filter((path) => !paths.includes(path));
      if (removed.length) await client.storage.from(BUCKET).remove(removed);
    }
    return withPhotoUrls(data as Raw);
  } catch (failure) {
    if (uploaded.length) await client.storage.from(BUCKET).remove(uploaded);
    throw failure;
  }
}

/** The Professional's one reply to the review of their job. It cannot be changed. */
export async function replyToReview(reviewId: string, body: string): Promise<ProviderReply> {
  const { data, error } = await supabase().rpc('reply_to_booking_review', { p_review_id: reviewId, p_body: body.trim() });
  if (error) throw error;
  const row = data as Raw;
  return { id: String(row.id), body: String(row.body), createdAt: String(row.created_at) };
}
