/**
 * The seam between the web application and the Warsha platform.
 *
 * Everything re-exported here is the same module the mobile application uses.
 * That is the point: the legal corpus a customer reads before signing up on
 * usewarsha.com is byte-identical to the one the phone renders, so the hash
 * recorded against their acceptance is the same hash either way. A second
 * copy of that text — however carefully maintained — would eventually record
 * an acceptance of something nobody was shown.
 *
 * Only platform-neutral modules may be re-exported. Anything importing
 * react-native or expo-* belongs to the mobile client and is rebuilt for web
 * rather than shimmed, because a mobile interaction model rendered in a
 * browser is the thing this platform exists not to be.
 */

import type { Language } from '../../src/i18n/translations.ts';

export {
  legalCorpus,
  legalDocumentKeys,
  findDocument,
  bodyFor,
  hashesFor,
  documentsForRole,
  acceptanceRequiredFor,
} from '../../src/legal/legal-corpus.ts';

export type {
  LegalDocument,
  LegalDocumentKey,
  LegalLanguage,
  LegalSection,
} from '../../src/legal/legal-types.ts';

export {
  signupLegalManifest,
  signupLegalDocuments,
  signupLegalSelectionSatisfied,
  type SignupRole,
} from '../../src/legal/signup-legal.ts';

export { translations } from '../../src/i18n/translations.ts';
export type { Language };

export type Direction = 'ltr' | 'rtl';

export function directionFor(language: Language): Direction {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** The two audiences the public site serves, named once. */
export const AUDIENCES = ['customer', 'worker'] as const;
export type Audience = (typeof AUDIENCES)[number];
