import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import { useLocalization } from '@/src/i18n/localization';
import { realtimeService } from '@/src/realtime/realtime-service';
import { supabaseBookingRepository } from '@/src/repositories/supabase-user-repositories';
import { localBookingRepository } from './booking-repository';
import type { Booking, BookingStatus, CancellationReason, NewBooking } from './booking-types';

export type { Booking,BookingStatus,BookingStatusHistory,BookingAttachment,Address,TimeSlot,PriceBreakdown,CancellationReason,NewBooking } from './booking-types';

type Value={bookings:Booking[];loading:boolean;error:string|null;creating:boolean;actionInFlight:string|null;createBooking:(input:NewBooking)=>Promise<Booking>;cancelBooking:(id:string,reason?:CancellationReason)=>Promise<void>;rescheduleBooking:(id:string,date:string,time:string)=>Promise<void>;simulateStatus:(id:string,status:BookingStatus)=>Promise<void>;getBooking:(id:string)=>Booking|undefined;reload:(silent?:boolean)=>Promise<void>};
const Context=createContext<Value|null>(null);

export function BookingProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();
  const{t}=useLocalization();
  const repository=mode==='supabase'?supabaseBookingRepository:localBookingRepository;
  const accountKey=mode==='mock'?'mock-customer':user?.id??null;
  const accountRef=useRef(accountKey);accountRef.current=accountKey;
  const mounted=useRef(true);
  const generation=useRef(0);
  const[loadedAccount,setLoadedAccount]=useState<string|null>(null);
  const[bookings,setBookings]=useState<Booking[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);
  const[creating,setCreating]=useState(false);
  const[actionInFlight,setActionInFlight]=useState<string|null>(null);
  const locks=useRef(new Set<string>());
  const submitLock=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current+=1}},[]);

  const reload=useCallback(async(silent=false)=>{
    const target=accountKey;
    const request=++generation.current;
    if(!target){
      setBookings([]);setLoadedAccount(null);setError(null);setLoading(false);
      return;
    }
    if(!silent)setLoading(true);
    try{
      const next=await repository.list();
      if(!mounted.current||accountRef.current!==target||generation.current!==request)return;
      setBookings(next);setLoadedAccount(target);setError(null);
    }catch(reason){
      logDataError('bookings',reason);
      if(mounted.current&&accountRef.current===target&&generation.current===request){setBookings([]);setLoadedAccount(target);setError(t(dataErrorKey(reason)))}
    }finally{
      if(mounted.current&&accountRef.current===target&&generation.current===request)setLoading(false);
    }
  },[accountKey,repository,t]);

  useEffect(()=>{
    generation.current+=1;
    locks.current.clear();submitLock.current=false;
    setBookings([]);setLoadedAccount(null);setError(null);setCreating(false);setActionInFlight(null);
    void reload();
  },[accountKey,reload]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state==='active')void reload(true)});return()=>subscription.remove()},[reload]);
  useEffect(()=>{if(!accountKey)return;let first=true;let timer:ReturnType<typeof setTimeout>|undefined;const reconcile=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;void reload(true)},120)};const unsubscribe=realtimeService.customerBookings(accountKey,reconcile,status=>{if(status==='connected'){if(first)first=false;else reconcile()}});return()=>{if(timer)clearTimeout(timer);unsubscribe()}},[accountKey,reload]);

  const update=useCallback((booking:Booking,target:string)=>{if(mounted.current&&accountRef.current===target)setBookings(current=>[booking,...current.filter(item=>item.id!==booking.id)])},[]);
  const runAction=useCallback(async(key:string,target:string,operation:()=>Promise<Booking>)=>{
    if(locks.current.has(key))return;
    locks.current.add(key);setActionInFlight(key);
    try{const booking=await operation();if(accountRef.current!==target)throw new Error('The active account changed.');update(booking,target)}
    catch(reason){logDataError('booking mutation',reason);throw reason}
    finally{locks.current.delete(key);if(mounted.current)setActionInFlight(current=>current===key?null:current)}
  },[update]);

  const visibleBookings=useMemo(()=>loadedAccount===accountKey?bookings:[],[accountKey,bookings,loadedAccount]);
  const value=useMemo<Value>(()=>({
    bookings:visibleBookings,loading,error,creating,actionInFlight,reload,
    getBooking:id=>visibleBookings.find(item=>item.id===id),
    createBooking:async input=>{
      const target=accountKey;if(!target)throw new Error('Authentication required');
      if(submitLock.current)throw new Error('Duplicate submission');
      submitLock.current=true;setCreating(true);
      try{const booking=await repository.create(input);if(accountRef.current!==target)throw new Error('The active account changed.');update(booking,target);return booking}
      finally{submitLock.current=false;if(mounted.current)setCreating(false)}
    },
    cancelBooking:async(id,reason='other')=>{if(!accountKey)throw new Error('Authentication required');return runAction(`${id}:mutation`,accountKey,()=>repository.cancel(id,reason))},
    rescheduleBooking:async(id,date,time)=>{if(!accountKey)throw new Error('Authentication required');return runAction(`${id}:mutation`,accountKey,()=>repository.reschedule(id,date,time))},
    simulateStatus:async(id,status)=>{if(mode==='supabase')return;if(!accountKey)return;return runAction(`${id}:mutation`,accountKey,()=>localBookingRepository.updateStatus(id,status,'Development simulation'))},
  }),[accountKey,actionInFlight,creating,error,loading,mode,reload,repository,runAction,update,visibleBookings]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBookings(){const context=useContext(Context);if(!context)throw new Error('useBookings must be used inside BookingProvider');return context}
