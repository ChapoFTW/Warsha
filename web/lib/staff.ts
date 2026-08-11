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
