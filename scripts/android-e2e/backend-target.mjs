/**
 * Which backend the device under test is actually talking to.
 *
 * This is a gate, not a report. It exists because an hour was lost to a
 * professional sign-in that failed with "Invalid sign-in details or password."
 * against a locally-built APK. It looked exactly like a product defect: the
 * same credential authenticated against Production from the host, and the
 * emulator had network. It was not a defect. `.env` holds the DEVELOPMENT
 * project, the account exists only in Production, and every screenshot taken
 * that hour was evidence about the wrong system.
 *
 * The failure mode that matters is not the one that errors. It is the one that
 * SUCCEEDS: a Production certification run driven against a Development build
 * produces green screenshots, real-looking evidence, and a certification claim
 * about a system that was never exercised. Nothing downstream can detect that
 * afterwards, because the artefacts are indistinguishable.
 *
 * So both directions refuse:
 *
 *   - a Production run must prove the installed APK targets Production
 *   - a Development run must prove it does NOT
 *
 * And "cannot prove" is a refusal, never a pass. An unreadable bundle, a
 * missing package, an unrecognised project ref — each stops the run.
 *
 * ## The artefact is the authority
 *
 * Not `.env`, not an argument, not an environment variable. An EAS or Gradle
 * build inlines `EXPO_PUBLIC_SUPABASE_URL` into the JavaScript bundle, so the
 * bundle inside the APK IS what the running app will connect to. `.env` says
 * what the NEXT build would use, which is a different question and was exactly
 * the question that got confused. `resolvePublicKey` honours a
 * `WARSHA_SUPABASE_URL` override for CI; this deliberately does not, because an
 * override is a way for the claim and the reality to diverge again.
 *
 * The APK is read from the device — `pm path` — rather than from a file lying
 * around in a temp directory, because what is installed is what runs, and a
 * file named `warsha-prod.apk` is a claim about its own contents.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { adb, shell } from './driver.mjs';
import { PROJECTS, environmentForRef, loadCredentials, refFromUrl } from '../warsha-projects.mjs';

const PACKAGE = 'com.warsha.app';

// Re-exported so a device flow needs one import, not two. `warsha-projects.mjs`
// remains the single definition — the host-side push scripts read the same one.
export { PROJECTS };

const CACHE = join(tmpdir(), 'warsha-backend-target');

/** Pull `assets/index.android.bundle` out of an APK without unzipping it all. */
function bundleFromApk(apkPath) {
  return execFileSync('unzip', ['-p', apkPath, 'assets/index.android.bundle'], {
    encoding: 'latin1',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** The installed APK's path on the device, or null if the package is absent. */
function installedApkPath() {
  const out = shell(`pm path ${PACKAGE}`) ?? '';
  const match = out.match(/package:(\S+\.apk)/);
  return match ? match[1] : null;
}

/**
 * Content hash of the installed APK, computed ON the device.
 *
 * This is the cache key, and it has to be the content rather than size and
 * mtime: a reinstall of a different build can land with the same size, and a
 * stale cache hit here would defeat the entire gate. Hashing on-device costs
 * about a tenth of a second; pulling 130MB to answer the same question costs
 * twenty seconds, and a gate that slow is a gate people start skipping.
 */
function deviceDigest(apkPath) {
  const out = shell(`md5sum '${apkPath}'`) ?? '';
  const match = out.match(/^([0-9a-f]{32})\s/m);
  return match ? match[1] : null;
}

/**
 * What the installed build connects to.
 *
 * @returns {{ref: string, url: string, environment: string|null, apkPath: string, digest: string}}
 * @throws if it cannot be established. Never returns a guess.
 */
export function resolveInstalledTarget() {
  const apkPath = installedApkPath();
  if (!apkPath) {
    throw new Error(`${PACKAGE} is not installed on the device; there is nothing to certify`);
  }

  const digest = deviceDigest(apkPath);
  if (!digest) {
    throw new Error(`could not hash the installed APK at ${apkPath}`);
  }

  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, `${digest}.json`);
  if (existsSync(cached)) {
    return { ...JSON.parse(readFileSync(cached, 'utf8')), apkPath, digest };
  }

  const local = join(CACHE, `${digest}.apk`);
  if (!existsSync(local)) {
    adb(['pull', apkPath, local]);
    if (!existsSync(local)) throw new Error(`could not pull the installed APK from ${apkPath}`);
  }

  const bundle = bundleFromApk(local);
  const urlMatch = bundle.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('no Supabase project URL found in the installed bundle; cannot prove a target');
  }
  const url = urlMatch[0];
  const ref = refFromUrl(url);

  /*
   * Deliberately NOT fingerprinted here.
   *
   * The first version of this hashed the publishable key so a report could say
   * "build and test agree". It printed a fingerprint that disagreed with
   * `resolvePublicKey`'s for the same APK, because there is no delimiter after
   * the key in a Metro bundle and the length guessed here was wrong. A
   * confident wrong fingerprint in a certification record is worse than none:
   * it invites someone to conclude a build was swapped when it was not.
   *
   * `scripts/push-e2e/public-key.mjs` establishes the boundary properly, by
   * asking the project which prefix it accepts. That is the one answer to this
   * question, and one is the right number of answers. What this gate needs is
   * the project ref, which the URL states unambiguously.
   */

  const resolved = { ref, url, environment: environmentForRef(ref) };
  writeFileSync(cached, `${JSON.stringify(resolved, null, 2)}\n`);
  return { ...resolved, apkPath, digest };
}

/**
 * Refuse to continue unless the installed build targets `expect`.
 *
 * Call this before the first assertion of any run whose evidence names an
 * environment. It prints one line on success, because a run's evidence should
 * say which backend it exercised and a silent gate teaches nobody.
 *
 * @param {{expect: 'production'|'development', purpose?: string}} options
 */
export function assertBackendTarget({ expect, purpose = 'this run' }) {
  if (!(expect in PROJECTS)) {
    throw new Error(`unknown expected environment "${expect}"`);
  }

  let target;
  try {
    target = resolveInstalledTarget();
  } catch (error) {
    console.error(`\nREFUSING ${purpose}: the backend target could not be proven.`);
    console.error(`  ${error.message}`);
    console.error('  Evidence that does not name a proven backend is not evidence.');
    process.exit(2);
  }

  if (target.ref !== PROJECTS[expect]) {
    console.error(`\nREFUSING ${purpose}: wrong backend installed on the device.`);
    console.error(`  expected  ${expect} (${PROJECTS[expect]})`);
    console.error(`  installed ${target.environment ?? 'UNRECOGNISED PROJECT'} (${target.ref})`);
    console.error('');
    console.error('  A run against the wrong backend does not fail — it passes, and');
    console.error('  produces evidence about a system nobody meant to test.');
    console.error('');
    console.error('  Build for the intended backend before retrying; see');
    console.error('  docs/qa/autonomous-remediation-checkpoint.md, "The backend a local build points at".');
    process.exit(2);
  }

  console.log(`backend target  ${expect} ${target.ref} (proven from the installed APK)`);
  return target;
}

/**
 * The synthetic QA credentials, and the guarantee that they match the device.
 *
 * Loading the credential and checking the backend are one operation on purpose.
 * They were two, and the gap between them is precisely where the lost hour
 * lived: a flow read Production credentials, drove a Development build, and got
 * "Invalid sign-in details or password." — a true statement about the wrong
 * system, indistinguishable from a product defect.
 *
 * A credential belongs to exactly one project. The file says which. So there is
 * no way to hold these credentials without having proven the device agrees, and
 * no flow has to remember to ask.
 *
 * @param {{purpose?: string}} options
 * @returns {{phone: string, password: string, environment: string}}
 */
export function loadQaCredentials({ purpose = 'this run' } = {}) {
  const creds = loadCredentials({ purpose });
  assertBackendTarget({ expect: creds.environment, purpose });
  return creds;
}

// Runnable on its own to answer "what is this device pointed at right now".
if (process.argv[1] && process.argv[1].endsWith('backend-target.mjs')) {
  const expect = process.argv[2];
  if (expect) {
    assertBackendTarget({ expect, purpose: 'this check' });
  } else {
    const target = resolveInstalledTarget();
    console.log(`environment  ${target.environment ?? 'UNRECOGNISED'}`);
    console.log(`project ref  ${target.ref}`);
    console.log(`apk          ${target.apkPath}`);
    console.log(`digest       ${target.digest}`);
  }
}
