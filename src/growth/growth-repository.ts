import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  mockClaimReferralCode,
  mockEligiblePromotion,
  mockRedeemPromotion,
  mockReferralCode,
  mockReferralSummary,
  mockStaffCampaigns,
} from './mock-growth-state';
import {
  normalizeReferralCode,
  type EligiblePromotion,
  type GrowthRole,
  type ReferralClaimResult,
  type ReferralCodeState,
  type ReferralSummary,
  type StaffCampaign,
} from './growth-types';

/**
 * WPS-021 growth repository.
 *
 * Mock and Supabase are fully isolated: Mock performs no network call, never
 * falls back to Supabase, and a Supabase failure never writes into Mock. There
 * is no external marketing, attribution, or analytics provider in either mode.
 *
 * Every method here is a thin call onto a server RPC. None of the rules —
 * eligibility, budget, limits, qualification — is evaluated on the client,
 * because a rule evaluated on the client is a rule an attacker controls.
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

  async getEligiblePromotion(
    accountKey: string | null,
    bookingId: string,
    baseMinor: number,
    role: GrowthRole,
  ): Promise<EligiblePromotion> {
    if (environment.dataMode === 'mock') {
      return mockEligiblePromotion(requireAccount(accountKey), bookingId, baseMinor, role);
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_eligible_promotion', {
      p_booking_id: bookingId,
    });
    if (error) throw error;
    return data as EligiblePromotion;
  },

  async redeemPromotion(
    accountKey: string | null,
    bookingId: string,
    campaignKey: string,
    baseMinor: number,
    role: GrowthRole,
  ): Promise<{ redeemed: boolean; discountMinor: string }> {
    if (environment.dataMode === 'mock') {
      return mockRedeemPromotion(requireAccount(accountKey), bookingId, campaignKey, baseMinor, role);
    }
    const { data, error } = await getSupabaseClient().rpc('redeem_promotion', {
      p_booking_id: bookingId,
      p_campaign_key: campaignKey,
    });
    if (error) throw error;
    return data as { redeemed: boolean; discountMinor: string };
  },

  async getStaffCampaigns(limit = 50): Promise<StaffCampaign[]> {
    if (environment.dataMode === 'mock') return mockStaffCampaigns();
    const { data, error } = await getSupabaseClient().rpc('get_staff_campaigns', {
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as StaffCampaign[];
  },

  async setCampaignState(campaignId: string, state: string, reason: string): Promise<void> {
    if (environment.dataMode === 'mock') return;
    const { error } = await getSupabaseClient().rpc('staff_set_campaign_state', {
      p_campaign_id: campaignId,
      p_state: state,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async activateCampaign(campaignId: string, note: string): Promise<void> {
    if (environment.dataMode === 'mock') return;
    const { error } = await getSupabaseClient().rpc('staff_activate_campaign', {
      p_campaign_id: campaignId,
      p_note: note,
    });
    if (error) throw error;
  },
};
