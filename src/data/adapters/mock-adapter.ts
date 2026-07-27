import { categories, getProvider, providers } from '@/src/data/mock-data';
import type { WarshaDataAdapter } from './types';

export const mockDataAdapter: WarshaDataAdapter = {
  mode: 'mock',
  async listCategories() { return categories; },
  async listProviders() { return providers; },
  async getProvider(id) { return getProvider(id); },
  async listServices(categoryId) {
    const selected = categoryId ? providers.filter((provider) => provider.categoryId === categoryId) : providers;
    return [...new Map(selected.flatMap((provider) => provider.services).map((service) => [service.id, service])).values()];
  },
};
