import { environment } from '@/src/config/environment';
import { mockDataAdapter } from './adapters/mock-adapter';
import { supabaseDataAdapter } from './adapters/supabase-adapter';
export const dataAdapter = environment.dataMode === 'supabase' ? supabaseDataAdapter : mockDataAdapter;
export { mockDataAdapter, supabaseDataAdapter };
export type { WarshaDataAdapter } from './adapters/types';
