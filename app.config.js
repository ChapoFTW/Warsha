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

/**
 * Read a render key, or stop the build.
 *
 * A missing key is worse than a loud failure: the field would simply be absent
 * from the native manifest and the app would ship a grey, tileless map that no
 * test and no reviewer would necessarily catch. So this throws.
 *
 * The message names the variable and never carries its value — this string
 * reaches CI logs and EAS build output.
 */
function requiredRenderKey(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `${name} is missing or empty. The Google Maps render key must be present ` +
        `when the app config is evaluated: from .env locally, or from an EAS ` +
        `secret of the same name for cloud builds. ` +
        `See docs/operations/google-cloud-setup-runbook.md.`,
    );
  }
  return value;
}

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey: requiredRenderKey('GOOGLE_MAPS_IOS_RENDER_KEY'),
    },
  },
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        ...config.android?.config?.googleMaps,
        apiKey: requiredRenderKey('GOOGLE_MAPS_ANDROID_RENDER_KEY'),
      },
    },
  },
});
