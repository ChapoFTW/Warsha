/**
 * WPS-024 contracts for the legal, consent and agreement system.
 *
 * Import-free on purpose, exactly like `onboarding-types.ts`: everything here
 * is a type or a total function over plain data, so the regression suite can
 * exercise materiality, audience and re-consent rules without a React tree.
 *
 * The rule that matters in this file: nothing here decides whether an
 * acceptance is valid. The client computes what to SHOW and what hash it
 * rendered; Postgres decides what was accepted. A consent record written by a
 * client that could choose its own answer is not a consent record.
 */

export type LegalDocumentKey =
  | 'customer_terms'
  | 'worker_terms'
  | 'privacy_policy'
  | 'worker_verification_policy'
  | 'acceptable_use_policy'
  | 'worker_code_of_conduct'
  | 'refund_policy'
  | 'cancellation_policy'
  | 'appeals_policy'
  | 'trust_safety_policy'
  | 'content_policy'
  | 'intellectual_property_policy'
  | 'incident_response_policy'
  | 'security_disclosure_policy'
  | 'ai_usage_policy'
  | 'ocr_usage_policy'
  | 'location_data_policy'
  | 'data_processing_policy'
  | 'data_retention_policy'
  | 'subprocessor_register'
  | 'data_processing_register'
  | 'data_retention_register'
  | 'cookie_policy'
  | 'accessibility_statement'
  | 'version_history'
  | 'legal_contact';

/**
 * Who a document is addressed to.
 *
 * `all` means every account regardless of role. It is not a synonym for
 * `public`: `public` documents are readable without an account, which is a
 * stronger claim and is why the two are separate.
 */
export type LegalAudience = 'public' | 'all' | 'customer' | 'worker' | 'staff';

export type LegalCategory =
  | 'agreement'
  | 'privacy'
  | 'conduct'
  | 'commerce'
  | 'safety'
  | 'register'
  | 'platform';

/**
 * How a new version differs from the one it supersedes.
 *
 * This is the single most consequential field in WPS-024. It decides whether a
 * person is asked to accept again, and asking again for a typo is as much a
 * failure as not asking for a change to what Warsha does with their identity
 * document. The four classes are ordered by weight and the ordering is used.
 */
export type LegalChangeClass = 'initial' | 'editorial' | 'non_material' | 'material' | 'urgent';

export const legalChangeClasses: readonly LegalChangeClass[] = [
  'initial',
  'editorial',
  'non_material',
  'material',
  'urgent',
] as const;

/**
 * The classes that require the reader to accept again before they may keep
 * using the functionality the document governs.
 *
 * `initial` is included because a first version has never been accepted by
 * anyone. `editorial` and `non_material` are excluded because forcing consent
 * for a corrected comma trains people to tap past the ones that matter.
 */
export function forcesReconsent(changeClass: LegalChangeClass): boolean {
  return changeClass === 'initial' || changeClass === 'material' || changeClass === 'urgent';
}

/**
 * Whether declining this class of change may restrict functionality.
 *
 * `urgent` may restrict immediately. `material` may restrict the functionality
 * the change is about. Nothing else may restrict anything at all — that is the
 * whole point of separating them.
 */
export function mayRestrictOnDecline(changeClass: LegalChangeClass): boolean {
  return changeClass === 'material' || changeClass === 'urgent';
}

export type LegalLanguage = 'en' | 'ar';

/** A rendered section of a document. Headings are data, not markup. */
export type LegalSection = {
  heading: string;
  /** Ordinary paragraphs. */
  body: readonly string[];
  /** Rendered as a list under the paragraphs. */
  bullets?: readonly string[];
};

export type LegalBody = {
  title: string;
  /** One sentence a reader can act on before opening the document. */
  summary: string;
  sections: readonly LegalSection[];
};

export type LegalDocument = {
  key: LegalDocumentKey;
  version: string;
  category: LegalCategory;
  audience: LegalAudience;
  /**
   * The language whose text governs if the two ever disagree.
   *
   * Recorded per document rather than assumed, because a reader is entitled to
   * know which text binds them before they accept it.
   */
  authoritativeLanguage: LegalLanguage;
  /** Whether the reader is asked to accept this document explicitly. */
  requiresAcceptance: boolean;
  publishedAt: string;
  effectiveAt: string;
  supersedesVersion: string | null;
  changeClass: LegalChangeClass;
  changeSummary: { en: string; ar: string };
  /**
   * True when the Arabic text is a faithful summary rather than a full
   * translation. Surfaced to the reader; never hidden.
   */
  arabicIsSummary: boolean;
  sortOrder: number;
  en: LegalBody;
  ar: LegalBody;
};

/** What the server says an account still owes. */
export type LegalObligation = {
  documentKey: LegalDocumentKey;
  version: string;
  changeClass: LegalChangeClass;
  changeSummary: string;
  effectiveAt: string;
  /** `null` when this account has never accepted any version. */
  acceptedVersion: string | null;
  acceptedAt: string | null;
  acceptedLanguage: LegalLanguage | null;
  outstanding: boolean;
  /** Feature keys that stop working while this stays outstanding. */
  restricts: readonly string[];
};

export type LegalObligations = {
  role: 'customer' | 'worker' | null;
  obligations: readonly LegalObligation[];
  /** True when nothing is outstanding. The only field a gate should read. */
  satisfied: boolean;
  /** Outstanding items whose class actually blocks functionality. */
  blocking: readonly LegalObligation[];
};

export type LegalAcceptanceRecord = {
  documentKey: LegalDocumentKey;
  version: string;
  decision: 'accepted' | 'declined';
  acceptedAt: string;
  acceptedLanguage: LegalLanguage;
  acceptanceHash: string;
  sourceSurface: string;
  accountRole: string | null;
};

export const emptyObligations: LegalObligations = {
  role: null,
  obligations: [],
  satisfied: false,
  blocking: [],
};

/**
 * Documents this account is addressed by.
 *
 * Customer and worker agreements are evaluated separately and deliberately: a
 * customer being asked to re-accept Customer Terms must not drag Worker Terms
 * in with it, and an account that is both must satisfy both independently.
 */
export function appliesToRole(
  audience: LegalAudience,
  role: 'customer' | 'worker' | null,
): boolean {
  if (audience === 'staff') return false;
  if (audience === 'public' || audience === 'all') return true;
  if (role === null) return false;
  return audience === role;
}

/**
 * The reader-facing consequence of declining.
 *
 * Returns an empty list for classes that may not restrict anything, so a
 * decline screen cannot invent a consequence for an editorial change. The
 * wording of the consequences themselves lives in the translations; this
 * function only decides whether there are any.
 */
export function restrictionsFor(
  changeClass: LegalChangeClass,
  declared: readonly string[],
): readonly string[] {
  return mayRestrictOnDecline(changeClass) ? declared : [];
}
