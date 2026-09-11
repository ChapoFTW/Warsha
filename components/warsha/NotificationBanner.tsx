import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useNotifications } from '@/src/notifications/notification-context';
import { useEngagementText } from '@/src/notifications/notification-engagement-translations';
import { priorityMarkColor } from '@/src/notifications/notification-priority-appearance';
import { AppText } from './Typography';

/**
 * The banner carried no visual priority at all. Its accessible label said
 * "Critical." and its pixels said nothing: the same bell, the same surface and
 * the same border whether the notice was a password change or a routine update.
 *
 * The list screen has always shown a coloured priority mark. It now comes from
 * one shared authority and is drawn here too, so the same colour means the same
 * thing on both surfaces — which is what makes a mark readable to someone who
 * cannot read the body text.
 */
export function NotificationBanner(){
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);const state=useNotifications();const copy=useEngagementText();const{isRTL}=useLocalization();const item=state.banner;if(!item)return null;const eventCopy=copy.event(item.eventKey,item.category);const priorityColor=priorityMarkColor(colors,item.priority);return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.priority(item.priority)}. ${eventCopy.title}. ${eventCopy.body}`}
    /* The close control is a Pressable inside a Pressable, so a screen reader
       merged it into the banner and there was no way to dismiss this — it sat
       over the screen until it expired. As an action it is reachable again. */
    accessibilityActions={[{name:'dismiss',label:copy.text('close')}]}
    onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='dismiss')state.hideBanner()}}
    onPress={()=>void state.open(item)} style={[styles.banner,isRTL&&styles.rtl]}><View style={[styles.priorityMark,{backgroundColor:priorityColor}]}/><View style={[styles.icon,{backgroundColor:priorityColor}]}><MaterialIcons name="notifications-none" size={19} color={colors.background}/></View><View style={styles.copy}><AppText numberOfLines={1} style={styles.title}>{eventCopy.title}{item.groupCount>1?` · ${item.groupCount}`:''}</AppText><AppText numberOfLines={2} style={styles.body}>{eventCopy.body}</AppText></View><Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" hitSlop={10} onPress={event=>{event.stopPropagation();state.hideBanner()}}><MaterialIcons name="close" size={19} color={colors.textSecondary}/></Pressable></Pressable>}
const makeStyles = (colors: ThemeColors) => StyleSheet.create({banner:{position:'absolute',zIndex:100,left:spacing.lg,right:spacing.lg,top:spacing.xl,minHeight:76,flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.md,borderRadius:radii.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surfaceElevated},rtl:{flexDirection:'row-reverse'},priorityMark:{width:5,alignSelf:'stretch',borderRadius:3},icon:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},copy:{flex:1,gap:3},title:{fontSize:14,fontWeight:typography.bold},body:{fontSize:12,lineHeight:17,color:colors.textSecondary}});
