/**
 * WPS-024 map composition root.
 *
 * The ONE module that names every map implementation. `location-proxy` imports
 * this and `map-provider.ts`, never a vendor file.
 *
 * Adding a provider is: write the implementation, add a line here, add a
 * registry row with `capability_role = 'location'`. The proxy resolves by the
 * key the database holds, so no request path changes and no component learns a
 * new vendor's name — `renderMap()` tells the client which renderer to use.
 */

import { googleMapsProvider } from './google-maps-provider.ts';
import { registerMapProvider } from './map-provider.ts';

registerMapProvider(googleMapsProvider);

export {
  registeredMapProviderKeys,
  resolveMapProvider,
} from './map-provider.ts';
