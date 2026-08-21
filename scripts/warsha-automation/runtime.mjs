import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import {
  HANDOFF_SCHEMA_VERSION,
  classifyChanges,
  classifyRelease,
  manualAcceptanceFor,
  planValidation,
} from './policy.mjs';

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sbp|sb_secret)_[A-Za-z0-9._-]{12,}\b/,
  /\b(?:ghp|github_pat|glpat)-?[A-Za-z0-9_]{20,}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:AIza)[A-Za-z0-9_-]{20,}\b/,
  /(?:access_token|refresh_token|service_role|password|client_secret|private_key)\s*[:=]\s*[^\s,}]+/i,
  /https?:\/\/[^\s?]+\?[^\s]*(?:token|signature|sig|key|credential)=[^\s&]+/i,
];

const SENSITIVE_KEY = /(?:token|password|secret|private.?key|service.?role|authorization|cookie|credential)/i;

export function commandSpec(name) {
  if (process.platform !== 'win32') return { executable: name, prefix: [] };
  const nodeDir = dirname(process.execPath);
  if (name === 'npm') return {
    executable: process.execPath,
    prefix: [process.env.npm_execpath ?? join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')],
  };
  if (name === 'npx') return {
    executable: process.execPath,
    prefix: [join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js')],
  };
  if (name === 'eas') return {
    executable: process.execPath,
    prefix: [join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'eas-cli', 'bin', 'run')],
  };
  return { executable: name, prefix: [] };
}

export function executeCommand(executable, args, options = {}) {
  const command = commandSpec(executable);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(command.executable, [...command.prefix, ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ') },
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    timeout: options.timeout,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode,
    stdout: options.inherit ? '' : (result.stdout ?? '').trim(),
    stderr: options.inherit ? '' : (result.stderr ?? result.error?.message ?? '').trim(),
  };
}

function git(root, args, fallback = '') {
  const result = executeCommand('git', args, { cwd: root });
  return result.exitCode === 0 ? result.stdout : fallback;
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function jsonFile(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

export function resolveBaseline(root, requested) {
  if (requested && git(root, ['rev-parse', '--verify', requested])) return requested;
  if (git(root, ['rev-parse', '--verify', 'origin/main'])) return 'origin/main';
  return 'HEAD';
}

export function inspectGit(root, baseline = resolveBaseline(root)) {
  const branch = git(root, ['branch', '--show-current'], '(detached)');
  const head = git(root, ['rev-parse', 'HEAD'], 'UNKNOWN');
  const shortHead = git(root, ['rev-parse', '--short=12', 'HEAD'], 'UNKNOWN');
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const staged = lines(git(root, ['diff', '--cached', '--name-only']));
  const modified = lines(git(root, ['diff', '--name-only']));
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']));
  const committed = baseline === 'HEAD' ? [] : lines(git(root, ['diff', '--name-only', `${baseline}...HEAD`]));
  const relationship = lines(git(root, ['rev-list', '--left-right', '--count', `origin/main...HEAD`]))[0]?.split(/\s+/) ?? [];
  const upstream = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], 'UNKNOWN');
  const upstreamSha = upstream === 'UNKNOWN' ? 'UNKNOWN' : git(root, ['rev-parse', '@{upstream}'], 'UNKNOWN');
  return {
    branch,
    head,
    shortHead,
    baseline,
    clean: status.length === 0,
    staged,
    modified,
    untracked,
    changedFiles: [...new Set([...committed, ...staged, ...modified, ...untracked])].sort(),
    stashCount: lines(git(root, ['stash', 'list'])).length,
    originMain: {
      ahead: Number(relationship[1] ?? 0),
      behind: Number(relationship[0] ?? 0),
    },
    upstream,
    upstreamSha,
    headMatchesUpstream: upstreamSha !== 'UNKNOWN' && upstreamSha === head,
    recentCommits: lines(git(root, ['log', '-5', '--date=iso-strict', '--pretty=format:%H|%ad|%s'])),
    recentReflog: lines(git(root, ['reflog', '-5', '--date=iso-strict', '--pretty=format:%h|%gd|%ad|%gs'])),
  };
}

function dependencyChanges(root, baseline) {
  const current = jsonFile(join(root, 'package.json'));
  const oldRaw = baseline === 'HEAD' ? '' : git(root, ['show', `${baseline}:package.json`]);
  if (!oldRaw) return [];
  let previous = {};
  try { previous = JSON.parse(oldRaw); } catch { return []; }
  const before = { ...(previous.dependencies ?? {}), ...(previous.devDependencies ?? {}) };
  const after = { ...(current.dependencies ?? {}), ...(current.devDependencies ?? {}) };
  const declared = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key]);

  const currentLock = jsonFile(join(root, 'package-lock.json'));
  const oldLockRaw = baseline === 'HEAD' ? '' : git(root, ['show', `${baseline}:package-lock.json`]);
  let previousLock = {};
  try { previousLock = oldLockRaw ? JSON.parse(oldLockRaw) : {}; } catch { previousLock = {}; }
  const lockNames = [...new Set([
    ...Object.keys(previousLock.packages ?? {}), ...Object.keys(currentLock.packages ?? {}),
  ])].filter((path) => path.startsWith('node_modules/'));
  const locked = lockNames.filter((path) => {
    const prior = previousLock.packages?.[path]?.version;
    const currentVersion = currentLock.packages?.[path]?.version;
    return prior !== currentVersion;
  }).map((path) => path.slice('node_modules/'.length));
  return [...new Set([...declared, ...locked])].sort();
}

function walkFiles(directory, result = []) {
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(path, result);
    else result.push(path);
  }
  return result;
}

function webImportedSharedPaths(root, changed) {
  const sources = walkFiles(join(root, 'web')).filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path));
  const corpus = sources.map((path) => {
    try { return readFileSync(path, 'utf8'); } catch { return ''; }
  }).join('\n');
  return changed.filter((path) => path.startsWith('src/')).filter((path) => {
    const stem = path.replace(/\.[^.]+$/, '');
    return corpus.includes(stem) || corpus.includes(`/${basename(stem)}`);
  });
}

export function sourceFingerprint(root, gitState = inspectGit(root)) {
  const hash = createHash('sha256').update(gitState.head);
  hash.update(git(root, ['diff', 'HEAD', '--binary']));
  for (const path of gitState.untracked.sort()) {
    hash.update(path);
    const absolute = resolve(root, path);
    try {
      hash.update(readFileSync(absolute));
    } catch { hash.update('<UNREADABLE>'); }
  }
  return hash.digest('hex');
}

export function inspectImpact(root, gitState) {
  return classifyChanges(gitState.changedFiles, {
    dependencyChanges: dependencyChanges(root, gitState.baseline),
    webImportedSharedPaths: webImportedSharedPaths(root, gitState.changedFiles),
  });
}

function repositoryState(root) {
  const app = jsonFile(join(root, 'app.json')).expo ?? {};
  const eas = jsonFile(join(root, 'eas.json'));
  const pkg = jsonFile(join(root, 'package.json'));
  const webPkg = jsonFile(join(root, 'web', 'package.json'));
  const migrations = existsSync(join(root, 'supabase', 'migrations'))
    ? readdirSync(join(root, 'supabase', 'migrations')).filter((name) => name.endsWith('.sql')).sort() : [];
  return {
    migrations: { count: migrations.length, latest: migrations.at(-1) ?? 'NONE' },
    versions: {
      app: app.version ?? 'UNKNOWN',
      expo: pkg.dependencies?.expo ?? 'UNKNOWN',
      reactNative: pkg.dependencies?.['react-native'] ?? 'UNKNOWN',
      expoUpdates: pkg.dependencies?.['expo-updates'] ?? 'UNKNOWN',
      next: webPkg.dependencies?.next ?? 'UNKNOWN',
    },
    runtimeVersion: app.runtimeVersion ?? 'UNKNOWN',
    androidPackage: app.android?.package ?? 'UNKNOWN',
    iosBundleIdentifier: app.ios?.bundleIdentifier ?? 'UNKNOWN',
    easChannels: Object.fromEntries(Object.entries(eas.build ?? {}).filter(([, value]) => value?.channel).map(([key, value]) => [key, value.channel])),
    hosts: {
      public: 'usewarsha.com',
      customerWorker: 'app.usewarsha.com',
      admin: 'admin.usewarsha.com',
      mail: 'mail.usewarsha.com',
    },
  };
}

export function redact(value, home = process.env.USERPROFILE ?? process.env.HOME ?? '') {
  if (Array.isArray(value)) return value.map((entry) => redact(entry, home));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '<REDACTED>' : redact(entry, home)]));
  }
  if (typeof value !== 'string') return value;
  let output = home ? value.replaceAll(home, '<HOME>').replaceAll(home.replaceAll('\\', '/'), '<HOME>') : value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(new RegExp(pattern.source, `${pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`}`), '<REDACTED>');
  return output;
}

export function assertArtifactSafe(text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error(`Refusing to write generated artifact: credential-shaped content matched ${pattern}.`);
  }
}

export function writeArtifact(root, relativePath, value) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const text = typeof value === 'string' ? redact(value) : `${JSON.stringify(redact(value), null, 2)}\n`;
  assertArtifactSafe(text);
  writeFileSync(path, text, 'utf8');
  return path;
}

function latestEvidence(root, relativePath, fingerprint) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return { status: 'UNKNOWN', reason: 'No evidence artifact exists.' };
  const evidence = jsonFile(path, null);
  if (!evidence) return { status: 'UNKNOWN', reason: 'Evidence artifact is unreadable.' };
  if (evidence.sourceFingerprint !== fingerprint) return { status: 'STALE', reason: 'Evidence belongs to a different source state.', artifact: relativePath };
  return { ...evidence, artifact: relativePath };
}

function parsedCommandJson(output) {
  try { return JSON.parse(output); } catch {
    const arrayStart = output.indexOf('[');
    const objectStart = output.indexOf('{');
    const start = arrayStart < 0 ? objectStart : objectStart < 0 ? arrayStart : Math.min(arrayStart, objectStart);
    const end = Math.max(output.lastIndexOf(']'), output.lastIndexOf('}'));
    if (start >= 0 && end > start) {
      try { return JSON.parse(output.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function listFromJson(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

export function queryPreviewDeployment(root) {
  const updateCommand = executeCommand('eas', ['update:list', '--branch', 'preview', '--limit', '2', '--json', '--non-interactive'], { cwd: root });
  const buildCommand = executeCommand('eas', ['build:list', '--profile', 'preview', '--limit', '4', '--json', '--non-interactive'], { cwd: root });
  const updates = listFromJson(parsedCommandJson(updateCommand.stdout), ['updates', 'updateGroups']);
  const builds = listFromJson(parsedCommandJson(buildCommand.stdout), ['builds']);
  const byPlatform = (values, platform) => values.find((entry) => entry?.platform?.toLowerCase?.() === platform)
    ?? values.flatMap((entry) => Array.isArray(entry?.updates) ? entry.updates : []).find((entry) => entry?.platform?.toLowerCase?.() === platform);
  const androidUpdate = byPlatform(updates, 'android');
  const iosUpdate = byPlatform(updates, 'ios');
  const latest = updates[0] ?? androidUpdate ?? iosUpdate ?? {};
  const buildFor = (platform) => builds.find((entry) => entry?.platform?.toLowerCase?.() === platform) ?? {};
  const androidBuild = buildFor('android');
  const iosBuild = buildFor('ios');
  return {
    previewOta: {
      groupId: latest.group ?? latest.groupId ?? 'UNKNOWN',
      runtime: latest.runtimeVersion ?? androidUpdate?.runtimeVersion ?? iosUpdate?.runtimeVersion ?? 'UNKNOWN',
      sourceCommit: latest.gitCommitHash ?? latest.sourceCommit ?? 'UNKNOWN',
      androidUpdateId: androidUpdate?.id ?? 'UNKNOWN',
      iosUpdateId: iosUpdate?.id ?? 'UNKNOWN',
    },
    previewNativeBuilds: {
      androidBuildId: androidBuild.id ?? 'UNKNOWN',
      iosBuildId: iosBuild.id ?? 'UNKNOWN',
    },
    queryEvidence: {
      updates: updateCommand.exitCode === 0 ? 'QUERIED' : 'UNKNOWN',
      builds: buildCommand.exitCode === 0 ? 'QUERIED' : 'UNKNOWN',
    },
  };
}

function deploymentEvidence(root, fingerprint, online = false) {
  const evidence = latestEvidence(root, 'artifacts/release/latest.json', fingerprint);
  const smoke = latestEvidence(root, 'artifacts/smoke/latest.json', fingerprint);
  const defaults = {
    status: 'UNKNOWN', reason: 'No evidence artifact exists.',
    web: {
      latestVercel: { status: 'UNKNOWN', sourceCommit: 'UNKNOWN', deploymentId: 'UNKNOWN' },
      hosts: {
        'usewarsha.com': 'UNKNOWN',
        'www.usewarsha.com': 'UNKNOWN',
        'app.usewarsha.com': 'UNKNOWN',
        'admin.usewarsha.com': 'UNKNOWN',
      },
    },
    previewOta: {
      groupId: 'UNKNOWN', runtime: 'UNKNOWN', sourceCommit: 'UNKNOWN',
      androidUpdateId: 'UNKNOWN', iosUpdateId: 'UNKNOWN',
    },
    previewNativeBuilds: { androidBuildId: 'UNKNOWN', iosBuildId: 'UNKNOWN' },
  };
  const result = {
    ...defaults,
    ...evidence,
    web: { ...defaults.web, ...(evidence.web ?? {}) },
    previewOta: { ...defaults.previewOta, ...(evidence.previewOta ?? {}) },
    previewNativeBuilds: { ...defaults.previewNativeBuilds, ...(evidence.previewNativeBuilds ?? {}) },
  };
  if (smoke.status === 'PASSED') {
    const passed = (id) => smoke.checks?.find((check) => check.id === id)?.passed === true ? 'REACHABLE' : 'UNKNOWN';
    result.web.hosts = {
      'usewarsha.com': passed('public-en') === 'REACHABLE' && passed('public-ar') === 'REACHABLE' ? 'REACHABLE_EN_AR' : 'UNKNOWN',
      'www.usewarsha.com': passed('www-redirect') === 'REACHABLE' ? 'CANONICAL_REDIRECT_REACHABLE' : 'UNKNOWN',
      'app.usewarsha.com': passed('app-sign-in') === 'REACHABLE' && passed('app-create-account') === 'REACHABLE' ? 'PUBLIC_AUTH_ROUTES_REACHABLE' : 'UNKNOWN',
      'admin.usewarsha.com': passed('admin-sign-in') === 'REACHABLE' ? 'PUBLIC_SIGN_IN_REACHABLE' : 'UNKNOWN',
    };
    result.web.smokeScope = smoke.scope;
  }
  if (online) Object.assign(result, queryPreviewDeployment(root));
  return result;
}

function unfinishedWork(root) {
  const state = jsonFile(join(root, 'docs', 'engineering', 'open-work.json'), { items: [] });
  return Array.isArray(state.items) ? state.items.filter((item) => item.status !== 'complete') : [];
}

function documentationEvidence(root, impact) {
  const index = jsonFile(join(root, 'docs', 'help', 'help-index.json'), { articles: [], features: {} });
  const rules = [
    { pattern: /(?:auth|sign-in|create-account|password|session)/i, features: ['auth', 'onboarding'] },
    { pattern: /(?:address|location|map)/i, features: ['addresses', 'location'] },
    { pattern: /(?:verification|vetting)/i, features: ['verification'] },
    { pattern: /(?:marketplace|quote|request)/i, features: ['marketplace'] },
    { pattern: /(?:staff|capabilit|fresh-auth|dual-control)/i, features: ['staff_roles', 'reauth', 'dual_control'] },
    { pattern: /(?:analytics|report|export)/i, features: ['analytics', 'audit'] },
  ];
  const affectedFeatures = [...new Set(rules
    .filter(rule => impact.files.some(path => rule.pattern.test(path)))
    .flatMap(rule => rule.features))].sort();
  const ids = [...new Set(affectedFeatures.flatMap(feature => index.features?.[feature] ?? []))].sort();
  const references = (index.articles ?? [])
    .filter(article => ids.includes(article.id))
    .map(article => ({ id: article.id, locale: article.locale, audience: article.audience, routes: article.routes }))
    .sort((left, right) => `${left.id}:${left.locale}`.localeCompare(`${right.id}:${right.locale}`));
  const sourceReviewed = impact.files.some(path => path === 'docs/help/articles.json' || path === 'docs/help/articles.fr.json');
  return {
    affected: affectedFeatures.length > 0,
    affectedFeatures,
    articleIds: ids,
    references,
    sourceReviewed,
    status: affectedFeatures.length === 0 ? 'NOT_APPLICABLE' : sourceReviewed ? 'REVIEWED_IN_DIFF' : 'REVIEW_REQUIRED',
  };
}

export function validateHandoff(value) {
  const required = ['schemaVersion', 'generatedAt', 'baseline', 'git', 'repository', 'changes', 'platformImpact', 'validation', 'deployment', 'documentation', 'humanVerification', 'unfinishedWork', 'warnings'];
  const errors = required.filter((key) => !(key in value)).map((key) => `Missing ${key}`);
  if (value.schemaVersion !== HANDOFF_SCHEMA_VERSION) errors.push('Unsupported schemaVersion');
  if (!Array.isArray(value.humanVerification)) errors.push('humanVerification must be an array');
  if (!Array.isArray(value.unfinishedWork)) errors.push('unfinishedWork must be an array');
  if (!Array.isArray(value.warnings)) errors.push('warnings must be an array');
  return { valid: errors.length === 0, errors };
}

export function buildHandoff(root, options = {}) {
  const baseline = resolveBaseline(root, options.baseline);
  const gitState = inspectGit(root, baseline);
  const fingerprint = sourceFingerprint(root, gitState);
  let impact = inspectImpact(root, gitState);
  const validation = latestEvidence(root, 'artifacts/validation/latest.json', fingerprint);
  if (impact.files.length === 0 && validation.status === 'PASSED' && validation.impact) impact = validation.impact;
  const release = classifyRelease(impact);
  const deployment = deploymentEvidence(root, fingerprint, options.online === true);
  const documentation = documentationEvidence(root, impact);
  const handoff = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    baseline,
    sourceFingerprint: fingerprint,
    git: gitState,
    repository: repositoryState(root),
    changes: { files: gitState.changedFiles, count: gitState.changedFiles.length },
    platformImpact: impact,
    validation,
    deployment,
    documentation,
    release,
    humanVerification: manualAcceptanceFor(impact, validation, release),
    unfinishedWork: unfinishedWork(root),
    warnings: [
      ...impact.warnings,
      ...(documentation.status === 'REVIEW_REQUIRED' ? ['Relevant help documentation has not been reviewed in this source diff.'] : []),
      'Generated handoffs are advisory; verify them against Git before acting.',
    ],
  };
  const checked = validateHandoff(handoff);
  if (!checked.valid) throw new Error(`Invalid handoff: ${checked.errors.join('; ')}`);
  return redact(handoff);
}

function list(values) { return values.length ? values.map((value) => `- ${value}`).join('\n') : '- None'; }

export function renderHandoff(handoff) {
  const affected = Object.entries(handoff.platformImpact.surfaces).filter(([, yes]) => yes).map(([name]) => name);
  return `# Warsha engineering handoff\n\nGenerated: ${handoff.generatedAt}\n\n## Git\n\n- Branch: ${handoff.git.branch}\n- HEAD: ${handoff.git.head}\n- Baseline: ${handoff.baseline}\n- Clean: ${handoff.git.clean}\n- origin/main ahead/behind: ${handoff.git.originMain.ahead}/${handoff.git.originMain.behind}\n- Stashes: ${handoff.git.stashCount}\n\n### Changed files\n\n${list(handoff.changes.files)}\n\n## Impact\n\n- Affected surfaces: ${affected.join(', ') || 'none'}\n- OTA: ${handoff.platformImpact.otaEligibility}\n- Native build: ${handoff.platformImpact.nativeBuildRequirement}\n- Migration: ${handoff.platformImpact.backendMigrationRequired}\n- Release: ${handoff.release.classification}\n\n${list(handoff.platformImpact.reasons)}\n\n## Documentation\n\n- Status: ${handoff.documentation.status}\n- Features: ${handoff.documentation.affectedFeatures.join(', ') || 'none'}\n- Articles: ${handoff.documentation.articleIds.join(', ') || 'none'}\n\n## Validation evidence\n\n- Status: ${handoff.validation.status}\n- Reason: ${handoff.validation.reason ?? 'Recorded for this source state.'}\n\n## Deployment evidence\n\n- Status: ${handoff.deployment.status}\n- Reason: ${handoff.deployment.reason ?? 'Recorded for this source state.'}\n\n## Human verification\n\n${list(handoff.humanVerification.map((item) => `${item.platform}: ${item.expected}`))}\n\n## Unfinished work\n\n${list(handoff.unfinishedWork.map((item) => `${item.id}: ${item.summary}`))}\n\n## Warnings\n\n${list(handoff.warnings)}\n`;
}

export function currentContext(root, options = {}) {
  const baseline = resolveBaseline(root, options.baseline);
  const gitState = inspectGit(root, baseline);
  const impact = inspectImpact(root, gitState);
  const fingerprint = sourceFingerprint(root, gitState);
  const validation = latestEvidence(root, 'artifacts/validation/latest.json', fingerprint);
  const release = classifyRelease(impact);
  return { root, baseline, gitState, impact, fingerprint, validation, release, plan: planValidation(impact) };
}

export function readJson(path, fallback = null) { return jsonFile(path, fallback); }
