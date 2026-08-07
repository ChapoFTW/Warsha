import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

/**
 * WPS-024 external provider registry and health, for staff.
 *
 * Read-only. `staff_sync_provider_status` exists and is capability-gated, but
 * no method here calls it: promoting a subprocessor from "approved" to "in use"
 * is a published-disclosure change, and it belongs in a deployment step where
 * somebody has read what it changes, not behind a button on a phone.
 *
 * Nothing on this surface is a credential. `credentialSecretName` is the NAME
 * of the secret to rotate; there is no server function that returns a value,
 * so there is no client method that could.
 */

export type ProviderRegistryEntry = {
  providerKey: string;
  displayName: string;
  purpose: string;
  introducedByWps: string;
  capabilityRole: string;
  fillsRole: boolean;
  mapRendererKey: string | null;
  status: string;
  enabled: boolean;
  executionContext: string;
  environments: string[];
  featureFlag: string | null;
  killSwitch: string | null;
  dataCategories: string[];
  privacyPolicyRef: string;
  subprocessorKey: string | null;
  processingActivityKey: string | null;
  securityOwner: string;
  operationalOwner: string;
  dateIntroduced: string;
  providerVersion: string;
  lastReviewDate: string;
  credentialSecretName: string | null;
};

export type ProviderHealthEntry = {
  providerKey: string;
  displayName: string;
  capabilityRole: string;
  status: string;
  enabled: boolean;
  providerVersion: string | null;
  lastOutcome: string | null;
  lastObservedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRetries: number;
  /** Null means nothing was observed in the window. Not the same as healthy. */
  availability24h: number | null;
  availability7d: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  samples24h: number;
};

export const providerStaffRepository = {
  async registry(): Promise<ProviderRegistryEntry[]> {
    // Mock has no registry and does not invent one. An empty list reads as
    // "nothing to show"; a fabricated one would read as a live integration.
    if (environment.dataMode === 'mock') return [];
    const { data, error } = await getSupabaseClient().rpc('staff_provider_registry');
    if (error) throw error;
    return (data ?? []) as ProviderRegistryEntry[];
  },

  async health(): Promise<ProviderHealthEntry[]> {
    if (environment.dataMode === 'mock') return [];
    const { data, error } = await getSupabaseClient().rpc('staff_provider_health');
    if (error) throw error;
    return (data ?? []) as ProviderHealthEntry[];
  },
};
