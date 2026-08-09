import { translations, type Language } from '../i18n/translations.ts';
import type { ProviderDraft } from './provider-types.ts';

export const STORED_PROFESSION_PREFIX = 'profession:';

/**
 * WPS-025 worker identity taxonomy. Existing marketplace category IDs are
 * reused where the concepts are equivalent; the profession key remains the
 * finer-grained, language-independent identity.
 */
export const professions = [
  { key: 'acRepair', categoryId: 'ac', en: 'Air-conditioning technician', ar: 'فني تكييف' },
  { key: 'aluminumWorker', categoryId: 'general-maintenance', en: 'Aluminum worker', ar: 'فني ألوميتال' },
  { key: 'applianceRepair', categoryId: 'appliance-repair', en: 'Appliance technician', ar: 'فني أجهزة منزلية' },
  { key: 'carpentry', categoryId: 'carpentry', en: 'Carpenter', ar: 'نجار' },
  { key: 'cleaning', categoryId: 'cleaning', en: 'Cleaner', ar: 'عامل نظافة' },
  { key: 'constructionWorker', categoryId: 'general-maintenance', en: 'Construction worker', ar: 'عامل بناء' },
  { key: 'electrical', categoryId: 'electrical', en: 'Electrician', ar: 'كهربائي' },
  { key: 'flooringSpecialist', categoryId: 'general-maintenance', en: 'Flooring specialist', ar: 'فني أرضيات' },
  { key: 'furnitureMaker', categoryId: 'carpentry', en: 'Furniture maker', ar: 'صانع أثاث' },
  { key: 'furnitureRepairer', categoryId: 'carpentry', en: 'Furniture repairer', ar: 'فني تصليح أثاث' },
  { key: 'gardener', categoryId: 'general-maintenance', en: 'Gardener', ar: 'بستاني' },
  { key: 'generalMaintenance', categoryId: 'general-maintenance', en: 'General home-maintenance technician', ar: 'فني صيانة منزلية عامة' },
  { key: 'glassWorker', categoryId: 'general-maintenance', en: 'Glass worker', ar: 'فني زجاج' },
  { key: 'gypsumWorker', categoryId: 'general-maintenance', en: 'Gypsum worker', ar: 'فني جبس' },
  { key: 'handyman', categoryId: 'general-maintenance', en: 'Handyman', ar: 'فني صيانة متعدد المهارات' },
  { key: 'homeElectronicsTechnician', categoryId: 'appliance-repair', en: 'Home electronics technician', ar: 'فني إلكترونيات منزلية' },
  { key: 'interiorDecorator', categoryId: 'painting', en: 'Interior decorator', ar: 'مصمم ديكور داخلي' },
  { key: 'landscaper', categoryId: 'general-maintenance', en: 'Landscaper', ar: 'منسق حدائق' },
  { key: 'locksmith', categoryId: 'general-maintenance', en: 'Locksmith', ar: 'فني أقفال' },
  { key: 'mason', categoryId: 'general-maintenance', en: 'Mason', ar: 'بنّاء' },
  { key: 'movingHelp', categoryId: 'moving-help', en: 'Mover', ar: 'عامل نقل أثاث' },
  { key: 'painting', categoryId: 'painting', en: 'Painter', ar: 'نقاش' },
  { key: 'pestControlWorker', categoryId: 'cleaning', en: 'Pest-control worker', ar: 'فني مكافحة حشرات' },
  { key: 'plumbing', categoryId: 'plumbing', en: 'Plumber', ar: 'سباك' },
  { key: 'poolTechnician', categoryId: 'plumbing', en: 'Pool technician', ar: 'فني حمامات سباحة' },
  { key: 'renovationWorker', categoryId: 'general-maintenance', en: 'Renovation worker', ar: 'فني تجديدات' },
  { key: 'securitySystemTechnician', categoryId: 'electrical', en: 'Security-system technician', ar: 'فني أنظمة أمن' },
  { key: 'smartHomeTechnician', categoryId: 'electrical', en: 'Smart-home technician', ar: 'فني منازل ذكية' },
  { key: 'tiler', categoryId: 'general-maintenance', en: 'Tiler', ar: 'مبلط' },
  { key: 'upholsterer', categoryId: 'carpentry', en: 'Upholsterer', ar: 'منجد' },
  { key: 'welder', categoryId: 'general-maintenance', en: 'Welder', ar: 'لحام' },
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
