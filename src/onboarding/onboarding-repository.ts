import { File } from 'expo-file-system';

import { environment } from '@/src/config/environment';
import { customerSetupRecoveryEligible } from '@/src/auth/signup-machine';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  CRIMINAL_RECORD_RPC,
  CriminalRecordInputError,
  buildCriminalRecordPayload,
  criminalRecordStoragePath,
  rejectionsFor,
  type CriminalRecordInput,
} from './criminal-record-submission';
import {
  mockAcceptAgreements,
  mockConfirmAddress,
  mockConfirmIdentityFields,
  mockIdentityCandidates,
  mockOnboardingState,
  mockRecordCapture,
  mockSelectRole,
  mockSubmitAppeal,
  mockSubmitCriminalRecord,
  mockSubmitIdentity,
} from './mock-onboarding-state';
import {
  emptyOnboardingState,
  type AccountRoleChoice,
  type IdentityCandidate,
  type OnboardingState,
  type PinSource,
} from './onboarding-types';

/**
 * WPS-023 onboarding repository.
 *
 * One method per server RPC, with a Mock branch on each. Mock never calls
 * Supabase and Supabase never falls back to Mock.
 *
 * Verbs that do not exist in this file, because they do not exist for any
 * client: approve, activate, reject, or write a worker state. Those are staff
 * capabilities and they live in `onboarding-staff-repository`, behind server
 * capability checks that this file could not satisfy even if it tried.
 */

function requireAccount(accountKey: string | null): string {
  if (!accountKey) throw new Error('An account is required');
  return accountKey;
}

export const onboardingRepository = {
  async state(accountKey: string | null): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') return mockOnboardingState(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_onboarding_state');
    if (error) throw error;
    return { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
  },

  async selectRole(accountKey: string | null, role: AccountRoleChoice): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') return mockSelectRole(requireAccount(accountKey), role);
    const expectedAccount = requireAccount(accountKey);
    const client = getSupabaseClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (authData.user?.id !== expectedAccount) throw new Error('The active account changed.');
    const { data, error } = await client.rpc('select_my_account_role', { p_role: role });
    if (error) throw error;
    return { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
  },

  async customerRecoveryEligible(accountKey: string | null): Promise<boolean> {
    if (environment.dataMode === 'mock') return true;
    const expectedAccount = requireAccount(accountKey);
    const client = getSupabaseClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (authData.user?.id !== expectedAccount) throw new Error('The active account changed.');

    const [rolesResult, profileResult] = await Promise.all([
      client.from('user_roles').select('role').eq('user_id', expectedAccount),
      client.from('customer_profiles').select('id').eq('id', expectedAccount).maybeSingle(),
    ]);
    if (rolesResult.error) throw rolesResult.error;
    if (profileResult.error) throw profileResult.error;

    return customerSetupRecoveryEligible({
      roles: (rolesResult.data ?? []).map((row) => String(row.role)),
      hasCustomerProfile: Boolean(profileResult.data),
    });
  },

  async resumeCustomerSetup(accountKey: string | null): Promise<OnboardingState> {
    const expectedAccount = requireAccount(accountKey);
    if (!(await this.customerRecoveryEligible(expectedAccount))) {
      throw new Error('This account is not eligible for customer setup recovery.');
    }
    return this.selectRole(expectedAccount, 'customer');
  },

  async confirmAddress(
    accountKey: string | null,
    input: {
      addressId: string;
      latitude: number;
      longitude: number;
      pinSource: PinSource;
      building?: string | null;
      floor?: string | null;
      apartment?: string | null;
      landmark?: string | null;
      serviceNotes?: string | null;
    },
  ): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') {
      return mockConfirmAddress(
        requireAccount(accountKey), input.latitude, input.longitude, input.pinSource,
      );
    }
    const client = getSupabaseClient();
    const { error } = await client.rpc('confirm_my_service_address', {
      p_address_id: input.addressId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_pin_source: input.pinSource,
      p_building: input.building ?? null,
      p_floor: input.floor ?? null,
      p_apartment: input.apartment ?? null,
      p_landmark: input.landmark ?? null,
      p_service_notes: input.serviceNotes ?? null,
    });
    if (error) throw error;
    return this.state(accountKey);
  },

  async acceptAgreements(
    accountKey: string | null,
    workerAgreement: boolean,
    documentProcessing: boolean,
  ): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') {
      return mockAcceptAgreements(requireAccount(accountKey), workerAgreement, documentProcessing);
    }
    const { data, error } = await getSupabaseClient().rpc('accept_my_worker_agreements', {
      p_worker_agreement: workerAgreement,
      p_document_processing: documentProcessing,
    });
    if (error) throw error;
    return { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
  },

  async identityCandidates(accountKey: string | null): Promise<IdentityCandidate[]> {
    if (environment.dataMode === 'mock') return mockIdentityCandidates(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_identity_candidates');
    if (error) throw error;
    return (data ?? []) as IdentityCandidate[];
  },

  async recordCapture(
    accountKey: string | null,
    input: {
      documentId: string;
      captureSource: 'camera' | 'library' | 'file';
      contentHash: string | null;
      qualityFlags: string[];
      pageSide: 'front' | 'back';
    },
  ): Promise<void> {
    if (environment.dataMode === 'mock') {
      mockRecordCapture(requireAccount(accountKey), input.pageSide);
      return;
    }
    const { error } = await getSupabaseClient().rpc('record_my_identity_capture', {
      p_document_id: input.documentId,
      p_capture_source: input.captureSource,
      p_content_hash: input.contentHash,
      p_quality_flags: input.qualityFlags,
      p_page_side: input.pageSide,
    });
    if (error) throw error;
  },

  /** Returns the last four digits only. The full number never comes back. */
  async confirmIdentityFields(
    accountKey: string | null,
    input: { legalName: string; nationalId: string; dateOfBirth: string; expiryDate: string | null },
  ): Promise<string> {
    if (environment.dataMode === 'mock') {
      return mockConfirmIdentityFields(requireAccount(accountKey), input.nationalId);
    }
    const { data, error } = await getSupabaseClient().rpc('confirm_my_identity_fields', {
      p_legal_name: input.legalName,
      p_national_id: input.nationalId,
      p_date_of_birth: input.dateOfBirth,
      p_id_expiry_date: input.expiryDate,
    });
    if (error) throw error;
    return String((data as { last4?: string } | null)?.last4 ?? '');
  },

  async submitIdentity(accountKey: string | null): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') return mockSubmitIdentity(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('submit_my_identity_for_review');
    if (error) throw error;
    return { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
  },

  async submitCriminalRecord(
    accountKey: string | null,
    input: CriminalRecordInput,
  ): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') {
      return mockSubmitCriminalRecord(requireAccount(accountKey), {
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        issueDate: input.issueDate,
        declaredName: input.declaredName,
      });
    }
    const client = getSupabaseClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error('Authentication required');
    const file = new File(input.uri);
    if (!file.exists || !file.size || file.size !== input.fileSizeBytes) {
      throw new Error('Invalid certificate file');
    }

    // The path is built by the same module that builds the payload, because the
    // server checks that its first segment is the caller's own id and so does
    // the storage policy. Neither should be satisfied by a string assembled here.
    const path = criminalRecordStoragePath(auth.user.id, input.mimeType);
    const submission = {
      userId: auth.user.id,
      storagePath: path,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      contentHash: input.contentHash,
      issueDate: input.issueDate,
      documentReference: input.documentReference ?? null,
      declaredName: input.declaredName,
    };

    // Checked before the upload, not after it. A request the server would refuse
    // must not leave an object behind in the most sensitive bucket Warsha has.
    const rejections = rejectionsFor(submission);
    if (rejections.length) throw new CriminalRecordInputError(rejections);

    const { error: uploadError } = await client.storage
      .from('worker-criminal-records')
      .upload(path, await file.arrayBuffer(), { contentType: input.mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const { error } = await client.rpc(
      CRIMINAL_RECORD_RPC, buildCriminalRecordPayload(submission),
    );
    if (error) {
      // The row was never written, so the object is unreferenced. Removing it
      // keeps a failed attempt from leaving a criminal record in storage that
      // nothing points at and no retention rule covers.
      await client.storage.from('worker-criminal-records').remove([path]);
      throw error;
    }
    return this.state(accountKey);
  },

  async submitAppeal(accountKey: string | null, statement: string): Promise<OnboardingState> {
    if (environment.dataMode === 'mock') {
      return mockSubmitAppeal(requireAccount(accountKey), statement);
    }
    const { data, error } = await getSupabaseClient().rpc('submit_my_vetting_appeal', {
      p_statement: statement,
    });
    if (error) throw error;
    return { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
  },
};
