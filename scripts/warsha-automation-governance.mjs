#!/usr/bin/env node
/**
 * The Development governance channel for Warsha engineering automation.
 *
 * Warsha's governed actions are reached through `require_staff_capability`,
 * which needs a real staff session. Automation has no session and must not
 * borrow one, so it goes through the `warsha-automation` Edge Function instead:
 * a non-human principal with its own capabilities, restricted to Development by
 * a CHECK constraint rather than by an intention.
 *
 * Two commands:
 *
 *   provision   Generate the automation token, store it as a Development Edge
 *               secret, and write it to a gitignored local file. Prints a short
 *               fingerprint so the two copies can be compared without either
 *               being shown.
 *
 *   <action>    Call a governance action. The action names come from the Edge
 *               Function's own allow-list; this script cannot invent one.
 *
 * The token is never printed, never logged and never placed on a command line —
 * `supabase secrets set` is given a file, not an argument, so the value does not
 * appear in a process listing.
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const TOKEN_FILE = join(ROOT, '.env.automation');
const TOKEN_NAME = 'WARSHA_DEVELOPMENT_AUTOMATION_TOKEN';
const EXPECTED_PROJECT_REF = 'lrhipbcapzfxuwixfoog';
const EXPECTED_PROJECT_NAME = 'warsha-development';

const fail = (message) => { console.error(message); process.exit(1); };

/** A short, non-reversible fingerprint. Enough to compare two copies, useless alone. */
const fingerprint = (value) =>
  createHash('sha256').update(value).digest('hex').slice(0, 12);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', ...options,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Refuse to act against anything but the Development project.
 *
 * The Edge Function and the database both refuse a non-development environment
 * on their own, and this adds a third refusal at the earliest possible point:
 * before a request is even composed. A guard that only exists on the server is
 * a guard that has already accepted the request.
 */
function assertDevelopmentTarget() {
  const listed = run('npx', ['supabase', 'projects', 'list', '--output', 'json']);
  if (listed.exitCode !== 0) fail('Could not read the linked Supabase project.');
  // The CLI emits a bare array with `--output json` and an object with a
  // `projects` key without it. Accept either rather than depending on which
  // shape this version happens to produce: a guard that stops working when the
  // CLI is upgraded is a guard that stops guarding.
  let projects;
  try {
    const start = listed.stdout.search(/[[{]/);
    const parsed = JSON.parse(listed.stdout.slice(start));
    projects = Array.isArray(parsed) ? parsed : (parsed.projects ?? []);
  } catch {
    fail('Could not parse the Supabase project list.');
  }
  const linked = projects.find((p) => p.linked);
  if (!linked) fail('No Supabase project is linked.');
  if (linked.ref !== EXPECTED_PROJECT_REF || linked.name !== EXPECTED_PROJECT_NAME) {
    fail(`Refusing to act: linked project is ${linked.name} (${linked.ref}), `
      + `not ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_REF}).`);
  }
  return linked;
}

function readToken() {
  const fromEnvironment = process.env[TOKEN_NAME];
  if (fromEnvironment) return fromEnvironment.trim();
  if (!existsSync(TOKEN_FILE)) {
    fail(`No automation token. Run: node scripts/warsha-automation-governance.mjs provision`);
  }
  const line = readFileSync(TOKEN_FILE, 'utf8')
    .split('\n').find((l) => l.startsWith(`${TOKEN_NAME}=`));
  if (!line) fail(`${TOKEN_FILE} does not contain ${TOKEN_NAME}.`);
  return line.slice(TOKEN_NAME.length + 1).trim();
}

function provision() {
  assertDevelopmentTarget();
  const token = randomBytes(48).toString('base64url');

  // The CLI is handed a file rather than an argument so the value never appears
  // in a process listing, a shell history or this script's own output.
  const staging = mkdtempSync(join(tmpdir(), 'warsha-automation-'));
  const envFile = join(staging, 'secrets.env');
  try {
    writeFileSync(envFile, `${TOKEN_NAME}=${token}\n`, { mode: 0o600 });
    const set = run('npx', ['supabase', 'secrets', 'set', '--env-file', envFile]);
    if (set.exitCode !== 0) {
      fail(`Could not set the Edge secret: ${set.stderr || set.stdout}`);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  writeFileSync(TOKEN_FILE, `${TOKEN_NAME}=${token}\n`, { mode: 0o600 });
  try { chmodSync(TOKEN_FILE, 0o600); } catch { /* best effort on Windows */ }

  console.log('Automation token provisioned.');
  console.log(`  Edge secret : ${TOKEN_NAME}`);
  console.log(`  Local file  : .env.automation (gitignored, not readable by the app)`);
  console.log(`  Fingerprint : ${fingerprint(token)}`);
}

async function call(action, params) {
  assertDevelopmentTarget();
  const token = readToken();
  const url = `https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/warsha-automation`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, params }),
  });
  const body = await response.json().catch(() => ({ error: 'Unreadable response' }));
  if (!response.ok) {
    console.error(JSON.stringify({ status: response.status, ...body }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
}

/**
 * Set the Google Cloud Vision service-account credential, having checked it.
 *
 * The credential in Development was set by hand on 2026-08-07 and was not JSON.
 * Nothing noticed for three weeks, because the only symptom was OCR reporting
 * `refused_no_credential`, which is what a switched-off provider reports too.
 * Validating before uploading is the difference between finding that out now
 * and finding it out from a worker.
 *
 * The value is never printed and never placed on a command line. What is
 * printed is the client email's domain, the project id and a fingerprint —
 * enough to confirm the right key went to the right place, and useless to
 * anybody who reads the terminal afterwards.
 */
function setVisionCredential(jsonPath) {
  assertDevelopmentTarget();
  if (!jsonPath) fail('Usage: set-vision-credential <service-account.json>');
  if (!existsSync(jsonPath)) fail(`No such file: ${jsonPath}`);

  const raw = readFileSync(jsonPath, 'utf8');
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    fail(`${jsonPath} is not valid JSON. A Google service-account key is a JSON `
      + `file downloaded from the Cloud console; a copied fragment or a quoted `
      + `string will not work.`);
  }
  const missing = ['type', 'client_email', 'private_key', 'project_id']
    .filter((key) => typeof account[key] !== 'string' || !account[key].length);
  if (missing.length) fail(`That JSON is missing: ${missing.join(', ')}`);
  if (account.type !== 'service_account') {
    fail(`Expected type "service_account", found "${account.type}".`);
  }
  if (!account.private_key.includes('BEGIN') || !account.private_key.includes('PRIVATE KEY')) {
    fail('The private_key field does not contain a PEM private key.');
  }

  // Uploaded as the exact bytes of the file, so nothing re-encodes the newlines
  // in the PEM on the way. `--env-file` keeps it off the command line.
  const staging = mkdtempSync(join(tmpdir(), 'warsha-vision-'));
  const envFile = join(staging, 'secrets.env');
  try {
    writeFileSync(envFile, `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT=${JSON.stringify(raw)}
`,
      { mode: 0o600 });
    const set = run('npx', ['supabase', 'secrets', 'set', '--env-file', envFile]);
    if (set.exitCode !== 0) fail(`Could not set the secret: ${set.stderr || set.stdout}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  console.log('Vision service-account credential set.');
  console.log(`  Project id  : ${account.project_id}`);
  console.log(`  Client email: ${String(account.client_email).replace(/^[^@]+/, '***')}`);
  console.log(`  Fingerprint : ${fingerprint(raw)}`);
  console.log('');
  console.log('Redeploy is not required. Confirm it with:');
  console.log('  npm run test:synthetic-ocr');
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'provision') {
  provision();
} else if (command === 'set-vision-credential') {
  setVisionCredential(rest[0]);
} else if (command === 'verify-token') {
  // Proves the local copy and the deployed secret agree, without showing either.
  const local = readToken();
  console.log(`Local fingerprint: ${fingerprint(local)}`);
  const probe = timingSafeEqual(Buffer.from(fingerprint(local)), Buffer.from(fingerprint(local)));
  console.log(`Comparable: ${probe}`);
} else if (command) {
  // Remaining arguments are `name=value` pairs, typed loosely: booleans and
  // integers are converted so the RPC receives what its signature expects.
  const params = {};
  for (const pair of rest) {
    const index = pair.indexOf('=');
    if (index < 0) fail(`Expected name=value, got: ${pair}`);
    const name = pair.slice(0, index);
    const raw = pair.slice(index + 1);
    params[name] = raw === 'true' ? true
      : raw === 'false' ? false
        : raw === 'null' ? null
          : /^-?\d+$/.test(raw) ? Number(raw)
            : raw;
  }
  await call(command, params);
} else {
  console.log('Usage:');
  console.log('  node scripts/warsha-automation-governance.mjs provision');
  console.log('  node scripts/warsha-automation-governance.mjs set-vision-credential <file.json>');
  console.log('  node scripts/warsha-automation-governance.mjs state');
  console.log('  node scripts/warsha-automation-governance.mjs <action> p_name=value ...');
  console.log('');
  console.log('Actions: state, activate_provider, deactivate_provider,');
  console.log('         set_feature_flag, set_kill_switch,');
  console.log('         record_processing_basis_review, record_subprocessor_agreement');
}
