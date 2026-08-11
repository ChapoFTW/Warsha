/**
 * The shapes the staff RPCs actually return.
 *
 * Every field here was read from the `jsonb_build_object(...)` that builds it
 * in `supabase/migrations/`, not guessed from a sample response. That is the
 * authoritative source: the function decides the shape, and a sample only
 * shows the fields that happened to be non-null that day.
 *
 * Two of these deserve a note, because they explain why the console cannot
 * show what an operator might expect:
 *
 * **`staff_safe_search` is not a user directory.** It searches twelve entity
 * kinds — bookings, disputes, accounts, workers and so on — and returns only
 * `kind`, `id`, `status` and `createdAt` for each. No name, no email, no
 * phone. That redaction is the privacy design, not an omission, and the
 * search itself is logged through `private.staff_log_access`.
 *
 * **The vetting queue is pseudonymous.** `subjectRef` is an encoded reference,
 * not a user id, so a reviewer working the queue does not see who they are
 * looking at until they open a case through the detail RPC that checks its own
 * capability.
 */

export type SafeSearchKind =
  | 'booking' | 'marketplace_request' | 'dispute' | 'review' | 'trust_report'
  | 'payment' | 'withdrawal' | 'reconciliation_exception' | 'support_case'
  | 'incident' | 'account' | 'worker';

export type SafeSearchResult = {
  kind: SafeSearchKind;
  id: string;
  status: string;
  createdAt: string;
};

export type SafeSearchPayload = { results: SafeSearchResult[]; count: number };

export function parseSafeSearch(value: unknown): SafeSearchPayload {
  const raw = (value ?? {}) as { results?: unknown; count?: unknown };
  const results = Array.isArray(raw.results) ? raw.results : [];
  return {
    results: results.filter((row): row is SafeSearchResult =>
      Boolean(row) && typeof (row as SafeSearchResult).kind === 'string'),
    count: typeof raw.count === 'number' ? raw.count : results.length,
  };
}

export type VettingCase = {
  subjectRef: string;
  workerState: string;
  waitingSince: string | null;
  hasCertificate: boolean;
  priority: string;
};

export type VettingPayload = { cases: VettingCase[]; count: number };

export function parseVettingQueue(value: unknown): VettingPayload {
  const raw = (value ?? {}) as { cases?: unknown; count?: unknown };
  const cases = Array.isArray(raw.cases) ? raw.cases : [];
  return {
    cases: cases.filter((row): row is VettingCase =>
      Boolean(row) && typeof (row as VettingCase).subjectRef === 'string'),
    count: typeof raw.count === 'number' ? raw.count : cases.length,
  };
}

export type StaffCapability = {
  capabilityKey: string;
  domain: string;
  description: string;
  highRisk: boolean;
  dualControl: boolean;
  requiresReauth: boolean;
};

export type StaffRole = {
  roleKey: string;
  displayName: string;
  description: string;
  riskTier: string;
  capabilities: string[];
};

export type StaffGrant = {
  id: string;
  userId: string;
  displayName: string | null;
  roleKey: string;
  grantedAt: string;
  expiresAt: string | null;
};

export type RoleDirectory = {
  roles: StaffRole[];
  capabilities: StaffCapability[];
  grants: StaffGrant[];
};

export function parseRoleDirectory(value: unknown): RoleDirectory {
  const raw = (value ?? {}) as Record<string, unknown>;
  const list = <T>(key: string): T[] => (Array.isArray(raw[key]) ? raw[key] as T[] : []);
  return {
    roles: list<StaffRole>('roles'),
    capabilities: list<StaffCapability>('capabilities'),
    grants: list<StaffGrant>('grants'),
  };
}

/**
 * Audit entries.
 *
 * Nine append-only sources share five common fields — id, at, actorId, action,
 * entityType, entityId — and then each adds its own. `staff_audit` carries
 * `capabilityKey`, `breakGlass` and `reason`; `payment_audit` carries
 * `actorKind`; `operational_events` carries `fromStatus`/`toStatus`. They are
 * optional here because they genuinely are, and a table that assumed one shape
 * would silently drop the field that mattered.
 *
 * There is no `outcome` column in any source, and adding one would be a lie:
 * these tables record actions that happened. A row is the outcome. What varies
 * is the *detail* each source kept, which is what the console shows instead.
 */
export type AuditEntry = {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  capabilityKey?: string | null;
  breakGlass?: boolean | null;
  reason?: string | null;
  actorKind?: string | null;
  actorRole?: string | null;
  roleKey?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
};

export type AuditPayload = {
  source: string;
  from: string | null;
  to: string | null;
  rows: AuditEntry[];
};

export function parseAuditPayload(value: unknown): AuditPayload {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    source: typeof raw.source === 'string' ? raw.source : '',
    from: typeof raw.from === 'string' ? raw.from : null,
    to: typeof raw.to === 'string' ? raw.to : null,
    rows: Array.isArray(raw.rows) ? raw.rows as AuditEntry[] : [],
  };
}

/**
 * The nine sources `staff_audit_search` accepts, copied from the `not in (...)`
 * guard that rejects everything else with SQLSTATE 22023. A source this list
 * invented would reach the database and be refused.
 */
export const AUDIT_SOURCES = [
  'audit_logs', 'staff_audit', 'trust_moderation', 'payment_audit',
  'dispute_events', 'configuration_history', 'staff_role_history',
  'support_events', 'operational_events',
] as const;

export type AuditSource = typeof AUDIT_SOURCES[number];

/** The per-source detail worth surfacing, in the order it reads best. */
export function auditDetail(entry: AuditEntry): string {
  const parts: string[] = [];
  if (entry.breakGlass) parts.push('break-glass');
  if (entry.capabilityKey) parts.push(entry.capabilityKey);
  if (entry.roleKey) parts.push(entry.roleKey);
  if (entry.actorKind) parts.push(entry.actorKind);
  if (entry.actorRole) parts.push(entry.actorRole);
  if (entry.fromStatus || entry.toStatus) {
    parts.push(`${entry.fromStatus ?? '—'} → ${entry.toStatus ?? '—'}`);
  }
  if (entry.reason) parts.push(entry.reason);
  return parts.join(' · ');
}

/** The audit range the database refuses to exceed. */
export const AUDIT_MAX_RANGE_DAYS = 366;
export const AUDIT_MAX_LIMIT = 200;
