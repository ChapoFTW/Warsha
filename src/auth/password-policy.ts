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
 */

export type PasswordRequirementKey =
  | 'passwordLengthRequirement'
  | 'passwordUppercaseRequirement'
  | 'passwordLowercaseRequirement'
  | 'passwordNumberRequirement';

export type PasswordRequirement = {
  key: PasswordRequirementKey;
  met: boolean;
};

/** The shortest password Warsha will accept anywhere. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Every rule, each with whether this password satisfies it.
 *
 * Returned as a list rather than a boolean so a form can show which rule is
 * still outstanding. Telling somebody "invalid password" and nothing else is
 * how a person ends up trying the same thing four times.
 */
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { key: 'passwordLengthRequirement', met: password.length >= PASSWORD_MIN_LENGTH },
    { key: 'passwordUppercaseRequirement', met: /[A-Z]/.test(password) },
    { key: 'passwordLowercaseRequirement', met: /[a-z]/.test(password) },
    { key: 'passwordNumberRequirement', met: /\d/.test(password) },
  ];
}

/** Whether a password satisfies every rule above. */
export function passwordMeetsPolicy(password: string): boolean {
  return passwordRequirements(password).every((requirement) => requirement.met);
}
