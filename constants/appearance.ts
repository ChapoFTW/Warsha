/**
 * WPS-020 semantic appearance tokens.
 *
 * This file is the ONLY place in the repository where a literal colour value is
 * allowed to describe product surface. Everything else names a role.
 *
 * The dark theme is the established Warsha appearance and is reproduced value
 * for value from the locked "The Current" palette — it is not redesigned here.
 * The light theme is designed, not inverted: every role was chosen against a
 * warm off-white canvas so that hierarchy, restraint, and the brand's quiet
 * confidence survive the change of ground.
 */

/** Raw locked palette. Never import these outside this file. */
const ink = {
  black: '#080808',
  nearBlack: '#111111',
  paper: '#F4F2EE',
  paperElevated: '#FBFAF8',
  white: '#FFFFFF',
  offWhite: '#FAFAFA',
  green: '#2FBF71',
  greenDeep: '#17703D',
  amber: '#E8A13A',
  amberDeep: '#8A5A0B',
  red: '#F06455',
  redDeep: '#B3271A',
  blue: '#7FB2E8',
  blueDeep: '#1B5C99',
} as const;

/**
 * Every semantic role Warsha can express. A theme must supply all of them —
 * the type is what makes "we forgot a token in light mode" a build failure
 * rather than a screenshot someone notices later.
 */
export type ThemeColors = {
  // Background
  canvas: string;
  canvasElevated: string;
  surface: string;
  surfaceElevated: string;
  surfacePressed: string;
  surfaceSelected: string;
  overlay: string;
  scrim: string;
  /** Sits over photography, not over a theme surface. Dark in BOTH themes,
   * because the thing underneath is a photograph and light text has to stay
   * readable on it whichever appearance the app is in. */
  imageScrim: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  textDisabled: string;
  textLink: string;

  // Borders
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  borderFocus: string;

  // Actions
  actionPrimaryBackground: string;
  actionPrimaryText: string;
  actionSecondaryBackground: string;
  actionSecondaryText: string;
  actionDangerBackground: string;
  actionDangerText: string;
  actionDangerBorder: string;
  actionDisabledBackground: string;
  actionDisabledText: string;

  // Status
  successBackground: string;
  successText: string;
  warningBackground: string;
  warningText: string;
  errorBackground: string;
  errorText: string;
  successBorder: string;
  warningBorder: string;
  errorBorder: string;
  informationBorder: string;
  informationBackground: string;
  informationText: string;

  // Brand
  brandPrimary: string;
  brandOnPrimary: string;
  brandMark: string;
  brandWordmark: string;

  // Inputs
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  inputFocus: string;
  inputError: string;

  // Navigation
  navigationBackground: string;
  navigationBorder: string;
  navigationActive: string;
  navigationInactive: string;

  // Cards
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  cardPressed: string;

  // Skeleton and loading
  skeletonBase: string;
  skeletonHighlight: string;
  loadingMark: string;

  transparent: string;

  /**
   * Compatibility aliases for the pre-WPS-020 palette.
   *
   * These are deliberate and permanent, not a migration shim. `background`,
   * `surface`, and `textPrimary` were already semantic; keeping them avoids
   * churning 900 references to rename a role that was already correct.
   *
   * `white` is the exception and is genuinely misnamed — in dark it means
   * "primary action", which in light must be near-black. It is aliased to
   * `actionPrimaryBackground` so it resolves correctly in both themes, and
   * `scripts/audit-appearance.mjs` forbids any NEW use of it.
   */
  background: string;
  surfaceSoft: string;
  border: string;
  borderSoft: string;
  white: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
};

export const darkColors: ThemeColors = {
  canvas: ink.black,
  canvasElevated: '#0F0F0F',
  surface: '#141414',
  surfaceElevated: '#191919',
  surfacePressed: '#1D1D1D',
  surfaceSelected: '#222222',
  overlay: 'rgba(8,8,8,0.72)',
  scrim: 'rgba(8,8,8,0.88)',
  imageScrim: 'rgba(8,8,8,0.34)',

  textPrimary: ink.offWhite,
  textSecondary: '#B8B8B8',
  textMuted: '#6E6E6E',
  textInverse: ink.black,
  textDisabled: '#4A4A4A',
  textLink: ink.offWhite,

  borderSubtle: 'rgba(250,250,250,0.08)',
  borderDefault: 'rgba(250,250,250,0.14)',
  borderStrong: 'rgba(250,250,250,0.22)',
  borderFocus: ink.offWhite,

  actionPrimaryBackground: ink.offWhite,
  actionPrimaryText: ink.black,
  actionSecondaryBackground: 'transparent',
  actionSecondaryText: ink.offWhite,
  actionDangerBackground: 'rgba(240,100,85,0.13)',
  actionDangerText: ink.red,
  actionDangerBorder: 'rgba(240,100,85,0.55)',
  actionDisabledBackground: '#242424',
  actionDisabledText: '#6E6E6E',

  successBackground: 'rgba(47,191,113,0.13)',
  successText: ink.green,
  warningBackground: 'rgba(232,161,58,0.13)',
  warningText: ink.amber,
  errorBackground: 'rgba(240,100,85,0.13)',
  errorText: ink.red,
  successBorder: 'rgba(47,191,113,0.28)',
  warningBorder: 'rgba(232,161,58,0.28)',
  errorBorder: 'rgba(240,100,85,0.28)',
  informationBorder: 'rgba(127,178,232,0.28)',
  informationBackground: 'rgba(127,178,232,0.13)',
  informationText: ink.blue,

  brandPrimary: ink.green,
  brandOnPrimary: '#08160E',
  brandMark: ink.offWhite,
  brandWordmark: ink.offWhite,

  inputBackground: '#141414',
  inputBorder: 'rgba(250,250,250,0.14)',
  inputText: ink.offWhite,
  inputPlaceholder: '#6E6E6E',
  inputFocus: ink.offWhite,
  inputError: ink.red,

  navigationBackground: '#141414',
  navigationBorder: 'rgba(250,250,250,0.14)',
  navigationActive: ink.offWhite,
  navigationInactive: '#6E6E6E',

  cardBackground: '#141414',
  cardBorder: 'rgba(250,250,250,0.14)',
  cardShadow: '#000000',
  cardPressed: '#1D1D1D',

  skeletonBase: '#191919',
  skeletonHighlight: '#242424',
  loadingMark: ink.offWhite,

  transparent: 'transparent',

  background: ink.black,
  surfaceSoft: '#1D1D1D',
  border: 'rgba(250,250,250,0.14)',
  borderSoft: 'rgba(250,250,250,0.08)',
  white: ink.offWhite,
  success: ink.green,
  successSoft: 'rgba(47,191,113,0.13)',
  warning: ink.amber,
  warningSoft: 'rgba(232,161,58,0.13)',
  error: ink.red,
  errorSoft: 'rgba(240,100,85,0.13)',
};

/**
 * Light is a designed counterpart, not an inversion.
 *
 * Two decisions carry most of the character. The canvas is a warm off-white
 * (#F4F2EE) rather than pure white, so the interface reads as paper instead of
 * as a screen with the brightness up; and cards are pure white against it, so
 * elevation is expressed by *lightness rising* — the same direction as dark,
 * where surfaces also rise toward the light.
 *
 * Status text darkens while status marks keep the brand hue: #2FBF71 on white
 * is roughly 2:1 and would be unreadable as text, so the readable text role
 * uses #17703D while `brandPrimary` keeps the real green for dots, ticks, and
 * verified marks. Colour never carries the meaning alone (see the appearance
 * system document), so the split costs nothing semantically.
 */
export const lightColors: ThemeColors = {
  canvas: ink.paper,
  canvasElevated: ink.paperElevated,
  surface: ink.white,
  surfaceElevated: ink.white,
  surfacePressed: '#EDEAE4',
  surfaceSelected: '#E7E3DB',
  overlay: 'rgba(24,22,19,0.42)',
  scrim: 'rgba(24,22,19,0.62)',
  imageScrim: 'rgba(24,22,19,0.26)',

  textPrimary: ink.nearBlack,
  textSecondary: '#57544E',
  textMuted: '#6B6862',
  textInverse: ink.offWhite,
  textDisabled: '#AEAAA2',
  textLink: ink.nearBlack,

  borderSubtle: 'rgba(17,17,17,0.07)',
  borderDefault: 'rgba(17,17,17,0.13)',
  borderStrong: 'rgba(17,17,17,0.24)',
  borderFocus: ink.nearBlack,

  actionPrimaryBackground: ink.nearBlack,
  actionPrimaryText: ink.offWhite,
  actionSecondaryBackground: 'transparent',
  actionSecondaryText: ink.nearBlack,
  actionDangerBackground: 'rgba(179,39,26,0.09)',
  actionDangerText: ink.redDeep,
  actionDangerBorder: 'rgba(179,39,26,0.42)',
  actionDisabledBackground: '#E4E1DA',
  actionDisabledText: '#78746C',

  successBackground: 'rgba(23,112,61,0.10)',
  successText: ink.greenDeep,
  warningBackground: 'rgba(138,90,11,0.11)',
  warningText: ink.amberDeep,
  errorBackground: 'rgba(179,39,26,0.09)',
  errorText: ink.redDeep,
  successBorder: 'rgba(23,112,61,0.26)',
  warningBorder: 'rgba(138,90,11,0.26)',
  errorBorder: 'rgba(179,39,26,0.24)',
  informationBorder: 'rgba(27,92,153,0.24)',
  informationBackground: 'rgba(27,92,153,0.09)',
  informationText: ink.blueDeep,

  brandPrimary: ink.green,
  brandOnPrimary: '#08160E',
  brandMark: ink.nearBlack,
  brandWordmark: ink.nearBlack,

  inputBackground: ink.white,
  inputBorder: 'rgba(17,17,17,0.16)',
  inputText: ink.nearBlack,
  inputPlaceholder: '#75716A',
  inputFocus: ink.nearBlack,
  inputError: ink.redDeep,

  navigationBackground: ink.white,
  navigationBorder: 'rgba(17,17,17,0.10)',
  navigationActive: ink.nearBlack,
  navigationInactive: '#6B6862',

  cardBackground: ink.white,
  cardBorder: 'rgba(17,17,17,0.10)',
  cardShadow: '#4A453C',
  cardPressed: '#F1EEE8',

  skeletonBase: '#E9E6DF',
  skeletonHighlight: '#F4F2ED',
  loadingMark: ink.nearBlack,

  transparent: 'transparent',

  background: ink.paper,
  surfaceSoft: '#EDEAE4',
  border: 'rgba(17,17,17,0.13)',
  borderSoft: 'rgba(17,17,17,0.07)',
  white: ink.nearBlack,
  success: ink.greenDeep,
  successSoft: 'rgba(23,112,61,0.10)',
  warning: ink.amberDeep,
  warningSoft: 'rgba(138,90,11,0.11)',
  error: ink.redDeep,
  errorSoft: 'rgba(179,39,26,0.09)',
};

export type ResolvedAppearance = 'light' | 'dark';

export const themeColors: Record<ResolvedAppearance, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

/** Shadows depend on the ground they fall on, so elevation is theme-derived. */
export function elevationFor(colors: ThemeColors, scheme: ResolvedAppearance) {
  const shadowColor = colors.cardShadow;
  const cardOpacity = scheme === 'dark' ? 0.18 : 0.07;
  const modalOpacity = scheme === 'dark' ? 0.26 : 0.13;
  return {
    resting: { borderWidth: 1, borderColor: colors.borderSubtle },
    card: {
      shadowColor,
      shadowOffset: { width: 0, height: 10 },
      borderWidth: 1,
      borderColor: colors.cardBorder,
      shadowOpacity: cardOpacity,
      shadowRadius: 16,
      elevation: 3,
    },
    modal: {
      shadowColor,
      shadowOffset: { width: 0, height: 10 },
      borderWidth: 1,
      borderColor: colors.borderStrong,
      shadowOpacity: modalOpacity,
      shadowRadius: 24,
      elevation: 7,
    },
  } as const;
}

/**
 * The colour the platform paints before JavaScript runs — the native window
 * background and the web `theme-color`. It is a single value per resolved
 * scheme by necessity: the platform has no notion of a Warsha token.
 */
export const platformCanvas: Record<ResolvedAppearance, string> = {
  dark: darkColors.canvas,
  light: lightColors.canvas,
};
