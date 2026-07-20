import Storage from 'expo-sqlite/kv-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/src/auth/auth-context';
import { supabaseFavouriteRepository } from '@/src/repositories/supabase-user-repositories';
import { logDataError } from './data-errors';

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
  const { mode, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    let active=true;
    Promise.all([mode==='supabase'&&user?supabaseFavouriteRepository.list():Storage.getItem(FAVOURITES_KEY).then(value=>value?JSON.parse(value) as string[]:[]), Storage.getItem(SEARCHES_KEY)])
      .then(([favourites, searches]) => {
        if (!active) return;
        setFavouriteIds(favourites);
        if (searches) setRecentSearches(JSON.parse(searches));
      })
      .catch(reason => logDataError('favourites',reason))
      .finally(() => {if(active)setReady(true)});
    return()=>{active=false};
  }, [mode,user]);

  const toggleFavourite = useCallback((id: string) => {const existed=favouriteIds.includes(id);const previous=favouriteIds;const next=existed?previous.filter(item=>item!==id):[...previous,id];setFavouriteIds(next);if(mode==='mock'){void Storage.setItem(FAVOURITES_KEY,JSON.stringify(next));return}if(!user){setFavouriteIds(previous);return}void (existed?supabaseFavouriteRepository.remove(id):supabaseFavouriteRepository.add(id)).catch(reason=>{logDataError('favourite mutation',reason);setFavouriteIds(current=>current===next?previous:current)})},[favouriteIds,mode,user]);

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
