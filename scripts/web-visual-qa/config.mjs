/**
 * What the web visual gate covers, as data rather than code.
 *
 * The matrix is deliberately NOT a Cartesian product. Ten viewports times three
 * locales times three themes times four hosts is 360 runs, most of which differ
 * from their neighbours in ways nobody would ever look at, and a gate that slow
 * gets skipped. Instead every viewport is rendered once in a baseline locale and
 * theme, and the risky combinations — the ones where Warsha has actually had
 * defects — are named explicitly.
 *
 * Risk, for Warsha specifically:
 *   - 320dp is where controls clip and prices overflow their cards;
 *   - Arabic is a hard release gate and mirrors the whole layout;
 *   - French is the long-copy language that breaks buttons and nav labels;
 *   - dark mode is where contrast and stale-theme bugs live;
 *   - enlarged text is where fixed-height rows swallow their own content;
 *   - short viewports are where sticky footers cover the submit button.
 */

export const HOSTS = {
  public: 'https://usewarsha.com',
  www: 'https://www.usewarsha.com',
  app: 'https://app.usewarsha.com',
  admin: 'https://admin.usewarsha.com',
};

/** Widths chosen for what breaks at them, not for round numbers. */
export const VIEWPORTS = {
  'mobile-320': { width: 320, height: 720, label: 'smallest phone Warsha supports' },
  'mobile-360': { width: 360, height: 780, label: 'common budget Android' },
  'mobile-390': { width: 390, height: 844, label: 'modern phone' },
  'tablet-768': { width: 768, height: 1024, label: 'tablet portrait' },
  'desktop-1280': { width: 1280, height: 800, label: 'laptop' },
  'desktop-1440': { width: 1440, height: 900, label: 'desktop' },
  'short-800x600': { width: 800, height: 600, label: 'short viewport: sticky controls' },
};

export const LOCALES = { en: 'en', ar: 'ar', fr: 'fr' };
export const THEMES = ['light', 'dark'];

/**
 * Public routes are locale-prefixed; the app and admin hosts are not, and set
 * language from a cookie the site itself writes.
 */
export const ROUTES = {
  public: [
    { id: 'home', path: (l) => `/${l}` },
    { id: 'services', path: (l) => `/${l}/services` },
    { id: 'categories', path: (l) => `/${l}/categories` },
    { id: 'become-a-worker', path: (l) => `/${l}/become-a-worker` },
    { id: 'help', path: (l) => `/${l}/help` },
    { id: 'legal-index', path: (l) => `/${l}/legal` },
    { id: 'legal-privacy', path: (l) => `/${l}/legal/privacy-policy` },
    { id: 'contact', path: (l) => `/${l}/contact` },
    { id: 'not-found', path: (l) => `/${l}/this-route-does-not-exist`, expect: 404 },
  ],
  app: [
    { id: 'sign-in', path: () => '/sign-in' },
    { id: 'create-account', path: () => '/create-account' },
    { id: 'forgot-password', path: () => '/forgot-password' },
    { id: 'recovery-invalid', path: () => '/auth/recovery' },
  ],
  admin: [
    { id: 'sign-in', path: () => '/sign-in' },
  ],
};

/**
 * The cases the gate actually runs.
 *
 * `full` sweeps every viewport for the baseline locale and theme, so layout
 * breakage at any width is caught. The rest are targeted: each names a
 * combination where Warsha has a real reason to expect trouble.
 */
export const CASES = [
  { id: 'en-light-sweep', locale: 'en', theme: 'light', viewports: Object.keys(VIEWPORTS) },
  { id: 'ar-compact', locale: 'ar', theme: 'light', viewports: ['mobile-320', 'mobile-390', 'desktop-1280'] },
  { id: 'ar-dark', locale: 'ar', theme: 'dark', viewports: ['mobile-360'] },
  { id: 'fr-compact', locale: 'fr', theme: 'light', viewports: ['mobile-320', 'mobile-360'] },
  { id: 'fr-desktop', locale: 'fr', theme: 'light', viewports: ['desktop-1280'] },
  { id: 'en-dark', locale: 'en', theme: 'dark', viewports: ['mobile-390', 'desktop-1280'] },
  { id: 'en-short', locale: 'en', theme: 'light', viewports: ['short-800x600'] },
  // Enlarged text is a zoom factor rather than a viewport: the browser reports
  // the same CSS width while every box gets bigger, which is exactly the
  // condition that makes fixed-height rows clip.
  { id: 'en-zoom-200', locale: 'en', theme: 'light', viewports: ['mobile-390'], zoom: 2 },
  { id: 'ar-zoom-150', locale: 'ar', theme: 'light', viewports: ['mobile-360'], zoom: 1.5 },
];

export const ARTIFACTS = process.env.WARSHA_QA_ARTIFACTS
  ?? 'D:\\Warsha-Temp\\web-visual-qa';
