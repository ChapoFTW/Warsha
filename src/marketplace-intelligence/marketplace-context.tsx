import { createContext,PropsWithChildren,useCallback,useContext,useEffect,useMemo,useState } from 'react';
import { useAuth } from '@/src/auth/auth-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { marketplaceRepository } from './marketplace-repository';
import type { MarketplaceCapabilities,MarketplaceRequest,MarketplaceRequestInput,QuoteInvitation,QuoteSort,QuoteTerms,WorkerQuote } from './marketplace-types';
import { marketplaceIdempotency } from './marketplace-types';

type Value={
  capabilities:MarketplaceCapabilities|null;invitations:QuoteInvitation[];loading:boolean;error:boolean;
  reloadInvitations:()=>Promise<void>;loadRequest:(id:string,sort?:QuoteSort)=>Promise<{request:MarketplaceRequest;quotes:WorkerQuote[]}>;
  create:(input:MarketplaceRequestInput)=>Promise<string>;edit:(request:MarketplaceRequest,patch:Record<string,unknown>)=>Promise<string>;
  cancel:(id:string,reason:string)=>Promise<void>;select:(request:MarketplaceRequest,quoteId:string)=>Promise<void>;
  retry:(id:string,strategy:'retry'|'expand'|'schedule')=>Promise<string>;submitQuote:(invitationId:string,terms:QuoteTerms)=>Promise<string>;
  reviseQuote:(quoteId:string,terms:QuoteTerms)=>Promise<number>;decline:(invitationId:string)=>Promise<void>;
  confirm:(requestId:string,quoteId:string)=>Promise<string>;acceptEmergency:(invitationId:string)=>Promise<string>;
};
const Context=createContext<Value|null>(null);
export function MarketplaceIntelligenceProvider({children}:PropsWithChildren){
  const{user,mode}=useAuth();const[capabilities,setCapabilities]=useState<MarketplaceCapabilities|null>(null);const[invitations,setInvitations]=useState<QuoteInvitation[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState(false);
  const reloadInvitations=useCallback(async()=>{try{setInvitations(await marketplaceRepository.listInvitations())}catch{setInvitations([]);setError(true)}},[]);
  useEffect(()=>{let active=true;setLoading(true);setError(false);marketplaceRepository.capabilities().then(value=>{if(active)setCapabilities(value)}).catch(()=>{if(active){setCapabilities(null);setError(true)}}).finally(()=>{if(active)setLoading(false)});void reloadInvitations();return()=>{active=false}},[mode,user?.id,reloadInvitations]);
  useEffect(()=>{if(mode==='supabase'&&!user)return;return realtimeService.customerMarketplaceRequests(user?.id??'mock-customer',()=>{void reloadInvitations()})},[mode,reloadInvitations,user]);
  const value=useMemo<Value>(()=>({capabilities,invitations,loading,error,reloadInvitations,
    loadRequest:async(id,sort='best_value')=>{const[request,quotes]=await Promise.all([marketplaceRepository.getRequest(id),marketplaceRepository.getQuotes(id,sort)]);if(!request)throw new Error('Request not found');return{request,quotes}},
    create:input=>marketplaceRepository.createRequest(input,marketplaceIdempotency('create-request')),
    edit:(request,patch)=>marketplaceRepository.editRequest(request.id,request.revision,patch,marketplaceIdempotency('edit-request')),
    cancel:(id,reason)=>marketplaceRepository.cancelRequest(id,reason,marketplaceIdempotency('cancel-request')),
    select:async(request,quoteId)=>{await marketplaceRepository.selectQuote(request.id,quoteId,request.selectionVersion,marketplaceIdempotency('select-quote'))},
    retry:(id,strategy)=>marketplaceRepository.retryRequest(id,strategy,marketplaceIdempotency('retry-request')),
    submitQuote:(id,terms)=>marketplaceRepository.submitQuote(id,terms,marketplaceIdempotency('submit-quote')),
    reviseQuote:(id,terms)=>marketplaceRepository.reviseQuote(id,terms,marketplaceIdempotency('revise-quote')),
    decline:(id)=>marketplaceRepository.declineInvitation(id,'not_available',marketplaceIdempotency('decline-quote')),
    confirm:(requestId,quoteId)=>marketplaceRepository.confirmQuote(requestId,quoteId,marketplaceIdempotency('confirm-quote')),
    acceptEmergency:id=>marketplaceRepository.acceptEmergency(id,marketplaceIdempotency('accept-emergency')),
  }),[capabilities,error,invitations,loading,reloadInvitations]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMarketplaceIntelligence(){const value=useContext(Context);if(!value)throw new Error('useMarketplaceIntelligence must be used inside MarketplaceIntelligenceProvider');return value}

