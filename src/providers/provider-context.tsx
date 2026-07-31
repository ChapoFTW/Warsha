import Storage from 'expo-sqlite/kv-store';
import { createContext,PropsWithChildren,useCallback,useContext,useEffect,useMemo,useRef,useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { dataErrorKey,logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { providerRepository } from './provider-repository';
import type { ProviderDraft } from './provider-types';

type AppMode='customer'|'provider';
type Value={profile:ProviderDraft|null;mode:AppMode;loading:boolean;saving:boolean;error:TranslationKey|null;activate:(name:string)=>Promise<void>;save:(value:ProviderDraft,submit?:boolean)=>Promise<void>;setAvailability:(available:boolean)=>Promise<void>;setMode:(mode:AppMode)=>Promise<void>;reload:()=>Promise<void>;uploadAvatar:(uri:string,mime?:string)=>Promise<string>};
const Context=createContext<Value|null>(null);
const MODE_KEY='warsha:selected-app-mode:v1';

export function ProviderFoundationProvider({children}:PropsWithChildren){
  const{mode:dataMode,user}=useAuth();
  const accountKey=dataMode==='mock'?'mock-user':user?.id??null;
  const modeStorageKey=dataMode==='mock'?MODE_KEY:`${MODE_KEY}:${accountKey??'guest'}`;
  const accountRef=useRef(accountKey);accountRef.current=accountKey;
  const mounted=useRef(true);
  const generation=useRef(0);
  const[profile,setProfile]=useState<ProviderDraft|null>(null);
  const[loadedAccount,setLoadedAccount]=useState<string|null>(null);
  const[mode,setModeState]=useState<AppMode>('customer');
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState<TranslationKey|null>(null);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current+=1}},[]);
  const reload=useCallback(async()=>{
    const target=accountKey;const request=++generation.current;
    if(!target){setProfile(null);setLoadedAccount(null);setModeState('customer');setError(null);setLoading(false);return}
    setLoading(true);
    try{
      const[next,savedMode]=await Promise.all([providerRepository.load(),Storage.getItem(modeStorageKey)]);
      if(mounted.current&&accountRef.current===target&&generation.current===request){setProfile(next);setLoadedAccount(target);setModeState(savedMode==='provider'&&next?'provider':'customer');setError(null)}
    }catch(reason){
      logDataError('provider foundation',reason);
      if(mounted.current&&accountRef.current===target&&generation.current===request){setProfile(null);setLoadedAccount(target);setModeState('customer');setError(dataErrorKey(reason))}
    }finally{if(mounted.current&&accountRef.current===target&&generation.current===request)setLoading(false)}
  },[accountKey,modeStorageKey]);
  useEffect(()=>{generation.current+=1;setProfile(null);setLoadedAccount(null);setModeState('customer');setSaving(false);setError(null);void reload()},[accountKey,reload]);

  const visibleProfile=loadedAccount===accountKey?profile:null;
  const value=useMemo<Value>(()=>({
    profile:visibleProfile,mode:visibleProfile?mode:'customer',loading,saving,error,reload,
    activate:async name=>{const target=accountKey;if(!target)throw new Error('Authentication required');setSaving(true);try{const next=await providerRepository.activate(name);if(accountRef.current!==target)throw new Error('The active account changed.');setProfile(next);setLoadedAccount(target);await Storage.setItem(modeStorageKey,'provider');if(accountRef.current===target)setModeState('provider')}catch(reason){logDataError('provider activation',reason);if(accountRef.current===target)setError(dataErrorKey(reason));throw reason}finally{if(mounted.current&&accountRef.current===target)setSaving(false)}},
    save:async(nextProfile,submit)=>{const target=accountKey;if(!target)throw new Error('Authentication required');setSaving(true);try{const next=await providerRepository.save(nextProfile,submit);if(accountRef.current!==target)throw new Error('The active account changed.');setProfile(next);setLoadedAccount(target);setError(null)}catch(reason){logDataError('provider save',reason);if(accountRef.current===target)setError(dataErrorKey(reason));throw reason}finally{if(mounted.current&&accountRef.current===target)setSaving(false)}},
    setAvailability:async available=>{const target=accountKey;if(!target)throw new Error('Authentication required');setSaving(true);try{const next=await providerRepository.setAvailability(available);if(accountRef.current!==target)throw new Error('The active account changed.');setProfile(next);setLoadedAccount(target);setError(null)}catch(reason){logDataError('provider availability',reason);if(accountRef.current===target)setError(dataErrorKey(reason));throw reason}finally{if(mounted.current&&accountRef.current===target)setSaving(false)}},
    setMode:async next=>{const target=accountKey;if(!target||next==='provider'&&!visibleProfile)return;await Storage.setItem(modeStorageKey,next);if(accountRef.current===target)setModeState(next)},
    uploadAvatar:async(uri,mime)=>{const target=accountKey;if(!target)throw new Error('Authentication required');const result=await providerRepository.uploadAvatar(uri,mime);if(accountRef.current!==target)throw new Error('The active account changed.');return result},
  }),[accountKey,error,loading,mode,modeStorageKey,reload,saving,visibleProfile]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProviderFoundation(){const value=useContext(Context);if(!value)throw new Error('useProviderFoundation must be used within ProviderFoundationProvider');return value}
