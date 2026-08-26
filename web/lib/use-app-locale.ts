/**
 * The application's language, for the surfaces that already import it here.
 *
 * This module used to *implement* the language: `useState('en')` plus an
 * effect that read `localStorage` after mount, once per calling component.
 * That implementation is gone and the reasoning is in
 * `lib/preferences-context.tsx`; what remains is the name, so the forty-odd
 * call sites that read the locale did not all have to change in the same
 * commit as the fix.
 *
 * Nothing here holds state any more. `useAppLocale()` is a context read.
 */
export { useAppLocale, useWarshaPreferences } from './preferences-context';

/**
 * Kept as an alias.
 *
 * The event now covers appearance as well as language, because both are the
 * same class of state and were both being corrected after mount. Anything
 * still listening for a language change is listening for the right event.
 */
export { preferenceChangeEvent as languageChangeEvent } from './preferences-context';
