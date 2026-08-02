import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import type {
  StaffTrustQueueSummary,
  TrustAppealSummary,
  TrustReportCategory,
  TrustReportSubjectType,
  TrustReportSummary,
  TrustReportSurface,
  TrustStatus,
} from './trust-safety-types';

/**
 * WPS-016 trust and safety repository.
 *
 * Mock and Supabase stay fully isolated. Mock performs no external call and
 * contacts no moderation provider — there is no external moderation provider
 * and no AI moderation anywhere in WPS-016.
 */

type MockStore = {
  reports: (TrustReportSummary & { accountKey: string })[];
  appeals: (TrustAppealSummary & { accountKey: string })[];
};

const mockStore: MockStore = { reports: [], appeals: [] };

function goodStanding(): TrustStatus {
  return {
    trustLevel: 'good_standing',
    restrictions: {},
    publicReason: null,
    restrictionExpiresAt: null,
    canAppeal: false,
  };
}

export type SubmitTrustReportInput = {
  subjectType: TrustReportSubjectType;
  subjectId?: string;
  subjectUserId?: string;
  category: TrustReportCategory;
  sourceSurface: TrustReportSurface;
  details?: string;
  idempotencyKey: string;
  sourceReportId?: string;
};

export const trustSafetyRepository = {
  async submitReport(
    accountKey: string,
    input: SubmitTrustReportInput,
  ): Promise<{ id: string; status: string; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const existing = mockStore.reports.find(
        r => r.accountKey === accountKey && r.id === input.idempotencyKey,
      );
      if (existing) return { id: existing.id, status: existing.status, duplicate: true };
      mockStore.reports.push({
        accountKey,
        id: input.idempotencyKey,
        category: input.category,
        sourceSurface: input.sourceSurface,
        status: 'submitted',
        createdAt: new Date().toISOString(),
      });
      return { id: input.idempotencyKey, status: 'submitted', duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('submit_trust_report', {
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId ?? null,
      p_subject_user_id: input.subjectUserId ?? null,
      p_category: input.category,
      p_source_surface: input.sourceSurface,
      p_details: input.details ?? null,
      p_idempotency_key: input.idempotencyKey,
      p_source_report_id: input.sourceReportId ?? null,
    });
    if (error) throw error;
    return data as { id: string; status: string; duplicate: boolean };
  },

  async getMyReports(accountKey: string): Promise<TrustReportSummary[]> {
    if (environment.dataMode === 'mock') {
      return mockStore.reports
        .filter(r => r.accountKey === accountKey)
        .map(({ accountKey: _ignored, ...rest }) => rest);
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_my_trust_reports');
    if (error) throw error;
    return (data ?? []) as TrustReportSummary[];
  },

  async getMyTrustStatus(): Promise<TrustStatus> {
    if (environment.dataMode === 'mock') return goodStanding();
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_my_trust_status');
    if (error) throw error;
    return data as TrustStatus;
  },

  async submitAppeal(
    accountKey: string,
    enforcementActionId: string,
    statement: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const existing = mockStore.appeals.find(
        a => a.accountKey === accountKey && a.enforcementActionId === enforcementActionId,
      );
      if (existing) return { id: existing.id, status: existing.status, duplicate: true };
      mockStore.appeals.push({
        accountKey,
        id: idempotencyKey,
        enforcementActionId,
        status: 'submitted',
        decisionNote: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
      });
      return { id: idempotencyKey, status: 'submitted', duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('submit_trust_appeal', {
      p_enforcement_action_id: enforcementActionId,
      p_statement: statement,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as { id: string; status: string; duplicate: boolean };
  },

  async getMyAppeals(accountKey: string): Promise<TrustAppealSummary[]> {
    if (environment.dataMode === 'mock') {
      return mockStore.appeals
        .filter(a => a.accountKey === accountKey)
        .map(({ accountKey: _ignored, ...rest }) => rest);
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_my_trust_appeals');
    if (error) throw error;
    return (data ?? []) as TrustAppealSummary[];
  },

  async getStaffQueueSummary(): Promise<StaffTrustQueueSummary> {
    if (environment.dataMode === 'mock') {
      return {
        openReports: mockStore.reports.filter(r => r.status === 'submitted').length,
        investigating: 0,
        openAppeals: mockStore.appeals.filter(a => a.status === 'submitted').length,
        activeRestrictions: 0,
        highSeveritySignals: 0,
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_staff_trust_queue_summary');
    if (error) throw error;
    return data as StaffTrustQueueSummary;
  },
};

/** Test-only helper so Mock state does not leak between accounts in tests. */
export function resetMockTrustState() {
  mockStore.reports.length = 0;
  mockStore.appeals.length = 0;
}
