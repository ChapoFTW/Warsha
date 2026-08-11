import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  contentDirection,
  contentTextAlign,
  directionForLanguage,
  isDirectionalIcon,
  isRightToLeft,
  mirroredIcon,
  rowDirectionFor,
  textAlignFor,
} from '../src/i18n/direction.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// --- The direction authority ------------------------------------------------
equal(directionForLanguage('ar'), 'rtl', 'Arabic runs right to left');
equal(directionForLanguage('en'), 'ltr', 'English runs left to right');
equal(directionForLanguage('ar-EG'), 'rtl', 'a regional Arabic tag still runs right to left');
equal(directionForLanguage('EN-GB'), 'ltr', 'tag case does not change direction');
check(isRightToLeft('ar') && !isRightToLeft('en'), 'the boolean form agrees');
equal(textAlignFor('ar'), 'right', 'Arabic text starts at the right edge');
equal(textAlignFor('en'), 'left', 'English text starts at the left edge');
equal(rowDirectionFor('ar'), 'row-reverse', 'ARABIC ROWS FOLLOW READING ORDER, RIGHT TO LEFT');
equal(rowDirectionFor('en'), 'row', 'English rows run left to right');

// --- Mixed-direction fields -------------------------------------------------
// The label is Arabic; the value is a phone number. Mirroring the value would
// make the country code appear to move.
for (const kind of ['email', 'phone', 'password', 'numeric', 'url', 'code'] as const) {
  equal(contentDirection(kind, 'ar'), 'ltr',
    `a ${kind} value stays left-to-right inside an Arabic form`);
  equal(contentTextAlign(kind, 'ar'), 'left', `a ${kind} value aligns to the left`);
  equal(contentDirection(kind, 'en'), 'ltr', `a ${kind} value is unchanged in English`);
}
equal(contentDirection('text', 'ar'), 'rtl', 'ordinary Arabic prose is right-to-left');
equal(contentTextAlign('text', 'ar'), 'right', 'ordinary Arabic prose aligns right');
equal(contentDirection('text', 'en'), 'ltr', 'ordinary English prose is left-to-right');

// --- Directional icons mirror; meaningful icons do not ---------------------
equal(mirroredIcon('chevron-left', 'ar'), 'chevron-right',
  'A BACK CHEVRON POINTS THE OTHER WAY IN ARABIC');
equal(mirroredIcon('arrow-forward', 'ar'), 'arrow-back', 'onward arrows mirror');
equal(mirroredIcon('chevron-left', 'en'), 'chevron-left', 'nothing mirrors in English');
for (const icon of ['camera-alt', 'delete', 'search', 'check-box', 'expand-more', 'star']) {
  check(!isDirectionalIcon(icon), `${icon} denotes a thing and must not mirror`);
  equal(mirroredIcon(icon, 'ar'), icon, `${icon} is unchanged in Arabic`);
}

// --- Shared primitives are direction-aware ---------------------------------
const typography = readFileSync('components/warsha/Typography.tsx', 'utf8');
check(/textAlign: isRTL \? 'right' : 'left'/.test(typography),
  'the shared text primitive aligns to the reading edge');
check(/writingDirection: isRTL \? 'rtl' : 'ltr'/.test(typography),
  'THE SHARED TEXT PRIMITIVE SETS WRITING DIRECTION, NOT ONLY ALIGNMENT');

const localization = readFileSync('src/i18n/localization.tsx', 'utf8');
check(/isRTL/.test(localization),
  'direction is published by the localization context for every consumer');
check(/I18nManager\.allowRTL\(true\)/.test(localization),
  'the platform is permitted to lay out right to left');
// forceRTL is deliberately not called: it needs a restart to take effect, and
// restarting somebody mid-task to change a layout is worse than the layout.
check(!/forceRTL/.test(localization),
  'direction is resolved in JavaScript rather than by a restart-required native flag');

// --- No hardcoded left alignment in shared components ----------------------
function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}
const sharedComponents = walk('components');
for (const file of sharedComponents) {
  const source = readFileSync(file, 'utf8');
  check(!/textAlign: *'left'/.test(source),
    `${file} does not pin text to the left, which would strand Arabic`);
  check(!/textAlign: *'right'/.test(source) || /isRTL/.test(source),
    `${file} only pins text right when it is reasoning about direction`);
}

// --- Every shared component that lays out a row reasons about direction ----
// This is the check that turns "Arabic looks left-oriented in places" into a
// list. A row of children has a reading order; a component that sets one
// without consulting direction will be backwards in Arabic.
const rowOffenders: string[] = [];
for (const file of sharedComponents) {
  const source = readFileSync(file, 'utf8');
  const hasRow = /flexDirection: *'row'/.test(source);
  const reasons = /isRTL|row-reverse|rowDirectionFor|flexDirection: *isRTL/.test(source);
  // A row of equal, unordered children (a wrap of chips, a centred pair of
  // icons) has no reading order to get wrong. Those declare it explicitly.
  const unordered = /justifyContent: *'center'/.test(source)
    || /flexWrap: *'wrap'/.test(source);
  if (hasRow && !reasons && !unordered) rowOffenders.push(file);
}
equal(rowOffenders, [],
  'EVERY SHARED COMPONENT WITH AN ORDERED ROW REASONS ABOUT READING DIRECTION');

// --- Web parity -------------------------------------------------------------
const webLayout = readFileSync('web/app/[locale]/layout.tsx', 'utf8');
check(/dir=\{directionOf\(typed\)\}/.test(webLayout) && /lang=\{typed\}/.test(webLayout),
  'the web sets lang and dir on the document root, per locale');
const webCss = readFileSync('web/app/globals.css', 'utf8');
check(!/text-align: *left/.test(webCss),
  'the web stylesheet never pins text to the left');
check(/inset-inline|margin-inline|padding-inline|border-inline/.test(
  webCss + readFileSync('web/components/site-chrome.module.css', 'utf8')),
  'WEB LAYOUT USES LOGICAL PROPERTIES, SO RTL FALLS OUT OF dir RATHER THAN A SECOND STYLESHEET');
check(!/position: *fixed/.test(readFileSync('web/components/preference-controls.module.css', 'utf8')),
  'the language and appearance controls cannot overlap content in either direction');

console.log(`RTL direction regressions: ${checks} checks passed across ${sharedComponents.length} shared components.`);
