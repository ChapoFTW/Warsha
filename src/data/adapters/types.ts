import type { Category, Provider, Service } from '@/src/data/mock-data';
export interface WarshaDataAdapter {
  readonly mode: 'mock' | 'supabase';
  listCategories(): Promise<Category[]>;
  listProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  listServices(categoryId?: string): Promise<Service[]>;
}
