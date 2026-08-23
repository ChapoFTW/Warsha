/**
 * The order Warsha offers services in, and why it is that order.
 *
 * Until now every surface rendered `service_categories` in `sort_order`, which
 * was curation order from the launch seed — effectively the order somebody
 * typed them in. That is fine for an admin table and wrong for a customer who
 * is choosing what to ask for. Two places were worse: `get_search_suggestions`
 * selected the top categories by `sort_order` and then re-aggregated them
 * alphabetically, throwing its own ordering away, and `listProfessions` sorted
 * worker trades A-Z by localized label, so the list differed between English
 * and Arabic for no reason a worker could see.
 *
 * ## This is a researched prior, not Warsha demand
 *
 * Warsha has no meaningful request traffic yet, so there is nothing internal to
 * rank by, and inventing a popularity signal would be worse than admitting
 * that. `get_search_suggestions` already says so in as many words, and this
 * module keeps that promise: the ranks below come from Egyptian market
 * evidence, and `DEMAND_RANK_SOURCE` says which. Nothing here should ever be
 * described to a user as "most popular on Warsha".
 *
 * Evidence, August 2026:
 *
 *   - FilKhedma, Egypt's largest home-services platform, leads with A/C, then
 *     cleaning, plumbing, carpentry, electricity.
 *   - YalaFix leads with plumbing, electrical, then cleaning, AC & appliances,
 *     painting, carpentry, general repairs.
 *   - Egypt's air-conditioner market runs USD 1.12B (2024) to a projected USD
 *     1.65B (2030) at 6.72% CAGR, against Cairo summers now exceeding 40°C.
 *   - At-home barbering is an established Egyptian product (Cut Egypt delivers
 *     haircuts to homes and offices); at-home women's hairdressing exists but
 *     is thinner than the salon trade; personal styling is real but niche and
 *     event-driven.
 *
 * Plumbing leads rather than air conditioning because it is urgent and
 * year-round on both operators, where air conditioning is seasonal — a static
 * annual rank should not encode August. Seasonal adjustment is a later
 * refinement, not a cold-start decision.
 *
 * The grooming services sit below every household trade deliberately. They are
 * a legitimate hyperlocal category and they are new; neither is a reason to put
 * them above the work Egyptian households actually call somebody out for.
 *
 * ## When Warsha has real traffic
 *
 * `public.marketplace_requests.category_id` already records the category of
 * every request, and the first-party reporting authority already aggregates
 * counts per category per window without exposing any customer. That is the
 * source to use — but it is staff-gated and must never be called on a customer
 * page load. See `docs/product/service-demand-ranking.md` for the threshold and
 * the mechanism. Until then this order is deterministic and unchanging.
 */

/** What produced the current ranking. Mirrors `service_categories.demand_rank_source`. */
export const DEMAND_RANK_SOURCE = 'cold_start_research' as const;

export type ServiceCategoryId =
  | 'plumbing' | 'electrical' | 'ac' | 'cleaning' | 'appliance-repair'
  | 'carpentry' | 'painting' | 'general-maintenance' | 'moving-help'
  | 'barber' | 'hairdressing' | 'satellite-tv-installation' | 'personal-styling';

/**
 * Every active customer-requestable category, in cold-start demand order.
 *
 * Ranks are unique and dense from 1. `service-catalogue.test.mts` asserts this
 * list and the migration agree, so the two cannot drift.
 */
export const SERVICE_DEMAND_ORDER: readonly ServiceCategoryId[] = [
  'plumbing',
  'electrical',
  'ac',
  'cleaning',
  'appliance-repair',
  'carpentry',
  'painting',
  'general-maintenance',
  'moving-help',
  'barber',
  'hairdressing',
  'satellite-tv-installation',
  'personal-styling',
] as const;

const rankById = new Map<string, number>(
  SERVICE_DEMAND_ORDER.map((id, index) => [id, index + 1]),
);

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
