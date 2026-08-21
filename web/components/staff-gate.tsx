'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { StaffSignIn } from '@/components/staff-sign-in';
import { appCopy } from '@/lib/app-copy';
import { signOut } from '@/lib/auth-actions';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  canUseConsole,
  environmentBinding,
  NO_STAFF_SESSION,
  parseStaffSession,
  type StaffSession,
} from '@/lib/staff';

import styles from './staff-gate.module.css';

/**
 * The staff gate.
 *
 * Ordinary Supabase authentication first, then `get_staff_session()`. A
 * customer who signs in here is authenticated and refused, which is exactly
 * right: authentication answers "who are you", and this answers "may you".
 *
 * The console never receives a service-role key. Everything it can do, it does
 * as the signed-in staff member through RPCs that check capability themselves.
 * If this component were removed entirely, no privileged operation would
 * become possible — it would only become uglier to discover that.
 */

type StaffValue = { session: StaffSession; refresh: () => Promise<void> };
const StaffContext = createContext<StaffValue | null>(null);

export function StaffGate({ children }: { children: React.ReactNode }) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const [session, setSession] = useState<StaffSession>(NO_STAFF_SESSION);
  const [status, setStatus] = useState<'loading' | 'ready' | 'anonymous' | 'refused'>('loading');

  const load = useMemo(() => async () => {
    const client = supabase();
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) {
      setSession(NO_STAFF_SESSION);
      setStatus('anonymous');
      return;
    }
    // A stored token proves storage, not validity.
    const { data: user, error: userError } = await client.auth.getUser();
    if (userError || !user.user) {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setSession(NO_STAFF_SESSION);
      setStatus('anonymous');
      return;
    }

    const { data, error } = await client.rpc('get_staff_session');
    if (error) {
      setSession(NO_STAFF_SESSION);
      setStatus('refused');
      return;
    }
    const parsed = parseStaffSession(data);
    setSession(parsed);
    setStatus(canUseConsole(parsed) ? 'ready' : 'refused');
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') {
    return (
      <div className={styles.centre} role="progressbar" aria-label={words.loading}>
        <BrandMark size={48} />
      </div>
    );
  }

  // Signed out: the sign-in form, here, on whatever route was asked for.
  //
  // It used to be a link to `/sign-in`. On this origin the middleware rewrites
  // that to `/admin/sign-in`, which did not exist, so an unauthenticated
  // operator was sent to a Next.js 404 — the one thing an admin origin must
  // never do. Rendering the form in place means every deep link into the
  // console lands somewhere usable, and there is no redirect to get wrong.
  if (status === 'anonymous') {
    return <StaffSignIn onSignedIn={() => { void load(); }} />;
  }

  // Authenticated, but not a staff member. A different answer to a different
  // question, and it must not look like a failed sign-in: the credentials were
  // fine. Signing out is offered because the way forward is a different account.
  if (status !== 'ready') {
    return (
      <div className={styles.centre}>
        <div className={styles.refusal}>
          <BrandMark size={32} />
          <h1 className={styles.refusalTitle}>{words.consoleRefusedTitle}</h1>
          <p className={styles.refusalBody}>{words.consoleRefusedBody}</p>
          <button
            type="button"
            className={styles.refusalLink}
            onClick={() => { void signOut().then(() => { void load(); }); }}
          >
            {words.signOut}
          </button>
        </div>
      </div>
    );
  }

  const binding = environmentBinding(
    session,
    typeof window === 'undefined' ? '' : window.location.hostname,
  );

  return (
    <StaffContext.Provider value={{ session, refresh: load }}>
      {/* The environment is stated at the top of every page, permanently.
          Mistaking QA data for production is the expensive error a console
          makes possible, and a banner is cheap. An environment the console
          cannot vouch for is louder still: it is a fault, not a label. */}
      {binding.state === 'misconfigured' ? (
        <div className={styles.environmentFault} role="alert">
          <strong>{words.consoleEnvironmentFault}</strong>{' '}
          {binding.reason === 'unbound'
            ? words.consoleEnvironmentUnbound
            : words.consoleEnvironmentUnknown}
        </div>
      ) : null}
      {binding.state === 'labelled' ? (
        <div className={styles.environment} role="status">
          {binding.label} — {words.consoleNotProduction}
        </div>
      ) : null}
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff(): StaffValue {
  const value = useContext(StaffContext);
  if (!value) throw new Error('useStaff requires StaffGate');
  return value;
}
