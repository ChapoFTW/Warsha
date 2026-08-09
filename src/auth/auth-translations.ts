import { useLocalization } from '@/src/i18n/localization';

const copy = {
  en: {
    customerAccount: 'Customer',
    workerAccount: 'Worker',
    workerSignIn: 'Worker sign in',
    workerCreate: 'Create worker account',
    workerName: 'Name customers will see',
    signInIdentifier: 'Customer email or worker phone',
    phonePasswordHint: 'Workers sign in with their phone number and password. No SMS code is sent.',
    workerRegistrationNoEmail: 'No email is needed. You will sign in with this phone number and password.',
    phone: 'Phone number',
    phoneHint: 'Enter an Egyptian mobile number, for example 01012345678.',
    // WPS-024 correction. Says what the number is FOR and, by saying nothing
    // about a code, does not promise one. Registration sends no SMS.
    phoneContactHint: 'How your worker or customer reaches you on the day. For example 01012345678.',
    phoneNotVerified: 'Not confirmed yet',
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
    // Confirming is optional and additional. It is never a condition of
    // registering, working or being paid, and this line must not imply it is.
    phoneRequired: 'Confirming your number is optional. Your account works without it.',
    existingWorker: 'Already have a worker account?',
    newWorker: 'New to Warsha as a worker?',
  },
  ar: {
    customerAccount: 'عميل',
    workerAccount: 'فني',
    workerSignIn: 'دخول الفني',
    workerCreate: 'إنشاء حساب فني',
    workerName: 'الاسم اللي هيشوفه العميل',
    signInIdentifier: 'إيميل العميل أو رقم تليفون الفني',
    phonePasswordHint: 'الفني بيدخل برقم تليفونه والباسورد. مفيش كود SMS بيتبعت.',
    workerRegistrationNoEmail: 'مش محتاج إيميل. هتدخل برقم التليفون ده والباسورد.',
    phone: 'رقم الموبايل',
    phoneHint: 'اكتب رقم موبايل مصري، زي 01012345678.',
    phoneContactHint: 'الرقم اللي الفني أو العميل هيوصلك عليه يوم الشغل. زي 01012345678.',
    phoneNotVerified: 'لسه غير مؤكد',
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
    phoneRequired: 'تأكيد الرقم اختياري. حسابك شغال من غيره.',
    existingWorker: 'عندك حساب فني بالفعل؟',
    newWorker: 'أول مرة تشتغل على ورشة؟',
  },
} as const;

export type AuthCopyKey = keyof typeof copy.en;

export function useAuthText() {
  const { language } = useLocalization();
  return (key: AuthCopyKey) => copy[language][key];
}
