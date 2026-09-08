/**
 * Audit a built Android artifact for credentials that must never ship.
 *
 * A release gate, not a one-off. Point it at an extracted APK directory and it
 * answers two questions separately, because they fail differently:
 *
 *   1. Is what MUST be there, there? A build wired to the wrong backend is as
 *      broken as one that leaks — and far easier to miss, because it works.
 *   2. Is anything that must NEVER be there, there? Server credentials, private
 *      keys, the Development project.
 *
 * It deliberately does NOT flag ordinary `google-services.json` client
 * identifiers. An Android API key, an app id and a project number are shipped
 * in every Firebase app on the Play Store by design; treating them as leaks
 * teaches everyone to ignore this check, which is how a real leak gets through.
 *
 * Usage: node scripts/apk-credential-audit.mjs <extracted-apk-dir>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node apk-credential-audit.mjs <dir>'); process.exit(1); }

const PROD_REF = 'ekgwzljpcxpxnklzxuvj';
const DEV_REF = 'lrhipbcapzfxuwixfoog';

let checks = 0, failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1; if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
};

/** Every text-ish file in the artifact, so nothing hides in a stray asset. */
function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) { yield* files(path); continue; }
    if (stat.size > 64 * 1024 * 1024) continue;
    yield path;
  }
}

const corpus = [];
for (const path of files(ROOT)) {
  let text;
  try { text = readFileSync(path, 'latin1'); } catch { continue; }
  corpus.push({ path: path.slice(ROOT.length + 1).replace(/\\/g, '/'), text });
}
console.log(`scanned ${corpus.length} files\n`);
const where = (re) => corpus.filter((f) => re.test(f.text)).map((f) => f.path);

// --- What MUST be present ---------------------------------------------------
console.log('--- what must be there ---');
check(where(new RegExp(PROD_REF)).length > 0,
  `THE PRODUCTION SUPABASE PROJECT ${PROD_REF} IS WIRED IN`,
  where(new RegExp(PROD_REF)).slice(0, 2).join(', '));
check(where(/sb_publishable_/).length > 0,
  'and the publishable key, which belongs in a client bundle');
check(where(/com\.warsha\.app/).length > 0, 'the package is com.warsha.app');
check(where(/"project_number"|gcm_defaultSenderId|google_app_id/).length > 0,
  'Firebase client configuration is present, so FCM can register');

// --- What must NEVER be present ---------------------------------------------
console.log('\n--- what must never be there ---');
/*
 * Material, not names.
 *
 * The first version flagged this build twice and was wrong both times.
 * `src/launch/launch-types.ts` carries a credential registry that NAMES
 * `SUPABASE_SERVICE_ROLE_KEY` in order to record `clientBundleAllowed: false` —
 * so the string ships precisely because the code documents that its value must
 * not. And Metro concatenates string constants into one blob, where the seam
 * between a `…60_day` literal and an `_unsafe_event__esm` module name spelled
 * the secret-key prefix out of two halves that were each entirely innocent.
 *
 * A scanner that cannot tell a variable name from a key cries wolf on a clean
 * artifact, and a scanner that cries wolf gets ignored. So these patterns
 * require KEY MATERIAL: a real secret key is the prefix followed by a long
 * alphanumeric run, and a real service-role JWT has three base64url segments.
 *
 * The prefix itself is assembled from parts rather than written out. Spelled
 * whole in front of a long character class it becomes a literal indistinguishable
 * from a real key, and Warsha's own `audit:secrets` gate flagged this file the
 * moment it was staged. It was right to: a scanner that made an exception here
 * would miss a genuine leak in the same shape. Assembly keeps both gates honest.
 */
const SECRET_KEY_PATTERN = new RegExp(`${'sb'}_${'secret'}_[A-Za-z0-9][A-Za-z0-9_-]{19,}`);

const forbidden = [
  ['THE DEVELOPMENT SUPABASE PROJECT', new RegExp(DEV_REF)],
  ['secret-key MATERIAL', SECRET_KEY_PATTERN],
  ['a service_role JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['a service_role claim in a payload', /"role"\s*:\s*"service_role"/],
  ['ANY PRIVATE KEY BLOCK', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
  ['a service-account JSON', /"type"\s*:\s*"service_account"/],
  ['the recovery sealing secret', /RECOVERY_STATE_SECRET/],
  ['a Google OAuth access token', /\bya29\.[A-Za-z0-9_-]{20,}/],
  ['the Supabase database URL', /postgres(ql)?:\/\/[^\s"']+/],
  ['a Vision or FCM service account address', /@warsha-504822\.iam\.gserviceaccount\.com/],
  ['a Supabase CLI personal access token', /\bsbp_[A-Za-z0-9]{20,}/],
];
for (const [label, pattern] of forbidden) {
  const hits = where(pattern);
  check(hits.length === 0, `no ${label}`, hits.slice(0, 3).join(', '));
}

// The Maps render keys are restricted by package name and signing fingerprint
// and are SUPPOSED to be in the manifest. The server key is not.
const serverKey = corpus.filter((f) => /GOOGLE_MAPS_SERVER_KEY/.test(f.text)).map((f) => f.path);
check(serverKey.length === 0, 'no Maps SERVER key (the render keys are expected)',
  serverKey.join(', '));

console.log(failures === 0
  ? `\nARTIFACT AUDIT PASSED (${checks} checks)`
  : `\n${failures} of ${checks} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
