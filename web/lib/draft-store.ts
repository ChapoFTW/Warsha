'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useSession } from '@/components/session-provider';
import {
  allDraftStorageKeys,
  clearsAllFlows,
  decodeDraft,
  draftIsWorthKeeping,
  draftStorageKey,
  encodeDraft,
  type DraftClearReason,
  type DraftFlow,
} from '../../src/drafts/draft-contract.ts';

export {
  draftFlows,
  draftLifetimeMs,
  draftSchemaVersions,
  forbiddenDraftFieldPath,
  forbiddenDraftFields,
  isDraftFlow,
  type DraftClearReason,
  type DraftFlow,
} from '../../src/drafts/draft-contract.ts';

/**
 * Work in progress, on the web.
 *
 * ## The problem this solves
 *
 * Next's App Router unmounts a route's client tree when you leave it. Every
 * field on the request form, the address editor and the discovery search lived
 * in `useState` inside that tree, so leaving the page destroyed them - and
 * because most in-app links were plain `<a href>` rather than `<Link>`, "leaving
 * the page" also meant a full document load that tore down the session
 * provider and re-bootstrapped the whole application. That is why QA described
 * it as the page having "freshly reloaded": it had.
 *
 * The anchors are fixed separately. This fixes the other half - the half that
 * would still lose work even with perfect client-side navigation, because no
 * amount of routing correctness keeps state in a component that has been
 * unmounted.
 *
 * ## Why a device store rather than a React provider
 *
 * A provider above the router would survive route changes and nothing else. It
 * would not survive a refresh, a crash, a closed tab, or following a link out
 * and pressing Back - all of which are ordinary, and all of which QA listed.
 * The rules for what may be kept, for how long, and for whom are in
 * `src/drafts/draft-contract.ts`, shared verbatim with Android and iOS.
 *
 * ## Restoring without a flash
 *
 * The stored value cannot be read while rendering: the server has no
 * `localStorage`, and reading it during the first client render would produce
 * a hydration mismatch. So the first render is the empty form - identical on
 * both sides - and the restore happens in a layout effect, which React runs
 * **before the browser paints**. Nobody sees the empty form; it exists only
 * between two frames of the same frame.
 */

const isomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Fired when a draft changes in this tab, so a second reader stays in step. */
export const draftChangeEvent = 'warsha:draft-change';

function readStored<T>(flow: DraftFlow, accountKey: string | null): T | null {
  try {
    const result = decodeDraft<T>({
      raw: window.localStorage.getItem(draftStorageKey(flow)),
      flow,
      accountKey,
    });
    return result.restored ? result.value : null;
  } catch {
    return null;
  }
}

function writeStored<T>(flow: DraftFlow, accountKey: string | null, value: T): void {
  try {
    window.localStorage.setItem(draftStorageKey(flow), encodeDraft({ flow, accountKey, value }));
  } catch {
    // Private browsing refuses the write. Typing still works; the draft simply
    // will not outlive this page.
  }
}

function removeStored(flow: DraftFlow): void {
  try {
    window.localStorage.removeItem(draftStorageKey(flow));
  } catch {
    // The envelope's account check refuses another account's draft regardless.
  }
}

/** Erase every flow. Used on sign-out and whenever the account changes. */
export function clearAllDrafts(): void {
  try {
    for (const key of allDraftStorageKeys()) window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(draftChangeEvent));
  } catch {
    // Best effort; the per-read account check is the guarantee.
  }
}

/**
 * One flow's draft, shaped like `useState` so a form keeps its ergonomics.
 *
 * `clear` is the lifecycle action and takes a reason, because the reasons are
 * not interchangeable: submitting and discarding both end the draft, arriving
 * at the form does not, and a sign-out ends every draft rather than this one.
 */
export function useDraft<T>(
  flow: DraftFlow,
  initial: T,
): {
  value: T;
  setValue: (next: T | ((current: T) => T)) => void;
  clear: (reason: DraftClearReason) => void;
  /** False until the stored value has been consulted. */
  restored: boolean;
} {
  const { session } = useSession();
  const accountKey = session?.user.id ?? null;
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const initialRef = useRef(initial);
  const accountRef = useRef<string | null>(accountKey);

  isomorphicLayoutEffect(() => {
    const stored = readStored<T>(flow, accountKey);
    accountRef.current = accountKey;
    if (stored !== null) setValue(stored);
    setRestored(true);
  }, [accountKey, flow]);

  // A second tab, or a sign-out elsewhere in this one, must not leave a stale
  // draft on screen belonging to somebody who is no longer signed in.
  useEffect(() => {
    const resync = () => {
      const stored = readStored<T>(flow, accountRef.current);
      setValue(stored === null ? initialRef.current : stored);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== draftStorageKey(flow)) return;
      resync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [flow]);

  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
      if (draftIsWorthKeeping(resolved, initialRef.current)) {
        writeStored(flow, accountRef.current, resolved);
      } else {
        // An untouched form leaves nothing behind, so returning to it later
        // restores nothing rather than restoring emptiness over a deep link.
        removeStored(flow);
      }
      return resolved;
    });
  }, [flow]);

  const clear = useCallback((reason: DraftClearReason) => {
    if (clearsAllFlows(reason)) {
      clearAllDrafts();
    } else {
      removeStored(flow);
    }
    setValue(initialRef.current);
  }, [flow]);

  return { value, setValue: update, clear, restored };
}
