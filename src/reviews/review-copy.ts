import type { SupportedLanguage } from '../i18n/language-preference.ts';

/**
 * What Warsha says about reviews, in every language, for every surface.
 *
 * The phone read this through a React Native hook and the web had nothing, so
 * the web could not say a word about reviews without inventing a second set of
 * them. It lives here, free of any platform, and both read it: the phone
 * through `useReviewText`, the web through `reviewText`.
 *
 * French once said different things from English and Arabic in places — that
 * a reply "stays in the history" rather than that it cannot be changed, that
 * the reputation summary proves reviews come from confirmed jobs rather than
 * that it does not change ranking, and nothing about the photo limits. It now
 * says what they say.
 */
const copy = {
  en: {
    rateService: 'Rate this service', editReview: 'Edit your review', editUntil: 'You can edit until', editClosed: 'The edit period has ended.',
    overall: 'Overall', professionalism: 'Professionalism', quality: 'Quality', punctuality: 'Punctuality', communication: 'Communication', value: 'Value',
    comment: 'Tell customers what went well or what could improve (optional)', photos: 'Add work photos', photoRules: 'JPG, PNG, or WebP. Up to 4 photos, 5 MB each.',
    anonymous: 'Show as Customer', submit: 'Publish review', saveChanges: 'Save changes', submitted: 'Your verified review is published.', verifiedBooking: 'Verified completed booking',
    reviews: 'Reviews', reputation: 'Reputation', noReviews: 'No verified reviews yet.', loadError: 'Could not load reviews.', tryAgain: 'Try again',
    newest: 'Newest', highestRated: 'Highest rated', lowestRated: 'Lowest rated', mostHelpful: 'Most helpful', sortReviews: 'Sort reviews',
    helpful: 'Helpful', notHelpful: 'Not helpful', report: 'Report review', reportReason: 'Why are you reporting this review?', spam: 'Spam', abuse: 'Abuse', fakeReview: 'Fake review', offensiveContent: 'Offensive content', reportDetails: 'Add details (optional)', sendReport: 'Send report', reportSent: 'Report sent for staff review.',
    providerReply: 'Professional reply', immutableReply: 'Replies cannot be changed after publishing.',
    averageRating: 'Average rating', completedJobs: 'Completed jobs', responseRate: 'Response rate', completionRate: 'Completion rate', repeatCustomers: 'Repeat customers', yearsOnPlatform: 'Years on Warsha', unavailable: 'Not enough data',
    ratingBreakdown: 'Rating breakdown', ratingDistribution: 'Overall rating distribution', confidence: 'Reputation confidence', confidenceHelp: 'A rule-based evidence summary. It does not change marketplace ranking.',
    identityVerified: 'Identity Verified', skillVerified: 'Skill Certificate Verified', professionalVerified: 'Professional Certificate Verified', topRated: 'Top Rated', fastResponder: 'Fast Responder', experienced: 'Experienced',
    loading: 'Loading reviews', image: 'Review photo', imageUnavailable: 'Photo unavailable', removePhoto: 'Remove photo', chooseRating: 'Choose a rating from 1 to 5 for every item.', reviewError: 'Could not save your review.', voteError: 'Could not save your vote.', reportError: 'Could not send this report.',
  },
  ar: {
    rateService: 'قيّم الخدمة', editReview: 'عدّل تقييمك', editUntil: 'تقدر تعدّل لحد', editClosed: 'مدة التعديل خلصت.',
    overall: 'التقييم العام', professionalism: 'الالتزام والاحتراف', quality: 'جودة الشغل', punctuality: 'الالتزام بالميعاد', communication: 'التواصل', value: 'القيمة مقابل السعر',
    comment: 'قول للناس إيه اللي عجبك أو محتاج يتحسن (اختياري)', photos: 'ضيف صور للشغل', photoRules: 'JPG أو PNG أو WebP. لحد ٤ صور، كل صورة ٥ ميجابايت.',
    anonymous: 'اعرض الاسم كـ عميل', submit: 'انشر التقييم', saveChanges: 'احفظ التعديل', submitted: 'تقييمك الموثق اتنشر.', verifiedBooking: 'حجز مكتمل وموثق',
    reviews: 'التقييمات', reputation: 'سمعة الصنايعي', noReviews: 'لسه مفيش تقييمات موثقة.', loadError: 'معرفناش نحمّل التقييمات.', tryAgain: 'حاول تاني',
    newest: 'الأحدث', highestRated: 'الأعلى تقييمًا', lowestRated: 'الأقل تقييمًا', mostHelpful: 'الأكثر إفادة', sortReviews: 'رتّب التقييمات',
    helpful: 'مفيد', notHelpful: 'مش مفيد', report: 'بلّغ عن التقييم', reportReason: 'بتبلّغ عن التقييم ليه؟', spam: 'محتوى مزعج', abuse: 'إساءة', fakeReview: 'تقييم مش حقيقي', offensiveContent: 'كلام مسيء', reportDetails: 'ضيف تفاصيل (اختياري)', sendReport: 'ابعت البلاغ', reportSent: 'البلاغ اتبعت لمراجعة فريق ورشة.',
    providerReply: 'رد الصنايعي', immutableReply: 'الرد مينفعش يتغيّر بعد النشر.',
    averageRating: 'متوسط التقييم', completedJobs: 'شغل مكتمل', responseRate: 'نسبة الرد', completionRate: 'نسبة إكمال الشغل', repeatCustomers: 'عملاء رجعوا تاني', yearsOnPlatform: 'سنين على ورشة', unavailable: 'لسه مفيش بيانات كفاية',
    ratingBreakdown: 'تفاصيل التقييم', ratingDistribution: 'توزيع التقييم العام', confidence: 'ثقة السمعة', confidenceHelp: 'ملخص مبني على قواعد وأدلة. مش بيغيّر ترتيب السوق.',
    identityVerified: 'الهوية موثقة', skillVerified: 'شهادة قياس المهارة موثقة', professionalVerified: 'شهادة مهنية موثقة', topRated: 'تقييم ممتاز', fastResponder: 'سريع في الرد', experienced: 'خبرة مثبتة',
    loading: 'جاري تحميل التقييمات', image: 'صورة مع التقييم', imageUnavailable: 'الصورة مش متاحة', removePhoto: 'احذف الصورة', chooseRating: 'اختار تقييم من ١ لـ ٥ لكل بند.', reviewError: 'معرفناش نحفظ تقييمك.', voteError: 'معرفناش نحفظ اختيارك.', reportError: 'معرفناش نبعت البلاغ.',
  },
} as const;

export type ReviewCopyKey = keyof typeof copy.en;
const fr: Record<ReviewCopyKey, string> = {
  rateService:'Évaluer ce service',editReview:'Modifier votre avis',editUntil:'Modifiable jusqu’au',editClosed:'La période de modification est terminée.',overall:'Note générale',professionalism:'Professionnalisme',quality:'Qualité',punctuality:'Ponctualité',communication:'Communication',value:'Rapport qualité-prix',comment:'Dites aux clients ce qui s’est bien passé ou ce qui pourrait s’améliorer (facultatif)',photos:'Photos',photoRules:'JPG, PNG ou WebP. Jusqu’à 4 photos, 5 Mo chacune.',anonymous:'Afficher mon avis sans mon nom',submit:'Envoyer l’avis',saveChanges:'Enregistrer les modifications',submitted:'Votre avis vérifié est publié.',verifiedBooking:'Travail terminé et vérifié',reviews:'Avis',reputation:'Réputation',noReviews:'Aucun avis pour le moment.',loadError:'Impossible de charger les avis.',tryAgain:'Réessayer',newest:'Plus récents',highestRated:'Mieux notés',lowestRated:'Moins bien notés',mostHelpful:'Les plus utiles',sortReviews:'Trier les avis',helpful:'Utile',notHelpful:'Pas utile',report:'Signaler',reportReason:'Pourquoi signalez-vous cet avis ?',spam:'Indésirable ou trompeur',abuse:'Abus',fakeReview:'Avis probablement faux',offensiveContent:'Contenu offensant',reportDetails:'Ajoutez des détails (facultatif)',sendReport:'Envoyer le signalement',reportSent:'Signalement envoyé à l’équipe Warsha pour examen.',providerReply:'Réponse du professionnel',immutableReply:'Une réponse ne peut plus être modifiée une fois publiée.',averageRating:'Note moyenne',completedJobs:'Travaux terminés',responseRate:'Taux de réponse',completionRate:'Taux d’achèvement',repeatCustomers:'Clients récurrents',yearsOnPlatform:'Années sur Warsha',unavailable:'Pas assez de données',ratingBreakdown:'Détail des notes',ratingDistribution:'Répartition des notes',confidence:'Fiabilité de la note',confidenceHelp:'Un résumé des éléments établi par des règles. Il ne change pas le classement sur le marché.',identityVerified:'Identité vérifiée',skillVerified:'Certificat de compétence vérifié',professionalVerified:'Certificat professionnel vérifié',topRated:'Très bien noté',fastResponder:'Réponse rapide',experienced:'Expérimenté',loading:'Chargement des avis…',image:'Photo de l’avis',imageUnavailable:'Image indisponible',removePhoto:'Supprimer la photo',chooseRating:'Choisissez une note de 1 à 5 pour chaque critère.',reviewError:'Impossible d’enregistrer l’avis.',voteError:'Impossible d’enregistrer votre choix.',reportError:'Impossible d’envoyer le signalement.'
};
export function reviewText(language: SupportedLanguage, key: ReviewCopyKey): string {
  return (language === 'fr' ? fr : copy[language])[key];
}
