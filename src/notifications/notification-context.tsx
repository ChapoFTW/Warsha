import { router } from 'expo-router';
import { AppState } from 'react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { useChatVisibility } from '@/src/chat/chat-context';
import { dataErrorKey } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { notificationRepository } from './notification-repository';
import type { WarshaNotification } from './notification-types';

type Value={items:WarshaNotification[];unreadCount:number;loading:boolean;refreshing:boolean;loadingMore:boolean;hasMore:boolean;error:TranslationKey|null;banner:WarshaNotification|null;reload:()=>Promise<void>;loadMore:()=>Promise<void>;markRead:(id:string)=>Promise<void>;markAllRead:()=>Promise<void>;dismiss:(id:string)=>Promise<void>;open:(item:WarshaNotification)=>Promise<void>;hideBanner:()=>void};
const Context=createContext<Value|null>(null);
function merge(items:WarshaNotification[]){const unique=new Map(items.map(item=>[item.id,item]));return[...unique.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
function logNotificationError(scope:string,reason:unknown){if(__DEV__){const error=reason as{code?:string;status?:number};console.warn(`[Warsha ${scope}]`,{code:error?.code,status:error?.status,category:dataErrorKey(reason)})}}

export function NotificationProvider({children}:PropsWithChildren){
  const{mode,user}=useAuth();const providerJobs=useProviderJobs();const{activeBookingId}=useChatVisibility();
  const userId=mode==='mock'?'mock-user':user?.id??null;
  const userRef=useRef(userId);userRef.current=userId;
  const mounted=useRef(true);const generation=useRef(0);const openLock=useRef(new Set<string>());
  const[items,setItems]=useState<WarshaNotification[]>([]);const[loadedUser,setLoadedUser]=useState<string|null>(null);const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false);const[loadingMore,setLoadingMore]=useState(false);const[hasMore,setHasMore]=useState(false);const[error,setError]=useState<TranslationKey|null>(null);const[banner,setBanner]=useState<WarshaNotification|null>(null);const[totalUnread,setTotalUnread]=useState(0);
  const itemsRef=useRef(items);itemsRef.current=items;

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current+=1}},[]);
  const reload=useCallback(async()=>{
    const target=userId;const request=++generation.current;
    if(!target){setItems([]);setLoadedUser(null);setTotalUnread(0);setHasMore(false);setError(null);setLoading(false);setRefreshing(false);setBanner(null);return}
    setRefreshing(true);
    try{const[page,count]=await Promise.all([notificationRepository.list(0),notificationRepository.unreadCount()]);if(mounted.current&&userRef.current===target&&generation.current===request){setItems(merge(page.items));setLoadedUser(target);setTotalUnread(count);setHasMore(page.hasMore);setError(null)}}
    catch(reason){logNotificationError('notifications',reason);if(mounted.current&&userRef.current===target&&generation.current===request){setItems([]);setLoadedUser(target);setTotalUnread(0);setHasMore(false);setError(dataErrorKey(reason))}}
    finally{if(mounted.current&&userRef.current===target&&generation.current===request){setLoading(false);setRefreshing(false)}}
  },[userId]);
  useEffect(()=>{generation.current+=1;openLock.current.clear();setItems([]);setLoadedUser(null);setTotalUnread(0);setBanner(null);setHasMore(false);setError(null);setLoading(true);void reload()},[reload,userId]);
  useEffect(()=>{if(!userId)return;const target=userId;let firstConnection=true;const unsubscribe=realtimeService.notifications(target,change=>{if(userRef.current!==target)return;const known=new Set(itemsRef.current.map(item=>item.id));void Promise.all([notificationRepository.list(0),notificationRepository.unreadCount()]).then(([page,count])=>{if(!mounted.current||userRef.current!==target)return;const next=merge(page.items);setItems(next);setLoadedUser(target);setTotalUnread(count);setHasMore(page.hasMore);if(change.event==='INSERT'){const arrived=next.find(item=>!known.has(item.id));if(arrived&&arrived.bookingId!==activeBookingId)setBanner(arrived)}}).catch(reason=>{if(userRef.current===target){logNotificationError('notification realtime reconcile',reason);setError(dataErrorKey(reason))}})},status=>{if(status==='connected'){if(firstConnection)firstConnection=false;else void reload()}});return unsubscribe},[activeBookingId,reload,userId]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state==='active')void reload()});return()=>subscription.remove()},[reload]);

  const markRead=useCallback(async(id:string)=>{const target=userId;if(!target)return;try{await notificationRepository.markRead(id);const count=await notificationRepository.unreadCount();if(userRef.current!==target)return;const now=new Date().toISOString();setItems(current=>current.map(item=>item.id===id?{...item,readAt:item.readAt??now}:item));setTotalUnread(count);setBanner(current=>current?.id===id?null:current)}catch(reason){if(userRef.current===target){logNotificationError('notification read',reason);setError(dataErrorKey(reason))}}},[userId]);
  const markAllRead=useCallback(async()=>{const target=userId;if(!target)return;try{await notificationRepository.markAllRead();if(userRef.current!==target)return;const now=new Date().toISOString();setItems(current=>current.map(item=>({...item,readAt:item.readAt??now})));setTotalUnread(0);setBanner(null)}catch(reason){if(userRef.current===target){logNotificationError('notification mark all',reason);setError(dataErrorKey(reason))}}},[userId]);
  const dismiss=useCallback(async(id:string)=>{const target=userId;if(!target)return;try{await notificationRepository.dismiss(id);const count=await notificationRepository.unreadCount();if(userRef.current!==target)return;setItems(current=>current.filter(item=>item.id!==id));setTotalUnread(count);setBanner(current=>current?.id===id?null:current)}catch(reason){if(userRef.current===target){logNotificationError('notification dismiss',reason);setError(dataErrorKey(reason))}}},[userId]);
  const open=useCallback(async(item:WarshaNotification)=>{if(openLock.current.has(item.id))return;openLock.current.add(item.id);try{if(!item.readAt)await markRead(item.id);if(!item.bookingId)return;if(item.type==='booking_message'){router.push({pathname:'/conversation/[bookingId]',params:{bookingId:item.bookingId}});return}const providerDestination=Boolean(providerJobs.getJob(item.bookingId));router.push(providerDestination?{pathname:'/provider-job/[id]',params:{id:item.bookingId}}:{pathname:'/booking/[id]',params:{id:item.bookingId,...(item.type==='review_reply'?{focusReview:'1'}:{})}})}finally{openLock.current.delete(item.id)}},[markRead,providerJobs]);
  const loadMore=useCallback(async()=>{const target=userId;if(!target||loadingMore||!hasMore)return;setLoadingMore(true);try{const page=await notificationRepository.list(itemsRef.current.length);if(userRef.current!==target)return;setItems(current=>merge([...current,...page.items]));setLoadedUser(target);setHasMore(page.hasMore)}catch(reason){if(userRef.current===target){logNotificationError('notification pagination',reason);setError(dataErrorKey(reason))}}finally{if(mounted.current&&userRef.current===target)setLoadingMore(false)}},[hasMore,loadingMore,userId]);
  const visibleItems=useMemo(()=>loadedUser===userId?items:[],[items,loadedUser,userId]);
  const value=useMemo<Value>(()=>({items:visibleItems,unreadCount:loadedUser===userId?totalUnread:0,loading,refreshing,loadingMore,hasMore,error,banner:loadedUser===userId?banner:null,reload,loadMore,markRead,markAllRead,dismiss,open,hideBanner:()=>setBanner(null)}),[banner,dismiss,error,hasMore,loadMore,loadedUser,loading,loadingMore,markAllRead,markRead,open,refreshing,reload,totalUnread,userId,visibleItems]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw new Error('useNotifications must be used inside NotificationProvider');return value}
