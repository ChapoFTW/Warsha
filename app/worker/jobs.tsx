import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProviderJobsContent } from '@/components/warsha/ProviderJobsContent';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useWorkerText } from '@/src/worker/worker-copy';

export default function WorkerJobsScreen() {
  const styles = useThemedStyles(makeStyles);
  const wt = useWorkerText();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenHeader title={wt.text('jobsTitle')} />
        <ProviderJobsContent />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
});
