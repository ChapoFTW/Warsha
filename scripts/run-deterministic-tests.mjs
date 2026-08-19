#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DETERMINISTIC_TEST_SCRIPTS } from './warsha-automation/policy.mjs';
import { executeCommand } from './warsha-automation/runtime.mjs';

const root = resolve(process.cwd());
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const missing = DETERMINISTIC_TEST_SCRIPTS.filter((script) => !pkg.scripts?.[script]);
if (missing.length) {
  console.error(`Deterministic test inventory references missing scripts: ${missing.join(', ')}`);
  process.exit(1);
}

for (const script of DETERMINISTIC_TEST_SCRIPTS) {
  console.log(`\n=== ${script} ===`);
  const result = executeCommand('npm', ['run', script], { cwd: root, inherit: true });
  if (result.exitCode !== 0) {
    console.error(`${script} failed with direct exit code ${result.exitCode}.`);
    process.exit(result.exitCode || 1);
  }
}
