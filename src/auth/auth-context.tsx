import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { SafeAuthError, sanitizeAuthError } from './auth-errors';
import { classifySignInIdentity, visibleContactEmail } from './auth-identifier';
import { assertPhoneAuthAvailable } from './phone-auth-capability';
import { isValidPhone, isValidSmsOtp, normalizePhone } from './phone-auth';
import { runAuthSingleFlight } from './auth-request-guard';
import { registerWorker, signInWorker } from './worker-auth-client';

export type AccountRole = 'customer' | 'provider';
type RecoveryStatus = 'checking' | 'idle' | 'processing' | 'ready' | 'invalid';
type Value = {
  mode: 'mock' | 'supabase';
  session: Session | null;
  user: User | null;
  /** A communication email. Null for trusted synthetic worker identities. */
  visibleEmail: string | null;
  loading: boolean;
  recoveryStatus: RecoveryStatus;
  /**
   * Whether the account has PROVEN it holds its number.
   *
   * False for everybody while Supabase Phone Auth is disabled, and that is
   * correct rather than a defect. It gates the explicit verify-phone surface
   * and nothing else — registration, activation and onboarding do not read it,
   * because a contact number is required and a proven one is not.
   */
  hasVerifiedPhone: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (name: string, email: string | null, password: string, phone: string, role?: AccountRole, language?: 'en' | 'ar') => Promise<{ needsEmailConfirmation: boolean; accountId: string | null }>;
  requestWorkerPhoneChange: (phone: string) => Promise<'code_sent' | 'already_verified'>;
  verifyWorkerPhoneChange: (phone: string, token: string) => Promise<void>;
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

async function requireCurrentUser(operation: 'phone-change-request' | 'phone-change-verify') {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw sanitizeAuthError(error, operation);
  if (!data.user) throw new SafeAuthError('authSessionExpired');
  return data.user;
}

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
        sanitizeAuthError(error, 'session');
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
      sanitizeAuthError(error, 'session');
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
    visibleEmail: visibleContactEmail(session?.user),
    loading,
    recoveryStatus,
    hasVerifiedPhone: Boolean(session?.user.phone && session.user.phone_confirmed_at),
    signIn: async (identifier, password) => {
      const identity = classifySignInIdentity(identifier);
      if (!identity) throw new SafeAuthError('authInvalidCredentials');
      if (environment.dataMode === 'mock') return;
      try {
        if (identity.kind === 'customer_email') {
          const { error } = await getSupabaseClient().auth.signInWithPassword({
            email: identity.email,
            password,
          });
          if (error) throw error;
          return;
        }
        const tokens = await signInWorker(identity.phone, password);
        const { error } = await getSupabaseClient().auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });
        if (error) throw error;
      } catch (error) {
        throw sanitizeAuthError(error,
          identity.kind === 'worker_phone' ? 'worker-password-sign-in' : 'password-sign-in');
      }
    },
    /**
     * Customers stay on direct email/password registration. Workers cross the
     * trusted worker-auth boundary, which mints a UUID-derived internal email
     * and returns session tokens without exposing that identity as contact.
     *
     * WPS-024 correction. There is no OTP here and no capability preflight,
     * because registration does not depend on Supabase Phone Auth and must
     * succeed while it is disabled.
     *
     * The phone number is REQUIRED and is validated to the same Egyptian mobile
     * shape everywhere else in the application uses — but it is COLLECTED, not
     * verified. It travels as `contact_phone` in the sign-up metadata, and
     * `private.handle_new_user` re-checks the shape and writes it to the
     * profile. It deliberately does NOT go in the `phone` field of the sign-up
     * call: that would ask Supabase to treat it as an authentication factor and
     * send a code nobody can receive.
     */
    signUp: async (name, email, password, phone, role = 'customer', language = 'en') => {
      const normalized = normalizePhone(phone);
      if (!isValidPhone(normalized)) throw new SafeAuthError('authInvalidPhone');
      if (environment.dataMode === 'mock') {
        return { needsEmailConfirmation: false, accountId: 'mock-user' };
      }
      try {
        if (role === 'provider') {
          const tokens = await registerWorker({
            fullName: name.trim(),
            phone: normalized,
            password,
            language,
          });
          const { data, error } = await getSupabaseClient().auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (error) throw error;
          return {
            needsEmailConfirmation: false,
            accountId: data.user?.id ?? data.session?.user.id ?? null,
          };
        }
        if (!email?.trim()) throw new SafeAuthError('authInvalidCredentials');
        const acceptedAt = new Date().toISOString();
        const { data, error } = await getSupabaseClient().auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name,
              preferred_language: language,
              account_role: role,
              contact_phone: normalized,
              terms_accepted_at: acceptedAt,
              privacy_accepted_at: acceptedAt,
            },
          },
        });
        if (error) throw error;
        return {
          needsEmailConfirmation: !data.session,
          accountId: data.user?.id ?? data.session?.user.id ?? null,
        };
      } catch (error) {
        throw sanitizeAuthError(error, role === 'provider' ? 'worker-sign-up' : 'sign-up');
      }
    },
    /**
     * Verify a phone number, or change it. The ONLY remaining OTP surface.
     *
     * This is where `assertPhoneAuthAvailable` still belongs and still runs:
     * an explicit, user-initiated request to prove a handset. It FAILS CLOSED
     * while Supabase Phone Auth is disabled — which is every environment today
     * — and that refusal is correct, because the alternative is a screen that
     * waits forever for a code no provider was asked to send.
     *
     * Registration does not call this. Nothing blocks on it.
     */
    requestWorkerPhoneChange: async (phone) => {
      if (environment.dataMode === 'mock') return 'code_sent';
      const normalized = normalizePhone(phone);
      if (!isValidPhone(normalized)) throw new SafeAuthError('authInvalidPhone');
      return runAuthSingleFlight<'code_sent' | 'already_verified'>(`change:${normalized}`, async () => {
        try {
          await assertPhoneAuthAvailable(normalized);
          const currentUser = await requireCurrentUser('phone-change-request');
          if (currentUser.phone_confirmed_at && normalizePhone(currentUser.phone ?? '') === normalized) return 'already_verified';
          const { error } = await getSupabaseClient().auth.updateUser({ phone: normalized });
          if (error) throw error;
          return 'code_sent';
        } catch (error) { throw sanitizeAuthError(error, 'phone-change-request'); }
      });
    },
    verifyWorkerPhoneChange: async (phone, token) => {
      if (environment.dataMode === 'mock') return;
      const normalized = normalizePhone(phone);
      if (!isValidPhone(normalized) || !isValidSmsOtp(token)) throw new SafeAuthError('authInvalidOtp');
      try {
        const { error } = await getSupabaseClient().auth.verifyOtp({ phone: normalized, token: token.trim(), type: 'phone_change' });
        if (error) throw error;
        const verifiedUser = await requireCurrentUser('phone-change-verify');
        if (!verifiedUser.phone_confirmed_at || normalizePhone(verifiedUser.phone ?? '') !== normalized) {
          throw new SafeAuthError('authInvalidOtp');
        }
      } catch (error) { throw sanitizeAuthError(error, 'phone-change-verify'); }
    },
    requestPasswordReset: async (email) => {
      if (environment.dataMode === 'mock') return;
      try {
        const redirectTo = Linking.createURL('reset-password');
        if (__DEV__) console.info('[Warsha password recovery] Redirect target:', redirectTo);
        const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error, 'password-reset'); }
    },
    finishPasswordRecovery: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' });
        if (error) throw error;
        callbackHandled.current = false;
        setRecoveryStatus('idle');
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
    signOut: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
  }), [loading, recoveryStatus, session]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
