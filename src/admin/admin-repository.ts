import { adminSurfaceEnabled, environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  anonymousStaffSession,
  type AuditRow,
  type AuditSource,
  type CaseStatus,
  type ConfigurationDomain,
  type ConfigurationVersion,
  type ExportReportKey,
  type FeatureFlag,
  type FeatureFlagAudience,
  type IncidentCategory,
  type IncidentSeverity,
  type KillSwitch,
  type OperationalIncident,
  type PlatformOperationalStatus,
  type SafeSearchKind,
  type SafeSearchResult,
  type StaffAnalytics,
  type StaffCase,
  type StaffDashboard,
  type StaffEnvironment,
  type StaffHome,
  type StaffQueueKey,
  type StaffQueueView,
  type StaffRoleKey,
  type StaffSession,
} from './admin-types';
import {
  mockAddCaseNote,
  mockAnalytics,
  mockAudit,
  mockCase,
  mockClaimCase,
  mockConfigurationDomains,
  mockConfigurations,
  mockFlags,
  mockHome,
  mockIncidents,
  mockQueue,
  mockReauthenticate,
  mockRevokeSessions,
  mockSession,
  mockSetFlag,
  mockSetSwitch,
  mockSwitches,
  mockTransitionCase,
} from './mock-admin-state';

/**
 * WPS-017 admin repository.
 *
 * Mock and Supabase stay fully isolated: Mock performs no network call, and a
 * hosted failure never falls back into a Mock write. There is no service-role
 * client here and no generic RPC dispatcher — every call names one guarded
 * function, and the server re-checks the capability regardless of what the
 * client believed.
 */

function requireSurface() {
  if (!adminSurfaceEnabled) {
    throw new Error('The operations surface is not enabled in this build.');
  }
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const adminRepository = {
  async getSession(): Promise<StaffSession> {
    if (!adminSurfaceEnabled) return anonymousStaffSession;
    if (environment.dataMode === 'mock') return mockSession();
    return rpc<StaffSession>('get_staff_session');
  },

  async reauthenticate(): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') { mockReauthenticate(); return; }
    await rpc('staff_reauthenticate');
  },

  async revokeMySessions(): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') { mockRevokeSessions(); return; }
    await rpc('staff_revoke_my_sessions');
  },

  async getHome(): Promise<StaffHome> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockHome();
    return rpc<StaffHome>('get_staff_home');
  },

  async getQueue(
    queueKey: StaffQueueKey,
    options: { status?: CaseStatus; limit?: number; offset?: number } = {},
  ): Promise<StaffQueueView> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockQueue(queueKey);
    return rpc<StaffQueueView>('get_staff_queue', {
      p_queue_key: queueKey,
      p_status: options.status ?? null,
      p_limit: options.limit ?? 25,
      p_offset: options.offset ?? 0,
    });
  },

  async getCase(assignmentId: string): Promise<StaffCase> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      const found = mockCase(assignmentId);
      if (!found) throw new Error('Case not found');
      return found;
    }
    return rpc<StaffCase>('get_staff_case', { p_assignment_id: assignmentId });
  },

  async claimCase(
    assignmentId: string, staffId: string, expectedVersion: number, idempotencyKey: string,
    note?: string,
  ): Promise<{ status: CaseStatus; lockVersion: number }> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockClaimCase(assignmentId, expectedVersion);
    const result = await rpc<{ status: CaseStatus; lockVersion: number }>('staff_assign_case', {
      p_assignment_id: assignmentId,
      p_assignee_id: staffId,
      p_expected_version: expectedVersion,
      p_note: note ?? null,
      p_idempotency_key: idempotencyKey,
    });
    return result;
  },

  async transitionCase(
    assignmentId: string, status: CaseStatus, expectedVersion: number, idempotencyKey: string,
    note?: string,
  ): Promise<{ status: CaseStatus; lockVersion: number }> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return mockTransitionCase(assignmentId, status, expectedVersion, note ?? null);
    }
    return rpc<{ status: CaseStatus; lockVersion: number }>('staff_transition_case', {
      p_assignment_id: assignmentId,
      p_status: status,
      p_expected_version: expectedVersion,
      p_note: note ?? null,
      p_idempotency_key: idempotencyKey,
    });
  },

  async addCaseNote(assignmentId: string, note: string, idempotencyKey: string): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') { mockAddCaseNote(assignmentId, note); return; }
    await rpc('staff_add_case_note', {
      p_assignment_id: assignmentId,
      p_note: note,
      p_idempotency_key: idempotencyKey,
    });
  },

  async search(term: string, kind?: SafeSearchKind): Promise<SafeSearchResult[]> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return term.startsWith('mock-')
        ? [{ kind: kind ?? 'account', id: term, status: 'simulated', createdAt: new Date().toISOString() }]
        : [];
    }
    const result = await rpc<{ results: SafeSearchResult[] }>('staff_safe_search', {
      p_query: term,
      p_kind: kind ?? null,
    });
    return result?.results ?? [];
  },

  async getCustomerOverview(userId: string): Promise<Record<string, unknown>> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return { userId, displayName: 'Simulated customer', contact: {}, contactVisible: false };
    }
    return rpc<Record<string, unknown>>('get_staff_customer_overview', { p_user_id: userId });
  },

  async getWorkerOverview(providerId: string): Promise<Record<string, unknown>> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return { providerId, displayName: 'Simulated worker', financial: {}, financialVisible: false };
    }
    return rpc<Record<string, unknown>>('get_staff_worker_overview', { p_provider_id: providerId });
  },

  async getConfiguration(domainKey?: string): Promise<{
    domains: ConfigurationDomain[];
    versions: ConfigurationVersion[];
  }> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return { domains: [...mockConfigurationDomains], versions: mockConfigurations() };
    }
    return rpc('get_staff_configuration', { p_domain_key: domainKey ?? null });
  },

  async createConfigurationDraft(
    domainKey: string, env: StaffEnvironment, payload: Record<string, unknown>, changeReason: string,
  ): Promise<{ id: string; version: number }> {
    requireSurface();
    if (environment.dataMode === 'mock') return { id: 'mock-config-draft', version: 99 };
    return rpc('staff_create_configuration_draft', {
      p_domain_key: domainKey,
      p_environment: env,
      p_payload: payload,
      p_change_reason: changeReason,
    });
  },

  async submitConfiguration(versionId: string): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_submit_configuration', { p_version_id: versionId });
  },

  async activateConfiguration(versionId: string, approvalNote: string): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_activate_configuration', {
      p_version_id: versionId,
      p_approval_note: approvalNote,
    });
  },

  async rollbackConfiguration(
    domainKey: string, env: StaffEnvironment, targetVersion: number, changeReason: string,
  ): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_rollback_configuration', {
      p_domain_key: domainKey,
      p_environment: env,
      p_target_version: targetVersion,
      p_change_reason: changeReason,
    });
  },

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockFlags();
    return rpc<FeatureFlag[]>('get_staff_feature_flags');
  },

  async setFeatureFlag(
    flagKey: string, env: StaffEnvironment, enabled: boolean,
    audience: FeatureFlagAudience, rolloutPercentage: number, reason: string,
  ): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') { mockSetFlag(flagKey, enabled, audience, reason); return; }
    await rpc('staff_set_feature_flag', {
      p_flag_key: flagKey,
      p_environment: env,
      p_enabled: enabled,
      p_audience: audience,
      p_rollout_percentage: rolloutPercentage,
      p_reason: reason,
      p_review_by: null,
    });
  },

  /** Client-facing flag resolution. Unknown or disabled always resolves false. */
  async getMyFeatureFlags(mode: 'customer' | 'worker' | 'staff'): Promise<Record<string, boolean>> {
    if (environment.dataMode === 'mock') {
      return Object.fromEntries(mockFlags().map(flag => [flag.flagKey, flag.enabled]));
    }
    return rpc<Record<string, boolean>>('get_my_feature_flags', { p_mode: mode });
  },

  async getKillSwitches(): Promise<KillSwitch[]> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockSwitches();
    return rpc<KillSwitch[]>('get_staff_kill_switches');
  },

  async setKillSwitch(
    switchKey: string, active: boolean, reason: string, idempotencyKey: string,
  ): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') { mockSetSwitch(switchKey, active, reason); return; }
    await rpc('staff_set_kill_switch', {
      p_switch_key: switchKey,
      p_active: active,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
  },

  /** Read by every client, staff or not, so the app can fail closed. */
  async getPlatformStatus(): Promise<PlatformOperationalStatus> {
    if (environment.dataMode === 'mock') {
      return {
        activeSwitches: mockSwitches().filter(s => s.active).map(s => s.switchKey),
        readOnlyMaintenance: false,
        generatedAt: new Date().toISOString(),
      };
    }
    return rpc<PlatformOperationalStatus>('get_platform_operational_status');
  },

  async getIncidents(includeClosed = false): Promise<OperationalIncident[]> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockIncidents();
    return rpc<OperationalIncident[]>('get_staff_incidents', { p_include_closed: includeClosed });
  },

  async openIncident(
    category: IncidentCategory, severity: IncidentSeverity, internalSummary: string,
    affectedSystems: string[], idempotencyKey: string, publicSummary?: string,
  ): Promise<{ incidentId: string; incidentRef: string }> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return { incidentId: 'mock-incident-new', incidentRef: 'INC-SIMULATED-NEW' };
    }
    return rpc('staff_open_incident', {
      p_category: category,
      p_severity: severity,
      p_internal_summary: internalSummary,
      p_affected_systems: affectedSystems,
      p_idempotency_key: idempotencyKey,
      p_public_summary: publicSummary ?? null,
    });
  },

  async updateIncident(
    incidentId: string, eventType: string, detail: string, idempotencyKey: string,
    status?: string,
  ): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_update_incident', {
      p_incident_id: incidentId,
      p_event_type: eventType,
      p_detail: detail,
      p_idempotency_key: idempotencyKey,
      p_status: status ?? null,
      p_severity: null,
      p_public_summary: null,
      p_postmortem_reference: null,
    });
  },

  async searchAudit(
    source: AuditSource,
    options: { from?: string; to?: string; actorId?: string; entityId?: string; limit?: number } = {},
  ): Promise<AuditRow[]> {
    requireSurface();
    if (environment.dataMode === 'mock') return mockAudit(source);
    const result = await rpc<{ rows: AuditRow[] }>('staff_audit_search', {
      p_source: source,
      p_from: options.from ?? null,
      p_to: options.to ?? null,
      p_actor_id: options.actorId ?? null,
      p_entity_id: options.entityId ?? null,
      p_limit: options.limit ?? 50,
      p_offset: 0,
    });
    return result?.rows ?? [];
  },

  async getAnalytics(dashboard: StaffDashboard, from?: string, to?: string): Promise<StaffAnalytics> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      const today = new Date().toISOString().slice(0, 10);
      return {
        dashboard,
        from: from ?? today,
        to: to ?? today,
        timezone: 'Africa/Cairo',
        timeBasis: 'record creation time, bucketed by the reporting timezone',
        minimumCell: 5,
        partial: true,
        generatedAt: new Date().toISOString(),
        metrics: mockAnalytics(dashboard),
      };
    }
    return rpc<StaffAnalytics>('get_staff_analytics', {
      p_dashboard: dashboard,
      p_from: from ?? null,
      p_to: to ?? null,
    });
  },

  async requestExport(
    reportKey: ExportReportKey, rangeStart: string, rangeEnd: string, reason: string,
    idempotencyKey: string,
  ): Promise<{ exportId: string; columns: string[]; rowLimit: number; expiresAt: string }> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return {
        exportId: 'mock-export-0001', columns: ['simulated'], rowLimit: 500,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
    }
    return rpc('staff_request_export', {
      p_report_key: reportKey,
      p_range_start: rangeStart,
      p_range_end: rangeEnd,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
  },

  async previewExport(exportId: string): Promise<{
    columns: string[]; rows: Record<string, unknown>[]; fileDeliveryAvailable: boolean;
  }> {
    requireSurface();
    if (environment.dataMode === 'mock') {
      return { columns: ['simulated'], rows: [], fileDeliveryAvailable: false };
    }
    return rpc('staff_export_preview', { p_export_id: exportId });
  },

  async grantRole(
    userId: string, roleKey: StaffRoleKey, reason: string, idempotencyKey: string,
  ): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_grant_role', {
      p_user_id: userId,
      p_role_key: roleKey,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
      p_expires_at: null,
    });
  },

  async revokeRole(grantId: string, reason: string): Promise<void> {
    requireSurface();
    if (environment.dataMode === 'mock') return;
    await rpc('staff_revoke_role', { p_grant_id: grantId, p_reason: reason });
  },

  async getRoleDirectory(): Promise<Record<string, unknown>> {
    requireSurface();
    if (environment.dataMode === 'mock') return { roles: [], capabilities: [], grants: [] };
    return rpc<Record<string, unknown>>('get_staff_role_directory');
  },
};
