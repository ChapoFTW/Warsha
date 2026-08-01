import type { Category, Provider, PublicPortfolioItem, Service } from '@/src/data/marketplace-types';
import { getSupabaseClient } from '@/src/lib/supabase';

import type { WarshaDataAdapter } from './types';

type MarketplaceCatalog = {
  categories: Record<string, unknown>[];
  providers: Record<string, unknown>[];
  services: Record<string, unknown>[];
};

function mapCategory(row: Record<string, unknown>): Category {
  return { id: String(row.id), label: String(row.translation_key) as Category['label'], icon: String(row.icon_name) as Category['icon'], description: String(row.description_key) as Category['description'] };
}
function mapService(row: Record<string, unknown>): Service {
  return { id: String(row.id), name: String(row.name), price: Number(row.price_egp), pricingType: String(row.pricing_type) as Service['pricingType'], duration: String(row.duration_label ?? '') };
}
function mapLinkedService(link: Record<string, unknown>): Service {
  const service = mapService(link.service as Record<string, unknown>);
  return {
    ...service,
    price: Number(link.custom_price_egp ?? service.price),
    pricingType: String(link.pricing_type ?? service.pricingType) as Service['pricingType'],
    available: link.is_active !== false,
  };
}
function mapPortfolio(value: Record<string, unknown>): PublicPortfolioItem {
  return {
    id: String(value.id),
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    categoryId: value.category_id ? String(value.category_id) : undefined,
    serviceId: value.service_id ? String(value.service_id) : undefined,
    completedPeriod: value.completed_period ? String(value.completed_period) : undefined,
    images: Array.isArray(value.images) ? value.images.map(String) : [],
  };
}
function mapProvider(row: Record<string, unknown>): Provider {
  const services = (row.provider_services as Record<string, unknown>[] ?? []).map(mapLinkedService);
  return {
    id: String(row.id),
    name: String(row.display_name),
    profession: String(row.profession_key) as Provider['profession'],
    categoryId: String(row.primary_category_id),
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids.map(String) : [],
    rating: Number(row.rating_average),
    reviewCount: Number(row.review_count),
    distance: 0,
    price: Number(row.starting_price_egp ?? 0),
    image: String(row.avatar_url ?? ''),
    coverImage: String(row.avatar_url ?? ''),
    verified: Boolean(row.is_verified),
    skillCertificateVerified: Boolean(row.skill_certificate_verified),
    professionalCertificateVerified: Boolean(row.professional_certificate_verified),
    professionalCertificateCount: Number(row.professional_certificate_count ?? 0),
    available: Boolean(row.is_available),
    bookable: Boolean(row.bookable),
    emergencyAvailable: Boolean(row.emergency_available),
    completedJobs: Number(row.completed_jobs),
    experienceYears: Number(row.experience_years),
    experienceSummary: String(row.experience_summary ?? ''),
    responseTime: String(row.response_time_label ?? ''),
    location: String(row.location_label ?? ''),
    serviceRadius: Number(row.service_radius_km),
    languages: Array.isArray(row.languages) ? row.languages.map(String) : [],
    about: String(row.about ?? ''),
    skills: Array.isArray(row.specialties) ? row.specialties.map(String) : [],
    certifications: [],
    services,
    portfolio: (Array.isArray(row.portfolio) ? row.portfolio : []).map(value => mapPortfolio(value as Record<string, unknown>)),
    reviews: [],
    cancellationPolicy: '',
    guarantee: String(row.guarantee_text ?? ''),
    supportedPaymentMethods: Array.isArray(row.supported_payment_methods)
      ? row.supported_payment_methods.filter(value => value === 'cash' || value === 'online') as ('cash' | 'online')[] : [],
  };
}

let activeCatalogRequest: Promise<MarketplaceCatalog> | null = null;

async function hydrateMedia(catalog: MarketplaceCatalog): Promise<MarketplaceCatalog> {
  const avatarRefs = catalog.providers.map(row => typeof row.avatar_ref === 'string' ? row.avatar_ref : '').filter(Boolean);
  const portfolioRefs = catalog.providers.flatMap(row => (Array.isArray(row.portfolio) ? row.portfolio : []).flatMap(item => {
    const value = item as Record<string, unknown>;
    return Array.isArray(value.image_refs) ? value.image_refs.map(String) : [];
  }));
  const client = getSupabaseClient();
  const [avatarResult, portfolioResult] = await Promise.all([
    avatarRefs.length ? client.storage.from('profile-images').createSignedUrls(avatarRefs, 900) : Promise.resolve({ data: [], error: null }),
    portfolioRefs.length ? client.storage.from('provider-portfolios').createSignedUrls(portfolioRefs, 900) : Promise.resolve({ data: [], error: null }),
  ]);
  if (avatarResult.error) throw avatarResult.error;
  if (portfolioResult.error) throw portfolioResult.error;
  const avatarUrls = new Map(avatarRefs.map((path, index) => [path, avatarResult.data?.[index]?.signedUrl ?? '']));
  const portfolioUrls = new Map(portfolioRefs.map((path, index) => [path, portfolioResult.data?.[index]?.signedUrl ?? '']));
  return {
    ...catalog,
    providers: catalog.providers.map(row => ({
      ...row,
      avatar_url: avatarUrls.get(String(row.avatar_ref ?? '')) ?? '',
      portfolio: (Array.isArray(row.portfolio) ? row.portfolio : []).map(item => {
        const value = item as Record<string, unknown>;
        return { ...value, images: Array.isArray(value.image_refs) ? value.image_refs.map(path => portfolioUrls.get(String(path)) ?? '') : [] };
      }),
    })),
  };
}

function marketplaceCatalog() {
  if (activeCatalogRequest) return activeCatalogRequest;
  activeCatalogRequest = (async () => {
    const { data, error } = await getSupabaseClient().rpc('get_marketplace_catalog_v2');
    if (error) throw error;
    const catalog = (data ?? {}) as Partial<MarketplaceCatalog>;
    return hydrateMedia({
      categories: Array.isArray(catalog.categories) ? catalog.categories : [],
      providers: Array.isArray(catalog.providers) ? catalog.providers : [],
      services: Array.isArray(catalog.services) ? catalog.services : [],
    });
  })().finally(() => { activeCatalogRequest = null; });
  return activeCatalogRequest;
}

export const supabaseDataAdapter: WarshaDataAdapter = {
  mode: 'supabase',
  async listCategories() { return (await marketplaceCatalog()).categories.map(mapCategory); },
  async listProviders() { return (await marketplaceCatalog()).providers.map(mapProvider); },
  async getProvider(id) {
    const row = (await marketplaceCatalog()).providers.find(item => String(item.id) === id);
    return row ? mapProvider(row) : undefined;
  },
  async listServices(categoryId) {
    return (await marketplaceCatalog()).services.filter(row => !categoryId || String(row.category_id) === categoryId).map(mapService);
  },
};
