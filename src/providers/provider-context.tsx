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
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { accountHydrationReady } from '@/src/navigation/worker-route-policy';
import { emitMockRealtime } from '@/src/realtime/realtime-service';

import { providerRepository } from './provider-repository';
import type {
  PortfolioItem,
  PortfolioItemInput,
  ProviderCertificate,
  ProviderCertificateInput,
  ProviderDraft,
  ProviderMediaInput,
  ProviderPhoto,
} from './provider-types';

type AppMode = 'customer' | 'provider';
type Value = {
  profile: ProviderDraft | null;
  portfolio: PortfolioItem[];
  certificates: ProviderCertificate[];
  mode: AppMode;
  loading: boolean;
  saving: boolean;
  error: TranslationKey | null;
  activate: (name: string) => Promise<void>;
  save: (value: ProviderDraft, submit?: boolean) => Promise<void>;
  setAvailability: (available: boolean) => Promise<void>;
  setMode: (mode: AppMode) => Promise<void>;
  reload: () => Promise<void>;
  reloadAssets: () => Promise<void>;
  replaceAvatar: (input: ProviderMediaInput) => Promise<ProviderPhoto>;
  deleteAvatar: () => Promise<void>;
  savePortfolioItem: (value: PortfolioItemInput) => Promise<void>;
  uploadPortfolioImage: (itemId: string, input: ProviderMediaInput) => Promise<void>;
  deletePortfolioImage: (imageId: string) => Promise<void>;
  deletePortfolioItem: (itemId: string) => Promise<void>;
  reorderPortfolio: (itemIds: string[]) => Promise<void>;
  reorderPortfolioImages: (itemId: string, imageIds: string[]) => Promise<void>;
  saveCertificate: (value: ProviderCertificateInput) => Promise<void>;
  uploadCertificate: (certificateId: string, input: ProviderMediaInput) => Promise<void>;
  submitCertificate: (certificateId: string) => Promise<void>;
  deleteCertificate: (certificateId: string) => Promise<void>;
  simulateCertificateReview: (certificateId: string, approved: boolean) => Promise<void>;
};

const Context = createContext<Value | null>(null);

export function ProviderFoundationProvider({ children }: PropsWithChildren) {
  const { mode: dataMode, user } = useAuth();
  const accountKey = dataMode === 'mock' ? 'mock-user' : user?.id ?? null;
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;
  const mounted = useRef(true);
  const generation = useRef(0);
  const locks = useRef(new Set<string>());
  const [profile, setProfile] = useState<ProviderDraft | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [certificates, setCertificates] = useState<ProviderCertificate[]>([]);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [mode, setModeState] = useState<AppMode>('customer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const loadAssets = useCallback(async (target: string) => {
    const [nextPortfolio, nextCertificates] = await Promise.all([
      providerRepository.listPortfolio(target),
      providerRepository.listCertificates(target),
    ]);
    return { nextPortfolio, nextCertificates };
  }, []);

  const reload = useCallback(async () => {
    const target = accountKey;
    const request = ++generation.current;
    if (!target) {
      setProfile(null); setPortfolio([]); setCertificates([]); setLoadedAccount(null);
      setModeState('customer'); setError(null); setLoading(false); return;
    }
    setLoading(true);
    try {
      const next = await providerRepository.load(target);
      const assets = next ? await loadAssets(target) : { nextPortfolio: [], nextCertificates: [] };
      if (mounted.current && accountRef.current === target && generation.current === request) {
        setProfile(next); setPortfolio(assets.nextPortfolio); setCertificates(assets.nextCertificates);
        // Mode is intentionally session-scoped. AuthGate initializes it from
        // the account's intended role after both account providers hydrate.
        // Persisting customer mode is what made workers reopen on customer
        // discovery after a restart.
        setLoadedAccount(target); setModeState('customer'); setError(null);
      }
    } catch (reason) {
      logDataError('provider foundation', reason);
      if (mounted.current && accountRef.current === target && generation.current === request) {
        setProfile(null); setPortfolio([]); setCertificates([]); setLoadedAccount(target);
        setModeState('customer'); setError(dataErrorKey(reason));
      }
    } finally {
      if (mounted.current && accountRef.current === target && generation.current === request) setLoading(false);
    }
  }, [accountKey, loadAssets]);

  useEffect(() => {
    generation.current += 1; locks.current.clear(); setProfile(null); setPortfolio([]);
    setCertificates([]); setLoadedAccount(null); setModeState('customer'); setSaving(false); setError(null);
    void reload();
  }, [accountKey, reload]);

  const visibleProfile = loadedAccount === accountKey ? profile : null;
  const visiblePortfolio = useMemo(() => loadedAccount === accountKey ? portfolio : [], [accountKey, loadedAccount, portfolio]);
  const visibleCertificates = useMemo(() => loadedAccount === accountKey ? certificates : [], [accountKey, certificates, loadedAccount]);
  const accountReady = accountHydrationReady({
    activeAccountKey: accountKey,
    loadedAccountKey: loadedAccount,
    settled: !loading,
  });

  const run = useCallback(async <T,>(
    key: string,
    operation: (accountId: string) => Promise<T>,
    apply: (value: T) => void,
  ) => {
    const target = accountKey;
    if (!target) throw new Error('Authentication required');
    if (locks.current.has(key)) return;
    locks.current.add(key); setSaving(true);
    try {
      const result = await operation(target);
      if (accountRef.current !== target) throw new Error('The active account changed.');
      apply(result); setLoadedAccount(target); setError(null);
      emitMockRealtime({ table: 'provider_profiles', event: 'UPDATE', id: visibleProfile?.id });
    } catch (reason) {
      logDataError(`provider ${key}`, reason);
      if (accountRef.current === target) setError(dataErrorKey(reason));
      throw reason;
    } finally {
      locks.current.delete(key);
      if (mounted.current && accountRef.current === target && locks.current.size === 0) setSaving(false);
    }
  }, [accountKey, visibleProfile?.id]);

  const value = useMemo<Value>(() => ({
    profile: visibleProfile,
    portfolio: visiblePortfolio,
    certificates: visibleCertificates,
    mode: visibleProfile ? mode : 'customer',
    loading: !accountReady,
    saving,
    error,
    reload,
    reloadAssets: async () => {
      const target = accountKey;
      if (!target || !visibleProfile) return;
      const assets = await loadAssets(target);
      if (accountRef.current === target) { setPortfolio(assets.nextPortfolio); setCertificates(assets.nextCertificates); }
    },
    activate: name => run('activation', id => providerRepository.activate(id, name), next => {
      setProfile(next);
      setModeState('provider');
    }),
    save: (nextProfile, submit) => run('save', id => providerRepository.save(id, nextProfile, submit), setProfile),
    setAvailability: available => run('availability', id => providerRepository.setAvailability(id, available), setProfile),
    setMode: async next => {
      const target = accountKey;
      if (!target || next === 'provider' && !visibleProfile) return;
      if (accountRef.current === target) setModeState(next);
    },
    replaceAvatar: async input => {
      let result: ProviderPhoto | undefined;
      await run('photo', id => providerRepository.replaceAvatar(id, input), photo => {
        result = photo;
        setProfile(current => current ? { ...current, avatarPath: photo.storagePath, avatarUrl: photo.previewUrl } : current);
      });
      if (!result) throw new Error('Photo upload is already running');
      return result;
    },
    deleteAvatar: () => run('photo-delete', id => providerRepository.deleteAvatar(id), () => {
      setProfile(current => current ? { ...current, avatarPath: '', avatarUrl: '' } : current);
    }),
    savePortfolioItem: item => run('portfolio-save', id => providerRepository.savePortfolioItem(id, item), setPortfolio),
    uploadPortfolioImage: (itemId, input) => run(`portfolio-upload:${itemId}`, id => providerRepository.uploadPortfolioImage(id, itemId, input), setPortfolio),
    deletePortfolioImage: imageId => run(`portfolio-image-delete:${imageId}`, id => providerRepository.deletePortfolioImage(id, imageId), setPortfolio),
    deletePortfolioItem: itemId => run(`portfolio-delete:${itemId}`, id => providerRepository.deletePortfolioItem(id, itemId), setPortfolio),
    reorderPortfolio: itemIds => run('portfolio-reorder', id => providerRepository.reorderPortfolio(id, itemIds), setPortfolio),
    reorderPortfolioImages: (itemId, imageIds) => run(`portfolio-image-reorder:${itemId}`, id => providerRepository.reorderPortfolioImages(id, itemId, imageIds), setPortfolio),
    saveCertificate: item => run('certificate-save', id => providerRepository.saveCertificate(id, item), setCertificates),
    uploadCertificate: (certificateId, input) => run(`certificate-upload:${certificateId}`, id => providerRepository.uploadCertificate(id, certificateId, input), setCertificates),
    submitCertificate: certificateId => run(`certificate-submit:${certificateId}`, id => providerRepository.submitCertificate(id, certificateId), setCertificates),
    deleteCertificate: certificateId => run(`certificate-delete:${certificateId}`, id => providerRepository.deleteCertificate(id, certificateId), setCertificates),
    simulateCertificateReview: (certificateId, approved) => run(`certificate-review:${certificateId}`, async id => {
      if (!providerRepository.simulateCertificateReview) throw new Error('Mock review is unavailable');
      return providerRepository.simulateCertificateReview(id, certificateId, approved);
    }, setCertificates),
  }), [
    accountKey, accountReady, error, loadAssets, mode, reload, run, saving,
    visibleCertificates, visiblePortfolio, visibleProfile,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProviderFoundation() {
  const value = useContext(Context);
  if (!value) throw new Error('useProviderFoundation must be used within ProviderFoundationProvider');
  return value;
}
