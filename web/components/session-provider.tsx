'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  emptyOnboardingState,
  isProductMode,
  PREFERRED_MODE_KEY,
  resolveAccount,
  type AccountResolution,
  type OnboardingState,
  type ProductMode,
} from '@/lib/account';
import { clearAllDrafts } from '@/lib/draft-store';
import { supabase } from '@/lib/supabase';
import { customerSetupRecoveryEligible } from '../../src/auth/signup-machine.ts';

/**
 * The web's session and account authority.
 *
 * This is the browser equivalent of the mobile startup gate, and it exists for
 * the same reason: a client that renders before it knows who is signed in
 * shows somebody a product they may not be entitled to, for a frame or for a
 * second on a slow connection. Nothing operational mounts until the resolution
 * below is `resolved`.
 *
 * Two decisions matter here.
 *
 * **A stored session is not a valid session.** `getSession()` reads local
 * storage; it proves a token was saved, not that it still works. So the token
 * is checked against Auth with `getUser()` before any account surface is
 * allowed to mount, and a revoked or expired one resolves to signed-out
 * rather than to a shell that fails every request.
 *
 * **Account state comes from the server.** `get_my_onboarding_state` is the
 * same RPC the mobile client calls, and `routeFor` is the same pure function
 * that turns it into a destination. The web does not re-derive who somebody is.
 */

type SessionValue = {
  resolution: AccountResolution;
  session: Session | null;
  preferredMode: ProductMode | null;
  customerRecoveryEligible: boolean;
  customerRecoveryBusy: boolean;
  customerRecoveryError: boolean;
  chooseMode: (mode: ProductMode) => void;
  resumeCustomerSetup: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function readPreferredMode(userId: string): ProductMode | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(PREFERRED_MODE_KEY) ?? 'null') as {
      userId?: unknown;
      mode?: unknown;
    } | null;
    return stored?.userId === userId && isProductMode(stored.mode) ? stored.mode : null;
  } catch {
    return null;
  }
}

async function readCustomerRecoveryEligibility(userId: string): Promise<boolean> {
  const client = supabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (authData.user?.id !== userId) throw new Error('The active account changed.');

  const [rolesResult, profileResult] = await Promise.all([
    client.from('user_roles').select('role').eq('user_id', userId),
    client.from('customer_profiles').select('id').eq('id', userId).maybeSingle(),
  ]);
  if (rolesResult.error) throw rolesResult.error;
  if (profileResult.error) throw profileResult.error;

  return customerSetupRecoveryEligible({
    roles: (rolesResult.data ?? []).map((row) => String(row.role)),
    hasCustomerProfile: Boolean(profileResult.data),
  });
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [accountStateError, setAccountStateError] = useState(false);
  const [authSettled, setAuthSettled] = useState(false);
  const [preferredMode, setPreferredMode] = useState<ProductMode | null>(null);
  const [customerRecoveryEligible, setCustomerRecoveryEligible] = useState(false);
  const [customerRecoveryBusy, setCustomerRecoveryBusy] = useState(false);
  const [customerRecoveryError, setCustomerRecoveryError] = useState(false);
  const accountGeneration = useRef(0);
  const customerRecoveryInFlight = useRef(false);
  /** `undefined` until the first resolution, so first mount is not a switch. */
  const identityRef = useRef<string | undefined>(undefined);

  const loadAccountState = useCallback(async (
    generation: number,
    active: () => boolean,
    userId: string,
  ) => {
    const { data, error } = await supabase().rpc('get_my_onboarding_state');
    if (!active() || accountGeneration.current !== generation) return;
    if (error) {
      // A readable session with unreadable account state is not a product the
      // client may guess at. Resolve to an explicit recovery state rather
      // than assume customer or leave the loading mark spinning forever.
      setState(null);
      setAccountStateError(true);
      setCustomerRecoveryEligible(false);
      return;
    }
    const next = { ...emptyOnboardingState, ...(data as Partial<OnboardingState>) };
    let nextCustomerRecoveryEligible = false;
    if (!next.roleSelected) {
      try {
        nextCustomerRecoveryEligible = await readCustomerRecoveryEligibility(userId);
      } catch {
        // Eligibility is an additional proof for one legacy recovery action.
        // If its RLS reads fail, hide that action without turning customer into
        // a guessed role or obscuring the authoritative onboarding response.
        nextCustomerRecoveryEligible = false;
      }
    }
    if (!active() || accountGeneration.current !== generation) return;
    setState(next);
    setAccountStateError(false);
    setCustomerRecoveryEligible(nextCustomerRecoveryEligible);
    setCustomerRecoveryError(false);
  }, []);

  useEffect(() => {
    let active = true;
    const isActive = () => active;
    void (async () => {
      const client = supabase();
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        let verified = data.session;
        if (verified) {
          const { data: user, error: userError } = await client.auth.getUser();
          if (userError || !user.user) {
            await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
            verified = null;
          }
        }

        if (!active) return;
        identityRef.current = verified?.user.id;
        setSession(verified);
        setAccountStateError(false);
        setCustomerRecoveryEligible(false);
        setCustomerRecoveryError(false);
        setPreferredMode(verified ? readPreferredMode(verified.user.id) : null);
        const generation = ++accountGeneration.current;
        if (verified) await loadAccountState(generation, isActive, verified.user.id);
      } catch {
        if (active) {
          setSession(null);
          setAccountStateError(false);
          setCustomerRecoveryEligible(false);
          setCustomerRecoveryError(false);
        }
      } finally {
        if (active) setAuthSettled(true);
      }
    })();

    const { data: subscription } = supabase().auth.onAuthStateChange((event, next) => {
      if (!active) return;
      const generation = ++accountGeneration.current;
      customerRecoveryInFlight.current = false;
      setCustomerRecoveryBusy(false);
      // A change of identity ends every draft on this device. `useDraft`
      // already refuses an envelope belonging to somebody else, so this is the
      // second of two independent guards rather than the only one — one
      // account seeing another's half-written address is not a defect worth
      // relying on a single check for.
      if (next?.user.id !== identityRef.current) {
        if (identityRef.current !== undefined) clearAllDrafts();
        identityRef.current = next?.user.id;
      }
      setSession(next);
      setCustomerRecoveryEligible(false);
      setCustomerRecoveryError(false);
      if (!next) {
        setState(null);
        setAccountStateError(false);
        setPreferredMode(null);
        try { window.sessionStorage.removeItem(PREFERRED_MODE_KEY); } catch { /* optional storage */ }
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Never combine a new identity with the previous identity's product
        // authority while the replacement account is hydrating.
        setState(null);
        setAccountStateError(false);
        setPreferredMode(readPreferredMode(next.user.id));
        void loadAccountState(generation, isActive, next.user.id);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadAccountState]);

  const chooseMode = useCallback((mode: ProductMode) => {
    setPreferredMode(mode);
    try {
      if (session?.user.id) {
        window.sessionStorage.setItem(PREFERRED_MODE_KEY, JSON.stringify({ userId: session.user.id, mode }));
      }
    } catch {
      // Choosing still works; it simply will not survive this page lifecycle.
    }
  }, [session?.user.id]);

  const resumeCustomerSetup = useCallback(async (): Promise<boolean> => {
    const userId = session?.user.id;
    if (!userId || !customerRecoveryEligible || customerRecoveryInFlight.current) return false;

    customerRecoveryInFlight.current = true;
    setCustomerRecoveryBusy(true);
    setCustomerRecoveryError(false);
    const generation = accountGeneration.current;
    try {
      // Re-read the RLS-scoped evidence immediately before mutation. The UI's
      // earlier proof can never authorize a different or newly changed account.
      if (!(await readCustomerRecoveryEligibility(userId))) {
        throw new Error('This account is not eligible for customer setup recovery.');
      }
      const { data, error } = await supabase().rpc('select_my_account_role', {
        p_role: 'customer',
      });
      if (error) throw error;
      if (accountGeneration.current !== generation) return false;

      setState({ ...emptyOnboardingState, ...(data as Partial<OnboardingState>) });
      setAccountStateError(false);
      setCustomerRecoveryEligible(false);
      return true;
    } catch {
      if (accountGeneration.current === generation) setCustomerRecoveryError(true);
      return false;
    } finally {
      customerRecoveryInFlight.current = false;
      if (accountGeneration.current === generation) setCustomerRecoveryBusy(false);
    }
  }, [customerRecoveryEligible, session?.user.id]);

  const refresh = useCallback(async () => {
    if (!session?.user.id) return;
    const generation = ++accountGeneration.current;
    setAccountStateError(false);
    await loadAccountState(generation, () => true, session.user.id);
  }, [loadAccountState, session?.user.id]);

  const value = useMemo<SessionValue>(() => ({
    resolution: resolveAccount({
      authSettled,
      signedIn: session !== null,
      state,
      accountStateError,
      preferredMode,
    }),
    session,
    preferredMode,
    customerRecoveryEligible,
    customerRecoveryBusy,
    customerRecoveryError,
    chooseMode,
    resumeCustomerSetup,
    refresh,
  }), [accountStateError, authSettled, session, state, preferredMode,
    customerRecoveryEligible, customerRecoveryBusy, customerRecoveryError,
    chooseMode, resumeCustomerSetup, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession requires SessionProvider');
  return value;
}
