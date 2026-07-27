import Storage from 'expo-sqlite/kv-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { supabaseFavouriteRepository } from '@/src/repositories/supabase-user-repositories';
import { logDataError } from './data-errors';

const FAVOURITES_KEY='warsha:favourites:v1';
const SEARCHES_KEY='warsha:recent-searches:v1';
function parseStringArray(value:string|null){if(!value)return[];const parsed:unknown=JSON.parse(value);return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[]}

type Value={ready:boolean;favouriteIds:string[];recentSearches:string[];isFavourite:(id:string)=>boolean;toggleFavourite:(id:string)=>void;addRecentSearch:(query:string)=>void;clearRecentSearches:()=>void};
const Context=createContext<Value|null>(null);

export function LocalPreferencesProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();
  const accountKey=mode==='mock'?'mock-user':user?.id??null;
  const searchKey=mode==='mock'?SEARCHES_KEY:`${SEARCHES_KEY}:${accountKey??'guest'}`;
  const accountRef=useRef(accountKey);accountRef.current=accountKey;
  const pendingFavourites=useRef(new Set<string>());
  const[loadedAccount,setLoadedAccount]=useState<string|null>(null);
  const[ready,setReady]=useState(false);
  const[favouriteIds,setFavouriteIds]=useState<string[]>([]);
  const[recentSearches,setRecentSearches]=useState<string[]>([]);

  useEffect(()=>{
    let active=true;const target=accountKey;
    pendingFavourites.current.clear();setReady(false);setLoadedAccount(null);setFavouriteIds([]);setRecentSearches([]);
    if(!target){setReady(true);return()=>{active=false}}
    const favouritesPromise=mode==='mock'?Storage.getItem(FAVOURITES_KEY).then(parseStringArray):supabaseFavouriteRepository.list();
    Promise.all([favouritesPromise,Storage.getItem(searchKey).then(parseStringArray)])
      .then(([favourites,searches])=>{if(!active||accountRef.current!==target)return;setFavouriteIds(favourites);setRecentSearches(searches);setLoadedAccount(target)})
      .catch(reason=>logDataError('preferences',reason))
      .finally(()=>{if(active&&accountRef.current===target){setLoadedAccount(target);setReady(true)}});
    return()=>{active=false};
  },[accountKey,mode,searchKey]);

  const visibleFavourites=useMemo(()=>loadedAccount===accountKey?favouriteIds:[],[accountKey,favouriteIds,loadedAccount]);
  const visibleSearches=useMemo(()=>loadedAccount===accountKey?recentSearches:[],[accountKey,loadedAccount,recentSearches]);
  const toggleFavourite=useCallback((id:string)=>{
    const target=accountKey;if(!target||pendingFavourites.current.has(id))return;
    const existed=visibleFavourites.includes(id);const previous=visibleFavourites;const next=existed?previous.filter(item=>item!==id):[...previous,id];
    pendingFavourites.current.add(id);setFavouriteIds(next);
    const operation=mode==='mock'?Storage.setItem(FAVOURITES_KEY,JSON.stringify(next)):(existed?supabaseFavouriteRepository.remove(id):supabaseFavouriteRepository.add(id));
    void operation.catch(reason=>{logDataError('favourite mutation',reason);if(accountRef.current===target)setFavouriteIds(current=>current===next?previous:current)}).finally(()=>pendingFavourites.current.delete(id));
  },[accountKey,mode,visibleFavourites]);
  const addRecentSearch=useCallback((query:string)=>{const target=accountKey;const value=query.trim();if(!target||!value)return;setRecentSearches(current=>{if(accountRef.current!==target)return current;const next=[value,...current.filter(item=>item.toLowerCase()!==value.toLowerCase())].slice(0,6);if(next.length===current.length&&next.every((item,index)=>item===current[index]))return current;void Storage.setItem(searchKey,JSON.stringify(next)).catch(reason=>logDataError('recent searches',reason));return next})},[accountKey,searchKey]);
  const clearRecentSearches=useCallback(()=>{const target=accountKey;if(!target)return;setRecentSearches([]);void Storage.removeItem(searchKey).catch(reason=>logDataError('recent searches',reason))},[accountKey,searchKey]);
  const value=useMemo<Value>(()=>({ready:ready&&loadedAccount===accountKey,favouriteIds:visibleFavourites,recentSearches:visibleSearches,isFavourite:id=>visibleFavourites.includes(id),toggleFavourite,addRecentSearch,clearRecentSearches}),[accountKey,addRecentSearch,clearRecentSearches,loadedAccount,ready,toggleFavourite,visibleFavourites,visibleSearches]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocalPreferences(){const context=useContext(Context);if(!context)throw new Error('useLocalPreferences must be used inside LocalPreferencesProvider');return context}
