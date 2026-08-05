/**
 * WPS-022 staff privacy contracts.
 *
 * Kept in a separate module from `privacy-types.ts` on purpose. The account
 * surface and the staff surface must never share a type: a shared type is how
 * a manifest field ends up on a staff screen because it was already there.
 *
 * Note what these types cannot carry. `StaffPrivacyRequest` has no manifest,
 * no reason code, and no blocker list — only a count. `RetentionPreview` has
 * no row identifiers, only totals. The shapes below are the whole of what
 * staff may see, and the server returns nothing more.
 */

export type StaffPrivacyRequestKind = 'deletion';

export type StaffPrivacyRequest = {
  id: string;
  kind: StaffPrivacyRequestKind;
  /** A truncated reference, never a full account identifier. */
  subjectRef: string;
  status: string;
  requestedAt: string;
  coolingOffEndsAt: string;
  /** How many blockers, not which. Which would leak the account's affairs. */
  blockerCount: number;
};

export type RetentionLegalReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export type RetentionPreview = {
  ruleKey: string;
  mode: 'dry_run';
  /** False when no automated counter exists — reported, never faked as zero. */
  supported: boolean;
  runId?: string;
  candidateRows?: number;
  accountsUnderHold?: number;
  proposedDays?: number;
  actionAtExpiry?: string;
  legalReviewStatus: RetentionLegalReviewStatus;
  executionEnabled: boolean;
  note?: string;
};

/**
 * The rules the privacy screen previews.
 *
 * Listed here rather than discovered, so the screen makes a bounded number of
 * calls and an operator sees the same rules in the same order every time.
 */
export const previewableRetentionRules: readonly string[] = [
  'recent_search_history',
  'recently_viewed_history',
  'typing_state',
  'expired_privacy_exports',
  'revoked_device_tokens',
  'rate_limit_events',
  'identity_documents',
  'financial_records',
  'dispute_evidence',
  'support_attachments',
  'chat_messages',
];
