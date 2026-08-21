import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { legalCorpus, hashesFor } from '../src/legal/legal-corpus.ts';
import { acceptanceRequiredFor } from '../src/legal/legal-corpus.ts';
import { lightColors, darkColors } from '../constants/appearance.ts';

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

// --- Worker identity privacy ------------------------------------------------
check(!/auth\.warsha\.invalid|synthetic/i.test(withoutComments(allWebText)),
  'THE WEB NEVER REVEALS THE SYNTHETIC WORKER EMAIL IDENTITY');
const signIn = readWeb('app', '[locale]', 'sign-in', 'page.tsx');
check(!/signInCustomerBody|signInWorkerBody/.test(signIn),
  'WEB SIGN-IN DOES NOT ASK SOMEBODY TO CLASSIFY THEIR OWN ACCOUNT');
check(/signInIdentity/.test(signIn) && /signInOneAccount/.test(signIn),
  'web sign-in asks for an identifier and says one sign-in serves everyone');
check(/Email or phone number/.test(readWeb('lib', 'copy.ts'))
  && /البريد الإلكتروني أو رقم التليفون/.test(readWeb('lib', 'copy.ts')),
  'the identifier is asked for in both languages');

console.log(`Web platform regressions: ${checks} checks passed across ${webCode.length} web modules.`);
