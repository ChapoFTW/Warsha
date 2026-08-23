/**
 * External provider activation, as an operator sees it.
 *
 * Every rule here already lives in the database. `staff_activate_external_provider`
 * refuses an environment mismatch, an unbound project, a provider that is not
 * ready, a missing feature flag, a flag that is *already* enabled, a missing
 * kill switch, and any attempt without a consumed dual-control approval. This
 * module does not re-implement those refusals and cannot relax them; it decides
 * what to *show*, so an operator is not invited to press something the server
 * will reject, and can see which step they are actually on.
 *
 * The sequence is the backend's, not a convenience ordering. The feature flag
 * comes after activation because the activation RPC refuses while the flag is
 * enabled — turning the feature on first does not shortcut the process, it
 * blocks it.
 */

export const MAPS_PROVIDER_KEY = 'google_maps_platform';
export const MAPS_FEATURE_FLAG = 'location_provider';
export const ACTIVATION_ACTION_KEY = 'activate_external_provider';
export const ACTIVATION_CAPABILITY = 'manage_subprocessors';

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
};

export function activationSteps(input: ActivationInput): Record<ActivationStepKey, StepState> {
  const bound = input.environment === 'development';
  const readyStatus = input.provider
    && ['implemented_awaiting_credential', 'configured_not_enabled'].includes(input.provider.status);
  const activated = input.provider?.status === 'active';
  const environmentApproved = Boolean(
    input.provider && input.environment && input.provider.environments.includes(input.environment));
  const prerequisites = Boolean(readyStatus && environmentApproved
    && input.provider?.featureFlag && input.provider?.killSwitch) || activated;

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
    state.feature = input.featureEnabled ? 'done'
      : input.mayManageFlags ? 'ready' : 'waiting';
    if (input.featureEnabled) {
      state.health = input.healthVerified ? 'done' : 'ready';
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
 * The reason travels with the answer so the surface can always say something.
 */
export type ActionAvailability =
  | { enabled: true }
  | { enabled: false; reason: 'not-ready' | 'refreshing' | 'another-action' };

export function actionAvailability(
  step: StepState,
  busy: string | null,
  refreshing: boolean,
): ActionAvailability {
  if (step !== 'ready') return { enabled: false, reason: 'not-ready' };
  // A refresh in flight is transient and worth naming; an action in flight is
  // the operator's own doing and is named differently.
  if (refreshing) return { enabled: false, reason: 'refreshing' };
  if (busy !== null) return { enabled: false, reason: 'another-action' };
  return { enabled: true };
}
