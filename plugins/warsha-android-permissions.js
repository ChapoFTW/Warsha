/**
 * Cap the two legacy Android storage permissions at the last SDK level that
 * still uses them.
 *
 * ## What is actually merged, and by whom
 *
 * `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` reach Warsha's merged
 * manifest from three libraries, none of which Warsha can edit:
 *
 *   * `expo-image-picker` — both, uncapped
 *   * `expo-file-system`  — both, uncapped
 *   * `expo-image`        — read only, already capped at 32
 *
 * The manifest merger takes the widest declaration it is given, so the two
 * uncapped contributions win and the app ships a release manifest asking every
 * Android version for legacy storage access — including Android 13 and newer,
 * where the permissions were replaced by `READ_MEDIA_*` and grant nothing at
 * all. A permission that grants nothing is not harmless: it is listed on the
 * store page, it is read by reviewers, and it is exactly the sort of thing a
 * Play policy review asks about.
 *
 * ## Why 32 and not 28, and why they are not simply blocked
 *
 * The temptation is to delete both outright, or to cap `WRITE` at 28 where
 * scoped storage made it inert. Both would break photo attachment on real
 * devices, and the evidence is in `expo-image-picker`'s own source
 * (`ImagePickerModule.kt`):
 *
 *     private fun getMediaLibraryPermissions(writeOnly: Boolean): Array<String> =
 *       if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
 *         emptyArray<String>()
 *       } else {
 *         listOfNotNull(WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE...)
 *       }
 *
 * Below API 33 it asks for BOTH at runtime, `WRITE` included, whatever scoped
 * storage does with it afterwards. Warsha calls
 * `requestMediaLibraryPermissionsAsync()` before opening the gallery in the
 * conversation, the worker portfolio and the dispute panel, and each one bails
 * out on `!permission.granted`. A permission absent from the manifest can never
 * be granted, so removing either one below 33 turns "attach a photo" into a
 * button that silently does nothing — on every Android 7 to 12 device, which in
 * Egypt is not a rounding error.
 *
 * 33 is the exact line the library itself draws. Capping at 32 is therefore
 * provably behaviour-preserving: identical on API 24-32, absent on 33+.
 *
 * `blockedPermissions` cannot express this — it only removes — which is why
 * this is a plugin and `SYSTEM_ALERT_WINDOW` is not.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * The last SDK level on which anything in Warsha asks for these.
 * See the reasoning above before changing it: this number is read off
 * `expo-image-picker`'s source, not chosen.
 */
const LAST_LEGACY_STORAGE_SDK = '32';

const CAPPED = new Set([
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

module.exports = function withWarshaAndroidPermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    for (const permission of manifest['uses-permission'] ?? []) {
      const name = permission.$?.['android:name'];
      if (!CAPPED.has(name)) continue;
      permission.$['android:maxSdkVersion'] = LAST_LEGACY_STORAGE_SDK;
    }
    return modConfig;
  });
};
