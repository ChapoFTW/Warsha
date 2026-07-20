export type BookingStatus = 'pending_provider_approval'|'accepted'|'rejected'|'confirmed'|'provider_on_the_way'|'provider_arrived'|'job_started'|'completed'|'cancelled';
export type BookingType = 'scheduled'|'emergency';
export type BookingStatusHistory = { status:BookingStatus; at:string; note?:string };
export type BookingAttachment = { id:string; uri:string; fileName?:string; mimeType?:string };
export type Address = { id:string; label:string; governorate:string; district:string; street:string; building:string; floor:string; apartment:string; landmark:string; instructions:string };
export type TimeSlot = { value:string; available:boolean; reason?:string };
export type PriceBreakdown = { servicePrice:number; inspectionFee:number; transportationFee:number; emergencySurcharge:number; discount:number; estimatedTotal:number; pricingType:'fixed'|'starting'|'inspection' };
export type CancellationReason = 'plans_changed'|'booked_by_mistake'|'provider_delay'|'price_concern'|'other';
export type Booking = { id:string; providerId:string; serviceId:string; serviceName:string; issueDescription:string; notes:string; attachments:BookingAttachment[]; address:Address|string; date:string; time:string; bookingType:BookingType; priceBreakdown?:PriceBreakdown; price:number; pricingType:'fixed'|'starting'|'inspection'; status:BookingStatus; history:BookingStatusHistory[]; cancellationReason?:CancellationReason; createdAt:string; updatedAt?:string };
export type NewBooking = Omit<Booking,'id'|'status'|'history'|'createdAt'|'updatedAt'|'cancellationReason'>;
export const terminalStatuses:BookingStatus[]=['rejected','completed','cancelled'];
export const cancellableStatuses:BookingStatus[]=['pending_provider_approval','accepted','confirmed'];
export const timelineLabels:Record<BookingStatus,string>={pending_provider_approval:'Booking submitted · waiting for provider',accepted:'Provider accepted',rejected:'Provider rejected',confirmed:'Booking confirmed',provider_on_the_way:'Provider on the way',provider_arrived:'Provider arrived',job_started:'Work started',completed:'Job completed',cancelled:'Booking cancelled'};
export function formatAddress(address:Address|string){return typeof address==='string'?address:[address.label,`${address.building} ${address.street}`,address.district,address.governorate,address.floor&&`Floor ${address.floor}`,address.apartment&&`Apt ${address.apartment}`,address.landmark].filter(Boolean).join(', ')}
