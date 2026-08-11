#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const action = process.argv[2] ?? 'status';
const args = process.argv.slice(3);
const isWindows = process.platform === 'win32';
const nodeDirectory = dirname(process.execPath);
const commands = isWindows ? {
  npm: [process.execPath, [process.env.npm_execpath
    ?? join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js')]],
  npx: [process.execPath, [join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npx-cli.js')]],
  eas: [process.execPath, [join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'eas-cli', 'bin', 'run')]],
  git: ['git', []],
} : {
  npm: ['npm', []],
  npx: ['npx', []],
  eas: ['eas', []],
  git: ['git', []],
};
const childEnvironment = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' '),
};

function run(command, commandArgs, options = {}) {
  const [executable, prefix] = command;
  const result = spawnSync(executable, [...prefix, ...commandArgs], {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return options.capture ? result.stdout.trim() : '';
}

function npmScript(name, extra = []) {
  run(commands.npm, ['run', name, ...extra]);
}

function inPreviewEnvironment(command) {
  run(commands.eas, ['env:exec', 'preview', command, '--non-interactive']);
}

function status() {
  npmScript('test:qa-preview');
  inPreviewEnvironment('node ./scripts/qa-preview-environment.mjs');
}

function validate() {
  for (const name of [
    'typecheck', 'lint', 'check:mojibake', 'audit:migrations', 'audit:secrets',
    'test:qa-preview', 'test:platform-preferences', 'test:onboarding-stabilization',
    'test:signup-legal-startup', 'test:signup-state', 'test:web-platform',
    'test:web-bilingual', 'test:identity-signin', 'test:rtl-direction', 'test:web-brand', 'test:brand-assets', 'test:web-auth',
    'test:wps018', 'test:wps023', 'test:wps024',
    'test:wps025', 'test:worker-auth', 'test:customer-email-confirmation',
  ]) npmScript(name);
  run(commands.npx, ['expo-doctor']);
  inPreviewEnvironment('node ./scripts/qa-release.mjs export-preview');
}

function exportPreview() {
  run([process.execPath, []], ['./scripts/qa-preview-environment.mjs']);
  const resolved = JSON.parse(run(commands.npx, ['expo', 'config', '--type', 'public', '--json'], { capture: true }));
  if (resolved?.extra?.eas?.projectId !== '6c8fbcda-6bb2-40b2-b8db-3b0ce127525f'
    || resolved?.updates?.url !== 'https://u.expo.dev/6c8fbcda-6bb2-40b2-b8db-3b0ce127525f'
    || resolved?.runtimeVersion?.policy !== 'appVersion') {
    console.error('Resolved Expo configuration is not bound to the expected project and runtime policy.');
    process.exit(1);
  }
  console.log('Resolved Expo configuration valid: Warsha project, Update URL, and app-version runtime policy.');
  run(commands.npx, ['expo', 'export', '--platform', 'android', '--clear', '--output-dir', 'dist/qa-android']);
  run(commands.npx, ['expo', 'export', '--platform', 'ios', '--clear', '--output-dir', 'dist/qa-ios']);
  run(commands.npx, ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', 'dist/qa-web']);
  npmScript('audit:bundle', ['--', 'dist/qa-android', 'dist/qa-ios', 'dist/qa-web']);
}

function requireReleaseGitState() {
  const branch = run(commands.git, ['branch', '--show-current'], { capture: true });
  if (branch !== 'main' && !/^v\d/.test(branch)) {
    console.error(`QA release refused: ${branch || '(detached)'} is not main or a versioned release branch.`);
    process.exit(1);
  }
  if (run(commands.git, ['status', '--porcelain'], { capture: true })) {
    console.error('QA release refused: commit or remove working-tree changes first.');
    process.exit(1);
  }
  const head = run(commands.git, ['rev-parse', 'HEAD'], { capture: true });
  const upstream = run(commands.git, ['rev-parse', '@{upstream}'], { capture: true });
  if (head !== upstream) {
    console.error('QA release refused: the exact commit is not present on the upstream branch.');
    process.exit(1);
  }
}

if (action === 'status') {
  status();
} else if (action === 'validate') {
  validate();
} else if (action === 'export-preview') {
  exportPreview();
} else if (action === 'update') {
  const confirmation = args.includes('--ota-compatible');
  const messageIndex = args.indexOf('--message');
  const message = messageIndex >= 0 ? args[messageIndex + 1]?.trim() : '';
  if (!confirmation || !message) {
    console.error(
      'OTA refused. After reviewing the change as JS/TS/style/compatible-assets only, run: '
      + 'npm run qa:update -- --ota-compatible --message "QA change summary"',
    );
    process.exit(1);
  }
  validate();
  status();
  requireReleaseGitState();
  run(commands.eas, [
    'update', '--channel', 'preview', '--environment', 'preview',
    '--platform', 'all', '--message', message, '--non-interactive',
  ]);
} else if (action === 'build-android') {
  validate();
  status();
  requireReleaseGitState();
  run(commands.eas, [
    'build', '--platform', 'android', '--profile', 'preview', '--non-interactive',
  ]);
} else {
  console.error(`Unknown QA release action: ${action}`);
  process.exit(2);
}
