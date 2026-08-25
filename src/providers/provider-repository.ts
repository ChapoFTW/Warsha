import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { mockSyncProviderGates } from '@/src/onboarding/mock-onboarding-state';
import type { CatalogueServiceRow } from '@/src/services/specific-services';

import {
  emptyProviderDraft,
  type PortfolioItem,
  type PortfolioItemInput,
  type ProviderCertificate,
  type ProviderCertificateInput,
  type ProviderDraft,
  type ProviderMediaInput,
  type ProviderPhoto,
  validateCertificate,
  validatePortfolioItem,
} from './provider-types';
import { replaceMediaAtomically } from './media-replacement';
import {
  providerCertificateStorageKey,
  providerPortfolioStorageKey,
  providerStorageKey,
} from './provider-account-scope';

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const CERTIFICATE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const SIGNED_URL_SECONDS = 900;

export interface ProviderRepository {
  load(accountId: string): Promise<ProviderDraft | null>;
  activate(accountId: string, name: string): Promise<ProviderDraft>;
  save(accountId: string, value: ProviderDraft, submit?: boolean): Promise<ProviderDraft>;
  setAvailability(accountId: string, available: boolean): Promise<ProviderDraft>;
  replaceAvatar(accountId: string, input: ProviderMediaInput): Promise<ProviderPhoto>;
  deleteAvatar(accountId: string): Promise<void>;
  listPortfolio(accountId: string): Promise<PortfolioItem[]>;
  savePortfolioItem(accountId: string, value: PortfolioItemInput): Promise<PortfolioItem[]>;
  uploadPortfolioImage(accountId: string, itemId: string, input: ProviderMediaInput): Promise<PortfolioItem[]>;
  deletePortfolioImage(accountId: string, imageId: string): Promise<PortfolioItem[]>;
  deletePortfolioItem(accountId: string, itemId: string): Promise<PortfolioItem[]>;
  reorderPortfolio(accountId: string, itemIds: string[]): Promise<PortfolioItem[]>;
  reorderPortfolioImages(accountId: string, itemId: string, imageIds: string[]): Promise<PortfolioItem[]>;
  listCertificates(accountId: string): Promise<ProviderCertificate[]>;
  saveCertificate(accountId: string, value: ProviderCertificateInput): Promise<ProviderCertificate[]>;
  uploadCertificate(accountId: string, certificateId: string, input: ProviderMediaInput): Promise<ProviderCertificate[]>;
  submitCertificate(accountId: string, certificateId: string): Promise<ProviderCertificate[]>;
  deleteCertificate(accountId: string, certificateId: string): Promise<ProviderCertificate[]>;
  simulateCertificateReview?(accountId: string, certificateId: string, approved: boolean): Promise<ProviderCertificate[]>;
}

type ValidatedFile = { file: File; mimeType: string; size: number; hash: string; extension: string };

export function validateProviderFile(
  input: ProviderMediaInput,
  kind: 'profile' | 'portfolio' | 'certificate',
): ValidatedFile {
  const file = new File(input.uri);
  const mimeType = input.mimeType || file.type || '';
  const allowed = kind === 'certificate' ? CERTIFICATE_MIME : IMAGE_MIME;
  const limit = kind === 'profile' ? 5 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!file.exists || !file.size || file.size > limit || !allowed.includes(mimeType)) {
    throw new Error(`Invalid ${kind} file`);
  }
  const extension = mimeType === 'application/pdf' ? 'pdf'
    : mimeType === 'image/png' ? 'png'
      : mimeType === 'image/webp' ? 'webp'
        : mimeType === 'image/heic' ? 'heic'
          : mimeType === 'image/heif' ? 'heif' : 'jpg';
  return { file, mimeType, size: file.size, hash: file.md5 ?? '', extension };
}

function accountSegment(accountId: string) {
  return accountId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'account';
}

function localDirectory(accountId: string, kind: string) {
  const directory = new Directory(Paths.document, 'worker-profiles', accountSegment(accountId), kind);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapProfile(value: Record<string, unknown>): ProviderDraft {
  const services = Array.isArray(value.services)
    ? value.services
    : Array.isArray(value.provider_services) ? value.provider_services : [];
  const areas = Array.isArray(value.areas)
    ? value.areas
    : Array.isArray(value.provider_service_areas) ? value.provider_service_areas : [];
  const categoryIds = value.categoryIds ?? value.category_ids;
  return {
    id: value.id ? String(value.id) : undefined,
    status: String(value.status ?? value.onboarding_status ?? 'draft') as ProviderDraft['status'],
    displayName: String(value.displayName ?? value.display_name ?? ''),
    avatarPath: String(value.avatarPath ?? value.avatar_url ?? ''),
    avatarUrl: String(value.avatarUrl ?? ''),
    profession: String(value.profession ?? value.profession_key ?? ''),
    about: String(value.about ?? ''),
    experienceYears: Number(value.experienceYears ?? value.experience_years ?? 0),
    experienceSummary: String(value.experienceSummary ?? value.experience_summary ?? ''),
    specialties: Array.isArray(value.specialties)
      ? value.specialties.map(String)
      : Array.isArray(value.skills) ? value.skills.map(String) : [],
    ratingAverage: Number(value.ratingAverage ?? value.rating_average ?? 0),
    languages: Array.isArray(value.languages) ? value.languages.map(String) : [],
    categoryIds: Array.isArray(categoryIds) ? categoryIds.map(String) : [],
    services: (services as Record<string, unknown>[]).map(link => ({
      serviceId: String(link.serviceId ?? link.service_id ?? ''),
      translationKey: link.translationKey ?? link.translation_key
        ?? (link.service as Record<string, unknown> | undefined)?.translation_key
        ? String(link.translationKey ?? link.translation_key
          ?? (link.service as Record<string, unknown> | undefined)?.translation_key)
        : null,
      name: String(link.name ?? (link.service as Record<string, unknown> | undefined)?.name ?? ''),
    })),
    areas: (areas as Record<string, unknown>[]).map(area => ({
      governorate: String(area.governorate ?? ''),
      district: String(area.district ?? ''),
      radiusKm: Number(area.radiusKm ?? area.radius_km ?? 0),
    })),
    serviceRadiusKm: Number(value.serviceRadiusKm ?? value.service_radius_km ?? 15),
    isAvailable: Boolean(value.isAvailable ?? value.is_available ?? value.isOnline),
    emergencyAvailable: Boolean(value.emergencyAvailable ?? value.emergency_available),
    temporaryUnavailableUntil: value.temporaryUnavailableUntil || value.temporary_unavailable_until
      ? String(value.temporaryUnavailableUntil ?? value.temporary_unavailable_until) : undefined,
    agreementAccepted: Boolean(value.agreementAccepted ?? value.provider_agreement_accepted_at),
  };
}

function mapPortfolio(value: Record<string, unknown>): PortfolioItem {
  return {
    id: String(value.id),
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    categoryId: value.categoryId ?? value.category_id ? String(value.categoryId ?? value.category_id) : undefined,
    serviceId: value.serviceId ?? value.service_id ? String(value.serviceId ?? value.service_id) : undefined,
    completedPeriod: value.completedPeriod ?? value.completed_period ? String(value.completedPeriod ?? value.completed_period) : undefined,
    status: String(value.status ?? 'draft') as PortfolioItem['status'],
    sortOrder: Number(value.sortOrder ?? value.sort_order ?? 0),
    createdAt: String(value.createdAt ?? value.created_at ?? new Date().toISOString()),
    images: (Array.isArray(value.images) ? value.images : []).map(image => {
      const item = image as Record<string, unknown>;
      return {
        id: String(item.id),
        storagePath: String(item.storagePath ?? item.storage_path ?? ''),
        previewUrl: String(item.previewUrl ?? ''),
        mimeType: item.mimeType ?? item.mime_type ? String(item.mimeType ?? item.mime_type) : undefined,
        fileSizeBytes: item.fileSizeBytes ?? item.file_size_bytes ? Number(item.fileSizeBytes ?? item.file_size_bytes) : undefined,
        contentHash: item.contentHash ?? item.content_hash ? String(item.contentHash ?? item.content_hash) : undefined,
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
      };
    }),
  };
}

function mapCertificate(value: Record<string, unknown>): ProviderCertificate {
  return {
    id: String(value.id),
    type: String(value.type ?? value.certificate_type ?? 'professional') as ProviderCertificate['type'],
    title: String(value.title ?? ''),
    issuer: value.issuer ? String(value.issuer) : undefined,
    status: String(value.status ?? 'draft') as ProviderCertificate['status'],
    storagePath: value.storagePath ?? value.document_path ? String(value.storagePath ?? value.document_path) : undefined,
    previewUrl: value.previewUrl ? String(value.previewUrl) : undefined,
    mimeType: value.mimeType ?? value.mime_type ? String(value.mimeType ?? value.mime_type) : undefined,
    fileSizeBytes: value.fileSizeBytes ?? value.file_size_bytes ? Number(value.fileSizeBytes ?? value.file_size_bytes) : undefined,
    rejectionReason: value.rejectionReason ?? value.rejection_reason ? String(value.rejectionReason ?? value.rejection_reason) : undefined,
    submittedAt: value.submittedAt ?? value.submitted_at ? String(value.submittedAt ?? value.submitted_at) : undefined,
    reviewedAt: value.reviewedAt ?? value.reviewed_at ? String(value.reviewedAt ?? value.reviewed_at) : undefined,
    expiresAt: value.expiresAt ?? value.expires_at ? String(value.expiresAt ?? value.expires_at) : undefined,
    createdAt: String(value.createdAt ?? value.created_at ?? new Date().toISOString()),
  };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await Storage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function mockLoad(accountId: string) {
  const raw = await Storage.getItem(providerStorageKey(accountId));
  if (!raw) return null;
  try { return mapProfile(JSON.parse(raw) as Record<string, unknown>); } catch { return null; }
}

async function mockPortfolio(accountId: string) {
  return (await readJson<Record<string, unknown>[]>(providerPortfolioStorageKey(accountId), [])).map(mapPortfolio);
}

async function mockCertificates(accountId: string) {
  return (await readJson<Record<string, unknown>[]>(providerCertificateStorageKey(accountId), [])).map(mapCertificate);
}

const mockRepository: ProviderRepository = {
  load: mockLoad,
  async activate(accountId, displayName) {
    const current = await mockLoad(accountId);
    if (current) return current;
    const next = { ...emptyProviderDraft, id: accountId === 'mock-user' ? 'mostafa' : `mock-provider-${accountSegment(accountId)}`, displayName };
    await Storage.setItem(providerStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async save(accountId, value, submit) {
    const next = { ...value, status: submit ? 'submitted' as const : value.status };
    await Storage.setItem(providerStorageKey(accountId), JSON.stringify(next));
    mockSyncProviderGates(accountId, next);
    return next;
  },
  async setAvailability(accountId, isAvailable) {
    const current = await mockLoad(accountId);
    if (!current) throw new Error('Provider profile not found');
    const next = { ...current, isAvailable };
    await Storage.setItem(providerStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async replaceAvatar(accountId, input) {
    const current = await mockLoad(accountId);
    if (!current) throw new Error('Provider profile not found');
    const validated = validateProviderFile(input, 'profile');
    const destination = new File(localDirectory(accountId, 'avatar'), `${uniqueId('avatar')}.${validated.extension}`);
    validated.file.copy(destination);
    const next = { ...current, avatarPath: destination.uri, avatarUrl: destination.uri };
    try { await Storage.setItem(providerStorageKey(accountId), JSON.stringify(next)); }
    catch (error) { if (destination.exists) destination.delete(); throw error; }
    if (current.avatarPath && current.avatarPath !== destination.uri) {
      try { const old = new File(current.avatarPath); if (old.exists) old.delete(); } catch { /* best effort */ }
    }
    mockSyncProviderGates(accountId, next);
    return { storagePath: destination.uri, previewUrl: destination.uri };
  },
  async deleteAvatar(accountId) {
    const current = await mockLoad(accountId);
    if (!current) throw new Error('Provider profile not found');
    const old = current.avatarPath;
    const next = { ...current, avatarPath: '', avatarUrl: '' };
    await Storage.setItem(providerStorageKey(accountId), JSON.stringify(next));
    mockSyncProviderGates(accountId, next);
    if (old) try { const file = new File(old); if (file.exists) file.delete(); } catch { /* best effort */ }
  },
  listPortfolio: mockPortfolio,
  async savePortfolioItem(accountId, input) {
    validatePortfolioItem(input);
    const items = await mockPortfolio(accountId);
    if (!input.id && items.length >= 12) throw new Error('Portfolio item limit reached');
    const existing = input.id ? items.find(item => item.id === input.id) : undefined;
    if (input.status === 'published' && !(existing?.images.length)) throw new Error('Add a portfolio image first');
    const nextItem: PortfolioItem = existing
      ? { ...existing, ...input, title: input.title.trim(), description: input.description.trim() }
      : { ...input, id: uniqueId('portfolio'), title: input.title.trim(), description: input.description.trim(), sortOrder: items.length, createdAt: new Date().toISOString(), images: [] };
    const next = existing ? items.map(item => item.id === existing.id ? nextItem : item) : [...items, nextItem];
    await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async uploadPortfolioImage(accountId, itemId, input) {
    const items = await mockPortfolio(accountId);
    const item = items.find(value => value.id === itemId);
    if (!item) throw new Error('Portfolio item not found');
    const validated = validateProviderFile(input, 'portfolio');
    if (!validated.hash) throw new Error('Unable to fingerprint portfolio image');
    if (items.some(value => value.images.some(image => image.contentHash === validated.hash))) throw new Error('Duplicate portfolio image');
    if (item.images.length >= 5 || item.images.reduce((sum, image) => sum + (image.fileSizeBytes ?? 0), 0) + validated.size > 40 * 1024 * 1024) {
      throw new Error('Portfolio image limit reached');
    }
    const destination = new File(localDirectory(accountId, `portfolio-${itemId}`), `${uniqueId('work')}.${validated.extension}`);
    validated.file.copy(destination);
    const image = { id: uniqueId('portfolio-image'), storagePath: destination.uri, previewUrl: destination.uri, mimeType: validated.mimeType, fileSizeBytes: validated.size, contentHash: validated.hash, sortOrder: item.images.length };
    const next = items.map(value => value.id === itemId ? { ...value, images: [...value.images, image] } : value);
    try { await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next)); }
    catch (error) { if (destination.exists) destination.delete(); throw error; }
    return next;
  },
  async deletePortfolioImage(accountId, imageId) {
    const items = await mockPortfolio(accountId);
    const removed = items.flatMap(item => item.images).find(image => image.id === imageId);
    if (!removed) throw new Error('Portfolio image not found');
    const next = items.map(item => ({ ...item, images: item.images.filter(image => image.id !== imageId).map((image, sortOrder) => ({ ...image, sortOrder })) }));
    await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next));
    try { const file = new File(removed.storagePath); if (file.exists) file.delete(); } catch { /* best effort */ }
    return next;
  },
  async deletePortfolioItem(accountId, itemId) {
    const items = await mockPortfolio(accountId);
    const removed = items.find(item => item.id === itemId);
    if (!removed) throw new Error('Portfolio item not found');
    const next = items.filter(item => item.id !== itemId).map((item, sortOrder) => ({ ...item, sortOrder }));
    await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next));
    for (const image of removed.images) try { const file = new File(image.storagePath); if (file.exists) file.delete(); } catch { /* best effort */ }
    return next;
  },
  async reorderPortfolio(accountId, itemIds) {
    const items = await mockPortfolio(accountId);
    if (itemIds.length !== items.length || new Set(itemIds).size !== items.length || itemIds.some(id => !items.some(item => item.id === id))) throw new Error('Invalid portfolio order');
    const next = itemIds.map((id, sortOrder) => ({ ...items.find(item => item.id === id)!, sortOrder }));
    await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async reorderPortfolioImages(accountId, itemId, imageIds) {
    const items = await mockPortfolio(accountId);
    const item = items.find(value => value.id === itemId);
    if (!item || imageIds.length !== item.images.length || new Set(imageIds).size !== item.images.length || imageIds.some(id => !item.images.some(image => image.id === id))) throw new Error('Invalid image order');
    const images = imageIds.map((id, sortOrder) => ({ ...item.images.find(image => image.id === id)!, sortOrder }));
    const next = items.map(value => value.id === itemId ? { ...value, images } : value);
    await Storage.setItem(providerPortfolioStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  listCertificates: mockCertificates,
  async saveCertificate(accountId, input) {
    validateCertificate(input);
    const items = await mockCertificates(accountId);
    const existing = input.id ? items.find(item => item.id === input.id) : undefined;
    if (existing && !['draft', 'rejected', 'expired'].includes(existing.status)) throw new Error('Certificate is locked');
    const nextItem: ProviderCertificate = existing
      ? { ...existing, ...input, title: input.title.trim(), issuer: input.issuer?.trim() || undefined, status: 'draft', rejectionReason: undefined }
      : { ...input, id: uniqueId('certificate'), title: input.title.trim(), issuer: input.issuer?.trim() || undefined, status: 'draft', createdAt: new Date().toISOString() };
    const next = existing ? items.map(item => item.id === existing.id ? nextItem : item) : [nextItem, ...items];
    await Storage.setItem(providerCertificateStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async uploadCertificate(accountId, certificateId, input) {
    const items = await mockCertificates(accountId);
    const item = items.find(value => value.id === certificateId);
    if (!item || !['draft', 'rejected', 'expired'].includes(item.status)) throw new Error('Certificate is locked');
    const validated = validateProviderFile(input, 'certificate');
    const destination = new File(localDirectory(accountId, `certificate-${certificateId}`), `${uniqueId('document')}.${validated.extension}`);
    validated.file.copy(destination);
    const next = items.map(value => value.id === certificateId ? { ...value, storagePath: destination.uri, previewUrl: destination.uri, mimeType: validated.mimeType, fileSizeBytes: validated.size, status: 'draft' as const, rejectionReason: undefined } : value);
    try { await Storage.setItem(providerCertificateStorageKey(accountId), JSON.stringify(next)); }
    catch (error) { if (destination.exists) destination.delete(); throw error; }
    if (item.storagePath) try { const old = new File(item.storagePath); if (old.exists) old.delete(); } catch { /* best effort */ }
    return next;
  },
  async submitCertificate(accountId, certificateId) {
    const items = await mockCertificates(accountId);
    const item = items.find(value => value.id === certificateId);
    if (!item?.storagePath || !['draft', 'rejected', 'expired'].includes(item.status)) throw new Error('Certificate document is required');
    const next = items.map(value => value.id === certificateId ? { ...value, status: 'submitted' as const, submittedAt: new Date().toISOString(), rejectionReason: undefined } : value);
    await Storage.setItem(providerCertificateStorageKey(accountId), JSON.stringify(next));
    return next;
  },
  async deleteCertificate(accountId, certificateId) {
    const items = await mockCertificates(accountId);
    const item = items.find(value => value.id === certificateId);
    if (!item || !['draft', 'rejected', 'expired'].includes(item.status)) throw new Error('Certificate cannot be removed');
    const next = items.filter(value => value.id !== certificateId);
    await Storage.setItem(providerCertificateStorageKey(accountId), JSON.stringify(next));
    if (item.storagePath) try { const file = new File(item.storagePath); if (file.exists) file.delete(); } catch { /* best effort */ }
    return next;
  },
  async simulateCertificateReview(accountId, certificateId, approved) {
    const items = await mockCertificates(accountId);
    const item = items.find(value => value.id === certificateId);
    if (!item || item.status !== 'submitted') throw new Error('Certificate is not submitted');
    const next = items.map(value => value.id === certificateId ? {
      ...value,
      status: approved ? 'approved' as const : 'rejected' as const,
      rejectionReason: approved ? undefined : 'Please upload a clearer complete document.',
      reviewedAt: new Date().toISOString(),
    } : value);
    await Storage.setItem(providerCertificateStorageKey(accountId), JSON.stringify(next));
    return next;
  },
};

async function authenticatedUser(accountId: string) {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== accountId) throw new Error('Authentication required');
  return data.user;
}

async function signedUrl(bucket: string, path: string) {
  if (!path) return '';
  const { data, error } = await getSupabaseClient().storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

async function loadSupabase(accountId: string) {
  await authenticatedUser(accountId);
  const { data, error } = await getSupabaseClient().rpc('get_my_worker_profile');
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  if (!row.id) return null;
  const profile = mapProfile(row);
  return { ...profile, avatarUrl: profile.avatarPath ? await signedUrl('profile-images', profile.avatarPath) : '' };
}

async function loadSupabasePortfolio(accountId: string) {
  await authenticatedUser(accountId);
  const { data, error } = await getSupabaseClient().rpc('get_my_provider_portfolio');
  if (error) throw error;
  const items = (Array.isArray(data) ? data : []).map(value => mapPortfolio(value as Record<string, unknown>));
  const images = items.flatMap(item => item.images);
  if (!images.length) return items;
  const { data: urls, error: signError } = await getSupabaseClient().storage.from('provider-portfolios').createSignedUrls(images.map(image => image.storagePath), SIGNED_URL_SECONDS);
  if (signError) throw signError;
  const urlById = new Map(images.map((image, index) => [image.id, urls?.[index]?.signedUrl ?? '']));
  return items.map(item => ({ ...item, images: item.images.map(image => ({ ...image, previewUrl: urlById.get(image.id) ?? '' })) }));
}

async function loadSupabaseCertificates(accountId: string) {
  await authenticatedUser(accountId);
  const { data, error } = await getSupabaseClient().rpc('get_my_provider_certificates');
  if (error) throw error;
  const items = (Array.isArray(data) ? data : []).map(value => mapCertificate(value as Record<string, unknown>));
  const withPath = items.filter(item => item.storagePath);
  if (!withPath.length) return items;
  const { data: urls, error: signError } = await getSupabaseClient().storage.from('provider-certificates').createSignedUrls(withPath.map(item => item.storagePath!), SIGNED_URL_SECONDS);
  if (signError) throw signError;
  const urlById = new Map(withPath.map((item, index) => [item.id, urls?.[index]?.signedUrl ?? '']));
  return items.map(item => ({ ...item, previewUrl: urlById.get(item.id) }));
}

const supabaseRepository: ProviderRepository = {
  load: loadSupabase,
  async activate(accountId, displayName) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('activate_provider_role', { p_display_name: displayName });
    if (error) throw error;
    const loaded = await loadSupabase(accountId);
    if (!loaded) throw new Error('Unable to load provider profile');
    return loaded;
  },
  async save(accountId, value, submit) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('save_provider_foundation', { p_profile: value, p_submit: Boolean(submit) });
    if (error) throw error;
    const loaded = await loadSupabase(accountId);
    if (!loaded) throw new Error('Unable to load provider profile');
    return loaded;
  },
  async setAvailability(accountId, available) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('mark_worker_available', { p_available: available });
    if (error) throw error;
    const loaded = await loadSupabase(accountId);
    if (!loaded) throw new Error('Unable to load provider profile');
    return loaded;
  },
  async replaceAvatar(accountId, input) {
    const user = await authenticatedUser(accountId);
    const current = await loadSupabase(accountId);
    if (!current) throw new Error('Provider profile not found');
    const validated = validateProviderFile(input, 'profile');
    const path = `${user.id}/avatar/${uniqueId('avatar')}.${validated.extension}`;
    const client = getSupabaseClient();
    const replaced = await replaceMediaAtomically({
      previousPath: current.avatarPath || null,
      stage: async () => {
        const { error } = await client.storage.from('profile-images').upload(path, await validated.file.arrayBuffer(), { contentType: validated.mimeType, upsert: false });
        if (error) throw error;
        return path;
      },
      register: async (nextPath, expectedPath) => {
        const { error } = await client.rpc('set_my_provider_profile_photo', { p_storage_path: nextPath, p_expected_current: expectedPath });
        if (error) throw error;
      },
      authorize: value => signedUrl('profile-images', value),
      remove: paths => client.storage.from('profile-images').remove(paths),
    });
    return { storagePath: replaced.path, previewUrl: replaced.authorized };
  },
  async deleteAvatar(accountId) {
    const current = await loadSupabase(accountId);
    if (!current) throw new Error('Provider profile not found');
    if (!current.avatarPath) return;
    const client = getSupabaseClient();
    const { error } = await client.rpc('set_my_provider_profile_photo', { p_storage_path: null, p_expected_current: current.avatarPath });
    if (error) throw error;
    await client.storage.from('profile-images').remove([current.avatarPath]);
  },
  listPortfolio: loadSupabasePortfolio,
  async savePortfolioItem(accountId, value) {
    await authenticatedUser(accountId);
    validatePortfolioItem(value);
    const { error } = await getSupabaseClient().rpc('save_my_provider_portfolio_item', { p_item: value });
    if (error) throw error;
    return loadSupabasePortfolio(accountId);
  },
  async uploadPortfolioImage(accountId, itemId, input) {
    const user = await authenticatedUser(accountId);
    const profile = await loadSupabase(accountId);
    if (!profile?.id) throw new Error('Provider profile not found');
    const validated = validateProviderFile(input, 'portfolio');
    if (!validated.hash) throw new Error('Unable to fingerprint portfolio image');
    const path = `${user.id}/${profile.id}/${itemId}/${uniqueId('work')}.${validated.extension}`;
    const client = getSupabaseClient();
    const { error: uploadError } = await client.storage.from('provider-portfolios').upload(path, await validated.file.arrayBuffer(), { contentType: validated.mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await client.rpc('register_my_provider_portfolio_image', { p_item_id: itemId, p_storage_path: path, p_mime_type: validated.mimeType, p_file_size_bytes: validated.size, p_content_hash: validated.hash });
    if (error) { await client.storage.from('provider-portfolios').remove([path]); throw error; }
    return loadSupabasePortfolio(accountId);
  },
  async deletePortfolioImage(accountId, imageId) {
    await authenticatedUser(accountId);
    const client = getSupabaseClient();
    const { data: path, error } = await client.rpc('remove_my_provider_portfolio_image', { p_image_id: imageId });
    if (error) throw error;
    if (path) await client.storage.from('provider-portfolios').remove([String(path)]);
    return loadSupabasePortfolio(accountId);
  },
  async deletePortfolioItem(accountId, itemId) {
    await authenticatedUser(accountId);
    const client = getSupabaseClient();
    const { data: paths, error } = await client.rpc('remove_my_provider_portfolio_item', { p_item_id: itemId });
    if (error) throw error;
    if (Array.isArray(paths) && paths.length) await client.storage.from('provider-portfolios').remove(paths.map(String));
    return loadSupabasePortfolio(accountId);
  },
  async reorderPortfolio(accountId, itemIds) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('reorder_my_provider_portfolio', { p_item_ids: itemIds });
    if (error) throw error;
    return loadSupabasePortfolio(accountId);
  },
  async reorderPortfolioImages(accountId, itemId, imageIds) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('reorder_my_provider_portfolio_images', { p_item_id: itemId, p_image_ids: imageIds });
    if (error) throw error;
    return loadSupabasePortfolio(accountId);
  },
  listCertificates: loadSupabaseCertificates,
  async saveCertificate(accountId, value) {
    await authenticatedUser(accountId);
    validateCertificate(value);
    const { error } = await getSupabaseClient().rpc('save_my_provider_certificate', { p_certificate: value });
    if (error) throw error;
    return loadSupabaseCertificates(accountId);
  },
  async uploadCertificate(accountId, certificateId, input) {
    const user = await authenticatedUser(accountId);
    const profile = await loadSupabase(accountId);
    const current = (await loadSupabaseCertificates(accountId)).find(item => item.id === certificateId);
    if (!profile?.id || !current) throw new Error('Certificate not found');
    const validated = validateProviderFile(input, 'certificate');
    const path = `${user.id}/${profile.id}/${certificateId}/${uniqueId('document')}.${validated.extension}`;
    const client = getSupabaseClient();
    const { error: uploadError } = await client.storage.from('provider-certificates').upload(path, await validated.file.arrayBuffer(), { contentType: validated.mimeType, upsert: false });
    if (uploadError) throw uploadError;
    let registered = false;
    try {
      const { error } = await client.rpc('register_my_provider_certificate_document', { p_certificate_id: certificateId, p_storage_path: path, p_mime_type: validated.mimeType, p_file_size_bytes: validated.size, p_expected_current: current.storagePath ?? null });
      if (error) throw error;
      registered = true;
      await signedUrl('provider-certificates', path);
      if (current.storagePath) await client.storage.from('provider-certificates').remove([current.storagePath]);
      return loadSupabaseCertificates(accountId);
    } catch (error) {
      if (registered) await client.rpc('register_my_provider_certificate_document', {
        p_certificate_id: certificateId,
        p_storage_path: current.storagePath ?? null,
        p_mime_type: current.mimeType ?? validated.mimeType,
        p_file_size_bytes: current.fileSizeBytes ?? validated.size,
        p_expected_current: path,
      });
      await client.storage.from('provider-certificates').remove([path]);
      throw error;
    }
  },
  async submitCertificate(accountId, certificateId) {
    await authenticatedUser(accountId);
    const { error } = await getSupabaseClient().rpc('submit_my_provider_certificate', { p_certificate_id: certificateId });
    if (error) throw error;
    return loadSupabaseCertificates(accountId);
  },
  async deleteCertificate(accountId, certificateId) {
    await authenticatedUser(accountId);
    const client = getSupabaseClient();
    const current = (await loadSupabaseCertificates(accountId)).find(item => item.id === certificateId);
    const { error } = await client.rpc('remove_my_provider_certificate', { p_certificate_id: certificateId });
    if (error) throw error;
    if (current?.storagePath) await client.storage.from('provider-certificates').remove([current.storagePath]);
    return loadSupabaseCertificates(accountId);
  },
};

export const providerRepository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;

/**
 * The catalogue a worker chooses the jobs they offer from.
 *
 * `category_id` is selected because it is what makes the choice a choice: the
 * rows are grouped under the worker's own trades by `worker-trade-selection`,
 * and without a category every surface can do is render all 171 of them as one
 * flat cloud -- which is exactly what Android, iOS and web each did.
 *
 * No `order by` either. The server's `order by name` is alphabetical in
 * English, which is meaningless to an Arabic or French reader; the shared
 * catalogue owns the order, per category, for every surface.
 *
 * Mock mode answers from the same shared catalogue rather than from whatever
 * services the six mock providers happen to sell, so an offline build exercises
 * the real grouping instead of five categories of it.
 */
export async function listProviderServiceOptions(): Promise<CatalogueServiceRow[]> {
  if (environment.dataMode === 'mock') {
    const { specificServices } = await import('@/src/services/specific-services');
    return specificServices.map(service => ({
      id: service.key,
      name: service.en,
      translationKey: service.key,
      categoryId: service.categoryId,
    }));
  }
  const { data, error } = await getSupabaseClient().from('services')
    .select('id,name,translation_key,category_id,service_categories!inner(is_active,deleted_at)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .eq('service_categories.is_active', true)
    .is('service_categories.deleted_at', null);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: String(row.id),
    name: String(row.name),
    translationKey: row.translation_key ? String(row.translation_key) : null,
    categoryId: String(row.category_id),
  }));
}
