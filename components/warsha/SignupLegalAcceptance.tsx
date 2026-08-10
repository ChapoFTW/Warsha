import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useLegalText } from '@/src/legal/legal-translations';
import type { SignupRole } from '@/src/legal/signup-legal';
import type { LegalDocumentKey } from '@/src/legal/legal-types';

type Props = {
  role: SignupRole;
  commonAccepted: boolean;
  workerVerificationAccepted: boolean;
  disabled?: boolean;
  onCommonAcceptedChange: (accepted: boolean) => void;
  onWorkerVerificationAcceptedChange: (accepted: boolean) => void;
};

function LegalLink({ documentKey, label }: { documentKey: LegalDocumentKey; label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.push({ pathname: '/legal/document/[key]', params: { key: documentKey } })}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <AppText style={styles.linkText}>{label}</AppText>
    </Pressable>
  );
}

function CheckRow({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.checkRow,
        isRTL && styles.reverse,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialIcons
        name={checked ? 'check-box' : 'check-box-outline-blank'}
        size={26}
        color={checked ? colors.actionPrimaryBackground : colors.textSecondary}
      />
      <AppText style={styles.checkLabel}>{label}</AppText>
    </Pressable>
  );
}

export function SignupLegalAcceptance({
  role,
  commonAccepted,
  workerVerificationAccepted,
  disabled,
  onCommonAcceptedChange,
  onWorkerVerificationAcceptedChange,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const lt = useLegalText();
  return (
    <View style={styles.card}>
      <AppText accessibilityRole="header" style={styles.title}>{lt.text('signupTitle')}</AppText>
      <AppText style={styles.hint}>{lt.text('signupRequiredHint')}</AppText>

      <CheckRow
        checked={commonAccepted}
        disabled={disabled}
        label={lt.text('signupAgreeCommon')}
        onChange={onCommonAcceptedChange}
      />
      <View style={[styles.links, isRTL && styles.reverse]}>
        <LegalLink documentKey={role === 'worker' ? 'worker_terms' : 'customer_terms'} label={lt.text('signupTerms')} />
        <LegalLink documentKey="privacy_policy" label={lt.text('signupPrivacy')} />
      </View>

      {role === 'worker' ? (
        <>
          <CheckRow
            checked={workerVerificationAccepted}
            disabled={disabled}
            label={lt.text('signupAgreeWorkerVerification')}
            onChange={onWorkerVerificationAcceptedChange}
          />
          <View style={[styles.links, isRTL && styles.reverse]}>
            <LegalLink documentKey="worker_verification_policy" label={lt.text('signupWorkerVerification')} />
          </View>
        </>
      ) : null}

      <View style={styles.optionalPolicy}>
        <AppText style={styles.hint}>{lt.text('signupLocationSeparate')}</AppText>
        <LegalLink documentKey="location_data_policy" label={lt.text('signupLocationPolicy')} />
      </View>
      <AppText style={styles.evidence}>{lt.text('signupEvidence')}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    width: '100%',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  checkRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkLabel: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.textPrimary },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  optionalPolicy: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  evidence: { fontSize: 11, lineHeight: 17, color: colors.textSecondary },
  reverse: { flexDirection: 'row-reverse' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
