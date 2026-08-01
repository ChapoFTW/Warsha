import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/warsha/Typography';
import { BrandLoadingMark as ActivityIndicator, BrandLockup } from '@/components/warsha/BrandMark';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey, sanitizeAuthError } from '@/src/auth/auth-errors';
import { useLocalization } from '@/src/i18n/localization';
import type { TranslationKey } from '@/src/i18n/translations';
import { getSupabaseClient } from '@/src/lib/supabase';

type Requirement = { key: TranslationKey; met: boolean };

export default function ResetPasswordScreen() {
  const { t, isRTL } = useLocalization();
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');

  const requirements = useMemo<Requirement[]>(() => [
    { key: 'passwordLengthRequirement', met: password.length >= 8 },
    { key: 'passwordUppercaseRequirement', met: /[A-Z]/.test(password) },
    { key: 'passwordLowercaseRequirement', met: /[a-z]/.test(password) },
    { key: 'passwordNumberRequirement', met: /\d/.test(password) },
  ], [password]);
  const passwordValid = requirements.every((requirement) => requirement.met);
  const passwordsMatch = password === confirmation && confirmation.length > 0;

  const submit = async () => {
    if (!passwordValid || !passwordsMatch || busy) {
      setMessage(!passwordsMatch && confirmation.length > 0 ? t('passwordMismatch') : t('passwordRequirements'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) throw error;
      await auth.finishPasswordRecovery();
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (error) {
      setMessage(t(authMessageKey(sanitizeAuthError(error))));
    } finally {
      setBusy(false);
    }
  };

  const returnToSignIn = () => router.replace('/(tabs)/profile');

  if (success) return <StateCard icon="check" title={t('passwordUpdated')} body={t('passwordUpdatedBody')} action={t('returnToSignIn')} onPress={returnToSignIn} />;
  if (auth.recoveryStatus === 'checking' || auth.recoveryStatus === 'processing') {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><BrandLockup size={54}/><ActivityIndicator color={colors.white}/></View></SafeAreaView>;
  }
  if (auth.mode !== 'supabase' || auth.recoveryStatus !== 'ready' || !auth.session) {
    return <StateCard icon="link-off" title={t('resetPasswordTitle')} body={`${t('resetLinkInvalid')} ${t('requestNewReset')}`} action={t('returnToSignIn')} onPress={returnToSignIn} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <View style={styles.brand}><BrandLockup size={52}/></View>
          <View style={styles.card}>
            <AppText accessibilityRole="header" style={styles.title}>{t('resetPasswordTitle')}</AppText>
            <AppText style={styles.body}>{t('resetPasswordBody')}</AppText>
            <PasswordField label={t('newPassword')} value={password} onChangeText={setPassword} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} rtl={isRTL} showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
            <PasswordField label={t('confirmPassword')} value={confirmation} onChangeText={setConfirmation} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} rtl={isRTL} showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
            <View accessibilityLabel={t('passwordRequirements')} style={styles.requirements}>
              {requirements.map((requirement) => (
                <View key={requirement.key} style={[styles.requirementRow, isRTL && styles.reverse]}>
                  <MaterialIcons name={requirement.met ? 'check-circle' : 'radio-button-unchecked'} size={17} color={requirement.met ? colors.success : colors.textMuted}/>
                  <AppText style={[styles.requirement, requirement.met && styles.met]}>{t(requirement.key)}</AppText>
                </View>
              ))}
            </View>
            {confirmation.length > 0 && !passwordsMatch ? <AppText accessibilityRole="alert" style={styles.error}>{t('passwordMismatch')}</AppText> : null}
            {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t('resetPasswordAccessibility')} disabled={busy || !passwordValid || !passwordsMatch} onPress={() => void submit()} style={({ pressed }) => [styles.primary, (busy || !passwordValid || !passwordsMatch) && styles.disabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color={colors.background}/> : <AppText style={styles.primaryText}>{t('updatePassword')}</AppText>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({ label, value, onChangeText, visible, onToggle, rtl, showLabel, hideLabel }: { label: string; value: string; onChangeText: (value: string) => void; visible: boolean; onToggle: () => void; rtl: boolean; showLabel: string; hideLabel: string }) {
  return <View style={styles.field}><AppText style={styles.label}>{label}</AppText><View style={[styles.inputShell, rtl && styles.reverse]}><TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} value={value} onChangeText={onChangeText} placeholder={label} placeholderTextColor={colors.textMuted} style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}/><Pressable accessibilityRole="button" accessibilityLabel={visible ? hideLabel : showLabel} hitSlop={10} onPress={onToggle} style={styles.eye}><MaterialIcons name={visible ? 'visibility-off' : 'visibility'} size={21} color={colors.textSecondary}/></Pressable></View></View>;
}

function StateCard({ icon, title, body, action, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string; action: string; onPress: () => void }) {
  return <SafeAreaView style={styles.safe}><View style={styles.center}><BrandLockup size={54}/><View style={styles.stateIcon}><MaterialIcons name={icon} size={26} color={colors.white}/></View><AppText accessibilityRole="header" style={styles.title}>{title}</AppText><AppText style={styles.stateBody}>{body}</AppText><Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onPress} style={styles.primary}><AppText style={styles.primaryText}>{action}</AppText></Pressable></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  page: { flexGrow: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  brand: { alignItems: 'center' }, card: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 27, fontWeight: typography.bold, textAlign: 'center' }, body: { color: colors.textSecondary, lineHeight: 21, textAlign: 'center' },
  field: { gap: spacing.sm }, label: { color: colors.textSecondary, fontSize: 13, fontWeight: typography.medium },
  inputShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 52, color: colors.white, fontSize: 16, paddingHorizontal: spacing.sm }, eye: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  requirements: { gap: spacing.sm }, requirementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, requirement: { color: colors.textMuted, fontSize: 13 }, met: { color: colors.success },
  error: { color: colors.error, fontSize: 13 }, primary: { minHeight: 54, minWidth: 220, borderRadius: radii.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }, primaryText: { color: colors.background, fontWeight: typography.bold, textAlign: 'center' },
  disabled: { opacity: 0.42 }, pressed: { opacity: 0.78 }, reverse: { flexDirection: 'row-reverse' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }, stateIcon: { width: 52, height: 52, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, stateBody: { maxWidth: 440, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
});
