import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { AppText } from './Typography';

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { isRTL, t } = useLocalization();
  return <View style={[styles.row, isRTL && styles.reverse]}><Pressable accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.back}><MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.textPrimary}/></Pressable><View style={styles.copy}><AppText numberOfLines={1} style={styles.title}>{title}</AppText>{subtitle ? <AppText numberOfLines={1} style={styles.subtitle}>{subtitle}</AppText> : null}</View></View>;
}
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',gap:spacing.md},reverse:{flexDirection:'row-reverse'},back:{width:40,height:40,borderRadius:radii.md,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},copy:{flex:1},title:{fontSize:21,fontWeight:typography.semibold},subtitle:{fontSize:12,color:colors.textSecondary,marginTop:2}});

