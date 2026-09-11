/**
 * What the public shell does in a browser: the header's two account actions at
 * real widths, and the page a wrong address lands on.
 *
 * Both are things source cannot answer, and both were wrong at the same time.
 *
 * Source could not have caught the defect this exists for. The sign-in link was
 * in `site-chrome.tsx` the whole time, correctly localised and pointing at the
 * right origin; `site-chrome.module.css` gave it `display: none` and revealed it
 * at 720px. So every grep for the markup found it, every route test passed, and
 * on a phone the public site offered exactly one thing a visitor could do: make
 * an account. A returning customer's only visible control was the hamburger,
 * and the hamburger holds Services and Work with Warsha.
 *
 * Hence: rendered, not read. Every check below is a box measured on a page.
 *
 * What is asserted, and why each one:
 *
 *   visible without opening anything   the defect itself. A control inside the
 *                                      menu is not a path to sign in; the menu
 *                                      is where this one was NOT.
 *   correct destination                a visible control that goes to the wrong
 *                                      place is the same dead end.
 *   hierarchy preserved                create account stays filled, sign in
 *                                      stays unfilled. The fix must not be
 *                                      undone by making them equal, and it must
 *                                      not be overdone by making sign in louder
 *                                      than the primary action.
 *   nothing overlaps, nothing overflows  the reason it was hidden was width,
 *                                      and width is the thing most likely to
 *                                      break when a label is retranslated.
 *   reading order                      Arabic mirrors, so sign in sits to the
 *                                      RIGHT of create account there. Asserted
 *                                      as order rather than as pixels.
 *
 * Deliberately NOT asserted: which layout the header uses to fit. It is one row
 * at most widths and two below 360px, and that is a decision `site-chrome.
 * module.css` is allowed to revisit. What may not be revisited is that both
 * actions are on the page, whole, and reachable.
 *
 * Usage:
 *   node scripts/web-public-chrome.mjs
 *   BASE_URL=https://usewarsha.com node scripts/web-public-chrome.mjs
 */
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let checks = 0;
const ok = (value, message) => { checks += 1; assert.ok(value, message); };

const LOCALES = ['en', 'ar', 'fr'];

/*
 * 320 is the floor Warsha supports and the width where four header items stop
 * fitting on one line in French. 360, 390 and 411 are where real phones are.
 * 768 and 1440 are the other side of both breakpoints, so a change that fixes a
 * phone by breaking a desktop fails here too.
 */
const WIDTHS = [320, 360, 375, 390, 411, 768, 1440];

/** The sm control height. A visible-but-tiny action is not a fixed defect. */
const MIN_TARGET = 36;

/** Two boxes touch. */
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;

const playwright = await import('playwright');
const browser = await playwright.chromium.launch();

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(250);

    const at = `${locale} @ ${width}px`;
    const header = page.locator('header').first();

    /*
     * Found by destination, not by class name or position. A gate that looked
     * for `.signIn` would have gone green on a header that renders the element
     * and hides it, which is precisely what happened.
     */
    const signIn = header.locator('a[href$="/sign-in"]').first();
    const cta = header.locator('a[href$="/create-account"]').first();

    ok(await signIn.isVisible(), `${at}: a sign-in control is visible in the header`);
    ok(await cta.isVisible(), `${at}: and so is create account`);

    const signInHref = await signIn.getAttribute('href');
    const ctaHref = await cta.getAttribute('href');
    ok(/^https:\/\/app\.usewarsha\.com\/sign-in$/.test(signInHref ?? ''),
      `${at}: sign in goes to the application's sign-in, not a marketing page — got ${signInHref}`);
    ok(/^https:\/\/app\.usewarsha\.com\/create-account$/.test(ctaHref ?? ''),
      `${at}: create account goes to the application — got ${ctaHref}`);

    // It has a real label, in this page's language, rather than an icon a
    // returning visitor has to interpret.
    const label = (await signIn.innerText()).trim();
    ok(label.length >= 4, `${at}: the sign-in control is labelled with words — got ${JSON.stringify(label)}`);

    /*
     * Reachable with nothing opened. `isVisible` is true for an element inside a
     * closed disclosure in some markup patterns, so this asserts the menu is
     * genuinely shut at the moment the control was found.
     */
    const menuOpen = await header.locator('button[aria-expanded="true"]').count();
    ok(menuOpen === 0, `${at}: the menu is closed, so sign in was found on the header itself`);

    const boxes = {};
    for (const [name, locator] of [
      ['brand', header.locator('a[aria-label]').first()],
      ['menu', header.locator('button[aria-controls]').first()],
      ['signIn', signIn],
      ['cta', cta],
    ]) {
      boxes[name] = (await locator.count()) ? await locator.boundingBox() : null;
    }

    for (const name of ['signIn', 'cta']) {
      const box = boxes[name];
      ok(box, `${at}: ${name} has a box`);
      ok(box.height >= MIN_TARGET - 0.5,
        `${at}: ${name} is ${box.height}px tall, below the ${MIN_TARGET}px control height`);
      ok(box.x >= -0.5 && box.x + box.width <= width + 0.5,
        `${at}: ${name} sits inside the viewport — x=${box.x} right=${box.x + box.width}`);
    }

    // Nothing sits on top of anything else. Four controls in a row that has just
    // been asked to hold a fifth thing is exactly where this goes wrong.
    const present = Object.entries(boxes).filter(([, box]) => box);
    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        ok(!overlaps(present[i][1], present[j][1]),
          `${at}: ${present[i][0]} and ${present[j][0]} do not overlap`);
      }
    }

    // And the page itself does not gain a sideways scrollbar because of it.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(scrollWidth <= width + 1,
      `${at}: the page does not scroll sideways — scrollWidth ${scrollWidth} against ${width}`);

    /*
     * A header that fits by growing instead of by deciding is not fixed. Two
     * rows below 360px is deliberate and costs about 100px; anything past that
     * is a header eating a phone screen.
     */
    const headerHeight = (await header.boundingBox()).height;
    ok(headerHeight <= 120,
      `${at}: the header is ${headerHeight}px tall, which is more than a stacked row should cost`);

    /*
     * Hierarchy, as computed style rather than as intent: the call to action is
     * filled and the sign-in is not. This is the assertion that stops the fix
     * being undone in either direction — two filled buttons, or a sign-in so
     * quiet it is invisible again.
     */
    const fills = await page.evaluate(() => {
      const head = document.querySelector('header');
      const a = head.querySelector('a[href$="/sign-in"]');
      const b = head.querySelector('a[href$="/create-account"]');
      const transparent = (value) => value === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(value);
      return {
        signInFilled: !transparent(getComputedStyle(a).backgroundColor),
        ctaFilled: !transparent(getComputedStyle(b).backgroundColor),
        signInWeight: getComputedStyle(a).fontWeight,
        ctaWeight: getComputedStyle(b).fontWeight,
      };
    });
    ok(fills.ctaFilled, `${at}: create account is a filled button — it is the primary action`);
    ok(!fills.signInFilled, `${at}: sign in is not filled, so the two do not compete`);
    ok(Number(fills.signInWeight) <= Number(fills.ctaWeight),
      `${at}: sign in is not set heavier than the action it sits beside`);

    /*
     * Reading order, which is the half that RTL silently gets wrong: the quiet
     * action comes first and the call to action last, in the direction the page
     * is read. In Arabic that means sign in is further RIGHT.
     */
    const rtl = await page.evaluate(() => document.documentElement.dir === 'rtl');
    if (rtl) {
      ok(boxes.signIn.x > boxes.cta.x,
        `${at}: Arabic reads right to left, so sign in sits to the right of create account`);
    } else {
      ok(boxes.signIn.x < boxes.cta.x,
        `${at}: sign in comes before create account`);
    }

    await context.close();
  }
  console.log(`  ${locale}: header carries both account actions at ${WIDTHS.join(', ')}px`);
}

/*
 * --- A wrong address is still a Warsha address ------------------------------
 *
 * The second half of the public shell, and the one that has broken twice.
 *
 * First there was no `[locale]/not-found.tsx` at all, so an Arabic reader
 * following a stale link got Next's built-in page: English, left to right, no
 * Warsha on it and no way back. Then the fix for that read a request header to
 * find out which language to apologise in -- and a dynamic API in a not-found
 * boundary opts every page beneath it out of static generation. 114 public
 * pages stopped being prerendered and nothing failed.
 *
 * The locale now reaches the boundary through `lib/request-locale.ts`, inside
 * the request, from the layout that has it. That handoff is invisible: remove
 * the one line in the layout that performs it and every 404 in every language
 * quietly becomes an English one. Which is what this asserts.
 */
const DEAD_END = {
  en: { dir: 'ltr', says: /does not exist/i },
  ar: { dir: 'rtl', says: /[\u0600-\u06FF]/ },
  fr: { dir: 'ltr', says: /n.existe pas/i },
};

for (const [locale, expected] of Object.entries(DEAD_END)) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  const response = await page.goto(`${BASE}/${locale}/no-such-page-exists-here`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });

  // A soft 404 that answers 200 is worse than the page being wrong: a search
  // engine indexes the dead address.
  ok(response.status() === 404,
    `/${locale}: a wrong address answers 404, not ${response.status()}`);

  const seen = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    ways: [...document.querySelectorAll('main a')].map((a) => a.getAttribute('href')),
  }));

  ok(seen.lang === locale,
    `/${locale}: the 404 page declares ${locale}, not ${JSON.stringify(seen.lang)} -- `
    + 'the locale is not reaching the not-found boundary');
  ok(seen.dir === expected.dir,
    `/${locale}: the 404 page reads ${expected.dir}, not ${JSON.stringify(seen.dir)}`);
  ok(expected.says.test(seen.heading),
    `/${locale}: the 404 heading is written in ${locale}`);
  ok(seen.ways.some((href) => href === `/${locale}`),
    `/${locale}: there is a way home, in the same language -- got ${JSON.stringify(seen.ways)}`);

  console.log(`  ${locale}: a wrong address answers 404 in ${locale} (${seen.dir})`);
  await context.close();
}

await browser.close();
console.log(`\nWeb public chrome: ${checks} checks passed against ${BASE}.`);
