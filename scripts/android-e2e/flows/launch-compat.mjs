/**
 * Does the shipped Android binary actually work on Warsha's declared floor?
 *
 * Warsha's minSdk is 24. Nothing was proving it. Firebase Test Lab cannot:
 * `scripts/testlab/api-floor.mjs` reads the catalogue and finds that no
 * schedulable model offers anything below API 26, at any price. So the floor
 * has to be proven on emulators, in CI, which is what this flow is for.
 *
 * It is deliberately credential-free. `push-proof.mjs` signs in as a real
 * worker and needs `qa-worker.json`; that proves the push lifecycle but cannot
 * run on a public runner, and a compatibility matrix that needs a secret is a
 * matrix that gets disabled. Everything below is observable before any account
 * exists.
 *
 * What a pass actually means, in order of what breaks first on an old API:
 *
 *   1. the APK INSTALLS         — minSdk in the manifest permits this device
 *   2. the process STARTS       — no linker or ABI failure loading .so files
 *   3. Hermes EVALUATES         — a JS engine failure kills the bundle silently
 *      the bundle                 and leaves a blank Activity, not a crash
 *   4. React Native MOUNTS      — the new architecture (fabric/bridgeless) is
 *      a view tree                on, and it is the thing most likely to fail
 *                                 on an old API while everything else works
 *   5. the welcome screen       — accessibility labels are present, so the app
 *      IDENTIFIES ITSELF          rendered its own content and not a fallback
 *   6. NOTHING FATAL is logged  — a caught-and-swallowed native crash still
 *                                 means the device is unsupported
 *
 * Step 5 is why this reads labels rather than pixels. A screenshot diff on an
 * API 24 emulator fails for font and shadow reasons that have nothing to do
 * with whether the app works, and it cannot tell a rendered screen from a
 * rendered error. A `content-desc` of "Sign in" can only exist if React Native
 * mounted Warsha's own tree.
 *
 * Usage: node scripts/android-e2e/flows/launch-compat.mjs
 *   WARSHA_ADB     path to adb            (default: PATH, or the local SDK)
 *   WARSHA_TEMP    artifact directory     (default: OS temp)
 *   WARSHA_APK     apk to install first   (default: use what is installed)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  clearLog, describeScreen, findAll, logcat, screenshot, shell, sleep, tree, waitFor,
} from '../driver.mjs';

const PACKAGE = 'com.warsha.app';

let checks = 0;
let failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  -- ${detail}` : ''}`);
  return ok;
};

// --- Which device is this, in its own words? ---------------------------------
// Reported rather than assumed: a matrix that says "API 24" while the runner
// quietly booted 26 is worse than no matrix, and this is the only place that
// can tell the difference.
const api = Number(shell('getprop ro.build.version.sdk').trim());
const release = shell('getprop ro.build.version.release').trim();
const abi = shell('getprop ro.product.cpu.abi').trim();
console.log(`device: API ${api} (Android ${release}) ${abi}\n`);
if (!Number.isFinite(api)) {
  console.error('No device answered. Is an emulator attached?');
  process.exit(1);
}

// --- 1. Install ---------------------------------------------------------------
const apk = process.env.WARSHA_APK;
if (apk) {
  if (!existsSync(apk)) {
    console.error(`WARSHA_APK does not exist: ${apk}`);
    process.exit(1);
  }
  // Not via driver.adb(): that swallows failures to keep UI probing quiet, and
  // an install failure is exactly the result this flow exists to report.
  let installed = false;
  let detail = '';
  try {
    const out = execFileSync(process.env.WARSHA_ADB ?? 'adb',
      ['install', '-r', '-d', apk], { encoding: 'utf8' });
    installed = /Success/i.test(out);
    detail = out.trim().split('\n').pop() ?? '';
  } catch (error) {
    detail = String(error.stderr ?? error.stdout ?? error.message).trim().slice(0, 300);
  }
  if (!check(installed, `THE APK INSTALLS on API ${api}`, detail)) {
    // INSTALL_FAILED_OLDER_SDK here is the headline result: the manifest's
    // minSdk excludes a device Warsha claims to support.
    process.exit(1);
  }
} else {
  const present = shell(`pm list packages ${PACKAGE}`).includes(PACKAGE);
  if (!check(present, `${PACKAGE} is installed on this device`)) process.exit(1);
}

// --- 2. Start ----------------------------------------------------------------
shell(`pm clear ${PACKAGE}`);
await sleep(2000);
clearLog();
shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);

// Poll for the process rather than sleeping a fixed time: an API 24 emulator on
// a cold CI runner is several times slower than a warm local one, and a fixed
// wait would either be flaky there or wasteful everywhere else.
let running = false;
for (let i = 0; i < 60 && !running; i += 1) {
  running = shell(`pidof ${PACKAGE}`).trim() !== '';
  if (!running) await sleep(1000);
}
check(running, `the process STARTS and stays up on API ${api}`);

// --- 3-5. Did React Native mount Warsha's own tree? --------------------------
// waitFor polls the UIAutomator tree, so this covers Hermes evaluating the
// bundle, RN mounting, and the screen identifying itself, in one wait.
const welcome = await waitFor({ descContains: 'Sign in' }, { timeout: 90000 })
  ?? await waitFor({ textContains: 'Sign in' }, { timeout: 5000 });

const labelled = check(Boolean(welcome),
  `HERMES RAN AND REACT NATIVE MOUNTED: the welcome screen names itself on API ${api}`);

screenshot(`compat-api${api}`);

if (labelled) {
  // A tree with one node is a blank Activity; a real screen has many.
  const nodes = tree();
  const interactive = findAll({ clickable: true }, nodes);
  check(nodes.length > 5,
    `the view tree is populated (${nodes.length} nodes), not an empty Activity`);
  check(interactive.length > 0,
    `and carries ${interactive.length} interactive control(s)`);
} else {
  console.log('\n--- what was on screen instead ---');
  console.log(describeScreen().slice(0, 800));
}

// --- 6. Nothing fatal ---------------------------------------------------------
// Checked last so the screen evidence above is captured even when the app died.
const fatal = logcat('FATAL EXCEPTION|Fatal signal|AndroidRuntime.*FATAL|beginning of crash');
const ourFatal = fatal.split('\n').filter((l) => /FATAL|Fatal signal/.test(l));
check(ourFatal.length === 0,
  'NO FATAL EXCEPTION was logged during launch',
  ourFatal.slice(0, 3).join(' | ').slice(0, 400));

if (!labelled) {
  console.log('\n--- last 40 log lines ---');
  console.log(logcat('').split('\n').slice(-40).join('\n'));
}

console.log(failures === 0
  ? `\nAPI ${api} IS COMPATIBLE: ${checks} checks passed.`
  : `\nAPI ${api} FAILED ${failures} of ${checks} checks.`);
process.exit(failures === 0 ? 0 : 1);
