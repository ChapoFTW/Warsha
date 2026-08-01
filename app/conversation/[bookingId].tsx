import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { useBookings } from '@/src/bookings/booking-context';
import { useChatVisibility } from '@/src/chat/chat-context';
import { bookingChatWritableUntil, isBookingChatActivated, isBookingChatWritable } from '@/src/chat/chat-lifecycle';
import { chatRepository } from '@/src/chat/chat-repository';
import {
  abuseCategoryCopyKey,
  type ChatCopyKey,
  quickReplyCopyKey,
  useChatText,
} from '@/src/chat/chat-translations';
import {
  ABUSE_CATEGORIES,
  QUICK_REPLY_KEYS,
  type AbuseCategory,
  type BookingMessage,
  type MessageDraft,
} from '@/src/chat/chat-types';
import { useLocalization } from '@/src/i18n/localization';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { formatTimestamp, localeFor } from '@/src/utils/date-format';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const clientId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
});
const merge = (items: BookingMessage[]) => [...new Map(items.map((item) => [item.id, item])).values()]
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
const sameDay = (left: string, right: string) => new Date(left).toDateString() === new Date(right).toDateString();

export default function ConversationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user, mode } = useAuth();
  const bookings = useBookings();
  const jobs = useProviderJobs();
  const provider = useProviderFoundation();
  const { language, isRTL } = useLocalization();
  const ct = useChatText();
  const { setActiveBookingId } = useChatVisibility();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;
  const ownId = accountKey;
  const booking = bookings.getBooking(bookingId) ?? jobs.getJob(bookingId);
  const isProvider = Boolean(provider.profile && jobs.getJob(bookingId));
  const activated = Boolean(booking && isBookingChatActivated(booking));

  const listRef = useRef<FlatList<Row>>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typingActive = useRef(false);
  const shouldScroll = useRef(true);
  const [items, setItems] = useState<BookingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failedDraft, setFailedDraft] = useState<MessageDraft | null>(null);
  const [typing, setTyping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<AbuseCategory>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportToken, setReportToken] = useState(clientId());
  const writable = Boolean(booking && isBookingChatWritable(booking, clock));

  const load = useCallback(async (offset = 0, refresh = false) => {
    if (!bookingId || !accountKey) return;
    const request = ++generation.current;
    try {
      if (refresh) setRefreshing(true);
      else if (offset === 0) setLoading(true);
      const page = await chatRepository.list(bookingId, accountKey, offset);
      if (!mounted.current || generation.current !== request) return;
      if (offset === 0) shouldScroll.current = true;
      setItems((current) => offset === 0 ? merge(page.items) : merge([...page.items, ...current]));
      setHasMore(page.hasMore);
      setError(false);
    } catch {
      if (mounted.current && generation.current === request) setError(true);
    } finally {
      if (mounted.current && generation.current === request) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [accountKey, bookingId]);

  const refreshTyping = useCallback(async () => {
    if (!accountKey) return;
    try {
      const people = await chatRepository.typing(bookingId, accountKey);
      if (mounted.current) setTyping(people.some((id) => id !== ownId));
    } catch {
      if (mounted.current) setTyping(false);
    }
  }, [accountKey, bookingId, ownId]);
  const acknowledge = useCallback(async () => {
    if (!accountKey) return;
    try { await chatRepository.markRead(bookingId, accountKey); } catch {}
  }, [accountKey, bookingId]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    shouldScroll.current = true;
    setItems([]);
    setHasMore(false);
    setError(false);
    setActiveBookingId(bookingId);
    void load();
    void acknowledge();
    const unsubscribe = accountKey ? realtimeService.bookingConversation(bookingId, (change) => {
      if (change.bookingId && change.bookingId !== bookingId) return;
      if (change.table === 'conversation_typing') {
        void refreshTyping();
        return;
      }
      void load(0, true);
      void acknowledge();
    }, (status) => {
      if (status === 'connected') {
        void load(0, true);
        void refreshTyping();
      }
    }) : () => {};
    return () => {
      mounted.current = false;
      generation.current += 1;
      setActiveBookingId(null);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current && accountKey) void chatRepository.setTyping(bookingId, accountKey, false);
      unsubscribe();
    };
  }, [accountKey, acknowledge, bookingId, load, refreshTyping, setActiveBookingId]);

  useEffect(() => {
    if (!typing) return;
    const timeout = setTimeout(() => setTyping(false), 8500);
    return () => clearTimeout(timeout);
  }, [typing]);
  useEffect(() => {
    if (items.length && shouldScroll.current) {
      shouldScroll.current = false;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [items.length]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load(0, true);
        return;
      }
      if (typingActive.current && accountKey) {
        typingActive.current = false;
        void chatRepository.setTyping(bookingId, accountKey, false);
      }
    });
    return () => subscription.remove();
  }, [accountKey, bookingId, load]);
  useEffect(() => {
    if (!booking) return;
    const writableUntil = bookingChatWritableUntil(booking);
    if (!writableUntil) return;
    const delay = writableUntil - Date.now();
    if (delay <= 0) {
      setClock(Date.now());
      return;
    }
    const timeout = setTimeout(() => setClock(Date.now()), Math.min(delay, 2147483647));
    return () => clearTimeout(timeout);
  }, [booking]);
  useEffect(() => {
    if (writable) return;
    setDraft('');
    setFailedDraft(null);
    if (typingActive.current && accountKey) {
      typingActive.current = false;
      void chatRepository.setTyping(bookingId, accountKey, false);
    }
  }, [accountKey, bookingId, writable]);

  const updateTyping = useCallback((value: string) => {
    if (!writable || !accountKey) return;
    setDraft(value);
    if (!value.trim()) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current) {
        typingActive.current = false;
        void chatRepository.setTyping(bookingId, accountKey, false);
      }
      return;
    }
    if (!typingActive.current) {
      typingActive.current = true;
      void chatRepository.setTyping(bookingId, accountKey, true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingActive.current = false;
      void chatRepository.setTyping(bookingId, accountKey, false);
    }, 5000);
  }, [accountKey, bookingId, writable]);

  const send = useCallback(async (message: MessageDraft) => {
    if (sending || !booking || !writable || !accountKey) return;
    setSending(true);
    setUploading(Boolean(message.attachment));
    shouldScroll.current = true;
    try {
      const result = await chatRepository.send(booking, accountKey, message);
      if (!mounted.current) return;
      setItems((current) => merge([...current, result]));
      setDraft('');
      setFailedDraft(null);
      void load(0, true);
    } catch {
      if (mounted.current) {
        setFailedDraft(message);
        Alert.alert(ct('title'), message.kind === 'image' || message.kind === 'file' ? ct('imageLoadError') : ct('offline'));
      }
    } finally {
      if (mounted.current) {
        setSending(false);
        setUploading(false);
      }
    }
  }, [accountKey, booking, ct, load, sending, writable]);

  const sendText = () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > 2000) {
      Alert.alert(ct('title'), ct('messageTooLong'));
      return;
    }
    updateTyping('');
    void send({ kind: 'text', body, clientId: clientId() });
  };
  const chooseImage = async (camera: boolean) => {
    if (!writable) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(ct('title'), camera ? ct('permissionCamera') : ct('permissionPhotos'));
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > MAX_ATTACHMENT_BYTES) {
      Alert.alert(ct('title'), ct('imageTooLarge'));
      return;
    }
    const mimeType = asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType;
    if (mimeType && !['image/jpeg', 'image/png', 'image/heic'].includes(mimeType)) {
      Alert.alert(ct('title'), ct('unsupportedFile'));
      return;
    }
    void send({ kind: 'image', attachment: { uri: asset.uri, mimeType, fileName: asset.fileName }, clientId: clientId() });
  };
  const choosePdf = async () => {
    if (!writable) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_ATTACHMENT_BYTES) {
      Alert.alert(ct('title'), ct('imageTooLarge'));
      return;
    }
    if (asset.mimeType && asset.mimeType !== 'application/pdf') {
      Alert.alert(ct('title'), ct('unsupportedFile'));
      return;
    }
    void send({
      kind: 'file',
      attachment: { uri: asset.uri, mimeType: 'application/pdf', fileName: asset.name },
      clientId: clientId(),
    });
  };
  const openAttachmentMenu = () => Alert.alert(ct('attachment'), undefined, [
    { text: ct('camera'), onPress: () => void chooseImage(true) },
    { text: ct('gallery'), onPress: () => void chooseImage(false) },
    { text: ct('chooseFile'), onPress: () => void choosePdf() },
    { text: ct('close'), style: 'cancel' },
  ]);
  const submitReport = async () => {
    if (!booking || !accountKey || reportBusy) return;
    setReportBusy(true);
    try {
      await chatRepository.report(booking.id, accountKey, reportCategory, reportDetails, undefined, reportToken);
      setReportOpen(false);
      setReportDetails('');
      Alert.alert(ct('reportTitle'), ct('reportSent'));
    } catch {
      Alert.alert(ct('reportTitle'), ct('reportFailed'));
    } finally {
      setReportBusy(false);
    }
  };
  const rows = useMemo<Row[]>(() => items.map((item, index) => ({
    item,
    separator: index === 0 || !sameDay(item.createdAt, items[index - 1].createdAt),
  })), [items]);

  if (!booking) return <State title={ct('title')} text={ct('conversationUnavailable')} />;
  if (loading) return <SafeAreaView style={styles.safe}><ScreenHeader title={ct('title')} /><View style={styles.state}><ActivityIndicator color={colors.white} /></View></SafeAreaView>;
  if (error && !items.length) return <SafeAreaView style={styles.safe}><ScreenHeader title={ct('title')} /><View style={styles.state}><AppText>{ct('loadError')}</AppText><Pressable style={styles.retry} onPress={() => void load()}><AppText>{ct('retry')}</AppText></Pressable></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title={ct('title')} subtitle={booking.serviceName} />
        <View style={[styles.safetyBar, isRTL && styles.reverse]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${ct('call')}. ${ct('callUnavailable')}`}
            accessibilityState={{ disabled: true }}
            onPress={() => Alert.alert(ct('call'), ct('callUnavailable'))}
            style={[styles.safetyAction, styles.safetyDisabled]}
          >
            <MaterialIcons name="phone-in-talk" size={18} color={colors.textMuted} />
            <AppText style={styles.safetyText}>{ct('call')}</AppText>
          </Pressable>
          {activated ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={ct('report')}
            onPress={() => {
              setReportToken(clientId());
              setReportOpen(true);
            }}
            style={styles.safetyAction}
          >
            <MaterialIcons name="shield" size={18} color={colors.textSecondary} />
            <AppText style={styles.safetyText}>{ct('report')}</AppText>
          </Pressable> : null}
        </View>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.item.id}
          contentContainerStyle={[styles.list, !items.length && styles.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(0, true)} tintColor={colors.white} />}
          onEndReached={() => {
            if (!hasMore || loadingMore) return;
            setLoadingMore(true);
            void load(items.length);
          }}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="chat-bubble-outline" size={32} color={colors.textMuted} /><AppText style={styles.emptyTitle}>{ct('empty')}</AppText><AppText style={styles.emptyBody}>{ct('emptyBody')}</AppText></View>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.white} /> : null}
          renderItem={({ item: row }) => <View>
            {row.separator ? <DateLabel value={row.item.createdAt} language={language} today={ct('today')} yesterday={ct('yesterday')} /> : null}
            <Bubble message={row.item} own={row.item.senderId === ownId} isRTL={isRTL} language={language} ct={ct} onPreview={setPreview} />
          </View>}
        />
        {typing && writable ? <AppText style={[styles.typing, isRTL && styles.rtlText]}>{isProvider ? ct('typingCustomer') : ct('typingProvider')}</AppText> : null}
        {uploading ? <AppText accessibilityLiveRegion="polite" style={styles.uploading}>{ct('uploading')}</AppText> : null}
        {writable && failedDraft ? <Pressable style={styles.failed} onPress={() => void send(failedDraft)}><AppText style={styles.failedText}>{failedDraft.kind === 'image' || failedDraft.kind === 'file' ? ct('retryUpload') : ct('offline')}</AppText></Pressable> : null}
        {writable ? <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReplies} accessibilityLabel={ct('quickReplies')}>
            {QUICK_REPLY_KEYS.map((key) => <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={ct(quickReplyCopyKey(key))}
              disabled={sending}
              onPress={() => void send({ kind: 'quick_reply', body: key, clientId: clientId() })}
              style={styles.quickReply}
            ><AppText style={styles.quickReplyText}>{ct(quickReplyCopyKey(key))}</AppText></Pressable>)}
          </ScrollView>
          <View style={[styles.composer, isRTL && styles.reverse]}>
            <Pressable accessibilityLabel={ct('attachment')} style={styles.iconButton} onPress={openAttachmentMenu}>
              <MaterialIcons name="attach-file" size={22} color={colors.white} />
            </Pressable>
            <TextInput value={draft} onChangeText={updateTyping} onSubmitEditing={sendText} placeholder={ct('placeholder')} placeholderTextColor={colors.textMuted} style={[styles.input, isRTL && styles.rtlText]} multiline editable={!sending} />
            <Pressable accessibilityLabel={ct('send')} disabled={!draft.trim() || sending} style={[styles.send, (!draft.trim() || sending) && styles.disabled]} onPress={sendText}>
              {sending ? <ActivityIndicator color={colors.background} /> : <MaterialIcons name="send" size={19} color={colors.background} />}
            </Pressable>
          </View>
        </> : <View style={styles.readOnly}><MaterialIcons name="lock-outline" size={20} color={colors.textMuted} /><AppText style={styles.readOnlyText}>{ct('readOnly')}</AppText></View>}
      </KeyboardAvoidingView>
      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewModal}>
          <Pressable accessibilityLabel={ct('close')} style={styles.close} onPress={() => setPreview(null)}><MaterialIcons name="close" size={26} color={colors.white} /></Pressable>
          {preview ? <Image source={{ uri: preview }} contentFit="contain" style={styles.preview} /> : null}
        </View>
      </Modal>
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.reportBackdrop}>
          <View style={styles.reportSheet}>
            <View style={[styles.reportHeader, isRTL && styles.reverse]}><AppText style={styles.reportTitle}>{ct('reportTitle')}</AppText><Pressable accessibilityLabel={ct('close')} onPress={() => setReportOpen(false)}><MaterialIcons name="close" size={24} color={colors.white} /></Pressable></View>
            <AppText style={[styles.reportBody, isRTL && styles.rtlText]}>{ct('reportBody')}</AppText>
            <ScrollView style={styles.categoryList} contentContainerStyle={styles.categoryContent}>
              {ABUSE_CATEGORIES.map((category) => <Pressable
                key={category}
                accessibilityRole="radio"
                accessibilityState={{ checked: reportCategory === category }}
                onPress={() => setReportCategory(category)}
                style={[styles.category, reportCategory === category && styles.categorySelected, isRTL && styles.reverse]}
              ><MaterialIcons name={reportCategory === category ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={reportCategory === category ? colors.white : colors.textMuted} /><AppText>{ct(abuseCategoryCopyKey(category))}</AppText></Pressable>)}
            </ScrollView>
            <TextInput value={reportDetails} onChangeText={(value) => setReportDetails(value.slice(0, 1000))} placeholder={ct('reportDetails')} placeholderTextColor={colors.textMuted} multiline style={[styles.reportInput, isRTL && styles.rtlText]} />
            <Pressable accessibilityRole="button" disabled={reportBusy} onPress={() => void submitReport()} style={[styles.reportSubmit, reportBusy && styles.disabled]}>{reportBusy ? <ActivityIndicator color={colors.background} /> : <AppText style={styles.reportSubmitText}>{ct('reportSubmit')}</AppText>}</Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type Row = { item: BookingMessage; separator: boolean };
function State({ title, text }: { title: string; text: string }) {
  return <SafeAreaView style={styles.safe}><ScreenHeader title={title} /><View style={styles.state}><AppText>{text}</AppText></View></SafeAreaView>;
}
function DateLabel({ value, language, today, yesterday }: { value: string; language: 'en' | 'ar'; today: string; yesterday: string }) {
  const now = new Date();
  const prior = new Date();
  prior.setDate(now.getDate() - 1);
  const label = sameDay(value, now.toISOString()) ? today : sameDay(value, prior.toISOString()) ? yesterday : new Date(value).toLocaleDateString(localeFor(language), { day: 'numeric', month: 'short', year: 'numeric' });
  return <View style={styles.date}><AppText style={styles.dateText}>{label}</AppText></View>;
}
function Bubble({ message, own, isRTL, language, ct, onPreview }: { message: BookingMessage; own: boolean; isRTL: boolean; language: 'en' | 'ar'; ct: (key: ChatCopyKey) => string; onPreview: (url: string) => void }) {
  if (['system', 'status', 'running_late'].includes(message.kind)) {
    const event = message.systemEvent as ChatCopyKey | undefined;
    return <View style={styles.system}><AppText style={styles.systemText}>{message.body || (event && (event in systemEvents || event.startsWith('operation_')) ? ct(event) : ct('system'))}</AppText></View>;
  }
  const attachment = message.attachments[0];
  const body = message.kind === 'quick_reply' && message.quickReplyKey ? ct(quickReplyCopyKey(message.quickReplyKey)) : message.body;
  return <View style={[styles.bubbleRow, own ? styles.ownRow : styles.otherRow]}><View style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble]}>
    {attachment?.url && message.kind === 'image' ? <Pressable accessibilityRole="imagebutton" accessibilityLabel={ct('image')} onPress={() => onPreview(attachment.url!)}><Image source={{ uri: attachment.url }} contentFit="cover" style={styles.image} /></Pressable> : null}
    {attachment?.url && message.kind === 'file' ? <Pressable accessibilityRole="link" accessibilityLabel={`${ct('file')}. ${attachment.fileName ?? ''}`} onPress={() => void WebBrowser.openBrowserAsync(attachment.url!)} style={[styles.fileRow, isRTL && styles.reverse]}><MaterialIcons name="picture-as-pdf" size={26} color={own ? colors.background : colors.white} /><View style={styles.fileText}><AppText style={[styles.body, !own && styles.otherBody]} numberOfLines={2}>{attachment.fileName ?? ct('file')}</AppText>{attachment.byteSize ? <AppText style={styles.time}>{Math.ceil(attachment.byteSize / 1024)} KB</AppText> : null}</View></Pressable> : null}
    {body ? <AppText style={[styles.body, !own && styles.otherBody, isRTL && styles.rtlText]}>{body}</AppText> : null}
    <View style={[styles.meta, isRTL && styles.reverse]}><AppText style={styles.time}>{formatTimestamp(message.createdAt, localeFor(language))}</AppText></View>
  </View></View>;
}
const systemEvents: Record<string, true> = {
  off_platform_reminder: true,
  worker_running_late: true,
  booking_pending_provider_approval: true,
  booking_accepted: true,
  booking_rejected: true,
  booking_rescheduling_requested: true,
  booking_confirmed: true,
  booking_provider_on_the_way: true,
  booking_provider_arrived: true,
  booking_job_started: true,
  booking_work_in_progress: true,
  booking_completed: true,
  booking_disputed: true,
  booking_cancelled: true,
  booking_refunded: true,
  booking_no_show: true,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  retry: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md },
  safetyBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderColor: colors.borderSoft },
  safetyAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  safetyDisabled: { opacity: 0.7 },
  safetyText: { color: colors.textSecondary, fontSize: 11 },
  list: { padding: spacing.lg, gap: spacing.sm },
  listEmpty: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  emptyTitle: { fontSize: 16, fontWeight: typography.semibold },
  emptyBody: { textAlign: 'center', color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  date: { alignSelf: 'center', marginVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  dateText: { color: colors.textMuted, fontSize: 10 },
  bubbleRow: { flexDirection: 'row' },
  ownRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: radii.lg, padding: spacing.sm, gap: 5 },
  ownBubble: { backgroundColor: colors.white },
  otherBubble: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSoft },
  body: { color: colors.background, fontSize: 14, lineHeight: 20 },
  otherBody: { color: colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  time: { color: colors.textMuted, fontSize: 9 },
  image: { width: 220, height: 180, borderRadius: radii.md, backgroundColor: colors.surface },
  fileRow: { minWidth: 210, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.xs },
  fileText: { flex: 1 },
  system: { alignSelf: 'center', maxWidth: '88%', borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginVertical: 2 },
  systemText: { textAlign: 'center', fontSize: 11, lineHeight: 17, color: colors.textMuted },
  typing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, color: colors.textMuted, fontSize: 12 },
  uploading: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: spacing.xs },
  failed: { marginHorizontal: spacing.lg, marginBottom: spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: colors.error, padding: spacing.sm },
  failedText: { color: colors.error, fontSize: 11, textAlign: 'center' },
  quickReplies: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderColor: colors.borderSoft },
  quickReply: { minHeight: 40, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  quickReplyText: { fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.background },
  readOnly: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderColor: colors.borderSoft },
  readOnlyText: { maxWidth: 520, color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  reverse: { flexDirection: 'row-reverse' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 110, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.white, fontSize: 14 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.white },
  disabled: { opacity: 0.45 },
  previewModal: { flex: 1, backgroundColor: 'rgba(0,0,0,.96)', alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 56, right: 22, zIndex: 2, padding: spacing.sm },
  reportBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  reportSheet: { maxHeight: '88%', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportTitle: { fontSize: 18, fontWeight: typography.bold },
  reportBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  categoryList: { maxHeight: 260 },
  categoryContent: { gap: spacing.xs },
  category: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  categorySelected: { backgroundColor: colors.surfaceElevated },
  reportInput: { minHeight: 88, maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, color: colors.white, textAlignVertical: 'top' },
  reportSubmit: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.white },
  reportSubmitText: { color: colors.background, fontWeight: typography.bold },
});
