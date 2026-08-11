'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { appCopy } from '@/lib/app-copy';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  canUseConsole,
  environmentLabel,
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

  if (status !== 'ready') {
    return (
      <div className={styles.centre}>
        <div className={styles.refusal}>
          <BrandMark size={32} />
          <h1 className={styles.refusalTitle}>
            {status === 'anonymous' ? words.consoleSignInRequired : words.consoleRefusedTitle}
          </h1>
          <p className={styles.refusalBody}>
            {status === 'anonymous' ? words.consoleSignInBody : words.consoleRefusedBody}
          </p>
          {status === 'anonymous' ? (
            <a className={styles.refusalLink} href="/sign-in">{words.consoleGoToSignIn}</a>
          ) : null}
        </div>
      </div>
    );
  }

  const environment = environmentLabel(session);

  return (
    <StaffContext.Provider value={{ session, refresh: load }}>
      {/* The environment is stated at the top of every page, permanently.
          Mistaking QA data for production is the expensive error a console
          makes possible, and a banner is cheap. */}
      {environment && environment !== 'PRODUCTION' ? (
        <div className={styles.environment} role="status">
          {environment} — {words.consoleNotProduction}
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
