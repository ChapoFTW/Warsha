/**
 * How a JSON credential is written into a `.env` file for `supabase secrets set`,
 * and how the stored result is checked afterwards.
 *
 * This module exists because of a specific, silent, three-week failure.
 *
 * The Vision service-account credential was written with `JSON.stringify(raw)`,
 * which produces a double-quoted value with `\n` and `\"` escapes. The Supabase
 * CLI's dotenv reader strips the surrounding quotes and expands `\n` into real
 * newlines, but it does NOT unescape `\"`. What arrived in the Edge Function
 * therefore began:
 *
 *     {
 *       \"type\": \"service_account\",
 *
 * which is not JSON. `credentialShape()` reported `not_json`, OCR reported
 * `refused_no_credential`, and that is the same thing a switched-off provider
 * reports — so nothing looked broken. The credential was replaced twice and
 * failed the same way both times, because the fault was never in the key.
 *
 * Two rules follow, and both are enforced here rather than remembered:
 *
 *   1. The value is written so that NO escape processing can apply to it. A
 *      minified JSON document is a single line beginning with `{`, so a dotenv
 *      reader treats it as an unquoted literal and hands it over untouched. The
 *      `\n` inside `private_key` stay as the two characters JSON requires.
 *
 *   2. The write is VERIFIED. `supabase secrets list` publishes the SHA-256 of
 *      each stored value, so the exact bytes that landed can be confirmed
 *      against the exact bytes intended without either being displayed. A
 *      credential that did not survive the journey is now a loud failure at the
 *      moment it is set, not a puzzling refusal weeks later.
 */

import { createHash } from 'node:crypto';

/**
 * The digest Supabase publishes for a stored secret.
 *
 * Plain SHA-256 of the UTF-8 value. It is safe to print and safe to compare;
 * it is what makes rule 2 above possible without ever reading a secret back.
 */
export function secretDigest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * A JSON credential reduced to one line that no dotenv reader will alter.
 *
 * Throws rather than returning something questionable: a credential that cannot
 * be encoded safely must stop the operation, not be written and hoped about.
 */
export function encodeJsonSecretValue(rawJson) {
  const parsed = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A credential must be a JSON object.');
  }
  const value = JSON.stringify(parsed);

  // The three properties that make this value immune to escape processing.
  // Asserted rather than assumed, because the whole point of this module is
  // that "it should be fine" was wrong for three weeks.
  if (/[\r\n]/.test(value)) {
    throw new Error('Encoded credential contains a newline and would be truncated.');
  }
  if (!value.startsWith('{')) {
    throw new Error('Encoded credential does not begin with "{" and would be treated as quoted.');
  }
  if (value.includes(' #')) {
    throw new Error('Encoded credential contains " #" and would be truncated as a comment.');
  }
  return value;
}

/** The exact line written to the throwaway env file, newline included. */
export function encodeSecretLine(name, rawJson) {
  return `${name}=${encodeJsonSecretValue(rawJson)}\n`;
}
