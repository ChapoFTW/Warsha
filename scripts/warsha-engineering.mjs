#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyRelease, manualAcceptanceFor, planValidation } from './warsha-automation/policy.mjs';
import {
  buildHandoff,
  currentContext,
  executeCommand,
  inspectGit,
  queryPreviewDeployment,
  readJson,
  redact,
  renderHandoff,
  sourceFingerprint,
  validateHandoff,
  writeArtifact,
} from './warsha-automation/runtime.mjs';

const action = process.argv[2] ?? 'handoff';
const argv = process.argv.slice(3);

function option(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

function has(name) { return argv.includes(name); }

const root = resolve(option('--root', process.cwd()));
const baseline = option('--base', undefined);

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(redact(value), null, 2)}\n`);
}

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function handoff(write = true) {
  const value = buildHandoff(root, { baseline, online: has('--online') });
  if (write) {
    writeArtifact(root, 'artifacts/handoff/warsha-handoff.json', value);
    writeArtifact(root, 'artifacts/handoff/warsha-handoff.md', renderHandoff(value));
  }
  return value;
}

function impactSummary(impact) {
  const surfaces = Object.entries(impact.surfaces).filter(([, affected]) => affected).map(([surface]) => surface);
  return [
    `Affected surfaces: ${surfaces.join(', ') || 'none'}`,
    `OTA eligibility: ${impact.otaEligibility}`,
    `Native build: ${impact.nativeBuildRequirement}`,
    `Migration required: ${impact.backendMigrationRequired}`,
    `Edge Function deploy required: ${impact.edgeFunctionDeployRequired}`,
    `Human visual review: ${impact.humanVisualApprovalRequired}`,
    ...impact.reasons.map((reason) => `- ${reason}`),
    ...impact.warnings.map((warning) => `WARNING: ${warning}`),
  ].join('\n');
}

function renderPlan(plan) {
  return [
    `Affected surfaces: ${plan.affectedSurfaces.join(', ') || 'none'}`,
    ...plan.steps.map((step, index) => `${index + 1}. ${step.label}${step.external ? ' [external/read-only]' : ''} — ${step.reason}`),
    ...plan.warnings.map((warning) => `WARNING: ${warning}`),
  ].join('\n');
}

function validationMarkdown(result) {
  return `# Warsha validation\n\n- Status: ${result.status}\n- Source fingerprint: ${result.sourceFingerprint}\n- Started: ${result.startedAt}\n- Ended: ${result.endedAt}\n\n${result.commands.map((step) => `- ${step.status}: ${step.label} (exit ${step.exitCode ?? 'N/A'})${step.reason ? ` — ${step.reason}` : ''}`).join('\n')}\n`;
}

function runValidation() {
  const context = currentContext(root, { baseline });
  const result = {
    schemaVersion: 1,
    status: 'RUNNING',
    sourceFingerprint: context.fingerprint,
    head: context.gitState.head,
    baseline: context.baseline,
    startedAt: new Date().toISOString(),
    endedAt: null,
    impact: context.impact,
    release: context.release,
    commands: [],
  };
  let failed = false;
  console.log(impactSummary(context.impact));
  for (const step of context.plan.steps) {
    if (step.external && has('--offline')) {
      const record = { ...step, status: 'SKIPPED', exitCode: null, reason: 'Required external validation was disabled by --offline.' };
      result.commands.push(record);
      failed = true;
      console.error(`SKIPPED REQUIRED: ${step.label}`);
      break;
    }
    console.log(`\n> ${step.label}`);
    const command = executeCommand(step.executable, step.args, { cwd: root, inherit: true });
    const record = { ...step, ...command, status: command.exitCode === 0 ? 'PASSED' : 'FAILED' };
    result.commands.push(record);
    if (command.exitCode !== 0) {
      failed = true;
      console.error(`Validation stopped: ${step.label} exited ${command.exitCode}.`);
      break;
    }
  }
  result.status = failed ? 'FAILED' : 'PASSED';
  result.endedAt = new Date().toISOString();
  writeArtifact(root, 'artifacts/validation/latest.json', result);
  writeArtifact(root, 'artifacts/validation/latest.md', validationMarkdown(result));
  console.log(`\nValidation ${result.status}. Evidence: artifacts/validation/latest.json`);
  if (failed) process.exit(1);
}

function checkedContext() {
  const context = currentContext(root, { baseline });
  if (context.gitState.changedFiles.length === 0 && context.validation.status === 'PASSED' && context.validation.impact) {
    context.impact = context.validation.impact;
    context.release = context.validation.release ?? classifyRelease(context.impact);
    context.plan = planValidation(context.impact);
  }
  return context;
}

async function smoke() {
  const checks = [
    { id: 'public-en', url: 'https://usewarsha.com/en', host: 'usewarsha.com', language: 'en', direction: 'ltr' },
    { id: 'public-ar', url: 'https://usewarsha.com/ar', host: 'usewarsha.com', language: 'ar', direction: 'rtl' },
    { id: 'www-redirect', url: 'https://www.usewarsha.com/', host: 'usewarsha.com' },
    { id: 'app-sign-in', url: 'https://app.usewarsha.com/sign-in', host: 'app.usewarsha.com' },
    { id: 'app-create-account', url: 'https://app.usewarsha.com/create-account', host: 'app.usewarsha.com' },
    { id: 'admin-sign-in', url: 'https://admin.usewarsha.com/sign-in', host: 'admin.usewarsha.com' },
  ];
  const results = [];
  for (const check of checks) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(check.url, { redirect: 'follow', signal: controller.signal });
      const body = await response.text();
      const finalUrl = new URL(response.url);
      const statusOk = response.status >= 200 && response.status < 400;
      const hostOk = finalUrl.hostname === check.host;
      const languageOk = !check.language || new RegExp(`<html[^>]+lang=["']${check.language}["']`, 'i').test(body);
      const directionOk = !check.direction || new RegExp(`<html[^>]+dir=["']${check.direction}["']`, 'i').test(body);
      results.push({ ...check, status: response.status, finalUrl: response.url, statusOk, hostOk, languageOk, directionOk, passed: statusOk && hostOk && languageOk && directionOk });
    } catch (error) {
      const cause = error instanceof Error && error.cause && typeof error.cause === 'object' ? error.cause : {};
      results.push({
        ...check,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'code' in cause ? String(cause.code) : 'UNKNOWN',
        errorCause: 'message' in cause ? String(cause.message) : 'UNKNOWN',
      });
    } finally { clearTimeout(timer); }
  }
  const context = currentContext(root, { baseline });
  const result = {
    schemaVersion: 1,
    status: results.every((entry) => entry.passed) ? 'PASSED' : 'FAILED',
    generatedAt: new Date().toISOString(),
    sourceFingerprint: context.fingerprint,
    scope: 'Unauthenticated HTTP route/host/locale-direction smoke only; HTTP success is not authenticated behavior evidence.',
    checks: results,
  };
  writeArtifact(root, 'artifacts/smoke/latest.json', result);
  print(result);
  if (result.status !== 'PASSED') process.exit(1);
}

function acceptanceMarkdown(items, release) {
  if (!items.length) return `# Manual acceptance\n\nNo product-surface manual acceptance is indicated for ${release.classification}. Verify the engineering artifacts against Git.\n`;
  return `# Manual acceptance\n\nRelease classification: ${release.classification}\n\n${items.map((item, index) => `## ${index + 1}. ${item.platform}\n\n**Precondition:** ${item.precondition}\n\n**Steps:**\n\n${item.steps.map((step) => `- ${step}`).join('\n')}\n\n**Expected:** ${item.expected}`).join('\n\n')}\n`;
}

function generateAgentPrompt() {
  const value = existsSync(join(root, 'artifacts', 'handoff', 'warsha-handoff.json'))
    ? readJson(join(root, 'artifacts', 'handoff', 'warsha-handoff.json')) : handoff(true);
  const checked = validateHandoff(value);
  if (!checked.valid) fail(`Latest handoff is invalid: ${checked.errors.join('; ')}`);
  const prompt = `# Warsha continuation\n\nVerify this advisory handoff against Git before editing. Current recorded branch is ${value.git.branch}, HEAD ${value.git.head}, and clean=${value.git.clean}. Preserve all dirty/staged/untracked work; never reset or stash automatically.\n\nChanged files recorded:\n${value.changes.files.map((path) => `- ${path}`).join('\n') || '- None'}\n\nRecorded release classification: ${value.release.classification}. Validation evidence: ${value.validation.status}.\n\nContinue from repository authority, follow cross-platform parity and security/governance, search for existing backend authority before adding RPCs, and run the impact-planned validation. Commit coherent increments only after direct exit codes pass. Do not voluntarily stop while safe independent work remains. Put the substantial final report inside one fenced Markdown block.\n`;
  writeArtifact(root, 'artifacts/handoff/agent-prompt.md', prompt);
  print(prompt);
}

function release() {
  const context = checkedContext();
  if (!context.gitState.clean) fail('Release refused: the working tree is dirty.');
  if (context.gitState.branch !== 'main' && !/^v\d/.test(context.gitState.branch)) fail(`Release refused: ${context.gitState.branch} is not main or a versioned release branch.`);
  if (!context.gitState.headMatchesUpstream) fail('Release refused: HEAD does not exactly match its configured upstream.');
  if (context.validation.status !== 'PASSED') fail(`Release refused: exact-source validation is ${context.validation.status}.`);
  const secret = context.validation.commands?.find((step) => step.id === 'secret-audit');
  if (!secret || secret.status !== 'PASSED' || secret.exitCode !== 0) fail('Release refused: the exact validation artifact has no passing secret audit.');
  if (context.release.classification === 'HUMAN_REVIEW_REQUIRED') fail('Release refused: impact classification requires human review.');
  if (context.release.classification === 'NO_RELEASE_REQUIRED') {
    const evidence = { schemaVersion: 1, status: 'NO_RELEASE_REQUIRED', generatedAt: new Date().toISOString(), sourceFingerprint: context.fingerprint, head: context.gitState.head, classification: context.release };
    writeArtifact(root, 'artifacts/release/latest.json', evidence);
    print(evidence);
    return;
  }
  if (!has('--execute')) fail(`Release ready but not executed. Re-run with --execute after reviewing ${context.release.classification}.`);
  if (context.release.classification === 'PREVIEW_OTA_REQUIRED') {
    const message = option('--message', '').trim();
    if (!message) fail('Preview OTA release requires --message "concise QA summary".');
    const result = executeCommand('npm', ['run', 'qa:update', '--', '--ota-compatible', '--message', message], { cwd: root, inherit: true });
    if (result.exitCode !== 0) fail(`Preview OTA failed with exit ${result.exitCode}.`);
  } else if (context.release.classification === 'PREVIEW_NATIVE_ANDROID_REQUIRED') {
    const result = executeCommand('npm', ['run', 'qa:build:android'], { cwd: root, inherit: true });
    if (result.exitCode !== 0) fail(`Preview Android build failed with exit ${result.exitCode}.`);
  } else {
    fail(`${context.release.classification} reaches a human or separately governed deployment boundary. No Production, migration, Edge Function, Apple-signing, DNS, or mixed-layer action was performed.`);
  }
  writeArtifact(root, 'artifacts/release/latest.json', {
    schemaVersion: 1, status: 'COMMAND_SUCCEEDED', generatedAt: new Date().toISOString(), sourceFingerprint: context.fingerprint,
    head: context.gitState.head, classification: context.release, ...queryPreviewDeployment(root),
    warning: 'Verify provider deployment/build identifiers separately; command success alone is not live acceptance.',
  });
}

if (action === 'handoff') {
  const value = handoff(true);
  console.log(`Handoff generated for ${value.git.shortHead}: artifacts/handoff/warsha-handoff.{md,json}`);
} else if (action === 'recover') {
  const before = inspectGit(root, baseline);
  const value = handoff(false);
  const after = inspectGit(root, baseline);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('Recovery invariant failed: repository state changed during inspection.');
  print([
    `Branch ${value.git.branch} at ${value.git.shortHead}.`,
    `Working tree: ${value.git.clean ? 'CLEAN' : `DIRTY (${value.changes.count} changed paths)`}.`,
    `origin/main: ahead ${value.git.originMain.ahead}, behind ${value.git.originMain.behind}.`,
    `Stashes: ${value.git.stashCount}. Validation evidence: ${value.validation.status}.`,
    ...(value.git.clean ? [] : ['Preserve the staged, modified, and untracked files. Recovery performed no write, stash, reset, checkout, clean, rebase, push, deploy, or migration.']),
    ...value.unfinishedWork.map((item) => `Open work: ${item.id} — ${item.summary}`),
  ].join('\n'));
} else if (action === 'impact') {
  print(impactSummary(currentContext(root, { baseline }).impact));
} else if (action === 'plan-qa') {
  print(renderPlan(currentContext(root, { baseline }).plan));
} else if (action === 'validate') {
  runValidation();
} else if (action === 'release-check') {
  const context = checkedContext();
  print({ ...context.release, validationEvidence: context.validation.status, sourceFingerprint: context.fingerprint });
} else if (action === 'release') {
  release();
} else if (action === 'smoke') {
  if (process.platform === 'win32' && !process.execArgv.includes('--use-system-ca')) {
    const result = executeCommand(process.execPath, ['--use-system-ca', fileURLToPath(import.meta.url), action, ...argv], { cwd: root, inherit: true });
    process.exit(result.exitCode);
  }
  await smoke();
} else if (action === 'acceptance') {
  const context = checkedContext();
  const items = manualAcceptanceFor(context.impact, context.validation, context.release);
  const markdown = acceptanceMarkdown(items, context.release);
  writeArtifact(root, 'artifacts/acceptance/latest.md', markdown);
  print(markdown);
} else if (action === 'agent-handoff') {
  generateAgentPrompt();
} else {
  fail(`Unknown Warsha engineering action: ${action}`, 2);
}
