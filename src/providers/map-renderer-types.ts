/**
 * WPS-024 map renderer contract — the device half.
 *
 * A map is drawn by a native SDK on a phone. No server can draw one, so the
 * server-side `MapProvider.renderMap()` returns a DESCRIPTOR naming a renderer,
 * and this is what a renderer must be in order to be named.
 *
 * Types only, and no imports, so the registry and the renderers can both depend
 * on it without depending on each other.
 */

export type PinPosition = { latitude: number; longitude: number };

export type MapRendererCopy = {
  /** Shown when no map can be drawn. Must never read as "you cannot continue". */
  unavailable: string;
  dragHint: string;
  /** Shown while the map is coming up, so the space is never a blank rectangle. */
  loading: string;
};

export type MapRendererProps = {
  value: PinPosition | null;
  onChange: (position: PinPosition) => void;
  copy: MapRendererCopy;
  /**
   * The renderer could not draw a map, and has stopped waiting for one.
   *
   * Not the same question as "does this deployment have a map provider" — the
   * server answers that before anything mounts. This is the renderer reporting
   * that the provider it was given never painted: an unauthorised key, tiles
   * that never arrive, a device without the services the SDK needs. Announced
   * exactly once per mount.
   *
   * A surface that offers "choose on map" as one of several ways to do
   * something needs to know, or it goes on offering a route that leads nowhere
   * while the other routes are working.
   */
  onUnavailable?: () => void;
};

/**
 * What the server says about drawing a map for the active provider.
 *
 * Mirrors `MapRenderDescriptor` in `supabase/functions/_shared/map-provider.ts`.
 * The two are separate declarations because they are separate runtimes; the
 * regression suite asserts the renderer keys agree.
 */
export type MapRenderDescriptor = {
  providerKey: string;
  rendererKey: string;
  requiresPublishableRenderKey: boolean;
  /** Presence only. The server credential value never crosses this boundary. */
  serverCredentialAvailable: boolean;
  attribution: string;
  defaultViewport: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};
