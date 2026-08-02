import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalization } from '@/src/i18n/localization';
import { useEngagementText } from '@/src/notifications/notification-engagement-translations';
import { notificationAccountId } from '@/src/notifications/notification-policy';
import { defaultNotificationPreferences, notificationRepository } from '@/src/notifications/notification-repository';
import type { NotificationCategory, NotificationPreferences } from '@/src/notifications/notification-types';
import { useProviderFoundation } from '@/src/providers/provider-context';

const customerCategories: NotificationCategory[] = ['marketplace', 'bookings', 'messages', 'payments', 'reviews', 'disputes', 'security'];
const workerCategories: NotificationCategory[] = ['marketplace', 'bookings', 'messages', 'payments', 'worker_account', 'reviews', 'disputes', 'security'];
const mandatory = new Set<NotificationCategory>(['payments', 'disputes', 'security']);
const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NotificationPreferencesScreen() {
  const auth = useAuth(); const provider = useProviderFoundation(); const copy = useEngagementText(); const { isRTL } = useLocalization();
  const accountId = notificationAccountId(auth.mode, auth.user?.id, provider.mode);
  const categories = provider.mode === 'provider' ? workerCategories : customerCategories;
  const [value, setValue] = useState<NotificationPreferences>(defaultNotificationPreferences); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setFailed(false); void notificationRepository.preferences(accountId).then(next => { if (active) setValue(next); }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [accountId, retry]);
  const quietValid = useMemo(() => !value.quietHours.enabled || Boolean(value.quietHours.start && value.quietHours.end && validTime.test(value.quietHours.start) && validTime.test(value.quietHours.end) && value.quietHours.start !== value.quietHours.end), [value.quietHours]);
  const save = async () => { if (!quietValid) { Alert.alert(copy.text('preferences'), copy.text('quietHoursBody')); return; } setSaving(true); try { const next = await notificationRepository.updatePreferences(accountId, value); setValue(next); Alert.alert(copy.text('preferences'), copy.text('saved')); } catch { Alert.alert(copy.text('preferences'), copy.text('loadError')); } finally { setSaving(false); } };
  if (loading) return <SafeAreaView style={styles.safe}><View accessibilityRole="progressbar" style={styles.center}><BrandLoadingMark color={colors.white}/></View></SafeAreaView>;
  if (failed) return <SafeAreaView style={styles.safe}><View style={styles.center}><MaterialIcons name="error-outline" size={34} color={colors.textSecondary}/><AppText>{copy.text('loadError')}</AppText><Pressable accessibilityRole="button" accessibilityLabel={copy.text('retry')} onPress={() => setRetry(current => current + 1)} style={styles.retry}><AppText>{copy.text('retry')}</AppText></Pressable></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader title={copy.text('preferences')} subtitle={copy.text('preferencesIntro')}/>
    <Section title={copy.text('inApp')} body={copy.text('inAppAlways')}>
      {categories.map(category => <Toggle key={category} label={copy.category(category)} value={mandatory.has(category) ? true : value.categories[category]} disabled={mandatory.has(category)} isRTL={isRTL} onChange={enabled => setValue(current => ({ ...current, categories: { ...current.categories, [category]: enabled } }))}/>) }
    </Section>
    <Section title={copy.text('push')} body={copy.text('pushUnavailable')}><Toggle label={copy.text('push')} value={false} disabled isRTL={isRTL} onChange={() => undefined}/></Section>
    <Section title={copy.text('quietHours')} body={copy.text('quietHoursBody')}>
      <Toggle label={copy.text('quietHours')} value={value.quietHours.enabled} isRTL={isRTL} onChange={enabled => setValue(current => ({ ...current, quietHours: { ...current.quietHours, enabled } }))}/>
      {value.quietHours.enabled ? <View style={[styles.timeRow, isRTL && styles.reverse]}><TimeField label={copy.text('start')} value={value.quietHours.start ?? ''} onChange={start => setValue(current => ({ ...current, quietHours: { ...current.quietHours, start } }))}/><TimeField label={copy.text('end')} value={value.quietHours.end ?? ''} onChange={end => setValue(current => ({ ...current, quietHours: { ...current.quietHours, end } }))}/></View> : null}
      <AppText style={styles.zone}>{copy.text('timezone')}: {value.quietHours.timezone}</AppText>
    </Section>
    <Section title={copy.text('genericPreviews')} body={copy.text('genericPreviewsBody')}><Toggle label={copy.text('genericPreviews')} value={value.genericPreviews} isRTL={isRTL} onChange={genericPreviews => setValue(current => ({ ...current, genericPreviews }))}/></Section>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.text('save')} accessibilityState={{ disabled: saving || !quietValid }} disabled={saving || !quietValid} onPress={() => void save()} style={[styles.save, (saving || !quietValid) && styles.disabled]}>{saving ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.saveText}>{copy.text('save')}</AppText>}</Pressable>
  </ScrollView></SafeAreaView>;
}

function Section({ title, body, children }: { title: string; body: string; children: React.ReactNode }) { return <View style={styles.section}><AppText style={styles.sectionTitle}>{title}</AppText><AppText style={styles.sectionBody}>{body}</AppText>{children}</View>; }
function Toggle({ label, value, disabled, isRTL, onChange }: { label: string; value: boolean; disabled?: boolean; isRTL: boolean; onChange: (value: boolean) => void }) { return <View style={[styles.toggle, isRTL && styles.reverse]}><AppText style={styles.toggleLabel}>{label}</AppText><Switch accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceSoft, true: colors.borderStrong }} thumbColor={value ? colors.white : colors.textMuted}/></View>; }
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <View style={styles.timeField}><AppText style={styles.timeLabel}>{label}</AppText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="22:00" placeholderTextColor={colors.textMuted} maxLength={5} keyboardType="numbers-and-punctuation" style={styles.input}/></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  section: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface }, sectionTitle: { fontSize: 16, fontWeight: typography.bold }, sectionBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  toggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }, toggleLabel: { flex: 1, fontSize: 14 }, reverse: { flexDirection: 'row-reverse' }, timeRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }, timeField: { flex: 1, minWidth: 130, gap: spacing.sm }, timeLabel: { fontSize: 12, color: colors.textSecondary }, input: { minHeight: 48, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: 16 }, zone: { color: colors.textMuted, fontSize: 12 },
  save: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.white }, saveText: { color: colors.background, fontWeight: typography.bold }, retry: { minHeight: 44, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md }, disabled: { opacity: .45 },
});
