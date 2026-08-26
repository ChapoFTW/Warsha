import {
  allDraftStorageKeys,
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  type DraftFlow,
  type DraftReadResult,
} from './draft-contract';

/**
 * Web draft storage for the Expo web build.
 *
 * `localStorage` rather than the key-value store, for the reason
 * `appearance-storage.web.ts` already gives: the web build of `expo-sqlite` is
 * WASM-backed with no synchronous read, and a synchronous read is the point.
 *
 * Static export runs this in Node where `window` does not exist. That path
 * reports "no draft", which is correct - a server has no business knowing what
 * somebody had half-typed.
 */
function store(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDraftRaw(flow: DraftFlow): string | null {
  try {
    return store()?.getItem(draftStorageKey(flow)) ?? null;
  } catch {
    return null;
  }
}

export function readDraft<T>(flow: DraftFlow, accountKey: string | null, now?: number): DraftReadResult<T> {
  return decodeDraft<T>({ raw: readDraftRaw(flow), flow, accountKey, now });
}

export function writeDraft<T>(flow: DraftFlow, accountKey: string | null, value: T): void {
  try {
    store()?.setItem(draftStorageKey(flow), encodeDraft({ flow, accountKey, value }));
  } catch {
    // Private-mode browsers throw on write. The form still works.
  }
}

export function clearDraft(flow: DraftFlow): void {
  try {
    store()?.removeItem(draftStorageKey(flow));
  } catch {
    // The envelope's account check refuses another account's draft regardless.
  }
}

export function clearAllDrafts(): void {
  const local = store();
  if (!local) return;
  for (const key of allDraftStorageKeys()) {
    try {
      local.removeItem(key);
    } catch {
      // Best effort.
    }
  }
}
