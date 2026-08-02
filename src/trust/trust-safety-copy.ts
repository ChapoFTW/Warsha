/**
 * WPS-016 trust, safety and moderation copy.
 *
 * Language rules:
 * - explain the restriction, never accuse;
 * - never reveal who reported an account;
 * - never expose evidence, staff notes, or fraud signals;
 * - never imply an automatic or permanent decision without review;
 * - always offer the appeal route where one exists.
 *
 * Data only, so the regression suite can validate it without React or Expo.
 */
export const trustSafetyCopy = {
  en: {
    // Report intake
    reportTitle: 'Report a problem',
    reportSubtitle: 'Tell us what happened. Our team reviews every report.',
    reportSubmitted: 'Report received',
    reportSubmittedDetail: 'Thank you. Our team will review this.',
    reportDuplicate: 'You already reported this.',
    reportCannotSelfReport: 'You cannot report your own account.',
    reportDetailsLabel: 'What happened?',
    reportDetailsOptional: 'Optional, but it helps us review faster.',
    reportPrivacyNote: 'Your report is confidential. The other person is not told who reported.',

    // Categories
    categoryFraud: 'Fraud',
    categoryImpersonation: 'Pretending to be someone else',
    categoryAbusiveLanguage: 'Abusive language',
    categoryHarassment: 'Harassment',
    categoryDiscrimination: 'Discrimination',
    categoryFakeProfile: 'Fake profile',
    categoryFakeDocuments: 'Fake documents',
    categoryFakeCertificates: 'Fake certificates',
    categorySpam: 'Spam',
    categoryScam: 'Scam',
    categoryDangerousBehavior: 'Dangerous behaviour',
    categoryOffPlatformPayment: 'Asked to pay outside Warsha',
    categoryOffPlatformContact: 'Asked to talk outside Warsha',
    categoryIllegalActivity: 'Illegal activity',
    categoryInappropriateContent: 'Inappropriate content',
    categoryCopyright: 'Copyright',
    categoryPrivacy: 'Privacy',

    // Report status
    statusSubmitted: 'Received',
    statusTriage: 'Being sorted',
    statusInvestigating: 'Under review',
    statusActioned: 'Action taken',
    statusDismissed: 'Closed with no action',
    statusDuplicate: 'Already reported',

    // Trust levels
    levelGoodStanding: 'Your account is in good standing',
    levelWarned: 'You have received a warning',
    levelRestricted: 'Some features are limited',
    levelUnderInvestigation: 'Your account is being reviewed',
    levelSuspended: 'Your account is suspended',
    levelBanned: 'Your account is closed',

    // Restrictions
    restrictionMarketplaceRemoved: 'You do not appear in the marketplace right now.',
    restrictionProfileHidden: 'Your profile is hidden right now.',
    restrictionPaymentHold: 'Payments are on hold while we review.',
    restrictionWithdrawalHold: 'Withdrawals are on hold while we review.',
    restrictionCommunication: 'Messaging is limited right now.',
    restrictionReview: 'Leaving reviews is limited right now.',
    restrictionUntil: 'This applies until',
    restrictionNoAccusation: 'A review does not mean you did anything wrong.',

    // Appeals
    appealTitle: 'Ask us to review this',
    appealSubtitle: 'Tell us anything we should know. A person reviews every appeal.',
    appealStatementLabel: 'Your explanation',
    appealSubmitted: 'Appeal received',
    appealUnderReview: 'Your appeal is being reviewed',
    appealUpheld: 'The original decision stands',
    appealOverturned: 'The decision was reversed',
    appealPartiallyOverturned: 'The decision was partly reversed',
    appealWithdrawn: 'Appeal withdrawn',
    appealAlreadySubmitted: 'You already appealed this.',
    appealNotAvailable: 'This cannot be appealed.',
    appealPrivacyNote: 'Your appeal is only seen by our review team.',

    // Accessibility labels
    a11yReportStatus: 'Report status',
    a11yTrustStatus: 'Account status',
    a11yAppealStatus: 'Appeal status',
    a11yRestrictionActive: 'Restriction active',
    a11yRestrictionCleared: 'Restriction cleared',
    a11yOpenReportForm: 'Open the report form',
    a11ySubmitReport: 'Submit report',
    a11ySubmitAppeal: 'Submit appeal',
  },
  ar: {
    // Report intake
    reportTitle: 'بلّغ عن مشكلة',
    reportSubtitle: 'قول لنا حصل إيه. فريقنا بيراجع كل بلاغ.',
    reportSubmitted: 'استلمنا البلاغ',
    reportSubmittedDetail: 'شكرًا ليك. فريقنا هيراجع الموضوع.',
    reportDuplicate: 'انت بلّغت عن ده قبل كده.',
    reportCannotSelfReport: 'مش تقدر تبلّغ عن حسابك انت.',
    reportDetailsLabel: 'حصل إيه؟',
    reportDetailsOptional: 'اختياري، بس بيساعدنا نراجع أسرع.',
    reportPrivacyNote: 'بلاغك سري. الطرف التاني مش بيعرف مين اللي بلّغ.',

    // Categories
    categoryFraud: 'نصب',
    categoryImpersonation: 'انتحال شخصية',
    categoryAbusiveLanguage: 'ألفاظ مسيئة',
    categoryHarassment: 'تحرش أو مضايقة',
    categoryDiscrimination: 'تمييز',
    categoryFakeProfile: 'حساب مزيف',
    categoryFakeDocuments: 'مستندات مزيفة',
    categoryFakeCertificates: 'شهادات مزيفة',
    categorySpam: 'رسايل مزعجة',
    categoryScam: 'محاولة نصب',
    categoryDangerousBehavior: 'تصرف خطر',
    categoryOffPlatformPayment: 'طلب دفع بره وارشة',
    categoryOffPlatformContact: 'طلب تواصل بره وارشة',
    categoryIllegalActivity: 'نشاط غير قانوني',
    categoryInappropriateContent: 'محتوى غير لائق',
    categoryCopyright: 'حقوق ملكية',
    categoryPrivacy: 'خصوصية',

    // Report status
    statusSubmitted: 'اتستلم',
    statusTriage: 'بيتصنّف',
    statusInvestigating: 'تحت المراجعة',
    statusActioned: 'اتاخد إجراء',
    statusDismissed: 'اتقفل من غير إجراء',
    statusDuplicate: 'متبلّغ عنه قبل كده',

    // Trust levels
    levelGoodStanding: 'حسابك تمام',
    levelWarned: 'وصلك تنبيه',
    levelRestricted: 'في مميزات محدودة دلوقتي',
    levelUnderInvestigation: 'حسابك بيتراجع',
    levelSuspended: 'حسابك موقوف',
    levelBanned: 'حسابك اتقفل',

    // Restrictions
    restrictionMarketplaceRemoved: 'مش بتظهر في السوق دلوقتي.',
    restrictionProfileHidden: 'ملفك مخفي دلوقتي.',
    restrictionPaymentHold: 'الدفع موقوف لحد ما نراجع.',
    restrictionWithdrawalHold: 'السحب موقوف لحد ما نراجع.',
    restrictionCommunication: 'الرسايل محدودة دلوقتي.',
    restrictionReview: 'كتابة التقييمات محدودة دلوقتي.',
    restrictionUntil: 'ده ساري لحد',
    restrictionNoAccusation: 'المراجعة ما تعنيش إنك عملت حاجة غلط.',

    // Appeals
    appealTitle: 'اطلب مننا نراجع القرار',
    appealSubtitle: 'قول لنا أي حاجة لازم نعرفها. حد من الفريق بيراجع كل طلب.',
    appealStatementLabel: 'توضيحك',
    appealSubmitted: 'استلمنا طلب المراجعة',
    appealUnderReview: 'طلبك بيتراجع',
    appealUpheld: 'القرار الأصلي فضل زي ما هو',
    appealOverturned: 'القرار اتلغى',
    appealPartiallyOverturned: 'القرار اتعدّل جزئيًا',
    appealWithdrawn: 'الطلب اتسحب',
    appealAlreadySubmitted: 'انت طلبت مراجعة للقرار ده قبل كده.',
    appealNotAvailable: 'القرار ده مش قابل للمراجعة.',
    appealPrivacyNote: 'طلبك بيشوفه فريق المراجعة بس.',

    // Accessibility labels
    a11yReportStatus: 'حالة البلاغ',
    a11yTrustStatus: 'حالة الحساب',
    a11yAppealStatus: 'حالة طلب المراجعة',
    a11yRestrictionActive: 'قيد نشط',
    a11yRestrictionCleared: 'القيد اتشال',
    a11yOpenReportForm: 'افتح نموذج البلاغ',
    a11ySubmitReport: 'إرسال البلاغ',
    a11ySubmitAppeal: 'إرسال طلب المراجعة',
  },
} as const;

export type TrustSafetyCopyKey = keyof typeof trustSafetyCopy.en;
