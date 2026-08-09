import type { DataMode } from '@/src/config/environment';
import type { LocationCapabilityLive } from '@/src/providers/provider-clients';
import type { MapRenderDescriptor } from '@/src/providers/map-renderer-types';

export type LocationExperienceAvailability = {
  deviceLocationAvailable: boolean;
  addressSearchAvailable: boolean;
  interactiveMapAvailable: boolean;
  providerUnavailable: boolean;
  rendererKey: string | null;
};

/**
 * Combine capabilities that deliberately fail independently.
 *
 * Device location is provided by Expo and needs no Maps server credential.
 * Native rendering is available when the provider can name a renderer, even
 * while Places search is disabled. Search stays behind the database provider
 * registry, flag, kill switch and server credential.
 */
export function resolveLocationExperienceAvailability({
  dataMode,
  capability,
  descriptor,
}: {
  dataMode: DataMode;
  capability: LocationCapabilityLive;
  descriptor: MapRenderDescriptor | null;
}): LocationExperienceAvailability {
  const live = dataMode === 'supabase';
  const rendererKey = descriptor?.rendererKey ?? capability.mapRendererKey;
  const interactiveMapAvailable = live && Boolean(
    descriptor || capability.mapsAvailable && rendererKey,
  );
  const addressSearchAvailable = live
    && capability.searchAvailable
    && descriptor?.serverCredentialAvailable === true;

  return {
    deviceLocationAvailable: live,
    addressSearchAvailable,
    interactiveMapAvailable,
    providerUnavailable: !interactiveMapAvailable && !addressSearchAvailable,
    rendererKey: rendererKey ?? null,
  };
}
