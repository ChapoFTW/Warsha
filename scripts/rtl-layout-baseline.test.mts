/**
 * Warsha's layout direction has exactly one authority, and it is not the
 * platform.
 *
 * ## Read this before "fixing" the constant `direction: 'ltr'` at the root
 *
 * It looks wrong. The app is in Arabic and the root says LTR. It is correct, and
 * it was arrived at by measurement after three wrong diagnoses.
 *
 * Warsha mirrors explicitly: `Typography` sets `textAlign` and
 * `writingDirection`, the field primitive sets its own, and every row that needs
 * mirroring applies `row-reverse` itself — 65 of them. That is a complete
 * strategy. It only works against a NEUTRAL coordinate system, because two
 * mirrors compose back into none.
 *
 * The root used to set `direction: isRTL ? 'rtl' : 'ltr'`. Measured on device
 * with the app in Arabic:
 *
 *     flattened flexDirection : row-reverse   (it did reach the view)
 *     derived native baseline : RTL
 *     live row child order    : A B C         (cancelled back to LTR)
 *
 * With the root pinned to `ltr` and nothing else changed:
 *
 *     derived native baseline : LTR
 *     live row child order    : C B A         (genuinely mirrored)
 *
 * Identical on first launch, on cold relaunch, and with the DEVICE locale in
 * Arabic — which matters, because `I18nManager.isRTL` is `true` in all of those
 * cases and stays true. Android's per-app locale makes the app's own
 * configuration Arabic regardless of the system language, and
 * `I18nManager.allowRTL(false)` never took effect: `isRTL` was still `true` on
 * every launch of a build that called it, and Android's `getConstants()` does
 * not even expose `allowRTL` to read back.
 *
 * So the baseline cannot depend on the platform settling. It is pinned.
 *
 * ## The Yoga contract, measured on the shipped runtime
 *
 * React Native 0.81, new architecture, API 35, 320dp:
 *
 *     direction ltr + row          -> A B C
 *     direction ltr + row-reverse  -> C B A
 *     direction rtl + row          -> C B A
 *     direction rtl + row-reverse  -> A B C
 *
 * Nothing was broken in isolation. Two correct mechanisms composed wrongly.
 *
 * ## Physical left/right
 *
 * `doLeftAndRightSwapInRTL` is `true` and stays true. Measured: a child with
 * `left: 20` lands at the left under the inherited LTR baseline, and only swaps
 * inside an explicitly `rtl` container. Swapping follows the RESOLVED layout
 * direction, so the neutral root neutralises it and
 * `I18nManager.swapLeftAndRightInRTL(false)` is not needed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

const strip = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
const rootCode = strip(rootLayout);
const localization = readFileSync('src/i18n/localization.tsx', 'utf8');
const localizationCode = strip(localization);

// --- The neutral baseline ---------------------------------------------------
ok(/direction: 'ltr'/.test(rootCode),
  "THE ROOT PINS A NEUTRAL LTR COORDINATE SYSTEM — measured, not assumed");
ok(!/direction:\s*isRTL/.test(rootCode),
  'and it is never derived from the language, which is what caused the double mirror');
ok(rootLayout.includes('isRTL'),
  'the root still reads the language for the things it legitimately drives');

// --- The platform is not an authority ---------------------------------------
ok(/allowRTL\(false\)/.test(localizationCode),
  'the platform is asked not to mirror');
ok(!/allowRTL\(true\)/.test(localizationCode),
  'and is never re-permitted to');
ok(!/forceRTL/.test(localizationCode),
  'forceRTL stays unused — it needs a restart, and restarting somebody mid-task '
  + 'to change a layout is worse than the layout');
ok(!/swapLeftAndRightInRTL/.test(localizationCode),
  'SWAPPING IS NOT DISABLED — measurement showed the neutral baseline already '
  + 'neutralises it, so the call would be cargo cult');

// --- The explicit layer is intact -------------------------------------------
const typography = readFileSync('components/warsha/Typography.tsx', 'utf8');
ok(/textAlign: isRTL \? 'right' : 'left'/.test(typography),
  'text still aligns to the reading edge');
ok(/writingDirection: isRTL \? 'rtl' : 'ltr'/.test(typography),
  'AND TEXT DIRECTION IS STILL RTL — a neutral LAYOUT baseline is not an LTR '
  + 'text baseline; they are different concepts and only one was pinned');

const brandUi = readFileSync('components/warsha/BrandUI.tsx', 'utf8');
ok(/fieldRTL: \{ textAlign: 'right', writingDirection: 'rtl' \}/.test(brandUi),
  'and fields keep their own direction');

// The explicit mirroring layer must still exist in bulk. If someone ever
// "simplifies" by deleting row-reverse sites, the neutral root would leave the
// product unmirrored — silently, because nothing would look doubled.
const welcome = readFileSync('app/welcome.tsx', 'utf8');
ok(/isRTL && styles\.reverse/.test(welcome),
  'rows still mirror themselves, which is the only mirroring authority left');

// --- The diagnostic must not have survived ----------------------------------
ok(!/RtlProbeBlock/.test(welcome),
  'THE TEMPORARY PROBE IS NOT IN THE PRODUCT BUNDLE');
let probeExists = true;
try { readFileSync('components/warsha/RtlProbeBlock.tsx', 'utf8'); } catch { probeExists = false; }
ok(!probeExists, 'and its component is gone, not merely unreferenced');

const routePolicy = readFileSync('src/navigation/auth-route-policy.ts', 'utf8');
ok(!/rtl-probe/.test(routePolicy),
  'and no QA route was left behind in the auth policy');

// --- Navigation presentation follows Warsha, not the platform --------------
/**
 * React Navigation defaults its direction from `I18nManager`, which on an
 * Arabic-configured Android device is true even when Warsha is in English. Expo
 * Router mounts a forked NavigationContainer and does not pass `direction`, so
 * the supported override is the context it publishes — supplied below that
 * container, where this value wins.
 *
 * Presentation only. It must not become a second flex-layout authority.
 */
ok(/LocaleDirContext/.test(rootCode),
  'navigation direction is supplied explicitly rather than left to I18nManager');
ok(/LocaleDirContext\.Provider value=\{isRTL \? 'rtl' : 'ltr'\}/.test(rootCode),
  'AND IT FOLLOWS THE WARSHA LANGUAGE');
ok(!/patch-package|@react-navigation\/native\/lib/.test(rootCode),
  'achieved through the supported API, not by patching library internals');

// --- Logical edges, for the few places that pin to a corner ----------------
const direction = readFileSync('src/i18n/direction.ts', 'utf8');
ok(/export function leadingInset/.test(direction) && /export function trailingInset/.test(direction),
  'logical edge helpers live with the direction authority');

const providerScreen = readFileSync('app/provider/[id].tsx', 'utf8');
ok(/leadingInset\(circleIsRTL, 16\)/.test(providerScreen),
  'THE HERO BACK CONTROL SITS WHERE READING STARTS — right in Arabic');
ok(/arrow-forward" : "arrow-back"/.test(providerScreen),
  'and its glyph points the right way, which it already did');
ok(!/left: \{ left: 16 \}/.test(providerScreen),
  'the physical pair it replaced is gone');
// A divider between columns is correctly physical: with row-reverse it still
// separates the same adjacent cells. Kept deliberately, asserted so a later
// sweep does not "fix" it.
ok(/borderRightWidth: 1/.test(providerScreen),
  'the stat column divider stays physical, because that is what it means');

const bookingScreen = readFileSync('app/booking/new/[providerId].tsx', 'utf8');
ok(/trailingInset\(isRTL, 5\)/.test(bookingScreen),
  'the thumbnail remove badge sits on the trailing corner');

const chatScreen = readFileSync('app/conversation/[bookingId].tsx', 'utf8');
ok(/trailingInset\(isRTL, 22\)/.test(chatScreen),
  'and so does the full-screen preview close control');

console.log(`RTL layout baseline: ${checks} checks passed.`);
