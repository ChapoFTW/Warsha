import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyChanges,
  classifyRelease,
  manualAcceptanceFor,
  planValidation,
} from './warsha-automation/policy.mjs';
import {
  buildHandoff,
  executeCommand,
  inspectGit,
  redact,
  validateHandoff,
} from './warsha-automation/runtime.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repositoryRoot, 'scripts', 'warsha-engineering.mjs');

function run(executable: string, args: string[], cwd: string) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function write(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

function fixture(options: { remote?: boolean; failingSecretAudit?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'warsha-automation-'));
  run('git', ['init', '-b', 'main'], root);
  run('git', ['config', 'user.email', 'automation@example.invalid'], root);
  run('git', ['config', 'user.name', 'Warsha Automation Test'], root);
  const success = 'node -e "process.exit(0)"';
  const scripts = {
    'audit:secrets': options.failingSecretAudit ? 'node -e "process.exit(7)"' : success,
    'audit:migrations': success,
    'audit:appearance': success,
    'check:mojibake': success,
    'test:all': success,
    typecheck: success,
    lint: success,
  };
  write(join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0', scripts }, null, 2)}\n`);
  write(join(root, 'app.json'), `${JSON.stringify({ expo: { version: '1.0.0', android: { package: 'com.test.app' }, ios: { bundleIdentifier: 'com.test.app' }, runtimeVersion: { policy: 'appVersion' } } })}\n`);
  write(join(root, 'eas.json'), '{}\n');
  write(join(root, 'web', 'package.json'), `${JSON.stringify({ dependencies: { next: '15.5.23' } })}\n`);
  write(join(root, 'docs', 'engineering', 'open-work.json'), '{"schemaVersion":1,"items":[]}\n');
  write(join(root, 'README.md'), 'fixture\n');
  run('git', ['add', '.'], root);
  run('git', ['commit', '-m', 'chore: fixture'], root);
  if (options.remote) {
    const remote = mkdtempSync(join(tmpdir(), 'warsha-automation-remote-'));
    run('git', ['init', '--bare'], remote);
    run('git', ['remote', 'add', 'origin', remote], root);
    run('git', ['push', '-u', 'origin', 'main'], root);
  }
  return root;
}

function runCli(root: string, action: string, extra: string[] = []) {
  return spawnSync(process.execPath, [cli, action, '--root', root, ...extra], { cwd: repositoryRoot, encoding: 'utf8' });
}

test('dirty tree and read-only recovery are detected without mutation', () => {
  const root = fixture();
  write(join(root, 'interrupted.txt'), 'preserve me\n');
  const before = run('git', ['status', '--porcelain=v1'], root);
  assert.equal(inspectGit(root).clean, false);
  const result = runCli(root, 'recover');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /DIRTY/);
  assert.equal(run('git', ['status', '--porcelain=v1'], root), before);
});

test('ahead and behind are reported against origin/main', () => {
  const root = fixture({ remote: true });
  write(join(root, 'ahead.txt'), 'ahead\n');
  run('git', ['add', 'ahead.txt'], root);
  run('git', ['commit', '-m', 'test: ahead'], root);
  assert.equal(inspectGit(root).originMain.ahead, 1);

  const other = mkdtempSync(join(tmpdir(), 'warsha-automation-other-'));
  const remote = run('git', ['remote', 'get-url', 'origin'], root);
  run('git', ['clone', '--branch', 'main', remote, '.'], other);
  run('git', ['config', 'user.email', 'other@example.invalid'], other);
  run('git', ['config', 'user.name', 'Other'], other);
  write(join(other, 'behind.txt'), 'behind\n');
  run('git', ['add', 'behind.txt'], other);
  run('git', ['commit', '-m', 'test: behind'], other);
  run('git', ['push', 'origin', 'main'], other);
  run('git', ['fetch', 'origin'], root);
  const state = inspectGit(root);
  assert.equal(state.originMain.ahead, 1);
  assert.equal(state.originMain.behind, 1);
});

test('impact rules classify web, shared, migration, native and icon changes', () => {
  const web = classifyChanges(['web/app/globals.css']);
  assert.equal(web.webOnly, true);
  assert.equal(classifyRelease(web).classification, 'WEB_DEPLOY_REQUIRED');

  const shared = classifyChanges(['src/auth/session.ts']);
  assert.equal(shared.surfaces.android, true);
  assert.equal(shared.surfaces.ios, true);
  assert.equal(shared.otaEligibility, 'ELIGIBLE');

  const nativeLock = classifyChanges(['package-lock.json'], { dependencyChanges: ['expo-location'] });
  assert.equal(nativeLock.nativeBuildRequirement, 'BOTH');
  assert.equal(nativeLock.otaEligibility, 'INELIGIBLE_NATIVE_CHANGE');

  const migration = classifyChanges(['supabase/migrations/202601010001_test.sql']);
  assert.equal(classifyRelease(migration).classification, 'MIGRATION_REQUIRED');

  assert.equal(classifyRelease(classifyChanges(['android/app/src/main/AndroidManifest.xml'])).classification, 'PREVIEW_NATIVE_ANDROID_REQUIRED');
  assert.equal(classifyRelease(classifyChanges(['ios/Warsha/Info.plist'])).classification, 'PREVIEW_NATIVE_IOS_REQUIRED');

  const icon = classifyChanges(['assets/images/icon.png']);
  assert.equal(icon.otaEligibility, 'INELIGIBLE_NATIVE_CHANGE');
  assert.equal(icon.humanVisualApprovalRequired, true);
  assert.equal(classifyRelease(icon).classification, 'MIXED_RELEASE');
  assert.ok(!classifyRelease(icon).components.includes('PREVIEW_OTA_REQUIRED'));
});

test('command runner preserves real nonzero exit status', () => {
  const result = executeCommand(process.execPath, ['-e', 'process.exit(9)']);
  assert.equal(result.exitCode, 9);
});

test('unified validation fails on the underlying command and records it', () => {
  const root = fixture({ failingSecretAudit: true });
  const result = runCli(root, 'validate');
  assert.equal(result.status, 1);
  const evidence = JSON.parse(readFileSync(join(root, 'artifacts', 'validation', 'latest.json'), 'utf8'));
  assert.equal(evidence.status, 'FAILED');
  assert.equal(evidence.commands.at(-1).exitCode, 7);
});

test('release refuses dirty and unvalidated source states', () => {
  const dirty = fixture({ remote: true });
  write(join(dirty, 'dirty.txt'), 'dirty\n');
  const dirtyResult = runCli(dirty, 'release');
  assert.equal(dirtyResult.status, 1);
  assert.match(dirtyResult.stderr, /dirty/i);

  const unvalidated = fixture({ remote: true });
  const unvalidatedResult = runCli(unvalidated, 'release');
  assert.equal(unvalidatedResult.status, 1);
  assert.match(unvalidatedResult.stderr, /validation/i);
});

test('handoff validates and generated artifacts redact credential shapes', () => {
  const root = fixture();
  const value = buildHandoff(root);
  assert.equal(validateHandoff(value).valid, true);
  const token = `sbp_${'A'.repeat(24)}`;
  assert.equal(redact(`token=${token}`).includes(token), false);
  run('git', ['commit', '--allow-empty', '-m', `test: ${token}`], root);
  const handoffResult = runCli(root, 'handoff');
  assert.equal(handoffResult.status, 0);
  const promptResult = runCli(root, 'agent-handoff');
  assert.equal(promptResult.status, 0);
  assert.equal(readFileSync(join(root, 'artifacts', 'handoff', 'warsha-handoff.json'), 'utf8').includes(token), false);
  assert.equal(readFileSync(join(root, 'artifacts', 'handoff', 'agent-prompt.md'), 'utf8').includes(token), false);
});

test('manual acceptance remains scoped to affected surfaces', () => {
  const web = classifyChanges(['web/app/[locale]/about/page.tsx']);
  const items = manualAcceptanceFor(web, { status: 'PASSED' }, classifyRelease(web));
  assert.ok(items.some((item) => item.platform === 'Public web'));
  assert.ok(items.every((item) => !item.platform.includes('Android') && !item.platform.includes('iOS')));

  const tooling = classifyChanges(['scripts/tool.mjs']);
  const toolingItems = manualAcceptanceFor(tooling, { status: 'PASSED' }, classifyRelease(tooling));
  assert.equal(toolingItems.length, 1);
  assert.equal(toolingItems[0].platform, 'Engineering tooling');

  const qaPlan = planValidation(classifyChanges(['package.json']));
  assert.ok(qaPlan.steps.some((step) => step.id === 'qa-validate'));
});
