import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark, BrandLockup } from '@/components/warsha/BrandMark';
import { BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useGrowthText } from '@/src/growth/growth-translations';
import { usePrivacyText } from '@/src/privacy/privacy-translations';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { useAuthText } from '@/src/auth/auth-translations';
import { isValidPhone, isValidSmsOtp, normalizePhone } from '@/src/auth/phone-auth';
import { supabaseTarget } from '@/src/config/environment';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import { useLocalization } from '@/src/i18n/localization';
import { useProviderText } from '@/src/i18n/provider-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { supabaseCustomerProfileRepository } from '@/src/repositories/supabase-user-repositories';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import { useSupportText } from '@/src/support/support-translations';

/**
 * WPS-024 correction. This screen carried a second authentication path —
 * worker sign-in and worker registration by SMS code — beside the customer
 * one. Supabase Phone Auth is disabled and no SMS provider is configured, so
 * that path could not complete; it has been removed rather than left visible
 * and broken.
 *
 * Workers and customers now register and sign in identically, with an email
 * address, a password and a REQUIRED contact phone number that nobody is asked
 * to verify. Confirming the number remains available as a deliberate, optional
 * action below, and it still fails closed while Phone Auth is off.
 */
export default function Profile() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const at = useAuthText();
  const pt = useProviderText();
  const st = useSupportText();
  const dt = useDiscoveryText();
  const gt = useGrowthText();
  const pvt = usePrivacyText();
  const auth = useAuth();
  const provider = useProviderFoundation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [preferred, setPreferred] = useState<'en' | 'ar'>(language);
  const [register, setRegister] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneEnrollment, setPhoneEnrollment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const phoneRequest = useRef(0);

  const resetTransient = useCallback(() => {
    phoneRequest.current += 1;
    setOtp('');
    setMessage('');
    setNotice('');
    setBusy(false);
  }, []);

  useFocusEffect(useCallback(() => {
    resetTransient();
    return () => { phoneRequest.current += 1; };
  }, [resetTransient]));

  useEffect(() => {
    setPassword('');
    setOtp('');
    setOtpSent(false);
    phoneRequest.current += 1;
    setPhoneEnrollment(false);
    setNotice('');
    setMessage('');
  }, [auth.user?.id]);

  // Depend on primitive session values: USER_UPDATED events replace the user
  // object mid phone-enrollment, and an identity-based rerun would wipe the
  // phone number the user is typing.
  const signedIn = Boolean(auth.user);
  const userEmail = auth.user?.email ?? '';
  const userPhone = auth.user?.phone ?? '';
  useEffect(() => {
    let active = true;
    if (auth.mode === 'supabase' && signedIn) void supabaseCustomerProfileRepository.get(userEmail).then((profile) => {
      if (active) {
        setName(profile.displayName);
        setPreferred(profile.preferredLanguage);
        setPhone((current) => current || userPhone);
      }
    }).catch((error) => {
      logDataError('profile', error);
      if (active) setMessage(t(dataErrorKey(error)));
    });
    return () => { active = false; };
  }, [auth.mode, signedIn, userEmail, userPhone, t]);

  const loginCustomer = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (register) {
        // WPS-024 correction. One registration, both roles, no OTP. The phone
        // number is required contact information and is validated before the
        // call; nothing here sends a code or waits for one.
        const result = await auth.signUp(name, email, password, phone, 'customer', preferred);
        if (result.needsEmailConfirmation) setMessage(t('checkEmail'));
      } else await auth.signIn(email, password);
    } catch (error) { setMessage(t(authMessageKey(error))); }
    finally { setBusy(false); }
  };

  const requestReset = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try { await auth.requestPasswordReset(email.trim()); setMessage(t('resetSent')); }
    catch (error) { setMessage(t(authMessageKey(error))); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      await supabaseCustomerProfileRepository.update({ displayName: name.trim(), preferredLanguage: preferred });
      setEditing(false);
      setNotice(t('nameSaved'));
    }
    catch (error) { logDataError('profile update', error); setMessage(t(dataErrorKey(error))); }
    finally { setBusy(false); }
  };

  const openProvider = async () => {
    try {
      if (!provider.profile) {
        // WPS-024 correction. Becoming a worker no longer waits on a verified
        // phone. It used to divert here into an SMS enrollment that could not
        // complete, so the button read "Become a worker" and did nothing but
        // ask for a code that never arrived. The server requires a contact
        // number on file and says so plainly if one is missing.
        await provider.activate(name || t('professional'));
      } else await provider.setMode('provider');
      router.push('/provider-mode');
    } catch { setMessage(t('genericTryAgain')); }
  };

  /**
   * Confirming a phone number. Optional, explicit, and coupled to nothing.
   *
   * WPS-024 correction. These two used to activate the worker role on success,
   * which made confirmation a precondition for working dressed up as a
   * convenience. Nothing is granted here now: a number is confirmed, or it is
   * not, and the account behaves the same either way.
   *
   * This is the surface `assertPhoneAuthAvailable` still guards, and it FAILS
   * CLOSED while Supabase Phone Auth is disabled — which it is, everywhere.
   */
  const sendPhoneEnrollmentOtp = async () => {
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      const status = await auth.requestWorkerPhoneChange(phone);
      if (status === 'already_verified') {
        setPhoneEnrollment(false);
        setNotice(t('nameSaved'));
        return;
      }
      setOtpSent(true);
      setNotice(at('codeSent'));
    }
    catch (error) { setMessage(t(authMessageKey(error))); }
    finally { setBusy(false); }
  };

  const finishPhoneEnrollment = async () => {
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      await auth.verifyWorkerPhoneChange(phone, otp);
      setPhoneEnrollment(false);
      setOtpSent(false);
      setOtp('');
      setNotice(t('nameSaved'));
    } catch (error) { setMessage(t(authMessageKey(error))); }
    finally { setBusy(false); }
  };

  if (auth.loading || provider.loading) return <Page><BrandLoadingMark color={colors.white}/></Page>;

  if (auth.mode === 'mock' || auth.user) return <Page>
    <AppText style={styles.title}>{auth.mode === 'mock' ? 'Warsha Demo' : (name || auth.user?.email || auth.user?.phone || t('profile'))}</AppText>
    <AppText style={styles.muted}>{auth.user?.email ?? auth.user?.phone ?? ''}</AppText>
    {editing ? <>
      <Field label={t('fullName')} value={name} onChangeText={setName} rtl={isRTL}/>
      <Pressable accessibilityRole="button" accessibilityLabel={t('saveName')} disabled={busy || name.trim().length < 2} onPress={() => void save()} style={styles.primary}>{busy ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{t('saveName')}</AppText>}</Pressable>
    </> : auth.mode === 'supabase' ? <Pressable accessibilityRole="button" accessibilityLabel={t('editName')} onPress={() => setEditing(true)} style={styles.button}><AppText>{t('editName')}</AppText></Pressable> : null}
    {phoneEnrollment ? <View style={styles.panel}>
      <AppText style={styles.panelTitle}>{at('phoneVerifyTitle')}</AppText>
      <AppText style={styles.muted}>{at('phoneRequired')}</AppText>
      <Field label={at('phone')} value={phone} onChangeText={setPhone} rtl={isRTL} keyboardType="phone-pad" autoCapitalize="none"/>
      <AppText style={styles.hint}>{at('phoneHint')}</AppText>
      {isValidPhone(phone) ? <AppText style={styles.hint}>{at('sendCodePreview')} {normalizePhone(phone)}.</AppText> : null}
      {otpSent ? <Field label={at('otp')} value={otp} onChangeText={setOtp} rtl={isRTL} keyboardType="number-pad" maxLength={6}/> : null}
      {otpSent && __DEV__ && supabaseTarget === 'local' ? <AppText style={styles.hint}>{at('localOtpHint')}</AppText> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={at(otpSent ? 'verifyPhone' : 'sendOtp')} disabled={busy || (otpSent ? !isValidSmsOtp(otp) : !isValidPhone(phone))} onPress={() => void (otpSent ? finishPhoneEnrollment() : sendPhoneEnrollmentOtp())} style={styles.primary}>{busy ? otpSent ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{at('sendingCode')}</AppText> : <AppText style={styles.dark}>{at(otpSent ? 'verifyPhone' : 'sendOtp')}</AppText>}</Pressable>
      {otpSent ? <Pressable accessibilityRole="button" accessibilityLabel={at('resendOtp')} disabled={busy} onPress={() => void sendPhoneEnrollmentOtp()} style={styles.textButton}><AppText style={styles.link}>{at('resendOtp')}</AppText></Pressable> : null}
    </View> : <>
      <Pressable disabled={provider.saving} onPress={() => void openProvider()} style={styles.primary}>{provider.saving ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{provider.profile ? pt('providerMode') : pt('become')}</AppText>}</Pressable>
      {/* Confirming a number is an ordinary settings action, offered after the
          things it does not gate. It is not shown as outstanding work, because
          it is not: nothing waits on it. */}
      {auth.mode === 'supabase' && !auth.hasVerifiedPhone ? <Pressable accessibilityRole="button" accessibilityLabel={at('phoneVerifyTitle')} onPress={() => { setPhoneEnrollment(true); setMessage(''); setNotice(''); }} style={styles.button}><AppText>{at('phoneVerifyTitle')}</AppText></Pressable> : null}
    </>}
    <Pressable onPress={() => router.push('/favourites')} style={styles.button}><AppText>{t('favourites')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={dt.text('recentlyViewed')} onPress={() => router.push('/recently-viewed')} style={styles.button}><AppText>{dt.text('recentlyViewed')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={gt.text('referralTitle')} onPress={() => router.push('/referrals')} style={styles.button}><AppText>{gt.text('referralTitle')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={dt.text('appearance')} onPress={() => router.push('/appearance')} style={styles.button}><AppText>{dt.text('appearance')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={st.text('helpCenter')} onPress={() => router.push('/help')} style={styles.button}><AppText>{st.text('helpCenter')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={st.text('myCases')} onPress={() => router.push('/support')} style={styles.button}><AppText>{st.text('myCases')}</AppText></Pressable>
    {/* Privacy sits in the ordinary settings list, above sign out. Burying it
        under a submenu is the standard way to make deletion hard to find. */}
    <Pressable accessibilityRole="button" accessibilityLabel={pvt.text('privacyTitle')} onPress={() => router.push('/privacy')} style={styles.button}><AppText>{pvt.text('privacyTitle')}</AppText></Pressable>
    {auth.mode === 'supabase' ? <Pressable onPress={() => void auth.signOut()} style={styles.button}><AppText>{t('signOut')}</AppText></Pressable> : null}
    {notice ? <AppText accessibilityRole="alert" style={styles.notice}>{notice}</AppText> : null}
    {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
  </Page>;

  // WPS-024 correction. One form. A worker and a customer register and sign in
  // the same way, so there is nothing left for a role switcher to switch.
  return <Page>
    <AppText style={styles.title}>{register ? t('signUp') : t('signIn')}</AppText>
    {register ? <Field label={t('fullName')} value={name} onChangeText={setName} rtl={isRTL}/> : null}
    <Field label={t('email')} value={email} onChangeText={setEmail} rtl={isRTL} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}/>
    <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry rtl={isRTL}/>
    {register ? <>
      <Field label={at('phone')} value={phone} onChangeText={setPhone} rtl={isRTL} keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false}/>
      <AppText style={styles.hint}>{at('phoneContactHint')}</AppText>
    </> : null}
    {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
    <Pressable disabled={busy || !email || password.length < 6 || (register && (name.trim().length < 2 || !isValidPhone(normalizePhone(phone))))} onPress={() => void loginCustomer()} style={styles.primary}>{busy ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{register ? t('signUp') : t('signIn')}</AppText>}</Pressable>
    {!register ? <Pressable accessibilityRole="button" accessibilityLabel={t('forgotPassword')} disabled={busy || !email.trim()} onPress={() => void requestReset()} style={styles.textButton}><AppText style={styles.link}>{t('forgotPassword')}</AppText></Pressable> : null}
    <Pressable onPress={() => setRegister((value) => !value)} style={styles.button}><AppText>{register ? t('signIn') : t('signUp')}</AppText></Pressable>
  </Page>;
}

function Page({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><BrandLockup size={46}/>{children}</ScrollView></SafeAreaView>; }
function Field({ label, rtl, ...props }: { label: string; rtl: boolean } & React.ComponentProps<typeof TextInput>) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.fieldWidth}><BrandTextField {...props} label={label} style={{textAlign:rtl?'right':'left'}}/></View>; }
const makeStyles = (colors: ThemeColors) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }, title: { fontSize: 28, fontWeight: typography.bold, textAlign: 'center' }, muted: { color: colors.textMuted, textAlign: 'center' }, hint: { width: '100%', maxWidth: 520, color: colors.textMuted, fontSize: 12 }, fieldWidth: { width: '100%', maxWidth: 520 }, input: { width: '100%', maxWidth: 520, height: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, color: colors.white, paddingHorizontal: spacing.lg }, button: { minWidth: 220, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, primary: { minWidth: 220, minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, dark: { color: colors.background, fontWeight: typography.bold }, error: { color: colors.error, textAlign: 'center' }, notice: { color: colors.success, textAlign: 'center' }, panelTitle: { fontSize: 18, fontWeight: typography.semibold, textAlign: 'center' }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }, link: { color: colors.textSecondary, textDecorationLine: 'underline' }, switcher: { width: '100%', maxWidth: 520, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 4 }, reverse: { flexDirection: 'row-reverse' }, switchOption: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm }, switchActive: { backgroundColor: colors.white }, panel: { width: '100%', maxWidth: 520, alignItems: 'center', gap: spacing.md, borderWidth: 1,borderColor: colors.border,borderRadius:radii.md,padding:spacing.lg } });
