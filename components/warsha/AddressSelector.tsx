import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { AppText } from './Typography';
export function AddressSelector() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles); const { t, isRTL } = useLocalization(); return <Pressable style={[styles.container, isRTL && styles.reverse]}><View style={[styles.pin, isRTL && styles.reverse]}><MaterialIcons name="location-on" size={20} color={colors.textPrimary}/><View><AppText style={styles.label}>{t('currentLocation')}</AppText><AppText numberOfLines={1} style={styles.address}>{t('address')}</AppText></View></View><MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary}/></Pressable>; }
const makeStyles = (colors: ThemeColors) => StyleSheet.create({container:{height:58,borderRadius:20,backgroundColor:colors.surfaceElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.lg},reverse:{flexDirection:'row-reverse'},pin:{flexDirection:'row',alignItems:'center',gap:spacing.md,flex:1},label:{fontSize:10,color:colors.textMuted,fontWeight:typography.medium},address:{fontSize:14,fontWeight:typography.semibold,marginTop:1,maxWidth:260}});
