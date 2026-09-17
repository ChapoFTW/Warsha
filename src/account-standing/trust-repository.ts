import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { parseAccountTrustStatus, type AccountTrustStatus } from './account-restriction';

/**
 * The person's own trust status, and their appeal.
 *
 * Mock mode has no staff and enforces nothing, so its account is in good
 * standing and has nothing to appeal. It does not pretend otherwise: a
 * restricted status is only ever the server's.
 */
const GOOD_STANDING: AccountTrustStatus = {
  trustLevel: 'good_standing',
  restriction: 'none',
  communicationRestricted: false,
  reviewRestricted: false,
  publicReason: null,
  restrictionExpiresAt: null,
  appealableActionId: null,
  appeal: null,
  canAppeal: false,
};

export const trustRepository = {
  async status(): Promise<AccountTrustStatus> {
    if (environment.dataMode === 'mock') return GOOD_STANDING;
    const { data, error } = await getSupabaseClient().rpc('get_my_trust_status');
    if (error) throw error;
    const parsed = parseAccountTrustStatus(data);
    if (!parsed) throw new Error('Unreadable trust status');
    return parsed;
  },

  async appeal(actionId: string, statement: string): Promise<void> {
    if (environment.dataMode === 'mock') throw new Error('Nothing to appeal in Mock mode');
    const { error } = await getSupabaseClient().rpc('submit_trust_appeal', {
      p_enforcement_action_id: actionId,
      p_statement: statement.trim(),
      p_idempotency_key: `appeal:${actionId}`,
    });
    if (error) throw error;
  },
};
