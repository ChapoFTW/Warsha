import type { WorkerOfferCapacity } from './worker-offer-capacity';

export type MarketplaceFlowKind='browse_worker'|'get_quotes'|'emergency'|'rescue'|'comeback';
export type MarketplaceRequestStatus='draft'|'matching'|'collecting_quotes'|'customer_reviewing'|'selection_pending_confirmation'|'worker_confirmed'|'converted_to_booking'|'rescue_matching'|'cancelled'|'expired'|'closed';
export type MarketplaceScheduleKind='asap'|'today'|'scheduled'|'flexible';
export type MarketplacePaymentCompatibility='cash'|'online'|'either';
export type QuoteSort='best_value'|'lowest_price'|'highest_rated'|'closest'|'fastest_arrival'|'most_experienced';
export type QuoteStatus='submitted'|'revised'|'selected'|'rejected'|'withdrawn'|'expired'|'invalidated_by_request_change';

export type MarketplaceCapabilities={
  enabled:boolean;
  flows:MarketplaceFlowKind[];
  quoteRevisionsEnabled:boolean;
  requestLifetimeSeconds:number;
  initialCollectionSeconds:number;
  editWindowSeconds:number;
  workerNoShowSeconds:number;
  usefulQuoteTarget:number;
  currency:'EGP';
  warrantyCategories:string[];
};

export type MarketplaceRequestInput={
  flowKind:'browse_worker'|'get_quotes'|'emergency';
  categoryId:string;
  serviceId?:string;
  targetedProviderId?:string;
  addressId:string;
  issueDescription:string;
  notes?:string;
  complexity?:'simple'|'standard'|'complex'|'unknown';
  scheduleKind:MarketplaceScheduleKind;
  requestedStartAt?:string;
  requestedEndAt?:string;
  paymentCompatibility:MarketplacePaymentCompatibility;
  emergencyApprovalToken?:string;
};

export type MarketplaceRequest={
  id:string;
  flowKind:MarketplaceFlowKind;
  status:MarketplaceRequestStatus;
  categoryId:string;
  serviceId?:string;
  targetedProviderId?:string;
  issueDescription:string;
  notes:string;
  scheduleKind:MarketplaceScheduleKind;
  requestedStartAt?:string;
  requestedEndAt?:string;
  paymentCompatibility:MarketplacePaymentCompatibility;
  area:{governorate:string;district:string};
  revision:number;
  selectionVersion:number;
  selectedQuoteId?:string;
  editDeadlineAt:string;
  collectionNotBefore:string;
  expiresAt:string;
  confirmationDeadlineAt?:string;
  convertedBookingId?:string;
  quoteCount:number;
  recoveryActions:string[];
  createdAt:string;
  updatedAt:string;
};

export type QuoteTerms={
  priceMinor:number;
  proposedStartAt?:string;
  etaMinutes?:number;
  estimatedDurationMinutes:number;
  message:string;
  laborIncluded:boolean;
  materialsInclusion:'included'|'excluded'|'partial'|'unknown';
  materialsExplanation:string;
  warrantyDays?:number;
  supportedPaymentMethods:('cash'|'online')[];
  revisionReason?:string;
};

export type WorkerQuote=QuoteTerms&{
  id:string;
  requestId:string;
  providerId:string;
  workerName:string;
  workerRating:number;
  workerReviewCount:number;
  completedJobs:number;
  status:QuoteStatus;
  revision:number;
  currency:'EGP';
  submittedAt:string;
};

export type QuoteInvitation={
  id:string;
  requestId:string;
  status:'invited'|'viewed'|'quoted'|'declined'|'withdrawn'|'expired'|'request_closed'|'worker_ineligible'|'accepted';
  flowKind:MarketplaceFlowKind;
  categoryId:string;
  serviceId?:string;
  issueDescription:string;
  scheduleKind:MarketplaceScheduleKind;
  requestedStartAt?:string;
  requestedEndAt?:string;
  area:{governorate:string;district:string};
  paymentCompatibility:MarketplacePaymentCompatibility;
  expiresAt:string;
  invitedAt:string;
  quoteId?:string;
};

export type EmergencyPreview={approvalToken:string;approvalVersion:number;surchargeMinor:number;currency:'EGP';expiresAt:string};

export interface MarketplaceIntelligenceRepository{
  capabilities():Promise<MarketplaceCapabilities>;
  previewEmergency(input:MarketplaceRequestInput):Promise<EmergencyPreview>;
  createRequest(input:MarketplaceRequestInput,idempotencyKey:string):Promise<string>;
  getRequest(id:string):Promise<MarketplaceRequest|undefined>;
  getQuotes(id:string,sort:QuoteSort):Promise<WorkerQuote[]>;
  editRequest(id:string,revision:number,patch:Record<string,unknown>,idempotencyKey:string):Promise<string>;
  cancelRequest(id:string,reason:string,idempotencyKey:string):Promise<void>;
  selectQuote(requestId:string,quoteId:string,selectionVersion:number,idempotencyKey:string):Promise<string>;
  retryRequest(requestId:string,strategy:'retry'|'expand'|'schedule',idempotencyKey:string):Promise<string>;
  listInvitations(cursor?:string,limit?:number):Promise<QuoteInvitation[]>;
  /** The caller's own open-offer capacity. Never another worker's — the RPC takes no id. */
  workerOfferCapacity():Promise<WorkerOfferCapacity|null>;
  viewInvitation(id:string):Promise<void>;
  submitQuote(invitationId:string,terms:QuoteTerms,idempotencyKey:string):Promise<string>;
  reviseQuote(quoteId:string,terms:QuoteTerms,idempotencyKey:string):Promise<number>;
  declineInvitation(invitationId:string,reason:string,idempotencyKey:string):Promise<void>;
  withdrawQuote(quoteId:string,reason:string,idempotencyKey:string):Promise<void>;
  confirmQuote(requestId:string,quoteId:string,idempotencyKey:string):Promise<string>;
  acceptEmergency(invitationId:string,idempotencyKey:string):Promise<string>;
  getWorkerQuote(quoteId:string):Promise<(WorkerQuote&{revisions:{revision:number;terms:QuoteTerms;reason:string;createdAt:string}[]})|undefined>;
  reportRunningLate(bookingId:string,delayMinutes:number,reasonCode:'traffic'|'previous_job'|'transport'|'emergency'|'other',note:string,idempotencyKey:string):Promise<string>;
  reportWorkerNoShow(bookingId:string,evidence:Record<string,unknown>,idempotencyKey:string):Promise<string>;
  reportCustomerNoShow(bookingId:string,evidence:Record<string,unknown>,idempotencyKey:string):Promise<string>;
  createComeback(bookingId:string,details:Record<string,unknown>,idempotencyKey:string):Promise<string>;
}

export function marketplaceIdempotency(prefix:string){
  const random=Math.random().toString(36).slice(2);
  return `${prefix}:${Date.now().toString(36)}:${random}`;
}

export function quoteSelectionOpen(request:MarketplaceRequest,now=Date.now()){
  return ['collecting_quotes','customer_reviewing'].includes(request.status)
    && now>=Date.parse(request.collectionNotBefore)&&now<Date.parse(request.expiresAt);
}

export function classifyMarketplaceEdit(patch:Record<string,unknown>){
  const minor=new Set(['descriptionClarification','notes','requestedStartAt','requestedEndAt','addressClarification','attachmentIds']);
  return Object.keys(patch).every(key=>minor.has(key))?'minor':'major';
}

export function sortMarketplaceQuotes(quotes:WorkerQuote[],sort:QuoteSort){
  return [...quotes].sort((a,b)=>{
    if(sort==='lowest_price')return a.priceMinor-b.priceMinor||a.id.localeCompare(b.id);
    if(sort==='highest_rated')return b.workerRating-a.workerRating||b.workerReviewCount-a.workerReviewCount||a.id.localeCompare(b.id);
    if(sort==='fastest_arrival'||sort==='closest')return(a.etaMinutes??9999)-(b.etaMinutes??9999)||a.id.localeCompare(b.id);
    if(sort==='most_experienced')return b.completedJobs-a.completedJobs||a.id.localeCompare(b.id);
    const value=(quote:WorkerQuote)=>quote.workerRating*20+Math.min(100,quote.completedJobs)*.08-(quote.priceMinor/10000)-(quote.etaMinutes??120)*.04;
    return value(b)-value(a)||a.id.localeCompare(b.id);
  });
}
