import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { useNotifications } from '@/src/notifications/notification-context';
import { notificationBodyKey, notificationCopyKey, useNotificationText } from '@/src/notifications/notification-translations';
import { AppText } from './Typography';

export function NotificationBanner(){const state=useNotifications();const nt=useNotificationText();const{isRTL}=useLocalization();const item=state.banner;if(!item)return null;return <Pressable accessibilityRole="button" accessibilityLabel={`${nt(notificationCopyKey(item.type))}. ${nt(notificationBodyKey(item.type))}`} onPress={()=>void state.open(item)} style={[styles.banner,isRTL&&styles.rtl]}><View style={styles.icon}><MaterialIcons name="notifications-none" size={19} color={colors.background}/></View><View style={styles.copy}><AppText numberOfLines={1} style={styles.title}>{nt(notificationCopyKey(item.type))}</AppText><AppText numberOfLines={2} style={styles.body}>{nt(notificationBodyKey(item.type))}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel={nt('dismiss')} hitSlop={10} onPress={event=>{event.stopPropagation();state.hideBanner()}}><MaterialIcons name="close" size={19} color={colors.textSecondary}/></Pressable></Pressable>}
const styles=StyleSheet.create({banner:{position:'absolute',zIndex:100,left:spacing.lg,right:spacing.lg,top:spacing.xl,minHeight:76,flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.md,borderRadius:radii.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surfaceElevated},rtl:{flexDirection:'row-reverse'},icon:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.white},copy:{flex:1,gap:3},title:{fontSize:14,fontWeight:typography.bold},body:{fontSize:12,lineHeight:17,color:colors.textSecondary}});
