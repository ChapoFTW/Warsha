/**
 * warsha-automation — the machine door into Development governance.
 *
 * Warsha's governed actions all begin at `private.require_staff_capability`,
 * which reads `auth.uid()`. That is right, and it is why engineering automation
 * could take a Development change all the way to the last step and then stop,
 * because the last step was a person clicking a button. This function is the
 * other door: a non-human principal, holding its own capabilities, restricted
 * to Development by the shape of the data rather than by a promise.
 *
 * Why `verify_jwt = false`, and why that is not a hole:
 *
 *   The caller is a machine. It has no Supabase user, so it has no user JWT to
 *   verify, and inventing one would mean minting a token for a person who is
 *   not making the request. Instead the function authenticates the caller
 *   itself against a bearer token that exists in exactly one place — this
 *   function's own Edge secrets — and is compared in constant time. `worker-auth`
 *   already sets this precedent in Warsha for a function that must run before a
 *   session exists.
 *
 * Four independent things have to be true before anything happens:
 *
 *   1. The presented bearer token equals the configured automation token.
 *   2. The platform environment is `development`. Checked here so the refusal
 *      is cheap and legible, and checked again inside every RPC so this check
 *      being wrong changes nothing.
 *   3. The named principal exists, is active, is scoped to development, and
 *      holds the capability the action needs. That is the database's answer,
 *      not this function's.
 *   4. Every prerequisite the human path enforces still passes, because both
 *      paths run the same core.
 *
 * What never crosses this boundary: the token is never returned, never logged,
 * never echoed in an error, and never included in a response body. A wrong
 * token gets the same sentence as a missing one.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const PRINCIPAL_KEY = 'development_engineering';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/**
 * Constant-time comparison.
 *
 * A `===` on a secret leaks its prefix through timing, which over enough
 * requests is a way to guess it one character at a time. The lengths are
 * compared first and the result folded in rather than returned early, so a
 * wrong length is not distinguishable from a wrong byte either.
 */
function tokensMatch(presented: string, configured: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(configured);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * The actions this door opens, and the RPC each one is.
 *
 * An allow-list rather than a pass-through: a caller names an action from this
 * table, never a function. Nothing here can be pointed at an RPC that was not
 * written for it, and adding one is a code change somebody reviews.
 */
const ACTIONS: Record<string, { rpc: string; params: readonly string[] }> = {
  state: {
    rpc: 'warsha_automation_governance_state',
    params: [],
  },
  activate_provider: {
    rpc: 'warsha_automation_activate_external_provider',
    params: ['p_provider_key', 'p_expected_environment', 'p_reason'],
  },
  deactivate_provider: {
    rpc: 'warsha_automation_deactivate_external_provider',
    params: ['p_provider_key', 'p_reason'],
  },
  set_feature_flag: {
    rpc: 'warsha_automation_set_feature_flag',
    params: ['p_flag_key', 'p_environment', 'p_enabled', 'p_audience',
      'p_rollout_percentage', 'p_reason'],
  },
  set_kill_switch: {
    rpc: 'warsha_automation_set_kill_switch',
    params: ['p_switch_key', 'p_active', 'p_reason'],
  },
  record_processing_basis_review: {
    rpc: 'warsha_automation_record_processing_basis_review',
    params: ['p_activity_key', 'p_status', 'p_basis', 'p_note'],
  },
  record_subprocessor_agreement: {
    rpc: 'warsha_automation_record_subprocessor_agreement',
    params: ['p_subprocessor_key', 'p_status', 'p_reference', 'p_reason'],
  },
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const configured = Deno.env.get('WARSHA_DEVELOPMENT_AUTOMATION_TOKEN') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Which of the three is absent is operational information, not secret
  // information — the same line `provider-secrets.ts` already draws: existence
  // is not sensitive, the value is. Without this an operator debugging a 503
  // cannot tell a missing token from a missing service role, and the only way
  // to find out is to start printing secrets.
  if (!url || !serviceRole || configured.length < 32) {
    return json({
      error: 'Automation is not available',
      configured: {
        supabaseUrl: Boolean(url),
        serviceRole: Boolean(serviceRole),
        automationToken: configured.length >= 32,
      },
    }, 503);
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  if (!presented || !tokensMatch(presented, configured)) {
    // Deliberately the same sentence, the same status and the same shape for a
    // missing token, a malformed header and a wrong token. Anything else tells
    // a prober which of the three they got right.
    return json({ error: 'Automation authorisation failed' }, 401);
  }

  const asService = createClient(url, serviceRole, { auth: { persistSession: false } });

  // The environment gate, before the action is even read. The RPCs check it
  // again; this exists so a misdirected call is refused before it can touch
  // anything, and so the refusal names the real reason.
  const { data: environment, error: environmentError } = await asService
    .rpc('warsha_automation_platform_environment');
  if (environmentError) {
    // The database refusal is a governance sentence, not a secret, and hiding
    // it here is how a misconfiguration becomes an afternoon of guessing.
    return json({
      error: 'Automation could not read the platform environment',
      detail: environmentError.message,
    }, 503);
  }
  if (environment !== 'development') {
    return json({
      error: 'Automation governance is available in development only',
      environment,
    }, 403);
  }

  let body: { action?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const definition = ACTIONS[action];
  if (!definition) return json({ error: 'Unknown automation action' }, 400);

  const supplied = (body.params ?? {}) as Record<string, unknown>;
  const params: Record<string, unknown> = { p_principal_key: PRINCIPAL_KEY };
  for (const name of definition.params) {
    params[name] = supplied[name] ?? null;
  }

  const { data, error } = await asService.rpc(definition.rpc, params);
  if (error) {
    // The database's own refusal sentence is the useful one and contains no
    // secret: these are governance messages written to be read by an operator.
    return json({ error: error.message, action }, 400);
  }
  return json({ action, result: data }, 200);
});
