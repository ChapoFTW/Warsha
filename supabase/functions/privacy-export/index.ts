/**
 * Produces the data export a person asked for.
 *
 * `request_my_data_export` writes a manifest and a row with status
 * `manifest_ready`. Until this function existed nothing turned that into a
 * file, so the interface said "we will tell you when it is ready" and nobody
 * was ever told.
 *
 * The split of responsibility is deliberate:
 *
 *   - the CALLER proves who they are, with their own access token
 *   - the DATABASE decides what may be in the file, in
 *     `private.privacy_build_export_payload`, which no client role may execute
 *   - this function only moves bytes: it asks for the payload, writes it to the
 *     subject's own folder in a private bucket, and records the result
 *
 * Nothing sensitive is assembled here, nothing is logged, and the response
 * never contains the export itself -- only whether it is ready. The file is
 * read afterwards through `claim_my_data_export` plus the bucket's owner-read
 * policy, so the download is authorised by storage, not by this function.
 *
 * ---------------------------------------------------------------------------
 * Why there is no `@supabase/supabase-js` here
 *
 * Every other function in this directory imports the client from JSR. That is
 * fine where the toolchain can reach `jsr.io`, and it is fatal where it cannot:
 * a machine that intercepts TLS fails to fetch the package manifest, and then
 * `supabase functions deploy` cannot BUNDLE the function at all. It is not a
 * runtime problem that shows up in logs; the deployment simply never happens,
 * and the feature stays missing while the source sits in the repository looking
 * complete.
 *
 * This function needs four HTTP calls and a JSON body. The SDK is a
 * convenience, and the convenience was costing the whole feature, so it makes
 * the calls itself. There is nothing here the SDK would do differently.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const BUCKET = 'privacy-exports';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = env('SUPABASE_URL');
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  const publishable = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !serviceRole || !publishable) return json({ error: 'not_configured' }, 503);

  const authorization = request.headers.get('authorization') ?? '';
  const accessToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!accessToken) return json({ error: 'authentication_required' }, 401);

  let requestId = '';
  try {
    const body = await request.json();
    requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: 'invalid_request_id' }, 400);

  /** An RPC as the caller: their token, their row-level security. */
  const asCaller = (name: string, payload: unknown) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: publishable,
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  /** An RPC as the service role, for the two functions no client may execute. */
  const asService = (name: string, payload: unknown) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  const markFailed = (reason: string) =>
    asService('warsha_privacy_export_mark_failed', {
      p_request_id: requestId, p_reason: reason,
    }).catch(() => undefined);

  // Who is asking. The token is checked by the auth service rather than parsed
  // here: a signature this function does not verify is not an identity.
  const whoami = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishable, Authorization: `Bearer ${accessToken}` },
  });
  if (!whoami.ok) return json({ error: 'authentication_required' }, 401);
  const subject = (await whoami.json())?.id;
  if (typeof subject !== 'string' || !subject) {
    return json({ error: 'authentication_required' }, 401);
  }

  // Ownership is established through the caller's own session before the
  // service role is used for anything. `get_my_data_exports` returns only their
  // rows, so a request id that does not appear in it does not belong to them --
  // and is reported exactly like one that does not exist.
  const mineResponse = await asCaller('get_my_data_exports', { p_limit: 50 });
  if (!mineResponse.ok) return json({ error: 'lookup_failed' }, 502);
  const mine = await mineResponse.json();
  const own = Array.isArray(mine)
    ? mine.find((row: { id?: string }) => row?.id === requestId)
    : null;
  if (!own) return json({ error: 'not_found' }, 404);

  if (own.status === 'ready') {
    return json({ status: 'ready', id: requestId, alreadyProduced: true });
  }
  if (own.status === 'expired') return json({ error: 'expired' }, 410);
  if (own.status !== 'manifest_ready') {
    return json({ error: 'not_producible', status: own.status }, 409);
  }

  const payloadResponse = await asService('warsha_privacy_export_payload', {
    p_request_id: requestId,
  });
  if (!payloadResponse.ok) {
    await markFailed('payload_unavailable');
    return json({ error: 'payload_failed' }, 502);
  }
  const payload = await payloadResponse.json();

  // The path must be the subject's own folder: that is what the bucket's
  // owner-read policy checks, and `warsha_privacy_export_mark_ready` refuses any
  // other shape. The file is named for the request rather than for the person.
  const path = `${subject}/${requestId}.json`;
  const file = new TextEncoder().encode(JSON.stringify(payload, null, 2));

  // `x-upsert` so a retry after a successful upload but a failed finalise does
  // not fail on the object already being there. The bucket allow-lists
  // `application/json` exactly -- a charset parameter makes it a different
  // string and storage answers 415. JSON is UTF-8 by specification.
  const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'content-type': 'application/json',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!upload.ok) {
    await markFailed('upload_failed');
    return json({ error: 'upload_failed' }, 502);
  }

  const marked = await asService('warsha_privacy_export_mark_ready', {
    p_request_id: requestId,
    p_storage_path: path,
    p_byte_size: file.byteLength,
  });
  if (!marked.ok) return json({ error: 'finalise_failed' }, 502);
  const result = await marked.json();

  return json({
    status: 'ready',
    id: requestId,
    bytes: file.byteLength,
    alreadyProduced: result?.changed === false,
  });
});
