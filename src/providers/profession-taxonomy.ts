import { translations, type Language } from '../i18n/translations.ts';
import {
  byServiceDemand,
  isLegacyCategory,
  serviceDemandRank,
  type ServiceCategoryId,
} from '../services/service-catalogue.ts';
import { specificServicesFor } from '../services/specific-services.ts';
import type { ProviderDraft } from './provider-types.ts';

export const STORED_PROFESSION_PREFIX = 'profession:';

const everyServiceIn = (...categoryIds: ServiceCategoryId[]): string[] => categoryIds
  .flatMap(categoryId => specificServicesFor(categoryId).map(service => service.key));

const onlyServices = (...keys: string[]): string[] => keys;

/**
 * What a worker IS, and which of Warsha's work they may therefore offer.
 *
 * ## Two different facts, deliberately separated
 *
 * A PROFESSION is the worker's trade -- `plumbing`, "Plumber". A SPECIFIC
 * SERVICE is one job that trade performs -- `plumbing-leak-repair`, "Leak
 * repair". Onboarding used to ask for the first and then offer the entire
 * 171-row service catalogue for the second, in one flat list, alphabetically by
 * English name: a plumber was asked to find "Leak repair" somewhere between
 * "Lawn care" and "Light installation", and nothing on the screen said the two
 * questions were related. `serviceCategoryIds` is what makes them related.
 *
 * ## `categoryId` is identity; `serviceCategoryIds` is scope
 *
 * `categoryId` is the profession's home category. It decides where the worker
 * ranks, what `primary_category_id` gets stored, and which customers discover
 * them first. It is exactly one, always.
 *
 * `serviceCategoryIds` is every category this trade may offer work from,
 * beginning with the home category. Usually that is the same single category.
 * Where it is more, it is because Warsha's taxonomy genuinely splits one
 * tradesman's work across categories -- never to widen a chooser:
 *
 *   - Plumber and Appliance technician reach `water-heater-repair`, because
 *     water heaters were split out of plumbing when the catalogue expanded and
 *     the same tradesman still fits and fixes them.
 *   - Home electronics technician reaches `satellite-tv-installation`, because
 *     a receiver, a wall-mounted television and a dish alignment are that
 *     person's work, not a separate trade's.
 *   - Interior decorator reaches `renovation-finishing`, because gypsum
 *     decoration and plastering are how a decorator's work is actually done.
 *   - Construction worker reaches `flooring-tiling`, and Renovation worker
 *     reaches `flooring-tiling` and `painting`, because a finishing job is
 *     masonry, tiling and paint by the same crew.
 *
 * Everything else is one category on purpose. A Welder is `alumetal` alone --
 * Warsha sells no structural metalwork, so aluminium doors, windows and roller
 * shutters are the whole of what a welder can be booked for here, and adding
 * `renovation-finishing` would offer them plastering. A Glass worker is
 * `alumetal` for the same reason: glass replacement, shower cabins and windows
 * all live there already.
 *
 * ## Order is the category's order, then this array's
 *
 * The list used to sort alphabetically by localized label, which produced a
 * different order in every language and led with whatever began with A. It then
 * sorted by category demand and tie-broke on the localized label, which fixed
 * the leading entries and left the WITHIN-category order still language-
 * dependent: "Plumber, Pool technician" in English is "Pool technician,
 * Plumber" in Arabic.
 *
 * So the tie-break is this array's own index. The array is written in final
 * order -- categories in `SERVICE_DEMAND_ORDER`, and within a category the
 * broadest trade first -- and every language sees exactly that.
 *
 * ## Withdrawn trades are not deleted
 *
 * `handyman` and `generalMaintenance` are in `withdrawnProfessions`, not here.
 * They named the same catch-all drawer as the withdrawn `general-maintenance`
 * category: a locksmith who called themselves a Handyman was invisible to the
 * person who needed a locksmith. They remain resolvable so an existing profile
 * still reads as words, and they can never be selected again.
 */
export const professions = [
  // --- Plumbing (demand 1) -------------------------------------------------
  { key: 'plumbing', categoryId: 'plumbing', serviceCategoryIds: ['plumbing', 'water-heater-repair'], serviceKeys: everyServiceIn('plumbing', 'water-heater-repair'), en: 'Plumber', ar: 'سباك', fr: 'Plombier' },
  { key: 'poolTechnician', categoryId: 'plumbing', serviceCategoryIds: ['plumbing'], serviceKeys: onlyServices('plumbing-pipe-repair', 'plumbing-pipe-replace', 'plumbing-water-pressure', 'plumbing-water-tank', 'plumbing-inspection'), en: 'Pool technician', ar: 'فني حمامات سباحة', fr: 'Technicien de piscine' },

  // --- Electrical (demand 2) -----------------------------------------------
  { key: 'electrical', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: everyServiceIn('electrical'), en: 'Electrician', ar: 'كهربائي', fr: 'Électricien' },
  { key: 'smartHomeTechnician', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: onlyServices('electrical-socket-install', 'electrical-switch-install', 'electrical-light-install', 'electrical-wiring', 'electrical-inspection'), en: 'Smart-home technician', ar: 'فني منازل ذكية', fr: 'Technicien en maison connectée' },
  { key: 'securitySystemTechnician', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: onlyServices('electrical-wiring', 'electrical-panel', 'electrical-inspection'), en: 'Security-system technician', ar: 'فني أنظمة أمن', fr: 'Technicien en systèmes de sécurité' },

  // --- Cleaning (demand 3) -------------------------------------------------
  { key: 'cleaning', categoryId: 'cleaning', serviceCategoryIds: ['cleaning'], serviceKeys: everyServiceIn('cleaning'), en: 'Cleaner', ar: 'عامل نظافة', fr: 'Agent de nettoyage' },

  // --- Air conditioning (demand 4) -----------------------------------------
  { key: 'acRepair', categoryId: 'ac', serviceCategoryIds: ['ac'], serviceKeys: everyServiceIn('ac'), en: 'Air-conditioning technician', ar: 'فني تكييف', fr: 'Technicien en climatisation' },

  // --- Appliance repair (demand 5) -----------------------------------------
  { key: 'applianceRepair', categoryId: 'appliance-repair', serviceCategoryIds: ['appliance-repair', 'water-heater-repair'], serviceKeys: everyServiceIn('appliance-repair', 'water-heater-repair'), en: 'Appliance technician', ar: 'فني أجهزة منزلية', fr: 'Technicien en électroménager' },
  { key: 'homeElectronicsTechnician', categoryId: 'appliance-repair', serviceCategoryIds: ['appliance-repair', 'satellite-tv-installation'], serviceKeys: onlyServices('appliance-microwave', 'appliance-install', 'appliance-inspection', ...everyServiceIn('satellite-tv-installation')), en: 'Home electronics technician', ar: 'فني إلكترونيات منزلية', fr: 'Technicien en électronique domestique' },

  // --- Carpentry (demand 6) ------------------------------------------------
  { key: 'carpentry', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: everyServiceIn('carpentry'), en: 'Carpenter', ar: 'نجار', fr: 'Menuisier' },
  { key: 'furnitureRepairer', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-repair', 'carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-shelving', 'carpentry-lock-fitting', 'carpentry-upholstery'), en: 'Furniture repairer', ar: 'فني تصليح أثاث', fr: 'Réparateur de meubles' },
  { key: 'furnitureMaker', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-kitchen-cabinets', 'carpentry-shelving', 'carpentry-custom'), en: 'Furniture maker', ar: 'صانع أثاث', fr: 'Fabricant de meubles' },
  { key: 'upholsterer', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-repair', 'carpentry-upholstery'), en: 'Upholsterer', ar: 'منجد', fr: 'Tapissier' },

  // --- Painting (demand 7) -------------------------------------------------
  { key: 'painting', categoryId: 'painting', serviceCategoryIds: ['painting'], serviceKeys: everyServiceIn('painting'), en: 'Painter', ar: 'نقاش', fr: 'Peintre' },
  { key: 'interiorDecorator', categoryId: 'painting', serviceCategoryIds: ['painting', 'renovation-finishing'], serviceKeys: onlyServices('painting-touch-up', 'painting-wall-prep', 'painting-decorative', 'painting-wallpaper', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection'), en: 'Interior decorator', ar: 'مصمم ديكور داخلي', fr: 'Décorateur d’intérieur' },

  // --- Moving help (demand 8) ----------------------------------------------
  { key: 'movingHelp', categoryId: 'moving-help', serviceCategoryIds: ['moving-help'], serviceKeys: everyServiceIn('moving-help'), en: 'Mover', ar: 'عامل نقل أثاث', fr: 'Déménageur' },

  // --- Pest control (demand 9) ---------------------------------------------
  { key: 'pestControlWorker', categoryId: 'pest-control', serviceCategoryIds: ['pest-control'], serviceKeys: everyServiceIn('pest-control'), en: 'Pest-control worker', ar: 'فني مكافحة حشرات', fr: 'Technicien en désinsectisation' },

  // --- Water heaters (demand 10) -------------------------------------------
  { key: 'waterHeaterTechnician', categoryId: 'water-heater-repair', serviceCategoryIds: ['water-heater-repair'], serviceKeys: everyServiceIn('water-heater-repair'), en: 'Water-heater technician', ar: 'فني سخانات', fr: 'Technicien chauffe-eau' },

  // --- Flooring and tiling (demand 11) -------------------------------------
  { key: 'tiler', categoryId: 'flooring-tiling', serviceCategoryIds: ['flooring-tiling'], serviceKeys: onlyServices('flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-grout', 'flooring-removal'), en: 'Tiler', ar: 'مبلط', fr: 'Carreleur' },
  { key: 'flooringSpecialist', categoryId: 'flooring-tiling', serviceCategoryIds: ['flooring-tiling'], serviceKeys: everyServiceIn('flooring-tiling'), en: 'Flooring specialist', ar: 'فني أرضيات', fr: 'Spécialiste des revêtements de sol' },

  // --- Renovation and finishing (demand 12) --------------------------------
  { key: 'renovationWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing', 'flooring-tiling', 'painting'], serviceKeys: everyServiceIn('renovation-finishing', 'flooring-tiling', 'painting'), en: 'Renovation worker', ar: 'فني تجديدات', fr: 'Ouvrier en rénovation' },
  { key: 'constructionWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing', 'flooring-tiling'], serviceKeys: onlyServices(...everyServiceIn('renovation-finishing'), 'flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-removal'), en: 'Construction worker', ar: 'عامل بناء', fr: 'Ouvrier du bâtiment' },
  { key: 'mason', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing'], serviceKeys: onlyServices('renovation-plastering', 'renovation-wall-build', 'renovation-crack-repair', 'renovation-waterproofing', 'renovation-inspection'), en: 'Mason', ar: 'بنّاء', fr: 'Maçon' },
  { key: 'gypsumWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing'], serviceKeys: onlyServices('renovation-plastering', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection'), en: 'Gypsum worker', ar: 'فني جبس', fr: 'Plâtrier' },

  // --- Alumetal (demand 13) ------------------------------------------------
  { key: 'aluminumWorker', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: everyServiceIn('alumetal'), en: 'Aluminium worker', ar: 'فني ألوميتال', fr: 'Menuisier aluminium' },
  { key: 'glassWorker', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: onlyServices('alumetal-window-install', 'alumetal-window-repair', 'alumetal-glass-replace', 'alumetal-shower-cabin'), en: 'Glass worker', ar: 'فني زجاج', fr: 'Vitrier' },
  { key: 'welder', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: onlyServices('alumetal-window-install', 'alumetal-window-repair', 'alumetal-door-install', 'alumetal-door-repair', 'alumetal-kitchen', 'alumetal-shutter'), en: 'Welder', ar: 'لحام', fr: 'Soudeur' },

  // --- Satellite and TV (demand 14) ----------------------------------------
  { key: 'satelliteTechnician', categoryId: 'satellite-tv-installation', serviceCategoryIds: ['satellite-tv-installation'], serviceKeys: everyServiceIn('satellite-tv-installation'), en: 'Satellite and TV technician', ar: 'فني دش وتلفزيون', fr: 'Technicien satellite et télévision' },

  // --- Locks and keys (demand 15) ------------------------------------------
  { key: 'locksmith', categoryId: 'locksmithing', serviceCategoryIds: ['locksmithing'], serviceKeys: everyServiceIn('locksmithing'), en: 'Locksmith', ar: 'فني أقفال', fr: 'Serrurier' },

  // --- Gardening (demand 16) -----------------------------------------------
  { key: 'gardener', categoryId: 'gardening', serviceCategoryIds: ['gardening'], serviceKeys: everyServiceIn('gardening'), en: 'Gardener', ar: 'بستاني', fr: 'Jardinier' },
  { key: 'landscaper', categoryId: 'gardening', serviceCategoryIds: ['gardening'], serviceKeys: onlyServices('gardening-maintenance', 'gardening-planting', 'gardening-pruning', 'gardening-lawn', 'gardening-irrigation', 'gardening-clearance'), en: 'Landscaper', ar: 'منسق حدائق', fr: 'Paysagiste' },

  // --- Barber (demand 17) --------------------------------------------------
  { key: 'barber', categoryId: 'barber', serviceCategoryIds: ['barber'], serviceKeys: everyServiceIn('barber'), en: 'Barber', ar: 'حلاق', fr: 'Barbier' },

  // --- Hairdressing (demand 18) --------------------------------------------
  { key: 'hairdresser', categoryId: 'hairdressing', serviceCategoryIds: ['hairdressing'], serviceKeys: everyServiceIn('hairdressing'), en: 'Hairdresser', ar: 'كوافير', fr: 'Coiffeur' },

  // --- Personal styling (demand 19) ----------------------------------------
  { key: 'personalStylist', categoryId: 'personal-styling', serviceCategoryIds: ['personal-styling'], serviceKeys: everyServiceIn('personal-styling'), en: 'Personal stylist', ar: 'ستايلست شخصي', fr: 'Conseiller en image' },
] as const satisfies readonly {
  key: string;
  categoryId: ServiceCategoryId;
  serviceCategoryIds: readonly ServiceCategoryId[];
  serviceKeys: readonly string[];
  en: string;
  ar: string;
  fr: string;
}[];

/**
 * Trades a worker may no longer choose, kept so old profiles still read.
 *
 * Withdrawn for the same reason `general-maintenance` was: they are drawers,
 * not trades. A profile that still stores one keeps it -- nothing here deletes
 * or silently rewrites a worker's recorded identity -- but `listProfessions`
 * never offers them and `selectedProfessionKeys` never returns them, so no new
 * payload can carry one.
 */
export const withdrawnProfessions = [
  { key: 'handyman', en: 'Handyman', ar: 'فني صيانة متعدد المهارات', fr: 'Agent de maintenance polyvalent' },
  { key: 'generalMaintenance', en: 'General home-maintenance technician', ar: 'فني صيانة منزلية عامة', fr: 'Technicien de maintenance générale' },
] as const;

export type ProfessionKey = (typeof professions)[number]['key'];
export type ProfessionOption = (typeof professions)[number];
export type WithdrawnProfessionKey = (typeof withdrawnProfessions)[number]['key'];

const professionByKey = new Map<string, ProfessionOption>(
  professions.map(profession => [profession.key, profession]),
);
const withdrawnByKey = new Map<string, (typeof withdrawnProfessions)[number]>(
  withdrawnProfessions.map(profession => [profession.key, profession]),
);
const professionIndex = new Map<string, number>(
  professions.map((profession, index) => [profession.key, index]),
);

/** Whether this build recognises the key at all, withdrawn trades included. */
export function isProfessionKey(value: string): value is ProfessionKey | WithdrawnProfessionKey {
  return professionByKey.has(value) || withdrawnByKey.has(value);
}

/** Whether a worker may choose this trade for new work. */
export function isSelectableProfession(value: string): value is ProfessionKey {
  return professionByKey.has(value);
}

/** Whether this trade exists only so an old profile still reads as words. */
export function isWithdrawnProfession(value: string): value is WithdrawnProfessionKey {
  return withdrawnByKey.has(value);
}

export function professionLabel(key: string, language: Language): string {
  const profession = professionByKey.get(key) ?? withdrawnByKey.get(key);
  const legacy = (translations[language] as Record<string, unknown>)[key];
  if (profession) return profession[language];
  if (typeof legacy === 'string') return legacy;
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/**
 * Every category whose work this trade may offer, most-asked-for first.
 *
 * The single place any surface may ask "which services belong to this
 * profession?". Web, Android and iOS all call it; none of them keeps a list.
 */
export function professionServiceCategoryIds(key: string): ServiceCategoryId[] {
  const profession = professionByKey.get(key);
  if (!profession) return [];
  return [...profession.serviceCategoryIds]
    .filter(categoryId => !isLegacyCategory(categoryId))
    .sort((left, right) => serviceDemandRank(left) - serviceDemandRank(right));
}

/** Stable catalogue keys for the exact jobs this profession may offer. */
export function professionServiceKeys(key: string): string[] {
  return [...(professionByKey.get(key)?.serviceKeys ?? [])];
}

/**
 * Every selectable profession, most-asked-for trade first.
 *
 * Ordered by the home category's cold-start demand rank, then by this module's
 * own array order -- never by the localized label, so the list reads in the
 * same order in English, Arabic and French. `query` filters on the worker's own
 * words and does not reorder: clearing the search restores exactly the ranking
 * that was there before it.
 */
export function listProfessions(language: Language, query = ''): ProfessionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(language);
  return [...professions]
    .filter(profession => !normalizedQuery
      || profession[language].toLocaleLowerCase(language).includes(normalizedQuery))
    .sort(byServiceDemand(
      profession => profession.categoryId,
      (left, right) => (professionIndex.get(left.key) ?? 0) - (professionIndex.get(right.key) ?? 0)));
}

/**
 * The trades a stored profile currently claims, in ranked order.
 *
 * Withdrawn keys are excluded deliberately: this feeds both the chooser and the
 * saved payload, so returning one would put a withdrawn trade back into the
 * database the next time the worker pressed save.
 */
export function selectedProfessionKeys(
  value: Pick<ProviderDraft, 'profession' | 'specialties'>,
): ProfessionKey[] {
  const stored = value.specialties
    .filter(item => item.startsWith(STORED_PROFESSION_PREFIX))
    .map(item => item.slice(STORED_PROFESSION_PREFIX.length));
  const selected = [...new Set([value.profession, ...stored].filter(isSelectableProfession))];
  // `professions` is written in ranked order, so its index IS the ranked
  // position: sorting by it puts a stored selection in the same order the
  // chooser offered it, without re-deriving the ranking.
  return selected.sort((left, right) =>
    (professionIndex.get(left) ?? 0) - (professionIndex.get(right) ?? 0));
}

/**
 * Withdrawn trades this profile still records, so the worker can be told.
 *
 * Onboarding shows these as a note rather than as a removable choice: the
 * worker did not do anything wrong, Warsha stopped offering the trade, and the
 * honest thing is to say so and ask for a concrete one.
 */
export function withdrawnProfessionSelections(
  value: Pick<ProviderDraft, 'profession' | 'specialties'>,
): WithdrawnProfessionKey[] {
  const stored = value.specialties
    .filter(item => item.startsWith(STORED_PROFESSION_PREFIX))
    .map(item => item.slice(STORED_PROFESSION_PREFIX.length));
  return [...new Set([value.profession, ...stored].filter(isWithdrawnProfession))];
}

/**
 * Record a trade selection on a draft.
 *
 * Categories are derived from the selected professions. Keeping the old array
 * here made a deselected plumber remain discoverable under plumbing even after
 * every plumbing service had been removed.
 */
export function withSelectedProfessions<T extends Pick<ProviderDraft, 'profession' | 'specialties' | 'categoryIds'>>(
  value: T,
  keys: readonly string[],
): T {
  const selected = [...new Set(keys.filter(isSelectableProfession))].slice(0, 10);
  const legacySpecialties = value.specialties
    .filter(item => !item.startsWith(STORED_PROFESSION_PREFIX))
    .slice(0, Math.max(0, 10 - selected.length));
  const selectedCategoryIds: string[] = [];
  for (const key of selected) {
    const categoryId = professionByKey.get(key)?.categoryId;
    if (categoryId) selectedCategoryIds.push(categoryId);
  }
  const categoryIds = [...new Set(selectedCategoryIds)].slice(0, 10);
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
