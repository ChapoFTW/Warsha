import { acceptanceRequiredFor, hashesFor } from './legal-corpus.ts';
import type { LegalDocumentKey, LegalLanguage } from './legal-types.ts';

export type SignupRole = 'customer' | 'worker';

/** The minimum client assertion the auth trigger needs to bind a new account
 * to the exact bundled text. No timestamp or device fingerprint is supplied;
 * Postgres owns the acceptance instant. */
export type SignupLegalAcceptance = {
  documentKey: LegalDocumentKey;
  version: string;
  language: LegalLanguage;
  renderedHash: string;
};

export function signupLegalDocuments(role: SignupRole) {
  return acceptanceRequiredFor(role);
}

export function signupLegalManifest(
  role: SignupRole,
  language: LegalLanguage,
): SignupLegalAcceptance[] {
  return signupLegalDocuments(role).map(document => ({
    documentKey: document.key,
    version: document.version,
    language,
    renderedHash: hashesFor(document)[language],
  }));
}

export function signupLegalSelectionSatisfied(
  role: SignupRole,
  commonAccepted: boolean,
  workerVerificationAccepted: boolean,
): boolean {
  return commonAccepted && (role === 'customer' || workerVerificationAccepted);
}

/** Defense in depth before a network call. The database performs the same
 * comparison against its published register and remains authoritative. */
export function isCurrentSignupLegalManifest(
  role: SignupRole,
  language: LegalLanguage,
  manifest: readonly SignupLegalAcceptance[],
): boolean {
  const expected = signupLegalManifest(role, language);
  return manifest.length === expected.length && expected.every(item =>
    manifest.some(candidate =>
      candidate.documentKey === item.documentKey
      && candidate.version === item.version
      && candidate.language === item.language
      && candidate.renderedHash === item.renderedHash));
}
