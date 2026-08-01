import { useLocalization } from '@/src/i18n/localization';

const copy = {
  en: {
    customerAccount: 'Customer',
    workerAccount: 'Worker',
    workerSignIn: 'Worker sign in',
    workerCreate: 'Create worker account',
    workerName: 'Name customers will see',
    phone: 'Phone number',
    phoneHint: 'Enter an Egyptian mobile number, for example 01012345678.',
    sendCodePreview: 'We’ll send the code to',
    localOtpHint: 'Local development code: 123456.',
    otp: 'Enter verification code',
    sendOtp: 'Send verification code',
    sendingCode: 'Sending code…',
    verifyOtp: 'Verify and continue',
    verifyPhone: 'Verify phone',
    resendOtp: 'Resend code',
    codeSent: 'Verification code sent.',
    phoneVerifyTitle: 'Verify your phone',
    phoneRequired: 'Verify an Egyptian mobile number before creating a worker profile.',
    existingWorker: 'Already have a worker account?',
    newWorker: 'New to Warsha as a worker?',
  },
  ar: {
    customerAccount: 'عميل',
    workerAccount: 'فني',
    workerSignIn: 'دخول الفني',
    workerCreate: 'إنشاء حساب فني',
    workerName: 'الاسم اللي هيشوفه العميل',
    phone: 'رقم الموبايل',
    phoneHint: 'اكتب رقم موبايل مصري، زي 01012345678.',
    sendCodePreview: 'هنبعت الكود على',
    localOtpHint: 'كود التطوير المحلي: 123456.',
    otp: 'اكتب كود التحقق',
    sendOtp: 'إرسال كود التحقق',
    sendingCode: 'جارٍ إرسال الكود…',
    verifyOtp: 'تأكيد ومتابعة',
    verifyPhone: 'تأكيد الرقم',
    resendOtp: 'إعادة إرسال الكود',
    codeSent: 'تم إرسال كود التحقق.',
    phoneVerifyTitle: 'أكد رقم موبايلك',
    phoneRequired: 'أكد رقم موبايل مصري قبل إنشاء ملف الفني.',
    existingWorker: 'عندك حساب فني بالفعل؟',
    newWorker: 'أول مرة تشتغل على ورشة؟',
  },
} as const;

export type AuthCopyKey = keyof typeof copy.en;

export function useAuthText() {
  const { language } = useLocalization();
  return (key: AuthCopyKey) => copy[language][key];
}
