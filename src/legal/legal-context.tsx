import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { logDataError } from '@/src/data/data-errors';

import { legalRepository } from './legal-repository';
import {
  emptyObligations,
  type LegalAcceptanceRecord,
  type LegalDocumentKey,
  type LegalLanguage,
  type LegalObligations,
} from './legal-types';

/**
 * Account-isolated legal state.
 *
 * The generation guard is the WPS-019 pattern that WPS-020, WPS-021 and
 * WPS-022 also use: a response arriving after the account changed is
 * discarded, so nothing renders for an account other than the loaded one.
 *
 * It matters here for a specific reason. This context answers "what has this
 * person agreed to", and one frame of the previous account's answer on a
 * re-consent screen would invite somebody to accept an agreement on behalf of
 * a person who is no longer signed in.
 *
 * `satisfied` fails CLOSED on error: an unreadable obligations call is treated
 * as unsatisfied, not as satisfied. The consequence of the wrong guess in one
 * direction is a person seeing a consent screen they did not need; in the
 * other, it is Warsha treating someone as having agreed to something it cannot
 * establish they ever saw.
 */

type LegalValue = {
  ready: boolean;
  accountKey: string | null;
  /** False while unknown, and false on failure. Never optimistic. */
  satisfied: boolean;
  obligations: LegalObligations;
  acceptances: LegalAcceptanceRecord[];
  unavailable: boolean;
  accept: (
    key: LegalDocumentKey,
    version: string,
    language: LegalLanguage,
    surface: string,
  ) => Promise<boolean>;
  decline: (
    key: LegalDocumentKey,
    version: string,
    language: LegalLanguage,
    reason: string | null,
  ) => Promise<{ restricts: string[]; alwaysAvailable: string[] } | null>;
  reload: () => void;
};

const LegalContext = createContext<LegalValue | null>(null);

export function LegalProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;

  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [obligations, setObligations] = useState<LegalObligations>(emptyObligations);
  const [acceptances, setAcceptances] = useState<LegalAcceptanceRecord[]>([]);

  const generation = useRef(0);
  const accountRef = useRef<string | null>(accountKey);
  accountRef.current = accountKey;

  const load = useCallback(async () => {
    const current = ++generation.current;
    const key = accountRef.current;

    if (!key) {
      setObligations(emptyObligations);
      setAcceptances([]);
      setLoadedAccount(null);
      setUnavailable(false);
      setReady(true);
      return;
    }

    setReady(false);
    try {
      const [nextObligations, nextAcceptances] = await Promise.all([
        legalRepository.obligations(key),
        legalRepository.acceptances(key),
      ]);
      if (current !== generation.current || accountRef.current !== key) return;
      setObligations(nextObligations);
      setAcceptances(nextAcceptances);
      setUnavailable(false);
      setLoadedAccount(key);
    } catch (error) {
      if (current !== generation.current || accountRef.current !== key) return;
      logDataError('legal.load', error);
      setObligations(emptyObligations);
      setAcceptances([]);
      setUnavailable(true);
      setLoadedAccount(key);
    } finally {
      if (current === generation.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [accountKey, load]);

  const accept = useCallback(
    async (
      key: LegalDocumentKey,
      version: string,
      language: LegalLanguage,
      surface: string,
    ): Promise<boolean> => {
      const account = accountRef.current;
      if (!account) return false;
      try {
        await legalRepository.accept(account, key, version, language, surface);
      } catch (error) {
        logDataError('legal.accept', error);
        return false;
      }
      // Reload rather than patching local state. What a person owes is a
      // server answer, and reconstructing it here would let the screen and the
      // ledger disagree about the one thing this subsystem exists to record.
      await load();
      return true;
    },
    [load],
  );

  const decline = useCallback(
    async (
      key: LegalDocumentKey,
      version: string,
      language: LegalLanguage,
      reason: string | null,
    ) => {
      const account = accountRef.current;
      if (!account) return null;
      try {
        const result = await legalRepository.decline(account, key, version, language, reason);
        await load();
        return result;
      } catch (error) {
        logDataError('legal.decline', error);
        return null;
      }
    },
    [load],
  );

  const value = useMemo<LegalValue>(() => {
    const isCurrentAccount = loadedAccount !== null && loadedAccount === accountKey;
    const usable = ready && isCurrentAccount && !unavailable;
    return {
      ready,
      accountKey,
      satisfied: usable ? obligations.satisfied : false,
      obligations: isCurrentAccount ? obligations : emptyObligations,
      acceptances: isCurrentAccount ? acceptances : [],
      unavailable,
      accept,
      decline,
      reload: () => void load(),
    };
  }, [
    accountKey,
    acceptances,
    accept,
    decline,
    load,
    loadedAccount,
    obligations,
    ready,
    unavailable,
  ]);

  return <LegalContext.Provider value={value}>{children}</LegalContext.Provider>;
}

export function useLegal(): LegalValue {
  const value = useContext(LegalContext);
  if (!value) throw new Error('useLegal must be used inside LegalProvider');
  return value;
}
