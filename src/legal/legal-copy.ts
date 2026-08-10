/**
 * WPS-024 interface copy.
 *
 * The DOCUMENT text lives in the `legal-corpus-*` modules and is hashed; this
 * is the chrome around it — buttons, headings, the sentence explaining what
 * accepting means. Kept separate because the two have different rules:
 * document text cannot change without a version and a hash, and a button
 * label can.
 *
 * Runtime-import-free, following `onboarding-copy.ts`. The regression suite
 * runs under Node's `--experimental-strip-types`, which cannot resolve the
 * `@/` alias, so a single runtime import of the localization hook here would
 * make every copy assertion unrunnable. The hook lives in
 * `legal-translations.ts` and imports this; nothing imports back.
 *
 * Every key exists in both languages. The regression suite asserts that, and
 * asserts that no English string is reused verbatim as its own Arabic
 * translation, which is how untranslated strings usually slip through.
 */

const copy = {
  en: {
    centreTitle: 'Legal',
    centreIntro:
      'Every agreement and policy that applies to you, with the version you accepted and when.',
    outstandingTitle: 'Needs your agreement',
    outstandingIntro: 'These have changed since you last agreed to them.',
    allDocuments: 'All documents',
    yourAcceptances: 'What you have agreed to',
    noAcceptances: 'You have not accepted anything yet.',
    accepted: 'Accepted',
    declined: 'Declined',
    notAccepted: 'Not yet accepted',
    version: 'Version',
    published: 'Published',
    effective: 'In effect from',
    changeSummary: 'What changed',
    readDocument: 'Read',
    acceptLabel: 'I agree',
    declineLabel: 'I do not agree',
    acceptingMeans:
      'Agreeing records the exact version and language you are reading now. You can see it again at any time.',
    authoritativeEnglish: 'The English text governs if the two ever differ.',
    authoritativeArabic: 'The Arabic text governs if the two ever differ.',
    arabicIsSummary:
      'This Arabic text is a complete summary, not a full translation. The English is the governing text.',
    classInitial: 'First version',
    classEditorial: 'Editorial correction',
    classNonMaterial: 'Clarification',
    classMaterial: 'Material change',
    classUrgent: 'Urgent change',
    reconsentTitle: 'Please review the changes',
    reconsentIntro:
      'We have updated the documents below. Read what changed, then choose. Nothing is recorded until you do.',
    declineTitle: 'If you do not agree',
    declineStops: 'These stop working:',
    declineKeeps: 'These keep working whatever you decide:',
    declineNothingStops: 'Nothing stops working. This change does not affect your rights or obligations.',
    declineConfirm: 'Record that I do not agree',
    declineCancel: 'Go back',
    keepReading: 'Keep reading',
    restrictCreateBooking: 'Making a new booking',
    restrictTakeWork: 'Taking new work',
    restrictWorkerDashboard: 'Your worker dashboard',
    keepReadRecords: 'Seeing your records',
    keepExport: 'Exporting your data',
    keepSupport: 'Contacting support',
    keepAppeals: 'Appealing a decision',
    keepCloseAccount: 'Closing your account',
    unavailable: 'The legal centre is unavailable right now.',
    loading: 'Loading…',
    acceptFailed: 'That could not be recorded. Please try again.',
    staleBundle:
      'Your app is showing an older version of this document. Update the app, then agree.',
    signupTitle: 'Legal agreement',
    signupRequiredHint: 'Read the required documents before creating your account. Nothing is selected for you.',
    signupAgreeCommon: "I agree to Warsha's Terms of Service and Privacy Policy.",
    signupAgreeWorkerVerification: 'I agree to the Worker Verification Policy.',
    signupTerms: 'Terms of Service',
    signupPrivacy: 'Privacy Policy',
    signupWorkerVerification: 'Worker Verification Policy',
    signupLocationPolicy: 'Location Data Policy',
    signupLocationSeparate: 'Device location permission is separate from this agreement and remains optional.',
    signupEvidence: 'Warsha records the exact document version, language and acceptance time. You can reopen these documents from Privacy and Legal.',
  },
  ar: {
    centreTitle: 'القانوني',
    centreIntro: 'كل اتفاق وسياسة بتسري عليك، بالنسخة اللي وافقت عليها وإمتى.',
    outstandingTitle: 'محتاج موافقتك',
    outstandingIntro: 'دول اتغيّروا من آخر مرة وافقت عليهم.',
    allDocuments: 'كل المستندات',
    yourAcceptances: 'اللي وافقت عليه',
    noAcceptances: 'لسه ما وافقتش على حاجة.',
    accepted: 'موافق',
    declined: 'رافض',
    notAccepted: 'لسه ما وافقتش',
    version: 'النسخة',
    published: 'اتنشرت',
    effective: 'سارية من',
    changeSummary: 'اللي اتغيّر',
    readDocument: 'اقرا',
    acceptLabel: 'موافق',
    declineLabel: 'مش موافق',
    acceptingMeans:
      'الموافقة بتسجّل النسخة واللغة اللي بتقرا بيهم دلوقتي بالظبط. تقدر تشوفهم تاني في أي وقت.',
    authoritativeEnglish: 'النص الإنجليزي هو الحاكم لو الاتنين اختلفوا.',
    authoritativeArabic: 'النص العربي هو الحاكم لو الاتنين اختلفوا.',
    arabicIsSummary:
      'النص العربي ده ملخّص كامل، مش ترجمة كاملة. النص الإنجليزي هو النص الحاكم.',
    classInitial: 'أول نسخة',
    classEditorial: 'تصحيح تحريري',
    classNonMaterial: 'توضيح',
    classMaterial: 'تعديل جوهري',
    classUrgent: 'تعديل عاجل',
    reconsentTitle: 'من فضلك راجع التعديلات',
    reconsentIntro:
      'حدّثنا المستندات اللي تحت. اقرا اللي اتغيّر، وبعدين اختار. مفيش حاجة بتتسجّل قبل ما تعمل كده.',
    declineTitle: 'لو مش موافق',
    declineStops: 'دول هيبطّلوا يشتغلوا:',
    declineKeeps: 'دول بيفضلوا شغالين مهما اخترت:',
    declineNothingStops: 'مفيش حاجة هتبطّل تشتغل. التعديل ده مش بيمسّ حقوقك ولا التزاماتك.',
    declineConfirm: 'سجّل إني مش موافق',
    declineCancel: 'ارجع',
    keepReading: 'كمّل قراية',
    restrictCreateBooking: 'عمل حجز جديد',
    restrictTakeWork: 'أخذ شغل جديد',
    restrictWorkerDashboard: 'لوحة الصنايعي بتاعتك',
    keepReadRecords: 'رؤية سجلاتك',
    keepExport: 'تصدير بياناتك',
    keepSupport: 'التواصل مع الدعم',
    keepAppeals: 'استئناف قرار',
    keepCloseAccount: 'قفل حسابك',
    unavailable: 'المركز القانوني مش متاح دلوقتي.',
    loading: 'بيحمّل…',
    acceptFailed: 'ما اتسجّلش. حاول تاني من فضلك.',
    staleBundle: 'تطبيقك بيعرض نسخة أقدم من المستند ده. حدّث التطبيق وبعدين وافق.',
    signupTitle: 'الموافقة القانونية',
    signupRequiredHint: 'اقرأ المستندات المطلوبة قبل إنشاء الحساب. مفيش اختيار متعلّم لك مسبقًا.',
    signupAgreeCommon: 'أوافق على شروط استخدام ورشة وسياسة الخصوصية.',
    signupAgreeWorkerVerification: 'أوافق على سياسة التحقق من الصنايعي.',
    signupTerms: 'شروط الاستخدام',
    signupPrivacy: 'سياسة الخصوصية',
    signupWorkerVerification: 'سياسة التحقق من الصنايعي',
    signupLocationPolicy: 'سياسة بيانات الموقع',
    signupLocationSeparate: 'إذن موقع الجهاز منفصل عن الموافقة دي ويفضل اختياري.',
    signupEvidence: 'ورشة بتسجّل نسخة كل مستند ولغة عرضه ووقت الموافقة بالضبط. تقدر تفتح المستندات تاني من الخصوصية والقانوني.',
  },
} as const;

export type LegalTextKey = keyof typeof copy.en;

export const legalCopy = copy;

/** The reader-facing label for a change class. */
export function changeClassKey(changeClass: string): LegalTextKey {
  switch (changeClass) {
    case 'editorial':
      return 'classEditorial';
    case 'non_material':
      return 'classNonMaterial';
    case 'material':
      return 'classMaterial';
    case 'urgent':
      return 'classUrgent';
    default:
      return 'classInitial';
  }
}

/**
 * The label for a restriction the server reported.
 *
 * Falls back to `null` rather than to the raw key, so an unrecognised
 * restriction shows nothing instead of showing a developer identifier to
 * somebody deciding whether to agree to a legal document.
 */
export function restrictionKey(restriction: string): LegalTextKey | null {
  switch (restriction) {
    case 'create_booking':
      return 'restrictCreateBooking';
    case 'take_new_work':
      return 'restrictTakeWork';
    case 'worker_dashboard':
      return 'restrictWorkerDashboard';
    default:
      return null;
  }
}

export function guaranteeKey(guarantee: string): LegalTextKey | null {
  switch (guarantee) {
    case 'read_records':
      return 'keepReadRecords';
    case 'export_data':
      return 'keepExport';
    case 'support':
      return 'keepSupport';
    case 'appeals':
      return 'keepAppeals';
    case 'close_account':
      return 'keepCloseAccount';
    default:
      return null;
  }
}
