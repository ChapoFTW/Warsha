/**
 * WPS-024 server-side credential boundary.
 *
 * Every external credential Warsha holds is read here and nowhere else. Three
 * rules, all enforced by construction rather than by convention:
 *
 *   1. A credential is read from `Deno.env` at CALL TIME. It is never a module
 *      constant, so it cannot be captured in a build artefact.
 *   2. A missing credential returns `null`. It never falls back to a default,
 *      a demo key, or an empty string that a provider would reject with a
 *      confusing error — the caller reports "unavailable" and the worker gets
 *      the manual path.
 *   3. Nothing here ever returns a credential to a caller outside this
 *      directory. `describe()` returns the NAME and whether it is present.
 *
 * The names are the same strings recorded in
 * `private.external_providers.credential_secret_name`, and the regression
 * suite asserts the two lists match — so a secret this file reads that the
 * registry does not know about is a test failure.
 */

/**
 * The one Deno global this module touches, declared module-locally.
 *
 * The Edge Function entry points are excluded from the app tsconfig because
 * they are a different runtime. This file is portable TypeScript apart from
 * one call, so it stays in scope and declares what it needs rather than
 * pulling an ambient Deno namespace into the whole application, where it
 * would mask a real error in app code that referenced Deno by mistake.
 */
declare const Deno: { env: { get(name: string): string | undefined } };

export const PROVIDER_SECRET_NAMES = {
  visionServiceAccount: 'GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT',
  mapsServerKey: 'GOOGLE_MAPS_SERVER_KEY',
  supabaseServiceRole: 'SUPABASE_SERVICE_ROLE_KEY',
  supabaseUrl: 'SUPABASE_URL',
} as const;

export type ProviderSecretName = keyof typeof PROVIDER_SECRET_NAMES;

/** The value, or null when it is not configured. Never a placeholder. */
export function readSecret(name: ProviderSecretName): string | null {
  const raw = Deno.env.get(PROVIDER_SECRET_NAMES[name]);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Whether a secret is configured, without reading it into a caller's scope. */
export function hasSecret(name: ProviderSecretName): boolean {
  return readSecret(name) !== null;
}

/**
 * Safe to log and safe to return: the name and whether it is set.
 *
 * Existence is not sensitive; the value is. This is what lets the provider
 * registry surface say "GOOGLE_MAPS_SERVER_KEY: not configured" without any
 * path existing that could say what it is.
 */
export function describeSecrets(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(PROVIDER_SECRET_NAMES) as ProviderSecretName[]) {
    out[PROVIDER_SECRET_NAMES[key]] = hasSecret(key);
  }
  return out;
}

/**
 * Strip anything credential-shaped out of a value before it is logged.
 *
 * Providers put keys in error messages. Google Cloud returns the request URL
 * on a 400, and that URL carries `?key=…`. Logging a provider error verbatim
 * is one of the most common ways a key reaches a log aggregator, so every
 * error surface in this directory routes through here.
 */
export function redact(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value);
  return text
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[REDACTED PRIVATE KEY]')
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[REDACTED]"')
    .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED JWT]');
}
