/**
 * Warsha's password policy, in one place.
 *
 * This existed twice and disagreed with itself. `app/reset-password.tsx` held
 * four inline rules — length, uppercase, lowercase, digit — and those rules are
 * the ones Warsha actually states to people, in both languages, through
 * `passwordRequirements`. Nothing else read them, so the web had no way to ask
 * for the same password the app would demand an hour later.
 *
 * The requirement keys are translation keys on purpose. A policy that a screen
 * has to describe in its own words is a policy that drifts in one language
 * first; here the rule and the sentence that explains it are the same list.
 *
 * This is a client-side courtesy, not the enforcement point. GoTrue applies its
 * own minimum server-side and remains authoritative — the value of checking
 * here is that somebody learns their password is too short before a round trip,
 * and learns it in the same terms on every surface.
 *
 * ## The fifth rule
 *
 * A special character joined the four on 2026-09-05. It is stated here and
 * nowhere else, which is the property that matters: the rule is enforced at
 * signup, at password reset, and at every other place a password is chosen,
 * because all of them ask this module rather than restating it. A policy that
 * is strict at signup and lax at recovery is not a policy — it is a signup
 * inconvenience with a documented bypass.
 *
 * "Special" is defined as *not* alphanumeric rather than as a list of approved
 * punctuation. A list would have to be maintained, would inevitably omit
 * something a password manager generates, and would reject a perfectly strong
 * password for containing the wrong symbol. Anything that is not a letter or a
 * digit counts, including space — a passphrase with spaces is a good password
 * and there is no reason to refuse one.
 */

export type PasswordRequirementKey =
  | 'passwordLengthRequirement'
  | 'passwordUppercaseRequirement'
  | 'passwordLowercaseRequirement'
  | 'passwordNumberRequirement'
  | 'passwordSpecialRequirement';

export type PasswordRequirement = {
  key: PasswordRequirementKey;
  met: boolean;
};

/** The shortest password Warsha will accept anywhere. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The longest. Not a strength rule — a bound.
 *
 * bcrypt, which GoTrue uses, silently truncates at 72 bytes: a 200-character
 * passphrase and its first 72 characters are the same password, and somebody
 * who believes otherwise is protected by less than they think. Refusing the
 * long one is more honest than accepting it and quietly discarding most of it.
 * Stated in bytes rather than characters because that is what bcrypt counts,
 * and an Arabic or emoji password reaches the limit in far fewer characters.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Anything that is not a letter or a digit. See the note above on why. */
const SPECIAL_CHARACTER = /[^A-Za-z0-9]/;

function byteLength(value: string): number {
  // `TextEncoder` is available in every runtime Warsha targets — Hermes, the
  // browser, and Node — and counts what bcrypt counts.
  return new TextEncoder().encode(value).length;
}

/**
 * Every rule, each with whether this password satisfies it.
 *
 * Returned as a list rather than a boolean so a form can show which rule is
 * still outstanding. Telling somebody "invalid password" and nothing else is
 * how a person ends up trying the same thing four times.
 *
 * The order is the order a checklist should read: length first, because it is
 * the one most passwords fail and the one a person can fix without thinking.
 */
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { key: 'passwordLengthRequirement', met: password.length >= PASSWORD_MIN_LENGTH },
    { key: 'passwordUppercaseRequirement', met: /[A-Z]/.test(password) },
    { key: 'passwordLowercaseRequirement', met: /[a-z]/.test(password) },
    { key: 'passwordNumberRequirement', met: /\d/.test(password) },
    { key: 'passwordSpecialRequirement', met: SPECIAL_CHARACTER.test(password) },
  ];
}

/** Whether a password satisfies every rule above. */
export function passwordMeetsPolicy(password: string): boolean {
  return byteLength(password) <= PASSWORD_MAX_BYTES
    && passwordRequirements(password).every((requirement) => requirement.met);
}

/**
 * The one thing still wrong with a password, as a translation key.
 *
 * `null` when it is acceptable. A form that wants to say something specific
 * asks for this rather than deciding for itself which rule to mention, so the
 * message a customer sees on the web and the message they see in the app an
 * hour later are the same sentence.
 */
export function passwordFailureKey(
  password: string,
): PasswordRequirementKey | 'passwordTooLong' | null {
  if (byteLength(password) > PASSWORD_MAX_BYTES) return 'passwordTooLong';
  return passwordRequirements(password).find((requirement) => !requirement.met)?.key ?? null;
}
