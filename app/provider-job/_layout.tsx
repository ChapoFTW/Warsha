import { Slot, useLocalSearchParams } from 'expo-router';

import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { useBookingDetailRealtime } from '@/src/realtime/use-booking-detail-realtime';

export default function ProviderJobLayout(){const{id}=useLocalSearchParams<{id?:string}>();const jobs=useProviderJobs();useBookingDetailRealtime(id,()=>jobs.reload(true));return <Slot/>}
