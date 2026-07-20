import type { Booking, NewBooking } from '@/src/bookings/booking-context';
import { categories, getProvider, providers } from '@/src/data/mock-data';
import type { WarshaDataAdapter } from './types';
const bookings: Booking[] = [];
export const mockDataAdapter: WarshaDataAdapter = {
  mode:'mock', async listCategories(){return categories}, async listProviders(){return providers}, async getProvider(id){return getProvider(id)}, async listBookings(){return [...bookings]},
  async createBooking(input:NewBooking){const duplicate=bookings.find((item)=>item.status!=='cancelled'&&item.providerId===input.providerId&&item.serviceId===input.serviceId&&item.date===input.date&&item.time===input.time);if(duplicate)return duplicate;const now=new Date().toISOString();const booking:Booking={...input,id:`WS-${Date.now().toString(36).toUpperCase()}`,status:'confirmed',createdAt:now,history:[{status:'confirmed',at:now}]};bookings.unshift(booking);return booking},
  async cancelBooking(id){const index=bookings.findIndex((item)=>item.id===id);if(index<0)throw new Error('Booking not found');const existing=bookings[index];const updated:Booking={...existing,status:'cancelled',history:[...existing.history,{status:'cancelled',at:new Date().toISOString()}]};bookings[index]=updated;return updated},
};
