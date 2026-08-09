import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useWorkerText } from '@/src/worker/worker-copy';

export default function WorkerSettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const wt = useWorkerText();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenHeader title={wt.text('settingsTitle')} />
        <BrandButton label={wt.text('appearance')} icon="palette" variant="secondary" onPress={() => router.push('/appearance')} />
        <BrandButton label={wt.text('notificationSettings')} icon="notifications-none" variant="secondary" onPress={() => router.push('/notification-preferences')} />
        <BrandButton label={wt.text('privacy')} icon="privacy-tip" variant="secondary" onPress={() => router.push('/privacy')} />
        <BrandButton label={wt.text('support')} icon="support-agent" variant="secondary" onPress={() => router.push('/support')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
});
