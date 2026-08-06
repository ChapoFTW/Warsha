import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import { captureWarnings, type CaptureWarning } from '@/src/onboarding/onboarding-types';

/**
 * National ID capture, one side at a time.
 *
 * `expo-image-picker`'s `launchCameraAsync` is the camera contract here, and
 * it is deliberate. It is already a dependency, already used for portfolio and
 * avatar capture, and it needs no new native module. A dedicated framing
 * overlay drawn over a live preview would need `expo-camera`, a new dev-client
 * build, and a physical device to accept — none of which WPS-023 can honestly
 * claim. The framing guidance is therefore text and a static frame, and that
 * limitation is recorded rather than papered over.
 *
 * Quality warnings are advisory and never block. Warsha cannot reliably tell a
 * blurry photo from a worn card, and refusing an upload on a guess would strand
 * somebody whose only ID is an old one.
 */
export default function IdentityCapture() {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const params = useLocalSearchParams<{ side?: string }>();
  const side: 'front' | 'back' = params.side === 'back' ? 'back' : 'front';

  const [uri, setUri] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<CaptureWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const accept = (asset: ImagePicker.ImagePickerAsset) => {
    setUri(asset.uri);
    setWarnings(captureWarnings({
      width: asset.width,
      height: asset.height,
      sharpness: null,
      brightestFraction: null,
    }));
  };

  const capture = async () => {
    setBusy(true);
    setMessage('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        // Not a dead end. The library path is offered in the same breath.
        setMessage(ot.text('identityCameraPermission'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        exif: false,
      });
      if (!result.canceled && result.assets[0]) accept(result.assets[0]);
    } catch {
      setMessage(ot.text('identityUploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        exif: false,
      });
      if (!result.canceled && result.assets[0]) accept(result.assets[0]);
    } catch {
      setMessage(ot.text('identityUploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <AppText accessibilityRole="header" style={styles.title}>
          {ot.text(side === 'front' ? 'identityFront' : 'identityBack')}
        </AppText>
        <AppText style={styles.hint}>{ot.text('identityIntro')}</AppText>

        <BrandCard style={styles.frame}>
          {uri ? (
            <Image
              source={{ uri }}
              accessible
              accessibilityLabel={ot.text(side === 'front' ? 'a11yFrontCaptured' : 'a11yBackCaptured')}
              resizeMode="contain"
              style={styles.preview}
            />
          ) : (
            <View style={styles.guide}>
              <AppText style={styles.guideText}>{ot.text('identityFrameGuide')}</AppText>
            </View>
          )}
        </BrandCard>

        {warnings.length > 0 ? (
          <View style={styles.warnings}>
            {warnings.map((warning) => (
              <StateBadge key={warning} label={ot.captureWarning(warning)} tone="warning" />
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <BrandButton
            label={ot.text(uri ? 'identityRetake' : 'identityCapture')}
            loading={busy}
            disabled={busy}
            onPress={() => void capture()}
          />
          <BrandButton
            label={ot.text('identityChoose')}
            variant="secondary"
            disabled={busy}
            onPress={() => void choose()}
          />
          <BrandButton
            label={ot.text('workerTitle')}
            variant="ghost"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/worker'))}
          />
        </View>

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  frame: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  preview: { width: '100%', height: 220, borderRadius: radii.md },
  guide: {
    width: '100%',
    height: 200,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  guideText: { color: colors.textMuted, textAlign: 'center' },
  warnings: { gap: spacing.xs },
  actions: { gap: spacing.md },
  error: { color: colors.errorText },
});
