export type BookingStatus='pending_provider_approval'|'accepted'|'rejected'|'confirmed'|'provider_on_the_way'|'provider_arrived'|'job_started'|'work_in_progress'|'completed'|'disputed'|'cancelled'|'refunded'|'no_show';
export type BookingType='scheduled'|'emergency';
export type BookingStatusHistory={status:BookingStatus;at:string;note?:string};
export type BookingAttachment={id:string;uri:string;fileName?:string;mimeType?:string};
export type Address={id:string;label:string;governorate:string;district:string;street:string;building:string;floor:string;apartment:string;landmark:string;instructions:string};
export type TimeSlot={value:string;available:boolean;reason?:string};
export type PriceBreakdown={servicePrice:number;inspectionFee:number;transportationFee:number;emergencySurcharge:number;discount:number;estimatedTotal:number;pricingType:'fixed'|'starting'|'inspection'};
export type CancellationReason='plans_changed'|'booked_by_mistake'|'provider_delay'|'price_concern'|'other';
export type Booking={id:string;providerId:string;serviceId:string;serviceName:string;issueDescription:string;notes:string;attachments:BookingAttachment[];address:Address|string;date:string;time:string;bookingType:BookingType;priceBreakdown?:PriceBreakdown;price:number;pricingType:'fixed'|'starting'|'inspection';status:BookingStatus;history:BookingStatusHistory[];cancellationReason?:CancellationReason;createdAt:string;updatedAt?:string};
export type NewBooking=Omit<Booking,'id'|'status'|'history'|'createdAt'|'updatedAt'|'cancellationReason'>;

export const bookingTransitions:Readonly<Record<BookingStatus,readonly BookingStatus[]>>={pending_provider_approval:['accepted','rejected','cancelled'],accepted:['confirmed','cancelled'],confirmed:['provider_on_the_way','cancelled'],provider_on_the_way:['provider_arrived','cancelled'],provider_arrived:['job_started','cancelled'],job_started:['work_in_progress','completed','disputed'],work_in_progress:['completed','disputed'],completed:['disputed'],disputed:['refunded'],rejected:[],cancelled:[],refunded:[],no_show:[]};
export const terminalStatuses:BookingStatus[]=['rejected','cancelled','refunded','no_show'];
export const cancellableStatuses:BookingStatus[]=['pending_provider_approval','accepted','confirmed','provider_on_the_way','provider_arrived'];
export const timelineLabels:Record<BookingStatus,string>={pending_provider_approval:'Booking submitted — waiting for provider',accepted:'Provider accepted',rejected:'Provider rejected',confirmed:'Booking confirmed',provider_on_the_way:'Provider on the way',provider_arrived:'Provider arrived',job_started:'Work started',work_in_progress:'Work in progress',completed:'Job completed',disputed:'Dispute opened',cancelled:'Booking cancelled',refunded:'Booking refunded',no_show:'No show'};
export function canTransition(from:BookingStatus,to:BookingStatus){return from!==to&&bookingTransitions[from].includes(to)}
export function getAllowedTransitions(status:BookingStatus){return bookingTransitions[status]}
export function normalizeHistory(history:BookingStatusHistory[]){const seen=new Set<string>();return [...history].filter((event)=>{const key=`${event.status}|${event.at}|${event.note??''}`;if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))}
export function formatAddress(address:Address|string){return typeof address==='string'?address:[address.label,`${address.building} ${address.street}`,address.district,address.governorate,address.floor&&`Floor ${address.floor}`,address.apartment&&`Apt ${address.apartment}`,address.landmark].filter(Boolean).join(', ')}
