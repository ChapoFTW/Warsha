/**
 * The continuation across a re-authentication prompt.
 *
 * Every governed surface in the console had the same shape and the same hole.
 * An action is attempted, the database refuses it for freshness, the surface
 * opens `ReauthDialog`, the operator proves who they are — and the action that
 * was refused is gone. It was never stored. The dialog closed, the page
 * refreshed, and because a refused action changes nothing, the refresh
 * rendered exactly what was already on screen. No error, no success, no
 * transition; the operator's work simply evaporated.
 *
 * The freshness refusal is raised by `require_staff_capability` before the RPC
 * reads any state or consumes any dual-control approval, so a refused attempt
 * has no effect at all. That is what makes retrying it safe, and it is the
 * only reason this module is allowed to exist: it re-sends something the
 * server already declined to act on, never something it may have half-done.
 *
 * The policy is here, as values, so it can be tested without a browser.
 */

/** How long a remembered action stays retryable. */
export const PENDING_REAUTH_TTL_MS = 5 * 60 * 1000;

/**
 * How many times one action may be re-sent after proving freshness.
 *
 * Exactly one. If a freshly re-authenticated session is refused for freshness
 * a second time, something is wrong that another password will not fix, and
 * looping the dialog would hide it behind an endless prompt.
 */
export const MAX_REAUTH_RETRIES = 1;

export type PendingRecord = {
  /** Which action was refused — 'activate', 'approve', and so on. */
  key: string;
  /** The capability the server refused, and the one the dialog must satisfy. */
  capability: string;
  registeredAt: number;
};

/** What has already been re-sent for one action key, and when. */
export type AttemptRecord = { count: number; at: number };

export type RememberDecision =
  | { remember: true }
  | { remember: false; reason: 'another-action-pending' | 'already-retried' };

/**
 * Whether a refused action may be remembered for retry.
 *
 * Two refusals, both deliberate. A second, different action may not quietly
 * displace one already waiting — the operator would prove themselves for a
 * prompt naming one capability and silently set a different call running. And
 * an action already re-sent once is not remembered again, which is what stops
 * a refusal loop from becoming an unclosable dialog.
 */
export function rememberDecision(
  pending: PendingRecord | null,
  attempt: AttemptRecord | null,
  incoming: { key: string },
  now: number,
): RememberDecision {
  if (pending && pending.key !== incoming.key) {
    return { remember: false, reason: 'another-action-pending' };
  }
  // Attempts belong to an episode. One that has aged out is history, not a
  // reason to refuse a fresh attempt the operator started deliberately.
  const live = attempt && now - attempt.at < PENDING_REAUTH_TTL_MS ? attempt : null;
  if (live && live.count >= MAX_REAUTH_RETRIES) {
    return { remember: false, reason: 'already-retried' };
  }
  return { remember: true };
}

export type ResumeDecision =
  | { resume: true; key: string; capability: string }
  | { resume: false; reason: 'nothing-pending' | 'expired' };

/**
 * Whether a proven session may re-send what was refused.
 *
 * A successful verification is not on its own an instruction to run something.
 * If nothing is waiting, nothing runs. If what is waiting is older than the
 * window, it is dropped and said so, rather than firing a privileged call the
 * operator may have stopped expecting.
 */
export function resumeDecision(pending: PendingRecord | null, now: number): ResumeDecision {
  if (!pending) return { resume: false, reason: 'nothing-pending' };
  if (now - pending.registeredAt > PENDING_REAUTH_TTL_MS) {
    return { resume: false, reason: 'expired' };
  }
  return { resume: true, key: pending.key, capability: pending.capability };
}

// --- The store --------------------------------------------------------------

/**
 * What is waiting on the dialog, and the single rule for re-sending it.
 *
 * Deliberately free of React. The exactly-once guarantee is the whole point of
 * this module, and a guarantee that can only be exercised by rendering a
 * component is a guarantee nobody checks. The hook in `reauth-dialog.tsx` owns
 * one of these and mirrors `peek()` into state purely so the dialog renders.
 */
export type PendingStore = {
  /** The record the dialog is open for, or null. */
  peek(): PendingRecord | null;
  /** Hold a refused call. The decision says whether it was taken, and why not. */
  remember(
    key: string,
    capability: string,
    action: () => void | Promise<void>,
    now?: number,
  ): RememberDecision;
  /** Re-send the held call, once. Returns what it decided. */
  resume(now?: number): ResumeDecision;
  /** Drop it unrun, ending the episode. */
  discard(): void;
};

export function createPendingReauthStore(): PendingStore {
  let pending: PendingRecord | null = null;
  let action: (() => void | Promise<void>) | null = null;
  let attempts: Record<string, AttemptRecord> = {};

  return {
    peek: () => pending,

    remember(key, capability, run, now = Date.now()) {
      const decision = rememberDecision(pending, attempts[key] ?? null, { key }, now);
      if (!decision.remember) return decision;
      pending = { key, capability, registeredAt: now };
      action = run;
      return decision;
    },

    resume(now = Date.now()) {
      // Taken and cleared *before* the call is made. A second arrival here —
      // a double-submitted dialog, a re-render, a stray success — finds
      // nothing pending and sends nothing. This ordering is the guarantee.
      const record = pending;
      const run = action;
      pending = null;
      action = null;

      const decision = resumeDecision(record, now);
      if (!decision.resume) return decision;
      const previous = attempts[decision.key];
      attempts[decision.key] = { count: (previous?.count ?? 0) + 1, at: now };
      void run?.();
      return decision;
    },

    discard() {
      // Cancelling ends the episode, so a later deliberate attempt is not
      // refused as a repeat of one the operator chose to abandon.
      if (pending) {
        const { [pending.key]: _dropped, ...rest } = attempts;
        attempts = rest;
      }
      pending = null;
      action = null;
    },
  };
}
