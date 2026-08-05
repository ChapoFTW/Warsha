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
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { useAuthText } from '@/src/auth/auth-translations';
import { isValidPhone, isValidSmsOtp, normalizePhone } from '@/src/auth/phone-auth';
import {
  createWorkerAuthFlow,
  transitionWorkerAuthFlow,
  workerAuthVisibleErrorKey,
  workerOtpVisible,
} from '@/src/auth/worker-auth-flow';
import { supabaseTarget } from '@/src/config/environment';
import { dataErrorKey, logDataError } from '@/src/data/data-errors';
import { useLocalization } from '@/src/i18n/localization';
import { useProviderText } from '@/src/i18n/provider-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { supabaseCustomerProfileRepository } from '@/src/repositories/supabase-user-repositories';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import { useSupportText } from '@/src/support/support-translations';

type AuthPath = 'customer' | 'worker';

export default function Profile() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const at = useAuthText();
  const pt = useProviderText();
  const st = useSupportText();
  const dt = useDiscoveryText();
  const gt = useGrowthText();
  const auth = useAuth();
  const provider = useProviderFoundation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [preferred, setPreferred] = useState<'en' | 'ar'>(language);
  const [authPath, setAuthPath] = useState<AuthPath>('customer');
  const [register, setRegister] = useState(false);
  const [workerRegister, setWorkerRegister] = useState(false);
  const [workerFlow, setWorkerFlow] = useState(createWorkerAuthFlow);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneEnrollment, setPhoneEnrollment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const workerRequest = useRef(0);
  const workerOtpIsVisible = workerOtpVisible(workerFlow);
  const workerErrorKey = workerAuthVisibleErrorKey(workerFlow);

  const resetWorkerTransient = useCallback(() => {
    workerRequest.current += 1;
    setWorkerFlow(createWorkerAuthFlow());
    setOtp('');
    setMessage('');
    setNotice('');
    setBusy(false);
  }, []);

  useFocusEffect(useCallback(() => {
    resetWorkerTransient();
    return () => { workerRequest.current += 1; };
  }, [resetWorkerTransient]));

  useEffect(() => {
    setPassword('');
    setOtp('');
    setOtpSent(false);
    setWorkerFlow(createWorkerAuthFlow());
    workerRequest.current += 1;
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
        const result = await auth.signUp(name, email, password, 'customer', preferred);
        if (result.needsEmailConfirmation) setMessage(t('checkEmail'));
      } else await auth.signIn(email, password);
    } catch (error) { setMessage(t(authMessageKey(error))); }
    finally { setBusy(false); }
  };

  const sendWorkerOtp = async (resend = false) => {
    const request = ++workerRequest.current;
    setBusy(true);
    setNotice('');
    setWorkerFlow((state) => transitionWorkerAuthFlow(state, { type: resend ? 'RESEND_STARTED' : 'SEND_STARTED' }));
    try {
      await auth.requestWorkerOtp(phone, workerRegister, name, preferred);
      if (workerRequest.current !== request) return;
      setWorkerFlow((state) => transitionWorkerAuthFlow(
        transitionWorkerAuthFlow(state, { type: resend ? 'RESEND_SUCCEEDED' : 'SEND_SUCCEEDED' }),
        { type: 'OTP_PRESENTED' },
      ));
      setNotice(at('codeSent'));
    } catch (error) {
      if (workerRequest.current === request) setWorkerFlow((state) => transitionWorkerAuthFlow(state, {
        type: resend ? 'RESEND_FAILED' : 'SEND_FAILED',
        errorKey: authMessageKey(error),
      }));
    } finally {
      if (workerRequest.current === request) setBusy(false);
    }
  };

  const verifyWorkerOtp = async () => {
    const request = ++workerRequest.current;
    setBusy(true);
    setNotice('');
    setWorkerFlow((state) => transitionWorkerAuthFlow(state, { type: 'VERIFY_STARTED' }));
    try {
      await auth.verifyWorkerOtp(phone, otp, workerRegister, name);
      if (workerRequest.current !== request) return;
      setWorkerFlow((state) => transitionWorkerAuthFlow(state, { type: 'VERIFIED' }));
      setOtp('');
    } catch (error) {
      if (workerRequest.current === request) setWorkerFlow((state) => transitionWorkerAuthFlow(state, {
        type: 'VERIFY_FAILED',
        errorKey: authMessageKey(error),
      }));
    } finally {
      if (workerRequest.current === request) setBusy(false);
    }
  };

  const changeWorkerPhone = (value: string) => {
    workerRequest.current += 1;
    setPhone(value);
    setOtp('');
    setNotice('');
    setBusy(false);
    setWorkerFlow((state) => transitionWorkerAuthFlow(state, { type: 'PHONE_CHANGED' }));
  };

  const changeWorkerOtp = (value: string) => {
    setOtp(value);
    setWorkerFlow((state) => transitionWorkerAuthFlow(state, { type: 'OTP_CHANGED' }));
  };

  const changeAuthPath = (path: AuthPath) => {
    setAuthPath(path);
    resetWorkerTransient();
    setOtpSent(false);
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
        if (auth.mode === 'supabase' && !auth.hasVerifiedPhone) {
          setPhoneEnrollment(true);
          setMessage('');
          setNotice('');
          return;
        }
        await provider.activate(name || t('professional'));
      } else await provider.setMode('provider');
      router.push('/provider-mode');
    } catch { setMessage(t('genericTryAgain')); }
  };

  const sendPhoneEnrollmentOtp = async () => {
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      const status = await auth.requestWorkerPhoneChange(phone);
      if (status === 'already_verified') {
        await provider.activate(name || t('professional'));
        setPhoneEnrollment(false);
        router.push('/provider-mode');
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
      await provider.activate(name || t('professional'));
      setPhoneEnrollment(false);
      setOtpSent(false);
      setOtp('');
      router.push('/provider-mode');
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
    </View> : <Pressable disabled={provider.saving} onPress={() => void openProvider()} style={styles.primary}>{provider.saving ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{provider.profile ? pt('providerMode') : pt('become')}</AppText>}</Pressable>}
    <Pressable onPress={() => router.push('/favourites')} style={styles.button}><AppText>{t('favourites')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={dt.text('recentlyViewed')} onPress={() => router.push('/recently-viewed')} style={styles.button}><AppText>{dt.text('recentlyViewed')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={gt.text('referralTitle')} onPress={() => router.push('/referrals')} style={styles.button}><AppText>{gt.text('referralTitle')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={dt.text('appearance')} onPress={() => router.push('/appearance')} style={styles.button}><AppText>{dt.text('appearance')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={st.text('helpCenter')} onPress={() => router.push('/help')} style={styles.button}><AppText>{st.text('helpCenter')}</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={st.text('myCases')} onPress={() => router.push('/support')} style={styles.button}><AppText>{st.text('myCases')}</AppText></Pressable>
    {auth.mode === 'supabase' ? <Pressable onPress={() => void auth.signOut()} style={styles.button}><AppText>{t('signOut')}</AppText></Pressable> : null}
    {notice ? <AppText accessibilityRole="alert" style={styles.notice}>{notice}</AppText> : null}
    {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
  </Page>;

  return <Page>
    <View style={[styles.switcher, isRTL && styles.reverse]}>
      {(['customer', 'worker'] as AuthPath[]).map((path) => <Pressable key={path} onPress={() => changeAuthPath(path)} style={[styles.switchOption, authPath === path && styles.switchActive]}><AppText style={authPath === path && styles.dark}>{at(path === 'customer' ? 'customerAccount' : 'workerAccount')}</AppText></Pressable>)}
    </View>
    {authPath === 'customer' ? <>
      <AppText style={styles.title}>{register ? t('signUp') : t('signIn')}</AppText>
      {register ? <Field label={t('fullName')} value={name} onChangeText={setName} rtl={isRTL}/> : null}
      <Field label={t('email')} value={email} onChangeText={setEmail} rtl={isRTL} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}/>
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry rtl={isRTL}/>
      {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      <Pressable disabled={busy || !email || password.length < 6} onPress={() => void loginCustomer()} style={styles.primary}>{busy ? <BrandLoadingMark size={20} color={colors.background}/> : <AppText style={styles.dark}>{register ? t('signUp') : t('signIn')}</AppText>}</Pressable>
      {!register ? <Pressable accessibilityRole="button" accessibilityLabel={t('forgotPassword')} disabled={busy || !email.trim()} onPress={() => void requestReset()} style={styles.textButton}><AppText style={styles.link}>{t('forgotPassword')}</AppText></Pressable> : null}
      <Pressable onPress={() => setRegister((value) => !value)} style={styles.button}><AppText>{register ? t('signIn') : t('signUp')}</AppText></Pressable>
    </> : <>
      <AppText style={styles.title}>{at(workerRegister ? 'workerCreate' : 'workerSignIn')}</AppText>
      {workerRegister ? <Field label={at('workerName')} value={name} onChangeText={setName} rtl={isRTL}/> : null}
      <Field label={at('phone')} value={phone} onChangeText={changeWorkerPhone} rtl={isRTL} keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false}/>
      <AppText style={styles.hint}>{at('phoneHint')}</AppText>
      {isValidPhone(phone) ? <AppText style={styles.hint}>{at('sendCodePreview')} {normalizePhone(phone)}.</AppText> : null}
      {workerOtpIsVisible ? <Field label={at('otp')} value={otp} onChangeText={changeWorkerOtp} rtl={isRTL} keyboardType="number-pad" maxLength={6}/> : null}
      {workerOtpIsVisible && __DEV__ && supabaseTarget === 'local' ? <AppText style={styles.hint}>{at('localOtpHint')}</AppText> : null}
      {notice ? <AppText accessibilityRole="alert" style={styles.notice}>{notice}</AppText> : null}
      {workerErrorKey ? <AppText accessibilityRole="alert" style={styles.error}>{t(workerErrorKey)}</AppText> : null}
      <Pressable disabled={busy || (workerOtpIsVisible ? !isValidSmsOtp(otp) : !isValidPhone(phone) || workerRegister && name.trim().length < 2)} onPress={() => void (workerOtpIsVisible ? verifyWorkerOtp() : sendWorkerOtp())} style={styles.primary}>{workerFlow.stage === 'VERIFYING' ? <BrandLoadingMark size={20} color={colors.background}/> : busy ? <AppText style={styles.dark}>{at('sendingCode')}</AppText> : <AppText style={styles.dark}>{at(workerOtpIsVisible ? 'verifyOtp' : 'sendOtp')}</AppText>}</Pressable>
      {workerOtpIsVisible ? <Pressable disabled={busy} onPress={() => void sendWorkerOtp(true)} style={styles.textButton}><AppText style={styles.link}>{at('resendOtp')}</AppText></Pressable> : null}
      <Pressable onPress={() => { setWorkerRegister((value) => !value); resetWorkerTransient(); }} style={styles.button}><AppText>{at(workerRegister ? 'existingWorker' : 'newWorker')}</AppText></Pressable>
    </>}
  </Page>;
}

function Page({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><BrandLockup size={46}/>{children}</ScrollView></SafeAreaView>; }
function Field({ label, rtl, ...props }: { label: string; rtl: boolean } & React.ComponentProps<typeof TextInput>) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.fieldWidth}><BrandTextField {...props} label={label} style={{textAlign:rtl?'right':'left'}}/></View>; }
const makeStyles = (colors: ThemeColors) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }, title: { fontSize: 28, fontWeight: typography.bold, textAlign: 'center' }, muted: { color: colors.textMuted, textAlign: 'center' }, hint: { width: '100%', maxWidth: 520, color: colors.textMuted, fontSize: 12 }, fieldWidth: { width: '100%', maxWidth: 520 }, input: { width: '100%', maxWidth: 520, height: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, color: colors.white, paddingHorizontal: spacing.lg }, button: { minWidth: 220, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, primary: { minWidth: 220, minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, dark: { color: colors.background, fontWeight: typography.bold }, error: { color: colors.error, textAlign: 'center' }, notice: { color: colors.success, textAlign: 'center' }, panelTitle: { fontSize: 18, fontWeight: typography.semibold, textAlign: 'center' }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md }, link: { color: colors.textSecondary, textDecorationLine: 'underline' }, switcher: { width: '100%', maxWidth: 520, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 4 }, reverse: { flexDirection: 'row-reverse' }, switchOption: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm }, switchActive: { backgroundColor: colors.white }, panel: { width: '100%', maxWidth: 520, alignItems: 'center', gap: spacing.md, borderWidth: 1,borderColor: colors.border,borderRadius:radii.md,padding:spacing.lg } });
