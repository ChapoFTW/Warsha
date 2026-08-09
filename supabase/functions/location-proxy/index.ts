/**
 * WPS-024 — location-proxy.
 *
 * Places Autocomplete, Place Details, forward geocoding, reverse geocoding and
 * the map render descriptor, all behind one authenticated function so the
 * billed Maps key never reaches a device.
 *
 * This function names no vendor. It asks the database which provider fills the
 * `location` role and calls the `MapProvider` interface.
 *
 * One function rather than five because the operations share an identity
 * check, a rate limit, a provider gate and a failure contract. Splitting them
 * would mean five copies of all of that, and the copies would drift.
 *
 * The failure contract is the important part: EVERY failure mode returns 200
 * with `available: false` and a reason. The client must never treat a location
 * failure as a blocker, because manual pin placement is always available and a
 * customer who cannot search an address can still point at their building.
 * A 500 here would produce an error screen for something that is not an error.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { readSecret } from '../_shared/provider-secrets.ts';
import { resolveMapProvider } from '../_shared/map-providers.ts';
import type { MapProvider, MapsOutcome } from '../_shared/map-provider.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** The capability, not the vendor. */
const LOCATION_ROLE = 'location';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** Every unavailable path says the same thing, so the client has one branch. */
function unavailable(reason: string) {
  return json({
    available: false,
    reason,
    manualPinAlwaysAvailable: true,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = readSecret('supabaseUrl');
  const serviceRole = readSecret('supabaseServiceRole');
  if (!url || !serviceRole) return unavailable('unavailable');

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'Authentication required' }, 401);
  }

  const asCaller = createClient(url, serviceRole, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const asService = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData?.user?.id) return json({ error: 'Authentication required' }, 401);

  const { data: runtime } = await asService
    .rpc('edge_provider_runtime', { p_role: LOCATION_ROLE })
    .then((r) => ({ data: r.data as { providerKey?: string; enabled?: boolean } | null }))
    .catch(() => ({ data: null }));

  const provider = resolveMapProvider(runtime?.providerKey);
  if (!provider) return unavailable('provider_unavailable');

  let body: {
    operation?: string;
    input?: string;
    placeId?: string;
    sessionToken?: string;
    latitude?: number;
    longitude?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  // The render descriptor is answered BEFORE the enabled gate, on purpose.
  //
  // Drawing a map uses the publishable render key the native SDK reads from
  // the app manifest; searching uses the billed server key behind this proxy.
  // They fail independently, so a disabled or unconfigured search provider must
  // still let the client draw the map somebody is about to drop a pin on.
  if (body.operation === 'render_descriptor') {
    return json({
      available: true,
      descriptor: {
        ...provider.renderMap(),
        // Safe capability metadata, never the credential value. The database
        // cannot inspect Edge Function secrets, so both answers are needed:
        // DB gates say whether calls are allowed; this says whether they can
        // actually be authenticated at the provider.
        serverCredentialAvailable: provider.isConfigured(),
      },
    });
  }

  if (runtime?.enabled !== true) {
    await recordHealth(asService, provider, String(body.operation ?? 'unknown'),
      { kind: 'refused_disabled' });
    return unavailable('provider_disabled');
  }

  // A Places session token groups autocomplete keystrokes with the details
  // call that follows, so Google bills the sequence once instead of per
  // keystroke. Required, not optional: without it the cost of a search scales
  // with how fast somebody types.
  const sessionToken = typeof body.sessionToken === 'string' && body.sessionToken.length >= 8
    ? body.sessionToken
    : null;

  switch (body.operation) {
    case 'autocomplete': {
      const input = typeof body.input === 'string' ? body.input.trim() : '';
      if (input.length < 3) return json({ available: true, suggestions: [] });
      if (!sessionToken) return json({ error: 'A session token is required' }, 400);
      const result = await provider.autocomplete(input, sessionToken);
      await recordHealth(asService, provider, 'autocomplete', result);
      if (result.kind === 'ok') return json({ available: true, suggestions: result.value });
      if (result.kind === 'no_results') return json({ available: true, suggestions: [] });
      return unavailable(result.kind);
    }

    case 'place_details': {
      const placeId = typeof body.placeId === 'string' ? body.placeId : '';
      if (placeId.length === 0) return json({ error: 'A place is required' }, 400);
      if (!sessionToken) return json({ error: 'A session token is required' }, 400);
      const result = await provider.placeDetails(placeId, sessionToken);
      await recordHealth(asService, provider, 'place_details', result);
      if (result.kind === 'ok') return json({ available: true, place: result.value });
      if (result.kind === 'no_results') return json({ available: true, place: null });
      return unavailable(result.kind);
    }

    case 'reverse_geocode': {
      const { latitude, longitude } = body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number'
          || !Number.isFinite(latitude) || !Number.isFinite(longitude)
          || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return json({ error: 'A valid coordinate is required' }, 400);
      }
      const result = await provider.reverseGeocode(latitude, longitude);
      await recordHealth(asService, provider, 'reverse_geocode', result);
      if (result.kind === 'ok') return json({ available: true, place: result.value });
      if (result.kind === 'no_results') {
        // No address for a pin is not a failure. Plenty of Egyptian buildings
        // have no geocodable address, and the pin is what the worker navigates
        // to anyway.
        return json({ available: true, place: null });
      }
      return unavailable(result.kind);
    }

    case 'forward_geocode': {
      const input = typeof body.input === 'string' ? body.input.trim() : '';
      if (input.length < 3) return json({ error: 'An address is required' }, 400);
      const result = await provider.forwardGeocode(input);
      await recordHealth(asService, provider, 'forward_geocode', result);
      if (result.kind === 'ok') return json({ available: true, place: result.value });
      if (result.kind === 'no_results') return json({ available: true, place: null });
      return unavailable(result.kind);
    }

    default:
      return json({ error: 'Unknown operation' }, 400);
  }
});

/**
 * Record one call against provider health.
 *
 * `ok` is normalised to `succeeded` and `no_results` stays itself: a search
 * that legitimately found nothing is the provider working, and counting it as
 * a failure would show a degraded map service every time somebody typed a
 * street that does not exist.
 *
 * Never throws. Health recording must not be the thing that fails a customer's
 * address search.
 */
async function recordHealth(
  client: ReturnType<typeof createClient>,
  provider: MapProvider,
  operation: string,
  outcome: MapsOutcome<unknown> | { kind: 'refused_disabled' },
): Promise<void> {
  const kind = outcome.kind === 'ok' ? 'succeeded' : outcome.kind;
  const timing = 'latencyMs' in outcome
    ? { latencyMs: outcome.latencyMs, attempts: outcome.attempts }
    : { latencyMs: null, attempts: 0 };
  try {
    await client.rpc('edge_record_provider_health', {
      p_provider_key: provider.providerKey,
      p_operation: operation,
      p_provider_version: provider.providerVersion,
      p_outcome: kind === 'refused_no_credential' ? 'refused_no_credential' : kind,
      p_latency_ms: timing.latencyMs,
      p_attempts: timing.attempts,
      p_timed_out: outcome.kind === 'timed_out',
    });
  } catch {
    // Deliberately swallowed.
  }
}
