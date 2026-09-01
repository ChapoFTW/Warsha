import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient,processLock,type SupabaseClient,type SupportedStorage } from '@supabase/supabase-js';
import { assertSupabaseConfiguration,environment } from '@/src/config/environment';
import { createBoundedFetch,resolveRequestTimeouts } from '@/src/data/request-policy';
const secureStorage:SupportedStorage={getItem:async(key)=>Platform.OS==='web'?globalThis.localStorage?.getItem(key)??null:SecureStore.getItemAsync(key),setItem:async(key,value)=>{if(Platform.OS==='web')globalThis.localStorage?.setItem(key,value);else await SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK})},removeItem:async(key)=>{if(Platform.OS==='web')globalThis.localStorage?.removeItem(key);else await SecureStore.deleteItemAsync(key)}};
let client:SupabaseClient|null=null;
/**
 * Every request this client makes is bounded.
 *
 * `fetch` has no default timeout, so before this a stalled connection left a
 * promise pending for the life of the process, and whatever screen was awaiting
 * it kept its spinner with no event that could ever end it. The bound is per
 * operation class — a photograph upload and a list query are not the same kind
 * of wait — and lives in `request-policy.ts`, which the web client reads too so
 * the two surfaces cannot disagree about it.
 */
export function getSupabaseClient(){if(client)return client;assertSupabaseConfiguration();client=createClient(environment.supabaseUrl!,environment.supabaseAnonKey!,{auth:{storage:secureStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock},global:{fetch:createBoundedFetch({timeouts:resolveRequestTimeouts(process.env as Record<string,string|undefined>)})}});return client}
