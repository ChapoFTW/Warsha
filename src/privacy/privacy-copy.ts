/**
 * WPS-022 bilingual copy.
 *
 * Import-free so the regression suite can execute it under Node and assert
 * that every key exists in both languages.
 *
 * Four rules shape every string below, and each exists because the opposite is
 * the industry norm.
 *
 *   1. DELETION IS NOT HIDDEN AND NOT PUNISHED. No guilt, no "are you sure you
 *      want to lose everything", no repeated confirmation, no instruction to
 *      contact support for an ordinary request.
 *   2. NOTHING CLAIMS TO BE IMMEDIATE OR TOTAL. Processing takes time and some
 *      records lawfully remain, so the copy says both plainly rather than
 *      promising an erasure that will not happen.
 *   3. BLOCKED MEANS BLOCKED, WITH A REASON THE PERSON CAN ACT ON. And it
 *      names nobody: not the other party, not a reporter, not a staff member.
 *   4. NO INTERNAL VOCABULARY. No table names, no "PII", no "data subject",
 *      no "processing basis". Someone reading this on a phone in a stairwell
 *      should understand it.
 */

export type PrivacyLanguage = 'en' | 'ar';

export const privacyCopy = {
  en: {
    privacyTitle: 'Privacy',
    privacySubtitle: 'What Warsha stores about you, and what you can do about it.',
    unavailableTitle: 'Privacy controls are not open yet',
    unavailableBody: 'This will open soon. Nothing is needed from you now.',

    storedTitle: 'What we store',
    storedBody: 'Warsha keeps these kinds of information about your account.',
    storedExportable: 'Included in your data copy',
    storedNotExportable: 'Not included in your data copy',

    consentTitle: 'Your choices',
    consentRequired: 'Needed to use Warsha',
    consentOptional: 'Optional',
    consentOn: 'On',
    consentOff: 'Off',
    consentAgreed: 'Agreed',
    consentRequiredNote: 'Agreeing to the terms is not agreement to anything optional below.',
    consentChanged: 'Saved.',
    consentFailed: 'That could not be saved. Try again.',

    historyTitle: 'Search and viewing history',
    historyBody: 'Recent searches and workers you looked at. Clearing them cannot be undone.',
    clearSearches: 'Clear recent searches',
    clearViews: 'Clear recently viewed',
    clearAll: 'Clear both',
    historyCleared: 'Cleared.',
    historyEmpty: 'Nothing stored.',

    exportTitle: 'Get a copy of your data',
    exportBody: 'We prepare a file with the information Warsha holds about your account.',
    exportRequest: 'Request a copy',
    exportPreparing: 'Being prepared',
    exportPreparingNote: 'This takes a little while. We will tell you when it is ready.',
    exportReady: 'Ready to download',
    exportExpired: 'Expired',
    exportFailed: 'Could not be prepared',
    exportCancelled: 'Cancelled',
    exportExpiresIn: 'Available for',
    exportHours: 'hours',
    exportOnePending: 'One copy is already being prepared.',
    exportContains: 'What is in it',
    exportExcludes: 'What is not in it',
    exportRows: 'entries',
    exportEmpty: 'You have not asked for a copy yet.',

    deactivateTitle: 'Take a break',
    deactivateBody: 'Hides your profile and stops new work reaching you. Nothing is deleted, and you can come back by signing in.',
    deactivateAction: 'Deactivate my account',
    reactivateAction: 'Reactivate my account',
    deactivated: 'Your account is deactivated.',
    deactivateDiffers: 'This is not deletion. Nothing is removed.',

    deleteTitle: 'Delete my account',
    deleteBody: 'Removes your name, photo, contact details and history from Warsha.',
    deleteAction: 'Request deletion',
    deleteConfirmTitle: 'Delete your Warsha account?',
    deleteConfirmBody: 'We will remove your personal information. Some records have to stay, and they are listed below.',
    deleteConfirmAction: 'Yes, delete my account',
    deleteCancelAction: 'Not now',
    deleteWhatGoes: 'What is removed',
    deleteWhatStays: 'What has to stay',
    deleteGoesName: 'Your name, photo, phone number and addresses',
    deleteGoesProfile: 'Your public worker profile, if you have one',
    deleteGoesHistory: 'Your searches, viewing history and saved workers',
    deleteGoesDevices: 'Your devices stop receiving notifications',
    deleteStaysBookings: 'Bookings you shared with someone else, so their record stays complete',
    deleteStaysMoney: 'Payment and earnings records, which Warsha must keep',
    deleteStaysReviews: 'Reviews you wrote, shown under a neutral name',
    deleteStaysSafety: 'Safety records, if any exist',
    deleteNotInstant: 'This is not instant. Processing takes time after the waiting period ends.',
    deleteNotTotal: 'Warsha cannot erase every record. The list above is what stays and why.',

    deleteRequested: 'Deletion requested',
    deleteWaiting: 'Your account will be deleted after the waiting period.',
    deleteWaitingIn: 'Time left',
    deleteHours: 'hours',
    deleteCancel: 'Cancel this request',
    deleteCancelled: 'Your deletion request was cancelled.',
    deleteProcessing: 'Your request is being processed and can no longer be cancelled.',
    deleteCompleted: 'Your personal information has been removed.',
    deleteFailedState: 'Something went wrong. Contact support and we will finish it.',

    blockedTitle: 'We cannot start this yet',
    blockedBody: 'Finish the following, then request deletion again.',
    blockedActiveBooking: 'You have a booking that is still going on.',
    blockedOpenDispute: 'You have a dispute that is still open.',
    blockedUnsettledPayment: 'You have a payment that has not settled.',
    blockedOutstandingEarnings: 'You have earnings Warsha has not paid you yet.',
    blockedActivePayout: 'You have a payout being processed.',
    blockedOpenChargeback: 'There is a payment being investigated with your bank.',
    blockedOpenSupportCase: 'You have a support case that is still open.',
    blockedActiveEnforcement: 'There is a restriction on your account.',
    blockedLegalHold: 'We have to keep your information for now. We cannot say more, and nothing you do will change it. Support can help if you have questions.',
    blockedStillCancellable: 'You can withdraw this request at any time.',

    articlesTitle: 'Read more',
    articlePrivacy: 'How Warsha handles your information',
    articleDeletion: 'What happens when you delete your account',

    errorGeneric: 'Something went wrong. Try again.',
    retry: 'Try again',
    close: 'Close',
    currency: 'EGP',
  },
  ar: {
    privacyTitle: 'الخصوصية',
    privacySubtitle: 'ورشة بتحتفظ بإيه عنك، وإنت تقدر تعمل إيه.',
    unavailableTitle: 'إعدادات الخصوصية لسه مقفولة',
    unavailableBody: 'هتفتح قريب. مش محتاجين منك حاجة دلوقتي.',

    storedTitle: 'إحنا بنحتفظ بإيه',
    storedBody: 'ورشة بتحتفظ بالأنواع دي من المعلومات عن حسابك.',
    storedExportable: 'موجود في نسخة بياناتك',
    storedNotExportable: 'مش موجود في نسخة بياناتك',

    consentTitle: 'اختياراتك',
    consentRequired: 'ضروري عشان تستخدم ورشة',
    consentOptional: 'اختياري',
    consentOn: 'مفتوح',
    consentOff: 'مقفول',
    consentAgreed: 'موافق',
    consentRequiredNote: 'موافقتك على الشروط مش موافقة على أي حاجة اختيارية تحت.',
    consentChanged: 'اتحفظ.',
    consentFailed: 'مقدرناش نحفظ ده. جرّب تاني.',

    historyTitle: 'سجل البحث والمشاهدة',
    historyBody: 'آخر عمليات بحث والصنايعية اللي بصيت عليهم. المسح مش هيتراجع فيه.',
    clearSearches: 'امسح آخر عمليات البحث',
    clearViews: 'امسح اللي شوفته مؤخراً',
    clearAll: 'امسح الاتنين',
    historyCleared: 'اتمسح.',
    historyEmpty: 'مفيش حاجة محفوظة.',

    exportTitle: 'خد نسخة من بياناتك',
    exportBody: 'بنجهّزلك ملف بالمعلومات اللي ورشة محتفظة بيها عن حسابك.',
    exportRequest: 'اطلب نسخة',
    exportPreparing: 'بيتجهّز',
    exportPreparingNote: 'ده بياخد شوية وقت. هنقولك لما يجهز.',
    exportReady: 'جاهز للتحميل',
    exportExpired: 'انتهت صلاحيته',
    exportFailed: 'مقدرناش نجهّزه',
    exportCancelled: 'اتلغى',
    exportExpiresIn: 'متاح لمدة',
    exportHours: 'ساعة',
    exportOnePending: 'في نسخة بتتجهّز بالفعل.',
    exportContains: 'إيه اللي جواه',
    exportExcludes: 'إيه اللي مش جواه',
    exportRows: 'عنصر',
    exportEmpty: 'لسه مطلبتش نسخة.',

    deactivateTitle: 'خد راحة',
    deactivateBody: 'بنخفي ملفك وبنوقف وصول شغل جديد ليك. مش بنمسح أي حاجة، وتقدر ترجع بتسجيل الدخول.',
    deactivateAction: 'أوقف حسابي مؤقتاً',
    reactivateAction: 'رجّع حسابي',
    deactivated: 'حسابك موقوف مؤقتاً.',
    deactivateDiffers: 'ده مش حذف. مفيش حاجة بتتشال.',

    deleteTitle: 'احذف حسابي',
    deleteBody: 'بيشيل اسمك وصورتك وبيانات التواصل والسجل بتاعك من ورشة.',
    deleteAction: 'اطلب الحذف',
    deleteConfirmTitle: 'تحذف حسابك في ورشة؟',
    deleteConfirmBody: 'هنشيل معلوماتك الشخصية. في سجلات لازم تفضل، وهي مكتوبة تحت.',
    deleteConfirmAction: 'أيوه، احذف حسابي',
    deleteCancelAction: 'مش دلوقتي',
    deleteWhatGoes: 'اللي بيتشال',
    deleteWhatStays: 'اللي لازم يفضل',
    deleteGoesName: 'اسمك وصورتك ورقم تليفونك وعناوينك',
    deleteGoesProfile: 'ملفك كصنايعي، لو عندك واحد',
    deleteGoesHistory: 'عمليات البحث وسجل المشاهدة والصنايعية المحفوظين',
    deleteGoesDevices: 'أجهزتك هتبطل تستقبل إشعارات',
    deleteStaysBookings: 'الحجوزات اللي بينك وبين حد تاني، عشان سجله يفضل كامل',
    deleteStaysMoney: 'سجلات الدفع والأرباح، وده لازم ورشة تحتفظ بيه',
    deleteStaysReviews: 'التقييمات اللي كتبتها، وهتظهر باسم محايد',
    deleteStaysSafety: 'سجلات الأمان، لو في',
    deleteNotInstant: 'ده مش فوري. التنفيذ بياخد وقت بعد ما فترة الانتظار تخلص.',
    deleteNotTotal: 'ورشة مش قادرة تمسح كل سجل. اللي فوق هو اللي بيفضل وليه.',

    deleteRequested: 'طلب الحذف اتسجل',
    deleteWaiting: 'حسابك هيتحذف بعد فترة الانتظار.',
    deleteWaitingIn: 'الوقت المتبقي',
    deleteHours: 'ساعة',
    deleteCancel: 'الغِ الطلب ده',
    deleteCancelled: 'طلب الحذف بتاعك اتلغى.',
    deleteProcessing: 'طلبك بيتنفذ دلوقتي ومش ممكن يتلغى.',
    deleteCompleted: 'معلوماتك الشخصية اتشالت.',
    deleteFailedState: 'حصلت مشكلة. كلّم الدعم وإحنا هنكمّلها.',

    blockedTitle: 'مش قادرين نبدأ دلوقتي',
    blockedBody: 'خلّص الحاجات دي، وبعدين اطلب الحذف تاني.',
    blockedActiveBooking: 'عندك حجز لسه شغال.',
    blockedOpenDispute: 'عندك نزاع لسه مفتوح.',
    blockedUnsettledPayment: 'عندك دفعة لسه ما اتسوّتش.',
    blockedOutstandingEarnings: 'عندك أرباح ورشة لسه مدفعتهالكش.',
    blockedActivePayout: 'عندك تحويل بيتنفذ دلوقتي.',
    blockedOpenChargeback: 'في دفعة بيتم مراجعتها مع البنك.',
    blockedOpenSupportCase: 'عندك طلب دعم لسه مفتوح.',
    blockedActiveEnforcement: 'في قيد على حسابك.',
    blockedLegalHold: 'لازم نحتفظ بمعلوماتك دلوقتي. مش هنقدر نقول أكتر من كده، ومفيش حاجة تعملها هتغيّر ده. الدعم موجود لو عندك أسئلة.',
    blockedStillCancellable: 'تقدر تسحب الطلب ده في أي وقت.',

    articlesTitle: 'اقرا أكتر',
    articlePrivacy: 'ورشة بتتعامل إزاي مع معلوماتك',
    articleDeletion: 'بيحصل إيه لما تحذف حسابك',

    errorGeneric: 'حصلت مشكلة. جرّب تاني.',
    retry: 'جرّب تاني',
    close: 'اقفل',
    currency: 'جنيه',
  },
} as const;

export type PrivacyCopyKey = keyof (typeof privacyCopy)['en'];
