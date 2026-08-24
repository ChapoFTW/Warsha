/**
 * Running one governed action, and saying what happened.
 *
 * This is the shared primitive behind every button on the Providers page, and
 * it exists because the same defect kept arriving in different clothes: a
 * control that changes hosted state and tells the operator nothing, which is
 * indistinguishable from a broken one.
 *
 * Three separate causes produced that one symptom.
 *
 *  1. The action flag was shared with a background read that could strand it,
 *     so the button was disabled while the step list said it was ready.
 *  2. A freshness refusal was dropped instead of held, so a completed
 *     re-authentication dialog resumed nothing.
 *  3. The success path re-read the state and said nothing else — so when the
 *     read could not recognise its own flag, a change that *had* been written
 *     redrew the page exactly as it was.
 *
 * The rule this encodes: every terminal outcome is announced. Success is
 * spoken, not inferred from a state re-read; failure is spoken; a refusal that
 * a second identity check can resolve is held for retry rather than shown as an
 * error; and a duplicate click is refused before it reaches the authority.
 *
 * It is deliberately free of React so it can be driven directly by a test. The
 * caller owns the latch and the setters.
 */

/** What a governed call is allowed to hand back. */
export type ActionResult = { error: unknown } | void;

/**
 * `duplicate` is not a failure and is not announced — the operator asked for
 * one change and is getting one. It is reported so a test can prove the second
 * click never reached the authority.
 */
export type ActionOutcome = 'done' | 'failed' | 'reauth' | 'duplicate';

/**
 * A latch that must be true for the *next click*, not the next paint.
 *
 * React state cannot do this job. `busy` disables the button, but only once a
 * render has happened; two clicks dispatched in the same tick both read a stale
 * `disabled` and both fire. On a governed action that means two audit rows and
 * two history entries for a change that was requested once.
 */
export type InFlightLatch = { current: boolean };

export type GovernedActionPorts = {
  setBusy(key: string | null): void;
  setError(message: string | null): void;
  setDone(message: string | null): void;
  /** Re-read hosted state after a change. Must not throw. */
  refresh(): Promise<void>;
  /** Whether this refusal is one a fresh sign-in can resolve. */
  isReauthRefusal(failure: unknown): boolean;
  /** Hold the exact refused call so the dialog can re-send it unchanged. */
  rememberReauth(key: string): void;
  failedMessage: string;
  doneMessage: string;
};

export async function runGovernedAction(
  latch: InFlightLatch,
  key: string,
  action: () => Promise<ActionResult>,
  ports: GovernedActionPorts,
): Promise<ActionOutcome> {
  if (latch.current) return 'duplicate';
  latch.current = true;
  ports.setBusy(key);
  ports.setError(null);
  ports.setDone(null);
  try {
    const result = await action();
    const failure = result && 'error' in result ? result.error : null;
    if (failure) {
      // The server refused this before it read any state or consumed any
      // approval, so the exact call is safe to hold and re-send once the
      // operator has proven themselves.
      if (ports.isReauthRefusal(failure)) {
        ports.rememberReauth(key);
        return 'reauth';
      }
      ports.setError((failure as { message?: string }).message ?? ports.failedMessage);
      return 'failed';
    }
    await ports.refresh();
    // Said out loud, not inferred. A re-read that cannot see the change is
    // exactly the case this has to survive.
    ports.setDone(ports.doneMessage);
    return 'done';
  } catch (reason) {
    // A network or client failure is still a failure the operator must see.
    ports.setError((reason as { message?: string })?.message ?? ports.failedMessage);
    return 'failed';
  } finally {
    // Released in a finally on every path, so no outcome can strand the page.
    latch.current = false;
    ports.setBusy(null);
  }
}
