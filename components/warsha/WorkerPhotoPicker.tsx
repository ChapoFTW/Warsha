import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import type { ProviderMediaInput } from '@/src/providers/provider-types';
import { useWorkerText } from '@/src/worker/worker-copy';

type Source = 'camera' | 'library';

export function WorkerPhotoPicker({
  currentUri,
  uploading = false,
  onUse,
}: {
  currentUri?: string;
  uploading?: boolean;
  onUse: (input: ProviderMediaInput) => Promise<void>;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const wt = useWorkerText();
  const [visible, setVisible] = useState(false);
  const [candidate, setCandidate] = useState<ProviderMediaInput | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const choose = async (source: Source) => {
    setMessage('');
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage(wt.text('photoPermission'));
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    setProcessing(true);
    try {
      const side = Math.min(asset.width, asset.height);
      if (!Number.isFinite(side) || side <= 0) throw new Error('Invalid image dimensions');
      const context = ImageManipulator.manipulate(asset.uri);
      context.crop({
        originX: Math.max(0, Math.floor((asset.width - side) / 2)),
        originY: Math.max(0, Math.floor((asset.height - side) / 2)),
        width: side,
        height: side,
      });
      if (side > 1400) context.resize({ width: 1400, height: 1400 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ compress: 0.88, format: SaveFormat.JPEG });
      setCandidate({ uri: saved.uri, fileName: 'warsha-worker-photo.jpg', mimeType: 'image/jpeg' });
    } catch {
      setMessage(wt.text('photoProcessingError'));
    } finally {
      setProcessing(false);
    }
  };

  const open = () => {
    setCandidate(null);
    setMessage('');
    setVisible(true);
  };

  return (
    <View style={styles.group}>
      <Pressable accessibilityRole="button" accessibilityLabel={wt.text('addPhoto')} onPress={open} style={styles.photo}>
        {currentUri
          ? <Image source={{ uri: currentUri }} contentFit="cover" style={styles.photo} />
          : <MaterialIcons name="add-a-photo" size={38} color={colors.textMuted} />}
      </Pressable>
      <BrandButton
        label={currentUri ? wt.text('changePhoto') : wt.text('addPhoto')}
        icon="photo-camera"
        variant="secondary"
        loading={uploading}
        onPress={open}
      />

      <Modal visible={visible} animationType="slide" onRequestClose={() => !processing && setVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.header}>
            <AppText accessibilityRole="header" style={styles.title}>
              {candidate ? wt.text('photoPreviewTitle') : wt.text('choosePhotoSource')}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wt.text('close')}
              disabled={processing || uploading}
              onPress={() => setVisible(false)}
              style={styles.close}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          {processing ? <BrandLoadingState label={wt.text('photoProcessing')} /> : candidate ? (
            <View style={styles.previewBody}>
              <Image source={{ uri: candidate.uri }} contentFit="cover" style={styles.preview} />
              <BrandButton
                label={wt.text('usePhoto')}
                icon="check-circle"
                loading={uploading}
                onPress={() => void onUse(candidate).then(() => setVisible(false)).catch(() => setMessage(wt.text('photoUploadError')))}
              />
              <BrandButton label={wt.text('retake')} icon="photo-camera" variant="secondary" onPress={() => void choose('camera')} />
              <BrandButton label={wt.text('chooseAnother')} icon="photo-library" variant="secondary" onPress={() => void choose('library')} />
            </View>
          ) : (
            <View style={styles.sourceActions}>
              <MaterialIcons name="account-circle" size={86} color={colors.textMuted} />
              <AppText style={styles.hint}>{wt.text('photoSourceHint')}</AppText>
              <BrandButton label={wt.text('takePhoto')} icon="photo-camera" onPress={() => void choose('camera')} />
              <BrandButton label={wt.text('chooseGallery')} icon="photo-library" variant="secondary" onPress={() => void choose('library')} />
            </View>
          )}
          {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  photo: { width: 132, height: 132, alignSelf: 'center', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  modalSafe: { flex: 1, padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: 24, lineHeight: 31, fontWeight: typography.bold, color: colors.textPrimary },
  close: { width: 48, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  sourceActions: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  hint: { color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  previewBody: { flex: 1, justifyContent: 'center', gap: spacing.md },
  preview: { width: '100%', maxWidth: 520, aspectRatio: 1, alignSelf: 'center', borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  error: { color: colors.errorText, textAlign: 'center' },
});
