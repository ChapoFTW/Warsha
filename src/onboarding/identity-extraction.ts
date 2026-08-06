/**
 * WPS-023 provider-neutral document-extraction boundary.
 *
 * No OCR provider is configured, and none may be enabled without explicit
 * privacy approval. This module exists so the rest of the app can be written
 * against a stable contract, and so the rules about what extraction may and may
 * not do are stated in one place where a test can read them.
 *
 * The rules, all of which hold whether or not a provider is ever configured:
 *
 *   * Extraction is ASSISTIVE. It fills a form; it never approves anybody.
 *   * The worker reviews and confirms or corrects every candidate field.
 *   * Confidence scores are internal. They never render and never travel.
 *   * A low-confidence field requires manual entry rather than a guess.
 *   * Mock mode makes no external call. Neither does Supabase mode today,
 *     because no provider is configured in either.
 *   * No document image leaves Warsha without a configured, approved provider.
 *
 * Deliberately not extracted: gender or any sex marker. The Egyptian National
 * ID encodes one, and there is no approved product or legal purpose for it, so
 * the field key does not exist here and cannot be produced.
 *
 * Also deliberately not derived: current residence. The identifier encodes a
 * governorate of registration, which is where somebody was registered and not
 * where they live or work. Treating it as an address would put a worker in the
 * wrong service area on the strength of a number.
 */

export type ExtractionFieldKey =
  | 'national_id_number'
  | 'legal_name_ar'
  | 'date_of_birth'
  | 'id_expiry_date';

export type ExtractionCandidate = {
  fieldKey: ExtractionFieldKey;
  value: string | null;
  /** Internal. Never returned to a screen and never sent to a client. */
  confidence: number;
  requiresManualEntry: boolean;
};

export type ExtractionCapability = {
  available: boolean;
  providerKey: string | null;
  /** Whether the configured provider would receive the document image. */
  sendsImageOffDevice: boolean;
  privacyApproved: boolean;
};

export const extractionCapability: ExtractionCapability = {
  available: false,
  providerKey: null,
  sendsImageOffDevice: false,
  privacyApproved: false,
};

export class ExtractionUnavailable extends Error {
  constructor() {
    super('No approved document-extraction provider is configured');
    this.name = 'ExtractionUnavailable';
  }
}

/**
 * Below this, a candidate is not offered as a suggestion at all. A wrong
 * pre-filled identity number that somebody taps past is worse than an empty
 * field they have to look at their card to fill.
 */
export const MANUAL_ENTRY_CONFIDENCE_FLOOR = 0.9;

export function requiresManualEntry(confidence: number): boolean {
  return !(confidence >= MANUAL_ENTRY_CONFIDENCE_FLOOR);
}

/**
 * Strips confidence before anything crosses a boundary. Called on every path
 * that could surface a candidate.
 */
export function toClientCandidate(candidate: ExtractionCandidate): {
  fieldKey: ExtractionFieldKey;
  value: string | null;
  requiresManualEntry: boolean;
} {
  return {
    fieldKey: candidate.fieldKey,
    // A candidate below the floor is withheld, not shown greyed out. Showing
    // it invites acceptance.
    value: candidate.requiresManualEntry ? null : candidate.value,
    requiresManualEntry: candidate.requiresManualEntry,
  };
}

/**
 * The only entry point. It throws today, and that is the correct behaviour:
 * the identity screen catches it and presents manual entry, which is a working
 * path rather than a degraded one.
 */
export async function extractIdentityFields(_input: {
  documentId: string;
  side: 'front' | 'back';
}): Promise<ExtractionCandidate[]> {
  throw new ExtractionUnavailable();
}

/**
 * Extraction never decides anything. This is exported so the regression suite
 * can assert the property directly rather than inferring it from an absence.
 */
export function extractionMayApprove(): false {
  return false;
}
