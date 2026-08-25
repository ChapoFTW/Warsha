import { serviceCategoryLabel } from '../i18n/service-labels.ts';
import type { Language } from '../i18n/translations.ts';
import { serviceCategoryTranslationKey } from '../services/service-catalogue.ts';
import {
  catalogueServiceLabel,
  type CatalogueServiceName,
} from '../services/specific-services.ts';

/**
 * What a request is for, in the reader's language.
 *
 * A request stores a `category_id` and an optional service UUID, and every
 * surface that lists requests needs to turn that pair into words: the
 * customer's own request screen, a worker's invitation card, a worker's quote
 * screen. Three screens, one rule -- so it is written once here rather than
 * three times, which is how one of them ends up fixed and the others do not.
 *
 * Both worker screens previously rendered `t(invitation.categoryId)`, passing
 * an id where a translation key belongs. Category keys are camelCase, so the
 * nine categories whose id is not (`water-heater-repair`, `pest-control`,
 * `moving-help`, and six more) missed the catalogue entirely and, because `t`
 * returns the raw lookup, rendered as nothing at all. A worker was shown an
 * invitation with no trade on it.
 *
 * Nothing here can produce a slug: an unrecognised category is humanized into
 * words, and a service whose key predates the catalogue keeps its stored name.
 */
export function requestWorkLabel(
  request: { categoryId: string; serviceId?: string | null },
  catalogue: readonly (CatalogueServiceName & { id: string })[],
  language: Language,
): string {
  const category = serviceCategoryLabel(
    serviceCategoryTranslationKey(request.categoryId), language, request.categoryId,
  );
  const service = request.serviceId
    ? catalogue.find((item) => item.id === request.serviceId)
    : undefined;
  return service ? `${category} · ${catalogueServiceLabel(service, language)}` : category;
}
