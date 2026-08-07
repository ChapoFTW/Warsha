import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

/**
 * WPS-024 staff governance repository.
 *
 * Read-only by design. `staff_publish_legal_version` exists, is
 * capability-checked, requires a second person and is covered by pgTAP — but no
 * method here calls it. Publishing a legal version is not something to do from
 * a phone screen between two other tasks: it needs the corpus edited, the hash
 * recomputed, the change class argued about and a migration reviewed. A button
 * that skipped all of that would produce a version whose text nobody could find.
 */

export type LegalGovernanceDocument = {
  documentKey: string;
  category: string;
  audience: string;
  requiresAcceptance: boolean;
  version: string;
  changeClass: string;
  effectiveAt: string;
  versionCount: number;
  accepted: number;
  declined: number;
};

export type LegalGovernanceOverview = {
  documents: LegalGovernanceDocument[];
  subprocessors: {
    key: string;
    name: string;
    status: string;
    trainingProhibited: boolean;
    agreementStatus: string;
  }[];
  processingActivities: { key: string; name: string; reviewStatus: string }[];
  aiUses: {
    key: string;
    name: string;
    status: string;
    coversIdentityData: boolean;
    permittedForTraining: boolean;
  }[];
  configuration: {
    legalCentreEnabled: boolean;
    reconsentEnforced: boolean;
    graceDays: number;
  };
};

export const emptyGovernanceOverview: LegalGovernanceOverview = {
  documents: [],
  subprocessors: [],
  processingActivities: [],
  aiUses: [],
  configuration: { legalCentreEnabled: false, reconsentEnforced: false, graceDays: 0 },
};

export const legalStaffRepository = {
  async overview(): Promise<LegalGovernanceOverview> {
    // Mock has no staff governance data and does not invent any. An empty
    // overview reads as "nothing to show"; a fabricated one would read as a
    // compliance position that no register supports.
    if (environment.dataMode === 'mock') return emptyGovernanceOverview;
    const { data, error } = await getSupabaseClient().rpc('staff_legal_governance_overview');
    if (error) throw error;
    return (data ?? emptyGovernanceOverview) as LegalGovernanceOverview;
  },
};

/**
 * A single vetting case, for the decision surface.
 *
 * The RPC records the access before it returns anything, so calling this IS
 * the audited event. There is no way to look at a case without that being
 * recorded against the reviewer.
 */
export const vettingCaseRepository = {
  async detail(subjectRef: string): Promise<unknown> {
    if (environment.dataMode === 'mock') {
      // Mock has no real cases and does not invent one. A fabricated case on a
      // decision screen is a way to practise recording a decision about
      // somebody who does not exist.
      throw new Error('Vetting cases are not available in demo mode');
    }
    const { data, error } = await getSupabaseClient().rpc('staff_worker_vetting_detail', {
      p_subject_ref: subjectRef,
    });
    if (error) throw error;
    return data;
  },
};
