import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable,StyleSheet,View } from 'react-native';
import { colors,radii,spacing,typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { AppText } from './Typography';
import { WarshaLogo } from './WarshaLogo';
export function Header(){const{t,toggleLanguage,isRTL}=useLocalization();return <View style={[styles.row,isRTL&&styles.reverse]}><WarshaLogo size={42} wordmark/><View style={[styles.actions,isRTL&&styles.reverse]}><Pressable accessibilityRole="button" accessibilityLabel="Change language" onPress={toggleLanguage} style={styles.control}><AppText style={styles.language}>{t('language')}</AppText></Pressable><Pressable accessibilityRole="button" style={styles.control}><MaterialIcons name="notifications-none" size={22} color={colors.textPrimary}/></Pressable></View></View>}
const styles=StyleSheet.create({row:{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},reverse:{flexDirection:'row-reverse'},actions:{flexDirection:'row',gap:spacing.sm},control:{height:42,minWidth:42,paddingHorizontal:10,borderRadius:radii.md,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},language:{fontWeight:typography.semibold,fontSize:12}});

