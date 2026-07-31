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
    normalizedPhone: 'We’ll use',
    localOtpHint: 'Local development code: 123456.',
    otp: '6-digit verification code',
    sendOtp: 'Send verification code',
    verifyOtp: 'Verify and continue',
    resendOtp: 'Send a new code',
    codeSent: 'A verification code was sent to your phone.',
    phoneRequired: 'Verify a phone number before creating a worker profile.',
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
    normalizedPhone: 'هنستخدم',
    localOtpHint: 'كود التطوير المحلي: 123456.',
    otp: 'كود التحقق المكوّن من ٦ أرقام',
    sendOtp: 'إرسال كود التحقق',
    verifyOtp: 'تأكيد ومتابعة',
    resendOtp: 'إرسال كود جديد',
    codeSent: 'بعتنا كود تحقق على رقم موبايلك.',
    phoneRequired: 'أكد رقم موبايلك قبل إنشاء ملف فني.',
    existingWorker: 'عندك حساب فني بالفعل؟',
    newWorker: 'أول مرة تشتغل على ورشة؟',
  },
} as const;

export type AuthCopyKey = keyof typeof copy.en;

export function useAuthText() {
  const { language } = useLocalization();
  return (key: AuthCopyKey) => copy[language][key];
}
