import { Slot, router, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { useBookings } from '@/src/bookings/booking-context';
import { useBookingDetailRealtime } from '@/src/realtime/use-booking-detail-realtime';

export default function BookingLayout(){
  const{id}=useLocalSearchParams<{id?:string}>();const pathname=usePathname();const bookings=useBookings();const auth=useAuth();
  const requiresSignIn=auth.mode==='supabase'&&!auth.loading&&!auth.user;
  const detailId=auth.user||auth.mode==='mock'?(pathname.startsWith('/booking/new/')||pathname.startsWith('/booking/success/')?undefined:id):undefined;
  useBookingDetailRealtime(detailId,()=>bookings.reload(true));
  useEffect(()=>{if(requiresSignIn)router.replace('/(tabs)/profile')},[requiresSignIn]);
  if(auth.loading||requiresSignIn)return <View style={styles.loading}><ActivityIndicator color={colors.white}/></View>;
  return <Slot/>;
}
const styles=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.background}});
