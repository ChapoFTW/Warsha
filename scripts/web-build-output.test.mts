/**
 * What the Next.js build actually emitted.
 *
 * ## Why this is its own file
 *
 * These assertions used to live at the bottom of
 * `web-bilingual-appearance.test.mts` behind `if (existsSync(BUILT))`, with an
 * `else` branch that printed a note and moved on. The suite therefore had two
 * different coverages depending on whether somebody had run `web:build` in that
 * working copy — twenty-four checks after a build, zero before it — and both
 * outcomes reported success. `npm run test:all` on a clean checkout silently
 * skipped every one of them, which is the worst shape a test can have: it is
 * green, it is quoted as evidence, and it verified nothing.
 *
 * A conditional skip is the right answer when a prerequisite is optional. This
 * one is not optional; it is *deferred*. `web/.next` is a build artifact of a
 * step that already exists, is already required before a web deploy, and is
 * already in the release validation plan immediately before this. So the fix is
 * not to make the assertions conditional or to make `test:all` build the web —
 * a two-minute Next.js compile does not belong in a deterministic unit suite —
 * but to move them behind the authority that produces the thing, and to FAIL
 * LOUDLY when the artifact is missing rather than passing quietly.
 *
 * `test:all` is now self-contained and deterministic from a clean checkout.
 * This runs after `web:build`, and says exactly what to run if it did not.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PAGE_SLUGS } from '../web/lib/pages-copy.ts';

const BUILT = 'web/.next/server/app';

if (!existsSync(BUILT)) {
  console.error(
    `Missing ${BUILT}.\n\n`
    + 'This test reads the compiled Next.js output, so the build has to have\n'
    + 'happened. Run `npm run web:build` and then this again.\n\n'
    + 'It is deliberately a failure rather than a skip: these checks were\n'
    + 'skipped silently for as long as they lived inside test:web-bilingual,\n'
    + 'and a skipped check reads exactly like a passing one.',
  );
  process.exit(1);
}

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const built = (path: string) => readFileSync(join(BUILT, path), 'utf8');

// --- Each language is a real, separately rendered document ------------------
const en = built('en.html');
const ar = built('ar.html');
const fr = built('fr.html');
check(/<html lang="en" dir="ltr"/.test(en), 'the built English page declares ltr');
check(/<html lang="ar" dir="rtl"/.test(ar), 'THE BUILT ARABIC PAGE DECLARES RTL');
check(/<html lang="fr" dir="ltr"/.test(fr), 'the built French page declares ltr');
check(/[؀-ۿ]/.test(ar), 'the built Arabic page contains Arabic text');
check(!/Get it fixed, at a price you agreed first/.test(ar),
  'NO ENGLISH MARKETING COPY LEAKS INTO THE ARABIC PAGE');
check(/hrefLang="ar"/i.test(en) && /hrefLang="en"/i.test(ar),
  'each language advertises the other, and both routes exist');

// --- Every public route exists in every language ----------------------------
for (const locale of ['en', 'ar', 'fr']) {
  check(existsSync(join(BUILT, locale, 'legal', 'privacy-policy.html')),
    `the ${locale} legal reader is generated`);
  for (const slug of PAGE_SLUGS) {
    check(existsSync(join(BUILT, locale, `${slug}.html`)),
      `/${locale}/${slug} is generated`);
  }
}

const arLegal = built('ar/legal/privacy-policy.html');
check(/<html lang="ar" dir="rtl"/.test(arLegal),
  'the Arabic legal document is right-to-left');

console.log(`Web build output: ${checks} checks passed.`);
