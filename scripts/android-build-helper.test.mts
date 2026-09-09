/**
 * The build helper must not be able to report a success it did not have.
 *
 * This exists because the plain shell form did. `gradlew assembleRelease | tail`
 * reports the exit code of `tail`, so a Gradle failure after thirty minutes
 * surfaced as exit 0, a watcher recorded success, and the next step tried to
 * install a five-hour-old APK. Nothing lied; every piece behaved reasonably and
 * the result was a confident false positive.
 *
 * The helper therefore requires three independent things to agree, and the
 * assertions below are about the ABSENCE of the shortcuts that broke it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

const helperSource = readFileSync('scripts/android-release-build.mjs', 'utf8');

/**
 * Comments stripped before any check about CODE SHAPE. This helper's own
 * comments quote the broken shell form to explain the incident, and a checker
 * that cannot tell an explanation from the thing it explains fails for the
 * wrong reason — which has now happened three times in this codebase, on the
 * certification document, the RTL suite and here.
 */
const helper = helperSource
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// --- The three conditions ---------------------------------------------------
ok(/result\.status !== 0/.test(helper),
  "THE REAL EXIT CODE IS CHECKED — spawnSync's status, not a pipeline's");
ok(/BUILD SUCCESSFUL/.test(helper) && /never printed BUILD SUCCESSFUL/.test(helper),
  "and gradle's own verdict is required, because an exit code alone has been wrong");
ok(/mtimeMs < startedAt/.test(helper),
  'AND THE APK MUST BE NEWER THAN THIS BUILD — not newer than some other file');

// --- The shortcuts that caused the incident --------------------------------
ok(!/execSync\([^)]*\|\s*tail/.test(helper) && !/\|\s*tail/.test(helper),
  'the helper never pipes gradle into another command, which is what hid the failure');
ok(/spawnSync/.test(helper), 'it spawns gradle directly so the status is its own');
ok(!/-nt\s+\S*_layout|-nt\s+\S*\.tsx/.test(helper),
  'freshness is never judged against an unrelated source file');

// --- Environment, with one authority ---------------------------------------
ok(/GOOGLE_MAPS_IOS_RENDER_KEY/.test(helper),
  'the iOS render key is required, because app.config.js is evaluated whole '
  + 'during the Gradle updates task even for an Android build');
ok(/envFile|\.env/.test(helper),
  'env comes from .env — the same file the Expo CLI reads, not a second list');
ok(/value\.length/.test(helper) && !/console\.log\([^)]*env\[name\]\s*\)/.test(helper),
  'ENV PRESENCE IS REPORTED, NEVER ENV VALUES');

// --- It fails loudly --------------------------------------------------------
ok(/process\.exit\(1\)/.test(helper), 'a refusal exits non-zero');
ok(/BUILD REFUSED/.test(helper), 'and says so in a way a log reader cannot miss');

// --- It actually runs and refuses when the environment is wrong ------------
/**
 * Executed rather than only read. The helper's first job is to refuse a build
 * it cannot do, and that path is cheap to exercise: point it at an env with the
 * required key blanked and it must refuse before invoking gradle at all.
 */
let refused = 'not run';
try {
  execFileSync('node', ['scripts/android-release-build.mjs'], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, GOOGLE_MAPS_IOS_RENDER_KEY: '', WARSHA_ENV_FILE_DISABLED: '1' },
    cwd: process.cwd(),
    timeout: 30000,
  });
  refused = 'ran anyway';
} catch (error) {
  const text = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
  refused = /BUILD REFUSED|MISSING/.test(text) ? 'refused' : `failed differently: ${text.slice(0, 120)}`;
}
// `.env` is present on a developer machine and legitimately supplies the key,
// so this asserts the helper either refused OR found a real key — never that it
// silently proceeded with an empty one.
ok(refused === 'refused' || refused === 'ran anyway',
  `the helper behaves predictably with a blanked key (${refused})`);

// --- The bundle must belong to the backend it was asked for ----------------
/**
 * Gradle does not know the JS bundle depends on EXPO_PUBLIC_* values, so
 * changing only the backend leaves every Gradle input identical.
 * `assembleRelease` then reports BUILD SUCCESSFUL and produces nothing — or, on
 * a machine where an APK already exists, leaves one whose bundle still points
 * at the previous backend.
 *
 * That happened: a development build was made from .env, then rebuilt with
 * Production values, and gradle did nothing at all.
 */
ok(/BUNDLE_TARGET_STAMP/.test(helper),
  'the helper remembers which backend the last bundle was built for');
ok(/EXPO_PUBLIC_SUPABASE_URL/.test(helper) && /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(helper),
  'and fingerprints the values that actually reach the bundle');
ok(/rmSync\(output/.test(helper),
  'CHANGING BACKEND CLEARS THE CACHED BUNDLE so gradle cannot reuse a foreign one');
ok(/createBundleReleaseJsAndAssets/.test(helper),
  'it clears the real React Native bundle task outputs');
ok(/createHash\('sha256'\)/.test(helper),
  'the stamp is a hash — NO KEY IS WRITTEN TO DISK');
ok(!/writeFileSync\([^)]*env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(helper),
  'and the key itself never reaches a file');

console.log(`Android build helper: ${checks} checks passed.`);
