import type { Booking, NewBooking } from '@/src/bookings/booking-context';
import type { Category, Provider } from '@/src/data/mock-data';
export interface WarshaDataAdapter {
  readonly mode: 'mock' | 'supabase';
  listCategories(): Promise<Category[]>;
  listProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  listBookings(): Promise<Booking[]>;
  createBooking(input: NewBooking): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking>;
}
