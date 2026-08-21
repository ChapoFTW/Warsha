/**
 * The staff session contract, as the server returns it.
 *
 * Mirrors `public.get_staff_session()` exactly. Every field here is computed
 * server-side from `private.staff_active_role_keys` and the platform
 * configuration; nothing in the browser may add to it.
 *
 * **This is a description, not an authority.** Hiding a button because a
 * capability is absent is a courtesy to the person using the console — it
 * stops them attempting something that will be refused. The refusal itself
 * happens in the RPC, every time, whether or not the button was hidden.
 */
export type StaffSession = {
  isStaff: boolean;
  staffId?: string;
  roles: string[];
  capabilities: string[];
  environment?: string;
  displayTimezone?: string;
  mfaRequired?: boolean;
  mfaProvider?: string | null;
  launchPhase?: string;
  reauthWindowSeconds?: number;
  reauthValid: boolean;
  platformReady: boolean;
  breakGlassOnly?: boolean;
  /** The assurance level the identity provider granted: `aal1`, `aal2`, `none`. */
  assuranceLevel?: string;
  mfaSatisfied?: boolean;
  /**
   * Seconds since the most recent entry in the token's `amr` array.
   *
   * This is the number the whole re-authentication design turns on. It comes
   * from the signed token, not from anything the browser says, and a token
   * *refresh* does not reset it — only a real authentication event does.
   */
  sessionFreshnessSeconds?: number | null;
  sessionRevoked?: boolean;
  dualControlEnabled?: boolean;
};

export const NO_STAFF_SESSION: StaffSession = {
  isStaff: false,
  roles: [],
  capabilities: [],
  reauthValid: false,
  platformReady: false,
};

export function parseStaffSession(value: unknown): StaffSession {
  if (!value || typeof value !== 'object') return NO_STAFF_SESSION;
  const raw = value as Record<string, unknown>;
  return {
    isStaff: raw.isStaff === true,
    staffId: typeof raw.staffId === 'string' ? raw.staffId : undefined,
    roles: Array.isArray(raw.roles) ? raw.roles.filter((r): r is string => typeof r === 'string') : [],
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
    environment: typeof raw.environment === 'string' ? raw.environment : undefined,
    displayTimezone: typeof raw.displayTimezone === 'string' ? raw.displayTimezone : undefined,
    mfaRequired: raw.mfaRequired === true,
    mfaProvider: typeof raw.mfaProvider === 'string' ? raw.mfaProvider : null,
    reauthWindowSeconds: typeof raw.reauthWindowSeconds === 'number'
      ? raw.reauthWindowSeconds
      : undefined,
    launchPhase: typeof raw.launchPhase === 'string' ? raw.launchPhase : undefined,
    reauthValid: raw.reauthValid === true,
    platformReady: raw.platformReady === true,
    breakGlassOnly: raw.breakGlassOnly === true,
    assuranceLevel: typeof raw.assuranceLevel === 'string' ? raw.assuranceLevel : undefined,
    mfaSatisfied: raw.mfaSatisfied === true,
    sessionFreshnessSeconds: typeof raw.sessionFreshnessSeconds === 'number'
      ? raw.sessionFreshnessSeconds
      : null,
    sessionRevoked: raw.sessionRevoked === true,
    dualControlEnabled: raw.dualControlEnabled === true,
  };
}

export function hasCapability(session: StaffSession, capability: string): boolean {
  return session.isStaff && session.capabilities.includes(capability);
}

/**
 * Whether the console may be used at all.
 *
 * Staff status is necessary and not sufficient: a platform that is not ready
 * has no environment binding, and an unbound console cannot honestly tell
 * somebody whether they are looking at development or production data.
 */
export function canUseConsole(session: StaffSession): boolean {
  return session.isStaff && session.platformReady;
}

/** Environments that must be labelled loudly so QA data is never mistaken for real. */
export function environmentLabel(session: StaffSession): string | null {
  if (!session.environment) return null;
  return session.environment.toUpperCase();
}

/** The environments a bound platform may legitimately report. */
const BOUND_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

/**
 * Whether the console is being served from a developer's own machine.
 *
 * This is the only context in which the `local` bootstrap row is the truth
 * rather than a symptom.
 */
export function isLocalOrigin(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || host.endsWith('.localhost');
}

/**
 * What the console may honestly claim about the data it is showing.
 *
 * A hosted project is born carrying the `local` bootstrap row, because the same
 * migrations replay in Docker. `staff_bind_platform_environment` is what turns
 * that row into a real binding. Until it is called, the backend truthfully
 * reports `local` — so a hosted console showing a quiet LOCAL badge is
 * indistinguishable from a laptop, which is precisely the confusion the badge
 * exists to prevent.
 *
 * This therefore fails closed rather than decorating: an unbound or
 * unrecognised environment on a hosted origin is a configuration fault and is
 * reported as one. `production` is only ever concluded from the exact string;
 * it is never inferred from an absent or unreadable value.
 */
export type EnvironmentBinding =
  | { state: 'production' }
  | { state: 'labelled'; label: string }
  | { state: 'misconfigured'; reason: 'unbound' | 'unknown'; reported: string | null };

export function environmentBinding(
  session: StaffSession,
  hostname: string,
): EnvironmentBinding {
  const reported = session.environment ?? null;
  if (reported === 'production') return { state: 'production' };
  if (reported && (BOUND_ENVIRONMENTS as readonly string[]).includes(reported)) {
    return { state: 'labelled', label: reported.toUpperCase() };
  }
  if (reported === 'local') {
    return isLocalOrigin(hostname)
      ? { state: 'labelled', label: 'LOCAL' }
      : { state: 'misconfigured', reason: 'unbound', reported };
  }
  return { state: 'misconfigured', reason: reported ? 'unknown' : 'unbound', reported };
}
