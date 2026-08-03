/**
 * WPS-017 Mock/local parity.
 *
 * Everything here is clearly simulated. Mock mode performs no network call, has
 * no service-role path, and never falls back from a hosted failure into a Mock
 * write. It exists so the whole staff workspace — personas, capabilities,
 * queues, assignment, configuration drafts, flags, incidents, dashboards, the
 * audit explorer, and analytics — can be walked through without a database.
 *
 * The capability map here is a copy of the seeded server map. It is a rehearsal
 * of authorization, never the authority: the server re-checks every action.
 */

import type {
  AuditRow,
  AuditSource,
  CasePriority,
  CaseStatus,
  ConfigurationDomain,
  ConfigurationVersion,
  FeatureFlag,
  KillSwitch,
  OperationalIncident,
  StaffCapability,
  StaffCase,
  StaffDashboard,
  StaffHome,
  StaffQueueKey,
  StaffQueueView,
  StaffRoleKey,
  StaffSession,
} from './admin-types';

export const mockDataNotice = 'SIMULATED DATA — Mock mode';

const roleCapabilities: Record<StaffRoleKey, StaffCapability[]> = {
  support_agent: [
    'view_operations_home', 'safe_search', 'view_safe_customer_profile',
    'view_safe_worker_profile', 'manage_support_cases',
  ],
  verification_reviewer: [
    'view_operations_home', 'safe_search', 'view_safe_worker_profile',
    'review_identity_verification', 'review_certificates', 'legacy_domain_staff_actions',
  ],
  trust_safety_reviewer: [
    'view_operations_home', 'safe_search', 'view_safe_customer_profile', 'view_safe_worker_profile',
    'review_abuse_reports', 'issue_temporary_restriction', 'review_appeals', 'moderate_reviews',
    'legacy_domain_staff_actions',
  ],
  dispute_reviewer: [
    'view_operations_home', 'safe_search', 'view_safe_customer_profile', 'view_safe_worker_profile',
    'review_disputes', 'inspect_payment_state', 'legacy_domain_staff_actions',
  ],
  financial_operations: [
    'view_operations_home', 'safe_search', 'view_safe_worker_profile', 'inspect_payment_state',
    'view_financial_ledger', 'initiate_refund', 'review_withdrawal',
    'review_reconciliation_exception', 'legacy_domain_staff_actions',
  ],
  marketplace_operations: [
    'view_operations_home', 'safe_search', 'view_safe_worker_profile',
    'manage_marketplace_configuration', 'view_analytics',
  ],
  operations_manager: [
    'view_operations_home', 'safe_search', 'view_safe_customer_profile', 'view_safe_worker_profile',
    'assign_cases', 'manage_support_cases', 'manage_incidents', 'view_analytics',
    'export_operational_report', 'approve_configuration', 'legacy_domain_staff_actions',
  ],
  security_administrator: [
    'view_operations_home', 'manage_staff_roles', 'view_audit_logs', 'manage_feature_flags',
    'manage_kill_switches', 'manage_incidents',
  ],
  super_administrator: [
    'view_operations_home', 'safe_search', 'view_safe_customer_profile', 'view_safe_worker_profile',
    'view_contact_details', 'review_identity_verification', 'review_certificates', 'review_disputes',
    'review_abuse_reports', 'issue_temporary_restriction', 'approve_permanent_ban', 'review_appeals',
    'moderate_reviews', 'inspect_payment_state', 'view_financial_ledger', 'initiate_refund',
    'review_withdrawal', 'review_reconciliation_exception', 'manage_marketplace_configuration',
    'manage_notification_configuration', 'approve_configuration', 'manage_feature_flags',
    'manage_kill_switches', 'assign_cases', 'manage_support_cases', 'manage_incidents',
    'view_audit_logs', 'view_analytics', 'export_operational_report', 'manage_staff_roles',
    'legacy_domain_staff_actions',
  ],
};

export type MockStaffPersona = {
  id: string;
  displayName: string;
  roles: StaffRoleKey[];
};

/** Personas mirror the nine seeded roles so every screen can be rehearsed. */
export const mockStaffPersonas: readonly MockStaffPersona[] = [
  { id: 'mock-staff-support', displayName: 'Nour (Support Agent)', roles: ['support_agent'] },
  { id: 'mock-staff-verify', displayName: 'Hala (Verification Reviewer)', roles: ['verification_reviewer'] },
  { id: 'mock-staff-trust', displayName: 'Karim (Trust & Safety)', roles: ['trust_safety_reviewer'] },
  { id: 'mock-staff-dispute', displayName: 'Mona (Dispute Reviewer)', roles: ['dispute_reviewer'] },
  { id: 'mock-staff-finance', displayName: 'Tarek (Financial Operations)', roles: ['financial_operations'] },
  { id: 'mock-staff-market', displayName: 'Salma (Marketplace Operations)', roles: ['marketplace_operations'] },
  { id: 'mock-staff-manager', displayName: 'Youssef (Operations Manager)', roles: ['operations_manager'] },
  { id: 'mock-staff-security', displayName: 'Dina (Security Administrator)', roles: ['security_administrator'] },
  { id: 'mock-staff-super', displayName: 'Break glass (Super Administrator)', roles: ['super_administrator'] },
] as const;

const queueDefinitions: {
  queueKey: StaffQueueKey;
  domain: string;
  displayName: string;
  capability: StaffCapability;
  defaultPriority: CasePriority;
  targetResponseHours: number | null;
  subjectType: string;
}[] = [
  { queueKey: 'identity_verification', domain: 'verification', displayName: 'Pending identity verification', capability: 'review_identity_verification', defaultPriority: 'normal', targetResponseHours: 48, subjectType: 'verification' },
  { queueKey: 'certificate_review', domain: 'verification', displayName: 'Pending certificates', capability: 'review_certificates', defaultPriority: 'normal', targetResponseHours: 72, subjectType: 'certificate' },
  { queueKey: 'open_disputes', domain: 'disputes', displayName: 'Open disputes', capability: 'review_disputes', defaultPriority: 'high', targetResponseHours: 24, subjectType: 'dispute' },
  { queueKey: 'dispute_evidence_deadlines', domain: 'disputes', displayName: 'Dispute evidence deadlines', capability: 'review_disputes', defaultPriority: 'urgent', targetResponseHours: 12, subjectType: 'dispute' },
  { queueKey: 'abuse_reports', domain: 'trust', displayName: 'Abuse reports', capability: 'review_abuse_reports', defaultPriority: 'high', targetResponseHours: 24, subjectType: 'trust_report' },
  { queueKey: 'trust_investigations', domain: 'trust', displayName: 'Trust investigations', capability: 'review_abuse_reports', defaultPriority: 'high', targetResponseHours: 48, subjectType: 'trust_report' },
  { queueKey: 'appeals', domain: 'trust', displayName: 'Appeals', capability: 'review_appeals', defaultPriority: 'high', targetResponseHours: 72, subjectType: 'trust_appeal' },
  { queueKey: 'review_moderation', domain: 'reviews', displayName: 'Review moderation', capability: 'moderate_reviews', defaultPriority: 'normal', targetResponseHours: 48, subjectType: 'review_report' },
  { queueKey: 'failed_refunds', domain: 'financial', displayName: 'Failed refunds', capability: 'initiate_refund', defaultPriority: 'urgent', targetResponseHours: 8, subjectType: 'refund' },
  { queueKey: 'failed_payouts', domain: 'financial', displayName: 'Failed payouts', capability: 'review_withdrawal', defaultPriority: 'urgent', targetResponseHours: 8, subjectType: 'payout' },
  { queueKey: 'withdrawal_reviews', domain: 'financial', displayName: 'Withdrawal reviews', capability: 'review_withdrawal', defaultPriority: 'high', targetResponseHours: 24, subjectType: 'withdrawal' },
  { queueKey: 'reconciliation_exceptions', domain: 'financial', displayName: 'Reconciliation exceptions', capability: 'review_reconciliation_exception', defaultPriority: 'high', targetResponseHours: 24, subjectType: 'reconciliation_exception' },
  { queueKey: 'chargebacks', domain: 'financial', displayName: 'Chargebacks', capability: 'review_reconciliation_exception', defaultPriority: 'urgent', targetResponseHours: 12, subjectType: 'chargeback' },
  { queueKey: 'post_release_cases', domain: 'financial', displayName: 'Post-release financial cases', capability: 'view_financial_ledger', defaultPriority: 'high', targetResponseHours: 48, subjectType: 'financial_case' },
  { queueKey: 'marketplace_incidents', domain: 'marketplace', displayName: 'Marketplace incidents', capability: 'manage_incidents', defaultPriority: 'urgent', targetResponseHours: 4, subjectType: 'incident' },
  { queueKey: 'notification_failures', domain: 'platform', displayName: 'Notification delivery failures', capability: 'manage_incidents', defaultPriority: 'normal', targetResponseHours: 24, subjectType: 'notification_failure' },
  { queueKey: 'support_cases', domain: 'support', displayName: 'Support cases', capability: 'manage_support_cases', defaultPriority: 'normal', targetResponseHours: 24, subjectType: 'support_case' },
  { queueKey: 'security_events', domain: 'security', displayName: 'Security events', capability: 'view_audit_logs', defaultPriority: 'urgent', targetResponseHours: 4, subjectType: 'security_event' },
];

type MockCase = {
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
  createdAt: string;
  lockVersion: number;
  events: StaffCase['events'];
  privateNotes: StaffCase['privateNotes'];
};

type MockStore = {
  personaId: string;
  reauthAt: number | null;
  cases: MockCase[];
  configurations: ConfigurationVersion[];
  flags: FeatureFlag[];
  switches: KillSwitch[];
  incidents: OperationalIncident[];
  audit: AuditRow[];
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function hoursAhead(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function seedCases(): MockCase[] {
  return [
    {
      assignmentId: 'mock-case-0001', queueKey: 'open_disputes', subjectType: 'dispute',
      subjectId: 'mock-dispute-0001', status: 'assigned', priority: 'high',
      reasonCode: 'work_incomplete', assignedTo: 'mock-staff-dispute', assignedAt: hoursAgo(3),
      dueAt: hoursAhead(21), createdAt: hoursAgo(6), lockVersion: 2,
      events: [
        { id: 'mock-event-0001', action: 'opened', fromStatus: null, toStatus: 'unassigned', actorId: 'mock-staff-manager', assigneeId: null, note: null, createdAt: hoursAgo(6) },
        { id: 'mock-event-0002', action: 'claimed', fromStatus: 'unassigned', toStatus: 'assigned', actorId: 'mock-staff-dispute', assigneeId: 'mock-staff-dispute', note: 'Taking this one.', createdAt: hoursAgo(3) },
      ],
      privateNotes: [
        { id: 'mock-note-0001', authorId: 'mock-staff-dispute', note: 'SIMULATED — customer sent photos, waiting on the worker response.', createdAt: hoursAgo(2) },
      ],
    },
    {
      assignmentId: 'mock-case-0002', queueKey: 'abuse_reports', subjectType: 'trust_report',
      subjectId: 'mock-report-0001', status: 'unassigned', priority: 'urgent',
      reasonCode: 'off_platform_payment', assignedTo: null, assignedAt: null,
      dueAt: hoursAhead(2), createdAt: hoursAgo(22), lockVersion: 1,
      events: [
        { id: 'mock-event-0003', action: 'opened', fromStatus: null, toStatus: 'unassigned', actorId: 'mock-staff-trust', assigneeId: null, note: null, createdAt: hoursAgo(22) },
      ],
      privateNotes: [],
    },
    {
      assignmentId: 'mock-case-0003', queueKey: 'identity_verification', subjectType: 'verification',
      subjectId: 'mock-verification-0001', status: 'in_progress', priority: 'normal',
      reasonCode: 'submitted', assignedTo: 'mock-staff-verify', assignedAt: hoursAgo(1),
      dueAt: hoursAhead(47), createdAt: hoursAgo(4), lockVersion: 3,
      events: [
        { id: 'mock-event-0004', action: 'opened', fromStatus: null, toStatus: 'unassigned', actorId: 'mock-staff-verify', assigneeId: null, note: null, createdAt: hoursAgo(4) },
        { id: 'mock-event-0005', action: 'claimed', fromStatus: 'unassigned', toStatus: 'assigned', actorId: 'mock-staff-verify', assigneeId: 'mock-staff-verify', note: null, createdAt: hoursAgo(1) },
        { id: 'mock-event-0006', action: 'status_changed', fromStatus: 'assigned', toStatus: 'in_progress', actorId: 'mock-staff-verify', assigneeId: 'mock-staff-verify', note: 'Checking the document.', createdAt: hoursAgo(1) },
      ],
      privateNotes: [],
    },
    {
      assignmentId: 'mock-case-0004', queueKey: 'reconciliation_exceptions', subjectType: 'reconciliation_exception',
      subjectId: 'mock-exception-0001', status: 'escalated', priority: 'urgent',
      reasonCode: 'amount_mismatch', assignedTo: 'mock-staff-finance', assignedAt: hoursAgo(30),
      dueAt: hoursAgo(6), createdAt: hoursAgo(36), lockVersion: 4,
      events: [
        { id: 'mock-event-0007', action: 'opened', fromStatus: null, toStatus: 'unassigned', actorId: 'mock-staff-finance', assigneeId: null, note: null, createdAt: hoursAgo(36) },
        { id: 'mock-event-0008', action: 'escalated', fromStatus: 'in_progress', toStatus: 'escalated', actorId: 'mock-staff-finance', assigneeId: 'mock-staff-finance', note: 'SIMULATED — needs a manager decision.', createdAt: hoursAgo(6) },
      ],
      privateNotes: [],
    },
    {
      assignmentId: 'mock-case-0005', queueKey: 'support_cases', subjectType: 'support_case',
      subjectId: 'mock-support-0001', status: 'waiting_participant', priority: 'normal',
      reasonCode: 'payment_question', assignedTo: 'mock-staff-support', assignedAt: hoursAgo(9),
      dueAt: hoursAhead(15), createdAt: hoursAgo(12), lockVersion: 2,
      events: [
        { id: 'mock-event-0009', action: 'opened', fromStatus: null, toStatus: 'unassigned', actorId: 'mock-staff-support', assigneeId: null, note: null, createdAt: hoursAgo(12) },
      ],
      privateNotes: [],
    },
  ];
}

function seedFlags(): FeatureFlag[] {
  const base = (flagKey: string, reason: string): FeatureFlag => ({
    flagKey, environment: 'local', enabled: false, audience: 'none', rolloutPercentage: 0,
    reason, reviewBy: null, ownerId: null, isKillSwitch: false, updatedAt: hoursAgo(24),
  });
  return [
    base('marketplace_activation', 'Marketplace activation stays gated until WPS-008 operational sign-off.'),
    base('online_payments', 'Online payments stay disabled until a provider decision is recorded.'),
    base('payouts', 'Payouts stay disabled until a payout provider is authorized.'),
    base('push_notifications', 'Push stays disabled: WPS-014 keeps delivery and token registration off.'),
    base('call_relay', 'Call relay stays disabled: WPS-009 exposes no telephony.'),
    base('emergency_requests', 'Emergency requests stay gated pending operational readiness.'),
    base('rescue_mode', 'Rescue Mode stays gated pending operational readiness.'),
    base('new_profile_ui', 'New worker profile UI is not released.'),
    base('new_review_ui', 'New review UI is not released.'),
    base('staff_beta_tools', 'Staff-only beta tools are not released.'),
  ];
}

function seedSwitches(): KillSwitch[] {
  const base = (switchKey: string, displayName: string, domainAuthority: string,
    serverEnforced: boolean, enforcementNote: string): KillSwitch => ({
    switchKey, displayName, active: false, domainAuthority, serverEnforced, enforcementNote,
    reason: null, activatedAt: null, clearedAt: null,
  });
  return [
    base('online_payment_methods', 'Disable online payment methods', 'WPS-015', true,
      'Sets the WPS-015 payment method availability rows to disabled for every non-cash method.'),
    base('payments_maintenance', 'Payment maintenance mode', 'WPS-015', true,
      'Sets the WPS-015 maintenance control.'),
    base('payouts', 'Disable payouts', 'WPS-015', true, 'Forces the WPS-015 payout mode to disabled.'),
    base('new_marketplace_requests', 'Disable new marketplace requests', 'WPS-008', true,
      'Sets the WPS-008 marketplace activation flag to false.'),
    base('emergency_requests', 'Disable Emergency', 'WPS-008', false,
      'Advisory only; Emergency eligibility stays a WPS-008 decision.'),
    base('rescue_mode', 'Disable Rescue Mode', 'WPS-008', false,
      'Advisory only; Rescue Mode stays a WPS-008 decision.'),
    base('uploads', 'Disable uploads', 'WPS-010', false,
      'Advisory only; storage policies are unchanged and no object is deleted.'),
    base('push_registration', 'Disable push registration', 'WPS-014', true,
      'Already permanently disabled by WPS-014.'),
    base('read_only_maintenance', 'Read-only maintenance message', 'WPS-017', true,
      'Surfaces a read-only banner. Existing bookings, chat, and history are untouched.'),
  ];
}

function seedIncidents(): OperationalIncident[] {
  return [
    {
      incidentId: 'mock-incident-0001', incidentRef: 'INC-SIMULATED-0001',
      category: 'payment_provider_outage', severity: 'sev2', status: 'mitigating',
      startedAt: hoursAgo(5), detectedAt: hoursAgo(5), commanderId: 'mock-staff-manager',
      affectedSystems: ['payments', 'checkout'],
      internalSummary: 'SIMULATED — the sandbox gateway is returning errors for every attempt.',
      publicSummary: 'Card payments are temporarily unavailable. Cash bookings are unaffected.',
      resolvedAt: null, postmortemReference: null,
      timeline: [
        { id: 'mock-inc-event-1', eventType: 'opened', actorId: 'mock-staff-manager', detail: 'SIMULATED — opened after three failed attempts in a row.', createdAt: hoursAgo(5) },
        { id: 'mock-inc-event-2', eventType: 'mitigation', actorId: 'mock-staff-security', detail: 'SIMULATED — activated the online payment methods kill switch.', createdAt: hoursAgo(4) },
      ],
    },
  ];
}

function seedAudit(): AuditRow[] {
  return [
    { id: 'mock-audit-0001', at: hoursAgo(1), actorId: 'mock-staff-security', action: 'staff_role_granted', entityType: 'staff_role_grant', entityId: 'mock-grant-0001', reason: 'SIMULATED — support onboarding', breakGlass: false },
    { id: 'mock-audit-0002', at: hoursAgo(4), actorId: 'mock-staff-security', action: 'kill_switch_activated', entityType: 'staff_kill_switch', entityId: null, reason: 'SIMULATED — provider outage', breakGlass: false },
    { id: 'mock-audit-0003', at: hoursAgo(6), actorId: 'mock-staff-manager', action: 'configuration_activated', entityType: 'staff_configuration_version', entityId: 'mock-config-0001', reason: 'SIMULATED — widened the first wave', breakGlass: false },
  ];
}

function seedConfigurations(): ConfigurationVersion[] {
  return [
    {
      id: 'mock-config-0001', domainKey: 'marketplace_waves', environment: 'local', version: 1,
      status: 'active', payload: { firstWaveSize: 4, usefulQuoteTarget: 5 },
      changeReason: 'SIMULATED — widen the first wave for coverage.',
      createdBy: 'mock-staff-market', approvedBy: 'mock-staff-manager',
      activatedAt: hoursAgo(6), rolledBackFrom: null, createdAt: hoursAgo(8),
    },
    {
      id: 'mock-config-0002', domainKey: 'marketplace_ranking', environment: 'local', version: 1,
      status: 'pending_approval', payload: { version: 'best-value-v1', qualityFloor: 0.35 },
      changeReason: 'SIMULATED — record the current ranking policy for review.',
      createdBy: 'mock-staff-market', approvedBy: null,
      activatedAt: null, rolledBackFrom: null, createdAt: hoursAgo(2),
    },
  ];
}

export const mockConfigurationDomains: readonly ConfigurationDomain[] = [
  { domainKey: 'marketplace_mode', displayName: 'Marketplace modes', authoritativeOwner: 'WPS-008', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['enabled', 'schedulerEnabled', 'emergencyEnabled', 'rescueModeEnabled'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'marketplace_ranking', displayName: 'Ranking configuration', authoritativeOwner: 'WPS-008', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['version', 'qualityFloor', 'fairnessBound', 'newWorkerBound'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'marketplace_waves', displayName: 'Invitation waves', authoritativeOwner: 'WPS-008', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['firstWaveSize', 'maximumInvitations', 'usefulQuoteTarget', 'waveCadenceSeconds', 'maximumRadiusKm'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'notification_policy', displayName: 'Notification configuration', authoritativeOwner: 'WPS-014', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['requiredActionBypassesQuietHours', 'reminderAttemptLimit'], capabilityKey: 'manage_notification_configuration' },
  { domainKey: 'reminder_policy', displayName: 'Reminder configuration', authoritativeOwner: 'WPS-014', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['schedulerEnabled', 'reminderAttemptLimit'], capabilityKey: 'manage_notification_configuration' },
  { domainKey: 'payment_mode', displayName: 'Payment modes', authoritativeOwner: 'WPS-015', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['gatewayMode', 'maintenanceMode', 'maintenanceReason'], capabilityKey: 'manage_kill_switches' },
  { domainKey: 'payout_mode', displayName: 'Payout modes', authoritativeOwner: 'WPS-015', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['payoutMode'], capabilityKey: 'manage_kill_switches' },
  { domainKey: 'release_scheduler', displayName: 'Release scheduler flag', authoritativeOwner: 'WPS-007', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['automaticReleaseSchedulerEnabled'], capabilityKey: 'manage_kill_switches' },
  { domainKey: 'call_relay', displayName: 'Call relay mode', authoritativeOwner: 'WPS-009', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['relayMode'], capabilityKey: 'manage_notification_configuration' },
  { domainKey: 'trust_policy', displayName: 'Trust policy', authoritativeOwner: 'WPS-016', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['appealWindowDays', 'restrictionDefaultDays'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'review_policy', displayName: 'Review edit window', authoritativeOwner: 'WPS-011', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['editWindowHours', 'moderationHoldEnabled'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'dispute_policy', displayName: 'Dispute policy', authoritativeOwner: 'WPS-013', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['eligibilityWindowDays', 'evidenceDeadlineHours', 'maxEvidenceBytes'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'upload_limits', displayName: 'Upload limits', authoritativeOwner: 'WPS-010', appliedBy: 'domain_runbook', requiresApproval: true, allowedKeys: ['maxImageBytes', 'maxDocumentBytes', 'maxPortfolioImages'], capabilityKey: 'manage_marketplace_configuration' },
  { domainKey: 'maintenance', displayName: 'Maintenance modes', authoritativeOwner: 'WPS-017', appliedBy: 'wps017', requiresApproval: true, allowedKeys: ['readOnlyMessageEn', 'readOnlyMessageAr', 'maintenanceActive'], capabilityKey: 'manage_kill_switches' },
  { domainKey: 'admin_platform', displayName: 'Admin platform settings', authoritativeOwner: 'WPS-017', appliedBy: 'wps017', requiresApproval: true, allowedKeys: ['reauthWindowSeconds', 'searchRateLimitPerMinute', 'exportRowLimit', 'analyticsMinimumCell'], capabilityKey: 'manage_staff_roles' },
] as const;

const store: MockStore = {
  personaId: mockStaffPersonas[6].id,
  reauthAt: null,
  cases: seedCases(),
  configurations: seedConfigurations(),
  flags: seedFlags(),
  switches: seedSwitches(),
  incidents: seedIncidents(),
  audit: seedAudit(),
};

export function mockCapabilitiesFor(roles: readonly StaffRoleKey[]): StaffCapability[] {
  const set = new Set<StaffCapability>();
  roles.forEach(role => roleCapabilities[role].forEach(capability => set.add(capability)));
  return [...set];
}

export function setMockPersona(personaId: string) {
  if (mockStaffPersonas.some(persona => persona.id === personaId)) {
    store.personaId = personaId;
    store.reauthAt = null;
  }
}

export function currentMockPersona(): MockStaffPersona {
  return mockStaffPersonas.find(p => p.id === store.personaId) ?? mockStaffPersonas[0];
}

export function mockSession(): StaffSession {
  const persona = currentMockPersona();
  const capabilities = mockCapabilitiesFor(persona.roles);
  return {
    isStaff: true,
    staffId: persona.id,
    roles: [...persona.roles],
    capabilities,
    environment: 'local',
    displayTimezone: 'Africa/Cairo',
    mfaRequired: false,
    mfaProvider: 'none',
    legacyBridgeEnabled: false,
    reauthWindowSeconds: 900,
    reauthValid: store.reauthAt !== null && Date.now() - store.reauthAt < 900_000,
    platformReady: true,
    breakGlassOnly: persona.roles.length === 1 && persona.roles[0] === 'super_administrator',
  };
}

export function mockReauthenticate() {
  store.reauthAt = Date.now();
}

export function mockRevokeSessions() {
  store.reauthAt = null;
}

function visibleQueues(capabilities: readonly StaffCapability[]) {
  return queueDefinitions.filter(queue => capabilities.includes(queue.capability));
}

export function mockHome(): StaffHome {
  const session = mockSession();
  const queues = visibleQueues(session.capabilities).map(queue => {
    const cases = store.cases.filter(c => c.queueKey === queue.queueKey);
    const open = cases.filter(c => c.status !== 'resolved' && c.status !== 'closed');
    return {
      queueKey: queue.queueKey,
      domain: queue.domain,
      displayName: queue.displayName,
      defaultPriority: queue.defaultPriority,
      targetResponseHours: queue.targetResponseHours,
      openAssignments: open.length,
      assignedToMe: open.filter(c => c.assignedTo === session.staffId).length,
      overdue: open.filter(c => c.dueAt !== null && Date.parse(c.dueAt) < Date.now()).length,
      backlog: queue.queueKey === 'identity_verification' ? 2 : 0,
    };
  });
  const mine = store.cases.filter(c => c.assignedTo === session.staffId
    && c.status !== 'resolved' && c.status !== 'closed');
  return {
    queues,
    myOpenCases: mine.length,
    myOverdueCases: mine.filter(c => c.dueAt !== null && Date.parse(c.dueAt) < Date.now()).length,
    activeIncidents: store.incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length,
    generatedAt: new Date().toISOString(),
  };
}

export function mockQueue(queueKey: StaffQueueKey): StaffQueueView {
  const definition = queueDefinitions.find(q => q.queueKey === queueKey);
  const cases = store.cases.filter(c => c.queueKey === queueKey
    && c.status !== 'resolved' && c.status !== 'closed');
  return {
    queueKey,
    displayName: definition?.displayName ?? queueKey,
    subjectType: definition?.subjectType ?? 'unknown',
    targetResponseHours: definition?.targetResponseHours ?? null,
    items: cases.map(c => ({
      assignmentId: c.assignmentId,
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      status: c.status,
      priority: c.priority,
      reasonCode: c.reasonCode,
      assignedTo: c.assignedTo,
      assignedToName: c.assignedTo
        ? mockStaffPersonas.find(p => p.id === c.assignedTo)?.displayName ?? null
        : null,
      dueAt: c.dueAt,
      createdAt: c.createdAt,
      updatedAt: c.createdAt,
      lockVersion: c.lockVersion,
      ageSeconds: Math.floor((Date.now() - Date.parse(c.createdAt)) / 1000),
      overdue: c.dueAt !== null && Date.parse(c.dueAt) < Date.now(),
    })),
    backlog: queueKey === 'identity_verification'
      ? [
        { subjectId: 'mock-verification-0002', subjectType: 'verification', createdAt: hoursAgo(30), reasonCode: 'submitted', priority: 'normal' },
        { subjectId: 'mock-verification-0003', subjectType: 'verification', createdAt: hoursAgo(50), reasonCode: 'under_review', priority: 'high' },
      ]
      : [],
    generatedAt: new Date().toISOString(),
  };
}

export function mockCase(assignmentId: string): StaffCase | null {
  const found = store.cases.find(c => c.assignmentId === assignmentId);
  if (!found) return null;
  return {
    assignmentId: found.assignmentId,
    queueKey: found.queueKey,
    subjectType: found.subjectType,
    subjectId: found.subjectId,
    status: found.status,
    priority: found.priority,
    reasonCode: found.reasonCode,
    assignedTo: found.assignedTo,
    assignedAt: found.assignedAt,
    dueAt: found.dueAt,
    escalatedAt: found.status === 'escalated' ? found.createdAt : null,
    resolvedAt: null,
    closedAt: null,
    lockVersion: found.lockVersion,
    createdAt: found.createdAt,
    events: found.events,
    privateNotes: found.privateNotes,
  };
}

export function mockTransitionCase(
  assignmentId: string, status: CaseStatus, expectedVersion: number, note: string | null,
): { status: CaseStatus; lockVersion: number } {
  const found = store.cases.find(c => c.assignmentId === assignmentId);
  if (!found) throw new Error('Case not found');
  if (found.lockVersion !== expectedVersion) throw new Error('This case changed since you opened it');
  found.status = status;
  found.lockVersion += 1;
  found.events = [...found.events, {
    id: `mock-event-${found.events.length + 100}`,
    action: status === 'escalated' ? 'escalated' : 'status_changed',
    fromStatus: found.status, toStatus: status,
    actorId: currentMockPersona().id, assigneeId: found.assignedTo,
    note, createdAt: new Date().toISOString(),
  }];
  return { status, lockVersion: found.lockVersion };
}

export function mockClaimCase(assignmentId: string, expectedVersion: number) {
  const found = store.cases.find(c => c.assignmentId === assignmentId);
  if (!found) throw new Error('Case not found');
  if (found.lockVersion !== expectedVersion) throw new Error('This case changed since you opened it');
  found.assignedTo = currentMockPersona().id;
  found.assignedAt = new Date().toISOString();
  found.status = found.status === 'unassigned' ? 'assigned' : found.status;
  found.lockVersion += 1;
  return { status: found.status, lockVersion: found.lockVersion };
}

export function mockAddCaseNote(assignmentId: string, note: string) {
  const found = store.cases.find(c => c.assignmentId === assignmentId);
  if (!found) throw new Error('Case not found');
  found.privateNotes = [...found.privateNotes, {
    id: `mock-note-${found.privateNotes.length + 100}`,
    authorId: currentMockPersona().id,
    note,
    createdAt: new Date().toISOString(),
  }];
}

export function mockConfigurations(): ConfigurationVersion[] {
  return [...store.configurations];
}

export function mockFlags(): FeatureFlag[] {
  return [...store.flags];
}

export function mockSetFlag(flagKey: string, enabled: boolean, audience: FeatureFlag['audience'], reason: string) {
  const flag = store.flags.find(f => f.flagKey === flagKey);
  if (!flag) throw new Error('Unknown feature flag');
  flag.enabled = enabled;
  flag.audience = enabled ? audience : 'none';
  flag.rolloutPercentage = enabled ? 100 : 0;
  flag.reason = reason;
  flag.updatedAt = new Date().toISOString();
}

export function mockSwitches(): KillSwitch[] {
  return [...store.switches];
}

export function mockSetSwitch(switchKey: string, active: boolean, reason: string) {
  const found = store.switches.find(s => s.switchKey === switchKey);
  if (!found) throw new Error('Unknown kill switch');
  found.active = active;
  found.reason = active ? reason : null;
  found.activatedAt = active ? new Date().toISOString() : found.activatedAt;
  found.clearedAt = active ? null : new Date().toISOString();
}

export function mockIncidents(): OperationalIncident[] {
  return [...store.incidents];
}

export function mockAudit(source: AuditSource): AuditRow[] {
  if (source === 'staff_audit') return [...store.audit];
  return [];
}

/** Fixture metrics mirror the catalogued keys exactly, including suppression. */
export function mockAnalytics(dashboard: StaffDashboard): Record<string, unknown> {
  switch (dashboard) {
    case 'marketplace':
      return {
        requestsCreated: 128, requestsWithQuotes: 96, requestsExpired: 14, requestsCancelled: 9,
        requestsConverted: 71, noProviderOutcomes: 6, emergencyRequests: 4, rescueRequests: 2,
        medianQuotesPerRequest: 3, medianSecondsToFirstQuote: 214,
      };
    case 'bookings':
      return {
        bookingsCreated: 74, confirmed: 68, completed: 51, cancelled: 6, noShow: 2, disputed: 3,
        cancellationRate: 0.0811, returnVisits: 4, additionalWorkRequests: 11,
      };
    case 'workers':
      return {
        totalWorkers: 63, verifiedWorkers: 41, publishedWorkers: 38, availableWorkers: 22,
        approvedOnboarding: 41, averageRating: 4.6, categoryCoverage: 7,
      };
    case 'customers':
      return {
        activeCustomers: 44, requestingCustomers: 51, repeatCustomers: null,
        cashSelections: 62, onlineSelections: 0,
      };
    case 'financial':
      return {
        currency: 'EGP', grossBookingValueMinor: '1284500', commissionMinor: '128450',
        pendingEarningsMinor: '412000', availableEarningsMinor: '318000', paidEarningsMinor: '0',
        withdrawalsRequested: 3, refunds: 2, refundsFailed: 0, chargebacks: 0,
        reconciliationExceptions: 1, openCashCommissionDebtRecords: 5,
      };
    case 'trust':
      return {
        reportsSubmitted: 9, reportsActioned: 3, reportsDismissed: 4, enforcementActions: 5,
        permanentBans: 0, appealsSubmitted: 2, appealsOverturned: 1, disputesOpened: 6,
        disputesResolved: 4, reviewReports: 3, reviewModerationActions: 2, reviewsPublished: 37,
      };
    case 'verification':
      return {
        submitted: 12, approved: 41, rejected: 3, awaitingReview: 4, requiresResubmission: 2,
        expired: 1, certificatesSubmitted: 7, certificatesApproved: 19,
      };
    case 'notifications':
      return {
        notificationsCreated: 486, unread: 122, requiredActionOpen: 18, deliveryFailures: 0,
        pushDeliveryEnabled: false, schedulerEnabled: false,
      };
    default:
      return {
        requestsCreated: 128, bookingsCreated: 74, bookingsCompleted: 51, publishedWorkers: 38,
        openDisputes: 2, openReports: 3, activeIncidents: 1,
        onlinePaymentsEnabled: false, marketplaceEnabled: false,
      };
  }
}

/** Test-only helper so Mock state does not leak between test cases. */
export function resetMockAdminState() {
  store.personaId = mockStaffPersonas[6].id;
  store.reauthAt = null;
  store.cases = seedCases();
  store.configurations = seedConfigurations();
  store.flags = seedFlags();
  store.switches = seedSwitches();
  store.incidents = seedIncidents();
  store.audit = seedAudit();
}
