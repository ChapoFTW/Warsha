/**
 * The single answer to "which way does this layout run".
 *
 * Deliberately import-free, like the rest of the preference contracts, so the
 * rules can be executed by the Node regression suite without a renderer or a
 * device — and so web and native cannot drift into two different definitions.
 *
 * Why this exists rather than `I18nManager.isRTL`: React Native derives that
 * from the *device* locale, and Warsha's language is a Warsha preference. A
 * person whose phone is in English and whose Warsha is in Arabic must get an
 * Arabic layout, and `I18nManager.isRTL` says otherwise. Flipping it with
 * `forceRTL` is possible but takes effect only after a restart, which is not a
 * thing to do to somebody mid-task. So direction is resolved in JavaScript
 * from the language, and every shared primitive reads it from here.
 */

export type Direction = 'ltr' | 'rtl';
export type TextAlign = 'left' | 'right';

const RTL_LANGUAGES = new Set(['ar']);

export function directionForLanguage(language: string): Direction {
  return RTL_LANGUAGES.has(language.toLowerCase().split(/[-_]/, 1)[0]) ? 'rtl' : 'ltr';
}

export function isRightToLeft(language: string): boolean {
  return directionForLanguage(language) === 'rtl';
}

/** The reading edge: where a line of text starts. */
export function textAlignFor(language: string): TextAlign {
  return isRightToLeft(language) ? 'right' : 'left';
}

/** The flex axis for a row that should follow reading order. */
export function rowDirectionFor(language: string): 'row' | 'row-reverse' {
  return isRightToLeft(language) ? 'row-reverse' : 'row';
}

/**
 * Fields whose *content* is not natural language.
 *
 * A phone number, an email address, a password and a numeric amount are read
 * left-to-right in every language. Mirroring them produces a number that looks
 * wrong to the person typing it and, for a phone, one that is genuinely
 * ambiguous about where the country code went. The label above such a field
 * stays in the page's direction; only the value runs the other way.
 */
export const LTR_CONTENT_KINDS = [
  'email', 'phone', 'password', 'numeric', 'url', 'code',
] as const;
export type ContentKind = (typeof LTR_CONTENT_KINDS)[number] | 'text';

export function contentDirection(kind: ContentKind, language: string): Direction {
  return (LTR_CONTENT_KINDS as readonly string[]).includes(kind)
    ? 'ltr'
    : directionForLanguage(language);
}

export function contentTextAlign(kind: ContentKind, language: string): TextAlign {
  return contentDirection(kind, language) === 'rtl' ? 'right' : 'left';
}

/**
 * Icons that mean "onward" or "back" point along the reading direction and
 * must mirror. Icons that denote a thing — a camera, a trash can, a chevron
 * that opens a disclosure downward — mean the same in both and must not.
 */
const DIRECTIONAL_ICONS = new Set([
  'chevron-left', 'chevron-right', 'arrow-back', 'arrow-forward',
  'arrow-left', 'arrow-right', 'keyboard-arrow-left', 'keyboard-arrow-right',
  'navigate-before', 'navigate-next', 'first-page', 'last-page',
  'send', 'reply', 'undo', 'redo', 'trending-flat',
]);

export function isDirectionalIcon(name: string): boolean {
  return DIRECTIONAL_ICONS.has(name);
}

/** The icon to draw once direction is taken into account. */
export function mirroredIcon(name: string, language: string): string {
  if (!isDirectionalIcon(name) || !isRightToLeft(language)) return name;
  const pairs: Record<string, string> = {
    'chevron-left': 'chevron-right',
    'chevron-right': 'chevron-left',
    'arrow-back': 'arrow-forward',
    'arrow-forward': 'arrow-back',
    'arrow-left': 'arrow-right',
    'arrow-right': 'arrow-left',
    'keyboard-arrow-left': 'keyboard-arrow-right',
    'keyboard-arrow-right': 'keyboard-arrow-left',
    'navigate-before': 'navigate-next',
    'navigate-next': 'navigate-before',
    'first-page': 'last-page',
    'last-page': 'first-page',
  };
  return pairs[name] ?? name;
}
