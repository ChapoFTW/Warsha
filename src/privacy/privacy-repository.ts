import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  mockCancelDeletion,
  mockClearHistory,
  mockConsents,
  mockExports,
  mockPrivacyOverview,
  mockRecordConsent,
  mockRequestDeletion,
  mockRequestExport,
  mockSetDeactivated,
} from './mock-privacy-state';
import {
  emptyOverview,
  type ConsentEntry,
  type ConsentPurposeKey,
  type DeletionRequest,
  type ExportRequest,
  type HistoryScope,
  type PrivacyOverview,
} from './privacy-types';

/**
 * WPS-022 privacy repository.
 *
 * Mock and Supabase are fully isolated: Mock performs no network call, never
 * falls back to Supabase, and a Supabase failure never writes into Mock.
 *
 * Every method is a thin call onto a server RPC. Nothing here decides whether
 * a deletion may proceed, whether a consent may be declined, or what an export
 * contains — those are server rules, and a rule evaluated on the client is a
 * rule an attacker controls. In particular there is no method that deletes an
 * account, anonymizes one, or executes retention: those verbs do not exist in
 * this file because they do not exist for any client.
 */

function requireAccount(accountKey: string | null): string {
  if (!accountKey) throw new Error('An account is required');
  return accountKey;
}

export const privacyRepository = {
  async overview(accountKey: string | null): Promise<PrivacyOverview> {
    if (environment.dataMode === 'mock') return mockPrivacyOverview(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_privacy_overview');
    if (error) throw error;
    return (data ?? emptyOverview) as PrivacyOverview;
  },

  async consents(accountKey: string | null): Promise<ConsentEntry[]> {
    if (environment.dataMode === 'mock') return mockConsents(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_consents');
    if (error) throw error;
    return (data ?? []) as ConsentEntry[];
  },

  async recordConsent(
    accountKey: string | null,
    purposeKey: ConsentPurposeKey,
    granted: boolean,
  ): Promise<void> {
    if (environment.dataMode === 'mock') {
      mockRecordConsent(requireAccount(accountKey), purposeKey, granted);
      return;
    }
    const { error } = await getSupabaseClient().rpc('record_my_consent', {
      p_purpose_key: purposeKey,
      p_granted: granted,
      p_source_surface: 'privacy_center',
    });
    if (error) throw error;
  },

  async clearHistory(
    accountKey: string | null,
    scope: HistoryScope,
  ): Promise<{ searchesCleared: number; viewsCleared: number }> {
    if (environment.dataMode === 'mock') return mockClearHistory(requireAccount(accountKey), scope);
    const { data, error } = await getSupabaseClient().rpc('clear_my_privacy_history', {
      p_scope: scope,
    });
    if (error) throw error;
    return data as { searchesCleared: number; viewsCleared: number };
  },

  async setDeactivated(accountKey: string | null, deactivated: boolean): Promise<boolean> {
    if (environment.dataMode === 'mock') {
      return mockSetDeactivated(requireAccount(accountKey), deactivated);
    }
    const { data, error } = await getSupabaseClient().rpc('set_my_account_deactivated', {
      p_deactivated: deactivated,
    });
    if (error) throw error;
    return Boolean((data as { deactivated?: boolean } | null)?.deactivated);
  },

  async requestDeletion(
    accountKey: string | null,
    reasonCode: string | null,
  ): Promise<DeletionRequest | null> {
    if (environment.dataMode === 'mock') {
      return mockRequestDeletion(requireAccount(accountKey), reasonCode);
    }
    const { data, error } = await getSupabaseClient().rpc('request_account_deletion', {
      p_reason_code: reasonCode,
      p_idempotency_key: null,
    });
    if (error) throw error;
    return (data ?? null) as DeletionRequest | null;
  },

  async cancelDeletion(accountKey: string | null): Promise<boolean> {
    if (environment.dataMode === 'mock') return mockCancelDeletion(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('cancel_account_deletion');
    if (error) throw error;
    return Boolean((data as { cancelled?: boolean } | null)?.cancelled);
  },

  async requestExport(accountKey: string | null): Promise<ExportRequest | null> {
    if (environment.dataMode === 'mock') return mockRequestExport(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('request_my_data_export', {
      p_idempotency_key: null,
    });
    if (error) throw error;
    return (data ?? null) as ExportRequest | null;
  },

  async exports(accountKey: string | null, limit = 10): Promise<ExportRequest[]> {
    if (environment.dataMode === 'mock') return mockExports(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_data_exports', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as ExportRequest[];
  },
};
