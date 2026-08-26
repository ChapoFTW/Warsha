import Storage from 'expo-sqlite/kv-store';

import {
  allDraftStorageKeys,
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  type DraftFlow,
  type DraftReadResult,
} from './draft-contract';

/**
 * Native draft storage.
 *
 * `expo-sqlite/kv-store` for the same reason the language and appearance
 * stores use it: it has a synchronous read, and a draft that can only be read
 * asynchronously would paint an empty form first and fill it in afterwards -
 * which is the flash this work exists to remove, moved from language to form
 * fields.
 *
 * Writes are asynchronous and deliberately unawaited. A draft write that
 * blocked a keystroke would be a worse product than one that occasionally
 * loses the last few characters to a hard kill.
 */
export function readDraftRaw(flow: DraftFlow): string | null {
  try {
    return Storage.getItemSync(draftStorageKey(flow));
  } catch {
    return null;
  }
}

export function readDraft<T>(flow: DraftFlow, accountKey: string | null, now?: number): DraftReadResult<T> {
  return decodeDraft<T>({ raw: readDraftRaw(flow), flow, accountKey, now });
}

export function writeDraft<T>(flow: DraftFlow, accountKey: string | null, value: T): void {
  try {
    Storage.setItemSync(draftStorageKey(flow), encodeDraft({ flow, accountKey, value }));
  } catch {
    // Losing restart-persistence for a draft must never break typing into it.
  }
}

export function clearDraft(flow: DraftFlow): void {
  try {
    Storage.removeItemSync(draftStorageKey(flow));
  } catch {
    // Nothing to do: the envelope's account check refuses it on read anyway.
  }
}

/** Sign-out and account switches clear every flow, not the one on screen. */
export function clearAllDrafts(): void {
  for (const key of allDraftStorageKeys()) {
    try {
      Storage.removeItemSync(key);
    } catch {
      // Best effort; `decodeDraft` still refuses another account's envelope.
    }
  }
}
