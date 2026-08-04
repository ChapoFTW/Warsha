import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { logDataError } from '@/src/data/data-errors';
import { useLocalPreferences } from '@/src/data/local-preferences';

import { discoveryRepository } from './discovery-repository';
import {
  type DiscoveryFilterMetadata,
  type DiscoveryHome,
  type DiscoveryProviderCard,
  type DiscoverySuggestions,
} from './discovery-types';

type DiscoveryValue = {
  ready: boolean;
  /** Null until an account exists. Every read below is scoped to it. */
  accountKey: string | null;
  suggestions: DiscoverySuggestions;
  filterMetadata: DiscoveryFilterMetadata | null;
  recentlyViewed: DiscoveryProviderCard[];
  home: DiscoveryHome | null;
  recordSearch: (query: string) => void;
  clearSearches: () => void;
  recordView: (providerId: string) => void;
  clearRecentlyViewed: () => void;
  reload: () => void;
};

const emptySuggestions: DiscoverySuggestions = {
  recentSearches: [],
  suggestedCategories: [],
  commonServices: [],
};

const DiscoveryContext = createContext<DiscoveryValue | null>(null);

/**
 * Account-isolated discovery state.
 *
 * The generation guard is the same pattern the support and preference contexts
 * use: a response that arrives after the account changed is discarded, and
 * nothing is rendered for an account other than the one currently loaded. That
 * is what makes "sign out of A, sign in as B" incapable of showing A's history
 * for even one frame.
 */
export function DiscoveryProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  const { favouriteIds } = useLocalPreferences();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;

  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<DiscoverySuggestions>(emptySuggestions);
  const [filterMetadata, setFilterMetadata] = useState<DiscoveryFilterMetadata | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<DiscoveryProviderCard[]>([]);
  const [home, setHome] = useState<DiscoveryHome | null>(null);
  const [revision, setRevision] = useState(0);

  const generation = useRef(0);
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    const target = accountKey;
    setReady(false);
    setLoadedAccount(null);
    setSuggestions(emptySuggestions);
    setRecentlyViewed([]);
    setHome(null);

    void Promise.all([
      discoveryRepository.suggestions(target),
      discoveryRepository.filterMetadata(),
      discoveryRepository.recentlyViewed(target),
      discoveryRepository.home(target, favouriteIds),
    ])
      .then(([nextSuggestions, metadata, viewed, nextHome]) => {
        if (generation.current !== current) return;
        setSuggestions(nextSuggestions);
        setFilterMetadata(metadata);
        setRecentlyViewed(viewed);
        setHome(nextHome);
        setLoadedAccount(target);
      })
      .catch(reason => {
        if (generation.current !== current) return;
        logDataError('discovery', reason);
        setLoadedAccount(target);
      })
      .finally(() => { if (generation.current === current) setReady(true); });
  }, [accountKey, favouriteIds, revision]);

  const reload = useCallback(() => setRevision(value => value + 1), []);

  const recordSearch = useCallback((query: string) => {
    const target = accountRef.current;
    if (!target) return;
    void discoveryRepository.recordSearch(target, query)
      .then(() => discoveryRepository.suggestions(target))
      .then(next => { if (accountRef.current === target) setSuggestions(next); })
      .catch(reason => logDataError('discovery recent search', reason));
  }, []);

  const clearSearches = useCallback(() => {
    const target = accountRef.current;
    if (!target) return;
    setSuggestions(current => ({ ...current, recentSearches: [] }));
    void discoveryRepository.clearSearches(target)
      .catch(reason => logDataError('discovery clear searches', reason));
  }, []);

  const recordView = useCallback((providerId: string) => {
    const target = accountRef.current;
    if (!target) return;
    void discoveryRepository.recordView(target, providerId)
      .then(() => discoveryRepository.recentlyViewed(target))
      .then(next => { if (accountRef.current === target) setRecentlyViewed(next); })
      .catch(reason => logDataError('discovery provider view', reason));
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    const target = accountRef.current;
    if (!target) return;
    setRecentlyViewed([]);
    void discoveryRepository.clearRecentlyViewed(target)
      .catch(reason => logDataError('discovery clear history', reason));
  }, []);

  const isCurrent = loadedAccount === accountKey;
  const value = useMemo<DiscoveryValue>(() => ({
    ready: ready && isCurrent,
    accountKey,
    suggestions: isCurrent ? suggestions : emptySuggestions,
    filterMetadata,
    recentlyViewed: isCurrent ? recentlyViewed : [],
    home: isCurrent ? home : null,
    recordSearch,
    clearSearches,
    recordView,
    clearRecentlyViewed,
    reload,
  }), [accountKey, clearRecentlyViewed, clearSearches, filterMetadata, home, isCurrent, ready,
       recentlyViewed, recordSearch, recordView, reload, suggestions]);

  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryValue {
  const context = useContext(DiscoveryContext);
  if (!context) throw new Error('useDiscovery must be used inside DiscoveryProvider');
  return context;
}
