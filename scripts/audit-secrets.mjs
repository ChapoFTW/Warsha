#!/usr/bin/env node
/**
 * WPS-018 secret scan.
 *
 * Fails the build when a credential shape appears in a tracked file or in git
 * history. It scans for shapes, never for a list of known values, so it cannot
 * itself become a place a secret is written down.
 *
 * Placeholders are allowed and required: the repository documents which secrets
 * exist without ever recording one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  { name: 'Supabase service-role JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*?(service_role)[A-Za-z0-9_-]*?\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe-style live key', re: /\b(sk|rk)_live_[0-9A-Za-z]{16,}/ },
  { name: 'Slack token', re: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{36,}/ },
  { name: 'Expo access token', re: /\bexp_[0-9A-Za-z]{32,}/ },
  // The value must be on the same line: a bare `KEY=` followed by a blank line
  // is a placeholder, not a leak.
  { name: 'Assigned service-role value', re: /SUPABASE_SERVICE_ROLE_KEY[ \t]*[=:][ \t]*['"]?(?!YOUR_|<|\$|env\.)[A-Za-z0-9._-]{20,}/ },
  { name: 'Public-prefixed service role', re: /EXPO_PUBLIC_[A-Z_]*SERVICE_ROLE/ },
  { name: 'Public-prefixed secret', re: /EXPO_PUBLIC_[A-Z_]*(SECRET|PRIVATE_KEY|PASSWORD)\s*=\s*\S+/ },
];

// The local Supabase demo keys are published by Supabase itself and are the
// same on every developer machine. They are not secrets; flagging them would
// train people to ignore this scanner.
const KNOWN_LOCAL_DEMO = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0',
  'super-secret-jwt-token-with-at-least-32-characters-long',
];

// Self-reference: the WPS-018 commit recorded the credential SHAPES this
// repository scans for, inside the scanner and inside the security review that
// explains it. Those are pattern sources and documentation, not credentials, and
// they are unreachable in the working tree but permanent in git history.
//
// They are neutralized by EXACT VALUE, never by path. A path allowlist would let
// a real secret hide in that file forever; an exact literal cannot, because a
// real private key does not carry the regex tail `[\s\S]{0,40}MIG` and a real
// Supabase key is not this specific Hermes string. Each literal is assembled
// from parts so this file does not itself become a match.
// Each entry below is ANCHORED: it ends on a character outside the credential
// character class (an ellipsis, a backslash, a regex tail). That is what makes
// it safe. A neutralizer that stopped mid-class could shadow a real key whose
// value happened to start with the benign prefix, leaving an orphaned tail the
// pattern no longer sees. Ending outside the class means the literal only ever
// cancels the exact documented run and never a value that continues past it.
const KNOWN_BENIGN_LITERALS = [
  // scripts/audit-bundle.mjs Apple p8 pattern source, as committed in c88957a.
  '-----BEGIN PRIVATE ' + 'KEY-----[\\s\\S]{0,40}MIG',
  // The Hermes literal collision documented in WPS-018-SECURITY-REVIEW.md: two
  // unrelated bundle strings abutting, which is the whole point of that finding.
  'sb_secret_' + 'allocateCallbackButtonInCustomViewebsocket',

  // The same collision, reshuffled by a later build and quoted as evidence in
  // WPS-024-ACCEPTANCE-EVIDENCE.md. Committed un-separated in 7e5ddf4, where it
  // is permanent.
  //
  // The working tree was fixed first — the document now renders these runs with
  // an editorial `|` marking where the terminated guard literal ends — but a
  // tree fix ALONE cannot clear this scanner and never could. History is scanned
  // as patches, and a patch that removes a line reproduces that line with a `-`
  // in front of it. Committing the correction therefore re-adds both strings to
  // history a second time. Neutralizing by exact value is the only mechanism
  // that terminates, which is what this list was built for.
  'sb_secret_' + 'allocateCallbackTitleFontSizeformat-color-marker-cancelAnima…',
  'sb_secret_' + 'allocateCallbackTitleFontSize\\x2d',
];

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.ico', '.webp', '.ttf', '.otf', '.hbc']);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

const findings = [];

function scan(label, text) {
  let body = text;
  for (const demo of KNOWN_LOCAL_DEMO) body = body.split(demo).join('LOCAL_DEMO_VALUE');
  for (const literal of KNOWN_BENIGN_LITERALS) body = body.split(literal).join('PATTERN_SOURCE');
  for (const { name, re } of PATTERNS) {
    const match = body.match(re);
    if (match) {
      // Report the shape and location, never the value.
      findings.push(`${label}: ${name}`);
    }
  }
}

// 1. Tracked working-tree files.
const tracked = git(['ls-files']).split('\n').filter(Boolean);
for (const file of tracked) {
  const dot = file.lastIndexOf('.');
  if (dot >= 0 && SKIP_EXT.has(file.slice(dot).toLowerCase())) continue;
  let size = 0;
  try { size = statSync(file).size; } catch { continue; }
  if (size > 4 * 1024 * 1024) continue;
  scan(`tracked ${file}`, readFileSync(file, 'utf8'));
}

// 2. Git history. A rotated secret that is still reachable is still exposed.
const revs = git(['rev-list', '--all']).split('\n').filter(Boolean);
for (const rev of revs) {
  let patch = '';
  try {
    patch = git(['show', '--format=%H', '--unified=0', '--no-color', rev]);
  } catch { continue; }
  scan(`history ${rev.slice(0, 10)}`, patch);
}

// 3. Ignored-but-present env files must never be tracked.
const forbidden = tracked.filter(file => /^\.env($|\.local$|\.production$)/.test(file));
for (const file of forbidden) findings.push(`tracked ${file}: environment file must never be committed`);

if (findings.length) {
  console.error('Secret scan failed:');
  for (const finding of [...new Set(findings)]) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`Secret scan clean: ${tracked.length} tracked files and ${revs.length} commits, no credential shape found.`);
