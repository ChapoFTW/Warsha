/**
 * The language control, exercised rather than assumed.
 *
 * A page that renders Arabic correctly is not evidence that language switching
 * works, and that distinction is the whole reason this file exists: every
 * direct load of `/en`, `/ar` and `/fr` can be perfect while the control that
 * moves between them is broken, and only the transitions tell them apart.
 *
 * So this drives the real control in a real browser and asserts, for all six
 * transitions:
 *
 *   the control is where it is meant to be
 *   choosing a language changes the rendered copy
 *   `<html lang>` matches
 *   `<html dir>` matches — rtl for Arabic, ltr for the other two
 *   a sentence only that language has is on the page
 *   a reload keeps the choice
 *
 * Usage:
 *   node scripts/web-language-switch.mjs                 (localhost:3000)
 *   BASE_URL=https://usewarsha.com node scripts/web-language-switch.mjs
 */
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let checks = 0;
const ok = (value, message) => { checks += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { checks += 1; assert.equal(actual, expected, message); };

/*
 * A sentence each language has and the others do not.
 *
 * Taken from the hero, which every one of these pages renders. Matching the
 * whole sentence rather than a word means a page that is half-translated — the
 * shell in one language and the body in another — fails here rather than
 * passing because the two words checked happened to agree.
 */
const CANONICAL = {
  en: 'Get it fixed, at a price you agreed first.',
  ar: 'صلّح اللي محتاج تصليح، بسعر اتفقت عليه الأول.',
  fr: "Faites réparer, au prix convenu d'abord.",
};
const DIRECTION = { en: 'ltr', ar: 'rtl', fr: 'ltr' };
const LOCALES = ['en', 'ar', 'fr'];

const { chromium } = await import('playwright');
const browser = await chromium.launch();

const read = async (page) => ({
  url: page.url(),
  lang: await page.evaluate(() => document.documentElement.lang),
  dir: await page.evaluate(() => document.documentElement.dir),
  body: await page.evaluate(() => document.body.innerText),
});

/** Choose a language through the control a person would use. */
async function chooseLanguage(page, target) {
  /*
   * The LANGUAGE trigger, found by the fact that its own label is a language
   * name. There is an appearance menu beside it with identical markup, and
   * taking "the last menu button" opens that one instead — which looks exactly
   * like the language menu refusing to open.
   */
  const trigger = page.locator('button[aria-haspopup="menu"]')
    .filter({ hasText: /English|العربية|Français/ }).first();
  ok(await trigger.isVisible(), `${target}: the language control is on the page`);

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ timeout: 15_000 });
  await page.waitForTimeout(400);

  const item = page.locator(`[role="menuitemradio"][lang="${target}"]`).first();
  ok(await item.isVisible(), `${target}: the menu opens and offers it`);

  await item.click({ timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

for (const from of LOCALES) {
  for (const to of LOCALES) {
    if (from === to) continue;

    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message.slice(0, 120)));

    // Start in `from`, through the control, so the starting point is itself a
    // switch rather than a direct load.
    await page.goto(`${BASE}/${from}`, { waitUntil: 'networkidle', timeout: 45_000 });
    const start = await read(page);
    equal(start.lang, from, `starting on /${from}: lang is ${from}`);

    await chooseLanguage(page, to);
    const after = await read(page);

    equal(after.lang, to, `${from} -> ${to}: <html lang> becomes ${to}`);
    equal(after.dir, DIRECTION[to], `${from} -> ${to}: <html dir> becomes ${DIRECTION[to]}`);
    ok(after.body.includes(CANONICAL[to]),
      `${from} -> ${to}: the page says what only ${to} says`);
    ok(!after.body.includes(CANONICAL[from]),
      `${from} -> ${to}: and no longer says what ${from} said — not a half-translated page`);

    // The choice has to survive a reload, or it was never a choice.
    await page.reload({ waitUntil: 'networkidle', timeout: 40_000 });
    const reloaded = await read(page);
    equal(reloaded.lang, to, `${from} -> ${to}: a reload keeps ${to}`);
    equal(reloaded.dir, DIRECTION[to], `${from} -> ${to}: and keeps its direction`);

    equal(failures.length, 0,
      `${from} -> ${to}: no page errors — ${failures.slice(0, 2).join(' | ')}`);
    console.log(`  ${from} -> ${to}  ok   (${after.dir}, reload kept)`);
    await context.close();
  }
}

/*
 * An explicit locale URL outranks whatever was stored before.
 *
 * This is the escape hatch, and it exists because the switcher alone was not
 * one. Until 2026-09-10 a stored choice overruled the address, so a visitor
 * whose cookie said Arabic could not reach a single English page on the site —
 * every /en link redirected to /ar. The only way out was a control whose
 * correctness depended on `document.cookie` being written before an anchor
 * navigated, which on iOS WebKit is not reliable. Two iPhones, Safari and Edge.
 *
 * Every stale value against every address, because the trap is symmetrical: an
 * English cookie hid the Arabic site just as thoroughly.
 */
for (const stale of LOCALES) {
  for (const asked of LOCALES) {
    if (stale === asked) continue;
    const context = await browser.newContext({ locale: 'ar-EG' });
    const url = new URL(BASE);
    await context.addCookies([{
      name: 'warsha-locale',
      value: stale,
      domain: url.hostname === 'localhost' ? 'localhost' : `.${url.hostname.replace(/^www\./, '')}`,
      path: '/',
    }]);
    const page = await context.newPage();
    await page.goto(`${BASE}/${asked}`, { waitUntil: 'networkidle', timeout: 45_000 });
    const got = await read(page);

    equal(got.lang, asked,
      `a stored ${stale} must not stop /${asked} being ${asked} — an address is explicit`);
    equal(got.dir, DIRECTION[asked], `/${asked} with a stored ${stale}: direction follows the address`);
    ok(got.body.includes(CANONICAL[asked]),
      `/${asked} with a stored ${stale}: the page says what only ${asked} says`);

    // And the stored preference is brought into line, from the server, so it
    // does not depend on a client write that iOS may not have committed.
    const after = (await context.cookies())
      .filter((c) => c.name === 'warsha-locale').map((c) => c.value);
    ok(after.includes(asked),
      `/${asked} with a stored ${stale}: the stored preference is synchronised to ${asked}`);
    console.log(`  stored ${stale}, asked /${asked}  ok   (${got.dir}, stored now ${after.join(',')})`);
    await context.close();
  }
}

/*
 * Direction is the half that silently survives a bad switch: a page can carry
 * the right words and the previous language's layout. Asserted on its own so a
 * failure names direction rather than hiding inside a copy check.
 */
{
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: 'networkidle', timeout: 45_000 });
  equal((await read(page)).dir, 'rtl', 'Arabic is right to left');
  await chooseLanguage(page, 'en');
  equal((await read(page)).dir, 'ltr', 'leaving Arabic restores left to right');
  await chooseLanguage(page, 'ar');
  equal((await read(page)).dir, 'rtl', 'returning to Arabic restores right to left');
  await context.close();
}

await browser.close();
console.log(`\nWeb language switch: ${checks} checks passed against ${BASE}.`);
