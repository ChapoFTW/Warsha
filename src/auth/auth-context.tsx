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
  /**
   * Spend the recovery token hash and set the new password, in that order, in
   * one deliberate step. This is the ONLY place a recovery authority is
   * exchanged on mobile: opening the deep link does not.
   */
  completePasswordRecovery: (password: string, code?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * The server ended the session; the person did not.
   *
   * A professional halfway through their application had their password
   * changed elsewhere, which revoked the refresh token. The app did exactly
   * what it should -- dropped the session -- and said nothing at all: the
   * form vanished and the marketing gateway appeared. That reads as the app
   * breaking, and the unsaved step was gone with no explanation for why.
   *
   * Distinguishing it from tapping Sign out is the whole point. Signing
   * yourself out needs no explanation; being signed out does.
   */
  sessionEnded: boolean;
  /** Call once the notice has been shown, so it appears exactly once. */
  acknowledgeSessionEnd: () => void;
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
  const [sessionEnded, setSessionEnded] = useState(false);
  /*
   * Set immediately before every sign-out Warsha itself asks for, and read
   * once by the listener. A ref rather than state because the listener has
   * to see the value the same tick it was written, and because nothing
   * renders differently for it.
   */
  const intentionalSignOut = useRef(false);
  const [loading, setLoading] = useState(environment.dataMode === 'supabase');
  // Held, not exchanged. Cleared as soon as it is spent or abandoned.
  const [recoveryTokenHash, setRecoveryTokenHash] = useState<string | null>(null);
  /*
   * A recovery whose hash is spent but whose second factor is still outstanding.
   *
   * The hash can be exchanged once. When the account holds a verified factor
   * the exchange is not the end of the story, and a mistyped six-digit code
   * must not cost the whole recovery email — codes rotate every thirty seconds,
   * so that is the expected mistake. The client keeps the recovery session in
   * memory, so this flag says "keep going with it" and the challenge can be
   * retried until it succeeds.
   */
  const [recoveryMfaPending, setRecoveryMfaPending] = useState(false);
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
      /*
       * A recovery token hash is NOT exchanged here.
       *
       * Opening a link must never spend the recovery authority. The old email
       * pointed at /auth/v1/verify, which consumed the single-use token on the
       * first fetch, so a mail scanner opening the link used it up and the
       * person who tapped it afterwards was told their brand-new link had
       * expired. The deep link now carries a hash, which is inert: it is held
       * here and exchanged once, by `completePasswordRecovery`, when the person
       * has typed a password and pressed the button.
       */
      if (parameters.kind === 'recovery' && parameters.tokenHash) {
        setRecoveryTokenHash(parameters.tokenHash);
        setOutcome({ status: 'ready' });
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
              // Reached only when a session was PERSISTED and Auth has since
              // stopped honouring it. Someone who has never signed in has no
              // session here, so this cannot greet a first-time visitor.
              setSessionEnded(true);
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
      if (event === 'SIGNED_OUT') {
        // supabase-js emits this both when Warsha asks and when a refresh
        // token is refused. Only the second one is news to the person.
        if (!intentionalSignOut.current) setSessionEnded(true);
        intentionalSignOut.current = false;
      }
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
    sessionEnded,
    acknowledgeSessionEnd: () => setSessionEnded(false),
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
    completePasswordRecovery: async (password: string, code?: string) => {
      if (environment.dataMode === 'mock') return;
      // Either entrance: an unspent hash, or a transaction already open and
      // waiting only on the authenticator.
      if (!recoveryTokenHash && !recoveryMfaPending) throw new SafeAuthError('authOtpExpired');
      const client = getSupabaseClient();
      try {
        /*
         * The exchange, and the ONLY one. Opening the deep link held this hash
         * without spending it precisely so that a mail scanner could not; it is
         * spent here, once, because a person typed a password and pressed a
         * button.
         *
         * On a retry the hash is already gone and this is skipped: the session
         * it established is still held by the client, which is what makes the
         * challenge retryable without another email.
         */
        if (recoveryTokenHash) {
          const { error: verifyError } = await client.auth.verifyOtp({
            token_hash: recoveryTokenHash,
            type: 'recovery',
          });
          if (verifyError) throw verifyError;
          // Spent. Never offered again, whatever happens below.
          setRecoveryTokenHash(null);
        }

        /*
         * A recovery session is aal1. An account holding a verified factor
         * cannot change its password on one — the provider answers
         * `insufficient_aal`, which is correct: otherwise reading the mailbox
         * would defeat the authenticator.
         */
        const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
          if (!code) {
            setRecoveryMfaPending(true);
            throw new SafeAuthError('authRecoveryCodeRequired');
          }
          const { data: factors } = await client.auth.mfa.listFactors();
          const factor = (factors?.totp ?? [])[0];
          if (!factor) {
            setRecoveryMfaPending(true);
            throw new SafeAuthError('authRecoveryCodeRequired');
          }
          const { error: challengeError } = await client.auth.mfa.challengeAndVerify({
            factorId: factor.id,
            code,
          });
          if (challengeError) {
            // The transaction survives a wrong code, so the next attempt is a
            // retry rather than a new recovery email.
            setRecoveryMfaPending(true);
            throw new SafeAuthError('authRecoveryCodeInvalid');
          }
        }

        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        // Done. Nothing is left for a later attempt to continue.
        setRecoveryMfaPending(false);
      } catch (error) {
        if (error instanceof SafeAuthError) throw error;
        setRecoveryMfaPending(false);
        throw sanitizeAuthError(error, 'password-reset');
      }
    },
    finishPasswordRecovery: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        intentionalSignOut.current = true;
        const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' });
        if (error) throw error;
        callbackHandled.current = false;
        setRecoveryTokenHash(null);
        setRecoveryMfaPending(false);
        setRecoveryOutcome({ status: 'idle' });
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
    signOut: async () => {
      if (environment.dataMode === 'mock') return;
      try {
        intentionalSignOut.current = true;
        const { error } = await getSupabaseClient().auth.signOut();
        if (error) throw error;
      } catch (error) { throw sanitizeAuthError(error, 'sign-out'); }
    },
  }), [emailConfirmationOutcome, loading, recoveryMfaPending, recoveryOutcome,
    recoveryTokenHash, session, sessionEnded]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
