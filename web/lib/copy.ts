import type { Locale } from './preferences.ts';

/**
 * Every word the public website says, in both languages.
 *
 * Arabic here is Egyptian and written to be read, not decoded — the same
 * register the mobile application uses. A literal translation of English
 * marketing copy reads like a translation, which is its own kind of telling
 * somebody they were an afterthought.
 *
 * No component may hold a bare string. That rule is enforced by
 * `scripts/web-platform.test.mts`, because the failure mode is not a missing
 * translation somebody notices — it is one English word left in the middle of
 * an Arabic page, which nobody reports and everybody sees.
 */

export const copy = {
  en: {
    brand: 'Warsha',
    skipToContent: 'Skip to content',

    navFind: 'Find a professional',
    navHow: 'How Warsha works',
    navWorker: 'Work with Warsha',
    navTrust: 'Trust & safety',
    navHelp: 'Help',
    navPrimary: 'Primary',
    signIn: 'Sign in',
    createAccount: 'Create account',
    homeAria: 'Warsha home',

    languageLabel: 'Language',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    appearanceLabel: 'Appearance',
    appearanceSystem: 'System',
    appearanceLight: 'Light',
    appearanceDark: 'Dark',

    heroEyebrow: 'Home services in Egypt',
    heroTitle: 'Get it fixed, at a price you agreed first.',
    heroBody:
      'Warsha connects people who need home repairs and maintenance with skilled '
      + 'professionals. You describe the job, they quote, and you decide before any '
      + 'work begins.',
    heroPostJob: 'Post a job',
    heroWork: 'Work with Warsha',
    heroNote:
      'Warsha is in closed testing. Accounts created now are real accounts on the '
      + 'live service.',

    howTitle: 'How it works',
    howLead: 'Four steps, and the third one is the one that matters.',
    step1Title: 'Describe the job',
    step1Body: 'Say what needs doing and where. Photographs help, and are optional.',
    step2Title: 'Receive quotes',
    step2Body:
      'Professionals who cover your area and trade respond with a price for the work.',
    step3Title: 'Agree before work starts',
    step3Body:
      'You accept a quote before anybody is booked. The agreed price is recorded.',
    step4Title: 'Track it to completion',
    step4Body:
      'Follow the job through to completion, with the conversation kept in one place.',

    workerEyebrow: 'For professionals',
    workerTitle: 'Quote the work you want, at your price.',
    workerLead:
      'Warsha sends you requests that match your trade and the areas you cover. '
      + 'You choose which to quote.',
    workerCta: 'Start your application',
    worker1Title: 'Work that matches your trade',
    worker1Body: 'You see requests for the trades you registered and the areas you cover.',
    worker2Title: 'You set the price',
    worker2Body:
      'You quote each job yourself. Nothing is assigned to you at a price you did not set.',
    worker3Title: 'Verification you complete once',
    worker3Body:
      'Identity and trade checks are completed once, then reviewed by a person.',

    legalHomeTitle: 'Read before you sign up',
    legalHomeLead:
      'Every agreement Warsha asks you to accept is readable in full, in English and '
      + 'Arabic, before you create an account.',
    legalVersion: 'Version',

    footerBlurb:
      'Home repairs and maintenance in Egypt, with the price agreed before the work starts.',
    footerWarsha: 'Warsha',
    footerServices: 'Services',
    footerLegal: 'Legal',
    footerAbout: 'About',
    footerHowItWorks: 'How it works',
    footerContact: 'Contact',
    footerAllServices: 'All services',
    footerCategories: 'Categories',
    footerBecomeWorker: 'Become a worker',
    footerLegalCentre: 'Legal centre',
    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerLocation: 'Location Data Policy',

    legalCentreTitle: 'Legal centre',
    legalCentreLead:
      'Every agreement and policy, in full, in both languages. Nothing here is behind a sign-in.',
    legalMandatoryHeading: 'Agreements you accept',
    legalMandatoryNote:
      'Warsha records the exact version and the hash of the text shown when you accept '
      + 'one of these. Acceptance records are append-only and are never edited.',
    legalReferenceHeading: 'Policies and registers',
    legalReferenceNote:
      'These describe how Warsha operates. They do not require acceptance.',
    legalAudienceEveryone: 'everyone',
    legalEffective: 'effective',
    legalAcceptanceRequired: 'acceptance required',
    fingerprintHeading: 'Document fingerprint',
    fingerprintNote:
      'Warsha records the exact version and the hash of the text shown when an '
      + 'agreement is accepted. These are the hashes for version',

    signInTitle: 'Sign in to Warsha',
    signInEyebrow: 'Welcome back',
    signInLead:
      'Choose how you use Warsha. Your account works the same on the web and in the app.',
    signInIdentity: 'Email or phone number',
    signInIdentityHint: 'Use the email address or the phone number you registered with. Warsha works out the rest.',
    signInOneAccount: 'One sign-in for everyone',
    signInOneAccountBody: 'Whether you hire professionals, do the work, or both, you sign in the same way. Warsha resolves what your account can do after you are signed in — you never have to declare it first.',
    signInCustomer: 'I need work done',
    signInCustomerBody:
      'Sign in with the email address and password you registered with.',
    signInWorker: 'I do the work',
    signInWorkerBody:
      'Sign in with the phone number and password you registered with. No email is involved.',
    signInCustomerPending: 'Customer sign-in — coming to the web',
    signInWorkerPending: 'Professional sign-in — coming to the web',
    signInFootNote: 'Do not have an account yet?',
    signInFootLink: 'Create one',
    signInFootTail:
      'Accounts created in the Warsha app work here, and accounts created here work in the app.',

    createTitle: 'How do you want to use Warsha?',
    createEyebrow: 'Create an account',
    createLead:
      'Pick the one that describes you. You can read every required agreement in full '
      + 'before you agree to anything.',
    createCustomerBody:
      'Describe a job, receive quotes, and agree a price before the work starts. You '
      + 'register with an email address and confirm it before signing in.',
    createWorkerBody:
      'Register your trades, complete verification, and quote the jobs you want. You '
      + 'register with a phone number and password — no email is needed.',
    createRequiredHeading: 'You will be asked to accept',
    createCustomerPending: 'Customer signup — coming to the web',
    createWorkerPending: 'Professional application — coming to the web',
    createFootNote:
      'Applying as a professional starts a verification process. It does not make you a '
      + 'worker on Warsha, and approval is not automatic. Already have an account?',
  },

  ar: {
    brand: 'ورشة',
    skipToContent: 'تخطَّ إلى المحتوى',

    navFind: 'دوّر على صنايعي',
    navHow: 'ورشة بتشتغل إزاي',
    navWorker: 'اشتغل مع ورشة',
    navTrust: 'الأمان والثقة',
    navHelp: 'المساعدة',
    navPrimary: 'التنقل الرئيسي',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    homeAria: 'الصفحة الرئيسية لورشة',

    languageLabel: 'اللغة',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    appearanceLabel: 'المظهر',
    appearanceSystem: 'حسب الجهاز',
    appearanceLight: 'فاتح',
    appearanceDark: 'داكن',

    heroEyebrow: 'خدمات المنزل في مصر',
    heroTitle: 'صلّح اللي محتاج تصليح، بسعر اتفقت عليه الأول.',
    heroBody:
      'ورشة بتوصّل اللي محتاج تصليح أو صيانة في بيته بصنايعية شاطرين. إنت بتوصف '
      + 'الشغل، وهما بيقدّموا سعر، وإنت اللي بتقرر قبل ما أي شغل يبدأ.',
    heroPostJob: 'اطلب صنايعي',
    heroWork: 'اشتغل مع ورشة',
    heroNote:
      'ورشة لسه في مرحلة تجربة مغلقة. الحسابات اللي بتتعمل دلوقتي حسابات حقيقية على '
      + 'الخدمة الفعلية.',

    howTitle: 'بتشتغل إزاي',
    howLead: 'أربع خطوات، والتالتة هي المهمة.',
    step1Title: 'اوصف الشغل',
    step1Body: 'قول محتاج إيه وفين. الصور بتساعد، وهي اختيارية.',
    step2Title: 'استنى العروض',
    step2Body: 'الصنايعية اللي بيغطوا منطقتك ومهنتك بيبعتوا سعر للشغل.',
    step3Title: 'الاتفاق قبل ما الشغل يبدأ',
    step3Body: 'إنت بتقبل العرض قبل ما حد يتحجز. السعر المتفق عليه بيتسجّل.',
    step4Title: 'تابع لحد ما يخلص',
    step4Body: 'تابع الشغل لحد ما يكمل، والكلام كله محفوظ في مكان واحد.',

    workerEyebrow: 'للصنايعية',
    workerTitle: 'قدّم سعرك على الشغل اللي يناسبك.',
    workerLead:
      'ورشة بتبعتلك الطلبات اللي تناسب مهنتك والمناطق اللي بتغطيها. وإنت بتختار '
      + 'تقدّم سعر على إيه.',
    workerCta: 'ابدأ طلبك',
    worker1Title: 'شغل يناسب مهنتك',
    worker1Body: 'بتشوف الطلبات الخاصة بالمهن اللي سجّلتها والمناطق اللي بتغطيها.',
    worker2Title: 'إنت اللي بتحدد السعر',
    worker2Body: 'إنت بتسعّر كل شغلانة بنفسك. مفيش حاجة بتتحطلك بسعر إنت ما حددتوش.',
    worker3Title: 'توثيق بتعمله مرة واحدة',
    worker3Body: 'التحقق من الهوية والمهنة بيتعمل مرة واحدة، وبعدين حد بيراجعه.',

    legalHomeTitle: 'اقرأ قبل ما تسجّل',
    legalHomeLead:
      'كل اتفاقية ورشة بتطلب منك توافق عليها تقدر تقراها كاملة، بالعربي والإنجليزي، '
      + 'قبل ما تعمل حساب.',
    legalVersion: 'نسخة',

    footerBlurb: 'تصليح وصيانة المنازل في مصر، بسعر متفق عليه قبل ما الشغل يبدأ.',
    footerWarsha: 'ورشة',
    footerServices: 'الخدمات',
    footerLegal: 'القانوني',
    footerAbout: 'عن ورشة',
    footerHowItWorks: 'بتشتغل إزاي',
    footerContact: 'تواصل معنا',
    footerAllServices: 'كل الخدمات',
    footerCategories: 'التصنيفات',
    footerBecomeWorker: 'ابقى صنايعي في ورشة',
    footerLegalCentre: 'المركز القانوني',
    footerPrivacy: 'سياسة الخصوصية',
    footerTerms: 'شروط الاستخدام',
    footerLocation: 'سياسة بيانات الموقع',

    legalCentreTitle: 'المركز القانوني',
    legalCentreLead:
      'كل الاتفاقيات والسياسات، كاملة، وباللغتين. مفيش حاجة هنا محتاجة تسجيل دخول.',
    legalMandatoryHeading: 'الاتفاقيات اللي بتوافق عليها',
    legalMandatoryNote:
      'ورشة بتسجّل النسخة بالظبط وبصمة النص اللي اتعرض عليك وقت الموافقة. سجلات '
      + 'الموافقة بتتضاف بس وما بتتعدلش أبدًا.',
    legalReferenceHeading: 'السياسات والسجلات',
    legalReferenceNote: 'دي بتوضح ورشة بتشتغل إزاي. مش محتاجة موافقة.',
    legalAudienceEveryone: 'الجميع',
    legalEffective: 'سارية من',
    legalAcceptanceRequired: 'مطلوب الموافقة',
    fingerprintHeading: 'بصمة المستند',
    fingerprintNote:
      'ورشة بتسجّل النسخة بالظبط وبصمة النص اللي اتعرض وقت الموافقة على أي اتفاقية. '
      + 'دي البصمات الخاصة بالنسخة',

    signInTitle: 'ادخل على ورشة',
    signInEyebrow: 'أهلًا بعودتك',
    signInLead: 'اختار إنت بتستخدم ورشة إزاي. حسابك بيشتغل نفس الشيء على الويب والتطبيق.',
    signInIdentity: 'البريد الإلكتروني أو رقم التليفون',
    signInIdentityHint: 'استخدم البريد الإلكتروني أو رقم التليفون اللي سجّلت بيه. ورشة هتعرف الباقي.',
    signInOneAccount: 'تسجيل دخول واحد للكل',
    signInOneAccountBody: 'سواء بتطلب صنايعية، أو بتشتغل، أو الاتنين، بتسجّل الدخول بنفس الطريقة. ورشة بتحدد حسابك بيعمل إيه بعد ما تدخل — مش لازم تقول ده بنفسك الأول.',
    signInCustomer: 'محتاج حد يشتغل عندي',
    signInCustomerBody: 'ادخل بالإيميل والباسورد اللي سجّلت بيهم.',
    signInWorker: 'أنا اللي بشتغل',
    signInWorkerBody: 'ادخل برقم التليفون والباسورد اللي سجّلت بيهم. من غير إيميل خالص.',
    signInCustomerPending: 'دخول العملاء — جاي قريب على الويب',
    signInWorkerPending: 'دخول الصنايعية — جاي قريب على الويب',
    signInFootNote: 'لسه ما عندكش حساب؟',
    signInFootLink: 'اعمل واحد',
    signInFootTail:
      'الحسابات اللي اتعملت في تطبيق ورشة بتشتغل هنا، واللي بيتعمل هنا بيشتغل في التطبيق.',

    createTitle: 'عايز تستخدم ورشة إزاي؟',
    createEyebrow: 'إنشاء حساب',
    createLead:
      'اختار الوصف اللي يناسبك. تقدر تقرا كل اتفاقية مطلوبة كاملة قبل ما توافق على أي حاجة.',
    createCustomerBody:
      'اوصف الشغل، استنى العروض، واتفق على السعر قبل ما الشغل يبدأ. بتسجّل بإيميل '
      + 'وبتأكده قبل ما تدخل.',
    createWorkerBody:
      'سجّل مهنتك، كمّل التوثيق، وقدّم سعرك على الشغل اللي يناسبك. بتسجّل برقم '
      + 'تليفون وباسورد — من غير إيميل.',
    createRequiredHeading: 'هيتطلب منك توافق على',
    createCustomerPending: 'تسجيل العملاء — جاي قريب على الويب',
    createWorkerPending: 'طلب الصنايعية — جاي قريب على الويب',
    createFootNote:
      'التقديم كصنايعي بيبدأ عملية توثيق. ده ما بيخليكش صنايعي في ورشة، والقبول مش '
      + 'تلقائي. عندك حساب بالفعل؟',
  },
} as const;

export type CopyKey = keyof typeof copy.en;

export function t(locale: Locale, key: CopyKey): string {
  return copy[locale][key];
}
