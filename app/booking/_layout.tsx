import { Slot, useLocalSearchParams, usePathname } from 'expo-router';

import { useBookings } from '@/src/bookings/booking-context';
import { useBookingDetailRealtime } from '@/src/realtime/use-booking-detail-realtime';

export default function BookingLayout(){const{id}=useLocalSearchParams<{id?:string}>();const pathname=usePathname();const bookings=useBookings();const detailId=pathname.startsWith('/booking/new/')||pathname.startsWith('/booking/success/')?undefined:id;useBookingDetailRealtime(detailId,()=>bookings.reload(true));return <Slot/>}
