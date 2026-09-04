import { createContext,PropsWithChildren,useCallback,useContext,useEffect,useMemo,useState } from 'react';
import { useAuth } from '@/src/auth/auth-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { marketplaceRepository } from './marketplace-repository';
import type { MarketplaceCapabilities,MarketplaceRequest,MarketplaceRequestInput,QuoteInvitation,QuoteSort,QuoteTerms,WorkerQuote } from './marketplace-types';
import { marketplaceIdempotency } from './marketplace-types';
import type { WorkerOfferCapacity } from './worker-offer-capacity';

type Value={
  capabilities:MarketplaceCapabilities|null;invitations:QuoteInvitation[];loading:boolean;error:boolean;
  reloadInvitations:()=>Promise<void>;loadRequest:(id:string,sort?:QuoteSort)=>Promise<{request:MarketplaceRequest;quotes:WorkerQuote[]}>;
  create:(input:MarketplaceRequestInput)=>Promise<string>;edit:(request:MarketplaceRequest,patch:Record<string,unknown>)=>Promise<string>;
  cancel:(id:string,reason:string)=>Promise<void>;select:(request:MarketplaceRequest,quoteId:string)=>Promise<void>;
  retry:(id:string,strategy:'retry'|'expand'|'schedule')=>Promise<string>;submitQuote:(invitationId:string,terms:QuoteTerms)=>Promise<string>;
  /** The signed-in worker's open-offer capacity, or null before it is known. */
  offerCapacity:WorkerOfferCapacity|null;reloadOfferCapacity:()=>Promise<void>;
  reviseQuote:(quoteId:string,terms:QuoteTerms)=>Promise<number>;decline:(invitationId:string)=>Promise<void>;
  confirm:(requestId:string,quoteId:string)=>Promise<string>;acceptEmergency:(invitationId:string)=>Promise<string>;
};
const Context=createContext<Value|null>(null);
export function MarketplaceIntelligenceProvider({children}:PropsWithChildren){
  const{user,mode}=useAuth();const[capabilities,setCapabilities]=useState<MarketplaceCapabilities|null>(null);const[invitations,setInvitations]=useState<QuoteInvitation[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState(false);
  const[offerCapacity,setOfferCapacity]=useState<WorkerOfferCapacity|null>(null);
  const reloadInvitations=useCallback(async()=>{try{setInvitations(await marketplaceRepository.listInvitations())}catch{setInvitations([]);setError(true)}},[]);
  /*
   * Capacity is refetched, never derived from the invitation list.
   *
   * The list this screen holds is one page of invitations; capacity counts
   * every open quote this worker has, including ones on requests they are not
   * currently looking at. Computing "7 of 10" from what happens to be on screen
   * would be wrong most of the time and confidently wrong all of it.
   *
   * A failure leaves the previous value rather than clearing it: capacity is a
   * courtesy, the database is the authority, and blanking the number because
   * one poll failed makes the screen look broken for no gain.
   */
  const reloadOfferCapacity=useCallback(async()=>{try{setOfferCapacity(await marketplaceRepository.workerOfferCapacity())}catch{/* the server refuses the submission if this is stale */}},[]);
  useEffect(()=>{let active=true;setLoading(true);setError(false);marketplaceRepository.capabilities().then(value=>{if(active)setCapabilities(value)}).catch(()=>{if(active){setCapabilities(null);setError(true)}}).finally(()=>{if(active)setLoading(false)});void reloadInvitations();void reloadOfferCapacity();return()=>{active=false}},[mode,user?.id,reloadInvitations,reloadOfferCapacity]);
  /*
   * One subscription, two things to refresh.
   *
   * This used to be `customerMarketplaceRequests` for every account, worker or
   * customer, which bound `marketplace_requests` filtered to the caller as a
   * CUSTOMER and `worker_quotes` with no filter at all. A worker therefore
   * received every quote row RLS would show them and none of the request rows
   * that concerned them, and got the right answer by accident.
   *
   * `workerMarketplaceInvitations` is filtered to this worker's own provider
   * id on both bindings, which is both narrower and correct. Capacity is
   * refreshed on the same signal, because every event that changes it -- a
   * quote submitted, withdrawn, rejected, selected, or invalidated because the
   * customer cancelled the request -- writes to `worker_quotes`, and
   * `cancel_marketplace_request` writes there too.
   */
  useEffect(()=>{
    if(mode==='supabase'&&!user)return;
    const reconcile=()=>{void reloadInvitations();void reloadOfferCapacity()};
    const providerId=offerCapacity?.providerId??null;
    return providerId
      ?realtimeService.workerMarketplaceInvitations(providerId,reconcile,status=>{if(status==='connected')reconcile()})
      :realtimeService.customerMarketplaceRequests(user?.id??'mock-customer',reconcile,status=>{if(status==='connected')reconcile()});
  },[mode,offerCapacity?.providerId,reloadInvitations,reloadOfferCapacity,user]);
  const value=useMemo<Value>(()=>({capabilities,invitations,loading,error,reloadInvitations,offerCapacity,reloadOfferCapacity,
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
  }),[capabilities,error,invitations,loading,offerCapacity,reloadInvitations,reloadOfferCapacity]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMarketplaceIntelligence(){const value=useContext(Context);if(!value)throw new Error('useMarketplaceIntelligence must be used inside MarketplaceIntelligenceProvider');return value}

