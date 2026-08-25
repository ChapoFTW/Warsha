import Storage from 'expo-sqlite/kv-store';

import type { Provider, Service } from '@/src/data/marketplace-types';
import type { ProviderVerification } from '@/src/verification/verification-types';

import {
  providerCertificateStorageKey,
  providerPortfolioStorageKey,
  providerStorageKey,
  providerVerificationStorageKey,
} from './provider-account-scope';
import { publicSpecialties } from './profession-taxonomy';
import type { PortfolioItem, ProviderCertificate, ProviderDraft } from './provider-types';

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function syncMockProviderCatalog(accountId = 'mock-user') {
  const profile = parse<ProviderDraft | null>(await Storage.getItem(providerStorageKey(accountId)), null);
  if (!profile?.id) return;
  const [portfolioRaw, certificatesRaw, verificationRaw] = await Promise.all([
    Storage.getItem(providerPortfolioStorageKey(accountId)),
    Storage.getItem(providerCertificateStorageKey(accountId)),
    Storage.getItem(providerVerificationStorageKey(profile.id)),
  ]);
  const portfolio = parse<PortfolioItem[]>(portfolioRaw, []);
  const certificates = parse<ProviderCertificate[]>(certificatesRaw, []);
  const verification = parse<ProviderVerification | null>(verificationRaw, null);
  const { providers } = await import('@/src/data/mock-data');
  let provider = providers.find(item => item.id === profile.id);
  if (!provider) {
    const template = providers.find(item => item.id === 'mostafa') ?? providers[0];
    provider = { ...template, id: profile.id, reviews: [], portfolio: [], services: [] };
    providers.push(provider);
  }
  const complete = Boolean(
    profile.avatarPath && profile.profession.trim() && profile.services.length
    && profile.areas.some(area => area.governorate.trim() && area.radiusKm >= 1),
  );
  const discoverable = Boolean(
    complete && verification?.identityVerified
    && ['submitted', 'approved'].includes(profile.status),
  );
  const previousServices = new Map(provider.services.map(service => [service.id, service]));
  provider.name = profile.displayName;
  provider.profession = profile.profession as Provider['profession'];
  provider.categoryId = profile.categoryIds[0] ?? provider.categoryId;
  provider.categoryIds = profile.categoryIds;
  provider.image = profile.avatarUrl || profile.avatarPath;
  provider.coverImage = profile.avatarUrl || profile.avatarPath;
  provider.verified = discoverable;
  provider.skillCertificateVerified = Boolean(discoverable && verification?.skillCertificateVerified);
  provider.professionalCertificateCount = certificates.filter(item => item.status === 'approved').length;
  provider.professionalCertificateVerified = Boolean(discoverable && provider.professionalCertificateCount);
  provider.available = profile.isAvailable;
  provider.experienceYears = profile.experienceYears;
  provider.experienceSummary = profile.experienceSummary;
  provider.location = [profile.areas[0]?.district, profile.areas[0]?.governorate].filter(Boolean).join(', ');
  provider.serviceRadius = profile.serviceRadiusKm;
  provider.languages = profile.languages;
  provider.about = profile.about;
  provider.skills = publicSpecialties(profile.specialties);
  provider.services = profile.services.map(item => previousServices.get(item.serviceId) ?? {
    id: item.serviceId,
    name: item.name,
    translationKey: item.translationKey,
    price: 0,
    pricingType: 'quote',
    duration: '',
    available: true,
  } satisfies Service);
  provider.portfolio = portfolio.filter(item => item.status === 'published').map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    serviceId: item.serviceId,
    completedPeriod: item.completedPeriod,
    images: item.images.map(image => image.previewUrl),
  }));
}
