// Relative, with an explicit extension, on purpose: the WPS-020 regression suite
// loads this module directly in Node, which resolves no bundler alias. Metro
// treats both forms identically.
import { categories as mockCategories, providers as mockProviders } from '../data/mock-data.ts';

import {
  activeFilterCount,
  discoveryPageSize,
  normalizeDiscoveryQuery,
  recentSearchLimit,
  recentlyViewedLimit,
  type DiscoveryFilterMetadata,
  type DiscoveryFilters,
  type DiscoveryHome,
  type DiscoveryProviderCard,
  type DiscoverySearchMode,
  type DiscoverySearchResult,
  type DiscoverySort,
  type DiscoverySuggestions,
} from './discovery-types.ts';

/**
 * WPS-020 Mock discovery.
 *
 * It reads the SAME mock catalog every other Mock surface reads, rather than a
 * private dataset — so a worker seen on the home screen is the worker found by
 * search, with the same rating and the same area. A second dataset would give
 * Mock its own reality and quietly stop testing anything.
 *
 * Per-account state (recent searches, recently viewed) is keyed by account, so
 * switching accounts in Mock isolates history exactly as the database does.
 */

type MockAccount = {
  recentSearches: string[];
  recentlyViewed: string[];
};

const accounts = new Map<string, MockAccount>();

function account(key: string): MockAccount {
  let entry = accounts.get(key);
  if (!entry) {
    entry = { recentSearches: [], recentlyViewed: [] };
    accounts.set(key, entry);
  }
  return entry;
}

export function resetMockDiscovery() {
  accounts.clear();
}

function toCard(provider: (typeof mockProviders)[number], distanceKm: number | null): DiscoveryProviderCard {
  return {
    id: provider.id,
    displayName: provider.name,
    professionKey: provider.profession,
    primaryCategoryId: provider.categoryId,
    ratingAverage: provider.rating,
    reviewCount: provider.reviewCount,
    completedJobs: provider.completedJobs,
    experienceYears: provider.experienceYears,
    startingPriceEgp: provider.price,
    avatarRef: provider.image,
    identityVerified: provider.verified,
    skillCertificateVerified: Boolean(provider.skillCertificateVerified),
    professionalCertificateVerified: Boolean(provider.professionalCertificateVerified),
    isAvailable: provider.available,
    emergencyAvailable: Boolean(provider.emergencyAvailable),
    responseTimeLabel: provider.responseTime,
    areaLabel: provider.location,
    languages: [...provider.languages],
    specialties: [...provider.skills],
    distanceKm,
  };
}

/**
 * The same recommendation shape the server applies: rating weight, logarithmic
 * experience confidence, and a distance term only when distance is known. Mock
 * cannot read `private.marketplace_configuration`, so it uses the policy's
 * published defaults and says so here rather than pretending to consult it.
 */
function recommendedScore(provider: (typeof mockProviders)[number], distanceKm: number | null): number {
  const rating = Math.min(1, provider.rating / 5) * 0.45;
  const experience = Math.min(1, Math.log(provider.completedJobs + 1) / Math.log(101)) * 0.2;
  const radius = provider.serviceRadius || 50;
  const distance = distanceKm === null ? 0 : Math.max(0, 1 - distanceKm / radius) * 0.27;
  const newWorker = provider.completedJobs === 0 ? 0.04 : 0;
  return rating + experience + distance + newWorker;
}

function matchesQuery(provider: (typeof mockProviders)[number], query: string): boolean {
  if (!query) return true;
  const haystack = [
    provider.name,
    provider.location,
    provider.about,
    provider.profession,
    ...provider.skills,
    ...provider.services.map(service => service.name),
  ].join(' ').toLowerCase();
  return query.split(' ').every(token => haystack.includes(token));
}

/** Bounded approximate pass, mirroring the server's "only when exact found nothing". */
function approximatelyMatches(provider: (typeof mockProviders)[number], query: string): boolean {
  const candidates = [provider.name, ...provider.skills].map(value => value.toLowerCase());
  return candidates.some(candidate => candidate.split(/\s+/).some(word => similarity(query, word) > 0.5));
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const grams = (value: string) => {
    const padded = ` ${value} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3));
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function passesFilters(provider: (typeof mockProviders)[number], filters: DiscoveryFilters): boolean {
  if (filters.categoryId && provider.categoryId !== filters.categoryId
    && !(provider.categoryIds ?? []).includes(filters.categoryId)) return false;
  if (filters.serviceId && !provider.services.some(service => service.id === filters.serviceId)) return false;
  if (filters.governorate && !(provider.location ?? '').includes(filters.governorate)) return false;
  if (filters.minimumRating && provider.rating < filters.minimumRating) return false;
  if (filters.minimumCompletedJobs && provider.completedJobs < filters.minimumCompletedJobs) return false;
  if (filters.availableNow && !provider.available) return false;
  if (filters.skillCertificateVerified && !provider.skillCertificateVerified) return false;
  if (filters.professionalCertificateVerified && !provider.professionalCertificateVerified) return false;
  if (filters.emergencyAvailable && !provider.emergencyAvailable) return false;
  if (filters.pricingType && !provider.services.some(service => service.pricingType === filters.pricingType)) return false;
  if (filters.language && !provider.languages.includes(filters.language)) return false;
  if (filters.maximumDistanceKm !== undefined && provider.distance > filters.maximumDistanceKm) return false;
  return true;
}

export function mockSearch(
  query: string,
  filters: DiscoveryFilters,
  sort: DiscoverySort,
  limit = discoveryPageSize,
  offset = 0,
): DiscoverySearchResult {
  const normalized = normalizeDiscoveryQuery(query).toLowerCase();
  let mode: DiscoverySearchMode = normalized ? 'exact' : 'browse';

  const eligible = mockProviders.filter(provider => passesFilters(provider, filters));
  let matched = eligible.filter(provider => matchesQuery(provider, normalized));

  if (mode === 'exact' && matched.length === 0) {
    const approximate = eligible.filter(provider => approximatelyMatches(provider, normalized));
    if (approximate.length) {
      matched = approximate;
      mode = 'approximate';
    } else {
      mode = 'empty';
    }
  }

  const located = filters.latitude !== undefined && filters.longitude !== undefined;
  const withDistance = matched.map(provider => ({
    provider,
    distanceKm: located ? provider.distance : null,
  }));

  withDistance.sort((a, b) => {
    if (sort === 'distance') return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    if (sort === 'rating') return b.provider.rating - a.provider.rating;
    if (sort === 'most_reviewed') return b.provider.reviewCount - a.provider.reviewCount;
    if (sort === 'availability') return Number(b.provider.available) - Number(a.provider.available);
    return recommendedScore(b.provider, b.distanceKm) - recommendedScore(a.provider, a.distanceKm);
  });

  const page = withDistance.slice(offset, offset + limit);
  return {
    mode,
    sort,
    totalCount: withDistance.length,
    limit,
    offset,
    hasMore: offset + limit < withDistance.length,
    rankingPolicyVersion: 'best-value-v1',
    results: page.map(entry => toCard(entry.provider, entry.distanceKm)),
  };
}

export function mockFilterMetadata(): DiscoveryFilterMetadata {
  const governorates = [...new Set(mockProviders.map(p => (p.location ?? '').split(',').pop()?.trim()).filter(Boolean))] as string[];
  const languages = [...new Set(mockProviders.flatMap(p => p.languages))].sort();
  const pricingTypes = [...new Set(mockProviders.flatMap(p => p.services.map(s => s.pricingType)))].sort();
  return {
    categories: mockCategories
      .filter(category => mockProviders.some(p => p.categoryId === category.id))
      .map(category => ({ id: category.id, translationKey: category.label, iconName: category.icon })),
    governorates: governorates.sort(),
    languages,
    pricingTypes,
    sorts: ['recommended', 'distance', 'rating', 'most_reviewed', 'availability'],
    distanceRequiresLocation: true,
    emergencyAvailable: mockProviders.some(p => p.emergencyAvailable),
  };
}

export function mockSuggestions(accountKey: string | null): DiscoverySuggestions {
  const counts = new Map<string, { name: string; translationKey?: string | null; categoryId: string; count: number }>();
  for (const provider of mockProviders) {
    for (const service of provider.services) {
      const entry = counts.get(service.id) ?? {
        name: service.name,
        translationKey: service.translationKey,
        categoryId: provider.categoryId,
        count: 0,
      };
      entry.count += 1;
      counts.set(service.id, entry);
    }
  }
  return {
    recentSearches: accountKey ? [...account(accountKey).recentSearches] : [],
    suggestedCategories: mockCategories.slice(0, 8)
      .map(category => ({ id: category.id, translationKey: category.label, iconName: category.icon })),
    commonServices: [...counts.entries()]
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        translationKey: entry.translationKey,
        categoryId: entry.categoryId,
        providerCount: entry.count,
      }))
      .sort((a, b) => b.providerCount - a.providerCount || a.name.localeCompare(b.name))
      .slice(0, 8),
  };
}

export function mockRecordSearch(accountKey: string, query: string) {
  const value = normalizeDiscoveryQuery(query);
  if (!value) return;
  const entry = account(accountKey);
  entry.recentSearches = [value, ...entry.recentSearches.filter(item => item.toLowerCase() !== value.toLowerCase())]
    .slice(0, recentSearchLimit);
}

export function mockClearSearches(accountKey: string) {
  account(accountKey).recentSearches = [];
}

export function mockRecordView(accountKey: string, providerId: string) {
  if (!mockProviders.some(provider => provider.id === providerId)) return;
  const entry = account(accountKey);
  entry.recentlyViewed = [providerId, ...entry.recentlyViewed.filter(id => id !== providerId)]
    .slice(0, recentlyViewedLimit);
}

export function mockRecentlyViewed(accountKey: string | null): DiscoveryProviderCard[] {
  if (!accountKey) return [];
  return account(accountKey).recentlyViewed
    .map(id => mockProviders.find(provider => provider.id === id))
    .filter((provider): provider is (typeof mockProviders)[number] => Boolean(provider))
    .map(provider => toCard(provider, null));
}

export function mockClearRecentlyViewed(accountKey: string) {
  account(accountKey).recentlyViewed = [];
}

export function mockHome(accountKey: string | null, favouriteIds: string[], governorate?: string): DiscoveryHome {
  const inArea = (provider: (typeof mockProviders)[number]) =>
    !governorate || (provider.location ?? '').includes(governorate);
  return {
    personalized: Boolean(accountKey),
    availableNearby: mockProviders
      .filter(provider => provider.available && inArea(provider))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8)
      .map(provider => toCard(provider, null)),
    trustedWorkers: mockProviders
      .filter(provider => provider.skillCertificateVerified && provider.completedJobs > 0)
      .sort((a, b) => b.completedJobs - a.completedJobs || b.rating - a.rating)
      .slice(0, 8)
      .map(provider => toCard(provider, null)),
    favourites: accountKey
      ? mockProviders.filter(provider => favouriteIds.includes(provider.id)).map(provider => toCard(provider, null))
      : [],
    recentlyViewed: mockRecentlyViewed(accountKey).slice(0, 8),
  };
}

/** Exposed for the regression suite, which asserts the count matches the UI badge. */
export { activeFilterCount };
