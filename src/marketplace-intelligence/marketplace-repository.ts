import { environment } from '@/src/config/environment';
import { mockMarketplaceRepository } from './mock-marketplace-repository';
import { supabaseMarketplaceRepository } from './supabase-marketplace-repository';
export const marketplaceRepository=environment.dataMode==='supabase'?supabaseMarketplaceRepository:mockMarketplaceRepository;

