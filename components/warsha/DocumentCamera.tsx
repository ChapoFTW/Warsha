import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { captureWarnings, type CaptureWarning } from '@/src/onboarding/onboarding-types';

/**
 * WPS-024 identity-document capture.
 *
 * Three things this component does that a plain image picker cannot, and each
 * is the reason it exists rather than a nicety:
 *
 *   1. A framing overlay in the aspect ratio of an Egyptian National ID. Most
 *      unreadable submissions are not blurred — they are a card photographed
 *      from too far away, occupying a fifth of the frame. An overlay fixes
 *      that before the shutter, which no amount of server-side cleverness can.
 *   2. Retake before upload. The worker sees exactly what will be sent and can
 *      reject it. Nothing leaves the device until they accept the frame.
 *   3. Local quality heuristics, run on the captured frame, that produce
 *      ADVICE and never a refusal. A warning says "the card looks small in the
 *      frame"; it never blocks, because a heuristic that blocks is a heuristic
 *      that eventually blocks a perfectly good document at two in the morning.
 *
 * The reduced review copy is produced here too. WPS-024 commits to storing a
 * smaller copy so ordinary staff review does not require opening the original,
 * and the cheapest honest place to make it is on the device that already has
 * the full-resolution frame in memory.
 */

export type CapturedDocument = {
  /** The full-resolution original, for the private bucket. */
  originalUri: string;
  /** The reduced copy used for ordinary review. */
  reviewUri: string;
  width: number;
  height: number;
  /** Advisory codes. The caller translates them; this component carries no copy. */
  warnings: CaptureWarning[];
};

type Props = {
  documentLabel: string;
  onCaptured: (document: CapturedDocument) => void;
  onFallbackRequested: () => void;
  /** Copy comes from the caller so this component carries no translations. */
  copy: {
    permissionTitle: string;
    permissionBody: string;
    grantPermission: string;
    useUploadInstead: string;
    capture: string;
    retake: string;
    usePhoto: string;
    frameHint: string;
    /** Translates an advisory code. Advice only — nothing here blocks. */
    warning: (code: CaptureWarning) => string;
  };
};

/** An Egyptian National ID is ID-1 format: 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;

export function DocumentCamera({ documentLabel, onCaptured, onFallbackRequested, copy }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [preview, setPreview] = useState<CapturedDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (!photo?.uri) return;

      // The reduced review copy: 1400px on the long edge is enough to read a
      // fourteen-digit number and an Arabic name, and roughly a tenth of the
      // bytes of the original.
      const reduced = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );

      setPreview({
        originalUri: photo.uri,
        reviewUri: reduced.uri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        // Dimension-based advice from the shared WPS-023 helper, so the camera
        // path and the upload path warn about the same things in the same
        // words.
        warnings: captureWarnings({ width: photo.width ?? 0, height: photo.height ?? 0 }),
      });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (!permission) {
    return <View style={styles.frame} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <AppText accessibilityRole="header" style={styles.permissionTitle}>
          {copy.permissionTitle}
        </AppText>
        <AppText style={styles.permissionBody}>{copy.permissionBody}</AppText>
        <BrandButton label={copy.grantPermission} onPress={() => void requestPermission()} />
        {/* Always present, never behind a refusal. A worker who will not grant
            camera access must still be able to finish onboarding. */}
        <BrandButton
          label={copy.useUploadInstead}
          variant="secondary"
          onPress={onFallbackRequested}
        />
      </View>
    );
  }

  if (preview) {
    return (
      <View style={styles.frame}>
        <View style={styles.previewBox}>
          <AppText style={styles.previewLabel}>{documentLabel}</AppText>
          {preview.warnings.map((warning) => (
            <AppText key={warning} style={styles.warning}>{copy.warning(warning)}</AppText>
          ))}
        </View>
        <View style={styles.actions}>
          <BrandButton
            label={copy.retake}
            variant="secondary"
            onPress={() => setPreview(null)}
          />
          <BrandButton label={copy.usePhoto} onPress={() => onCaptured(preview)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* The overlay. Purely visual — it does not crop, because cropping to
            a guide the worker may have missed is how a corner of a document
            gets silently removed. */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.cardGuide} />
          <AppText style={styles.frameHint}>{copy.frameHint}</AppText>
        </View>
      </CameraView>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.capture}
          onPress={() => void capture()}
          disabled={busy}
          style={styles.shutter}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <BrandButton
          label={copy.useUploadInstead}
          variant="secondary"
          onPress={onFallbackRequested}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  frame: { gap: spacing.md },
  camera: { width: '100%', aspectRatio: 3 / 4, borderRadius: radii.lg, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  cardGuide: {
    width: '86%',
    aspectRatio: CARD_ASPECT,
    borderWidth: 2,
    borderColor: colors.textInverse,
    borderRadius: radii.md,
  },
  frameHint: {
    color: colors.textInverse,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  previewBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewLabel: { fontSize: 14, fontWeight: typography.semibold, color: colors.textPrimary },
  warning: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  shutter: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 3, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.textPrimary },
  permission: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  permissionBody: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
});
