/**
 * What the Android RELEASE build actually asks the person for.
 *
 * A permission list is a promise made on a store page, read by a Play policy
 * reviewer and by anybody who taps "App permissions" before installing. Warsha
 * shipped three it does not use, and none of them arrived through a decision:
 *
 *   * `SYSTEM_ALERT_WINDOW` — Expo's bare template writes it into every
 *     generated manifest under the comment "OPTIONAL PERMISSIONS, REMOVE
 *     WHATEVER YOU DO NOT NEED". Nothing removed it. The only code in the
 *     dependency graph that draws an overlay is React Native's
 *     `DebugOverlayController` and `expo-dev-menu`, both of which live in a
 *     debug source set, both of which check `Settings.canDrawOverlays()` first.
 *     No release path wants it.
 *   * `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` — the same template,
 *     widened by `expo-image-picker` and `expo-file-system` declaring them
 *     uncapped. They grant nothing from Android 13 onwards, where the platform
 *     replaced them with `READ_MEDIA_*`.
 *
 * `RECORD_AUDIO` was the fourth and was removed on its own, earlier.
 *
 * ## Why this models the merge instead of reading a merged manifest
 *
 * `/android` is generated and git-ignored, so a clean checkout has no manifest
 * to read and a test that read one would pass vacuously. The byte-level merged
 * artifact only exists after a Gradle run with a JDK 17 toolchain, which is not
 * something a deterministic suite should require.
 *
 * So this reads the four real inputs — Expo's template, `app.json`, the plugin,
 * and every library manifest in `node_modules` — and applies the two manifest
 * merger rules Warsha depends on:
 *
 *   1. `tools:node="remove"` in the application manifest removes the element
 *      from the merged result, including every library's contribution.
 *   2. an attribute the application manifest declares and no library manifest
 *      contradicts survives into the merged element.
 *
 * Debug source sets are excluded, because a release variant does not merge
 * them. That is the whole reason `SYSTEM_ALERT_WINDOW` is a template problem
 * and not a React Native problem.
 *
 * What this catches that reading a manifest would not: a dependency bump that
 * adds a permission. `expo-image` contributes `ACCESS_NETWORK_STATE` today and
 * `app.json` has never mentioned it; the next upgrade that adds a fifth
 * permission fails here rather than on a store listing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const check = (condition: unknown, message: string) => { checks += 1; assert.ok(condition, message); };
const equal = <T,>(actual: T, expected: T, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const permissionNames = (xml: string) =>
  [...xml.matchAll(/<uses-permission\b[^>]*android:name="android\.permission\.([A-Z_]+)"[^>]*>/g)]
    .map((match) => match[1]);

// ---------------------------------------------------------------------------
// 1. Every permission Warsha could possibly ship, and where it comes from
// ---------------------------------------------------------------------------
// The template is read out of the installed toolchain rather than restated, so
// an Expo upgrade that changes its optional list is visible here immediately.

const templateSource = read('node_modules/@expo/config-plugins/build/plugins/withAndroidBaseMods.js');
const templatePermissions = permissionNames(templateSource);
check(templatePermissions.includes('SYSTEM_ALERT_WINDOW'),
  'EXPO’S BARE TEMPLATE STILL VOLUNTEERS SYSTEM_ALERT_WINDOW');
check(/OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED/.test(templateSource),
  'and still labels its optional block as something an app is meant to prune');

const appConfig = JSON.parse(read('app.json')) as {
  expo: { android: { blockedPermissions: string[] }; plugins: unknown[] };
};
const blocked = new Set(appConfig.expo.android.blockedPermissions
  .map((name) => name.replace('android.permission.', '')));

const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
const libraryPermissions = new Map<string, string[]>();
for (const dependency of Object.keys(packageJson.dependencies)) {
  // Main source set only: a release variant never merges `src/debug`.
  const path = `node_modules/${dependency}/android/src/main/AndroidManifest.xml`;
  if (!existsSync(join(root, path))) continue;
  for (const name of permissionNames(read(path))) {
    libraryPermissions.set(name, [...(libraryPermissions.get(name) ?? []), dependency]);
  }
}

// ---------------------------------------------------------------------------
// 2. The release set, and a stated reason for every member
// ---------------------------------------------------------------------------
// Adding a line here is the deliberate act. Anything Warsha starts merging
// without one fails the comparison below rather than reaching a store listing.

const RELEASE_PERMISSIONS: Record<string, string> = {
  ACCESS_COARSE_LOCATION: 'expo-location places the map pin while choosing an address',
  ACCESS_FINE_LOCATION: 'expo-location places the map pin while choosing an address',
  ACCESS_NETWORK_STATE: 'expo-image (Glide) restarts image loads when connectivity returns',
  CAMERA: 'identity verification photographs and booking message attachments',
  INTERNET: 'every network call Warsha makes',
  POST_NOTIFICATIONS: 'expo-notifications; required from Android 13 to show any notification at all',
  READ_EXTERNAL_STORAGE: 'gallery attachment on Android 12 and older; capped below',
  VIBRATE: 'expo-haptics feedback',
  WRITE_EXTERNAL_STORAGE: 'gallery attachment on Android 12 and older; capped below',
};

const merged = new Set<string>([...templatePermissions, ...libraryPermissions.keys()]
  .filter((name) => !blocked.has(name)));

equal([...merged].sort(), Object.keys(RELEASE_PERMISSIONS).sort(),
  'THE RELEASE BUILD MERGES EXACTLY THE PERMISSIONS WARSHA HAS A REASON FOR');

// ---------------------------------------------------------------------------
// 3. The two that are gone, and why they can be
// ---------------------------------------------------------------------------

check(blocked.has('SYSTEM_ALERT_WINDOW'),
  'SYSTEM_ALERT_WINDOW IS BLOCKED, NOT MERELY UNUSED');
equal(libraryPermissions.get('SYSTEM_ALERT_WINDOW') ?? [], [],
  'and no library main source set asks for it, so nothing in release regresses');
check(existsSync(join(root, 'node_modules/react-native/ReactAndroid/src/debug/AndroidManifest.xml')),
  'the only manifest that wants an overlay is React Native’s DEBUG source set');
check(/Settings\.canDrawOverlays/.test(
  read('node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/devsupport/DebugOverlayController.kt')),
  'AND THAT DEBUG TOOLING ASKS canDrawOverlays() FIRST, SO REFUSING IT IS SAFE');

check(blocked.has('RECORD_AUDIO'), 'the microphone is still blocked');
equal(libraryPermissions.get('RECORD_AUDIO') ?? [], ['expo-camera'],
  'and expo-camera is still the only reason it would otherwise be merged');

// `expo-notifications` contributes two. One is essential and one is not.
//
// `POST_NOTIFICATIONS` is what `requestPermissionsAsync` asks for and what
// Android 13 requires before anything may be shown. Without it push is
// pointless.
//
// `RECEIVE_BOOT_COMPLETED` exists so the module's receiver can restore
// SCHEDULED LOCAL notifications after a reboot. Warsha schedules none — every
// notification it sends is a remote push, delivered through
// `ExpoFirebaseMessagingService`, which is unaffected — so the permission is
// blocked. The assertion below is the safety catch: the day somebody schedules
// a local notification, this fails and says to unblock it.
check(blocked.has('RECEIVE_BOOT_COMPLETED'),
  'THE BOOT PERMISSION IS BLOCKED, BECAUSE WARSHA SCHEDULES NO LOCAL NOTIFICATION');
equal((libraryPermissions.get('RECEIVE_BOOT_COMPLETED') ?? []), ['expo-notifications'],
  'and expo-notifications is the only thing that would have merged it');
// `git grep -l` exits 1 when it finds nothing, which is the passing case here.
let scheduling = '';
try {
  scheduling = execFileSync('git', ['grep', '-l', '-E',
    'scheduleNotificationAsync|presentNotificationAsync', '--', 'app', 'src', 'components'],
    { encoding: 'utf8' }).trim();
} catch {
  scheduling = '';
}
equal(scheduling, '',
  'NOTHING SCHEDULES A LOCAL NOTIFICATION — IF THAT CHANGES, UNBLOCK RECEIVE_BOOT_COMPLETED');
check(/from 'expo-notifications'/.test(read('src/notifications/push-registration.ts')),
  'while remote push, which needs neither, is what Warsha actually sends');

// ---------------------------------------------------------------------------
// 4. The storage cap is read off the library, not chosen
// ---------------------------------------------------------------------------
// `expo-image-picker` stops requesting both legacy permissions at TIRAMISU
// (API 33). Warsha caps at 32 because that is the last level the picker still
// asks on, and Warsha's three gallery entry points bail out when the request is
// refused — which is exactly what a permission absent from the manifest
// guarantees.
//
// If the library moves that threshold, this fails and the cap is revisited
// rather than silently becoming wrong.

const pickerModule = read('node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker/ImagePickerModule.kt');
check(/getMediaLibraryPermissions[\s\S]{0,200}Build\.VERSION_CODES\.TIRAMISU[\s\S]{0,120}emptyArray/.test(pickerModule),
  'EXPO-IMAGE-PICKER STILL STOPS ASKING FOR LEGACY STORAGE AT API 33');
check(/WRITE_EXTERNAL_STORAGE[\s\S]{0,160}READ_EXTERNAL_STORAGE/.test(pickerModule),
  'and still asks for BOTH below it, which is why neither may simply be removed');

const plugin = read('plugins/warsha-android-permissions.js');
check(/const LAST_LEGACY_STORAGE_SDK = '32'/.test(plugin),
  'the plugin caps at the level immediately below that threshold');
check(appConfig.expo.plugins.includes('./plugins/warsha-android-permissions'),
  'AND THE PLUGIN IS ACTUALLY REGISTERED, SO THE CAP REACHES THE MANIFEST');

for (const dependency of ['expo-image-picker', 'expo-file-system']) {
  const source = read(`node_modules/${dependency}/android/src/main/AndroidManifest.xml`);
  check(!/READ_EXTERNAL_STORAGE"[^>]*maxSdkVersion/.test(source.replace(/\s+/g, ' ')),
    `${dependency} still declares legacy storage uncapped, which is what the plugin is for`);
}

// Warsha's own callers, which are the reason removal below 33 is unsafe.
for (const file of ['app/conversation/[bookingId].tsx', 'app/provider-portfolio.tsx',
  'components/warsha/BookingDisputePanel.tsx']) {
  check(/requestMediaLibraryPermissionsAsync/.test(read(file)),
    `${file} still gates the gallery on the permission the cap preserves`);
}

// ---------------------------------------------------------------------------
// 5. When the generated project is present, it must agree
// ---------------------------------------------------------------------------
// `/android` is git-ignored, so this is an extra proof after a prebuild rather
// than a prerequisite. It is what turns the model above into an observation.

const generated = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(join(root, generated))) {
  const xml = read(generated);
  for (const name of ['SYSTEM_ALERT_WINDOW', 'RECORD_AUDIO']) {
    check(new RegExp(`android:name="android\\.permission\\.${name}" tools:node="remove"`).test(xml),
      `the generated manifest removes ${name}`);
  }
  for (const name of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
    check(new RegExp(`android:name="android\\.permission\\.${name}" android:maxSdkVersion="32"`).test(xml),
      `THE GENERATED MANIFEST CAPS ${name} AT 32`);
  }
} else {
  console.log('  (no generated android project — run `npx expo prebuild -p android` to also observe it)');
}

console.log(`Android release permissions: ${checks} checks passed.`);
