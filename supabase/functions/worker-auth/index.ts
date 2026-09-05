/**
 * Public worker credential broker.
 *
 * The device knows a worker's phone and password. Only this function can map
 * that phone to the opaque email/password identity required by Supabase Auth.
 * It returns session tokens only and never returns or logs the synthetic email.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { workerPasswordMeetsPolicy } from '../_shared/worker-auth-password.ts';
import {
  isWorkerPhone,
  normalizeWorkerPhone,
  workerSyntheticEmail,
} from '../_shared/worker-auth-identity.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

type RegisterBody = {
  action: 'register';
  fullName?: unknown;
  phone?: unknown;
  password?: unknown;
  language?: unknown;
  legalAcceptances?: unknown;
};

type SignInBody = {
  action: 'sign_in';
  phone?: unknown;
  password?: unknown;
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

function sessionResponse(session: { access_token: string; refresh_token: string }) {
  return json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

function databaseRateLimited(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '53400' || /too many attempts/i.test(error?.message ?? '');
}

function legalAcceptanceManifest(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const valid = value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    return typeof entry.documentKey === 'string'
      && /^[a-z_]{3,64}$/.test(entry.documentKey)
      && typeof entry.version === 'string'
      && /^\d+\.\d+$/.test(entry.version)
      && (entry.language === 'en' || entry.language === 'ar')
      && typeof entry.renderedHash === 'string'
      && /^[0-9a-f]{64}$/.test(entry.renderedHash);
  });
  return valid ? value : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);

  const url = env('SUPABASE_URL');
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !serviceRole || !publicKey) return json({ code: 'unavailable' }, 503);

  let body: RegisterBody | SignInBody;
  try {
    body = await request.json();
  } catch {
    return json({ code: 'invalid_request' }, 400);
  }

  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  const phone = normalizeWorkerPhone(rawPhone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isWorkerPhone(phone)) return json({ code: 'invalid_phone' }, 400);
  // A loose bound for BOTH actions. Sign-in must keep accepting whatever an
  // existing worker already set, or tightening the policy would lock out the
  // accounts it was meant to protect.
  if (password.length < 6 || password.length > 128) return json({ code: 'invalid_credentials' }, 400);

  const service = createClient(url, serviceRole, { auth: { persistSession: false } });
  const credentialAuth = createClient(url, publicKey, { auth: { persistSession: false } });

  if (body.action === 'register') {
    /*
     * Warsha's real password policy, applied where a password is CHOSEN.
     *
     * This path creates the account with `admin.createUser`, which bypasses
     * GoTrue's `password_min_length` entirely — so before this check, neither
     * the platform setting nor the app's checklist enforced anything here.
     * Measured on Development: the app refuses `abc123` and registration
     * accepted it, creating a real account with a session.
     *
     * Answered as `invalid_request` rather than a rule-by-rule explanation. The
     * client already shows the checklist live and cannot submit a password that
     * fails it, so a caller reaching this branch is not a person reading a form.
     */
    if (!workerPasswordMeetsPolicy(password)) {
      return json({ code: 'weak_password' }, 400);
    }
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const language = body.language === 'ar' || body.language === 'fr' ? body.language : 'en';
    const legalAcceptances = legalAcceptanceManifest(body.legalAcceptances);
    if (fullName.length < 2 || fullName.length > 120) {
      return json({ code: 'invalid_request' }, 400);
    }
    // Distinct from a malformed name so a client that predates mandatory
    // signup acceptance is told to update rather than shown an unexplained
    // failure. The requirement itself is not relaxed.
    if (!legalAcceptances) return json({ code: 'legal_acceptance_required' }, 400);

    // Named before the account is created, because GoTrue collapses the
    // writer's refusal into a generic database error. The writer still
    // validates inside the transaction; this only decides which message a
    // person sees.
    const { data: manifestCurrent, error: manifestError } = await service.rpc(
      'signup_legal_manifest_current',
      { p_account_role: 'worker', p_manifest: legalAcceptances },
    );
    if (manifestError) return json({ code: 'unavailable' }, 503);
    if (manifestCurrent !== true) return json({ code: 'legal_acceptance_stale' }, 409);

    const credentialId = crypto.randomUUID();
    const { data: available, error: availabilityError } = await service.rpc(
      'prepare_worker_auth_registration',
      { p_phone: phone, p_credential_id: credentialId },
    );
    if (databaseRateLimited(availabilityError)) return json({ code: 'rate_limited' }, 429);
    if (availabilityError) return json({ code: 'unavailable' }, 503);
    if (available !== true) return json({ code: 'phone_in_use' }, 409);

    const syntheticEmail = workerSyntheticEmail(credentialId);
    const { error: createError } = await service.auth.admin.createUser({
      email: syntheticEmail,
      password,
      // This only enables the internal password provider. Admin createUser
      // sends no confirmation email, and application contact-email checks
      // explicitly exclude this trusted identity.
      email_confirm: true,
      user_metadata: {
        display_name: fullName,
        preferred_language: language,
        account_role: 'provider',
        contact_phone: phone,
        worker_identity_id: credentialId,
        legal_acceptances: legalAcceptances,
      },
      app_metadata: {
        worker_synthetic_identity: true,
        worker_identity_id: credentialId,
      },
    });
    if (createError) {
      await service.rpc('cancel_worker_auth_registration', {
        p_credential_id: credentialId,
      });
      // A concurrent registration loses on the existing profiles.phone UNIQUE
      // authority inside the auth trigger. No second auth user or profile can
      // commit in that transaction.
      const { data: conflict } = await service.from('profiles')
        .select('id').eq('phone', phone).maybeSingle();
      if (conflict) return json({ code: 'phone_in_use' }, 409);
      return json({ code: 'signup_failed' }, 503);
    }

    const { data, error } = await credentialAuth.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });
    if (error || !data.session) return json({ code: 'unavailable' }, 503);
    return sessionResponse(data.session);
  }

  if (body.action === 'sign_in') {
    const { data: resolvedEmail, error: resolveError } = await service.rpc(
      'resolve_worker_auth_identity',
      { p_phone: phone },
    );
    if (databaseRateLimited(resolveError)) return json({ code: 'rate_limited' }, 429);
    if (resolveError) return json({ code: 'unavailable' }, 503);

    // Unknown phones still make a GoTrue password attempt, keeping the public
    // response shape and main work factor the same as a wrong password.
    const email = typeof resolvedEmail === 'string'
      ? resolvedEmail
      : 'worker.00000000000040008000000000000000@auth.warsha.invalid';
    const { data, error } = await credentialAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session) return json({ code: 'invalid_credentials' }, 400);
    return sessionResponse(data.session);
  }

  return json({ code: 'invalid_request' }, 400);
});
