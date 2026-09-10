import { translations, type Language } from '../i18n/translations.ts';
import {
  expandQueryTerms,
  SEARCH_LANGUAGES,
  searchRanked,
  type Searchable,
  type SearchTerm,
} from '../search/multilingual-search.ts';
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
  { key: 'plumbing', categoryId: 'plumbing', serviceCategoryIds: ['plumbing', 'water-heater-repair'], serviceKeys: everyServiceIn('plumbing', 'water-heater-repair'), work: { en: 'Plumbing', ar: 'سباكة', fr: 'Plomberie' }, person: { en: 'Plumber', ar: 'سباك', fr: 'Plombier' } },
  { key: 'poolTechnician', categoryId: 'plumbing', serviceCategoryIds: ['plumbing'], serviceKeys: onlyServices('plumbing-pipe-repair', 'plumbing-pipe-replace', 'plumbing-water-pressure', 'plumbing-water-tank', 'plumbing-inspection'), work: { en: 'Pool maintenance', ar: 'صيانة حمامات السباحة', fr: 'Entretien de piscines' }, person: { en: 'Pool technician', ar: 'فني حمامات سباحة', fr: 'Technicien de piscine' } },

  // --- Electrical (demand 2) -----------------------------------------------
  { key: 'electrical', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: everyServiceIn('electrical'), work: { en: 'Electrical', ar: 'كهرباء', fr: 'Électricité' }, person: { en: 'Electrician', ar: 'كهربائي', fr: 'Électricien' } },
  { key: 'smartHomeTechnician', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: onlyServices('electrical-socket-install', 'electrical-switch-install', 'electrical-light-install', 'electrical-wiring', 'electrical-inspection'), work: { en: 'Smart-home installation', ar: 'تركيب أنظمة المنزل الذكي', fr: 'Installation domotique' }, person: { en: 'Smart-home technician', ar: 'فني منازل ذكية', fr: 'Technicien en maison connectée' } },
  { key: 'securitySystemTechnician', categoryId: 'electrical', serviceCategoryIds: ['electrical'], serviceKeys: onlyServices('electrical-wiring', 'electrical-panel', 'electrical-inspection'), work: { en: 'Security systems', ar: 'أنظمة أمن', fr: 'Systèmes de sécurité' }, person: { en: 'Security-system technician', ar: 'فني أنظمة أمن', fr: 'Technicien en systèmes de sécurité' } },

  // --- Cleaning (demand 3) -------------------------------------------------
  { key: 'cleaning', categoryId: 'cleaning', serviceCategoryIds: ['cleaning'], serviceKeys: everyServiceIn('cleaning'), work: { en: 'Cleaning', ar: 'تنظيف', fr: 'Nettoyage' }, person: { en: 'Cleaner', ar: 'عامل نظافة', fr: 'Agent de nettoyage' } },

  // --- Air conditioning (demand 4) -----------------------------------------
  { key: 'acRepair', categoryId: 'ac', serviceCategoryIds: ['ac'], serviceKeys: everyServiceIn('ac'), work: { en: 'Air conditioning', ar: 'تكييف', fr: 'Climatisation' }, person: { en: 'Air-conditioning technician', ar: 'فني تكييف', fr: 'Technicien en climatisation' } },

  // --- Appliance repair (demand 5) -----------------------------------------
  { key: 'applianceRepair', categoryId: 'appliance-repair', serviceCategoryIds: ['appliance-repair', 'water-heater-repair'], serviceKeys: everyServiceIn('appliance-repair', 'water-heater-repair'), work: { en: 'Appliance repair', ar: 'تصليح أجهزة منزلية', fr: 'Réparation d’électroménager' }, person: { en: 'Appliance technician', ar: 'فني أجهزة منزلية', fr: 'Technicien en électroménager' } },
  { key: 'homeElectronicsTechnician', categoryId: 'appliance-repair', serviceCategoryIds: ['appliance-repair', 'satellite-tv-installation'], serviceKeys: onlyServices('appliance-microwave', 'appliance-install', 'appliance-inspection', ...everyServiceIn('satellite-tv-installation')), work: { en: 'Home electronics', ar: 'إلكترونيات منزلية', fr: 'Électronique domestique' }, person: { en: 'Home electronics technician', ar: 'فني إلكترونيات منزلية', fr: 'Technicien en électronique domestique' } },

  // --- Carpentry (demand 6) ------------------------------------------------
  { key: 'carpentry', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: everyServiceIn('carpentry'), work: { en: 'Carpentry', ar: 'نجارة', fr: 'Menuiserie' }, person: { en: 'Carpenter', ar: 'نجار', fr: 'Menuisier' } },
  { key: 'furnitureRepairer', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-repair', 'carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-shelving', 'carpentry-lock-fitting', 'carpentry-upholstery'), work: { en: 'Furniture repair', ar: 'تصليح أثاث', fr: 'Réparation de meubles' }, person: { en: 'Furniture repairer', ar: 'فني تصليح أثاث', fr: 'Réparateur de meubles' } },
  { key: 'furnitureMaker', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-assembly', 'carpentry-wardrobe', 'carpentry-kitchen-cabinets', 'carpentry-shelving', 'carpentry-custom'), work: { en: 'Furniture making', ar: 'صناعة أثاث', fr: 'Fabrication de meubles' }, person: { en: 'Furniture maker', ar: 'صانع أثاث', fr: 'Fabricant de meubles' } },
  { key: 'upholsterer', categoryId: 'carpentry', serviceCategoryIds: ['carpentry'], serviceKeys: onlyServices('carpentry-furniture-repair', 'carpentry-upholstery'), work: { en: 'Upholstery', ar: 'تنجيد', fr: 'Tapisserie' }, person: { en: 'Upholsterer', ar: 'منجد', fr: 'Tapissier' } },

  // --- Painting (demand 7) -------------------------------------------------
  { key: 'painting', categoryId: 'painting', serviceCategoryIds: ['painting'], serviceKeys: everyServiceIn('painting'), work: { en: 'Painting', ar: 'نقاشة', fr: 'Peinture' }, person: { en: 'Painter', ar: 'نقاش', fr: 'Peintre' } },
  { key: 'interiorDecorator', categoryId: 'painting', serviceCategoryIds: ['painting', 'renovation-finishing'], serviceKeys: onlyServices('painting-touch-up', 'painting-wall-prep', 'painting-decorative', 'painting-wallpaper', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection'), work: { en: 'Interior decoration', ar: 'ديكور داخلي', fr: 'Décoration d’intérieur' }, person: { en: 'Interior decorator', ar: 'مصمم ديكور داخلي', fr: 'Décorateur d’intérieur' } },

  // --- Moving help (demand 8) ----------------------------------------------
  { key: 'movingHelp', categoryId: 'moving-help', serviceCategoryIds: ['moving-help'], serviceKeys: everyServiceIn('moving-help'), work: { en: 'Furniture moving', ar: 'نقل أثاث', fr: 'Déménagement' }, person: { en: 'Mover', ar: 'عامل نقل أثاث', fr: 'Déménageur' } },

  // --- Pest control (demand 9) ---------------------------------------------
  { key: 'pestControlWorker', categoryId: 'pest-control', serviceCategoryIds: ['pest-control'], serviceKeys: everyServiceIn('pest-control'), work: { en: 'Pest control', ar: 'مكافحة حشرات', fr: 'Désinsectisation' }, person: { en: 'Pest-control worker', ar: 'فني مكافحة حشرات', fr: 'Technicien en désinsectisation' } },

  // --- Water heaters (demand 10) -------------------------------------------
  { key: 'waterHeaterTechnician', categoryId: 'water-heater-repair', serviceCategoryIds: ['water-heater-repair'], serviceKeys: everyServiceIn('water-heater-repair'), work: { en: 'Water heaters', ar: 'سخانات', fr: 'Chauffe-eau' }, person: { en: 'Water-heater technician', ar: 'فني سخانات', fr: 'Technicien chauffe-eau' } },

  // --- Flooring and tiling (demand 11) -------------------------------------
  { key: 'tiler', categoryId: 'flooring-tiling', serviceCategoryIds: ['flooring-tiling'], serviceKeys: onlyServices('flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-grout', 'flooring-removal'), work: { en: 'Tiling', ar: 'تبليط', fr: 'Carrelage' }, person: { en: 'Tiler', ar: 'مبلط', fr: 'Carreleur' } },
  { key: 'flooringSpecialist', categoryId: 'flooring-tiling', serviceCategoryIds: ['flooring-tiling'], serviceKeys: everyServiceIn('flooring-tiling'), work: { en: 'Flooring', ar: 'أرضيات', fr: 'Revêtements de sol' }, person: { en: 'Flooring specialist', ar: 'فني أرضيات', fr: 'Spécialiste des revêtements de sol' } },

  // --- Renovation and finishing (demand 12) --------------------------------
  { key: 'renovationWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing', 'flooring-tiling', 'painting'], serviceKeys: everyServiceIn('renovation-finishing', 'flooring-tiling', 'painting'), work: { en: 'Renovation', ar: 'تجديدات', fr: 'Rénovation' }, person: { en: 'Renovation worker', ar: 'فني تجديدات', fr: 'Ouvrier en rénovation' } },
  { key: 'constructionWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing', 'flooring-tiling'], serviceKeys: onlyServices(...everyServiceIn('renovation-finishing'), 'flooring-ceramic-install', 'flooring-porcelain-install', 'flooring-marble', 'flooring-tile-repair', 'flooring-removal'), work: { en: 'Construction', ar: 'بناء', fr: 'Construction' }, person: { en: 'Construction worker', ar: 'عامل بناء', fr: 'Ouvrier du bâtiment' } },
  { key: 'mason', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing'], serviceKeys: onlyServices('renovation-plastering', 'renovation-wall-build', 'renovation-crack-repair', 'renovation-waterproofing', 'renovation-inspection'), work: { en: 'Masonry', ar: 'مباني', fr: 'Maçonnerie' }, person: { en: 'Mason', ar: 'بنّاء', fr: 'Maçon' } },
  { key: 'gypsumWorker', categoryId: 'renovation-finishing', serviceCategoryIds: ['renovation-finishing'], serviceKeys: onlyServices('renovation-plastering', 'renovation-gypsum-ceiling', 'renovation-gypsum-decor', 'renovation-inspection'), work: { en: 'Plastering', ar: 'جبس', fr: 'Plâtrerie' }, person: { en: 'Gypsum worker', ar: 'فني جبس', fr: 'Plâtrier' } },

  // --- Alumetal (demand 13) ------------------------------------------------
  { key: 'aluminumWorker', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: everyServiceIn('alumetal'), work: { en: 'Aluminium', ar: 'ألوميتال', fr: 'Aluminium' }, person: { en: 'Aluminium worker', ar: 'فني ألوميتال', fr: 'Menuisier aluminium' } },
  { key: 'glassWorker', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: onlyServices('alumetal-window-install', 'alumetal-window-repair', 'alumetal-glass-replace', 'alumetal-shower-cabin'), work: { en: 'Glazing', ar: 'زجاج', fr: 'Vitrerie' }, person: { en: 'Glass worker', ar: 'فني زجاج', fr: 'Vitrier' } },
  { key: 'welder', categoryId: 'alumetal', serviceCategoryIds: ['alumetal'], serviceKeys: onlyServices('alumetal-window-install', 'alumetal-window-repair', 'alumetal-door-install', 'alumetal-door-repair', 'alumetal-kitchen', 'alumetal-shutter'), work: { en: 'Welding', ar: 'لحام', fr: 'Soudure' }, person: { en: 'Welder', ar: 'لحام', fr: 'Soudeur' } },

  // --- Satellite and TV (demand 14) ----------------------------------------
  { key: 'satelliteTechnician', categoryId: 'satellite-tv-installation', serviceCategoryIds: ['satellite-tv-installation'], serviceKeys: everyServiceIn('satellite-tv-installation'), work: { en: 'Satellite and TV', ar: 'دش وتلفزيون', fr: 'Satellite et télévision' }, person: { en: 'Satellite and TV technician', ar: 'فني دش وتلفزيون', fr: 'Technicien satellite et télévision' } },

  // --- Locks and keys (demand 15) ------------------------------------------
  { key: 'locksmith', categoryId: 'locksmithing', serviceCategoryIds: ['locksmithing'], serviceKeys: everyServiceIn('locksmithing'), work: { en: 'Locks and keys', ar: 'أقفال ومفاتيح', fr: 'Serrurerie' }, person: { en: 'Locksmith', ar: 'فني أقفال', fr: 'Serrurier' } },

  // --- Gardening (demand 16) -----------------------------------------------
  { key: 'gardener', categoryId: 'gardening', serviceCategoryIds: ['gardening'], serviceKeys: everyServiceIn('gardening'), work: { en: 'Gardening', ar: 'بستنة', fr: 'Jardinage' }, person: { en: 'Gardener', ar: 'بستاني', fr: 'Jardinier' } },
  { key: 'landscaper', categoryId: 'gardening', serviceCategoryIds: ['gardening'], serviceKeys: onlyServices('gardening-maintenance', 'gardening-planting', 'gardening-pruning', 'gardening-lawn', 'gardening-irrigation', 'gardening-clearance'), work: { en: 'Landscaping', ar: 'تنسيق حدائق', fr: 'Aménagement paysager' }, person: { en: 'Landscaper', ar: 'منسق حدائق', fr: 'Paysagiste' } },

  // --- Barber (demand 17) --------------------------------------------------
  { key: 'barber', categoryId: 'barber', serviceCategoryIds: ['barber'], serviceKeys: everyServiceIn('barber'), work: { en: 'Barbering', ar: 'حلاقة', fr: 'Coiffure homme' }, person: { en: 'Barber', ar: 'حلاق', fr: 'Barbier' } },

  // --- Hairdressing (demand 18) --------------------------------------------
  { key: 'hairdresser', categoryId: 'hairdressing', serviceCategoryIds: ['hairdressing'], serviceKeys: everyServiceIn('hairdressing'), work: { en: 'Hairdressing', ar: 'تصفيف شعر', fr: 'Coiffure' }, person: { en: 'Hairdresser', ar: 'كوافير', fr: 'Coiffeur' } },

  // --- Personal styling (demand 19) ----------------------------------------
  { key: 'personalStylist', categoryId: 'personal-styling', serviceCategoryIds: ['personal-styling'], serviceKeys: everyServiceIn('personal-styling'), work: { en: 'Personal styling', ar: 'تنسيق إطلالة', fr: 'Conseil en image' }, person: { en: 'Personal stylist', ar: 'ستايلست شخصي', fr: 'Conseiller en image' } },
] as const satisfies readonly {
  key: string;
  categoryId: ServiceCategoryId;
  serviceCategoryIds: readonly ServiceCategoryId[];
  serviceKeys: readonly string[];
  /** What the professional does. Shown when they describe their own work. */
  work: { en: string; ar: string; fr: string };
  /** Who they are. Shown when Warsha identifies them to a customer. */
  person: { en: string; ar: string; fr: string };
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
  { key: 'handyman', work: { en: 'Home maintenance', ar: 'صيانة منزلية', fr: 'Entretien du domicile' }, person: { en: 'Handyman', ar: 'فني صيانة متعدد المهارات', fr: 'Agent de maintenance polyvalent' } },
  { key: 'generalMaintenance', work: { en: 'Household upkeep', ar: 'صيانة البيت', fr: 'Maintenance du logement' }, person: { en: 'General home-maintenance technician', ar: 'فني صيانة منزلية عامة', fr: 'Technicien de maintenance générale' } },
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

/**
 * Who is being spoken to, and therefore which noun Warsha uses.
 *
 * A professional choosing what they do is describing WORK — plumbing,
 * electrical work, cleaning. A customer looking at someone is being shown a
 * PERSON — a plumber, an electrician, a cleaner. Both name the same profession
 * and the stored key never changes; only the presentation does.
 *
 * The distinction is not cosmetic. Asking a professional to pick "Plumber" from
 * a list makes them choose a noun for themselves; asking them to pick
 * "Plumbing" asks what they actually do, which is the question they can answer
 * without thinking about it.
 */
export type ProfessionAudience = 'professional' | 'customer';

/**
 * The name of a profession, for the audience reading it.
 *
 * `audience` is REQUIRED on purpose. A default would silently pick a noun for
 * every existing call site and for every future one, and the whole point is
 * that a screen must say which side of the conversation it is on. The compiler
 * asking the question is cheaper than a customer being told they hired a
 * "Plumbing".
 */
/*
 * Why the work picker has no category headings.
 *
 * It used to have one per group, and that was right when the rows were person
 * nouns: "Plumbing" above Plumber and Pool technician named something the rows
 * did not. Once every row became the plain work noun, the category name turned
 * out to BE one of its rows -- "Plumbing" above Plumbing and Pool maintenance,
 * "Carpentry" above Carpentry and three more. The heading had become the same
 * word twice, and the first attempt to escape that invented "General plumbing".
 *
 * Dropping the heading only where it collided made the SHAPE of the list depend
 * on the language: three headings in English, two in Arabic, four in French,
 * because collision is a property of a translation rather than of the grouping.
 * Deciding per category instead did not escape it either -- the Arabic heading
 * for alumetal is ألوميتال, which is exactly its own first row. That left one
 * heading in thirty-four rows, which reads as an accident rather than
 * structure.
 *
 * So: none. The first row of each group is a better heading than the heading --
 * a full row with an icon and a touch target, rather than a small grey caption
 * -- and for a professional who does not read fluently that is the stronger
 * signal, not the weaker one. The grouping itself is unchanged; the spacing
 * between sections carries it, which is what it was already doing for the
 * seventeen categories that never had a heading to lose.
 *
 * Pinned by scripts/profession-audience.test.mts.
 */

export function professionLabel(
  key: string,
  language: Language,
  audience: ProfessionAudience,
): string {
  const profession = professionByKey.get(key) ?? withdrawnByKey.get(key);
  if (profession) {
    return audience === 'professional'
      ? profession.work[language]
      : profession.person[language];
  }
  // A key from before this taxonomy existed. The legacy strings are person
  // nouns, which is the safer of the two to show either audience: a
  // professional reading "Plumber" is a wording miss, where a customer reading
  // "Plumbing" for a person is a wrong sentence.
  const legacy = (translations[language] as Record<string, unknown>)[key];
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
/**
 * Every word that finds a profession: both nouns, in all three languages.
 *
 * The list shows work labels, so "plumbing" has to find it. A professional who
 * has always called themselves a plumber will type "plumber". And an Egyptian
 * with an English keyboard active will type either one into an Arabic screen —
 * which used to find nothing, because search compared against the current
 * language alone and so told them Warsha does not offer their trade.
 *
 * None of these six is an alias in the sense of a second vocabulary to keep in
 * step. They are the taxonomy's own approved labels, and matching on one never
 * changes what is shown: the row still renders the label for the reader's
 * language and audience. They are how the query gets in, not what comes out.
 */
export function professionSearchTerms(profession: ProfessionOption): SearchTerm[] {
  return SEARCH_LANGUAGES.flatMap((language) => [
    { text: profession.work[language], language },
    { text: profession.person[language], language },
  ]);
}

const searchableProfessions = (): Searchable<ProfessionOption>[] => [...professions]
  .sort(byServiceDemand(
    profession => profession.categoryId,
    (left, right) => (professionIndex.get(left.key) ?? 0) - (professionIndex.get(right.key) ?? 0)))
  .map((profession) => ({ entity: profession, terms: professionSearchTerms(profession) }));

export function listProfessions(language: Language, query = ''): ProfessionOption[] {
  /*
   * Demand order first, then the query.
   *
   * `searchRanked` keeps the order it was given wherever two entries score the
   * same, so ranking by relevance does not throw away the ranking by how common
   * a trade is. With no query it returns the list untouched, which is the right
   * answer when nobody is searching: browsing is not searching.
   */
  return searchRanked(query, searchableProfessions(), language);
}

/**
 * The words to hand a search that runs somewhere else — the provider search in
 * the database, which matches service and category names in all three languages
 * but has no way to know that "plumber" and "سباك" are one trade.
 */
export function expandProfessionQuery(query: string, language: Language): string[] {
  return expandQueryTerms(query, searchableProfessions(), language);
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
