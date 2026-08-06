import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  emptyVettingQueue,
  type DocumentKind,
  type DocumentReference,
  type StaffVettingQueue,
  type VettingDecision,
} from './onboarding-staff-types';

/**
 * WPS-023 staff vetting repository.
 *
 * Every method is a call onto a capability-checked RPC. Nothing here decides
 * who may review, approve, reject or open a document — those checks live in
 * Postgres, where a compromised client cannot reach them.
 *
 * Mock returns an empty queue rather than a fabricated one. A demo reviewer
 * approving a made-up worker teaches the wrong thing about what this screen
 * does, and there is no such thing as a safe fake criminal-record case.
 */

export const onboardingStaffRepository = {
  async queue(limit = 50): Promise<StaffVettingQueue> {
    if (environment.dataMode === 'mock') return emptyVettingQueue;
    const { data, error } = await getSupabaseClient().rpc('staff_worker_vetting_queue', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? emptyVettingQueue) as StaffVettingQueue;
  },

  async decide(input: {
    userId: string;
    decision: VettingDecision;
    reasonCode: string;
    safeReason: string;
    privateNote: string | null;
  }): Promise<void> {
    if (environment.dataMode === 'mock') {
      throw new Error('Vetting decisions are not available in demo mode');
    }
    const { error } = await getSupabaseClient().rpc('staff_worker_vetting_decision', {
      p_user_id: input.userId,
      p_decision: input.decision,
      p_reason_code: input.reasonCode,
      p_safe_reason: input.safeReason,
      p_private_note: input.privateNote,
    });
    if (error) throw error;
  },

  /**
   * Asks the server for a document reference. The call itself is the audited
   * event: by the time a path comes back, the access is already recorded
   * against the reviewer and the capability that permitted it.
   */
  async documentReference(userId: string, kind: DocumentKind): Promise<DocumentReference> {
    if (environment.dataMode === 'mock') {
      throw new Error('Verification documents are not available in demo mode');
    }
    const { data, error } = await getSupabaseClient().rpc('staff_worker_document_reference', {
      p_user_id: userId,
      p_document_kind: kind,
    });
    if (error) throw error;
    return data as DocumentReference;
  },

  /**
   * Mints the short-lived URL. Separate from `documentReference` so the audit
   * record exists before any URL does — if signing fails, the access was still
   * recorded, which is the correct way round.
   */
  async signedDocumentUrl(reference: DocumentReference): Promise<string> {
    if (environment.dataMode === 'mock') {
      throw new Error('Verification documents are not available in demo mode');
    }
    const { data, error } = await getSupabaseClient()
      .storage.from(reference.bucket)
      .createSignedUrl(reference.path, reference.expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  },

  async recordCertificateOutcome(input: {
    userId: string;
    status: 'clear' | 'approved' | 'correction_required' | 'manual_review' | 'rejected';
    safeReason: string;
    assessmentNote: string;
    authenticityConcern: boolean;
  }): Promise<void> {
    if (environment.dataMode === 'mock') {
      throw new Error('Certificate review is not available in demo mode');
    }
    const { error } = await getSupabaseClient().rpc('staff_record_certificate_outcome', {
      p_user_id: input.userId,
      p_status: input.status,
      p_safe_reason: input.safeReason,
      p_assessment_note: input.assessmentNote,
      p_authenticity_concern: input.authenticityConcern,
    });
    if (error) throw error;
  },

  async decideAppeal(input: {
    userId: string;
    outcome: 'upheld' | 'overturned' | 'correction_required' | 'manual_review';
    safeReason: string;
    privateNote: string;
  }): Promise<void> {
    if (environment.dataMode === 'mock') {
      throw new Error('Appeal decisions are not available in demo mode');
    }
    const { error } = await getSupabaseClient().rpc('staff_decide_vetting_appeal', {
      p_user_id: input.userId,
      p_outcome: input.outcome,
      p_safe_reason: input.safeReason,
      p_private_note: input.privateNote,
    });
    if (error) throw error;
  },
};
