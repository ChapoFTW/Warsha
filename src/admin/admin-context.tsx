import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { adminSurfaceEnabled, environment } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';

import { adminCopy, type AdminCopyKey, type AdminLanguage } from './admin-copy';
import { adminRepository } from './admin-repository';
import {
  anonymousStaffSession,
  canPerform,
  hasCapability,
  type StaffCapability,
  type StaffSession,
} from './admin-types';

/**
 * WPS-017 staff session context.
 *
 * The session is server-derived: the client asks `get_staff_session` and
 * renders what it is told. Capabilities held here decide navigation only. Every
 * action re-checks the same capability inside its RPC, so a tampered client
 * gains nothing.
 */

type AdminContextValue = {
  session: StaffSession;
  loading: boolean;
  error: string | null;
  surfaceEnabled: boolean;
  simulated: boolean;
  language: AdminLanguage;
  isRTL: boolean;
  text: (key: AdminCopyKey) => string;
  can: (capability: StaffCapability) => boolean;
  mayAct: (capability: StaffCapability) => boolean;
  refresh: () => Promise<void>;
  reauthenticate: () => Promise<void>;
  revokeSessions: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: PropsWithChildren) {
  const { language, isRTL } = useLocalization();
  const [session, setSession] = useState<StaffSession>(anonymousStaffSession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!adminSurfaceEnabled) {
      setSession(anonymousStaffSession);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSession(await adminRepository.getSession());
      setError(null);
    } catch {
      // Fail closed: an unreadable session is treated as no access at all.
      setSession(anonymousStaffSession);
      setError(adminCopy[language === 'ar' ? 'ar' : 'en'].errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { void refresh(); }, [refresh]);

  const reauthenticate = useCallback(async () => {
    await adminRepository.reauthenticate();
    await refresh();
  }, [refresh]);

  const revokeSessions = useCallback(async () => {
    await adminRepository.revokeMySessions();
    await refresh();
  }, [refresh]);

  const value = useMemo<AdminContextValue>(() => {
    const adminLanguage: AdminLanguage = language === 'ar' ? 'ar' : 'en';
    return {
      session,
      loading,
      error,
      surfaceEnabled: adminSurfaceEnabled,
      simulated: environment.dataMode === 'mock',
      language: adminLanguage,
      isRTL,
      text: (key: AdminCopyKey) => adminCopy[adminLanguage][key],
      can: (capability: StaffCapability) => hasCapability(session, capability),
      mayAct: (capability: StaffCapability) => canPerform(session, capability),
      refresh,
      reauthenticate,
      revokeSessions,
    };
  }, [error, isRTL, language, loading, reauthenticate, refresh, revokeSessions, session]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used inside AdminProvider');
  return context;
}
