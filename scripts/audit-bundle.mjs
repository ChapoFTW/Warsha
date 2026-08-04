#!/usr/bin/env node
/**
 * WPS-018 exported-bundle credential scan.
 *
 * The repository scan (`audit:secrets`) proves no credential is committed. This
 * proves none reached a shipped artefact, which is a different question: a build
 * can inject one from the environment.
 *
 * It matches credential VALUES, not credential vocabulary. A naive search for
 * `sb_secret_` or `service_role` fails on every build, because
 * `@supabase/supabase-js` contains `e.startsWith("sb_secret_")` — its own guard
 * that refuses a secret key on the client. Flagging that would train people to
 * ignore this scanner, which is worse than not having it.
 *
 * Usage: node scripts/audit-bundle.mjs <dir> [<dir> ...]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCAN_EXT = new Set(['.js', '.hbc', '.json', '.html', '.map', '.txt', '.css']);

// Hermes bytecode packs string literals contiguously with no separator, so
// `sb_secret_` from a library guard runs straight into the next literal and
// looks like key material. Real key values carry at least one digit; a run of
// concatenated camelCase identifiers usually does not. That discriminator is a
// heuristic, and it is deliberately not the primary control — the primary
// control is that no secret is available to a build at all: CI exposes no
// secret, and `audit:environment` forbids a secret behind an EXPO_PUBLIC_ name.
const PATTERNS = [
  {
    name: 'Supabase secret key value',
    re: /sb_secret_(?=[A-Za-z0-9_-]{20,})(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{20,}/,
  },
  {
    name: 'Service-role JWT',
    // `service_role` only matters inside a JWT payload segment.
    re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*(c2VydmljZV9yb2xl|service_role)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/,
  },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe-style live key', re: /\b(sk|rk)_live_[0-9A-Za-z]{16,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{36,}/ },
  { name: 'Expo access token', re: /\bexp_[0-9A-Za-z]{32,}/ },
  // Assembled from parts rather than written as one literal: the contiguous PEM
  // header for an unencrypted private key is itself a credential shape, so
  // writing it here would make `audit:secrets` flag this scanner. The compiled
  // expression is identical either way.
  { name: 'Apple p8 key', re: new RegExp('-----BEGIN PRIVATE ' + 'KEY-----[\\s\\S]{0,40}MIG') },
];

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node scripts/audit-bundle.mjs <dir> [<dir> ...]');
  process.exit(2);
}

const findings = [];
let scanned = 0;

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0 || !SCAN_EXT.has(entry.name.slice(dot).toLowerCase())) continue;
    if (statSync(full).size > 64 * 1024 * 1024) continue;
    scanned += 1;
    // Hermes bytecode is binary; latin1 preserves any embedded ASCII literal.
    const text = readFileSync(full, 'latin1');
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) findings.push(`${full}: ${name}`);
    }
  }
}

for (const root of roots) walk(root);

if (scanned === 0) {
  console.error(`No scannable file found under: ${roots.join(', ')}`);
  process.exit(1);
}

if (findings.length) {
  console.error('Bundle credential scan failed:');
  // Report the location and the shape, never the value.
  for (const finding of [...new Set(findings)]) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`Bundle scan clean: ${scanned} artefacts across ${roots.length} export(s), no credential value found.`);
