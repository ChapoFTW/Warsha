/**
 * How long a signed URL for each bucket may live.
 *
 * ## Why this file exists
 *
 * `private.storage_bucket_lifecycle` has declared a `signed_url_seconds` for
 * every bucket since WPS-022. Nothing read it. Each call site passed its own
 * numeric literal instead, and two of them had drifted four times past the
 * declared policy: chat attachments and booking attachments were being signed
 * for 3600 seconds against a declared 900.
 *
 * That is not a cosmetic inconsistency. A signed URL is a bearer token — anyone
 * holding the string can fetch the object, with no session and no further
 * check. The expiry is the entire blast radius. A URL that leaks into a
 * screenshot, a support ticket, a shared browser history or a proxy log is
 * usable for exactly as long as this number says, and 3600 is four times the
 * exposure the policy was written to allow.
 *
 * So the number lives in one place now, and `scripts/signed-url-policy.test.mts`
 * fails if a call site passes a literal or if this table stops agreeing with the
 * database. Fixing two numbers would have left the third drift free to happen;
 * removing the ability to write a number at a call site is the actual fix.
 *
 * ## The rule for changing a value
 *
 * Shorter is always safe. Longer needs a reason, and needs the migration that
 * changes `private.storage_bucket_lifecycle` in the same commit, because the
 * test compares the two and will fail otherwise.
 */

/** Buckets Warsha signs URLs for, and the lifetime the policy allows. */
export const SIGNED_URL_SECONDS = {
  // Participant-scoped conversation media. Fifteen minutes is enough to open an
  // image; an hour was enough to forward one.
  'chat-attachments': 900,
  // The photographs a customer attaches to a booking. Same reasoning.
  'booking-attachments': 900,
  // Evidence in an open dispute, read by participants and staff.
  'dispute-evidence': 900,
  // Progress photographs during a live job. An hour is declared here because a
  // worker on site loses signal and reopens the screen, and re-signing on a bad
  // connection is worse than the extra window on a photograph of a pipe.
  'job-progress-media': 3600,
  'marketplace-request-attachments': 900,
  'profile-images': 900,
  'provider-portfolios': 900,
  'provider-certificates': 900,
  'review-attachments': 900,
  // Identity documents. Read by their owner and by staff holding
  // `review_identity_verification`, and never by anybody else.
  'verification-documents': 900,
  // The two most sensitive buckets Warsha has: a criminal record, and a full
  // export of somebody's personal data. Five minutes, deliberately shorter than
  // everything else, because the cost of one leaked URL is highest here.
  'worker-criminal-records': 300,
  'privacy-exports': 300,
  'support-attachments': 300,
} as const;

export type SignedUrlBucket = keyof typeof SIGNED_URL_SECONDS;

/**
 * The lifetime for a bucket.
 *
 * Typed against the table rather than taking a `string`, so a bucket nobody has
 * written a policy for cannot be signed at all — the call does not compile.
 */
export function signedUrlSeconds(bucket: SignedUrlBucket): number {
  return SIGNED_URL_SECONDS[bucket];
}
