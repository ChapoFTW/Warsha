import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import {
  clearsAllFlows,
  draftIsWorthKeeping,
  type DraftClearReason,
  type DraftFlow,
} from './draft-contract';
import { clearAllDrafts, clearDraft, readDraft, writeDraft } from './draft-storage';

/**
 * The one place native keeps work in progress.
 *
 * ## What was actually wrong on native
 *
 * Native did not lose a draft the way the web did, and pretending otherwise
 * would have produced a fix for a defect that was not there. React Navigation
 * keeps a pushed screen mounted, so *going forward and coming back* already
 * preserved a half-filled request form. What native genuinely lost:
 *
 * - **Backing out.** Popping the screen unmounts it. An accidental back
 *   gesture on Android threw the whole form away with no way to recover it.
 * - **Process death.** Android reclaims a backgrounded app whenever it likes.
 *   Coming back to Warsha after a while is a cold start, and a cold start had
 *   nothing to restore.
 * - **`router.replace`.** Any flow that replaced rather than pushed - which is
 *   most of onboarding - unmounted the screen it left.
 *
 * So drafts are hoisted out of the screen and into a store that sits above the
 * navigator, backed by the same synchronous device storage the language and
 * appearance preferences use.
 *
 * ## Account isolation
 *
 * The account key is watched here rather than trusted from a screen. When it
 * changes - sign-in, sign-out, switching between the mock and Supabase data
 * modes - every flow's draft is dropped from memory and erased from the
 * device. The stored envelope carries the account too, so a draft that somehow
 * survives (a kill during sign-out, a restored backup) is still refused on
 * read. Two independent guards, because one account seeing another's
 * half-written address is not a bug anybody gets to fix twice.
 */

type DraftState = Partial<Record<DraftFlow, unknown>>;

type DraftValue = {
  /** `null` while signed out. Drafts are still kept, scoped to "nobody". */
  accountKey: string | null;
  read: <T>(flow: DraftFlow) => T | null;
  /** `next` may be a value or an updater; an updater sees the *current* draft. */
  save: <T>(flow: DraftFlow, next: T | ((current: T) => T), initial: T) => void;
  clear: (flow: DraftFlow, reason: DraftClearReason) => void;
};

const DraftContext = createContext<DraftValue | null>(null);

export function DraftProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  // The mock data mode is a single fixed identity, so it gets a stable key of
  // its own rather than sharing the signed-out one - otherwise switching a
  // development build between modes would hand a mock draft to a real account.
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;

  const [drafts, setDrafts] = useState<DraftState>({});
  const loadedFor = useRef<string | null | undefined>(undefined);

  // Rehydrate on mount and on every account transition. Synchronous, so the
  // first render of a form already has its values rather than filling in after
  // a frame of empty inputs.
  useEffect(() => {
    if (loadedFor.current === accountKey) return;
    const previous = loadedFor.current;
    loadedFor.current = accountKey;
    if (previous !== undefined) {
      // A real transition between two identities, not first mount. Nothing the
      // previous account typed may survive into the next one.
      clearAllDrafts();
      setDrafts({});
      if (accountKey === null) return;
    }
    const restored: DraftState = {};
    for (const flow of ['request_create', 'address_editor', 'discovery', 'worker_trade', 'worker_profile', 'support_message'] as DraftFlow[]) {
      const result = readDraft<unknown>(flow, accountKey);
      if (result.restored) restored[flow] = result.value;
    }
    setDrafts(restored);
  }, [accountKey]);

  const read = useCallback(<T,>(flow: DraftFlow): T | null => {
    const value = drafts[flow];
    return value === undefined ? null : (value as T);
  }, [drafts]);

  const save = useCallback(<T,>(flow: DraftFlow, next: T | ((current: T) => T), initial: T) => {
    setDrafts((current) => {
      const existing = current[flow] === undefined ? initial : (current[flow] as T);
      const value = typeof next === 'function' ? (next as (value: T) => T)(existing) : next;
      if (!draftIsWorthKeeping(value, initial)) {
        // An untouched form leaves nothing behind, so "start a new request"
        // cannot restore an empty shell over a deep link's selections.
        clearDraft(flow);
        if (current[flow] === undefined) return current;
        const without = { ...current };
        delete without[flow];
        return without;
      }
      // Written from inside the updater so a run of setters in one handler —
      // pin, then source, then three resolved address fields — each sees the
      // previous one rather than a stale closure over the first render's value.
      writeDraft(flow, accountKey, value);
      return { ...current, [flow]: value };
    });
  }, [accountKey]);

  const clear = useCallback((flow: DraftFlow, reason: DraftClearReason) => {
    if (clearsAllFlows(reason)) {
      clearAllDrafts();
      setDrafts({});
      return;
    }
    setDrafts((current) => {
      if (current[flow] === undefined) return current;
      const next = { ...current };
      delete next[flow];
      return next;
    });
    clearDraft(flow);
  }, []);

  const value = useMemo<DraftValue>(
    () => ({ accountKey, read, save, clear }),
    [accountKey, clear, read, save],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDrafts(): DraftValue {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useDrafts must be used inside DraftProvider');
  return context;
}

/**
 * One flow's draft, as a `useState`-shaped pair.
 *
 * Screens keep the ergonomics they already had - `const [form, setForm] =
 * useDraftState('request_create', empty)` reads like `useState` - while the
 * value itself now lives above the navigator and on the device. `reset` is the
 * explicit lifecycle action: submitted, discarded, or deliberately started
 * again.
 */
export function useDraftState<T>(
  flow: DraftFlow,
  initial: T,
): [T, (next: T | ((current: T) => T)) => void, (reason: DraftClearReason) => void] {
  const { read, save, clear } = useDrafts();
  const stored = read<T>(flow);
  const initialRef = useRef(initial);
  const value = stored ?? initialRef.current;

  const set = useCallback(
    (next: T | ((current: T) => T)) => save(flow, next, initialRef.current),
    [flow, save],
  );
  const reset = useCallback((reason: DraftClearReason) => clear(flow, reason), [clear, flow]);

  return [value, set, reset];
}
