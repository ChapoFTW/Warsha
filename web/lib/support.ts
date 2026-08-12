/**
 * Customer and worker support, on the shipped authority.
 *
 * What exists server-side, read out of the migrations rather than assumed:
 *
 *   WPS-017  reply_support_case(caseId, body, idempotencyKey)
 *            get_my_support_cases()
 *   WPS-019  open_support_case(category, subject, body, idempotencyKey,
 *                              linkedType, linkedId, originSurface, locale)
 *            get_my_support_case(caseId)
 *            reopen_support_case(caseId, reason, idempotencyKey)
 *            submit_support_satisfaction(caseId, score, comment)
 *            register_support_attachment(caseId, …)
 *
 * An earlier version of this file recorded the first two as absent, and the
 * support page was built without a reply box because of it. Both are defined in
 * WPS-017 and granted in the same migration; the audit that missed them only
 * matched single-line function signatures, so every multi-line definition was
 * invisible to it. Worth stating plainly, because the cost was a *missing*
 * feature rather than a broken one — the kind of mistake that survives, because
 * nothing fails and nobody files a bug about a button that was never there.
 *
 * **Every limit below is copied from a server constraint, not chosen.** The
 * client checks first so somebody is told before a round trip; the database
 * checks again and remains the authority.
 *
 * **Staff-only material never reaches here.** Both read RPCs select messages
 * `where visibility = 'participants'`, so an internal note is not merely hidden
 * by the interface — it is never sent to it.
 */

/*
 * The vocabulary is imported, never restated.
 *
 * `src/support/support-types.ts` already holds the category, status and surface
 * sets and the reopen limits, and the mobile client reads them from there. This
 * file briefly carried its own copies — which is how the two surfaces would
 * eventually have offered different categories from the same database.
 */
export {
  supportCategories as SUPPORT_CATEGORIES,
  supportStatuses as SUPPORT_STATUSES,
  supportSurfaces as SUPPORT_SURFACES,
  supportMaxReopens as REOPEN_LIMIT,
  supportReopenWindowDays as REOPEN_WINDOW_DAYS,
  type SupportCategory,
  type SupportStatus,
  type SupportSurface,
} from '../../src/support/support-types.ts';

/** `support_tickets_subject_check`: btrim(subject) between 3 and 200. */
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 200;

/** `reply_support_case`: btrim(body) between 1 and 4000. */
export const REPLY_MIN = 1;
export const REPLY_MAX = 4000;

/** `reopen_support_case`: btrim(reason) between 3 and 2000. */
export const REOPEN_MIN = 3;
export const REOPEN_MAX = 2000;

export type SupportMessage = {
  id: string;
  body: string;
  /** Server-computed `m.sender_id = auth.uid()`. Never inferred here. */
  fromMe: boolean;
  createdAt: string;
  attachmentId?: string | null;
};

/** One entry of the case's own history, from `support_ticket_events`. */
export type SupportEvent = {
  id: string;
  action: string;
  toStatus: string | null;
  /** `participant` or `staff`. The actor's identity is deliberately absent. */
  actorRole: string | null;
  createdAt: string;
};

export type SupportCaseSummary = {
  caseId: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  lastReplyAt: string | null;
  messageCount: number;
};

/**
 * Read the `get_my_support_cases()` payload.
 *
 * Rows without a case id are dropped rather than rendered as blanks: a list
 * entry that cannot be opened is worse than one that is not shown.
 */
export function parseCaseSummaries(value: unknown): SupportCaseSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.caseId !== 'string') return [];
    return [{
      caseId: raw.caseId,
      subject: String(raw.subject ?? ''),
      category: String(raw.category ?? ''),
      status: String(raw.status ?? ''),
      priority: String(raw.priority ?? ''),
      createdAt: String(raw.createdAt ?? ''),
      lastReplyAt: typeof raw.lastReplyAt === 'string' ? raw.lastReplyAt : null,
      messageCount: Array.isArray(raw.messages) ? raw.messages.length : 0,
    }];
  });
}

export type SupportCaseDetail = {
  caseId: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  lastReplyAt: string | null;
  /**
   * These four are decided by the server and simply obeyed.
   *
   * The reopen rule alone is "resolved, fewer than three reopens, resolved
   * within fourteen days" — three facts the client would have to re-derive and
   * would eventually get wrong. `get_my_support_case` computes them, so the
   * interface only has to render them.
   */
  canReply: boolean;
  canReopen: boolean;
  canAttach: boolean;
  surveyAvailable: boolean;
  reopenedCount: number;
  satisfactionScore: number | null;
  messages: SupportMessage[];
  events: SupportEvent[];
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
    lastReplyAt: typeof raw.lastReplyAt === 'string' ? raw.lastReplyAt : null,
    canReply: raw.canReply === true,
    canReopen: raw.canReopen === true,
    canAttach: raw.canAttach === true,
    surveyAvailable: raw.surveyAvailable === true,
    reopenedCount: typeof raw.reopenedCount === 'number' ? raw.reopenedCount : 0,
    satisfactionScore: typeof raw.satisfactionScore === 'number' ? raw.satisfactionScore : null,
    messages: parseMessages(raw.messages),
    events: parseEvents(raw.events),
  };
}

function parseMessages(value: unknown): SupportMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string') return [];
    return [{
      id: raw.id,
      body: String(raw.body ?? ''),
      fromMe: raw.fromMe === true,
      createdAt: String(raw.createdAt ?? ''),
      attachmentId: typeof raw.attachmentId === 'string' ? raw.attachmentId : null,
    }];
  });
}

function parseEvents(value: unknown): SupportEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string') return [];
    return [{
      id: raw.id,
      action: String(raw.action ?? ''),
      toStatus: typeof raw.toStatus === 'string' ? raw.toStatus : null,
      actorRole: typeof raw.actorRole === 'string' ? raw.actorRole : null,
      createdAt: String(raw.createdAt ?? ''),
    }];
  });
}

/**
 * An idempotency key for one write attempt.
 *
 * Every support write dedupes on it: `open_support_case` returns
 * `duplicate: true` rather than opening a second ticket, and
 * `reply_support_case` returns the existing `messageId` rather than posting the
 * same paragraph twice. So the key is generated once per composed message —
 * per form, not per click — and a fresh one is taken only after a send
 * succeeds.
 *
 * The server requires between 8 and 200 characters; both branches clear that.
 */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function subjectValid(subject: string): boolean {
  const trimmed = subject.trim();
  return trimmed.length >= SUBJECT_MIN && trimmed.length <= SUBJECT_MAX;
}

export function replyValid(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length >= REPLY_MIN && trimmed.length <= REPLY_MAX;
}

export function reopenReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= REOPEN_MIN && trimmed.length <= REOPEN_MAX;
}

/**
 * Turn a Postgres refusal into something a person can act on.
 *
 * The messages are raised by the RPCs above with specific SQLSTATEs; matching
 * on the text is deliberate and narrow, and anything unrecognised falls through
 * to the generic failure rather than being guessed at.
 */
export type SupportFailure =
  | 'closed'
  | 'not_found'
  | 'rate_limited'
  | 'too_long'
  | 'reopen_exhausted'
  | 'reopen_window_passed'
  | 'failed';

export function classifySupportError(message: string | undefined): SupportFailure {
  const text = message ?? '';
  if (/rate limit/i.test(text)) return 'rate_limited';
  if (/case is closed/i.test(text)) return 'closed';
  if (/cannot be reopened again/i.test(text)) return 'reopen_exhausted';
  if (/reopen window/i.test(text)) return 'reopen_window_passed';
  if (/not found/i.test(text)) return 'not_found';
  if (/invalid reply|invalid reopen/i.test(text)) return 'too_long';
  return 'failed';
}
