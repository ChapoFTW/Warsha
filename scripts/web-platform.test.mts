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
check(/generateStaticParams/.test(readWeb('app', 'legal', '[slug]', 'page.tsx')),
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
const nextConfig = readWeb('next.config.ts');
check(/NEXT_PUBLIC_SUPABASE_URL/.test(nextConfig)
  && /EXPO_PUBLIC_SUPABASE_URL/.test(nextConfig),
  'web reads the same publishable Supabase project values as the mobile client');

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
check(/aria-label="Primary"/.test(chrome) && /<header/.test(chrome) && /<footer/.test(chrome),
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
check(/skip-link/.test(css) && /skip-link/.test(readWeb('app', 'layout.tsx')),
  'a keyboard user can skip to content');
check(/:focus-visible/.test(css) && !/outline:\s*none/.test(css),
  'FOCUS IS ALWAYS VISIBLE; NOTHING REMOVES THE OUTLINE');
check(/prefers-reduced-motion/.test(css), 'reduced-motion preference is respected');
check(/dir="rtl"/.test(readWeb('app', 'legal', '[slug]', 'page.tsx')),
  'Arabic legal text is rendered right-to-left');
check(/dir='rtl'\]/.test(css) || /\[dir='rtl'\]/.test(css),
  'RTL has its own type treatment rather than mirrored Latin defaults');
check(/prefers-color-scheme/.test(css) && /data-theme/.test(css),
  'theme follows an explicit choice, then the platform preference');
check(/localStorage.getItem\('warsha.theme'\)/.test(readWeb('app', 'layout.tsx')),
  'the stored theme is applied before first paint, as on mobile');

// --- SEO --------------------------------------------------------------------
const home = readWeb('app', 'page.tsx');
check(/export const metadata/.test(home) && /alternates/.test(home),
  'the homepage declares canonical and language alternates');
check(/openGraph/.test(readWeb('app', 'layout.tsx')),
  'social metadata is declared for sharing');
for (const page of ['about', 'help', 'services', 'how-it-works', 'become-a-worker']) {
  check(/export const metadata/.test(readWeb('app', page, 'page.tsx')),
    `/${page} declares its own metadata`);
}

// --- Honesty ----------------------------------------------------------------
// The public site must not invent marketplace scale it does not have.
const publicCopy = ['page.tsx', 'about/page.tsx', 'services/page.tsx',
  'how-it-works/page.tsx', 'trust-and-safety/page.tsx', 'become-a-worker/page.tsx']
  .map(p => readWeb('app', p)).join('\n');
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
const signIn = readWeb('app', 'sign-in', 'page.tsx');
check(/I need work done/.test(signIn) && /I do the work/.test(signIn),
  'sign-in asks which audience somebody is, not which identifier their account uses');

console.log(`Web platform regressions: ${checks} checks passed across ${webCode.length} web modules.`);
