/**
 * Customer and worker support, on the WPS-019 authority.
 *
 * What exists server-side, verified against the grant list in the migration
 * rather than assumed from the mobile repository:
 *
 *   open_support_case(category, subject, body, idempotencyKey,
 *                     linkedType, linkedId, originSurface, locale)
 *   get_my_support_case(caseId)
 *   reopen_support_case(caseId, reason, idempotencyKey)
 *   submit_support_satisfaction(caseId, score, comment)
 *   register_support_attachment(caseId, ...)
 *   get_help_center(locale, surface) and the help article reads
 *
 * **`get_my_support_cases` and `reply_support_case` do not exist.** The mobile
 * repository calls both, and neither is in the migration or the grant loop, so
 * those two mobile paths cannot be working against Supabase. That is recorded
 * here rather than worked around: listing is done through the owner-scoped RLS
 * policy on `public.support_tickets`, which is a real authority
 * (`support_tickets_scoped_read`: `requester_id = auth.uid()`), and replying is
 * simply not offered because there is nothing governed to call.
 *
 * Offering a reply box that silently fails is exactly the "button that fails
 * when used" this work exists to remove.
 */

/** The categories `support_tickets_category_check` permits. Anything else is rejected. */
export const SUPPORT_CATEGORIES = [
  'account_access', 'booking_help', 'worker_onboarding', 'verification_help',
  'payment_question', 'withdrawal_question', 'technical_issue', 'app_feedback', 'other',
] as const;

export type SupportCategory = typeof SUPPORT_CATEGORIES[number];

/** The surfaces `open_support_case` validates `p_origin_surface` against. */
export const SUPPORT_SURFACES = [
  'help_center', 'booking', 'payment', 'verification', 'portfolio', 'notification',
  'review', 'dispute', 'marketplace', 'chat', 'settings', 'account', 'onboarding',
  'earnings', 'other',
] as const;

/** `support_tickets_subject_check`: btrim(subject) between 3 and 200. */
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 200;

export type SupportCaseSummary = {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string | null;
};

export function parseCaseSummaries(value: unknown): SupportCaseSummary[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is SupportCaseSummary =>
    Boolean(row) && typeof (row as SupportCaseSummary).id === 'string');
}

export type SupportMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  actorRole: string | null;
  createdAt: string;
};

export type SupportCaseDetail = {
  caseId: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  closed: boolean;
  resolved: boolean;
  canReply: boolean;
  canReopen: boolean;
  canAttach: boolean;
  surveyAvailable: boolean;
  reopenedCount: number;
  messages: SupportMessage[];
};

export function parseCaseDetail(value: unknown): SupportCaseDetail | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.caseId !== 'string') return null;
  return {
    caseId: raw.caseId,
    subject: String(raw.subject ?? ''),
    category: String(raw.category ?? ''),
    status: String(raw.status ?? ''),
    priority: String(raw.priority ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    closed: raw.closed === true,
    resolved: raw.resolved === true,
    canReply: raw.canReply === true,
    canReopen: raw.canReopen === true,
    canAttach: raw.canAttach === true,
    surveyAvailable: raw.surveyAvailable === true,
    reopenedCount: typeof raw.reopenedCount === 'number' ? raw.reopenedCount : 0,
    messages: Array.isArray(raw.messages) ? raw.messages as SupportMessage[] : [],
  };
}

/**
 * An idempotency key for one intake attempt.
 *
 * `open_support_case` dedupes on it and returns `duplicate: true` rather than
 * opening a second case, so a double-submit or a retry after a dropped
 * response cannot produce two tickets about one problem. The key is generated
 * once per form, not per click.
 */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function subjectValid(subject: string): boolean {
  const trimmed = subject.trim();
  return trimmed.length >= SUBJECT_MIN && trimmed.length <= SUBJECT_MAX;
}
