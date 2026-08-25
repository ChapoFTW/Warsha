import { translations, type Language } from '../i18n/translations.ts';
import { byServiceDemand, isLegacyCategory } from '../services/service-catalogue.ts';
import type { ProviderDraft } from './provider-types.ts';

export const STORED_PROFESSION_PREFIX = 'profession:';

/**
 * WPS-025 worker identity taxonomy. Existing marketplace category IDs are
 * reused where the concepts are equivalent; the profession key remains the
 * finer-grained, language-independent identity.
 */
export const professions = [
  { key: 'acRepair', categoryId: 'ac', en: 'Air-conditioning technician', ar: 'فني تكييف', fr: 'Technicien en climatisation' },
  { key: 'aluminumWorker', categoryId: 'alumetal', en: 'Aluminum worker', ar: 'فني ألوميتال', fr: 'Menuisier aluminium' },
  { key: 'applianceRepair', categoryId: 'appliance-repair', en: 'Appliance technician', ar: 'فني أجهزة منزلية', fr: "Technicien en électroménager" },
  { key: 'barber', categoryId: 'barber', en: 'Barber', ar: 'حلاق', fr: 'Barbier' },
  { key: 'carpentry', categoryId: 'carpentry', en: 'Carpenter', ar: 'نجار', fr: 'Menuisier' },
  { key: 'cleaning', categoryId: 'cleaning', en: 'Cleaner', ar: 'عامل نظافة', fr: 'Agent de nettoyage' },
  { key: 'constructionWorker', categoryId: 'renovation-finishing', en: 'Construction worker', ar: 'عامل بناء', fr: 'Ouvrier du bâtiment' },
  { key: 'electrical', categoryId: 'electrical', en: 'Electrician', ar: 'كهربائي', fr: 'Électricien' },
  { key: 'flooringSpecialist', categoryId: 'flooring-tiling', en: 'Flooring specialist', ar: 'فني أرضيات', fr: 'Spécialiste des revêtements de sol' },
  { key: 'furnitureMaker', categoryId: 'carpentry', en: 'Furniture maker', ar: 'صانع أثاث', fr: 'Fabricant de meubles' },
  { key: 'furnitureRepairer', categoryId: 'carpentry', en: 'Furniture repairer', ar: 'فني تصليح أثاث', fr: 'Réparateur de meubles' },
  { key: 'gardener', categoryId: 'gardening', en: 'Gardener', ar: 'بستاني', fr: 'Jardinier' },
  { key: 'glassWorker', categoryId: 'alumetal', en: 'Glass worker', ar: 'فني زجاج', fr: 'Vitrier' },
  { key: 'gypsumWorker', categoryId: 'renovation-finishing', en: 'Gypsum worker', ar: 'فني جبس', fr: 'Plâtrier' },
  { key: 'hairdresser', categoryId: 'hairdressing', en: 'Hairdresser', ar: 'كوافير', fr: 'Coiffeur' },
  { key: 'homeElectronicsTechnician', categoryId: 'appliance-repair', en: 'Home electronics technician', ar: 'فني إلكترونيات منزلية', fr: 'Technicien en électronique domestique' },
  { key: 'interiorDecorator', categoryId: 'painting', en: 'Interior decorator', ar: 'مصمم ديكور داخلي', fr: "Décorateur d'intérieur" },
  { key: 'landscaper', categoryId: 'gardening', en: 'Landscaper', ar: 'منسق حدائق', fr: 'Paysagiste' },
  { key: 'locksmith', categoryId: 'locksmithing', en: 'Locksmith', ar: 'فني أقفال', fr: 'Serrurier' },
  { key: 'mason', categoryId: 'renovation-finishing', en: 'Mason', ar: 'بنّاء', fr: 'Maçon' },
  { key: 'movingHelp', categoryId: 'moving-help', en: 'Mover', ar: 'عامل نقل أثاث', fr: 'Déménageur' },
  { key: 'painting', categoryId: 'painting', en: 'Painter', ar: 'نقاش', fr: 'Peintre' },
  { key: 'personalStylist', categoryId: 'personal-styling', en: 'Personal stylist', ar: 'ستايلست شخصي', fr: 'Conseiller en image' },
  { key: 'pestControlWorker', categoryId: 'pest-control', en: 'Pest-control worker', ar: 'فني مكافحة حشرات', fr: 'Technicien en désinsectisation' },
  { key: 'plumbing', categoryId: 'plumbing', en: 'Plumber', ar: 'سباك', fr: 'Plombier' },
  { key: 'poolTechnician', categoryId: 'plumbing', en: 'Pool technician', ar: 'فني حمامات سباحة', fr: 'Technicien de piscine' },
  { key: 'renovationWorker', categoryId: 'renovation-finishing', en: 'Renovation worker', ar: 'فني تجديدات', fr: 'Ouvrier en rénovation' },
  { key: 'securitySystemTechnician', categoryId: 'electrical', en: 'Security-system technician', ar: 'فني أنظمة أمن', fr: 'Technicien en systèmes de sécurité' },
  { key: 'smartHomeTechnician', categoryId: 'electrical', en: 'Smart-home technician', ar: 'فني منازل ذكية', fr: 'Technicien en maison connectée' },
  { key: 'tiler', categoryId: 'flooring-tiling', en: 'Tiler', ar: 'مبلط', fr: 'Carreleur' },
  { key: 'upholsterer', categoryId: 'carpentry', en: 'Upholsterer', ar: 'منجد', fr: 'Tapissier' },
  { key: 'waterHeaterTechnician', categoryId: 'water-heater-repair', en: 'Water-heater technician', ar: 'فني سخانات', fr: 'Technicien chauffe-eau' },
  { key: 'welder', categoryId: 'alumetal', en: 'Welder', ar: 'لحام', fr: 'Soudeur' },
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
  if (profession) return profession[language];
  if (typeof legacy === 'string') return legacy;
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/**
 * Every profession, most-asked-for trade first.
 *
 * This used to sort alphabetically by localized label, which put the list in a
 * different order in every language and led with whatever happened to begin
 * with A. Ordering by the category's cold-start demand rank means a worker
 * meets the trades Egyptian households actually call out for first, in the same
 * order whichever language they read.
 *
 * Nothing is hidden. A less-asked-for trade is further down the list, never
 * absent, and `query` filters on the worker's own words — this is a chooser,
 * not a recommendation.
 */
export function listProfessions(language: Language, query = ''): ProfessionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(language);
  return [...professions]
    .filter(profession => !normalizedQuery
      || profession[language].toLocaleLowerCase(language).includes(normalizedQuery))
    .sort(byServiceDemand(
      profession => profession.categoryId,
      (left, right) => left[language].localeCompare(right[language], language)));
}

export function selectedProfessionKeys(value: Pick<ProviderDraft, 'profession' | 'specialties'>): ProfessionKey[] {
  const stored = value.specialties
    .filter(item => item.startsWith(STORED_PROFESSION_PREFIX))
    .map(item => item.slice(STORED_PROFESSION_PREFIX.length));
  return [...new Set([value.profession, ...stored].filter(isProfessionKey))];
}

export function withSelectedProfessions<T extends Pick<ProviderDraft, 'profession' | 'specialties' | 'categoryIds'>>(
  value: T,
  keys: ProfessionKey[],
): T {
  const selected = [...new Set(keys)].slice(0, 10);
  const legacySpecialties = value.specialties
    .filter(item => !item.startsWith(STORED_PROFESSION_PREFIX))
    .slice(0, Math.max(0, 10 - selected.length));
  const selectedCategoryIds: string[] = [];
  for (const key of selected) {
    const categoryId = professionByKey.get(key)?.categoryId;
    if (categoryId) selectedCategoryIds.push(categoryId);
  }
  const categoryIds = [...new Set([
    ...value.categoryIds.filter(categoryId => !isLegacyCategory(categoryId)),
    ...selectedCategoryIds,
  ])].slice(0, 10);
  return {
    ...value,
    profession: selected[0] ?? '',
    specialties: [
      ...selected.map(key => `${STORED_PROFESSION_PREFIX}${key}`),
      ...legacySpecialties,
    ],
    categoryIds,
  } as T;
}

export function publicSpecialties(values: string[]): string[] {
  return values.filter(value => !value.startsWith(STORED_PROFESSION_PREFIX));
}
