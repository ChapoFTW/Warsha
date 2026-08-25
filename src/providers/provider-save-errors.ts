/**
 * What a failed worker-profile save actually means, and who gets told what.
 *
 * ## The defect this exists to end
 *
 * Every surface caught `save_provider_foundation` like this:
 *
 *     try { await provider.save(next, false); }
 *     catch { setMessage('Something went wrong. Please try again.'); }
 *
 * So "you have not chosen a service yet", "that trade is no longer offered" and
 * "the database is unreachable" arrived as the same sentence, and the one piece
 * of information that would have told a worker what to do next -- or an
 * engineer where to look -- was discarded at the catch. Human QA could report
 * only the generic message, which is why the real cause took a live reproduction
 * to find rather than a screenshot.
 *
 * ## The rule
 *
 * A failure the WORKER can fix gets a sentence saying how. A failure they
 * cannot gets the safe generic message, because "constraint violation on
 * provider_services" helps nobody holding a phone. Nothing here ever puts a
 * database string in front of a customer or a worker.
 *
 * The raw error is not thrown away, though: `describeProviderSaveFailure`
 * returns it alongside the copy key, and development builds log it. That is the
 * half that was missing.
 */

export type ProviderSaveProblem =
  /** No trade chosen yet. */
  | 'profession_required'
  /** A trade is chosen but no job under it. */
  | 'service_required'
  /** The chosen trade is withdrawn -- a stale client, or a hand-made payload. */
  | 'profession_withdrawn'
  /** A job that belongs to no chosen trade. */
  | 'service_outside_profession'
  /** Name, photo or experience is missing or out of range. */
  | 'profile_incomplete'
  /** Governorate/area missing or malformed. */
  | 'area_invalid'
  /** Anything the worker cannot act on. */
  | 'server';

/** The shape PostgREST hands back for a raised Postgres exception. */
export type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * The exception messages `save_provider_foundation` raises, mapped to meaning.
 *
 * Matched on the message rather than the SQLSTATE because the function raises
 * every worker-correctable problem as `22023`; the message is the only thing
 * that distinguishes them. `wps025-worker-experience.test.mts` asserts this
 * table against the migration text, so a message that is reworded in SQL
 * without being rewritten here fails the suite rather than silently degrading
 * to the generic sentence.
 */
const PROBLEM_BY_MESSAGE: Record<string, ProviderSaveProblem> = {
  'Profession required': 'profession_required',
  'Service required': 'service_required',
  'Withdrawn profession': 'profession_withdrawn',
  'Service outside profession': 'service_outside_profession',
  'Invalid service': 'service_outside_profession',
  'Invalid service category': 'service_outside_profession',
  'Duplicate provider service': 'service_outside_profession',
  'Add a service and work area': 'service_required',
  'Invalid provider information': 'profile_incomplete',
  'Complete the required profile details': 'profile_incomplete',
  'Invalid specialties': 'profile_incomplete',
  'Invalid service area': 'area_invalid',
  'Duplicate service area': 'area_invalid',
};

export type ProviderSaveFailure = {
  problem: ProviderSaveProblem;
  /** The untouched backend error, for logs and reports. Never rendered. */
  raw: PostgrestLikeError;
};

export function describeProviderSaveFailure(error: unknown): ProviderSaveFailure {
  const raw = (error && typeof error === 'object' ? error : {}) as PostgrestLikeError;
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  return { problem: PROBLEM_BY_MESSAGE[message] ?? 'server', raw };
}

/**
 * One line of diagnostics, in development only.
 *
 * Deliberately not a thrown error and not a user-visible string: it exists so
 * that the next person who reproduces a save failure on a Development build can
 * read the SQLSTATE and message out of the console instead of guessing from
 * "Something went wrong". Production builds log nothing -- a backend message can
 * name a table, and a worker's device log is not a place to put schema.
 */
export function logProviderSaveFailure(context: string, failure: ProviderSaveFailure): void {
  if (process.env.NODE_ENV === 'production') return;
  const { code, message, details, hint } = failure.raw;
  console.warn(
    `[warsha] ${context} failed: ${failure.problem}`,
    JSON.stringify({ code, message, details, hint }),
  );
}
