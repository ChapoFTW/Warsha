import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { dataAdapter } from '@/src/data/data-adapter';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import { categories as mockCategories, providers as mockProviders, type Category, type Provider } from '@/src/data/mock-data';
import type { Service } from '@/src/data/marketplace-types';
import type { TranslationKey } from '@/src/i18n/translations';
import { realtimeService } from '@/src/realtime/realtime-service';
type Value={categories:Category[];providers:Provider[];
  /**
   * Every service in the catalogue, not only the ones a provider offers.
   *
   * The request form needs the whole catalogue: a customer asking for quotes
   * has not chosen a provider, so `provider.services` is empty and the specific
   * service picker had nothing to show. The rows were already in the catalogue
   * payload and simply never surfaced.
   */
  services:Service[];loading:boolean;error:TranslationKey|null;getCategory:(id:string)=>Category|undefined;getProvider:(id:string)=>Provider|undefined;reload:()=>void};
const Context=createContext<Value|null>(null);
export function MarketplaceDataProvider({children}:PropsWithChildren){const[categories,setCategories]=useState<Category[]>(dataAdapter.mode==='mock'?mockCategories:[]);const[providers,setProviders]=useState<Provider[]>(dataAdapter.mode==='mock'?mockProviders:[]);const[services,setServices]=useState<Service[]>([]);const[loading,setLoading]=useState(dataAdapter.mode==='supabase');const[error,setError]=useState<TranslationKey|null>(null);const[revision,setRevision]=useState(0);useEffect(()=>{let active=true;if(dataAdapter.mode==='mock'){setCategories(mockCategories);setProviders([...mockProviders]);void dataAdapter.listServices().then(next=>{if(active)setServices(next)}).catch(()=>{if(active)setServices([])});setError(null);setLoading(false);return()=>{active=false}}setLoading(true);setError(null);Promise.all([dataAdapter.listCategories(),dataAdapter.listProviders(),dataAdapter.listServices()]).then(([nextCategories,nextProviders,nextServices])=>{if(active){setCategories(nextCategories);setProviders(nextProviders);setServices(nextServices)}}).catch((reason:unknown)=>{logDataError('marketplace',reason);if(active){setCategories([]);setProviders([]);setServices([]);setError(dataErrorKey(reason))}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[revision]);useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const unsubscribe=realtimeService.marketplaceProviders(()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;setRevision(value=>value+1)},120)});return()=>{if(timer)clearTimeout(timer);unsubscribe()}},[]);const value=useMemo<Value>(()=>({categories,providers,services,loading,error,getCategory:(id)=>categories.find((item)=>item.id===id),getProvider:(id)=>providers.find((item)=>item.id===id),reload:()=>setRevision((value)=>value+1)}),[categories,error,loading,providers,services]);return <Context.Provider value={value}>{children}</Context.Provider>}
export function useMarketplaceData(){const context=useContext(Context);if(!context)throw new Error('useMarketplaceData must be used inside MarketplaceDataProvider');return context}
