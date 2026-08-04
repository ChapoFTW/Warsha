import type {
  HelpArticle,
  HelpArticleSummary,
  HelpAudience,
  HelpCategorySummary,
  SupportCaseDetail,
  SupportLocale,
  SupportMacro,
  SupportResolutionReason,
  SupportSlaEntry,
} from './support-types';

/**
 * WPS-019 Mock support state.
 *
 * Mock performs no network call and never falls back to Supabase. Every account
 * key gets its own cases, its own attachments, its own search history, and its
 * own article feedback, so one account can never observe another.
 *
 * Parity, stated precisely: Mock carries the SAME twelve categories and the
 * SAME twenty-nine article slugs as the seeded database, in both English and
 * Egyptian Arabic, with the same surface and tag metadata driving the same
 * context-aware ordering. Article BODIES are abbreviated — Mock exists to
 * exercise the flows, and shipping a second copy of the prose would guarantee
 * the two drift apart. Every field the UI reads is present in both modes.
 */

type MockCategory = {
  categoryKey: string;
  icon: string;
  audience: HelpAudience;
  surfaces: string[];
  sortOrder: number;
  title: Record<SupportLocale, string>;
  summary: Record<SupportLocale, string>;
};

type MockArticle = {
  slug: string;
  categoryKey: string;
  audience: HelpAudience;
  surfaces: string[];
  tags: string[];
  related: string[];
  sortOrder: number;
  title: Record<SupportLocale, string>;
  summary: Record<SupportLocale, string>;
};

export const mockHelpCategories: MockCategory[] = [
  { categoryKey: 'getting_started', icon: 'rocket-launch', audience: 'all', surfaces: ['onboarding', 'help_center'], sortOrder: 10,
    title: { en: 'Getting started', ar: 'البداية' },
    summary: { en: 'How Warsha works, and what to expect the first time.', ar: 'وارشة بتشتغل إزاي، وإيه اللي تتوقعه أول مرة.' } },
  { categoryKey: 'booking_help', icon: 'event-note', audience: 'customer', surfaces: ['booking', 'help_center'], sortOrder: 20,
    title: { en: 'Bookings', ar: 'الحجوزات' },
    summary: { en: 'Booking a worker, tracking the job, and changing your plans.', ar: 'إزاي تحجز صنايعي، وتتابع الشغل، وتغيّر مواعيدك.' } },
  { categoryKey: 'payment_help', icon: 'payments', audience: 'all', surfaces: ['payment', 'help_center'], sortOrder: 30,
    title: { en: 'Payments', ar: 'الدفع' },
    summary: { en: 'What you pay, when you pay it, and how refunds work.', ar: 'بتدفع كام، وإمتى، والاسترجاع بيشتغل إزاي.' } },
  { categoryKey: 'worker_help', icon: 'handyman', audience: 'customer', surfaces: ['help_center', 'marketplace'], sortOrder: 40,
    title: { en: 'Choosing a worker', ar: 'اختيار الصنايعي' },
    summary: { en: 'Comparing quotes, reading profiles, and what verification means.', ar: 'مقارنة العروض، وقراءة الملفات، ويعني إيه صنايعي موثّق.' } },
  { categoryKey: 'dispute_help', icon: 'gavel', audience: 'all', surfaces: ['dispute', 'help_center'], sortOrder: 50,
    title: { en: 'When something goes wrong', ar: 'لما حاجة تبوظ' },
    summary: { en: 'Reporting a problem with a job and how a dispute is decided.', ar: 'إزاي تبلّغ عن مشكلة في الشغل، والنزاع بيتحل إزاي.' } },
  { categoryKey: 'verification_help', icon: 'verified-user', audience: 'worker', surfaces: ['verification', 'help_center'], sortOrder: 60,
    title: { en: 'Verification', ar: 'التوثيق' },
    summary: { en: 'What Warsha checks, which documents are needed, and how long it takes.', ar: 'وارشة بتراجع إيه، وإيه المستندات المطلوبة، وبتاخد قد إيه.' } },
  { categoryKey: 'account_help', icon: 'manage-accounts', audience: 'all', surfaces: ['settings', 'account', 'help_center'], sortOrder: 70,
    title: { en: 'Your account', ar: 'حسابك' },
    summary: { en: 'Signing in, changing your details, and keeping the account safe.', ar: 'تسجيل الدخول، وتغيير بياناتك، وحماية حسابك.' } },
  { categoryKey: 'notification_help', icon: 'notifications', audience: 'all', surfaces: ['notification', 'settings', 'help_center'], sortOrder: 80,
    title: { en: 'Notifications', ar: 'الإشعارات' },
    summary: { en: 'Choosing what Warsha tells you about, and quiet hours.', ar: 'تختار وارشة تبلّغك بإيه، وساعات الهدوء.' } },
  { categoryKey: 'chat_help', icon: 'forum', audience: 'all', surfaces: ['chat', 'help_center'], sortOrder: 90,
    title: { en: 'Messages', ar: 'الرسائل' },
    summary: { en: 'Talking to the other side of a booking, safely.', ar: 'الكلام مع الطرف التاني في الحجز، بأمان.' } },
  { categoryKey: 'review_help', icon: 'star-rate', audience: 'all', surfaces: ['review', 'help_center'], sortOrder: 100,
    title: { en: 'Reviews', ar: 'التقييمات' },
    summary: { en: 'Leaving a review, editing it, and how ratings are calculated.', ar: 'إزاي تكتب تقييم، وتعدّله، والتقييمات بتتحسب إزاي.' } },
  { categoryKey: 'trust_help', icon: 'shield', audience: 'all', surfaces: ['help_center', 'settings'], sortOrder: 110,
    title: { en: 'Trust and safety', ar: 'الأمان والثقة' },
    summary: { en: 'Staying safe, spotting a scam, and reporting abuse.', ar: 'إزاي تفضل بأمان، وتكتشف النصب، وتبلّغ عن إساءة.' } },
  { categoryKey: 'worker_earnings_help', icon: 'account-balance-wallet', audience: 'worker', surfaces: ['earnings', 'portfolio', 'help_center'], sortOrder: 120,
    title: { en: 'Working on Warsha', ar: 'الشغل على وارشة' },
    summary: { en: 'Quotes, your profile, your portfolio, and getting paid.', ar: 'العروض، وملفك، وأعمالك، وفلوسك.' } },
];

export const mockHelpArticles: MockArticle[] = [
  { slug: 'how-warsha-works', categoryKey: 'getting_started', audience: 'all', surfaces: ['onboarding', 'help_center'], tags: ['start', 'basics', 'how'], related: ['how-to-book', 'how-payments-work'], sortOrder: 10,
    title: { en: 'How Warsha works', ar: 'وارشة بتشتغل إزاي' },
    summary: { en: 'Describe the job, compare quotes from independent workers, and pay a fair price.', ar: 'اوصف الشغلانة، قارن العروض من الصنايعية، وادفع سعر عادل.' } },
  { slug: 'getting-started-worker', categoryKey: 'getting_started', audience: 'worker', surfaces: ['onboarding', 'portfolio'], tags: ['worker', 'start', 'onboarding'], related: ['worker-verification', 'quote-guidance'], sortOrder: 20,
    title: { en: 'Getting started as a worker', ar: 'تبدأ إزاي كصنايعي' },
    summary: { en: 'Create your profile, get verified, and start receiving job requests.', ar: 'اعمل ملفك، وثّق حسابك، وابدأ تستقبل طلبات شغل.' } },
  { slug: 'how-to-book', categoryKey: 'booking_help', audience: 'customer', surfaces: ['booking', 'marketplace', 'help_center'], tags: ['booking', 'request', 'quote'], related: ['booking-statuses', 'cancel-a-booking'], sortOrder: 10,
    title: { en: 'How to book a worker', ar: 'إزاي تحجز صنايعي' },
    summary: { en: 'Describe the job once, then compare the quotes that come back.', ar: 'اوصف الشغلانة مرة واحدة، وبعدين قارن العروض اللي هتيجي.' } },
  { slug: 'booking-statuses', categoryKey: 'booking_help', audience: 'all', surfaces: ['booking', 'notification'], tags: ['status', 'tracking', 'booking'], related: ['how-to-book', 'worker-did-not-arrive'], sortOrder: 20,
    title: { en: 'What each booking status means', ar: 'كل حالة حجز معناها إيه' },
    summary: { en: 'From confirmed to completed, and what you can do at each step.', ar: 'من التأكيد لحد الانتهاء، وتقدر تعمل إيه في كل خطوة.' } },
  { slug: 'cancel-a-booking', categoryKey: 'booking_help', audience: 'customer', surfaces: ['booking', 'settings'], tags: ['cancel', 'reschedule', 'booking'], related: ['how-to-book', 'refunds'], sortOrder: 30,
    title: { en: 'Cancelling or rescheduling', ar: 'الإلغاء أو تغيير الميعاد' },
    summary: { en: 'What happens when plans change, and when a fee applies.', ar: 'بيحصل إيه لما الظروف تتغير، والرسوم بتنطبق إمتى.' } },
  { slug: 'worker-did-not-arrive', categoryKey: 'booking_help', audience: 'customer', surfaces: ['booking', 'dispute'], tags: ['no-show', 'late', 'booking'], related: ['open-a-dispute', 'booking-statuses'], sortOrder: 40,
    title: { en: 'The worker did not arrive', ar: 'الصنايعي مجاش' },
    summary: { en: 'What to do about a no-show, and how it affects the worker.', ar: 'تعمل إيه لو محدش جه، وده بيأثر إزاي على الصنايعي.' } },
  { slug: 'how-payments-work', categoryKey: 'payment_help', audience: 'all', surfaces: ['payment', 'booking'], tags: ['payment', 'cash', 'price'], related: ['refunds', 'extra-work-approval'], sortOrder: 10,
    title: { en: 'How payments work', ar: 'الدفع بيشتغل إزاي' },
    summary: { en: 'You pay the agreed price. Warsha takes its commission from the worker, not from you.', ar: 'انت بتدفع السعر المتفق عليه. وارشة بتاخد عمولتها من الصنايعي، مش منك.' } },
  { slug: 'refunds', categoryKey: 'payment_help', audience: 'customer', surfaces: ['payment', 'dispute'], tags: ['refund', 'money-back', 'payment'], related: ['how-payments-work', 'open-a-dispute'], sortOrder: 20,
    title: { en: 'Refunds', ar: 'استرجاع الفلوس' },
    summary: { en: 'When money comes back, and how long it takes.', ar: 'الفلوس بترجع إمتى، وبتاخد قد إيه.' } },
  { slug: 'extra-work-approval', categoryKey: 'payment_help', audience: 'all', surfaces: ['payment', 'booking'], tags: ['extra', 'change', 'price'], related: ['how-payments-work', 'how-to-book'], sortOrder: 30,
    title: { en: 'When the job needs extra work', ar: 'لما الشغلانة تحتاج شغل زيادة' },
    summary: { en: 'A price change needs your approval before the work continues.', ar: 'تعديل السعر لازم موافقتك قبل ما الشغل يكمّل.' } },
  { slug: 'choosing-a-worker', categoryKey: 'worker_help', audience: 'customer', surfaces: ['marketplace', 'help_center'], tags: ['quote', 'compare', 'choose'], related: ['what-verified-means', 'how-reviews-work'], sortOrder: 10,
    title: { en: 'Choosing between quotes', ar: 'تختار بين العروض إزاي' },
    summary: { en: 'Price matters, but it is not the only thing to look at.', ar: 'السعر مهم، بس مش الحاجة الوحيدة اللي تبص عليها.' } },
  { slug: 'what-verified-means', categoryKey: 'worker_help', audience: 'all', surfaces: ['marketplace', 'verification'], tags: ['verified', 'trust', 'badge'], related: ['choosing-a-worker', 'staying-safe'], sortOrder: 20,
    title: { en: 'What the verified badge means', ar: 'علامة التوثيق معناها إيه' },
    summary: { en: 'A person at Warsha checked the worker’s identity documents.', ar: 'حد في وارشة راجع مستندات هوية الصنايعي.' } },
  { slug: 'open-a-dispute', categoryKey: 'dispute_help', audience: 'all', surfaces: ['dispute', 'booking'], tags: ['dispute', 'problem', 'complaint'], related: ['how-a-dispute-is-decided', 'refunds'], sortOrder: 10,
    title: { en: 'Opening a dispute', ar: 'فتح نزاع' },
    summary: { en: 'For a real problem with the job itself, not a general question.', ar: 'للمشاكل الحقيقية في الشغل نفسه، مش للأسئلة العامة.' } },
  { slug: 'how-a-dispute-is-decided', categoryKey: 'dispute_help', audience: 'all', surfaces: ['dispute'], tags: ['dispute', 'evidence', 'decision'], related: ['open-a-dispute', 'report-abuse'], sortOrder: 20,
    title: { en: 'How a dispute is decided', ar: 'النزاع بيتحل إزاي' },
    summary: { en: 'Both sides explain, evidence is reviewed, and a person decides.', ar: 'الطرفين بيشرحوا، والأدلة بتتراجع، وحد بيقرر.' } },
  { slug: 'worker-verification', categoryKey: 'verification_help', audience: 'worker', surfaces: ['verification', 'onboarding'], tags: ['verification', 'id', 'documents'], related: ['verification-documents', 'getting-started-worker'], sortOrder: 10,
    title: { en: 'Getting verified', ar: 'توثيق حسابك' },
    summary: { en: 'What Warsha checks and how long it takes.', ar: 'وارشة بتراجع إيه، وبياخد قد إيه.' } },
  { slug: 'verification-documents', categoryKey: 'verification_help', audience: 'worker', surfaces: ['verification'], tags: ['documents', 'id', 'photo'], related: ['worker-verification', 'skill-certificates'], sortOrder: 20,
    title: { en: 'Which documents to send', ar: 'المستندات المطلوبة' },
    summary: { en: 'A clear national ID, front and back.', ar: 'بطاقة شخصية واضحة، وش وضهر.' } },
  { slug: 'skill-certificates', categoryKey: 'verification_help', audience: 'worker', surfaces: ['verification', 'portfolio'], tags: ['certificate', 'skill', 'badge'], related: ['verification-documents', 'portfolio-guidance'], sortOrder: 30,
    title: { en: 'Skill certificates', ar: 'شهادات المهارة' },
    summary: { en: 'Optional proof of training in a specific trade.', ar: 'إثبات اختياري لتدريب في صنعة معينة.' } },
  { slug: 'signing-in', categoryKey: 'account_help', audience: 'all', surfaces: ['account', 'settings'], tags: ['login', 'password', 'otp'], related: ['account-security', 'change-your-phone-number'], sortOrder: 10,
    title: { en: 'Signing in', ar: 'تسجيل الدخول' },
    summary: { en: 'Customers use email and password. Workers use a phone number.', ar: 'الزباين بإيميل وباسورد. الصنايعية برقم التليفون.' } },
  { slug: 'account-security', categoryKey: 'account_help', audience: 'all', surfaces: ['account', 'settings'], tags: ['security', 'password', 'safety'], related: ['signing-in', 'staying-safe'], sortOrder: 20,
    title: { en: 'Keeping your account safe', ar: 'حماية حسابك' },
    summary: { en: 'Warsha will never ask you for your password or your code.', ar: 'وارشة عمرها ما هتطلب منك الباسورد ولا الكود.' } },
  { slug: 'change-your-phone-number', categoryKey: 'account_help', audience: 'all', surfaces: ['account', 'settings'], tags: ['phone', 'number', 'otp'], related: ['signing-in', 'account-security'], sortOrder: 30,
    title: { en: 'Changing your phone number', ar: 'تغيير رقم تليفونك' },
    summary: { en: 'Verify the new number before the old one stops working.', ar: 'أكّد الرقم الجديد قبل ما القديم يبطّل.' } },
  { slug: 'notification-settings', categoryKey: 'notification_help', audience: 'all', surfaces: ['notification', 'settings'], tags: ['notifications', 'quiet', 'alerts'], related: ['booking-statuses'], sortOrder: 10,
    title: { en: 'Choosing your notifications', ar: 'تختار إشعاراتك' },
    summary: { en: 'Turn categories on or off, and set quiet hours.', ar: 'شغّل أو اقفل الأقسام، واظبط ساعات الهدوء.' } },
  { slug: 'booking-chat-rules', categoryKey: 'chat_help', audience: 'all', surfaces: ['chat', 'booking'], tags: ['chat', 'message', 'contact'], related: ['staying-safe', 'report-abuse'], sortOrder: 10,
    title: { en: 'Messaging safely', ar: 'الرسايل بأمان' },
    summary: { en: 'The chat opens with the booking and keeps a record for both of you.', ar: 'الشات بيتفتح مع الحجز وبيحتفظ بسجل ليكم الاتنين.' } },
  { slug: 'how-reviews-work', categoryKey: 'review_help', audience: 'all', surfaces: ['review', 'booking'], tags: ['review', 'rating', 'stars'], related: ['editing-your-review', 'choosing-a-worker'], sortOrder: 10,
    title: { en: 'How reviews work', ar: 'التقييمات بتشتغل إزاي' },
    summary: { en: 'Only a real completed booking can be reviewed.', ar: 'الحجز الحقيقي اللي خلص هو بس اللي يتقيّم.' } },
  { slug: 'editing-your-review', categoryKey: 'review_help', audience: 'all', surfaces: ['review'], tags: ['review', 'edit', 'change'], related: ['how-reviews-work'], sortOrder: 20,
    title: { en: 'Editing or removing a review', ar: 'تعديل أو حذف تقييم' },
    summary: { en: 'You have a short window to change your mind.', ar: 'عندك وقت قصير تغيّر رأيك فيه.' } },
  { slug: 'staying-safe', categoryKey: 'trust_help', audience: 'all', surfaces: ['help_center', 'settings', 'chat'], tags: ['safety', 'scam', 'fraud'], related: ['report-abuse', 'account-security'], sortOrder: 10,
    title: { en: 'Staying safe', ar: 'خليك بأمان' },
    summary: { en: 'The common scams, and the one rule that stops all of them.', ar: 'أشهر طرق النصب، والقاعدة الواحدة اللي بتوقّفها كلها.' } },
  { slug: 'report-abuse', categoryKey: 'trust_help', audience: 'all', surfaces: ['help_center', 'chat', 'review'], tags: ['report', 'abuse', 'block'], related: ['staying-safe', 'open-a-dispute'], sortOrder: 20,
    title: { en: 'Reporting abuse', ar: 'التبليغ عن إساءة' },
    summary: { en: 'One report form, wherever you saw the problem.', ar: 'استمارة تبليغ واحدة، من أي مكان شفت فيه المشكلة.' } },
  { slug: 'quote-guidance', categoryKey: 'worker_earnings_help', audience: 'worker', surfaces: ['marketplace', 'earnings'], tags: ['quote', 'price', 'win'], related: ['getting-started-worker', 'portfolio-guidance'], sortOrder: 10,
    title: { en: 'Writing a quote that wins', ar: 'تكتب عرض يكسب إزاي' },
    summary: { en: 'Be quick, be specific, and price it honestly.', ar: 'كن سريع، وواضح، وسعّر بأمانة.' } },
  { slug: 'portfolio-guidance', categoryKey: 'worker_earnings_help', audience: 'worker', surfaces: ['portfolio'], tags: ['portfolio', 'photos', 'profile'], related: ['quote-guidance', 'skill-certificates'], sortOrder: 20,
    title: { en: 'Building your portfolio', ar: 'تبني معرض أعمالك' },
    summary: { en: 'Photographs of finished work are what customers actually look at.', ar: 'صور الشغل اللي خلص هي اللي الزباين بيبصوا عليها فعلًا.' } },
  { slug: 'getting-paid', categoryKey: 'worker_earnings_help', audience: 'worker', surfaces: ['earnings', 'payment'], tags: ['earnings', 'payout', 'withdraw'], related: ['withdrawal-guidance', 'how-payments-work'], sortOrder: 30,
    title: { en: 'Getting paid', ar: 'فلوسك بتوصلك إزاي' },
    summary: { en: 'How your earnings are calculated and when they become available.', ar: 'أرباحك بتتحسب إزاي وبتبقى متاحة إمتى.' } },
  { slug: 'withdrawal-guidance', categoryKey: 'worker_earnings_help', audience: 'worker', surfaces: ['earnings'], tags: ['withdraw', 'payout', 'wallet'], related: ['getting-paid'], sortOrder: 40,
    title: { en: 'Withdrawing your earnings', ar: 'سحب أرباحك' },
    summary: { en: 'The minimum amount, and what to check before you request.', ar: 'الحد الأدنى، وإيه اللي تراجعه قبل ما تطلب.' } },
];

/**
 * Mock bodies are deliberately short and say so. Shipping a second copy of the
 * seeded prose would guarantee the two drift apart silently.
 */
const bodyNote: Record<SupportLocale, string> = {
  en: 'This is the Mock copy of the article. The full text is served from the knowledge base in Supabase mode.',
  ar: 'ده نص المقال في وضع المحاكاة. النص الكامل بييجي من قاعدة المعرفة في وضع Supabase.',
};

export function mockArticleBody(article: MockArticle, locale: SupportLocale): string {
  return `${article.summary[locale]}\n\n${bodyNote[locale]}`;
}

export const mockSupportMacros: SupportMacro[] = [
  { macroKey: 'ack_en', category: 'other', locale: 'en', title: 'Acknowledge',
    body: 'Thanks for contacting Warsha. We have your case and someone is looking at it now.', suggestedResolution: null },
  { macroKey: 'ack_ar', category: 'other', locale: 'ar', title: 'استلام الطلب',
    body: 'شكرًا لتواصلك مع وارشة. حالتك وصلتنا وفيه حد بيراجعها دلوقتي.', suggestedResolution: null },
  { macroKey: 'payment_pending_en', category: 'payment_question', locale: 'en', title: 'Payment still pending',
    body: 'A cash payment is confirmed by the worker after the job. Reply with the booking date and we will check the ledger entry.', suggestedResolution: 'answered' },
  { macroKey: 'payment_pending_ar', category: 'payment_question', locale: 'ar', title: 'الدفع لسه معلق',
    body: 'الدفع كاش بيتأكد من الصنايعي بعد ما الشغل يخلص. ابعتلنا تاريخ الحجز وإحنا هنراجع القيد.', suggestedResolution: 'answered' },
  { macroKey: 'closing_en', category: 'other', locale: 'en', title: 'Closing the case',
    body: 'We are marking this case resolved. If anything is still open, reply here within fourteen days.', suggestedResolution: 'answered' },
  { macroKey: 'closing_ar', category: 'other', locale: 'ar', title: 'قفل الحالة',
    body: 'إحنا بنقفل الحالة دي كمحلولة. لو لسه فيه حاجة ناقصة، رد هنا خلال أربعتاشر يوم.', suggestedResolution: 'answered' },
];

export const mockResolutionReasons: Record<SupportLocale, SupportResolutionReason[]> = {
  en: [
    { reasonKey: 'answered', label: 'Question answered', requiresNote: false },
    { reasonKey: 'guided_to_article', label: 'Guided to a help article', requiresNote: false },
    { reasonKey: 'fixed_by_warsha', label: 'Fixed by Warsha', requiresNote: true },
    { reasonKey: 'resolved_by_participant', label: 'Resolved by the requester', requiresNote: false },
    { reasonKey: 'escalated_elsewhere', label: 'Escalated to the owning team', requiresNote: true },
    { reasonKey: 'duplicate', label: 'Duplicate of another case', requiresNote: false },
    { reasonKey: 'no_response', label: 'No response from the requester', requiresNote: false },
    { reasonKey: 'out_of_scope', label: 'Outside Warsha support', requiresNote: true },
  ],
  ar: [
    { reasonKey: 'answered', label: 'تم الرد على السؤال', requiresNote: false },
    { reasonKey: 'guided_to_article', label: 'تم توجيه العميل لمقال المساعدة', requiresNote: false },
    { reasonKey: 'fixed_by_warsha', label: 'تم الحل من وارشة', requiresNote: true },
    { reasonKey: 'resolved_by_participant', label: 'اتحل من صاحب الطلب', requiresNote: false },
    { reasonKey: 'escalated_elsewhere', label: 'تم تحويله للفريق المختص', requiresNote: true },
    { reasonKey: 'duplicate', label: 'مكرر مع حالة تانية', requiresNote: false },
    { reasonKey: 'no_response', label: 'مفيش رد من صاحب الطلب', requiresNote: false },
    { reasonKey: 'out_of_scope', label: 'خارج نطاق دعم وارشة', requiresNote: true },
  ],
};

export const mockSlaPolicy: SupportSlaEntry[] = [
  { priority: 'urgent', firstResponseHours: 2, resolutionHours: 24 },
  { priority: 'high', firstResponseHours: 6, resolutionHours: 48 },
  { priority: 'normal', firstResponseHours: 24, resolutionHours: 96 },
  { priority: 'low', firstResponseHours: 48, resolutionHours: 168 },
];

/** Per-account state. Nothing is shared between account keys. */
export type MockSupportAccount = {
  cases: SupportCaseDetail[];
  searches: { query: string; at: number }[];
  feedback: Record<string, boolean>;
  articleViews: Record<string, number>;
};

const accounts = new Map<string, MockSupportAccount>();

export function mockAccount(accountKey: string): MockSupportAccount {
  let account = accounts.get(accountKey);
  if (!account) {
    account = { cases: [], searches: [], feedback: {}, articleViews: {} };
    accounts.set(accountKey, account);
  }
  return account;
}

export function resetMockSupportState() {
  accounts.clear();
}

export function mockCategorySummaries(locale: SupportLocale): HelpCategorySummary[] {
  return [...mockHelpCategories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(category => ({
      categoryKey: category.categoryKey,
      title: category.title[locale],
      summary: category.summary[locale],
      icon: category.icon,
      audience: category.audience,
      surfaces: category.surfaces,
      articleCount: mockHelpArticles.filter(a => a.categoryKey === category.categoryKey).length,
    }));
}

export function mockArticleSummary(article: MockArticle, locale: SupportLocale): HelpArticleSummary {
  return {
    slug: article.slug,
    categoryKey: article.categoryKey,
    title: article.title[locale],
    summary: article.summary[locale],
    tags: article.tags,
  };
}

export function mockArticleDetail(
  article: MockArticle,
  locale: SupportLocale,
  account: MockSupportAccount,
): HelpArticle {
  const related = article.related
    .map(slug => mockHelpArticles.find(a => a.slug === slug))
    .filter((a): a is MockArticle => Boolean(a))
    .map(a => mockArticleSummary(a, locale));
  return {
    slug: article.slug,
    categoryKey: article.categoryKey,
    status: 'published',
    locale,
    version: 1,
    title: article.title[locale],
    summary: article.summary[locale],
    body: mockArticleBody(article, locale),
    tags: article.tags,
    audience: article.audience,
    updatedAt: new Date(0).toISOString(),
    helpfulCount: 0,
    notHelpfulCount: 0,
    myFeedback: account.feedback[article.slug] ?? null,
    related,
  };
}
