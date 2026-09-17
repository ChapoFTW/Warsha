import { useLocalization } from '@/src/i18n/localization';

/**
 * What the app says about an account restriction. The web says the same things
 * in `web/lib/app-copy.ts` (`standing*`); the wording is kept in step by hand
 * and checked by `scripts/wps016-trust-safety.test.mts`.
 */
const copy = {
  en: {
    title: 'Account status',
    goodStanding: 'Your account is in good standing. Nothing restricts what you can do.',
    loadFailed: 'Your account status could not be loaded.',
    retry: 'Try again',
    hidden: 'Your profile is hidden. Customers cannot find you or invite you to new work. Jobs and conversations you already have continue.',
    suspended: 'Your account is suspended. You cannot post requests, book, quote, accept new work, start conversations or write reviews. Jobs already under way can still be finished and talked about.',
    removed: 'Your account has been removed from the marketplace. You cannot use the marketplace or contact other people. You can still see your history, appeal, contact support, manage your privacy and cancel a job.',
    communication: 'You cannot start conversations before a booking. Conversations about a job under way continue.',
    reviews: 'You cannot write reviews, reply to them or vote on them.',
    reason: 'Reason given',
    until: 'Until',
    appeal_submitted: 'Your appeal has been sent. A person will review it.',
    appeal_under_review: 'Your appeal is being reviewed.',
    appeal_upheld: 'Your appeal was reviewed and the decision stands.',
    appeal_overturned: 'Your appeal was accepted.',
    appeal_partially_overturned: 'Your appeal was partly accepted.',
    appeal_withdrawn: 'Your appeal was withdrawn.',
    appealLabel: 'Appeal this decision',
    appealHint: 'Explain what happened in your own words, in at least 10 characters. You can appeal once.',
    appealFailed: 'Your appeal could not be sent. Try again.',
    appealSend: 'Send appeal',
    support: 'Support can still help with anything about your account.',
    supportLink: 'Contact support',
    restrictedTitle: 'Account restricted',
    restrictedBody: 'Your account is restricted, so this cannot be done right now. Account status says why and how to appeal.',
    restrictedOpen: 'Account status',
    close: 'Close',
    counterpartyUnavailable: 'The other person cannot take part right now.',
  },
  ar: {
    title: 'حالة الحساب',
    goodStanding: 'حسابك سليم. مفيش حاجة مانعاك من أي حاجة.',
    loadFailed: 'مقدرناش نحمّل حالة حسابك.',
    retry: 'حاول تاني',
    hidden: 'ملفك مخفي. العملاء مش هيلاقوك ومش هيبعتولك شغل جديد. الشغل والمحادثات اللي عندك بتكمل عادي.',
    suspended: 'حسابك موقوف. مش هتقدر تطلب أو تحجز أو تبعت عرض سعر أو تقبل شغل جديد أو تبدأ محادثة أو تكتب تقييم. الشغل اللي شغّال بالفعل تقدر تخلّصه وتتكلم فيه.',
    removed: 'حسابك اتشال من السوق. مش هتقدر تستخدم السوق أو تتواصل مع حد. لسه تقدر تشوف سجلك وتتظلّم وتكلم الدعم وتتحكم في خصوصيتك وتلغي شغل.',
    communication: 'مش هتقدر تبدأ محادثة قبل الحجز. المحادثات عن شغل شغّال بتكمل.',
    reviews: 'مش هتقدر تكتب تقييمات أو ترد عليها أو تصوّت عليها.',
    reason: 'السبب',
    until: 'لحد',
    appeal_submitted: 'تظلّمك اتبعت. شخص هيراجعه.',
    appeal_under_review: 'تظلّمك بيتراجع.',
    appeal_upheld: 'تظلّمك اتراجع والقرار زي ما هو.',
    appeal_overturned: 'تظلّمك اتقبل.',
    appeal_partially_overturned: 'تظلّمك اتقبل جزء منه.',
    appeal_withdrawn: 'تظلّمك اتسحب.',
    appealLabel: 'اتظلّم من القرار',
    appealHint: 'اشرح اللي حصل بكلامك، في عشر حروف على الأقل. تقدر تتظلّم مرة واحدة.',
    appealFailed: 'مقدرناش نبعت تظلّمك. حاول تاني.',
    appealSend: 'ابعت التظلّم',
    support: 'الدعم لسه يقدر يساعدك في أي حاجة تخص حسابك.',
    supportLink: 'كلّم الدعم',
    restrictedTitle: 'حسابك عليه قيود',
    restrictedBody: 'حسابك عليه قيود، فمش هينفع تعمل ده دلوقتي. حالة الحساب بتقول السبب وإزاي تتظلّم.',
    restrictedOpen: 'حالة الحساب',
    close: 'إغلاق',
    counterpartyUnavailable: 'الطرف التاني مش متاح دلوقتي.',
  },
  fr: {
    title: 'État du compte',
    goodStanding: 'Votre compte est en règle. Rien ne limite ce que vous pouvez faire.',
    loadFailed: 'L’état de votre compte n’a pas pu être chargé.',
    retry: 'Réessayer',
    hidden: 'Votre profil est masqué. Les clients ne peuvent pas vous trouver ni vous inviter à de nouveaux travaux. Vos travaux et conversations en cours continuent.',
    suspended: 'Votre compte est suspendu. Vous ne pouvez pas publier de demande, réserver, envoyer de devis, accepter de nouveau travail, commencer une conversation ni laisser d’avis. Les travaux déjà en cours peuvent être terminés et discutés.',
    removed: 'Votre compte a été retiré de la place de marché. Vous ne pouvez plus l’utiliser ni contacter d’autres personnes. Vous pouvez toujours consulter votre historique, faire appel, contacter le support, gérer votre confidentialité et annuler un travail.',
    communication: 'Vous ne pouvez pas commencer de conversation avant une réservation. Les conversations sur un travail en cours continuent.',
    reviews: 'Vous ne pouvez pas écrire d’avis, y répondre ni voter.',
    reason: 'Motif indiqué',
    until: 'Jusqu’au',
    appeal_submitted: 'Votre appel a été envoyé. Une personne l’examinera.',
    appeal_under_review: 'Votre appel est en cours d’examen.',
    appeal_upheld: 'Votre appel a été examiné et la décision est maintenue.',
    appeal_overturned: 'Votre appel a été accepté.',
    appeal_partially_overturned: 'Votre appel a été accepté en partie.',
    appeal_withdrawn: 'Votre appel a été retiré.',
    appealLabel: 'Faire appel de cette décision',
    appealHint: 'Expliquez ce qui s’est passé avec vos mots, en au moins 10 caractères. Vous pouvez faire appel une seule fois.',
    appealFailed: 'Votre appel n’a pas pu être envoyé. Réessayez.',
    appealSend: 'Envoyer l’appel',
    support: 'Le support peut toujours vous aider pour tout ce qui concerne votre compte.',
    supportLink: 'Contacter le support',
    restrictedTitle: 'Compte restreint',
    restrictedBody: 'Votre compte fait l’objet d’une restriction : cette action n’est pas possible pour le moment. L’état du compte en indique la raison et comment faire appel.',
    restrictedOpen: 'État du compte',
    close: 'Fermer',
    counterpartyUnavailable: 'L’autre personne ne peut pas participer pour le moment.',
  },
} as const;

export type TrustCopyKey = keyof typeof copy.en;

export function trustText(language: keyof typeof copy, key: TrustCopyKey): string {
  return copy[language][key];
}

export function useTrustText() {
  const { language } = useLocalization();
  return (key: TrustCopyKey) => copy[language][key];
}

export const trustCopy = copy;
