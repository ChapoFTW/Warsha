import { passwordRequirements } from '@/src/auth/password-policy';

import { authPanelStyles as styles } from './auth-panel';

/**
 * The password rules, and which of them this password already satisfies.
 *
 * This markup lived inline in the reset-password page and nowhere else, so the
 * page that asks somebody to CHOOSE a password for the first time -- signup --
 * showed a single sentence and then refused the result. Both use this now,
 * which is the only way the checklist and the policy can stay the same thing.
 *
 * ACCESSIBILITY. Three channels, and none of them is load-bearing alone:
 *
 *   - SHAPE: a ring that fills in. Readable with no colour perception at all.
 *   - COLOUR: muted against primary ink, for everyone else.
 *   - WORDS: each row's accessible text ends with "Met" or "Not met yet". The
 *     ring is `aria-hidden`, so a screen reader gets one coherent sentence per
 *     rule rather than a decorative glyph and a fragment. Without this the list
 *     announced five requirements and no indication of which were satisfied,
 *     which is a checklist that only works if you can see it.
 *
 * `aria-live="polite"` so the rules a reader satisfies are announced as they
 * type, which is the entire point of a live checklist and is invisible to
 * anybody not using a reader.
 */
export function PasswordRequirements({
  password,
  words,
}: {
  password: string;
  /** The active locale's copy. Passed in rather than read here, because the two
   *  consumers resolve their words differently and neither should have to
   *  change to accommodate the other. */
  words: Record<string, string>;
}) {
  return (
    <ul
      className={styles.requirements}
      aria-label={words.passwordChecklistLabel ?? words.passwordRequirements}
      aria-live="polite"
    >
      {passwordRequirements(password).map((requirement) => (
        <li
          key={requirement.key}
          className={requirement.met ? `${styles.requirement} ${styles.requirementMet}` : styles.requirement}
        >
          <span className={styles.tick} aria-hidden="true" />
          <span>
            {words[requirement.key]}
            {/* Punctuation matters here: a screen reader reads the two as one
                sentence, and without the separator it says "One numberMet". */}
            <span className="sr-only">{`. ${requirement.met ? words.requirementMet : words.requirementUnmet}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
