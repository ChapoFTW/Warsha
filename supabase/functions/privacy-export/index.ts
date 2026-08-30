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
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  if (!url || !serviceRole || !publishable) {
    return json({ error: 'not_configured' }, 503);
  }

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

  // Who is asking. The caller's own token, never the service role.
  const caller = createClient(url, publishable, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const subject = userData?.user?.id;
  if (userError || !subject) return json({ error: 'authentication_required' }, 401);

  const service = createClient(url, serviceRole, { auth: { persistSession: false } });

  // Ownership is established through the caller's own session before the
  // service role is used for anything. `get_my_data_exports` is theirs and
  // returns only their rows, so a request id that does not appear in it does
  // not belong to them -- and is reported exactly like one that does not exist.
  const { data: mine, error: mineError } = await caller.rpc('get_my_data_exports', { p_limit: 50 });
  if (mineError) return json({ error: 'lookup_failed' }, 502);
  const own = Array.isArray(mine) ? mine.find((row: { id?: string }) => row?.id === requestId) : null;
  if (!own) return json({ error: 'not_found' }, 404);

  if (own.status === 'ready') {
    return json({ status: 'ready', id: requestId, alreadyProduced: true });
  }
  if (own.status === 'expired') return json({ error: 'expired' }, 410);
  if (own.status !== 'manifest_ready') {
    return json({ error: 'not_producible', status: own.status }, 409);
  }

  const { data: payload, error: payloadError } = await service.rpc(
    'warsha_privacy_export_payload', { p_request_id: requestId },
  );
  if (payloadError || !payload) {
    await service.rpc('warsha_privacy_export_mark_failed', {
      p_request_id: requestId, p_reason: 'payload_unavailable',
    });
    return json({ error: 'payload_failed' }, 502);
  }

  // The path must be the subject's own folder: that is what the bucket's
  // owner-read policy checks, and `warsha_privacy_export_mark_ready` refuses
  // any other shape. It is also why the file name is the request id rather than
  // anything guessable about the person.
  const path = `${subject}/${requestId}.json`;
  const file = new TextEncoder().encode(JSON.stringify(payload, null, 2));

  // A retry must not fail because the previous attempt already wrote the file.
  const { error: uploadError } = await service.storage.from(BUCKET).upload(path, file, {
    // The bucket allow-lists 'application/json' exactly; a charset parameter
    // makes it a different string and storage answers 415. JSON is UTF-8 by
    // specification, so nothing is lost by saying so without the parameter.
    contentType: 'application/json',
    upsert: true,
  });
  if (uploadError) {
    await service.rpc('warsha_privacy_export_mark_failed', {
      p_request_id: requestId, p_reason: 'upload_failed',
    });
    return json({ error: 'upload_failed' }, 502);
  }

  const { data: marked, error: markError } = await service.rpc(
    'warsha_privacy_export_mark_ready',
    { p_request_id: requestId, p_storage_path: path, p_byte_size: file.byteLength },
  );
  if (markError) return json({ error: 'finalise_failed' }, 502);

  return json({
    status: 'ready',
    id: requestId,
    bytes: file.byteLength,
    alreadyProduced: marked?.changed === false,
  });
});
