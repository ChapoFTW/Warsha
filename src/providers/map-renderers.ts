import type { ComponentType } from 'react';

import { GoogleMapRenderer } from '@/components/warsha/GoogleMapRenderer';
import type { MapRendererProps } from '@/src/providers/map-renderer-types';

/**
 * WPS-024 map renderer registry — the device half of the map abstraction.
 *
 * The server names a renderer; this resolves the name to a component. The keys
 * come from `MapProvider.renderMap()`, so the set of maps Warsha can draw is
 * enumerated here and the set it can search is enumerated in
 * `supabase/functions/_shared/map-providers.ts`, and neither list is scattered
 * through components.
 *
 * Adding a map provider is: write a renderer, register it here, add the server
 * implementation, update the registry row. `AddressMap` does not change.
 */

export type MapRenderer = ComponentType<MapRendererProps>;

const renderers = new Map<string, MapRenderer>();

export function registerMapRenderer(key: string, renderer: MapRenderer): void {
  renderers.set(key, renderer);
}

/**
 * Resolve a renderer, tolerating a missing or unknown key.
 *
 * When exactly one renderer is registered it is used regardless of the key.
 * That is not laziness — the alternative is that a slow or failed capability
 * lookup leaves a customer staring at "maps unavailable" while the only map
 * Warsha ships sits unused in the bundle. With two or more registered the
 * ambiguity is real and the answer is null, because guessing which vendor to
 * draw would be worse than drawing nothing.
 */
export function resolveMapRenderer(key: string | null | undefined): MapRenderer | null {
  if (key) {
    const exact = renderers.get(key);
    if (exact) return exact;
  }
  if (renderers.size === 1) return [...renderers.values()][0];
  return null;
}

export function registeredMapRendererKeys(): string[] {
  return [...renderers.keys()].sort();
}

// The one renderer Warsha ships. Its key matches `renderMap().rendererKey` in
// `google-maps-provider.ts`, and the regression suite asserts the two agree
// across the runtime boundary they sit either side of.
registerMapRenderer('google_native_sdk', GoogleMapRenderer);
