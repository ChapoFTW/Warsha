import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, EmptyState, StateBadge } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useSupport } from '@/src/support/support-context';
import { useSupportText } from '@/src/support/support-translations';
import type { SupportStatus } from '@/src/support/support-types';

const tone: Record<SupportStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  open: 'warning',
  in_progress: 'neutral',
  waiting_participant: 'warning',
  escalated: 'error',
  resolved: 'success',
  closed: 'neutral',
};

export default function SupportCasesScreen() {
  const support = useSupport();
  const copy = useSupportText();

  useEffect(() => { void support.reloadCases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader
        title={copy.text('myCases')}
        subtitle={support.unresolvedCount > 0 ? `${support.unresolvedCount}` : undefined}
      />

      {support.cases.length === 0 ? <EmptyState
        icon="support-agent"
        title={copy.text('noCases')}
        body={copy.text('noCasesBody')}
        action={copy.text('newCase')}
        onAction={() => router.push('/support/new')}
      /> : <View style={styles.list}>
        {support.cases.map(item => <Pressable
          key={item.caseId}
          accessibilityRole="button"
          accessibilityLabel={`${item.subject}. ${copy.category(item.category)}. ${copy.status(item.status)}`}
          onPress={() => router.push({ pathname: '/support/case/[id]', params: { id: item.caseId } })}
          style={[styles.row, copy.isRTL && styles.reverse]}>
          <View style={styles.grow}>
            <AppText style={styles.subject}>{item.subject}</AppText>
            <AppText style={styles.meta}>{copy.category(item.category)}</AppText>
            <View style={[styles.badgeRow, copy.isRTL && styles.reverse]}>
              <StateBadge compact label={copy.status(item.status)} tone={tone[item.status]} />
            </View>
          </View>
          <MaterialIcons
            name={copy.isRTL ? 'chevron-left' : 'chevron-right'}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>)}
      </View>}

      <BrandButton
        label={copy.text('newCase')}
        icon="add"
        onPress={() => router.push('/support/new')}
      />
      <BrandButton
        label={copy.text('helpCenter')}
        variant="secondary"
        icon="help-outline"
        onPress={() => router.push('/help')}
      />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, gap: 5 },
  list: { gap: spacing.sm },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  subject: { fontSize: 15, fontWeight: typography.semibold },
  meta: { fontSize: 12, color: colors.textSecondary },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
});
