import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  mockBookingBenefit,
  mockClaimReferralCode,
  mockRedeemBookingBenefit,
  mockReferralCode,
  mockReferralSummary,
  mockStaffCampaigns,
  mockStaffReferralPrograms,
} from './mock-growth-state';
import {
  normalizeReferralCode,
  type BookingBenefit,
  type GrowthRole,
  type ReferralClaimResult,
  type ReferralCodeState,
  type ReferralSummary,
  type StaffCampaign,
  type StaffReferralProgram,
} from './growth-types';

/**
 * WPS-021 growth repository.
 *
 * Mock and Supabase are fully isolated: Mock performs no network call, never
 * falls back to Supabase, and a Supabase failure never writes into Mock. There
 * is no external marketing, attribution, or analytics provider in either mode.
 *
 * Every method here is a thin call onto a server RPC. None of the rules —
 * qualification, reward issuance, eligibility, budget, limits — is evaluated on
 * the client, because a rule evaluated on the client is a rule an attacker
 * controls. In particular there is no client path that grants a reward: the
 * server does that on its own when a booking completes.
 */

function requireAccount(accountKey: string | null): string {
  if (!accountKey) throw new Error('An account is required');
  return accountKey;
}

export const growthRepository = {
  async getReferralCode(accountKey: string | null, role: GrowthRole): Promise<ReferralCodeState> {
    if (environment.dataMode === 'mock') return mockReferralCode(requireAccount(accountKey), role);
    const { data, error } = await getSupabaseClient().rpc('get_my_referral_code');
    if (error) throw error;
    return data as ReferralCodeState;
  },

  async claimReferralCode(accountKey: string | null, code: string): Promise<ReferralClaimResult> {
    if (environment.dataMode === 'mock') {
      return mockClaimReferralCode(requireAccount(accountKey), code);
    }
    const { data, error } = await getSupabaseClient().rpc('claim_referral_code', {
      p_code: normalizeReferralCode(code),
    });
    if (error) throw error;
    return data as ReferralClaimResult;
  },

  async getReferralSummary(accountKey: string | null, limit = 20): Promise<ReferralSummary> {
    if (environment.dataMode === 'mock') return mockReferralSummary(requireAccount(accountKey));
    const { data, error } = await getSupabaseClient().rpc('get_my_referral_summary', {
      p_limit: limit,
    });
    if (error) throw error;
    return data as ReferralSummary;
  },

  /** At most one benefit: a referral reward the customer earned, or a campaign. */
  async getBookingBenefit(
    accountKey: string | null,
    bookingId: string,
    baseMinor: number,
    role: GrowthRole,
  ): Promise<BookingBenefit> {
    if (environment.dataMode === 'mock') {
      return mockBookingBenefit(requireAccount(accountKey), bookingId, baseMinor, role);
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_booking_benefit', {
      p_booking_id: bookingId,
    });
    if (error) throw error;
    return data as BookingBenefit;
  },

  async redeemBookingBenefit(
    accountKey: string | null,
    bookingId: string,
    baseMinor: number,
    role: GrowthRole,
  ): Promise<{ redeemed: boolean; source: string; discountMinor: string }> {
    if (environment.dataMode === 'mock') {
      return mockRedeemBookingBenefit(requireAccount(accountKey), bookingId, baseMinor, role);
    }
    const { data, error } = await getSupabaseClient().rpc('redeem_booking_benefit', {
      p_booking_id: bookingId,
    });
    if (error) throw error;
    return data as { redeemed: boolean; source: string; discountMinor: string };
  },

  // -------------------------------------------------------------------------
  // Staff. Programs and campaigns are separate surfaces with separate
  // capabilities, so the two systems keep independent audit trails.
  // -------------------------------------------------------------------------

  async getStaffCampaigns(limit = 50): Promise<StaffCampaign[]> {
    if (environment.dataMode === 'mock') return mockStaffCampaigns();
    const { data, error } = await getSupabaseClient().rpc('get_staff_campaigns', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as StaffCampaign[];
  },

  async getStaffReferralPrograms(limit = 50): Promise<StaffReferralProgram[]> {
    if (environment.dataMode === 'mock') return mockStaffReferralPrograms();
    const { data, error } = await getSupabaseClient().rpc('get_staff_referral_programs', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as StaffReferralProgram[];
  },

};
