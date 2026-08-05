import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { logDataError } from '@/src/data/data-errors';
import { useProviderFoundation } from '@/src/providers/provider-context';

import { growthRepository } from './growth-repository';
import {
  emptyReferralSummary,
  type GrowthRole,
  type ReferralClaimResult,
  type ReferralCodeState,
  type ReferralSummary,
} from './growth-types';

/**
 * Referral state only. Booking benefits are read per booking by the banner,
 * because a benefit depends on the booking's value and the context has no
 * booking. Keeping them apart also keeps the referral system and the campaign
 * system from sharing state they must not share.
 */

type GrowthValue = {
  ready: boolean;
  /** Null until an account exists. Every read below is scoped to it. */
  accountKey: string | null;
  role: GrowthRole;
  referral: ReferralCodeState;
  summary: ReferralSummary;
  claimCode: (code: string) => Promise<ReferralClaimResult>;
  reload: () => void;
};

const GrowthContext = createContext<GrowthValue | null>(null);

/**
 * Account-isolated growth state.
 *
 * The generation guard is the WPS-019 pattern that WPS-020 also uses: a response
 * that arrives after the account changed is discarded, and nothing renders for
 * an account other than the loaded one. A referral code and a reward history are
 * among the most identifying data in the app, so a single frame of the previous
 * account's referral screen would be a real leak, not a cosmetic one.
 */
export function GrowthProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  const { profile } = useProviderFoundation();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;
  // Advisory only. The SERVER decides the role through private.growth_actor_role;
  // this value exists so Mock can answer the same question locally.
  const role: GrowthRole = profile ? 'worker' : 'customer';

  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [referral, setReferral] = useState<ReferralCodeState>({ available: false });
  const [summary, setSummary] = useState<ReferralSummary>(emptyReferralSummary);

  const generation = useRef(0);
  const accountRef = useRef<string | null>(accountKey);
  accountRef.current = accountKey;

  const load = useCallback(async () => {
    const current = ++generation.current;
    const key = accountRef.current;

    if (!key) {
      setReferral({ available: false });
      setSummary(emptyReferralSummary);
      setLoadedAccount(null);
      setReady(true);
      return;
    }

    setReady(false);
    try {
      const [code, referralSummary] = await Promise.all([
        growthRepository.getReferralCode(key, role),
        growthRepository.getReferralSummary(key),
      ]);
      // Discard anything that arrived after the account changed.
      if (current !== generation.current || accountRef.current !== key) return;
      setReferral(code);
      setSummary(referralSummary);
      setLoadedAccount(key);
    } catch (error) {
      if (current !== generation.current || accountRef.current !== key) return;
      logDataError('growth.load', error);
      setReferral({ available: false });
      setSummary(emptyReferralSummary);
      setLoadedAccount(key);
    } finally {
      if (current === generation.current) setReady(true);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [accountKey, load]);

  const claimCode = useCallback(
    async (code: string): Promise<ReferralClaimResult> => {
      const key = accountRef.current;
      if (!key) return { accepted: false, reason: 'unavailable' };
      try {
        const result = await growthRepository.claimReferralCode(key, code);
        if (result.accepted) void load();
        return result;
      } catch (error) {
        logDataError('growth.claim', error);
        return { accepted: false, reason: 'unavailable' };
      }
    },
    [load],
  );

  const value = useMemo<GrowthValue>(
    () => ({
      ready,
      accountKey,
      role,
      // Never render another account's data, even for one frame.
      referral: loadedAccount === accountKey ? referral : { available: false },
      summary: loadedAccount === accountKey ? summary : emptyReferralSummary,
      claimCode,
      reload: () => void load(),
    }),
    [ready, accountKey, role, loadedAccount, referral, summary, claimCode, load],
  );

  return <GrowthContext.Provider value={value}>{children}</GrowthContext.Provider>;
}

export function useGrowth(): GrowthValue {
  const value = useContext(GrowthContext);
  if (!value) throw new Error('useGrowth must be used inside GrowthProvider');
  return value;
}
