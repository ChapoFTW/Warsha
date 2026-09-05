#!/usr/bin/env node
/**
 * Does the identity provider's sign-in limit actually bite?
 *
 * ## Why this is a probe and not a test
 *
 * `[auth.rate_limit]` in `supabase/config.toml` is the only place Warsha can
 * declare what GoTrue allows before a request reaches any SQL. The CLI does not
 * validate that section: a deliberate `not_a_real_key = 99` was accepted without
 * complaint, and an unrecognised key is dropped silently. So a block written
 * there is a claim, not a control, until something drives real requests at it.
 *
 * This drives real requests at it. It cannot live in the deterministic suite,
 * because it needs a running local stack — hence a probe, run by hand:
 *
 *     npx supabase start
 *     node scripts/auth-rate-limit-probe.mjs
 *
 * ## What it found the first time it was run
 *
 * Forty consecutive failed password sign-ins returned forty 400s and not one
 * 429. Reading the container explained why: `sign_in_sign_ups = 30` produced no
 * GoTrue setting at all, while `sms_sent`, `anonymous_users`, `token_refresh`
 * and `token_verifications` each arrived intact. The sign-in brute-force limit
 * is the one that cannot be declared through this file at CLI 2.116.0.
 *
 * It signs in with addresses that belong to nobody and a password that is wrong
 * on purpose, against a local container. It never touches a hosted project, and
 * there is no real account for it to lock out.
 */
import { execFileSync, execSync } from 'node:child_process';

const ATTEMPTS = 40;

function localStack() {
  // execSync rather than execFileSync with `shell: true`: passing an argument
  // array through a shell concatenates without escaping, which Node warns about.
  const raw = execSync('npx supabase status -o json', {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  // `status` prints human-readable lines before the JSON — a stopped-services
  // notice, a login-role message — and `-o json` pretty-prints across many
  // lines, so neither "starts with an object" nor "one line is the object"
  // holds. Take everything between the first brace and the last.
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('Could not read local stack status. Is `npx supabase start` running?');
  }
  const status = JSON.parse(raw.slice(first, last + 1));
  return { url: status.API_URL, key: status.ANON_KEY ?? status.PUBLISHABLE_KEY };
}

function gotrueLimits() {
  try {
    const env = execFileSync('docker', [
      'inspect', 'supabase_auth_warsha',
      '--format', '{{range .Config.Env}}{{println .}}{{end}}',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return env.split(/\r?\n/).filter(line => /RATE_LIMIT/.test(line)).sort();
  } catch {
    return [];
  }
}

const { url, key } = localStack();
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`Refusing to probe a non-local target: ${url}`);
}

console.log(`Probing ${url} with ${ATTEMPTS} failed sign-ins.\n`);

const limits = gotrueLimits();
console.log(limits.length
  ? `What GoTrue actually received:\n  ${limits.join('\n  ')}\n`
  : 'Could not read the auth container environment.\n');

const counts = {};
let firstLimited = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `nobody-${attempt}@warsha-probe.local`,
      password: 'WrongPassword!234',
    }),
  });
  counts[response.status] = (counts[response.status] ?? 0) + 1;
  if (response.status === 429 && firstLimited === null) firstLimited = attempt;
}

console.log('Response codes:', JSON.stringify(counts));
if (firstLimited === null) {
  console.log(`\nNo 429 in ${ATTEMPTS} attempts: the sign-in surface is NOT rate limited here.`);
  console.log('That is the documented state — see the [auth.rate_limit] comment in supabase/config.toml.');
} else {
  console.log(`\nFirst 429 at attempt ${firstLimited}: the sign-in limit is enforced.`);
  console.log('If this is new, update the [auth.rate_limit] comment in supabase/config.toml —');
  console.log('it currently records that this limit could not be declared.');
}
