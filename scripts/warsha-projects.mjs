/**
 * Which Supabase project is which, and which credentials belong to it.
 *
 * Warsha has two backends holding two different populations. The Production
 * synthetic QA account exists in one of them and not the other, and a test that
 * mixes them up does not report a mixup — it reports a product defect. That
 * happened, and cost an hour: "professionals cannot sign in" was true, correct,
 * reproducible, and about the wrong project.
 *
 * The expensive version of that mistake is the quiet one. A run that points
 * Production credentials at Development gets a clean refusal and someone
 * investigates. A run that points a Production CLAIM at a Development project it
 * can actually reach produces a green report about a system nobody meant to
 * exercise, and nothing downstream can tell the difference afterwards.
 *
 * So the mapping lives in one place, and a credential names the project it
 * belongs to. This module has no device dependency on purpose: the host-side
 * push scripts and the on-device certification flows have to agree about what
 * "production" means, and two definitions would eventually be one definition
 * and one stale copy.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * A ref that is on neither list is not "probably fine". It is unrecognised,
 * and unrecognised is a refusal.
 */
export const PROJECTS = {
  production: 'ekgwzljpcxpxnklzxuvj',
  development: 'lrhipbcapzfxuwixfoog',
};

/** The project ref inside a Supabase URL, or null if there isn't one. */
export function refFromUrl(url) {
  const match = String(url ?? '').match(/https:\/\/([a-z0-9]{20})\.supabase\.co/);
  return match ? match[1] : null;
}

/** Which environment a ref belongs to, or null when Warsha does not own it. */
export function environmentForRef(ref) {
  return Object.entries(PROJECTS).find(([, value]) => value === ref)?.[0] ?? null;
}

const DEFAULT_CREDENTIALS = 'D:/Warsha-Temp/qa-worker.json';

/**
 * Load synthetic QA credentials, refusing any that do not name their project.
 *
 * The `environment` field is mandatory rather than inferred. A credential with
 * no project is a credential that can be pointed at any project, which is the
 * whole defect.
 *
 * @param {{path?: string, purpose?: string}} options
 * @returns {{phone: string, password: string, environment: string}}
 */
export function loadCredentials({ path, purpose = 'this run' } = {}) {
  const resolved = path ?? process.env.WARSHA_QA_CREDENTIALS
    ?? process.env.WARSHA_QA_CREDS ?? DEFAULT_CREDENTIALS;

  if (!existsSync(resolved)) {
    console.error(`\nREFUSING ${purpose}: no QA credentials at ${resolved}`);
    process.exit(2);
  }

  const creds = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!creds.environment) {
    console.error(`\nREFUSING ${purpose}: ${resolved} does not say which environment it belongs to.`);
    console.error('  Add an "environment" field naming the project these credentials are for.');
    process.exit(2);
  }
  if (!(creds.environment in PROJECTS)) {
    console.error(`\nREFUSING ${purpose}: "${creds.environment}" is not a Warsha environment.`);
    process.exit(2);
  }
  return creds;
}

/**
 * Refuse unless the project about to be talked to is the credentials' own.
 *
 * For host-side scripts, where the project comes from a resolved URL rather
 * than from a device. On-device flows use `assertBackendTarget`, which proves
 * the same thing from the installed APK.
 *
 * @param {{creds: {environment: string}, url: string, purpose?: string}} options
 */
export function assertCredentialProject({ creds, url, purpose = 'this run' }) {
  const ref = refFromUrl(url);
  if (!ref) {
    console.error(`\nREFUSING ${purpose}: "${url}" does not name a Supabase project.`);
    process.exit(2);
  }
  if (ref !== PROJECTS[creds.environment]) {
    console.error(`\nREFUSING ${purpose}: these credentials do not belong to this project.`);
    console.error(`  credentials  ${creds.environment} (${PROJECTS[creds.environment]})`);
    console.error(`  resolved     ${environmentForRef(ref) ?? 'UNRECOGNISED PROJECT'} (${ref})`);
    console.error('');
    console.error('  A sign-in failure here would read as a product defect. It would not be one.');
    process.exit(2);
  }
  return ref;
}
