import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { legalRepository } from '@/src/legal/legal-repository';
import {
  isCurrentSignupLegalManifest,
  type SignupLegalAcceptance,
} from '@/src/legal/signup-legal';

import { SafeAuthError, safeAuthDiagnostic, sanitizeAuthError } from './auth-errors';
import { classifySignInIdentity, isValidCustomerEmail, visibleContactEmail } from './auth-identifier';
import {
  callbackFailureFromParameters,
  classifyAuthCallbackFailure,
  confirmationResendErrorIsNeutral,
  customerSignUpResult,
  readAuthCallbackParameters,
  safeAuthCallbackDiagnostic,
  type AuthCallbackOutcome,
  type CustomerSignUpResult,
} from './email-confirmation';
import { assertPhoneAuthAvailable } from './phone-auth-capability';
import { isValidPhone, isValidSmsOtp, normalizePhone } from './phone-auth';
import type { SupportedLanguage } from '@/src/i18n/language-preference';
import { runAuthSingleFlight } from './auth-request-guard';
import { registerWorker, signInWorker } from './worker-auth-client';

export type AccountRole = 'customer' | 'provider';
type Value = {
  mode: 'mock' | 'supabase';
  session: Session | null;
  user: User | null;
  /** A communication email. Null for trusted synthetic worker identities. */
  visibleEmail: string | null;
  loading: boolean;
  recoveryOutcome: AuthCallbackOutcome;
  emailConfirmationOutcome: AuthCallbackOutcome;
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
  signUp: (
    name: string,
    email: string | null,
    password: string,
    phone: string,
    role: AccountRole,
    language: SupportedLanguage,
    legalAcceptances: readonly SignupLegalAcceptance[],
  ) => Promise<CustomerSignUpResult>;
  requestWorkerPhoneChange: (phone: string) => Promise<'code_sent' | 'already_verified'>;
  verifyWorkerPhoneChange: (phone: string, token: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  requestEmailConfirmation: (email: string) => Promise<void>;
  finishPasswordRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<Value | null>(null);

async function requireCurrentUser(operation: 'phone-change-request' | 'phone-change-verify') {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw sanitizeAuthError(error, operation);
  if (!data.user) throw new SafeAuthError('authSessionExpired');
  return data.user;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(environment.dataMode === 'supabase');
  const [recoveryOutcome, setRecoveryOutcome] = useState<AuthCallbackOutcome>(
    { status: environment.dataMode === 'supabase' ? 'checking' : 'idle' });
  const [emailConfirmationOutcome, setEmailConfirmationOutcome] = useState<AuthCallbackOutcome>(
    { status: environment.dataMode === 'supabase' ? 'checking' : 'idle' });
  const callbackHandled = useRef(false);

  useEffect(() => {
    let active = true;
    if (environment.dataMode === 'mock') {
      setLoading(false);
      setRecoveryOutcome({ status: 'idle' });
      setEmailConfirmationOutcome({ status: 'idle' });
      return () => { active = false; };
    }

    const client = getSupabaseClient();
    const openResetScreen = () => {
      if (active) router.replace('/reset-password');
    };
    const openEmailConfirmationScreen = () => {
      if (active) router.replace('/auth/confirm');
    };
    const handleAuthUrl = async (url: string | null) => {
      if (!active || !url) return;
      const parameters = readAuthCallbackParameters(url);
      if (!parameters.kind || callbackHandled.current) return;
      callbackHandled.current = true;
      const setOutcome = parameters.kind === 'recovery'
        ? setRecoveryOutcome
        : setEmailConfirmationOutcome;
      const openScreen = parameters.kind === 'recovery'
        ? openResetScreen
        : openEmailConfirmationScreen;
      const urlFailure = callbackFailureFromParameters(parameters);
      if (urlFailure) {
        const outcome: AuthCallbackOutcome = { status: 'failed', failure: urlFailure };
        setOutcome(outcome);
        if (__DEV__) {
          console.warn(
            '[Warsha auth callback]',
            safeAuthCallbackDiagnostic(parameters.kind, outcome, parameters),
          );
        }
        openScreen();
        return;
      }
      setOutcome({ status: 'processing' });
      try {
        const { error } = parameters.code
          ? await client.auth.exchangeCodeForSession(parameters.code)
          : await client.auth.setSession({
              access_token: parameters.accessToken!,
              refresh_token: parameters.refreshToken!,
            });
        if (error) throw error;
        if (active) {
          setOutcome({ status: 'ready' });
          openScreen();
        }
      } catch (error) {
        sanitizeAuthError(error, 'session');
        if (active) {
          const outcome: AuthCallbackOutcome = {
            status: 'failed',
            failure: classifyAuthCallbackFailure(
              error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown },
            ),
          };
          setOutcome(outcome);
          if (__DEV__) {
            console.warn(
              '[Warsha auth callback]',
              safeAuthCallbackDiagnostic(
                parameters.kind,
                outcome,
                error as { code?: unknown; status?: unknown },
              ),
            );
          }
          openScreen();
        }
      }
    };

    let hydratingInitialSession = true;
    void (async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        let verifiedSession = data.session;
        if (verifiedSession) {
          // getSession reads persisted storage. getUser asks Auth to validate
          // the token before any account shell is allowed to mount.
          const { data: verified, error: verificationError } = await client.auth.getUser();
          if (verificationError || !verified.user) {
            // Not when a callback owns the session: signing out locally would
            // delete the recovery session that arrived while this was in flight.
            if (!callbackHandled.current) {
              await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
            }
            verifiedSession = null;
          } else {
            verifiedSession = { ...verifiedSession, user: verified.user };
          }
        }
        // A recovery or confirmation link may have established a session while
        // this hydration was awaiting the network. That session is newer than
        // anything read above, and writing the stale value over it is what made
        // a valid reset link render as expired: the callback set status 'ready'
        // and then this line put the session back to null, so the screen saw
        // `ready` with no session and showed the invalid card.
        if (active && !callbackHandled.current) setSession(verifiedSession);
      } catch (error) {
        sanitizeAuthError(error, 'session');
        if (active && !callbackHandled.current) setSession(null);
      } finally {
        hydratingInitialSession = false;
        if (active) setLoading(false);
      }
    })();

    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === 'INITIAL_SESSION' && hydratingInitialSession) return;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        callbackHandled.current = true;
        setRecoveryOutcome({ status: 'ready' });
        openResetScreen();
      }
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); });
    void Linking.getInitialURL().then((url) => handleAuthUrl(url)).finally(() => {
      if (active) {
        setRecoveryOutcome((current) => current.status === 'checking' ? { status: 'idle' } : current);
        setEmailConfirmationOutcome((current) => current.status === 'checking' ? { status: 'idle' } : current);
      }
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
    recoveryOutcome,
    emailConfirmationOutcome,
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
    signUp: async (name, email, password, phone, role, language, legalAcceptances) => {
      const normalized = normalizePhone(phone);
      if (!isValidPhone(normalized)) throw new SafeAuthError('authInvalidPhone');
      const signupRole = role === 'provider' ? 'worker' : 'customer';
      const legalLanguage = language === 'ar' ? 'ar' : 'en';
      if (!isCurrentSignupLegalManifest(signupRole, legalLanguage, legalAcceptances)) {
        throw new SafeAuthError('authError');
      }
      if (environment.dataMode === 'mock') {
        for (const acceptance of legalAcceptances) {
          await legalRepository.accept(
            'mock-user',
            acceptance.documentKey,
            acceptance.version,
            acceptance.language,
            'sign_up',
          );
        }
        return {
          needsEmailConfirmation: false,
          accountId: 'mock-user',
        };
      }
      try {
        if (role === 'provider') {
          const tokens = await registerWorker({
            fullName: name.trim(),
            phone: normalized,
            password,
            language,
            legalAcceptances,
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
        const { data, error } = await getSupabaseClient().auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: Linking.createURL('auth/confirm'),
            data: {
              display_name: name,
              preferred_language: language,
              account_role: role,
              contact_phone: normalized,
              legal_acceptances: legalAcceptances,
            },
          },
        });
        if (error) throw error;
        return customerSignUpResult({
          session: data.session,
          user: data.user ? {
            id: data.user.id,
            confirmation_sent_at: data.user.confirmation_sent_at,
          } : null,
        });
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
    requestEmailConfirmation: async (email) => {
      if (environment.dataMode === 'mock') return;
      if (!isValidCustomerEmail(email)) throw new SafeAuthError('authInvalidEmail');
      try {
        const { error } = await getSupabaseClient().auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: Linking.createURL('auth/confirm') },
        });
        if (error && confirmationResendErrorIsNeutral(error)) {
          if (__DEV__) {
            console.warn(
              '[Warsha confirmation resend]',
              safeAuthDiagnostic('confirmation-resend', error),
            );
          }
          return;
        }
        if (error) throw error;
      } catch (error) {
        throw sanitizeAuthError(error, 'confirmation-resend');
      }
    },
    finishPasswordRecovery: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' });
        if (error) throw error;
        callbackHandled.current = false;
        setRecoveryOutcome({ status: 'idle' });
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
    signOut: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
  }), [emailConfirmationOutcome, loading, recoveryOutcome, session]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
