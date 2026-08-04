import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import type { Booking } from '@/src/bookings/booking-types';
import { environment } from '@/src/config/environment';
import { disputeAccountId, disputeRepository } from '@/src/disputes/dispute-repository';
import { disputeEventKey, disputeReasonKey, disputeStateKey, useDisputeText, type DisputeCopyKey } from '@/src/disputes/dispute-translations';
import { DISPUTE_REASONS, disputeIdempotency, type BookingDispute, type DisputeReason, type DisputeResponse, type DisputeRole, type DisputeUpload } from '@/src/disputes/dispute-types';
import { useLocalization } from '@/src/i18n/localization';
import { realtimeService } from '@/src/realtime/realtime-service';
import { formatNumber, formatTimestamp, localeFor } from '@/src/utils/date-format';
import { BrandLoadingMark as ActivityIndicator } from './BrandMark';
import { AppText } from './Typography';

type ParticipantRole = Exclude<DisputeRole, 'staff'>;
type Panel = 'create' | 'respond' | 'withdraw' | null;
const OPENABLE_STATUSES = ['confirmed', 'provider_on_the_way', 'provider_arrived', 'job_started', 'work_in_progress', 'completed', 'disputed', 'no_show'];

export function BookingDisputePanel({ booking, role }: { booking: Booking; role: ParticipantRole }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const auth = useAuth(); const { language, isRTL } = useLocalization(); const dt = useDisputeText();
  const accountId = disputeAccountId(environment.dataMode, auth.user?.id, role);
  const [dispute, setDispute] = useState<BookingDispute | null>(null); const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false); const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState<DisputeReason>('work_incomplete'); const [description, setDescription] = useState('');
  const [response, setResponse] = useState(''); const [responseType, setResponseType] = useState<DisputeResponse>('respond');

  const load = useCallback(async (show = true) => {
    if (!accountId) { setLoading(false); return; }
    if (show) setLoading(true);
    try { setDispute(await disputeRepository.get(booking, accountId, role)); setFailed(false); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  }, [accountId, booking, role]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => realtimeService.bookingDispute(booking.id, () => void load(false)), [booking.id, load]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true);
    try { await action(); await load(false); setPanel(null); setResponse(''); }
    catch (error) { Alert.alert(dt('title'), error instanceof Error && /duplicate/i.test(error.message) ? dt('duplicateEvidence') : dt('actionFailed')); }
    finally { setBusy(false); }
  };
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85 });
    if (!result.canceled) await upload({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType, fileName: result.assets[0].fileName, byteSize: result.assets[0].fileSize, clientId: disputeIdempotency('evidence-photo') });
  };
  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (!result.canceled) await upload({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType, fileName: result.assets[0].name, byteSize: result.assets[0].size, clientId: disputeIdempotency('evidence-pdf') });
  };
  const upload = async (file: DisputeUpload) => { if (dispute) await run(() => disputeRepository.uploadEvidence(dispute, accountId, file)); };

  if (loading) return <Card><View accessibilityRole="progressbar" accessibilityLabel={dt('loading')} style={styles.state}><ActivityIndicator color={colors.white}/></View></Card>;
  if (failed) return <Card><View style={styles.state}><AppText accessibilityRole="alert" style={styles.muted}>{dt('loadError')}</AppText><Action label={dt('retry')} onPress={() => void load()}/></View></Card>;
  if (!dispute && (role !== 'customer' || !OPENABLE_STATUSES.includes(booking.status))) return null;

  if (!dispute) return <Card><AppText style={styles.heading}>{dt('title')}</AppText><AppText style={styles.note}>{dt('intro')}</AppText>{panel === 'create' ? <>
    <AppText style={styles.label}>{dt('reason')}</AppText><View style={[styles.wrap, isRTL && styles.reverse]}>{DISPUTE_REASONS.map(item => <Choice key={item} label={dt(disputeReasonKey(item))} selected={reason === item} onPress={() => setReason(item)}/>)}</View>
    <Field label={dt('description')} value={description} onChangeText={setDescription} multiline maxLength={4000}/><AppText style={styles.muted}>{dt('descriptionHelp')}</AppText>
    <Action primary busy={busy} disabled={description.trim().length < 10} label={dt('saveDraft')} onPress={() => void run(async () => { await disputeRepository.createDraft(booking, accountId, reason, description, disputeIdempotency('dispute-draft')); })}/>
    <Action label={dt('withdraw')} onPress={() => setPanel(null)}/>
  </> : <Action primary label={dt('open')} onPress={() => setPanel('create')}/>}</Card>;

  const canRespond = role === 'worker' ? ['submitted', 'waiting_worker'].includes(dispute.state) : dispute.state === 'waiting_customer';
  const canUpload = ['draft', 'submitted', 'waiting_customer', 'waiting_worker', 'waiting_staff', 'under_review'].includes(dispute.state) && !(role === 'worker' && dispute.state === 'draft');
  const canWithdraw = role === 'customer' && ['draft', 'submitted', 'waiting_customer', 'waiting_worker', 'waiting_staff'].includes(dispute.state);
  const sourceEntries = Object.entries(dispute.evidenceSources).filter(([, value]) => typeof value === 'boolean' ? value : value > 0);

  return <View style={styles.wrapper}>
    <Card><View style={[styles.row, isRTL && styles.reverse]}><View style={styles.grow}><AppText style={styles.heading}>{dt('title')}</AppText><AppText style={styles.muted}>{dt(disputeReasonKey(dispute.reason))}</AppText></View><View style={styles.badge}><AppText style={styles.badgeText}>{dt(disputeStateKey(dispute.state))}</AppText></View></View><AppText style={styles.note}>{dispute.description}</AppText>{dispute.eligibleUntil && dispute.eligibleUntil !== 'infinity' ? <AppText style={styles.muted}>{dt('eligibleUntil')}: {formatTimestamp(dispute.eligibleUntil, localeFor(language))}</AppText> : null}<AppText style={styles.warning}>{dt('reviewHold')}</AppText></Card>
    <Card><AppText style={styles.heading}>{dt('linkedEvidence')}</AppText>{sourceEntries.length ? <View style={[styles.wrap, isRTL && styles.reverse]}>{sourceEntries.map(([key, value]) => <View key={key} style={styles.source}><AppText style={styles.sourceText}>{dt(`source_${key}` as DisputeCopyKey)}{typeof value === 'number' ? ` · ${formatNumber(value, language)}` : ''}</AppText></View>)}</View> : <AppText style={styles.muted}>{dt('noEvidence')}</AppText>}</Card>
    <Card><AppText style={styles.heading}>{dt('evidence')}</AppText><AppText style={styles.muted}>{dt('evidenceHelp')}</AppText>{dispute.evidence.length ? <View style={[styles.evidenceGrid, isRTL && styles.reverse]}>{dispute.evidence.map(item => <Pressable accessibilityRole="link" accessibilityLabel={item.fileName} key={item.id} onPress={() => item.url ? void Linking.openURL(item.url) : undefined} style={styles.evidenceCard}>{item.mimeType.startsWith('image/') && item.url ? <Image source={{ uri: item.url }} style={styles.image} accessibilityLabel={item.fileName}/> : <View style={[styles.image, styles.file]}><MaterialIcons name="picture-as-pdf" size={28} color={colors.textSecondary}/></View>}<AppText numberOfLines={2} style={styles.fileName}>{item.fileName}</AppText><AppText style={styles.muted}>{formatNumber(Math.ceil(item.byteSize / 1024), language)} KB</AppText></Pressable>)}</View> : <AppText style={styles.muted}>{dt('noEvidence')}</AppText>}{canUpload ? <View style={[styles.row, isRTL && styles.reverse]}><Action grow label={dt('addPhoto')} icon="add-photo-alternate" busy={busy} onPress={() => void pickPhoto()}/><Action grow label={dt('addFile')} icon="picture-as-pdf" busy={busy} onPress={() => void pickPdf()}/></View> : null}</Card>
    <Card><AppText style={styles.heading}>{dt('timeline')}</AppText>{dispute.events.length ? dispute.events.map((event, index) => { const key = disputeEventKey(event.eventType); return <View key={event.id} style={[styles.timeline, isRTL && styles.reverse]}><View style={styles.marker}><View style={styles.dot}/>{index < dispute.events.length - 1 ? <View style={styles.line}/> : null}</View><View style={styles.grow}><AppText style={styles.itemTitle}>{key ? dt(key) : dt(disputeStateKey(event.state))}</AppText>{event.note ? <AppText style={styles.note}>{event.note}</AppText> : null}<AppText style={styles.muted}>{formatTimestamp(event.createdAt, localeFor(language))}</AppText></View></View>; }) : <AppText style={styles.muted}>{dt('noEvents')}</AppText>}</Card>
    {dispute.resolution ? <Card><AppText style={styles.heading}>{dt('resolution')}</AppText><AppText style={styles.note}>{dispute.resolution.summary}</AppText><AppText style={styles.muted}>{dt('financialDelegation')}</AppText>{dispute.resolution.returnVisitId ? <AppText style={styles.muted}>{dt('returnVisit')}</AppText> : null}</Card> : null}
    {canRespond ? <Card><AppText style={styles.heading}>{dt('respond')}</AppText>{panel === 'respond' ? <><Field label={dt('response')} value={response} onChangeText={setResponse} multiline maxLength={2000}/>{role === 'worker' ? <View style={[styles.wrap, isRTL && styles.reverse]}><Choice label={dt('respond')} selected={responseType === 'respond'} onPress={() => setResponseType('respond')}/><Choice label={dt('acceptResponsibility')} selected={responseType === 'accept_responsibility'} onPress={() => setResponseType('accept_responsibility')}/><Choice label={dt('contest')} selected={responseType === 'contest'} onPress={() => setResponseType('contest')}/></View> : null}<AppText style={styles.muted}>{dt('responseHelp')}</AppText><Action primary busy={busy} disabled={response.trim().length < 3} label={dt('respond')} onPress={() => void run(() => disputeRepository.respond(dispute.id, accountId, role, role === 'customer' ? 'respond' : responseType, response, disputeIdempotency('dispute-response')))}/></> : <Action label={dt('respond')} onPress={() => setPanel('respond')}/>}</Card> : null}
    {canWithdraw ? <Card>{panel === 'withdraw' ? <><Field label={dt('withdrawPrompt')} value={response} onChangeText={setResponse} multiline maxLength={1000}/><Action busy={busy} disabled={response.trim().length < 3} label={dt('withdraw')} danger onPress={() => void run(() => disputeRepository.withdraw(dispute.id, accountId, response, disputeIdempotency('dispute-withdraw')))}/></> : <Action danger label={dt('withdraw')} onPress={() => setPanel('withdraw')}/>}</Card> : null}
    {!canRespond && !dispute.resolution && dispute.state !== 'draft' ? <Card><AppText style={styles.note}>{dt('waiting')}</AppText></Card> : null}
    {dispute.state === 'draft' ? <Card><Action primary busy={busy} label={dt('submit')} onPress={() => void run(() => disputeRepository.submit(dispute.id, accountId, disputeIdempotency('dispute-submit')))}/></Card> : null}
  </View>;
}

function Card({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.card}>{children}</View>; }
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles); const { isRTL } = useLocalization(); return <View style={styles.field}><AppText style={styles.label}>{label}</AppText><TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} {...props} style={[styles.input, props.multiline && styles.multiline, { textAlign: isRTL ? 'right' : 'left' }]}/></View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles); return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} onPress={onPress} style={[styles.choice, selected && styles.selected]}><AppText style={styles.choiceText}>{label}</AppText></Pressable>; }
function Action({ label, onPress, busy, disabled, primary, danger, grow, icon }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; primary?: boolean; danger?: boolean; grow?: boolean; icon?: React.ComponentProps<typeof MaterialIcons>['name'] }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled} onPress={onPress} style={[styles.action, grow && styles.grow, primary && styles.primary, danger && styles.danger, (busy || disabled) && styles.disabled]}>{busy ? <ActivityIndicator color={primary ? colors.background : colors.white}/> : <>{icon ? <MaterialIcons name={icon} size={18} color={danger ? colors.error : primary ? colors.background : colors.textPrimary}/> : null}<AppText style={[styles.actionText, primary && styles.primaryText, danger && styles.dangerText]}>{label}</AppText></>}</Pressable>; }

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { gap: spacing.md }, card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.xl, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, reverse: { flexDirection: 'row-reverse' }, grow: { flex: 1 },
  heading: { fontSize: 17, fontWeight: typography.bold }, itemTitle: { fontSize: 13, fontWeight: typography.semibold }, note: { color: colors.textSecondary, lineHeight: 21 }, muted: { color: colors.textMuted, fontSize: 11, lineHeight: 17 }, warning: { color: colors.warning, fontSize: 11, lineHeight: 17 }, label: { color: colors.textSecondary, fontSize: 12 },
  badge: { maxWidth: '50%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated }, badgeText: { fontSize: 11, textAlign: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md }, selected: { borderColor: colors.white, backgroundColor: colors.surfaceElevated }, choiceText: { fontSize: 12 },
  field: { gap: 6 }, input: { minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }, multiline: { minHeight: 110, textAlignVertical: 'top' },
  action: { minHeight: 48, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg }, primary: { backgroundColor: colors.white, borderColor: colors.white }, danger: { borderColor: colors.actionDangerBorder }, actionText: { fontSize: 13, fontWeight: typography.semibold, textAlign: 'center' }, primaryText: { color: colors.background }, dangerText: { color: colors.error }, disabled: { opacity: 0.45 },
  source: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated }, sourceText: { fontSize: 10, color: colors.textSecondary }, evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, evidenceCard: { width: 105, gap: 4, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.md }, image: { width: '100%', height: 76, borderRadius: radii.sm, backgroundColor: colors.surfaceElevated }, file: { alignItems: 'center', justifyContent: 'center' }, fileName: { fontSize: 10, lineHeight: 14 },
  timeline: { flexDirection: 'row', gap: spacing.md, minHeight: 54 }, marker: { width: 12, alignItems: 'center' }, dot: { width: 9, height: 9, marginTop: 4, borderRadius: 5, backgroundColor: colors.white }, line: { width: 1, flex: 1, marginTop: 4, backgroundColor: colors.border }, state: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
