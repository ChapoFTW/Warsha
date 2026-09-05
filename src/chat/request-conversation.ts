/**
 * The conversation a customer and a quoting worker have before there is a job.
 *
 * ## The lifecycle, as the clients see it
 *
 *   no quote        there is nothing to open, and asking produces the same
 *                   "not found" a non-existent request would — a worker must
 *                   not be able to learn a request exists by asking to talk
 *                   about it
 *   quote submitted read and write
 *   quote ended     read, no write. `canSend` says so, so a client renders a
 *                   read-only thread rather than an input box that fails when
 *                   used
 *   worker chosen   the same thread becomes the booking's thread and the
 *                   booking chat takes over, history included
 *
 * `canSend` comes from the server on every read rather than being derived from
 * a quote status the client happens to be holding. A client's copy of the quote
 * can be a minute old; the answer to "may I still write here" cannot be.
 */

export type RequestMessage = {
  id: string;
  body: string;
  createdAt: string;
  /** Whether the signed-in reader sent it. Decided server-side from `auth.uid()`. */
  mine: boolean;
};

export type RequestConversation = {
  requestId: string;
  providerId: string;
  canSend: boolean;
  messages: RequestMessage[];
};

/** Raised by `send_request_message` when the relationship is no longer actionable. */
export const REQUEST_CONVERSATION_CLOSED_CODE = 'WM001';
export const REQUEST_CONVERSATION_CLOSED_TOKEN = 'request_conversation_closed';

type ErrorLike = { code?: unknown; message?: unknown };

export function isRequestConversationClosed(reason: unknown): boolean {
  const error = reason as ErrorLike | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (error.code === REQUEST_CONVERSATION_CLOSED_CODE) return true;
  return typeof error.message === 'string' && error.message.includes(REQUEST_CONVERSATION_CLOSED_TOKEN);
}

export function parseRequestConversation(value: unknown): RequestConversation | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.requestId !== 'string' || typeof raw.providerId !== 'string') return null;
  const messages = Array.isArray(raw.messages) ? raw.messages : [];
  return {
    requestId: raw.requestId,
    providerId: raw.providerId,
    canSend: raw.canSend === true,
    messages: messages.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.body !== 'string') return [];
      return [{
        id: row.id,
        body: row.body,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
        mine: row.mine === true,
      }];
    }),
  };
}

/**
 * A stable id for one attempt to send one message.
 *
 * The server treats a repeat of the same id as the same message, which is what
 * makes a retry after a timeout safe: a client that stopped waiting cannot know
 * whether the first attempt landed, and without this the honest options are to
 * risk a duplicate or to lose the message.
 *
 * `crypto.randomUUID` where it exists — every browser Warsha supports and
 * Hermes — with a v4-shaped fallback so a runtime without it degrades to a
 * still-unique id rather than to no idempotency at all.
 */
export function newMessageClientId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
