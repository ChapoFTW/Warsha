import { isLegacyCategory, serviceDemandRank } from '../services/service-catalogue.ts';
import { orderedCatalogueServices, type CatalogueServiceRow } from '../services/specific-services.ts';
import {
  isSelectableProfession,
  professionServiceCategoryIds,
  professionServiceKeys,
  selectedProfessionKeys,
  withSelectedProfessions,
  type ProfessionKey,
} from './profession-taxonomy.ts';
import type { ProviderDraft, ProviderServiceInput } from './provider-types.ts';

/**
 * The one derivation of "which jobs may this worker say they do?".
 *
 * ## What this replaces
 *
 * Every worker surface used to render `listProviderServiceOptions()` -- the
 * whole active catalogue, 171 rows, ordered by the server's `order by s.name`
 * -- as a single flat cloud of chips, on the same screen as the profession
 * chooser and with no relationship between the two. Web did it, Android and iOS
 * did it, and the worker profile editor did it a fourth time. So the product
 * asked a plumber to certify, one tap at a time, that they do not offer bridal
 * styling, and it asked them in alphabetical English.
 *
 * Grouping is not a rendering detail, so it does not live in a screen. A
 * profession's categories, the ordering inside them, and what happens to a
 * selection when its profession is removed are product rules; they live here,
 * once, and every surface calls them.
 *
 * ## Rows in, rows out
 *
 * `CatalogueServiceRow` is structural rather than an imported model, matching
 * `orderedCatalogueServices`: web's `Service` and the mobile `Service` are
 * different types that agree on the four fields that matter, and neither
 * surface should have to depend on the other's model to group a list.
 */

/** One selected profession and the work it may offer, ready to render. */
export type TradeSection<T extends CatalogueServiceRow> = {
  professionKey: ProfessionKey;
  /** Catalogue rows for this trade, in shared catalogue order, deduplicated. */
  services: T[];
  /** The subset of `services` this draft currently offers. */
  selectedServiceIds: string[];
};

/**
 * The catalogue rows one profession may offer, in the shared order.
 *
 * A profession that reaches several categories gets them concatenated in
 * demand order rather than interleaved, so an appliance technician reads
 * "appliance repair jobs, then water-heater jobs" rather than a merged list in
 * which neither group is legible.
 *
 * A row can be reachable through two of the trade's categories only if the
 * catalogue itself put it in two categories, which it cannot -- but the
 * deduplication is kept because the same row may be reachable through two
 * different SELECTED professions, and a service must never render twice inside
 * one section.
 */
export function professionCatalogueServices<T extends CatalogueServiceRow>(
  professionKey: string,
  catalogue: readonly T[],
): T[] {
  const seen = new Set<string>();
  const allowedKeys = new Set(professionServiceKeys(professionKey));
  const rows: T[] = [];
  for (const categoryId of professionServiceCategoryIds(professionKey)) {
    for (const row of orderedCatalogueServices(catalogue, categoryId)) {
      if (!row.translationKey || !allowedKeys.has(row.translationKey)) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

/** Every service id any of these professions may offer. */
export function offerableServiceIds<T extends CatalogueServiceRow>(
  professionKeys: readonly string[],
  catalogue: readonly T[],
): Set<string> {
  const ids = new Set<string>();
  for (const key of professionKeys) {
    for (const row of professionCatalogueServices(key, catalogue)) ids.add(row.id);
  }
  return ids;
}

/**
 * The sections Step 3 renders: one per selected trade, in ranked order.
 *
 * Returns nothing for a draft with no trade yet, which is what makes the screen
 * ask the questions in order -- profession first, then the work -- instead of
 * showing both at once.
 */
export function tradeSections<T extends CatalogueServiceRow>(
  draft: Pick<ProviderDraft, 'profession' | 'specialties' | 'services'>,
  catalogue: readonly T[],
): TradeSection<T>[] {
  return selectedProfessionKeys(draft).map(professionKey => {
    const services = professionCatalogueServices(professionKey, catalogue);
    const offered = new Set(draft.services.map(item => item.serviceId));
    return {
      professionKey,
      services,
      selectedServiceIds: services.filter(row => offered.has(row.id)).map(row => row.id),
    };
  });
}

/**
 * Saved services that cannot be placed under one of the worker's current
 * selectable trades.
 *
 * These rows are compatibility evidence, not selectable options. The old flat
 * catalogue deliberately allowed any service under any profession, and a
 * withdrawn catch-all trade has no current section at all. Hiding those rows
 * would make an existing profile look as though Warsha had deleted work it
 * still stores. Every surface therefore shows them read-only until the worker
 * chooses current trades, at which point `withTradeSelection` deliberately
 * prunes services those trades cannot offer.
 */
export function historicalOfferedServices<T extends CatalogueServiceRow>(
  draft: Pick<ProviderDraft, 'profession' | 'specialties' | 'services'>,
  catalogue: readonly T[],
): ProviderServiceInput[] {
  const offerable = offerableServiceIds(selectedProfessionKeys(draft), catalogue);
  return draft.services.filter(service => !offerable.has(service.serviceId));
}

/**
 * Record a trade selection, dropping any service the new selection cannot
 * offer.
 *
 * The stale-selection rule the old screen had no place to put: choose Plumber,
 * take Leak repair, add Electrician, take Socket repair, then remove Plumber --
 * and the two plumbing services have to leave the payload with it, or the
 * worker is silently saved as offering work they just said they do not do.
 *
 * `categoryIds` is rebuilt rather than accumulated. The home category of each
 * selected trade comes first, so `categoryIds[0]` -- which the save RPC stores
 * as `primary_category_id` -- is the worker's actual primary trade; then any
 * further category they kept a service in, so a plumber who also fits water
 * heaters is discoverable under both. A withdrawn category can never enter,
 * whatever a stale draft is carrying.
 */
export function withTradeSelection<
  T extends Pick<ProviderDraft, 'profession' | 'specialties' | 'categoryIds' | 'services'>,
  R extends CatalogueServiceRow,
>(
  draft: T,
  professionKeys: readonly string[],
  catalogue: readonly R[],
): T {
  const selected = [...new Set(professionKeys.filter(isSelectableProfession))].slice(0, 10);
  const withProfessions = withSelectedProfessions(draft, selected);
  const offerable = offerableServiceIds(selected, catalogue);
  const services = draft.services.filter(item => offerable.has(item.serviceId));
  const categoryOf = new Map(catalogue.map(row => [row.id, row.categoryId]));
  const keptCategories = services
    .map(item => categoryOf.get(item.serviceId) ?? '')
    .filter(categoryId => categoryId && !isLegacyCategory(categoryId))
    .sort((left, right) => serviceDemandRank(left) - serviceDemandRank(right));
  return {
    ...withProfessions,
    services,
    categoryIds: [...new Set([...withProfessions.categoryIds, ...keptCategories])].slice(0, 10),
  };
}

/**
 * Add or remove one offered service, keeping `categoryIds` truthful.
 *
 * Toggling goes through the same rebuild as profession selection so a worker
 * who takes their last water-heater job back off the list stops being
 * discoverable for water heaters, without any screen having to know that rule.
 */
export function withOfferedService<
  T extends Pick<ProviderDraft, 'profession' | 'specialties' | 'categoryIds' | 'services'>,
  R extends CatalogueServiceRow,
>(
  draft: T,
  service: R,
  offered: boolean,
  catalogue: readonly R[],
): T {
  const others = draft.services.filter(item => item.serviceId !== service.id);
  const services = offered
    ? [...others, {
        serviceId: service.id,
        translationKey: service.translationKey ?? null,
        name: service.name,
      }]
    : others;
  return withTradeSelection({ ...draft, services }, selectedProfessionKeys(draft), catalogue);
}

/**
 * Offer, or stop offering, every job under one profession.
 *
 * Per profession rather than globally: "select all" across nineteen categories
 * is how a worker ends up matched to work they cannot do, but within one trade
 * it is the honest common case -- a plumber who does all fifteen plumbing jobs
 * should not have to tap fifteen times to say so.
 */
export function withProfessionServices<
  T extends Pick<ProviderDraft, 'profession' | 'specialties' | 'categoryIds' | 'services'>,
  R extends CatalogueServiceRow,
>(
  draft: T,
  professionKey: string,
  offered: boolean,
  catalogue: readonly R[],
): T {
  const rows = professionCatalogueServices(professionKey, catalogue);
  const ids = new Set(rows.map(row => row.id));
  const others = draft.services.filter(item => !ids.has(item.serviceId));
  const services = offered
    ? [...others, ...rows.map(row => ({
        serviceId: row.id,
        translationKey: row.translationKey ?? null,
        name: row.name,
      }))]
    : others;
  return withTradeSelection({ ...draft, services }, selectedProfessionKeys(draft), catalogue);
}

/**
 * Why Step 3 cannot be saved yet, or `null` when it can.
 *
 * Two distinct answers, because they need two distinct sentences. "Select at
 * least one profession" and "Choose at least one service you offer" were both
 * rendered as "Please complete this step first", which tells a worker who has
 * chosen a trade and no jobs precisely nothing.
 *
 * One service overall, not one per trade: matching invites a worker to a
 * request through the category, and requiring a job under every selected trade
 * would block a plumber who fits water heaters occasionally from saying so.
 */
export function tradeSelectionProblem(
  draft: Pick<ProviderDraft, 'profession' | 'specialties' | 'services'>,
): 'profession_required' | 'service_required' | null {
  if (selectedProfessionKeys(draft).length === 0) return 'profession_required';
  if (draft.services.length === 0) return 'service_required';
  return null;
}
