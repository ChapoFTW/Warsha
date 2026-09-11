import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { legalCorpus, hashesFor } from '../src/legal/legal-corpus.ts';
import { acceptanceRequiredFor } from '../src/legal/legal-corpus.ts';
import { lightColors, darkColors } from '../constants/appearance.ts';
import { copy } from '../web/lib/copy.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

function readWeb(...parts: string[]): string {
  return readFileSync(join('web', ...parts), 'utf8');
}

/**
 * Assertions about what a visitor can read must ignore what a maintainer can
 * read. These files discuss synthetic worker identities and invented worker
 * counts precisely because keeping both off the page is the point.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const webSource = walk('web').filter(f => /\.(ts|tsx|css|json)$/.test(f));
const webCode = webSource.filter(f => /\.(ts|tsx)$/.test(f));
const allWebText = webSource.map(f => readFileSync(f, 'utf8')).join('\n');

// --- One backend, one set of business rules --------------------------------
// The web client must consume the same legal corpus the mobile client renders.
// A second copy would eventually record an acceptance of text nobody was shown.
const seam = readWeb('lib', 'warsha.ts');
check(/from '\.\.\/\.\.\/src\/legal\/legal-corpus\.ts'/.test(seam),
  'the web client reads the SAME legal corpus module as mobile, not a copy');
check(/from '\.\.\/\.\.\/src\/legal\/signup-legal\.ts'/.test(seam),
  'signup acceptance requirements come from the shared authority');
check(!/legal_documents|legalCorpus\s*=\s*\[/.test(allWebText.replace(seam, '')),
  'THE WEB PLATFORM DEFINES NO PARALLEL LEGAL CORPUS');

// Every document the mobile signup manifest requires must be readable on the
// web before an account exists, or acceptance would precede disclosure.
for (const role of ['customer', 'worker'] as const) {
  for (const document of acceptanceRequiredFor(role)) {
    const slug = document.key.replace(/_/g, '-');
    check(new RegExp(slug).test(allWebText) || legalCorpus.some(d => d.key === document.key),
      `${role} must be able to read ${document.key} on the web before accepting it`);
  }
}
check(/generateStaticParams/.test(readWeb('app', '[locale]', 'legal', '[slug]', 'page.tsx')),
  'every legal document is statically generated, so reading one waits on nothing');
check(legalCorpus.every(d => hashesFor(d).en.length === 64 && hashesFor(d).ar.length === 64),
  'both language hashes remain publishable for every document');

// --- No parallel database, no privileged key in the browser ----------------
check(!/SUPABASE_SERVICE_ROLE|service_role|SERVICE_ROLE_KEY/i.test(allWebText),
  'NO SERVICE ROLE KEY OR REFERENCE EXISTS ANYWHERE IN WEB SOURCE');
check(!/sb_secret_|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(allWebText),
  'no Supabase secret or JWT literal is embedded in web source');
check(!/postgres:\/\/|postgresql:\/\//.test(allWebText),
  'the web client holds no direct database connection string');
// The web reads NEXT_PUBLIC_* through Next's own environment resolution.
// These were briefly mapped from the EXPO_PUBLIC_* names inside next.config,
// which inlined empty strings whenever those were absent from the build
// environment and silently overrode .env.local — every authenticated page
// rendered blank. A missing explicit variable is a loud error; a mapped empty
// one is a white screen.
const browserClient = readWeb('lib', 'supabase-browser.ts');
check(/NEXT_PUBLIC_SUPABASE_URL/.test(browserClient)
  && /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(browserClient),
  'web reads the publishable Supabase values of the same project as mobile');
check(/is not configured/.test(browserClient),
  'a missing Supabase variable fails loudly rather than rendering nothing');
const nextConfig = readWeb('next.config.ts');
check(!/env: \{/.test(nextConfig),
  'next.config does not remap public environment variables into empty strings');

// --- The web is not the mobile app in a browser ----------------------------
// Import statements only — the prose in these files discusses React Native
// precisely because keeping it out is the point.
const webImports = webCode
  .map(f => readFileSync(f, 'utf8'))
  .flatMap(text => [...text.matchAll(/^\s*(?:import|export)[^;]*?from\s*'([^']+)'/gm)])
  .map(match => match[1]);
check(!webImports.some(specifier => /^react-native|^expo[-/]?|^@react-native/.test(specifier)),
  'NO REACT NATIVE OR EXPO IMPORT LEAKS INTO THE WEB CLIENT');
check(webImports.some(specifier => specifier.includes('src/legal/legal-corpus')),
  'the web client does import the shared legal authority');
const chrome = readWeb('components', 'site-chrome.tsx');
const chromeNav = readWeb('components', 'site-nav.tsx');
check(/aria-label=\{words\.navPrimary\}/.test(chromeNav)
  && /<header/.test(chrome) && /<footer/.test(chrome),
  'the web uses header/footer navigation rather than a reproduced tab bar');
check(!/bottomTab|tabBar|BottomNavigation/i.test(allWebText),
  'no mobile bottom-tab navigation is reproduced on the web');

// --- Theme parity with mobile ----------------------------------------------
// globals.css restates the mobile palette rather than importing a StyleSheet
// module. Restating it is only safe if it stays equal.
const css = readWeb('app', 'globals.css');
const cssValue = (block: string, token: string): string | null => {
  const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  return match ? match[1].toLowerCase() : null;
};
const darkBlock = css.slice(0, css.indexOf("[data-theme='light']"));
const lightBlock = css.slice(css.indexOf("[data-theme='light']"));
check(cssValue(darkBlock, '--canvas') === darkColors.canvas.toLowerCase(),
  'the web dark canvas equals the mobile dark canvas token');
check(cssValue(lightBlock, '--canvas') === lightColors.canvas.toLowerCase(),
  'the web light canvas equals the mobile light canvas token');

// --- Accessibility and bilingual obligations -------------------------------
check(/skip-link/.test(css) && /skip-link/.test(readWeb('app', '[locale]', 'layout.tsx')),
  'a keyboard user can skip to content');
check(/:focus-visible/.test(css) && !/outline:\s*none/.test(css),
  'FOCUS IS ALWAYS VISIBLE; NOTHING REMOVES THE OUTLINE');
check(/prefers-reduced-motion/.test(css), 'reduced-motion preference is respected');
// Direction is a property of the document, not of one element inside it. The
// locale layout sets it on <html>, so every page — legal or otherwise — is
// right-to-left in Arabic without each component remembering to ask.
check(/dir=\{directionOf\(typed\)\}/.test(readWeb('app', '[locale]', 'layout.tsx')),
  'Arabic pages are rendered right-to-left from the document root');
check(/dir='rtl'\]/.test(css) || /\[dir='rtl'\]/.test(css),
  'RTL has its own type treatment rather than mirrored Latin defaults');
check(/prefers-color-scheme/.test(css) && /data-theme/.test(css),
  'theme follows an explicit choice, then the platform preference');
check(/localStorage.getItem\('warsha:appearance:v1'\)/.test(readWeb('app', '[locale]', 'layout.tsx')),
  'the stored theme is applied before first paint, using the mobile key');

// --- SEO --------------------------------------------------------------------
const home = readWeb('app', '[locale]', 'page.tsx');
check(/generateMetadata/.test(readWeb('app', '[locale]', 'layout.tsx')),
  'the locale layout declares canonical and alternate URLs per language');

// A language alternate is a promise that a translated address exists. The
// homepage once advertised hreflang="ar" pointing at /ar, which returned 404 —
// telling crawlers the Arabic edition was a dead page. Any `languages` entry
// must name a route that is actually built.
// Alternates are locale-prefixed (`/ar/services`). The locale itself is the
// `[locale]` dynamic segment, so the segment after it is what must name a real
// route directory.
const localeRoutes = new Set(
  readdirSync(join('web', 'app', '[locale]'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name),
);
for (const file of webCode.filter(f => f.endsWith('page.tsx'))) {
  const languages = /languages:\s*\{([^}]*)\}/.exec(readFileSync(file, 'utf8'));
  if (!languages) continue;
  for (const [, target] of languages[1].matchAll(/'\/([^']*)'/g)) {
    const [locale, ...rest] = target.split('/');
    check(locale === 'en' || locale === 'ar' || locale === 'fr',
      `${file} advertises an alternate under a supported locale (/${locale})`);
    const segment = rest[0] ?? '';
    check(segment === '' || localeRoutes.has(segment),
      `${file} advertises a language alternate for a route that exists (/${segment})`);
  }
}
check(/openGraph/.test(readWeb('app', '[locale]', 'layout.tsx')),
  'social metadata is declared for sharing');
for (const page of ['about', 'help', 'services', 'how-it-works', 'become-a-worker']) {
  check(/generateMetadata/.test(readWeb('app', '[locale]', page, 'page.tsx')),
    `/${page} declares its own metadata`);
}

// --- Honesty ----------------------------------------------------------------
// The public site must not invent marketplace scale it does not have.
// All visitor-facing prose now lives in the dictionaries, in both languages,
// so checking those covers every page at once rather than a sampled few.
const publicCopy = withoutComments(
  readWeb('lib', 'copy.ts') + '\n' + readWeb('lib', 'pages-copy.ts'));
// A quantity, not an ordinal: "1,200 workers" is a claim, "2. Professionals
// quote" is a numbered heading.
check(!/\b\d[\d,]*\s*\+?\s+(workers|professionals|customers|jobs|reviews)\b/i.test(publicCopy),
  'THE PUBLIC SITE CLAIMS NO WORKER, CUSTOMER OR JOB COUNT IT CANNOT SUPPORT');
check(!/guaranteed response|within \d+ (minutes|hours)|\d\.\d+ stars|average rating/i.test(publicCopy),
  'no response-time or rating claim is fabricated');
check(/closed testing/i.test(publicCopy),
  'the public site says Warsha is in closed testing rather than implying scale');

// --- The public pages stay prerendered --------------------------------------
/*
 * One dynamic API in this tree costs all 114 of them.
 *
 * `[locale]/not-found.tsx` read `headers()` for two days to find out which
 * language to apologise in. It worked, and it opted every public page out of
 * static generation: a dynamic API anywhere in a route's render tree makes that
 * route dynamic, and a not-found boundary sits in the tree of every page under
 * it. The build dropped from 120 prerendered routes to 6, the route table still
 * showed the pages as static, and nothing failed. `test:web-build-output`
 * catches the consequence after a build; this catches the cause on a checkout,
 * which is where it is cheap to fix.
 *
 * The application and admin origins are deliberately not covered: they are
 * authenticated, per-request by nature, and reading a cookie there is correct.
 * This is about the marketing pages, which are the same for everybody.
 */
const publicPages = webCode.filter((file) => file.includes(join('app', '[locale]')));
check(publicPages.length > 10,
  `the public page scan found ${publicPages.length} files, so it is looking in the right place`);
for (const file of publicPages) {
  const source = withoutComments(readFileSync(file, 'utf8'));
  check(!/from 'next\/headers'|cookies\(\)|headers\(\)|connection\(\)/.test(source),
    `${file} USES A DYNAMIC API AND WOULD TAKE EVERY PUBLIC PAGE OFF STATIC RENDERING`);
}

// --- Worker identity privacy ------------------------------------------------
check(!/auth\.warsha\.invalid|synthetic/i.test(withoutComments(allWebText)),
  'THE WEB NEVER REVEALS THE SYNTHETIC WORKER EMAIL IDENTITY');
const signIn = readWeb('app', '[locale]', 'sign-in', 'page.tsx');
check(!/signInCustomerBody|signInWorkerBody/.test(signIn),
  'WEB SIGN-IN DOES NOT ASK SOMEBODY TO CLASSIFY THEIR OWN ACCOUNT');
/*
 * The rule is unchanged and the evidence moved. It used to be `signInIdentity`,
 * a standalone caption reading "Email or phone number" -- which described a
 * field this page has never had and must never have, and which, once the page
 * ended in a link to the real form, read as a label for the button. The same
 * product rule is now carried by `signInIdentityHint`, a sentence, in all three
 * languages: an identifier is what is asked for, and Warsha resolves the rest.
 *
 * Three languages, not two. French has been a Warsha language since long before
 * this check was written and it was still only asking about two of them.
 */
check(/signInIdentityHint/.test(signIn) && /signInOneAccount/.test(signIn),
  'web sign-in asks for an identifier and says one sign-in serves everyone');
const publicDictionary = readWeb('lib', 'copy.ts');
check(/the email address or the phone number you registered with/.test(publicDictionary)
  && /البريد الإلكتروني أو رقم التليفون اللي سجّلت بيه/.test(publicDictionary)
  && /l’adresse e-mail ou le numéro de téléphone enregistré/.test(publicDictionary),
  'the identifier is what is asked for, in English, Arabic and French');


// ---------------------------------------------------------------------------
// The legal pages have ONE language control, and it is not theirs
// ---------------------------------------------------------------------------
// They used to carry their own row of language buttons directly under the
// document summary, in addition to the site-wide control in the footer. Two
// switchers on one screen is a question rather than a convenience: a reader has
// to work out whether the inline one changes this document or the whole site,
// and the honest answer was "the same thing, twice". The inline row was removed.
//
// Twenty-six documents in three locales inherit this one component, so these
// assertions are about the component, not about a page.

const legalPage = readWeb('app', '[locale]', 'legal', '[slug]', 'page.tsx');
const legalStyles = readWeb('app', '[locale]', 'legal', '[slug]', 'page.module.css');

check(!/styles\.languages|styles\.languageCurrent|styles\.language\b/.test(legalPage),
  'THE INLINE LEGAL LANGUAGE SWITCHER IS GONE FROM THE DOCUMENT HEADER');
check(!/<nav[^>]*aria-label=\{words\.legalLanguageGroup\}/.test(legalPage),
  'and its labelled landmark with it');
check(!/\.languages\s*\{/.test(legalStyles) && !/\.languageCurrent\s*\{/.test(legalStyles),
  'AND ITS STYLES ARE GONE TOO, rather than left behind unreferenced');

// Removing a control must not remove the space it occupied and leave the
// summary running straight into the document body.
check(/\.documentHeader\s*\{[^}]*margin-bottom:/s.test(legalStyles),
  'THE HEADER STILL STATES ITS OWN SPACING, so no gap collapses where the row was');

// What must still be true: the documents are still published in three
// languages, still reachable at three routes, and still switchable.
check(/languages:\s*\{\s*en:.*ar:.*fr:/s.test(legalPage),
  'ALL THREE LOCALES ARE STILL DECLARED AS ALTERNATES for search engines');
check(/LOCALES\.flatMap\(/.test(legalPage),
  'and all three routes are still generated');
check(/<SiteFooter locale=\{typed\} \/>/.test(legalPage),
  'THE FOOTER LANGUAGE CONTROL IS STILL RENDERED — switching is still possible');
check(/PreferenceFooter/.test(readWeb('components', 'site-chrome.tsx')),
  'and that footer is the one carrying the site-wide preference controls');
check(/dir=\{bodyLanguage === 'ar' \? 'rtl' : 'ltr'\}/.test(legalPage),
  'Arabic still renders right-to-left');

// The footer control has to be able to name every language in every locale, or
// a label falls back to English inside the control for choosing a language.
for (const locale of ['en', 'ar', 'fr'] as const) {
  const words = (copy as Record<string, Record<string, string>>)[locale];
  for (const key of ['languageEnglish', 'languageArabic', 'languageFrench']) {
    check(typeof words[key] === 'string' && words[key].length > 0,
      `the ${locale} footer can name ${key}`);
  }
}

console.log(`Web platform regressions: ${checks} checks passed across ${webCode.length} web modules.`);
