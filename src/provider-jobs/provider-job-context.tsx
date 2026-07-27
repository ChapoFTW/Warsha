import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import type { Booking, BookingAttachment, BookingStatus } from '@/src/bookings/booking-types';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { providerJobRepository } from './provider-job-repository';

type Value={jobs:Booking[];loading:boolean;refreshing:boolean;error:TranslationKey|null;actionInFlight:string|null;reload:(refresh?:boolean)=>Promise<void>;getJob:(id:string)=>Booking|undefined;accept:(id:string)=>Promise<void>;reject:(id:string,reason:string)=>Promise<void>;propose:(id:string,date:string,time:string,note:string)=>Promise<void>;advance:(id:string,status:BookingStatus,note?:string)=>Promise<void>;noShow:(id:string,reason:string)=>Promise<void>;complete:(id:string,notes:string,attachments:BookingAttachment[])=>Promise<void>};
const Context=createContext<Value|null>(null);

export function ProviderJobsProvider({children}:PropsWithChildren){
  const provider=useProviderFoundation();const auth=useAuth();
  const providerId=provider.profile?.id??null;
  const accountId=auth.mode==='mock'?'mock-user':auth.user?.id??null;
  const scopeKey=accountId&&providerId?`${accountId}:${providerId}`:null;
  const scopeRef=useRef(scopeKey);scopeRef.current=scopeKey;
  const mounted=useRef(true);const generation=useRef(0);
  const[jobs,setJobs]=useState<Booking[]>([]);const[loadedScope,setLoadedScope]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false);const[error,setError]=useState<TranslationKey|null>(null);const[actionInFlight,setActionInFlight]=useState<string|null>(null);const locks=useRef(new Set<string>());

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current+=1}},[]);
  const reload=useCallback(async(refresh=false)=>{
    const target=scopeKey;const targetProvider=providerId;const request=++generation.current;
    if(!target||!targetProvider){setJobs([]);setLoadedScope(null);setError(null);setLoading(false);setRefreshing(false);return}
    if(refresh)setRefreshing(true);else setLoading(true);
    try{const next=await providerJobRepository.list(targetProvider);if(mounted.current&&scopeRef.current===target&&generation.current===request){setJobs(next);setLoadedScope(target);setError(null)}}
    catch(reason){logDataError('provider jobs',reason);if(mounted.current&&scopeRef.current===target&&generation.current===request){setJobs([]);setLoadedScope(target);setError(dataErrorKey(reason))}}
    finally{if(mounted.current&&scopeRef.current===target&&generation.current===request){setLoading(false);setRefreshing(false)}}
  },[providerId,scopeKey]);
  useEffect(()=>{generation.current+=1;locks.current.clear();setJobs([]);setLoadedScope(null);setError(null);setActionInFlight(null);void reload()},[reload,scopeKey]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state==='active')void reload(true)});return()=>subscription.remove()},[reload]);
  useEffect(()=>{if(!providerId||!scopeKey)return;let first=true;let timer:ReturnType<typeof setTimeout>|undefined;const reconcile=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;void reload(true)},120)};const unsubscribe=realtimeService.providerJobs(providerId,reconcile,status=>{if(status==='connected'){if(first)first=false;else reconcile()}});return()=>{if(timer)clearTimeout(timer);unsubscribe()}},[providerId,reload,scopeKey]);

  const action=useCallback(async(key:string,target:string,operation:()=>Promise<void>)=>{if(locks.current.has(key))return;locks.current.add(key);setActionInFlight(key);try{await operation();if(scopeRef.current!==target)throw new Error('The active account changed.');await reload(true)}catch(reason){logDataError('provider job action',reason);throw reason}finally{locks.current.delete(key);if(mounted.current)setActionInFlight(current=>current===key?null:current)}},[reload]);
  const visibleJobs=useMemo(()=>loadedScope===scopeKey?jobs:[],[jobs,loadedScope,scopeKey]);
  const value=useMemo<Value>(()=>({jobs:visibleJobs,loading,refreshing,error,actionInFlight,reload,getJob:id=>visibleJobs.find(job=>job.id===id),accept:id=>scopeKey?action(id,scopeKey,()=>providerJobRepository.accept(id)):Promise.reject(new Error('Authentication required')),reject:(id,reason)=>scopeKey?action(id,scopeKey,()=>providerJobRepository.reject(id,reason)):Promise.reject(new Error('Authentication required')),propose:(id,date,time,note)=>scopeKey?action(id,scopeKey,()=>providerJobRepository.propose(id,date,time,note)):Promise.reject(new Error('Authentication required')),advance:(id,status,note)=>scopeKey?action(id,scopeKey,()=>providerJobRepository.advance(id,status,note)):Promise.reject(new Error('Authentication required')),noShow:(id,reason)=>scopeKey?action(id,scopeKey,()=>providerJobRepository.noShow(id,reason)):Promise.reject(new Error('Authentication required')),complete:(id,notes,attachments)=>scopeKey?action(id,scopeKey,()=>providerJobRepository.complete(id,notes,attachments)):Promise.reject(new Error('Authentication required'))}),[action,actionInFlight,error,loading,refreshing,reload,scopeKey,visibleJobs]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useProviderJobs(){const value=useContext(Context);if(!value)throw new Error('useProviderJobs must be used inside ProviderJobsProvider');return value}
