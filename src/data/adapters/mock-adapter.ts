import { categories, getProvider, providers } from '@/src/data/mock-data';
import type { WarshaDataAdapter } from './types';

export const mockDataAdapter: WarshaDataAdapter = {
  mode: 'mock',
  async listCategories() { return categories; },
  async listProviders() { return providers.filter((provider) => provider.verified); },
  async getProvider(id) { const provider = getProvider(id); return provider?.verified ? provider : undefined; },
  async listServices(categoryId) {
    const visible = providers.filter((provider) => provider.verified);
    const selected = categoryId ? visible.filter((provider) => provider.categoryId === categoryId) : visible;
    return [...new Map(selected.flatMap((provider) => provider.services).map((service) => [service.id, service])).values()];
  },
};
