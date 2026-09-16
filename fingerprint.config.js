/**
 * What the fingerprint runtime version is allowed to depend on.
 *
 * `runtimeVersion: { policy: "fingerprint" }` makes the runtime version a hash of
 * everything that can change the native layer, so an over-the-air update applies
 * only to binaries it is actually compatible with. That promise has two halves:
 * a native change must move the hash, and nothing else may.
 *
 * On 2026-09-16 the second half was broken, by the build stamp. `app.config.js`
 * puts `extra.build = { commit, dirty, builtAt }` into the evaluated config so a
 * binary can say which commit it came from, and the fingerprint hashes the
 * evaluated config. Two fingerprints generated seconds apart came out different
 * (49237f0d… and 19cfbaac…), with the `expoConfig` source as the only input that
 * moved. Every build would have been its own runtime version, and no update could
 * ever have applied to any binary — the opposite of what the policy is for.
 *
 * - `ExpoConfigExtraSection`: `extra` carries the build stamp and the EAS project
 *   id. Neither changes the native runtime.
 * - `ExpoConfigVersions`: `version`, `versionCode` and `buildNumber` identify a
 *   release; they do not describe native compatibility. Hashing them would turn
 *   every `autoIncrement` build into a new runtime version for the same reason.
 *
 * Everything else stays in: config plugins, autolinking, the native config the
 * plugins write, icons, `google-services.json`, `eas.json`, `.gitignore`. See
 * docs/operations/release-management-runbook.md for what that means in practice.
 */
module.exports = {
  sourceSkips: ['ExpoConfigExtraSection', 'ExpoConfigVersions'],
};
