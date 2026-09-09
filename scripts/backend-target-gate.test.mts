/**
 * The gate that stops a certification run from testing the wrong system.
 *
 * The defect this guards against does not fail. That is the whole point. A
 * Production run driven against a Development build produces screenshots, an
 * accessibility tree, a green summary and a certification claim — all of them
 * real artefacts about a project nobody meant to touch, and none of them
 * distinguishable afterwards from the genuine article.
 *
 * It happened. An hour went into "professionals cannot sign in" before the
 * cause turned out to be `.env` holding the Development project while the
 * account existed only in Production. That hour was the cheap version; the
 * expensive version is the one where nothing looks wrong.
 *
 * So what is asserted here is mostly refusal — that the gate says no in every
 * direction, including the ones somebody would reach for to make it stop
 * complaining. The device-dependent paths are exercised by the flows
 * themselves; what a unit test can prove is that the refusals exist, that the
 * artefact is the authority, and that no override was left in.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const GATE = 'scripts/android-e2e/backend-target.mjs';
const AUTHORITY = 'scripts/warsha-projects.mjs';
const source = `${readFileSync(GATE, 'utf8')}\n${readFileSync(AUTHORITY, 'utf8')}`;

/** Comments explain the constructs below, and have matched them before. */
const stripComments = (text: string) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

const code = stripComments(source);

// --- The projects are named, not inferred -----------------------------------
const { PROJECTS } = await import('../scripts/warsha-projects.mjs');

equal(PROJECTS.production, 'ekgwzljpcxpxnklzxuvj', 'Production is the project the owner named');
equal(PROJECTS.development, 'lrhipbcapzfxuwixfoog', 'Development is a distinct project');
ok(PROJECTS.production !== PROJECTS.development, 'the two environments are not the same project');

// --- Both directions refuse -------------------------------------------------
// A Production run must prove Production. A Development run must refuse a
// Production target — that direction protects real data from a test that
// believes it is disposable, and it is the one an asymmetric gate omits.
ok(
  /target\.ref !== PROJECTS\[expect\]/.test(code),
  'the comparison is against the expected environment, not hard-coded to Production',
);
ok(
  !/expect === ['"]production['"]/.test(code),
  'the gate does not special-case Production, which would leave Development ungated',
);

// --- Inability to prove is a refusal, never a pass ---------------------------
ok(
  /catch[\s\S]{0,400}?REFUSING[\s\S]{0,400}?process\.exit\(2\)/.test(code),
  'a target that cannot be resolved stops the run',
);
for (const failure of [
  'is not installed on the device',
  'could not hash the installed APK',
  'could not pull the installed APK',
  'no Supabase project URL found',
]) {
  ok(source.includes(failure), `it throws rather than guessing when: ${failure}`);
}
ok(
  !/return\s*\{\s*ref:\s*['"]/.test(code),
  'no default ref is ever returned',
);

// --- An unrecognised project is not "probably fine" --------------------------
ok(
  /export function environmentForRef[\s\S]{0,300}?\?\?\s*null/.test(code),
  'a project that is on neither list resolves to null, not to a guess',
);
const { environmentForRef } = await import('../scripts/warsha-projects.mjs');
equal(environmentForRef('aaaaaaaaaaaaaaaaaaaa'), null, 'an unknown ref belongs to no environment');
equal(environmentForRef(PROJECTS.production), 'production', 'a known ref is named');
ok(
  source.includes('UNRECOGNISED PROJECT'),
  'an unrecognised ref is reported as such rather than shown as a bare string',
);

// --- The artefact is the authority ------------------------------------------
// `.env` describes the build that WOULD be made next. The bundle inside the
// installed APK describes the one that is running. Reading the wrong one is
// the original defect, so the gate must not consult the environment at all.
ok(
  /pm path/.test(code),
  'the APK is located on the device, not taken from a path someone supplied',
);
ok(
  !/EXPO_PUBLIC_SUPABASE_URL/.test(code),
  'the gate never reads the build-time environment variable',
);
ok(
  !/WARSHA_SUPABASE_URL|WARSHA_SUPABASE_KEY/.test(code),
  'the CI credential override is deliberately not honoured here',
);
ok(
  !/dotenv|readFileSync\(['"]\.env/.test(code),
  'the gate never reads .env',
);
ok(
  /index\.android\.bundle/.test(code),
  'the project ref comes out of the JavaScript bundle the app executes',
);

// --- The cache cannot go stale ----------------------------------------------
// Size and mtime would be cheaper and would defeat the gate: a reinstall of a
// different build can land with both unchanged.
ok(/md5sum/.test(code), 'the cache key is the APK content, hashed on the device');
ok(
  !/stat -c|%s%Y|mtime/.test(code),
  'the cache key is not size or modification time',
);
ok(
  /\$\{digest\}\.json/.test(code),
  'the cached answer is filed under the content hash it describes',
);

// --- Credentials cannot be separated from their project ----------------------
// Holding the credential and checking the device are one operation, because
// the gap between them is where the original hour was lost.
ok(
  /export function loadQaCredentials/.test(code),
  'there is one way to load QA credentials',
);
ok(
  /loadQaCredentials[\s\S]{0,1200}?assertBackendTarget\(\{ expect: creds\.environment/.test(code),
  'loading credentials asserts the device matches the environment they belong to',
);
ok(
  /!creds\.environment[\s\S]{0,300}?process\.exit\(2\)/.test(code),
  'a credential file that does not name its environment is refused',
);

// --- The flow that uses Production credentials is actually gated -------------
const pushProof = readFileSync('scripts/android-e2e/flows/push-proof.mjs', 'utf8');
ok(
  pushProof.includes('loadQaCredentials'),
  'the push proof loads its credentials through the gate',
);
ok(
  !/readFileSync\(['"]D:\/Warsha-Temp\/qa-worker\.json/.test(pushProof),
  'the push proof no longer reads the credential file directly, bypassing the gate',
);

// Nothing else may read that file directly either, or the gate has a hole.
// Comments are stripped first. Four earlier assertions in this repository
// matched the prose explaining a construct rather than the construct, and
// `launch-compat.mjs` genuinely does mention this file — to say it deliberately
// does NOT use it.
const { execFileSync } = await import('node:child_process');
const mentions = execFileSync('git', ['grep', '-l', 'qa-worker.json', '--', 'scripts/'], {
  encoding: 'utf8',
}).trim().split(/\r?\n/).filter(Boolean);

const readsItInCode = mentions.filter((path) => {
  if (path.endsWith('warsha-projects.mjs') || path.endsWith('.test.mts')) return false;
  return stripComments(readFileSync(path, 'utf8')).includes('qa-worker.json');
});
equal(
  readsItInCode,
  [],
  'warsha-projects.mjs is the only script whose CODE names the credential file',
);

// --- The host-side refusal, actually executed --------------------------------
// Everything above reads the source. This runs it. `assertCredentialProject`
// needs no device, so its behaviour — not merely its shape — is provable here,
// and behaviour is what a gate is judged on.
const decide = (environment: string, url: string) => {
  const program = [
    "import { assertCredentialProject } from './scripts/warsha-projects.mjs';",
    `assertCredentialProject({ creds: { environment: ${JSON.stringify(environment)} },`,
    ` url: ${JSON.stringify(url)}, purpose: 'a test' });`,
    "console.log('accepted');",
  ].join('');
  try {
    execFileSync('node', ['--input-type=module', '-e', program], { encoding: 'utf8', stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
};

const PROD_URL = `https://${PROJECTS.production}.supabase.co`;
const DEV_URL = `https://${PROJECTS.development}.supabase.co`;

equal(decide('production', PROD_URL), 0, 'Production credentials are accepted against Production');
equal(decide('development', DEV_URL), 0, 'Development credentials are accepted against Development');
equal(decide('production', DEV_URL), 2, 'Production credentials are REFUSED against Development');
equal(decide('development', PROD_URL), 2, 'Development credentials are REFUSED against Production');
equal(
  decide('production', 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'),
  2,
  'an unrecognised project is refused rather than assumed harmless',
);
equal(decide('production', 'not-a-url'), 2, 'a URL that names no project is refused');

// And the host-side scripts check the account against the project, which
// resolving the key from the build does not do on its own.
for (const flow of ['scripts/push-e2e/preflight.mjs', 'scripts/push-e2e/backend-state.mjs']) {
  const body = readFileSync(flow, 'utf8');
  ok(body.includes('loadCredentials'), `${flow} loads credentials through the authority`);
  ok(
    body.includes('assertCredentialProject'),
    `${flow} refuses when the account and the project disagree`,
  );
}

console.log(`ok  backend-target gate — ${checks} checks`);
