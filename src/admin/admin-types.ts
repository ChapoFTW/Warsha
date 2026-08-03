/**
 * WPS-017 Operations, Analytics & Admin Platform contracts.
 *
 * WPS-017 is the single authority for staff identity, staff capabilities,
 * operational assignment, configuration change control, feature flags, kill
 * switches, support cases, incidents, the audit explorer, safe analytics, and
 * approved exports. Every domain (verification, disputes, trust, reviews,
 * finance, marketplace, notifications) keeps its own authority; the admin
 * platform gates access to it and records what staff did.
 *
 * Every value here is server-projected. The client never decides authorization:
 * it renders what the server already allowed. A capability list held here is a
 * navigation hint only — the same check is re-run inside every RPC.
 */

export type StaffRoleKey =
  | 'support_agent'
  | 'verification_reviewer'
  | 'trust_safety_reviewer'
  | 'dispute_reviewer'
  | 'financial_operations'
  | 'marketplace_operations'
  | 'operations_manager'
  | 'security_administrator'
  | 'super_administrator';

export const staffRoleKeys: readonly StaffRoleKey[] = [
  'support_agent', 'verification_reviewer', 'trust_safety_reviewer', 'dispute_reviewer',
  'financial_operations', 'marketplace_operations', 'operations_manager',
  'security_administrator', 'super_administrator',
] as const;

export type StaffCapability =
  | 'view_operations_home'
  | 'safe_search'
  | 'view_safe_customer_profile'
  | 'view_safe_worker_profile'
  | 'view_contact_details'
  | 'review_identity_verification'
  | 'review_certificates'
  | 'review_disputes'
  | 'review_abuse_reports'
  | 'issue_temporary_restriction'
  | 'approve_permanent_ban'
  | 'review_appeals'
  | 'moderate_reviews'
  | 'inspect_payment_state'
  | 'view_financial_ledger'
  | 'initiate_refund'
  | 'review_withdrawal'
  | 'review_reconciliation_exception'
  | 'manage_marketplace_configuration'
  | 'manage_notification_configuration'
  | 'approve_configuration'
  | 'manage_feature_flags'
  | 'manage_kill_switches'
  | 'assign_cases'
  | 'manage_support_cases'
  | 'manage_incidents'
  | 'view_audit_logs'
  | 'view_analytics'
  | 'export_operational_report'
  | 'manage_staff_roles'
  | 'legacy_domain_staff_actions';

export const staffCapabilities: readonly StaffCapability[] = [
  'view_operations_home', 'safe_search', 'view_safe_customer_profile', 'view_safe_worker_profile',
  'view_contact_details', 'review_identity_verification', 'review_certificates', 'review_disputes',
  'review_abuse_reports', 'issue_temporary_restriction', 'approve_permanent_ban', 'review_appeals',
  'moderate_reviews', 'inspect_payment_state', 'view_financial_ledger', 'initiate_refund',
  'review_withdrawal', 'review_reconciliation_exception', 'manage_marketplace_configuration',
  'manage_notification_configuration', 'approve_configuration', 'manage_feature_flags',
  'manage_kill_switches', 'assign_cases', 'manage_support_cases', 'manage_incidents',
  'view_audit_logs', 'view_analytics', 'export_operational_report', 'manage_staff_roles',
  'legacy_domain_staff_actions',
] as const;

/**
 * Capabilities the server marks high risk. The client uses this only to warn
 * and to require an explicit confirmation; the server enforces it regardless.
 */
export const highRiskCapabilities: readonly StaffCapability[] = [
  'view_contact_details', 'issue_temporary_restriction', 'approve_permanent_ban', 'review_appeals',
  'view_financial_ledger', 'initiate_refund', 'review_withdrawal', 'review_reconciliation_exception',
  'manage_marketplace_configuration', 'manage_notification_configuration', 'approve_configuration',
  'manage_feature_flags', 'manage_kill_switches', 'view_audit_logs', 'export_operational_report',
  'manage_staff_roles', 'legacy_domain_staff_actions',
] as const;

/** Capabilities the server requires a fresh re-authentication for. */
export const reauthCapabilities: readonly StaffCapability[] = [
  'view_contact_details', 'approve_permanent_ban', 'initiate_refund', 'approve_configuration',
  'manage_feature_flags', 'manage_kill_switches', 'export_operational_report', 'manage_staff_roles',
] as const;

/** Capabilities that require two different people to complete the action. */
export const dualControlCapabilities: readonly StaffCapability[] = [
  'approve_permanent_ban', 'initiate_refund', 'approve_configuration', 'manage_staff_roles',
] as const;

export type StaffEnvironment = 'local' | 'staging' | 'production';

export type StaffSession = {
  isStaff: boolean;
  staffId?: string;
  roles: StaffRoleKey[];
  capabilities: StaffCapability[];
  environment?: StaffEnvironment;
  displayTimezone?: string;
  mfaRequired?: boolean;
  mfaProvider?: string;
  legacyBridgeEnabled?: boolean;
  reauthWindowSeconds?: number;
  reauthValid: boolean;
  platformReady: boolean;
  breakGlassOnly?: boolean;
  /**
   * WPS-018 additions. Freshness and assurance are read from the signed access
   * token by the server; the client only renders what it is told. `reauthValid`
   * is no longer a client attestation.
   */
  launchPhase?: 'pre_beta' | 'private_beta' | 'public_beta' | 'production';
  assuranceLevel?: string;
  mfaSatisfied?: boolean;
  sessionFreshnessSeconds?: number | null;
  sessionRevoked?: boolean;
  legacyRpcGraceEnabled?: boolean;
  dualControlEnabled?: boolean;
};

export const anonymousStaffSession: StaffSession = {
  isStaff: false,
  roles: [],
  capabilities: [],
  reauthValid: false,
  platformReady: false,
};

export type StaffQueueKey =
  | 'identity_verification'
  | 'certificate_review'
  | 'open_disputes'
  | 'dispute_evidence_deadlines'
  | 'abuse_reports'
  | 'trust_investigations'
  | 'appeals'
  | 'review_moderation'
  | 'failed_refunds'
  | 'failed_payouts'
  | 'withdrawal_reviews'
  | 'reconciliation_exceptions'
  | 'chargebacks'
  | 'post_release_cases'
  | 'marketplace_incidents'
  | 'notification_failures'
  | 'support_cases'
  | 'security_events';

export const staffQueueKeys: readonly StaffQueueKey[] = [
  'identity_verification', 'certificate_review', 'open_disputes', 'dispute_evidence_deadlines',
  'abuse_reports', 'trust_investigations', 'appeals', 'review_moderation', 'failed_refunds',
  'failed_payouts', 'withdrawal_reviews', 'reconciliation_exceptions', 'chargebacks',
  'post_release_cases', 'marketplace_incidents', 'notification_failures', 'support_cases',
  'security_events',
] as const;

export type CasePriority = 'urgent' | 'high' | 'normal' | 'low';

export const casePriorities: readonly CasePriority[] = ['urgent', 'high', 'normal', 'low'] as const;

export type CaseStatus =
  | 'unassigned'
  | 'assigned'
  | 'in_progress'
  | 'waiting_participant'
  | 'waiting_provider'
  | 'escalated'
  | 'resolved'
  | 'closed';

export const caseStatuses: readonly CaseStatus[] = [
  'unassigned', 'assigned', 'in_progress', 'waiting_participant', 'waiting_provider',
  'escalated', 'resolved', 'closed',
] as const;

export type StaffQueueSummary = {
  queueKey: StaffQueueKey;
  domain: string;
  displayName: string;
  defaultPriority: CasePriority;
  targetResponseHours: number | null;
  openAssignments: number;
  assignedToMe: number;
  overdue: number;
  backlog: number;
};

export type StaffHome = {
  queues: StaffQueueSummary[];
  myOpenCases: number;
  myOverdueCases: number;
  activeIncidents: number;
  generatedAt: string;
};

export type StaffQueueItem = {
  assignmentId: string;
  subjectType: string;
  subjectId: string;
  status: CaseStatus;
  priority: CasePriority;
  reasonCode: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  lockVersion: number;
  ageSeconds: number;
  overdue: boolean;
};

export type StaffQueueBacklogItem = {
  subjectId: string;
  subjectType: string;
  createdAt: string;
  reasonCode: string | null;
  priority: CasePriority;
  dueAt?: string | null;
};

export type StaffQueueView = {
  queueKey: StaffQueueKey;
  displayName: string;
  subjectType: string;
  targetResponseHours: number | null;
  items: StaffQueueItem[];
  backlog: StaffQueueBacklogItem[];
  generatedAt: string;
};

export type StaffCaseEvent = {
  id: string;
  action: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  actorId: string | null;
  assigneeId: string | null;
  note: string | null;
  createdAt: string;
};

export type StaffCaseNote = {
  id: string;
  authorId: string;
  note: string;
  createdAt: string;
};

export type StaffCase = {
  assignmentId: string;
  queueKey: StaffQueueKey;
  subjectType: string;
  subjectId: string;
  status: CaseStatus;
  priority: CasePriority;
  reasonCode: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lockVersion: number;
  createdAt: string;
  events: StaffCaseEvent[];
  privateNotes: StaffCaseNote[];
};

export type SafeSearchKind =
  | 'booking' | 'marketplace_request' | 'dispute' | 'review' | 'trust_report' | 'payment'
  | 'withdrawal' | 'reconciliation_exception' | 'support_case' | 'incident' | 'account' | 'worker';

export type SafeSearchResult = {
  kind: SafeSearchKind;
  id: string;
  status: string;
  createdAt: string;
};

export type StaffDashboard =
  | 'executive' | 'marketplace' | 'bookings' | 'workers' | 'customers'
  | 'financial' | 'trust' | 'verification' | 'notifications';

export const staffDashboards: readonly StaffDashboard[] = [
  'executive', 'marketplace', 'bookings', 'workers', 'customers',
  'financial', 'trust', 'verification', 'notifications',
] as const;

export type StaffAnalytics = {
  dashboard: StaffDashboard;
  from: string;
  to: string;
  timezone: string;
  timeBasis: string;
  minimumCell: number;
  partial: boolean;
  generatedAt: string;
  metrics: Record<string, unknown>;
};

export type ConfigurationDomainKey =
  | 'marketplace_mode' | 'marketplace_ranking' | 'marketplace_waves' | 'notification_policy'
  | 'reminder_policy' | 'payment_mode' | 'payout_mode' | 'release_scheduler' | 'call_relay'
  | 'trust_policy' | 'review_policy' | 'dispute_policy' | 'upload_limits' | 'maintenance'
  | 'admin_platform';

export type ConfigurationStatus = 'draft' | 'pending_approval' | 'active' | 'superseded' | 'rejected';

export type ConfigurationDomain = {
  domainKey: ConfigurationDomainKey;
  displayName: string;
  authoritativeOwner: string;
  appliedBy: 'wps017' | 'domain_runbook';
  requiresApproval: boolean;
  allowedKeys: string[];
  capabilityKey: StaffCapability;
};

export type ConfigurationVersion = {
  id: string;
  domainKey: ConfigurationDomainKey;
  environment: StaffEnvironment;
  version: number;
  status: ConfigurationStatus;
  payload: Record<string, unknown>;
  changeReason: string;
  createdBy: string;
  approvedBy: string | null;
  activatedAt: string | null;
  rolledBackFrom: number | null;
  createdAt: string;
};

export type FeatureFlagAudience = 'none' | 'staff' | 'customer' | 'worker' | 'all';

export type FeatureFlag = {
  flagKey: string;
  environment: StaffEnvironment;
  enabled: boolean;
  audience: FeatureFlagAudience;
  rolloutPercentage: number;
  reason: string;
  reviewBy: string | null;
  ownerId: string | null;
  isKillSwitch: boolean;
  updatedAt: string;
};

export type KillSwitch = {
  switchKey: string;
  displayName: string;
  active: boolean;
  domainAuthority: string;
  serverEnforced: boolean;
  enforcementNote: string;
  reason: string | null;
  activatedAt: string | null;
  clearedAt: string | null;
};

export type PlatformOperationalStatus = {
  activeSwitches: string[];
  readOnlyMaintenance: boolean;
  generatedAt: string;
};

export type IncidentCategory =
  | 'payment_provider_outage' | 'supabase_outage' | 'notification_outage'
  | 'marketplace_matching_failure' | 'storage_failure' | 'authentication_incident'
  | 'security_incident' | 'data_integrity' | 'migration_failure' | 'other';

export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type IncidentStatus = 'open' | 'mitigating' | 'monitoring' | 'resolved' | 'closed';

export type IncidentTimelineEntry = {
  id: string;
  eventType: string;
  actorId: string | null;
  detail: string;
  createdAt: string;
};

export type OperationalIncident = {
  incidentId: string;
  incidentRef: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  detectedAt: string | null;
  commanderId: string | null;
  affectedSystems: string[];
  internalSummary: string;
  publicSummary: string | null;
  resolvedAt: string | null;
  postmortemReference: string | null;
  timeline: IncidentTimelineEntry[];
};

export type SupportCategory =
  | 'account_access' | 'booking_help' | 'worker_onboarding' | 'verification_help'
  | 'payment_question' | 'withdrawal_question' | 'technical_issue' | 'app_feedback' | 'other';

export const supportCategories: readonly SupportCategory[] = [
  'account_access', 'booking_help', 'worker_onboarding', 'verification_help',
  'payment_question', 'withdrawal_question', 'technical_issue', 'app_feedback', 'other',
] as const;

export type SupportCaseStatus =
  | 'open' | 'in_progress' | 'waiting_participant' | 'escalated' | 'resolved' | 'closed';

export type AuditSource =
  | 'audit_logs' | 'staff_audit' | 'trust_moderation' | 'payment_audit' | 'dispute_events'
  | 'configuration_history' | 'staff_role_history' | 'support_events' | 'operational_events';

export const auditSources: readonly AuditSource[] = [
  'audit_logs', 'staff_audit', 'trust_moderation', 'payment_audit', 'dispute_events',
  'configuration_history', 'staff_role_history', 'support_events', 'operational_events',
] as const;

export type AuditRow = {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  [extra: string]: unknown;
};

export type ExportReportKey =
  | 'queue_throughput' | 'dispute_outcomes' | 'verification_decisions'
  | 'reconciliation_exceptions' | 'marketplace_daily';

/* -------------------------------------------------------------------------
 * Pure helpers. These never grant access; they only shape what is rendered.
 * ---------------------------------------------------------------------- */

/** Deny by default: an unknown capability is never held. */
export function hasCapability(session: StaffSession, capability: StaffCapability): boolean {
  if (!session.isStaff || !session.platformReady) return false;
  return session.capabilities.includes(capability);
}

/** True when every listed capability is held. */
export function hasEveryCapability(
  session: StaffSession,
  capabilities: readonly StaffCapability[],
): boolean {
  return capabilities.every(capability => hasCapability(session, capability));
}

/** An action gated behind a re-authentication is blocked until one is recorded. */
export function canPerform(session: StaffSession, capability: StaffCapability): boolean {
  if (!hasCapability(session, capability)) return false;
  if (reauthCapabilities.includes(capability)) return session.reauthValid;
  return true;
}

export function isHighRisk(capability: StaffCapability): boolean {
  return highRiskCapabilities.includes(capability);
}

export function requiresDualControl(capability: StaffCapability): boolean {
  return dualControlCapabilities.includes(capability);
}

/** Queues are ordered by priority, then by how long the oldest item has waited. */
export function priorityRank(priority: CasePriority): number {
  switch (priority) {
    case 'urgent': return 0;
    case 'high': return 1;
    case 'normal': return 2;
    default: return 3;
  }
}

export function sortQueueItems(items: readonly StaffQueueItem[]): StaffQueueItem[] {
  return [...items].sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    return b.ageSeconds - a.ageSeconds;
  });
}

/** A case is only actionable while it is neither resolved nor closed. */
export function isCaseOpen(status: CaseStatus): boolean {
  return status !== 'resolved' && status !== 'closed';
}

/**
 * Status must be distinguishable without colour, so every status carries a
 * word and a shape token that the UI renders alongside any tint.
 */
export function caseStatusTone(status: CaseStatus): 'neutral' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'escalated': return 'error';
    case 'waiting_participant':
    case 'waiting_provider': return 'warning';
    case 'resolved':
    case 'closed': return 'success';
    default: return 'neutral';
  }
}

export function priorityTone(priority: CasePriority): 'neutral' | 'warning' | 'error' {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  return 'neutral';
}

/** Analytics ranges are bounded so no dashboard can trigger a full-table scan. */
export const maximumAnalyticsRangeDays = 366;

export function analyticsRangeIsValid(from: string, to: string): boolean {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return false;
  return (end - start) / 86_400_000 <= maximumAnalyticsRangeDays;
}

/** Search never runs on a short term, a wildcard, or an empty string. */
export const minimumSearchLength = 6;

export function searchTermIsAllowed(term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length < minimumSearchLength) return false;
  return !/[%_*]/.test(trimmed);
}

/**
 * A suppressed analytics cell arrives as null. It must render as "hidden",
 * never as zero, so a small cohort is not mistaken for an empty one.
 */
export function isSuppressedMetric(value: unknown): boolean {
  return value === null;
}

/** EGP is stored in minor units everywhere; never format a raw minor value. */
export function formatEgpMinor(minor: string | number | null | undefined, locale: 'en' | 'ar'): string {
  if (minor === null || minor === undefined) return '—';
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) return '—';
  const formatted = (value / 100).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === 'ar' ? `${formatted} ج.م` : `EGP ${formatted}`;
}

/** Operational ages are read at a glance, so they are compact and unit-tagged. */
export function formatAge(seconds: number, locale: 'en' | 'ar'): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  if (locale === 'ar') {
    if (days > 0) return `${days} ي ${hours} س`;
    if (hours > 0) return `${hours} س ${minutes} د`;
    return `${minutes} د`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * The environment badge is never decorative: production must be unmistakable,
 * because an action taken in the wrong environment is the costliest mistake in
 * the admin platform.
 */
export function environmentTone(environment: StaffEnvironment | undefined): 'neutral' | 'warning' | 'error' {
  if (environment === 'production') return 'error';
  if (environment === 'staging') return 'warning';
  return 'neutral';
}
