import type { Address } from '@/src/bookings/booking-types';

export type LocalImportAddress = {
  local_source_id: string;
  label: string;
  address_line: string;
  governorate: string;
  district: string | null;
  is_default: boolean;
};

export type LocalImportPlan = {
  addresses: LocalImportAddress[];
  favouriteProviderIds: string[];
  skippedFavouriteCount: number;
};

export class LocalDataFormatError extends Error {
  constructor() {
    super('Malformed local migration data');
    this.name = 'LocalDataFormatError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS_FIELDS: (keyof Address)[] = [
  'id', 'label', 'governorate', 'district', 'street', 'building',
  'floor', 'apartment', 'landmark', 'instructions',
];

function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 100) throw new LocalDataFormatError();
    return value;
  } catch (error) {
    if (error instanceof LocalDataFormatError) throw error;
    throw new LocalDataFormatError();
  }
}

function readAddress(value: unknown): Address {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalDataFormatError();
  const source = value as Record<string, unknown>;
  for (const field of ADDRESS_FIELDS) {
    if (typeof source[field] !== 'string') throw new LocalDataFormatError();
    const max = field === 'instructions' ? 300 : 120;
    if ((source[field] as string).length > max) throw new LocalDataFormatError();
  }
  if (!source.id || !source.label || !source.governorate || !source.street) throw new LocalDataFormatError();
  if (source.isDefault !== undefined && typeof source.isDefault !== 'boolean') throw new LocalDataFormatError();
  return source as unknown as Address;
}

function toImportAddress(address: Address): LocalImportAddress {
  const addressLine = [
    address.building,
    address.street,
    address.floor && `Floor ${address.floor}`,
    address.apartment && `Apartment ${address.apartment}`,
    address.landmark,
    address.instructions,
  ].filter(Boolean).join(' | ');
  if (addressLine.length > 500) throw new LocalDataFormatError();
  return {
    local_source_id: address.id,
    label: address.label.trim(),
    address_line: addressLine,
    governorate: address.governorate.trim(),
    district: address.district.trim() || null,
    is_default: address.isDefault === true,
  };
}

export function buildLocalImportPlan(addressRaw: string | null, favouriteRaw: string | null): LocalImportPlan {
  const addresses = [...new Map(parseArray(addressRaw).map(readAddress).map(item => [item.id, toImportAddress(item)])).values()];
  const favourites = parseArray(favouriteRaw);
  if (favourites.some(item => typeof item !== 'string' || item.length > 100)) throw new LocalDataFormatError();
  const valid = (favourites as string[]).filter(item => UUID.test(item));
  return {
    addresses,
    favouriteProviderIds: [...new Set(valid)],
    skippedFavouriteCount: favourites.length - valid.length,
  };
}

export function inspectRawArray(raw: string | null): { count: number; malformed: boolean } {
  if (!raw) return { count: 0, malformed: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? { count: parsed.length, malformed: false } : { count: 0, malformed: true };
  } catch {
    return { count: 0, malformed: true };
  }
}

export function assertImportSession(expectedUserId: string, actualUserId: string | undefined, mode: 'mock' | 'supabase') {
  if (mode !== 'supabase' || !actualUserId || actualUserId !== expectedUserId) {
    throw new Error('Migration session changed');
  }
}
