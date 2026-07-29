import { AppState } from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { dataErrorKey } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';

import { verificationRepository } from './verification-repository';
import type {
  ProviderVerification,
  VerificationDocumentType,
} from './verification-types';

type UploadInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type Value = {
  verification: ProviderVerification | null;
  loading: boolean;
  refreshing: boolean;
  action: VerificationDocumentType | 'submit' | 'remove' | 'review' | null;
  error: TranslationKey | null;
  reload: (silent?: boolean) => Promise<void>;
  upload: (type: VerificationDocumentType, input: UploadInput) => Promise<void>;
  remove: (documentId: string) => Promise<void>;
  submit: (nationalId: string, hasSkillCertificate: boolean) => Promise<void>;
  simulateReview: (
    status: 'approved' | 'rejected' | 'requires_resubmission',
  ) => Promise<void>;
};

const Context = createContext<Value | null>(null);

export function VerificationProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const provider = useProviderFoundation();
  const providerId = provider.profile?.id ?? null;
  const accountId = auth.mode === 'mock' ? 'mock-user' : auth.user?.id ?? null;
  const scope = providerId && accountId ? `${accountId}:${providerId}` : null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mounted = useRef(true);
  const generation = useRef(0);
  const locks = useRef(new Set<string>());
  const [verification, setVerification] = useState<ProviderVerification | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<Value['action']>(null);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const reload = useCallback(async (silent = false) => {
    const targetScope = scope;
    const targetProvider = providerId;
    const request = ++generation.current;
    if (!targetScope || !targetProvider) {
      setVerification(null);
      setLoadedScope(null);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await verificationRepository.load(targetProvider);
      if (
        mounted.current &&
        scopeRef.current === targetScope &&
        generation.current === request
      ) {
        setVerification(next);
        setLoadedScope(targetScope);
        setError(null);
      }
    } catch (reason) {
      if (
        mounted.current &&
        scopeRef.current === targetScope &&
        generation.current === request
      ) {
        setVerification(null);
        setLoadedScope(targetScope);
        setError(dataErrorKey(reason));
      }
    } finally {
      if (
        mounted.current &&
        scopeRef.current === targetScope &&
        generation.current === request
      ) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [providerId, scope]);

  useEffect(() => {
    generation.current += 1;
    locks.current.clear();
    setVerification(null);
    setLoadedScope(null);
    setLoading(true);
    setAction(null);
    setError(null);
    void reload();
  }, [reload, scope]);

  useEffect(() => {
    if (!providerId || !scope) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstConnection = true;
    const reconcile = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void reload(true);
      }, 120);
    };
    const unsubscribe = realtimeService.providerVerification(
      providerId,
      reconcile,
      status => {
        if (status === 'connected') {
          if (firstConnection) firstConnection = false;
          else reconcile();
        }
      },
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [providerId, reload, scope]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void reload(true);
    });
    return () => subscription.remove();
  }, [reload]);

  const run = useCallback(async (
    key: string,
    nextAction: Value['action'],
    operation: (providerId: string) => Promise<ProviderVerification>,
  ) => {
    const targetScope = scope;
    const targetProvider = providerId;
    if (!targetScope || !targetProvider) throw new Error('Authentication required');
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setAction(nextAction);
    try {
      const next = await operation(targetProvider);
      if (scopeRef.current !== targetScope) {
        throw new Error('The active account changed.');
      }
      setVerification(next);
      setLoadedScope(targetScope);
      setError(null);
    } catch (reason) {
      if (scopeRef.current === targetScope) setError(dataErrorKey(reason));
      throw reason;
    } finally {
      locks.current.delete(key);
      if (mounted.current) setAction(current => current === nextAction ? null : current);
    }
  }, [providerId, scope]);

  const visible =
    loadedScope === scope ? verification : null;
  const value = useMemo<Value>(() => ({
    verification: visible,
    loading,
    refreshing,
    action,
    error,
    reload,
    upload: (type, input) =>
      run(`upload:${type}`, type, id => verificationRepository.upload(id, type, input)),
    remove: documentId =>
      run(`remove:${documentId}`, 'remove', id =>
        verificationRepository.remove(id, documentId)),
    submit: (nationalId, hasSkillCertificate) =>
      run('submit', 'submit', id =>
        verificationRepository.submit(id, nationalId, hasSkillCertificate)),
    simulateReview: status =>
      run(`review:${status}`, 'review', async id => {
        if (!verificationRepository.simulateReview) {
          throw new Error('Mock review is unavailable');
        }
        return verificationRepository.simulateReview(id, status);
      }),
  }), [action, error, loading, refreshing, reload, run, visible]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVerification() {
  const value = useContext(Context);
  if (!value) {
    throw new Error('useVerification must be used within VerificationProvider');
  }
  return value;
}
