import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  previewableRetentionRules,
  type RetentionPreview,
  type StaffPrivacyRequest,
} from './privacy-staff-types';

/**
 * WPS-022 staff privacy repository.
 *
 * Read-only by construction. There is no method here that deletes an account,
 * anonymizes one, releases a hold from the client, or executes retention —
 * `staff_retention_dry_run` is a preview and reports that execution is
 * disabled. Hold creation and release exist as server RPCs but are not exposed
 * here: they are dual-controlled operations that belong in a runbook with a
 * named actor, not behind a button on a list screen.
 *
 * Mock returns a fixed, non-personal shape and makes no network call.
 */

const mockRequests: StaffPrivacyRequest[] = [
  {
    id: 'deletion-mock-1',
    kind: 'deletion',
    subjectRef: 'a1b2c3d4',
    status: 'cooling_off',
    requestedAt: '2026-08-06T09:00:00.000Z',
    coolingOffEndsAt: '2026-08-13T09:00:00.000Z',
    blockerCount: 0,
  },
  {
    id: 'deletion-mock-2',
    kind: 'deletion',
    subjectRef: 'e5f6a7b8',
    status: 'blocked',
    requestedAt: '2026-08-05T14:30:00.000Z',
    coolingOffEndsAt: '2026-08-12T14:30:00.000Z',
    blockerCount: 2,
  },
];

function mockPreview(ruleKey: string): RetentionPreview {
  const unreviewed = ['identity_documents', 'financial_records', 'dispute_evidence'];
  const supported = !unreviewed.includes(ruleKey);
  return {
    ruleKey,
    mode: 'dry_run',
    supported,
    candidateRows: supported ? 0 : undefined,
    legalReviewStatus: unreviewed.includes(ruleKey) ? 'pending' : 'pending',
    // Mock reports the same answer the server does: never enabled.
    executionEnabled: false,
    note: supported ? undefined : 'No automated counter exists for this rule. It is reviewed manually.',
  };
}

export const privacyStaffRepository = {
  async requests(limit = 50): Promise<StaffPrivacyRequest[]> {
    if (environment.dataMode === 'mock') return [...mockRequests];
    const { data, error } = await getSupabaseClient().rpc('staff_privacy_requests', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as StaffPrivacyRequest[];
  },

  async retentionPreview(ruleKey: string): Promise<RetentionPreview> {
    if (environment.dataMode === 'mock') return mockPreview(ruleKey);
    const { data, error } = await getSupabaseClient().rpc('staff_retention_dry_run', {
      p_rule_key: ruleKey,
    });
    if (error) throw error;
    return data as RetentionPreview;
  },

  /**
   * Preview every rule.
   *
   * Sequential rather than parallel: each call writes a run row and a staff
   * audit entry, and firing eleven of those at once makes the audit trail read
   * as a burst rather than as a review somebody performed.
   */
  async retentionOverview(): Promise<RetentionPreview[]> {
    const results: RetentionPreview[] = [];
    for (const ruleKey of previewableRetentionRules) {
      results.push(await this.retentionPreview(ruleKey));
    }
    return results;
  },
};
