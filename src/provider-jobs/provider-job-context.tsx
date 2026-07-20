import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Booking, BookingAttachment, BookingStatus } from '@/src/bookings/booking-types';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { providerJobRepository } from './provider-job-repository';

type Value={jobs:Booking[];loading:boolean;refreshing:boolean;error:TranslationKey|null;actionInFlight:string|null;reload:(refresh?:boolean)=>Promise<void>;getJob:(id:string)=>Booking|undefined;accept:(id:string)=>Promise<void>;reject:(id:string,reason:string)=>Promise<void>;propose:(id:string,date:string,time:string,note:string)=>Promise<void>;advance:(id:string,status:BookingStatus,note?:string)=>Promise<void>;noShow:(id:string,reason:string)=>Promise<void>;complete:(id:string,notes:string,attachments:BookingAttachment[])=>Promise<void>};
const Context=createContext<Value|null>(null);
export function ProviderJobsProvider({children}:PropsWithChildren){
  const provider=useProviderFoundation();const[jobs,setJobs]=useState<Booking[]>([]);const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false);const[error,setError]=useState<TranslationKey|null>(null);const[actionInFlight,setActionInFlight]=useState<string|null>(null);const locks=useRef(new Set<string>());
  const reload=useCallback(async(refresh=false)=>{if(!provider.profile?.id){setJobs([]);setLoading(false);return}if(refresh)setRefreshing(true);else setLoading(true);try{setJobs(await providerJobRepository.list(provider.profile.id));setError(null)}catch(reason){logDataError('provider jobs',reason);setError(dataErrorKey(reason))}finally{setLoading(false);setRefreshing(false)}},[provider.profile?.id]);
  useEffect(()=>{void reload()},[reload]);
  const action=useCallback(async(key:string,operation:()=>Promise<void>)=>{if(locks.current.has(key))return;locks.current.add(key);setActionInFlight(key);try{await operation();await reload(true)}catch(reason){logDataError('provider job action',reason);throw reason}finally{locks.current.delete(key);setActionInFlight(current=>current===key?null:current)}},[reload]);
  const value=useMemo<Value>(()=>({jobs,loading,refreshing,error,actionInFlight,reload,getJob:id=>jobs.find(job=>job.id===id),accept:id=>action(id,()=>providerJobRepository.accept(id)),reject:(id,reason)=>action(id,()=>providerJobRepository.reject(id,reason)),propose:(id,date,time,note)=>action(id,()=>providerJobRepository.propose(id,date,time,note)),advance:(id,status,note)=>action(id,()=>providerJobRepository.advance(id,status,note)),noShow:(id,reason)=>action(id,()=>providerJobRepository.noShow(id,reason)),complete:(id,notes,attachments)=>action(id,()=>providerJobRepository.complete(id,notes,attachments))}),[action,actionInFlight,error,jobs,loading,refreshing,reload]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useProviderJobs(){const value=useContext(Context);if(!value)throw new Error('useProviderJobs must be used inside ProviderJobsProvider');return value}
