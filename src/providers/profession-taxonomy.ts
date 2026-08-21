import { translations, type Language } from '../i18n/translations.ts';
import type { ProviderDraft } from './provider-types.ts';

export const STORED_PROFESSION_PREFIX = 'profession:';

/**
 * WPS-025 worker identity taxonomy. Existing marketplace category IDs are
 * reused where the concepts are equivalent; the profession key remains the
 * finer-grained, language-independent identity.
 */
export const professions = [
  { key: 'acRepair', categoryId: 'ac', en: 'Air-conditioning technician', ar: 'فني تكييف', fr: 'Technicien en climatisation' },
  { key: 'aluminumWorker', categoryId: 'general-maintenance', en: 'Aluminum worker', ar: 'فني ألوميتال', fr: 'Menuisier aluminium' },
  { key: 'applianceRepair', categoryId: 'appliance-repair', en: 'Appliance technician', ar: 'فني أجهزة منزلية', fr: "Technicien en électroménager" },
  { key: 'carpentry', categoryId: 'carpentry', en: 'Carpenter', ar: 'نجار', fr: 'Menuisier' },
  { key: 'cleaning', categoryId: 'cleaning', en: 'Cleaner', ar: 'عامل نظافة', fr: 'Agent de nettoyage' },
  { key: 'constructionWorker', categoryId: 'general-maintenance', en: 'Construction worker', ar: 'عامل بناء', fr: 'Ouvrier du bâtiment' },
  { key: 'electrical', categoryId: 'electrical', en: 'Electrician', ar: 'كهربائي', fr: 'Électricien' },
  { key: 'flooringSpecialist', categoryId: 'general-maintenance', en: 'Flooring specialist', ar: 'فني أرضيات', fr: 'Spécialiste des revêtements de sol' },
  { key: 'furnitureMaker', categoryId: 'carpentry', en: 'Furniture maker', ar: 'صانع أثاث', fr: 'Fabricant de meubles' },
  { key: 'furnitureRepairer', categoryId: 'carpentry', en: 'Furniture repairer', ar: 'فني تصليح أثاث', fr: 'Réparateur de meubles' },
  { key: 'gardener', categoryId: 'general-maintenance', en: 'Gardener', ar: 'بستاني', fr: 'Jardinier' },
  { key: 'generalMaintenance', categoryId: 'general-maintenance', en: 'General home-maintenance technician', ar: 'فني صيانة منزلية عامة', fr: 'Technicien de maintenance générale' },
  { key: 'glassWorker', categoryId: 'general-maintenance', en: 'Glass worker', ar: 'فني زجاج', fr: 'Vitrier' },
  { key: 'gypsumWorker', categoryId: 'general-maintenance', en: 'Gypsum worker', ar: 'فني جبس', fr: 'Plâtrier' },
  { key: 'handyman', categoryId: 'general-maintenance', en: 'Handyman', ar: 'فني صيانة متعدد المهارات', fr: 'Agent de maintenance polyvalent' },
  { key: 'homeElectronicsTechnician', categoryId: 'appliance-repair', en: 'Home electronics technician', ar: 'فني إلكترونيات منزلية', fr: 'Technicien en électronique domestique' },
  { key: 'interiorDecorator', categoryId: 'painting', en: 'Interior decorator', ar: 'مصمم ديكور داخلي', fr: "Décorateur d'intérieur" },
  { key: 'landscaper', categoryId: 'general-maintenance', en: 'Landscaper', ar: 'منسق حدائق', fr: 'Paysagiste' },
  { key: 'locksmith', categoryId: 'general-maintenance', en: 'Locksmith', ar: 'فني أقفال', fr: 'Serrurier' },
  { key: 'mason', categoryId: 'general-maintenance', en: 'Mason', ar: 'بنّاء', fr: 'Maçon' },
  { key: 'movingHelp', categoryId: 'moving-help', en: 'Mover', ar: 'عامل نقل أثاث', fr: 'Déménageur' },
  { key: 'painting', categoryId: 'painting', en: 'Painter', ar: 'نقاش', fr: 'Peintre' },
  { key: 'pestControlWorker', categoryId: 'cleaning', en: 'Pest-control worker', ar: 'فني مكافحة حشرات', fr: 'Technicien en désinsectisation' },
  { key: 'plumbing', categoryId: 'plumbing', en: 'Plumber', ar: 'سباك', fr: 'Plombier' },
  { key: 'poolTechnician', categoryId: 'plumbing', en: 'Pool technician', ar: 'فني حمامات سباحة', fr: 'Technicien de piscine' },
  { key: 'renovationWorker', categoryId: 'general-maintenance', en: 'Renovation worker', ar: 'فني تجديدات', fr: 'Ouvrier en rénovation' },
  { key: 'securitySystemTechnician', categoryId: 'electrical', en: 'Security-system technician', ar: 'فني أنظمة أمن', fr: 'Technicien en systèmes de sécurité' },
  { key: 'smartHomeTechnician', categoryId: 'electrical', en: 'Smart-home technician', ar: 'فني منازل ذكية', fr: 'Technicien en maison connectée' },
  { key: 'tiler', categoryId: 'general-maintenance', en: 'Tiler', ar: 'مبلط', fr: 'Carreleur' },
  { key: 'upholsterer', categoryId: 'carpentry', en: 'Upholsterer', ar: 'منجد', fr: 'Tapissier' },
  { key: 'welder', categoryId: 'general-maintenance', en: 'Welder', ar: 'لحام', fr: 'Soudeur' },
] as const;

export type ProfessionKey = (typeof professions)[number]['key'];
export type ProfessionOption = (typeof professions)[number];

const professionByKey = new Map<string, ProfessionOption>(
  professions.map(profession => [profession.key, profession]),
);

export function isProfessionKey(value: string): value is ProfessionKey {
  return professionByKey.has(value);
}

export function professionLabel(key: string, language: Language): string {
  const profession = professionByKey.get(key);
  const legacy = (translations[language] as Record<string, unknown>)[key];
  return profession?.[language] ?? (typeof legacy === 'string' ? legacy : key);
}

export function listProfessions(language: Language, query = ''): ProfessionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(language);
  return [...professions]
    .filter(profession => !normalizedQuery
      || profession[language].toLocaleLowerCase(language).includes(normalizedQuery))
    .sort((left, right) => left[language].localeCompare(right[language], language));
}

export function selectedProfessionKeys(value: Pick<ProviderDraft, 'profession' | 'specialties'>): ProfessionKey[] {
  const stored = value.specialties
    .filter(item => item.startsWith(STORED_PROFESSION_PREFIX))
    .map(item => item.slice(STORED_PROFESSION_PREFIX.length));
  return [...new Set([value.profession, ...stored].filter(isProfessionKey))];
}

export function withSelectedProfessions(value: ProviderDraft, keys: ProfessionKey[]): ProviderDraft {
  const selected = [...new Set(keys)].slice(0, 10);
  const legacySpecialties = value.specialties
    .filter(item => !item.startsWith(STORED_PROFESSION_PREFIX))
    .slice(0, Math.max(0, 10 - selected.length));
  const selectedCategoryIds: string[] = [];
  for (const key of selected) {
    const categoryId = professionByKey.get(key)?.categoryId;
    if (categoryId) selectedCategoryIds.push(categoryId);
  }
  const categoryIds = [...new Set([...value.categoryIds, ...selectedCategoryIds])].slice(0, 10);
  return {
    ...value,
    profession: selected[0] ?? '',
    specialties: [
      ...selected.map(key => `${STORED_PROFESSION_PREFIX}${key}`),
      ...legacySpecialties,
    ],
    categoryIds,
  };
}

export function publicSpecialties(values: string[]): string[] {
  return values.filter(value => !value.startsWith(STORED_PROFESSION_PREFIX));
}
