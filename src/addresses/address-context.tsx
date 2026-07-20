import { createContext,PropsWithChildren,useCallback,useContext,useEffect,useMemo,useState } from 'react';
import type { Address } from '@/src/bookings/booking-types';
import { useAuth } from '@/src/auth/auth-context';
import { localAddressRepository } from './address-repository';
import { supabaseAddressRepository } from '@/src/repositories/supabase-user-repositories';
import { dataErrorKey,logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
type Value={addresses:Address[];loading:boolean;error:TranslationKey|null;reload:()=>Promise<void>;add:(input:Omit<Address,'id'>)=>Promise<Address>;update:(id:string,input:Omit<Address,'id'>)=>Promise<Address>;remove:(id:string)=>Promise<void>;setDefault:(id:string)=>Promise<void>};
const Context=createContext<Value|null>(null);
export function AddressProvider({children}:PropsWithChildren){const{mode,user}=useAuth();const[addresses,setAddresses]=useState<Address[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState<TranslationKey|null>(null);const repository=mode==='supabase'?supabaseAddressRepository:localAddressRepository;const reload=useCallback(async()=>{if(mode==='supabase'&&!user){setAddresses([]);setLoading(false);return}setLoading(true);try{setAddresses(await repository.list());setError(null)}catch(reason){logDataError('addresses',reason);setError(dataErrorKey(reason))}finally{setLoading(false)}},[mode,repository,user]);useEffect(()=>{void reload()},[reload]);const value=useMemo<Value>(()=>({addresses,loading,error,reload,add:async input=>{const item=await repository.add(input);await reload();return item},update:async(id,input)=>{const item=await repository.update(id,input);await reload();return item},remove:async id=>{await repository.remove(id);await reload()},setDefault:async id=>{await repository.setDefault(id);await reload()}}),[addresses,error,loading,reload,repository]);return <Context.Provider value={value}>{children}</Context.Provider>}
export function useAddresses(){const value=useContext(Context);if(!value)throw new Error('useAddresses must be used inside AddressProvider');return value}
