import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { logDataError } from '@/src/data/data-errors';

import { privacyRepository } from './privacy-repository';
import {
  emptyOverview,
  type ConsentEntry,
  type ConsentPurposeKey,
  type DeletionRequest,
  type ExportRequest,
  type HistoryScope,
  type PrivacyOverview,
} from './privacy-types';

/**
 * Account-isolated privacy state.
 *
 * The generation guard is the WPS-019 pattern WPS-020 and WPS-021 also use: a
 * response arriving after the account changed is discarded, and nothing
 * renders for an account other than the loaded one.
 *
 * It matters more here than anywhere else in the app. A privacy screen shows
 * consent decisions, a deletion request, and a list of everything Warsha
 * stores — one frame of the previous account's privacy centre would be among
 * the worst leaks the product could produce.
 */

type PrivacyValue = {
  ready: boolean;
  accountKey: string | null;
  overview: PrivacyOverview;
  consents: ConsentEntry[];
  exports: ExportRequest[];
  setConsent: (purposeKey: ConsentPurposeKey, granted: boolean) => Promise<boolean>;
  clearHistory: (scope: HistoryScope) => Promise<{ searchesCleared: number; viewsCleared: number } | null>;
  setDeactivated: (deactivated: boolean) => Promise<boolean>;
  requestDeletion: (reasonCode: string | null) => Promise<DeletionRequest | null>;
  cancelDeletion: () => Promise<boolean>;
  requestExport: () => Promise<ExportRequest | null>;
  reload: () => void;
};

const PrivacyContext = createContext<PrivacyValue | null>(null);

export function PrivacyProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;

  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<PrivacyOverview>(emptyOverview);
  const [consents, setConsents] = useState<ConsentEntry[]>([]);
  const [exports, setExports] = useState<ExportRequest[]>([]);

  const generation = useRef(0);
  const accountRef = useRef<string | null>(accountKey);
  accountRef.current = accountKey;

  const load = useCallback(async () => {
    const current = ++generation.current;
    const key = accountRef.current;

    if (!key) {
      setOverview(emptyOverview);
      setConsents([]);
      setExports([]);
      setLoadedAccount(null);
      setReady(true);
      return;
    }

    setReady(false);
    try {
      const [nextOverview, nextConsents, nextExports] = await Promise.all([
        privacyRepository.overview(key),
        privacyRepository.consents(key),
        privacyRepository.exports(key),
      ]);
      if (current !== generation.current || accountRef.current !== key) return;
      setOverview(nextOverview);
      setConsents(nextConsents);
      setExports(nextExports);
      setLoadedAccount(key);
    } catch (error) {
      if (current !== generation.current || accountRef.current !== key) return;
      logDataError('privacy.load', error);
      // Fail closed. An unreadable privacy centre shows as unavailable rather
      // than as an empty one, which would read as "we store nothing about you".
      setOverview(emptyOverview);
      setConsents([]);
      setExports([]);
      setLoadedAccount(key);
    } finally {
      if (current === generation.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [accountKey, load]);

  const setConsent = useCallback(
    async (purposeKey: ConsentPurposeKey, granted: boolean): Promise<boolean> => {
      const key = accountRef.current;
      if (!key) return false;
      try {
        await privacyRepository.recordConsent(key, purposeKey, granted);
        void load();
        return true;
      } catch (error) {
        logDataError('privacy.consent', error);
        return false;
      }
    },
    [load],
  );

  const clearHistory = useCallback(
    async (scope: HistoryScope) => {
      const key = accountRef.current;
      if (!key) return null;
      try {
        return await privacyRepository.clearHistory(key, scope);
      } catch (error) {
        logDataError('privacy.clearHistory', error);
        return null;
      }
    },
    [],
  );

  const setDeactivated = useCallback(
    async (deactivated: boolean): Promise<boolean> => {
      const key = accountRef.current;
      if (!key) return false;
      try {
        const result = await privacyRepository.setDeactivated(key, deactivated);
        void load();
        return result;
      } catch (error) {
        logDataError('privacy.deactivate', error);
        return false;
      }
    },
    [load],
  );

  const requestDeletion = useCallback(
    async (reasonCode: string | null): Promise<DeletionRequest | null> => {
      const key = accountRef.current;
      if (!key) return null;
      try {
        const result = await privacyRepository.requestDeletion(key, reasonCode);
        void load();
        return result;
      } catch (error) {
        logDataError('privacy.requestDeletion', error);
        return null;
      }
    },
    [load],
  );

  const cancelDeletion = useCallback(async (): Promise<boolean> => {
    const key = accountRef.current;
    if (!key) return false;
    try {
      const result = await privacyRepository.cancelDeletion(key);
      void load();
      return result;
    } catch (error) {
      logDataError('privacy.cancelDeletion', error);
      return false;
    }
  }, [load]);

  const requestExport = useCallback(async (): Promise<ExportRequest | null> => {
    const key = accountRef.current;
    if (!key) return null;
    try {
      const result = await privacyRepository.requestExport(key);
      void load();
      return result;
    } catch (error) {
      logDataError('privacy.requestExport', error);
      return null;
    }
  }, [load]);

  const value = useMemo<PrivacyValue>(
    () => ({
      ready,
      accountKey,
      // Never render another account's data, even for one frame.
      overview: loadedAccount === accountKey ? overview : emptyOverview,
      consents: loadedAccount === accountKey ? consents : [],
      exports: loadedAccount === accountKey ? exports : [],
      setConsent,
      clearHistory,
      setDeactivated,
      requestDeletion,
      cancelDeletion,
      requestExport,
      reload: () => void load(),
    }),
    [ready, accountKey, loadedAccount, overview, consents, exports, setConsent, clearHistory,
     setDeactivated, requestDeletion, cancelDeletion, requestExport, load],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  const value = useContext(PrivacyContext);
  if (!value) throw new Error('usePrivacy must be used inside PrivacyProvider');
  return value;
}
