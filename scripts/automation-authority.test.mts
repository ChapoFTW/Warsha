/**
 * The Development automation authority, asserted against its own source.
 *
 * The runtime behaviour is proved in
 * `supabase/tests/database/development-automation-authority.test.sql`, which
 * actually puts the platform in production and watches the principal be
 * refused. This file guards the things a pgTAP suite cannot see: that the Edge
 * Function in front of the database does not leak the token, does not accept a
 * request without one, does not let a caller name an arbitrary RPC, and that no
 * credential of any kind reaches a client bundle.
 *
 * The load-bearing assertion in the whole file is the last group. Everything
 * else is a control; that group is the boundary.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const read = (path: string) => readFileSync(path, 'utf8');

const authority = read('supabase/migrations/202608280001_development_automation_authority.sql');
const surface = read('supabase/migrations/202608280002_automation_public_surface.sql');
const ocrSurface = read('supabase/migrations/202608280003_ocr_runtime_public_surface.sql');
const edge = read('supabase/functions/warsha-automation/index.ts');
const cli = read('scripts/warsha-automation-governance.mjs');
const config = read('supabase/config.toml');

// ---------------------------------------------------------------------------
// 1. The principal is a non-human actor, and the trail says so
// ---------------------------------------------------------------------------

check(/create table if not exists private\.automation_principals/.test(authority),
  'automation principals have a register of their own');
check(/check \(environment = 'development'\)/.test(authority),
  'A PRODUCTION AUTOMATION PRINCIPAL IS UNSTORABLE, NOT MERELY UNWRITTEN');
check(/actor_type in \('human', 'automation'\)/.test(authority),
  'the audit trail distinguishes the two kinds of actor');
check(/staff_audit_events_attribution_check/.test(authority)
  && /actor_type = 'automation'[\s\S]{0,120}actor_id is null/.test(authority),
  'AN AUTOMATION AUDIT ROW CANNOT NAME A HUMAN');
check(/'development_automation'/.test(authority)
  && /'owner_approved_development_policy'/.test(authority),
  'and records the governance mode and the basis it acted under');

// The principal is not allowed to decide anything about a person. This is
// asserted on the seeded capability list itself, not on prose about it.
const seeded = authority.slice(
  authority.indexOf("insert into private.automation_principals"),
  authority.indexOf('on conflict (principal_key) do nothing'));
for (const capability of [
  'manage_staff_roles', 'initiate_refund', 'approve_permanent_ban',
  'publish_legal_version', 'export_operational_report', 'review_worker_vetting',
]) {
  check(!seeded.includes(capability),
    'AUTOMATION HOLDS NO CAPABILITY THAT ADJUDICATES A PERSON OR MOVES MONEY');
}
for (const capability of [
  'manage_subprocessors', 'manage_feature_flags',
  'manage_kill_switches', 'review_legal_governance',
]) {
  check(seeded.includes(capability),
    'and holds exactly the routine development operations the owner authorised');
}

// ---------------------------------------------------------------------------
// 2. The environment boundary is checked first, and everywhere
// ---------------------------------------------------------------------------

const gate = authority.slice(
  authority.indexOf('create or replace function private.require_automation_capability'),
  authority.indexOf('comment on function private.require_automation_capability'));
const environmentCheck = gate.indexOf("v_environment <> 'development'");
const principalRead = gate.indexOf('from private.automation_principals');
check(environmentCheck > 0 && environmentCheck < principalRead,
  'THE ENVIRONMENT IS REFUSED BEFORE THE PRINCIPAL IS EVEN READ');
check(/Automation governance is available in development only/.test(authority),
  'and the refusal names the real reason');
check(/if v_config\.environment <> 'development' then/.test(authority),
  'the activation core re-checks it rather than trusting the caller');

// Every automation entry point goes through the gate. A new one that forgot to
// would be development-only by luck.
// The entry points are the ones a caller can name: those taking a principal
// key. The trigger function that validates the register is not one of them.
const entryPoints = [...authority.matchAll(
  /create or replace function private\.(automation_[a-z_]+)\(\s+p_principal_key text/g)]
  .map((m) => m[1]);
check(entryPoints.length >= 6, 'the automation entry points are found');
for (const name of entryPoints) {
  const body = authority.slice(
    authority.indexOf(`create or replace function private.${name}(`),
    authority.indexOf('$$;', authority.indexOf(`create or replace function private.${name}(`)));
  check(/require_automation_capability/.test(body),
    `EVERY AUTOMATION ENTRY POINT PASSES THE GATE (${name})`);
}

// ---------------------------------------------------------------------------
// 3. No browser reaches any of it
// ---------------------------------------------------------------------------

for (const source of [authority, surface, ocrSurface]) {
  check(/revoke all on function %s from public, anon, authenticated/.test(source),
    'every generated surface is revoked from anon and authenticated');
  check(/grant execute on function %s to service_role/.test(source),
    'and granted to the service role alone');
  check(!/grant execute on function private\.automation[^;]*to authenticated/.test(source),
    'NOTHING GRANTS AN AUTOMATION FUNCTION TO AN ORDINARY ACCOUNT');
}
check(/revoke all on table private\.automation_principals from public, anon, authenticated/
  .test(authority),
  'the principal register itself is unreadable by a browser');

// The public wrappers hold no authority: they forward and nothing else.
const wrapperBodies = [...surface.matchAll(
  /create or replace function public\.warsha_automation_[a-z_]+\([\s\S]*?\$\$([\s\S]*?)\$\$;/g)]
  .map((m) => m[1]);
check(wrapperBodies.length >= 7, 'the public wrappers are found');
for (const body of wrapperBodies) {
  check(/select private\.automation_/.test(body) || /select private\.platform_environment/.test(body),
    'a wrapper forwards to the private function and does nothing else');
  check(!/insert |update |delete |grant |revoke /i.test(body),
    'AND CARRIES NO LOGIC OF ITS OWN');
}

// ---------------------------------------------------------------------------
// 4. The Edge Function: the token, and what it never says
// ---------------------------------------------------------------------------

check(/\[functions\.warsha-automation\][\s\S]{0,200}verify_jwt = false/.test(config),
  'the automation function does its own authentication');
check(/WARSHA_DEVELOPMENT_AUTOMATION_TOKEN/.test(edge),
  'it reads the token from its own Edge secrets');
check(/configured\.length < 32/.test(edge),
  'AN UNCONFIGURED TOKEN REFUSES EVERYTHING RATHER THAN MATCHING AN EMPTY STRING');
check(/function tokensMatch/.test(edge) && /difference \|=/.test(edge),
  'the comparison is constant time, so the token cannot be guessed a byte at a time');
check(!/return early|difference === 0 \? true : false/.test(edge)
  && /difference = a\.length \^ b\.length/.test(edge),
  'and a wrong length is not distinguishable from a wrong byte');

// The token must not be able to escape in any response.
const responses = [...edge.matchAll(/json\(\{([\s\S]*?)\}, \d+\)/g)].map((m) => m[1]);
check(responses.length >= 5, 'the function responses are found');
for (const body of responses) {
  // A response may say WHETHER a secret is configured — existence is not
  // sensitive, and without it a 503 is undiagnosable without printing secrets.
  // What it may never do is carry the value. Presence expressions are removed
  // first, and then no reference to any of the three may remain.
  const values = body
    // Key positions are names a reader chose, not values a response carries.
    .replace(/^\s*\w+:/gm, '')
    // These say only whether something is set, which is the point of them.
    .replace(/Boolean\((?:url|serviceRole)\)/g, 'PRESENCE')
    .replace(/configured\.length >= 32/g, 'PRESENCE');
  check(!/\b(configured|presented|serviceRole|token)\b/.test(values),
    'NO RESPONSE CAN CARRY THE TOKEN, THE SERVICE ROLE OR THE PRESENTED VALUE');
}
check(/'Automation authorisation failed'/.test(edge),
  'a wrong token and a missing token get the same sentence');
equal((edge.match(/Automation authorisation failed/g) ?? []).length, 1,
  'and there is exactly one such sentence, so the two cannot drift apart');

// The action list is an allow-list, not a pass-through.
check(/const ACTIONS: Record<string, \{ rpc: string/.test(edge),
  'the callable actions are an explicit table');
check(/const definition = Object\.hasOwn\(ACTIONS, action\)[\s\S]{0,160}Unknown automation action/
  .test(edge),
  'AND A CALLER NAMES AN ACTION FROM IT, NEVER AN RPC');
check(!/rpc\(body\.|rpc\(action\)|rpc\(supplied/.test(edge),
  'nothing lets a request choose the function it calls');
check(/p_principal_key: PRINCIPAL_KEY/.test(edge),
  'the principal is the function’s, not the caller’s to name');

// ---------------------------------------------------------------------------
// 5. The credential never reaches a client, a log or a commit
// ---------------------------------------------------------------------------

check(/--env-file/.test(cli),
  'the token is handed to the CLI in a file, never on a command line');
check(/randomBytes\(48\)/.test(cli), 'and is generated at full width');
check(/createHash\('sha256'\)[\s\S]{0,80}slice\(0, 12\)/.test(cli),
  'only a truncated fingerprint is ever printed');
// What matters is whether the VARIABLE is printed, not whether the word
// appears. "Automation token provisioned." is a sentence; `${token}` is a leak.
// String and template literals are removed first, apart from interpolations.
const printed = [...cli.matchAll(/console\.log\(([^;]*)\);/g)].map((m) => m[1]);
for (const line of printed) {
  const code = line
    .replace(/`(?:[^`$\\]|\\.|\$(?!\{))*`/g, "''")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, "''");
  check(!/\btoken\b/.test(code) || /fingerprint\(/.test(code),
    'NO CONSOLE LINE IN THE CLI PRINTS A TOKEN');
}
// The token legitimately appears in exactly two kinds of place: written to a
// 0600 file, and sent as an Authorization header. Anywhere else is a leak, and
// enumerating the allowed uses is stricter than blocking a list of bad ones.
const tokenUses = cli.split('\n')
  .filter((line) => /\$\{token\}/.test(line));
check(tokenUses.length > 0, 'the token is used somewhere');
for (const line of tokenUses) {
  check(/writeFileSync\(|authorization: `Bearer /.test(line),
    'THE TOKEN IS ONLY EVER WRITTEN TO A 0600 FILE OR SENT AS A BEARER HEADER');
}
check(!/console\.(log|error)\([^;]*\$\{(token|raw|account\.private_key)\}/.test(cli),
  'and no console call interpolates a secret');
check(/mode: 0o600/.test(cli), 'the local token file is created unreadable by others');
check(/assertDevelopmentTarget\(\)/.test(cli),
  'the CLI refuses a non-development target before composing a request');
check(/EXPECTED_PROJECT_REF = 'lrhipbcapzfxuwixfoog'/.test(cli),
  'against the Development project ref by name');

// The one place the automation token could leak into the product is a bundle.
// It is not an EXPO_PUBLIC_ variable, and nothing in app code reads it.
for (const path of ['app.config.js', 'package.json']) {
  check(!read(path).includes('WARSHA_DEVELOPMENT_AUTOMATION_TOKEN'),
    'THE AUTOMATION TOKEN IS NOT WIRED INTO ANY BUILD INPUT');
}
check(read('.gitignore').split('\n').some((line) => line.trim() === '.env*'),
  'and the local copy lives in a gitignored file');

// ---------------------------------------------------------------------------
// 6. The OCR runtime reaches a schema PostgREST actually serves
// ---------------------------------------------------------------------------
//
// This is the defect that made the whole feature look switched off: the Edge
// Function called `private` directly, PostgREST refuses that schema, and every
// failure was swallowed into `refused_disabled`.

const vision = read('supabase/functions/vision-extract/index.ts');
check(!/schema\('private'\)/.test(vision),
  'VISION-EXTRACT NO LONGER CALLS A SCHEMA POSTGREST DOES NOT SERVE');
for (const rpc of [
  'warsha_ocr_provider_for_role', 'warsha_ocr_provider_enabled_for_role',
  'warsha_ocr_request_history', 'warsha_ocr_stored_candidates',
  'warsha_ocr_open_request', 'warsha_ocr_complete_request',
  'warsha_ocr_store_candidates', 'warsha_ocr_record_provider_health',
]) {
  check(vision.includes(rpc), `the runtime calls the reachable wrapper ${rpc}`);
  check(ocrSurface.includes(rpc), `and the wrapper exists (${rpc})`);
}
check(/notify pgrst, 'reload schema'/.test(ocrSurface)
  && /notify pgrst, 'reload schema'/.test(surface),
  'the schema cache is reloaded, or the wrappers are live and still 404');

// The credential check that made the real fault visible.
const provider = read('supabase/functions/_shared/google-vision-provider.ts');
check(/verifyCredential/.test(provider),
  'a present credential and a usable one are now different questions');
check(/'absent' \| 'malformed' \| 'rejected' \| 'unreachable'/.test(provider),
  'AND A REJECTED CREDENTIAL IS NO LONGER REPORTED AS AN ABSENT ONE');
check(/error_description/.test(provider),
  'the reason names why only the short code is returned');
check(!/console\.(log|error|warn)/.test(provider),
  'nothing in the provider logs anything at all');
check(/credentialShape/.test(provider)
  && /'not_json'/.test(provider) && /missing_fields/.test(provider),
  'a malformed credential says which kind of malformed, by key name only');
const shape = provider.slice(
  provider.indexOf('function credentialShape'),
  provider.indexOf('async function accessToken'));
check(!/parsed\[key\] as string\]/.test(shape) && /\.filter\(\(key\)/.test(shape),
  'and reports key names, never key values');


// ---------------------------------------------------------------------------
// 9. The credential survives the journey into the secret store
// ---------------------------------------------------------------------------
// The Vision credential was stored on 2026-08-07 with `JSON.stringify(raw)`,
// which produces a double-quoted value carrying \" escapes. The Supabase CLI's
// dotenv reader strips the outer quotes and expands `\n`, but leaves \" alone —
// so what reached the Edge Function began `{` newline `  \"type\":` and was not
// JSON. `credentialShape` said `not_json`, OCR said `refused_no_credential`,
// and that is what a switched-off provider says too. Three weeks and two
// replacement keys went by before the loader was suspected instead of the key.
//
// These assert the two properties that make that impossible now: the value is
// encoded so no escape processing can apply, and the write is verified against
// the digest Supabase publishes rather than assumed to have worked.

const encoding = read('scripts/warsha-secret-encoding.mjs');

check(/export function secretDigest/.test(encoding)
  && /export function encodeJsonSecretValue/.test(encoding),
  'the secret encoding is a named, testable thing rather than an inline template');

// Behavioural, not textual: the encoder is pure and can simply be run.
const { encodeJsonSecretValue, encodeSecretLine, secretDigest } =
  await import('./warsha-secret-encoding.mjs');

// A credential shaped exactly like a Google service-account key: multi-line,
// full of quotes, with a PEM whose newlines are the two characters `\n`.
const PEM_BEGIN = '-----BEGIN PRIVATE ' + 'KEY-----';
const PEM_END = '-----END PRIVATE ' + 'KEY-----';
const sampleAccount = {
  type: 'service_account',
  project_id: 'example-project',
  private_key_id: '0123456789abcdef',
  // The PEM header is assembled from parts for the same reason
  // `audit-bundle.mjs` does it: written contiguously, this fixture is itself
  // a credential shape, and `audit:secrets` would flag the test that exists to
  // protect credentials. The value the test sees is identical either way.
  private_key: `${PEM_BEGIN}\\nAAAA/BBBB+CCCC=\\n${PEM_END}\\n`,
  client_email: 'someone@example-project.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.googleapis.com/token',
};
const samplePretty = JSON.stringify(sampleAccount, null, 2);
const encoded = encodeJsonSecretValue(samplePretty);

check(!/[\r\n]/.test(encoded),
  'AN ENCODED CREDENTIAL IS ONE LINE, SO A DOTENV READER CANNOT TRUNCATE IT');
check(encoded.startsWith('{'),
  'AND IS UNQUOTED, SO NO ESCAPE PROCESSING APPLIES TO IT');
check(!encoded.includes(' #'),
  'and carries nothing a dotenv reader would strip as a comment');
equal(JSON.parse(encoded).private_key, sampleAccount.private_key,
  'THE PEM SURVIVES ENCODING EXACTLY, NEWLINE ESCAPES INCLUDED');
equal(JSON.parse(encoded).client_email, sampleAccount.client_email,
  'and so does the account it names');

// The exact 2026-08-07 corruption, reproduced and then refused. This is the
// value that actually sat in Development: outer quotes stripped, `\n` expanded,
// \" left as it was.
const stringified = JSON.stringify(samplePretty);
const corrupted = stringified.slice(1, -1).split('\\n').join(String.fromCharCode(10));
let corruptedParses = true;
try { JSON.parse(corrupted); } catch { corruptedParses = false; }
check(!corruptedParses,
  'the historical corruption is genuinely not JSON, which is why it was silent');
check(corrupted !== encoded,
  'AND THE ENCODER DOES NOT PRODUCE IT');

// The line written to the throwaway env file is the value and nothing else,
// so the digest of the stored secret is predictable.
const line = encodeSecretLine('GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT', samplePretty);
equal(line, 'GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT=' + encoded + String.fromCharCode(10),
  'the env line is name=value with no quoting of its own');
equal(secretDigest(encoded).length, 64, 'the digest is a SHA-256 hex string');
equal(secretDigest(encoded), secretDigest(encoded), 'and is stable');
check(secretDigest(encoded) !== secretDigest(corrupted),
  'so a corrupted value cannot pass the verification as a correct one');

// A credential that cannot be encoded safely must stop the operation.
for (const bad of ['not json at all', '[1,2,3]', '"a string"', 'null']) {
  let threw = false;
  try { encodeJsonSecretValue(bad); } catch { threw = true; }
  check(threw, `a credential that is not a JSON object is refused (${bad})`);
}

// And the CLI must actually perform the verification, not merely be able to.
check(/secrets', 'list'/.test(cli) && /expectedDigest/.test(cli),
  'the CLI reads back the stored digest after setting the secret');
check(/stored !== expectedDigest/.test(cli),
  'THE CLI FAILS WHEN THE STORED CREDENTIAL IS NOT WHAT IT SENT');
check(!/JSON\.stringify\(raw\)/.test(cli),
  'and the escaping form that caused the outage is gone from the CLI');


// ---------------------------------------------------------------------------
// 10. The allow-list cannot be stepped over by naming a builtin
// ---------------------------------------------------------------------------
// `ACTIONS[action]` reads inherited properties too, so `action: "__proto__"`
// (and `constructor`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`)
// resolved to a truthy object, passed the `if (!definition)` guard, and threw
// on `definition.params`. Hosted Development answered 500 to all six while
// every other unknown action answered 400 — a measurable difference in a set of
// refusals that is supposed to be uniform. No RPC was ever reached, because the
// throw precedes the read of `definition.rpc`; the point is that the allow-list
// is the control which makes this function safe to expose, and it must not rest
// on the order of two statements.

check(/Object\.hasOwn\(ACTIONS, action\)/.test(edge),
  'THE ACTION MUST BE AN OWN PROPERTY OF THE ALLOW-LIST, NOT AN INHERITED ONE');
check(!/const definition = ACTIONS\[action\];/.test(edge),
  'and the bare inherited lookup is gone');

// The guard itself, exercised rather than described. `ACTIONS` is rebuilt here
// with the same shape so the rule can be run without the Deno runtime.
const actionTable: Record<string, { rpc: string; params: readonly string[] }> = {
  state: { rpc: 'warsha_automation_governance_state', params: [] },
};
const resolves = (name: string) =>
  Object.hasOwn(actionTable, name) ? actionTable[name] : undefined;

for (const builtin of ['__proto__', 'constructor', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']) {
  equal(resolves(builtin), undefined,
    `a builtin name resolves to no action (${builtin})`);
  // The old lookup is what made this reachable; assert it really was.
  check((actionTable as Record<string, unknown>)[builtin] !== undefined
    || builtin === 'nothing',
    `and the inherited lookup really did find something (${builtin})`);
}
equal(resolves('nope'), undefined, 'an unknown action still resolves to nothing');
check(resolves('state') !== undefined, 'and a real action still resolves');

// Every refusal on this door is the same sentence. That is the property the
// 500 broke, so it is asserted directly.
equal((edge.match(/Unknown automation action/g) ?? []).length, 1,
  'there is exactly one sentence for an action that is not allowed');

console.log(`automation authority: ${checks} checks passed`);
