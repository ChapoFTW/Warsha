export const HANDOFF_SCHEMA_VERSION = 1;

export const SURFACES = [
  'android',
  'ios',
  'publicWeb',
  'customerWeb',
  'workerWeb',
  'adminWeb',
  'backend',
];

export const DETERMINISTIC_TEST_SCRIPTS = [
  'test:payments',
  'test:wps008-alignment',
  'test:device-p1',
  'test:brand',
  'test:worker-auth',
  'test:customer-email-confirmation',
  'test:qa-preview',
  'test:profile-phone',
  'test:wps009',
  'test:wps010',
  'test:wps011',
  'test:wps012',
  'test:wps013',
  'test:wps014',
  'test:wps015',
  'test:wps016',
  'test:wps017',
  'test:wps018',
  'test:wps019',
  'test:wps020',
  'test:wps021',
  'test:wps022',
  'test:wps023',
  'test:wps024',
  'test:wps025',
  'test:marketplace',
  'test:platform-preferences',
  'test:onboarding-stabilization',
  'test:address-location',
  'test:business-analytics',
  'test:form-clarity',
  'test:french-localization',
  'test:service-labels',
  'test:service-catalogue',
  'test:specific-service-rendering',
  'test:catalogue-consumers',
  'test:warsha-icons',
  'test:authenticated-navigation',
  'test:request-creation',
  'test:native-specific-service',
  'test:state-persistence',
  'test:automation-authority',
  'test:identity-extraction',
  'test:android-permissions',
  'test:push-delivery',
  'test:network-failure',
  'test:operational-monitoring',
  'test:client-error-reporting',
  'test:timezone',
  'test:native-admin-boundary',
  'test:notification-catalogue',
  'test:financial-notifications',
  'test:address-contract',
  'test:spacing-system',
  'test:help-docs',
  'test:signup-legal-startup',
  'test:signup-state',
  'test:web-platform',
  'test:web-bilingual',
  'test:identity-signin',
  'test:rtl-direction',
  'test:web-brand',
  'test:brand-assets',
  'test:web-auth',
  'test:web-app',
  'test:admin-console',
  'test:web-navigation',
  'test:password-recovery',
  'test:automation',
  'test:auth-validation',
  'test:session-teardown',
  'test:realtime-coverage',
  'test:release-boundary',
  'test:signed-url-policy',
  'test:criminal-record-contract',
  'test:worker-auth-password-contract',
];

const NATIVE_DEPENDENCY_PREFIXES = [
  'expo',
  'react-native',
  '@react-native',
  '@expo',
];

function normalizedPath(value) {
  return String(typeof value === 'string' ? value : value.path).replaceAll('\\', '/').replace(/^\.\//, '');
}

function emptyImpact(files) {
  return {
    files,
    surfaces: Object.fromEntries(SURFACES.map((surface) => [surface, false])),
    domains: {
      auth: false,
      routing: false,
      localization: false,
      appearance: false,
      brandAssets: false,
      documentation: false,
      formClarity: false,
      testsToolingOnly: false,
    },
    sharedJsTs: false,
    androidNative: false,
    iosNative: false,
    backendMigrations: false,
    edgeFunctions: false,
    testsTooling: false,
    webOnly: false,
    otaEligibility: 'NOT_APPLICABLE',
    nativeBuildRequirement: 'NONE',
    backendMigrationRequired: false,
    edgeFunctionDeployRequired: false,
    humanVisualApprovalRequired: false,
    reviewRequired: false,
    reasons: [],
    warnings: [],
  };
}

function markAllWeb(impact) {
  impact.surfaces.publicWeb = true;
  impact.surfaces.customerWeb = true;
  impact.surfaces.workerWeb = true;
  impact.surfaces.adminWeb = true;
}

function markMobile(impact) {
  impact.surfaces.android = true;
  impact.surfaces.ios = true;
}

function pathDomain(impact, path) {
  if (/(?:^|\/)(?:auth|sign-in|create-account|password|session|identity|onboarding)(?:\/|\.|-|$)/i.test(path)) {
    impact.domains.auth = true;
  }
  if (/(?:route|routing|navigation|redirect|deep-link|_layout|middleware)/i.test(path)) {
    impact.domains.routing = true;
  }
  if (/(?:i18n|translation|locale|language|rtl|copy)/i.test(path)) {
    impact.domains.localization = true;
  }
  if (/(?:^|\/)(?:docs\/help|help)(?:\/|\.|-|$)|help-docs/i.test(path)) {
    impact.domains.documentation = true;
  }
  if (/(?:form|field|input|address|location|helper|placeholder|accessibility)/i.test(path)) {
    impact.domains.formClarity = true;
  }
  if (/(?:appearance|theme|dark|light|color|colour|style)/i.test(path)) {
    impact.domains.appearance = true;
  }
  if (/(?:brand|logo|icon|splash|favicon|adaptive|monochrome|notification)/i.test(path)) {
    impact.domains.brandAssets = true;
  }
}

/**
 * Deterministic, conservative impact classification. `webImportedSharedPaths`
 * is produced by the cheap import scan in runtime.mjs; a shared module reaches
 * web only when the web client imports that module (or a parent barrel).
 */
export function classifyChanges(changes, options = {}) {
  const files = [...new Set(changes.map(normalizedPath).filter(Boolean))].sort();
  const impact = emptyImpact(files);
  const webImported = new Set(options.webImportedSharedPaths ?? []);
  const dependencyChanges = options.dependencyChanges ?? [];

  for (const path of files) {
    pathDomain(impact, path);

    if (path.startsWith('supabase/migrations/')) {
      impact.surfaces.backend = true;
      impact.backendMigrations = true;
      impact.backendMigrationRequired = true;
      impact.reasons.push(`${path}: forward database migration`);
      continue;
    }
    if (path.startsWith('supabase/functions/')) {
      impact.surfaces.backend = true;
      impact.edgeFunctions = true;
      impact.edgeFunctionDeployRequired = true;
      impact.reasons.push(`${path}: Edge Function`);
      continue;
    }
    if (path.startsWith('supabase/')) {
      impact.surfaces.backend = true;
      impact.reasons.push(`${path}: shared backend configuration/test`);
      continue;
    }

    if (path.startsWith('android/')) {
      impact.surfaces.android = true;
      impact.androidNative = true;
      impact.reasons.push(`${path}: Android native source/configuration`);
      continue;
    }
    if (path.startsWith('ios/')) {
      impact.surfaces.ios = true;
      impact.iosNative = true;
      impact.reasons.push(`${path}: iOS native source/configuration`);
      continue;
    }
    /*
     * A config plugin rewrites the generated native project.
     *
     * `plugins/warsha-android-permissions.js` edits the Android manifest during
     * prebuild, which is as native an input as `app.json` — and until this rule
     * existed it fell through to "no authoritative rule; review required",
     * which is the safe answer but not an answer. Marked for both platforms
     * rather than for Android alone: the directory is for config plugins, and
     * the next one may touch iOS.
     */
    if (path.startsWith('plugins/')) {
      markMobile(impact);
      impact.androidNative = true;
      impact.iosNative = true;
      impact.reasons.push(`${path}: Expo config plugin; rewrites the generated native project`);
      continue;
    }

    /*
     * The example environment file documents variable NAMES and holds no value.
     * It is documentation about configuration, not configuration.
     */
    if (path === '.env.example') {
      impact.testsTooling = true;
      impact.reasons.push(`${path}: documented environment variable inventory`);
      continue;
    }

    if (['app.json', 'app.config.js', 'eas.json'].includes(path)) {
      markMobile(impact);
      impact.androidNative = true;
      impact.iosNative = true;
      impact.reasons.push(`${path}: native/runtime/build configuration`);
      continue;
    }

    if (path === 'package.json' || path === 'package-lock.json') {
      impact.testsTooling = true;
      if (dependencyChanges.some((name) => NATIVE_DEPENDENCY_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}-`) || name.startsWith(`${prefix}/`)))) {
        markMobile(impact);
        impact.androidNative = true;
        impact.iosNative = true;
        impact.reasons.push(`${path}: native-capable dependency graph changed`);
      } else {
        impact.reasons.push(`${path}: scripts/tooling or non-native dependency metadata`);
      }
      continue;
    }

    if (path.startsWith('web/')) {
      if (/^web\/(?:app|components|lib)\/(?:admin|app\/admin)(?:\/|$)/.test(path)) {
        impact.surfaces.adminWeb = true;
      } else if (/^web\/(?:app|components|lib)\/app\/worker(?:\/|$)/.test(path)) {
        impact.surfaces.workerWeb = true;
      } else if (/^web\/(?:app|components|lib)\/app(?:\/|$)/.test(path)) {
        impact.surfaces.customerWeb = true;
        impact.surfaces.workerWeb = true;
      } else if (/^web\/app\/\[locale\](?:\/|$)/.test(path)) {
        impact.surfaces.publicWeb = true;
      } else {
        markAllWeb(impact);
      }
      impact.reasons.push(`${path}: Next.js web surface`);
      continue;
    }

    if (path.startsWith('src/')) {
      impact.sharedJsTs = true;
      markMobile(impact);
      if (webImported.has(path)) {
        markAllWeb(impact);
        impact.reasons.push(`${path}: shared module imported by web and mobile`);
      } else {
        impact.reasons.push(`${path}: shared/mobile TypeScript authority`);
      }
      continue;
    }

    // `hooks/` belongs here for exactly the same reason the other three do: it
    // is shared client code that Android and iOS both run. It was missing, so
    // every file in it fell through to `reviewRequired` and the planner warned
    // instead of classifying — which is a planner that cannot answer the one
    // question it exists to answer, on a directory that has existed for a while.
    if (path.startsWith('app/') || path.startsWith('components/')
      || path.startsWith('constants/') || path.startsWith('hooks/')) {
      impact.sharedJsTs = true;
      markMobile(impact);
      impact.reasons.push(`${path}: shared Android/iOS application code`);
      continue;
    }

    if (path.startsWith('assets/')) {
      markMobile(impact);
      impact.sharedJsTs = true;
      if (/(?:icon|adaptive|monochrome|splash|notification)/i.test(path)) {
        impact.androidNative = true;
        impact.iosNative = true;
        impact.humanVisualApprovalRequired = true;
        impact.reasons.push(`${path}: launcher/store/native presentation asset`);
      } else {
        impact.reasons.push(`${path}: bundled presentation asset`);
      }
      continue;
    }

    if (/^(?:scripts\/|docs\/|\.github\/|\.gitignore$|AGENTS\.md$|README\.md$|tsconfig|eslint)/.test(path)
      || /(?:\.test\.|\.spec\.)/.test(path)) {
      impact.testsTooling = true;
      impact.reasons.push(`${path}: tests, documentation, CI, or tooling`);
      continue;
    }

    impact.reviewRequired = true;
    impact.warnings.push(`${path}: no authoritative impact rule; review required`);
  }

  const productSurface = Object.values(impact.surfaces).some(Boolean);
  impact.domains.testsToolingOnly = impact.testsTooling && !productSurface && !impact.sharedJsTs;
  impact.webOnly = !impact.surfaces.android && !impact.surfaces.ios && !impact.surfaces.backend
    && [impact.surfaces.publicWeb, impact.surfaces.customerWeb, impact.surfaces.workerWeb, impact.surfaces.adminWeb].some(Boolean);

  if (impact.androidNative && impact.iosNative) impact.nativeBuildRequirement = 'BOTH';
  else if (impact.androidNative) impact.nativeBuildRequirement = 'ANDROID';
  else if (impact.iosNative) impact.nativeBuildRequirement = 'IOS';

  if (impact.androidNative || impact.iosNative) impact.otaEligibility = 'INELIGIBLE_NATIVE_CHANGE';
  else if (impact.sharedJsTs && (impact.surfaces.android || impact.surfaces.ios)) impact.otaEligibility = 'ELIGIBLE';
  else if (impact.reviewRequired) impact.otaEligibility = 'REVIEW_REQUIRED';

  impact.reasons = [...new Set(impact.reasons)];
  impact.warnings = [...new Set(impact.warnings)];
  return impact;
}

function npmStep(id, script, reason) {
  return { id, label: `npm run ${script}`, executable: 'npm', args: ['run', script], required: true, external: false, reason };
}

function commandStep(id, executable, args, reason, external = false) {
  return { id, label: [executable, ...args].join(' '), executable, args, required: true, external, reason };
}

export function planValidation(impact, options = {}) {
  const steps = [];
  const add = (step) => { if (!steps.some((existing) => existing.id === step.id)) steps.push(step); };

  add(commandStep('diff-check', 'git', ['diff', '--check'], 'Every change must be whitespace-safe.'));
  add(npmStep('secret-audit', 'audit:secrets', 'Every source and generated report must remain credential-free.'));
  add(npmStep('migration-audit', 'audit:migrations', 'Forward-only migration history is a repository-wide invariant.'));
  add(npmStep('appearance-audit', 'audit:appearance', 'Theme token authority is repository-wide.'));
  add(npmStep('mojibake', 'check:mojibake', 'English/Arabic source encoding is repository-wide.'));
  add(npmStep('deterministic-tests', 'test:all', 'Run the explicit, repository-authoritative deterministic regression inventory.'));
  if (impact.domains.documentation || impact.files.some((path) => /(?:auth|sign-in|create-account|password|address|location|verification|vetting|marketplace|quote|request|staff|capabilit|analytics|report|export)/i.test(path))) {
    add(npmStep('docs-check', 'warsha:docs-check', 'Behavioral changes must map to current, audience-safe help documentation.'));
  }

  const qaPipelineChanged = impact.files.some((path) => path === 'package.json'
    || path === 'scripts/qa-release.mjs' || path === 'scripts/qa-preview-environment.mjs');
  const mobileOrShared = impact.sharedJsTs || impact.surfaces.android || impact.surfaces.ios || qaPipelineChanged;
  const anyWeb = impact.surfaces.publicWeb || impact.surfaces.customerWeb
    || impact.surfaces.workerWeb || impact.surfaces.adminWeb;

  if (mobileOrShared) {
    add(npmStep('qa-validate', 'qa:validate', 'Shared/mobile or QA-pipeline changes require the established Android, iOS, web and Preview gate.'));
  } else {
    add(npmStep('typecheck', 'typecheck', 'Root tooling and contracts must typecheck.'));
    add(npmStep('lint', 'lint', 'Root tooling and contracts must lint.'));
  }

  if (anyWeb) {
    add(npmStep('web-typecheck', 'web:typecheck', 'The Next.js customer/worker/admin client has a separate compiler boundary.'));
    add(npmStep('web-tests', 'test:web-app', 'Authenticated web product behavior changed.'));
    add(npmStep('web-auth', 'test:web-auth', 'Web session authority must remain deterministic.'));
    add(npmStep('web-navigation', 'test:web-navigation', 'Host and route isolation must remain valid.'));
    if (impact.domains.localization || impact.domains.appearance || impact.domains.brandAssets) {
      add(npmStep('web-bilingual', 'test:web-bilingual', 'Localized appearance behavior changed.'));
      add(npmStep('rtl-direction', 'test:rtl-direction', 'Arabic direction must remain correct.'));
    }
    add(npmStep('web-build', 'web:build', 'The deployable Next.js artifact must compile.'));
    // Immediately after, and only here: these assertions read `web/.next`, so
    // they belong to the step that produces it rather than to the deterministic
    // suite, which must stay self-contained from a clean checkout.
    add(npmStep('web-build-output', 'test:web-build-output', 'The compiled output must carry the language, direction and routes the source promised.'));
  }

  if (impact.domains.auth) {
    for (const [id, script] of [
      ['auth-identity', 'test:identity-signin'],
      ['auth-onboarding', 'test:onboarding-stabilization'],
      ['auth-signup', 'test:signup-state'],
      ['auth-email', 'test:customer-email-confirmation'],
      ['auth-recovery', 'test:password-recovery'],
      ['auth-wps023', 'test:wps023'],
    ]) add(npmStep(id, script, 'Authentication/session/onboarding behavior changed.'));
  }

  if (impact.backendMigrations) {
    add(commandStep('local-reset', 'npx', ['supabase', 'db', 'reset', '--local'], 'Prove the forward chain from an empty local database.'));
    add(npmStep('pgtap', 'db:test', 'Run every database contract test.'));
    add(commandStep('linked-dry-run', 'npx', ['supabase', 'db', 'push', '--linked', '--dry-run'], 'Compare the intended forward chain with hosted development.', true));
  }

  if (impact.edgeFunctions) {
    add(commandStep('edge-function-check', 'npx', ['supabase', 'functions', 'list', '--project-ref', options.projectRef ?? 'lrhipbcapzfxuwixfoog'], 'Confirm the development Edge Function target without deploying.', true));
  }

  return {
    schemaVersion: 1,
    affectedSurfaces: Object.entries(impact.surfaces).filter(([, affected]) => affected).map(([surface]) => surface),
    steps,
    warnings: impact.warnings,
  };
}

export function classifyRelease(impact) {
  const components = [];
  const reasons = [];
  const webAffected = impact.surfaces.publicWeb || impact.surfaces.customerWeb
    || impact.surfaces.workerWeb || impact.surfaces.adminWeb;

  if (webAffected) {
    components.push('WEB_DEPLOY_REQUIRED');
    reasons.push('A deployable Next.js web surface changed.');
  }
  if (impact.backendMigrations) {
    components.push('MIGRATION_REQUIRED');
    reasons.push('A forward database migration changed.');
  } else if (impact.edgeFunctions || (impact.surfaces.backend && !impact.testsTooling)) {
    components.push('BACKEND_DEPLOY_REQUIRED');
    reasons.push(impact.edgeFunctions ? 'An Edge Function changed.' : 'Shared backend behavior changed.');
  }

  if (impact.androidNative && impact.iosNative) {
    components.push('PREVIEW_NATIVE_BOTH_REQUIRED');
    reasons.push('Native/runtime-compatible inputs changed for both mobile platforms; OTA is insufficient.');
  } else if (impact.androidNative) {
    components.push('PREVIEW_NATIVE_ANDROID_REQUIRED');
    reasons.push('Android native/runtime inputs changed; OTA is insufficient.');
  } else if (impact.iosNative) {
    components.push('PREVIEW_NATIVE_IOS_REQUIRED');
    reasons.push('iOS native/runtime inputs changed; OTA is insufficient.');
  } else if (impact.otaEligibility === 'ELIGIBLE') {
    components.push('PREVIEW_OTA_REQUIRED');
    reasons.push('Reachable mobile JS/TS or compatible assets changed without a native input change.');
  }

  if (impact.humanVisualApprovalRequired || impact.reviewRequired) {
    components.push('HUMAN_REVIEW_REQUIRED');
    reasons.push(impact.humanVisualApprovalRequired
      ? 'Launcher/store/brand presentation changed and needs visual approval.'
      : 'At least one changed path has no authoritative automated classification.');
  }

  const unique = [...new Set(components)];
  return {
    classification: unique.length === 0 ? 'NO_RELEASE_REQUIRED'
      : unique.length === 1 ? unique[0] : 'MIXED_RELEASE',
    components: unique,
    reasons: unique.length === 0 ? ['Only tests, tooling, CI, or documentation changed.'] : reasons,
  };
}

function acceptanceItem(platform, precondition, steps, expected) {
  return { platform, precondition, steps, expected };
}

export function manualAcceptanceFor(impact, validation, release) {
  const items = [];
  const validated = validation?.status === 'PASSED';
  if (impact.domains.testsToolingOnly || impact.files.length === 0) {
    if (impact.files.length) {
      items.push(acceptanceItem(
        'Engineering tooling',
        'The exact source revision has a passing validation artifact.',
        ['Run warsha:handoff, warsha:recover, warsha:impact and warsha:release-check.', 'Inspect generated JSON/Markdown for redaction and truthful UNKNOWN values.'],
        'Commands agree on Git state, do not mutate Git, and do not claim unevidenced deployments.',
      ));
    }
    return items;
  }

  if (impact.domains.auth) {
    if (impact.surfaces.android) items.push(acceptanceItem('Android Preview', 'Fresh Preview installation and test customer/worker accounts.', ['Sign up and sign in as customer.', 'Exercise confirmation and password recovery.', 'Restart and verify session/onboarding routing.', 'Repeat the affected worker identity flow.'], 'Every auth path settles without identity leakage or a guessed customer/worker route.'));
    if (impact.surfaces.ios) items.push(acceptanceItem('iOS Preview', 'Signed Preview build on a registered test device.', ['Repeat customer and worker sign-in/onboarding/session restoration.', 'Open confirmation and recovery deep links.'], 'Behavior matches Android; platform-native links return to the intended state.'));
    if (impact.surfaces.customerWeb || impact.surfaces.workerWeb) items.push(acceptanceItem('Customer/worker web', 'The validated commit is deployed to the application origin.', ['Exercise sign-up, sign-in, recovery, sign-out and refresh.', 'Repeat in English, Arabic, and French.'], 'Session and onboarding resolution match mobile; Arabic remains RTL and French remains LTR.'));
  }

  if (impact.surfaces.publicWeb) items.push(acceptanceItem('Public web', 'The validated commit is deployed.', ['Open English, Arabic, and French entry/help/legal pages.', 'Check canonical navigation and dark/light system presentation.'], 'No 404, direction flash, incorrect host, or brand drift.'));
  if (impact.domains.documentation) items.push(acceptanceItem('Help and manuals', 'The generated help indexes match their source.', ['Search customer help in English, Arabic, and French.', 'Switch to worker mode and confirm worker topics replace customer-only topics.', 'As authorized staff, search the admin manual and confirm it is absent from public help.'], 'Help is readable, routes resolve, search works, and audience boundaries hold.'));
  if (impact.surfaces.adminWeb) items.push(acceptanceItem('Admin web', 'A staff account with the required capability, fresh reauthentication/MFA where enforced.', ['Sign in at the admin origin.', 'Exercise only the affected staff action.', 'Verify the audit result.'], 'The admin origin remains isolated and capability-gated.'));
  if (impact.backendMigrations) items.push(acceptanceItem('Hosted development backend', 'Recorded backup/restore point and approved development migration window.', ['Review linked dry-run.', 'Apply only the expected forward migration through the governed workflow.', 'Run platform verification and consuming-client smoke checks.'], 'Migration ledger matches and no unexpected verification failures appear.'));
  if (impact.humanVisualApprovalRequired) items.push(acceptanceItem('Brand/store presentation', 'Fresh Android and iOS native builds.', ['Inspect launcher, splash and notification presentation in light/dark/system.', 'Compare against the approved Warsha assets.'], 'No crop, obsolete mark, inversion or platform mismatch.'));

  if (!validated && items.length) {
    items.unshift(acceptanceItem('Validation prerequisite', 'None.', ['Run warsha:validate on the exact source state.'], `A PASSED validation artifact exists before ${release.classification} is attempted.`));
  }
  return items;
}
