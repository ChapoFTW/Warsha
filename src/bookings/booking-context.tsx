import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import { useLocalization } from '@/src/i18n/localization';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import { supabaseBookingRepository } from '@/src/repositories/supabase-user-repositories';
import { localBookingRepository } from './booking-repository';
import type { Booking, BookingStatus, CancellationReason, NewBooking } from './booking-types';

export type { Booking,BookingStatus,BookingStatusHistory,BookingAttachment,Address,TimeSlot,PriceBreakdown,CancellationReason,NewBooking } from './booking-types';
type Value={bookings:Booking[];loading:boolean;error:string|null;creating:boolean;actionInFlight:string|null;createBooking:(input:NewBooking)=>Promise<Booking>;cancelBooking:(id:string,reason?:CancellationReason)=>Promise<void>;rescheduleBooking:(id:string,date:string,time:string)=>Promise<void>;simulateStatus:(id:string,status:BookingStatus)=>Promise<void>;getBooking:(id:string)=>Booking|undefined;reload:()=>Promise<void>};
const Context=createContext<Value|null>(null);
export function BookingProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();const{t}=useLocalization();const repository=mode==='supabase'?supabaseBookingRepository:localBookingRepository;const[bookings,setBookings]=useState<Booking[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);const[creating,setCreating]=useState(false);const[actionInFlight,setActionInFlight]=useState<string|null>(null);const locks=useRef(new Set<string>());const submitLock=useRef(false);
  const reload=useCallback(async()=>{if(mode==='supabase'&&!user){setBookings([]);setLoading(false);return}setLoading(true);try{setBookings(await repository.list());setError(null)}catch(reason){logDataError('bookings',reason);setError(t(dataErrorKey(reason)))}finally{setLoading(false)}},[mode,repository,t,user]);
  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state==='active')void reload()});return()=>subscription.remove()},[reload]);
  const update=useCallback((booking:Booking)=>setBookings(current=>[booking,...current.filter(item=>item.id!==booking.id)]),[]);
  const runAction=useCallback(async(key:string,operation:()=>Promise<Booking>)=>{if(locks.current.has(key))return;locks.current.add(key);setActionInFlight(key);try{update(await operation())}catch(reason){logDataError('booking mutation',reason);throw reason}finally{locks.current.delete(key);setActionInFlight(current=>current===key?null:current)}},[update]);
  const value=useMemo<Value>(()=>({bookings,loading,error,creating,actionInFlight,reload,getBooking:id=>bookings.find(item=>item.id===id),createBooking:async input=>{if(submitLock.current)throw new Error('Duplicate submission');submitLock.current=true;setCreating(true);try{const booking=await repository.create(input);update(booking);return booking}finally{submitLock.current=false;setCreating(false)}},cancelBooking:async(id,reason='other')=>runAction(`${id}:mutation`,()=>repository.cancel(id,reason)),rescheduleBooking:async(id,date,time)=>runAction(`${id}:mutation`,()=>repository.reschedule(id,date,time)),simulateStatus:async(id,status)=>{if(mode==='supabase')return;return runAction(`${id}:mutation`,()=>localBookingRepository.updateStatus(id,status,'Development simulation'))}}),[actionInFlight,bookings,creating,error,loading,mode,reload,repository,runAction,update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBookings(){const context=useContext(Context);if(!context)throw new Error('useBookings must be used inside BookingProvider');return context}
