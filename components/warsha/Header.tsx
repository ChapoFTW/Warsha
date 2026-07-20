import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { AppText } from './Typography';

export function Header() {
  const { t, toggleLanguage, isRTL } = useLocalization();
  return <View style={[styles.row, isRTL && styles.reverse]}>
    <View style={[styles.brand, isRTL && styles.reverse]}><View style={styles.mark}><MaterialIcons name="home-repair-service" size={23} color={colors.background} /></View><AppText style={styles.logo}>WARSHA</AppText></View>
    <View style={[styles.actions, isRTL && styles.reverse]}><Pressable accessibilityRole="button" accessibilityLabel="Change language" onPress={toggleLanguage} style={styles.language}><AppText style={styles.languageText}>{t('language')}</AppText></Pressable><Pressable style={styles.iconButton}><MaterialIcons name="notifications-none" size={23} color={colors.textPrimary} /></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, reverse: { flexDirection: 'row-reverse' }, brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, mark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, logo: { fontSize: 19, fontWeight: typography.bold, letterSpacing: 3 }, actions: { flexDirection: 'row', gap: spacing.sm }, language: { height: 42, minWidth: 42, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, languageText: { fontWeight: typography.bold, fontSize: 12 }, iconButton: { width: 42, height: 42, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' } });
