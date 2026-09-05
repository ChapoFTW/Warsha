/**
 * The one place Warsha builds a criminal-record submission request.
 *
 * ## Why this file exists
 *
 * WPS-023 created `public.submit_my_criminal_record` with seven arguments.
 * WPS-024 restated it to add a rate limit and used an older parameter list by
 * mistake, creating a second overload that differed from the real one by a
 * single word — `p_size_bytes` against `p_file_size_bytes`. PostgREST resolves
 * an overload by the KEYS in the JSON body, so the client silently selected the
 * broken one. It inserted a column that does not exist and omitted a NOT NULL
 * one, and could never have succeeded.
 *
 * It went unnoticed for four weeks because the test suite exercised the correct
 * function while the client called the other one. Nothing compared the two.
 *
 * So the argument names are no longer written at a call site. They are declared
 * once, here, and `scripts/criminal-record-contract.test.mts` compares this
 * declaration against the migration that actually defines the function. A rename
 * on either side fails that test rather than reaching a worker as a 404.
 *
 * ## The server contract this mirrors
 *
 *   p_storage_path        first path segment must equal the caller's user id
 *   p_mime_type           jpeg, png, heic or pdf
 *   p_file_size_bytes     1 .. 8388608
 *   p_content_hash        optional
 *   p_issue_date          required, not in the future
 *   p_document_reference  optional, blank is stored as null
 *   p_declared_name       required, 2..120 characters after trimming
 *
 * The client validates the same rules before uploading, so a request that the
 * server would refuse never leaves an orphaned object in the bucket. The server
 * remains the authority: these checks exist to avoid a wasted upload, not to
 * replace a boundary.
 */

/** The RPC the criminal-record flow calls. Written once. */
export const CRIMINAL_RECORD_RPC = 'submit_my_criminal_record';

/**
 * Its arguments, in the order the function declares them.
 *
 * The contract test reads this array and the migration that defines the
 * function, and requires them to be identical. Order is included because a
 * reordering is how `p_content_hash` and `p_issue_date` came to be swapped
 * between the two overloads.
 */
export const CRIMINAL_RECORD_RPC_ARGUMENTS = [
  'p_storage_path',
  'p_mime_type',
  'p_file_size_bytes',
  'p_content_hash',
  'p_issue_date',
  'p_document_reference',
  'p_declared_name',
] as const;

/** What the server accepts, restated so a bad file is refused before upload. */
export const CRIMINAL_RECORD_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'application/pdf',
] as const;
export const CRIMINAL_RECORD_MAX_BYTES = 8 * 1024 * 1024;
export const DECLARED_NAME_MIN_LENGTH = 2;
export const DECLARED_NAME_MAX_LENGTH = 120;

export interface CriminalRecordSubmission {
  userId: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string | null;
  issueDate: string;
  documentReference: string | null;
  declaredName: string;
}

export type CriminalRecordPayload = Record<
  (typeof CRIMINAL_RECORD_RPC_ARGUMENTS)[number], unknown
>;

/**
 * Tidy a typed name without changing it.
 *
 * Leading and trailing space goes, and a run of spaces collapses to one, because
 * both are typing accidents rather than anything printed on a document. Nothing
 * else is touched: no case change, no transliteration, no character filter.
 *
 * That last point is deliberate. This name is copied from an Egyptian criminal
 * record, so it is usually Arabic, sometimes French, occasionally Latin with
 * diacritics. An English-only pattern would reject the common case, and forcing
 * capitalisation or transliteration would mean submitting a name the worker
 * never wrote — when the entire purpose of the field is that a reviewer can
 * compare it against the document.
 *
 * `\s` covers the space characters that matter here, including the non-breaking
 * space a paste from a PDF often carries.
 */
export function normalizeDeclaredName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The server's own length rule, applied to the normalized value. */
export function isValidDeclaredName(value: string): boolean {
  const normalized = normalizeDeclaredName(value);
  return normalized.length >= DECLARED_NAME_MIN_LENGTH
    && normalized.length <= DECLARED_NAME_MAX_LENGTH;
}

/**
 * The storage path for a submission.
 *
 * The first segment must be the caller's own user id: the RPC checks it, and so
 * does the policy on `storage.objects`. Two independent checks is the point, and
 * building the path here means neither is being satisfied by accident.
 */
export function criminalRecordStoragePath(userId: string, mimeType: string): string {
  const extension = mimeType === 'application/pdf' ? 'pdf'
    : mimeType === 'image/png' ? 'png'
      : mimeType === 'image/heic' ? 'heic' : 'jpg';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${userId}/criminal-record/${unique}.${extension}`;
}

/** Why a submission cannot be sent, as a key the caller maps to copy. */
export type CriminalRecordRejection =
  | 'declared_name_required'
  | 'unsupported_format'
  | 'file_too_large'
  | 'issue_date_required'
  | 'issue_date_in_future'
  | 'path_not_own_account';

/**
 * Check a submission the way the server will.
 *
 * Returns the reasons rather than throwing, so a screen can show the first one
 * in the caller's language instead of surfacing a database message.
 */
export function rejectionsFor(input: CriminalRecordSubmission): CriminalRecordRejection[] {
  const rejections: CriminalRecordRejection[] = [];
  if (!isValidDeclaredName(input.declaredName)) rejections.push('declared_name_required');
  if (!(CRIMINAL_RECORD_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    rejections.push('unsupported_format');
  }
  if (!(input.fileSizeBytes >= 1 && input.fileSizeBytes <= CRIMINAL_RECORD_MAX_BYTES)) {
    rejections.push('file_too_large');
  }
  const issueDate = input.issueDate.trim();
  if (!issueDate) {
    rejections.push('issue_date_required');
  } else {
    // Compared as a calendar day, not a timestamp: the server tests against
    // `current_date`, and a device an hour ahead of UTC must not make today
    // look like tomorrow.
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (issueDate > todayKey) rejections.push('issue_date_in_future');
  }
  if (input.storagePath.split('/')[0] !== input.userId) rejections.push('path_not_own_account');
  return rejections;
}

/**
 * The request body, keyed exactly by what the function declares.
 *
 * Every surface calls this. There is no second argument map to drift from, which
 * is the whole reason the four-week outage was possible.
 */
export function buildCriminalRecordPayload(input: CriminalRecordSubmission): CriminalRecordPayload {
  return {
    p_storage_path: input.storagePath,
    p_mime_type: input.mimeType,
    p_file_size_bytes: input.fileSizeBytes,
    p_content_hash: input.contentHash,
    p_issue_date: input.issueDate.trim(),
    // Blank is absent, matching what the server stores.
    p_document_reference: input.documentReference?.trim() ? input.documentReference.trim() : null,
    p_declared_name: normalizeDeclaredName(input.declaredName),
  };
}

/** What a screen collects, before a storage path or a user id exists. */
export interface CriminalRecordInput {
  uri: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string | null;
  issueDate: string;
  documentReference?: string | null;
  declaredName: string;
}

/**
 * A refusal the client made, carrying the reasons rather than a sentence.
 *
 * Thrown before the upload so the screen can say which field is wrong in the
 * worker's own language. It deliberately holds keys, not text: the copy lives in
 * the localization authority, and a message assembled here would be English-only
 * on an Arabic screen.
 */
export class CriminalRecordInputError extends Error {
  readonly rejections: CriminalRecordRejection[];

  constructor(rejections: CriminalRecordRejection[]) {
    super(`Criminal-record submission rejected: ${rejections.join(', ')}`);
    this.name = 'CriminalRecordInputError';
    this.rejections = rejections;
  }
}
