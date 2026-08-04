import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandTextField } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useSupport } from '@/src/support/support-context';
import { useSupportText } from '@/src/support/support-translations';
import type { SupportCategory, SupportLinkedType, SupportSurface } from '@/src/support/support-types';
import { supportCategories, supportLinkedTypes, supportSurfaces } from '@/src/support/support-types';

/**
 * WPS-019 contact form.
 *
 * The surface and the linked record are carried in from wherever the customer
 * pressed "contact support", so staff open the case already knowing which
 * booking or payment it is about. The link is a POINTER — the case never copies
 * the booking, and the server refuses a link to a record the caller cannot see.
 */
export default function NewSupportCaseScreen() {
  const params = useLocalSearchParams<{ surface?: string; linkedType?: string; linkedId?: string }>();
  const support = useSupport();
  const copy = useSupportText();

  const surface: SupportSurface = supportSurfaces.includes(params.surface as SupportSurface)
    ? params.surface as SupportSurface
    : 'help_center';
  const linkedType = supportLinkedTypes.includes(params.linkedType as SupportLinkedType)
    ? params.linkedType as SupportLinkedType
    : undefined;

  const [category, setCategory] = useState<SupportCategory>(defaultCategory(surface));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stable key per attempt, so a retry after a dropped connection returns the
  // same case instead of opening a second one.
  const idempotencyKey = useMemo(
    () => `support-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 1 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await support.openCase({
        category,
        subject: subject.trim(),
        body: body.trim(),
        idempotencyKey,
        linkedType,
        linkedId: linkedType ? params.linkedId : undefined,
        originSurface: surface,
        locale: copy.locale,
      });
      router.replace({ pathname: '/support/case/[id]', params: { id: result.caseId } });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.text('loadError'));
    } finally {
      setBusy(false);
    }
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={copy.text('newCase')} subtitle={copy.text('contactSupportBody')} />

      <BrandCard style={styles.card}>
        <AppText style={styles.label}>{copy.text('category')}</AppText>
        <View accessibilityRole="radiogroup" style={[styles.options, copy.isRTL && styles.reverse]}>
          {supportCategories.map(option => <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: category === option }}
            accessibilityLabel={copy.category(option)}
            onPress={() => setCategory(option)}
            style={[styles.option, category === option && styles.optionSelected]}>
            <AppText style={[styles.optionText, category === option && styles.optionTextSelected]}>
              {copy.category(option)}
            </AppText>
          </Pressable>)}
        </View>
      </BrandCard>

      <BrandTextField
        label={copy.text('subject')}
        placeholder={copy.text('subjectPlaceholder')}
        value={subject}
        onChangeText={setSubject}
        maxLength={200}
      />
      <BrandTextField
        label={copy.text('describe')}
        placeholder={copy.text('describePlaceholder')}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
        maxLength={4000}
        error={error ?? undefined}
      />

      <BrandButton
        label={busy ? copy.text('submitting') : copy.text('submit')}
        loading={busy}
        disabled={!canSubmit}
        icon="send"
        onPress={() => void submit()}
      />
    </ScrollView>
  </SafeAreaView>;
}

/** Pre-select the topic that matches where the customer asked for help. */
function defaultCategory(surface: SupportSurface): SupportCategory {
  switch (surface) {
    case 'payment': return 'payment_question';
    case 'earnings': return 'withdrawal_question';
    case 'booking': case 'chat': case 'dispute': case 'marketplace': return 'booking_help';
    case 'verification': return 'verification_help';
    case 'onboarding': case 'portfolio': return 'worker_onboarding';
    case 'account': case 'settings': return 'account_access';
    default: return 'other';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  card: { gap: spacing.md },
  label: { fontSize: 13, fontWeight: typography.semibold, color: colors.textSecondary },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill },
  optionSelected: { backgroundColor: colors.white, borderColor: colors.white },
  optionText: { fontSize: 13, color: colors.textSecondary },
  optionTextSelected: { color: colors.background, fontWeight: typography.semibold },
});
