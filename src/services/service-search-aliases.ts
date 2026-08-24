import type { Language } from '../i18n/translations.ts';

import { SERVICE_DEMAND_ORDER, type ServiceCategoryId } from './service-catalogue.ts';

/**
 * The words a customer actually types when they want a service.
 *
 * Matching only the displayed title is why a locksmith was unreachable. Nobody
 * in Egypt searches "locksmithing" — they search `lock`, `مفتاح`, `كالون`, or
 * `serrurier`, and a title match finds none of those. Worse, the displayed
 * title is localized, so an Arabic customer typing an English word and an
 * English customer typing a French one both missed everything.
 *
 * So every category carries its own vocabulary, in all three languages, and the
 * matcher searches the union. Aliases are not translations of each other: the
 * Arabic for the aluminium trade is `ألوميتال`, a loan word with no English
 * equivalent a customer would type, and the English side carries `aluminium`,
 * `aluminum` and `window` instead. Each language gets the words its speakers
 * use, not a translation of the English list.
 *
 * These are search inputs, never displayed. Titles and descriptions live in
 * `src/i18n/translations.ts`.
 */

type AliasSet = { en: readonly string[]; ar: readonly string[]; fr: readonly string[] };

export const SERVICE_SEARCH_ALIASES: Readonly<Record<ServiceCategoryId, AliasSet>> = {
  plumbing: {
    en: ['plumber', 'plumbing', 'leak', 'pipe', 'tap', 'faucet', 'drain', 'toilet', 'sink'],
    ar: ['سباك', 'سباكة', 'تسريب', 'ماسورة', 'حنفية', 'صرف', 'مواسير', 'تسليك'],
    fr: ['plombier', 'plomberie', 'fuite', 'tuyau', 'robinet', 'canalisation'],
  },
  electrical: {
    en: ['electrician', 'electrical', 'wiring', 'socket', 'switch', 'power', 'lighting', 'breaker'],
    ar: ['كهربائي', 'كهرباء', 'أسلاك', 'بريزة', 'مفتاح نور', 'إنارة', 'قاطع'],
    fr: ['électricien', 'électricité', 'câblage', 'prise', 'interrupteur', 'éclairage'],
  },
  cleaning: {
    en: ['cleaning', 'cleaner', 'deep clean', 'housekeeping', 'maid', 'carpet', 'sofa'],
    ar: ['تنظيف', 'نظافة', 'شغالة', 'تنظيف عميق', 'سجاد', 'كنب', 'غسيل'],
    fr: ['nettoyage', 'ménage', 'femme de ménage', 'tapis', 'canapé'],
  },
  ac: {
    en: ['ac', 'air conditioner', 'air conditioning', 'aircon', 'cooling', 'freon', 'split'],
    ar: ['تكييف', 'مكيف', 'تبريد', 'فريون', 'سبليت', 'صيانة تكييف'],
    fr: ['climatisation', 'climatiseur', 'clim', 'froid'],
  },
  'appliance-repair': {
    en: ['appliance', 'washing machine', 'fridge', 'refrigerator', 'oven', 'dishwasher', 'dryer'],
    ar: ['أجهزة', 'غسالة', 'تلاجة', 'فرن', 'بوتاجاز', 'ديب فريزر', 'أطباق'],
    fr: ['électroménager', 'lave-linge', 'réfrigérateur', 'four', 'lave-vaisselle'],
  },
  carpentry: {
    en: ['carpenter', 'carpentry', 'wood', 'door', 'furniture', 'shelf', 'cabinet', 'kitchen'],
    ar: ['نجار', 'نجارة', 'خشب', 'باب', 'أثاث', 'رف', 'دولاب', 'مطبخ'],
    fr: ['menuisier', 'menuiserie', 'bois', 'porte', 'meuble', 'étagère'],
  },
  painting: {
    en: ['painter', 'painting', 'paint', 'wall', 'decor', 'wallpaper'],
    ar: ['نقاش', 'نقاشة', 'دهان', 'دهانات', 'حائط', 'ورق حائط'],
    fr: ['peintre', 'peinture', 'mur', 'papier peint'],
  },
  'moving-help': {
    en: ['moving', 'mover', 'removal', 'relocate', 'transport', 'furniture moving'],
    ar: ['نقل', 'نقل عفش', 'ونش', 'ترحيل', 'شيالين'],
    fr: ['déménagement', 'déménageur', 'transport de meubles'],
  },
  'pest-control': {
    en: ['pest', 'pest control', 'cockroach', 'bedbug', 'insects', 'rodent', 'rat', 'mice', 'termite'],
    ar: ['مكافحة حشرات', 'حشرات', 'صراصير', 'بق', 'فئران', 'رش', 'نمل', 'أرضة'],
    fr: ['désinsectisation', 'nuisibles', 'cafards', 'punaises', 'rongeurs', 'dératisation'],
  },
  'water-heater-repair': {
    en: ['water heater', 'heater', 'boiler', 'geyser', 'hot water'],
    ar: ['سخان', 'سخانات', 'سخان غاز', 'سخان كهربا', 'مية سخنة'],
    fr: ['chauffe-eau', 'chaudière', 'eau chaude'],
  },
  'flooring-tiling': {
    en: ['tiles', 'tiling', 'tiler', 'flooring', 'floor', 'ceramic', 'porcelain', 'marble', 'parquet'],
    ar: ['بلاط', 'سيراميك', 'أرضيات', 'رخام', 'بورسلين', 'باركيه', 'مبلط'],
    fr: ['carrelage', 'carreleur', 'sol', 'céramique', 'marbre', 'parquet'],
  },
  'renovation-finishing': {
    en: ['renovation', 'finishing', 'plaster', 'gypsum', 'drywall', 'mason', 'masonry', 'remodel'],
    ar: ['تشطيب', 'تشطيبات', 'ترميم', 'محارة', 'جبس', 'جبس بورد', 'بناء', 'مباني'],
    fr: ['rénovation', 'finitions', 'plâtre', 'placo', 'maçonnerie'],
  },
  // The category is called Alumetal, which is what the trade is called in
  // Egypt. That is a loan word, so the aliases carry the descriptive terms the
  // name no longer does -- somebody who does not know the word still has to
  // find it by typing "aluminium window" or "شباك".
  alumetal: {
    en: ['alumetal', 'aluminium', 'aluminum', 'window', 'windows', 'door', 'doors',
      'glazing', 'glass', 'shutter'],
    ar: ['ألوميتال', 'الوميتال', 'ألومنيوم', 'شباك', 'شبابيك', 'أبواب', 'باب ألوميتال',
      'زجاج', 'سكريتة', 'قطاعات'],
    fr: ['alumetal', 'aluminium', 'fenêtre', 'fenêtres', 'porte', 'portes',
      'menuiserie aluminium', 'vitrage', 'vitrier', 'volet'],
  },
  'satellite-tv-installation': {
    en: ['satellite', 'dish', 'tv', 'television', 'receiver', 'antenna', 'signal'],
    ar: ['دش', 'ستالايت', 'تلفزيون', 'ريسيفر', 'هوائي', 'إشارة'],
    fr: ['satellite', 'parabole', 'télévision', 'récepteur', 'antenne'],
  },
  locksmithing: {
    en: ['lock', 'locks', 'key', 'keys', 'locksmith', 'locked out', 'door lock', 'safe'],
    ar: ['قفل', 'أقفال', 'مفتاح', 'مفاتيح', 'كالون', 'فتح باب', 'خزنة'],
    fr: ['serrure', 'serrurier', 'serrurerie', 'clé', 'clés', 'porte bloquée'],
  },
  gardening: {
    en: ['garden', 'gardening', 'gardener', 'plants', 'landscaping', 'pruning', 'lawn'],
    ar: ['حديقة', 'جنينة', 'زراعة', 'نباتات', 'تنسيق حدائق', 'تقليم', 'بستاني'],
    fr: ['jardin', 'jardinage', 'jardinier', 'plantes', 'paysagiste', 'taille'],
  },
  barber: {
    en: ['barber', 'haircut', 'shave', 'beard', 'grooming', 'trim'],
    ar: ['حلاق', 'حلاقة', 'قص شعر', 'دقن', 'ذقن', 'حلاقة رجالي'],
    fr: ['barbier', 'coupe de cheveux', 'rasage', 'barbe'],
  },
  hairdressing: {
    en: ['hairdresser', 'hairdressing', 'hair', 'salon', 'colour', 'color', 'blow dry', 'styling'],
    ar: ['كوافير', 'كوافيرة', 'شعر', 'صبغة', 'سشوار', 'تصفيف'],
    fr: ['coiffure', 'coiffeur', 'coiffeuse', 'cheveux', 'coloration', 'brushing'],
  },
  'personal-styling': {
    en: ['stylist', 'styling', 'wardrobe', 'outfit', 'fashion', 'image consultant'],
    ar: ['ستايلست', 'تنسيق ملابس', 'إطلالة', 'دولاب', 'أزياء'],
    fr: ['styliste', 'conseil en image', 'garde-robe', 'tenue', 'mode'],
  },
};

/**
 * Folded for comparison.
 *
 * Arabic is normalised the same way the location matcher does it -- alif and
 * hamza forms, ta marbuta and alif maqsura all vary by keyboard and by habit,
 * and a customer typing `الوميتال` must reach the category spelled
 * `ألوميتال`. Latin accents are stripped for the same reason: `desinsectisation`
 * has to find `désinsectisation`, because most people do not reach for the
 * accent when searching.
 */
export function foldSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[ً-ْـٰٓ-ٕ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every term for a category, across all three languages, folded. */
export function searchTermsFor(categoryId: ServiceCategoryId): string[] {
  const set = SERVICE_SEARCH_ALIASES[categoryId];
  return [...set.en, ...set.ar, ...set.fr].map(foldSearchTerm);
}

/**
 * The categories a query matches, in catalogue order.
 *
 * Deliberately language-agnostic: a query is matched against every language's
 * vocabulary, not just the one the interface happens to be in. Somebody with an
 * Arabic phone typing `ac` gets air conditioning, and so does somebody with an
 * English phone typing `تكييف`.
 *
 * Matching is word-aware rather than substring-anywhere. A term matches when it
 * equals the query, when one of its words starts with the query, or when a
 * longer query contains the whole term -- so `lock` finds `door lock` and
 * `locksmith`, while `ac` finds air conditioning without also finding
 * `appliance`, `cockroach` and `placo`, which is exactly what a naive
 * substring test did.
 *
 * Order is the catalogue's, so a query matching several categories presents
 * them the same way everything else does.
 */
function termMatches(term: string, folded: string): boolean {
  if (term === folded) return true;
  if (folded.length >= term.length && folded.includes(term)) return true;
  return term.split(' ').some((word) => word.startsWith(folded));
}

export function matchServiceCategories(
  query: string,
  _language?: Language,
): ServiceCategoryId[] {
  const folded = foldSearchTerm(query);
  if (folded.length < 2) return [];
  return SERVICE_DEMAND_ORDER.filter((id) =>
    searchTermsFor(id).some((term) => termMatches(term, folded)));
}
