import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient,processLock,type SupabaseClient,type SupportedStorage } from '@supabase/supabase-js';
import { assertSupabaseConfiguration,environment } from '@/src/config/environment';
const secureStorage:SupportedStorage={getItem:async(key)=>Platform.OS==='web'?globalThis.localStorage?.getItem(key)??null:SecureStore.getItemAsync(key),setItem:async(key,value)=>{if(Platform.OS==='web')globalThis.localStorage?.setItem(key,value);else await SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK})},removeItem:async(key)=>{if(Platform.OS==='web')globalThis.localStorage?.removeItem(key);else await SecureStore.deleteItemAsync(key)}};
let client:SupabaseClient|null=null;
export function getSupabaseClient(){if(client)return client;assertSupabaseConfiguration();client=createClient(environment.supabaseUrl!,environment.supabaseAnonKey!,{auth:{storage:secureStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock}});return client}
