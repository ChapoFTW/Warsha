/**
 * The services Warsha offers, the order it offers them in, and why.
 *
 * ## No catch-all
 *
 * `general-maintenance` used to sit eighth. It was the largest category by
 * profession count — fourteen trades, including a locksmith and an aluminium
 * worker — which is the tell: it was not a service customers asked for, it was
 * the drawer everything specific got put in. A customer with a broken lock does
 * not search "general maintenance", and a locksmith listed under it is
 * invisible to the person who needs one.
 *
 * So it is gone from selection and discovery, and every trade it was hiding has
 * a concrete home. The id survives in `LEGACY_CATEGORY_IDS` because requests,
 * quotes and bookings already reference it and history must still render.
 *
 * ## This is a researched prior, not Warsha demand
 *
 * Warsha has no meaningful request traffic, so there is nothing internal to
 * rank by, and inventing a popularity signal would be worse than admitting
 * that. `DEMAND_RANK_SOURCE` says where the order came from. Nothing here may
 * ever be described to a customer as "most popular on Warsha".
 *
 * ## Evidence, August 2026 — Egyptian operators, not global rankings
 *
 *   - FilKhedma (Egypt's largest home-services platform) publishes: plumbing,
 *     air conditioning, carpentry, electricity, ALUMETAL, satellite dish,
 *     painting, home appliances, and cleaning in six varieties. Alumetal and
 *     satellite dish are Egyptian categories a global taxonomy would not
 *     produce, and both are here because of it.
 *   - Taskty (~20,000 customers, greater Cairo) leads with house cleaning, then
 *     furniture cleaning, PEST CONTROL, plumbing, electricity, carpentry and
 *     furniture moving. Pest control is a named top-level category there.
 *   - HomeRun spans 100+ categories including cleaning, moving and painting.
 *   - YalaFix leads with plumbing and electrical, then cleaning, AC and
 *     appliances, painting, carpentry.
 *   - Egypt's air-conditioner market runs USD 1.12B (2024) to a projected USD
 *     1.65B (2030) at 6.72% CAGR, against Cairo summers now exceeding 40°C.
 *   - At-home barbering is an established Egyptian product (Cut Egypt);
 *     at-home women's hairdressing exists but is thinner than the salon trade;
 *     personal styling is real but niche and event-driven.
 *
 * ## Why this order
 *
 * Cleaning is third rather than fourth because it is the one recurring service
 * here — a household books it weekly or monthly, where plumbing is booked when
 * something breaks — and it leads Taskty and sits second on FilKhedma.
 *
 * Plumbing and electrical lead it anyway because they are urgent and
 * year-round on every operator: a customer with no water is not comparison
 * shopping.
 *
 * Air conditioning is fourth despite leading FilKhedma and despite the market
 * size, because a static annual rank must not encode August. Seasonal
 * adjustment is a later refinement, not a cold-start decision.
 *
 * Locksmithing sits below the household trades on evidence — it appears on no
 * Egyptian marketplace's front page — but it is present and searchable, because
 * the moment somebody needs one it is the only thing they want.
 *
 * Personal styling is last. It is legitimate and it is niche; being new is not
 * a reason to promote it above the work Egyptian households actually call
 * somebody out for.
 *
 * ## When Warsha has real traffic
 *
 * `public.marketplace_requests.category_id` records the category of every
 * request, and the first-party reporting authority aggregates counts per
 * category per window without exposing any customer. That is the source — it is
 * staff-gated and must never be called on a customer page load. The threshold
 * and mechanism are in `docs/product/service-demand-ranking.md`. Until then
 * this order is deterministic and unchanging.
 */

/** What produced the current ranking. Mirrors `service_categories.demand_rank_source`. */
export const DEMAND_RANK_SOURCE = 'cold_start_research' as const;

export type ServiceCategoryId =
  | 'plumbing' | 'electrical' | 'cleaning' | 'ac' | 'appliance-repair'
  | 'carpentry' | 'painting' | 'moving-help' | 'pest-control'
  | 'water-heater-repair' | 'flooring-tiling' | 'renovation-finishing'
  | 'alumetal' | 'satellite-tv-installation' | 'locksmithing' | 'gardening'
  | 'barber' | 'hairdressing' | 'personal-styling';

/**
 * Every category a customer may request, in cold-start demand order.
 *
 * Ranks are unique and dense from 1. `service-catalogue.test.mts` asserts this
 * list and the migration agree, so the two cannot drift.
 */
export const SERVICE_DEMAND_ORDER: readonly ServiceCategoryId[] = [
  'plumbing',
  'electrical',
  'cleaning',
  'ac',
  'appliance-repair',
  'carpentry',
  'painting',
  'moving-help',
  'pest-control',
  'water-heater-repair',
  'flooring-tiling',
  'renovation-finishing',
  'alumetal',
  'satellite-tv-installation',
  'locksmithing',
  'gardening',
  'barber',
  'hairdressing',
  'personal-styling',
] as const;

/**
 * Categories that exist only so old records still read as words.
 *
 * `general-maintenance` was a catch-all and is withdrawn from selection and
 * discovery. It is NOT deleted: requests, quotes and bookings reference it, and
 * a customer opening a two-year-old job must not be shown a bare slug or an
 * error. Nothing may offer these for new work.
 */
export const LEGACY_CATEGORY_IDS: readonly string[] = ['general-maintenance'] as const;

const legacy = new Set<string>(LEGACY_CATEGORY_IDS);
const rankById = new Map<string, number>(
  SERVICE_DEMAND_ORDER.map((id, index) => [id, index + 1]),
);

/** Whether a customer may choose this category for new work. */
export function isSelectableCategory(categoryId: string): boolean {
  return rankById.has(categoryId);
}

/**
 * Whether this category only exists to render history.
 *
 * Separate from "unknown": an id this build has never heard of is a category
 * seeded after it shipped and must still be offered, where a legacy id is one
 * deliberately withdrawn.
 */
export function isLegacyCategory(categoryId: string): boolean {
  return legacy.has(categoryId);
}

/**
 * The rank of a category, or a value that sorts after every known one.
 *
 * An unknown id is a category seeded after this build shipped. It sorts last
 * rather than first, and is never dropped — a customer must still be able to
 * ask for it.
 */
export function serviceDemandRank(categoryId: string): number {
  return rankById.get(categoryId) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Order by demand, then by the caller's own tie-break.
 *
 * Deterministic for equal ranks, which matters because two categories can only
 * tie here if one of them is unknown to this build.
 */
export function byServiceDemand<T>(
  categoryIdOf: (item: T) => string,
  tieBreak: (left: T, right: T) => number = () => 0,
): (left: T, right: T) => number {
  return (left, right) => {
    const delta = serviceDemandRank(categoryIdOf(left)) - serviceDemandRank(categoryIdOf(right));
    return delta !== 0 ? delta : tieBreak(left, right);
  };
}

/**
 * What a customer may be offered, in order.
 *
 * One function so no surface has to remember that withdrawn categories exist:
 * discovery, request creation and worker trade selection all filter through
 * this rather than each keeping its own exclusion list.
 */
export function selectableCategories<T>(
  items: readonly T[],
  categoryIdOf: (item: T) => string,
  tieBreak: (left: T, right: T) => number = () => 0,
): T[] {
  return items
    .filter((item) => !isLegacyCategory(categoryIdOf(item)))
    .slice()
    .sort(byServiceDemand(categoryIdOf, tieBreak));
}

/**
 * The translation key `public.service_categories` stores for each category.
 *
 * A request row carries only `category_id`. Any surface that lists requests --
 * the customer's own list, a worker's invitation card -- therefore has an
 * identifier and needs a name, and without this map the only thing it can show
 * is the identifier itself. Web's request list did exactly that, rendering
 * `water-heater-repair` to every reader in every language.
 *
 * `general-maintenance` is included deliberately: it is withdrawn from
 * selection but old requests still reference it, and those must read as words.
 *
 * `service-catalogue.test.mts` asserts this agrees with the seeded rows, so the
 * map cannot drift from the database it describes.
 */
const categoryTranslationKeys: Record<string, string> = {
  'plumbing': 'plumbing',
  'electrical': 'electrical',
  'cleaning': 'cleaning',
  'ac': 'acRepair',
  'appliance-repair': 'applianceRepair',
  'carpentry': 'carpentry',
  'painting': 'painting',
  'moving-help': 'movingHelp',
  'pest-control': 'pestControl',
  'water-heater-repair': 'waterHeaterRepair',
  'flooring-tiling': 'flooringTiling',
  'renovation-finishing': 'renovationFinishing',
  'alumetal': 'alumetal',
  'satellite-tv-installation': 'satelliteTv',
  'locksmithing': 'locksmithing',
  'gardening': 'gardening',
  'barber': 'barber',
  'hairdressing': 'hairdressing',
  'personal-styling': 'personalStyling',
  'general-maintenance': 'generalMaintenance',
};

/**
 * The translation key for a category id, or the id when it is unrecognised.
 *
 * Returning the id keeps `serviceCategoryLabel` able to humanize it into words
 * rather than leaving a caller holding a slug.
 */
export function serviceCategoryTranslationKey(categoryId: string): string {
  return categoryTranslationKeys[categoryId] ?? categoryId;
}
