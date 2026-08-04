import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import type { TranslationKey } from '@/src/i18n/translations';

import { EmptyState } from './BrandUI';

export function FoundationScreen({
  title,
  message,
  icon,
}: {
  title: TranslationKey;
  message: TranslationKey;
  icon: ComponentProps<typeof MaterialIcons>['name'];
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useLocalization();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <EmptyState title={t(title)} body={t(message)} icon={icon} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
});
