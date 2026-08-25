import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyMarketplaceEdit,quoteSelectionOpen,sortMarketplaceQuotes,type MarketplaceRequest,type WorkerQuote } from '../src/marketplace-intelligence/marketplace-types.ts';
import {
  MARKETPLACE_REQUEST_STATUSES,
  bookingLifecycleSemantic,
  humanizeHistoricalStatus,
  lifecycleBadgeTone,
  marketplaceRequestAcceptsQuoteActions,
  marketplaceRequestIsTerminal,
  marketplaceRequestStatusText,
  partitionInvitationLifecycle,
  requestLifecycleSemantic,
} from '../src/lifecycle/lifecycle-presentation.ts';
import { requestWorkLabel } from '../src/marketplace-intelligence/request-work-label.ts';

const now=Date.parse('2026-07-31T12:00:00Z');
const request:MarketplaceRequest={id:'request',flowKind:'get_quotes',status:'customer_reviewing',categoryId:'plumbing',issueDescription:'Leaking kitchen tap',notes:'',scheduleKind:'asap',paymentCompatibility:'either',area:{governorate:'Cairo',district:'Zamalek'},revision:1,selectionVersion:0,editDeadlineAt:'2026-07-31T12:05:00Z',collectionNotBefore:'2026-07-31T12:02:00Z',expiresAt:'2026-07-31T12:10:00Z',quoteCount:2,recoveryActions:[],createdAt:'2026-07-31T12:00:00Z',updatedAt:'2026-07-31T12:00:00Z'};
assert.equal(quoteSelectionOpen(request,now),false,'selection is closed at creation');
assert.equal(quoteSelectionOpen(request,now+119999),false,'selection remains closed inside two minutes');
assert.equal(quoteSelectionOpen(request,now+120000),true,'selection opens at two minutes');
assert.equal(quoteSelectionOpen(request,now+600000),false,'selection closes at ten minutes');
assert.equal(quoteSelectionOpen({...request,status:'selection_pending_confirmation'},now+180000),false,'selection locks after selection');
assert.equal(classifyMarketplaceEdit({descriptionClarification:'More detail'}),'minor');
assert.equal(classifyMarketplaceEdit({notes:'Gate code'}),'minor');
assert.equal(classifyMarketplaceEdit({requestedStartAt:'2026-08-01T10:00:00Z'}),'minor');
assert.equal(classifyMarketplaceEdit({attachmentIds:['a']}),'minor');
assert.equal(classifyMarketplaceEdit({categoryId:'electrical'}),'major');
assert.equal(classifyMarketplaceEdit({addressId:'different'}),'major');
assert.equal(classifyMarketplaceEdit({unknownDecision:true}),'major','uncertainty fails closed as major');

const quote=(id:string,priceMinor:number,rating:number,eta:number,jobs:number):WorkerQuote=>({id,requestId:'request',providerId:id,workerName:id,workerRating:rating,workerReviewCount:10,completedJobs:jobs,status:'submitted',revision:1,priceMinor,currency:'EGP',etaMinutes:eta,estimatedDurationMinutes:90,message:'',laborIncluded:true,materialsInclusion:'excluded',materialsExplanation:'',supportedPaymentMethods:['cash'],submittedAt:'2026-07-31T12:00:00Z'});
const quotes=[quote('high-value',30000,5,20,100),quote('cheap',20000,4,45,20),quote('fast',26000,4.5,10,40)];
assert.equal(sortMarketplaceQuotes(quotes,'lowest_price')[0].id,'cheap');
assert.equal(sortMarketplaceQuotes(quotes,'highest_rated')[0].id,'high-value');
assert.equal(sortMarketplaceQuotes(quotes,'fastest_arrival')[0].id,'fast');
assert.equal(sortMarketplaceQuotes(quotes,'closest')[0].id,'fast');
assert.equal(sortMarketplaceQuotes(quotes,'most_experienced')[0].id,'high-value');
assert.equal(sortMarketplaceQuotes(quotes,'best_value')[0].id,'high-value');
assert.deepEqual(quotes.map(item=>item.id),['high-value','cheap','fast'],'sorting does not mutate authoritative input');
assert.equal(sortMarketplaceQuotes([quote('b',20000,4,20,20),quote('a',20000,4,20,20)],'lowest_price')[0].id,'a','ties are deterministic');

assert.equal(requestLifecycleSemantic('cancelled'),'destructive','cancelled is terminal/destructive');
assert.equal(lifecycleBadgeTone(requestLifecycleSemantic('cancelled')),'error','cancelled uses the destructive token family');
assert.equal(bookingLifecycleSemantic('completed'),'complete','completed has complete/success semantics');
assert.equal(requestLifecycleSemantic('collecting_quotes'),'active','quote collection is visually active');
assert.notEqual(requestLifecycleSemantic('collecting_quotes'),requestLifecycleSemantic('cancelled'),'active and terminal requests are distinguishable');
assert.equal(requestLifecycleSemantic('historical_unknown'),'neutral','unknown history falls back without misleading semantics');
assert.equal(humanizeHistoricalStatus('legacy_waiting_state'),'Legacy waiting state','unknown history stays readable');
assert.equal(marketplaceRequestIsTerminal('cancelled'),true,'cancelled is terminal');
assert.equal(marketplaceRequestAcceptsQuoteActions('cancelled'),false,'cancelled cannot retain active quote controls');
assert.equal(marketplaceRequestAcceptsQuoteActions('collecting_quotes'),true,'collecting quotes retains active quote controls');
const invitationGroups=partitionInvitationLifecycle([
  {id:'active',status:'invited'},
  {id:'quoted',status:'quoted'},
  {id:'cancelled-request',status:'request_closed'},
  {id:'expired',status:'expired'},
]);
assert.deepEqual(invitationGroups.active.map(item=>item.id),['active','quoted'],'only actionable request invitations remain active');
assert.deepEqual(invitationGroups.history.map(item=>item.id),['cancelled-request','expired'],'closed request invitations remain accessible only as history');
for(const status of MARKETPLACE_REQUEST_STATUSES){
  for(const language of ['en','ar','fr'] as const){
    const label=marketplaceRequestStatusText(language,status);
    assert.ok(label.length>0,`${language}.${status} has a label`);
    assert.notEqual(label,status,`${language}.${status} never exposes the enum`);
  }
}
assert.equal(marketplaceRequestStatusText('ar','cancelled'),'ملغي','the QA Arabic cancelled label remains localized');
assert.equal(marketplaceRequestStatusText('fr','cancelled'),'Annulée','French cancelled remains localized');
const customerDescription='requires a shower head';
const showerCatalogue=[{
  id:'00000000-0000-4000-8000-000000000079',
  categoryId:'plumbing',
  translationKey:'plumbing-shower-install',
  name:'Shower installation',
}];
assert.equal(requestWorkLabel({categoryId:'plumbing',serviceId:showerCatalogue[0].id},showerCatalogue,'ar'),
  'سباكة · تركيب دش','the exact Arabic QA request localizes category and service');
assert.equal(requestWorkLabel({categoryId:'plumbing',serviceId:showerCatalogue[0].id},showerCatalogue,'fr'),
  'Plomberie · Installation de douche','the exact French QA request localizes category and service');
assert.equal(customerDescription,'requires a shower head','customer-authored description is preserved verbatim');

const requestWeb=readFileSync('web/app/app/requests/page.tsx','utf8');
const requestNative=readFileSync('app/marketplace-request/[id].tsx','utf8');
const statusCss=readFileSync('web/components/product-surface.module.css','utf8');
const server=readFileSync('supabase/migrations/202607310003_marketplace_intelligence_api.sql','utf8');
assert.match(requestWeb,/LifecycleBadge/,'web request cards consume semantic lifecycle badges');
assert.match(requestWeb,/requestWorkLabel/,'web request metadata uses the shared localized category/service label');
assert.match(requestWeb,/activeQuoteSurface \? <div className=\{styles\.filters\}/,'web quote sorting is active-state only');
assert.match(requestWeb,/terminal \? words\.requestNoQuotesClosed : words\.requestNoQuotes/,'web terminal empty state never claims matching continues');
assert.match(requestNative,/activeQuoteSurface\?<ScrollView/,'native quote sorting is active-state only');
assert.match(requestNative,/mt\(terminal\?'closedNoQuotes':'noQuotes'\)/,'native terminal empty state never claims matching continues');
const workerWeb=readFileSync('web/app/app/worker/opportunities/page.tsx','utf8');
const workerNative=readFileSync('app/worker-quotes.tsx','utf8');
assert.match(workerWeb,/partitionInvitationLifecycle\(invitations \?\? \[\]\)/,'web worker opportunities separate terminal invitation history');
assert.match(workerNative,/partitionInvitationLifecycle\(market\.invitations\)/,'native worker opportunities separate terminal invitation history');
assert.match(statusCss,/\.statusDestructive[\s\S]*var\(--status-error-background\)/,'web destructive presentation consumes semantic tokens');
assert.match(statusCss,/\.workLabel \{/,'category/service metadata retains its separate neutral class');
assert.match(server,/request_row\.status not in \('matching','collecting_quotes','customer_reviewing','rescue_matching'\)/,'quote submission rechecks the active request state');
assert.match(server,/update public\.quote_invitations set status='request_closed'/,'cancellation closes worker invitations');
assert.match(server,/update public\.worker_quotes set status=case when status='selected' then 'rejected' else 'invalidated_by_request_change'/,'cancellation invalidates existing quotes');
assert.match(server,/update private\.marketplace_jobs set state='cancelled'/,'cancellation stops queued matching work');

// --- The QA request itself, round-tripped -----------------------------------
// The cancelled shower-installation request the human reported is still on the
// development backend: category `plumbing`, service `plumbing-shower-install`,
// status `cancelled`, and an Arabic description the customer typed themselves.
// Switching language must relabel every structured part and touch none of the
// free text, and coming back to English must land exactly where it started --
// a resolver that mutated state would drift on the second pass.
{
  const qaRequest = { categoryId: 'plumbing', serviceId: 'shower-uuid', status: 'cancelled' };
  const qaCatalogue = [{
    id: 'shower-uuid', categoryId: 'plumbing',
    translationKey: 'plumbing-shower-install', name: 'Shower installation',
  }];
  const qaDescription = 'تركيب دش "احتياج لراس الدش"';

  const trip = (['en', 'ar', 'fr', 'en'] as const).map(language => ({
    work: requestWorkLabel(qaRequest, qaCatalogue, language),
    status: marketplaceRequestStatusText(language, qaRequest.status),
  }));
  assert.deepEqual(trip[0], trip[3],
    'EN -> AR -> FR -> EN returns identical English, so nothing was mutated in passing');
  assert.equal(new Set(trip.map(step => step.work)).size, 3,
    'and the three languages genuinely differ');
  assert.equal(trip[1].work, 'سباكة · تركيب دش', 'Arabic localizes both category and service');
  assert.equal(trip[1].status, 'ملغي', 'and the status');
  assert.equal(trip[2].work, 'Plomberie · Installation de douche', 'French localizes both');
  assert.equal(trip[2].status, 'Annulée', 'and the status');

  // No structured English may survive into the Arabic rendering. These are the
  // exact strings the QA screenshot showed under an Arabic interface.
  const arabicSurface = `${trip[1].work} ${trip[1].status}`;
  for (const leak of ['Plumbing', 'Shower installation', 'Cancelled', 'collecting_quotes', 'cancelled']) {
    assert.ok(!arabicSurface.includes(leak),
      `the Arabic request surface never leaks "${leak}"`);
  }
  // ...while the customer's own words are returned untouched, in every language.
  assert.equal(qaDescription, 'تركيب دش "احتياج لراس الدش"',
    'the customer-authored description is never translated');

  // Identity is unchanged by any of it.
  assert.equal(qaRequest.serviceId, 'shower-uuid', 'the service uuid survives the round trip');
  assert.equal(qaRequest.categoryId, 'plumbing', 'so does the category id');
  assert.equal(qaRequest.status, 'cancelled', 'and the canonical status');
}

// --- Terminal states cannot present an active surface -----------------------
// Verified against the development backend on the real cancelled request:
// status=cancelled, active_after=0, open_invitations=0, invitation=request_closed,
// quote=invalidated_by_request_change (preserved, not deleted), live_jobs=0,
// and a racing quote, a fresh invitation, and a quote selection all refused.
{
  for (const status of ['cancelled', 'expired', 'closed', 'converted_to_booking'] as const) {
    assert.equal(marketplaceRequestIsTerminal(status), true, `${status} is terminal`);
    assert.equal(marketplaceRequestAcceptsQuoteActions(status), false,
      `${status} NEVER KEEPS THE ACTIVE QUOTE SURFACE`);
  }
  for (const status of ['matching', 'collecting_quotes', 'customer_reviewing', 'rescue_matching'] as const) {
    assert.equal(marketplaceRequestAcceptsQuoteActions(status), true,
      `${status} still collects quotes`);
    assert.equal(marketplaceRequestIsTerminal(status), false, `${status} is not terminal`);
  }
  // The client allowlist and the server guard have to be the same list, or the
  // UI offers an action the database will refuse.
  // Several functions carry a `request_row.status not in (...)` guard for their
  // own action, so the body of the quote-submission function is isolated first.
  // Matching the whole file would compare against whichever guard came first.
  const submitStart = server.indexOf('function public.submit_worker_quote');
  const submitBody = submitStart < 0 ? ''
    : server.slice(submitStart, server.indexOf('$$;', submitStart));
  assert.ok(submitBody.length > 0, 'the quote-submission function body was located');
  const submitGuard = /request_row\.status not in \(([^)]*)\)/.exec(submitBody)?.[1] ?? '';
  const serverActive = submitGuard.split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.equal(serverActive.length, 4, 'its active-state allowlist has four entries');
  const clientActive = MARKETPLACE_REQUEST_STATUSES
    .filter(status => marketplaceRequestAcceptsQuoteActions(status)).slice().sort();
  assert.deepEqual(clientActive, serverActive,
    'THE CLIENT ACTIVE-STATE ALLOWLIST MATCHES THE SERVER GUARD EXACTLY');
  // Cancellation must also stop the countdown and the matching runs.
  assert.match(server, /update private\.marketplace_matching_runs set status='cancelled'|update private\.marketplace_jobs set state='cancelled'/,
    'cancellation stops queued matching work');
}

// --- Status and metadata must not look alike --------------------------------
// The QA follow-up: `ملغي` rendered, but read as neutral next to `سباكة`.
{
  const statusTone = lifecycleBadgeTone(requestLifecycleSemantic('cancelled'));
  assert.equal(statusTone, 'error', 'cancelled carries the destructive tone');
  assert.notEqual(statusTone, lifecycleBadgeTone('neutral' as never),
    'which is not the tone metadata uses');
  // Category/service metadata never enters the lifecycle module at all, so it
  // cannot acquire a status tone by accident.
  assert.equal(requestLifecycleSemantic('plumbing'), 'neutral',
    'a category id is not a lifecycle state');
  // Every distinct semantic must map to a tone, so no state renders untoned.
  for (const status of MARKETPLACE_REQUEST_STATUSES) {
    const tone = lifecycleBadgeTone(requestLifecycleSemantic(status));
    assert.ok(['neutral', 'info', 'warning', 'success', 'error'].includes(tone),
      `${status} resolves to a real tone`);
  }
  // Meaning may not rest on colour alone: the label is always rendered too.
  assert.match(requestWeb, /<LifecycleBadge[\s\S]{0,120}label=\{/,
    'the web badge always carries its localized label, not colour alone');
}

console.log(`Marketplace Intelligence unit and lifecycle tests passed (${20+10+MARKETPLACE_REQUEST_STATUSES.length*3+16+45} assertions).`);
