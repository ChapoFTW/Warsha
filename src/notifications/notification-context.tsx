import { router } from 'expo-router';
import { AppState } from 'react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { dataErrorKey } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { notificationRepository } from './notification-repository';
import type { WarshaNotification } from './notification-types';

type Value={items:WarshaNotification[];unreadCount:number;loading:boolean;refreshing:boolean;loadingMore:boolean;hasMore:boolean;error:TranslationKey|null;banner:WarshaNotification|null;reload:()=>Promise<void>;loadMore:()=>Promise<void>;markRead:(id:string)=>Promise<void>;markAllRead:()=>Promise<void>;dismiss:(id:string)=>Promise<void>;open:(item:WarshaNotification)=>Promise<void>;hideBanner:()=>void};
const Context=createContext<Value|null>(null);
function merge(items:WarshaNotification[]){const unique=new Map(items.map(item=>[item.id,item]));return[...unique.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
function logNotificationError(scope:string,reason:unknown){if(__DEV__){const error=reason as{code?:string;status?:number};console.warn(`[Warsha ${scope}]`,{code:error?.code,status:error?.status,category:dataErrorKey(reason)})}}

export function NotificationProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();const provider=useProviderFoundation();const providerJobs=useProviderJobs();const[items,setItems]=useState<WarshaNotification[]>([]);const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false);const[loadingMore,setLoadingMore]=useState(false);const[hasMore,setHasMore]=useState(false);const[error,setError]=useState<TranslationKey|null>(null);const[banner,setBanner]=useState<WarshaNotification|null>(null);const itemsRef=useRef(items);itemsRef.current=items;const userId=mode==='mock'?'mock-user':user?.id;
  const[totalUnread,setTotalUnread]=useState(0);
  const reload=useCallback(async()=>{if(!userId){setItems([]);setTotalUnread(0);setHasMore(false);setError(null);setLoading(false);setBanner(null);return}setRefreshing(true);try{const[page,count]=await Promise.all([notificationRepository.list(0),notificationRepository.unreadCount()]);setItems(merge(page.items));setTotalUnread(count);setHasMore(page.hasMore);setError(null)}catch(reason){logNotificationError('notifications',reason);setError(dataErrorKey(reason))}finally{setLoading(false);setRefreshing(false)}},[userId]);
  useEffect(()=>{setItems([]);setTotalUnread(0);setBanner(null);setHasMore(false);setLoading(true);void reload()},[provider.mode,reload]);
  useEffect(()=>{if(!userId)return;let firstConnection=true;const unsubscribe=realtimeService.notifications(userId,change=>{const known=new Set(itemsRef.current.map(item=>item.id));void Promise.all([notificationRepository.list(0),notificationRepository.unreadCount()]).then(([page,count])=>{const next=merge(page.items);setItems(next);setTotalUnread(count);setHasMore(page.hasMore);if(change.event==='INSERT'){const arrived=next.find(item=>!known.has(item.id));if(arrived)setBanner(arrived)}}).catch(reason=>{logNotificationError('notification realtime reconcile',reason);setError(dataErrorKey(reason))})},status=>{if(status==='connected'){if(firstConnection)firstConnection=false;else void reload()}});return unsubscribe},[reload,userId]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state==='active')void reload()});return()=>subscription.remove()},[reload]);
  const markRead=useCallback(async(id:string)=>{try{await notificationRepository.markRead(id);const count=await notificationRepository.unreadCount();const now=new Date().toISOString();setItems(current=>current.map(item=>item.id===id?{...item,readAt:item.readAt??now}:item));setTotalUnread(count);setBanner(current=>current?.id===id?null:current)}catch(reason){logNotificationError('notification read',reason);setError(dataErrorKey(reason))}},[]);
  const markAllRead=useCallback(async()=>{try{await notificationRepository.markAllRead();const now=new Date().toISOString();setItems(current=>current.map(item=>({...item,readAt:item.readAt??now})));setTotalUnread(0);setBanner(null)}catch(reason){logNotificationError('notification mark all',reason);setError(dataErrorKey(reason))}},[]);
  const dismiss=useCallback(async(id:string)=>{try{await notificationRepository.dismiss(id);const count=await notificationRepository.unreadCount();setItems(current=>current.filter(item=>item.id!==id));setTotalUnread(count);setBanner(current=>current?.id===id?null:current)}catch(reason){logNotificationError('notification dismiss',reason);setError(dataErrorKey(reason))}},[]);
  const open=useCallback(async(item:WarshaNotification)=>{if(!item.readAt)await markRead(item.id);if(!item.bookingId)return;const providerDestination=(item.type==='new_booking_request'||provider.mode==='provider')&&Boolean(providerJobs.getJob(item.bookingId));router.push(providerDestination?{pathname:'/provider-job/[id]',params:{id:item.bookingId}}:{pathname:'/booking/[id]',params:{id:item.bookingId}})},[markRead,provider.mode,providerJobs]);
  const loadMore=useCallback(async()=>{if(!userId||loadingMore||!hasMore)return;setLoadingMore(true);try{const page=await notificationRepository.list(itemsRef.current.length);setItems(current=>merge([...current,...page.items]));setHasMore(page.hasMore)}catch(reason){logNotificationError('notification pagination',reason);setError(dataErrorKey(reason))}finally{setLoadingMore(false)}},[hasMore,loadingMore,userId]);
  const value=useMemo<Value>(()=>({items,unreadCount:totalUnread,loading,refreshing,loadingMore,hasMore,error,banner,reload,loadMore,markRead,markAllRead,dismiss,open,hideBanner:()=>setBanner(null)}),[banner,dismiss,error,hasMore,items,loadMore,loading,loadingMore,markAllRead,markRead,open,refreshing,reload,totalUnread]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw new Error('useNotifications must be used inside NotificationProvider');return value}
