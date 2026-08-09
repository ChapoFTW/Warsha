# QA / Preview distribution

Preview is Warsha's routine product-QA installation. It is a standalone internal
release: **No Expo Go**, **No Metro**, no developer PC, and no shared Wi-Fi are
required. It talks to hosted `warsha-development`, never local Docker and never
the future Production backend.

## For testers

1. Open the Android EAS build link supplied with the QA release and install the
   APK. Android may ask once for permission to install from that browser.
2. Open Warsha normally from the launcher. Expo Go is not involved.
3. Test over any Wi-Fi or mobile-data connection. The developer computer may be
   switched off.
4. OTA-compatible updates are checked on application launch, downloaded in the
   background, and normally become active on the next full reopen.
5. When engineering announces a **New Preview build**, install the new APK. An
   OTA update cannot add native code or change native configuration.

Manual remote acceptance is still evidence that must be recorded. A successful
cloud build proves distribution architecture, not a tester's network or device.

## Lane map

| Lane | Binary | Channel | EAS environment | Backend |
| --- | --- | --- | --- | --- |
| Development | development client | `development` | `development` | `warsha-development` |
| Preview / QA | internal release APK/ad hoc | `preview` | `preview` | `warsha-development` |
| Production | future store release | `production` | `production` | future Production project |

The EAS Preview environment is pinned by a value-safe check to Supabase project
`lrhipbcapzfxuwixfoog`. It must contain the public Supabase URL/publishable key,
Supabase data mode, and Android/iOS Maps render variables. Server Maps,
service-role, database, signing, and provider credentials must never be present
in the client environment.

## Routine engineering workflow

1. Implement and validate the change.
2. Classify it:

   - **OTA-compatible:** JS, TS, styles, or assets whose native declarations did
     not change.
   - **New Preview build:** Expo/React Native or native package change; config
     plugin; permission; AndroidManifest/Info.plist value; Maps native config;
     Camera, Location, ImagePicker, SecureStore, splash, icon, launcher locale,
     package/bundle identifier, or other native/config change.

3. For an OTA-compatible change, run:

   `npm run qa:update -- --ota-compatible --message "Concise QA change"`

   The explicit flag records a human/agent compatibility decision; the script
   does not pretend native-change detection is infallible. It validates, checks
   Preview environment isolation, requires a clean pushed release commit, and
   can publish only to the `preview` channel with the `preview` environment.

4. For a native/config change, deliberately increment `expo.version`, commit
   and push, then run:

   `npm run qa:build:android`

5. Every QA release records the app/build version, runtime version, build or
   update ID, commit, change summary, and whether testers need a new install.

`runtimeVersion.policy = appVersion`. Keeping the same app version is therefore
an assertion that the native runtime is compatible. A native change without an
app-version bump is a release error.

## Status and validation

- `npm run qa:status` validates static lane isolation and the remote Preview EAS
  environment without printing values.
- `npm run qa:validate` runs types, lint, encoding, migration/secret audits,
  relevant auth/WPS/navigation suites, Expo Doctor, Android/iOS/Web exports, and
  an exported-bundle credential scan.
- Preview validation rejects local/private Supabase endpoints and Mock mode.

## Rollback

- Bad OTA: identify the latest Preview update group and run
  `eas update:rollback <GROUP_ID> --platform all --message "Preview rollback"`.
  This republishes the prior compatible update or the embedded binary update.
- Bad native build: stop sharing its install link and direct testers to the
  previous known-good APK. Build a corrected version; do not overwrite history.
- Production is never a rollback destination and is never touched by QA tools.

## iOS Preview

The profile is ready for EAS internal/ad-hoc distribution. It requires an Apple
Developer team plus registered tester devices, certificates, and provisioning.
If those do not exist, stop at Apple enrollment/device registration; never
bypass signing. TestFlight is a later alternative when App Store Connect is
available.

## Web QA

Static Web export is validated with the same Preview client configuration and
does not depend on Metro. No hosting provider has been selected in this
repository, so Web QA is not deployed until that explicit hosting decision is
made. Do not silently introduce a vendor.
