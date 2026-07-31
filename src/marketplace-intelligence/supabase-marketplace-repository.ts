import { getSupabaseClient } from '@/src/lib/supabase';
import type { EmergencyPreview,MarketplaceCapabilities,MarketplaceIntelligenceRepository,MarketplaceRequest,QuoteInvitation,QuoteTerms,WorkerQuote } from './marketplace-types';

async function rpc<T>(name:string,args:Record<string,unknown>={}){
  const{data,error}=await getSupabaseClient().rpc(name,args);
  if(error)throw error;
  return data as T;
}
function optional(value:unknown){return value==null||value===''?undefined:String(value)}
function mapRequest(row:Record<string,unknown>):MarketplaceRequest{return{
  id:String(row.id),flowKind:String(row.flowKind) as MarketplaceRequest['flowKind'],status:String(row.status) as MarketplaceRequest['status'],categoryId:String(row.categoryId),serviceId:optional(row.serviceId),targetedProviderId:optional(row.targetedProviderId),issueDescription:String(row.issueDescription),notes:String(row.notes??''),scheduleKind:String(row.scheduleKind) as MarketplaceRequest['scheduleKind'],requestedStartAt:optional(row.requestedStartAt),requestedEndAt:optional(row.requestedEndAt),paymentCompatibility:String(row.paymentCompatibility) as MarketplaceRequest['paymentCompatibility'],area:(row.area??{}) as MarketplaceRequest['area'],revision:Number(row.revision),selectionVersion:Number(row.selectionVersion),selectedQuoteId:optional(row.selectedQuoteId),editDeadlineAt:String(row.editDeadlineAt),collectionNotBefore:String(row.collectionNotBefore),expiresAt:String(row.expiresAt),confirmationDeadlineAt:optional(row.confirmationDeadlineAt),convertedBookingId:optional(row.convertedBookingId),quoteCount:Number(row.quoteCount??0),recoveryActions:Array.isArray(row.recoveryActions)?row.recoveryActions.map(String):[],createdAt:String(row.createdAt),updatedAt:String(row.updatedAt),
}}
function mapQuote(row:Record<string,unknown>):WorkerQuote{return{
  id:String(row.id),requestId:String(row.requestId),providerId:String(row.providerId),workerName:String(row.workerName??''),workerRating:Number(row.workerRating??0),workerReviewCount:Number(row.workerReviewCount??0),completedJobs:Number(row.completedJobs??0),status:String(row.status) as WorkerQuote['status'],revision:Number(row.revision??row.currentRevision??1),priceMinor:Number(row.priceMinor),currency:'EGP',proposedStartAt:optional(row.proposedStartAt),etaMinutes:row.etaMinutes==null?undefined:Number(row.etaMinutes),estimatedDurationMinutes:Number(row.estimatedDurationMinutes),message:String(row.message??''),laborIncluded:Boolean(row.laborIncluded),materialsInclusion:String(row.materialsInclusion) as WorkerQuote['materialsInclusion'],materialsExplanation:String(row.materialsExplanation??''),warrantyDays:row.warrantyDays==null?undefined:Number(row.warrantyDays),supportedPaymentMethods:Array.isArray(row.supportedPaymentMethods)?row.supportedPaymentMethods as ('cash'|'online')[]:[],submittedAt:String(row.submittedAt??new Date().toISOString()),
}}
function mapInvitation(row:Record<string,unknown>):QuoteInvitation{return{id:String(row.id),requestId:String(row.requestId),status:String(row.status) as QuoteInvitation['status'],flowKind:String(row.flowKind) as QuoteInvitation['flowKind'],categoryId:String(row.categoryId),serviceId:optional(row.serviceId),issueDescription:String(row.issueDescription),scheduleKind:String(row.scheduleKind) as QuoteInvitation['scheduleKind'],requestedStartAt:optional(row.requestedStartAt),requestedEndAt:optional(row.requestedEndAt),area:(row.area??{}) as QuoteInvitation['area'],paymentCompatibility:String(row.paymentCompatibility) as QuoteInvitation['paymentCompatibility'],expiresAt:String(row.expiresAt),invitedAt:String(row.invitedAt),quoteId:optional(row.quoteId)}}

export const supabaseMarketplaceRepository:MarketplaceIntelligenceRepository={
  capabilities:()=>rpc<MarketplaceCapabilities>('get_marketplace_capabilities'),
  previewEmergency:input=>rpc<EmergencyPreview>('preview_emergency_request',{p_request:input}),
  createRequest:(input,key)=>rpc<string>('create_marketplace_request',{p_request:input,p_idempotency_key:key}),
  async getRequest(id){const row=await rpc<Record<string,unknown>|null>('get_customer_marketplace_request',{p_request_id:id});return row?mapRequest(row):undefined},
  async getQuotes(id,sort){return(await rpc<Record<string,unknown>[]>('get_customer_quotes',{p_request_id:id,p_sort:sort})).map(mapQuote)},
  editRequest:(id,revision,patch,key)=>rpc<string>('edit_marketplace_request',{p_request_id:id,p_expected_revision:revision,p_patch:patch,p_idempotency_key:key}),
  cancelRequest:async(id,reason,key)=>{await rpc('cancel_marketplace_request',{p_request_id:id,p_reason:reason,p_idempotency_key:key})},
  selectQuote:(requestId,quoteId,version,key)=>rpc<string>('select_worker_quote',{p_request_id:requestId,p_quote_id:quoteId,p_expected_selection_version:version,p_idempotency_key:key}),
  retryRequest:(requestId,strategy,key)=>rpc<string>('retry_marketplace_request',{p_request_id:requestId,p_strategy:strategy,p_idempotency_key:key}),
  async listInvitations(cursor,limit){return(await rpc<Record<string,unknown>[]>('get_worker_quote_invitations',{p_cursor:cursor??null,p_limit:limit??20})).map(mapInvitation)},
  viewInvitation:async id=>{await rpc('view_quote_invitation',{p_invitation_id:id})},
  submitQuote:(id,terms,key)=>rpc<string>('submit_worker_quote',{p_invitation_id:id,p_quote:terms,p_idempotency_key:key}),
  reviseQuote:(id,terms,key)=>rpc<number>('revise_worker_quote',{p_quote_id:id,p_quote:terms,p_idempotency_key:key}),
  declineInvitation:async(id,reason,key)=>{await rpc('decline_quote_invitation',{p_invitation_id:id,p_reason:reason,p_idempotency_key:key})},
  withdrawQuote:async(id,reason,key)=>{await rpc('withdraw_worker_quote',{p_quote_id:id,p_reason:reason,p_idempotency_key:key})},
  confirmQuote:(requestId,quoteId,key)=>rpc<string>('confirm_selected_quote',{p_request_id:requestId,p_quote_id:quoteId,p_idempotency_key:key}),
  acceptEmergency:(id,key)=>rpc<string>('accept_emergency_request',{p_invitation_id:id,p_idempotency_key:key}),
  async getWorkerQuote(id){const row=await rpc<Record<string,unknown>|null>('get_worker_quote',{p_quote_id:id});if(!row)return;const quote=mapQuote({...row,providerId:'owned-worker',workerName:'You',workerRating:0,workerReviewCount:0,completedJobs:0,submittedAt:new Date().toISOString()});return{...quote,revisions:Array.isArray(row.revisions)?(row.revisions as {revision:number;terms:QuoteTerms;reason:string;createdAt:string}[]):[]}},
  reportRunningLate:(bookingId,delayMinutes,reasonCode,note,key)=>rpc<string>('report_worker_running_late',{p_booking_id:bookingId,p_delay_minutes:delayMinutes,p_reason_code:reasonCode,p_note:note,p_idempotency_key:key}),
  reportWorkerNoShow:(bookingId,evidence,key)=>rpc<string>('report_worker_no_show',{p_booking_id:bookingId,p_evidence:evidence,p_idempotency_key:key}),
  reportCustomerNoShow:(bookingId,evidence,key)=>rpc<string>('report_customer_no_show',{p_booking_id:bookingId,p_evidence:evidence,p_idempotency_key:key}),
  createComeback:(bookingId,details,key)=>rpc<string>('create_comeback_request',{p_booking_id:bookingId,p_details:details,p_idempotency_key:key}),
};
