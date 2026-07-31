import assert from 'node:assert/strict';
import { classifyMarketplaceEdit,quoteSelectionOpen,sortMarketplaceQuotes,type MarketplaceRequest,type WorkerQuote } from '../src/marketplace-intelligence/marketplace-types.ts';

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
console.log('Marketplace Intelligence unit tests passed (20 assertions).');
