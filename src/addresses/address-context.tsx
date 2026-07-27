import { createContext,PropsWithChildren,useCallback,useContext,useEffect,useMemo,useRef,useState } from 'react';

import type { Address } from '@/src/bookings/booking-types';
import { useAuth } from '@/src/auth/auth-context';
import { dataErrorKey,logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { supabaseAddressRepository } from '@/src/repositories/supabase-user-repositories';
import { localAddressRepository } from './address-repository';

type Value={addresses:Address[];loading:boolean;error:TranslationKey|null;reload:()=>Promise<void>;add:(input:Omit<Address,'id'>)=>Promise<Address>;update:(id:string,input:Omit<Address,'id'>)=>Promise<Address>;remove:(id:string)=>Promise<void>;setDefault:(id:string)=>Promise<void>};
const Context=createContext<Value|null>(null);

export function AddressProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();
  const accountKey=mode==='mock'?'mock-customer':user?.id??null;
  const accountRef=useRef(accountKey);accountRef.current=accountKey;
  const mounted=useRef(true);
  const generation=useRef(0);
  const[addresses,setAddresses]=useState<Address[]>([]);
  const[loadedAccount,setLoadedAccount]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<TranslationKey|null>(null);
  const repository=mode==='supabase'?supabaseAddressRepository:localAddressRepository;

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current+=1}},[]);
  const reload=useCallback(async()=>{
    const target=accountKey;const request=++generation.current;
    if(!target){setAddresses([]);setLoadedAccount(null);setError(null);setLoading(false);return}
    setLoading(true);
    try{const next=await repository.list();if(mounted.current&&accountRef.current===target&&generation.current===request){setAddresses(next);setLoadedAccount(target);setError(null)}}
    catch(reason){logDataError('addresses',reason);if(mounted.current&&accountRef.current===target&&generation.current===request){setAddresses([]);setLoadedAccount(target);setError(dataErrorKey(reason))}}
    finally{if(mounted.current&&accountRef.current===target&&generation.current===request)setLoading(false)}
  },[accountKey,repository]);
  useEffect(()=>{generation.current+=1;setAddresses([]);setLoadedAccount(null);setError(null);void reload()},[accountKey,reload]);

  const ensureCurrent=(target:string)=>{if(accountRef.current!==target)throw new Error('The active account changed.')};
  const visibleAddresses=useMemo(()=>loadedAccount===accountKey?addresses:[],[accountKey,addresses,loadedAccount]);
  const value=useMemo<Value>(()=>({
    addresses:visibleAddresses,loading,error,reload,
    add:async input=>{const target=accountKey;if(!target)throw new Error('Authentication required');const item=await repository.add(input);ensureCurrent(target);await reload();return item},
    update:async(id,input)=>{const target=accountKey;if(!target)throw new Error('Authentication required');const item=await repository.update(id,input);ensureCurrent(target);await reload();return item},
    remove:async id=>{const target=accountKey;if(!target)throw new Error('Authentication required');await repository.remove(id);ensureCurrent(target);await reload()},
    setDefault:async id=>{const target=accountKey;if(!target)throw new Error('Authentication required');await repository.setDefault(id);ensureCurrent(target);await reload()},
  }),[accountKey,error,loading,reload,repository,visibleAddresses]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAddresses(){const value=useContext(Context);if(!value)throw new Error('useAddresses must be used inside AddressProvider');return value}
