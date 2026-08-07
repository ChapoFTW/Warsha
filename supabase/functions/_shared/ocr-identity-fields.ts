/**
 * WPS-024 Egyptian identity-document field parsing.
 *
 * Provider-agnostic on purpose. This is knowledge about EGYPTIAN NATIONAL ID
 * CARDS — a fourteen-digit number, a century digit, Arabic script — and none of
 * it is knowledge about any OCR vendor. Keeping it here means changing vendor
 * does not touch it, and changing what Warsha extracts does not touch the
 * vendor boundary.
 *
 * The parser's governing rule: A WRONG VALUE IS WORSE THAN AN ABSENT ONE.
 * Every field is a CANDIDATE the worker confirms or corrects, and nothing is
 * treated as a fact about them until they do. So a field this parser cannot
 * find with confidence is simply left out. A blank box is a small friction; a
 * pre-filled wrong box is a worker skimming past it and submitting somebody
 * else's name.
 *
 * What it never produces, and there is no code path that could:
 *
 *   * a gender or sex marker;
 *   * the governorate the identifier encodes — where somebody was REGISTERED
 *     is not where they live, and the OCR Usage Policy says so;
 *   * a judgement about authenticity, forgery or eligibility.
 */

import { clampProbability, type IdentityCandidate } from './ocr-provider.ts';

/**
 * Bumped whenever the parsing rules change.
 *
 * Recorded alongside the provider version in the accuracy baseline, because
 * accuracy moves for two independent reasons — the vendor got better, or this
 * file did — and a baseline that cannot tell them apart cannot direct any
 * effort.
 */
export const IDENTITY_PARSER_VERSION = 'eg-nid/1';

export type IdentityParseResult = {
  candidates: IdentityCandidate[];
  /**
   * True when the provider returned text and this parser found nothing in it.
   *
   * Distinct from "no text": a blank photograph is a capture problem the worker
   * fixes by retaking, while readable text yielding no fields is a PARSER
   * problem that no amount of retaking will fix. The benchmark counts them
   * separately for exactly that reason.
   */
  parserFailure: boolean;
};

/**
 * Arabic-Indic and Extended Arabic-Indic digits to ASCII.
 *
 * A card photographed in good light frequently OCRs as ٢٩٨٠١٠١٢٣٤٥٦٧, and a
 * naive `\d{14}` would find nothing at all on a perfectly readable document.
 */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function parseIdentityCandidates(
  text: string,
  blockConfidence: number,
): IdentityCandidate[] {
  const normalized = normalizeDigits(text);
  const confidence = clampProbability(blockConfidence);
  const candidates: IdentityCandidate[] = [];

  const idMatch = normalized.match(/\b(\d{14})\b/);
  if (idMatch) {
    candidates.push({
      fieldKey: 'national_id_number',
      value: idMatch[1],
      confidence,
    });

    // Date of birth is DERIVED from the identifier's own encoding rather than
    // read off the card, because the printed date is frequently the least
    // legible thing on it while the number is the most.
    //
    // The century digit is 2 for 1900s and 3 for 2000s. Anything else means
    // the number is not a valid Egyptian National ID, and no date is offered.
    const century = idMatch[1][0] === '2' ? 1900 : idMatch[1][0] === '3' ? 2000 : null;
    if (century !== null) {
      const year = century + Number(idMatch[1].slice(1, 3));
      const month = Number(idMatch[1].slice(3, 5));
      const day = Number(idMatch[1].slice(5, 7));
      const plausible =
        month >= 1 && month <= 12 && day >= 1 && day <= 31
        && year >= 1900 && year <= new Date().getUTCFullYear();
      if (plausible) {
        candidates.push({
          fieldKey: 'date_of_birth',
          value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          // Lower than the block: this is derived, not read, and the worker
          // should look at it harder than at something printed.
          confidence: Math.min(confidence, 0.75),
        });
      }
    }
    // The identifier also encodes a governorate of REGISTRATION. It is not
    // extracted, and the regression suite asserts that it never becomes one.
  }

  // The Arabic name: the longest run of Arabic letters and spaces ON ONE LINE.
  //
  // Splitting on lines first is the whole check. Matching across newlines made
  // the run swallow the card's own heading and offer "البطاقة الشخصية محمد أحمد
  // إبراهيم" — "Personal ID Card Mohamed Ahmed Ibrahim" — as a legal name. A
  // worker skimming a pre-filled form would very plausibly have accepted it,
  // which is precisely the confident-and-wrong outcome the accuracy baseline
  // measures separately from accuracy.
  const arabicRuns = normalized
    .split(/\r?\n/)
    .flatMap((line) => line.match(/[ء-ي][ء-ي ]{5,60}/g) ?? []);
  const longest = arabicRuns
    .map((run) => run.trim())
    .filter((run) => run.split(/\s+/).length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (longest) {
    candidates.push({
      fieldKey: 'legal_name_ar',
      value: longest,
      confidence: Math.min(confidence, 0.7),
    });
  }

  const expiry = normalized.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (expiry) {
    candidates.push({
      fieldKey: 'id_expiry_date',
      value: `${expiry[1]}-${expiry[2].padStart(2, '0')}-${expiry[3].padStart(2, '0')}`,
      confidence: Math.min(confidence, 0.65),
    });
  }

  return candidates;
}

/** The same parse, with the parser-failure signal the benchmark needs. */
export function parseIdentityDocument(
  text: string,
  blockConfidence: number,
): IdentityParseResult {
  const candidates = parseIdentityCandidates(text, blockConfidence);
  return {
    candidates,
    parserFailure: text.trim().length > 0 && candidates.length === 0,
  };
}
