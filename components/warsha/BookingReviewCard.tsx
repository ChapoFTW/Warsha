import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { realtimeService } from '@/src/realtime/realtime-service';
import { useReviews } from '@/src/reviews/review-context';
import { useReviewText } from '@/src/reviews/review-translations';
import { emptyDimensions } from '@/src/reviews/review-types';
import type { BookingReview, ReviewAttachment, ReviewDimensions } from '@/src/reviews/review-types';
import { formatTimestamp, localeFor } from '@/src/utils/date-format';

const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const dimensionKeys: (keyof ReviewDimensions)[] = ['professionalism', 'quality', 'punctuality', 'communication', 'value'];

export function BookingReviewCard({ bookingId, providerId, completed }: { bookingId: string; providerId: string; completed: boolean }) {
  const { language, isRTL } = useLocalization();
  const rt = useReviewText();
  const reviews = useReviews();
  const { getBookingReview, revision } = reviews;
  const [review, setReview] = useState<BookingReview>();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [dimensions, setDimensions] = useState<ReviewDimensions>(emptyDimensions);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [attachments, setAttachments] = useState<ReviewAttachment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const scope = useRef(revision);
  scope.current = revision;

  const load = useCallback(() => {
    const current = ++request.current; const targetRevision = revision;
    setLoading(true); setReview(undefined);
    void getBookingReview(bookingId).then(item => {
      if (request.current === current && scope.current === targetRevision) { setReview(item); setError(''); }
    }).catch(() => { if (request.current === current && scope.current === targetRevision) setError(rt('loadError')); })
      .finally(() => { if (request.current === current && scope.current === targetRevision) setLoading(false); });
  }, [bookingId, getBookingReview, revision, rt]);
  useEffect(() => { load(); return () => { request.current += 1; }; }, [load]);
  useEffect(() => {
    let first = true; const reconcile = () => load();
    return review?.id ? realtimeService.reviewDetail(review.id, reconcile, status => { if (status === 'connected') { if (first) first = false; else reconcile(); } })
      : realtimeService.bookingReview(bookingId, reconcile, status => { if (status === 'connected') { if (first) first = false; else reconcile(); } });
  }, [bookingId, load, review?.id]);
  if (!completed) return null;

  const startEdit = () => {
    if (review) { setRating(review.rating); setDimensions(review.dimensions); setComment(review.comment); setAnonymous(review.isAnonymous); setAttachments(review.attachments); }
    else { setRating(0); setDimensions(emptyDimensions()); setComment(''); setAnonymous(false); setAttachments([]); }
    setError(''); setEditing(true);
  };
  const pick = async () => {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_IMAGES - attachments.length, quality: .85 });
    if (result.canceled) return;
    const next: ReviewAttachment[] = [];
    for (const asset of result.assets) {
      if (!asset.mimeType || !MIME.has(asset.mimeType) || !asset.fileSize || asset.fileSize > MAX_BYTES) { setError(rt('photoRules')); continue; }
      const file = new File(asset.uri);
      next.push({ id: asset.assetId?.replace(/[^A-Za-z0-9_-]/g, '') || `${Date.now()}-${next.length}`, url: asset.uri, mimeType: asset.mimeType, size: asset.fileSize, contentHash: file.md5 ?? undefined });
    }
    setAttachments(current => [...current, ...next].slice(0, MAX_IMAGES));
  };
  const save = async () => {
    if (!rating || Object.values(dimensions).some(value => !value)) { setError(rt('chooseRating')); return; }
    setError('');
    const input = { bookingId, providerId, rating, dimensions, comment, isAnonymous: anonymous, attachments, previousAttachmentPaths: review?.attachments.flatMap(item => item.storagePath ? [item.storagePath] : []) };
    try { const saved = review ? await reviews.edit(review.id, input) : await reviews.submit(input); setReview(saved); setEditing(false); load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : rt('reviewError')); }
  };

  return (
    <View style={styles.card}>
      <AppText style={styles.title}>{review ? rt('submitted') : rt('rateService')}</AppText>
      {loading ? <ActivityIndicator accessibilityLabel={rt('loading')} color={colors.white} /> : review && !editing ? (
        <View style={styles.form}>
          <View style={[styles.done, isRTL && styles.reverse]}><MaterialIcons name="verified" size={18} color={colors.success} /><AppText>{rt('verifiedBooking')}</AppText></View>
          <AppText accessibilityLabel={`${rt('overall')}: ${review.rating} / 5`} style={styles.summary}>★ {review.rating} / 5</AppText>
          {review.comment ? <AppText>{review.comment}</AppText> : null}
          <PhotoStrip items={review.attachments} label={rt('image')} />
          {review.canEdit ? <Pressable accessibilityRole="button" accessibilityLabel={rt('editReview')} onPress={startEdit} style={styles.outline}><AppText>{rt('editReview')}</AppText></Pressable> : <AppText style={styles.muted}>{rt('editClosed')}</AppText>}
          {review.editDeadlineAt && review.canEdit ? <AppText style={styles.muted}>{rt('editUntil')} {formatTimestamp(review.editDeadlineAt, localeFor(language))}</AppText> : null}
        </View>
      ) : editing || !review ? (
        <View style={styles.form}>
          <RatingRow label={rt('overall')} value={rating} onChange={setRating} isRTL={isRTL} />
          {dimensionKeys.map(key => <RatingRow key={key} label={rt(key)} value={dimensions[key]} onChange={value => setDimensions(current => ({ ...current, [key]: value }))} isRTL={isRTL} />)}
          <TextInput accessibilityLabel={rt('comment')} value={comment} onChangeText={setComment} maxLength={2000} multiline placeholder={rt('comment')} placeholderTextColor={colors.textMuted} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: anonymous }} accessibilityLabel={rt('anonymous')} onPress={() => setAnonymous(value => !value)} style={[styles.check, isRTL && styles.reverse]}><MaterialIcons name={anonymous ? 'check-box' : 'check-box-outline-blank'} size={24} color={colors.white} /><AppText>{rt('anonymous')}</AppText></Pressable>
          <Pressable accessibilityRole="button" disabled={attachments.length >= MAX_IMAGES || reviews.busy} onPress={() => void pick()} style={styles.outline}><AppText>{rt('photos')} ({attachments.length}/{MAX_IMAGES})</AppText></Pressable>
          <AppText style={styles.muted}>{rt('photoRules')}</AppText>
          <View style={styles.images}>{attachments.map(item => <View key={item.id}><Image accessibilityLabel={rt('image')} source={{ uri: item.url }} style={styles.image} /><Pressable accessibilityRole="button" accessibilityLabel={rt('removePhoto')} onPress={() => setAttachments(current => current.filter(value => value.id !== item.id))} style={styles.remove}><MaterialIcons name="close" size={18} color={colors.background} /></Pressable></View>)}</View>
          <AppText style={styles.count}>{comment.length}/2000</AppText>
          {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
          <Pressable accessibilityRole="button" disabled={reviews.busy} onPress={() => void save()} style={[styles.button, reviews.busy && styles.disabled]}>{reviews.busy ? <ActivityIndicator color={colors.background} /> : <AppText style={styles.buttonText}>{review ? rt('saveChanges') : rt('submit')}</AppText>}</Pressable>
        </View>
      ) : null}
      {!review && !editing && !loading ? <Pressable accessibilityRole="button" onPress={startEdit} style={styles.button}><AppText style={styles.buttonText}>{rt('rateService')}</AppText></Pressable> : null}
      {error && !editing ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

function RatingRow({ label, value, onChange, isRTL }: { label: string; value: number; onChange: (value: number) => void; isRTL: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.ratingRow}><AppText style={styles.ratingLabel}>{label}</AppText><View style={[styles.stars, isRTL && styles.reverse]}>{[1, 2, 3, 4, 5].map(star => <Pressable key={star} accessibilityRole="radio" accessibilityState={{ selected: value === star }} accessibilityLabel={`${label}: ${star} / 5`} onPress={() => onChange(star)} style={styles.star}><MaterialIcons name={star <= value ? 'star' : 'star-border'} size={28} color={colors.white} /></Pressable>)}</View></View>;
}
function PhotoStrip({ items, label }: { items: ReviewAttachment[]; label: string }) {
  if (!items.length) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.images}>{items.map(item => item.url ? <Image accessibilityLabel={label} key={item.id} source={{ uri: item.url }} style={styles.image} /> : null)}</ScrollView>;
}
const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.lg, backgroundColor: colors.surface }, title: { fontSize: 18, fontWeight: typography.semibold }, form: { gap: spacing.sm },
  ratingRow: { gap: 4 }, ratingLabel: { fontWeight: typography.semibold }, stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 }, reverse: { flexDirection: 'row-reverse' }, star: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, color: colors.white, padding: spacing.md, textAlignVertical: 'top' }, count: { fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end' },
  button: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, outline: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, buttonText: { color: colors.background, fontWeight: typography.bold },
  done: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, check: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 44 }, error: { color: colors.error, fontSize: 12 }, muted: { color: colors.textMuted, fontSize: 12 }, disabled: { opacity: .5 }, summary: { fontSize: 18, fontWeight: typography.bold },
  images: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }, image: { width: 88, height: 88, borderRadius: radii.md }, remove: { position: 'absolute', right: -4, top: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
