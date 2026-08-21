import publicSource from './generated-public-articles.json';
import type { SupportedLanguage } from '@/src/i18n/language-preference';

export type HelpAudience = 'customer' | 'worker' | 'admin' | 'all';
export type ManualArticle = {
  id: string;
  audience: HelpAudience;
  locale: SupportedLanguage;
  title: string;
  summary: string;
  version: number;
  lastReviewedDate: string;
  features: string[];
  routes: string[];
  capabilities: string[];
  keywords: string[];
  body: string;
};

const publicArticles = publicSource.articles as ManualArticle[];

export const helpUi = {
  en: { manual: 'How to use Warsha', manualIntro: 'Practical guides based on the current Warsha product.', customerGuide: 'Customer guide', workerGuide: 'Worker guide', search: 'Search the manual', searchPlaceholder: 'Try “reset password”, “address”, or “quote”', noResults: 'No manual topics match that search.', reviewed: 'Reviewed', back: 'Back to Help', related: 'Related topics' },
  ar: { manual: 'استخدام ورشة', manualIntro: 'دليل عملي مبني على طريقة عمل ورشة الحالية.', customerGuide: 'دليل العميل', workerGuide: 'دليل الفني', search: 'دور في الدليل', searchPlaceholder: 'جرّب «كلمة السر» أو «العنوان» أو «عرض السعر»', noResults: 'مالقيناش موضوع مطابق للبحث.', reviewed: 'آخر مراجعة', back: 'الرجوع للمساعدة', related: 'مواضيع مرتبطة' },
  fr: { manual: 'Comment utiliser Warsha', manualIntro: 'Des guides pratiques basés sur le fonctionnement actuel de Warsha.', customerGuide: 'Guide client', workerGuide: 'Guide professionnel', search: 'Rechercher dans le manuel', searchPlaceholder: 'Essayez « mot de passe », « adresse » ou « devis »', noResults: 'Aucun sujet ne correspond à cette recherche.', reviewed: 'Révisé', back: 'Retour à l’aide', related: 'Sujets associés' },
} as const;

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function manualArticles(language: SupportedLanguage, audience?: Exclude<HelpAudience, 'admin' | 'all'>) {
  return publicArticles.filter(article => article.locale === language
    && (!audience || article.audience === audience || article.audience === 'all'));
}

export function searchManual(language: SupportedLanguage, query: string, audience?: Exclude<HelpAudience, 'admin' | 'all'>) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return manualArticles(language, audience);
  return manualArticles(language, audience).map(article => {
    const searchable = normalize([article.title, article.summary, ...article.keywords, article.body].join(' '));
    return { article, score: terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .map(result => result.article);
}

export function manualArticle(language: SupportedLanguage, id: string) {
  return publicArticles.find(article => article.locale === language && article.id === id) ?? null;
}

export function relatedManualArticles(article: ManualArticle, limit = 3) {
  const features = new Set(article.features);
  return publicArticles.filter(candidate => candidate.locale === article.locale
    && candidate.id !== article.id
    && (candidate.audience === article.audience || candidate.audience === 'all')
    && candidate.features.some(feature => features.has(feature))).slice(0, limit);
}
