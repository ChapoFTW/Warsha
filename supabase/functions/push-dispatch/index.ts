/**
 * Sends the pushes the database has queued, and records what happened.
 *
 * The split of responsibility mirrors `privacy-export`, and for the same
 * reason — the database decides, this only moves bytes:
 *
 *   - the DATABASE decides who gets a push and what it says, in
 *     `private.enqueue_push_delivery`, which runs on insert into
 *     `public.notifications` and which no client can reach;
 *   - THIS FUNCTION claims a batch, hands it to the provider, and writes each
 *     outcome back;
 *   - nothing here composes a message, chooses a recipient, or reads a
 *     notification. The title and body were rendered when the row was queued.
 *
 * There is deliberately no path by which a caller can name a recipient. The
 * only input this function accepts is a batch size.
 *
 * ---------------------------------------------------------------------------
 * Why there is no `@supabase/supabase-js` here
 *
 * Same reason `privacy-export` does without it: a machine that intercepts TLS
 * cannot fetch the JSR manifest, `supabase functions deploy` then fails to
 * BUNDLE the function at all, and the feature stays missing while the source
 * sits in the repository looking complete. This needs three HTTP calls.
 *
 * ---------------------------------------------------------------------------
 * Why `public.warsha_push_*` and not `.schema('private')`
 *
 * PostgREST cannot reach the `private` schema, and the failure is silent on
 * hosted rather than an error. The wrappers exist for exactly this and are
 * granted to `service_role` only.
 *
 * ---------------------------------------------------------------------------
 * Authorisation
 *
 * The caller must present the service role key. That is a deliberate choice
 * over `verify_jwt`: this function must never be reachable by a signed-in
 * person, because the ability to run it is the ability to drain somebody
 * else's queue. A scheduler holds the key; a client never does.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Expo Push Service. One call, and Expo fans out to APNs and FCM. */
const DEFAULT_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo's own documented ceiling for one request. */
const PROVIDER_CHUNK = 100;

/**
 * How Expo's per-message errors map onto Warsha's two questions: is the device
 * gone, and is it worth trying again.
 *
 * `DeviceNotRegistered` is the one that matters. It is how a provider tells us
 * a token belongs to an app that was uninstalled, and a system that ignores it
 * retries that token forever. It revokes the row.
 */
const PROVIDER_ERRORS: Record<string, { revoke: boolean; retryable: boolean }> = {
  DeviceNotRegistered: { revoke: true, retryable: false },
  MessageTooBig: { revoke: false, retryable: false },
  MessageRateExceeded: { revoke: false, retryable: true },
  MismatchSenderId: { revoke: false, retryable: false },
  InvalidCredentials: { revoke: false, retryable: false },
  ExpoError: { revoke: false, retryable: true },
  ProviderError: { revoke: false, retryable: true },
};

type QueuedPush = {
  id: string;
  token: string;
  platform: string;
  language: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  priority: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

/**
 * Which of the four WPS-014 priorities is allowed to interrupt somebody.
 *
 * The same two that bypass quiet hours. Everything else arrives silently and
 * waits to be noticed, which is what an "informational" notification is.
 */
function isInterrupting(priority: string): boolean {
  return priority === 'critical' || priority === 'action_required';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = env('SUPABASE_URL');
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return json({ error: 'not_configured' }, 503);

  // Constant-length comparison is not the control here — the key is a bearer
  // token compared in full, and an attacker who can guess it can call every
  // other service-role surface anyway. What matters is that nothing but the
  // service role gets past this line.
  const authorization = request.headers.get('authorization') ?? '';
  const presented = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (presented !== serviceRole) return json({ error: 'forbidden' }, 403);

  let requestedLimit: number | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === 'number' && Number.isFinite(body.limit)) {
      requestedLimit = Math.trunc(body.limit);
    }
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const rpc = (name: string, payload: unknown) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  const configurationResponse = await rpc('warsha_push_configuration', {});
  if (!configurationResponse.ok) return json({ error: 'configuration_unavailable' }, 502);
  const configuration = await configurationResponse.json();

  if (configuration?.provider !== 'expo' || configuration?.deliveryEnabled !== true) {
    return json({ status: 'disabled', provider: configuration?.provider ?? 'disabled', sent: 0 });
  }

  // A dispatcher that died mid-batch left rows claimed. Returning them first
  // costs one statement and is the difference between a transient crash and a
  // permanently stuck queue.
  await rpc('warsha_push_release_stalled', { p_older_than_minutes: 15 }).catch(() => undefined);

  const claimResponse = await rpc('warsha_push_claim_batch', {
    p_limit: requestedLimit ?? null,
  });
  if (!claimResponse.ok) return json({ error: 'claim_failed' }, 502);
  const claim = await claimResponse.json();
  const items: QueuedPush[] = Array.isArray(claim?.items) ? claim.items : [];
  if (items.length === 0) return json({ status: 'ok', claimed: 0, delivered: 0, failed: 0 });

  const endpoint = configuration?.endpoint || DEFAULT_ENDPOINT;
  // Expo's "enhanced push security" makes this mandatory; without it the API
  // accepts unauthenticated sends. Warsha sends it whenever it is configured,
  // so switching the account setting on does not require a code change.
  const expoToken = env('EXPO_ACCESS_TOKEN');

  let delivered = 0;
  let failed = 0;

  const record = (
    item: QueuedPush,
    status: 'delivered' | 'failed',
    code: string | null,
    receipt: string | null,
    retryable: boolean,
    revoke: boolean,
  ) => rpc('warsha_push_record_result', {
    p_attempt_id: item.id,
    p_status: status,
    p_provider_code: code,
    p_receipt_id: receipt,
    p_retryable: retryable,
    p_revoke_token: revoke,
  }).catch(() => undefined);

  for (let offset = 0; offset < items.length; offset += PROVIDER_CHUNK) {
    const chunk = items.slice(offset, offset + PROVIDER_CHUNK);
    const messages = chunk.map((item) => ({
      to: item.token,
      title: item.title,
      body: item.body,
      // Ids and a route type. The words above are the whole legible payload;
      // see `notification-push-adapter.ts` for why that is all there is.
      data: item.payload ?? {},
      sound: isInterrupting(item.priority) ? 'default' : null,
      priority: isInterrupting(item.priority) ? 'high' : 'normal',
      channelId: 'warsha-default',
      // A push whose moment has passed is worse than no push: it wakes
      // somebody for a decision that has already been made for them.
      ttl: isInterrupting(item.priority) ? 3600 : 86400,
    }));

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
    } catch {
      // The provider was unreachable. Every message in the chunk is retryable,
      // and none of them is the device's fault.
      for (const item of chunk) {
        failed += 1;
        await record(item, 'failed', 'provider_unreachable', null, true, false);
      }
      continue;
    }

    if (!response.ok) {
      // 429 and 5xx are the provider asking for patience. A 4xx that is not 429
      // is a request this function composed wrongly, and repeating it would
      // repeat the mistake.
      const retryable = response.status === 429 || response.status >= 500;
      for (const item of chunk) {
        failed += 1;
        await record(item, 'failed', `provider_http_${response.status}`, null, retryable, false);
      }
      continue;
    }

    const outcome = await response.json().catch(() => null);
    const tickets = Array.isArray(outcome?.data) ? outcome.data : [];

    for (const [index, item] of chunk.entries()) {
      const ticket = tickets[index];
      if (ticket?.status === 'ok') {
        delivered += 1;
        await record(item, 'delivered', null, typeof ticket.id === 'string' ? ticket.id : null, false, false);
        continue;
      }
      const code = typeof ticket?.details?.error === 'string' ? ticket.details.error : 'ExpoError';
      const rule = PROVIDER_ERRORS[code] ?? { revoke: false, retryable: true };
      failed += 1;
      await record(item, 'failed', code, null, rule.retryable, rule.revoke);
    }
  }

  // Counts only. Nothing about who, and nothing about what was said.
  return json({ status: 'ok', claimed: items.length, delivered, failed });
});
