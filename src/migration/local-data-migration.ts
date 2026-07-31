import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { assertImportSession, buildLocalImportPlan, inspectRawArray } from './local-data-import-plan';

const ADDRESS_KEY = 'warsha:addresses:v1';
const FAVOURITES_KEY = 'warsha:favourites:v1';
const BOOKINGS_KEY = 'warsha:bookings:v2';

export type LocalImportResult = {
  addressCount: number;
  favouriteCount: number;
  skippedFavouriteCount: number;
};

export async function inspectLocalData() {
  const [addresses, favourites, bookings] = await Promise.all([
    Storage.getItem(ADDRESS_KEY),
    Storage.getItem(FAVOURITES_KEY),
    Storage.getItem(BOOKINGS_KEY),
  ]);
  const addressInfo = inspectRawArray(addresses);
  const favouriteInfo = inspectRawArray(favourites);
  const bookingInfo = inspectRawArray(bookings);
  return {
    hasData: Boolean(addresses || favourites),
    addressCount: addressInfo.count,
    favouriteCount: favouriteInfo.count,
    bookingCount: bookingInfo.count,
    malformed: addressInfo.malformed || favouriteInfo.malformed || bookingInfo.malformed,
  };
}

export async function importSupportedLocalData(userId: string): Promise<LocalImportResult> {
  const [addressRaw, favouriteRaw] = await Promise.all([
    Storage.getItem(ADDRESS_KEY),
    Storage.getItem(FAVOURITES_KEY),
  ]);
  const plan = buildLocalImportPlan(addressRaw, favouriteRaw);
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  assertImportSession(userId, sessionData.session?.user.id, environment.dataMode);

  const { data, error } = await client.rpc('import_local_customer_data', {
    p_expected_user_id: userId,
    p_addresses: plan.addresses,
    p_favourite_provider_ids: plan.favouriteProviderIds,
  });
  if (error) throw error;
  const result = data as { address_count?: unknown; favourite_count?: unknown; skipped_favourite_count?: unknown } | null;
  return {
    addressCount: Number(result?.address_count ?? 0),
    favouriteCount: Number(result?.favourite_count ?? 0),
    skippedFavouriteCount: Number(result?.skipped_favourite_count ?? 0) + plan.skippedFavouriteCount,
  };
}
