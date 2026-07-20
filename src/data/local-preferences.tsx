import Storage from 'expo-sqlite/kv-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const FAVOURITES_KEY = 'warsha:favourites:v1';
const SEARCHES_KEY = 'warsha:recent-searches:v1';

type Value = {
  ready: boolean;
  favouriteIds: string[];
  recentSearches: string[];
  isFavourite: (id: string) => boolean;
  toggleFavourite: (id: string) => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
};

const Context = createContext<Value | null>(null);

export function LocalPreferencesProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([Storage.getItem(FAVOURITES_KEY), Storage.getItem(SEARCHES_KEY)])
      .then(([favourites, searches]) => {
        if (favourites) setFavouriteIds(JSON.parse(favourites));
        if (searches) setRecentSearches(JSON.parse(searches));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persistFavourites = useCallback((next: string[]) => {
    setFavouriteIds(next);
    void Storage.setItem(FAVOURITES_KEY, JSON.stringify(next));
  }, []);

  const toggleFavourite = useCallback(
    (id: string) => persistFavourites(favouriteIds.includes(id) ? favouriteIds.filter((item) => item !== id) : [...favouriteIds, id]),
    [favouriteIds, persistFavourites],
  );

  const addRecentSearch = useCallback((query: string) => {
    const value = query.trim();
    if (!value) return;
    setRecentSearches((current) => {
      const next = [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6);
      if (next.length === current.length && next.every((item, index) => item === current[index])) return current;
      void Storage.setItem(SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    void Storage.removeItem(SEARCHES_KEY);
  }, []);

  const value = useMemo<Value>(
    () => ({ ready, favouriteIds, recentSearches, isFavourite: (id) => favouriteIds.includes(id), toggleFavourite, addRecentSearch, clearRecentSearches }),
    [addRecentSearch, clearRecentSearches, favouriteIds, ready, recentSearches, toggleFavourite],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocalPreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('useLocalPreferences must be used inside LocalPreferencesProvider');
  return context;
}
