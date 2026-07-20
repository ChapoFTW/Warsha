import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { sanitizeAuthError } from './auth-errors';

export type AccountRole = 'customer' | 'provider';
type RecoveryStatus = 'checking' | 'idle' | 'processing' | 'ready' | 'invalid';
type Value = {
  mode: 'mock' | 'supabase';
  session: Session | null;
  user: User | null;
  loading: boolean;
  recoveryStatus: RecoveryStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, role?: AccountRole, language?: 'en' | 'ar') => Promise<{ needsEmailConfirmation: boolean }>;
  requestPasswordReset: (email: string) => Promise<void>;
  finishPasswordRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
};

type RecoveryParameters = {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
};

const Context = createContext<Value | null>(null);

function readRecoveryParameters(url: string): RecoveryParameters {
  const queryStart = url.indexOf('?');
  const fragmentStart = url.indexOf('#');
  const queryEnd = fragmentStart >= 0 ? fragmentStart : url.length;
  const query = queryStart >= 0 ? url.slice(queryStart + 1, queryEnd) : '';
  const fragment = fragmentStart >= 0 ? url.slice(fragmentStart + 1) : '';
  const parameters = new URLSearchParams(query);
  const fragmentParameters = new URLSearchParams(fragment);
  fragmentParameters.forEach((value, key) => parameters.set(key, value));
  return {
    accessToken: parameters.get('access_token') ?? undefined,
    refreshToken: parameters.get('refresh_token') ?? undefined,
    type: parameters.get('type') ?? undefined,
    error: parameters.get('error') ?? parameters.get('error_code') ?? parameters.get('error_description') ?? undefined,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(environment.dataMode === 'supabase');
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>(environment.dataMode === 'supabase' ? 'checking' : 'idle');
  const callbackHandled = useRef(false);

  useEffect(() => {
    let active = true;
    if (environment.dataMode === 'mock') {
      setLoading(false);
      setRecoveryStatus('idle');
      return () => { active = false; };
    }

    const client = getSupabaseClient();
    const openResetScreen = () => {
      if (active) router.replace('/reset-password');
    };
    const handleRecoveryUrl = async (url: string | null) => {
      if (!active || !url) return;
      const parameters = readRecoveryParameters(url);
      const targetsResetScreen = url.split(/[?#]/, 1)[0].toLowerCase().includes('reset-password');
      const isRecovery = parameters.type === 'recovery' || targetsResetScreen && Boolean(parameters.accessToken || parameters.refreshToken || parameters.error);
      if (!isRecovery || callbackHandled.current) return;
      callbackHandled.current = true;
      if (parameters.error || !parameters.accessToken || !parameters.refreshToken) {
        setRecoveryStatus('invalid');
        openResetScreen();
        return;
      }
      setRecoveryStatus('processing');
      try {
        const { error } = await client.auth.setSession({ access_token: parameters.accessToken, refresh_token: parameters.refreshToken });
        if (error) throw error;
        if (active) {
          setRecoveryStatus('ready');
          openResetScreen();
        }
      } catch (error) {
        if (__DEV__) console.warn('[Warsha password recovery]', sanitizeAuthError(error).translationKey);
        if (active) {
          setRecoveryStatus('invalid');
          openResetScreen();
        }
      }
    };

    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    }).catch((error) => {
      if (__DEV__) console.warn('[Warsha auth session]', error instanceof Error ? error.message : 'Unknown session error');
      if (active) setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        callbackHandled.current = true;
        setRecoveryStatus('ready');
        openResetScreen();
      }
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void handleRecoveryUrl(url); });
    void Linking.getInitialURL().then((url) => handleRecoveryUrl(url)).finally(() => {
      if (active) setRecoveryStatus((current) => current === 'checking' ? 'idle' : current);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const value = useMemo<Value>(() => ({
    mode: environment.dataMode,
    session,
    user: session?.user ?? null,
    loading,
    recoveryStatus,
    signIn: async (email, password) => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error); }
    },
    signUp: async (name, email, password, role = 'customer', language = 'en') => {
      if (environment.dataMode === 'mock') return { needsEmailConfirmation: false };
      try {
        const acceptedAt = new Date().toISOString();
        const { data, error } = await getSupabaseClient().auth.signUp({ email, password, options: { data: { display_name: name, preferred_language: language, account_role: role, terms_accepted_at: acceptedAt, privacy_accepted_at: acceptedAt } } });
        if (error) throw error;
        return { needsEmailConfirmation: !data.session };
      } catch (error) { throw sanitizeAuthError(error); }
    },
    requestPasswordReset: async (email) => {
      if (environment.dataMode === 'mock') return;
      try {
        const redirectTo = Linking.createURL('reset-password');
        if (__DEV__) console.info('[Warsha password recovery] Redirect target:', redirectTo);
        const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error); }
    },
    finishPasswordRecovery: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' });
        if (error) throw error;
        callbackHandled.current = false;
        setRecoveryStatus('idle');
      } catch (error) { throw sanitizeAuthError(error); }
    },
    signOut: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error); }
    },
  }), [loading, recoveryStatus, session]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
