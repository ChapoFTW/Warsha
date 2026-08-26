/**
 * Work-in-progress drafts: the state class Warsha did not have.
 *
 * ## The three state classes
 *
 * Warsha holds three genuinely different kinds of state, and the defect human
 * QA reported was that two of them were implemented as the third:
 *
 * - **Application preferences** - language, appearance. Long-lived, global,
 *   device-level, survive everything. `src/preferences/preference-authority.ts`.
 * - **Work in progress** - a half-typed request, an address being entered, a
 *   trade being chosen. Temporary but *valuable*: losing it costs somebody
 *   real work. This file.
 * - **Server state** - a saved address, a created request. Owned by the
 *   database, read through RLS, never duplicated into a device store.
 *
 * Before this file, work in progress lived only in `useState` inside the page
 * component. On the web that means it exists for exactly as long as one route
 * is mounted; on native it survives a push and dies on a pop or a process
 * restart. Neither is a policy anybody chose - it is the absence of one.
 *
 * ## What this module is
 *
 * Import-free, so the Node regression suite runs the real rules rather than a
 * restatement of them, and so web and native share one definition of what a
 * draft *is* while differing only in where bytes are written.
 *
 * A draft is stored as an envelope, never as bare form values. The envelope is
 * what makes the three hard cases decidable without asking the caller:
 *
 * - **Account isolation.** The envelope records whose draft it is. A draft
 *   whose account does not match the reader is not shown, ever, and is
 *   discarded on sight. This holds even if sign-out never ran - after a crash,
 *   after a shared device, after a session expiring server-side.
 * - **Schema drift.** The envelope records the schema version. A draft written
 *   by an older build is discarded rather than restored into fields that have
 *   since changed meaning.
 * - **Expiry.** The envelope records when it was saved. Old enough is
 *   discarded. The window is deliberately generous: the failure this fixes is
 *   *ordinary navigation* wiping work, and an aggressive expiry would rebuild
 *   the same complaint with a timer instead of a router.
 */

/** Every flow allowed to keep a draft. Adding one is a product decision, made here. */
export const draftFlows = [
  'request_create',
  'address_editor',
  'discovery',
  'worker_trade',
  'worker_profile',
  'support_message',
] as const;
export type DraftFlow = (typeof draftFlows)[number];

export function isDraftFlow(value: unknown): value is DraftFlow {
  return typeof value === 'string' && (draftFlows as readonly string[]).includes(value);
}

/**
 * Bumped when a flow's stored shape changes meaning.
 *
 * Per-flow rather than global, so redesigning the address editor does not
 * throw away somebody's half-written request.
 */
export const draftSchemaVersions: Record<DraftFlow, number> = {
  request_create: 1,
  address_editor: 1,
  discovery: 1,
  worker_trade: 1,
  worker_profile: 1,
  support_message: 1,
};

/**
 * How long a draft survives without being touched.
 *
 * Seven days. Long enough that a person who starts a request on Monday and
 * comes back on Wednesday still has it; short enough that a device does not
 * accumulate abandoned work indefinitely. `discovery` is browsing state rather
 * than authored work, so it expires with the day.
 */
export const draftLifetimeMs: Record<DraftFlow, number> = {
  request_create: 7 * 24 * 60 * 60 * 1000,
  address_editor: 7 * 24 * 60 * 60 * 1000,
  discovery: 24 * 60 * 60 * 1000,
  worker_trade: 7 * 24 * 60 * 60 * 1000,
  worker_profile: 7 * 24 * 60 * 60 * 1000,
  support_message: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Field names a draft may never carry, whatever the flow.
 *
 * A draft store is plaintext on the device by construction - `localStorage` on
 * the web, the key-value store on native. That is acceptable for "the boiler
 * is leaking" and unacceptable for anything on this list. The check is a
 * predicate rather than a convention so `state-persistence.test.mts` can run it
 * over every draft written anywhere in the product.
 */
export const forbiddenDraftFields = [
  'password', 'newPassword', 'currentPassword', 'passwordConfirmation', 'confirmPassword',
  'otp', 'oneTimeCode', 'verificationCode', 'smsCode',
  'token', 'accessToken', 'refreshToken', 'idToken', 'sessionToken', 'apiKey', 'secret',
  'cardNumber', 'cvv', 'cvc', 'securityCode', 'iban', 'pan',
  'nationalId', 'nationalIdNumber', 'passportNumber', 'documentNumber',
  'ssn', 'taxId',
] as const;

const forbiddenLowercase = new Set<string>(
  (forbiddenDraftFields as readonly string[]).map((name) => name.toLowerCase()),
);

/**
 * Any forbidden key anywhere in the value, at any depth.
 *
 * Returns the offending path rather than a boolean so a failing test names the
 * field instead of only asserting that one exists.
 */
export function forbiddenDraftFieldPath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenDraftFieldPath(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (forbiddenLowercase.has(key.toLowerCase())) return [...path, key].join('.');
      const found = forbiddenDraftFieldPath(entry, [...path, key]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The device key a flow's draft is written under.
 *
 * The account is deliberately **not** in the key. Two accounts sharing a device
 * must not both leave drafts lying around for the other to find, and one key
 * per flow means signing in as somebody else overwrites rather than
 * accumulates. Isolation is enforced by the envelope's `accountKey`, which is
 * checked on every read.
 */
export function draftStorageKey(flow: DraftFlow): string {
  return `warsha:draft:${flow}:v1`;
}

/** Every key the draft store owns, for a wholesale clear on sign-out. */
export function allDraftStorageKeys(): string[] {
  return draftFlows.map(draftStorageKey);
}

export type DraftEnvelope<T> = {
  flow: DraftFlow;
  schemaVersion: number;
  /** The account this work belongs to. `null` is a signed-out draft. */
  accountKey: string | null;
  savedAt: number;
  value: T;
};

/** Why a stored draft was not restored. Carried so behaviour is testable and loggable. */
export type DraftRejection =
  | 'absent'
  | 'unreadable'
  | 'wrong_flow'
  | 'schema_changed'
  | 'other_account'
  | 'expired';

export type DraftReadResult<T> =
  | { restored: true; value: T; savedAt: number }
  | { restored: false; reason: DraftRejection };

export function encodeDraft<T>(input: {
  flow: DraftFlow;
  accountKey: string | null;
  value: T;
  now?: number;
}): string {
  const envelope: DraftEnvelope<T> = {
    flow: input.flow,
    schemaVersion: draftSchemaVersions[input.flow],
    accountKey: input.accountKey,
    savedAt: input.now ?? Date.now(),
    value: input.value,
  };
  return JSON.stringify(envelope);
}

/**
 * Decode a stored draft, applying every rule that decides whether it may be
 * shown to the person now looking at the screen.
 *
 * Deliberately total: it never throws, and every refusal names itself. A draft
 * store that throws on a corrupted entry would turn a stale byte into a broken
 * page, which is a worse failure than the one it exists to prevent.
 */
export function decodeDraft<T>(input: {
  raw: string | null | undefined;
  flow: DraftFlow;
  accountKey: string | null;
  now?: number;
}): DraftReadResult<T> {
  if (input.raw === null || input.raw === undefined || input.raw === '') {
    return { restored: false, reason: 'absent' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw);
  } catch {
    return { restored: false, reason: 'unreadable' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { restored: false, reason: 'unreadable' };
  }
  const envelope = parsed as Partial<DraftEnvelope<T>>;
  if (envelope.flow !== input.flow) return { restored: false, reason: 'wrong_flow' };
  if (envelope.schemaVersion !== draftSchemaVersions[input.flow]) {
    return { restored: false, reason: 'schema_changed' };
  }
  // Account isolation. `undefined` is not `null`: a malformed envelope with no
  // account recorded is refused rather than treated as a signed-out draft.
  const storedAccount = envelope.accountKey === undefined ? undefined : envelope.accountKey;
  if (storedAccount === undefined) return { restored: false, reason: 'unreadable' };
  if (storedAccount !== input.accountKey) return { restored: false, reason: 'other_account' };
  if (typeof envelope.savedAt !== 'number' || !Number.isFinite(envelope.savedAt)) {
    return { restored: false, reason: 'unreadable' };
  }
  const now = input.now ?? Date.now();
  if (now - envelope.savedAt > draftLifetimeMs[input.flow]) {
    return { restored: false, reason: 'expired' };
  }
  if (envelope.value === undefined) return { restored: false, reason: 'unreadable' };
  return { restored: true, value: envelope.value as T, savedAt: envelope.savedAt };
}

/**
 * Is this draft worth writing at all?
 *
 * An untouched form must not leave a stored draft behind: doing so would make
 * "start a new request" restore an empty shell over whatever a deep link had
 * just set up, and would litter the device with envelopes that only ever
 * restore nothing. So a draft is written only once it differs from the state
 * the flow starts in.
 */
export function draftIsWorthKeeping<T>(value: T, initial: T): boolean {
  return JSON.stringify(value ?? null) !== JSON.stringify(initial ?? null);
}

/**
 * What clears a draft, stated once.
 *
 * `submitted` and `discarded` are the two the person performs. `signed_out`
 * and `account_changed` are Warsha protecting one account from another.
 * `started_new` is the explicit "begin again" action, which must not be
 * confused with arriving at the form for the ordinary reason.
 */
export const draftClearReasons = [
  'submitted',
  'discarded',
  'started_new',
  'signed_out',
  'account_changed',
] as const;
export type DraftClearReason = (typeof draftClearReasons)[number];

/** Reasons that clear *every* flow rather than one. */
export function clearsAllFlows(reason: DraftClearReason): boolean {
  return reason === 'signed_out' || reason === 'account_changed';
}
