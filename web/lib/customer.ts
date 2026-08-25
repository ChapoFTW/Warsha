/**
 * The customer's own product, read from the authorities the app already uses.
 *
 * Every RPC named here is called by `src/marketplace-intelligence/
 * supabase-marketplace-repository.ts` with the same arguments. That file is the
 * reference, not a similar-looking one: a request created on a phone and a
 * request created in a browser go through one function, so there is nothing to
 * keep in step.
 *
 *   get_marketplace_catalog_v2()          categories, services, providers
 *   get_discovery_home(governorate)       available / trusted / saved / recent
 *   create_marketplace_request(req, key)  one request, idempotent
 *   get_customer_marketplace_request(id)  one request, with its own deadlines
 *   get_customer_quotes(id, sort)         quotes, sorted server-side
 *   select_worker_quote(...)              choose, with optimistic concurrency
 *   confirm_selected_quote(...)           worker confirms the customer's choice
 *   cancel_marketplace_request(...)       stop asking
 *   set_default_address(id)               which address is used by default
 *
 * Addresses and bookings are read through their own row-level security rather
 * than an RPC, because that is the governing authority for both:
 * `addresses.customer_id = auth.uid()` and the equivalent on `bookings`.
 *
 * **Money is minor units, and it stays a string.** `priceMinor` crosses as a
 * number in this payload, but it is formatted through the shared money module
 * rather than divided here.
 */

/** `create_marketplace_request` accepts exactly these three flows. */
export const FLOW_KINDS = ['browse_worker', 'get_quotes', 'emergency'] as const;
export type FlowKind = typeof FLOW_KINDS[number];

/** …and exactly these four schedules. */
export const SCHEDULE_KINDS = ['asap', 'today', 'scheduled', 'flexible'] as const;
export type ScheduleKind = typeof SCHEDULE_KINDS[number];

/** `length(btrim(issueDescription)) between 8 and 2000`. */
export const ISSUE_MIN = 8;
export const ISSUE_MAX = 2000;
export const NOTES_MAX = 2000;

/** `length(p_idempotency_key) between 16 and 200` — wider than elsewhere. */
export const REQUEST_KEY_MIN = 16;

export function issueValid(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= ISSUE_MIN && trimmed.length <= ISSUE_MAX;
}

/**
 * A key long enough for this particular function.
 *
 * `create_marketplace_request` demands at least sixteen characters where the
 * support and staff RPCs accept eight. A UUID is thirty-six, so this clears it;
 * the fallback is padded rather than assumed.
 */
export function newRequestKey(): string {
  const key = globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return key.length >= REQUEST_KEY_MIN ? key : key.padEnd(REQUEST_KEY_MIN, '0');
}

/** The sorts `get_customer_quotes` implements. Anything else falls back to submission order. */
export const QUOTE_SORTS = [
  'best_value', 'lowest_price', 'highest_rated', 'closest',
  'fastest_arrival', 'most_experienced',
] as const;
export type QuoteSort = typeof QUOTE_SORTS[number];

// ---------------------------------------------------------------------------
// Catalog and discovery
// ---------------------------------------------------------------------------

export type ServiceCategory = {
  id: string;
  translationKey: string;
  iconName: string | null;
  descriptionKey: string | null;
};

export type Service = {
  id: string;
  categoryId: string;
  /**
   * The English name the row carries.
   *
   * A fallback, never what is shown when a key resolves: rows written before
   * keys existed have only this, and showing it to an Arabic customer is the
   * defect the key exists to fix.
   */
  name: string;
  /** Stable machine identity, resolved to a localized label by the shared catalogue. */
  translationKey: string | null;
};

export type ProviderCard = {
  id: string;
  displayName: string;
  professionKey: string | null;
  primaryCategoryId: string | null;
  ratingAverage: number | null;
  reviewCount: number;
  completedJobs: number;
  experienceYears: number | null;
  startingPriceEgp: number | null;
  identityVerified: boolean;
  skillCertificateVerified: boolean;
  professionalCertificateVerified: boolean;
  isAvailable: boolean;
  emergencyAvailable: boolean;
  responseTimeLabel: string | null;
};

const record = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const int = (value: unknown): number => (typeof value === 'number' ? value : 0);
const bool = (value: unknown): boolean => value === true;

import {
  byServiceDemand, isLegacyCategory,
} from '../../src/services/service-catalogue.ts';

export function parseCategories(value: unknown): ServiceCategory[] {
  const raw = record(value);
  const list = Array.isArray(raw.categories) ? raw.categories : [];
  return list.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string') return [];
    return [{
      id: row.id,
      // The server sends snake_case here and camelCase elsewhere. Both are its
      // choice; neither is corrected, only read.
      translationKey: str(row.translation_key) ?? row.id,
      iconName: str(row.icon_name),
      descriptionKey: str(row.description_key),
    }];
  })
    // Withdrawn categories never reach a chooser, and what remains is in the
    // shared demand order rather than whatever order the server sent.
    //
    // The server is the authority and this is not a second one: it filters the
    // same withdrawn set the migration deactivates, from the same module
    // Android and iOS read. It matters because the two can be out of step --
    // a client that shipped before the migration ran would otherwise keep
    // offering the catch-all.
    .filter((category) => !isLegacyCategory(category.id))
    .sort(byServiceDemand((category) => category.id));
}

export function parseServices(value: unknown): Service[] {
  const raw = record(value);
  const list = Array.isArray(raw.services) ? raw.services : [];
  return list.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string' || typeof row.category_id !== 'string') return [];
    return [{
      id: row.id,
      categoryId: row.category_id,
      translationKey: str(row.translation_key),
      name: str(row.name) ?? row.id,
    }];
  });
}

export function parseProviderCards(value: unknown): ProviderCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string') return [];
    return [{
      id: row.id,
      displayName: str(row.displayName) ?? '',
      professionKey: str(row.professionKey),
      primaryCategoryId: str(row.primaryCategoryId),
      ratingAverage: num(row.ratingAverage),
      reviewCount: int(row.reviewCount),
      completedJobs: int(row.completedJobs),
      experienceYears: num(row.experienceYears),
      startingPriceEgp: num(row.startingPriceEgp),
      identityVerified: bool(row.identityVerified),
      skillCertificateVerified: bool(row.skillCertificateVerified),
      professionalCertificateVerified: bool(row.professionalCertificateVerified),
      isAvailable: bool(row.isAvailable),
      emergencyAvailable: bool(row.emergencyAvailable),
      responseTimeLabel: str(row.responseTimeLabel),
    }];
  });
}

export type DiscoveryHome = {
  personalized: boolean;
  availableNearby: ProviderCard[];
  trustedWorkers: ProviderCard[];
  favourites: ProviderCard[];
  recentlyViewed: ProviderCard[];
};

export function parseDiscoveryHome(value: unknown): DiscoveryHome {
  const raw = record(value);
  return {
    personalized: bool(raw.personalized),
    availableNearby: parseProviderCards(raw.availableNearby),
    trustedWorkers: parseProviderCards(raw.trustedWorkers),
    favourites: parseProviderCards(raw.favourites),
    recentlyViewed: parseProviderCards(raw.recentlyViewed),
  };
}

export type ProviderSearch = {
  mode: string;
  totalCount: number;
  providers: ProviderCard[];
};

export function parseProviderSearch(value: unknown): ProviderSearch {
  const raw = record(value);
  return {
    mode: str(raw.mode) ?? 'empty',
    totalCount: int(raw.totalCount),
    providers: parseProviderCards(raw.results),
  };
}

// ---------------------------------------------------------------------------
// Requests and quotes
// ---------------------------------------------------------------------------

export type MarketplaceRequestSummary = {
  id: string;
  flowKind: string;
  status: string;
  categoryId: string;
  issueDescription: string;
  scheduleKind: string;
  createdAt: string;
  expiresAt: string | null;
};

export type MarketplaceRequestDetail = MarketplaceRequestSummary & {
  notes: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  area: { governorate: string | null; district: string | null };
  selectionVersion: number;
  selectedQuoteId: string | null;
  editDeadlineAt: string | null;
  collectionNotBefore: string | null;
  confirmationDeadlineAt: string | null;
  convertedBookingId: string | null;
  quoteCount: number;
  /** Only populated by the server when the request expired. Never invented. */
  recoveryActions: string[];
};

export function parseRequestDetail(value: unknown): MarketplaceRequestDetail | null {
  const raw = record(value);
  if (typeof raw.id !== 'string') return null;
  const area = record(raw.area);
  return {
    id: raw.id,
    flowKind: str(raw.flowKind) ?? 'get_quotes',
    status: str(raw.status) ?? '',
    categoryId: str(raw.categoryId) ?? '',
    issueDescription: str(raw.issueDescription) ?? '',
    notes: str(raw.notes) ?? '',
    scheduleKind: str(raw.scheduleKind) ?? 'asap',
    requestedStartAt: str(raw.requestedStartAt),
    requestedEndAt: str(raw.requestedEndAt),
    area: { governorate: str(area.governorate), district: str(area.district) },
    selectionVersion: int(raw.selectionVersion),
    selectedQuoteId: str(raw.selectedQuoteId),
    editDeadlineAt: str(raw.editDeadlineAt),
    collectionNotBefore: str(raw.collectionNotBefore),
    expiresAt: str(raw.expiresAt),
    confirmationDeadlineAt: str(raw.confirmationDeadlineAt),
    convertedBookingId: str(raw.convertedBookingId),
    quoteCount: int(raw.quoteCount),
    recoveryActions: Array.isArray(raw.recoveryActions)
      ? raw.recoveryActions.filter((entry): entry is string => typeof entry === 'string')
      : [],
    createdAt: str(raw.createdAt) ?? '',
  };
}

export type Quote = {
  id: string;
  status: string;
  revision: number;
  providerId: string;
  workerName: string;
  workerRating: number | null;
  workerReviewCount: number;
  completedJobs: number;
  /** Minor units. Formatted by the shared money module, never divided here. */
  priceMinor: string;
  currency: string;
  proposedStartAt: string | null;
  etaMinutes: number | null;
  estimatedDurationMinutes: number | null;
  message: string;
  laborIncluded: boolean;
  materialsInclusion: string;
  materialsExplanation: string;
  warrantyDays: number | null;
  supportedPaymentMethods: string[];
  submittedAt: string | null;
};

export function parseQuotes(value: unknown): Quote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string') return [];
    return [{
      id: row.id,
      status: str(row.status) ?? '',
      revision: int(row.revision),
      providerId: str(row.providerId) ?? '',
      workerName: str(row.workerName) ?? '',
      workerRating: num(row.workerRating),
      workerReviewCount: int(row.workerReviewCount),
      completedJobs: int(row.completedJobs),
      priceMinor: String(row.priceMinor ?? '0'),
      currency: str(row.currency) ?? 'EGP',
      proposedStartAt: str(row.proposedStartAt),
      etaMinutes: num(row.etaMinutes),
      estimatedDurationMinutes: num(row.estimatedDurationMinutes),
      message: str(row.message) ?? '',
      laborIncluded: bool(row.laborIncluded),
      materialsInclusion: str(row.materialsInclusion) ?? '',
      materialsExplanation: str(row.materialsExplanation) ?? '',
      warrantyDays: num(row.warrantyDays),
      supportedPaymentMethods: Array.isArray(row.supportedPaymentMethods)
        ? row.supportedPaymentMethods.filter((m): m is string => typeof m === 'string')
        : [],
      submittedAt: str(row.submittedAt),
    }];
  });
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export type Address = {
  id: string;
  label: string;
  addressLine: string;
  governorate: string;
  district: string | null;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  serviceNotes: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
};

export function parseAddresses(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string') return [];
    return [{
      id: row.id,
      label: str(row.label) ?? '',
      addressLine: str(row.address_line) ?? '',
      governorate: str(row.governorate) ?? '',
      district: str(row.district),
      building: str(row.building) ?? '',
      floor: str(row.floor) ?? '',
      apartment: str(row.apartment) ?? '',
      landmark: str(row.landmark) ?? '',
      serviceNotes: str(row.service_notes) ?? str(row.instructions) ?? '',
      isDefault: bool(row.is_default),
      latitude: num(row.latitude),
      longitude: num(row.longitude),
    }];
  });
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/** The statuses `bookings_status_check` permits, in lifecycle order. */
export const BOOKING_STATUSES = [
  'draft', 'pending_provider_approval', 'accepted', 'rejected',
  'rescheduling_requested', 'confirmed', 'provider_on_the_way',
  'provider_arrived', 'job_started', 'awaiting_quote_approval',
  'work_in_progress', 'awaiting_customer_confirmation', 'completed',
  'cancelled', 'disputed', 'refunded', 'no_show',
] as const;

/** Which of those still need the customer's attention. */
const FINISHED: ReadonlySet<string> = new Set([
  'completed', 'cancelled', 'rejected', 'refunded', 'no_show',
]);

export function isFinished(status: string): boolean {
  return FINISHED.has(status);
}

export type Booking = {
  /** Resolved to a localized name; `serviceName` is the historical fallback. */
  serviceTranslationKey?: string | null;
  id: string;
  status: string;
  serviceName: string;
  issueDescription: string;
  scheduledDate: string;
  scheduledTime: string;
  addressSnapshot: string;
  estimatedPrice: string;
  finalPrice: string | null;
  createdAt: string;
  proposedDate: string | null;
  proposedTime: string | null;
  providerRescheduleNote: string | null;
  history: { status: string; at: string; note: string | null }[];
};

export function parseBookings(value: unknown): Booking[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.id !== 'string') return [];
    return [{
      id: row.id,
      status: str(row.status) ?? '',
      serviceName: str(row.service_name_snapshot) ?? '',
      // The key of the service this booking is for, when it is still known.
      // Null for a booking whose service predates keys, or was withdrawn.
      serviceTranslationKey: str(record(row.services).translation_key),
      issueDescription: str(row.issue_description) ?? '',
      scheduledDate: str(row.scheduled_date) ?? '',
      scheduledTime: str(row.scheduled_time) ?? '',
      addressSnapshot: str(row.address_snapshot) ?? '',
      // `numeric` arrives as a string from PostgREST, which is correct and must
      // not be turned into a float on the way past.
      estimatedPrice: String(row.estimated_price_egp ?? '0'),
      finalPrice: row.final_price_egp == null ? null : String(row.final_price_egp),
      createdAt: str(row.created_at) ?? '',
      proposedDate: str(row.proposed_scheduled_date),
      proposedTime: str(row.proposed_scheduled_time),
      providerRescheduleNote: str(row.provider_reschedule_note),
      history: Array.isArray(row.booking_status_history)
        ? row.booking_status_history.flatMap((entry) => {
          const event = record(entry);
          if (typeof event.status !== 'string' || typeof event.created_at !== 'string') return [];
          const metadata = record(event.metadata);
          return [{ status: event.status, at: event.created_at, note: str(metadata.note) }];
        }).sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
        : [],
    }];
  });
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type CustomerFailure =
  | 'rate_limited'
  | 'unavailable'
  | 'invalid'
  | 'future_time'
  | 'stale'
  | 'expired'
  | 'not_found'
  | 'failed';

/** Named from the `raise exception` lines in the marketplace functions. */
export function classifyCustomerError(message: string | undefined): CustomerFailure {
  const text = message ?? '';
  if (/too many marketplace requests|rate limit/i.test(text)) return 'rate_limited';
  if (/service unavailable|marketplace is not|not ready/i.test(text)) return 'unavailable';
  if (/choose a future time|valid flexible window/i.test(text)) return 'future_time';
  if (/revision|selection version|concurrent/i.test(text)) return 'stale';
  if (/expired/i.test(text)) return 'expired';
  if (/invalid marketplace request|invalid/i.test(text)) return 'invalid';
  if (/not found/i.test(text)) return 'not_found';
  return 'failed';
}
