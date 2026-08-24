import { egyptAdministrativeAreas } from './egypt-administrative-areas.generated.ts';
import type { EgyptLocationOption } from './egypt-locations.ts';

/**
 * Mapping what a maps provider calls a place onto what Warsha calls it.
 *
 * These are two different naming authorities and they do not agree. Warsha's
 * governorates and areas come from the CAPMAS/OCHA dataset; Google names the
 * same places its own way. For one real address in Alexandria:
 *
 *     administrative_area_level_1   "Alexandria Governorate"   vs   "Alexandria"
 *     administrative_area_level_2   "Dekheila"                 vs   "Al Dikhila"
 *
 * Exact string equality was the only matcher, so both failed and the form left
 * Governorate on "Choose a governorate" with Area unavailable — while the
 * street address had populated perfectly, which is what made it look arbitrary.
 *
 * Three things cause the disagreement, and each is handled as itself rather
 * than by pattern-matching whole strings:
 *
 *   1. An administrative suffix Google adds and the dataset does not
 *      ("Governorate", "محافظة").
 *   2. The definite article, present or absent, in either script
 *      ("Al Dikhila" / "Dikhila" / "الدخيلة" / "دخيلة").
 *   3. Arabic transliteration vowels, which are genuinely unstandardised
 *      ("Dikhila" / "Dekheila" / "Dakhila" are the same place).
 *
 * The first two are normalisation. The third is not: no amount of normalising
 * makes "dikhila" equal "dekheila", because the consonants are what the Arabic
 * actually fixes and the vowels are the transliterator's choice. So the last
 * resort compares consonant skeletons — and only accepts the answer when
 * exactly one candidate matches.
 *
 * That last rule is the important one. A guess here is not a cosmetic error: it
 * silently files somebody's address under the wrong district, and they have no
 * reason to check a field that filled itself in. An ambiguous or unrecognised
 * value returns null and the field is left for the person to choose.
 */

export type EgyptLocationMatch = {
  option: EgyptLocationOption;
  /**
   * How the match was reached. `exact` and `normalized` are certain;
   * `transliteration` is a consonant-skeleton match that was unique among the
   * candidates. Surfaced so a caller can decide to treat it differently.
   */
  how: 'exact' | 'normalized' | 'transliteration';
};

// Written as escapes rather than literals: these ranges are invisible in an
// editor and a corrupted character here fails silently, matching nothing.
const ARABIC_MARKS = /[\u064b-\u0652\u0640\u0670\u0653-\u0655]/g;

/**
 * Latin accents only.
 *
 * NFD is applied and immediately recomposed. Decomposing Arabic splits hamza
 * forms into a bare alif plus a combining mark outside the Latin range, so a
 * decomposed string reaches the Arabic rules as something they no longer
 * recognise -- which is exactly why the Arabic path silently matched nothing.
 */
function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

/** Alif and hamza forms, ta marbuta and alif maqsura all vary in real data. */
function normalizeArabic(value: string): string {
  return value
    .normalize('NFC')
    .replace(ARABIC_MARKS, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/[\u0624\u0626]/g, '\u0621');
}

/** Words that describe the *kind* of place rather than which place it is. */
const ADMINISTRATIVE_WORDS = [
  'governorate', 'muhafazat', 'muhafazah', 'mohafazat', 'province',
];
const ARABIC_ADMINISTRATIVE = ['\u0645\u062d\u0627\u0641\u0638\u0647'];
/** "kism"/"markaz": the kind of division, present in the dataset, never sent. */
const ARABIC_AREA_WORDS = ['\u0642\u0633\u0645', '\u0645\u0631\u0643\u0632'];
const LATIN_AREA_WORDS = ['kism', 'qism', 'markaz'];

/**
 * The definite article, in both scripts and its several transliterations.
 *
 * Only stripped from the front, and only when something is left: "Al" alone is
 * not an article, and an area genuinely called that would otherwise vanish.
 */
const LATIN_ARTICLES = ['al', 'el', 'as', 'ash', 'ad', 'ar', 'az', 'an'];

function normalizePlaceName(value: string, kind: 'governorate' | 'area'): string {
  let text = stripAccents(normalizeArabic(value)).toLowerCase();
  // Punctuation between words is decoration: "Burg al-Arab" and "Burg Al Arab".
  text = text.replace(/[’'`.,()]/g, ' ').replace(/[-_/]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  const dropped = kind === 'governorate'
    ? { latin: ADMINISTRATIVE_WORDS, arabic: ARABIC_ADMINISTRATIVE }
    : { latin: LATIN_AREA_WORDS, arabic: ARABIC_AREA_WORDS };
  for (const word of dropped.latin) {
    text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
  }
  for (const word of dropped.arabic) {
    text = text.split(word).join(' ');
  }
  text = text.replace(/\s+/g, ' ').trim();

  const words = text.split(' ').filter(Boolean);
  if (words.length > 1 && LATIN_ARTICLES.includes(words[0])) words.shift();
  text = words.join(' ');
  // The Arabic article is written joined to its noun, so it is a prefix strip
  // rather than a word drop. Run after the division word is gone, since that
  // is what the article follows: "kism al-Dikhila".
  if (text.startsWith('ال') && text.length > 3) text = text.slice(2);
  return text;
}

/**
 * The consonants, which is what the Arabic actually fixes.
 *
 * `y` and `w` are dropped with the vowels: they stand in for long vowels in
 * these transliterations far more often than for consonants.
 */
function consonantSkeleton(value: string): string {
  return value
    .replace(/[aeiouyw\s]/g, '')
    // Qaf is transliterated q or k by different sources -- the dataset writes
    // Dokki as "DuqqI" -- and gemination is written doubled or single. Neither
    // distinction survives into Arabic, so neither is allowed to decide a match.
    .replace(/q/g, 'k')
    .replace(/(.)\1+/g, '$1');
}

function candidateNames(option: { en: string; ar: string }): string[] {
  return [option.en, option.ar];
}

/**
 * The dataset is declared `as const`, so every governorate's `areas` has its own
 * literal tuple type. Narrowing to the three fields this actually reads keeps
 * one matcher usable for all twenty-seven of them.
 */
type NamedPlace = { id: string; en: string; ar: string };

function findMatch(
  pool: readonly NamedPlace[],
  value: string,
  kind: 'governorate' | 'area',
): { item: NamedPlace; how: EgyptLocationMatch['how'] } | null {
  const raw = value.trim();
  if (!raw) return null;

  // 1. Exactly what the dataset says.
  const exact = pool.find((item) => item.en === raw || item.ar === raw);
  if (exact) return { item: exact, how: 'exact' };

  // 2. Same name, written differently.
  const target = normalizePlaceName(raw, kind);
  if (!target) return null;
  const normalized = pool.filter((item) =>
    candidateNames(item).some((name) => normalizePlaceName(name, kind) === target));
  if (normalized.length === 1) return { item: normalized[0], how: 'normalized' };
  // More than one dataset entry normalises to the same string: the data cannot
  // tell them apart, so neither can this.
  if (normalized.length > 1) return null;

  // 3. Same consonants, different vowels — accepted only when unambiguous.
  //
  // The floor is on the *name*, not the skeleton. Collapsing gemination makes
  // real names very short -- Dokki reduces to "dk", Agouza to "gz" -- and a
  // skeleton floor of three silently refused to match a quarter of the
  // dataset. Ambiguity is handled by the uniqueness rule below, which is the
  // guard that actually matters: 38 skeletons in the dataset are shared by two
  // areas, every one of them a genuine duplicate name, and all of them return
  // null here rather than a coin flip.
  if (target.replace(/\s/g, '').length < 3) return null;
  const skeleton = consonantSkeleton(target);
  if (skeleton.length < 2) return null;
  const loose = pool.filter((item) =>
    candidateNames(item).some((name) =>
      consonantSkeleton(normalizePlaceName(name, kind)) === skeleton));
  if (loose.length === 1) return { item: loose[0], how: 'transliteration' };
  return null;
}

const asOption = (item: { id: string; en: string; ar: string }): EgyptLocationOption =>
  ({ id: item.id, en: item.en, ar: item.ar, fr: item.en });

/** The canonical governorate a provider's administrative area refers to. */
export function matchEgyptGovernorate(value: string | null | undefined): EgyptLocationMatch | null {
  if (!value) return null;
  const found = findMatch(egyptAdministrativeAreas, value, 'governorate');
  return found ? { option: asOption(found.item), how: found.how } : null;
}

/**
 * The canonical area, searched only inside its governorate.
 *
 * Scoping to the parent is what makes the transliteration rule safe enough to
 * use: nineteen candidates can be told apart by consonants where three hundred
 * and sixty-five could not.
 */
export function matchEgyptArea(
  governorateId: string,
  value: string | null | undefined,
): EgyptLocationMatch | null {
  if (!value) return null;
  const governorate = egyptAdministrativeAreas.find((item) => item.id === governorateId);
  if (!governorate) return null;
  const found = findMatch(governorate.areas, value, 'area');
  return found ? { option: asOption(found.item), how: found.how } : null;
}

/**
 * One place that turns a provider's administrative names into Warsha's.
 *
 * Both the autocomplete selection and the current-location reverse geocode go
 * through this, so they cannot diverge — which they previously could, being two
 * separate call sites doing the same thing by hand.
 *
 * An area is only offered when its governorate resolved: an area name means
 * nothing without its parent, and matching one against the wrong governorate is
 * exactly the silent mis-filing this module exists to avoid.
 */
export function resolveEgyptLocation(input: {
  governorate?: string | null;
  district?: string | null;
}): { governorate: EgyptLocationMatch | null; area: EgyptLocationMatch | null } {
  const governorate = matchEgyptGovernorate(input.governorate);
  const area = governorate ? matchEgyptArea(governorate.option.id, input.district) : null;
  return { governorate, area };
}
