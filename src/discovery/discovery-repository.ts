import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  mockClearRecentlyViewed,
  mockClearSearches,
  mockFilterMetadata,
  mockHome,
  mockRecentlyViewed,
  mockRecordSearch,
  mockRecordView,
  mockSearch,
  mockSuggestions,
} from './mock-discovery-state';
import {
  discoveryPageSize,
  normalizeDiscoveryQuery,
  type DiscoveryFilterMetadata,
  type DiscoveryFilters,
  type DiscoveryHome,
  type DiscoveryProviderCard,
  type DiscoverySearchResult,
  type DiscoverySort,
  type DiscoverySuggestions,
} from './discovery-types';

/**
 * WPS-020 discovery repository.
 *
 * Mock and Supabase are fully isolated: Mock performs no network call, never
 * falls back to Supabase, and a Supabase failure never writes into Mock. There
 * is no external search provider and no external personalization provider —
 * both modes are entirely local to Warsha.
 */

function requireMock(accountKey: string | null): string {
  if (!accountKey) throw new Error('An account is required');
  return accountKey;
}

export const discoveryRepository = {
  async search(
    query: string,
    filters: DiscoveryFilters,
    sort: DiscoverySort,
    limit = discoveryPageSize,
    offset = 0,
  ): Promise<DiscoverySearchResult> {
    if (environment.dataMode === 'mock') return mockSearch(query, filters, sort, limit, offset);
    const { data, error } = await getSupabaseClient().rpc('search_providers', {
      p_query: normalizeDiscoveryQuery(query) || null,
      p_filters: filters as Record<string, unknown>,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return data as DiscoverySearchResult;
  },

  async filterMetadata(): Promise<DiscoveryFilterMetadata> {
    if (environment.dataMode === 'mock') return mockFilterMetadata();
    const { data, error } = await getSupabaseClient().rpc('get_discovery_filters');
    if (error) throw error;
    return data as DiscoveryFilterMetadata;
  },

  async suggestions(accountKey: string | null): Promise<DiscoverySuggestions> {
    if (environment.dataMode === 'mock') return mockSuggestions(accountKey);
    const { data, error } = await getSupabaseClient().rpc('get_search_suggestions');
    if (error) throw error;
    return data as DiscoverySuggestions;
  },

  async recordSearch(accountKey: string | null, query: string): Promise<void> {
    if (environment.dataMode === 'mock') { mockRecordSearch(requireMock(accountKey), query); return; }
    if (!accountKey) return;
    const { error } = await getSupabaseClient().rpc('record_search_query', { p_query: normalizeDiscoveryQuery(query) });
    if (error) throw error;
  },

  async clearSearches(accountKey: string | null): Promise<void> {
    if (environment.dataMode === 'mock') { mockClearSearches(requireMock(accountKey)); return; }
    if (!accountKey) return;
    const { error } = await getSupabaseClient().rpc('clear_my_recent_searches');
    if (error) throw error;
  },

  async recordView(accountKey: string | null, providerId: string): Promise<void> {
    if (environment.dataMode === 'mock') { mockRecordView(requireMock(accountKey), providerId); return; }
    if (!accountKey) return;
    const { error } = await getSupabaseClient().rpc('record_provider_view', { p_provider_id: providerId });
    if (error) throw error;
  },

  async recentlyViewed(accountKey: string | null): Promise<DiscoveryProviderCard[]> {
    if (environment.dataMode === 'mock') return mockRecentlyViewed(accountKey);
    if (!accountKey) return [];
    const { data, error } = await getSupabaseClient().rpc('get_my_recently_viewed');
    if (error) throw error;
    return (data ?? []) as DiscoveryProviderCard[];
  },

  async clearRecentlyViewed(accountKey: string | null): Promise<void> {
    if (environment.dataMode === 'mock') { mockClearRecentlyViewed(requireMock(accountKey)); return; }
    if (!accountKey) return;
    const { error } = await getSupabaseClient().rpc('clear_my_recently_viewed');
    if (error) throw error;
  },

  async home(accountKey: string | null, favouriteIds: string[], governorate?: string): Promise<DiscoveryHome> {
    if (environment.dataMode === 'mock') return mockHome(accountKey, favouriteIds, governorate);
    const { data, error } = await getSupabaseClient().rpc('get_discovery_home', { p_governorate: governorate ?? null });
    if (error) throw error;
    return data as DiscoveryHome;
  },
};
