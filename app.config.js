// app.json remains the source of truth for everything static.
//
// The two Maps *render* keys are the one thing it cannot express: a static
// app.json does not interpolate `$VAR`, so the placeholders it carries would
// reach the native manifests verbatim. They are injected here instead, from
// .env locally and from EAS secrets at build time, and are never committed.
//
// These are publishable keys restricted at Google by package name / bundle id
// and scoped to the Maps SDK only. Everything billed per request goes through
// location-proxy with the separate server key. See
// docs/architecture/external-provider-registry.md.

const { existsSync } = require('node:fs');
const path = require('node:path');

const LOCAL_GOOGLE_SERVICES = path.join(__dirname, 'google-services.json');

/**
 * Is this EAS CLI reading the config locally only to learn the project id?
 *
 * Before a build is uploaded, EAS CLI evaluates this file twice. The first
 * evaluation exists solely to read `extra.eas.projectId`, and it runs with
 * EXPO_NO_DOTENV=1 and nothing in the environment but eas.json's `env` block.
 * The render keys cannot be present at that point — the project id it is
 * fetching is the input the environment-variable query needs, so the values
 * are structurally unavailable until after this evaluation has succeeded.
 *
 * Throwing there breaks every EAS command that reads the config, `eas
 * env:list` included, and produces no native artifact in exchange.
 *
 * EAS Build sets EAS_BUILD_RUNNER on every job and those built-ins are never
 * present locally, so it distinguishes the worker — where the environment's
 * variables *are* injected and the key is genuinely required — from this local
 * metadata read.
 */
function isEasLocalMetadataRead() {
  return process.env.EXPO_NO_DOTENV === '1' && !process.env.EAS_BUILD_RUNNER;
}

/**
 * Read a render key, or stop the build.
 *
 * A missing key is worse than a loud failure: the field would simply be absent
 * from the native manifest and the app would ship a grey, tileless map that no
 * test and no reviewer would necessarily catch. So this throws everywhere a
 * native artifact is actually produced — the EAS build worker, and any local
 * prebuild or run, where .env is loaded normally — and stands down only for
 * the metadata read described above.
 *
 * The message names the variable and never carries its value — this string
 * reaches CI logs and EAS build output.
 */
function requiredRenderKey(name) {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (isEasLocalMetadataRead()) return undefined;
  throw new Error(
    `${name} is missing or empty. The Google Maps render key must be present ` +
      `when the app config is evaluated: from .env locally, or from an EAS ` +
      `environment variable of the same name (visibility "Plain text" or ` +
      `"Sensitive") for cloud builds. ` +
      `See docs/operations/google-cloud-setup-runbook.md.`,
  );
}

/**
 * Where the Firebase Android config comes from.
 *
 * `google-services.json` carries the FCM sender id the Android build needs to
 * register a push token. It is not committed — it is retrieved with
 * `firebase apps:sdkconfig` and supplied to EAS as a file environment variable,
 * which arrives on the worker as a path in `GOOGLE_SERVICES_JSON`.
 *
 * Locally the file sits at the project root, so a prebuild or `run:android`
 * works without EAS.
 *
 * Fatal ONLY on the EAS build worker, which is narrower than the render keys
 * above and deliberately so.
 *
 * The first version threw everywhere except the EAS metadata read, and broke
 * CI immediately: the file is gitignored, so a checkout does not have it, and
 * CI legitimately reads this config several times — `expo config`, three
 * exports, the WPS-024 suite — none of which produce an Android binary or need
 * an FCM sender id. A guard that stops those is not protecting anything; it is
 * just refusing to run.
 *
 * `EAS_BUILD_RUNNER` is set on every EAS build job and never locally, so it
 * names the one context where a missing file genuinely matters: the native
 * artifact that would otherwise ship unable to register a push token and fail
 * silently at the one moment nobody is watching.
 */
function googleServicesFile() {
  const fromEas = process.env.GOOGLE_SERVICES_JSON;
  if (typeof fromEas === 'string' && fromEas.trim() !== '') return fromEas;
  if (existsSync(LOCAL_GOOGLE_SERVICES)) return LOCAL_GOOGLE_SERVICES;
  if (!process.env.EAS_BUILD_RUNNER) return undefined;
  throw new Error(
    'google-services.json is missing on the build worker. Android push '
      + 'registration needs it. Provide it to EAS as a file environment '
      + 'variable named GOOGLE_SERVICES_JSON in this build profile\'s '
      + 'environment. See docs/operations/google-cloud-setup-runbook.md.',
  );
}

/**
 * Which commit this binary was built from.
 *
 * On 2026-09-11 a header that had been removed from the chrome on 2026-09-08
 * was photographed on a real phone. Answering "is that build stale?" took a
 * trace through source, git history, four migrations of the component and the
 * contents of an APK bundle, because nothing in the product says which commit
 * it is running. The web has answered this since it shipped — `/api/health`
 * returns `commit` — and native answered it nowhere.
 *
 * `runtimeVersion` is `{ policy: "appVersion" }` and the app version has been
 * 1.0.0 throughout, so every build Warsha has ever produced shares one runtime
 * version and one `versionCode`. Nothing distinguishes them on a device, and an
 * over-the-air update published against 1.0.0 is considered compatible with all
 * of them. This does not change that — it makes it visible, which is the part
 * that was missing when somebody needed to know.
 *
 * `dirty` is here for the same reason the health endpoint carries it: a SHA
 * names the commit, and says nothing about whether the tree had uncommitted
 * work when the artifact was produced.
 *
 * It never throws. A source tarball has no git, CI checkouts vary, and a build
 * that fails because it could not label itself would be a worse outcome than an
 * unlabelled build.
 */
function buildStamp() {
  const { execFileSync } = require('node:child_process');
  const git = (args) => {
    try {
      return execFileSync('git', args, {
        cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  };
  const fromEas = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  const commit = (typeof fromEas === 'string' && fromEas.trim() !== '')
    ? fromEas.trim().slice(0, 7)
    : git(['rev-parse', '--short', 'HEAD']);
  const status = git(['status', '--porcelain']);
  return {
    commit: commit || null,
    dirty: status === null ? null : status !== '',
    builtAt: new Date().toISOString(),
  };
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    build: buildStamp(),
  },
  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey: requiredRenderKey('GOOGLE_MAPS_IOS_RENDER_KEY'),
    },
  },
  android: {
    ...config.android,
    googleServicesFile: googleServicesFile(),
    config: {
      ...config.android?.config,
      googleMaps: {
        ...config.android?.config?.googleMaps,
        apiKey: requiredRenderKey('GOOGLE_MAPS_ANDROID_RENDER_KEY'),
      },
    },
  },
});
