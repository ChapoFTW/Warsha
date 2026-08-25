import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useWorkerProfileText } from '@/src/i18n/worker-profile-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import type { PortfolioItem, PortfolioItemInput } from '@/src/providers/provider-types';
import { catalogueServiceLabel } from '@/src/services/specific-services';

const emptyInput: PortfolioItemInput = { title: '', description: '', completedPeriod: '', status: 'draft' };

export default function ProviderPortfolioScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL, language } = useLocalization();
  const wt = useWorkerProfileText();
  const state = useProviderFoundation();
  const [form, setForm] = useState<PortfolioItemInput>(emptyInput);

  const save = async () => {
    try { await state.savePortfolioItem(form); setForm(emptyInput); }
    catch { Alert.alert(wt('portfolio'), wt('retry')); }
  };

  const edit = (item: PortfolioItem) => setForm({
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    serviceId: item.serviceId,
    completedPeriod: item.completedPeriod,
    status: item.status,
  });

  const addImages = async (item: PortfolioItem) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert(wt('portfolio'), wt('retry')); return; }
    const remaining = 5 - item.images.length;
    if (remaining <= 0) { Alert.alert(wt('portfolioLimits')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.85,
    });
    if (result.canceled) return;
    for (const asset of result.assets.slice(0, remaining)) {
      try { await state.uploadPortfolioImage(item.id, { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType }); }
      catch (error) {
        const duplicate = error instanceof Error && error.message.toLowerCase().includes('duplicate');
        Alert.alert(wt('portfolio'), duplicate ? wt('duplicateImage') : wt('retry'));
      }
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= state.portfolio.length) return;
    const ids = state.portfolio.map(item => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void state.reorderPortfolio(ids).catch(() => Alert.alert(wt('portfolio'), wt('retry')));
  };

  const moveImage = (item: PortfolioItem, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= item.images.length) return;
    const ids = item.images.map(image => image.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void state.reorderPortfolioImages(item.id, ids).catch(() => Alert.alert(wt('portfolio'), wt('retry')));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={wt('portfolio')} />
      <ScrollView contentContainerStyle={[styles.content, isRTL && { direction: 'rtl' }]} keyboardShouldPersistTaps="handled">
        <View style={styles.notice} accessibilityRole="alert">
          <MaterialIcons name="privacy-tip" size={26} color={colors.white} />
          <View style={styles.grow}><AppText style={styles.strong}>{wt('portfolioPrivacy')}</AppText><AppText style={styles.muted}>{wt('portfolioLimits')}</AppText></View>
        </View>

        <View style={styles.card}>
          <AppText style={styles.title}>{form.id ? wt('saveItem') : wt('newPortfolioItem')}</AppText>
          <Field label={wt('portfolioTitle')} value={form.title} maxLength={80} onChangeText={title => setForm(current => ({ ...current, title }))} />
          <Field label={wt('portfolioDescription')} value={form.description} maxLength={500} multiline onChangeText={description => setForm(current => ({ ...current, description }))} />
          <Field label={wt('completedPeriod')} value={form.completedPeriod ?? ''} maxLength={40} onChangeText={completedPeriod => setForm(current => ({ ...current, completedPeriod }))} />
          {state.profile?.services.length ? <><AppText style={styles.strong}>{wt('relatedWork')}</AppText><View style={styles.wrap}>{state.profile.services.map(service => <Pressable key={service.serviceId} accessibilityRole="radio" accessibilityState={{ checked: form.serviceId === service.serviceId }} onPress={() => setForm(current => ({ ...current, serviceId: current.serviceId === service.serviceId ? undefined : service.serviceId }))} style={[styles.chip, form.serviceId === service.serviceId && styles.selected]}><AppText>{catalogueServiceLabel(service, language)}</AppText></Pressable>)}</View></> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.saving || form.title.trim().length < 2 }} disabled={state.saving || form.title.trim().length < 2} onPress={() => void save()} style={[styles.primary, form.title.trim().length < 2 && styles.disabled]}>
            {state.saving ? <BrandLoadingMark size={20} color={colors.background} /> : <AppText style={styles.dark}>{wt('saveItem')}</AppText>}
          </Pressable>
          {form.id ? <Pressable accessibilityRole="button" onPress={() => setForm(emptyInput)} style={styles.outline}><AppText>{wt('cancel')}</AppText></Pressable> : null}
        </View>

        {!state.portfolio.length ? <AppText style={styles.empty}>{wt('noPortfolio')}</AppText> : null}
        {state.portfolio.map((item, itemIndex) => (
          <View key={item.id} style={styles.card}>
            <View style={[styles.between, isRTL && styles.reverse]}>
              <View style={styles.grow}><AppText style={styles.title}>{item.title}</AppText><AppText style={styles.status}>{wt(item.status)}</AppText></View>
              <MaterialIcons name={item.status === 'published' ? 'visibility' : 'visibility-off'} size={24} color={colors.textMuted} />
            </View>
            {item.description ? <AppText style={styles.copy}>{item.description}</AppText> : null}
            {item.completedPeriod ? <AppText style={styles.muted}>{item.completedPeriod}</AppText> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
              {item.images.map((image, imageIndex) => (
                <View key={image.id} style={styles.imageCard}>
                  <Image source={{ uri: image.previewUrl }} contentFit="cover" style={styles.image} />
                  <View style={styles.imageActions}>
                    <IconButton label={wt('moveEarlier')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} disabled={imageIndex === 0} onPress={() => moveImage(item, imageIndex, -1)} />
                    <IconButton label={wt('deleteImage')} icon="delete-outline" onPress={() => void state.deletePortfolioImage(image.id).catch(() => Alert.alert(wt('portfolio'), wt('retry')))} />
                    <IconButton label={wt('moveLater')} icon={isRTL ? 'arrow-back' : 'arrow-forward'} disabled={imageIndex === item.images.length - 1} onPress={() => moveImage(item, imageIndex, 1)} />
                  </View>
                </View>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" disabled={item.images.length >= 5 || state.saving} onPress={() => void addImages(item)} style={styles.outline}><MaterialIcons name="add-photo-alternate" size={22} color={colors.white} /><AppText>{wt('addWorkPhoto')}</AppText></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ checked: item.status === 'published' }} disabled={!item.images.length || state.saving} onPress={() => void state.savePortfolioItem({ id: item.id, title: item.title, description: item.description, categoryId: item.categoryId, serviceId: item.serviceId, completedPeriod: item.completedPeriod, status: item.status === 'published' ? 'draft' : 'published' }).catch(() => Alert.alert(wt('portfolio'), wt('retry')))} style={[styles.outline, !item.images.length && styles.disabled]}>
              <MaterialIcons name={item.status === 'published' ? 'visibility-off' : 'visibility'} size={22} color={colors.white} /><AppText>{item.status === 'published' ? wt('unpublishItem') : wt('publishItem')}</AppText>
            </Pressable>
            <View style={[styles.actions, isRTL && styles.reverse]}>
              <IconButton label={wt('moveEarlier')} icon="arrow-upward" disabled={itemIndex === 0} onPress={() => moveItem(itemIndex, -1)} />
              <Pressable accessibilityRole="button" onPress={() => edit(item)} style={styles.smallButton}><MaterialIcons name="edit" size={20} color={colors.white} /><AppText>{wt('manage')}</AppText></Pressable>
              <IconButton label={wt('moveLater')} icon="arrow-downward" disabled={itemIndex === state.portfolio.length - 1} onPress={() => moveItem(itemIndex, 1)} />
              <IconButton label={wt('deleteItem')} icon="delete-outline" onPress={() => Alert.alert(wt('deleteItem'), item.title, [{ text: wt('cancel'), style: 'cancel' }, { text: wt('remove'), style: 'destructive', onPress: () => void state.deletePortfolioItem(item.id).catch(() => Alert.alert(wt('portfolio'), wt('retry'))) }])} />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return <View><AppText style={styles.strong}>{label}</AppText><TextInput {...props} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline, { textAlign: isRTL ? 'right' : 'left' }]} /></View>;
}

function IconButton({ label, icon, disabled = false, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; disabled?: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.iconButton, disabled && styles.disabled]}><MaterialIcons name={icon} size={21} color={colors.white} /></Pressable>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.sm },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: typography.bold },
  strong: { fontWeight: typography.semibold, lineHeight: 21 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  status: { color: colors.textMuted, fontSize: 12 },
  copy: { color: colors.textSecondary, lineHeight: 21 },
  empty: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl },
  input: { minHeight: 54, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, color: colors.white },
  multiline: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.white },
  dark: { color: colors.background, fontWeight: typography.bold },
  outline: { minHeight: 50, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  disabled: { opacity: 0.4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.white, backgroundColor: colors.surfaceSoft },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  gallery: { gap: spacing.sm },
  imageCard: { width: 180, gap: spacing.xs },
  image: { width: 180, height: 130, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  imageActions: { flexDirection: 'row', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  iconButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  smallButton: { minHeight: 46, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
});
