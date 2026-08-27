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
 *
 * How many people the sequence needs is also the backend's. `required_approval
 * _count` answers it there and `requiredApprovalCount` mirrors it here, so a
 * pre-production backend draws a sequence one administrator can finish and a
 * public one draws the sequence that waits for a second identity. Neither
 * number is chosen by this module.
 */

export const MAPS_PROVIDER_KEY = 'google_maps_platform';
export const MAPS_FEATURE_FLAG = 'location_provider';
export const VISION_PROVIDER_KEY = 'google_cloud_vision';
export const VISION_FEATURE_FLAG = 'identity_extraction';
export const ACTIVATION_ACTION_KEY = 'activate_external_provider';
export const ACTIVATION_CAPABILITY = 'manage_subprocessors';

/**
 * How many distinct staff identities a governed action needs here.
 *
 * This mirrors `private.required_approval_count` and must keep mirroring it.
 * The database is the authority — every RPC re-derives the count and refuses on
 * its own terms — so the worst a drifting copy can do is draw the wrong number
 * of steps. It is duplicated rather than fetched-and-only-fetched because the
 * page has to lay out a sequence before any RPC has answered, and a sequence
 * that rearranges itself after the first response reads as a bug.
 *
 * `null` is unknown, and unknown resolves to the stricter policy. A console
 * that has not yet learned which backend it is on must not offer the shorter
 * path on the assumption that it is the safe one.
 */
export function requiredApprovalCount(environment: string | null): number {
  return environment === 'development' ? 1 : 2;
}

export type GovernanceMode = 'single_admin' | 'dual_control';

export function governanceMode(environment: string | null): GovernanceMode {
  return requiredApprovalCount(environment) >= 2 ? 'dual_control' : 'single_admin';
}

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
  /**
   * Whether this environment serves people who read the published corpus.
   *
   * The two document gates above — a material version published, and renewed
   * acceptance enforced — are commitments Warsha makes to the workers using the
   * service. A pre-production backend has no such readers, and publishing a
   * material version saying identity documents are now read by a provider,
   * while the service those workers actually use does not read them, would be a
   * false statement about their personal data rather than a stricter one. So
   * those two gates apply where the corpus is addressed and not where it is
   * not. Every other commitment — the supplier contract, the no-training rule,
   * the approved lawful basis, the assistive-only AI declaration — is about
   * what may be done with a document at all, and applies everywhere.
   */
  publicCommitmentsRequired: boolean;
  ready: boolean;
};

/**
 * Whether the published-corpus commitments apply to this backend.
 *
 * Deliberately the same split as `requiredApprovalCount`, and deliberately
 * strict when the environment is unknown.
 */
export function publicCommitmentsRequired(environment: string | null): boolean {
  return !(environment === 'development' || environment === 'local');
}

/** Read the counts and states returned by `staff_legal_governance_overview`. */
export function providerPolicyState(
  providerKey: string,
  payload: unknown,
  environment: string | null = null,
): ProviderPolicyState {
  const publicCommitments = publicCommitmentsRequired(environment);
  if (providerKey !== VISION_PROVIDER_KEY) {
    return {
      materialDocumentsPublished: true,
      agreementSigned: true,
      trainingProhibited: true,
      processingBasisApproved: true,
      aiUseApproved: true,
      reconsentEnforced: true,
      publicCommitmentsRequired: publicCommitments,
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
    // A supplier's data-processing terms are not always a document somebody
    // signs; a cloud supplier's are commonly incorporated into the service
    // terms accepted when the account was opened. `incorporated` is that case
    // recorded honestly, and the register refuses either value without a
    // reference naming what evidences it — so accepting it here is reading a
    // contract that was recorded, not assuming one exists.
    agreementSigned: ['signed', 'incorporated'].includes(str(vision?.agreementStatus) ?? ''),
    trainingProhibited: vision?.trainingProhibited === true,
    processingBasisApproved: str(workerVerification?.reviewStatus) === 'approved',
    aiUseApproved: ['approved_not_integrated', 'in_use']
      .includes(str(identityExtraction?.status) ?? '')
      && identityExtraction?.coversIdentityData === true
      && identityExtraction?.permittedForTraining === false,
    reconsentEnforced: record(overview.configuration).reconsentEnforced === true,
    publicCommitmentsRequired: publicCommitments,
    ready: false,
  };
  state.ready = state.agreementSigned
    && state.trainingProhibited
    && state.processingBasisApproved
    && state.aiUseApproved
    && (!publicCommitments
      || (state.materialDocumentsPublished && state.reconsentEnforced));
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
  governanceMode: GovernanceMode;
  requiredApprovals: number;
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
      // An older row predates the policy stamp. It reads as dual control,
      // which is what every row written before the stamp existed actually was.
      governanceMode: str(row.governanceMode) === 'single_admin'
        ? 'single_admin' : 'dual_control',
      requiredApprovals: typeof row.requiredApprovals === 'number'
        ? row.requiredApprovals : 2,
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

/** The two steps that exist only because a second person has to be found. */
const SECOND_PERSON_STEPS: readonly ActivationStepKey[] = [
  'approvalRequested', 'approvalGranted',
];

/**
 * The steps this environment actually has.
 *
 * Where one administrator is the whole control, "request approval from a second
 * colleague" and "a second colleague approves" are not steps that are skipped —
 * they are steps that do not exist. Rendering them greyed out would describe a
 * person who is not coming and make the operator wait for them, which is the
 * exact failure the single-admin policy was introduced to remove.
 */
export function activationStepsFor(
  requiredApprovals: number,
): readonly ActivationStepKey[] {
  return requiredApprovals >= 2
    ? ACTIVATION_STEPS
    : ACTIVATION_STEPS.filter((key) => !SECOND_PERSON_STEPS.includes(key));
}

/**
 * The policy the backend says it is applying.
 *
 * `staff_dual_control_queue` and `staff_governance_policy` both report it, so
 * the console can render the real answer rather than its own mirror of the
 * rule. The mirror stays as the fallback for the first paint and for a read
 * that failed, and it is the strict answer when the environment is unknown.
 */
export function parseGovernancePolicy(
  payload: unknown,
  environment: string | null,
): { requiredApprovals: number; governanceMode: GovernanceMode } {
  const raw = record(payload);
  const reported = raw.requiredApprovals;
  const requiredApprovals = reported === 1 || reported === 2
    ? reported : requiredApprovalCount(environment);
  return {
    requiredApprovals,
    governanceMode: requiredApprovals >= 2 ? 'dual_control' : 'single_admin',
  };
}

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
  /**
   * How many distinct staff identities this backend requires, as the backend
   * itself reported it. Omitted before any RPC has answered, and then the
   * environment mirror stands in.
   */
  requiredApprovals?: number;
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

  const required = input.requiredApprovals ?? requiredApprovalCount(input.environment);
  const requested = Boolean(input.request);
  // Under single-admin policy the authorisation is created and spent inside the
  // activation RPC, so "approved" is a property of the policy rather than of a
  // second signature that will never arrive.
  const approved = required <= 1 ? true : Boolean(input.request?.approvedAt);

  const state: Record<ActivationStepKey, StepState> = {
    environment: bound ? 'done' : 'blocked',
    credential: !bound ? 'blocked' : input.credentialConfigured ? 'done' : 'blocked',
    // Gated on the environment as well as the credential. Reading only the
    // credential let an unbound backend report its prerequisites complete,
    // because a provider approved for local really is approved for local — the
    // step was answering a question nobody had asked yet.
    prerequisites: !bound || !input.credentialConfigured ? 'blocked'
      : prerequisites ? 'done' : 'blocked',
    approvalRequested: 'blocked',
    approvalGranted: 'blocked',
    activate: 'blocked',
    activated: activated ? 'done' : 'blocked',
    feature: 'blocked',
    health: 'blocked',
    operational: 'blocked',
  };

  if (state.prerequisites === 'done' && !activated) {
    state.approvalRequested = required <= 1 ? 'done'
      : requested ? 'done'
        : input.mayActivate ? 'ready' : 'waiting';
    // Where two identities are required, the second one is the whole point:
    // this step is never `ready` for the person who raised the request, however
    // many capabilities they hold.
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
