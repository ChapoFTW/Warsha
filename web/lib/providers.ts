/**
 * External provider activation, as an operator sees it.
 *
 * Every technical rule here already lives in the database.
 * `staff_activate_external_provider` refuses an environment mismatch, an
 * unbound project, a provider that is not ready, a missing feature flag, a flag
 * that is *already* enabled, a missing kill switch, and any attempt without a
 * consumed dual-control approval. Vision also has documented legal commitments
 * which that activation RPC does not infer. This module observes them through
 * the existing governance overview and keeps the console closed until they are
 * ready. It cannot relax any server refusal.
 *
 * The sequence is the backend's, not a convenience ordering. The feature flag
 * comes after activation because the activation RPC refuses while the flag is
 * enabled — turning the feature on first does not shortcut the process, it
 * blocks it.
 */

export const MAPS_PROVIDER_KEY = 'google_maps_platform';
export const MAPS_FEATURE_FLAG = 'location_provider';
export const VISION_PROVIDER_KEY = 'google_cloud_vision';
export const VISION_FEATURE_FLAG = 'identity_extraction';
export const ACTIVATION_ACTION_KEY = 'activate_external_provider';
export const ACTIVATION_CAPABILITY = 'manage_subprocessors';

/**
 * The providers this console can take through activation.
 *
 * The page used to name `MAPS_PROVIDER_KEY` in six places, which made the whole
 * governed sequence — request, second approval, activate, feature flag —
 * reachable for exactly one provider. Google Cloud Vision had a registry row, a
 * credential, a deployed function and a feature flag, and no way for an
 * operator to switch it on. That is not a governance boundary; it is a missing
 * screen, and it is the only reason the OCR activation could not proceed.
 *
 * Everything that differs between providers is here, so the page renders one
 * sequence and the database enforces one set of rules for both.
 */
export type GovernedProvider = {
  providerKey: string;
  featureFlag: string;
  copySuffix: '' | '_vision';
  choiceCopyKey: 'providerChooseMaps' | 'providerChooseVision';
  /** Vision carries identity data and must satisfy its published legal gate. */
  requiresIdentityPolicyGate: boolean;
  /**
   * How the console asks whether a server credential exists.
   *
   * A credential lives in an Edge Function's runtime, never in Postgres, so
   * `staff_provider_registry` can report its NAME but not its presence. Each
   * provider therefore answers a capability probe on its own function. Both
   * probes return one boolean and have no path that could return a value.
   */
  credentialProbe: {
    functionName: string;
    body: Record<string, unknown>;
    /** Reads the boolean out of that function's own response shape. */
    read: (payload: unknown) => boolean;
  };
  /**
   * Whether the console can prove the provider answers, by itself.
   *
   * Maps can: an autocomplete and a reverse geocode are harmless reads. Vision
   * cannot — the only thing it does is read a document, so proving it works
   * means a person photographing a synthetic card on a device. That step is
   * therefore `waiting` rather than `ready` for Vision: correct, and needing
   * somebody else. Pretending otherwise would put a button on screen that
   * either does nothing or bills a real extraction against a real person.
   */
  automaticHealthProbe: boolean;
};

const readBool = (value: unknown, path: readonly string[]): boolean => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[key];
  }
  return current === true;
};

export const GOVERNED_PROVIDERS: readonly GovernedProvider[] = [
  {
    providerKey: MAPS_PROVIDER_KEY,
    featureFlag: MAPS_FEATURE_FLAG,
    copySuffix: '',
    choiceCopyKey: 'providerChooseMaps',
    requiresIdentityPolicyGate: false,
    credentialProbe: {
      functionName: 'location-proxy',
      body: { operation: 'render_descriptor' },
      read: (payload) => readBool(payload, ['descriptor', 'serverCredentialAvailable']),
    },
    automaticHealthProbe: true,
  },
  {
    providerKey: VISION_PROVIDER_KEY,
    featureFlag: VISION_FEATURE_FLAG,
    copySuffix: '_vision',
    choiceCopyKey: 'providerChooseVision',
    requiresIdentityPolicyGate: true,
    credentialProbe: {
      functionName: 'vision-extract',
      body: { operation: 'capability' },
      read: (payload) => readBool(payload, ['credentialConfigured']),
    },
    automaticHealthProbe: false,
  },
];

export function governedProvider(providerKey: string): GovernedProvider {
  return GOVERNED_PROVIDERS.find((entry) => entry.providerKey === providerKey)
    ?? GOVERNED_PROVIDERS[0];
}

/**
 * The material documents named by the Google Vision register entry and legal
 * corpus. A second version is not enough by itself: the current version has to
 * be classified material (or urgent), so an editorial release cannot be used
 * to make the activation screen appear legally ready.
 */
export const VISION_REQUIRED_LEGAL_DOCUMENTS = [
  'ai_usage_policy',
  'ocr_usage_policy',
  'privacy_policy',
  'subprocessor_register',
  'worker_verification_policy',
] as const;

export type ProviderPolicyState = {
  materialDocumentsPublished: boolean;
  agreementSigned: boolean;
  trainingProhibited: boolean;
  processingBasisApproved: boolean;
  aiUseApproved: boolean;
  reconsentEnforced: boolean;
  ready: boolean;
};

/** Read the counts and states returned by `staff_legal_governance_overview`. */
export function providerPolicyState(
  providerKey: string,
  payload: unknown,
): ProviderPolicyState {
  if (providerKey !== VISION_PROVIDER_KEY) {
    return {
      materialDocumentsPublished: true,
      agreementSigned: true,
      trainingProhibited: true,
      processingBasisApproved: true,
      aiUseApproved: true,
      reconsentEnforced: true,
      ready: true,
    };
  }

  const overview = record(payload);
  const documents = Array.isArray(overview.documents) ? overview.documents : [];
  const subprocessors = Array.isArray(overview.subprocessors) ? overview.subprocessors : [];
  const activities = Array.isArray(overview.processingActivities)
    ? overview.processingActivities : [];
  const aiUses = Array.isArray(overview.aiUses) ? overview.aiUses : [];

  const materialDocumentsPublished = VISION_REQUIRED_LEGAL_DOCUMENTS.every((documentKey) => {
    const document = documents.map(record)
      .find((entry) => str(entry.documentKey) === documentKey);
    return Number(document?.versionCount ?? 0) >= 2
      && ['material', 'urgent'].includes(str(document?.changeClass) ?? '');
  });
  const vision = subprocessors.map(record)
    .find((entry) => str(entry.key) === VISION_PROVIDER_KEY);
  const workerVerification = activities.map(record)
    .find((entry) => str(entry.key) === 'worker_verification');
  const identityExtraction = aiUses.map(record)
    .find((entry) => str(entry.key) === 'identity_text_extraction');

  const state: ProviderPolicyState = {
    materialDocumentsPublished,
    agreementSigned: str(vision?.agreementStatus) === 'signed',
    trainingProhibited: vision?.trainingProhibited === true,
    processingBasisApproved: str(workerVerification?.reviewStatus) === 'approved',
    aiUseApproved: ['approved_not_integrated', 'in_use']
      .includes(str(identityExtraction?.status) ?? '')
      && identityExtraction?.coversIdentityData === true
      && identityExtraction?.permittedForTraining === false,
    reconsentEnforced: record(overview.configuration).reconsentEnforced === true,
    ready: false,
  };
  state.ready = state.materialDocumentsPublished
    && state.agreementSigned
    && state.trainingProhibited
    && state.processingBasisApproved
    && state.aiUseApproved
    && state.reconsentEnforced;
  return state;
}

/** The subject a dual-control request is raised against. */
export function activationSubject(providerKey: string, environment: string): string {
  return `${providerKey}:${environment}`;
}

// --- Payload parsing --------------------------------------------------------

const record = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export type ProviderEntry = {
  providerKey: string;
  displayName: string;
  purpose: string;
  status: string;
  enabled: boolean;
  environments: string[];
  featureFlag: string | null;
  killSwitch: string | null;
};

export function parseProviderRegistry(value: unknown): ProviderEntry[] {
  const raw = record(value);
  const list = Array.isArray(raw.providers) ? raw.providers
    : Array.isArray(value) ? value : [];
  return list.flatMap((entry) => {
    const row = record(entry);
    const key = str(row.providerKey);
    if (!key) return [];
    return [{
      providerKey: key,
      displayName: str(row.displayName) ?? key,
      purpose: str(row.purpose) ?? '',
      status: str(row.status) ?? 'unknown',
      enabled: row.enabled === true,
      environments: Array.isArray(row.environments)
        ? row.environments.filter((e): e is string => typeof e === 'string') : [],
      featureFlag: str(row.featureFlag),
      killSwitch: str(row.killSwitch),
    }];
  });
}

export type DualControlRequest = {
  id: string;
  capabilityKey: string;
  actionKey: string;
  subjectRef: string;
  reason: string;
  environment: string;
  requestedAt: string | null;
  requestedByName: string;
  requestedByMe: boolean;
  approvedAt: string | null;
  approvedByName: string | null;
  approvalNote: string | null;
  expiresAt: string | null;
  expired: boolean;
  canApprove: boolean;
};

export function parseDualControlQueue(value: unknown): DualControlRequest[] {
  const list = Array.isArray(record(value).requests) ? record(value).requests as unknown[] : [];
  return list.flatMap((entry) => {
    const row = record(entry);
    const id = str(row.id);
    if (!id) return [];
    return [{
      id,
      capabilityKey: str(row.capabilityKey) ?? '',
      actionKey: str(row.actionKey) ?? '',
      subjectRef: str(row.subjectRef) ?? '',
      reason: str(row.reason) ?? '',
      environment: str(row.environment) ?? '',
      requestedAt: str(row.requestedAt),
      requestedByName: str(row.requestedByName) ?? '',
      requestedByMe: row.requestedByMe === true,
      approvedAt: str(row.approvedAt),
      approvedByName: str(row.approvedByName),
      approvalNote: str(row.approvalNote),
      expiresAt: str(row.expiresAt),
      expired: row.expired === true,
      canApprove: row.canApprove === true,
    }];
  });
}

/** The request covering this activation, if one is open. */
export function activationRequest(
  requests: DualControlRequest[],
  providerKey: string,
  environment: string,
): DualControlRequest | null {
  const subject = activationSubject(providerKey, environment);
  return requests.find((request) =>
    request.actionKey === ACTIVATION_ACTION_KEY
    && request.subjectRef === subject
    && !request.expired) ?? null;
}

// --- The sequence -----------------------------------------------------------

export const ACTIVATION_STEPS = [
  'environment', 'credential', 'prerequisites', 'approvalRequested',
  'approvalGranted', 'activate', 'activated', 'feature', 'health', 'operational',
] as const;
export type ActivationStepKey = (typeof ACTIVATION_STEPS)[number];

/**
 * `done` — already true. `ready` — the operator can do it now.
 * `waiting` — correct, but needs somebody else. `blocked` — an earlier step first.
 */
export type StepState = 'done' | 'ready' | 'waiting' | 'blocked';

export type ActivationInput = {
  environment: string | null;
  credentialConfigured: boolean;
  provider: ProviderEntry | null;
  request: DualControlRequest | null;
  featureEnabled: boolean;
  healthVerified: boolean;
  mayActivate: boolean;
  mayManageFlags: boolean;
  /** A documented provider-specific legal gate, observed but never invented. */
  policyReady?: boolean;
  /**
   * False for a provider the console cannot safely exercise on its own. The
   * health step is then `waiting` — a real state meaning "correct, but needs
   * somebody else" — rather than `ready`, which would offer a button that
   * cannot honestly be pressed from a browser.
   */
  automaticHealthProbe?: boolean;
};

export function activationSteps(input: ActivationInput): Record<ActivationStepKey, StepState> {
  const bound = input.environment === 'development';
  const policyReady = input.policyReady !== false;
  const readyStatus = input.provider
    && ['implemented_awaiting_credential', 'configured_not_enabled'].includes(input.provider.status);
  const activated = input.provider?.status === 'active';
  const environmentApproved = Boolean(
    input.provider && input.environment && input.provider.environments.includes(input.environment));
  const prerequisites = Boolean(readyStatus && environmentApproved
    && input.provider?.featureFlag && input.provider?.killSwitch
    && policyReady) || activated;

  const requested = Boolean(input.request);
  const approved = Boolean(input.request?.approvedAt);

  const state: Record<ActivationStepKey, StepState> = {
    environment: bound ? 'done' : 'blocked',
    credential: !bound ? 'blocked' : input.credentialConfigured ? 'done' : 'blocked',
    prerequisites: !input.credentialConfigured ? 'blocked' : prerequisites ? 'done' : 'blocked',
    approvalRequested: 'blocked',
    approvalGranted: 'blocked',
    activate: 'blocked',
    activated: activated ? 'done' : 'blocked',
    feature: 'blocked',
    health: 'blocked',
    operational: 'blocked',
  };

  if (state.prerequisites === 'done' && !activated) {
    state.approvalRequested = requested ? 'done'
      : input.mayActivate ? 'ready' : 'waiting';
    // The second identity is the whole point: this step is never `ready` for
    // the person who raised the request, however many capabilities they hold.
    state.approvalGranted = approved ? 'done' : requested ? 'waiting' : 'blocked';
    state.activate = approved && input.mayActivate ? 'ready' : 'blocked';
  } else if (activated) {
    state.approvalRequested = 'done';
    state.approvalGranted = 'done';
    state.activate = 'done';
  }

  if (activated) {
    state.feature = !policyReady ? 'blocked'
      : input.featureEnabled ? 'done'
        : input.mayManageFlags ? 'ready' : 'waiting';
    if (input.featureEnabled && policyReady) {
      const automatic = input.automaticHealthProbe !== false;
      state.health = input.healthVerified ? 'done' : automatic ? 'ready' : 'waiting';
      state.operational = input.healthVerified ? 'done' : 'blocked';
    }
  }

  return state;
}

/** The step an operator should look at next, or null when finished. */
export function currentStep(states: Record<ActivationStepKey, StepState>): ActivationStepKey | null {
  return ACTIVATION_STEPS.find((key) => states[key] !== 'done') ?? null;
}

/**
 * Whether a governed action may be pressed, and if not, why.
 *
 * A button that is disabled for a reason nobody states is indistinguishable
 * from a broken one. The Providers page shipped exactly that: every action was
 * gated on a single `busy` flag that a failed background refresh could strand,
 * so the step list kept saying "You can do this now" while the button silently
 * refused. Clicking produced no request, no error and no dialog, because the
 * click never reached a handler at all.
 *
 * That was fixed by naming the transient refusals. It was not enough: the two
 * *structural* refusals were still folded together into one `not-ready` the
 * surface deliberately said nothing about, so a step blocked behind an earlier
 * one and a step the operator has no permission for both rendered as a plain
 * disabled button with no sentence beside it — the same dead control, refused
 * for a different reason. Every refusal now carries a reason, and the surface
 * renders all of them.
 */
export type ActionAvailability =
  | { enabled: true }
  | {
      enabled: false;
      reason: 'done' | 'blocked' | 'waiting' | 'refreshing' | 'another-action';
    };

export function actionAvailability(
  step: StepState,
  busy: string | null,
  refreshing: boolean,
): ActionAvailability {
  // Structural refusals, told apart because they are different sentences: this
  // is finished, an earlier step is not, or somebody with another permission
  // has to do it.
  if (step === 'done') return { enabled: false, reason: 'done' };
  if (step === 'blocked') return { enabled: false, reason: 'blocked' };
  if (step === 'waiting') return { enabled: false, reason: 'waiting' };
  // A refresh in flight is transient and worth naming; an action in flight is
  // the operator's own doing and is named differently.
  if (refreshing) return { enabled: false, reason: 'refreshing' };
  if (busy !== null) return { enabled: false, reason: 'another-action' };
  return { enabled: true };
}

/**
 * Whether a feature flag is on, read from `get_staff_feature_flags`.
 *
 * The RPC emits `flagKey`, the same camelCase every other staff payload in the
 * console uses. The Providers page matched on `flag_key`, so the row was never
 * found and the flag was reported off however many times it had been switched
 * on. That is what made "Turn on address search" look dead: the RPC ran, the
 * hosted state changed, the audit row was written — and then the page re-read
 * the state, failed to recognise its own flag, and redrew every fact exactly as
 * it had been. A working action and a broken button are indistinguishable when
 * the page cannot see the result.
 *
 * Both spellings are accepted so a drifting payload degrades to reading the
 * flag rather than to silently reporting it off. The shape is asserted against
 * the migration in the tests rather than trusted.
 */
export function featureFlagEnabled(
  payload: unknown,
  flagKey: string,
  environment: string | null,
): boolean {
  if (!environment) return false;
  const list = Array.isArray(payload) ? payload
    : Array.isArray(record(payload).flags) ? record(payload).flags as unknown[] : [];
  return list.some((entry) => {
    const row = record(entry);
    return (str(row.flagKey) ?? str(row.flag_key)) === flagKey
      && str(row.environment) === environment
      && row.enabled === true;
  });
}

/** Whether the staff-only provider rollup has ever observed a successful call. */
export function providerHealthVerified(payload: unknown, providerKey: string): boolean {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(record(payload).providers) ? record(payload).providers as unknown[] : [];
  return list.some((entry) => {
    const row = record(entry);
    return str(row.providerKey) === providerKey
      && typeof row.lastSuccessAt === 'string'
      && row.lastSuccessAt.length > 0;
  });
}
