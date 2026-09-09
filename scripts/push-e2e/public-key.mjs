/**
 * The public client credential the Production app actually runs with.
 *
 * Not a guess, and not a copy kept somewhere else that can drift: the value
 * returned here is read out of the same artefact Production executes. An EAS
 * build resolves `EXPO_PUBLIC_SUPABASE_URL` and
 * `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from its build environment and inlines
 * them into the JavaScript bundle, so the bundle inside the APK IS the
 * authority for what a given build talks to. Reading it back is the only way to
 * be certain a test is exercising the same project the shipped app does.
 *
 * ## Why this is not just a regex
 *
 * It was, and the regex was wrong in a way that looked exactly like a rotated
 * credential. Metro concatenates every string in the bundle into one table, so
 * the key is followed immediately by whatever string was interned next — here,
 * `joinRef`. A greedy `[A-Za-z0-9_-]+` therefore returned 52 characters where
 * the key is 46, and the six extra characters produced
 *
 *     HTTP 401 "Invalid API key"
 *
 * which reads as "the key is stale" and is not. There is no delimiter to anchor
 * on, and no length that is safe to hard-code.
 *
 * So the boundary is established by asking the server. Each candidate prefix is
 * probed against `/auth/v1/settings`, which requires a valid key and rejects an
 * invalid one, and the first prefix that is accepted is the key. A bogus key
 * returns 401 there, so the probe genuinely discriminates rather than accepting
 * anything.
 *
 * ## Handling
 *
 * The value never reaches stdout, a log, an artefact or a commit. What can be
 * printed is a SHA-256 prefix and a length, which is enough to say "the build
 * and the test are using the same credential" without publishing it. This is a
 * publishable key — it ships inside the app and is protected by RLS — but a
 * credential that is safe to distribute is still not one to paste into a report.
 *
 * `service_role` is never read, never accepted and never needed here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_PREFIX = 'sb_publishable_';
const LEGAL = /^[A-Za-z0-9_-]+$/;

/** Pull `assets/index.android.bundle` out of an APK without unzipping it all. */
function bundleFromApk(apkPath) {
  // `unzip -p` streams one entry to stdout. Node's zlib cannot read a zip
  // container on its own, and adding a dependency for one read is worse.
  return execFileSync('unzip', ['-p', apkPath, 'assets/index.android.bundle'], {
    encoding: 'latin1',
    maxBuffer: 256 * 1024 * 1024,
  });
}

async function accepted(url, key) {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return response.status === 200;
}

/**
 * @param {object} input
 * @param {string} input.apkPath   a Production APK to read the credential from
 * @returns {Promise<{url: string, key: string, fingerprint: string, length: number}>}
 */
export async function resolvePublicKey({ apkPath }) {
  // An explicitly supplied pair wins, so CI or a future environment can hand
  // these in without this file having to know about it.
  if (process.env.WARSHA_SUPABASE_URL && process.env.WARSHA_SUPABASE_KEY) {
    const key = process.env.WARSHA_SUPABASE_KEY;
    return {
      url: process.env.WARSHA_SUPABASE_URL,
      key,
      fingerprint: createHash('sha256').update(key).digest('hex').slice(0, 12),
      length: key.length,
    };
  }

  const bundle = bundleFromApk(apkPath);

  const urlMatch = bundle.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
  if (!urlMatch) throw new Error('no Supabase URL found in the bundle');
  const url = urlMatch[0];

  const start = bundle.indexOf(KEY_PREFIX);
  if (start < 0) throw new Error(`no ${KEY_PREFIX} credential found in the bundle`);
  const run = /^[A-Za-z0-9_-]+/.exec(bundle.slice(start))[0];
  if (!LEGAL.test(run)) throw new Error('unexpected credential shape');

  // Sanity: the probe must reject something invalid, or "accepted" means
  // nothing and the first candidate would win.
  if (await accepted(url, `${KEY_PREFIX}definitely-not-a-real-key`)) {
    throw new Error('the probe endpoint accepts an invalid key; cannot resolve a boundary');
  }

  for (let length = KEY_PREFIX.length + 8; length <= run.length; length += 1) {
    const candidate = run.slice(0, length);
    if (await accepted(url, candidate)) {
      return {
        url,
        key: candidate,
        fingerprint: createHash('sha256').update(candidate).digest('hex').slice(0, 12),
        length,
      };
    }
  }

  throw new Error('no prefix of the embedded credential was accepted by the project');
}

// Run directly to check which credential a build carries, printing no secret.
// `import.meta.url` and argv[1] disagree about drive-letter case and slash
// direction on Windows, so compare resolved paths rather than URL strings.
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const apkPath = process.argv[2] ?? process.env.WARSHA_APK;
  if (!apkPath) {
    console.error('usage: node scripts/push-e2e/public-key.mjs <production.apk>');
    process.exit(2);
  }
  const resolved = await resolvePublicKey({ apkPath });
  console.log(`url         : ${resolved.url}`);
  console.log(`key length  : ${resolved.length}`);
  console.log(`fingerprint : ${resolved.fingerprint}  (sha256 prefix; the key itself is never printed)`);
  // Confirms the file was read, not that anybody may have it.
  console.log(`source      : ${readFileSync(apkPath).length} byte APK`);
}
