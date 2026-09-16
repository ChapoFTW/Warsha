/**
 * WPS-020 search and discovery contracts.
 *
 * Import-free on purpose, so the filter/sort rules can be executed directly by
 * the Node regression suite without a bundler or a renderer.
 */

/** Every sort the server can honestly answer. `response_time` is deliberately
 * absent: `provider_profiles` stores a free-text response label and no numeric
 * value, so the option would sort by nothing. Recorded in WPS-020 §Sorting.
 *
 * `distance` is absent too, and not for want of data. The caller chooses the
 * point a discovery query is asked from, so a distance sort says which of two
 * Professionals is nearer a point of the caller's choosing — repeated, where
 * each of them is based. Proximity ranks privately inside matching and never
 * reaches a client. See docs/decisions/provider-distance-is-never-known.md. */
export const discoverySorts = ['recommended', 'rating', 'most_reviewed', 'availability'] as const;
export type DiscoverySort = (typeof discoverySorts)[number];

/** The four outcomes a search can have. The UI must distinguish all four. */
export const discoverySearchModes = ['browse', 'exact', 'approximate', 'empty'] as const;
export type DiscoverySearchMode = (typeof discoverySearchModes)[number];

export type DiscoveryFilters = {
  categoryId?: string;
  serviceId?: string;
  governorate?: string;
  minimumRating?: number;
  minimumCompletedJobs?: number;
  availableNow?: boolean;
  skillCertificateVerified?: boolean;
  professionalCertificateVerified?: boolean;
  emergencyAvailable?: boolean;
  pricingType?: string;
  language?: string;
};

export const emptyDiscoveryFilters: DiscoveryFilters = {};

export function activeFilterKeys(filters: DiscoveryFilters): (keyof DiscoveryFilters)[] {
  return (Object.keys(filters) as (keyof DiscoveryFilters)[]).filter((key) => {
    const value = filters[key];
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return true;
  });
}

export function activeFilterCount(filters: DiscoveryFilters): number {
  return activeFilterKeys(filters).length;
}

export function removeFilter(filters: DiscoveryFilters, key: keyof DiscoveryFilters): DiscoveryFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

export type DiscoveryProviderCard = {
  id: string;
  displayName: string;
  professionKey: string;
  primaryCategoryId: string | null;
  ratingAverage: number;
  reviewCount: number;
  completedJobs: number;
  experienceYears: number;
  startingPriceEgp: number | null;
  avatarRef: string | null;
  identityVerified: boolean;
  skillCertificateVerified: boolean;
  professionalCertificateVerified: boolean;
  isAvailable: boolean;
  emergencyAvailable: boolean;
  responseTimeLabel: string | null;
  areaLabel: string | null;
  languages: string[];
  specialties: string[];
};

export type DiscoverySearchResult = {
  mode: DiscoverySearchMode;
  sort: DiscoverySort;
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  rankingPolicyVersion: string | null;
  results: DiscoveryProviderCard[];
};

export type DiscoveryFilterMetadata = {
  categories: { id: string; translationKey: string }[];
  governorates: string[];
  languages: string[];
  pricingTypes: string[];
  sorts: DiscoverySort[];
  emergencyAvailable: boolean;
};

export type DiscoverySuggestions = {
  recentSearches: string[];
  suggestedCategories: { id: string; translationKey: string }[];
  /** Ranked by how many discoverable workers offer the service. Never labelled
   * "popular" in the interface: Warsha has no traffic data and will not invent
   * a popularity signal. */
  commonServices: {
    id: string;
    translationKey?: string | null;
    name: string;
    categoryId: string;
    providerCount: number;
  }[];
};

export type DiscoveryHome = {
  personalized: boolean;
  availableNearby: DiscoveryProviderCard[];
  trustedWorkers: DiscoveryProviderCard[];
  favourites: DiscoveryProviderCard[];
  recentlyViewed: DiscoveryProviderCard[];
};

/** Bounds the server also enforces; stated here so the client never sends more. */
export const discoveryPageSize = 20;
export const discoveryMaxPageSize = 50;
export const discoveryMaxOffset = 500;
export const recentSearchLimit = 10;
export const recentlyViewedLimit = 20;
export const discoveryQueryMaxLength = 100;

export function normalizeDiscoveryQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, discoveryQueryMaxLength);
}

