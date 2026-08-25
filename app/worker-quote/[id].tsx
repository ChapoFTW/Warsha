import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { StateBadge } from '@/components/warsha/BrandUI';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useMarketplaceIntelligence } from '@/src/marketplace-intelligence/marketplace-context';
import { marketplaceRepository } from '@/src/marketplace-intelligence/marketplace-repository';
import {
  invitationStatusText,
  marketplacePaymentText,
  marketplaceScheduleText,
  requestWorkLabel,
  useMarketplaceText,
} from '@/src/marketplace-intelligence/marketplace-translations';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import type { QuoteInvitation, QuoteTerms } from '@/src/marketplace-intelligence/marketplace-types';
import { invitationLifecycleSemantic, lifecycleBadgeTone } from '@/src/lifecycle/lifecycle-presentation';

export default function WorkerQuoteDetail() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const market = useMarketplaceIntelligence();
  const mt = useMarketplaceText();
  const { isRTL, language } = useLocalization();
  const { services: catalogue } = useMarketplaceData();
  const [invitation, setInvitation] = useState<QuoteInvitation>();
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState('');
  const [eta, setEta] = useState('30');
  const [duration, setDuration] = useState('90');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await market.reloadInvitations();
    const list = await marketplaceRepository.listInvitations();
    const item = list.find(value => value.id === id);
    setInvitation(item);
    if (item) await marketplaceRepository.viewInvitation(item.id);
    setLoading(false);
  }, [id, market]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const terms = (): QuoteTerms => ({
    priceMinor: Math.round(Number(price) * 100),
    etaMinutes: Number(eta), estimatedDurationMinutes: Number(duration),
    message: message.trim(), laborIncluded: true, materialsInclusion: 'excluded',
    materialsExplanation: language === 'ar'
      ? 'يتم الاتفاق على الخامات بشكل منفصل عند الحاجة.'
      : language === 'fr'
        ? 'Les matériaux sont convenus séparément si nécessaire.'
        : 'Materials are agreed separately if needed.',
    supportedPaymentMethods: ['cash', 'online'],
  });
  const send = async () => {
    if (!invitation || Number(price) <= 0) return;
    setSaving(true);
    try {
      if (invitation.quoteId) await market.reviseQuote(invitation.quoteId, { ...terms(), revisionReason: 'Updated before selection' });
      else await market.submitQuote(invitation.id, terms());
      router.back();
    } catch { Alert.alert(mt('error')); }
    finally { setSaving(false); }
  };

  if (loading) return <Center><ActivityIndicator color={colors.white} /></Center>;
  if (!invitation) return <Center><AppText>{mt('error')}</AppText></Center>;
  const emergency = invitation.flowKind === 'emergency';
  const actionable = ['invited', 'viewed', 'quoted'].includes(invitation.status);
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title={emergency ? mt('emergencyAccept') : mt('sendQuote')} />
    <ScrollView contentContainerStyle={[styles.content, isRTL && { direction: 'rtl' }]}>
      <View style={styles.card}>
        <StateBadge label={invitationStatusText(language, invitation.status)}
          tone={lifecycleBadgeTone(invitationLifecycleSemantic(invitation.status))} compact />
        <AppText style={styles.title}>{requestWorkLabel(invitation, catalogue, language)}</AppText>
        <AppText style={styles.copy}>{invitation.issueDescription}</AppText>
        <AppText style={styles.muted}>{invitation.area.district}, {invitation.area.governorate}</AppText>
        <AppText style={styles.muted}>{marketplaceScheduleText(language, invitation.scheduleKind)} · {marketplacePaymentText(language, invitation.paymentCompatibility)}</AppText>
      </View>
      {emergency
        ? <Pressable disabled={!actionable || saving} onPress={async () => {
            setSaving(true);
            try { await market.acceptEmergency(invitation.id); router.back(); }
            catch { Alert.alert(mt('error')); }
            finally { setSaving(false); }
          }} style={[styles.primary, !actionable && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.background} /> : <AppText style={styles.primaryText}>{mt('emergencyAccept')}</AppText>}
          </Pressable>
        : <View style={styles.card}>
            <Field label={`${mt('price')} (EGP)`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" rtl={isRTL} />
            <Field label={`${mt('arrival')} (${mt('minutes')})`} value={eta} onChangeText={setEta} keyboardType="number-pad" rtl={isRTL} />
            <Field label={`${mt('duration')} (${mt('minutes')})`} value={duration} onChangeText={setDuration} keyboardType="number-pad" rtl={isRTL} />
            <Field label={mt('describe')} value={message} onChangeText={setMessage} multiline rtl={isRTL} />
            <Pressable disabled={!actionable || saving || Number(price) <= 0} onPress={() => void send()} style={[styles.primary, (!actionable || Number(price) <= 0) && styles.disabled]}>
              {saving ? <ActivityIndicator color={colors.background} /> : <AppText style={styles.primaryText}>{invitation.quoteId ? mt('reviseQuote') : mt('sendQuote')}</AppText>}
            </Pressable>
            {['invited', 'viewed'].includes(invitation.status)
              ? <Pressable onPress={async () => { await market.decline(invitation.id); router.back(); }} style={styles.outline}><AppText>{mt('decline')}</AppText></Pressable>
              : null}
          </View>}
    </ScrollView>
  </SafeAreaView>;
}

function Field({ label, rtl, ...props }: { label: string; rtl: boolean } & React.ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return <View><AppText style={styles.muted}>{label}</AppText><TextInput {...props} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline, { textAlign: rtl ? 'right' : 'left' }]} /></View>;
}
function Center({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <SafeAreaView style={styles.safe}><View style={styles.center}>{children}</View></SafeAreaView>;
}
const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface }, title: { fontSize: 22, fontWeight: typography.bold, textTransform: 'capitalize' }, copy: { color: colors.textSecondary, lineHeight: 22 }, muted: { color: colors.textMuted },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, color: colors.white, padding: spacing.md }, multiline: { minHeight: 105, textAlignVertical: 'top' }, primary: { minHeight: 54, borderRadius: radii.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.background, fontWeight: typography.bold }, outline: { minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: .4 },
});
