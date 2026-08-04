import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import {
  type PlatformStatus,
  unknownPlatformStatus,
} from './launch-types';

// Re-exported so callers reach it from the repository they already import.
// The implementation lives in the pure module so it stays testable.
export { surfaceIsRestricted } from './launch-types';

/**
 * WPS-018 platform status.
 *
 * Every client reads this so it can fail closed: if the platform is in
 * read-only maintenance, or a kill switch has restricted a surface, the app
 * must stop offering the action rather than letting the server refuse it later.
 *
 * The status carries no reason, no actor, and no configuration value.
 */
export const platformStatusRepository = {
  async get(): Promise<PlatformStatus> {
    if (environment.dataMode === 'mock') {
      return {
        environment: 'local',
        launchPhase: 'pre_beta',
        activeSwitches: [],
        readOnlyMaintenance: false,
        generatedAt: new Date().toISOString(),
      };
    }
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.rpc('get_platform_operational_status');
      if (error) throw error;
      return data as PlatformStatus;
    } catch {
      // Unreadable status is treated as maintenance. A client that guesses
      // "probably fine" is the one that takes a payment during an outage.
      return unknownPlatformStatus;
    }
  },
};
