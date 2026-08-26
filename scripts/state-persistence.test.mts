/**
 * Warsha state persistence: preferences, drafts, and navigation.
 *
 * Every assertion here traces to something a person reported. The two
 * complaints were "I move to another page and what I typed is gone" and
 * "language behaves as though it belongs to the page rather than to me", and
 * the suite is organised so a future regression fails against the *symptom*
 * rather than against an implementation detail that happens to be nearby.
 *
 * Three kinds of check, deliberately not mixed up with each other:
 *
 *   1. **Rules** - the shared, import-free authorities run directly. These are
 *      the real functions the product calls, not restatements of them.
 *   2. **Journeys** - the exact QA sequences played out against a fake device
 *      store, so "set Arabic, navigate, come back" is a test rather than a
 *      paragraph.
 *   3. **Wiring** - source-level assertions that the surfaces actually consume
 *      those rules. A correct authority nothing imports is how the previous
 *      architecture managed to be right and broken at the same time.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  accountLocalePrecedence,
  directionFor,
  intlTagFor,
  isSupportedLocale,
  localeCookieDomain,
  localeCookieValue,
  localeDirectionAgrees,
  localeFromCookieHeader,
  localeFromPath,
  localeFromPreferredList,
  pathWithLocale,
  pathWithoutLocale,
  preferredListFromAcceptLanguage,
  resolveEffectiveLocale,
  supportedLocales,
  type SupportedLocale,
} from '../src/preferences/preference-authority.ts';
import {
  allDraftStorageKeys,
  clearsAllFlows,
  decodeDraft,
  draftFlows,
  draftIsWorthKeeping,
  draftLifetimeMs,
  draftSchemaVersions,
  draftStorageKey,
  encodeDraft,
  forbiddenDraftFieldPath,
  isDraftFlow,
  type DraftFlow,
} from '../src/drafts/draft-contract.ts';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Source with comments removed.
 *
 * Several assertions below are of the form "this token no longer appears", and
 * the tokens in question are named in the very comments that explain why they
 * were removed. Testing the code rather than the prose keeps both honest.
 */
const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.equal(actual, expected, message);
  checks += 1;
};

// ---------------------------------------------------------------------------
// 1. Rules: one effective locale
// ---------------------------------------------------------------------------

// The precedence, one rung at a time. Each case supplies every lower-ranked
// input as a *different* language, so a rung that stopped being consulted
// fails rather than accidentally agreeing.
equal(resolveEffectiveLocale({
  storedLocale: 'ar', storedExplicit: true,
  routeLocale: 'en', rememberedLocale: 'fr', platformLocales: ['en-US'],
}).locale, 'ar', 'an explicit choice outranks the address, the cookie and the browser');
equal(resolveEffectiveLocale({
  storedLocale: 'ar', storedExplicit: true, routeLocale: 'en',
}).source, 'explicit', 'and it says so');
equal(resolveEffectiveLocale({
  storedLocale: 'ar', storedExplicit: false,
  routeLocale: 'fr', rememberedLocale: 'en', platformLocales: ['en-US'],
}).locale, 'fr', 'a cached non-explicit value cannot outrank the address');
equal(resolveEffectiveLocale({
  rememberedLocale: 'ar', platformLocales: ['en-US'],
}).locale, 'ar', 'the cross-origin cookie outranks the browser preference');
equal(resolveEffectiveLocale({ platformLocales: ['fr-FR'] }).locale, 'fr',
  'the browser preference is consulted when nothing has been chosen');
equal(resolveEffectiveLocale({}).locale, 'en', 'and English is the floor');
equal(resolveEffectiveLocale({}).source, 'default', 'the floor names itself');

// A value that is not a supported language may never be adopted from any rung.
for (const rubbish of ['de', 'zz', '', null, undefined, 42, {}]) {
  equal(resolveEffectiveLocale({ storedLocale: rubbish, storedExplicit: true }).locale, 'en',
    `an unsupported stored value (${String(rubbish)}) falls through to English`);
  equal(resolveEffectiveLocale({ routeLocale: rubbish }).locale, 'en',
    `an unsupported route segment (${String(rubbish)}) falls through to English`);
}

// The direction invariant. Language decides direction and nothing else does.
for (const locale of supportedLocales) {
  const effective = resolveEffectiveLocale({ storedLocale: locale, storedExplicit: true });
  equal(effective.locale, locale, `${locale} resolves to itself`);
  check(localeDirectionAgrees(effective.locale, effective.direction),
    `${locale} carries the direction its language implies`);
}
equal(directionFor('ar'), 'rtl', 'Arabic is right to left');
equal(directionFor('en'), 'ltr', 'English is left to right');
equal(directionFor('fr'), 'ltr', 'French is left to right');
check(!localeDirectionAgrees('en', 'rtl'), 'English with RTL is not a state Warsha can express');
check(!localeDirectionAgrees('ar', 'ltr'), 'Arabic with LTR is not a state Warsha can express');
equal(intlTagFor('ar'), 'ar-EG', 'Arabic formats as Egyptian Arabic');
equal(intlTagFor('fr'), 'fr-EG', 'French formats for Egypt, not for France');

// The mobile rule for a preference list: the first *stated* preference decides.
equal(localeFromPreferredList([{ languageCode: 'ar', languageTag: 'ar-EG' }]), 'ar',
  'an Arabic device selects Arabic');
equal(localeFromPreferredList(['de-DE', 'ar-EG']), null,
  'Arabic further down a list does not win over an unsupported first preference');
equal(localeFromPreferredList([]), null, 'an empty list decides nothing');
equal(localeFromPreferredList(null), null, 'an absent list decides nothing');
equal(preferredListFromAcceptLanguage('en;q=0.5,ar;q=0.9')[0], 'ar',
  'Accept-Language is ordered by quality, not by appearance');
equal(resolveEffectiveLocale({
  platformLocales: preferredListFromAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8'),
}).locale, 'fr', 'a French browser is served French');

// Switching language keeps the page. Being sent Home to change language is the
// behaviour this replaces.
equal(pathWithLocale('/en/services/plumbing', 'ar'), '/ar/services/plumbing',
  'switching language keeps the exact page');
equal(pathWithLocale('/en', 'fr'), '/fr', 'the home page stays the home page');
equal(pathWithLocale('/services', 'ar'), '/ar/services', 'an unprefixed path gains a locale');
equal(pathWithoutLocale('/ar/legal/privacy-policy'), '/legal/privacy-policy',
  'the locale segment is removable without touching the rest');
equal(pathWithoutLocale('/entry'), '/entry',
  'a path merely starting with the letters of a locale is not a locale segment');
equal(localeFromPath('/fr/help'), 'fr', 'a locale segment is read back');
equal(localeFromPath('/enquiries'), null, 'and only a whole segment counts');

// The cookie is the only carrier that crosses the three web origins.
equal(localeCookieDomain('app.usewarsha.com'), '.usewarsha.com',
  'the application shares the preference with its siblings');
equal(localeCookieDomain('admin.usewarsha.com'), '.usewarsha.com',
  'so does the console');
equal(localeCookieDomain('usewarsha.com'), '.usewarsha.com',
  'and so does the public site');
equal(localeCookieDomain('localhost'), null, 'localhost keeps a host-only cookie');
equal(localeCookieDomain('warsha-web-abc123.vercel.app'), null,
  'a preview deployment has no siblings to agree with');
equal(localeCookieDomain('usewarsha.com.attacker.example'), null,
  'a lookalike host is not the Warsha domain');
check(localeCookieValue('ar', 'app.usewarsha.com').includes('domain=.usewarsha.com'),
  'the cookie is scoped to the registrable domain on the real product');
check(localeCookieValue('ar', 'app.usewarsha.com').includes('samesite=lax'),
  'a preference cookie is lax, not a credential');
check(!localeCookieValue('ar', 'localhost').includes('domain='),
  'and host-only where there is nothing to share');
equal(localeFromCookieHeader('theme=dark; warsha-locale=fr; other=1'), 'fr',
  'the locale cookie is found among others');
equal(localeFromCookieHeader('warsha-locale=de'), null,
  'an unsupported cookie value is ignored rather than trusted');
equal(localeFromCookieHeader(null), null, 'no cookie decides nothing');

// The account preference, which existed and was read by nobody.
equal(accountLocalePrecedence({ localLocale: 'ar', localIsExplicit: true, accountLocale: 'en' }).locale, 'ar',
  'a choice made on this device wins over the account');
equal(accountLocalePrecedence({ localLocale: 'ar', localIsExplicit: true, accountLocale: 'en' }).pushToAccount, true,
  'and is carried up to the account so the next device agrees');
equal(accountLocalePrecedence({ localLocale: 'ar', localIsExplicit: true, accountLocale: 'ar' }).pushToAccount, false,
  'with no pointless write when they already agree');
equal(accountLocalePrecedence({ localLocale: 'en', localIsExplicit: false, accountLocale: 'ar' }).locale, 'ar',
  'a fresh device adopts the language the account already chose');
equal(accountLocalePrecedence({ localLocale: 'en', localIsExplicit: false, accountLocale: 'ar' }).pushToAccount, false,
  'and does not write back what it just read');
equal(accountLocalePrecedence({ localLocale: 'fr', localIsExplicit: false, accountLocale: null }).pushToAccount, true,
  'an account with no recorded language starts from what the device uses');
equal(accountLocalePrecedence({ localLocale: null, localIsExplicit: false, accountLocale: null }).locale, null,
  'and nothing known changes nothing');

// ---------------------------------------------------------------------------
// 2. Journeys: the exact sequences QA performed
// ---------------------------------------------------------------------------

/**
 * A device, as far as these rules are concerned: one key-value store plus one
 * cookie jar. Enough to play a whole navigation sequence without a browser.
 */
function makeDevice() {
  const store = new Map<string, string>();
  let cookie: string | null = null;
  return {
    store,
    /** What the language control does. */
    choose(locale: SupportedLocale) {
      store.set('warsha:language:v1', locale);
      store.set('warsha:language-explicit:v1', 'true');
      cookie = `warsha-locale=${locale}`;
    },
    /** What any page does when it renders, on any surface. */
    render(routeLocale?: string) {
      return resolveEffectiveLocale({
        storedLocale: store.get('warsha:language:v1'),
        storedExplicit: store.get('warsha:language-explicit:v1') === 'true',
        routeLocale,
        rememberedLocale: localeFromCookieHeader(cookie),
        platformLocales: ['en-US'],
      });
    },
    /** What the server sees, which is the cookie and nothing else. */
    serverRender() {
      const chosen = localeFromCookieHeader(cookie);
      return resolveEffectiveLocale({
        storedLocale: chosen,
        storedExplicit: Boolean(chosen),
        platformLocales: ['en-US'],
      });
    },
  };
}

// QA's Problem B, step for step.
{
  const device = makeDevice();
  equal(device.render().locale, 'en', 'a fresh English browser opens in English');
  device.choose('ar');
  equal(device.render().locale, 'ar', 'choosing Arabic changes the page being looked at');
  equal(device.render().locale, 'ar', 'navigating to another page stays Arabic');
  equal(device.render().locale, 'ar', 'returning to the first page is still Arabic');
  equal(device.serverRender().locale, 'ar', 'a refresh is served Arabic by the server');
  equal(device.serverRender().direction, 'rtl', 'and right to left with it');

  device.choose('en');
  equal(device.render().locale, 'en', 'switching back to English changes this page');
  equal(device.render().locale, 'en', 'and every other page, rather than one of them');
  equal(device.serverRender().locale, 'en', 'and survives a refresh');

  device.choose('fr');
  equal(device.render().locale, 'fr', 'French behaves identically');
  equal(device.render().direction, 'ltr', 'and is left to right');
  equal(device.serverRender().locale, 'fr', 'and is remembered');
}

// The public site is locale-addressed, and an explicit choice still governs it.
{
  const device = makeDevice();
  equal(device.render('ar').locale, 'ar',
    'a shared Arabic link opens in Arabic for somebody with no preference');
  device.choose('en');
  // The middleware redirects rather than rendering Arabic content at an English
  // address; the *decision* it makes is this one.
  equal(device.render('ar').locale, 'en',
    'somebody who chose English is not put back into Arabic by a link');
  equal(device.render('fr').locale, 'en',
    'nor by any other locale-addressed page');
}

// A second browser tab: the storage event carries the change, and both tabs
// resolve from the same inputs, so they cannot disagree.
{
  const device = makeDevice();
  device.choose('ar');
  const tabOne = device.render();
  const tabTwo = device.render();
  equal(tabOne.locale, tabTwo.locale, 'two tabs reading one store agree');
  equal(tabOne.direction, tabTwo.direction, 'including on direction');
}

// ---------------------------------------------------------------------------
// 3. Rules: drafts
// ---------------------------------------------------------------------------

const ALICE = 'account-a';
const BOB = 'account-b';

const requestDraft = {
  categoryId: 'plumbing',
  serviceId: 'plumbing-leak-repair',
  targetedProviderId: '',
  addressId: 'address-1',
  issue: 'The kitchen tap has been dripping for a week.',
  notes: 'The building gate code is on the intercom.',
  scheduleKind: 'scheduled',
  startAt: '2026-09-01T10:00',
  endAt: '',
  idempotencyKey: 'abcdefghijklmnopqrstuvwx',
};

// Round trip: everything QA listed comes back.
{
  const raw = encodeDraft({ flow: 'request_create', accountKey: ALICE, value: requestDraft });
  const result = decodeDraft<typeof requestDraft>({ raw, flow: 'request_create', accountKey: ALICE });
  check(result.restored, 'a request draft written by this account is restored');
  if (result.restored) {
    equal(result.value.categoryId, 'plumbing', 'the trade survives navigating away');
    equal(result.value.serviceId, 'plumbing-leak-repair', 'so does the specific service');
    equal(result.value.issue, requestDraft.issue, 'so does the description');
    equal(result.value.notes, requestDraft.notes, 'so do the notes');
    equal(result.value.addressId, 'address-1', 'so does the chosen address');
    equal(result.value.scheduleKind, 'scheduled', 'so does the scheduling choice');
    equal(result.value.startAt, '2026-09-01T10:00', 'so does the time');
    equal(result.value.idempotencyKey, requestDraft.idempotencyKey,
      'and the key, so resuming cannot open a second request');
  }
}

// Account isolation - QA scenario 19, and the one that must never regress.
{
  const raw = encodeDraft({ flow: 'request_create', accountKey: ALICE, value: requestDraft });
  const asBob = decodeDraft({ raw, flow: 'request_create', accountKey: BOB });
  check(!asBob.restored, "one account never sees another's draft");
  equal(asBob.restored ? '' : asBob.reason, 'other_account', 'and the refusal says why');
  const signedOut = decodeDraft({ raw, flow: 'request_create', accountKey: null });
  check(!signedOut.restored, 'and a signed-out visitor sees nothing either');
}
{
  // The inverse: a draft written signed out is not handed to whoever signs in.
  const raw = encodeDraft({ flow: 'address_editor', accountKey: null, value: { governorate: 'Cairo' } });
  check(!decodeDraft({ raw, flow: 'address_editor', accountKey: ALICE }).restored,
    'a signed-out draft is not adopted by the next account to sign in');
}

// Expiry, per flow, and generous enough that ordinary navigation never trips it.
{
  const now = Date.UTC(2026, 7, 26);
  const raw = encodeDraft({ flow: 'request_create', accountKey: ALICE, value: requestDraft, now });
  check(decodeDraft({ raw, flow: 'request_create', accountKey: ALICE, now: now + 60_000 }).restored,
    'a minute later the draft is still there');
  check(decodeDraft({ raw, flow: 'request_create', accountKey: ALICE, now: now + 6 * 24 * 3600_000 }).restored,
    'six days later it is still there');
  const stale = decodeDraft({ raw, flow: 'request_create', accountKey: ALICE, now: now + 8 * 24 * 3600_000 });
  check(!stale.restored, 'eight days later it has expired');
  equal(stale.restored ? '' : stale.reason, 'expired', 'and says so');
  check(draftLifetimeMs.request_create >= 24 * 3600_000,
    'no draft policy is aggressive enough for ordinary navigation to wipe work');
  check(draftLifetimeMs.discovery <= draftLifetimeMs.request_create,
    'browsing state is shorter-lived than authored work');
}

// The remaining refusals, each named rather than collapsed into "no draft".
{
  const raw = encodeDraft({ flow: 'request_create', accountKey: ALICE, value: requestDraft });
  const wrongFlow = decodeDraft({ raw, flow: 'address_editor', accountKey: ALICE });
  equal(wrongFlow.restored ? '' : wrongFlow.reason, 'wrong_flow',
    'a draft cannot be restored into a different flow');
  const corrupt = decodeDraft({ raw: '{not json', flow: 'request_create', accountKey: ALICE });
  equal(corrupt.restored ? '' : corrupt.reason, 'unreadable',
    'a corrupted entry is refused rather than thrown');
  const absent = decodeDraft({ raw: null, flow: 'request_create', accountKey: ALICE });
  equal(absent.restored ? '' : absent.reason, 'absent', 'nothing stored is not an error');
  const older = JSON.stringify({
    flow: 'request_create', schemaVersion: 0, accountKey: ALICE, savedAt: Date.now(), value: {},
  });
  equal(decodeDraft({ raw: older, flow: 'request_create', accountKey: ALICE }).restored, false,
    'a draft written by an older build is not restored into changed fields');
  const noAccount = JSON.stringify({
    flow: 'request_create', schemaVersion: draftSchemaVersions.request_create,
    savedAt: Date.now(), value: {},
  });
  equal(decodeDraft({ raw: noAccount, flow: 'request_create', accountKey: null }).restored, false,
    'an envelope with no account recorded is refused, not read as signed-out');
}

// Submitting ends the draft; arriving at the form does not.
equal(clearsAllFlows('signed_out'), true, 'signing out ends every draft on the device');
equal(clearsAllFlows('account_changed'), true, 'so does a different account signing in');
equal(clearsAllFlows('submitted'), false, 'submitting ends only the flow that was submitted');
equal(clearsAllFlows('discarded'), false, 'so does discarding');
equal(clearsAllFlows('started_new'), false, 'so does deliberately starting again');

// An untouched form leaves nothing behind.
check(!draftIsWorthKeeping({ a: '' }, { a: '' }), 'an untouched form is not worth storing');
check(draftIsWorthKeeping({ a: 'x' }, { a: '' }), 'one typed character is');
check(!draftIsWorthKeeping(null, null), 'and neither is nothing');

// Keys: one per flow, no account in the key, and a complete list for sign-out.
for (const flow of draftFlows) {
  check(isDraftFlow(flow), `${flow} is a declared flow`);
  check(draftStorageKey(flow).startsWith('warsha:draft:'), `${flow} is stored under the draft namespace`);
  check(!draftStorageKey(flow).includes(ALICE),
    `${flow} does not put an account identifier in a device key`);
}
equal(new Set(allDraftStorageKeys()).size, draftFlows.length, 'every flow has its own key');
equal(allDraftStorageKeys().length, Object.keys(draftSchemaVersions).length,
  'every flow declares a schema version');
equal(Object.keys(draftLifetimeMs).length, draftFlows.length, 'and a lifetime');

// ---------------------------------------------------------------------------
// 4. Rules: nothing sensitive is ever drafted
// ---------------------------------------------------------------------------

equal(forbiddenDraftFieldPath(requestDraft), null,
  'the request draft carries nothing that may not be stored in plaintext');
equal(forbiddenDraftFieldPath({
  governorate: 'Cairo', district: 'Maadi', addressLine: '12 Road 9',
  building: '3', floor: '2', apartment: '5', landmark: 'Opposite the pharmacy',
  serviceNotes: 'Ring twice', label: 'Home',
  coordinate: { latitude: 30.05, longitude: 31.24, source: 'device_location' },
}), null, 'nor does the address draft');
equal(forbiddenDraftFieldPath({
  baselineProfessionKeys: ['plumber'], baselineServiceIds: [],
  professionKeys: ['plumber'], serviceIds: ['plumbing-leak-repair'],
}), null, 'nor does the worker trade draft');
equal(forbiddenDraftFieldPath({ query: 'plumber' }), null, 'nor does browsing state');

equal(forbiddenDraftFieldPath({ password: 'hunter2' }), 'password',
  'a password may never be drafted');
equal(forbiddenDraftFieldPath({ form: { nested: { otp: '123456' } } }), 'form.nested.otp',
  'and nesting does not hide one');
equal(forbiddenDraftFieldPath([{ accessToken: 'x' }]), '0.accessToken',
  'nor does an array');
equal(forbiddenDraftFieldPath({ NationalID: '123' }), 'NationalID',
  'the check is case-insensitive, so a capitalised field is still refused');
for (const field of ['cardNumber', 'cvv', 'passportNumber', 'refreshToken', 'verificationCode']) {
  check(forbiddenDraftFieldPath({ [field]: 'x' }) === field, `${field} may never be drafted`);
}

// ---------------------------------------------------------------------------
// 5. Journeys: the request, address and worker drafts end to end
// ---------------------------------------------------------------------------

/** A device store plus the exact operations the two clients perform on it. */
function makeDraftDevice(accountKey: string | null) {
  const store = new Map<string, string>();
  let account = accountKey;
  return {
    signIn(next: string | null) {
      // What both clients do on an identity change: erase, then adopt.
      if (next !== account) for (const key of allDraftStorageKeys()) store.delete(key);
      account = next;
    },
    write<T>(flow: DraftFlow, value: T) {
      store.set(draftStorageKey(flow), encodeDraft({ flow, accountKey: account, value }));
    },
    /** Unmounting the page and mounting it again is exactly a read. */
    read<T>(flow: DraftFlow) {
      return decodeDraft<T>({ raw: store.get(draftStorageKey(flow)) ?? null, flow, accountKey: account });
    },
    clear(flow: DraftFlow) { store.delete(draftStorageKey(flow)); },
    /** Deliberately *not* clearing: a hard sign-out that never ran its cleanup. */
    forceAccount(next: string | null) { account = next; },
  };
}

// QA's Problem A, for the request form.
{
  const device = makeDraftDevice(ALICE);
  device.write('request_create', requestDraft);
  const returned = device.read<typeof requestDraft>('request_create');
  check(returned.restored, 'navigating away and back keeps the request');
  if (returned.restored) {
    equal(returned.value.issue, requestDraft.issue, 'including everything typed into it');
  }
  device.clear('request_create'); // submitted
  check(!device.read('request_create').restored,
    'a successfully sent request does not come back as a draft');
}

// Address: entered, navigated away from, returned to, then saved.
{
  const device = makeDraftDevice(ALICE);
  const address = {
    fields: { label: 'Home', addressLine: '12 Road 9', governorate: 'Cairo', district: 'Maadi',
      building: '3', floor: '2', apartment: '5', landmark: '', serviceNotes: '' },
    coordinate: { latitude: 30.05, longitude: 31.24, source: 'device_location' },
    coordinateChanged: true,
    locationStatus: 'resolved',
  };
  device.write('address_editor', address);
  const back = device.read<typeof address>('address_editor');
  check(back.restored, 'a half-entered address survives a trip to another page');
  if (back.restored) {
    equal(back.value.fields.governorate, 'Cairo', 'including the governorate');
    equal(back.value.coordinate.latitude, 30.05, 'and the confirmed pin');
    equal(back.value.locationStatus, 'resolved',
      'and a settled status rather than a spinner nothing will finish');
  }
  device.clear('address_editor');
  check(!device.read('address_editor').restored, 'saving it ends the draft');
}

// Account switching, both the tidy path and the one where cleanup never ran.
{
  const device = makeDraftDevice(ALICE);
  device.write('request_create', requestDraft);
  device.write('address_editor', { fields: { label: 'Home' } });
  device.signIn(BOB);
  check(!device.read('request_create').restored, 'B does not inherit A\'s request');
  check(!device.read('address_editor').restored, 'nor A\'s address');

  const crashed = makeDraftDevice(ALICE);
  crashed.write('request_create', requestDraft);
  crashed.forceAccount(BOB); // sign-out cleanup never ran
  check(!crashed.read('request_create').restored,
    'and the envelope refuses it even when the cleanup never ran');
}

// The worker trade delta only applies to the server state it was made against.
{
  const server = { professionKeys: ['plumber'], serviceIds: ['plumbing-leak-repair'] };
  const stored = {
    baselineProfessionKeys: ['plumber'],
    baselineServiceIds: ['plumbing-leak-repair'],
    professionKeys: ['plumber', 'electrician'],
    serviceIds: ['plumbing-leak-repair', 'electrical-socket-install'],
  };
  const sameSet = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && [...left].sort().join('|') === [...right].sort().join('|');
  check(sameSet(stored.baselineProfessionKeys, server.professionKeys)
    && sameSet(stored.baselineServiceIds, server.serviceIds),
    'an unsaved trade selection is re-applied when the server has not moved');
  const moved = { professionKeys: ['carpenter'], serviceIds: [] };
  check(!sameSet(stored.baselineProfessionKeys, moved.professionKeys),
    'and abandoned when the trades were changed somewhere else');
}

// ---------------------------------------------------------------------------
// 6. Wiring: web
// ---------------------------------------------------------------------------

const webPreferencesContext = read('web/lib/preferences-context.tsx');
check(/export function useAppLocale\(\): Locale \{\s*return useWarshaPreferences\(\)\.locale;/.test(webPreferencesContext),
  'the language is a context read, not per-component state');
check(/initialLocale/.test(webPreferencesContext),
  'the first render uses a locale decided before rendering');
check(/localeCookieValue/.test(webPreferencesContext),
  'choosing a language writes the cross-origin cookie through the shared builder');
check(/addEventListener\('storage'/.test(webPreferencesContext),
  'a second tab is told when the preference changes');

const webUseAppLocale = stripComments(read('web/lib/use-app-locale.ts'));
check(!/useState/.test(webUseAppLocale),
  'THE OLD PER-PAGE LANGUAGE STATE IS GONE; useAppLocale HOLDS NO STATE');
check(!/localStorage/.test(webUseAppLocale),
  'and it no longer reads storage after mount');

const serverLocale = read('web/lib/server-locale.ts');
check(/cookies\(\)/.test(serverLocale) && /accept-language/.test(serverLocale),
  'the server decides the language from the cookie and the browser preference');
check(/resolveEffectiveLocale/.test(serverLocale),
  'using the one shared rule rather than a second copy of it');

for (const [path, name] of [
  ['web/app/app/layout.tsx', 'the application'],
  ['web/app/admin/layout.tsx', 'the console'],
  ['web/app/[locale]/layout.tsx', 'the public site'],
] as const) {
  const layout = read(path);
  check(/WarshaPreferencesProvider/.test(layout), `${name} mounts the one preference store`);
  check(/<html lang=\{(locale|typed)\} dir=\{directionOf\((locale|typed)\)\}/.test(layout),
    `${name} renders language and direction together, from one value`);
}
for (const path of ['web/app/app/layout.tsx', 'web/app/admin/layout.tsx'] as const) {
  const layout = stripComments(read(path));
  check(/await serverLocale\(\)/.test(layout),
    `${path} decides its language on the server, so no page paints English first`);
  check(!/warsha:language:v1/.test(layout),
    `${path} no longer patches the document language from an inline script`);
}

const middleware = read('web/middleware.ts');
check(/addressed\[1\] !== chosen/.test(middleware),
  'an explicit language choice outranks a locale-addressed URL');
check(/pathWithoutLocale\(pathname\)/.test(middleware),
  'and the redirect keeps the page rather than sending anybody Home');
check(/307/.test(middleware),
  'the language redirect is temporary, because it depends on who is asking');

const preferenceControls = stripComments(read('web/components/preference-controls.tsx'));
check(/useWarshaPreferences/.test(preferenceControls),
  'the controls write through the store rather than to storage directly');
check(!/localStorage\.setItem/.test(preferenceControls),
  'THERE IS ONE WRITER FOR A PREFERENCE; THE CONTROL IS NOT IT');
check(/pathWithoutLocale/.test(preferenceControls),
  'switching language on the public site keeps the current page');

const languageSync = read('web/components/language-account-sync.tsx');
check(/preferred_language/.test(languageSync),
  'the web consumes the account language column that already existed');
check(/accountLocalePrecedence/.test(languageSync),
  'through the same precedence the mobile client applies');

const draftStore = read('web/lib/draft-store.ts');
check(/useLayoutEffect/.test(draftStore),
  'a restored draft is applied before the browser paints, so no empty form is seen');
check(/session\?\.user\.id \?\? null/.test(draftStore),
  'a draft is scoped to the account reading it');
check(/decodeDraft/.test(draftStore) && /encodeDraft/.test(draftStore),
  'and goes through the shared envelope rather than a second format');

const authActions = read('web/lib/auth-actions.ts');
check(/clearAllDrafts\(\);\s*await supabase\(\)\.auth\.signOut\(\)/.test(authActions),
  'signing out erases drafts before the session goes, not after');

const sessionProvider = read('web/components/session-provider.tsx');
check(/clearAllDrafts\(\)/.test(sessionProvider),
  'a change of identity erases drafts as well');

// Internal navigation must be client-side. A plain anchor tears the whole
// application down and rebuilds it, which is the "it reloaded" complaint.
const AUTH_BOUNDARY_ANCHORS = new Set([
  'web/app/app/create-account/page.tsx',
  'web/app/app/sign-in/page.tsx',
  'web/app/app/resend-confirmation/page.tsx',
  'web/components/auth-panel.tsx',
]);
const PRODUCT_PAGES = [
  'web/app/app/page.tsx',
  'web/app/app/requests/page.tsx',
  'web/app/app/requests/new/page.tsx',
  'web/app/app/addresses/page.tsx',
  'web/app/app/discover/page.tsx',
  'web/app/app/jobs/page.tsx',
  'web/app/app/account/page.tsx',
  'web/app/app/notifications/page.tsx',
  'web/app/app/worker/page.tsx',
  'web/app/app/worker/profile/page.tsx',
  'web/app/app/worker/onboarding/page.tsx',
];
for (const path of PRODUCT_PAGES) {
  const source = read(path);
  const internalAnchors = [...source.matchAll(/<a\s[^>]*href=\{?["'`]\/[^>]*>/g)]
    .filter((match) => !match[0].includes('https://') && !match[0].includes('appHref'));
  equal(internalAnchors.length, 0,
    `${path} navigates with Link, not with a full document load`);
  check(!AUTH_BOUNDARY_ANCHORS.has(path), `${path} is a product page, not an auth boundary`);
}

const newRequest = read('web/app/app/requests/new/page.tsx');
check(/useDraft<RequestDraft>\(\s*'request_create'/.test(newRequest),
  'the request form keeps its work in the draft store');
check(/clearDraft\('submitted'\)/.test(newRequest),
  'a sent request clears its draft');
check(/clearDraft\('discarded'\)/.test(newRequest),
  'and Cancel is the explicit discard');
check(/idempotencyKey/.test(newRequest) && /draft\.idempotencyKey/.test(newRequest),
  'the idempotency key travels with the draft, so resuming cannot open a second request');
check(/useDataChange\('addresses'/.test(newRequest),
  'an address saved elsewhere reaches the picker without a manual reload');

const addresses = read('web/app/app/addresses/page.tsx');
check(/useDraft<AddressEditorDraft \| null>\(\s*'address_editor'/.test(addresses),
  'a new address is drafted');
check(/announceDataChange\('addresses'\)/.test(addresses),
  'and saving one tells every surface that reads addresses');
check(/editorId === 'new'/.test(addresses),
  'while editing an existing address is deliberately not drafted');

const discover = read('web/app/app/discover/page.tsx');
check(/useDraft<\{ query: string \}>\(\s*'discovery'/.test(discover),
  'what was typed into Find help survives leaving the page');

const workerEditor = read('web/components/worker-profile-editor.tsx');
check(/useDraft<TradeDraft \| null>\(\s*'worker_trade'/.test(workerEditor),
  'unsaved trade choices survive navigation');
check(/baselineProfessionKeys/.test(workerEditor),
  'against the server state they were made against');
check(/withTradeSelection/.test(workerEditor),
  'AND A DESELECTED PROFESSION STILL TAKES ITS SERVICES WITH IT');
check(/clearTradeDraft\('submitted'\)/.test(workerEditor),
  'and saving ends the unsaved copy');

const dataEvents = stripComments(read('web/lib/data-events.ts'));
check(!/localStorage\.setItem\(STORAGE_KEY, JSON/.test(dataEvents),
  'the invalidation channel carries a signal, never a copy of server data');

// ---------------------------------------------------------------------------
// 7. Wiring: native
// ---------------------------------------------------------------------------

const rootLayout = read('app/_layout.tsx');
check(/<DraftProvider>/.test(rootLayout), 'native mounts the draft store');
// Textual order is not tree order — `ThemedRoot` is declared above
// `RootLayout` in the file — so the containment is what gets asserted:
// `ThemedRoot` owns the `Stack`, and `DraftProvider` must enclose it.
const draftOpen = rootLayout.indexOf('<DraftProvider>');
const draftClose = rootLayout.indexOf('</DraftProvider>');
const themedRoot = rootLayout.indexOf('<ThemedRoot />');
check(/<Stack /.test(rootLayout), 'the navigator is where it always was');
check(draftOpen > -1 && draftClose > draftOpen && themedRoot > draftOpen && themedRoot < draftClose,
  'ABOVE THE NAVIGATOR, so a popped screen cannot take the work with it');
check(/<LanguageAccountSync \/>/.test(rootLayout),
  'and the account language reaches the device');
check(rootLayout.indexOf('<LocalizationProvider>') < rootLayout.indexOf('<AuthProvider>'),
  'localization stays above authentication, so the first frame has a language');

const draftContext = read('src/drafts/draft-context.tsx');
check(/clearAllDrafts\(\)/.test(draftContext), 'an account transition erases every draft');
check(/readDraft/.test(draftContext) && /writeDraft/.test(draftContext),
  'through the shared storage adapter');

const nativeRequest = read('app/marketplace-request/new.tsx');
check(/useDraftState\('request_create'/.test(nativeRequest),
  'the native request screen keeps its work above the navigator');
check(/resetDraft\('submitted'\)/.test(nativeRequest),
  'and clears it when the request is created');

const nativeAddress = read('app/onboarding/address.tsx');
check(/useDraftState\('address_editor'/.test(nativeAddress),
  'the native address form is drafted');
check(/resetForm\('submitted'\)/.test(nativeAddress),
  'and cleared once the address is confirmed');

const nativeWorker = read('app/onboarding/worker.tsx');
check(/useDraftState<\{/.test(nativeWorker) && /'worker_trade'/.test(nativeWorker),
  'native worker onboarding drafts its trade selection');
check(/options\.length === 0/.test(nativeWorker),
  'and waits for the catalogue, so a restore cannot silently drop every service');
check(/resetTradeDraft\('discarded'\)/.test(nativeWorker),
  'abandoning it when the account changed trades elsewhere');

const localization = read('src/i18n/localization.tsx');
check(/accountLocalePrecedence/.test(localization),
  'native reconciles the account language through the shared rule');
check(/languageRepository\.set\(next\)/.test(localization),
  'and a language chosen on the device is carried up to the account');

const profileScreen = read('app/(tabs)/profile.tsx');
check(/preferredLanguage: language/.test(profileScreen),
  'saving a profile writes the language in effect, not a copy loaded at mount');

// Parity: both platforms use the same flows, keys and lifecycle vocabulary.
const contract = read('src/drafts/draft-contract.ts');
for (const flow of draftFlows) {
  check(contract.includes(`'${flow}'`), `${flow} is declared in the shared contract`);
}
check(read('src/drafts/draft-storage.ts').includes('expo-sqlite/kv-store'),
  'native persists drafts in the same store as its other preferences');
check(read('src/drafts/draft-storage.web.ts').includes('localStorage'),
  'and the web build uses localStorage, which is the only synchronous option there');

// The shared authority must stay runnable without a bundler or a device.
for (const path of ['src/preferences/preference-authority.ts', 'src/drafts/draft-contract.ts']) {
  const source = stripComments(read(path));
  check(!/^import /m.test(source), `${path} stays import-free so these rules run in Node`);
}

console.log(`state persistence: ${checks} checks passed`);
