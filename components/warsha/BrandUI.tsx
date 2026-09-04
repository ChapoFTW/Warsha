import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';

import { brandFontFamily, elevation, radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';

import { BrandLoadingMark } from './BrandMark';
import { PressableSurface } from './PressableSurface';
import { AppText } from './Typography';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function BrandButton({
  label,
  variant = 'primary',
  loading = false,
  icon,
  disabled,
  style,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const isDisabled = disabled || loading;
  const foreground = variant === 'primary'
    ? colors.background
    : variant === 'danger'
      ? colors.error
      : colors.textPrimary;
  return (
    /* `PressableSurface` rather than `Pressable`: the scale and the tonal dip
       are the shared authority, so every Warsha button answers a finger the
       same way and none of them has to remember how. */
    <PressableSurface
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      fade={!isDisabled}
      {...props}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !isDisabled && variant !== 'primary' && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      {loading ? (
        <BrandLoadingMark size={22} variant={variant === 'primary' ? 'dark' : 'light'} accessibilityLabel={label} />
      ) : (
        <View style={[styles.buttonContent, isRTL && styles.reverse]}>
          {icon ? <MaterialIcons name={icon} size={19} color={foreground} /> : null}
          <AppText style={[styles.buttonLabel, { color: foreground }]}>{label}</AppText>
        </View>
      )}
    </PressableSurface>
  );
}

export function BrandCard({
  children,
  level = 'resting',
  style,
  ...props
}: ViewProps & { children: ReactNode; level?: keyof typeof elevation }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View {...props} style={[styles.card, elevation[level], level === 'modal' && styles.cardModal, style]}>
      {children}
    </View>
  );
}

export function BrandTextField({
  label,
  error,
  helper,
  style,
  multiline,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label?: string; error?: string; helper?: string }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  /*
   * A field on Android and iOS had no focused state at all: the caret appeared
   * and nothing else changed, so on a form of six identical boxes the only
   * thing saying which one the keyboard was typing into was the keyboard. The
   * web has had `:focus-visible` since the beginning; this is that contract,
   * expressed the way React Native expresses it.
   *
   * The border, not a ring: a ring around a rounded rectangle on a small screen
   * is a second rectangle. The error border always wins — a field can be
   * focused and wrong at the same time, and being wrong is the more urgent of
   * the two, which is why it is ordered last.
   */
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      {label ? <AppText style={styles.fieldLabel}>{label}</AppText> : null}
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          isRTL && styles.fieldRTL,
          focused && styles.fieldFocused,
          error && styles.fieldError,
          { fontFamily: brandFontFamily(isRTL) },
          style,
        ]}
      />
      {error ? <AppText accessibilityRole="alert" style={styles.errorText}>{error}</AppText> : null}
      {!error && helper ? <AppText style={styles.helperText}>{helper}</AppText> : null}
    </View>
  );
}

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const badgeIcon: Record<BadgeTone, ComponentProps<typeof MaterialIcons>['name']> = {
  neutral: 'shield',
  info: 'info-outline',
  success: 'verified',
  warning: 'info-outline',
  error: 'error-outline',
};

export function StateBadge({
  label,
  tone = 'neutral',
  icon = badgeIcon[tone],
  compact = false,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const ink = tone === 'success'
    ? colors.success
    : tone === 'info'
      ? colors.informationText
    : tone === 'warning'
      ? colors.warning
      : tone === 'error'
        ? colors.error
        : colors.textSecondary;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.badge, styles[`badge_${tone}`], compact && styles.badgeCompact, isRTL && styles.reverse]}>
      <MaterialIcons name={icon} size={compact ? 13 : 15} color={ink} />
      <AppText style={[styles.badgeLabel, compact && styles.badgeLabelCompact, { color: ink }]}>{label}</AppText>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  icon = 'inbox',
  action,
  onAction,
  loading = false,
}: {
  title: string;
  body?: string;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
  action?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <BrandCard style={styles.empty}>
      {loading
        ? <BrandLoadingMark size={44} accessibilityLabel={title} />
        : <View style={styles.emptyIcon}><MaterialIcons name={icon} size={26} color={colors.textMuted} /></View>}
      <AppText style={styles.emptyTitle}>{title}</AppText>
      {body ? <AppText style={styles.emptyBody}>{body}</AppText> : null}
      {action && onAction ? <BrandButton label={action} variant="secondary" onPress={onAction} style={styles.emptyAction} /> : null}
    </BrandCard>
  );
}

export function BrandLoadingState({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.loadingState}>
      <BrandLoadingMark size={48} accessibilityLabel={label} />
      <AppText style={styles.loadingLabel}>{label}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  button_primary: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  button_secondary: { backgroundColor: colors.transparent, borderColor: colors.borderStrong },
  button_ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  button_danger: { backgroundColor: colors.errorSoft, borderColor: colors.error },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonLabel: { fontSize: 14, lineHeight: 20, fontWeight: typography.semibold, textAlign: 'center' },
  /* The ground moves as well as the surface, but only where there is room for
     it to. A quiet or ghost button has no fill of its own, so gaining one is
     the clearest thing it can say; a filled button already reads as solid and
     a rim appearing on press would be a new edge rather than a response. Scale
     and opacity come from the shared primitive either way. */
  pressed: { backgroundColor: colors.surfacePressed, borderColor: colors.borderStrong },
  disabled: { opacity: 0.42 },
  reverse: { flexDirection: 'row-reverse' },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg },
  cardModal: { borderRadius: radii.lg },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: typography.semibold },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fieldMultiline: { minHeight: 112, textAlignVertical: 'top' },
  fieldRTL: { textAlign: 'right', writingDirection: 'rtl' },
  fieldFocused: { borderColor: colors.borderFocus, backgroundColor: colors.surfaceElevated },
  fieldError: { borderColor: colors.error },
  errorText: { ...typography.caption, color: colors.error },
  helperText: { ...typography.caption, color: colors.textMuted },
  badge: {
    minHeight: 30,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  badge_neutral: { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
  badge_info: { backgroundColor: colors.informationBackground, borderColor: colors.informationBorder },
  badge_success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  badge_warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  badge_error: { backgroundColor: colors.errorSoft, borderColor: colors.errorBorder },
  badgeCompact: { minHeight: 24, paddingHorizontal: spacing.sm },
  badgeLabel: { maxWidth: 220, fontSize: 11, lineHeight: 15, fontWeight: typography.semibold },
  badgeLabelCompact: { maxWidth: 120, fontSize: 9, lineHeight: 12 },
  empty: {
    minHeight: 188,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, fontWeight: typography.semibold, textAlign: 'center' },
  emptyBody: { ...typography.bodySmall, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  emptyAction: { alignSelf: 'stretch', marginTop: spacing.lg },
  loadingState: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingLabel: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
