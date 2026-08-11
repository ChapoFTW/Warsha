'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  emptyOnboardingState,
  isProductMode,
  PREFERRED_MODE_KEY,
  resolveAccount,
  type AccountResolution,
  type OnboardingState,
  type ProductMode,
} from '@/lib/account';
import { supabase } from '@/lib/supabase';

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
  chooseMode: (mode: ProductMode) => void;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function readPreferredMode(): ProductMode | null {
  try {
    const stored = window.localStorage.getItem(PREFERRED_MODE_KEY);
    return isProductMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [authSettled, setAuthSettled] = useState(false);
  const [preferredMode, setPreferredMode] = useState<ProductMode | null>(null);

  const loadAccountState = useCallback(async (active: () => boolean) => {
    const { data, error } = await supabase().rpc('get_my_onboarding_state');
    if (!active()) return;
    if (error) {
      // A readable session with unreadable account state is not a product the
      // client may guess at. Treat it as unresolved rather than assume
      // customer.
      setState(null);
      return;
    }
    setState({ ...emptyOnboardingState, ...(data as Partial<OnboardingState>) });
  }, []);

  useEffect(() => {
    let active = true;
    const isActive = () => active;
    setPreferredMode(readPreferredMode());

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
        setSession(verified);
        if (verified) await loadAccountState(isActive);
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setAuthSettled(true);
      }
    })();

    const { data: subscription } = supabase().auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setState(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void loadAccountState(isActive);
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
      window.localStorage.setItem(PREFERRED_MODE_KEY, mode);
    } catch {
      // Choosing still works; it simply will not be remembered next visit.
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadAccountState(() => true);
  }, [loadAccountState]);

  const value = useMemo<SessionValue>(() => ({
    resolution: resolveAccount({
      authSettled,
      signedIn: session !== null,
      state,
      preferredMode,
    }),
    session,
    preferredMode,
    chooseMode,
    refresh,
  }), [authSettled, session, state, preferredMode, chooseMode, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession requires SessionProvider');
  return value;
}
